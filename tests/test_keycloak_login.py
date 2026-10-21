"""Login with the data.gov.gr Keycloak: the full authorization-code round trip
against a faked Keycloak (self-signed RSA key, so the ID token's signature,
issuer, audience and nonce are really verified) and a faked CKAN."""
import json
import time
from urllib.parse import parse_qs, urlparse

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

import app as appmod
import config
import keycloak_auth
from models import User, db

ISSUER = "https://auth.example/realms/data"
_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class _Resp:
    def __init__(self, payload, status=200):
        self._payload, self.status_code = payload, status

    def json(self):
        return self._payload


class _FakeHttp:
    def __init__(self):
        self.id_token_claims = {}
        self.ckan = {}            # action -> result | "notfound"
        self.ckan_down = False
        self.nonce = None

    def get(self, url, **kw):
        return _Resp({"issuer": ISSUER, "authorization_endpoint": ISSUER + "/auth", "token_endpoint": ISSUER + "/token",
                      "jwks_uri": ISSUER + "/certs", "end_session_endpoint": ISSUER + "/logout"})

    def post(self, url, **kw):
        if url == ISSUER + "/token":
            claims = {"iss": ISSUER, "aud": "crm", "exp": int(time.time()) + 300, "nonce": self.nonce, **self.id_token_claims}
            return _Resp({"id_token": jwt.encode(claims, _KEY, algorithm="RS256"), "access_token": "x"})
        action = url.rsplit("/", 1)[1]
        if self.ckan_down:
            raise keycloak_auth.requests.ConnectionError("down")
        result = self.ckan.get(action)
        if result == "notfound":
            return _Resp({"success": False, "error": {"__type": "Not Found Error"}})
        return _Resp({"success": True, "result": result})


@pytest.fixture
def kc(monkeypatch):
    monkeypatch.setattr(config, "KEYCLOAK_ISSUER", ISSUER)
    monkeypatch.setattr(config, "KEYCLOAK_CLIENT_ID", "crm")
    monkeypatch.setattr(config, "KEYCLOAK_CLIENT_SECRET", "secret")
    monkeypatch.setattr(config, "CKAN_SYSADMIN_API_TOKEN", "tok")
    monkeypatch.setattr(appmod.limiter, "enabled", False)  # 13 logins in a few seconds would trip 10/min
    fake = _FakeHttp()
    monkeypatch.setattr(keycloak_auth, "_http", fake)
    monkeypatch.setattr(keycloak_auth, "_signing_key", lambda token, uri: _KEY.public_key())
    keycloak_auth._discovery_cache.clear()
    fake.id_token_claims = {"sub": "abc", "preferred_username": "maria", "email": "Maria@Example.gr",
                            "email_verified": True, "name": "Maria P"}
    fake.ckan = {"user_show": {"state": "active", "sysadmin": False},
                 "organization_list_for_user": [{"name": "some-org"}]}
    return fake


def _login(client, kc, state_override=None):
    r = client.get("/login/keycloak")
    assert r.status_code == 302
    q = parse_qs(urlparse(r.headers["Location"]).query)
    kc.nonce = q["nonce"][0]
    return client.get("/auth/callback", query_string={"code": "c", "state": state_override or q["state"][0]})


def test_disabled_without_config(app):
    c = app.test_client()
    assert "Sign in with data.gov.gr" not in c.get("/login").get_data(as_text=True)
    assert c.get("/login/keycloak").headers["Location"].endswith("/login")


def test_button_shown_when_enabled(app, kc):
    assert "Sign in with data.gov.gr" in app.test_client().get("/login").get_data(as_text=True)


def test_org_admin_is_created_tab_restricted(app, kc):
    c = app.test_client()
    r = _login(c, kc)
    assert r.status_code == 302 and not r.headers["Location"].endswith("/login")
    u = User.query.filter_by(email="maria@example.gr").one()
    assert u.ckan_sub == "abc" and not u.is_superadmin and not u.is_admin
    assert u.org_scoped and json.loads(u.ckan_orgs) == ["some-org"] and u.password_hash is None
    assert u.allowed_tabs == "overview,org-analytics,datasets,quality,traffic"
    with c.session_transaction() as s:
        assert s["user_id"] == u.id


def test_sysadmin_becomes_superadmin(app, kc):
    kc.ckan["user_show"] = {"state": "active", "sysadmin": True}
    _login(app.test_client(), kc)
    u = User.query.filter_by(email="maria@example.gr").one()
    assert u.is_superadmin and u.is_admin and u.allowed_tabs is None


def test_existing_user_linked_and_roles_untouched(app, kc):
    db.session.add(User(email="maria@example.gr", is_admin=True, allowed_tabs="overview,comms"))
    db.session.commit()
    _login(app.test_client(), kc)
    u = User.query.filter_by(email="maria@example.gr").one()
    assert u.ckan_sub == "abc" and u.is_admin and not u.is_superadmin and u.allowed_tabs == "overview,comms"
    assert User.query.count() == 1


def test_unverified_email_not_linked_to_existing_user(app, kc):
    db.session.add(User(email="maria@example.gr", is_superadmin=True))
    db.session.commit()
    kc.id_token_claims["email_verified"] = False
    r = _login(app.test_client(), kc)
    assert r.status_code == 200 and "not verified" in r.get_data(as_text=True)
    assert User.query.one().ckan_sub is None


def test_plain_ckan_member_refused(app, kc):
    kc.ckan["organization_list_for_user"] = []
    c = app.test_client()
    r = _login(c, kc)
    assert r.status_code == 200 and "not an administrator" in r.get_data(as_text=True)
    assert User.query.count() == 0
    with c.session_transaction() as s:
        assert "user_id" not in s


def test_no_ckan_account_refused(app, kc):
    kc.ckan["user_show"] = "notfound"
    assert "no account in CKAN" in _login(app.test_client(), kc).get_data(as_text=True)


def test_fails_closed_when_ckan_down(app, kc):
    kc.ckan_down = True
    r = _login(app.test_client(), kc)
    assert r.status_code == 200 and User.query.count() == 0


def test_state_mismatch_refused(app, kc):
    r = _login(app.test_client(), kc, state_override="forged")
    assert r.status_code == 200 and User.query.count() == 0


def test_wrong_nonce_refused(app, kc):
    c = app.test_client()
    c.get("/login/keycloak")
    kc.nonce = "not-the-one"
    with c.session_transaction() as s:
        state = s["kc_tx"]["state"]
    r = c.get("/auth/callback", query_string={"code": "c", "state": state})
    assert r.status_code == 200 and User.query.count() == 0


def test_open_redirect_next_is_ignored(app, kc):
    c = app.test_client()
    r = c.get("/login/keycloak?next=//evil.example")
    q = parse_qs(urlparse(r.headers["Location"]).query)
    kc.nonce = q["nonce"][0]
    r = c.get("/auth/callback", query_string={"code": "c", "state": q["state"][0]})
    assert "evil.example" not in r.headers["Location"]


def test_logout_ends_keycloak_session(app, kc):
    c = app.test_client()
    _login(c, kc)
    r = c.get("/logout")
    assert r.headers["Location"].startswith(ISSUER + "/logout") and "id_token_hint=" in r.headers["Location"]
