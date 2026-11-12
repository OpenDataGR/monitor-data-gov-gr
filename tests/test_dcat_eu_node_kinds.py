"""Four node-kind rules data.europa.eu's DCAT-AP validation applies and the vendored SEMIC shapes did not state, found by sampling the
EU's own violation list for our catalogue (2026-11-12). The values below are the EU's real ones. Each is a wrong KIND of value (text where a
resource belongs, or the reverse), so it counts toward compliance like dct:format as text."""
import rdflib

import app as appmod

PRE = """
@prefix dcat:   <http://www.w3.org/ns/dcat#> .
@prefix dct:    <http://purl.org/dc/terms/> .
@prefix dcatap: <http://data.europa.eu/r5r/> .
"""


def _row(dataset_extra="", dist_extra=""):
    ttl = PRE + f"""
    <http://e.org/ds> a dcat:Dataset ; dct:title "T" ; dct:description "D" ; dcat:distribution <http://e.org/d> ; {dataset_extra} dct:type <http://e.org/t> .
    <http://e.org/d> a dcat:Distribution ; dcat:accessURL <http://e.org/a> ; {dist_extra} dct:format <http://publications.europa.eu/resource/authority/file-type/XLS> .
    """
    g = rdflib.Graph()
    g.parse(data=ttl, format="turtle")
    return appmod._dcat_result_for_graph("ds", g)


def _flagged(row, suffix):
    return [d for d in row["details"] if (d["path"] or "").endswith(suffix) and d["severity"] == "violation"]


def test_a_clean_dataset_still_conforms_so_the_new_rules_cannot_fail_everything():
    assert _row()["conforms"] is True


def test_applicable_legislation_as_text_is_flagged_but_a_link_is_not():
    """EU: NodeKind[IRI] : Expected IRI for "ν.4270/2014"."""
    assert _flagged(_row('dcatap:applicableLegislation "ν.4270/2014" ;'), "applicableLegislation")
    assert not _flagged(_row("dcatap:applicableLegislation <http://data.europa.eu/eli/reg_impl/2023/138/oj> ;"), "applicableLegislation")
    assert _flagged(_row(dist_extra='dcatap:applicableLegislation "ν.4270/2014" ;'), "applicableLegislation")   # on a distribution too


def test_an_identifier_that_is_an_iri_is_flagged_but_a_literal_is_not():
    """EU: NodeKind[Literal] : Expected Literal for <http://semantics.gr/authorities/metrics_gr_datasets/1934849152>."""
    row = _row("dct:identifier <http://semantics.gr/authorities/metrics_gr_datasets/1934849152> ;")
    assert _flagged(row, "identifier") and not row["conforms"]
    assert not _flagged(_row('dct:identifier "0eca1c46-1e01-44b7-8921-b7b77a66f8e9" ;'), "identifier")


def test_a_distribution_language_as_text_is_flagged_but_an_iri_is_not():
    """EU: NodeKind[BlankNodeOrIRI] : Expected BlankNodeOrIRI for "el"."""
    assert _flagged(_row(dist_extra='dct:language "el" ;'), "language")
    assert not _flagged(_row(dist_extra="dct:language <http://publications.europa.eu/resource/authority/language/ELL> ;"), "language")


def test_a_media_type_as_text_is_flagged_but_an_iri_is_not():
    """EU: NodeKind[BlankNodeOrIRI] : Expected BlankNodeOrIRI for "cif/ xml"."""
    assert _flagged(_row(dist_extra='dcat:mediaType "cif/ xml" ;'), "mediaType")
    assert not _flagged(_row(dist_extra="dcat:mediaType <https://www.iana.org/assignments/media-types/application/xml> ;"), "mediaType")


def test_an_iri_where_a_literal_belongs_is_structural_not_the_blank_node_advisory():
    """The classifier used to call ANY non-literal value that broke a node-kind rule a 'blank node' advisory (not counted)."""
    row = _row("dct:identifier <http://semantics.gr/x> ;")
    [d] = [d for d in row["details"] if (d["path"] or "").endswith("identifier")]
    assert d["category"] == "structural" and d["severity"] == "violation"


def test_a_blank_node_where_an_iri_is_expected_stays_an_advisory():
    """The EU's rule is BlankNodeOrIRI, so an inline blank-node resource is not an error there (unchanged behaviour)."""
    row = _row("dcatap:applicableLegislation [ a <http://data.europa.eu/eli/ontology#LegalResource> ] ;")
    hits = [d for d in row["details"] if (d["path"] or "").endswith("applicableLegislation")]
    assert hits and all(d["severity"] == "warning" and d["category"] == "blank_node" for d in hits)


def test_the_service_shapes_carry_the_new_rules_too():
    assert (None, rdflib.URIRef("http://www.w3.org/ns/shacl#nodeKind"), rdflib.URIRef("http://www.w3.org/ns/shacl#Literal")) in appmod._DCAT_SERVICE_SHAPES_GRAPH


def test_the_check_version_was_bumped_so_every_dataset_is_judged_by_the_new_rules():
    assert appmod._DCAT_CHECK_VERSION >= 5
