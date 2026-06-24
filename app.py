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
from models import db, HealthCheck, PortalSnapshot, Communication
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


def _parse_homepage_stats(text: str) -> dict:
    """Extract portal counters from the data.gov.gr homepage HTML.

    The homepage uses space-separated Greek numbers ("87 121") and Greek labels
    ("Πόροι Δεδομένων", "Σύνολα Δεδομένων", etc.).  Numbers may be separated
    from their label by arbitrary HTML tags, so we allow tag sequences between them.
    """
    results = {}
    # number pattern: digits optionally separated by spaces/nbsp in groups of 3
    num_pat = r'(\d[\d  ]*\d|\d{1,3})'
    tag_gap = r'(?:\s*<[^>]*>)*\s*'
    for keyword, key in [
        ("Σύνολα",    "total_datasets"),
        ("Οργανισμ",  "total_organizations"),
        ("Πόρ",       "total_resources"),
        ("Υπηρεσί",   "total_services"),
    ]:
        # number immediately before the keyword (most common layout)
        m = re.search(num_pat + tag_gap + re.escape(keyword), text)
        if m:
            raw = re.sub(r'[\s ]', '', m.group(1))
            try:
                results[key] = int(raw)
                continue
            except ValueError:
                pass
        # keyword before number (fallback)
        m = re.search(re.escape(keyword) + tag_gap + num_pat, text)
        if m:
            raw = re.sub(r'[\s ]', '', m.group(1))
            try:
                results[key] = int(raw)
            except ValueError:
                pass
    return results


def _fetch_portal_stats() -> dict:
    """Fetch current portal counters.

    Strategy:
    - Scrape homepage first — it is the authoritative source for resources and
      services (Greek labels, space-separated numbers like "87 121").
    - Override datasets and organizations with CKAN API counts (more precise).
    """
    h = {"User-Agent": "DataGovGR-Dashboard/1.0"}
    stats: dict = {}

    # ── 1. Homepage scrape (covers all four counters) ──────────────────────
    try:
        r = requests.get(config.PORTAL_BASE, timeout=config.REQUEST_TIMEOUT, headers=h)
        if r.status_code == 200:
            stats = _parse_homepage_stats(r.text)
    except Exception:
        pass

    # ── 2. API overrides for datasets and organizations ─────────────────────
    for fq, key in [("type:dataset", "total_datasets"), ("type:data-service", "total_services")]:
        try:
            r = requests.get(
                f"{config.PORTAL_BASE}/api/3/action/package_search",
                params={"rows": 0, "fq": fq},
                timeout=config.REQUEST_TIMEOUT, headers=h,
            )
            if r.status_code == 200:
                data = r.json()
                if data.get("success") and data["result"]["count"] > 0:
                    stats[key] = data["result"]["count"]
        except Exception:
            pass

    try:
        r = requests.post(
            f"{config.PORTAL_BASE}/api/3/action/organization_list",
            json={}, timeout=config.REQUEST_TIMEOUT, headers=h,
        )
        if r.status_code == 200:
            data = r.json()
            if data.get("success"):
                stats["total_organizations"] = len(data["result"])
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


_HRMS_CACHE: dict = {"data": None, "fetched_at": 0.0}
_HRMS_TTL = 24 * 3600  # refresh once per day


@app.route("/api/public-orgs")
def public_orgs():
    if _HRMS_CACHE["data"] is None or time.time() - _HRMS_CACHE["fetched_at"] > _HRMS_TTL:
        try:
            r = requests.get(
                "https://hrms.gov.gr/api/public/organizations",
                timeout=15,
                headers={"User-Agent": "DataGovGR-Dashboard/1.0"},
            )
            if r.status_code == 200:
                raw = r.json()
                orgs = raw.get("data", raw) if isinstance(raw, dict) else raw
                _HRMS_CACHE["data"] = sorted(
                    [
                        {"code": o["code"], "label": o["preferredLabel"]}
                        for o in orgs
                        if o.get("preferredLabel") and o.get("code")
                    ],
                    key=lambda x: x["label"],
                )
                _HRMS_CACHE["fetched_at"] = time.time()
        except Exception as exc:
            if _HRMS_CACHE["data"] is None:
                return jsonify({"error": str(exc)}), 503
    return jsonify(_HRMS_CACHE["data"])


