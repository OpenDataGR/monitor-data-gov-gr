import os

PORTAL_BASE = "https://data.gov.gr"
API_BASE = "https://data.gov.gr/api/3/action"
TOKEN = os.environ.get("DATAGOVGR_TOKEN", "")

ENDPOINTS_TO_MONITOR = [
    {"name": "Portal Homepage",  "url": "https://data.gov.gr/",                          "critical": True},
    {"name": "CKAN API",         "url": "https://data.gov.gr/api/3/action/site_read",    "critical": True},
    {"name": "Datasets Listing", "url": "https://data.gov.gr/datasets/",                 "critical": False},
    {"name": "Organizations",    "url": "https://data.gov.gr/organizations/",            "critical": False},
]

SAMPLE_DATASETS = [
    "mdg_emvolio",
    "sailing_traffic",
    "mcp_forest_fires",
    "internet_traffic",
]

CHECK_INTERVAL_SECONDS = 300   # 5 minutes
REQUEST_TIMEOUT = 15
