"""Org-scoped users (CKAN org admins who signed in through Keycloak) see the
stats of their own organizations and nothing else. Enforced on the server as a
deny-by-default route allowlist plus per-route filtering -- these tests drive
real requests through require_login, not just the helper functions."""
import json

import pytest

import app as appmod
import config
import keycloak_auth
from models import ApiToken, HvdCheckCache, HvdDatasetCheckCache, OrgSnapshot, User, db

MINE, OTHER = "my-org", "other-org"


class _Resp:
    def __init__(self, payload, status=200):
        self._payload, self.status_code = payload, status

    def json(self):
        return self._payload

    def raise_for_status(self):
        pass


@pytest.fixture
def ckan(monkeypatch):
    """Fakes every outbound requests.get the scoped routes make; records them."""
    calls = []
    state = {"dataset_org": MINE}

    def fake_get(url, params=None, **kw):
        calls.append((url, dict(params or {})))
        if url.endswith("/package_show"):
            return _Resp({"success": True, "result": {"name": params["id"], "title": "T", "resources": [],
                                                        "organization": {"name": state["dataset_org"], "title": "O"}}})
        return _Resp({"success": True, "result": {"count": 0, "results": [], "search_facets": {}}})

    monkeypatch.setattr(appmod.requests, "get", fake_get)
    monkeypatch.setattr(appmod.limiter, "enabled", False)
    ckan.calls, ckan.state = calls, state
    return ckan


def _login(client, user):
    with client.session_transaction() as s:
        s["user_id"] = user.id
        s["user_email"] = user.email
        s["is_admin"] = user.is_admin
        s["is_superadmin"] = user.is_superadmin
        s["allowed_tabs"] = user.allowed_tabs
        s["org_scope"] = appmod._user_org_scope(user)


def _scoped(orgs=(MINE,)):
    u = User(email="oa@example.gr", org_scoped=True, ckan_orgs=json.dumps(list(orgs)),
             allowed_tabs=appmod._ORG_SCOPED_TABS)
    db.session.add(u)
    db.session.commit()
    return u


def _admin():
    u = User(email="admin@example.gr", is_admin=True, is_superadmin=True)
    db.session.add(u)
    db.session.commit()
    return u


@pytest.mark.parametrize("path", [
    "/api/communications", "/api/cases", "/api/contacts", "/api/portal-members", "/api/public-orgs",
    "/api/stats/latest", "/api/stats/live", "/api/health/summary", "/api/matomo/summary",
    "/api/matomo/top-searches", "/api/matomo/live", "/api/quality/mqa", "/api/quality/mqa/history", "/api/quality/mqa/comparison", "/api/stats/history",
    "/api/org-analytics/classifications", "/api/users", "/admin/users", "/api-docs",
])
def test_everything_outside_the_allowlist_is_refused(app, ckan, path):
    c = app.test_client()
    _login(c, _scoped())
    assert c.get(path).status_code in (403, 302), path
    if path.startswith("/api/"):
        assert c.get(path).status_code == 403


def test_allowlist_is_get_only_for_data_routes(app, ckan, monkeypatch):
    monkeypatch.setattr(appmod.csrf, "protect", lambda **kw: None)  # so it's the allowlist answering, not CSRF
    c = app.test_client()
    _login(c, _scoped())
    # POST start/clear of a portal-wide check and an org refresh are not theirs.
    assert c.post("/api/quality/hvd-check").status_code == 403
    assert c.post("/api/quality/hvd-check/clear").status_code == 403
    assert c.post("/api/organizations").status_code == 403


def test_org_analytics_only_for_own_orgs(app, ckan):
    c = app.test_client()
    _login(c, _scoped())
    for tail in ("scorecard", "peer-comparison", "trend"):
        assert c.get(f"/api/org-analytics/{OTHER}/{tail}").status_code == 403
        assert c.get(f"/api/org-analytics/{MINE}/{tail}").status_code != 403
    assert c.get("/api/org-analytics/categories").status_code == 200  # averages only, no org names