_ORGS_REFRESH_INTERVAL = 30 * 60  # refresh org cache every 30 minutes
_orgs_cache: dict = {"data": None, "fetched_at": None, "enriching": False}


def _fetch_orgs_quick() -> None:
    """Fast path: org list only. Populates cache in ~2-3 s.
    Preserves any last_updated values already in cache so a Refresh
    doesn't wipe dates that background enrichment already filled in."""
    r = requests.post(
        f"{config.PORTAL_BASE}/api/3/action/organization_list",
        json={"all_fields": True, "include_dataset_count": True},
        timeout=config.REQUEST_TIMEOUT,
        headers={"User-Agent": "DataGovGR-Dashboard/1.0"},
    )
    if r.status_code != 200:
        raise RuntimeError(f"organization_list HTTP {r.status_code}")
    data = r.json()
    if not data.get("success"):
        raise RuntimeError(data.get("error", {}).get("message", "CKAN error"))
    existing_dates = {o["name"]: o.get("last_updated") for o in (_orgs_cache.get("data") or [])}
    _orgs_cache["data"] = sorted(
        [
            {
                "name":          o.get("name"),
                "title":         o.get("title") or o.get("name"),
                "package_count": o.get("package_count", 0),
                "last_updated":  existing_dates.get(o.get("name")),
            }
            for o in data["result"]
        ],
        key=lambda o: o["package_count"],
        reverse=True,
    )
    _orgs_cache["fetched_at"] = datetime.now(timezone.utc).isoformat()


def _do_refresh_orgs() -> None:
    """Fetch all orgs with full package pagination for last_updated. Updates cache in-place."""
    r = requests.post(
        f"{config.PORTAL_BASE}/api/3/action/organization_list",
        json={"all_fields": True, "include_dataset_count": True},
        timeout=config.REQUEST_TIMEOUT,
        headers={"User-Agent": "DataGovGR-Dashboard/1.0"},
    )
    if r.status_code != 200:
        raise RuntimeError(f"organization_list HTTP {r.status_code}")
    data = r.json()
    if not data.get("success"):
        raise RuntimeError(data.get("error", {}).get("message", "CKAN error"))

    orgs = {
        o["name"]: {
            "name":          o.get("name"),
            "title":         o.get("title") or o.get("name"),
            "package_count": o.get("package_count", 0),
            "last_updated":  None,
        }
        for o in data["result"]
    }

    # Paginate all packages sorted newest-first; first hit per org = its latest update.
    # Runs in a background thread so there is no HTTP request timeout to worry about.
    try:
        start      = 0
        batch      = 500
        seen: set  = set()
        total_pkgs = None
        while True:
            r2 = requests.get(
                f"{config.PORTAL_BASE}/api/3/action/package_search",
                params={"rows": batch, "start": start, "sort": "metadata_modified desc"},
                timeout=config.REQUEST_TIMEOUT,
                headers={"User-Agent": "DataGovGR-Dashboard/1.0"},
            )
            if r2.status_code != 200:
                break
            d2 = r2.json()
            if not d2.get("success"):
                break
            results = d2["result"]["results"]
            if total_pkgs is None:
                total_pkgs = d2["result"]["count"]
            if not results:
                break
            for pkg in results:
                org_name = (pkg.get("organization") or {}).get("name")
                if org_name and org_name in orgs and org_name not in seen:
                    orgs[org_name]["last_updated"] = pkg.get("metadata_modified")
                    seen.add(org_name)
            start += batch
            if len(seen) >= len(orgs) or start >= (total_pkgs or 0):
                break
    except Exception:
        pass  # partial last_updated data is still useful

    _orgs_cache["data"]      = sorted(orgs.values(), key=lambda o: o["package_count"], reverse=True)
    _orgs_cache["fetched_at"] = datetime.now(timezone.utc).isoformat()
    _orgs_cache["enriching"]  = False


def _background_loop():
    # Run immediately on startup, then repeat every interval
    try:
        run_health_checks()
    except Exception as exc:
        print(f"[health-check] initial error: {exc}")
    try:
        _do_refresh_orgs()
    except Exception as exc:
        print(f"[orgs] initial error: {exc}")

    last_orgs_refresh = time.time()
    while True:
        time.sleep(config.CHECK_INTERVAL_SECONDS)
        try:
            run_health_checks()
        except Exception as exc:
            print(f"[health-check] error: {exc}")
        if time.time() - last_orgs_refresh >= _ORGS_REFRESH_INTERVAL:
            try:
                _do_refresh_orgs()
            except Exception as exc:
                print(f"[orgs] refresh error: {exc}")
            last_orgs_refresh = time.time()


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


