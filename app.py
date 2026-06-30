import os
import re
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")
import time
import threading
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
import hashlib
import io
from flask import Flask, render_template, jsonify, request as freq, session, redirect, url_for, send_file
from werkzeug.middleware.proxy_fix import ProxyFix
from models import db, HealthCheck, PortalSnapshot, Communication, OrgContact
import config

app = Flask(__name__)
_db_url = config.DATABASE_URL or f"sqlite:///{Path(__file__).parent / 'instance' / 'dashboard.db'}"
if _db_url.startswith("postgres://"):  # normalize legacy Heroku-style prefix
    _db_url = _db_url.replace("postgres://", "postgresql://", 1)
app.config["SQLALCHEMY_DATABASE_URI"] = _db_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
_fallback_key = hashlib.sha256(
    (config.DASHBOARD_PASSWORD or "insecure-no-password").encode()
).hexdigest()
app.secret_key = config.FLASK_SECRET_KEY or _fallback_key
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

db.init_app(app)

with app.app_context():
    db.create_all()
    # Inline migrations: add columns that db.create_all() won't add to existing tables
    from sqlalchemy import text, inspect as sa_inspect
    _insp = sa_inspect(db.engine)
    _comm_cols = [c['name'] for c in _insp.get_columns('communications')]
    if 'contact_person' not in _comm_cols:
        db.session.execute(text('ALTER TABLE communications ADD COLUMN contact_person VARCHAR(200)'))
        db.session.commit()
    _contact_cols = [c['name'] for c in _insp.get_columns('org_contacts')]
    if 'contact_type' not in _contact_cols:
        db.session.execute(text('ALTER TABLE org_contacts ADD COLUMN contact_type VARCHAR(200)'))
        db.session.commit()
    if 'mobile' not in _contact_cols:
        db.session.execute(text('ALTER TABLE org_contacts ADD COLUMN mobile VARCHAR(50)'))
        db.session.commit()
    if db.engine.dialect.name == 'postgresql':
        try:
            db.session.execute(text('ALTER TABLE org_contacts ALTER COLUMN position TYPE TEXT'))
            db.session.commit()
        except Exception:
            db.session.rollback()


# ── Auth ──────────────────────────────────────────────────────────────────────

