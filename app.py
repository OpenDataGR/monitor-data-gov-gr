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
        h["Authorization"] = config.TOKEN  # CKAN uses the key directly, no prefix
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
    stats = {}

    # Total datasets
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

    # Total organizations — data.gov.gr CKAN requires POST
    try:
        r = requests.post(
            f"{config.PORTAL_BASE}/api/3/action/organization_list",
            json={},
            timeout=config.REQUEST_TIMEOUT,
            headers={"User-Agent": "DataGovGR-Dashboard/1.0"},
        )
        if r.status_code == 200:
            data = r.json()
            if data.get("success"):
                stats["total_organizations"] = len(data["result"])
    except Exception:
        pass

    # Total resources — paginate package_search and sum num_resources per package
    # (resource_search with empty query is unreliable on many CKAN installs)
    try:
        total_res = 0
        start = 0
        batch = 500
        while True:
            r = requests.get(
                f"{config.PORTAL_BASE}/api/3/action/package_search",
                params={"rows": batch, "start": start},
                timeout=config.REQUEST_TIMEOUT,
                headers={"User-Agent": "DataGovGR-Dashboard/1.0"},
            )
            if r.status_code != 200:
                break
            data = r.json()
            if not data.get("success"):
                break
            results = data["result"]["results"]
            if not results:
                break
            for pkg in results:
                total_res += pkg.get("num_resources", 0)
            start += batch
            if start >= data["result"]["count"]:
                break
        if start > 0:  # completed at least one page
            stats["total_resources"] = total_res
    except Exception:
        pass

    # Scrape homepage for anything still missing
    missing = {"total_datasets", "total_organizations", "total_resources"} - stats.keys()
    if missing:
        try:
            r = requests.get(
                config.PORTAL_BASE,
                timeout=config.REQUEST_TIMEOUT,
                headers={"User-Agent": "DataGovGR-Dashboard/1.0"},
            )
            if r.status_code == 200:
                text = r.text
                patterns = [
                    (r'(\d[\d,\.]*)\s*(?:<[^>]*>)*\s*[Dd]atasets?',     "total_datasets"),
                    (r'(\d[\d,\.]*)\s*(?:<[^>]*>)*\s*[Oo]rganizations?', "total_organizations"),
                    (r'(\d[\d,\.]*)\s*(?:<[^>]*>)*\s*[Rr]esources?',     "total_resources"),
                ]
                for pat, key in patterns:
                    if key in missing:
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

def _build_date() -> str:
    p = Path(__file__).parent / "build_date.txt"
    try:
        return p.read_text().strip()
    except FileNotFoundError:
        return "dev"


@app.route("/")
def index():
    return render_template("index.html",
                           endpoints=config.ENDPOINTS_TO_MONITOR,
                           has_token=bool(config.TOKEN),
                           build_date=_build_date())


@app.route("/api/health/current")
def health_current():
    return jsonify([_check_endpoint(ep) for ep in config.ENDPOINTS_TO_MONITOR])


@app.route("/api/health/history")
def health_history():
    ep_name = freq.args.get("endpoint", config.ENDPOINTS_TO_MONITOR[0]["name"])
    hours   = int(freq.args.get("hours", 24))
    since   = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=hours)
    rows = (HealthCheck.query
            .filter(HealthCheck.timestamp >= since,
                    HealthCheck.endpoint_name == ep_name)
            .order_by(HealthCheck.timestamp)
            .all())
    return jsonify([r.to_dict() for r in rows])


@app.route("/api/health/summary")
def health_summary():
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=24)
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
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    rows  = (PortalSnapshot.query
             .filter(PortalSnapshot.timestamp >= since)
             .order_by(PortalSnapshot.timestamp)
             .all())
    return jsonify([r.to_dict() for r in rows])


