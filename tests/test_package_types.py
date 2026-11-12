"""The portal holds datasets, data services and decisions. The quality checks cover datasets AND data services, tell them
apart (`pkg_type`) and report them separately. Found 2026-11-12: the portal EXPORTS its data-service packages as a plain
dcat:Dataset (no endpoint, no service class), and the DCAT-AP check listed every package type, so 127 services and 110
decisions were validated against the dataset shapes and counted in the dataset pass rate."""
import json
from concurrent.futures import ThreadPoolExecutor

import rdflib

import app as appmod
from models import DcatApDatasetCheckCache, db

PRE = """
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix dct:  <http://purl.org/dc/terms/> .
"""
DATASET = PRE + '<http://e.org/ds> a dcat:Dataset ; dct:title "T" ; dct:description "D" .'
SERVICE_OK = PRE + '<http://e.org/svc> a dcat:DataService ; dct:title "S" ; dcat:endpointURL <http://e.org/api> .'
SERVICE_NO_ENDPOINT = PRE + '<http://e.org/svc> a dcat:DataService ; dct:title "S" .'
NESTED = PRE + """
<http://e.org/ds> a dcat:Dataset ; dct:title "T" ; dct:description "D" ; dcat:distribution <http://e.org/d> .
<http://e.org/d> a dcat:Distribution ; dcat:accessURL <http://e.org/f> ; dcat:accessService <http://e.org/svc> .
<http://e.org/svc> a dcat:DataService .
"""


def _g(ttl):
    g = rdflib.Graph()
    g.parse(data=ttl, format="turtle")
    return g


def test_the_export_root_kind():
    assert appmod._export_root_kind(_g(DATASET)) == "dataset"
    assert appmod._export_root_kind(_g(SERVICE_OK)) == "data-service"
    assert appmod._export_root_kind(_g(NESTED)) == "dataset"   # a service nested in a dataset does not make it a service
    assert appmod._export_root_kind(_g(PRE)) is None


def test_a_service_export_is_checked_as_a_service():
    ok = appmod._dcat_result_for_graph("svc", _g(SERVICE_OK))
    assert ok["exported_as"] == "data-service" and ok["conforms"]
    bad = appmod._dcat_result_for_graph("svc", _g(SERVICE_NO_ENDPOINT))
    assert not bad["conforms"]
    assert any((d["path"] or "").endswith("endpointURL") and d["severity"] == "violation" for d in bad["details"])


def test_a_dataset_with_a_nested_service_is_still_judged_as_before():
    """The service shape is only for a service-rooted graph: a dataset's nested dcat:DataService must not suddenly demand
    a title/endpoint and change every dataset's result."""
    row = appmod._dcat_result_for_graph("ds", _g(NESTED))
    assert row["exported_as"] == "dataset"
    assert not any((d["path"] or "").endswith("endpointURL") for d in row["details"])


def test_a_data_service_exported_as_a_dataset_is_not_compliant():
    row = appmod._dcat_result_for_graph("svc", _g(DATASET))
    assert row["conforms"]   # as a dataset it is fine ...
    appmod._typed_augment_row(row, {"pkg_type": "data-service", "org_slug": "o", "org_title": "O"})
    assert row["pkg_type"] == "data-service" and not row["conforms"] and row["type_mismatch"]
    assert row["violation_count"] == 1 and row["structural_issue"] is True
    assert any(d["raw_message"] == "data-service package exported as dcat:Dataset" for d in row["details"])


def test_the_type_verdict_is_applied_once_however_often_the_row_is_augmented():
    """A cached row goes through the augment hook again on every run."""
    row = appmod._dcat_result_for_graph("svc", _g(DATASET))
    d = {"pkg_type": "data-service"}
    for _ in range(3):
        appmod._typed_augment_row(row, d)
    assert row["violation_count"] == 1 and len(row["details"]) == 1


def test_a_dataset_is_never_given_the_service_verdict():
    row = appmod._dcat_result_for_graph("ds", _g(DATASET))
    appmod._typed_augment_row(row, {"pkg_type": "dataset"})
    assert row["conforms"] and "type_mismatch" not in row and row["pkg_type"] == "dataset"


def test_geodcat_rows_record_the_export_too():
    assert appmod._geodcat_result_for_graph("x", _g(DATASET))["exported_as"] == "dataset"


def test_the_summary_reports_each_type_on_its_own():
    rows = [{"pkg_type": "dataset", "conforms": True}, {"pkg_type": "dataset", "conforms": False},
            {"pkg_type": "data-service", "conforms": False}, {"conforms": True}]   # no type = a dataset
    assert appmod._summary_by_type(rows) == {"dataset": {"checked": 3, "conforms": 2},
                                              "data-service": {"checked": 1, "conforms": 0}}


