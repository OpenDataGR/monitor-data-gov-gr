"""HVD licences are read the way DCAT-AP HVD 3.0.0 (and the EU's HVD reporting tool) read them: only dct:license, only on a
distribution or a data service (never the dataset), open = CC BY 4.0 / CC0 or a licence mapped to one of them, and a MISSING
licence is a recommendation, not a failure. The old check accepted a licence on any node, matched any CC-BY version / ODC-By
by substring, did not follow mappings, and flagged every dataset without one."""
import rdflib

import app as appmod

PRE = """
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix dct:  <http://purl.org/dc/terms/> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix owl:  <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix lic:  <http://publications.europa.eu/resource/authority/licence/> .
"""


def _status(body):
    g = rdflib.Graph()
    g.parse(data=PRE + body, format="turtle")
    return appmod._license_status(g)


def dist(licence=None, bulk=True):
    parts = ["<http://e.org/d> a dcat:Distribution ; dcat:accessURL <http://e.org/a>"]
    if bulk:
        parts.append("dcat:downloadURL <http://e.org/f>")
    if licence:
        parts.append(f"dct:license {licence}")
    return " ;\n    ".join(parts) + " .\n"


def test_cc_by_4_and_cc0_on_a_bulk_distribution_are_open():
    assert _status(dist("lic:CC_BY_4_0")) == "open"
    assert _status(dist("lic:CC0")) == "open"


def test_a_missing_licence_is_only_missing_and_does_not_flag_the_dataset():
    assert _status(dist()) == "missing"
    row = [{"conforms": True, "violation_count": 0, "legal_citation_issue": False, "no_api_access": False,
            "license_status": "missing", "publisher_mismatch": False}]
    assert appmod._hvd_finalize_datasets(row)[0]["flagged"] is False   # recommended, not a failure


def test_a_stated_non_open_licence_on_a_bulk_download_is_non_open_and_flags():
    assert _status(dist("<http://example.org/proprietary>")) == "non_open"
    row = [{"conforms": True, "violation_count": 0, "legal_citation_issue": False, "no_api_access": False,
            "license_status": "non_open", "publisher_mismatch": False}]
    assert appmod._hvd_finalize_datasets(row)[0]["flagged"] is True


def test_other_cc_versions_and_restricted_cc_licences_are_not_open_for_hvd():
    """The old substring markers accepted all of these."""
    for lic in ("lic:CC_BY_3_0", "lic:CC_BY_SA_4_0", "lic:CC_BY_NC_4_0", "<http://opendatacommons.org/licenses/by/1.0/>"):
        assert _status(dist(lic)) == "non_open", lic


def test_a_national_licence_mapped_to_cc_by_4_is_open():
    mapped = "<http://example.org/gr-open-licence> skos:exactMatch lic:CC_BY_4_0 .\n"
    for prop in ("skos:exactMatch", "skos:narrowMatch", "skos:broadMatch", "skos:closeMatch", "owl:sameAs", "rdfs:seeAlso"):
        body = dist("<http://example.org/gr-open-licence>") + f"<http://example.org/gr-open-licence> {prop} lic:CC_BY_4_0 .\n"
        assert _status(body) == "open", prop
    assert _status(dist("<http://example.org/gr-open-licence>") + mapped) == "open"
    assert _status(dist("<http://example.org/gr-open-licence>")) == "non_open"   # unmapped


def test_a_licence_on_the_dataset_itself_is_not_read():
    body = ("<http://e.org/ds> a dcat:Dataset ; dct:license lic:CC_BY_4_0 .\n" + dist())
    assert _status(body) == "missing"


def test_rights_is_not_a_licence():
    assert _status(dist() + "<http://e.org/d> dct:rights lic:CC_BY_4_0 .\n") == "missing"


def test_a_non_open_licence_on_a_distribution_that_is_not_a_bulk_download_is_ignored():
    assert _status(dist("<http://example.org/proprietary>", bulk=False)) == "missing"


def test_a_data_service_uses_its_own_licence_else_the_one_of_the_distribution_that_points_to_it():
    own_open = ("<http://e.org/svc> a dcat:DataService ; dct:license lic:CC0 .\n")
    own_closed = ("<http://e.org/svc> a dcat:DataService ; dct:license <http://example.org/proprietary> .\n")
    assert _status(own_open) == "open"
    assert _status(own_closed) == "non_open"
    # no licence on the service: the distribution's is used
    via = ("<http://e.org/svc> a dcat:DataService .\n"
           "<http://e.org/d> a dcat:Distribution ; dcat:accessURL <http://e.org/a> ; dcat:accessService <http://e.org/svc> ; "
           "dct:license lic:CC_BY_4_0 .\n")
    assert _status(via) == "open"
    # a service with no licence at all is optional per the spec -> not a failure
    assert _status("<http://e.org/svc> a dcat:DataService .\n") == "missing"


def test_the_check_version_was_bumped_so_old_licence_verdicts_are_recomputed():
    assert appmod._HVD_CHECK_VERSION >= 5
