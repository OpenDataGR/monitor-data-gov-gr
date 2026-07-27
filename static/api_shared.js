// Shared between api_docs.html and api_console.html: both browse the same
// /api/_meta/routes data through an identical sidebar (search box + category
// list + route rows) -- only what happens when you CLICK a route differs
// (docs just highlights it; the console loads it into the request builder).
// Standalone, dependency-free, same convention as webauthn.js.

async function apiFetchMeta() {
  const resp = await fetch('/api/_meta/routes');
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  return resp.json();
}

function apiMethodBadgeHtml(methods) {
  return methods.map(m => `<span class="api-method api-method-${m.toLowerCase()}">${m}</span>`).join('');
}

function apiPathHtml(path) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc(path).replace(/(&lt;[^&]+&gt;)/g, '<span class="api-param">$1</span>');
}

function apiTagsHtml(route) {
  const chips = [];
  if (route.admin) chips.push(`<span class="api-chip api-chip-admin">${route.admin === true ? 'admin' : apiEsc(route.admin)}</span>`);
  if (route.limit) chips.push(`<span class="api-chip api-chip-limit">${apiEsc(route.limit)}</span>`);
  if (route.params) chips.push(`<span class="api-chip api-chip-params">${apiEsc(route.params)}</span>`);
  return chips.join('');
}
function apiEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Identifies one route uniquely -- a path can have more than one entry with
// different method sets (e.g. GET /api/communications vs POST
// /api/communications), so path alone isn't enough to disambiguate.
function apiRouteKey(route) {
  return route.methods.slice().sort().join(',') + ' ' + route.path;
}

// Deep-links from a docs row straight into the console with that exact
// route pre-selected -- see api_console.js's apiApplyDeepLinkFromUrl(),
// which reads these same two params back out on load.
function apiConsoleLinkHref(route) {
  const params = new URLSearchParams();
  params.set('path', route.path);
  params.set('methods', route.methods.join(','));
  return '/api-console?' + params.toString();
}

// Finds a route by the same (path, methods) identity apiConsoleLinkHref
// encoded into the URL, across every category.
function apiFindRouteByKey(categories, path, methods) {
  const key = methods.slice().sort().join(',') + ' ' + path;
  for (const cat of categories) {
    const hit = cat.routes.find(r => apiRouteKey(r) === key);
    if (hit) return hit;
  }
  return null;
}

// Renders the sidebar's category-jump nav + returns a flat lookup of every
// route keyed by "METHOD1+METHOD2 /path", used by callers that need to find
// a route's own metadata again after a click (e.g. the console builder).
function apiBuildRouteIndex(categories) {
  const index = new Map();
  for (const cat of categories) {
    for (const route of cat.routes) {
      index.set(route.methods.join('+') + ' ' + route.path, { ...route, categoryId: cat.id, categoryTitle: cat.title });
    }
  }
  return index;
}

// `onRouteClick(route)` fires when a route row is clicked -- the two pages
// each wire this to something different (highlight vs. load-into-builder).
// `compact` drops the description paragraph/tags from each row and the
// category blurb -- for the console's narrow sidebar, which is a picker to
// scan and click (full details show in the builder once picked), not a
// reference to read; the docs page uses the full (non-compact) card style.
function apiRenderBrowser({ categories, navEl, listEl, searchEl, statTotalEl, onRouteClick, compact = false }) {
  let total = 0;
  if (navEl) navEl.innerHTML = '';
  listEl.innerHTML = '';

  categories.forEach(cat => {
    if (!cat.routes.length) return;
    total += cat.routes.length;

    if (navEl) {
      const navLink = document.createElement('a');
      navLink.href = '#cat-' + cat.id;
      navLink.className = 'api-toc-link';
      navLink.innerHTML = `<span>${apiEsc(cat.title)}</span><span class="api-toc-count">${cat.routes.length}</span>`;
      navLink.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('cat-' + cat.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      navEl.appendChild(navLink);
    }

    const section = document.createElement('section');
    section.className = 'api-category' + (compact ? ' api-category-compact' : '');
    section.id = 'cat-' + cat.id;
    section.innerHTML = `
      <div class="api-category-head">
        <h3>${apiEsc(cat.title)}</h3>
        <span class="api-category-count">${cat.routes.length}</span>
      </div>
      ${compact ? '' : `<p class="api-category-desc">${apiEsc(cat.desc)}</p>`}
      <div class="api-route-list"></div>`;
    const routeListEl = section.querySelector('.api-route-list');

    cat.routes.forEach(route => {
      const row = document.createElement('div');
      row.className = 'api-route' + (compact ? ' api-route-compact' : '');
      row.dataset.search = (route.methods.join(' ') + ' ' + route.path + ' ' + route.desc).toLowerCase();
      row.dataset.routeKey = apiRouteKey(route);
      row.innerHTML = compact
        ? `<div class="api-route-head">${apiMethodBadgeHtml(route.methods)}<span class="api-path">${apiPathHtml(route.path)}</span></div>`
        : `<div class="api-route-head">${apiMethodBadgeHtml(route.methods)}<span class="api-path">${apiPathHtml(route.path)}</span></div>
        <div class="api-route-body">
          <p class="api-route-desc">${apiEsc(route.desc)}</p>
          <div class="api-route-meta">${apiTagsHtml(route)}</div>
        </div>
        <a class="api-try-link" href="${apiConsoleLinkHref(route)}">
          <i class="bi bi-play-fill"></i> ${apiEsc(window.API_TRY_IT_LABEL || 'Try it')}
        </a>`;
      if (onRouteClick) {
        row.classList.add('api-route-clickable');
        row.addEventListener('click', () => {
          listEl.querySelectorAll('.api-route-active').forEach(r => r.classList.remove('api-route-active'));
          row.classList.add('api-route-active');
          onRouteClick(route, cat);
        });
      }
      routeListEl.appendChild(row);
    });

    listEl.appendChild(section);
  });

  if (statTotalEl) statTotalEl.textContent = total;

  if (searchEl) {
    searchEl.addEventListener('input', () => {
      const q = searchEl.value.trim().toLowerCase();
      let anyVisible = false;
      listEl.querySelectorAll('.api-category').forEach(section => {
        let sectionMatch = false;
        section.querySelectorAll('.api-route').forEach(row => {
          const match = !q || row.dataset.search.includes(q);
          row.classList.toggle('api-hidden', !match);
          if (match) sectionMatch = true;
        });
        section.classList.toggle('api-hidden', !sectionMatch);
        if (sectionMatch) anyVisible = true;
      });
      const noResults = document.getElementById('apiNoResults');
      if (noResults) noResults.classList.toggle('api-show', !anyVisible && q.length > 0);
    });
  }
}
