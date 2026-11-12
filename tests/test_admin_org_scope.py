"""A superadmin can limit a user to chosen CKAN organizations (POST /api/users/<id>/scope) or lift the limit. Until now only a
Keycloak sign-in could make someone org-scoped. Hand-picked organizations must survive a later Keycloak login (which otherwise
rewrites ckan_orgs from CKAN), and the limit is a superadmin-only power that can never touch a superadmin, an admin, or oneself."""
import json
from types import SimpleNamespace

import pytest

import app as appmod
from models import User, db


@pytest.fixture(autouse=True)
def _no_csrf_or_rate_limit(monkeypatch):
    monkeypatch.setattr(appmod.csrf, "protect", lambda **kw: None)
    monkeypatch.setattr(appmod.limiter, "enabled", False)


def _user(email, **kw):
    u = User(email=email, **kw)
    db.session.add(u)
    db.session.commit()
    return u


def _client(app, user):
    c = app.test_client()
    with c.session_transaction() as s:
        s["user_id"] = user.id
        s["user_email"] = user.email
        s["is_admin"] = user.is_admin
        s["is_superadmin"] = user.is_superadmin
        s["allowed_tabs"] = user.allowed_tabs
        s["org_scope"] = appmod._user_org_scope(user)
    return c


def _set(c, user_id, **body):
    return c.post(f"/api/users/{user_id}/scope", json=body)


def test_a_superadmin_limits_a_user_to_chosen_organizations(app):
    boss, target = _user("boss@x.gr", is_admin=True, is_superadmin=True), _user("t@x.gr")
    r = _set(_client(app, boss), target.id, org_scoped=True, orgs=["org-b", "org-a", "org-a"])
    assert r.status_code == 200
    u = User.query.get(target.id)
    assert u.org_scoped and u.scope_manual and json.loads(u.ckan_orgs) == ["org-a", "org-b"]
    assert appmod._user_org_scope(u) == ["org-a", "org-b"]
    assert r.get_json()["user"]["org_scoped"] is True


def test_the_limit_can_be_lifted_again(app):
    boss = _user("boss@x.gr", is_admin=True, is_superadmin=True)
    target = _user("t@x.gr", org_scoped=True, scope_manual=True, ckan_orgs=json.dumps(["org-a"]))
    assert _set(_client(app, boss), target.id, org_scoped=False).status_code == 200
    u = User.query.get(target.id)
    assert not u.org_scoped and not u.scope_manual and u.ckan_orgs is None
    assert appmod._user_org_scope(u) is None


def test_lifting_the_limit_keeps_a_keycloak_users_own_list(app):
    boss = _user("boss@x.gr", is_admin=True, is_superadmin=True)
    target = _user("kc@x.gr", org_scoped=True, ckan_orgs=json.dumps(["from-ckan"]))   # created by Keycloak, not manual
    _set(_client(app, boss), target.id, org_scoped=False)
    assert json.loads(User.query.get(target.id).ckan_orgs) == ["from-ckan"]


def test_only_a_superadmin_may_do_it(app):
    plain_admin, target = _user("a@x.gr", is_admin=True), _user("t@x.gr")
    assert _set(_client(app, plain_admin), target.id, org_scoped=True, orgs=["org-a"]).status_code == 403
    assert not User.query.get(target.id).org_scoped


def test_never_a_superadmin_an_admin_or_yourself(app):
    boss = _user("boss@x.gr", is_admin=True, is_superadmin=True)
    other_super = _user("s2@x.gr", is_admin=True, is_superadmin=True)
    an_admin = _user("a@x.gr", is_admin=True)
    c = _client(app, boss)
    for victim in (other_super, an_admin, boss):
        assert _set(c, victim.id, org_scoped=True, orgs=["org-a"]).status_code == 400, victim.email
        assert not User.query.get(victim.id).org_scoped


@pytest.mark.parametrize("orgs", [[], None, "org-a", ["org a"], ["ok", "bad/slug"], [1]])
def test_an_empty_or_invalid_organization_list_is_refused(app, orgs):
    boss, target = _user("boss@x.gr", is_admin=True, is_superadmin=True), _user("t@x.gr")
    assert _set(_client(app, boss), target.id, org_scoped=True, orgs=orgs).status_code == 400
    assert not User.query.get(target.id).org_scoped


def _identity(orgs):
    return SimpleNamespace(sub="sub-1", email="t@x.gr", email_verified=True, name="T", username="t", sysadmin=False,
                           organizations=orgs)


def test_a_keycloak_login_does_not_overwrite_hand_picked_organizations(app):
    _user("t@x.gr", org_scoped=True, scope_manual=True, ckan_orgs=json.dumps(["mine-1", "mine-2"]))
    u = appmod._keycloak_user_for(_identity(["ckan-org"]))
    assert json.loads(u.ckan_orgs) == ["mine-1", "mine-2"]


def test_a_keycloak_login_still_refreshes_everyone_elses_organizations(app):
    _user("t@x.gr", org_scoped=True, ckan_orgs=json.dumps(["old"]))
    u = appmod._keycloak_user_for(_identity(["ckan-org"]))
    assert json.loads(u.ckan_orgs) == ["ckan-org"]
