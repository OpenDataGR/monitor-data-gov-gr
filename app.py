import os
import re
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")
import time
import threading
import requests
from datetime import datetime, timedelta, timezone
from flask import Flask, render_template, jsonify, request as freq
from werkzeug.middleware.proxy_fix import ProxyFix
from models import db, HealthCheck, PortalSnapshot
import config

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///dashboard.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

db.init_app(app)

with app.app_context():
    db.create_all()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _api_headers():
    h = {"User-Agent": "DataGovGR-Dashboard/1.0"}
    if config.TOKEN:
        h["Authorization"] = f"Token {config.TOKEN}"
    return h


def _check_endpoint(ep: dict) -> dict:
    start = time.time()
    try:
        r = requests.get(ep["url"], timeout=config.REQUEST_TIMEOUT,
                         headers={"User-Agent": "DataGovGR-Dashboard/1.0"},
                         allow_redirects=True)
        ms = (time.time() - start) * 1000
        return {
            "endpoint_name":    ep["name"],
            "endpoint_url":     ep["url"],
            "response_time_ms": round(ms, 2),
            "status_code":      r.status_code,
            "is_up":            r.status_code < 400,
            "error_message":    None,
        }
    except requests.exceptions.Timeout:
        ms = (time.time() - start) * 1000
        return {
            "endpoint_name":    ep["name"],
            "endpoint_url":     ep["url"],
            "response_time_ms": round(ms, 2),
            "status_code":      None,
            "is_up":            False,
            "error_message":    "Timeout",
        }
    except Exception as exc:
        return {
            "endpoint_name":    ep["name"],
            "endpoint_url":     ep["url"],
            "response_time_ms": None,
            "status_code":      None,
            "is_up":            False,
            "error_message":    str(exc)[:500],
        }


def _fetch_portal_stats() -> dict:
    """Try CKAN API first, fall back to homepage scrape."""
    stats = {}

    # Strategy 1 – CKAN package search (count only)
    try:
        r = requests.get(
            f"{config.PORTAL_BASE}/api/3/action/package_search",
            params={"rows": 0},
            timeout=config.REQUEST_TIMEOUT,
            headers={"User-Agent": "DataGovGR-Dashboard/1.0"},
        )
        if r.status_code == 200:
            data = r.json()
            if data.get("success"):
                stats["total_datasets"] = data["result"]["count"]
    except Exception:
        pass

    # Strategy 2 – CKAN organization list
    try:
        r = requests.get(
            f"{config.PORTAL_BASE}/api/3/action/organization_list",
            timeout=config.REQUEST_TIMEOUT,
            headers={"User-Agent": "DataGovGR-Dashboard/1.0"},
        )
        if r.status_code == 200:
            data = r.json()
            if data.get("success"):
                stats["total_organizations"] = len(data["result"])
    except Exception:
        pass

    # Strategy 3 – scrape homepage counters
    if not stats:
        try:
            r = requests.get(
                config.PORTAL_BASE,
                timeout=config.REQUEST_TIMEOUT,
                headers={"User-Agent": "DataGovGR-Dashboard/1.0"},
            )
            if r.status_code == 200:
                text = r.text
                patterns = [
                    (r'(\d[\d,\.]*)\s*(?:<[^>]*>)*\s*[Dd]atasets?',      "total_datasets"),
                    (r'(\d[\d,\.]*)\s*(?:<[^>]*>)*\s*[Oo]rganizations?',  "total_organizations"),
                    (r'(\d[\d,\.]*)\s*(?:<[^>]*>)*\s*[Rr]esources?',      "total_resources"),
                    (r'(\d[\d,\.]*)\s*(?:<[^>]*>)*\s*[Ss]ervices?',       "total_services"),
                ]
                for pat, key in patterns:
                    if key not in stats:
                        m = re.search(pat, text, re.IGNORECASE)
                        if m:
                            try:
                                stats[key] = int(m.group(1).replace(",", "").replace(".", ""))
                            except ValueError:
                                pass
        except Exception:
            pass

    return stats


def run_health_checks():
    with app.app_context():
        for ep in config.ENDPOINTS_TO_MONITOR:
            db.session.add(HealthCheck(**_check_endpoint(ep)))
        stats = _fetch_portal_stats()
        if stats:
            db.session.add(PortalSnapshot(**stats))
        db.session.commit()


def _background_loop():
    # Run immediately on startup, then repeat every interval
    try:
        run_health_checks()
    except Exception as exc:
        print(f"[health-check] initial error: {exc}")
    while True:
        time.sleep(config.CHECK_INTERVAL_SECONDS)
        try:
            run_health_checks()
        except Exception as exc:
            print(f"[health-check] error: {exc}")


# Only start the background thread once (guard against Flask dev-reloader fork)
if not app.debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
    threading.Thread(target=_background_loop, daemon=True).start()


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html",
                           endpoints=config.ENDPOINTS_TO_MONITOR,
                           has_token=bool(config.TOKEN))


@app.route("/api/health/current")
def health_current():
    return jsonify([_check_endpoint(ep) for ep in config.ENDPOINTS_TO_MONITOR])


