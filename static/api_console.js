// Request-builder logic for api_console.html. Depends on api_shared.js
// (apiFetchMeta/apiRenderBrowser/apiTagsHtml/apiEsc) already being loaded.

let currentRoute = null;
const BODY_METHODS = ['POST', 'PATCH', 'PUT'];

function extractPathParams(path) {
  return [...path.matchAll(/<(?:\w+:)?(\w+)>/g)].map(m => m[1]);
}

// Only query-string hints (start with "?") get pre-filled as rows -- a few
// curated `params` strings instead describe a PATH param's allowed values
// (e.g. "check_type = hvd | dcat | geodcat"), which isn't parseable the
// same way and is left for the description text to explain instead.
function parseQueryHintKeys(hint) {
  if (!hint || !hint.trim().startsWith('?')) return [];
  const keys = [];
  const seen = new Set();
  hint.split(/[?&]/).forEach(seg => {
    seg = seg.trim();
    if (!seg.includes('=')) return;
    const key = seg.split('=')[0].trim();
    if (key && /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  });
  return keys;
}

function apiEscAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }

function onRouteSelected(route) {
  currentRoute = route;
  clearBuilderError();
  document.getElementById('apiResponsePanel').classList.add('d-none');
  renderBuilder();
}

function renderBuilder() {
  document.getElementById('apiBuilderEmpty').classList.add('d-none');
  document.getElementById('apiBuilder').classList.remove('d-none');

  document.getElementById('apiBuilderPath').textContent = currentRoute.path;
  document.getElementById('apiBuilderDesc').textContent = currentRoute.desc;
  document.getElementById('apiBuilderTags').innerHTML = apiTagsHtml(currentRoute);

  const methodSel = document.getElementById('apiMethodSelect');
  methodSel.innerHTML = currentRoute.methods.map(m => `<option value="${m}">${m}</option>`).join('');
  methodSel.value = currentRoute.methods[0];
  methodSel.onchange = updateBodyVisibility;

  renderPathParamInputs(extractPathParams(currentRoute.path));
  renderQueryParamRows(parseQueryHintKeys(currentRoute.params));
  renderWarning();
  updateBodyVisibility();
  updateResolvedUrl();
}

function renderWarning() {
  const el = document.getElementById('apiBuilderWarning');
  let key = null;
  if (currentRoute.path === '/api/communications/stream') key = 'apiconsole.warn_stream';
  else if (currentRoute.path === '/api/contacts/import') key = 'apiconsole.warn_upload';
  el.innerHTML = key ? `<div class="api-warning alert alert-warning">${apiEsc(t(key))}</div>` : '';
}

function renderPathParamInputs(params) {
  const wrap = document.getElementById('apiPathParams');
  if (!params.length) { wrap.innerHTML = ''; wrap.classList.add('d-none'); return; }
  wrap.classList.remove('d-none');
  wrap.innerHTML = `<div class="api-builder-label">${apiEsc(t('apiconsole.path_params'))}</div>` +
    params.map(p => `
      <div class="input-group input-group-sm mb-2">
        <span class="input-group-text">${apiEsc(p)}</span>
        <input type="text" class="form-control api-path-param-input" data-param="${apiEscAttr(p)}" oninput="updateResolvedUrl()">
      </div>`).join('');
}

function renderQueryParamRows(initialKeys) {
  const tbody = document.getElementById('apiQueryRows');
  tbody.innerHTML = '';
  initialKeys.forEach(k => addQueryRow(k, ''));
  addQueryRow('', '');
}

