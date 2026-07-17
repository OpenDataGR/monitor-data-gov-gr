// ── Passkey (WebAuthn) helpers, shared by login.html and the dashboard's
// "Manage passkeys" modal (app.js). Kept dependency-free (no esc()/t()/show()
// from app.js) since login.html loads this on its own with no other JS.

// CSRF: same guarded fetch patch as app.js -- see its comment. Needed here
// too since login.html loads this file standalone (no app.js on that page).
if (!window.__csrfFetchPatched) {
  window.__csrfFetchPatched = true;
  const _csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
  if (_csrfToken) {
    const _origFetch = window.fetch;
    window.fetch = function (input, init) {
      init = init || {};
      const method = (init.method || 'GET').toUpperCase();
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const headers = new Headers(init.headers || {});
        headers.set('X-CSRFToken', _csrfToken);
        init = { ...init, headers };
      }
      return _origFetch(input, init);
    };
  }
}

function _b64urlToBuffer(b64url) {
  const pad = '='.repeat((4 - b64url.length % 4) % 4);
  const b64 = (b64url + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

function _bufferToB64url(buf) {
  const bytes = new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function webauthnSupported() {
  return !!(window.PublicKeyCredential && navigator.credentials);
}

// Registers a new passkey for the currently logged-in user. `urls` is
// {begin, complete} -- both endpoints require an active session.
async function registerPasskey(nickname, urls) {
  const beginResp = await fetch(urls.begin, { method: 'POST' });
  const options = await beginResp.json();
  if (!beginResp.ok) throw new Error(options.error || 'Could not start passkey registration');

  options.challenge = _b64urlToBuffer(options.challenge);
  options.user.id = _b64urlToBuffer(options.user.id);
  (options.excludeCredentials || []).forEach(c => { c.id = _b64urlToBuffer(c.id); });

  const cred = await navigator.credentials.create({ publicKey: options });

  const payload = {
    nickname,
    credential: {
      id: cred.id,
      rawId: _bufferToB64url(cred.rawId),
      type: cred.type,
      response: {
        clientDataJSON: _bufferToB64url(cred.response.clientDataJSON),
        attestationObject: _bufferToB64url(cred.response.attestationObject),
        transports: cred.response.getTransports ? cred.response.getTransports() : [],
      },
    },
  };
  const completeResp = await fetch(urls.complete, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await completeResp.json();
  if (!completeResp.ok) throw new Error(data.error || 'Passkey registration failed');
  return data;
}

// Signs in with a passkey -- fully usernameless: the browser prompts for
// whichever passkey(s) the user has for this site. `urls` is {begin, complete}.
async function loginWithPasskey(urls) {
  const beginResp = await fetch(urls.begin, { method: 'POST' });
  const options = await beginResp.json();
  if (!beginResp.ok) throw new Error(options.error || 'Could not start passkey sign-in');

  options.challenge = _b64urlToBuffer(options.challenge);

  const cred = await navigator.credentials.get({ publicKey: options });

  const payload = {
    credential: {
      id: cred.id,
      rawId: _bufferToB64url(cred.rawId),
      type: cred.type,
      response: {
        clientDataJSON: _bufferToB64url(cred.response.clientDataJSON),
        authenticatorData: _bufferToB64url(cred.response.authenticatorData),
        signature: _bufferToB64url(cred.response.signature),
        userHandle: cred.response.userHandle ? _bufferToB64url(cred.response.userHandle) : null,
      },
    },
  };
  const completeResp = await fetch(urls.complete, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await completeResp.json();
  if (!completeResp.ok) throw new Error(data.error || 'Passkey sign-in failed');
  return data;
}
