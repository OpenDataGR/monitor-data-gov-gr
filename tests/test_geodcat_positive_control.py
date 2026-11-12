"""GeoDCAT-AP showed 0 of ~12,162 datasets conforming. After the DCAT-AP check turned out to have validated nothing
(shapes without targets), the worry was the mirror image here: a check that can NEVER pass. These controls show the
GeoDCAT-AP shapes work in both directions on a hand-made dataset, so a 0% pass rate on the portal is a statement about
the portal's RDF (look at the violation details of a real dataset), not about the validator."""
import pyshacl
import rdflib
from rdflib import RDF

import app as appmod

SH = rdflib.Namespace("http://www.w3.org/ns/shacl#")
DCT = rdflib.Namespace("http://purl.org/dc/terms/")

TTL = """
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix dct:  <http://purl.org/dc/terms/> .

<http://example.org/ds> a dcat:Dataset ;
    %(meta)s
    dcat:distribution <http://example.org/ds/d1> .

<http://example.org/ds/d1> a dcat:Distribution ;
    dcat:accessURL <http://example.org/file> .
"""
GOOD = 'dct:title "A dataset" ; dct:description "Described." ;'


def _validate(meta):
    g = rdflib.Graph()
    g.parse(data=TTL % {"meta": meta}, format="turtle")
    conforms, results, _ = pyshacl.validate(g, shacl_graph=appmod._GEODCAT_SHAPES_GRAPH, inference="rdfs", debug=False)
    flagged = {(results.value(r, SH.resultPath), results.value(r, SH.resultSeverity))
               for r in results.subjects(RDF.type, SH.ValidationResult)}
    return conforms, flagged


def test_a_complete_enough_dataset_conforms():
    """The positive control: the check CAN pass."""
    conforms, flagged = _validate(GOOD)
    assert conforms and not flagged


def test_a_dataset_with_nothing_in_it_is_flagged():
    """The negative control: the check CAN fail, on exactly the mandatory properties."""
    conforms, flagged = _validate("")
    assert not conforms
    assert {p for p, _s in flagged} >= {DCT.title, DCT.description}
    assert all(s == SH.Violation for _p, s in flagged)