@app.route("/api/stats/live")
def stats_live():
    """Return current portal stats fetched live — no DB involved."""
    return jsonify(_fetch_portal_stats())


@app.route("/api/stats/datasets-since")
def datasets_since():
    date_str = freq.args.get("date", "").strip()
    if not date_str:
        return jsonify({"error": "date parameter required (YYYY-MM-DD)"}), 400
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return jsonify({"error": "invalid date, use YYYY-MM-DD"}), 400
    solr_date = dt.strftime("%Y-%m-%dT00:00:00Z")
    fq = f"type:dataset AND metadata_created:[{solr_date} TO NOW]"
    h = {"User-Agent": "DataGovGR-Dashboard/1.0"}
    try:
        r = requests.get(
            f"{config.PORTAL_BASE}/api/3/action/package_search",
            params={
                "rows": 0,
                "fq": fq,
                "facet.field": '["organization"]',
                "facet.limit": 500,
                "facet.mincount": 1,
            },
            timeout=config.REQUEST_TIMEOUT, headers=h,
        )
        if r.status_code == 200:
            data = r.json()
            if data.get("success"):
                orgs = (
                    data.get("result", {})
                        .get("search_facets", {})
                        .get("organization", {})
                        .get("items", [])
                )
                return jsonify({
                    "count": data["result"]["count"],
                    "since": date_str,
                    "organizations": sorted(orgs, key=lambda o: o["count"], reverse=True),
                })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 503
    return jsonify({"error": "CKAN API error"}), 503


@app.route("/api/stats/org-datasets-since")
def org_datasets_since():
    date_str = freq.args.get("date", "").strip()
    org_name = freq.args.get("org",  "").strip()
    if not date_str or not org_name:
        return jsonify({"error": "date and org parameters required"}), 400
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return jsonify({"error": "invalid date, use YYYY-MM-DD"}), 400
    solr_date = dt.strftime("%Y-%m-%dT00:00:00Z")
    fq = f"type:dataset AND metadata_created:[{solr_date} TO NOW] AND organization:{org_name}"
    h = {"User-Agent": "DataGovGR-Dashboard/1.0"}
    try:
        r = requests.get(
            f"{config.PORTAL_BASE}/api/3/action/package_search",
            params={"rows": 500, "fq": fq, "sort": "metadata_created desc"},
            timeout=config.REQUEST_TIMEOUT, headers=h,
        )
        if r.status_code == 200:
            data = r.json()
            if data.get("success"):
                datasets = [
                    {
                        "name":             pkg.get("name"),
                        "title":            pkg.get("title") or pkg.get("name"),
                        "metadata_created": (pkg.get("metadata_created") or "")[:10],
                    }
                    for pkg in data["result"]["results"]
                ]
                return jsonify({"datasets": datasets, "org": org_name, "since": date_str})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 503
    return jsonify({"error": "CKAN API error"}), 503


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
                "resource_count": sum(
                    1 for r in result_obj.get("resources", [])
                    if r.get("name") != "Όλα τα δεδομένα πόρων"
                ),
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
        ("package_search",        f"{config.PORTAL_BASE}/api/3/action/package_search",  {"rows": 0}),
        ("package_search_types",  f"{config.PORTAL_BASE}/api/3/action/package_search",  {"rows": 0, "facet.field": '["type"]', "facet.limit": 50}),
        ("resource_search",       f"{config.PORTAL_BASE}/api/3/action/resource_search", {"query": "name:", "limit": 0}),
        ("status_show",           f"{config.PORTAL_BASE}/api/3/action/status_show",     {}),
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


@app.route("/api/organizations", methods=["GET", "POST"])
def organizations():
    if freq.method == "POST" or _orgs_cache["data"] is None:
        # Quick fetch returns data immediately (org list only, no last_updated).
        try:
            _fetch_orgs_quick()
        except Exception as exc:
            return jsonify({"error": str(exc)}), 503
        # Full enrichment (package pagination for last_updated) runs in background.
        _orgs_cache["enriching"] = True
        threading.Thread(target=_do_refresh_orgs, daemon=True).start()

    return jsonify({
        "data":      _orgs_cache["data"],
        "fetched_at": _orgs_cache["fetched_at"],
        "enriching":  _orgs_cache["enriching"],
    })


