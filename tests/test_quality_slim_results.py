"""The DCAT-AP whole-run result was 141 MB: since the SHACL shape fix every dataset carries its violation `details`
(6.3 KB on average x 23,568 datasets), and that one JSON is parsed in full by a web worker on every view of the tab
(then sent to the browser whole) and rebuilt in the background worker every night -- the memory that ballooned
workers on the VM. Stored rows are now slim; details live in the per-dataset cache rows and are read on demand."""
import importlib.util
import io
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from openpyxl import load_workbook

import app as appmod
from models import DcatApCheckCache, DcatApDatasetCheckCache, User, db

MTIME = "2026-01-01T00:00:00"
FORMAT = "http://purl.org/dc/terms/format"
SIZE = "http://www.w3.org/ns/dcat#byteSize"


def _result(name, details=None):
    details = [{"severity": "violation", "path": FORMAT, "message": "format is not an IRI", "count": 2},
               {"severity": "violation", "path": SIZE, "message": "byteSize not decimal", "count": 1},
               {"severity": "warning", "path": "http://x/y", "message": "just a warning", "count": 1}] if details is None else details
    return {"name": name, "title": name.upper(), "conforms": not details, "violation_count": len(details), "warning_count": 0,
            "vocabulary_issue": False, "structural_issue": bool(details), "details": details}


@pytest.fixture
def dcat_run(app, monkeypatch):
    names = ["ds1", "ds2", "ds3"]
    monkeypatch.setitem(appmod._QUALITY_CHECKS["dcat"], "list_datasets", lambda: [
        {"name": n, "metadata_modified": MTIME, "org_title": "Org", "org_slug": "org"} for n in names])
    monkeypatch.setitem(appmod._QUALITY_CHECKS["dcat"], "check_one", lambda n: _result(n, [] if n == "ds3" else None))
    monkeypatch.setattr(appmod, "ProcessPoolExecutor", lambda max_workers, mp_context: ThreadPoolExecutor(1))
    return names


def _blob():
    return json.loads(DcatApCheckCache.query.get(1).data_json)


def test_the_stored_result_has_no_violation_details_but_the_cache_rows_keep_them(dcat_run):
    appmod._do_run_check("dcat")
    assert appmod._get_check_status("dcat")["error"] is None

    blob = _blob()
    assert [d["name"] for d in blob["datasets"]] == ["ds1", "ds2"] or {d["name"] for d in blob["datasets"]} == {"ds1", "ds2"}
    assert all("details" not in d and d["has_details"] for d in blob["datasets"])      # only non-conforming rows are listed
    assert blob["summary"]["checked"] == 3 and blob["summary"]["conforms"] == 1
    cached = json.loads(DcatApDatasetCheckCache.query.get("ds1").result_json)["result"]
    assert len(cached["details"]) == 3                                                  # the per-dataset row is complete


def test_violation_totals_per_property_are_precomputed_for_the_eu_comparison(dcat_run):
    appmod._do_run_check("dcat")
    blob = _blob()
    assert blob["violation_properties"] == {FORMAT: {"violations": 4, "datasets": 2}, SIZE: {"violations": 2, "datasets": 2}}
    assert blob["datasets_with_violations"] == 2                                          # warnings are not counted

    ours = appmod._our_dcat_violations()
    assert ours["properties"] == blob["violation_properties"] and ours["violations"] == 6
    assert ours["datasets_with_violations"] == 2 and ours["checked"] == 3


def test_a_run_that_reuses_every_cached_row_produces_the_same_slim_result(dcat_run, monkeypatch):
    appmod._do_run_check("dcat")
    first = _blob()
    monkeypatch.setitem(appmod._QUALITY_CHECKS["dcat"], "check_one", lambda n: pytest.fail("everything is cached"))
    appmod._do_run_check("dcat")
    second = _blob()
    assert second["summary"]["reused_from_cache"] == 3
    assert second["violation_properties"] == first["violation_properties"]
    assert all("details" not in d for d in second["datasets"])


def test_the_hvd_result_is_small_and_keeps_its_details(app, monkeypatch):
    def hvd(n):
        return {"name": n, "title": n, "conforms": False, "violation_count": 1, "warning_count": 0, "legal_citation_issue": False,
                "no_api_access": False, "license_status": "open", "publisher_name": "", "details": [{"severity": "violation", "message": "m"}]}
    monkeypatch.setitem(appmod._QUALITY_CHECKS["hvd"], "list_datasets", lambda: [
        {"name": "h1", "metadata_modified": MTIME, "org_title": "Org", "org_slug": "org"}])
    monkeypatch.setitem(appmod._QUALITY_CHECKS["hvd"], "check_one", hvd)
    monkeypatch.setattr(appmod, "ProcessPoolExecutor", lambda max_workers, mp_context: ThreadPoolExecutor(1))
    appmod._do_run_check("hvd")
    assert appmod._load_check_result("hvd")["datasets"][0]["details"] == [{"severity": "violation", "message": "m"}]


