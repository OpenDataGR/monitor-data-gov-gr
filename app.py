import os
import sys
import re
import json
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")
import time
import threading
import requests
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
import io
import secrets
from urllib.parse import urlparse
from flask import Flask, render_template, jsonify, request as freq, session, redirect, url_for, send_file, Response
from flask_compress import Compress
from flask_wtf import CSRFProtect
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import generate_password_hash, check_password_hash
from models import db, HealthCheck, PortalSnapshot, Communication, Case, OrgContact, DatasetGrowthCache, OrgsCache, GeoDatasetsCache, HvdCheckCache, HvdCheckStatus, HvdDatasetCheckCache, DcatApCheckCache, DcatApCheckStatus, DcatApDatasetCheckCache, GeoDcatCheckCache, GeoDcatCheckStatus, GeoDcatDatasetCheckCache, MqaCache, User, PasswordResetToken, WebAuthnCredential, MassEmailLog
import rdflib
import pyshacl
import config
from webauthn import (
    generate_registration_options, verify_registration_response,
    generate_authentication_options, verify_authentication_response,
    base64url_to_bytes,
)
from webauthn.helpers import bytes_to_base64url, options_to_json_dict
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria, ResidentKeyRequirement,
    UserVerificationRequirement, PublicKeyCredentialDescriptor,
)

app = Flask(__name__)


@app.context_processor
def _inject_current_year():
    return {"current_year": datetime.now(timezone.utc).year}
_db_url = config.DATABASE_URL or f"sqlite:///{Path(__file__).parent / 'instance' / 'dashboard.db'}"
if _db_url.startswith("postgres://"):  # normalize legacy Heroku-style prefix
    _db_url = _db_url.replace("postgres://", "postgresql://", 1)
app.config["SQLALCHEMY_DATABASE_URI"] = _db_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=14)  # absolute cap; see also the idle timeout in require_login
if not config.FLASK_SECRET_KEY:
    # Falling back silently would mean a misconfigured production deploy
    # signs sessions with a key that's sitting in plain sight in this file --
    # anyone could forge session["is_admin"] = True. This also gates
    # SESSION_COOKIE_SECURE/SESSION_COOKIE_SAMESITE below, so a missing key
    # quietly weakens several things at once. Warn loudly (stderr -> gunicorn
    # -> journalctl) rather than fail the process, since local dev relies on
    # this fallback and has no env file at all.
    print("WARNING: FLASK_SECRET_KEY is not set -- falling back to an insecure, "
          "hardcoded dev key. This must never happen in production.", file=sys.stderr)
app.secret_key = config.FLASK_SECRET_KEY or "insecure-dev-secret-key-change-me"
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

# Static assets are cache-busted with ?v={{ build_date }} in templates, so a
# year-long cache is safe -- a new deploy changes the URL, not the response.
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 31536000
# Gzip everything (HTML/JSON/JS/CSS) -- app.js alone is ~370KB unminified and
# the contacts/communications/organizations endpoints return large JSON arrays.
app.config["COMPRESS_MIMETYPES"] = [
    "text/html", "text/css", "text/javascript", "application/javascript",
    "application/json",
]
Compress(app)

# CSRF tokens are tied to the session and don't need their own separate
# expiry -- PERMANENT_SESSION_LIFETIME (14 days) already governs how long a
# session (and the token in it) stays valid. Without this, Flask-WTF's own
# default (1 hour) would 400 a perfectly normal session that's just been
# open in a browser tab for a while.
app.config["WTF_CSRF_TIME_LIMIT"] = None
csrf = CSRFProtect(app)

