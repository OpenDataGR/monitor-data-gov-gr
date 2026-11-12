"""DCAT-AP HVD 3.0.0 strongly recommends a bulk download (a Distribution with a dcat:downloadURL). We report a dataset that has none --
as a recommendation, not a compliance failure: the specification does not require it."""
import rdflib

import app as appmod

TTL = """
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix dct:  <http://purl.org/dc/terms/> .

<http://e.org/ds> a dcat:Dataset ; dct:title "T" ; dcat:distribution <http://e.org/d> .
<http://e.org/d> a dcat:Distribution ; dcat:accessURL <http://e.org/a> %(download)s .
"""


def _check(monkeypatch, download):
    g = rdflib.Graph()
    g.parse(data=TTL % {"download": download}, format="turtle")
    monkeypatch.setattr(appmod, "_fetch_dataset_rdf_graph", lambda name, timeout: g)
    monkeypatch.setattr(appmod, "_augment_with_vocab", lambda graph: None)
    return appmod._hvd_check_one("ds")


def test_a_dataset_without_any_download_url_is_flagged(monkeypatch):
    row = _check(monkeypatch, "")
    assert "error" not in row and row["no_bulk_download"] is True
    assert any(d["raw_message"] == "no dcat:downloadURL on any distribution" for d in row["details"])


def test_a_dataset_with_a_download_url_is_not(monkeypatch):
    row = _check(monkeypatch, "; dcat:downloadURL <http://e.org/f>")
    assert "error" not in row and row["no_bulk_download"] is False
    assert not any(d["raw_message"] == "no dcat:downloadURL on any distribution" for d in row["details"])


def test_a_missing_bulk_download_is_reported_but_does_not_make_a_dataset_non_compliant():
    """DCAT-AP HVD 3.0.0 only STRONGLY RECOMMENDS a bulk download ("should be encoded as a Distribution", downloadURL "preferred"),
    so it is a recommendation like a missing licence: visible and filterable, never a compliance failure."""
    base = {"conforms": True, "violation_count": 0, "legal_citation_issue": False, "no_api_access": False,
            "license_status": "open", "publisher_mismatch": False}
    assert appmod._hvd_finalize_datasets([dict(base, no_bulk_download=True)])[0]["flagged"] is False
    assert appmod._QUALITY_CHECKS["hvd"]["export_predicates"]["no_bulk_download"]({"no_bulk_download": True})


def test_the_check_version_was_bumped_so_cached_rows_get_the_new_field():
    assert appmod._HVD_CHECK_VERSION >= 6