def test_dataset_search_is_always_limited_to_own_orgs(app, ckan):
    c = app.test_client()
    _login(c, _scoped())
    assert c.get(f"/api/datasets/search?org={OTHER}").status_code == 403
    assert c.get("/api/datasets/search").status_code == 200
    fqs = [p.get("fq", "") for u, p in ckan.calls if u.endswith("/package_search")]
    assert fqs and all(f'organization:("{MINE}")' in fq for fq in fqs)


@pytest.mark.parametrize("param", ["format", "type"])
def test_dataset_search_filter_cannot_break_out_of_the_scope(app, ckan, param):
    c = app.test_client()
    _login(c, _scoped())
    evil = 'x" OR organization:other-org OR y:"'
    assert c.get("/api/datasets/search", query_string={param: evil}).status_code == 400
    assert not ckan.calls


def test_unscoped_user_search_is_untouched(app, ckan):
    c = app.test_client()
    _login(c, _admin())
    assert c.get(f"/api/datasets/search?org={OTHER}").status_code == 200
    assert not any("organization:(" in p.get("fq", "") for _u, p in ckan.calls)


def test_empty_scope_sees_nothing(app, ckan):
    c = app.test_client()
    _login(c, _scoped(orgs=()))
    c.get("/api/datasets/search")
    assert any(p.get("fq") == "-*:*" for _u, p in ckan.calls)


def test_dataset_detail_of_another_org_is_not_found(app, ckan):
    c = app.test_client()
    _login(c, _scoped())
    assert c.get("/api/datasets/some-dataset").status_code == 200
    ckan.state["dataset_org"] = OTHER
    assert c.get("/api/datasets/some-dataset").status_code == 404


def test_organizations_list_and_detail(app, ckan):
    appmod._orgs_cache["data"] = [{"name": MINE, "title": "Mine", "package_count": 1},
                                  {"name": OTHER, "title": "Other", "package_count": 5}]
    c = app.test_client()
    _login(c, _scoped())
    assert [o["name"] for o in c.get("/api/organizations").get_json()["data"]] == [MINE]
    assert c.get(f"/api/organizations/{OTHER}").status_code == 403


def test_quality_results_and_export_are_narrowed_to_own_orgs(app, ckan):
    def row(name, slug, conforms):
        return HvdDatasetCheckCache(name=name, org_slug=slug, metadata_modified="m", result_json=json.dumps(
            {"_cache_version": appmod._HVD_CHECK_VERSION, "result": {"name": name, "conforms": conforms}}))
    db.session.add_all([row("a", MINE, True), row("b", MINE, False), row("c", OTHER, False)])
    blob = {"summary": {"total": 3, "checked": 3, "conforms": 1}, "finished_at": "x", "partial": False, "datasets": [
        {"name": "a", "org_slug": MINE, "title": "A", "org_title": "Mine", "conforms": True, "flagged": False,
         "legal_citation_issue": False, "no_api_access": False, "license_status": "open", "publisher_mismatch": False},
        {"name": "b", "org_slug": MINE, "title": "B", "org_title": "Mine", "conforms": False, "flagged": True,
         "legal_citation_issue": True, "no_api_access": False, "license_status": "open", "publisher_mismatch": False},
        {"name": "c", "org_slug": OTHER, "title": "C", "org_title": "Other", "conforms": False, "flagged": True,
         "legal_citation_issue": True, "no_api_access": False, "license_status": "open", "publisher_mismatch": False},
        {"name": "nosuch", "title": "no slug at all", "conforms": False},  # unattributable: never shown to a scoped user
    ]}
    db.session.add(HvdCheckCache(id=1, data_json=json.dumps(blob)))
    db.session.commit()

    c = app.test_client()
    _login(c, _scoped())
    res = c.get("/api/quality/hvd-check").get_json()["result"]
    assert sorted(d["name"] for d in res["datasets"]) == ["a", "b"]
    assert res["summary"]["total"] == 2 and res["summary"]["checked"] == 2 and res["summary"]["conforms"] == 1
    assert res["summary"]["legal_citation_issue"] == 1  # counted from own datasets only, not the portal's

    export = c.get("/api/quality/hvd-check/export?filters=compliant")
    assert export.status_code == 200
    assert b"Other" not in export.data and b"no slug" not in export.data

    # An unscoped admin still gets the whole thing.
    c2 = app.test_client()
    _login(c2, _admin())
    assert len(c2.get("/api/quality/hvd-check").get_json()["result"]["datasets"]) == 4