@app.route("/api/health/history")
def health_history():
    ep_name = freq.args.get("endpoint", config.ENDPOINTS_TO_MONITOR[0]["name"])
    hours   = int(freq.args.get("hours", 24))
    since   = datetime.now(timezone.utc) - timedelta(hours=hours)
    rows = (HealthCheck.query
            .filter(HealthCheck.timestamp >= since,
                    HealthCheck.endpoint_name == ep_name)
            .order_by(HealthCheck.timestamp)
            .all())
    return jsonify([r.to_dict() for r in rows])


@app.route("/api/health/summary")
def health_summary():
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    out = []
    for ep in config.ENDPOINTS_TO_MONITOR:
        rows = (HealthCheck.query
                .filter(HealthCheck.timestamp >= since,
                        HealthCheck.endpoint_name == ep["name"])
                .all())
        if rows:
            up     = sum(1 for r in rows if r.is_up)
            rt_ok  = [r.response_time_ms for r in rows if r.response_time_ms is not None]
            out.append({
                "name":            ep["name"],
                "url":             ep["url"],
                "critical":        ep.get("critical", False),
                "uptime_pct":      round(up / len(rows) * 100, 1),
                "avg_response_ms": round(sum(rt_ok) / len(rt_ok), 1) if rt_ok else None,
                "total_checks":    len(rows),
                "last_up":         next((r.timestamp.isoformat() for r in reversed(rows) if r.is_up), None),
            })
        else:
            out.append({
                "name":            ep["name"],
                "url":             ep["url"],
                "critical":        ep.get("critical", False),
                "uptime_pct":      None,
                "avg_response_ms": None,
                "total_checks":    0,
                "last_up":         None,
            })
    return jsonify(out)


@app.route("/api/stats/latest")
def stats_latest():
    snap = PortalSnapshot.query.order_by(PortalSnapshot.timestamp.desc()).first()
    if snap:
        return jsonify(snap.to_dict())
    return jsonify({"error": "No snapshot yet"}), 404


@app.route("/api/stats/history")
def stats_history():
    days  = int(freq.args.get("days", 30))
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows  = (PortalSnapshot.query
             .filter(PortalSnapshot.timestamp >= since)
             .order_by(PortalSnapshot.timestamp)
             .all())
    return jsonify([r.to_dict() for r in rows])


@app.route("/api/datasets/check")
def datasets_check():
    if not config.TOKEN:
        return jsonify({"error": "Set the DATAGOVGR_TOKEN environment variable"}), 401
    results = []
    for ds in config.SAMPLE_DATASETS:
        try:
            r = requests.get(
                f"{config.API_BASE}/query/{ds}",
                headers=_api_headers(),
                params={"date_from": "2024-01-01", "date_to": "2024-01-07"},
                timeout=config.REQUEST_TIMEOUT,
            )
            results.append({
                "name":         ds,
                "status_code":  r.status_code,
                "accessible":   r.status_code < 400,
                "record_count": len(r.json()) if r.status_code == 200 else 0,
            })
        except Exception as exc:
            results.append({"name": ds, "status_code": None, "accessible": False, "error": str(exc)})
    return jsonify(results)


@app.route("/api/quality/check")
def quality_check():
    if not config.TOKEN:
        return jsonify({"error": "Set the DATAGOVGR_TOKEN environment variable"}), 401
    issues = []
    for ds in config.SAMPLE_DATASETS:
        try:
            r = requests.get(
                f"{config.API_BASE}/query/{ds}",
                headers=_api_headers(),
                params={"date_from": "2024-01-01", "date_to": "2024-01-01"},
                timeout=config.REQUEST_TIMEOUT,
            )
            if r.status_code == 401:
                issues.append({"dataset": ds, "issue": "Unauthorized — check token", "severity": "critical"})
            elif r.status_code == 404:
                issues.append({"dataset": ds, "issue": "Dataset not found",          "severity": "critical"})
            elif r.status_code != 200:
                issues.append({"dataset": ds, "issue": f"HTTP {r.status_code}",      "severity": "critical"})
            elif not r.json():
                issues.append({"dataset": ds, "issue": "No data for date range",     "severity": "warning"})
        except requests.exceptions.Timeout:
            issues.append({"dataset": ds, "issue": "Timeout", "severity": "critical"})
        except Exception as exc:
            issues.append({"dataset": ds, "issue": str(exc), "severity": "critical"})

    critical = [i for i in issues if i["severity"] == "critical"]
    return jsonify({
        "checked":      len(config.SAMPLE_DATASETS),
        "issues_found": len(issues),
        "critical":     len(critical),
        "healthy":      len(critical) == 0,
        "issues":       issues,
    })


@app.route("/api/trigger-check", methods=["POST"])
def trigger_check():
    threading.Thread(target=run_health_checks, daemon=True).start()
    return jsonify({"ok": True, "timestamp": datetime.now(timezone.utc).isoformat()})


if __name__ == "__main__":
    app.run(debug=True, use_reloader=True)
