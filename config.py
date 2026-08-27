import os

PORTAL_BASE = "https://data.gov.gr"
API_BASE = "https://data.gov.gr/api/3/action"
TOKEN = os.environ.get("DATAGOVGR_TOKEN", "")

MATOMO_URL     = "https://matomo.open1.eu/index.php"
MATOMO_SITE_ID = 3
MATOMO_TOKEN   = os.environ.get("MATOMO_TOKEN", "")

FLASK_SECRET_KEY    = os.environ.get("FLASK_SECRET_KEY", "").strip()
DATABASE_URL        = os.environ.get("DATABASE_URL", "").strip()

# Free at https://carto.com/basemaps/apikey (5M tile requests/month, no
# card required) -- CARTO's basemaps.cartocdn.com tiles started requiring
# this and watermarking unauthenticated requests as of August 2026.
CARTO_API_KEY = os.environ.get("CARTO_API_KEY", "").strip()

# Used to build absolute links (invite/reset emails) from contexts with no
# incoming request to infer the host from, e.g. create_admin.py.
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "https://monitor.data.gov.gr").strip().rstrip("/")

SMTP_SERVER         = os.environ.get("SMTP_SERVER", "smtp.sendgrid.net").strip()
SMTP_PORT           = int(os.environ.get("SMTP_PORT", "587") or 587)
SMTP_USERNAME       = os.environ.get("SMTP_USERNAME", "").strip()
SMTP_PASSWORD       = os.environ.get("SMTP_PASSWORD", "").strip()
SENDGRID_FROM_EMAIL = os.environ.get("SENDGRID_FROM_EMAIL", "").strip()
SENDGRID_FROM_NAME  = os.environ.get("SENDGRID_FROM_NAME", "data.gov.gr Monitor").strip()

# Long random path segment SendGrid's Inbound Parse must include in its
# configured destination URL. SendGrid can't sign or authenticate these
# POSTs itself, so this is the only thing standing between the endpoint and
# anyone who guesses the URL. Unset -> the endpoint is unreachable (fails closed).
EMAIL_INBOUND_SECRET = os.environ.get("EMAIL_INBOUND_SECRET", "").strip()

ENDPOINTS_TO_MONITOR = [
    {"name": "Portal Homepage",  "url": "https://data.gov.gr/",                          "critical": True},
    {"name": "CKAN API",         "url": "https://data.gov.gr/api/3/action/status_show",  "critical": True},
    {"name": "Datasets Listing", "url": "https://data.gov.gr/dataset",                   "critical": False},
    {"name": "Organizations",    "url": "https://data.gov.gr/organization",              "critical": False},
]

CHECK_INTERVAL_SECONDS = 300   # 5 minutes
REQUEST_TIMEOUT = 15

# flask-limiter's storage backend. Defaults to its own in-memory store, which
# under gunicorn means each worker process counts independently -- with N
# workers the effective ceiling on things like login attempts is roughly N x
# the configured limit, not the configured limit itself. Set to a shared
# store (e.g. redis://localhost:6379) in production so limits are enforced
# across all worker processes instead of per-process.
RATELIMIT_STORAGE_URI = os.environ.get("RATELIMIT_STORAGE_URI", "memory://").strip()

# General-purpose Redis connection, separate from RATELIMIT_STORAGE_URI
# (same Redis instance in practice, but that one has to be in flask-limiter's
# expected URI form specifically). Used to back the cross-process caches in
# app.py (_SharedCache) -- unset means those caches fall back to a plain
# per-process dict, which is what local dev uses.
REDIS_URL = os.environ.get("REDIS_URL", "").strip()

# True only in the dedicated background_worker.py process (see deploy/
# monitor-data-gov-gr-worker.service, which sets this env var) -- that process
# owns the health-check/HVD/DCAT-AP/GeoDCAT background loop instead of it
# running inside a gunicorn worker, so those hours-long CPU-bound crawls never
# compete for a request-serving worker's GIL. See the gating in app.py around
# _background_loop and _stream_poller_loop for how this is used.
BACKGROUND_WORKER = os.environ.get("BACKGROUND_WORKER", "") == "1"