def test_matomo_dataset_stats_checks_the_datasets_org(app, ckan, monkeypatch):
    monkeypatch.setattr(config, "MATOMO_TOKEN", "tok")
    monkeypatch.setattr(appmod, "_matomo_get", lambda *a, **k: {})
    c = app.test_client()
    _login(c, _scoped())
    ckan.state["dataset_org"] = OTHER
    assert c.get("/api/matomo/dataset-stats?name=d").status_code == 403
    assert c.get("/api/matomo/dataset-analytics?name=d").status_code == 403
    ckan.state["dataset_org"] = MINE
    assert c.get("/api/matomo/dataset-stats?name=d").status_code == 200


def test_top_datasets_only_lists_own_datasets(app, ckan, monkeypatch):
    monkeypatch.setattr(config, "MATOMO_TOKEN", "tok")
    appmod._dataset_day_cache.clear(); appmod._dataset_page_visits_cache.clear()
    monkeypatch.setattr(appmod, "_scope_dataset_names", lambda scope: {"mine-ds"})
    monkeypatch.setattr(appmod, "_matomo_get", lambda method, params, **kw: [
        {"label": "dataset > mine-ds", "nb_visits": 3, "nb_uniq_visitors": 2},
        {"label": "dataset > theirs", "nb_visits": 99, "nb_uniq_visitors": 50}])
    c = app.test_client()
    _login(c, _scoped())
    assert [r["slug"] for r in c.get("/api/matomo/top-datasets?days=2").get_json()] == ["mine-ds"]


def test_api_token_of_a_scoped_user_is_scoped_too(app, ckan):
    u = _scoped()
    raw = appmod._generate_api_token()
    db.session.add(ApiToken(user_id=u.id, token_hash=appmod._hash_api_token(raw), label="t"))
    db.session.commit()
    c = app.test_client()
    h = {"Authorization": f"Bearer {raw}"}
    assert c.get("/api/communications", headers=h).status_code == 403
    assert c.get(f"/api/org-analytics/{OTHER}/trend", headers=h).status_code == 403
    assert c.get(f"/api/org-analytics/{MINE}/trend", headers=h).status_code == 200


def test_session_without_cached_scope_fails_closed(app, ckan):
    u = _scoped()
    c = app.test_client()
    with c.session_transaction() as s:
        s["user_id"] = u.id
    assert c.get("/api/communications").status_code == 403


def test_index_hides_overview_and_flags_the_user(app, ckan):
    c = app.test_client()
    _login(c, _scoped())
    html = c.get("/").get_data(as_text=True)
    assert "window.__ORG_SCOPED__ = true;" in html
    assert 'window.__ALLOWED_TABS__ = ["orgs", "org-analytics", "datasets", "quality", "traffic", "stats", "geo-insights"];' in html


def test_extra_tabs_granted_by_a_superadmin_do_not_widen_the_scope(app, ckan):
    u = _scoped()
    u.allowed_tabs = "overview,comms,contacts"
    db.session.commit()
    c = app.test_client()
    _login(c, u)
    assert c.get("/api/communications").status_code == 403
    assert c.get("/api/contacts").status_code == 403


# ── how the Keycloak login decides who is scoped ───────────────────────────────

def _ident(sub="s1", email="oa@example.gr", sysadmin=False, orgs=(MINE,), verified=True):
    return keycloak_auth.Identity(sub=sub, username="u", email=email, email_verified=verified, name="N",
                                  sysadmin=sysadmin, organizations=tuple(orgs), id_token="t", next_url="")


def test_new_org_admin_is_scoped_with_their_orgs(app):
    u = appmod._keycloak_user_for(_ident(orgs=("a", "b")))
    db.session.commit()
    assert u.org_scoped and json.loads(u.ckan_orgs) == ["a", "b"] and not u.is_admin
    assert u.allowed_tabs == appmod._ORG_SCOPED_TABS


