"""A dataset is DCAT-AP "compliant" when it has no STRUCTURAL violations -- the layer data.europa.eu scores. Our run used to
fail a dataset for everything it found: class-membership checks that need the ontologies the EU validates with,
controlled-vocabulary (MDR) checks, and nodeKind=IRI where the EU's rule is "blank node or IRI". That kept the whole
portal near 0% (567 of 23,568 datasets) and produced tens of thousands of findings (publisher 22,389, spatial 21,952)
that the EU's own report does not contain, while the EU's real ones (dct:format as plain text 82,556, dcat:byteSize not
xsd:decimal 74,203) are what must be fixed. These tests pin the split, offline (no vocabulary lookups)."""
import rdflib
import pytest

import app as appmod

PREFIXES = """
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix dct:  <http://purl.org/dc/terms/> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix xsd:  <http://www.w3.org/2001/XMLSchema#> .
"""
TITLE = 'dct:title "A dataset" ;'
PUBLISHER = 'dct:publisher [ a foaf:Agent ; foaf:name "Some Org" ] ;'
FORMAT = "dct:format <http://publications.europa.eu/resource/authority/file-type/CSV> ;"
SIZE = 'dcat:byteSize "10"^^xsd:decimal'


def _result(title=TITLE, publisher=PUBLISHER, fmt=FORMAT, size=SIZE):
    ttl = PREFIXES + f"""
<http://example.org/ds1> a dcat:Dataset ; {title} dct:description "Described." ; {publisher}
    dcat:distribution <http://example.org/ds1/d1> .
<http://example.org/ds1/d1> a dcat:Distribution ; dcat:accessURL <http://example.org/f.csv> ; {fmt} {size} .
"""
    g = rdflib.Graph()
    g.parse(data=ttl, format="turtle")
    return appmod._dcat_result_for_graph("ds1", g)


def _counted(result):
    return {d["path"].rsplit("/", 1)[-1].rsplit("#", 1)[-1] for d in result["details"] if d["severity"] == "violation"}


def _categories(result):
    return {d["category"] for d in result["details"]}


def test_a_well_formed_dataset_conforms_even_though_advisories_remain():
    """Offline there are no vocabulary lookups, so the EU file-type IRI is not known to be a concept -- that is an
    advisory, not a failure."""
    r = _result()
    assert r["conforms"] is True and r["violation_count"] == 0 and r["structural_issue"] is False
    assert r["warning_count"] > 0 and {"vocabulary", "type"} & _categories(r)
    assert all(d["severity"] == "warning" for d in r["details"] if d["category"] != "structural")


def test_vocabulary_findings_are_now_detected_as_vocabulary():
    """The old check looked for 'mdrcv' in the shape's IRI; the vocabulary shapes are blank nodes, so no dataset was
    ever flagged vocabulary_issue (0 of 23,568)."""
    assert _result()["vocabulary_issue"] is True
    plain_text_format = _result(fmt='dct:format "CSV" ;')
    assert plain_text_format["vocabulary_issue"] is True            # the plain value also fails the file-type vocabulary


def test_format_as_plain_text_is_the_structural_failure_the_eu_reports():
    r = _result(fmt='dct:format "CSV" ;')
    assert r["conforms"] is False and "format" in _counted(r)
    assert r["structural_issue"] is True


def test_byte_size_that_is_not_a_decimal_is_structural():
    assert "byteSize" in _counted(_result(size='dcat:byteSize "10"'))
    assert "byteSize" in _counted(_result(size='dcat:byteSize "10"^^xsd:integer'))
    assert "byteSize" not in _counted(_result())


def test_a_missing_mandatory_property_is_structural():
    r = _result(title="")
    assert r["conforms"] is False and "title" in _counted(r)


def test_a_blank_node_publisher_is_not_an_error_but_a_plain_text_one_is():
    """The EU's rule is nodeKind BlankNodeOrIRI: a blank node passes (our vendored IRI-only rule flagged 6,902 datasets),
    a bare literal does not."""
    blank = _result(publisher='dct:publisher [ a foaf:Agent ; foaf:name "Org" ] ;')
    assert "publisher" not in _counted(blank) and blank["conforms"] is True
    assert "blank_node" in _categories(blank)
    literal = _result(publisher='dct:publisher "Some Org" ;')
    assert "publisher" in _counted(literal) and literal["conforms"] is False


def test_a_publisher_typed_foaf_organization_is_not_failed_for_missing_ontologies():
    """foaf:Organization is a foaf:Agent only given the FOAF ontology, which the EU validates with and we do not load:
    a class-membership finding is an advisory."""
    r = _result(publisher='dct:publisher [ a foaf:Organization ; foaf:name "Org" ] ;')
    assert "publisher" not in _counted(r) and r["conforms"] is True


def test_every_advisory_says_which_kind_it_is_and_never_counts():
    r = _result(fmt='dct:format "CSV" ;', publisher='dct:publisher [ a foaf:Organization ] ;')
    assert r["violation_count"] == len([d for d in r["details"] if d["severity"] == "violation"])
    assert all(d["category"] in {"structural", "vocabulary", "type", "blank_node", "warning"} for d in r["details"])
    assert all(d["category"] == "structural" for d in r["details"] if d["severity"] == "violation")


def test_the_check_version_was_bumped_so_every_cached_result_is_judged_by_the_new_rules():
    assert appmod._DCAT_CHECK_VERSION >= 4
