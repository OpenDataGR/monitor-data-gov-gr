"""GeoDCAT-AP counted every SHACL violation, so class-membership findings (the export never types its skos:Concept /
vcard:Email / dcat:DataService nodes) failed ALL ~12,162 datasets. Only structural findings count now, as for DCAT-AP;
the rest stay visible as advisories. Real example: epicheirisiako-programma-2019-2023 (2026-11-12)."""
import rdflib

import app as appmod

TTL = """
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix dct:  <http://purl.org/dc/terms/> .
@prefix spdx: <http://spdx.org/rdf/terms#> .

<http://example.org/ds> a dcat:Dataset ;
    dct:title "A dataset" ; dct:description "Described." ;
    dcat:distribution <http://example.org/ds/d1> .

<http://example.org/ds/d1> a dcat:Distribution ;
    dcat:accessURL <http://example.org/file> ;
    %(extra)s .
"""
# a value that is an IRI but is not typed as the class the shape wants: the portal's pattern
UNTYPED = "dct:format <http://publications.europa.eu/resource/authority/file-type/XLS>"
FMT_TEXT = 'dct:format "XLS"'
CHECKSUM_NO_ALGO = 'spdx:checksum [ a spdx:Checksum ; spdx:checksumValue "abc" ]'


def _row(extra):
    g = rdflib.Graph()
    g.parse(data=TTL % {"extra": extra}, format="turtle")
    return appmod._geodcat_result_for_graph("ds", g)


def test_a_class_membership_finding_is_an_advisory_not_a_failure():
    row = _row(UNTYPED)
    assert row["conforms"] and row["violation_count"] == 0
    assert row["warning_count"] >= 1 and all(d["severity"] == "warning" for d in row["details"])
    assert any(d.get("category") == "type" for d in row["details"])


def test_a_structural_finding_still_fails_the_dataset():
    row = _row(FMT_TEXT)
    assert not row["conforms"]
    assert any(d["severity"] == "violation" and (d["path"] or "").endswith("format") for d in row["details"])


def test_a_checksum_without_an_algorithm_still_fails_the_dataset():
    row = _row(CHECKSUM_NO_ALGO)
    assert not row["conforms"]
    assert any(d["severity"] == "violation" and (d["path"] or "").endswith("algorithm") for d in row["details"])


def test_an_empty_dataset_is_still_flagged():
    g = rdflib.Graph()
    g.parse(data="@prefix dcat: <http://www.w3.org/ns/dcat#> . <http://e.org/x> a dcat:Dataset .", format="turtle")
    row = appmod._geodcat_result_for_graph("x", g)
    assert not row["conforms"] and row["violation_count"] >= 2


def test_the_check_version_was_bumped_so_old_everything_fails_results_are_recomputed():
    assert appmod._GEODCAT_CHECK_VERSION >= 2
