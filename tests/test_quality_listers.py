"""The quality checks list datasets with a package_search restricted by `fl`. CKAN then
returns each package's `organization` as a bare slug STRING, not an object -- reading it as
an object crashed every HVD/DCAT-AP/GeoDCAT-AP run with "'str' object has no attribute
'get'" (and left the org analytics pass rates empty). The listers must cope with both."""
import pytest

import app as appmod


class _Resp:
    def __init__(self, payload):
        self._payload = payload
        self.status_code = 200

    def json(self):
        return self._payload

    def raise_for_status(self):
        pass


def _fake_get(packages):
    def get(url, params=None, **kw):
        start = params.get("start", 0)
        return _Resp({"success": True, "result": {"count": len(packages), "results": packages[start:start + 100]}})
    return get


@pytest.fixture(autouse=True)
def _orgs(monkeypatch):
    monkeypatch.setitem(appmod._orgs_cache, "data", [{"name": "org-a", "title": "Org A", "package_count": 2}])


@pytest.mark.parametrize("lister", ["_list_hvd_datasets", "_list_all_datasets", "_list_geo_datasets"])
def test_organization_as_a_bare_slug_string(monkeypatch, lister):
    monkeypatch.setattr(appmod.requests, "get", _fake_get([
        {"name": "d1", "metadata_modified": "m1", "organization": "org-a"},
        {"name": "d2", "metadata_modified": "m2", "organization": "unknown-org"},  # not in the orgs cache
        {"name": "d3", "metadata_modified": "m3"},                                   # no organization at all
    ]))
    items = {d["name"]: d for d in getattr(appmod, lister)()}
    assert (items["d1"]["org_slug"], items["d1"]["org_title"]) == ("org-a", "Org A")
    assert (items["d2"]["org_slug"], items["d2"]["org_title"]) == ("unknown-org", "unknown-org")  # falls back to the slug
    assert (items["d3"]["org_slug"], items["d3"]["org_title"]) == ("", "")


@pytest.mark.parametrize("lister", ["_list_hvd_datasets", "_list_all_datasets", "_list_geo_datasets"])
def test_organization_as_a_full_object_still_works(monkeypatch, lister):
    monkeypatch.setattr(appmod.requests, "get", _fake_get([
        {"name": "d1", "metadata_modified": "m1", "organization": {"name": "org-b", "title": "Org B"}},
    ]))
    [d] = getattr(appmod, lister)()
    assert (d["org_slug"], d["org_title"]) == ("org-b", "Org B")


def test_every_checked_package_type_is_listed_and_tagged_from_its_own_query(monkeypatch):
    """package_search does not return a package's `type` through `fl`, so each type is listed with its own fq and tagged
    from the query that found it. Decisions (110 on 2026-11-12) are not DCAT and are never asked for."""
    seen = []

    def get(url, params=None, **kw):
        seen.append(params["fq"])
        name = {'type:"dataset"': "a-dataset", 'type:"data-service"': "a-service"}[params["fq"]]
        return _Resp({"success": True, "result": {"count": 1, "results": [
            {"name": name, "metadata_modified": "m", "organization": "org-a"}]}})

    monkeypatch.setattr(appmod.requests, "get", get)
    items = {d["name"]: d["pkg_type"] for d in appmod._list_all_datasets()}
    assert items == {"a-dataset": "dataset", "a-service": "data-service"}
    assert not any("decision" in fq for fq in seen)


def test_the_hvd_and_geo_lists_keep_their_own_filter_per_type(monkeypatch):
    seen = []

    def get(url, params=None, **kw):
        seen.append(params["fq"])
        return _Resp({"success": True, "result": {"count": 0, "results": []}})

    monkeypatch.setattr(appmod.requests, "get", get)
    appmod._list_hvd_datasets()
    appmod._list_geo_datasets()
    assert seen == ['type:"dataset" AND -hvd_category:"[]"', 'type:"data-service" AND -hvd_category:"[]"',
                    'type:"dataset" AND dcat_type:*GEOSPATIAL*', 'type:"data-service" AND dcat_type:*GEOSPATIAL*']


def test_a_cold_orgs_cache_is_filled_from_ckan(monkeypatch):
    monkeypatch.setitem(appmod._orgs_cache, "data", None)

    def fill():
        appmod._orgs_cache["data"] = [{"name": "org-a", "title": "Org A", "package_count": 1}]

    monkeypatch.setattr(appmod, "_fetch_orgs_quick", fill)
    monkeypatch.setattr(appmod.requests, "get", _fake_get([{"name": "d1", "metadata_modified": "m", "organization": "org-a"}]))
    assert appmod._list_all_datasets()[0]["org_title"] == "Org A"


def test_the_listers_survive_ckan_being_unable_to_list_orgs(monkeypatch):
    monkeypatch.setitem(appmod._orgs_cache, "data", None)

    def boom():
        raise RuntimeError("organization_list down")

    monkeypatch.setattr(appmod, "_fetch_orgs_quick", boom)
    monkeypatch.setattr(appmod.requests, "get", _fake_get([{"name": "d1", "metadata_modified": "m", "organization": "org-a"}]))
    [d] = appmod._list_all_datasets()
    assert (d["org_slug"], d["org_title"]) == ("org-a", "org-a")