def test_org_rollups_count_datasets_only(app):
    def add(name, pkg_type, conforms):
        db.session.add(DcatApDatasetCheckCache(
            name=name, org_slug="org-a", pkg_type=pkg_type, metadata_modified="m",
            result_json=json.dumps({"_cache_version": 4, "result": {"conforms": conforms}})))

    add("d1", "dataset", True)
    add("d2", None, False)             # not stamped yet: a dataset
    add("s1", "data-service", True)
    add("x1", "unlisted", True)        # e.g. a decision that used to be listed
    db.session.commit()
    assert appmod._rollup_check_by_org(DcatApDatasetCheckCache) == {"org-a": {"checked": 2, "conforms": 1}}


def test_the_export_can_filter_to_data_services_and_says_which_row_is_which():
    for check in ("dcat", "geodcat"):
        cfg = appmod._QUALITY_CHECKS[check]
        assert cfg["export_predicates"]["data_service"]({"pkg_type": "data-service"})
        assert not cfg["export_predicates"]["data_service"]({"pkg_type": "dataset"})
        [type_col] = [c for c in cfg["export_extra_columns"] if c[0] == "pkg_type"]
        assert type_col[2]({"pkg_type": "data-service"}) == "Data service" and type_col[2]({}) == "Dataset"


class _InlinePool(ThreadPoolExecutor):
    _processes = {}

    def __init__(self, max_workers, mp_context):
        super().__init__(1)


def test_a_cached_hvd_data_service_is_reused_not_refetched_on_every_run(app, monkeypatch):
    """HVD rows never carry `exported_as`; treating that as 'no verdict yet' re-fetched every HVD-tagged data service
    (99 of 1,278 on 2026-11-12: '1,179 of 1,278 served from cache') on every single run."""
    from models import HvdDatasetCheckCache
    calls = []
    db.session.add(HvdDatasetCheckCache(name="svc1", org_slug="org", metadata_modified="m1", result_json=json.dumps(
        {"_cache_version": appmod._HVD_CHECK_VERSION,
         "result": {"name": "svc1", "title": "svc1", "publisher_name": "", "conforms": True, "violation_count": 0,
                    "warning_count": 0, "legal_citation_issue": False, "no_api_access": False,
                    "license_status": "open", "details": []}})))
    db.session.commit()
    monkeypatch.setitem(appmod._QUALITY_CHECKS["hvd"], "list_datasets", lambda: [
        {"name": "svc1", "metadata_modified": "m1", "org_title": "O", "org_slug": "org", "pkg_type": "data-service"}])
    monkeypatch.setitem(appmod._QUALITY_CHECKS["hvd"], "check_one", lambda name: calls.append(name))
    monkeypatch.setattr(appmod, "ProcessPoolExecutor", _InlinePool)

    appmod._do_run_check("hvd")

    assert appmod._get_check_status("hvd")["error"] is None
    assert calls == []
    assert appmod._load_check_result("hvd")["summary"]["reused_from_cache"] == 1


def test_a_cached_service_without_a_verdict_is_rechecked_but_a_dataset_is_reused(app, monkeypatch):
    """Rows cached before the export was recorded have no `exported_as`; datasets don't need it, services do."""
    calls = []
    for name in ("ds1", "svc1"):
        db.session.add(DcatApDatasetCheckCache(name=name, org_slug="org", metadata_modified="m1", result_json=json.dumps(
            {"_cache_version": appmod._DCAT_CHECK_VERSION,
             "result": {"name": name, "title": name, "conforms": True, "violation_count": 0, "warning_count": 0,
                        "vocabulary_issue": False, "structural_issue": False, "details": []}})))
    db.session.commit()

    def check_one(name):
        calls.append(name)
        return {"name": name, "title": name, "exported_as": "dataset", "conforms": True, "violation_count": 0,
                "warning_count": 0, "vocabulary_issue": False, "structural_issue": False, "details": []}

    monkeypatch.setitem(appmod._QUALITY_CHECKS["dcat"], "list_datasets", lambda: [
        {"name": "ds1", "metadata_modified": "m1", "org_title": "O", "org_slug": "org", "pkg_type": "dataset"},
        {"name": "svc1", "metadata_modified": "m1", "org_title": "O", "org_slug": "org", "pkg_type": "data-service"}])
    monkeypatch.setitem(appmod._QUALITY_CHECKS["dcat"], "check_one", check_one)
    monkeypatch.setattr(appmod, "ProcessPoolExecutor", _InlinePool)

    appmod._do_run_check("dcat")

    assert appmod._get_check_status("dcat")["error"] is None
    assert calls == ["svc1"]
    result = appmod._load_check_result("dcat")
    assert result["summary"]["by_type"]["data-service"] == {"checked": 1, "conforms": 0}   # exported as a dataset
    assert result["summary"]["by_type"]["dataset"] == {"checked": 1, "conforms": 1}
    assert {r.name: r.pkg_type for r in DcatApDatasetCheckCache.query.all()} == {"ds1": "dataset", "svc1": "data-service"}