def test_new_sysadmin_is_not_scoped(app):
    u = appmod._keycloak_user_for(_ident(sysadmin=True, orgs=()))
    db.session.commit()
    assert u.is_superadmin and not u.org_scoped and appmod._user_org_scope(u) is None


def test_orgs_are_refreshed_at_every_login(app):
    appmod._keycloak_user_for(_ident(orgs=("a", "b")))
    db.session.commit()
    u = appmod._keycloak_user_for(_ident(orgs=("a",)))
    db.session.commit()
    assert json.loads(u.ckan_orgs) == ["a"]


def test_existing_user_linked_by_email_keeps_roles_and_is_not_scoped(app):
    db.session.add(User(email="oa@example.gr", allowed_tabs="overview,comms"))
    db.session.commit()
    u = appmod._keycloak_user_for(_ident())
    db.session.commit()
    assert not u.org_scoped and u.allowed_tabs == "overview,comms" and json.loads(u.ckan_orgs) == [MINE]
    assert appmod._user_org_scope(u) is None


def test_header_has_no_portal_wide_widgets_for_a_scoped_user(app, ckan):
    markers = ('id="statDatasets"', 'id="statUptime"', "triggerCheck()", 'id="lastChecked"')
    c = app.test_client()
    _login(c, _scoped())
    scoped_html = c.get("/").get_data(as_text=True)
    assert not any(m in scoped_html for m in markers)
    c2 = app.test_client()
    _login(c2, _admin())
    admin_html = c2.get("/").get_data(as_text=True)
    assert all(m in admin_html for m in markers)


def test_orgs_tab_is_offered_even_to_a_scoped_user_created_before_it_existed(app, ckan):
    u = _scoped()
    u.allowed_tabs = "overview,org-analytics,datasets,quality,traffic"  # the old stored value
    db.session.commit()
    c = app.test_client()
    _login(c, u)
    assert '"orgs"' in c.get("/").get_data(as_text=True).split("window.__ALLOWED_TABS__ = ")[1].split(";")[0]
    assert c.get("/api/organizations").status_code == 200


def _matomo_days(monkeypatch, rows_for_day):
    """Fakes _matomo_get for the per-day page report; records every (method, params) asked."""
    appmod._dataset_day_cache.clear(); appmod._dataset_page_visits_cache.clear()
    monkeypatch.setattr(config, "MATOMO_TOKEN", "tok")
    asked = []

    def fake(method, params, **kw):
        asked.append((method, dict(params)))
        return rows_for_day(params["date"])

    monkeypatch.setattr(appmod, "_matomo_get", fake)
    return asked


def test_top_datasets_for_a_scoped_user_sums_per_day_reports(app, ckan, monkeypatch):
    """A flat page report over a whole range exhausts Matomo's 512 MB PHP limit (HTTP 500), so the range is
    built from one-day reports. A scoped user sees only their own datasets, a dataset's own page only (not its
    resource sub-pages), with its /el/ and /en/ variants added up."""
    monkeypatch.setattr(appmod, "_scope_dataset_names", lambda scope: {"mine-a", "mine-b"})
    asked = _matomo_days(monkeypatch, lambda day: [
        {"label": "dataset > mine-a", "nb_visits": 5, "nb_uniq_visitors": 4},
        {"label": "el > dataset > mine-a", "nb_visits": 3, "nb_uniq_visitors": 3},
        {"label": "dataset > mine-a > resource > r1", "nb_visits": 50, "nb_uniq_visitors": 40},  # sub-page: not counted
        {"label": "dataset > mine-b", "nb_visits": 1, "nb_uniq_visitors": 1},
        {"label": "dataset > theirs", "nb_visits": 999, "nb_uniq_visitors": 500},
    ])
    c = app.test_client()
    _login(c, _scoped())

    rows = c.get("/api/matomo/top-datasets?days=3&limit=100").get_json()

    assert [(r["slug"], r["visits"]) for r in rows] == [("mine-a", 24), ("mine-b", 3)]   # 3 days x (5+3) / x 1
    assert len(asked) == 3 and {m for m, _ in asked} == {"Actions.getPageUrls"}
    assert all(p["period"] == "day" and p["flat"] == 1 and p["filter_limit"] == 1000 for _, p in asked)
    assert len({p["date"] for _, p in asked}) == 3