def _pw_hash(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()


@app.after_request
def no_cache(response):
    # Only prevent caching of HTML pages — static assets (CSS/JS) should remain cacheable
    if response.content_type and response.content_type.startswith("text/html"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


@app.before_request
def require_login():
    if not config.DASHBOARD_PASSWORD:
        return  # auth disabled — no password configured
    if freq.path in ("/login", "/logout") or freq.path.startswith("/static/"):
        return
    if session.get("authenticated"):
        return
    if freq.path.startswith("/api/"):
        return jsonify({"error": "Unauthorized"}), 401
    return redirect(url_for("login", next=freq.script_root + freq.path))


@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if freq.method == "POST":
        pw = freq.form.get("password", "")
        if config.DASHBOARD_PASSWORD and _pw_hash(pw) == _pw_hash(config.DASHBOARD_PASSWORD):
            session["authenticated"] = True
            return redirect(freq.form.get("next") or url_for("index"))
        error = "Incorrect password."
    return render_template("login.html", error=error,
                           next=freq.args.get("next", ""))


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


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

# Canonical contact-type values (norm'd Greek or English → stored value)
# Keys are already accent-stripped lowercase (output of _norm()).
_ROLE_MAP = {
    "διαχειριστης πυλης":       "Portal Administrator",
    "διαχειριστης":             "Portal Administrator",
    "συντακτης πυλης":          "Portal Editor",
    "συντακτης":                "Portal Editor",
    "χρηστης πυλης":            "Portal User",
    "χρηστης":                  "Portal User",
    "υπευθυνος δεδομενων":      "Data Officer",
    "θεματοφυλακας δεδομενων":  "Data Steward",
    "portal administrator":     "Portal Administrator",
    "portal editor":            "Portal Editor",
    "portal user":              "Portal User",
    "data officer":             "Data Officer",
    "data steward":             "Data Steward",
}


def _fix_tel_mobile(tel: str, mobile: str):
    """Move tel to mobile when the number is a Greek mobile (starts with 69 / +3069 / 003069)."""
    tel    = (tel    or "").strip()
    mobile = (mobile or "").strip()
    digits = re.sub(r"[\s\-\(\)\+]", "", tel)
    if digits.startswith("69") or digits.startswith("306") or digits.startswith("0069"):
        mobile = mobile or tel
        tel = ""
    return tel or None, mobile or None




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
                        {"code": o["code"], "label": o["preferredLabel"].strip('"').strip()}
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


def _git_sha() -> str:
    try:
        import subprocess
        r = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True,
            cwd=Path(__file__).parent, timeout=3,
        )
        return r.stdout.strip() if r.returncode == 0 else ""
    except Exception:
        return ""


_BUILD_SHA = _git_sha()


@app.route("/")
def index():
    return render_template("index.html",
                           endpoints=config.ENDPOINTS_TO_MONITOR,
                           has_token=bool(config.TOKEN),
                           build_date=_build_date(),
                           git_sha=_BUILD_SHA)


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
                    "members":       [],
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

    # Members — requires auth; silently skipped if token absent or API fails
    if config.TOKEN:
        try:
            auth_headers = {**headers, "Authorization": config.TOKEN}
            r = requests.get(
                f"{config.PORTAL_BASE}/api/3/action/organization_show",
                params={"id": org_name, "include_users": True},
                timeout=config.REQUEST_TIMEOUT,
                headers=auth_headers,
            )
            if r.status_code == 200:
                data = r.json()
                if data.get("success"):
                    raw_users = data["result"].get("users") or []
                    members = [
                        {
                            "name":         u.get("name", ""),
                            "display_name": u.get("display_name") or u.get("fullname") or u.get("name", ""),
                            "capacity":     u.get("capacity", "member"),
                            "email":        "",
                            "state":        u.get("state", "active"),
                        }
                        for u in raw_users
                    ]

                    # Fetch email + state per user in parallel via user_show
                    def _user_show(username):
                        try:
                            resp = requests.get(
                                f"{config.PORTAL_BASE}/api/3/action/user_show",
                                params={"id": username},
                                timeout=8,
                                headers=auth_headers,
                            )
                            if resp.status_code == 200:
                                ud = resp.json()
                                if ud.get("success"):
                                    return username, ud["result"]
                        except Exception:
                            pass
                        return username, {}

                    with ThreadPoolExecutor(max_workers=10) as pool:
                        futures = {pool.submit(_user_show, m["name"]): m["name"] for m in members}
                        user_details = {}
                        for fut in as_completed(futures):
                            uname, details = fut.result()
                            user_details[uname] = details

                    for m in members:
                        d = user_details.get(m["name"], {})
                        m["email"] = (d.get("email") or "").lower().strip()
                        m["state"] = d.get("state", m["state"])

                    result["org"]["members"] = members
        except Exception:
            pass

    # Communications summary for this org
    try:
        comms = Communication.query.filter(Communication.org_name == org_name).all()
        status_counts = {}
        latest_date = None
        for c in comms:
            status_counts[c.status] = status_counts.get(c.status, 0) + 1
            if latest_date is None or c.contact_date > latest_date:
                latest_date = c.contact_date
        result["comms_summary"] = {
            "total":       len(comms),
            "by_status":   status_counts,
            "latest_date": latest_date,
        }
    except Exception:
        result["comms_summary"] = {"total": 0, "by_status": {}, "latest_date": None}

    return jsonify(result)


VALID_STATUSES = {"Contacted", "Responded", "Uploaded", "No Response"}


@app.route("/api/communications", methods=["GET"])
def communications_list():
    rows = Communication.query.order_by(Communication.contact_date.desc(), Communication.created_at.desc()).all()
    return jsonify([r.to_dict() for r in rows])


@app.route("/api/communications", methods=["POST"])
def communications_create():
    body = _decode_payload()
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
        contact_person=(body.get("contact_person") or "").strip() or None,
    )
    db.session.add(comm)
    db.session.commit()
    return jsonify(comm.to_dict()), 201


@app.route("/api/communications/<int:comm_id>", methods=["GET", "PATCH", "POST"])
def communications_update(comm_id):
    comm = Communication.query.get_or_404(comm_id)
    body = _decode_payload()
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
    if "contact_person" in body:
        comm.contact_person = (body["contact_person"] or "").strip() or None
    db.session.commit()
    return jsonify(comm.to_dict())


@app.route("/api/communications/<int:comm_id>/delete", methods=["GET", "DELETE", "POST"])
def communications_delete(comm_id):
    comm = Communication.query.get_or_404(comm_id)
    db.session.delete(comm)
    db.session.commit()
    return jsonify({"ok": True})


