import os

PORTAL_BASE = "https://data.gov.gr"
API_BASE = "https://data.gov.gr/api/3/action"
TOKEN = os.environ.get("DATAGOVGR_TOKEN", "")

MATOMO_URL     = "https://matomo.open1.eu/index.php"
MATOMO_SITE_ID = 3
MATOMO_TOKEN   = os.environ.get("MATOMO_TOKEN", "")

DASHBOARD_PASSWORD  = os.environ.get("DASHBOARD_PASSWORD", "").strip()
FLASK_SECRET_KEY    = os.environ.get("FLASK_SECRET_KEY", "").strip()

ENDPOINTS_TO_MONITOR = [
    {"name": "Portal Homepage",  "url": "https://data.gov.gr/",                          "critical": True},
    {"name": "CKAN API",         "url": "https://data.gov.gr/api/3/action/status_show",  "critical": True},
    {"name": "Datasets Listing", "url": "https://data.gov.gr/dataset",                   "critical": False},
    {"name": "Organizations",    "url": "https://data.gov.gr/organization",              "critical": False},
]

SAMPLE_DATASETS = [
    "mdg_emvolio",
    "sailing_traffic",
    "mcp_forest_fires",
    "internet_traffic",
]

CHECK_INTERVAL_SECONDS = 300   # 5 minutes
REQUEST_TIMEOUT = 15