def test_top_datasets_for_an_unscoped_admin_also_avoids_the_range_report(app, ckan, monkeypatch):
    asked = _matomo_days(monkeypatch, lambda day: [
        {"label": "dataset > a", "nb_visits": 5, "nb_uniq_visitors": 4},
        {"label": "en > dataset > a", "nb_visits": 2, "nb_uniq_visitors": 2},
        {"label": "dataset > b", "nb_visits": 1, "nb_uniq_visitors": 1}])
    c = app.test_client()
    _login(c, _admin())
    rows = c.get("/api/matomo/top-datasets?days=2").get_json()
    assert [(r["slug"], r["visits"]) for r in rows] == [("a", 14), ("b", 2)]
    assert all(p["period"] == "day" for _, p in asked)


def test_past_days_are_cached_so_a_longer_range_only_asks_for_the_new_days(app, ckan, monkeypatch):
    monkeypatch.setattr(appmod, "_scope_dataset_names", lambda scope: {"a"})
    asked = _matomo_days(monkeypatch, lambda day: [{"label": "dataset > a", "nb_visits": 1, "nb_uniq_visitors": 1}])
    c = app.test_client()
    _login(c, _admin())
    c.get("/api/matomo/top-datasets?days=2")
    assert len(asked) == 2
    c.get("/api/matomo/top-datasets?days=3")        # a different range, but two of its days are already known
    assert len(asked) == 3


def test_a_day_matomo_fails_on_is_skipped_but_all_days_failing_is_an_error(app, ckan, monkeypatch):
    def rows(day):
        raise RuntimeError("Allowed memory size exhausted")
    _matomo_days(monkeypatch, rows)
    c = app.test_client()
    _login(c, _admin())
    r = c.get("/api/matomo/top-datasets?days=2")
    assert r.status_code == 503 and "did not answer" in r.get_json()["error"]

    first = {}
    def flaky(day):
        if not first:
            first["day"] = day
            raise RuntimeError("boom")
        return [{"label": "dataset > a", "nb_visits": 4, "nb_uniq_visitors": 4}]
    _matomo_days(monkeypatch, flaky)
    rows_ok = c.get("/api/matomo/top-datasets?days=3").get_json()
    assert [(r["slug"], r["visits"]) for r in rows_ok] == [("a", 8)]    # the 2 days that answered


def test_a_range_longer_than_the_page_report_supports_is_refused_clearly(app, ckan, monkeypatch):
    asked = _matomo_days(monkeypatch, lambda day: [])
    c = app.test_client()
    _login(c, _admin())
    r = c.get("/api/matomo/top-datasets?start=2025-01-01&end=2026-01-01")
    assert r.status_code == 400 and "at most 120 days" in r.get_json()["error"] and asked == []


# ── downloads of the scoped user's own datasets ────────────────────────────────