# Production-only cookie hardening, gated on a real FLASK_SECRET_KEY being set
# (local dev never sets one, so this leaves local behavior untouched). Flask
# has no idea we're mounted at a subpath, so without this the session cookie
# defaults to Path=/ -- the whole shared experiments.data.gov.gr domain -- and
# gets sent to (and mixes with cookie bloat from) every other app on that
# domain. A request whose combined Cookie header grows past a proxy's size
# limit can come back as a 403 before it ever reaches this app, even on a
# plain GET /login; clearing cookies "fixes" it only because it wipes the
# oversized cookie along with everything else. Scoping our own cookie to the
# actual mount path at least stops us contributing to that.
if config.FLASK_SECRET_KEY:
    app.config["SESSION_COOKIE_PATH"] = urlparse(config.PUBLIC_BASE_URL).path or "/"
    app.config["SESSION_COOKIE_SECURE"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

# In-memory storage: limits are per gunicorn worker process, not shared across
# workers. With N workers the effective ceiling is roughly N x the configured
# limit — still a meaningful backstop against scripted abuse, just not exact.
limiter = Limiter(key_func=get_remote_address, app=app, default_limits=["200 per minute"])

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
    if 'medium' not in _comm_cols:
        db.session.execute(text('ALTER TABLE communications ADD COLUMN medium VARCHAR(50)'))
        db.session.commit()
    if 'case_id' not in _comm_cols:
        db.session.execute(text('ALTER TABLE communications ADD COLUMN case_id INTEGER'))
        db.session.commit()
        # Backfill: every pre-existing communication becomes its own case
        for _c in Communication.query.filter(Communication.case_id.is_(None)).all():
            _case = Case(
                org_name=_c.org_name,
                org_title=_c.org_title,
                subject=_c.subject,
                status="Closed" if _c.status == "Uploaded" else "Open",
                opened_at=_c.created_at,
                closed_at=_c.created_at if _c.status == "Uploaded" else None,
                created_at=_c.created_at,
            )
            db.session.add(_case)
            db.session.flush()
            _c.case_id = _case.id
        db.session.commit()
    _case_cols = [c['name'] for c in _insp.get_columns('cases')]
    if 'deadline' not in _case_cols:
        db.session.execute(text('ALTER TABLE cases ADD COLUMN deadline VARCHAR(10)'))
        db.session.commit()
    # Cleanup: a case whose last communication was deleted used to linger forever
    # with zero entries, still counted in the Communications tab's Total/Open/
    # Closed/stale summaries (communications_delete() now deletes the case itself
    # once it goes to zero entries, but this sweeps up any that already went
    # orphaned before that fix). Safe to run on every startup -- matches nothing
    # once existing orphans are gone.
    db.session.execute(text(
        "DELETE FROM cases WHERE id NOT IN (SELECT DISTINCT case_id FROM communications WHERE case_id IS NOT NULL)"
    ))
    db.session.commit()
    _contact_cols = [c['name'] for c in _insp.get_columns('org_contacts')]
    if 'contact_type' not in _contact_cols:
        db.session.execute(text('ALTER TABLE org_contacts ADD COLUMN contact_type VARCHAR(200)'))
        db.session.commit()
    if 'mobile' not in _contact_cols:
        db.session.execute(text('ALTER TABLE org_contacts ADD COLUMN mobile VARCHAR(50)'))
        db.session.commit()
    if 'org_codes' not in _contact_cols:
        db.session.execute(text('ALTER TABLE org_contacts ADD COLUMN org_codes TEXT'))
        db.session.commit()
    if 'created_at' not in _contact_cols:
        db.session.execute(text('ALTER TABLE org_contacts ADD COLUMN created_at TIMESTAMP'))
        db.session.commit()
    # Renamed contact-type value: "Data Officer" -> "Data Governance Officer".
    # Safe to run on every startup — after the first run no row contains the
    # old substring anymore, so the WHERE clause matches nothing.
    db.session.execute(text(
        "UPDATE org_contacts SET contact_type = REPLACE(contact_type, 'Data Officer', 'Data Governance Officer') "
        "WHERE contact_type LIKE '%Data Officer%'"
    ))
    db.session.commit()
    # Renamed contact-type values: "Portal Administrator/Editor/User" -> "Org Administrator/Editor/Member".
    # Same idempotent pattern as above.
    for _old, _new in (
        ("Portal Administrator", "Org Administrator"),
        ("Portal Editor", "Org Editor"),
        ("Portal User", "Org Member"),
    ):
        db.session.execute(text(
            f"UPDATE org_contacts SET contact_type = REPLACE(contact_type, '{_old}', '{_new}') "
            f"WHERE contact_type LIKE '%{_old}%'"
        ))
        db.session.commit()
    if db.engine.dialect.name == 'postgresql':
        try:
            db.session.execute(text('ALTER TABLE org_contacts ALTER COLUMN position TYPE TEXT'))
            db.session.commit()
        except Exception:
            db.session.rollback()
    _user_cols = [c['name'] for c in _insp.get_columns('users')]
    if 'allowed_tabs' not in _user_cols:
        db.session.execute(text('ALTER TABLE users ADD COLUMN allowed_tabs TEXT'))
        db.session.commit()
    if 'last_active_at' not in _user_cols:
        db.session.execute(text('ALTER TABLE users ADD COLUMN last_active_at TIMESTAMP'))
        db.session.commit()
    if 'is_superadmin' not in _user_cols:
        db.session.execute(text('ALTER TABLE users ADD COLUMN is_superadmin BOOLEAN NOT NULL DEFAULT FALSE'))
        db.session.commit()


# ── Auth ──────────────────────────────────────────────────────────────────────

PASSWORD_LINK_VALID_HOURS = 24
_PUBLIC_PATHS = ("/login", "/logout", "/forgot-password", "/set-password", "/robots.txt",
                  "/webauthn/login/begin", "/webauthn/login/complete")

# Dashboard sidebar tabs, in the order they appear. "overview" is the landing
# tab and is always included so a restricted user is never left with nothing.
ALL_TABS = ["overview", "comms", "contacts", "orgs", "health", "traffic", "datasets", "stats", "quality"]


# API path prefixes -> the sidebar tab(s) whose UI legitimately calls them,
# used to enforce allowed_tabs server-side (it used to be UI-only: a
# restricted user's sidebar hid a tab, but nothing stopped them calling its
# API routes directly). Order matters -- more specific prefixes must come
# before broader ones they'd otherwise be shadowed by. A handful of routes
# are genuinely called from more than one tab's UI (shared widgets/detail
# panels); access is granted if the user has ANY of the listed tabs, not
# all of them. Anything not matched here (account/admin/auth routes, static
# files, etc.) has no tab restriction -- being logged in is enough, same as
# before this existed.
_TAB_ROUTE_RULES = [
    ("/api/contacts/summary",      ("orgs", "contacts")),
    ("/api/communications",        ("comms",)),
    ("/api/cases",                 ("comms",)),
    ("/api/contacts",              ("contacts",)),
    ("/api/portal-members",        ("contacts",)),
    ("/api/portal-user/",          ("contacts",)),
    # HRMS public-sector org list -- the canonical org picker/autocomplete
    # data source for creating a communication, adding a contact, AND the
    # Organizations tab's own "All Public Sector" view. Not orgs-exclusive.
    ("/api/public-orgs",           ("orgs", "comms", "contacts")),
    # Catalog org filter dropdown also reads this, not just the Organizations tab.
    ("/api/organizations",         ("orgs", "datasets")),
    # loadOverview() -- runs for every user regardless of restriction, since
    # "overview" is always allowed -- also calls health/summary and
    # stats/latest+live for its own summary cards, not just the dedicated
    # Health/Insights tabs. Those three need "overview" too, or a restricted
    # user's own Overview tab breaks.
    ("/api/health/summary",        ("overview", "health")),
    ("/api/health/",               ("health",)),
    ("/api/stats/latest",          ("overview",)),
    ("/api/stats/live",            ("overview",)),
    ("/api/datasets/geo-locations", ("stats",)),
    ("/api/datasets/formats",      ("datasets", "stats")),
    ("/api/datasets/search",       ("datasets", "orgs")),
    ("/api/datasets/",             ("datasets", "orgs", "quality")),  # dataset detail panel
    ("/api/matomo/live",           ("overview",)),
    ("/api/matomo/today",          ("overview",)),
    ("/api/matomo/",               ("traffic",)),
    ("/api/stats/",                ("stats",)),
    ("/api/quality/",              ("quality",)),
]


def _tab_route_check(path, allowed_tabs):
    """None (unrestricted) always passes. Otherwise, find the first matching
    prefix rule and require the user to have at least one of its tabs; a path
    matching no rule is unrestricted (account/admin/auth routes etc.)."""
    if allowed_tabs is None:
        return True
    for prefix, tabs in _TAB_ROUTE_RULES:
        if path.startswith(prefix):
            return any(t in allowed_tabs for t in tabs)
    return True


def _parse_allowed_tabs(raw):
    tabs = [t for t in (raw or "").split(",") if t in ALL_TABS]
    if "overview" not in tabs:
        tabs.insert(0, "overview")
    return tabs


def _effective_allowed_tabs(user: "User"):
    """None means unrestricted (sees every tab) — true for admins and for any
    user who hasn't been given an explicit allow-list."""
    if not user or user.is_admin or not user.allowed_tabs:
        return None
    return _parse_allowed_tabs(user.allowed_tabs)


def _session_allowed_tabs():
    """Same as _effective_allowed_tabs(), but reads is_admin/allowed_tabs from
    the session cache (set at login) instead of hitting the DB on every single
    request -- require_login() calls this on every path. Like is_admin, this
    goes stale if an admin changes the user's tabs mid-session; refreshes on
    next login, same tradeoff the rest of the session cache already makes."""
    if session.get("is_admin") or not session.get("allowed_tabs"):
        return None
    return _parse_allowed_tabs(session["allowed_tabs"])


def _send_password_link(user: "User", kind: str = "invite") -> str:
    """Create a fresh single-use token and email the user a set-password link.
    Returns the link too, so callers (e.g. the invite UI) can show/copy it as a
    fallback if the email doesn't arrive."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    token = secrets.token_urlsafe(32)
    db.session.add(PasswordResetToken(
        user_id=user.id, token=token,
        expires_at=now + timedelta(hours=PASSWORD_LINK_VALID_HOURS),
    ))
    db.session.commit()
    link = url_for("set_password", token=token, _external=True)
    if kind == "invite":
        subject = "You've been invited to data.gov.gr Monitor"
        html = (f"<p>You've been invited to the data.gov.gr Monitor dashboard.</p>"
                f"<p><a href=\"{link}\">Click here to set your password</a> "
                f"(link valid for {PASSWORD_LINK_VALID_HOURS} hours).</p>")
    else:
        subject = "Reset your data.gov.gr Monitor password"
        html = (f"<p>Click the link below to reset your password "
                f"(valid for {PASSWORD_LINK_VALID_HOURS} hours):</p>"
                f"<p><a href=\"{link}\">{link}</a></p>"
                f"<p>If you didn't request this, you can ignore this email.</p>")
    try:
        send_email(user.email, subject, html)
    except Exception as exc:
        print(f"[auth] failed to send {kind} email to {user.email}: {exc}")
    return link


def _require_admin():
    if not session.get("is_admin"):
        return jsonify({"error": "Admin access required"}), 403
    return None


def _require_superadmin():
    if not session.get("is_superadmin"):
        return jsonify({"error": "Superadmin access required"}), 403
    return None


def _user_dict_for_viewer(user):
    """Status/last-login/last-active are only meaningful to someone auditing
    the whole user base -- restrict them to superadmins so a plain admin
    can't see when their peers last signed in."""
    d = user.to_dict()
    if not session.get("is_superadmin"):
        d.pop("has_password", None)
        d.pop("has_passkey", None)
        d.pop("last_login_at", None)
        d.pop("last_active_at", None)
    return d


@app.after_request
def _purge_legacy_root_cookie(response):
    # Before the SESSION_COOKIE_PATH fix above, our session cookie was set at
    # Path=/ on the shared experiments.data.gov.gr domain. Changing the config
    # only affects cookies set from here on -- browsers that already had the
    # old Path=/ cookie keep sending it (same name, different path, so it
    # doesn't get overwritten) on top of the new properly-scoped one, still
    # contributing to the oversized combined Cookie header that trips a 403
    # at the proxy. Actively expire the old one so it stops accumulating.
    if config.FLASK_SECRET_KEY and app.config.get("SESSION_COOKIE_PATH", "/") != "/":
        response.set_cookie(
            app.config["SESSION_COOKIE_NAME"], "", expires=0, path="/",
            secure=True, httponly=True, samesite="Lax",
        )
    return response


@app.after_request
def no_cache(response):
    # Prevent caching of dynamic content -- HTML pages and JSON API responses.
    # Without this, a GET with no explicit cache header is fair game for a
    # browser's (or an intermediate proxy's) own heuristic caching, which is
    # how some users kept seeing stale communications/cases even after a
    # background refresh actually ran: the fetch never left the cache to hit
    # the network. Static assets (CSS/JS) are deliberately left alone so they
    # stay cacheable.
    ct = response.content_type or ""
    if ct.startswith("text/html") or ct.startswith("application/json"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    # This dashboard has no business being in search results — tell every crawler
    # that respects the header to stay out, regardless of how it found a URL.
    response.headers["X-Robots-Tag"] = "noindex, nofollow, noarchive"
    # Defense-in-depth headers -- cheap, no functional cost.
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    # Same signal the cookie hardening above uses for "this is the production
    # deploy" (config.FLASK_SECRET_KEY is only ever unset locally) -- HSTS is
    # meaningless (and browsers ignore it) over plain HTTP local dev anyway,
    # but there's no reason to send it there. No includeSubDomains: this is a
    # subpath on a shared domain (experiments.data.gov.gr), not our own host.
    if config.FLASK_SECRET_KEY:
        response.headers["Strict-Transport-Security"] = "max-age=31536000"
    return response


@app.route("/robots.txt")
def robots_txt():
    return Response("User-agent: *\nDisallow: /\n", mimetype="text/plain")


LAST_ACTIVE_THROTTLE_MINUTES = 5


def _touch_last_active(user_id):
    """Bump User.last_active_at, but at most once per throttle window per
    session — stashing the last write time in the (signed, client-side)
    session cookie means the throttle check itself never costs a DB read."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    last_write = session.get("_last_active_write")
    if last_write:
        try:
            if (now - datetime.fromisoformat(last_write)).total_seconds() < LAST_ACTIVE_THROTTLE_MINUTES * 60:
                return
        except ValueError:
            pass
    User.query.filter_by(id=user_id).update({"last_active_at": now})
    db.session.commit()
    session["_last_active_write"] = now.isoformat()


IDLE_TIMEOUT_MINUTES = 60


def _session_idle_seconds():
    """Seconds since this session's last request, from a per-request session
    marker (cheap — no DB) separate from the throttled last_active_at write."""
    last_seen = session.get("_last_seen")
    if not last_seen:
        return 0
    try:
        return (datetime.now(timezone.utc).replace(tzinfo=None) - datetime.fromisoformat(last_seen)).total_seconds()
    except ValueError:
        return 0


@app.before_request
def require_login():
    if freq.path in _PUBLIC_PATHS or freq.path.startswith("/static/"):
        return
    user_id = session.get("user_id")
    if user_id:
        if _session_idle_seconds() > IDLE_TIMEOUT_MINUTES * 60:
            session.clear()
            if freq.path.startswith("/api/"):
                return jsonify({"error": "Session expired"}), 401
            return redirect(url_for("login", next=freq.script_root + freq.path))
        session["_last_seen"] = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
        _touch_last_active(user_id)
        if not _tab_route_check(freq.path, _session_allowed_tabs()):
            return jsonify({"error": "Forbidden"}), 403
        return
    if freq.path.startswith("/api/"):
        return jsonify({"error": "Unauthorized"}), 401
    return redirect(url_for("login", next=freq.script_root + freq.path))


@app.route("/login", methods=["GET", "POST"])
@limiter.limit("10 per minute")
def login():
    if session.get("user_id"):
        return redirect(url_for("index"))
    error = None
    if freq.method == "POST":
        if (freq.form.get("hp_check") or "").strip():
            # Honeypot field only a bot would fill in — reject without touching the DB
            return render_template("login.html", error="Incorrect email or password.",
                                    next=freq.args.get("next", ""))
        email = (freq.form.get("email") or "").strip().lower()
        pw    = freq.form.get("password", "")
        user  = User.query.filter_by(email=email).first()
        if user and user.password_hash and check_password_hash(user.password_hash, pw):
            session.permanent      = True
            session["user_id"]    = user.id
            session["user_name"]  = user.name or user.email
            session["user_email"] = user.email
            session["is_admin"]   = user.is_admin
            session["is_superadmin"] = user.is_superadmin
            session["allowed_tabs"] = user.allowed_tabs
            user.last_login_at = datetime.now(timezone.utc).replace(tzinfo=None)
            db.session.commit()
            return redirect(freq.form.get("next") or url_for("index"))
        error = "Incorrect email or password."
    return render_template("login.html", error=error, next=freq.args.get("next", ""))


def _webauthn_rp_id_and_origin():
    """RP ID/origin derived live from the request rather than fixed config --
    this makes both localhost dev and the prod subpath deployment work
    automatically. RP ID is host-only (no port); origin keeps the port when
    present, since that's what the browser puts in clientDataJSON.

    Scheme is NOT taken from freq.scheme/X-Forwarded-Proto: in production the
    reverse proxy forwards X-Forwarded-Host but not X-Forwarded-Proto, so
    ProxyFix falls back to plain http even though the real request was https,
    which breaks WebAuthn's origin check. This app only ever runs as plain
    HTTP in local dev (localhost/127.0.0.1) and as HTTPS everywhere else, so
    that's a safe, self-contained way to get the scheme right regardless of
    what the proxy does or doesn't forward."""
    host = freq.host.split(":")[0]
    scheme = "http" if host in ("localhost", "127.0.0.1") else "https"
    origin = f"{scheme}://{freq.host}"
    return host, origin


@app.route("/webauthn/login/begin", methods=["POST"])
@limiter.limit("10 per minute")
def webauthn_login_begin():
    rp_id, _ = _webauthn_rp_id_and_origin()
    options = generate_authentication_options(rp_id=rp_id)  # allow_credentials omitted -> discoverable/usernameless
    session["webauthn_auth_challenge"] = options.challenge
    return jsonify(options_to_json_dict(options))


@app.route("/webauthn/login/complete", methods=["POST"])
@limiter.limit("10 per minute")
def webauthn_login_complete():
    challenge = session.pop("webauthn_auth_challenge", None)
    if not challenge:
        return jsonify({"error": "Login session expired, please try again"}), 400
    body = freq.get_json(force=True, silent=True) or {}
    raw_credential = body.get("credential") or {}
    cred_row = WebAuthnCredential.query.filter_by(credential_id=raw_credential.get("id", "")).first()
    if not cred_row:
        return jsonify({"error": "Passkey not recognized"}), 400
    rp_id, origin = _webauthn_rp_id_and_origin()
    try:
        verification = verify_authentication_response(
            credential=raw_credential,
            expected_challenge=challenge,
            expected_rp_id=rp_id,
            expected_origin=origin,
            credential_public_key=cred_row.public_key,
            credential_current_sign_count=cred_row.sign_count,
        )
    except Exception as exc:
        return jsonify({"error": f"Could not verify passkey: {exc}"}), 400

    user = User.query.get(cred_row.user_id)
    if not user:
        return jsonify({"error": "Account no longer exists"}), 400

    cred_row.sign_count = verification.new_sign_count
    cred_row.last_used_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.permanent      = True
    session["user_id"]    = user.id
    session["user_name"]  = user.name or user.email
    session["user_email"] = user.email
    session["is_admin"]   = user.is_admin
    session["is_superadmin"] = user.is_superadmin
    session["allowed_tabs"] = user.allowed_tabs
    user.last_login_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.session.commit()
    return jsonify({"ok": True, "redirect": freq.args.get("next") or url_for("index")})


@app.route("/forgot-password", methods=["GET", "POST"])
@limiter.limit("5 per hour")
def forgot_password():
    sent = False
    if freq.method == "POST":
        email = (freq.form.get("email") or "").strip().lower()
        user = User.query.filter_by(email=email).first()
        if user:
            _send_password_link(user, kind="reset")
        sent = True  # always show the same message so we don't leak which emails exist
    return render_template("forgot_password.html", sent=sent)


@app.route("/set-password", methods=["GET", "POST"])
@limiter.limit("20 per hour")
def set_password():
    token_str = freq.values.get("token", "")
    token = PasswordResetToken.query.filter_by(token=token_str).first()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    valid = bool(token and not token.used_at and token.expires_at > now)
    error = None
    if freq.method == "POST":
        if not valid:
            error = "This link is invalid or has expired."
        else:
            pw1 = freq.form.get("password", "")
            pw2 = freq.form.get("password2", "")
            if len(pw1) < 8:
                error = "Password must be at least 8 characters."
            elif pw1 != pw2:
                error = "Passwords do not match."
            else:
                user = token.user
                user.password_hash = generate_password_hash(pw1)
                user.last_login_at = now
                token.used_at = now
                db.session.commit()
                session.permanent      = True
                session["user_id"]    = user.id
                session["user_name"]  = user.name or user.email
                session["user_email"] = user.email
                session["is_admin"]   = user.is_admin
                session["is_superadmin"] = user.is_superadmin
                session["allowed_tabs"] = user.allowed_tabs
                return redirect(url_for("index"))
    return render_template("set_password.html", valid=valid, error=error, token=token_str)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/admin/users")
def admin_users_page():
    if not session.get("is_admin"):
        return redirect(url_for("index"))
    return render_template("admin_users.html", current_user_id=session.get("user_id"),
                           current_user_is_superadmin=session.get("is_superadmin", False))


@app.route("/api/users", methods=["GET", "POST"])
@limiter.limit("20 per hour", methods=["POST"])
def users_collection():
    err = _require_admin()
    if err:
        return err
    if freq.method == "POST":
        body = _decode_payload()
        email = (body.get("email") or "").strip().lower()
        name  = (body.get("name") or "").strip()
        if not email or "@" not in email:
            return jsonify({"error": "A valid email is required"}), 400
        user = User.query.filter_by(email=email).first()
        if not user:
            user = User(email=email, name=name or None, is_admin=bool(body.get("is_admin")))
            db.session.add(user)
            db.session.commit()
        elif name and not user.name:
            user.name = name
            db.session.commit()
        link = _send_password_link(user, kind="invite")
        return jsonify({"ok": True, "user": _user_dict_for_viewer(user), "invite_link": link}), 201
    return jsonify([_user_dict_for_viewer(u) for u in User.query.order_by(User.created_at).all()])


@app.route("/api/users/<int:user_id>/resend-invite", methods=["POST"])
@limiter.limit("20 per hour")
def users_resend_invite(user_id):
    err = _require_admin()
    if err:
        return err
    user = User.query.get_or_404(user_id)
    link = _send_password_link(user, kind="invite" if not user.password_hash else "reset")
    return jsonify({"ok": True, "invite_link": link})


@app.route("/api/users/<int:user_id>/toggle-admin", methods=["POST"])
def users_toggle_admin(user_id):
    err = _require_superadmin()
    if err:
        return err
    if user_id == session.get("user_id"):
        return jsonify({"error": "You cannot change your own admin status"}), 400
    user = User.query.get_or_404(user_id)
    if user.is_superadmin:
        return jsonify({"error": "Superadmin status can only be changed by editing the database directly"}), 400
    user.is_admin = not user.is_admin
    db.session.commit()
    return jsonify({"ok": True, "user": _user_dict_for_viewer(user)})


@app.route("/api/users/<int:user_id>/tabs", methods=["POST"])
def users_set_tabs(user_id):
    err = _require_admin()
    if err:
        return err
    user = User.query.get_or_404(user_id)
    body = _decode_payload()
    if not body.get("restricted"):
        user.allowed_tabs = None  # unrestricted — an empty tab list still means "restricted to Overview only"
    else:
        tabs = body.get("tabs") or []
        cleaned = [t for t in tabs if t in ALL_TABS and t != "overview"]
        user.allowed_tabs = ",".join(cleaned) if cleaned else "overview"
    db.session.commit()
    return jsonify({"ok": True, "user": _user_dict_for_viewer(user)})


@app.route("/api/users/<int:user_id>/delete", methods=["POST"])
def users_delete(user_id):
    err = _require_superadmin()
    if err:
        return err
    if user_id == session.get("user_id"):
        return jsonify({"error": "You cannot delete your own account"}), 400
    user = User.query.get_or_404(user_id)
    if user.is_superadmin:
        return jsonify({"error": "Superadmin accounts cannot be deleted"}), 400
    db.session.delete(user)
    db.session.commit()
    return jsonify({"ok": True})


@app.route("/api/account/change-password", methods=["POST"])
@limiter.limit("10 per hour")
def change_password():
    user = User.query.get(session.get("user_id"))
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    body = _decode_payload()
    current  = body.get("current_password", "")
    new_pw   = body.get("new_password", "")
    new_pw2  = body.get("new_password2", "")
    if not user.password_hash or not check_password_hash(user.password_hash, current):
        return jsonify({"error": "Current password is incorrect"}), 403
    if len(new_pw) < 8:
        return jsonify({"error": "New password must be at least 8 characters"}), 400
    if new_pw != new_pw2:
        return jsonify({"error": "New passwords do not match"}), 400
    user.password_hash = generate_password_hash(new_pw)
    db.session.commit()
    return jsonify({"ok": True})


@app.route("/api/account/update-name", methods=["POST"])
def update_name():
    user = User.query.get(session.get("user_id"))
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    body = _decode_payload()
    name = (body.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Name is required"}), 400
    user.name = name
    db.session.commit()
    session["user_name"] = user.name
    return jsonify({"ok": True, "name": user.name})


@app.route("/api/account/passkeys", methods=["GET"])
def passkeys_list():
    user = User.query.get(session.get("user_id"))
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    creds = WebAuthnCredential.query.filter_by(user_id=user.id).order_by(WebAuthnCredential.created_at).all()
    return jsonify([c.to_dict() for c in creds])


@app.route("/api/account/passkeys/register/begin", methods=["POST"])
def passkeys_register_begin():
    user = User.query.get(session.get("user_id"))
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    rp_id, _ = _webauthn_rp_id_and_origin()
    existing = WebAuthnCredential.query.filter_by(user_id=user.id).all()
    options = generate_registration_options(
        rp_id=rp_id,
        rp_name="data.gov.gr Monitor",
        user_id=str(user.id).encode("utf-8"),
        user_name=user.email,
        user_display_name=user.name or user.email,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
        exclude_credentials=[
            PublicKeyCredentialDescriptor(id=base64url_to_bytes(c.credential_id))
            for c in existing
        ],
    )
    session["webauthn_reg_challenge"] = options.challenge
    return jsonify(options_to_json_dict(options))


@app.route("/api/account/passkeys/register/complete", methods=["POST"])
def passkeys_register_complete():
    user = User.query.get(session.get("user_id"))
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    challenge = session.pop("webauthn_reg_challenge", None)
    if not challenge:
        return jsonify({"error": "Registration session expired, please try again"}), 400
    body = _decode_payload()
    nickname = (body.get("nickname") or "").strip()[:100] or "Passkey"
    credential = body.get("credential") or {}
    rp_id, origin = _webauthn_rp_id_and_origin()
    try:
        verification = verify_registration_response(
            credential=credential,
            expected_challenge=challenge,
            expected_rp_id=rp_id,
            expected_origin=origin,
        )
    except Exception as exc:
        return jsonify({"error": f"Could not verify passkey: {exc}"}), 400
    cred = WebAuthnCredential(
        user_id=user.id,
        credential_id=bytes_to_base64url(verification.credential_id),
        public_key=verification.credential_public_key,
        sign_count=verification.sign_count,
        transports=",".join(credential.get("response", {}).get("transports") or []) or None,
        nickname=nickname,
    )
    db.session.add(cred)
    db.session.commit()
    return jsonify({"ok": True, "passkey": cred.to_dict()})


@app.route("/api/account/passkeys/<int:cred_id>/delete", methods=["POST"])
def passkeys_delete(cred_id):
    user = User.query.get(session.get("user_id"))
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    cred = WebAuthnCredential.query.filter_by(id=cred_id, user_id=user.id).first()
    if not cred:
        return jsonify({"error": "Not found"}), 404
    db.session.delete(cred)
    db.session.commit()
    return jsonify({"ok": True})


# ── Helpers ───────────────────────────────────────────────────────────────────

def _api_headers():
    h = {"User-Agent": "DataGovGR-Dashboard/1.0"}
    if config.TOKEN:
        h["Authorization"] = config.TOKEN  # CKAN uses the key directly, no prefix
    return h


def send_email(to: str, subject: str, html: str, text: str = None) -> None:
    """Send an email via SendGrid's SMTP relay. Raises on failure — callers decide
    whether that should surface to the user or just get logged."""
    if not (config.SMTP_USERNAME and config.SMTP_PASSWORD and config.SENDGRID_FROM_EMAIL):
        raise RuntimeError("SMTP is not configured (SMTP_USERNAME / SMTP_PASSWORD / SENDGRID_FROM_EMAIL)")
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"{config.SENDGRID_FROM_NAME} <{config.SENDGRID_FROM_EMAIL}>"
    msg["To"]      = to
    msg.attach(MIMEText(text or re.sub("<[^<]+?>", "", html), "plain"))
    msg.attach(MIMEText(html, "html"))

    smtp_cls = smtplib.SMTP_SSL if config.SMTP_PORT == 465 else smtplib.SMTP
    with smtp_cls(config.SMTP_SERVER, config.SMTP_PORT, timeout=config.REQUEST_TIMEOUT) as server:
        if config.SMTP_PORT != 465:
            server.starttls()
        server.login(config.SMTP_USERNAME, config.SMTP_PASSWORD)
        server.sendmail(config.SENDGRID_FROM_EMAIL, [to], msg.as_string())


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
    "διαχειριστης πυλης":       "Org Administrator",
    "διαχειριστης":             "Org Administrator",
    "συντακτης πυλης":          "Org Editor",
    "συντακτης":                "Org Editor",
    "χρηστης πυλης":            "Org Member",
    "χρηστης":                  "Org Member",
    "υπευθυνος δεδομενων":              "Data Governance Officer",
    "υπευθυνος διακυβερνησης δεδομενων": "Data Governance Officer",
    "θεματοφυλακας δεδομενων":          "Data Steward",
    "portal administrator":            "Org Administrator",
    "portal editor":                   "Org Editor",
    "portal user":                     "Org Member",
    "org administrator":               "Org Administrator",
    "org editor":                      "Org Editor",
    "org member":                      "Org Member",
    "data officer":                    "Data Governance Officer",
    "data governance officer":         "Data Governance Officer",
    "data steward":                    "Data Steward",
    "κεντρικος διαχειριστης οργανισμου": "Κεντρικός Διαχειριστής Οργανισμού",
    "κεντρικος διαχειριστης":           "Κεντρικός Διαχειριστής Οργανισμού",
    "org central administrator":       "Κεντρικός Διαχειριστής Οργανισμού",
    "central administrator":           "Κεντρικός Διαχειριστής Οργανισμού",
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

with app.app_context():
    # Warm the in-memory cache from the DB so a fresh process (e.g. after a deploy)
    # serves last_updated dates immediately instead of showing blanks until a full
    # CKAN re-pagination completes.
    _orgs_row = OrgsCache.query.get(1)
    if _orgs_row:
        _orgs_cache["data"]       = _orgs_row.data()
        _orgs_cache["fetched_at"] = _orgs_row.fetched_at.isoformat()


def _save_orgs_cache(data: list) -> None:
    with app.app_context():
        row = OrgsCache.query.get(1)
        if not row:
            row = OrgsCache(id=1, data_json="[]")
            db.session.add(row)
        row.data_json  = json.dumps(data)
        row.fetched_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.session.commit()


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
    _save_orgs_cache(_orgs_cache["data"])


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
    if not _load_mqa_cache():
        try:
            _do_refresh_mqa()
        except Exception as exc:
            print(f"[mqa] initial error: {exc}")
    try:
        _do_fetch_portal_members()
    except Exception as exc:
        print(f"[portal-members] initial error: {exc}")

    last_orgs_refresh           = time.time()
    last_dataset_growth_refresh = time.time()
    last_geo_datasets_refresh   = time.time()
    last_hvd_check_refresh      = time.time()
    last_dcat_check_refresh     = time.time()
    last_geodcat_check_refresh  = time.time()
    last_mqa_refresh            = time.time()
    last_pm_refresh             = time.time()
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
        if time.time() - last_dataset_growth_refresh >= _DATASET_GROWTH_REFRESH_INTERVAL:
            try:
                _dataset_growth_cache["enriching"] = True
                _do_refresh_dataset_growth()
            except Exception as exc:
                print(f"[dataset-growth] refresh error: {exc}")
            last_dataset_growth_refresh = time.time()
        if time.time() - last_geo_datasets_refresh >= _GEO_DATASETS_REFRESH_INTERVAL:
            try:
                _geo_datasets_cache["enriching"] = True
                _do_refresh_geo_datasets()
            except Exception as exc:
                print(f"[geo-datasets] refresh error: {exc}")
            last_geo_datasets_refresh = time.time()
        if time.time() - last_hvd_check_refresh >= _HVD_CHECK_REFRESH_INTERVAL:
            # Skip rather than queue behind it if an admin's manual run (or a
            # previous scheduled one) happens to still be in flight -- avoids
            # two concurrent full runs hammering the portal at once. Checked
            # against the DB-backed status, not an in-memory flag, since an
            # admin's manual run may have been started from either gunicorn
            # worker process, not necessarily this one.
            if not _get_hvd_status()["running"]:
                try:
                    _set_hvd_status(running=True, started_at=datetime.now(timezone.utc).isoformat(),
                                     cancel_requested=False, total=0, completed=0, error=None)
                    _do_run_hvd_check()
                except Exception as exc:
                    print(f"[hvd-check] refresh error: {exc}")
            last_hvd_check_refresh = time.time()
        if time.time() - last_dcat_check_refresh >= _DCAT_CHECK_REFRESH_INTERVAL:
            # Spawned as its own thread rather than run inline like the HVD
            # check above: a full DCAT-AP run covers ~22,000+ datasets (vs.
            # ~1,100 HVD-tagged ones) and can take hours on a first run --
            # running it inline here would block health checks and every
            # other scheduled refresh in this loop for that whole duration.
            if not _get_dcat_status()["running"]:
                _set_dcat_status(running=True, started_at=datetime.now(timezone.utc).isoformat(),
                                  cancel_requested=False, total=0, completed=0, error=None)
                threading.Thread(target=_do_run_dcat_check, daemon=True).start()
            last_dcat_check_refresh = time.time()
        if time.time() - last_geodcat_check_refresh >= _GEODCAT_CHECK_REFRESH_INTERVAL:
            # Same reasoning as the DCAT-AP check above -- ~12,500 geospatial
            # datasets is still large enough that a first run can take a
            # long while, so this runs in its own thread too.
            if not _get_geodcat_status()["running"]:
                _set_geodcat_status(running=True, started_at=datetime.now(timezone.utc).isoformat(),
                                     cancel_requested=False, total=0, completed=0, error=None)
                threading.Thread(target=_do_run_geodcat_check, daemon=True).start()
            last_geodcat_check_refresh = time.time()
        if time.time() - last_mqa_refresh >= _MQA_REFRESH_INTERVAL:
            try:
                _do_refresh_mqa()
            except Exception as exc:
                print(f"[mqa] refresh error: {exc}")
            last_mqa_refresh = time.time()
        if time.time() - last_pm_refresh >= _PM_REFRESH_INTERVAL:
            try:
                _do_fetch_portal_members()
            except Exception as exc:
                print(f"[portal-members] refresh error: {exc}")
            last_pm_refresh = time.time()


_singleton_lock_file = None  # kept open for the process lifetime; closing it releases the lock


def _try_acquire_singleton_lock() -> bool:
    """Best-effort cross-process lock so only one worker process runs the background
    loop. Under gunicorn every worker independently imports this module, so the
    debug/WERKZEUG_RUN_MAIN check alone isn't enough - it only guards against
    Flask's dev-server reloader fork, not multiple production worker processes."""
    global _singleton_lock_file
    lock_path = Path(__file__).parent / "instance" / "background_loop.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        lock_file = open(lock_path, "w")
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(lock_file.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        _singleton_lock_file = lock_file  # keep the fd open; garbage collection would release the lock
        return True
    except OSError:
        return False


# Only start the background thread in the single process that wins the lock. This
# also naturally excludes the Flask dev-reloader's watcher process, since the
# debug/WERKZEUG_RUN_MAIN check still runs first.
if (not app.debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true") and _try_acquire_singleton_lock():
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


_changelog_cache: dict = {"data": None, "fetched_at": 0}
_CHANGELOG_CACHE_TTL = 300  # git log is cheap, but no need to shell out on every footer click


def _get_changelog(limit: int = 40) -> list:
    now = time.time()
    if _changelog_cache["data"] is not None and now - _changelog_cache["fetched_at"] < _CHANGELOG_CACHE_TTL:
        return _changelog_cache["data"]
    try:
        import subprocess
        # \x1f (unit separator) as the field delimiter -- safe since commit
        # subjects routinely contain commas, pipes, colons, etc. but never
        # this control character.
        r = subprocess.run(
            ["git", "log", f"-{limit}", "--no-merges", "--date=short", "--pretty=format:%h\x1f%ad\x1f%s"],
            capture_output=True, text=True, encoding="utf-8",
            cwd=Path(__file__).parent, timeout=5,
        )
        entries = []
        if r.returncode == 0:
            for line in r.stdout.splitlines():
                parts = line.split("\x1f")
                if len(parts) == 3:
                    entries.append({"sha": parts[0], "date": parts[1], "message": parts[2]})
        _changelog_cache["data"]       = entries
        _changelog_cache["fetched_at"] = now
        return entries
    except Exception:
        return _changelog_cache["data"] or []


@app.route("/api/changelog")
def changelog():
    return jsonify(_get_changelog())


_BUILD_SHA = _git_sha()


@app.route("/")
def index():
    user = User.query.get(session.get("user_id"))
    return render_template("index.html",
                           endpoints=config.ENDPOINTS_TO_MONITOR,
                           has_token=bool(config.TOKEN),
                           build_date=_build_date(),
                           git_sha=_BUILD_SHA,
                           user_name=session.get("user_name"),
                           is_admin=session.get("is_admin", False),
                           allowed_tabs=_effective_allowed_tabs(user))


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


@app.route("/api/stats/history")
def stats_history():
    days  = int(freq.args.get("days", 30))
    step  = (freq.args.get("step") or "").strip().lower()  # "" | "week"
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    rows  = (PortalSnapshot.query
             .filter(PortalSnapshot.timestamp >= since)
             .order_by(PortalSnapshot.timestamp)
             .all())
    if step == "week":
        # keep the most recent snapshot seen in each ISO week (rows are ascending)
        weekly = {}
        for r in rows:
            weekly[r.timestamp.isocalendar()[:2]] = r
        rows = [weekly[k] for k in sorted(weekly)]
    return jsonify([r.to_dict() for r in rows])


_dataset_growth_cache: dict = {"weeks": None, "fetched_at": None, "enriching": False}
_DATASET_GROWTH_REFRESH_INTERVAL = 24 * 3600  # rebuild once a day

with app.app_context():
    # Warm the in-memory cache from the DB so a fresh process serves the last known
    # series immediately instead of blocking on a full CKAN re-pagination.
    _row = DatasetGrowthCache.query.get(1)
    if _row:
        _dataset_growth_cache["weeks"]      = _row.weeks()
        _dataset_growth_cache["fetched_at"] = _row.fetched_at.isoformat()


def _save_dataset_growth(weeks: list) -> None:
    with app.app_context():
        row = DatasetGrowthCache.query.get(1)
        if not row:
            row = DatasetGrowthCache(id=1, weeks_json="[]")
            db.session.add(row)
        row.weeks_json = json.dumps(weeks)
        row.fetched_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.session.commit()


def _do_refresh_dataset_growth() -> None:
    """Reconstruct weekly dataset-count history straight from CKAN's metadata_created
    dates, since our own PortalSnapshot history only covers the time this app has
    actually been running (often far less than the 12 months we want to chart).
    Persists the result so the next process start can serve it without delay."""
    try:
        created_dates = []
        start = 0
        batch = 1000
        total = None
        while True:
            r = requests.get(
                f"{config.API_BASE}/package_search",
                params={"rows": batch, "start": start, "sort": "metadata_created asc", "fl": "metadata_created"},
                headers=_api_headers(),
                timeout=30,
            )
            if r.status_code != 200:
                break
            d = r.json()
            if not d.get("success"):
                break
            results = d["result"]["results"]
            if total is None:
                total = d["result"]["count"]
            if not results:
                break
            for pkg in results:
                mc = pkg.get("metadata_created")
                if mc:
                    created_dates.append(mc)
            start += batch
            if start >= (total or 0):
                break
        created_dates.sort()

        today  = datetime.now(timezone.utc).date()
        cursor = today - timedelta(days=365)
        cursor -= timedelta(days=cursor.weekday())  # align to Monday
        idx, n = 0, len(created_dates)
        weeks = []
        while cursor <= today:
            cutoff = (cursor + timedelta(days=7)).isoformat()
            while idx < n and created_dates[idx] < cutoff:
                idx += 1
            weeks.append({"week_start": cursor.isoformat(), "count": idx})
            cursor += timedelta(days=7)

        _dataset_growth_cache["weeks"]      = weeks
        _dataset_growth_cache["fetched_at"] = datetime.now(timezone.utc).isoformat()
        _save_dataset_growth(weeks)
    except Exception as exc:
        print(f"[dataset-growth] error: {exc}")
    finally:
        _dataset_growth_cache["enriching"] = False


@app.route("/api/stats/dataset-growth")
def stats_dataset_growth():
    if _dataset_growth_cache["weeks"] is None and not _dataset_growth_cache["enriching"]:
        _dataset_growth_cache["enriching"] = True
        threading.Thread(target=_do_refresh_dataset_growth, daemon=True).start()
    return jsonify({
        "weeks":      _dataset_growth_cache["weeks"] or [],
        "fetched_at": _dataset_growth_cache["fetched_at"],
        "enriching":  _dataset_growth_cache["enriching"],
    })


_geo_datasets_cache: dict = {"locations": None, "fetched_at": None, "enriching": False}
_GEO_DATASETS_REFRESH_INTERVAL = 24 * 3600  # organizations' locations barely change; once a day is plenty

with app.app_context():
    _geo_row = GeoDatasetsCache.query.get(1)
    if _geo_row:
        _geo_datasets_cache["locations"]  = _geo_row.data()
        _geo_datasets_cache["fetched_at"] = _geo_row.fetched_at.isoformat()


def _save_geo_datasets_cache(locations: list) -> None:
    with app.app_context():
        row = GeoDatasetsCache.query.get(1)
        if not row:
            row = GeoDatasetsCache(id=1, data_json="[]")
            db.session.add(row)
        row.data_json  = json.dumps(locations)
        row.fetched_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.session.commit()


def _pkg_centroid(pkg: dict):
    """(lat, lon) from a package's spatial_coverage — its centroid point if
    present, else the center of its bounding box; None if neither parses."""
    for sc in pkg.get("spatial_coverage") or []:
        for key in ("centroid", "bbox"):
            raw = sc.get(key)
            if not raw:
                continue
            try:
                geom = json.loads(raw)
                if geom.get("type") == "Point":
                    lon, lat = geom["coordinates"]
                    return float(lat), float(lon)
                if geom.get("type") == "Polygon":
                    ring = geom["coordinates"][0]
                    lons = [float(c[0]) for c in ring]
                    lats = [float(c[1]) for c in ring]
                    return (min(lats) + max(lats)) / 2, (min(lons) + max(lons)) / 2
            except Exception:
                continue
    return None


def _geo_org_location(org_name: str):
    """A representative (lat, lon) for one organization's geospatial datasets —
    the centroid of the first matching package that actually carries one."""
    r = requests.get(
        f"{config.API_BASE}/package_search",
        params={"rows": 5, "fq": f"organization:{org_name} AND dcat_type:*GEOSPATIAL*"},
        headers=_api_headers(), timeout=config.REQUEST_TIMEOUT,
    )
    r.raise_for_status()
    data = r.json()
    if not data.get("success"):
        return None
    for pkg in data["result"]["results"]:
        loc = _pkg_centroid(pkg)
        if loc:
            return loc
    return None


def _do_refresh_geo_datasets() -> None:
    """Rebuild the per-organization geospatial-dataset location list: one
    facet query for counts, then one representative-package lookup per
    organization (parallelized) for a lat/lon to plot it at."""
    try:
        r = requests.get(
            f"{config.API_BASE}/package_search",
            params={"rows": 0, "fq": "dcat_type:*GEOSPATIAL*", "facet": "true",
                    "facet.field": '["organization"]', "facet.limit": 1000},
            headers=_api_headers(), timeout=config.REQUEST_TIMEOUT,
        )
        r.raise_for_status()
        data = r.json()
        if not data.get("success"):
            return
        items = ((data["result"].get("search_facets") or {}).get("organization") or {}).get("items") or []
        items = [i for i in items if i.get("name") and i.get("count")]

        locations = []
        with ThreadPoolExecutor(max_workers=15) as pool:
            futures = {pool.submit(_geo_org_location, i["name"]): i for i in items}
            for fut in as_completed(futures):
                item = futures[fut]
                try:
                    loc = fut.result()
                except Exception:
                    loc = None
                if not loc:
                    continue
                locations.append({
                    "org_name":  item["name"],
                    "org_title": item.get("display_name") or item["name"],
                    "lat":       loc[0],
                    "lon":       loc[1],
                    "count":     item["count"],
                })

        locations.sort(key=lambda l: -l["count"])
        _geo_datasets_cache["locations"]  = locations
        _geo_datasets_cache["fetched_at"] = datetime.now(timezone.utc).isoformat()
        _save_geo_datasets_cache(locations)
    except Exception as exc:
        print(f"[geo-datasets] error: {exc}")
    finally:
        _geo_datasets_cache["enriching"] = False


@app.route("/api/datasets/geo-locations")
def datasets_geo_locations():
    if _geo_datasets_cache["locations"] is None and not _geo_datasets_cache["enriching"]:
        _geo_datasets_cache["enriching"] = True
        threading.Thread(target=_do_refresh_geo_datasets, daemon=True).start()
    return jsonify({
        "locations":  _geo_datasets_cache["locations"] or [],
        "fetched_at": _geo_datasets_cache["fetched_at"],
        "enriching":  _geo_datasets_cache["enriching"],
    })


# Maps a column+direction the frontend can ask for to a CKAN/Solr sort clause.
# "resources" has no counterpart — CKAN's search index doesn't store a resource
# count field at all, so that column can't be sorted server-side.
_DATASET_SORT_MAP = {
    "title_asc":    "title_string asc",
    "title_desc":   "title_string desc",
    "org_asc":      "organization asc",
    "org_desc":     "organization desc",
    "modified_asc":  "metadata_modified asc",
    "modified_desc": "metadata_modified desc",
}


def _is_hvd(pkg: dict) -> bool:
    """True if the CKAN package carries an EU High-Value Dataset category
    (Implementing Regulation (EU) 2023/138) — data.gov.gr stores this as the
    `hvd_category` extra, indexed as a JSON-array-shaped string; "[]" or empty
    means the package isn't classified as an HVD."""
    val = pkg.get("hvd_category")
    if isinstance(val, str):
        return val.strip() not in ("", "[]")
    if isinstance(val, list):
        return len(val) > 0
    return bool(val)


def _is_geospatial(pkg: dict) -> bool:
    """True if the CKAN package is classified as geospatial data (DCAT-AP
    dataset-type authority table) -- data.gov.gr stores this as a list of
    authority-table URIs in the `dcat_type` field, one of which ends in
    GEOSPATIAL for spatial datasets (e.g. GIS layers, WMS/WFS services)."""
    val = pkg.get("dcat_type")
    if isinstance(val, list):
        return any("GEOSPATIAL" in v for v in val if isinstance(v, str))
    if isinstance(val, str):
        return "GEOSPATIAL" in val
    return False


def _harvest_source(pkg: dict):
    """The harvest source title if this package was imported by a CKAN
    harvester, else None if it was created directly on the portal. Harvested
    packages carry a `harvest_source_title` extra (ckanext-harvest)."""
    for extra in pkg.get("extras") or []:
        if extra.get("key") == "harvest_source_title":
            return extra.get("value")
    return None


def _package_count(q: str, fq_parts: list) -> int:
    """rows=0 package_search — just the match count, for summary cards."""
    params = {"rows": 0}
    if q:
        params["q"] = q
    if fq_parts:
        params["fq"] = " AND ".join(fq_parts)
    r = requests.get(f"{config.API_BASE}/package_search", params=params,
                      headers=_api_headers(), timeout=config.REQUEST_TIMEOUT)
    r.raise_for_status()
    return r.json()["result"]["count"]


@app.route("/api/datasets/search")
def datasets_search():
    q        = (freq.args.get("q") or "").strip()
    org      = (freq.args.get("org") or "").strip()
    fmt      = (freq.args.get("format") or "").strip()
    ds_type  = (freq.args.get("type") or "").strip()
    since    = (freq.args.get("since") or "").strip()
    hvd_filter = (freq.args.get("hvd") or "").strip()  # "1" = HVD only, "0" = non-HVD only, "" = all
    harvested_filter = (freq.args.get("harvested") or "").strip()  # "1" = harvested only, "0" = manual only, "" = all
    geo_filter = (freq.args.get("geo") or "").strip()  # "1" = geospatial only, "0" = non-geospatial only, "" = all
    sort_key = (freq.args.get("sort") or "").strip()
    rows     = min(max(int(freq.args.get("rows", 20) or 20), 1), 100)
    start    = max(int(freq.args.get("start", 0) or 0), 0)

    params = {"rows": rows, "start": start}
    if sort_key in _DATASET_SORT_MAP:
        params["sort"] = _DATASET_SORT_MAP[sort_key]
    elif q:
        params["sort"] = "score desc, metadata_modified desc"
    else:
        params["sort"] = "metadata_modified desc"
    if q:
        params["q"] = q

    # Filters shared by every summary-card row (org/format/since), kept
    # separate from the type/hvd/harvested clauses so each row's counts can be
    # scoped to "every other active filter, including the other rows'
    # selections, but not its own split" — see below.
    shared_fq_parts = []
    if org:
        shared_fq_parts.append(f"organization:{org}")
    if fmt:
        shared_fq_parts.append(f'res_format:"{fmt}"')
    if since:
        try:
            solr_date = datetime.strptime(since, "%Y-%m-%d").strftime("%Y-%m-%dT00:00:00Z")
            shared_fq_parts.append(f"metadata_created:[{solr_date} TO NOW]")
        except ValueError:
            pass  # ignore a malformed date rather than failing the whole search

    type_fq      = f'type:"{ds_type}"'          if ds_type                else None
    hvd_fq       = '-hvd_category:"[]"'        if hvd_filter == "1"       else 'hvd_category:"[]"'          if hvd_filter == "0"       else None
    harvested_fq = "harvest_source_id:[* TO *]" if harvested_filter == "1" else "-harvest_source_id:[* TO *]" if harvested_filter == "0" else None
    geo_fq       = "dcat_type:*GEOSPATIAL*"     if geo_filter == "1"       else "-dcat_type:*GEOSPATIAL*"     if geo_filter == "0"       else None

    fq_parts = list(shared_fq_parts)
    if type_fq:
        fq_parts.append(type_fq)
    if hvd_fq:
        fq_parts.append(hvd_fq)
    if harvested_fq:
        fq_parts.append(harvested_fq)
    if geo_fq:
        fq_parts.append(geo_fq)
    if fq_parts:
        params["fq"] = " AND ".join(fq_parts)

    try:
        r = requests.get(
            f"{config.API_BASE}/package_search",
            params=params,
            headers=_api_headers(),
            timeout=config.REQUEST_TIMEOUT,
        )
        r.raise_for_status()
        data = r.json()
        if not data.get("success"):
            return jsonify({"error": data.get("error", {}).get("message", "CKAN error")}), 502
        result = data["result"]
        datasets = [{
            "name":              p.get("name"),
            "title":             p.get("title") or p.get("name"),
            "type":              p.get("type") or "dataset",
            "org_name":          (p.get("organization") or {}).get("name") or "",
            "org_title":         (p.get("organization") or {}).get("title") or "",
            "num_resources":     len(p.get("resources") or []),
            "metadata_modified": p.get("metadata_modified"),
            "is_hvd":            _is_hvd(p),
            "is_geospatial":     _is_geospatial(p),
            "harvest_source":    _harvest_source(p),
        } for p in result.get("results", [])]

        # Summary-card counts for the Type, HVD, Harvested, and Geospatial
        # rows. Each is scoped to the shared filters + the OTHER rows'
        # current selections, but not its own split, so all card counts stay
        # visible and consistent no matter which cards are currently active.
        # Only computed on a fresh search (start=0), not on infinite-scroll
        # pagination calls, since it can't have changed since the last page.
        type_counts = None
        hvd_count = non_hvd_count = harvested_count = manual_count = None
        geo_count = non_geo_count = None
        if start == 0:
            try:
                type_scope = shared_fq_parts + ([hvd_fq] if hvd_fq else []) + ([harvested_fq] if harvested_fq else []) + ([geo_fq] if geo_fq else [])
                type_params = {"rows": 0, "facet": "true", "facet.field": '["type"]', "facet.limit": 20}
                if q:
                    type_params["q"] = q
                if type_scope:
                    type_params["fq"] = " AND ".join(type_scope)
                r_types = requests.get(f"{config.API_BASE}/package_search", params=type_params,
                                        headers=_api_headers(), timeout=config.REQUEST_TIMEOUT)
                r_types.raise_for_status()
                items = ((r_types.json()["result"].get("search_facets") or {}).get("type") or {}).get("items") or []
                type_counts = sorted(
                    [{"name": i["name"], "count": i["count"]} for i in items if i.get("name") and i.get("count")],
                    key=lambda x: -x["count"],
                )

                hvd_scope = shared_fq_parts + ([type_fq] if type_fq else []) + ([harvested_fq] if harvested_fq else []) + ([geo_fq] if geo_fq else [])
                hvd_scope_total = _package_count(q, hvd_scope)
                hvd_count = _package_count(q, hvd_scope + ['-hvd_category:"[]"'])
                non_hvd_count = hvd_scope_total - hvd_count

                harvest_scope = shared_fq_parts + ([type_fq] if type_fq else []) + ([hvd_fq] if hvd_fq else []) + ([geo_fq] if geo_fq else [])
                harvest_scope_total = _package_count(q, harvest_scope)
                harvested_count = _package_count(q, harvest_scope + ["harvest_source_id:[* TO *]"])
                manual_count = harvest_scope_total - harvested_count

                geo_scope = shared_fq_parts + ([type_fq] if type_fq else []) + ([hvd_fq] if hvd_fq else []) + ([harvested_fq] if harvested_fq else [])
                geo_scope_total = _package_count(q, geo_scope)
                geo_count = _package_count(q, geo_scope + ["dcat_type:*GEOSPATIAL*"])
                non_geo_count = geo_scope_total - geo_count
            except Exception:
                pass  # summary cards just won't show counts this time

        return jsonify({
            "count":           result.get("count", 0),
            "datasets":        datasets,
            "type_counts":     type_counts,
            "hvd_count":       hvd_count,
            "non_hvd_count":   non_hvd_count,
            "harvested_count": harvested_count,
            "manual_count":    manual_count,
            "geo_count":       geo_count,
            "non_geo_count":   non_geo_count,
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 503


_dataset_formats_cache: dict = {"data": None, "ts": 0}


@app.route("/api/datasets/formats")
def dataset_formats():
    now = time.time()
    if _dataset_formats_cache["data"] is not None and now - _dataset_formats_cache["ts"] < 3600:
        return jsonify(_dataset_formats_cache["data"])
    try:
        r = requests.get(
            f"{config.API_BASE}/package_search",
            params={"rows": 0, "facet": "true", "facet.field": '["res_format"]', "facet.limit": 100},
            headers=_api_headers(),
            timeout=config.REQUEST_TIMEOUT,
        )
        r.raise_for_status()
        data = r.json()
        if not data.get("success"):
            return jsonify({"error": data.get("error", {}).get("message", "CKAN error")}), 502
        items = ((data["result"].get("search_facets") or {}).get("res_format") or {}).get("items") or []
        formats = sorted(
            [{"name": i["name"], "count": i["count"]} for i in items if i.get("name") and i.get("count")],
            key=lambda x: -x["count"],
        )
        _dataset_formats_cache["data"] = formats
        _dataset_formats_cache["ts"] = now
        return jsonify(formats)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 503


@app.route("/api/datasets/<name>")
def dataset_detail(name):
    try:
        r = requests.get(
            f"{config.API_BASE}/package_show",
            params={"id": name},
            headers=_api_headers(),
            timeout=config.REQUEST_TIMEOUT,
        )
        if r.status_code == 404:
            return jsonify({"error": "Dataset not found"}), 404
        r.raise_for_status()
        data = r.json()
        if not data.get("success"):
            return jsonify({"error": data.get("error", {}).get("message", "CKAN error")}), 502
        p = data["result"]
        ds_type = p.get("type") or "dataset"
        resources = [{
            "name":          res.get("name") or res.get("format") or "Resource",
            "format":        res.get("format") or "",
            "url":           res.get("url") or "",
            "last_modified": res.get("last_modified") or res.get("created") or "",
        } for res in p.get("resources", [])]

        # Data services (DCAT-AP type "data-service") have no resources; instead
        # they expose one or more API/endpoint URLs and, sometimes, landing pages.
        endpoints, landing_pages, service_format = [], [], ""
        if ds_type == "data-service":
            raw_endpoints = p.get("endpoint_url") or []
            endpoints = [raw_endpoints] if isinstance(raw_endpoints, str) else list(raw_endpoints)
            raw_landing = p.get("landing_page") or []
            landing_pages = [raw_landing] if isinstance(raw_landing, str) else list(raw_landing)
            service_format = (p.get("format") or "").rstrip("/").rsplit("/", 1)[-1]

        return jsonify({
            "name":              p.get("name"),
            "title":             p.get("title") or p.get("name"),
            "type":              ds_type,
            "notes":             p.get("notes") or "",
            "org_name":          (p.get("organization") or {}).get("name") or "",
            "org_title":         (p.get("organization") or {}).get("title") or "",
            "license_title":     p.get("license_title") or "",
            "tags":              [tag.get("name") for tag in p.get("tags", []) if tag.get("name")],
            "metadata_created":  p.get("metadata_created"),
            "metadata_modified": p.get("metadata_modified"),
            "resources":         resources,
            "endpoints":         endpoints,
            "landing_pages":     landing_pages,
            "service_format":    service_format,
            "is_hvd":            _is_hvd(p),
            "is_geospatial":     _is_geospatial(p),
            "harvest_source":    _harvest_source(p),
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 503


# ── HVD compliance check (DCAT-AP-HVD SHACL) ─────────────────────────────────
# Whether a dataset is tagged hvd_category doesn't prove it actually meets
# Regulation (EU) 2023/138's requirements -- that's a self/harvester-declared
# CKAN field. This validates each HVD-tagged dataset's real DCAT-AP RDF export
# against the EU's own SHACL shapes (vendored from SEMICeu's DCAT-AP repo, the
# 3.0.0-hvd release) for a genuine, EU-sanctioned structural compliance check.
_HVD_SHAPES_TTL = (Path(__file__).parent / "shacl" / "dcat-ap-hvd.shapes.ttl").read_text(encoding="utf-8")

_DCATAP_NS = rdflib.Namespace("http://data.europa.eu/r5r/")
_DCAT_NS   = rdflib.Namespace("http://www.w3.org/ns/dcat#")
_DCT_NS    = rdflib.Namespace("http://purl.org/dc/terms/")
_SH_NS     = rdflib.Namespace("http://www.w3.org/ns/shacl#")
_FOAF_NS   = rdflib.Namespace("http://xmlns.com/foaf/0.1/")
_ADMS_NS   = rdflib.Namespace("http://www.w3.org/ns/adms#")
_VCARD_NS  = rdflib.Namespace("http://www.w3.org/2006/vcard/ns#")
_SKOS_NS   = rdflib.Namespace("http://www.w3.org/2004/02/skos/core#")

_OPEN_LICENSE_MARKERS = (
    "creativecommons.org/licenses/by",
    "publications.europa.eu/resource/authority/licence/cc_by",
    "publications.europa.eu/resource/authority/licence/cc0",
    "creativecommons.org/publicdomain/zero",
    "opendefinition.org/licenses/cc-by",
    "opendefinition.org/licenses/odc-by",
    "opendatacommons.org/licenses/by",
)

# Concept/service URI -> its parsed RDF graph (or None if unfetchable), kept
# for the process lifetime. HVD category codes repeat across hundreds of
# datasets, so after the first few checks this cache turns most lookups into
# a dict hit instead of a fresh HTTP request.
_hvd_vocab_cache: dict = {}
_hvd_vocab_lock = threading.Lock()

_HVD_CHECK_REFRESH_INTERVAL = 24 * 3600  # scheduled nightly re-check, same cadence as the geo-datasets cache
# Lower than the other CKAN-facing pools (e.g. 15 for the geo-datasets refresh)
# since a full run can be 1,000+ requests rather than ~55 -- keep the burst
# gentle on data.gov.gr rather than maximizing our own throughput.
_HVD_CHECK_CONCURRENCY = 5
# More generous than config.REQUEST_TIMEOUT (used for time-sensitive things
# like health checks) since nothing in this background check is waiting on a
# live user request -- a slow-but-working response shouldn't get counted as
# a failure just because it took longer than a page load would tolerate.
_HVD_CHECK_TIMEOUT = 30
# Bump whenever _hvd_check_one()'s result schema/logic changes (a new field,
# a fixed classifier, etc.) -- metadata_modified alone can't detect "the code
# that produced this cached result is now stale", only "the dataset changed".
# A version bump forces every cached row to be treated as a miss once, so the
# next run re-populates everything with the new/fixed shape.
_HVD_CHECK_VERSION = 4

def _save_hvd_check_cache(result: dict) -> None:
    with app.app_context():
        row = HvdCheckCache.query.get(1)
        if not row:
            row = HvdCheckCache(id=1, data_json="{}")
            db.session.add(row)
        row.data_json  = json.dumps(result)
        row.fetched_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.session.commit()


def _load_hvd_check_result():
    with app.app_context():
        row = HvdCheckCache.query.get(1)
        return row.data() if row else None


def _hvd_status_row() -> HvdCheckStatus:
    row = HvdCheckStatus.query.get(1)
    if not row:
        row = HvdCheckStatus(id=1, running=False, total=0, completed=0, cancel_requested=False)
        db.session.add(row)
        db.session.commit()
    return row


# The running check bumps its progress (and this heartbeat) roughly every
# time one dataset finishes -- bounded well under a minute even in the worst
# case (one _HVD_CHECK_TIMEOUT-limited fetch plus SHACL validation). If the
# worker that started a run dies (e.g. a deploy restart mid-run), nothing
# ever touches the heartbeat again, so a long silence reliably means
# "abandoned", not "still working" -- self-heal here rather than leaving
# every future run blocked looking like one is perpetually in progress.
_HVD_CHECK_STALE_AFTER = 10 * 60


def _get_hvd_status() -> dict:
    with app.app_context():
        row = _hvd_status_row()
        if row.running and row.updated_at:
            stale = (datetime.now(timezone.utc).replace(tzinfo=None) - row.updated_at).total_seconds() > _HVD_CHECK_STALE_AFTER
            if stale:
                row.running          = False
                row.cancel_requested = False
                row.error            = "Abandoned run (the worker that started it never finished, likely a restart)."
                db.session.commit()
        return {
            "running":          row.running,
            "started_at":       row.started_at,
            "total":            row.total,
            "completed":        row.completed,
            "cancel_requested": row.cancel_requested,
            "error":            row.error,
        }


def _set_hvd_status(**fields) -> None:
    with app.app_context():
        row = _hvd_status_row()
        for key, value in fields.items():
            setattr(row, key, value)
        row.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.session.commit()


def _bump_hvd_progress(completed: int) -> bool:
    """Updates the shared completed count and heartbeat, and returns whether
    cancellation has been requested -- in one DB round trip, since this is
    called once per dataset (~1,105 times a run) from the check loop."""
    with app.app_context():
        row = _hvd_status_row()
        row.completed  = completed
        row.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.session.commit()
        return row.cancel_requested




def _get_vocab_graph(url: str):
    with _hvd_vocab_lock:
        if url in _hvd_vocab_cache:
            return _hvd_vocab_cache[url]
    g = None
    try:
        r = requests.get(url, timeout=_HVD_CHECK_TIMEOUT,
                          headers={"Accept": "application/rdf+xml", "User-Agent": "DataGovGR-Dashboard/1.0"})
        r.raise_for_status()
        g = rdflib.Graph()
        g.parse(data=r.text, format="xml")
    except Exception:
        g = None
    with _hvd_vocab_lock:
        _hvd_vocab_cache[url] = g
    return g


def _augment_with_vocab(graph: "rdflib.Graph") -> None:
    """Merge in the actual RDF for every hvdCategory/accessService URI this
    dataset references. Without this, SHACL validates those terms' *typing*
    blind: a dataset's own RDF export only references e.g. its HVD category
    by URI, so a legitimate EU category code fails skos:Concept/skos:inScheme
    checks simply because its definition triples live in a separate document
    (confirmed by testing: this exact fix made real category-code violations
    disappear while leaving genuine gaps intact)."""
    refs = set(graph.objects(None, _DCATAP_NS.hvdCategory)) | set(graph.objects(None, _DCAT_NS.accessService))
    for ref in refs:
        if not isinstance(ref, rdflib.URIRef):
            continue
        vocab_graph = _get_vocab_graph(str(ref))
        if vocab_graph is not None:
            graph += vocab_graph


def _license_status(graph: "rdflib.Graph") -> str:
    licenses = list(graph.objects(None, _DCT_NS.license))
    if not licenses:
        return "missing"
    for lic in licenses:
        if any(marker in str(lic).lower() for marker in _OPEN_LICENSE_MARKERS):
            return "open"
    return "non_open"


# Generic administrative words stripped before comparing a dataset's RDF
# dct:publisher name against CKAN's organization title -- without this,
# e.g. "Δήμος Ρόδου" vs "Δήμος Πειραιώς" would appear to match on "Δήμος"
# alone. Not exhaustive, just the terms common enough in Greek/EU public
# bodies to otherwise cause false negatives.
_PUBLISHER_MISMATCH_STOPWORDS = {
    "δημος", "δημου", "δημων", "περιφερεια", "περιφερειας", "περιφερειακη", "περιφερειακης",
    "υπουργειο", "υπουργειου", "γενικη", "γενικης", "γραμματεια", "γραμματειας",
    "διευθυνση", "διευθυνσης", "τμημα", "τμηματος", "οργανισμος", "οργανισμου",
    "εθνικο", "εθνικος", "εθνικη", "εθνικης", "κεντρο", "κεντρου", "αρχη", "αρχης",
    "φορεας", "φορεα", "and", "of", "the", "ministry", "general", "secretariat",
    "directorate", "department", "national", "organization", "authority",
}


def _publisher_mismatch(publisher_name: str, org_title: str) -> bool:
    """True when a dataset's RDF dct:publisher name shares no meaningful word
    with CKAN's own organization title -- catches metadata where a data
    owner typed a contact person's name into the publisher field instead of
    the organization's name (confirmed to happen on real data.gov.gr
    datasets: dct:publisher/foaf:name held a staff member's name while
    CKAN's organization record correctly showed "Περιφέρεια Νοτίου Αιγαίου").
    Token-overlap based rather than exact-match, since legitimate publisher
    names often differ from the org title in wording/case (e.g. a longer
    department name) without actually being wrong."""
    if not publisher_name or not org_title:
        return False

    def tokens(s):
        return {w for w in _search_normalize(s).split() if len(w) >= 3 and w not in _PUBLISHER_MISMATCH_STOPWORDS}

    pub_tokens, org_tokens = tokens(publisher_name), tokens(org_title)
    if not pub_tokens or not org_tokens:
        return False
    return pub_tokens.isdisjoint(org_tokens)


# Plain-language label for each RDF property the HVD shapes actually check,
# keyed by the property's local name -- used to translate a raw pySHACL
# result (which otherwise dumps SHACL jargon like "Node Kind" or a full
# property-path expression) into a sentence a non-technical reader can act
# on, without having to hand-write a mapping for every literal message text.
_HVD_PATH_LABELS = {
    "applicableLegislation": "the applicable EU legislation citation",
    "hvdCategory":           "the HVD category classification",
    "servesDataset":         "the link back to the dataset this API serves",
    "endpointURL":           "the API's endpoint URL",
    "endpointDescription":   "the API's endpoint documentation",
    "contactPoint":          "the dataset's contact point",
    "page":                  "the documentation/reference page",
    "rights":                "the rights statement",
    "license":               "the license",
    "conformsTo":            "the standard/specification it conforms to",
    "distribution":          "at least one distribution (downloadable file/API)",
    "inSeries":               "the dataset series it belongs to",
    "hasEmail":               "the contact point's email address",
    "hasURL":                 "the contact point's web address",
    "inScheme":               "the vocabulary/scheme reference",
    "accessService":          "the linked API (access service)",
    "accessURL":              "the API's access URL",
}

# The license-vocabulary-match warning has no resultPath (it's a Node-level
# `sh:or` over several equivalence predicates), so it's recognised by these
# predicate names appearing together in pySHACL's generated message instead.
_LICENSE_VOCAB_MARKERS = ("skos:exactMatch", "owl:sameAs", "skos:broadMatch")


def _generic_property_message(path_s: str, comp, path_labels: dict) -> str | None:
    """Fallback phrasing shared by every SHACL check: translate a constraint
    on a known property into a plain sentence based on which kind of
    constraint failed, using each check's own path->label dictionary. Returns
    None if the property isn't in path_labels, so the caller can fall back to
    the raw pySHACL message instead of a generic "Issue with None." string."""
    local = path_s.rsplit("#", 1)[-1].rsplit("/", 1)[-1] if path_s else ""
    label = path_labels.get(local)
    if not label:
        return None
    if comp == _SH_NS.MinCountConstraintComponent:
        return f"Missing {label}."
    if comp == _SH_NS.NodeKindConstraintComponent:
        return f"{label[0].upper()}{label[1:]} isn't a properly linked resource (a plain value instead of a URI)."
    if comp == _SH_NS.ClassConstraintComponent:
        return f"{label[0].upper()}{label[1:]} doesn't reference the expected type of resource."
    if comp == _SH_NS.DatatypeConstraintComponent:
        return f"{label[0].upper()}{label[1:]} has the wrong data type."
    return f"Issue with {label}."


def _friendly_shacl_message(path_s: str, comp, raw_msg: str) -> str:
    if "applicableLegislation" in path_s:
        if comp == _SH_NS.ClassConstraintComponent:
            return ("The cited legislation isn't linked to a recognized EU legal "
                     "resource (ELI) — likely plain text instead of the official reference.")
        return "The applicable HVD legislation isn't cited as a properly linked legal resource."

    if "accessService" in path_s or "accessService" in raw_msg:
        if comp == _SH_NS.MinCountConstraintComponent:
            return "No API (data access service) is linked to this dataset, as HVD rules require."
        if comp == _SH_NS.ClassConstraintComponent:
            return "An API is linked, but it isn't described as a proper dcat:DataService."
        if comp == _SH_NS.NodeKindConstraintComponent:
            return "An API is linked, but only inline — it has no stable web address of its own."

    if any(marker in raw_msg for marker in _LICENSE_VOCAB_MARKERS):
        return "The dataset's license couldn't be matched to a known open-license entry in the EU's vocabulary."

    return _generic_property_message(path_s, comp, _HVD_PATH_LABELS) or raw_msg or "Unrecognized SHACL validation issue."


def _dedupe_shacl_details(entries: list) -> list:
    """Collapses identical (severity, friendly message) entries -- the same
    underlying gap is often reported once per RDF node it's missing from
    (e.g. once for the dataset, once for its distribution), which would
    otherwise show as several literally-identical bullet points. Shared by
    every SHACL-based check (HVD, DCAT-AP), not HVD-specific despite the
    entries' shape coming from HVD's classifier originally."""
    deduped, index = [], {}
    for e in entries:
        key = (e["severity"], e["message"])
        if key in index:
            index[key]["count"] += 1
        else:
            entry = dict(e, count=1)
            index[key] = entry
            deduped.append(entry)
    return deduped


def _classify_shacl_results(results_graph: "rdflib.Graph"):
    violations, warnings = [], []
    legal_citation_issue = False
    no_api_access = False
    for r in results_graph.subjects(rdflib.RDF.type, _SH_NS.ValidationResult):
        sev   = results_graph.value(r, _SH_NS.resultSeverity)
        msg   = results_graph.value(r, _SH_NS.resultMessage)
        path  = results_graph.value(r, _SH_NS.resultPath)
        shape = results_graph.value(r, _SH_NS.sourceShape)
        comp  = results_graph.value(r, _SH_NS.sourceConstraintComponent)
        path_s  = str(path) if path is not None else ""
        shape_s = str(shape) if shape is not None else ""
        raw_msg = str(msg) if msg else ""
        entry = {
            "severity":    "violation" if sev == _SH_NS.Violation else "warning",
            "path":        path_s or None,
            "message":     _friendly_shacl_message(path_s, comp, raw_msg),
            "raw_message": raw_msg,
        }
        if sev == _SH_NS.Violation:
            violations.append(entry)
            # DataServiceShape carries its own, separate applicableLegislation
            # requirement (the accompanying API must independently cite the
            # regulation) -- a real violation, but a different one from "this
            # dataset cites legislation as free text instead of a linked
            # resource". Only DatasetShape/DistributionShape violations on
            # this path mean the dataset's OWN citation is malformed;
            # confirmed against a real dataset with a properly-linked
            # eli:LegalResource citation that was wrongly flagged before this
            # fix, solely because its accompanying DataService lacked one.
            if "applicableLegislation" in path_s and ("DatasetShape" in shape_s or "DistributionShape" in shape_s):
                legal_citation_issue = True
            # The MinCount("has an accessService, or is served by one") check
            # uses a compound SHACL property-path as resultPath (not a plain
            # URI), so it's matched by its stable shape name instead. That
            # same shape also carries a separate NodeKind(IRI) constraint,
            # which fires when an accessService *is* present but expressed as
            # a blank node rather than its own IRI (common in practice --
            # e.g. an API described inline instead of minted its own stable
            # URI). That's a real but distinct metadata gap, not "no API
            # access" -- only the MinCount failure means one is genuinely
            # absent, confirmed against a real dataset that has an inline
            # (blank-node) API and was wrongly flagged before this fix.
            if shape_s.endswith("DatasetShape/API") and comp == _SH_NS.MinCountConstraintComponent:
                no_api_access = True
        else:
            warnings.append(entry)
    return violations, warnings, legal_citation_issue, no_api_access


def _hvd_check_one(name: str) -> dict:
    url = f"{config.PORTAL_BASE}/dataset/{name}.rdf"
    r = requests.get(url, timeout=_HVD_CHECK_TIMEOUT,
                      headers={"Accept": "application/rdf+xml", "User-Agent": "DataGovGR-Dashboard/1.0"})
    r.raise_for_status()
    graph = rdflib.Graph()
    graph.parse(data=r.text, format="xml")
    _augment_with_vocab(graph)

    conforms, results_graph, _ = pyshacl.validate(
        graph, shacl_graph=_HVD_SHAPES_TTL, shacl_graph_format="turtle",
        advanced=True, inference="rdfs", debug=False,
    )
    violations, warnings, legal_citation_issue, no_api_access = _classify_shacl_results(results_graph)

    title = None
    for t in graph.objects(None, _DCT_NS.title):
        title = str(t)
        break

    publisher_name = None
    for publisher in graph.objects(None, _DCT_NS.publisher):
        name_lit = graph.value(publisher, _FOAF_NS.name)
        if name_lit:
            publisher_name = str(name_lit)
            break

    return {
        "name":                 name,
        "title":                title or name,
        "publisher_name":       publisher_name or "",
        "conforms":             conforms,
        "violation_count":      len(violations),
        "warning_count":        len(warnings),
        "legal_citation_issue": legal_citation_issue,
        "no_api_access":        no_api_access,
        "license_status":       _license_status(graph),
        "details":              _dedupe_shacl_details(violations + warnings),
    }


def _list_hvd_datasets() -> list:
    """[{"name":..., "metadata_modified":..., "org_title":...}, ...] for every
    currently HVD-tagged dataset -- one bulk paginated call, used both to know
    what to check and to detect which ones actually changed since the last
    check. org_title comes from CKAN's own organization record, NOT from the
    dataset's dct:publisher RDF field -- that field is free text set by each
    data owner and is often wrong (e.g. a contact person's name instead of
    the organization), so it's unusable for grouping."""
    items = []
    start, batch = 0, 100
    while True:
        r = requests.get(
            f"{config.API_BASE}/package_search",
            params={"rows": batch, "start": start, "fq": '-hvd_category:"[]"', "fl": "name,metadata_modified,organization"},
            headers=_api_headers(), timeout=config.REQUEST_TIMEOUT,
        )
        r.raise_for_status()
        data = r.json()
        if not data.get("success"):
            break
        results = data["result"]["results"]
        if not results:
            break
        items.extend(
            {
                "name":             p["name"],
                "metadata_modified": p.get("metadata_modified"),
                "org_title":        (p.get("organization_card") or {}).get("title") or "",
            }
            for p in results if p.get("name")
        )
        start += batch
        if start >= data["result"]["count"]:
            break
    return items


def _do_run_hvd_check() -> None:
    cancelled = False
    try:
        datasets = _list_hvd_datasets()
        _set_hvd_status(total=len(datasets))

        with app.app_context():
            cached_rows = {row.name: row for row in HvdDatasetCheckCache.query.all()}

        # A dataset is reused as-is only if we have a previously *successful*
        # result, from the current check version, AND CKAN's metadata_modified
        # hasn't changed since then -- otherwise (new, previously failed,
        # actually modified, or cached under an older schema/logic version)
        # it's re-fetched and re-validated for real.
        to_fetch, rows = [], []
        for d in datasets:
            row = cached_rows.get(d["name"])
            cached = row.result() if (row and row.result_json) else None
            if (cached and isinstance(cached, dict) and cached.get("_cache_version") == _HVD_CHECK_VERSION
                    and row.metadata_modified == d["metadata_modified"]):
                cached_result = cached["result"]
                cached_result["org_title"] = d.get("org_title", "")
                cached_result["publisher_mismatch"] = _publisher_mismatch(
                    cached_result.get("publisher_name", ""), cached_result["org_title"])
                rows.append(cached_result)
            else:
                to_fetch.append(d)
        _bump_hvd_progress(len(rows))

        newly_checked = []  # (name, metadata_modified, result-or-None-if-failed)
        pool = ThreadPoolExecutor(max_workers=_HVD_CHECK_CONCURRENCY)
        try:
            futures = {pool.submit(_hvd_check_one, d["name"]): d for d in to_fetch}
            for fut in as_completed(futures):
                d = futures[fut]
                try:
                    result = fut.result()
                    result["org_title"] = d.get("org_title", "")
                    result["publisher_mismatch"] = _publisher_mismatch(
                        result.get("publisher_name", ""), result["org_title"])
                    rows.append(result)
                    newly_checked.append((d["name"], d["metadata_modified"], result))
                except Exception as exc:
                    rows.append({"name": d["name"], "error": str(exc)})
                    newly_checked.append((d["name"], d["metadata_modified"], None))
                if _bump_hvd_progress(len(rows)):
                    cancelled = True
                    break
        finally:
            # Drop any not-yet-started work immediately; already-running
            # requests in other threads finish on their own (Python can't
            # forcibly kill a thread mid-request) but their results are
            # simply not collected -- don't block the cancel on them.
            pool.shutdown(wait=False, cancel_futures=True)

        if newly_checked:
            with app.app_context():
                for name, mtime, result in newly_checked:
                    row = HvdDatasetCheckCache.query.get(name)
                    if not row:
                        row = HvdDatasetCheckCache(name=name)
                        db.session.add(row)
                    row.checked_at = datetime.now(timezone.utc).replace(tzinfo=None)
                    if result is not None:
                        # Only overwrite on success -- a transient fetch
                        # failure shouldn't erase a known-good cached result;
                        # leaving metadata_modified stale means it's simply
                        # retried again next run instead of wrongly reused.
                        row.metadata_modified = mtime
                        row.result_json = json.dumps({"_cache_version": _HVD_CHECK_VERSION, "result": result})
                db.session.commit()

        checked = [r for r in rows if "error" not in r]
        failed  = [r for r in rows if "error" in r]
        summary = {
            "total":                len(datasets),
            "checked":              len(checked),
            "failed_to_fetch":      len(failed),
            "reused_from_cache":    len(datasets) - len(to_fetch),
            "conforms":             sum(1 for r in checked if r["conforms"]),
            "legal_citation_issue": sum(1 for r in checked if r["legal_citation_issue"]),
            "no_api_access":        sum(1 for r in checked if r["no_api_access"]),
            "license_missing":      sum(1 for r in checked if r["license_status"] == "missing"),
            "license_non_open":     sum(1 for r in checked if r["license_status"] == "non_open"),
            "publisher_mismatch":   sum(1 for r in checked if r["publisher_mismatch"]),
        }
        flagged = [
            r for r in checked
            if r["legal_citation_issue"] or r["no_api_access"] or r["license_status"] != "open"
                or not r["conforms"] or r["publisher_mismatch"]
        ]
        flagged.sort(key=lambda r: -r["violation_count"])
        result = {
            "summary":     summary,
            "datasets":    flagged,
            "partial":     cancelled,
            "finished_at": datetime.now(timezone.utc).isoformat(),
        }
        _save_hvd_check_cache(result)
        _set_hvd_status(error=None)
    except Exception as exc:
        _set_hvd_status(error=str(exc))
    finally:
        _set_hvd_status(running=False, cancel_requested=False)


@app.route("/api/quality/hvd-check", methods=["POST"])
def start_hvd_check():
    err = _require_admin()
    if err:
        return err
    if _get_hvd_status()["running"]:
        return jsonify({"started": False, "already_running": True})
    _set_hvd_status(running=True, started_at=datetime.now(timezone.utc).isoformat(),
                     cancel_requested=False, total=0, completed=0, error=None)
    threading.Thread(target=_do_run_hvd_check, daemon=True).start()
    return jsonify({"started": True})


@app.route("/api/quality/hvd-check/cancel", methods=["POST"])
def cancel_hvd_check():
    err = _require_admin()
    if err:
        return err
    if not _get_hvd_status()["running"]:
        return jsonify({"cancelled": False, "reason": "not_running"})
    _set_hvd_status(cancel_requested=True)
    return jsonify({"cancelled": True})


@app.route("/api/quality/hvd-check")
def get_hvd_check():
    status = _get_hvd_status()
    return jsonify({
        "running":    status["running"],
        "started_at": status["started_at"],
        "error":      status["error"],
        "result":     _load_hvd_check_result(),
        "total":      status["total"],
        "completed":  status["completed"],
        "cancelling": status["cancel_requested"],
    })


_HVD_EXPORT_PREDICATES = {
    "non_conforming":       lambda d: not d.get("conforms"),
    "legal_citation_issue": lambda d: bool(d.get("legal_citation_issue")),
    "no_api_access":        lambda d: bool(d.get("no_api_access")),
    "license_missing":      lambda d: d.get("license_status") == "missing",
    "license_non_open":     lambda d: d.get("license_status") == "non_open",
    "publisher_mismatch":   lambda d: bool(d.get("publisher_mismatch")),
}
_HVD_LICENSE_STATUS_LABELS = {"missing": "Missing", "non_open": "Not confirmed open", "open": "Open"}


@app.route("/api/quality/hvd-check/export")
def hvd_check_export():
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment

    result = _load_hvd_check_result()
    if not result:
        return jsonify({"error": "No HVD check results to export yet."}), 404

    datasets = result.get("datasets") or []

    # Mirrors the on-screen summary-card filters and search box exactly, so
    # exporting after narrowing the table down produces a file with just
    # what's currently shown rather than always the full flagged list.
    filters = [f for f in (freq.args.get("filters") or "").split(",") if f in _HVD_EXPORT_PREDICATES]
    if filters:
        datasets = [d for d in datasets if all(_HVD_EXPORT_PREDICATES[f](d) for f in filters)]
    q = _search_normalize((freq.args.get("q") or "").strip())
    if q:
        datasets = [
            d for d in datasets
            if q in _search_normalize(d.get("title", "")) or q in _search_normalize(d.get("org_title", ""))
        ]
    datasets = sorted(datasets, key=lambda d: (d.get("org_title") or "", -(d.get("violation_count") or 0)))

    wb = Workbook()

    summary_ws = wb.active
    summary_ws.title = "Summary"
    s = result.get("summary") or {}
    summary_rows = [
        ("Total HVD-tagged datasets", s.get("total")),
        ("Checked", s.get("checked")),
        ("Could not be fetched", s.get("failed_to_fetch")),
        ("Reused from cache", s.get("reused_from_cache")),
        ("Conforms to SHACL shapes", s.get("conforms")),
        ("Legal citation issue", s.get("legal_citation_issue")),
        ("No API access", s.get("no_api_access")),
        ("License missing", s.get("license_missing")),
        ("License not confirmed open", s.get("license_non_open")),
        ("Publisher mismatch", s.get("publisher_mismatch")),
        ("Run finished at", result.get("finished_at")),
        ("Partial run (cancelled early)", "Yes" if result.get("partial") else "No"),
    ]
    hdr_font = Font(bold=True, color="FFFFFF")
    hdr_fill = PatternFill("solid", fgColor="2563EB")
    for row_idx, (label, value) in enumerate(summary_rows, 1):
        summary_ws.cell(row_idx, 1, label).font = Font(bold=True)
        summary_ws.cell(row_idx, 2, value)
    summary_ws.column_dimensions["A"].width = 32
    summary_ws.column_dimensions["B"].width = 24

    ws = wb.create_sheet("Flagged Datasets")
    columns = [
        ("org_title",           "Organization",         lambda d: d.get("org_title") or ""),
        ("title",               "Dataset",               lambda d: d.get("title") or d.get("name") or ""),
        ("url",                 "URL",                   lambda d: f"{config.PORTAL_BASE}/dataset/{d.get('name', '')}"),
        ("conforms",            "Conforms",              lambda d: "Yes" if d.get("conforms") else "No"),
        ("violation_count",     "Violations",            lambda d: d.get("violation_count") or 0),
        ("warning_count",       "Warnings",               lambda d: d.get("warning_count") or 0),
        ("legal_citation_issue","Legal citation issue",  lambda d: "Yes" if d.get("legal_citation_issue") else "No"),
        ("no_api_access",       "No API access",          lambda d: "Yes" if d.get("no_api_access") else "No"),
        ("license_status",      "License status",         lambda d: _HVD_LICENSE_STATUS_LABELS.get(d.get("license_status"), d.get("license_status") or "")),
        ("publisher_mismatch",  "Publisher mismatch",     lambda d: "Yes" if d.get("publisher_mismatch") else "No"),
        ("issues",              "Issues",                lambda d: "\n".join(
            f"[{v.get('severity')}] {v.get('message')}" + (f" (×{v['count']})" if v.get("count", 1) > 1 else "")
            for v in d.get("details") or []
        )),
    ]
    for col_idx, (_key, header, _getter) in enumerate(columns, 1):
        cell = ws.cell(1, col_idx, header)
        cell.font = hdr_font
        cell.fill = hdr_fill
        cell.alignment = Alignment(horizontal="center")

    for ri, d in enumerate(datasets, 2):
        for col_idx, (key, _header, getter) in enumerate(columns, 1):
            cell = ws.cell(ri, col_idx, getter(d))
            if key == "issues":
                cell.alignment = Alignment(wrap_text=True, vertical="top")

    for col in ws.columns:
        width = max((len(str(cell.value or "").split("\n")[0]) for cell in col), default=0)
        ws.column_dimensions[col[0].column_letter].width = min(width + 2, 60)

    if datasets:
        ws.auto_filter.ref = ws.dimensions
        ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return send_file(
        buf,
        as_attachment=True,
        download_name=f"hvd_compliance_{today}.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@app.route("/api/quality/hvd-check/clear", methods=["POST"])
def clear_hvd_check_cache():
    err = _require_admin()
    if err:
        return err
    if _get_hvd_status()["running"]:
        return jsonify({"cleared": False, "reason": "running"})
    HvdDatasetCheckCache.query.delete()
    HvdCheckCache.query.delete()
    db.session.commit()
    _set_hvd_status(error=None, started_at=None, total=0, completed=0)
    return jsonify({"cleared": True})


# ── DCAT-AP compliance check (base DCAT-AP + MDR vocabulary SHACL) ──────────
# Unlike the HVD check above (only the ~1,100 HVD-tagged datasets against
# HVD-specific rules), this validates *every* dataset on the portal
# (~22,600+) against the EU's baseline DCAT-AP structural shapes plus the
# MDR controlled-vocabulary shapes (both vendored from SEMICeu's
# dcat-ap_shacl repo) -- the same rules data.europa.eu itself checks
# harvested metadata against. Same incremental-caching/background-check/
# DB-backed-status architecture as the HVD check, just scoped to the whole
# catalog instead of one tag.
_DCAT_SHAPES_GRAPH = rdflib.Graph()
_DCAT_SHAPES_GRAPH.parse(
    data=(Path(__file__).parent / "shacl" / "dcat-ap.shapes.ttl").read_text(encoding="utf-8"), format="turtle")
_DCAT_SHAPES_GRAPH.parse(
    data=(Path(__file__).parent / "shacl" / "dcat-ap-mdr-vocabularies.shapes.ttl").read_text(encoding="utf-8"), format="turtle")

_DCAT_CHECK_REFRESH_INTERVAL = 24 * 3600
_DCAT_CHECK_CONCURRENCY = 5   # same conservative pool as the HVD check -- gentle on data.gov.gr, not maximizing throughput
_DCAT_CHECK_TIMEOUT = 30
# Bump whenever _dcat_check_one()'s result schema/logic changes -- see
# _HVD_CHECK_VERSION's comment, same reasoning.
_DCAT_CHECK_VERSION = 2  # bumped: vocabulary augmentation now dereferences vcard:hasEmail/dct:format
                          # and follows one more hop to each concept's own skos:ConceptScheme,
                          # instead of merging whole fetched documents in (which caused false
                          # positives on unrelated sibling vocabulary entries -- see
                          # _merge_vocab_node_facts)
_DCAT_CHECK_STALE_AFTER = 10 * 60


def _save_dcat_check_cache(result: dict) -> None:
    with app.app_context():
        row = DcatApCheckCache.query.get(1)
        if not row:
            row = DcatApCheckCache(id=1, data_json="{}")
            db.session.add(row)
        row.data_json  = json.dumps(result)
        row.fetched_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.session.commit()


def _load_dcat_check_result():
    with app.app_context():
        row = DcatApCheckCache.query.get(1)
        return row.data() if row else None


def _dcat_status_row() -> DcatApCheckStatus:
    row = DcatApCheckStatus.query.get(1)
    if not row:
        row = DcatApCheckStatus(id=1, running=False, total=0, completed=0, cancel_requested=False)
        db.session.add(row)
        db.session.commit()
    return row


def _get_dcat_status() -> dict:
    with app.app_context():
        row = _dcat_status_row()
        if row.running and row.updated_at:
            stale = (datetime.now(timezone.utc).replace(tzinfo=None) - row.updated_at).total_seconds() > _DCAT_CHECK_STALE_AFTER
            if stale:
                row.running          = False
                row.cancel_requested = False
                row.error            = "Abandoned run (the worker that started it never finished, likely a restart)."
                db.session.commit()
        return {
            "running":          row.running,
            "started_at":       row.started_at,
            "total":            row.total,
            "completed":        row.completed,
            "cancel_requested": row.cancel_requested,
            "error":            row.error,
        }


def _set_dcat_status(**fields) -> None:
    with app.app_context():
        row = _dcat_status_row()
        for key, value in fields.items():
            setattr(row, key, value)
        row.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.session.commit()


def _bump_dcat_progress(completed: int) -> bool:
    with app.app_context():
        row = _dcat_status_row()
        row.completed  = completed
        row.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.session.commit()
        return row.cancel_requested


# Every property the base DCAT-AP + MDR vocabulary shapes (and GeoDCAT-AP's
# own, larger shape set) check against an EU controlled vocabulary
# (skos:Concept/skos:inScheme, or a class like dct:LicenseDocument/vcard:Email)
# -- without dereferencing these reference URIs, the definition triples that
# make that check pass live in a separate document from the dataset's own
# RDF export, so the shapes validate blind. Same fix as _augment_with_vocab,
# generalized to every vocabulary these checks touch instead of just
# hvdCategory/accessService.
_DCAT_VOCAB_PROPS = [
    _DCT_NS.language, _DCAT_NS.theme, _DCT_NS.accrualPeriodicity, _DCT_NS.publisher,
    _DCT_NS.spatial, _ADMS_NS.status, _DCT_NS.license, _DCT_NS.type,
    _DCT_NS.accessRights, _DCATAP_NS.hvdCategory, _DCAT_NS.accessService,
    _VCARD_NS.hasEmail, _DCT_NS.format,
]


def _merge_vocab_node_facts(graph: "rdflib.Graph", ref: "rdflib.URIRef") -> None:
    """Dereference `ref` and merge in only the triples asserting facts about
    that exact node (its own type/scheme/label) -- not every sibling
    resource mentioned in the same fetched document (e.g. a whole
    concept-scheme's member listing), which would otherwise become spurious
    extra validation targets of their own (confirmed by testing: merging
    the whole document in produced false-positive violations on unrelated
    vocabulary entries that were never actually part of the dataset)."""
    vocab_graph = _get_vocab_graph(str(ref))
    if vocab_graph is None:
        return
    for triple in vocab_graph.triples((ref, None, None)):
        graph.add(triple)


def _augment_with_dcat_vocab(graph: "rdflib.Graph") -> None:
    refs = set()
    for prop in _DCAT_VOCAB_PROPS:
        refs |= set(graph.objects(None, prop))
    for ref in refs:
        if not isinstance(ref, rdflib.URIRef):
            continue
        _merge_vocab_node_facts(graph, ref)
        # A SKOS concept's own document typically doesn't also assert
        # "<its scheme> a skos:ConceptScheme" -- that triple lives in the
        # scheme's own document, one more hop away. Without it, every
        # dataset using a perfectly valid EU vocabulary term would fail the
        # "is the scheme a real skos:ConceptScheme" check identically.
        for scheme in list(graph.objects(ref, _SKOS_NS.inScheme)):
            if isinstance(scheme, rdflib.URIRef):
                _merge_vocab_node_facts(graph, scheme)


# Plain-language label for each RDF property the DCAT-AP + MDR vocabulary
# shapes check, same idea as _HVD_PATH_LABELS.
_DCAT_PATH_LABELS = {
    "title":               "the title",
    "description":         "the description",
    "publisher":           "the publisher",
    "language":            "the language",
    "theme":               "the theme/category classification",
    "accrualPeriodicity":  "the update frequency",
    "spatial":             "the geographic coverage",
    "license":             "the license",
    "type":                "the resource type",
    "accessRights":        "the access rights statement",
    "status":              "the distribution's status",
    "format":               "the file format",
    "mediaType":            "the media type",
    "contactPoint":         "the contact point",
    "distribution":         "at least one distribution (downloadable file/API)",
    "accessService":        "the linked API (access service)",
    "hasEmail":             "the contact point's email address",
    "hasURL":               "the contact point's web address",
}


def _friendly_dcat_message(path_s: str, comp, raw_msg: str) -> str:
    return _generic_property_message(path_s, comp, _DCAT_PATH_LABELS) or raw_msg or "Unrecognized SHACL validation issue."


def _classify_dcat_results(results_graph: "rdflib.Graph"):
    violations, warnings = [], []
    vocabulary_issue = False
    structural_issue = False
    for r in results_graph.subjects(rdflib.RDF.type, _SH_NS.ValidationResult):
        sev   = results_graph.value(r, _SH_NS.resultSeverity)
        msg   = results_graph.value(r, _SH_NS.resultMessage)
        path  = results_graph.value(r, _SH_NS.resultPath)
        shape = results_graph.value(r, _SH_NS.sourceShape)
        comp  = results_graph.value(r, _SH_NS.sourceConstraintComponent)
        path_s  = str(path) if path is not None else ""
        shape_s = str(shape) if shape is not None else ""
        raw_msg = str(msg) if msg else ""
        entry = {
            "severity":    "violation" if sev == _SH_NS.Violation else "warning",
            "path":        path_s or None,
            "message":     _friendly_dcat_message(path_s, comp, raw_msg),
            "raw_message": raw_msg,
        }
        if sev == _SH_NS.Violation:
            violations.append(entry)
            # The MDR vocabulary shapes file's shapes all live under the
            # http://data.europa.eu/r5r/mdrcv# base URI -- distinguishing a
            # "used the wrong controlled-vocabulary value" violation from a
            # "missing/malformed core DCAT-AP field" one.
            if "mdrcv" in shape_s:
                vocabulary_issue = True
            else:
                structural_issue = True
        else:
            warnings.append(entry)
    return violations, warnings, vocabulary_issue, structural_issue


def _dcat_check_one(name: str) -> dict:
    url = f"{config.PORTAL_BASE}/dataset/{name}.rdf"
    r = requests.get(url, timeout=_DCAT_CHECK_TIMEOUT,
                      headers={"Accept": "application/rdf+xml", "User-Agent": "DataGovGR-Dashboard/1.0"})
    r.raise_for_status()
    graph = rdflib.Graph()
    graph.parse(data=r.text, format="xml")
    _augment_with_dcat_vocab(graph)

    conforms, results_graph, _ = pyshacl.validate(
        graph, shacl_graph=_DCAT_SHAPES_GRAPH, inference="rdfs", debug=False,
    )
    violations, warnings, vocabulary_issue, structural_issue = _classify_dcat_results(results_graph)

    title = None
    for t in graph.objects(None, _DCT_NS.title):
        title = str(t)
        break

    return {
        "name":             name,
        "title":            title or name,
        "conforms":         conforms,
        "violation_count":  len(violations),
        "warning_count":    len(warnings),
        "vocabulary_issue": vocabulary_issue,
        "structural_issue": structural_issue,
        "details":          _dedupe_shacl_details(violations + warnings),
    }


def _list_all_datasets() -> list:
    """[{"name":..., "metadata_modified":..., "org_title":...}, ...] for
    every dataset on the portal -- same paginated package_search as
    _list_hvd_datasets, just without the hvd_category filter."""
    items = []
    start, batch = 0, 100
    while True:
        r = requests.get(
            f"{config.API_BASE}/package_search",
            params={"rows": batch, "start": start, "fl": "name,metadata_modified,organization"},
            headers=_api_headers(), timeout=config.REQUEST_TIMEOUT,
        )
        r.raise_for_status()
        data = r.json()
        if not data.get("success"):
            break
        results = data["result"]["results"]
        if not results:
            break
        items.extend(
            {
                "name":              p["name"],
                "metadata_modified": p.get("metadata_modified"),
                "org_title":         (p.get("organization_card") or {}).get("title") or "",
            }
            for p in results if p.get("name")
        )
        start += batch
        if start >= data["result"]["count"]:
            break
    return items


def _do_run_dcat_check() -> None:
    cancelled = False
    try:
        datasets = _list_all_datasets()
        _set_dcat_status(total=len(datasets))

        with app.app_context():
            cached_rows = {row.name: row for row in DcatApDatasetCheckCache.query.all()}

        to_fetch, rows = [], []
        for d in datasets:
            row = cached_rows.get(d["name"])
            cached = row.result() if (row and row.result_json) else None
            if (cached and isinstance(cached, dict) and cached.get("_cache_version") == _DCAT_CHECK_VERSION
                    and row.metadata_modified == d["metadata_modified"]):
                cached_result = cached["result"]
                cached_result["org_title"] = d.get("org_title", "")
                rows.append(cached_result)
            else:
                to_fetch.append(d)
        _bump_dcat_progress(len(rows))

        newly_checked = []
        pool = ThreadPoolExecutor(max_workers=_DCAT_CHECK_CONCURRENCY)
        try:
            futures = {pool.submit(_dcat_check_one, d["name"]): d for d in to_fetch}
            for fut in as_completed(futures):
                d = futures[fut]
                try:
                    result = fut.result()
                    result["org_title"] = d.get("org_title", "")
                    rows.append(result)
                    newly_checked.append((d["name"], d["metadata_modified"], result))
                except Exception as exc:
                    rows.append({"name": d["name"], "error": str(exc)})
                    newly_checked.append((d["name"], d["metadata_modified"], None))
                if _bump_dcat_progress(len(rows)):
                    cancelled = True
                    break
        finally:
            pool.shutdown(wait=False, cancel_futures=True)

        if newly_checked:
            with app.app_context():
                for name, mtime, result in newly_checked:
                    row = DcatApDatasetCheckCache.query.get(name)
                    if not row:
                        row = DcatApDatasetCheckCache(name=name)
                        db.session.add(row)
                    row.checked_at = datetime.now(timezone.utc).replace(tzinfo=None)
                    if result is not None:
                        row.metadata_modified = mtime
                        row.result_json = json.dumps({"_cache_version": _DCAT_CHECK_VERSION, "result": result})
                db.session.commit()

        checked = [r for r in rows if "error" not in r]
        failed  = [r for r in rows if "error" in r]
        summary = {
            "total":             len(datasets),
            "checked":           len(checked),
            "failed_to_fetch":   len(failed),
            "reused_from_cache": len(datasets) - len(to_fetch),
            "conforms":          sum(1 for r in checked if r["conforms"]),
            "vocabulary_issue":  sum(1 for r in checked if r["vocabulary_issue"]),
            "structural_issue":  sum(1 for r in checked if r["structural_issue"]),
        }
        flagged = [r for r in checked if not r["conforms"]]
        flagged.sort(key=lambda r: -r["violation_count"])
        result = {
            "summary":     summary,
            "datasets":    flagged,
            "partial":     cancelled,
            "finished_at": datetime.now(timezone.utc).isoformat(),
        }
        _save_dcat_check_cache(result)
        _set_dcat_status(error=None)
    except Exception as exc:
        _set_dcat_status(error=str(exc))
    finally:
        _set_dcat_status(running=False, cancel_requested=False)


@app.route("/api/quality/dcat-check", methods=["POST"])
def start_dcat_check():
    err = _require_admin()
    if err:
        return err
    if _get_dcat_status()["running"]:
        return jsonify({"started": False, "already_running": True})
    _set_dcat_status(running=True, started_at=datetime.now(timezone.utc).isoformat(),
                      cancel_requested=False, total=0, completed=0, error=None)
    threading.Thread(target=_do_run_dcat_check, daemon=True).start()
    return jsonify({"started": True})


@app.route("/api/quality/dcat-check/cancel", methods=["POST"])
def cancel_dcat_check():
    err = _require_admin()
    if err:
        return err
    if not _get_dcat_status()["running"]:
        return jsonify({"cancelled": False, "reason": "not_running"})
    _set_dcat_status(cancel_requested=True)
    return jsonify({"cancelled": True})


@app.route("/api/quality/dcat-check")
def get_dcat_check():
    status = _get_dcat_status()
    return jsonify({
        "running":    status["running"],
        "started_at": status["started_at"],
        "error":      status["error"],
        "result":     _load_dcat_check_result(),
        "total":      status["total"],
        "completed":  status["completed"],
        "cancelling": status["cancel_requested"],
    })


_DCAT_EXPORT_PREDICATES = {
    "non_conforming":   lambda d: not d.get("conforms"),
    "vocabulary_issue": lambda d: bool(d.get("vocabulary_issue")),
    "structural_issue": lambda d: bool(d.get("structural_issue")),
}


@app.route("/api/quality/dcat-check/export")
def dcat_check_export():
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment

    result = _load_dcat_check_result()
    if not result:
        return jsonify({"error": "No DCAT-AP check results to export yet."}), 404

    datasets = result.get("datasets") or []
    filters = [f for f in (freq.args.get("filters") or "").split(",") if f in _DCAT_EXPORT_PREDICATES]
    if filters:
        datasets = [d for d in datasets if all(_DCAT_EXPORT_PREDICATES[f](d) for f in filters)]
    q = _search_normalize((freq.args.get("q") or "").strip())
    if q:
        datasets = [
            d for d in datasets
            if q in _search_normalize(d.get("title", "")) or q in _search_normalize(d.get("org_title", ""))
        ]
    datasets = sorted(datasets, key=lambda d: (d.get("org_title") or "", -(d.get("violation_count") or 0)))

    wb = Workbook()

    summary_ws = wb.active
    summary_ws.title = "Summary"
    s = result.get("summary") or {}
    summary_rows = [
        ("Total datasets",         s.get("total")),
        ("Checked",                s.get("checked")),
        ("Could not be fetched",   s.get("failed_to_fetch")),
        ("Reused from cache",      s.get("reused_from_cache")),
        ("Conforms to SHACL shapes", s.get("conforms")),
        ("Vocabulary issues",      s.get("vocabulary_issue")),
        ("Structural issues",      s.get("structural_issue")),
        ("Run finished at",        result.get("finished_at")),
        ("Partial run (cancelled early)", "Yes" if result.get("partial") else "No"),
    ]
    hdr_font = Font(bold=True, color="FFFFFF")
    hdr_fill = PatternFill("solid", fgColor="2563EB")
    for row_idx, (label, value) in enumerate(summary_rows, 1):
        summary_ws.cell(row_idx, 1, label).font = Font(bold=True)
        summary_ws.cell(row_idx, 2, value)
    summary_ws.column_dimensions["A"].width = 32
    summary_ws.column_dimensions["B"].width = 24

    ws = wb.create_sheet("Flagged Datasets")
    columns = [
        ("org_title",          "Organization",     lambda d: d.get("org_title") or ""),
        ("title",              "Dataset",          lambda d: d.get("title") or d.get("name") or ""),
        ("url",                "URL",              lambda d: f"{config.PORTAL_BASE}/dataset/{d.get('name', '')}"),
        ("conforms",           "Conforms",         lambda d: "Yes" if d.get("conforms") else "No"),
        ("violation_count",    "Violations",       lambda d: d.get("violation_count") or 0),
        ("warning_count",      "Warnings",         lambda d: d.get("warning_count") or 0),
        ("vocabulary_issue",   "Vocabulary issue",  lambda d: "Yes" if d.get("vocabulary_issue") else "No"),
        ("structural_issue",   "Structural issue",  lambda d: "Yes" if d.get("structural_issue") else "No"),
        ("issues",             "Issues",           lambda d: "\n".join(
            f"[{v.get('severity')}] {v.get('message')}" + (f" (×{v['count']})" if v.get("count", 1) > 1 else "")
            for v in d.get("details") or []
        )),
    ]
    for col_idx, (_key, header, _getter) in enumerate(columns, 1):
        cell = ws.cell(1, col_idx, header)
        cell.font = hdr_font
        cell.fill = hdr_fill
        cell.alignment = Alignment(horizontal="center")

    for ri, d in enumerate(datasets, 2):
        for col_idx, (key, _header, getter) in enumerate(columns, 1):
            cell = ws.cell(ri, col_idx, getter(d))
            if key == "issues":
                cell.alignment = Alignment(wrap_text=True, vertical="top")

    for col in ws.columns:
        width = max((len(str(cell.value or "").split("\n")[0]) for cell in col), default=0)
        ws.column_dimensions[col[0].column_letter].width = min(width + 2, 60)

    if datasets:
        ws.auto_filter.ref = ws.dimensions
        ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return send_file(
        buf,
        as_attachment=True,
        download_name=f"dcat_ap_compliance_{today}.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@app.route("/api/quality/dcat-check/clear", methods=["POST"])
def clear_dcat_check_cache():
    err = _require_admin()
    if err:
        return err
    if _get_dcat_status()["running"]:
        return jsonify({"cleared": False, "reason": "running"})
    DcatApDatasetCheckCache.query.delete()
    DcatApCheckCache.query.delete()
    db.session.commit()
    _set_dcat_status(error=None, started_at=None, total=0, completed=0)
    return jsonify({"cleared": True})


# ── GeoDCAT-AP compliance check (geospatial extension SHACL) ────────────────
# Scoped to only the datasets CKAN classifies as geospatial (dcat_type
# authority code GEOSPATIAL, same _is_geospatial() test the Geospatial
# Insights tab uses) -- ~12,500 of the ~22,600 total, a standalone shape set
# (not combined with the base DCAT-AP shapes -- GeoDCAT-AP's own shapes
# already redeclare dcat:Dataset/Distribution/DataService etc. themselves).
_GEODCAT_SHAPES_GRAPH = rdflib.Graph()
_GEODCAT_SHAPES_GRAPH.parse(
    data=(Path(__file__).parent / "shacl" / "geodcat-ap.shapes.ttl").read_text(encoding="utf-8"), format="turtle")

_GEODCAT_CHECK_REFRESH_INTERVAL = 24 * 3600
_GEODCAT_CHECK_CONCURRENCY = 5
_GEODCAT_CHECK_TIMEOUT = 30
_GEODCAT_CHECK_VERSION = 1
_GEODCAT_CHECK_STALE_AFTER = 10 * 60


def _save_geodcat_check_cache(result: dict) -> None:
    with app.app_context():
        row = GeoDcatCheckCache.query.get(1)
        if not row:
            row = GeoDcatCheckCache(id=1, data_json="{}")
            db.session.add(row)
        row.data_json  = json.dumps(result)
        row.fetched_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.session.commit()


def _load_geodcat_check_result():
    with app.app_context():
        row = GeoDcatCheckCache.query.get(1)
        return row.data() if row else None


def _geodcat_status_row() -> GeoDcatCheckStatus:
    row = GeoDcatCheckStatus.query.get(1)
    if not row:
        row = GeoDcatCheckStatus(id=1, running=False, total=0, completed=0, cancel_requested=False)
        db.session.add(row)
        db.session.commit()
    return row


def _get_geodcat_status() -> dict:
    with app.app_context():
        row = _geodcat_status_row()
        if row.running and row.updated_at:
            stale = (datetime.now(timezone.utc).replace(tzinfo=None) - row.updated_at).total_seconds() > _GEODCAT_CHECK_STALE_AFTER
            if stale:
                row.running          = False
                row.cancel_requested = False
                row.error            = "Abandoned run (the worker that started it never finished, likely a restart)."
                db.session.commit()
        return {
            "running":          row.running,
            "started_at":       row.started_at,
            "total":            row.total,
            "completed":        row.completed,
            "cancel_requested": row.cancel_requested,
            "error":            row.error,
        }


def _set_geodcat_status(**fields) -> None:
    with app.app_context():
        row = _geodcat_status_row()
        for key, value in fields.items():
            setattr(row, key, value)
        row.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.session.commit()


def _bump_geodcat_progress(completed: int) -> bool:
    with app.app_context():
        row = _geodcat_status_row()
        row.completed  = completed
        row.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.session.commit()
        return row.cancel_requested


def _geodcat_check_one(name: str) -> dict:
    url = f"{config.PORTAL_BASE}/dataset/{name}.rdf"
    r = requests.get(url, timeout=_GEODCAT_CHECK_TIMEOUT,
                      headers={"Accept": "application/rdf+xml", "User-Agent": "DataGovGR-Dashboard/1.0"})
    r.raise_for_status()
    graph = rdflib.Graph()
    graph.parse(data=r.text, format="xml")
    _augment_with_dcat_vocab(graph)

    conforms, results_graph, _ = pyshacl.validate(
        graph, shacl_graph=_GEODCAT_SHAPES_GRAPH, inference="rdfs", debug=False,
    )
    violations, warnings = [], []
    for res in results_graph.subjects(rdflib.RDF.type, _SH_NS.ValidationResult):
        sev   = results_graph.value(res, _SH_NS.resultSeverity)
        msg   = results_graph.value(res, _SH_NS.resultMessage)
        path  = results_graph.value(res, _SH_NS.resultPath)
        comp  = results_graph.value(res, _SH_NS.sourceConstraintComponent)
        path_s  = str(path) if path is not None else ""
        raw_msg = str(msg) if msg else ""
        entry = {
            "severity":    "violation" if sev == _SH_NS.Violation else "warning",
            "path":        path_s or None,
            "message":     _friendly_dcat_message(path_s, comp, raw_msg),
            "raw_message": raw_msg,
        }
        (violations if sev == _SH_NS.Violation else warnings).append(entry)

    title = None
    for t in graph.objects(None, _DCT_NS.title):
        title = str(t)
        break

    return {
        "name":            name,
        "title":           title or name,
        "conforms":        conforms,
        "violation_count": len(violations),
        "warning_count":   len(warnings),
        "details":         _dedupe_shacl_details(violations + warnings),
    }


def _list_geo_datasets() -> list:
    """Same as _list_all_datasets, filtered server-side to datasets CKAN's
    own dcat_type facet marks as geospatial (GIS layers, WMS/WFS services,
    etc.) -- the identical test _is_geospatial() applies client-side to a
    single package, expressed as a Solr fq so we don't have to paginate the
    entire catalog just to filter it down here."""
    items = []
    start, batch = 0, 100
    while True:
        r = requests.get(
            f"{config.API_BASE}/package_search",
            params={"rows": batch, "start": start, "fq": 'dcat_type:*GEOSPATIAL*',
                    "fl": "name,metadata_modified,organization"},
            headers=_api_headers(), timeout=config.REQUEST_TIMEOUT,
        )
        r.raise_for_status()
        data = r.json()
        if not data.get("success"):
            break
        results = data["result"]["results"]
        if not results:
            break
        items.extend(
            {
                "name":              p["name"],
                "metadata_modified": p.get("metadata_modified"),
                "org_title":         (p.get("organization_card") or {}).get("title") or "",
            }
            for p in results if p.get("name")
        )
        start += batch
        if start >= data["result"]["count"]:
            break
    return items


def _do_run_geodcat_check() -> None:
    cancelled = False
    try:
        datasets = _list_geo_datasets()
        _set_geodcat_status(total=len(datasets))

        with app.app_context():
            cached_rows = {row.name: row for row in GeoDcatDatasetCheckCache.query.all()}

        to_fetch, rows = [], []
        for d in datasets:
            row = cached_rows.get(d["name"])
            cached = row.result() if (row and row.result_json) else None
            if (cached and isinstance(cached, dict) and cached.get("_cache_version") == _GEODCAT_CHECK_VERSION
                    and row.metadata_modified == d["metadata_modified"]):
                cached_result = cached["result"]
                cached_result["org_title"] = d.get("org_title", "")
                rows.append(cached_result)
            else:
                to_fetch.append(d)
        _bump_geodcat_progress(len(rows))

        newly_checked = []
        pool = ThreadPoolExecutor(max_workers=_GEODCAT_CHECK_CONCURRENCY)
        try:
            futures = {pool.submit(_geodcat_check_one, d["name"]): d for d in to_fetch}
            for fut in as_completed(futures):
                d = futures[fut]
                try:
                    result = fut.result()
                    result["org_title"] = d.get("org_title", "")
                    rows.append(result)
                    newly_checked.append((d["name"], d["metadata_modified"], result))
                except Exception as exc:
                    rows.append({"name": d["name"], "error": str(exc)})
                    newly_checked.append((d["name"], d["metadata_modified"], None))
                if _bump_geodcat_progress(len(rows)):
                    cancelled = True
                    break
        finally:
            pool.shutdown(wait=False, cancel_futures=True)

        if newly_checked:
            with app.app_context():
                for name, mtime, result in newly_checked:
                    row = GeoDcatDatasetCheckCache.query.get(name)
                    if not row:
                        row = GeoDcatDatasetCheckCache(name=name)
                        db.session.add(row)
                    row.checked_at = datetime.now(timezone.utc).replace(tzinfo=None)
                    if result is not None:
                        row.metadata_modified = mtime
                        row.result_json = json.dumps({"_cache_version": _GEODCAT_CHECK_VERSION, "result": result})
                db.session.commit()

        checked = [r for r in rows if "error" not in r]
        failed  = [r for r in rows if "error" in r]
        summary = {
            "total":             len(datasets),
            "checked":           len(checked),
            "failed_to_fetch":   len(failed),
            "reused_from_cache": len(datasets) - len(to_fetch),
            "conforms":          sum(1 for r in checked if r["conforms"]),
        }
        flagged = [r for r in checked if not r["conforms"]]
        flagged.sort(key=lambda r: -r["violation_count"])
        result = {
            "summary":     summary,
            "datasets":    flagged,
            "partial":     cancelled,
            "finished_at": datetime.now(timezone.utc).isoformat(),
        }
        _save_geodcat_check_cache(result)
        _set_geodcat_status(error=None)
    except Exception as exc:
        _set_geodcat_status(error=str(exc))
    finally:
        _set_geodcat_status(running=False, cancel_requested=False)


@app.route("/api/quality/geodcat-check", methods=["POST"])
def start_geodcat_check():
    err = _require_admin()
    if err:
        return err
    if _get_geodcat_status()["running"]:
        return jsonify({"started": False, "already_running": True})
    _set_geodcat_status(running=True, started_at=datetime.now(timezone.utc).isoformat(),
                         cancel_requested=False, total=0, completed=0, error=None)
    threading.Thread(target=_do_run_geodcat_check, daemon=True).start()
    return jsonify({"started": True})


@app.route("/api/quality/geodcat-check/cancel", methods=["POST"])
def cancel_geodcat_check():
    err = _require_admin()
    if err:
        return err
    if not _get_geodcat_status()["running"]:
        return jsonify({"cancelled": False, "reason": "not_running"})
    _set_geodcat_status(cancel_requested=True)
    return jsonify({"cancelled": True})


@app.route("/api/quality/geodcat-check")
def get_geodcat_check():
    status = _get_geodcat_status()
    return jsonify({
        "running":    status["running"],
        "started_at": status["started_at"],
        "error":      status["error"],
        "result":     _load_geodcat_check_result(),
        "total":      status["total"],
        "completed":  status["completed"],
        "cancelling": status["cancel_requested"],
    })


@app.route("/api/quality/geodcat-check/export")
def geodcat_check_export():
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment

    result = _load_geodcat_check_result()
    if not result:
        return jsonify({"error": "No GeoDCAT-AP check results to export yet."}), 404

    datasets = result.get("datasets") or []
    if (freq.args.get("filters") or "") == "non_conforming":
        datasets = [d for d in datasets if not d.get("conforms")]
    q = _search_normalize((freq.args.get("q") or "").strip())
    if q:
        datasets = [
            d for d in datasets
            if q in _search_normalize(d.get("title", "")) or q in _search_normalize(d.get("org_title", ""))
        ]
    datasets = sorted(datasets, key=lambda d: (d.get("org_title") or "", -(d.get("violation_count") or 0)))

    wb = Workbook()
    summary_ws = wb.active
    summary_ws.title = "Summary"
    s = result.get("summary") or {}
    summary_rows = [
        ("Total geospatial datasets", s.get("total")),
        ("Checked",                   s.get("checked")),
        ("Could not be fetched",      s.get("failed_to_fetch")),
        ("Reused from cache",         s.get("reused_from_cache")),
        ("Conforms to SHACL shapes",  s.get("conforms")),
        ("Run finished at",           result.get("finished_at")),
        ("Partial run (cancelled early)", "Yes" if result.get("partial") else "No"),
    ]
    hdr_font = Font(bold=True, color="FFFFFF")
    hdr_fill = PatternFill("solid", fgColor="2563EB")
    for row_idx, (label, value) in enumerate(summary_rows, 1):
        summary_ws.cell(row_idx, 1, label).font = Font(bold=True)
        summary_ws.cell(row_idx, 2, value)
    summary_ws.column_dimensions["A"].width = 32
    summary_ws.column_dimensions["B"].width = 24

    ws = wb.create_sheet("Flagged Datasets")
    columns = [
        ("org_title",       "Organization", lambda d: d.get("org_title") or ""),
        ("title",           "Dataset",      lambda d: d.get("title") or d.get("name") or ""),
        ("url",             "URL",          lambda d: f"{config.PORTAL_BASE}/dataset/{d.get('name', '')}"),
        ("conforms",        "Conforms",     lambda d: "Yes" if d.get("conforms") else "No"),
        ("violation_count", "Violations",   lambda d: d.get("violation_count") or 0),
        ("warning_count",   "Warnings",     lambda d: d.get("warning_count") or 0),
        ("issues",          "Issues",       lambda d: "\n".join(
            f"[{v.get('severity')}] {v.get('message')}" + (f" (×{v['count']})" if v.get("count", 1) > 1 else "")
            for v in d.get("details") or []
        )),
    ]
    for col_idx, (_key, header, _getter) in enumerate(columns, 1):
        cell = ws.cell(1, col_idx, header)
        cell.font = hdr_font
        cell.fill = hdr_fill
        cell.alignment = Alignment(horizontal="center")
    for ri, d in enumerate(datasets, 2):
        for col_idx, (key, _header, getter) in enumerate(columns, 1):
            cell = ws.cell(ri, col_idx, getter(d))
            if key == "issues":
                cell.alignment = Alignment(wrap_text=True, vertical="top")
    for col in ws.columns:
        width = max((len(str(cell.value or "").split("\n")[0]) for cell in col), default=0)
        ws.column_dimensions[col[0].column_letter].width = min(width + 2, 60)
    if datasets:
        ws.auto_filter.ref = ws.dimensions
        ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return send_file(
        buf, as_attachment=True,
        download_name=f"geodcat_ap_compliance_{today}.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@app.route("/api/quality/geodcat-check/clear", methods=["POST"])
def clear_geodcat_check_cache():
    err = _require_admin()
    if err:
        return err
    if _get_geodcat_status()["running"]:
        return jsonify({"cleared": False, "reason": "running"})
    GeoDcatDatasetCheckCache.query.delete()
    GeoDcatCheckCache.query.delete()
    db.session.commit()
    _set_geodcat_status(error=None, started_at=None, total=0, completed=0)
    return jsonify({"cleared": True})


# ── EU Metadata Quality Assessment (MQA) score ──────────────────────────────
# Not a SHACL check we run ourselves -- data.europa.eu already continuously
# computes this for every national catalogue it harvests (FAIR+ dimensions:
# findability, accessibility, interoperability, reusability, contextuality)
# and publishes it via a small public JSON API. We just fetch and cache it
# periodically; there's nothing to run/cancel and no admin gate on reading it.
_MQA_CATALOGUE_ID = "data-gov-gr"
_MQA_REFRESH_INTERVAL = 24 * 3600  # data.europa.eu recomputes this periodically, not in real time
_mqa_lock = threading.Lock()


def _save_mqa_cache(result: dict) -> None:
    with app.app_context():
        row = MqaCache.query.get(1)
        if not row:
            row = MqaCache(id=1, data_json="{}")
            db.session.add(row)
        row.data_json  = json.dumps(result)
        row.fetched_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.session.commit()


def _load_mqa_cache():
    with app.app_context():
        row = MqaCache.query.get(1)
        return row.data() if row else None


def _do_refresh_mqa() -> dict:
    with _mqa_lock:
        r = requests.get(
            f"https://data.europa.eu/api/mqa/cache/catalogues/{_MQA_CATALOGUE_ID}",
            headers={"User-Agent": "DataGovGR-Dashboard/1.0"}, timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        results = ((data or {}).get("result") or {}).get("results") or []
        if not results:
            raise ValueError("data.europa.eu returned no MQA results for this catalogue")
        result = {"data": results[0], "fetched_at": datetime.now(timezone.utc).isoformat()}
        _save_mqa_cache(result)
        return result


@app.route("/api/quality/mqa")
def get_mqa():
    cached = _load_mqa_cache()
    return jsonify({"result": cached})


@app.route("/api/quality/mqa/refresh", methods=["POST"])
def refresh_mqa():
    err = _require_admin()
    if err:
        return err
    try:
        result = _do_refresh_mqa()
        return jsonify({"refreshed": True, "result": result})
    except Exception as exc:
        return jsonify({"refreshed": False, "error": str(exc)}), 502


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


VALID_STATUSES = {"Initial Contact", "Intermediate Contact", "Positive Response", "Negative Response", "No Response"}
VALID_MEDIUMS  = {"Telephone", "Email", "In Person", "Other"}


def _default_deadline(contact_date_str, days=14):
    try:
        d = datetime.strptime(contact_date_str, "%Y-%m-%d").date()
        return (d + timedelta(days=days)).isoformat()
    except (ValueError, TypeError):
        return None


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
    status = body.get("status", "Initial Contact")
    if status not in VALID_STATUSES:
        return jsonify({"error": f"status must be one of {sorted(VALID_STATUSES)}"}), 400
    medium = (body.get("medium") or "").strip()
    if medium and medium not in VALID_MEDIUMS:
        return jsonify({"error": f"medium must be one of {sorted(VALID_MEDIUMS)}"}), 400
    org_title = (body.get("org_title") or "").strip() or None
    deadline  = (body.get("deadline") or "").strip() or None

    case_id = body.get("case_id")
    if case_id:
        if status == "Initial Contact":
            return jsonify({"error": "Initial Contact is reserved for the entry that opens a case"}), 400
        case = Case.query.get_or_404(int(case_id))
        if deadline:
            case.deadline = deadline
        if status in ("Positive Response", "Negative Response"):  # a resolution closes the case
            case.status = "Closed"
            case.closed_at = datetime.now(timezone.utc).replace(tzinfo=None)
        elif case.status == "Closed":  # any other new entry implies the case is active again
            case.status = "Open"
            case.closed_at = None
    else:
        status = "Initial Contact"  # the entry that opens a case is always its initial contact
        case = Case(
            org_name=org_name, org_title=org_title, subject=subject, status="Open",
            deadline=deadline or _default_deadline(contact_date),
        )
        db.session.add(case)
        db.session.flush()

    comm = Communication(
        case_id=case.id,
        contact_date=contact_date,
        org_name=org_name,
        org_title=org_title,
        subject=subject,
        status=status,
        notes=(body.get("notes") or "").strip() or None,
        contact_person=(body.get("contact_person") or "").strip() or None,
        medium=medium or None,
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
    if ("org_name" in body or "org_title" in body) and comm.case:
        # a case represents one organization -- keep the case header and every
        # sibling entry's org in sync with whichever entry was just edited
        comm.case.org_name = comm.org_name
        comm.case.org_title = comm.org_title
        for sibling in comm.case.communications:
            if sibling.id != comm.id:
                sibling.org_name = comm.org_name
                sibling.org_title = comm.org_title
    if "subject" in body:
        comm.subject = (body["subject"] or "").strip()
    if "status" in body:
        if body["status"] not in VALID_STATUSES:
            return jsonify({"error": f"status must be one of {sorted(VALID_STATUSES)}"}), 400
        if comm.status == "Initial Contact" and body["status"] != "Initial Contact":
            return jsonify({"error": "Initial Contact is reserved for the entry that opens a case and cannot be changed"}), 400
        comm.status = body["status"]
    if "notes" in body:
        comm.notes = (body["notes"] or "").strip() or None
    if "contact_person" in body:
        comm.contact_person = (body["contact_person"] or "").strip() or None
    if "medium" in body:
        medium = (body["medium"] or "").strip()
        if medium and medium not in VALID_MEDIUMS:
            return jsonify({"error": f"medium must be one of {sorted(VALID_MEDIUMS)}"}), 400
        comm.medium = medium or None
    if "deadline" in body and comm.case:
        comm.case.deadline = (body["deadline"] or "").strip() or None
    db.session.commit()
    return jsonify(comm.to_dict())


@app.route("/api/communications/<int:comm_id>/delete", methods=["DELETE", "POST"])
def communications_delete(comm_id):
    comm = Communication.query.get_or_404(comm_id)
    case_id = comm.case_id
    db.session.delete(comm)
    db.session.commit()
    # A case with no communications left serves no purpose -- it's already
    # invisible in every comms view (they're all grouped by iterating entries)
    # and leaving it around only inflates the Total/Open/Closed/stale counts.
    if case_id and not Communication.query.filter_by(case_id=case_id).first():
        case = Case.query.get(case_id)
        if case:
            db.session.delete(case)
            db.session.commit()
    return jsonify({"ok": True})


# ── Cases ─────────────────────────────────────────────────────────────────────

@app.route("/api/cases", methods=["GET"])
def cases_list():
    status_filter = (freq.args.get("status") or "").strip()
    q = Case.query
    if status_filter:
        q = q.filter(Case.status == status_filter)
    cases = q.order_by(Case.opened_at.desc()).all()
    return jsonify([c.to_dict() for c in cases])


@app.route("/api/cases/<int:case_id>", methods=["GET"])
def case_detail(case_id):
    case = Case.query.get_or_404(case_id)
    return jsonify(case.to_dict(include_communications=True))


@app.route("/api/cases/<int:case_id>", methods=["PATCH", "POST"])
def case_update(case_id):
    case = Case.query.get_or_404(case_id)
    body = _decode_payload()
    if "subject" in body:
        subject = (body["subject"] or "").strip()
        if not subject:
            return jsonify({"error": "subject cannot be empty"}), 400
        case.subject = subject
    if "org_name" in body:
        case.org_name = (body["org_name"] or "").strip()
    if "org_title" in body:
        case.org_title = (body["org_title"] or "").strip() or None
    if "deadline" in body:
        case.deadline = (body["deadline"] or "").strip() or None
    db.session.commit()
    return jsonify(case.to_dict())


@app.route("/api/cases/<int:case_id>/close", methods=["POST"])
def case_close(case_id):
    case = Case.query.get_or_404(case_id)
    case.status = "Closed"
    case.closed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.session.commit()
    return jsonify(case.to_dict())


@app.route("/api/cases/<int:case_id>/reopen", methods=["POST"])
def case_reopen(case_id):
    case = Case.query.get_or_404(case_id)
    case.status = "Open"
    case.closed_at = None
    db.session.commit()
    return jsonify(case.to_dict())


@app.route("/api/cases/<int:case_id>/delete", methods=["DELETE", "POST"])
def case_delete(case_id):
    case = Case.query.get_or_404(case_id)
    db.session.delete(case)  # cascades to its communications
    db.session.commit()
    return jsonify({"ok": True})


@app.route("/api/communications/export", methods=["GET"])
def communications_export():
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment

    status_filter      = (freq.args.get("status") or "").strip()
    case_status_filter = (freq.args.get("case_status") or "").strip()
    stale_filter        = (freq.args.get("stale") or "").strip()  # "1" = stale only, "0" = not-stale only, "" = all
    q = (freq.args.get("q") or "").strip().lower()

    rows = Communication.query.order_by(
        Communication.contact_date.desc(), Communication.created_at.desc()
    ).all()

    if status_filter:
        rows = [r for r in rows if r.status == status_filter]
    if case_status_filter:
        rows = [r for r in rows if r.case and r.case.status == case_status_filter]
    if stale_filter == "1":
        rows = [r for r in rows if r.case and r.case.is_stale]
    elif stale_filter == "0":
        rows = [r for r in rows if not (r.case and r.case.is_stale)]
    if q:
        rows = [r for r in rows if any(
            q in (v or "").lower()
            for v in [r.org_title, r.org_name, r.subject, r.notes, r.status, r.medium]
        )]

    wb = Workbook()
    ws = wb.active
    ws.title = "Communications"

    headers = ["Case ID", "Date", "Organization", "Subject", "Status", "Medium", "Case Status", "Notes", "Created At"]
    header_fill = PatternFill("solid", fgColor="1E3A5F")
    header_font = Font(bold=True, color="FFFFFF")
    col_widths  = [10, 14, 36, 42, 16, 14, 14, 48, 22]

    for col_idx, (header, width) in enumerate(zip(headers, col_widths), start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")
        ws.column_dimensions[cell.column_letter].width = width

    ws.row_dimensions[1].height = 20

    for row_idx, r in enumerate(rows, start=2):
        ws.cell(row=row_idx, column=1, value=r.case_id)
        ws.cell(row=row_idx, column=2, value=r.contact_date)
        ws.cell(row=row_idx, column=3, value=r.org_title or r.org_name)
        ws.cell(row=row_idx, column=4, value=r.subject)
        ws.cell(row=row_idx, column=5, value=r.status)
        ws.cell(row=row_idx, column=6, value=r.medium or "")
        ws.cell(row=row_idx, column=7, value=r.case.status if r.case else "")
        ws.cell(row=row_idx, column=8, value=r.notes or "")
        ws.cell(row=row_idx, column=9, value=(
            r.created_at.strftime("%Y-%m-%d %H:%M") if r.created_at else ""
        ))
        for col_idx in range(1, 10):
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





_CONTACTS_IMPORT_MAX_BYTES = 5 * 1024 * 1024  # 5MB -- generous for a contacts spreadsheet


@app.route("/api/contacts/import", methods=["POST"])
def contacts_import():
    err = _require_admin()
    if err:
        return err

    import unicodedata
    from openpyxl import load_workbook

    file = freq.files.get("file")
    if not file:
        return jsonify({"error": "No file provided"}), 400
    if not (file.filename or "").lower().endswith(".xlsx"):
        return jsonify({"error": "Only .xlsx files are accepted"}), 400

    try:
        raw = file.read(_CONTACTS_IMPORT_MAX_BYTES + 1)
        if len(raw) > _CONTACTS_IMPORT_MAX_BYTES:
            return jsonify({"error": "File too large (max 5MB)"}), 413
        buf = io.BytesIO(raw)

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


def _search_normalize(s):
    import unicodedata
    s = unicodedata.normalize("NFD", str(s or ""))
    return "".join(ch for ch in s if not unicodedata.combining(ch)).lower()


_CONTACT_EXPORT_ROLE_LABELS = {"admin": "Org Administrator", "editor": "Org Editor", "member": "Org Member", "user": "User"}


def _contact_export_role(m):
    if m.get("sysadmin"):
        return "Sysadmin"
    return _CONTACT_EXPORT_ROLE_LABELS.get(m.get("capacity"), m.get("capacity") or "")


# Canonical export columns: key -> (header, value getter over a portal-member dict).
# Order here is the order columns appear in the workbook regardless of ?columns= order.
_CONTACT_EXPORT_COLUMNS = [
    ("org",          "Organization",   lambda m: m.get("org_title") or m.get("org_name") or ""),
    # contact_first_name/contact_last_name only exist when this portal account was
    # matched to a contact-file entry by email; most accounts have no such match,
    # so fall back to the CKAN account's own display name (what the Contacts tab
    # itself shows for every row) rather than leaving the export blank.
    ("first_name",   "First Name",     lambda m: m.get("contact_first_name") or m.get("display_name") or m.get("username", "")),
    ("last_name",    "Last Name",      lambda m: m.get("contact_last_name", "")),
    ("position",     "Position",       lambda m: m.get("contact_position", "")),
    ("role",         "Role",           _contact_export_role),
    ("state",        "State",          lambda m: (m.get("state") or "active").capitalize()),
    ("username",     "Portal Username", lambda m: m.get("username", "")),
    ("email",        "Email",          lambda m: m.get("email", "")),
    ("tel",          "Tel",            lambda m: m.get("contact_tel", "")),
    ("mobile",       "Mobile",         lambda m: m.get("contact_mobile", "")),
    ("created_at",   "Registered On",  lambda m: (m.get("created") or "")[:10]),
]
_CONTACT_EXPORT_COLUMN_KEYS = {key for key, _, _ in _CONTACT_EXPORT_COLUMNS}
_CONTACT_EXPORT_ANONYMIZABLE_KEYS = {"first_name", "last_name", "email", "tel", "mobile"}


def _mask_personal_value(s):
    """Keep the first and last character, blank out the rest — e.g. "Kostas" -> "K____s"."""
    s = str(s or "").strip()
    if len(s) <= 1:
        return "_" if s else ""
    if len(s) == 2:
        return s[0] + "_"
    return s[0] + "_" * (len(s) - 2) + s[-1]


@app.route("/api/contacts/export", methods=["GET"])
def contacts_export():
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment

    search        = _search_normalize(freq.args.get("search", "").strip())
    role_filter   = (freq.args.get("role") or "").strip()   # admin | editor | member | sysadmin
    state_filter  = (freq.args.get("state") or "").strip()  # active | pending | deleted
    anonymize     = (freq.args.get("anonymize") or "").strip() in ("1", "true", "yes")
    requested_cols = [c.strip() for c in freq.args.getlist("columns") if c.strip() in _CONTACT_EXPORT_COLUMN_KEYS]
    columns = [col for col in _CONTACT_EXPORT_COLUMNS if col[0] in requested_cols] if requested_cols else _CONTACT_EXPORT_COLUMNS
    if anonymize:
        columns = [
            (key, header, (lambda m, g=getter: _mask_personal_value(g(m))) if key in _CONTACT_EXPORT_ANONYMIZABLE_KEYS else getter)
            for key, header, getter in columns
        ]

    # The export mirrors the Contacts tab exactly: every active.gov.gr portal
    # account (not just the ones with a contact-file entry), deduped by
    # username and filtered the same way the on-screen summary cards/search
    # filter it, so the row count always matches whatever's selected there.
    if _pm_cache["data"] is None:
        if not _pm_cache["loading"]:
            _do_fetch_portal_members()
        else:
            for _ in range(20):  # another request is already fetching — wait up to ~10s for it
                if not _pm_cache["loading"]:
                    break
                time.sleep(0.5)
    members = (_pm_cache["data"] or {}).get("members") or []

    # Dedupe by username, keeping the highest-ranked role per user — same rule
    # as the frontend's _dedupeContacts so counts always match the dashboard.
    role_rank = {"admin": 3, "editor": 2, "member": 1}
    def _rank(m):
        return 4 if m.get("sysadmin") else role_rank.get(m.get("capacity"), 0)
    by_username = {}
    for m in members:
        uname = m.get("username")
        if not uname:
            continue
        prev = by_username.get(uname)
        if not prev or _rank(m) > _rank(prev):
            by_username[uname] = m
    rows = list(by_username.values())

    if search:
        rows = [
            m for m in rows
            if search in _search_normalize(m.get("org_title", ""))
            or search in _search_normalize(m.get("display_name", ""))
            or search in _search_normalize(m.get("username", ""))
            or search in _search_normalize(m.get("email", ""))
            or search in _search_normalize(m.get("contact_position", ""))
            or search in _search_normalize(m.get("about", ""))
        ]
    if role_filter:
        if role_filter == "sysadmin":
            rows = [m for m in rows if m.get("sysadmin")]
        else:
            rows = [m for m in rows if not m.get("sysadmin") and m.get("capacity") == role_filter]
    if state_filter:
        rows = [m for m in rows if (m.get("state") or "active") == state_filter]

    # Newest-registered first; accounts with no known registration date (no CKAN
    # match) sort to the very end regardless of direction since "" < any date string.
    rows.sort(key=lambda m: (m.get("created") or ""), reverse=True)

    wb = Workbook()
    ws = wb.active
    ws.title = "Contacts"

    hdr_font = Font(bold=True, color="FFFFFF")
    hdr_fill = PatternFill("solid", fgColor="2563EB")
    for col_idx, (_key, header, _getter) in enumerate(columns, 1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font = hdr_font
        cell.fill = hdr_fill
        cell.alignment = Alignment(horizontal="center")

    for ri, m in enumerate(rows, 2):
        for col_idx, (_key, _header, getter) in enumerate(columns, 1):
            ws.cell(ri, col_idx, getter(m))

    for col in ws.columns:
        width = max((len(str(cell.value or "")) for cell in col), default=0)
        ws.column_dimensions[col[0].column_letter].width = min(width + 2, 55)

    if rows:
        ws.auto_filter.ref = ws.dimensions
        ws.freeze_panes = "A2"

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
    result = []
    for c in OrgContact.query.all():
        if c.org_code == org_code:
            result.append(c.to_dict())
            continue
        if c.org_codes:
            try:
                if any(o.get("code") == org_code for o in json.loads(c.org_codes)):
                    result.append(c.to_dict())
            except Exception:
                pass
    return jsonify(result)


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
    if "org_codes" in body and isinstance(body.get("org_codes"), list):
        orgs = [o for o in body["org_codes"] if isinstance(o, dict) and o.get("code")]
        if orgs:
            contact.org_codes = json.dumps(orgs)
            contact.org_code  = orgs[0]["code"].strip()
            contact.org_label = (orgs[0].get("label") or orgs[0]["code"]).strip() or None
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


@app.route("/api/contacts/save", methods=["POST", "PATCH"])
def contacts_save():
    body = _decode_payload()
    contact_id = body.get("id") or None
    if contact_id and str(contact_id) not in ("", "null", "undefined"):
        contact = OrgContact.query.get_or_404(int(contact_id))
        for field in ("first_name", "last_name", "position", "contact_type", "email", "tel", "mobile", "org_label"):
            if field in body:
                setattr(contact, field, (body[field] or "").strip() or None)
        if "org_codes" in body and isinstance(body.get("org_codes"), list):
            orgs = [o for o in body["org_codes"] if isinstance(o, dict) and o.get("code")]
            if orgs:
                contact.org_codes = json.dumps(orgs)
                contact.org_code  = orgs[0]["code"].strip()
                contact.org_label = (orgs[0].get("label") or orgs[0]["code"]).strip() or None
        contact.tel, contact.mobile = _fix_tel_mobile(contact.tel, contact.mobile)
        db.session.commit()
        return jsonify(contact.to_dict())
    else:
        org_codes_raw = body.get("org_codes")
        orgs = [o for o in org_codes_raw if isinstance(o, dict) and o.get("code")] \
               if isinstance(org_codes_raw, list) else []
        if orgs:
            org_code  = orgs[0]["code"].strip()
            org_label = (orgs[0].get("label") or org_code).strip()
        else:
            org_code  = (body.get("org_code") or "").strip()
            org_label = (body.get("org_label") or "").strip()
            if org_code:
                orgs = [{"code": org_code, "label": org_label or org_code}]
        if not org_code:
            return jsonify({"error": "org_code required"}), 400
        tel, mobile = _fix_tel_mobile(body.get("tel"), body.get("mobile"))
        contact = OrgContact(
            org_code=org_code,
            org_label=org_label or None,
            org_codes=json.dumps(orgs) if orgs else None,
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


@app.route("/api/contacts/remove", methods=["POST", "DELETE"])
def contacts_remove():
    body = _decode_payload()
    contact_id = body.get("id")
    if not contact_id:
        return jsonify({"error": "id required"}), 400
    contact = OrgContact.query.get_or_404(int(contact_id))
    db.session.delete(contact)
    db.session.commit()
    return jsonify({"ok": True})


# ── Portal User detail ───────────────────────────────────────────────────────

@app.route("/api/portal-user/<username>")
def portal_user_detail(username):
    if not config.TOKEN:
        return jsonify({"error": "No API token configured"}), 503
    auth_headers = {"User-Agent": "DataGovGR-Dashboard/1.0", "Authorization": config.TOKEN}
    try:
        r = requests.get(
            f"{config.PORTAL_BASE}/api/3/action/user_show",
            params={"id": username, "include_datasets": False},
            headers=auth_headers,
            timeout=10,
        )
        if r.status_code != 200:
            return jsonify({"error": f"CKAN returned {r.status_code}"}), 502
        d = r.json()
        if not d.get("success"):
            return jsonify({"error": d.get("error", {}).get("message", "CKAN error")}), 502
        u = d["result"]
        contact = None
        email = (u.get("email") or "").lower().strip()
        if email:
            try:
                c = OrgContact.query.filter(
                    db.func.lower(OrgContact.email) == email
                ).first()
                if c:
                    contact = c.to_dict()
            except Exception:
                pass
        return jsonify({
            "id":           u.get("id", ""),
            "username":     u.get("name", ""),
            "display_name": (u.get("display_name") or u.get("fullname") or u.get("name", "")).strip(),
            "email":        email,
            "state":        u.get("state", "active"),
            "sysadmin":     u.get("sysadmin", False),
            "created":      u.get("created", ""),
            "last_active":  u.get("last_active", ""),
            "about":        u.get("about") or "",
            "num_packages": u.get("number_created_packages", 0),
            "num_edits":    u.get("number_of_edits", 0),
            "contact":      contact,
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/portal-user/<username>/datasets")
def portal_user_datasets(username):
    if not config.TOKEN:
        return jsonify({"error": "No API token configured"}), 503
    auth_headers = {"User-Agent": "DataGovGR-Dashboard/1.0", "Authorization": config.TOKEN}
    try:
        # Resolve user_id
        r = requests.get(
            f"{config.PORTAL_BASE}/api/3/action/user_show",
            params={"id": username, "include_datasets": False},
            headers=auth_headers, timeout=10,
        )
        if not r.ok:
            return jsonify({"error": f"user_show returned {r.status_code}"}), 502
        ud = r.json()
        if not ud.get("success"):
            return jsonify({"error": "user not found"}), 404
        user_id = ud["result"].get("id", "")

        # Fetch datasets created by this user, including private ones (token is sysadmin-scoped)
        r2 = requests.get(
            f"{config.PORTAL_BASE}/api/3/action/package_search",
            params={"fq": f"creator_user_id:{user_id}", "rows": 100, "sort": "metadata_modified desc",
                    "include_private": True},
            headers=auth_headers, timeout=15,
        )
        if not r2.ok:
            return jsonify({"error": f"package_search returned {r2.status_code}"}), 502
        pd = r2.json()
        if not pd.get("success"):
            return jsonify({"error": "package_search failed"}), 502

        datasets = [
            {
                "name":          p.get("name", ""),
                "title":         p.get("title") or p.get("name", ""),
                "org":           (p.get("organization") or {}).get("title") or "",
                "modified":      p.get("metadata_modified", ""),
                "num_resources": p.get("num_resources", 0),
                "private":       bool(p.get("private", False)),
            }
            for p in (pd["result"].get("results") or [])
        ]
        return jsonify({"datasets": datasets, "total": pd["result"].get("count", len(datasets))})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/portal-user/<username>/activity")
def portal_user_activity(username):
    if not config.TOKEN:
        return jsonify({"error": "No API token configured"}), 503
    auth_headers = {"User-Agent": "DataGovGR-Dashboard/1.0", "Authorization": config.TOKEN}
    try:
        limit = min(int(freq.args.get("limit", 50)), 100)
        r = requests.get(
            f"{config.PORTAL_BASE}/api/3/action/user_activity_list",
            params={"id": username, "limit": limit, "offset": 0},
            headers=auth_headers,
            timeout=15,
        )
        if not r.ok:
            return jsonify({"error": f"CKAN returned {r.status_code}"}), 502
        d = r.json()
        if not d.get("success"):
            return jsonify({"error": d.get("error", {}).get("message", "CKAN error")}), 502

        activities = []
        for a in (d.get("result") or []):
            pkg = (a.get("data") or {}).get("package") or {}
            activities.append({
                "timestamp":     a.get("timestamp", ""),
                "activity_type": a.get("activity_type", ""),
                "package_name":  pkg.get("name", ""),
                "package_title": pkg.get("title") or pkg.get("name", ""),
                "private":       bool(pkg.get("private", False)),
            })
        return jsonify({"activities": activities})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ── Portal Members (all orgs) ─────────────────────────────────────────────────

_pm_cache: dict = {"data": None, "ts": 0, "loading": False, "error": None}
_PM_REFRESH_INTERVAL = 90 * 60  # refresh proactively before the 2h cache below goes stale


def _do_fetch_portal_members():
    """Fetch all portal members in a background thread and populate _pm_cache."""
    if _pm_cache["loading"]:
        return
    _pm_cache["loading"] = True
    _pm_cache["error"] = None
    base_headers = {"User-Agent": "DataGovGR-Dashboard/1.0"}
    auth_headers = {**base_headers, "Authorization": config.TOKEN} if config.TOKEN else base_headers
    try:
        # Step 1 – fire organization_list and user_list in parallel
        def _get_org_list():
            r = requests.post(
                f"{config.PORTAL_BASE}/api/3/action/organization_list",
                json={"all_fields": True},
                headers=auth_headers, timeout=20,
            )
            r.raise_for_status()
            return r.json().get("result") or []

        def _get_user_list():
            r = requests.get(
                f"{config.PORTAL_BASE}/api/3/action/user_list",
                params={"all_fields": True},
                headers=auth_headers, timeout=30,
            )
            if r.status_code == 200:
                d = r.json()
                if d.get("success"):
                    return d["result"]
            return []

        with ThreadPoolExecutor(max_workers=2) as pool:
            f_orgs  = pool.submit(_get_org_list)
            f_users = pool.submit(_get_user_list)
            org_list   = f_orgs.result()
            all_users  = f_users.result()

        # Build email + display_name map from user_list (single bulk fetch replaces user_show per user)
        user_info: dict = {}
        for u in all_users:
            uname = u.get("name", "")
            if uname:
                user_info[uname] = {
                    "display_name": (u.get("display_name") or u.get("fullname") or uname).strip(),
                    "email":        (u.get("email") or "").lower().strip(),
                    "state":        u.get("state", "active"),
                    "sysadmin":     bool(u.get("sysadmin", False)),
                    "about":        (u.get("about") or "").strip(),
                    "created":      u.get("created", ""),
                }

        # Step 2 – fetch org memberships in parallel
        def _fetch_org_members(org):
            try:
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
                    headers=auth_headers, timeout=12,
                )
                d = r2.json()
                if d.get("success"):
                    return [
                        {
                            "org_name":  slug,
                            "org_title": title,
                            "username":  u.get("name", ""),
                            "capacity":  u.get("capacity", "member"),
                        }
                        for u in (d["result"].get("users") or [])
                    ]
            except Exception:
                pass
            return []

        raw_members: list = []
        with ThreadPoolExecutor(max_workers=20) as pool:
            futs = {pool.submit(_fetch_org_members, org): org for org in org_list}
            for fut in as_completed(futs):
                try:
                    raw_members.extend(fut.result())
                except Exception:
                    pass

        # Step 3 – enrich org members with user_info (no extra API calls)
        all_members = []
        for m in raw_members:
            ui = user_info.get(m["username"], {})
            all_members.append({
                "org_name":     m["org_name"],
                "org_title":    m["org_title"],
                "username":     m["username"],
                "display_name": ui.get("display_name", m["username"]),
                "capacity":     m["capacity"],
                "email":        ui.get("email", ""),
                "state":        ui.get("state", "active"),
                "sysadmin":     ui.get("sysadmin", False),
                "about":        ui.get("about", ""),
                "created":      ui.get("created", ""),
            })

        # Step 4 – add users not in any org
        org_usernames = {m["username"] for m in all_members}
        for u in all_users:
            uname = u.get("name", "")
            if uname and uname not in org_usernames:
                ui = user_info.get(uname, {})
                all_members.append({
                    "org_name":     "",
                    "org_title":    "",
                    "username":     uname,
                    "display_name": ui.get("display_name", uname),
                    "capacity":     "user",  # no org membership = no assigned org role; just a plain portal User
                    "email":        ui.get("email", ""),
                    "state":        ui.get("state", "active"),
                    "sysadmin":     ui.get("sysadmin", False),
                    "about":        ui.get("about", ""),
                    "created":      ui.get("created", ""),
                })

        # Enrich with OrgContact data matched by email; collect unmatched contacts
        unmatched = []
        try:
            with app.app_context():
                all_contacts = OrgContact.query.all()
            member_emails = {m.get("email", "") for m in all_members if m.get("email")}
            contact_by_email = {}
            for c in all_contacts:
                e = (c.email or "").lower().strip()
                if e:
                    contact_by_email[e] = c
            for m in all_members:
                c = contact_by_email.get(m.get("email", ""))
                if c:
                    m["contact_id"]         = c.id
                    m["contact_position"]   = c.position or ""
                    m["contact_type"]       = c.contact_type or ""
                    m["contact_tel"]        = c.tel or ""
                    m["contact_mobile"]     = c.mobile or ""
                    m["contact_name"]       = f"{c.first_name or ''} {c.last_name or ''}".strip()
                    m["contact_first_name"] = c.first_name or ""
                    m["contact_last_name"]  = c.last_name or ""
                    m["contact_email"]      = c.email or ""
                    _orgs = []
                    if c.org_codes:
                        try: _orgs = json.loads(c.org_codes)
                        except Exception: pass
                    if not _orgs and c.org_code:
                        _orgs = [{"code": c.org_code, "label": c.org_label or c.org_code}]
                    m["contact_org_codes"]  = _orgs
            # Contacts with no matching portal member
            for c in all_contacts:
                e = (c.email or "").lower().strip()
                if not e or e not in member_emails:
                    unmatched.append(c.to_dict())
        except Exception:
            pass

        _pm_cache["data"] = {"members": all_members, "total": len(all_members), "unmatched": unmatched}
        _pm_cache["ts"]   = time.time()
    except Exception as exc:
        _pm_cache["error"] = str(exc)
    finally:
        _pm_cache["loading"] = False


@app.route("/api/portal-members", methods=["GET", "POST"])
def portal_members_all():
    """Return all portal users across every CKAN organisation, cached for 2 hours.

    Returns immediately — fetches in background on first call or after cache expiry.
    Client receives {loading: true} (HTTP 202) while the fetch is in progress and
    should poll until it gets a 200 response. POST forces a fresh fetch, bypassing
    the 2-hour cache (used by the Contacts tab's Reload button).
    """
    now = time.time()
    force = freq.method == "POST"
    if not force and _pm_cache["data"] and now - _pm_cache["ts"] < 7200:
        return jsonify(_pm_cache["data"])

    if not force and _pm_cache["error"] and not _pm_cache["loading"]:
        return jsonify({"error": _pm_cache["error"]}), 500

    if not _pm_cache["loading"]:
        threading.Thread(target=_do_fetch_portal_members, daemon=True).start()

    return jsonify({"loading": True, "members": [], "total": 0}), 202


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


def _matomo_resolve_range(default_days=30, max_days=365):
    """Resolves the effective (days, start, end) for a Matomo query — prefers an
    explicit ?start=&end= (YYYY-MM-DD) range from the Traffic tab's custom date
    picker over the ?days= preset buttons, so both share the same code path."""
    start = (freq.args.get("start") or "").strip()
    end   = (freq.args.get("end") or "").strip()
    if start and end:
        try:
            d_start = datetime.strptime(start, "%Y-%m-%d")
            d_end   = datetime.strptime(end, "%Y-%m-%d")
            if d_end >= d_start:
                return (d_end - d_start).days + 1, start, end
        except ValueError:
            pass
    days = min(int(freq.args.get("days", default_days)), max_days)
    s, e = _matomo_date_range(days)
    return days, s, e


@app.route("/api/matomo/summary")
def matomo_summary():
    if not config.MATOMO_TOKEN:
        return jsonify({"error": "MATOMO_TOKEN not configured"}), 503
    days, start, end = _matomo_resolve_range()
    try:
        data = _matomo_get("VisitsSummary.get", {"period": "range", "date": f"{start},{end}"})
        visits    = data.get("nb_visits", 0) or 0
        pageviews = data.get("nb_pageviews") or data.get("nb_actions") or 0

        # nb_uniq_visitors is not computed by Matomo for range periods; sum daily instead
        uniq = data.get("nb_uniq_visitors") or 0
        uniq_approx = False
        if not uniq:
            try:
                daily = _matomo_get("VisitsSummary.get", {"period": "day", "date": f"{start},{end}"})
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
            "start":           start,
            "end":             end,
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 503


@app.route("/api/matomo/visits-history")
def matomo_visits_history():
    if not config.MATOMO_TOKEN:
        return jsonify({"error": "MATOMO_TOKEN not configured"}), 503
    days, start, end = _matomo_resolve_range()
    try:
        data = _matomo_get("VisitsSummary.get", {"period": "day", "date": f"{start},{end}"})

        # nb_downloads in VisitsSummary is often 0; use Actions.getDownloads per day
        dl_by_date: dict = {}
        try:
            dl_raw = _matomo_get("Actions.getDownloads", {
                "period": "day", "date": f"{start},{end}", "filter_limit": 500,
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


def _matomo_flat_pages(method: str, days: int, extra: dict, start: str = None, end: str = None) -> list:
    """Fetch aggregated page/keyword data.

    With an explicit start/end (custom date range from the Traffic tab), queries
    that exact range directly. Otherwise maps the requested day count to standard
    periods (week/month) that Matomo always has pre-archived — faster than a
    range query, but only for the preset Last 7/30/90 days buttons. For
    multi-month requests, merges the per-month lists by label and sums visits.
    """
    if start and end:
        period, date_str = "range", f"{start},{end}"
    elif days <= 10:
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
    days, start, end = _matomo_resolve_range()
    try:
        pages = _matomo_flat_pages("Actions.getPageUrls", days,
                                   {"flat": 1, "filter_limit": 300}, start=start, end=end)
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
        top = result[:limit]
        # Matomo only knows the URL slug — look up the real (Greek) title from
        # CKAN in one batched query rather than showing the transliterated slug.
        if top:
            slugs = [item["slug"] for item in top]
            fq = "name:(" + " OR ".join(f'"{s}"' for s in slugs) + ")"
            try:
                r2 = requests.get(
                    f"{config.API_BASE}/package_search",
                    params={"fq": fq, "rows": len(slugs)},
                    headers=_api_headers(),
                    timeout=config.REQUEST_TIMEOUT,
                )
                r2.raise_for_status()
                titles = {
                    p.get("name"): p.get("title") or p.get("name")
                    for p in r2.json().get("result", {}).get("results", [])
                }
            except Exception:
                titles = {}
            for item in top:
                item["title"] = titles.get(item["slug"], item["slug"])
        return jsonify(top)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 503


@app.route("/api/matomo/top-searches")
def matomo_top_searches():
    if not config.MATOMO_TOKEN:
        return jsonify({"error": "MATOMO_TOKEN not configured"}), 503
    limit = min(int(freq.args.get("limit", 20)), 100)
    days, start, end = _matomo_resolve_range()
    try:
        items = _matomo_flat_pages("Actions.getSiteSearchKeywords", days,
                                   {"filter_limit": limit * 2}, start=start, end=end)
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
    days, start, end = _matomo_resolve_range()
    try:
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


@app.route("/api/matomo/dataset-stats")
def matomo_dataset_stats():
    """Page views and resource downloads for a single dataset, for the detail
    panel. Reuses the same flat-page fetching already proven out in
    top-datasets / top-downloads rather than a single-URL Matomo lookup."""
    if not config.MATOMO_TOKEN:
        return jsonify({"error": "MATOMO_TOKEN not configured"}), 503
    name = (freq.args.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400
    resource_urls = set(freq.args.getlist("resource_url"))
    days = min(int(freq.args.get("days", 30)), 365)
    try:
        pages = _matomo_flat_pages("Actions.getPageUrls", days,
                                   {"flat": 1, "filter_limit": 300})
        visits, unique_visitors = 0, 0
        target = f"/dataset/{name}"
        for page in pages:
            label = page.get("label", "")
            path = "/" + "/".join(p.strip().lstrip("/") for p in label.split(" > "))
            if path.rstrip("/").lower() == target.lower():
                visits = page.get("nb_visits", 0)
                unique_visitors = page.get("nb_uniq_visitors", 0)
                break

        downloads = 0
        if resource_urls:
            start, end = _matomo_date_range(days)
            items = _matomo_get("Actions.getDownloads", {
                "period": "range",
                "date": f"{start},{end}",
                "flat": 1,
                "filter_limit": 1000,
            })
            if isinstance(items, list):
                for item in items:
                    label = item.get("label", "")
                    url = label if label.startswith("http") else f"https://{label}"
                    if url in resource_urls:
                        downloads += item.get("nb_visits", 0) or item.get("nb_hits", 0)

        return jsonify({"visits": visits, "unique_visitors": unique_visitors, "downloads": downloads})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 503


@app.route("/api/matomo/top-api-calls")
def matomo_top_api_calls():
    """CKAN API calls tracked as Matomo events (category=API, action=ckan_action_name)."""
    if not config.MATOMO_TOKEN:
        return jsonify({"error": "MATOMO_TOKEN not configured"}), 503
    limit = min(int(freq.args.get("limit", 20)), 100)
    days, start, end = _matomo_resolve_range()
    try:
        # Total from the "API" event category
        cats = _matomo_flat_pages("Events.getCategory", days, {"filter_limit": 50}, start=start, end=end)
        api_total = next(
            (c.get("nb_events", 0) or c.get("nb_visits", 0) for c in cats if c.get("label") == "API"),
            0,
        )

        # Per-action breakdown — CKAN actions are always lowercase_with_underscores;
        # filter out non-API event actions (e.g. "Open", "ClickStatTile") that leak in
        _ckan_action = re.compile(r'^[a-z][a-z0-9_]+$')
        actions = _matomo_flat_pages("Events.getAction", days, {"filter_limit": limit * 2}, start=start, end=end)
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


def _matomo_live_call(method: str, extra: dict):
    """Uncached Matomo API call — _matomo_get's 1-hour cache would defeat the
    purpose of a "live" view."""
    r = requests.post(config.MATOMO_URL, data={
        "module": "API", "method": method,
        "idSite": config.MATOMO_SITE_ID, "format": "JSON",
        "token_auth": config.MATOMO_TOKEN,
        **extra,
    }, timeout=15, headers={"User-Agent": "DataGovGR-Dashboard/1.0"})
    r.raise_for_status()
    data = r.json()
    if isinstance(data, dict) and data.get("result") == "error":
        raise RuntimeError(data.get("message", "Matomo API error"))
    return data


@app.route("/api/matomo/live")
def matomo_live():
    if not config.MATOMO_TOKEN:
        return jsonify({"error": "MATOMO_TOKEN not configured"}), 503
    limit   = min(int(freq.args.get("limit", 20)), 50)
    minutes = min(int(freq.args.get("minutes", 30)), 1440)
    try:
        counters = _matomo_live_call("Live.getCounters", {"lastMinutes": minutes})
        counters = (counters[0] if isinstance(counters, list) and counters else counters) or {}

        visits = _matomo_live_call("Live.getLastVisitsDetails", {
            "period": "day", "date": "today", "filter_limit": limit,
            "language": "en",  # otherwise device/browser labels come back localized to Matomo's UI language
        })
        def _to_float(x):
            try:
                return float(x)
            except (TypeError, ValueError):
                return None

        out = []
        for v in (visits or []):
            actions = v.get("actionDetails") or []
            pages = [a.get("pageTitle") or a.get("url") for a in actions if a.get("type") == "action"]
            out.append({
                "id_visit":        v.get("idVisit"),
                "time_pretty":     v.get("lastActionDateTime") or v.get("serverTimePretty") or "",
                "timestamp":       v.get("lastActionTimestamp") or v.get("serverTimestamp"),
                "country":         v.get("country") or "",
                "country_code":    (v.get("countryCode") or "").lower(),
                "city":            v.get("city") or "",
                "lat":             _to_float(v.get("latitude")),
                "lon":             _to_float(v.get("longitude")),
                "device_type":     v.get("deviceType") or "",
                "browser":         v.get("browserName") or "",
                "os":              v.get("operatingSystem") or "",
                "actions":         v.get("actions") or len(actions),
                "duration_pretty": v.get("visitDurationPretty") or "",
                "referrer_type":   v.get("referrerType") or "",
                "referrer_name":   v.get("referrerName") or "",
                "entry_page":      pages[0] if pages else "",
                "last_page":       pages[-1] if pages else "",
            })
        return jsonify({
            "active_visits":   counters.get("visits", 0) or 0,
            "active_visitors": counters.get("visitors", 0) or 0,
            "active_actions":  counters.get("actions", 0) or 0,
            "minutes":         minutes,
            "visits":          out,
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
@limiter.limit("10 per hour")
def admin_reset():
    err = _require_admin()
    if err:
        return err
    user = User.query.get(session.get("user_id"))
    body = _decode_payload()
    if not user or not user.password_hash or not check_password_hash(user.password_hash, body.get("password", "")):
        return jsonify({"error": "Incorrect password"}), 403
    db.session.query(HealthCheck).delete()
    db.session.query(PortalSnapshot).delete()
    db.session.commit()
    threading.Thread(target=run_health_checks, daemon=True).start()
    return jsonify({"ok": True, "message": "All data cleared, fresh check started"})


@app.route("/api/admin/test-email", methods=["POST"])
@limiter.limit("10 per hour")
def admin_test_email():
    """One-off endpoint to confirm the SendGrid credentials work end-to-end."""
    err = _require_admin()
    if err:
        return err
    body = _decode_payload()
    to = (body.get("to") or "").strip()
    if not to:
        return jsonify({"error": "to is required"}), 400
    try:
        send_email(
            to,
            "data.gov.gr Monitor — test email",
            "<p>This is a test email from the data.gov.gr Monitor dashboard.</p>"
            "<p>If you received this, SendGrid is configured correctly.</p>",
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502
    return jsonify({"ok": True})


@app.route("/api/admin/mass-email", methods=["POST"])
@limiter.limit("5 per hour")
def admin_mass_email():
    """Send an announcement to some or all dashboard users. Sent one at a time
    (this user base is small) so one bad address doesn't fail the whole batch."""
    err = _require_admin()
    if err:
        return err
    body = _decode_payload()
    subject = (body.get("subject") or "").strip()
    html = (body.get("message") or "").strip()  # rich-text HTML from the admin panel's Quill editor
    user_ids = body.get("user_ids")
    if not subject or not re.sub("<[^<]+?>", "", html).strip():
        return jsonify({"error": "Subject and message are required"}), 400
    if not isinstance(user_ids, list) or not user_ids:
        return jsonify({"error": "Select at least one recipient"}), 400

    recipients = User.query.filter(User.id.in_(user_ids)).all()
    if not recipients:
        return jsonify({"error": "No matching recipients"}), 400

    sent, failed = 0, []
    for u in recipients:
        try:
            send_email(u.email, subject, html)
            sent += 1
        except Exception as exc:
            failed.append({"email": u.email, "error": str(exc)})

    admin = User.query.get(session.get("user_id"))
    db.session.add(MassEmailLog(
        sent_by_user_id=session.get("user_id"),
        sent_by_name=(admin.name or admin.email) if admin else None,
        subject=subject,
        message_html=html,
        recipient_count=len(recipients),
        success_count=sent,
        failed_emails=",".join(f["email"] for f in failed) or None,
    ))
    db.session.commit()

    return jsonify({"ok": True, "sent": sent, "failed": failed})


@app.route("/api/admin/mass-email/history", methods=["GET"])
def admin_mass_email_history():
    err = _require_admin()
    if err:
        return err
    logs = MassEmailLog.query.order_by(MassEmailLog.sent_at.desc()).all()
    return jsonify([l.to_dict() for l in logs])


if __name__ == "__main__":
    app.run(debug=True, use_reloader=True)
# deploy-restart marker (auth system live)