@app.route("/api/communications/export", methods=["GET"])
def communications_export():
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment

    status_filter = (freq.args.get("status") or "").strip()
    q = (freq.args.get("q") or "").strip().lower()

    rows = Communication.query.order_by(
        Communication.contact_date.desc(), Communication.created_at.desc()
    ).all()

    if status_filter:
        rows = [r for r in rows if r.status == status_filter]
    if q:
        rows = [r for r in rows if any(
            q in (v or "").lower()
            for v in [r.org_title, r.org_name, r.subject, r.notes, r.status]
        )]

    wb = Workbook()
    ws = wb.active
    ws.title = "Communications"

    headers = ["Date", "Organization", "Subject", "Status", "Notes", "Created At"]
    header_fill = PatternFill("solid", fgColor="1E3A5F")
    header_font = Font(bold=True, color="FFFFFF")
    col_widths  = [14, 36, 42, 16, 48, 22]

    for col_idx, (header, width) in enumerate(zip(headers, col_widths), start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")
        ws.column_dimensions[cell.column_letter].width = width

    ws.row_dimensions[1].height = 20

    for row_idx, r in enumerate(rows, start=2):
        ws.cell(row=row_idx, column=1, value=r.contact_date)
        ws.cell(row=row_idx, column=2, value=r.org_title or r.org_name)
        ws.cell(row=row_idx, column=3, value=r.subject)
        ws.cell(row=row_idx, column=4, value=r.status)
        ws.cell(row=row_idx, column=5, value=r.notes or "")
        ws.cell(row=row_idx, column=6, value=(
            r.created_at.strftime("%Y-%m-%d %H:%M") if r.created_at else ""
        ))
        for col_idx in range(1, 7):
            ws.cell(row=row_idx, column=col_idx).alignment = Alignment(wrap_text=True, vertical="top")

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    filename = f"communications_{today}.xlsx"
    return send_file(
        buf,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name=filename,
    )





@app.route("/api/contacts/import", methods=["POST"])
def contacts_import():
    import unicodedata
    from openpyxl import load_workbook

    file = freq.files.get("file")
    if not file:
        return jsonify({"error": "No file provided"}), 400

    try:
        buf = io.BytesIO(file.read())

        def _norm(s):
            if not s:
                return ""
            s = unicodedata.normalize("NFD", str(s).strip().strip('"'))
            s = "".join(c for c in s if not unicodedata.combining(c))
            s = re.sub(r"[^\w\s]", " ", s.lower())
            return re.sub(r"\s+", " ", s).strip()

        # Build HRMS lookup: normalised label -> code
        # Fetch HRMS data live if the cache hasn't been populated yet
        hrms_orgs = _HRMS_CACHE.get("data") or []
        if not hrms_orgs:
            try:
                r = requests.get(
                    "https://hrms.gov.gr/api/public/organizations",
                    timeout=15,
                    headers={"User-Agent": "DataGovGR-Dashboard/1.0"},
                )
                if r.status_code == 200:
                    raw = r.json()
                    orgs = raw.get("data", raw) if isinstance(raw, dict) else raw
                    hrms_orgs = [
                        {"code": o["code"], "label": o["preferredLabel"]}
                        for o in orgs
                        if o.get("preferredLabel") and o.get("code")
                    ]
                    _HRMS_CACHE["data"] = hrms_orgs
                    _HRMS_CACHE["fetched_at"] = time.time()
            except Exception:
                pass

        hrms_lookup = {}
        for o in hrms_orgs:
            key = _norm(o.get("label", ""))
            if key:
                hrms_lookup[key] = o.get("code", o.get("label", ""))

        wb = load_workbook(buf, read_only=True, data_only=True)
        # Pick the sheet whose name contains STAGING, fall back to last sheet
        sheet_name = next(
            (s for s in wb.sheetnames if "STAGING" in s.upper()),
            wb.sheetnames[-1],
        )
        ws = wb[sheet_name]

        # Pre-load existing (org_code, email) pairs for dedup
        existing = set()
        for row in db.session.query(OrgContact.org_code, OrgContact.email).all():
            existing.add((row[0], (row[1] or "").strip().lower()))

        imported = skipped = 0
        errors = []

        # Expected columns (matches export format):
        # A=Organization  B=First Name  C=Last Name  D=Position
        # E=Contact Type  F=Email  G=Tel  H=Mobile
        for row_idx, row in enumerate(ws.iter_rows(min_row=2, max_col=9, values_only=True), start=2):
            try:
                org_label   = str(row[0] or "").strip()
                first_name  = str(row[1] or "").strip()
                last_name   = str(row[2] or "").strip()
                position    = str(row[3] or "").strip()
                portal_role = str(row[4] or "").strip()
                email       = str(row[5] or "").strip()
                tel_raw     = row[6]
                tel         = str(int(tel_raw)) if isinstance(tel_raw, (int, float)) else str(tel_raw or "").strip()
                mob_raw     = row[7] if len(row) > 7 else None
                mobile      = str(int(mob_raw)) if isinstance(mob_raw, (int, float)) else str(mob_raw or "").strip()
                tel, mobile = _fix_tel_mobile(tel, mobile)

                if not org_label or (not first_name and not last_name):
                    skipped += 1
                    continue

                # Map portal_role (Greek or English) → canonical contact_type
                contact_type = _ROLE_MAP.get(_norm(portal_role)) if portal_role else None

                # Match to HRMS code
                org_code = hrms_lookup.get(_norm(org_label), org_label)

                # Deduplicate by (org_code, email)
                email_key = email.lower()
                if (org_code, email_key) in existing:
                    skipped += 1
                    continue
                existing.add((org_code, email_key))

                db.session.add(OrgContact(
                    org_code     = org_code,
                    org_label    = org_label,
                    first_name   = first_name    or None,
                    last_name    = last_name     or None,
                    position     = position      or None,
                    contact_type = contact_type  or None,
                    email        = email         or None,
                    tel          = tel           or None,
                    mobile       = mobile        or None,
                ))
                imported += 1
            except Exception as exc:
                errors.append(f"Row {row_idx}: {exc}")

        db.session.commit()
        return jsonify({"imported": imported, "skipped": skipped, "errors": errors[:20]})

    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 500


@app.route("/api/contacts/fix-org-codes", methods=["POST"])
def contacts_fix_org_codes():
    """Re-map org_code for all contacts using their stored org_label + HRMS lookup.
    Needed when contacts were imported before the HRMS cache was populated."""
    import unicodedata

    def _norm(s):
        if not s:
            return ""
        s = unicodedata.normalize("NFD", str(s).strip().strip('"'))
        s = "".join(c for c in s if not unicodedata.combining(c))
        s = re.sub(r"[^\w\s]", " ", s.lower())
        return re.sub(r"\s+", " ", s).strip()

    hrms_orgs = _HRMS_CACHE.get("data") or []
    if not hrms_orgs:
        try:
            r = requests.get(
                "https://hrms.gov.gr/api/public/organizations",
                timeout=15,
                headers={"User-Agent": "DataGovGR-Dashboard/1.0"},
            )
            if r.status_code == 200:
                raw = r.json()
                orgs = raw.get("data", raw) if isinstance(raw, dict) else raw
                hrms_orgs = [
                    {"code": o["code"], "label": o["preferredLabel"]}
                    for o in orgs
                    if o.get("preferredLabel") and o.get("code")
                ]
                _HRMS_CACHE["data"] = hrms_orgs
                _HRMS_CACHE["fetched_at"] = time.time()
        except Exception as exc:
            return jsonify({"error": f"Could not fetch HRMS data: {exc}"}), 503

    # Build lookup: normalized_label → clean display label (NOT numeric code)
    # so contacts end up keyed the same way the UI looks them up (by o.label)
    hrms_label_lookup = {}
    for o in hrms_orgs:
        clean_label = o.get("label", "").strip('"').strip()
        key = _norm(clean_label)
        if key:
            hrms_label_lookup[key] = clean_label

    # Build acronym reverse index: initial letters of non-stop words → HRMS label
    # e.g. "ΑΝΩΤΑΤΟ ΣΥΜΒΟΥΛΙΟ ΕΠΙΛΟΓΗΣ ΠΡΟΣΩΠΙΚΟΥ" → "ασεπ"
    _STOPS = {
        'και', 'η', 'τα', 'το', 'της', 'του', 'των', 'την', 'τον',
        'τις', 'τους', 'για', 'με', 'απο', 'εως', 'ως', 'προς', 'εκ',
        'εις', 'εν', 'στο', 'στη', 'στα', 'στον', 'στην', 'στους', 'στις',
    }

    def _make_acro(norm_lbl):
        words = norm_lbl.split()
        letters = [w[0] for w in words if w and w not in _STOPS and len(w) > 1]
        return ''.join(letters) if len(letters) >= 3 else ''

    hrms_acro_lookup = {}
    for norm_key, lbl in hrms_label_lookup.items():
        acro = _make_acro(norm_key)
        if acro:
            hrms_acro_lookup.setdefault(acro, lbl)

    fixed = 0
    contacts = OrgContact.query.all()

    # Pass 1: exact normalized label match
    for c in contacts:
        if c.org_label:
            new_code = hrms_label_lookup.get(_norm(c.org_label))
            if new_code and new_code != c.org_code:
                c.org_code = new_code
                fixed += 1

    # Pass 2: strip parenthetical acronyms then re-match; also try acronym index
    for c in contacts:
        if not c.org_label:
            continue
        if hrms_label_lookup.get(_norm(c.org_label)):
            continue  # already covered by pass 1

        norm_label = _norm(c.org_label)

        # 2a: strip (ΕΚΤ) / «...» / [...] parenthetical suffixes and retry
        stripped = re.sub(r'\s*[\(\[«][^\)\]»]*[\)\]»]\s*', ' ', c.org_label).strip()
        if stripped != c.org_label:
            new_code = hrms_label_lookup.get(_norm(stripped))
            if new_code and new_code != c.org_code:
                c.org_code = new_code
                fixed += 1
                continue

        # 2b: contact label is itself an acronym (e.g. ΑΣΕΠ, ΕΕΤΤ)
        new_code = hrms_acro_lookup.get(norm_label)
        if new_code and new_code != c.org_code:
            c.org_code = new_code
            fixed += 1

    # Pass 3: match remaining unmatched contacts against CKAN org titles/slugs,
    # then cross-reference back to HRMS so they appear in both dashboard views.
    ckan_orgs = _orgs_cache.get("data") or []
    if not ckan_orgs:
        try:
            r = requests.post(
                f"{config.PORTAL_BASE}/api/3/action/organization_list",
                json={"all_fields": True, "include_dataset_count": True},
                timeout=15,
                headers={"User-Agent": "DataGovGR-Dashboard/1.0"},
            )
            if r.status_code == 200 and r.json().get("success"):
                ckan_orgs = [
                    {"name": o.get("name"), "title": o.get("title") or o.get("name")}
                    for o in r.json()["result"]
                ]
        except Exception:
            pass  # CKAN unavailable — skip Pass 3

    if ckan_orgs:
        ckan_norm_lookup: dict = {}
        for org in ckan_orgs:
            title = (org.get("title") or "").strip()
            name = (org.get("name") or "").strip()
            if title:
                ckan_norm_lookup.setdefault(_norm(title), {"name": name, "title": title})
            if name:
                ckan_norm_lookup.setdefault(_norm(name.replace("-", " ")), {"name": name, "title": title})

        hrms_labels_set = set(hrms_label_lookup.values())

        for c in contacts:
            if not c.org_label:
                continue
            if c.org_code in hrms_labels_set:
                continue  # already resolved to an HRMS label in passes 1/2

            # Build candidate label variants to try: full, paren-stripped, dash-stripped
            candidates = [c.org_label]
            paren_stripped = re.sub(r'\s*[\(\[«][^\)\]»]*[\)\]»]\s*', ' ', c.org_label).strip()
            if paren_stripped != c.org_label:
                candidates.append(paren_stripped)
            for dash in (' - ', ' – ', ' — '):
                if dash in c.org_label:
                    candidates.append(c.org_label.split(dash)[0].strip())
                    break

            matched_code = None
            for candidate in candidates:
                norm_cand = _norm(candidate)

                # Retry HRMS label (catches variants missed by passes 1/2)
                hrms_code = hrms_label_lookup.get(norm_cand)
                if hrms_code:
                    matched_code = hrms_code
                    break

                # Retry HRMS acronym
                acro = hrms_acro_lookup.get(norm_cand)
                if acro:
                    matched_code = acro
                    break

                # Try CKAN title / slug
                ckan_match = ckan_norm_lookup.get(norm_cand)
                if ckan_match:
                    # Cross-reference: prefer HRMS label when CKAN title is also in HRMS
                    hrms_from_ckan = hrms_label_lookup.get(_norm(ckan_match.get("title", "")))
                    matched_code = hrms_from_ckan if hrms_from_ckan else ckan_match["name"]
                    break

            if matched_code and matched_code != c.org_code:
                c.org_code = matched_code
                fixed += 1

    db.session.commit()
    return jsonify({"fixed": fixed, "total": len(contacts)})


@app.route("/api/contacts/fix-contact-types", methods=["POST"])
def contacts_fix_contact_types():
    """Backfill contact_type from [role] suffixes left in the position field by old imports."""
    import unicodedata

    def _norm(s):
        if not s:
            return ""
        s = unicodedata.normalize("NFD", str(s).strip().strip('"'))
        s = "".join(c for c in s if not unicodedata.combining(c))
        s = re.sub(r"[^\w\s]", " ", s.lower())
        return re.sub(r"\s+", " ", s).strip()

    fixed = 0
    contacts = OrgContact.query.all()
    for c in contacts:
        # Extract [role] suffix from position (e.g. "Προϊστάμενος [Διαχειριστής]")
        role_in_pos = None
        clean_pos = c.position or ""
        m = re.search(r'\[([^\]]+)\]\s*$', clean_pos)
        if m:
            role_in_pos = m.group(1).strip()
            clean_pos = clean_pos[:m.start()].strip()

        canonical = _ROLE_MAP.get(_norm(role_in_pos)) if role_in_pos else None

        changed = False
        if canonical and not c.contact_type:
            c.contact_type = canonical
            changed = True
        if role_in_pos and clean_pos != (c.position or ""):
            c.position = clean_pos or None
            changed = True
        if changed:
            fixed += 1

    db.session.commit()
    return jsonify({"fixed": fixed, "total": len(contacts)})


@app.route("/api/contacts/fix-tel-mobile", methods=["POST"])
def contacts_fix_tel_mobile():
    """Move any tel that starts with 69 (Greek mobile prefix) into the mobile field."""
    contacts = OrgContact.query.filter(OrgContact.tel.isnot(None)).all()
    fixed = 0
    for c in contacts:
        new_tel, new_mobile = _fix_tel_mobile(c.tel, c.mobile)
        if new_tel != c.tel or new_mobile != c.mobile:
            c.tel    = new_tel
            c.mobile = new_mobile
            fixed += 1
    db.session.commit()
    return jsonify({"fixed": fixed, "total": len(contacts)})


# ── Org Contacts ─────────────────────────────────────────────────────────────

@app.route("/api/contacts", methods=["GET"])
def contacts_all():
    contacts = (
        OrgContact.query
        .order_by(OrgContact.org_code, OrgContact.last_name, OrgContact.first_name)
        .all()
    )
    return jsonify([c.to_dict() for c in contacts])


@app.route("/api/contacts/export", methods=["GET"])
def contacts_export():
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment

    search = freq.args.get("search", "").strip().lower()
    type_filter = [t.strip() for t in freq.args.getlist("type") if t.strip()]

    contacts = (
        OrgContact.query
        .order_by(OrgContact.org_code, OrgContact.last_name, OrgContact.first_name)
        .all()
    )

    if search:
        contacts = [
            c for c in contacts
            if any(search in (v or "").lower() for v in
                   [c.org_label, c.org_code, c.first_name, c.last_name, c.position, c.email])
        ]
    if type_filter:
        contacts = [
            c for c in contacts
            if any(t in (c.contact_type or "") for t in type_filter)
        ]

    wb = Workbook()
    ws = wb.active
    ws.title = "Contacts"

    headers = ["Organization", "First Name", "Last Name", "Position",
               "Contact Type", "Email", "Tel", "Mobile"]
    hdr_font = Font(bold=True, color="FFFFFF")
    hdr_fill = PatternFill("solid", fgColor="2563EB")
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=h)
        cell.font = hdr_font
        cell.fill = hdr_fill
        cell.alignment = Alignment(horizontal="center")

    for ri, c in enumerate(contacts, 2):
        ws.cell(ri, 1, c.org_label or c.org_code)
        ws.cell(ri, 2, c.first_name)
        ws.cell(ri, 3, c.last_name)
        ws.cell(ri, 4, c.position)
        ws.cell(ri, 5, c.contact_type)
        ws.cell(ri, 6, c.email)
        ws.cell(ri, 7, c.tel)
        ws.cell(ri, 8, c.mobile)

    for col in ws.columns:
        width = max((len(str(cell.value or "")) for cell in col), default=0)
        ws.column_dimensions[col[0].column_letter].width = min(width + 2, 55)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return send_file(
        buf,
        as_attachment=True,
        download_name="contacts_export.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@app.route("/api/contacts/summary", methods=["GET"])
def contacts_summary():
    from sqlalchemy import func
    rows = db.session.query(OrgContact.org_code, func.count(OrgContact.id)).group_by(OrgContact.org_code).all()
    return jsonify({code: cnt for code, cnt in rows})


@app.route("/api/contacts/<path:org_code>", methods=["GET"])
def contacts_list(org_code):
    contacts = OrgContact.query.filter_by(org_code=org_code).all()
    return jsonify([c.to_dict() for c in contacts])


@app.route("/api/contacts/<path:org_code>", methods=["POST"])
def contacts_create(org_code):
    body = freq.get_json(force=True) or {}
    contact = OrgContact(
        org_code=org_code,
        org_label=(body.get("org_label") or "").strip() or None,
        first_name=(body.get("first_name") or "").strip() or None,
        last_name=(body.get("last_name") or "").strip() or None,
        position=(body.get("position") or "").strip() or None,
        contact_type=(body.get("contact_type") or "").strip() or None,
        email=(body.get("email") or "").strip() or None,
        tel=(body.get("tel") or "").strip() or None,
        mobile=(body.get("mobile") or "").strip() or None,
    )
    db.session.add(contact)
    db.session.commit()
    return jsonify(contact.to_dict()), 201


@app.route("/api/contacts/id/<int:contact_id>", methods=["PATCH", "POST"])
def contacts_update(contact_id):
    contact = OrgContact.query.get_or_404(contact_id)
    body = freq.get_json(force=True) or {}
    for field in ("first_name", "last_name", "position", "contact_type", "email", "tel", "mobile", "org_label"):
        if field in body:
            setattr(contact, field, (body[field] or "").strip() or None)
    db.session.commit()
    return jsonify(contact.to_dict())


@app.route("/api/contacts/id/<int:contact_id>/delete", methods=["DELETE", "POST"])
def contacts_delete(contact_id):
    contact = OrgContact.query.get_or_404(contact_id)
    db.session.delete(contact)
    db.session.commit()
    return jsonify({"ok": True})


def _decode_payload():
    """Decode a base64-encoded JSON payload from ?d=... or fall back to JSON/form/query params."""
    import base64 as _b64, json as _json
    raw = freq.args.get("d") or freq.form.get("d") or ""
    if raw:
        try:
            padded = raw + "=" * (-len(raw) % 4)
            return _json.loads(_b64.b64decode(padded).decode("utf-8"))
        except Exception:
            pass
    return freq.get_json(force=True, silent=True) or freq.form.to_dict() or freq.args.to_dict()


@app.route("/api/contacts/save", methods=["GET", "POST", "PATCH"])
def contacts_save():
    body = _decode_payload()
    contact_id = body.get("id") or None
    if contact_id and str(contact_id) not in ("", "null", "undefined"):
        contact = OrgContact.query.get_or_404(int(contact_id))
        for field in ("first_name", "last_name", "position", "contact_type", "email", "tel", "mobile", "org_label"):
            if field in body:
                setattr(contact, field, (body[field] or "").strip() or None)
        contact.tel, contact.mobile = _fix_tel_mobile(contact.tel, contact.mobile)
        db.session.commit()
        return jsonify(contact.to_dict())
    else:
        org_code = (body.get("org_code") or "").strip()
        if not org_code:
            return jsonify({"error": "org_code required"}), 400
        tel, mobile = _fix_tel_mobile(body.get("tel"), body.get("mobile"))
        contact = OrgContact(
            org_code=org_code,
            org_label=(body.get("org_label") or "").strip() or None,
            first_name=(body.get("first_name") or "").strip() or None,
            last_name=(body.get("last_name") or "").strip() or None,
            position=(body.get("position") or "").strip() or None,
            contact_type=(body.get("contact_type") or "").strip() or None,
            email=(body.get("email") or "").strip() or None,
            tel=tel,
            mobile=mobile,
        )
        db.session.add(contact)
        db.session.commit()
        return jsonify(contact.to_dict()), 201


@app.route("/api/contacts/remove", methods=["GET", "POST", "DELETE"])
def contacts_remove():
    body = _decode_payload()
    contact_id = body.get("id")
    if not contact_id:
        return jsonify({"error": "id required"}), 400
    contact = OrgContact.query.get_or_404(int(contact_id))
    db.session.delete(contact)
    db.session.commit()
    return jsonify({"ok": True})


# ── Portal Members (all orgs) ─────────────────────────────────────────────────

_pm_cache: dict = {"data": None, "ts": 0}


@app.route("/api/portal-members", methods=["GET"])
def portal_members_all():
    """Return all portal users across every CKAN organisation, cached for 2 hours."""
    now = time.time()
    # Serve from cache only when we have actual results (empty list = likely a prior failure)
    if _pm_cache["data"] and now - _pm_cache["ts"] < 7200:
        return jsonify(_pm_cache["data"])

    base_headers = {"User-Agent": "DataGovGR-Dashboard/1.0"}
    auth_headers = {**base_headers, "Authorization": config.TOKEN} if config.TOKEN else base_headers

    try:
        # Step 1 – get the list of all portal organisations (POST+JSON matches existing pattern)
        r = requests.post(
            f"{config.PORTAL_BASE}/api/3/action/organization_list",
            json={"all_fields": True},
            headers=auth_headers,
            timeout=20,
        )
        r.raise_for_status()
        org_list = r.json().get("result") or []

        # Step 2 – fetch members per org in parallel (email left blank for now)
        def _fetch_org_members(org):
            try:
                # org may be a dict (all_fields=True) or a plain string (fallback)
                if isinstance(org, str):
                    slug, title = org, org
                else:
                    slug  = org.get("name", "")
                    title = org.get("title") or org.get("display_name") or slug
                if not slug:
                    return []
                r2 = requests.get(
                    f"{config.PORTAL_BASE}/api/3/action/organization_show",
                    params={"id": slug, "include_users": True},
                    headers=auth_headers,
                    timeout=12,
                )
                d = r2.json()
                if d.get("success"):
                    return [
                        {
                            "org_name":     slug,
                            "org_title":    title,
                            "username":     u.get("name", ""),
                            "display_name": (u.get("display_name") or u.get("fullname") or u.get("name", "")).strip(),
                            "capacity":     u.get("capacity", "member"),
                            "email":        "",   # filled in by user_show below
                            "state":        u.get("state", "active"),
                        }
                        for u in (d["result"].get("users") or [])
                    ]
            except Exception:
                pass
            return []

        all_members: list = []
        with ThreadPoolExecutor(max_workers=20) as pool:
            futs = {pool.submit(_fetch_org_members, org): org for org in org_list}
            for fut in as_completed(futs):
                try:
                    all_members.extend(fut.result())
                except Exception:
                    pass

        # Step 3 – fetch emails via user_show for every unique username in parallel.
        # organization_show never returns emails; user_show requires the sysadmin token.
        if config.TOKEN and all_members:
            unique_usernames = list({m["username"] for m in all_members if m["username"]})

            def _user_show_email(username):
                try:
                    resp = requests.get(
                        f"{config.PORTAL_BASE}/api/3/action/user_show",
                        params={"id": username},
                        headers=auth_headers,
                        timeout=8,
                    )
                    if resp.status_code == 200:
                        ud = resp.json()
                        if ud.get("success"):
                            return username, (ud["result"].get("email") or "").lower().strip()
                except Exception:
                    pass
                return username, ""

            email_map: dict = {}
            with ThreadPoolExecutor(max_workers=20) as pool:
                futs2 = {pool.submit(_user_show_email, u): u for u in unique_usernames}
                for fut in as_completed(futs2):
                    try:
                        uname, email = fut.result()
                        email_map[uname] = email
                    except Exception:
                        pass

            for m in all_members:
                m["email"] = email_map.get(m["username"], "")

        payload = {"members": all_members, "total": len(all_members)}
        _pm_cache["data"] = payload
        _pm_cache["ts"]   = now
        return jsonify(payload)

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


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
                    merged[key]["nb_events"] = 0
                merged[key]["nb_visits"]        += item.get("nb_visits", 0) or 0
                merged[key]["nb_uniq_visitors"] += item.get("nb_uniq_visitors", 0) or 0
                merged[key]["nb_events"]        += item.get("nb_events", 0) or 0
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
            if not label or "dataset" not in label.lower():
                continue
            # flat=1 uses ' > ' as path separator; reconstruct the URL path
            path = "/" + "/".join(p.strip().lstrip("/") for p in label.split(" > "))
            m = re.search(r"/dataset/([^/?#\s]+)", path, re.IGNORECASE)
            if not m:
                continue
            slug = m.group(1)
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


@app.route("/api/matomo/top-downloads")
def matomo_top_downloads():
    if not config.MATOMO_TOKEN:
        return jsonify({"error": "MATOMO_TOKEN not configured"}), 503
    limit = min(int(freq.args.get("limit", 20)), 100)
    days  = min(int(freq.args.get("days", 30)), 365)
    try:
        start, end = _matomo_date_range(days)
        items = _matomo_get("Actions.getDownloads", {
            "period": "range",
            "date": f"{start},{end}",
            "flat": 1,
            "filter_limit": limit * 2,
        })
        if not isinstance(items, list):
            items = []
        result = []
        for item in items:
            label = item.get("label", "")
            if not label or " - " in label:   # skip empty / Matomo aggregation rows ("Άλλα" etc.)
                continue
            url = label if label.startswith("http") else f"https://{label}"
            visits = item.get("nb_visits", 0) or item.get("nb_hits", 0)
            result.append({"url": url, "visits": visits})
        result.sort(key=lambda x: x["visits"], reverse=True)
        return jsonify(result[:limit])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 503


@app.route("/api/matomo/top-api-calls")
def matomo_top_api_calls():
    """CKAN API calls tracked as Matomo events (category=API, action=ckan_action_name)."""
    if not config.MATOMO_TOKEN:
        return jsonify({"error": "MATOMO_TOKEN not configured"}), 503
    limit = min(int(freq.args.get("limit", 20)), 100)
    days  = min(int(freq.args.get("days", 30)), 365)
    try:
        # Total from the "API" event category
        cats = _matomo_flat_pages("Events.getCategory", days, {"filter_limit": 50})
        api_total = next(
            (c.get("nb_events", 0) or c.get("nb_visits", 0) for c in cats if c.get("label") == "API"),
            0,
        )

        # Per-action breakdown — CKAN actions are always lowercase_with_underscores;
        # filter out non-API event actions (e.g. "Open", "ClickStatTile") that leak in
        _ckan_action = re.compile(r'^[a-z][a-z0-9_]+$')
        actions = _matomo_flat_pages("Events.getAction", days, {"filter_limit": limit * 2})
        result = [
            {
                "path":   a.get("label", ""),
                "visits": a.get("nb_events", 0) or a.get("nb_visits", 0),
            }
            for a in actions
            if a.get("label") and _ckan_action.match(a.get("label", ""))
        ]
        result.sort(key=lambda x: x["visits"], reverse=True)
        return jsonify({"total": api_total, "endpoints": result[:limit]})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 503


@app.route("/api/matomo/today")
def matomo_today():
    if not config.MATOMO_TOKEN:
        return jsonify({"error": "MATOMO_TOKEN not configured"}), 503
    try:
        data = _matomo_get("VisitsSummary.get", {"period": "day", "date": "today"})
        visits    = data.get("nb_visits", 0) or 0
        pageviews = data.get("nb_pageviews") or data.get("nb_actions") or 0
        uniq      = data.get("nb_uniq_visitors", 0) or 0
        downloads = data.get("nb_downloads", 0) or 0
        if not downloads:
            try:
                dl = _matomo_get("Actions.getDownloads", {
                    "period": "day", "date": "today", "filter_limit": 500,
                })
                if isinstance(dl, list):
                    downloads = sum(item.get("nb_visits", 0) or 0 for item in dl)
            except Exception:
                pass
        return jsonify({
            "visits":          visits,
            "unique_visitors": uniq,
            "pageviews":       pageviews,
            "downloads":       downloads,
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 503


@app.route("/api/matomo/debug-pages")
def matomo_debug_pages():
    """Return top 30 raw page labels from Matomo — for diagnosing missing data."""
    if not config.MATOMO_TOKEN:
        return jsonify({"error": "MATOMO_TOKEN not configured"}), 503
    days = min(int(freq.args.get("days", 30)), 365)
    try:
        pages = _matomo_flat_pages("Actions.getPageUrls", days,
                                   {"flat": 1, "filter_limit": 500})
        sample = [{"label": p.get("label", ""), "visits": p.get("nb_visits", 0)}
                  for p in pages[:30]]
        return jsonify({"total_returned": len(pages), "sample": sample})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 503


@app.route("/api/admin/reset", methods=["GET", "POST"])
def admin_reset():
    if config.DASHBOARD_PASSWORD:
        body = _decode_payload()
        if _pw_hash(body.get("password", "")) != _pw_hash(config.DASHBOARD_PASSWORD):
            return jsonify({"error": "Incorrect password"}), 403
    db.session.query(HealthCheck).delete()
    db.session.query(PortalSnapshot).delete()
    db.session.commit()
    threading.Thread(target=run_health_checks, daemon=True).start()
    return jsonify({"ok": True, "message": "All data cleared, fresh check started"})


if __name__ == "__main__":
    app.run(debug=True, use_reloader=True)