def test_top_downloads_for_a_scoped_user_lists_only_their_own_datasets_files(app, ckan, monkeypatch):
    """Matomo's download report is portal-wide; a scoped user must see only files that belong to
    THEIR datasets -- matched by resource URL (scheme-insensitive) or by the portal's own
    /dataset/<theirs>/resource/ path -- and never another org's file or one that can't be attributed."""
    monkeypatch.setattr(config, "MATOMO_TOKEN", "tok")
    appmod._all_downloads_cache.clear()
    appmod._scope_resources_cache.clear()
    asked = {}

    def fake_get(url, params=None, **kw):
        if url.endswith("/package_search"):
            asked.update(params)
            return _Resp({"success": True, "result": {"count": 1, "results": [
                {"name": "mine-a", "id": "pkg-uuid-a", "title": "Mine A", "resources": [{"url": "http://files.example.gr/a.csv"},
                                                                   {"url": "https://files.example.gr/a2.csv/"}]}]}})
        return _Resp({"success": True, "result": {}})

    monkeypatch.setattr(appmod.requests, "get", fake_get)

    def fake_matomo(method, params, **kw):
        asked["matomo_filter_limit"] = params.get("filter_limit")
        return [
            {"label": "files.example.gr/a.csv", "nb_visits": 7},                       # scheme differs from CKAN's http://
            {"label": "https://files.example.gr/a2.csv", "nb_visits": 2},             # CKAN has a trailing slash
            {"label": "data.gov.gr/dataset/mine-a/resource/r1/download/x.xls", "nb_visits": 4},  # portal file link
            {"label": "data.gov.gr/dataset/pkg-uuid-a/resource/r2/download/z.csv", "nb_visits": 6},  # the real format: dataset UUID
            {"label": "data.gov.gr/dataset/theirs/resource/r9/download/y.xls", "nb_visits": 999},  # another org's
            {"label": "elsewhere.example.org/unknown.csv", "nb_visits": 500},          # can't be attributed
            {"label": "Άλλα - 12 more", "nb_visits": 80},                              # Matomo aggregation row
        ]

    monkeypatch.setattr(appmod, "_matomo_get", fake_matomo)
    c = app.test_client()
    _login(c, _scoped())

    rows = c.get("/api/matomo/top-downloads?limit=50").get_json()

    assert [(r["url"].split("://", 1)[1], r["visits"]) for r in rows] == [
        ("files.example.gr/a.csv", 7), ("data.gov.gr/dataset/pkg-uuid-a/resource/r2/download/z.csv", 6),
        ("data.gov.gr/dataset/mine-a/resource/r1/download/x.xls", 4), ("files.example.gr/a2.csv", 2)]
    assert {r["dataset"] for r in rows} == {"mine-a"} and rows[0]["dataset_title"] == "Mine A"
    assert asked["matomo_filter_limit"] > 1000          # the whole list, not Matomo's top few
    assert asked["fq"] == f'organization:("{MINE}")'     # CKAN was asked for their org only


def test_top_downloads_for_an_org_with_no_datasets_is_empty(app, ckan, monkeypatch):
    monkeypatch.setattr(config, "MATOMO_TOKEN", "tok")
    appmod._all_downloads_cache.clear()
    appmod._scope_resources_cache.clear()
    monkeypatch.setattr(appmod, "_matomo_get", lambda *a, **k: [{"label": "x.example.gr/a.csv", "nb_visits": 5}])
    c = app.test_client()
    _login(c, _scoped(orgs=()))
    assert c.get("/api/matomo/top-downloads").get_json() == []


def test_top_downloads_for_an_unscoped_user_is_still_the_portal_wide_list(app, ckan, monkeypatch):
    monkeypatch.setattr(config, "MATOMO_TOKEN", "tok")
    monkeypatch.setattr(appmod, "_matomo_get", lambda *a, **k: [
        {"label": "x.example.gr/a.csv", "nb_visits": 5}, {"label": "y.example.gr/b.csv", "nb_visits": 9}])
    c = app.test_client()
    _login(c, _admin())
    rows = c.get("/api/matomo/top-downloads").get_json()
    assert [(r["url"], r["visits"]) for r in rows] == [("https://y.example.gr/b.csv", 9), ("https://x.example.gr/a.csv", 5)]
    assert "dataset" not in rows[0]


# ── their own datasets on the map, and over time ───────────────────────────────

def _fake_ckan_packages(monkeypatch, packages, seen):
    def fake_get(url, params=None, **kw):
        if url.endswith("/package_search"):
            seen.append(dict(params or {}))
            return _Resp({"success": True, "result": {"count": len(packages), "results": packages}})
        return _Resp({"success": True, "result": {}})
    monkeypatch.setattr(appmod.requests, "get", fake_get)


