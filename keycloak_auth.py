"""Login with the data.gov.gr Keycloak (OpenID Connect authorization-code flow with PKCE).

Ported from loader.data.gov.gr's ``oidc_login.py`` + ``ckan_access.py``, merged into one module. Keycloak says *who*
a person is; it holds no CKAN permissions, so after the login we ask CKAN (with a sysadmin API token) whether that
person is a CKAN sysadmin or an administrator of at least one organization -- only those may sign in this way.

Off until configured: ``enabled()`` needs the issuer, client id, client secret and the CKAN sysadmin token (see
``deploy/README.md``). Until then the email/password and passkey logins work exactly as before.

What is checked, and why:
* ``state`` / PKCE ``code_verifier`` / ``nonce`` (kept in the Flask session) -- bind the login response to the
  browser that started it;
* the ID token's signature, issuer, audience (this client), expiry and nonce;
* CKAN: the person's CKAN user is ``user_<Keycloak sub>`` (never matched by user name, since a *different* CKAN user
  could share it); ``organization_list_for_user(permission="admin")`` is empty for editors/members.

It fails closed: when CKAN cannot be asked, nobody is let in through this route.
"""

from __future__ import annotations

import base64
import dataclasses
import hashlib
import hmac
import logging
import secrets
import time
from urllib.parse import urlencode

import jwt
import requests
from jwt import PyJWKClient

import config

logger = logging.getLogger(__name__)

SESSION_KEY = "kc_tx"
TX_TTL_S = 600
CKAN_USERNAME_PREFIX = "user_"
_ASYMMETRIC = ["RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512"]
_HTTP_TIMEOUT_S = 15
_DISCOVERY_TTL_S = 3600


class KeycloakError(Exception):
    """A login that cannot go on, with a message fit to show the person."""


class NotAllowed(KeycloakError):
    """Keycloak knows the person, but they are not a CKAN sysadmin / organization admin."""

    def __init__(self, username: str, reason: str):
        super().__init__("You signed in as %s, but this account may not use the Monitor: %s" % (username, reason))
        self.username = username
        self.reason = reason


@dataclasses.dataclass(frozen=True)
class Access:
    allowed: bool
    sysadmin: bool = False
    organizations: tuple[str, ...] = ()
    reason: str = ""


@dataclasses.dataclass(frozen=True)
class Identity:
    sub: str
    username: str
    email: str
    email_verified: bool
    name: str
    sysadmin: bool
    organizations: tuple[str, ...]
    id_token: str
    next_url: str


def enabled() -> bool:
    return bool(config.KEYCLOAK_ISSUER and config.KEYCLOAK_CLIENT_ID and config.KEYCLOAK_CLIENT_SECRET
                and config.CKAN_SYSADMIN_API_TOKEN)


def redirect_uri() -> str:
    return config.KEYCLOAK_REDIRECT_URI or (config.PUBLIC_BASE_URL + "/auth/callback")


# -- talking to Keycloak / CKAN (replaceable in tests) --------------------------------------------------------------------------

_http = requests
_discovery_cache: dict[str, tuple[float, dict]] = {}
_jwk_clients: dict[str, PyJWKClient] = {}


def discovery() -> dict:
    base = config.KEYCLOAK_ISSUER
    cached = _discovery_cache.get(base)
    if cached and time.time() - cached[0] < _DISCOVERY_TTL_S:
        return cached[1]
    try:
        resp = _http.get(base + "/.well-known/openid-configuration", timeout=_HTTP_TIMEOUT_S)
        document = resp.json() if resp.status_code == 200 else None
    except (requests.RequestException, ValueError) as exc:
        raise KeycloakError("The login server could not be reached (%s). Try again in a moment." % exc) from exc
    if not isinstance(document, dict) or document.get("issuer", "").rstrip("/") != base:
        raise KeycloakError("The login server answered with something unexpected.")
    _discovery_cache[base] = (time.time(), document)
    return document


def _signing_key(token: str, jwks_uri: str):
    client = _jwk_clients.setdefault(jwks_uri, PyJWKClient(jwks_uri))
    return client.get_signing_key_from_jwt(token).key


def _decode_id_token(token: str, jwks_uri: str) -> dict:
    try:
        return jwt.decode(token, _signing_key(token, jwks_uri), algorithms=_ASYMMETRIC, issuer=config.KEYCLOAK_ISSUER,
                          audience=config.KEYCLOAK_CLIENT_ID, options={"require": ["exp", "iss", "sub"]})
    except jwt.PyJWTError as exc:
        raise KeycloakError("The login could not be verified (%s)." % exc) from exc


def _ckan_call(action: str, data: dict):
    """One CKAN Action API call as the sysadmin. Raises ``LookupError`` when CKAN says "not found", ``KeycloakError``
    for anything else that stops us getting an answer."""
    try:
        resp = _http.post("%s/%s" % (config.API_BASE, action), json=data, timeout=_HTTP_TIMEOUT_S,
                          headers={"Authorization": config.CKAN_SYSADMIN_API_TOKEN})
        payload = resp.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning("keycloak login: CKAN %s failed: %s", action, exc)
        raise KeycloakError("CKAN could not be asked who you are. Try again in a moment.") from exc
    if payload.get("success"):
        return payload.get("result")
    error = payload.get("error") or {}
    if error.get("__type") == "Not Found Error":
        raise LookupError(action)
    logger.warning("keycloak login: CKAN %s refused: %s", action, error)
    raise KeycloakError("CKAN could not be asked who you are. Try again in a moment.")