# ── reading the details on demand ──────────────────────────────────────────────

def _login(client, **kw):
    u = User(email="u@example.gr", **kw)
    db.session.add(u)
    db.session.commit()
    with client.session_transaction() as s:
        s.update(user_id=u.id, user_email=u.email, is_admin=u.is_admin, is_superadmin=u.is_superadmin,
                 allowed_tabs=u.allowed_tabs, org_scope=appmod._user_org_scope(u))


def test_the_details_route_returns_one_datasets_violations(app, dcat_run):
    appmod._do_run_check("dcat")
    c = app.test_client()
    _login(c, is_admin=True, is_superadmin=True)
    data = c.get("/api/quality/dcat-check/details?name=ds1").get_json()
    assert data["name"] == "ds1" and [e["message"] for e in data["details"]][:2] == ["format is not an IRI", "byteSize not decimal"]
    assert c.get("/api/quality/dcat-check/details?name=nope").status_code == 404
    assert c.get("/api/quality/bogus-check/details?name=ds1").status_code == 404


def test_the_details_route_is_limited_to_an_org_admins_own_organizations(app, dcat_run):
    appmod._do_run_check("dcat")
    row = DcatApDatasetCheckCache.query.get("ds2")
    row.org_slug = "other-org"
    db.session.commit()
    c = app.test_client()
    _login(c, org_scoped=True, ckan_orgs=json.dumps(["org"]), allowed_tabs=appmod._ORG_SCOPED_TABS)
    assert c.get("/api/quality/dcat-check/details?name=ds1").status_code == 200
    assert c.get("/api/quality/dcat-check/details?name=ds2").status_code == 404       # not theirs, however it is asked for


def test_the_excel_export_still_lists_each_datasets_issues(app, dcat_run):
    appmod._do_run_check("dcat")
    c = app.test_client()
    _login(c, is_admin=True, is_superadmin=True)
    resp = c.get("/api/quality/dcat-check/export")
    assert resp.status_code == 200
    ws = load_workbook(io.BytesIO(resp.data))["Flagged Datasets"]
    header = [cell.value for cell in ws[1]]
    issues = [ws.cell(r, header.index("Issues") + 1).value for r in range(2, ws.max_row + 1)]
    assert issues and all("format is not an IRI" in i and "byteSize not decimal" in i for i in issues)


# ── slimming a result stored in the old shape ──────────────────────────────────

def _old_shape_blob():
    rows = [_result("old1"), _result("old2")]
    return {"summary": {"total": 2, "checked": 2, "failed_to_fetch": 0, "reused_from_cache": 0, "conforms": 0},
            "datasets": rows, "partial": False, "finished_at": "2026-10-31T00:00:00+00:00"}


def test_a_result_stored_with_details_still_works_for_the_eu_comparison(app):
    appmod._save_check_cache("dcat", _old_shape_blob())
    ours = appmod._our_dcat_violations()
    assert ours["properties"] == {FORMAT: {"violations": 4, "datasets": 2}, SIZE: {"violations": 2, "datasets": 2}}
    assert ours["datasets_with_violations"] == 2


def test_the_one_off_tool_slims_an_old_blob_and_keeps_the_eu_totals(app):
    spec = importlib.util.spec_from_file_location("slim_check_blobs", Path(__file__).parent.parent / "tools" / "slim_check_blobs.py")
    tool = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(tool)
    appmod._save_check_cache("dcat", _old_shape_blob())
    before = len(DcatApCheckCache.query.get(1).data_json)

    dry = tool.slim_stored_results(dry_run=True, kinds=("dcat",))
    assert len(DcatApCheckCache.query.get(1).data_json) == before                       # a dry run writes nothing
    assert dry[0][0] == "dcat" and dry[0][2] < before

    tool.slim_stored_results(kinds=("dcat",))
    blob = _blob()
    assert len(DcatApCheckCache.query.get(1).data_json) < before
    assert all("details" not in d and d["has_details"] for d in blob["datasets"])
    assert blob["violation_properties"][FORMAT] == {"violations": 4, "datasets": 2} and blob["datasets_with_violations"] == 2
    assert tool.slim_stored_results(kinds=("dcat",))[0][1] == tool.slim_stored_results(kinds=("dcat",))[0][2]   # idempotent


def test_the_dcat_and_geodcat_rows_fetch_their_details_when_expanded():
    src = (Path(__file__).parent.parent / "static" / "app.js").read_text(encoding="utf-8")
    assert "_qualityDetailsCell(d, 'dcat')" in src and "_qualityDetailsCell(d, 'geodcat')" in src
    assert "function _loadQualityDetails" in src and "-check/details?name=" in src
    rows = src[src.index("function _dcatRowHtml"):src.index("function _dcatColgroup")]
    assert "d.details.map" not in rows                      # the row template must not assume details are in the stored result