def test_geo_locations_for_a_scoped_user_are_their_own_datasets_only(app, ckan, monkeypatch):
    """The shared map is one marker per organization across the whole portal; a scoped user gets one
    point per geospatial dataset of THEIR orgs (and a request restricted to them in CKAN)."""
    appmod._scope_geo_cache.clear()
    seen = []
    _fake_ckan_packages(monkeypatch, [
        {"name": "mine-a", "title": "Mine A", "spatial_coverage": [{"centroid": '{"type":"Point","coordinates":[23.7,37.9]}'}]},
        {"name": "no-location", "title": "N", "spatial_coverage": []},
    ], seen)
    c = app.test_client()
    _login(c, _scoped())

    data = c.get("/api/datasets/geo-locations").get_json()

    assert data["locations"] == [{"dataset": "mine-a", "org_title": "Mine A", "lat": 37.9, "lon": 23.7, "count": 1}]
    assert data["enriching"] is False
    assert seen[0]["fq"] == f'(organization:("{MINE}")) AND dcat_type:*GEOSPATIAL*'


def test_geo_locations_for_an_org_with_no_orgs_is_empty_and_asks_ckan_nothing(app, ckan, monkeypatch):
    appmod._scope_geo_cache.clear()
    seen = []
    _fake_ckan_packages(monkeypatch, [{"name": "x", "spatial_coverage": [{"centroid": '{"type":"Point","coordinates":[1,2]}'}]}], seen)
    c = app.test_client()
    _login(c, _scoped(orgs=()))
    assert c.get("/api/datasets/geo-locations").get_json()["locations"] == [] and seen == []


def test_dataset_growth_for_a_scoped_user_counts_only_their_datasets(app, ckan, monkeypatch):
    appmod._scope_growth_cache.clear()
    seen = []
    _fake_ckan_packages(monkeypatch, [{"metadata_created": "2020-01-05T10:00:00"},
                                      {"metadata_created": "2026-01-02T10:00:00"}], seen)
    c = app.test_client()
    _login(c, _scoped())

    data = c.get("/api/stats/dataset-growth").get_json()

    assert seen[0]["fq"] == f'organization:("{MINE}")' and seen[0]["fl"] == "metadata_created"
    assert data["summary"]["datasets"] == 2 and data["summary"]["organizations"] == 1
    assert data["summary"]["last_added"] == "2026-01-02T10:00:00"
    assert data["weeks"][-1]["count"] == 2 and data["enriching"] is False


def test_dataset_growth_for_an_unscoped_admin_is_still_the_shared_portal_series(app, ckan, monkeypatch):
    monkeypatch.setitem(appmod._dataset_growth_cache, "weeks", [{"week_start": "2026-01-05", "count": 123}])
    c = app.test_client()
    _login(c, _admin())
    data = c.get("/api/stats/dataset-growth").get_json()
    assert data["weeks"] == [{"week_start": "2026-01-05", "count": 123}] and "summary" not in data


def test_a_scoped_user_created_before_these_tabs_existed_can_still_use_them(app, ckan, monkeypatch):
    """Their stored allowed_tabs predates stats/geo-insights; the tab check must use the fixed scoped set."""
    appmod._scope_growth_cache.clear()
    appmod._scope_geo_cache.clear()
    _fake_ckan_packages(monkeypatch, [], [])
    u = _scoped()
    u.allowed_tabs = "overview,orgs,org-analytics,datasets,quality,traffic"  # the old stored value
    db.session.commit()
    c = app.test_client()
    _login(c, u)
    assert c.get("/api/stats/dataset-growth").status_code == 200
    assert c.get("/api/datasets/geo-locations").status_code == 200
    assert c.get("/api/stats/history").status_code == 403      # portal-wide: still not theirs


# ── API calls aimed at their own datasets ──────────────────────────────────────

def test_scope_resource_index_carries_dataset_and_resource_ids(app, ckan, monkeypatch):
    appmod._scope_resources_cache.clear()
    seen = []
    _fake_ckan_packages(monkeypatch, [
        {"name": "mine-a", "id": "pkg-uuid-a", "title": "Mine A",
         "resources": [{"id": "res-1", "url": "http://f.example.gr/a.csv"}, {"id": "res-2"}]}], seen)
    with app.test_request_context():
        appmod.session["org_scope"] = [MINE]
        index = appmod._scope_resource_index((MINE,))
    assert index["ids"] == {"mine-a": "mine-a", "pkg-uuid-a": "mine-a", "res-1": "mine-a", "res-2": "mine-a"}
    assert index["titles"] == {"mine-a": "Mine A"} and index["by_url"] == {"f.example.gr/a.csv": "mine-a"}


