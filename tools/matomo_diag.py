"""Read-only Matomo diagnostic, run on the VM from the repo root:

    ORG=<ckan-org-slug> venv/bin/python tools/matomo_diag.py

Reads MATOMO_TOKEN from .env like the app does, queries the SAME reports the Traffic tab uses (plus a few
lighter alternatives) for the last 30 days, and prints status/timing/row counts -- never the token. Written
after the Traffic tab's "Top dataset pages" started failing with Matomo's `Allowed memory size of 536870912
bytes exhausted` (a flat Actions.getPageUrls over a range does not fit in Matomo's 512 MB PHP limit) and to
check how an org-scoped user's downloads / API calls are attributed. Matomo only keeps the top rows of each
report and folds the rest into an "Others" row, so org-level numbers for the long tail can be missing."""
import os
import re
import sys
import time
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(ROOT))
import config  # noqa: E402

H = {"User-Agent": "DataGovGR-Dashboard/1.0"}
END = date.today()
START = END - timedelta(days=29)
RANGE = {"period": "range", "date": f"{START},{END}"}


def q(method, **p):
    t = time.time()
    try:
        r = requests.post(config.MATOMO_URL, data={"module": "API", "method": method, "idSite": config.MATOMO_SITE_ID,
                          "format": "JSON", "token_auth": config.MATOMO_TOKEN, **p}, timeout=240, headers=H)
        try:
            data = r.json()
        except Exception:
            data = None
        return r.status_code, time.time() - t, data
    except Exception as e:
        return None, time.time() - t, str(e)[:150]


def show(title, res, n=3):
    st, dt, data = res
    print(f"== {title}: HTTP {st}, {dt:.1f}s, rows={len(data) if isinstance(data, list) else '-'}")
    if isinstance(data, list):
        for r in data[:n]:
            print("     ", r.get("nb_visits") or r.get("nb_events"), "|", str(r.get("label"))[:90],
                  "| has-subtable" if r.get("idsubdatatable") else "")
    elif data is not None:
        print("     ", str(data)[:160])


def key(url):
    return re.sub(r"^https?://", "", url).rstrip("/")


show("A  flat range limit 300 (what the app does)", q("Actions.getPageUrls", **RANGE, flat=1, filter_limit=300))
b = q("Actions.getPageUrls", **RANGE, filter_limit=5, filter_pattern="dataset")
show("B1 folder view, pattern 'dataset'", b)
sub = next((r["idsubdatatable"] for r in (b[2] if isinstance(b[2], list) else [])
            if str(r.get("label")).strip("/") == "dataset" and r.get("idsubdatatable")), None)
if sub:
    show("B2 the dataset folder's subtable", q("Actions.getPageUrls", **RANGE, idSubtable=sub, filter_limit=100000))
show("C  flat, label pattern 'dataset', limit 300", q("Actions.getPageUrls", **RANGE, flat=1, filter_pattern="dataset", filter_limit=300))
day = END - timedelta(days=1)
show(f"D2 flat, ONE day ({day}), limit 300", q("Actions.getPageUrls", period="day", date=str(day), flat=1, filter_limit=300))
show("D  flat, period=month last1, limit 300", q("Actions.getPageUrls", period="month", date="last1", flat=1, filter_limit=300))

org = os.environ.get("ORG")
if org:
    names, ids, urls, titles, st = [], {}, set(), {}, 0
    while True:
        r = requests.get(f"{config.API_BASE}/package_search", params={"fq": f'organization:("{org}")', "rows": 100, "start": st},
                         headers={**H, **({"Authorization": config.TOKEN} if config.TOKEN else {})}, timeout=60).json()["result"]["results"]
        for p in r:
            names.append(p["name"]); ids[p["name"]] = p["name"]; ids[p["id"]] = p["name"]; titles[p["name"]] = p.get("title")
            for x in p.get("resources") or []:
                ids[x["id"]] = p["name"]
                if x.get("url"):
                    urls.add(key(x["url"]))
        if len(r) < 100:
            break
        st += 100
    print(f"== ORG {org}: {len(names)} datasets, {len(urls)} resource URLs; e.g. {sorted(urls)[:2]}")
    if names:
        pat = r"dataset[ >/]+(" + "|".join(re.escape(n) for n in names[:100]) + r")$"
        show("E  flat + own-names pattern (first 100 datasets)", q("Actions.getPageUrls", **RANGE, flat=1, filter_pattern=pat, filter_limit=1000))
    dl = q("Actions.getDownloads", **RANGE, flat=1, filter_limit=100000)
    show("F  downloads, whole portal", dl, 2)
    if isinstance(dl[2], list):
        hit = [(r["label"], r.get("nb_visits")) for r in dl[2] if key(r["label"]) in urls]
        by_uuid = [(r["label"], r.get("nb_visits")) for r in dl[2]
                   if (m := re.search(r"/dataset/([^/?#\s]+)/resource/", r["label"])) and m.group(1) in ids]
        print(f"     matched by URL: {len(hit)} files, {sum(h[1] or 0 for h in hit)} hits;"
              f" matched by /dataset/<name|uuid>/resource/: {len(by_uuid)} files, {sum(h[1] or 0 for h in by_uuid)} hits")
        others = sum((r.get("nb_visits") or 0) for r in dl[2] if "Άλλα" in (r.get("label") or ""))
        print(f"     hits sitting in Matomo's 'Others' row (not attributable): {others}")
    ev = q("Events.getAction", **RANGE, secondaryDimension="eventName", flat=1, filter_limit=100000)
    show("G  API events, whole portal", ev, 2)
    if isinstance(ev[2], list):
        mine = 0
        for r in ev[2]:
            a, sep, nm = (r.get("label") or "").partition(" - ")
            if sep and re.match(r"^[a-z][a-z0-9_]+$", a):
                qs = parse_qs(urlparse(nm).query)
                if any(v in ids for k in ("id", "resource_id") for v in qs.get(k, [])):
                    mine += r.get("nb_events") or 0
        print(f"     API calls aimed at this org's datasets: {mine}")
