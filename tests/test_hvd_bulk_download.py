"""Regulation (EU) 2023/138 art. 3 makes an HVD available through an API AND as a bulk download. We checked the API
(`no_api_access`, from the SHACL shapes) but nothing required a bulk download: a dataset whose distributions only had an
accessURL passed. A bulk download is a distribution with a dcat:downloadURL."""
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


def test_the_flag_makes_a_dataset_flagged_and_filterable():
    base = {"conforms": True, "violation_count": 0, "legal_citation_issue": False, "no_api_access": False,
            "license_status": "open", "publisher_mismatch": False}
    assert appmod._hvd_finalize_datasets([dict(base, no_bulk_download=True)])[0]["flagged"] is True
    assert appmod._hvd_finalize_datasets([dict(base, no_bulk_download=False)])[0]["flagged"] is False
    assert appmod._QUALITY_CHECKS["hvd"]["export_predicates"]["no_bulk_download"]({"no_bulk_download": True})


def test_the_check_version_was_bumped_so_cached_rows_get_the_new_field():
    assert appmod._HVD_CHECK_VERSION >= 6