function addQueryRow(key = '', value = '') {
  const tbody = document.getElementById('apiQueryRows');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="form-control form-control-sm api-qp-key" value="${apiEscAttr(key)}" placeholder="key" oninput="updateResolvedUrl()"></td>
    <td><input type="text" class="form-control form-control-sm api-qp-val" value="${apiEscAttr(value)}" placeholder="value" oninput="updateResolvedUrl()"></td>
    <td><button type="button" class="btn btn-sm btn-outline-secondary" title="Remove" onclick="this.closest('tr').remove(); updateResolvedUrl();"><i class="bi bi-x"></i></button></td>`;
  tbody.appendChild(tr);
  updateResolvedUrl();
}

function updateBodyVisibility() {
  const method = document.getElementById('apiMethodSelect').value;
  document.getElementById('apiBodySection').classList.toggle('d-none', !BODY_METHODS.includes(method));
}

function resolvePath() {
  let path = currentRoute.path;
  document.querySelectorAll('.api-path-param-input').forEach(inp => {
    const name = inp.dataset.param;
    const re = new RegExp('<(?:[A-Za-z_]+:)?' + name + '>');
    path = path.replace(re, inp.value ? encodeURIComponent(inp.value) : '{' + name + '}');
  });
  return path;
}

function buildQueryString() {
  const params = new URLSearchParams();
  document.querySelectorAll('#apiQueryRows tr').forEach(tr => {
    const k = tr.querySelector('.api-qp-key').value.trim();
    const v = tr.querySelector('.api-qp-val').value;
    if (k) params.set(k, v);
  });
  const s = params.toString();
  return s ? '?' + s : '';
}

function updateResolvedUrl() {
  if (!currentRoute) return;
  document.getElementById('apiResolvedUrl').textContent = location.origin + resolvePath() + buildQueryString();
}

function showBuilderError(msg) {
  const el = document.getElementById('apiBuilderError');
  el.textContent = msg;
  el.classList.remove('d-none');
}
function clearBuilderError() {
  document.getElementById('apiBuilderError').classList.add('d-none');
}

async function sendRequest() {
  if (!currentRoute) return;
  clearBuilderError();

  const method = document.getElementById('apiMethodSelect').value;
  const path = resolvePath();
  if (path.includes('{')) {
    showBuilderError(t('apiconsole.fill_path_params'));
    return;
  }
  const url = path + buildQueryString();

  if (method === 'DELETE' && !confirm(t('apiconsole.confirm_delete').replace('{method}', method).replace('{url}', url))) {
    return;
  }

  const opts = { method };
  if (BODY_METHODS.includes(method)) {
    const raw = document.getElementById('apiBodyInput').value.trim();
    if (raw) {
      try {
        JSON.parse(raw);
      } catch (e) {
        showBuilderError(t('apiconsole.invalid_json').replace('{msg}', e.message));
        return;
      }
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = raw;
    }
  }

  const btn = document.getElementById('apiSendBtn');
  btn.disabled = true;
  const started = performance.now();
  try {
    const resp = await fetch(url, opts);
    const elapsed = Math.round(performance.now() - started);
    const text = await resp.text();
    let pretty = text;
    try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch (_) { /* not JSON -- show as-is */ }
    renderResponse(resp.status, resp.ok, elapsed, pretty);
  } catch (e) {
    renderResponse(null, false, Math.round(performance.now() - started), t('apiconsole.network_error').replace('{msg}', e.message));
  } finally {
    btn.disabled = false;
  }
}

function renderResponse(status, ok, ms, bodyText) {
  const panel = document.getElementById('apiResponsePanel');
  panel.classList.remove('d-none');
  const statusEl = document.getElementById('apiRespStatus');
  statusEl.textContent = status !== null ? status : 'network error';
  statusEl.className = 'badge api-mono ' + (status === null ? 'bg-secondary' : ok ? 'bg-success' : 'bg-danger');
  document.getElementById('apiRespTime').textContent = ms + ' ms';
  document.getElementById('apiRespBody').textContent = bodyText;
}

apiFetchMeta().then(data => {
  apiRenderBrowser({
    categories: data.categories,
    listEl: document.getElementById('apiCategories'),
    searchEl: document.getElementById('apiSearch'),
    statTotalEl: document.getElementById('apiStatTotal'),
    onRouteClick: onRouteSelected,
    compact: true,
  });
}).catch(e => {
  document.getElementById('apiCategories').innerHTML =
    `<div class="alert alert-danger small">${t('apiconsole.load_error').replace('{msg}', e.message)}</div>`;
});
