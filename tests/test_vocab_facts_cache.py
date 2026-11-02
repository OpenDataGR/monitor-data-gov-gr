"""During a full DCAT-AP run each of the 5 validation subprocesses grew ~11 MB a minute (190 -> 248 MB in 4.5 minutes; the web
service 1.87 -> 2.14 GB, headed for its 5 GB limit before the ~23,000 datasets were done). Cause: the vocabulary lookup kept
the WHOLE parsed document of every URL it dereferenced -- including whole concept schemes (file types, languages, countries,
corporate bodies) -- forever, while the check only ever reads the few triples about the one node it asked for. It now keeps just
those triples in a bounded cache."""
import pytest
import rdflib
from rdflib import RDF, Namespace

import app as appmod

SKOS = Namespace("http://www.w3.org/2004/02/skos/core#")
SCHEME = "http://example.org/vocab/scheme"


def _scheme_document(n_concepts=3000):
    concepts = "\n".join(
        f'<skos:Concept rdf:about="http://example.org/vocab/c{i}"><skos:inScheme rdf:resource="{SCHEME}"/>'
        f'<skos:prefLabel xml:lang="en">Concept number {i}</skos:prefLabel></skos:Concept>' for i in range(n_concepts))
    return ('<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" '
            'xmlns:skos="http://www.w3.org/2004/02/skos/core#">'
            f'<skos:ConceptScheme rdf:about="{SCHEME}"><skos:prefLabel xml:lang="en">The scheme</skos:prefLabel></skos:ConceptScheme>'
            f"{concepts}</rdf:RDF>")


class _Resp:
    def __init__(self, text):
        self.text = text

    def raise_for_status(self):
        pass


@pytest.fixture(autouse=True)
def clean_caches():
    appmod._vocab_facts_cache.clear()
    appmod._hvd_vocab_cache.clear()
    yield
    appmod._vocab_facts_cache.clear()
    appmod._hvd_vocab_cache.clear()


@pytest.fixture
def web(monkeypatch):
    calls = []

    def fake_get(url, **kw):
        calls.append(url)
        if "broken" in url:
            raise RuntimeError("down")
        return _Resp(_scheme_document())

    monkeypatch.setattr(appmod.requests, "get", fake_get)
    return calls


def test_only_the_asked_nodes_triples_are_kept_not_the_whole_document(web):
    ref = rdflib.URIRef(SCHEME)
    facts = appmod._get_vocab_node_facts(ref)

    assert isinstance(facts, tuple) and 1 <= len(facts) <= 5          # the scheme's own triples, not 3,000 concepts' worth
    assert all(s == ref for s, _p, _o in facts)
    assert (ref, RDF.type, SKOS.ConceptScheme) in facts
    assert isinstance(appmod._vocab_facts_cache[SCHEME], tuple)       # a tuple of triples, never a Graph


def test_a_lookup_is_fetched_once_and_a_failed_one_is_not_retried_per_dataset(web):
    ref, broken = rdflib.URIRef(SCHEME), rdflib.URIRef("http://example.org/broken/x")
    for _ in range(5):
        appmod._get_vocab_node_facts(ref)
        assert appmod._get_vocab_node_facts(broken) is None
    assert web.count(SCHEME) == 1 and web.count("http://example.org/broken/x") == 1


def test_the_cache_is_bounded_and_drops_the_least_recently_used(web, monkeypatch):
    monkeypatch.setattr(appmod, "_VOCAB_FACTS_MAX", 3)
    urls = [f"http://example.org/vocab/c{i}" for i in range(6)]
    for u in urls[:3]:
        appmod._get_vocab_node_facts(rdflib.URIRef(u))
    appmod._get_vocab_node_facts(rdflib.URIRef(urls[0]))              # touch c0: now the most recent
    for u in urls[3:]:
        appmod._get_vocab_node_facts(rdflib.URIRef(u))
    assert len(appmod._vocab_facts_cache) == 3
    assert urls[0] not in appmod._vocab_facts_cache or urls[1] not in appmod._vocab_facts_cache
    assert urls[5] in appmod._vocab_facts_cache and urls[1] not in appmod._vocab_facts_cache


def test_merging_adds_only_the_nodes_own_facts_to_the_dataset_graph(web):
    """Same behaviour as before: not every sibling concept in the fetched document (which caused false positives)."""
    g = rdflib.Graph()
    ref = rdflib.URIRef("http://example.org/vocab/c7")
    appmod._merge_vocab_node_facts(g, ref)
    assert {s for s, _p, _o in g} == {ref} and (ref, SKOS.inScheme, rdflib.URIRef(SCHEME)) in g
    assert len(g) <= 4

    appmod._merge_vocab_node_facts(g, rdflib.URIRef("http://example.org/broken/y"))   # a failed lookup adds nothing, raises nothing
    assert {s for s, _p, _o in g} == {ref}


def test_the_hvd_check_still_gets_whole_documents(web):
    """HVD merges whole documents but touches only a handful of URLs, so its cache is unchanged."""
    graph = appmod._get_vocab_graph(SCHEME)
    assert isinstance(graph, rdflib.Graph) and len(graph) > 3000
    assert appmod._get_vocab_graph(SCHEME) is graph and web.count(SCHEME) == 1