def test_top_api_calls_for_a_scoped_user_counts_only_calls_about_their_datasets(app, ckan, monkeypatch):
    """The event NAME is the whole API URL; a call is theirs only if its ?id= / ?resource_id= is one of their
    datasets, their dataset uuids or their resource uuids. Searches, other orgs' datasets and Matomo's own
    non-API events never count, and raw URLs are never sent back."""
    monkeypatch.setattr(config, "MATOMO_TOKEN", "tok")
    appmod._all_api_events_cache.clear()
    monkeypatch.setattr(appmod, "_scope_resource_index", lambda scope: {
        "by_url": {}, "titles": {"mine-a": "Mine A", "mine-b": "Mine B"},
        "ids": {"mine-a": "mine-a", "pkg-uuid-a": "mine-a", "res-1": "mine-a", "mine-b": "mine-b"}})
    asked = {}

    def fake_matomo(method, params, **kw):
        asked.update(params, method=method)
        api = "http://data.gov.gr/api/action/"
        return [
            {"label": f"package_show - {api}package_show?id=mine-a", "nb_events": 14},
            {"label": f"package_show - {api}package_show?id=pkg-uuid-a", "nb_events": 3},
            {"label": f"datastore_search - {api}datastore_search?resource_id=res-1&limit=200&q=secret", "nb_events": 6},
            {"label": f"package_show - {api}package_show?id=mine-b", "nb_events": 2},
            {"label": f"package_show - {api}package_show?id=theirs", "nb_events": 999},        # another org's
            {"label": f"package_search - {api}package_search?q=mine-a", "nb_events": 50},      # a search, no id
            {"label": "ClickStatTile - Οργανισμοί", "nb_events": 12},                          # not an API event
            {"label": f"Open - {api}package_show?id=mine-a", "nb_events": 77},                 # capitalised: not a CKAN action
        ]

    monkeypatch.setattr(appmod, "_matomo_get", fake_matomo)
    c = app.test_client()
    _login(c, _scoped())

    resp = c.get("/api/matomo/top-api-calls?limit=10")
    data = resp.get_json()

    assert data["total"] == 25
    assert data["endpoints"] == [{"path": "package_show", "visits": 19}, {"path": "datastore_search", "visits": 6}]
    assert data["datasets"] == [{"dataset": "mine-a", "dataset_title": "Mine A", "visits": 23},
                                {"dataset": "mine-b", "dataset_title": "Mine B", "visits": 2}]
    assert asked["method"] == "Events.getAction" and asked["filter_limit"] > 1000
    assert "http" not in resp.get_data(as_text=True) and "secret" not in resp.get_data(as_text=True)


def test_top_api_calls_for_an_unscoped_user_is_still_the_portal_wide_report(app, ckan, monkeypatch):
    monkeypatch.setattr(config, "MATOMO_TOKEN", "tok")
    monkeypatch.setattr(appmod, "_matomo_flat_pages", lambda method, *a, **k: (
        [{"label": "API", "nb_events": 7}] if method == "Events.getCategory"
        else [{"label": "package_show", "nb_events": 5}]))
    c = app.test_client()
    _login(c, _admin())
    data = c.get("/api/matomo/top-api-calls").get_json()
    assert data == {"total": 7, "endpoints": [{"path": "package_show", "visits": 5}]}


def test_org_detail_withholds_communications_from_a_scoped_user(app, ckan):
    """The org panel must be able to tell 'withheld' from 'none': the key is simply absent for someone
    without comms access (the panel then omits the section instead of claiming 'no communications')."""
    c = app.test_client()
    _login(c, _scoped())
    data = c.get(f"/api/organizations/{MINE}").get_json()
    assert "comms_summary" not in data and "quality_summary" in data
    c2 = app.test_client()
    _login(c2, _admin())
    assert "comms_summary" in c2.get(f"/api/organizations/{MINE}").get_json()
