import os

PORTAL_BASE = "https://data.gov.gr"
API_BASE = "https://data.gov.gr/api/3/action"
TOKEN = os.environ.get("DATAGOVGR_TOKEN", "")

MATOMO_URL     = "https://matomo.open1.eu/index.php"
MATOMO_SITE_ID = 3
MATOMO_TOKEN   = os.environ.get("MATOMO_TOKEN", "")

FLASK_SECRET_KEY    = os.environ.get("FLASK_SECRET_KEY", "").strip()
DATABASE_URL        = os.environ.get("DATABASE_URL", "").strip()

# Used to build absolute links (invite/reset emails) from contexts with no
# incoming request to infer the host from, e.g. create_admin.py.
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "https://experiments.data.gov.gr/data_dashboard").strip().rstrip("/")

SMTP_SERVER         = os.environ.get("SMTP_SERVER", "smtp.sendgrid.net").strip()
SMTP_PORT           = int(os.environ.get("SMTP_PORT", "587") or 587)
SMTP_USERNAME       = os.environ.get("SMTP_USERNAME", "").strip()
SMTP_PASSWORD       = os.environ.get("SMTP_PASSWORD", "").strip()
SENDGRID_FROM_EMAIL = os.environ.get("SENDGRID_FROM_EMAIL", "").strip()
SENDGRID_FROM_NAME  = os.environ.get("SENDGRID_FROM_NAME", "data.gov.gr Monitor").strip()

ENDPOINTS_TO_MONITOR = [
    {"name": "Portal Homepage",  "url": "https://data.gov.gr/",                          "critical": True},
    {"name": "CKAN API",         "url": "https://data.gov.gr/api/3/action/status_show",  "critical": True},
    {"name": "Datasets Listing", "url": "https://data.gov.gr/dataset",                   "critical": False},
    {"name": "Organizations",    "url": "https://data.gov.gr/organization",              "critical": False},
]

CHECK_INTERVAL_SECONDS = 300   # 5 minutes
REQUEST_TIMEOUT = 15