@app.route("/api/organizations/<org_name>")
def organization_detail(org_name):
    headers = {"User-Agent": "DataGovGR-Dashboard/1.0"}
    result = {}

    try:
        r = requests.get(
            f"{config.PORTAL_BASE}/api/3/action/organization_show",
            params={"id": org_name},
            timeout=config.REQUEST_TIMEOUT,
            headers=headers,
        )
        if r.status_code == 200:
            data = r.json()
            if data.get("success"):
                org = data["result"]
                result["org"] = {
                    "name":          org.get("name"),
                    "title":         org.get("title") or org.get("name"),
                    "description":   (org.get("description") or "").strip(),
                    "image_url":     org.get("image_display_url") or org.get("image_url") or "",
                    "package_count": org.get("package_count", 0),
                    "created":       org.get("created"),
                    "state":         org.get("state"),
                }
    except Exception as exc:
        return jsonify({"error": str(exc)}), 503

    if not result.get("org"):
        return jsonify({"error": "Organization not found"}), 404

    try:
        r = requests.get(
            f"{config.PORTAL_BASE}/api/3/action/package_search",
            params={"fq": f"organization:{org_name}", "rows": 6, "sort": "metadata_modified desc"},
            timeout=config.REQUEST_TIMEOUT,
            headers=headers,
        )
        if r.status_code == 200:
            data = r.json()
            if data.get("success"):
                result["recent_datasets"] = [
                    {
                        "name":              pkg.get("name"),
                        "title":             pkg.get("title") or pkg.get("name"),
                        "metadata_modified": pkg.get("metadata_modified"),
                        "num_resources":     sum(
                            1 for r in (pkg.get("resources") or [])
                            if r.get("name") != "Όλα τα δεδομένα πόρων"
                        ),
                        "notes":             (pkg.get("notes") or "")[:300].strip(),
                    }
                    for pkg in data["result"]["results"]
                ]
    except Exception:
        result["recent_datasets"] = []

    return jsonify(result)


VALID_STATUSES = {"Contacted", "Responded", "Uploaded", "No Response"}


@app.route("/api/communications", methods=["GET"])
def communications_list():
    rows = Communication.query.order_by(Communication.contact_date.desc(), Communication.created_at.desc()).all()
    return jsonify([r.to_dict() for r in rows])


@app.route("/api/communications", methods=["POST"])
def communications_create():
    body = freq.get_json(force=True) or {}
    org_name  = (body.get("org_name") or "").strip()
    subject   = (body.get("subject") or "").strip()
    contact_date = (body.get("contact_date") or "").strip()
    if not org_name or not subject or not contact_date:
        return jsonify({"error": "org_name, subject and contact_date are required"}), 400
    status = body.get("status", "Contacted")
    if status not in VALID_STATUSES:
        return jsonify({"error": f"status must be one of {sorted(VALID_STATUSES)}"}), 400
    comm = Communication(
        contact_date=contact_date,
        org_name=org_name,
        org_title=(body.get("org_title") or "").strip() or None,
        subject=subject,
        status=status,
        notes=(body.get("notes") or "").strip() or None,
    )
    db.session.add(comm)
    db.session.commit()
    return jsonify(comm.to_dict()), 201


@app.route("/api/communications/<int:comm_id>", methods=["PATCH"])
def communications_update(comm_id):
    comm = Communication.query.get_or_404(comm_id)
    body = freq.get_json(force=True) or {}
    if "contact_date" in body:
        comm.contact_date = (body["contact_date"] or "").strip()
    if "org_name" in body:
        comm.org_name = (body["org_name"] or "").strip()
    if "org_title" in body:
        comm.org_title = (body["org_title"] or "").strip() or None
    if "subject" in body:
        comm.subject = (body["subject"] or "").strip()
    if "status" in body:
        if body["status"] not in VALID_STATUSES:
            return jsonify({"error": f"status must be one of {sorted(VALID_STATUSES)}"}), 400
        comm.status = body["status"]
    if "notes" in body:
        comm.notes = (body["notes"] or "").strip() or None
    db.session.commit()
    return jsonify(comm.to_dict())


@app.route("/api/communications/<int:comm_id>", methods=["DELETE"])
def communications_delete(comm_id):
    comm = Communication.query.get_or_404(comm_id)
    db.session.delete(comm)
    db.session.commit()
    return jsonify({"ok": True})