@app.route("/api/datasets/check")
def datasets_check():
    results = []
    for ds in config.SAMPLE_DATASETS:
        try:
            r = requests.get(
                f"{config.API_BASE}/package_show",
                params={"id": ds},
                headers=_api_headers(),
                timeout=config.REQUEST_TIMEOUT,
            )
            data = r.json() if r.status_code == 200 else {}
            success = data.get("success", False)
            result_obj = data.get("result", {}) if success else {}
            results.append({
                "name":           ds,
                "status_code":    r.status_code,
                "accessible":     success,
                "resource_count": len(result_obj.get("resources", [])),
                "title":          result_obj.get("title", ds),
                "organization":   (result_obj.get("organization") or {}).get("title", ""),
            })
        except Exception as exc:
            results.append({"name": ds, "status_code": None, "accessible": False, "error": str(exc)})
    return jsonify(results)


@app.route("/api/quality/check")
def quality_check():
    issues = []
    for ds in config.SAMPLE_DATASETS:
        try:
            r = requests.get(
                f"{config.API_BASE}/package_show",
                params={"id": ds},
                headers=_api_headers(),
                timeout=config.REQUEST_TIMEOUT,
            )
            if r.status_code == 404:
                issues.append({"dataset": ds, "issue": "Dataset not found", "severity": "critical"})
                continue
            if r.status_code != 200:
                issues.append({"dataset": ds, "issue": f"HTTP {r.status_code}", "severity": "critical"})
                continue
            data = r.json()
            if not data.get("success"):
                issues.append({"dataset": ds, "issue": data.get("error", {}).get("message", "API error"), "severity": "critical"})
                continue
            pkg = data["result"]
            if not pkg.get("resources"):
                issues.append({"dataset": ds, "issue": "No resources attached", "severity": "warning"})
            if pkg.get("state") != "active":
                issues.append({"dataset": ds, "issue": f"State is '{pkg.get('state')}'", "severity": "warning"})
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


@app.route("/api/debug/portal")
def debug_portal():
    h = {"User-Agent": "DataGovGR-Dashboard/1.0"}
    results = {}
    get_calls = [
        ("package_search",  f"{config.PORTAL_BASE}/api/3/action/package_search",  {"rows": 0}),
        ("resource_search", f"{config.PORTAL_BASE}/api/3/action/resource_search", {"query": "name:", "limit": 0}),
        ("status_show",     f"{config.PORTAL_BASE}/api/3/action/status_show",     {}),
    ]
    post_calls = [
        ("organization_list", f"{config.PORTAL_BASE}/api/3/action/organization_list", {}),
    ]
    for name, url, params in get_calls:
        try:
            r = requests.get(url, params=params, headers=h, timeout=config.REQUEST_TIMEOUT)
            try:
                body = r.json()
            except Exception:
                body = r.text[:500]
            results[name] = {"status": r.status_code, "body": body}
        except Exception as exc:
            results[name] = {"error": str(exc)}
    for name, url, payload in post_calls:
        try:
            r = requests.post(url, json=payload, headers=h, timeout=config.REQUEST_TIMEOUT)
            try:
                body = r.json()
            except Exception:
                body = r.text[:500]
            results[name] = {"status": r.status_code, "body": body}
        except Exception as exc:
            results[name] = {"error": str(exc)}
    return jsonify(results)


@app.route("/api/organizations")
def organizations():
    try:
        r = requests.post(
            f"{config.PORTAL_BASE}/api/3/action/organization_list",
            json={"all_fields": True, "include_dataset_count": True},
            timeout=config.REQUEST_TIMEOUT,
            headers={"User-Agent": "DataGovGR-Dashboard/1.0"},
        )
        if r.status_code != 200:
            return jsonify({"error": f"HTTP {r.status_code}"}), 502
        data = r.json()
        if not data.get("success"):
            return jsonify({"error": data.get("error", {}).get("message", "CKAN error")}), 502
        orgs = sorted(
            [
                {
                    "name":          o.get("name"),
                    "title":         o.get("title") or o.get("name"),
                    "package_count": o.get("package_count", 0),
                }
                for o in data["result"]
            ],
            key=lambda o: o["package_count"],
            reverse=True,
        )
        return jsonify(orgs)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/admin/reset", methods=["POST"])
def admin_reset():
    db.session.query(HealthCheck).delete()
    db.session.query(PortalSnapshot).delete()
    db.session.commit()
    threading.Thread(target=run_health_checks, daemon=True).start()
    return jsonify({"ok": True, "message": "All data cleared, fresh check started"})


if __name__ == "__main__":
    app.run(debug=True, use_reloader=True)