def check_ckan_access(keycloak_sub: str) -> Access:
    if not keycloak_sub:
        raise KeycloakError("The login did not say who you are.")
    name = CKAN_USERNAME_PREFIX + keycloak_sub
    try:
        user = _ckan_call("user_show", {"id": name})
        if user.get("state") not in (None, "active"):
            return Access(False, reason="Your CKAN account is not active.")
        if user.get("sysadmin"):
            return Access(True, sysadmin=True)
        orgs = _ckan_call("organization_list_for_user", {"id": name, "permission": "admin"}) or []
    except LookupError:
        return Access(False, reason="You have no account in CKAN yet. Sign in to data.gov.gr once, then try again.")
    names = tuple(str(o["name"]) for o in orgs if isinstance(o, dict) and o.get("name"))
    if not names:
        return Access(False, reason="You are not an administrator of any organization in CKAN.")
    return Access(True, organizations=names)


# -- the flow -----------------------------------------------------------------------------------------------------------------------

def start(session, next_url: str) -> str:
    """The Keycloak address to send the browser to; the one-time values go into ``session``."""
    state, nonce, verifier = secrets.token_urlsafe(24), secrets.token_urlsafe(24), secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).rstrip(b"=").decode("ascii")
    session[SESSION_KEY] = {"state": state, "nonce": nonce, "verifier": verifier, "next": next_url,
                            "exp": int(time.time()) + TX_TTL_S}
    return discovery()["authorization_endpoint"] + "?" + urlencode({
        "client_id": config.KEYCLOAK_CLIENT_ID, "response_type": "code", "scope": "openid profile email",
        "redirect_uri": redirect_uri(), "state": state, "nonce": nonce,
        "code_challenge": challenge, "code_challenge_method": "S256",
    })


def finish(session, params: dict) -> Identity:
    """Completes a login. Raises ``KeycloakError`` (``NotAllowed`` for someone CKAN does not vouch for)."""
    tx = session.pop(SESSION_KEY, None)
    if params.get("error"):
        raise KeycloakError("The login server declined the sign-in (%s)." % str(params.get("error_description") or params["error"])[:200])
    if not isinstance(tx, dict) or time.time() > tx.get("exp", 0):
        raise KeycloakError("This sign-in has expired or did not start here. Please start again.")
    if not hmac.compare_digest(str(params.get("state", "")), str(tx.get("state", ""))) or not params.get("code"):
        raise KeycloakError("This sign-in response does not belong to this browser. Please start again.")

    doc = discovery()
    try:
        resp = _http.post(
            doc["token_endpoint"], timeout=_HTTP_TIMEOUT_S, auth=(config.KEYCLOAK_CLIENT_ID, config.KEYCLOAK_CLIENT_SECRET),
            data={"grant_type": "authorization_code", "code": params["code"], "redirect_uri": redirect_uri(),
                  "code_verifier": tx["verifier"]},
        )
        tokens = resp.json() if resp.status_code == 200 else None
    except (requests.RequestException, ValueError) as exc:
        raise KeycloakError("The login server could not be reached (%s). Try again in a moment." % exc) from exc
    if not isinstance(tokens, dict) or not tokens.get("id_token"):
        logger.warning("keycloak login: the token endpoint refused the code (HTTP %s)", getattr(resp, "status_code", "?"))
        raise KeycloakError("The login server did not accept the sign-in. Please start again.")

    ident = _decode_id_token(tokens["id_token"], doc["jwks_uri"])
    if not hmac.compare_digest(str(ident.get("nonce", "")), str(tx.get("nonce", ""))):
        raise KeycloakError("This sign-in response does not belong to this browser. Please start again.")

    username = str(ident.get("preferred_username") or "").strip()
    email = str(ident.get("email") or "").strip().lower()
    if not username or len(username) > 100 or any(ord(c) < 32 for c in username):
        raise KeycloakError("The login server did not say who you are (no user name).")
    if not email or len(email) > 255:
        raise KeycloakError("The login server did not give an email address for your account.")
    access = check_ckan_access(str(ident["sub"]))
    if not access.allowed:
        raise NotAllowed(username, access.reason)
    full_name = str(ident.get("name") or " ".join(filter(None, [ident.get("given_name"), ident.get("family_name")]))).strip()
    return Identity(sub=str(ident["sub"]), username=username, email=email, email_verified=ident.get("email_verified") is True,
                    name=full_name[:255], sysadmin=access.sysadmin, organizations=access.organizations,
                    id_token=tokens["id_token"], next_url=str(tx.get("next") or ""))


def logout_url(id_token_hint: str = "") -> str | None:
    """Where to send the browser to end the Keycloak session too, or None when it cannot be worked out."""
    try:
        endpoint = discovery().get("end_session_endpoint")
    except KeycloakError:
        return None
    if not endpoint:
        return None
    query = {"client_id": config.KEYCLOAK_CLIENT_ID, "post_logout_redirect_uri": config.PUBLIC_BASE_URL + "/login"}
    if id_token_hint:
        query["id_token_hint"] = id_token_hint
    return endpoint + "?" + urlencode(query)