# ── Matomo Analytics ─────────────────────────────────────────────────────────

_MATOMO_CACHE: dict = {}
_MATOMO_CACHE_TTL = 3600  # 1 hour


def _matomo_get(method: str, params: dict):
    import json as _json
    key = method + "|" + _json.dumps(params, sort_keys=True)
    entry = _MATOMO_CACHE.get(key)
    if entry and time.time() - entry["ts"] < _MATOMO_CACHE_TTL:
        return entry["data"]
    full = {
        "module": "API", "method": method,
        "idSite": config.MATOMO_SITE_ID, "format": "JSON",
        "token_auth": config.MATOMO_TOKEN,
        **params,
    }
    r = requests.post(config.MATOMO_URL, data=full, timeout=20,
                      headers={"User-Agent": "DataGovGR-Dashboard/1.0"})
    r.raise_for_status()
    data = r.json()
    if isinstance(data, dict) and data.get("result") == "error":
        raise RuntimeError(data.get("message", "Matomo API error"))
    _MATOMO_CACHE[key] = {"data": data, "ts": time.time()}
    return data


def _matomo_date_range(days: int):
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days - 1)
    return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")


@app.route("/api/matomo/summary")
def matomo_summary():
    if not config.MATOMO_TOKEN:
        return jsonify({"error": "MATOMO_TOKEN not configured"}), 503
    days = min(int(freq.args.get("days", 30)), 365)
    start, end = _matomo_date_range(days)
    try:
        data = _matomo_get("VisitsSummary.get", {"period": "range", "date": f"{start},{end}"})
        visits    = data.get("nb_visits", 0) or 0
        pageviews = data.get("nb_pageviews") or data.get("nb_actions") or 0

        # nb_uniq_visitors is not computed by Matomo for range periods; sum daily instead
        uniq = data.get("nb_uniq_visitors") or 0
        uniq_approx = False
        if not uniq:
            try:
                daily = _matomo_get("VisitsSummary.get", {"period": "day", "date": f"last{days}"})
                uniq = sum(v.get("nb_uniq_visitors", 0) or 0 for v in daily.values() if isinstance(v, dict))
                uniq_approx = True
            except Exception:
                pass

        # nb_downloads in VisitsSummary may be 0; Actions.getDownloads is authoritative
        downloads = data.get("nb_downloads") or 0
        if not downloads:
            try:
                dl = _matomo_get("Actions.getDownloads", {
                    "period": "range", "date": f"{start},{end}", "filter_limit": 500,
                })
                if isinstance(dl, list):
                    downloads = sum(item.get("nb_visits", 0) or 0 for item in dl)
            except Exception:
                pass

        return jsonify({
            "visits":          visits,
            "unique_visitors": uniq,
            "unique_approx":   uniq_approx,
            "pageviews":       pageviews,
            "downloads":       downloads,
            "period_days":     days,
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 503


@app.route("/api/matomo/visits-history")
def matomo_visits_history():
    if not config.MATOMO_TOKEN:
        return jsonify({"error": "MATOMO_TOKEN not configured"}), 503
    days = min(int(freq.args.get("days", 30)), 365)
    try:
        data = _matomo_get("VisitsSummary.get", {"period": "day", "date": f"last{days}"})

        # nb_downloads in VisitsSummary is often 0; use Actions.getDownloads per day
        dl_by_date: dict = {}
        try:
            dl_raw = _matomo_get("Actions.getDownloads", {
                "period": "day", "date": f"last{days}", "filter_limit": 500,
            })
            if isinstance(dl_raw, dict):
                for date_str, items in dl_raw.items():
                    if isinstance(items, list):
                        dl_by_date[date_str] = sum(item.get("nb_visits", 0) or 0 for item in items)
        except Exception:
            pass

        result = [
            {
                "date":            date_str,
                "visits":          v.get("nb_visits", 0) if isinstance(v, dict) else 0,
                "unique_visitors": v.get("nb_uniq_visitors", 0) if isinstance(v, dict) else 0,
                "pageviews":       (v.get("nb_pageviews") or v.get("nb_actions") or 0) if isinstance(v, dict) else 0,
                "downloads":       dl_by_date.get(date_str, v.get("nb_downloads", 0) if isinstance(v, dict) else 0),
            }
            for date_str, v in data.items()
        ]
        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 503


def _matomo_flat_pages(method: str, days: int, extra: dict) -> list:
    """Fetch aggregated page/keyword data without period=range.

    Maps the requested day count to standard periods (week/month) that
    Matomo always has pre-archived.  For multi-month requests, merges the
    per-month lists by label and sums visit counts.
    """
    if days <= 10:
        period, date_str = "week", "last1"
    elif days <= 35:
        period, date_str = "month", "last1"
    else:
        months = max(2, (days + 29) // 30)
        period, date_str = "month", f"last{months}"

    raw = _matomo_get(method, {"period": period, "date": date_str, **extra})

    if isinstance(raw, list):
        return raw

    if isinstance(raw, dict):
        merged: dict = {}
        for period_data in raw.values():
            if not isinstance(period_data, list):
                continue
            for item in period_data:
                key = item.get("label", "")
                if key not in merged:
                    merged[key] = dict(item)
                    merged[key]["nb_visits"] = 0
                    merged[key]["nb_uniq_visitors"] = 0
                merged[key]["nb_visits"]          += item.get("nb_visits", 0) or 0
                merged[key]["nb_uniq_visitors"]   += item.get("nb_uniq_visitors", 0) or 0
        return sorted(merged.values(), key=lambda x: x.get("nb_visits", 0), reverse=True)

    return []


@app.route("/api/matomo/top-datasets")
def matomo_top_datasets():
    if not config.MATOMO_TOKEN:
        return jsonify({"error": "MATOMO_TOKEN not configured"}), 503
    limit = min(int(freq.args.get("limit", 20)), 100)
    days  = min(int(freq.args.get("days", 30)), 365)
    try:
        pages = _matomo_flat_pages("Actions.getPageUrls", days,
                                   {"flat": 1, "filter_limit": 300})
        result = []
        for page in pages:
            label = page.get("label", "")
            if "dataset" not in label.lower():
                continue
            parts  = label.strip("/").split("/")
            ds_idx = next((i for i, p in enumerate(parts) if p.lower() == "dataset"), None)
            slug   = parts[ds_idx + 1] if ds_idx is not None and ds_idx + 1 < len(parts) else label
            result.append({
                "slug":            slug,
                "label":           label,
                "visits":          page.get("nb_visits", 0),
                "unique_visitors": page.get("nb_uniq_visitors", 0),
            })
        result.sort(key=lambda x: x["visits"], reverse=True)
        return jsonify(result[:limit])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 503


@app.route("/api/matomo/top-searches")
def matomo_top_searches():
    if not config.MATOMO_TOKEN:
        return jsonify({"error": "MATOMO_TOKEN not configured"}), 503
    limit = min(int(freq.args.get("limit", 20)), 100)
    days  = min(int(freq.args.get("days", 30)), 365)
    try:
        items = _matomo_flat_pages("Actions.getSiteSearchKeywords", days,
                                   {"filter_limit": limit * 2})
        return jsonify([
            {
                "keyword": item.get("label", ""),
                "searches": item.get("nb_visits", 0) or item.get("nb_searches", 0),
            }
            for item in items[:limit]
        ])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 503


@app.route("/api/matomo/top-api-calls")
def matomo_top_api_calls():
    if not config.MATOMO_TOKEN:
        return jsonify({"error": "MATOMO_TOKEN not configured"}), 503
    limit = min(int(freq.args.get("limit", 20)), 100)
    days  = min(int(freq.args.get("days", 30)), 365)
    try:
        pages = _matomo_flat_pages("Actions.getPageUrls", days,
                                   {"flat": 1, "filter_limit": 500})
        result = []
        for page in pages:
            label = page.get("label", "")
            if "/api/" not in label.lower():
                continue
            result.append({
                "path":   label,
                "visits": page.get("nb_visits", 0),
            })
        result.sort(key=lambda x: x["visits"], reverse=True)
        total = sum(r["visits"] for r in result)
        return jsonify({"total": total, "endpoints": result[:limit]})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 503


@app.route("/api/admin/reset", methods=["POST"])
def admin_reset():
    db.session.query(HealthCheck).delete()
    db.session.query(PortalSnapshot).delete()
    db.session.commit()
    threading.Thread(target=run_health_checks, daemon=True).start()
    return jsonify({"ok": True, "message": "All data cleared, fresh check started"})


if __name__ == "__main__":
    app.run(debug=True, use_reloader=True)
