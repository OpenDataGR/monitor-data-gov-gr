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
    "/api/matomo/top-searches", "/api/matomo/live", "/api/quality/mqa", "/api/datasets/geo-locations",
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
    monkeypatch.setattr(appmod, "_scope_dataset_names", lambda scope: {"mine-ds"})
    monkeypatch.setattr(appmod, "_matomo_flat_pages", lambda *a, **k: [
        {"label": "dataset > mine-ds", "nb_visits": 3, "nb_uniq_visitors": 2},
        {"label": "dataset > theirs", "nb_visits": 99, "nb_uniq_visitors": 50}])
    c = app.test_client()
    _login(c, _scoped())
    assert [r["slug"] for r in c.get("/api/matomo/top-datasets").get_json()] == ["mine-ds"]


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
    assert 'window.__ALLOWED_TABS__ = ["org-analytics", "datasets", "quality", "traffic"];' in html


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
