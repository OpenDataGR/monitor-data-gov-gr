"""The DCAT-AP check validated NOTHING for months: the vendored SEMIC shapes name each node shape after its
class (dcat:Dataset, ...) and rely on the DCAT ontology -- which isn't vendored -- for the implicit class
target, so no shape had a target and every dataset "conformed", even one with no title. It was found by
comparing the check with data.europa.eu's own results (158,700 violations vs our 0). These tests make that
impossible to repeat: a deliberately invalid dataset MUST be flagged, and every shape set must have targets."""
import pytest
import pyshacl
import rdflib
from rdflib import RDF

import app as appmod

SH = rdflib.Namespace("http://www.w3.org/ns/shacl#")
DCT = rdflib.Namespace("http://purl.org/dc/terms/")
DCAT = rdflib.Namespace("http://www.w3.org/ns/dcat#")

TTL = """
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix dct:  <http://purl.org/dc/terms/> .
@prefix xsd:  <http://www.w3.org/2001/XMLSchema#> .

<http://example.org/ds1> a dcat:Dataset ;
    %(meta)s
    dcat:distribution <http://example.org/ds1/dist1> .

<http://example.org/ds1/dist1> a dcat:Distribution ;
    %(access)s
    %(fmt)s
    %(size)s .
"""
META = 'dct:title "A dataset" ; dct:description "Described." ;'
ACCESS = "dcat:accessURL <http://example.org/file.xls> ;"
FMT_IRI = "dct:format <http://publications.europa.eu/resource/authority/file-type/XLS> ;"
SIZE_OK = 'dcat:byteSize "1234"^^xsd:decimal'


def _validate(**overrides):
    parts = dict(meta=META, access=ACCESS, fmt=FMT_IRI, size=SIZE_OK) | overrides
    g = rdflib.Graph()
    g.parse(data=TTL % parts, format="turtle")
    _conforms, results, _ = pyshacl.validate(g, shacl_graph=appmod._DCAT_SHAPES_GRAPH, inference="rdfs", debug=False)
    found = set()
    for r in results.subjects(RDF.type, SH.ValidationResult):
        found.add((results.value(r, SH.resultPath), results.value(r, SH.sourceConstraintComponent)))
    return found


def test_a_dataset_with_nothing_in_it_is_not_reported_as_conforming():
    """The control that was missing: before the fix this returned no violations at all."""
    paths = {p for p, _c in _validate(meta="", access="")}
    assert DCT.title in paths and DCT.description in paths and DCAT.accessURL in paths


def test_a_format_literal_is_flagged_as_the_eu_does():
    """data.europa.eu: 82,556 violations of dct:format "NodeKind[BlankNodeOrIRI]" ("XLS" where an IRI belongs)."""
    assert (DCT["format"], SH.NodeKindConstraintComponent) in _validate(fmt='dct:format "XLS" ;')
    assert (DCT["format"], SH.NodeKindConstraintComponent) not in _validate()


def test_a_non_decimal_byte_size_is_flagged_as_the_eu_does():
    """data.europa.eu: 74,203 violations of dcat:byteSize "DatatypeConstraint[xsd:decimal]"."""
    assert (DCAT.byteSize, SH.DatatypeConstraintComponent) in _validate(size='dcat:byteSize "1234"')
    assert (DCAT.byteSize, SH.DatatypeConstraintComponent) in _validate(size='dcat:byteSize "1234"^^xsd:integer')
    assert (DCAT.byteSize, SH.DatatypeConstraintComponent) not in _validate()


def _has_target(g, s):
    return (any(g.objects(s, SH.targetClass)) or any(g.objects(s, SH.targetNode))
            or any(g.objects(s, SH.targetSubjectsOf)) or any(g.objects(s, SH.targetObjectsOf))
            or (s, RDF.type, rdflib.RDFS.Class) in g or (s, RDF.type, rdflib.OWL.Class) in g)


@pytest.mark.parametrize("cls", ["Catalog", "CatalogRecord", "Dataset", "Distribution"])
def test_every_dcat_ap_class_shape_has_a_target(cls):
    assert _has_target(appmod._DCAT_SHAPES_GRAPH, DCAT[cls])


def test_the_hvd_and_geodcat_shapes_have_targets_too():
    """Those two were fine; keep them that way (a re-vendored copy could silently lose its targets)."""
    hvd = rdflib.Graph()
    hvd.parse(data=appmod._HVD_SHAPES_TTL, format="turtle")
    for name, g in (("HVD", hvd), ("GeoDCAT-AP", appmod._GEODCAT_SHAPES_GRAPH)):
        shapes = set(g.subjects(RDF.type, SH.NodeShape))
        targeted = [s for s in shapes if _has_target(g, s)]
        assert len(targeted) >= 15, f"{name}: only {len(targeted)} of {len(shapes)} shapes have a target"


def test_the_check_version_was_bumped_so_old_everything_conforms_results_are_recomputed():
    assert appmod._DCAT_CHECK_VERSION >= 3
