// Shared org-search building blocks -- used by both the main dashboard
// (app.js, loaded right after this file) and the standalone Mail Parser
// admin panel (admin_users.html), so the two pages search organizations the
// same way via the same data instead of each keeping its own copy.
//
// _orgsData/_publicOrgs/_ckanByHrms are declared here as the single source
// of truth; app.js's own _buildCkanLookup() (Orgs-tab-specific, stays there)
// still populates _ckanByHrms directly since classic <script> tags on one
// page share the same top-level let/const scope -- no import needed, just
// load this file before app.js.

let _orgsData    = [];   // [{name, title}, ...] from /api/organizations (CKAN)
let _publicOrgs  = [];   // [{code, label}, ...] from /api/public-orgs (HRMS)
let _ckanByHrms  = null; // hrms code/label -> ckan slug, built by app.js's _buildCkanLookup when both lists are loaded there; null on pages that never build it (fine, see below)

// Same localStorage key app.js's own loadOrgs() writes on the main
// dashboard -- a plain browser-storage entry, readable from any same-origin
// page, so admin_users.html gets a warm CKAN org list for free if this
// browser has visited the main dashboard's Orgs tab recently, without
// needing its own fetch.
const _ORGS_CACHE_KEY = 'orgs_cache_v2';

function _ns(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Searches both CKAN portal orgs and HRMS-only orgs, de-duping the latter
// against _ckanByHrms when it's available (built on the main dashboard;
// simply skipped on pages that never load it, at the cost of an HRMS org
// occasionally also showing up as its own separate CKAN-matched row).
function _orgSearchDropdown(q, dropdownId, selectFn) {
  const dd = document.getElementById(dropdownId);
  const nq = _ns((q || '').trim());
  const ckanPool = _orgsData.length ? _orgsData : (() => {
    try { const c = JSON.parse(localStorage.getItem(_ORGS_CACHE_KEY) || 'null'); return (c && c.data) || []; } catch (_) { return []; }
  })();
  const ckanMatches = nq
    ? ckanPool.filter(o => _ns(o.title).includes(nq) || _ns(o.name).includes(nq)).slice(0, 20)
    : ckanPool.slice(0, 20);
  const hrmsMatches = nq && _publicOrgs.length
    ? _publicOrgs.filter(o =>
        !(_ckanByHrms && _ckanByHrms.get(o.code)) &&
        _ns(o.label).includes(nq)
      ).slice(0, Math.max(0, 20 - ckanMatches.length))
    : [];
  if (!ckanMatches.length && !hrmsMatches.length) { dd.classList.add('d-none'); return; }
  dd.innerHTML = [
    ...ckanMatches.map(o =>
      `<li class="list-group-item list-group-item-action py-1 px-2 small" style="cursor:pointer"
           data-code="${esc(o.name)}" data-label="${esc(o.title)}"
           onmousedown="${selectFn}(this.dataset.code,this.dataset.label)"
       ><span class="fw-semibold">${esc(o.title)}</span> <span class="text-muted ms-1">${esc(o.name)}</span></li>`
    ),
    ...hrmsMatches.map(o =>
      `<li class="list-group-item list-group-item-action py-1 px-2 small" style="cursor:pointer"
           data-code="${esc(o.code)}" data-label="${esc(o.label)}"
           onmousedown="${selectFn}(this.dataset.code,this.dataset.label)"
       ><span class="fw-semibold">${esc(o.label)}</span> <span class="badge bg-secondary ms-1" style="font-size:.6rem">HRMS only</span></li>`
    ),
  ].join('');
  dd.classList.remove('d-none');
}

const _GREEK_STOPWORDS = new Set(['ΚΑΙ','ΓΙΑ','ΑΠΟ','ΠΡΟΣ','ΜΕΤΑ','ΔΙΑ','ΕΠΙ','ΥΠΟ','ΚΑΤΑ',
  'ΜΕΣΩ','ΧΩΡΙΣ','ΕΝΤΟΣ','ΕΚΤΟΣ','ΜΕΤΑΞΥ','ΠΕΡΙ','ΑΝΤΙ','ΠΑΡΑ','ΣΤΙΣ','ΣΤΟΝ','ΣΤΗΝ','ΣΤΟ',
  'ΤΗΝ','ΤΟΝ','ΤΗΣ','ΤΟΥ','ΤΩΝ','ΤΟΥΣ','ΤΙΣ','ΕΙΝΑΙ','ΕΧΕΙ','ΘΕΛΕΤΕ','ΠΟΥ','ΟΤΙ','ΑΛΛΑ',
  'ΑΥΤΟ','ΑΥΤΗ','ΑΥΤΟΣ','ΜΟΝΟ','ΕΔΩ','ΕΚΕΙ']);
// Best-effort default when nothing else already narrowed down the org (see
// the admin panel's openUnmatchedContactCreate and the main dashboard's
// openInboundAttachModal) -- ALL-CAPS Greek tokens only (a likely official
// parenthetical/suffixed acronym, e.g. "... - ΡΑΑΕΥ"), 4+ letters, excluding
// common function words, tried longest-first, matched as a whole WORD (not a
// raw substring) against BOTH the CKAN portal org list and the HRMS one -- a
// portal-friendly acronym suffix like "- ΡΑΑΕΥ" is much more likely to
// appear on a CKAN org's own title (added for exactly this kind of
// recognizability) than on the plain HRMS government registry label, so
// searching HRMS alone (an earlier version of this) can miss the correct
// org entirely and fall through to a coincidental word match on something
// unrelated. Still just a starting point -- the search box stays fully
// editable regardless.
function _guessOrgFromText(text) {
  if (!text) return null;
  const caps = (text.match(/[Α-Ωα-ωA-Za-z]{4,}/g) || [])
    .filter(t => t === t.toUpperCase() && /[Α-Ω]/.test(t) && !_GREEK_STOPWORDS.has(t))
    .sort((a, b) => b.length - a.length);
  for (const tok of caps) {
    const nTok = _ns(tok);
    const re = new RegExp(`(^|[^a-zα-ω])${nTok}([^a-zα-ω]|$)`);
    const hrmsHit = _publicOrgs.find(o => re.test(_ns(o.label)));
    if (hrmsHit) return hrmsHit;
    const ckanHit = _orgsData.find(o => re.test(_ns(o.title)) || re.test(_ns(o.name)));
    if (ckanHit) return {code: ckanHit.name, label: ckanHit.title};
  }
  return null;
}

// Lightweight loader for pages that don't already have their own richer org-
// loading flow (app.js's own loadOrgs()/_loadOrgsBackground() populate the
// same _orgsData/_publicOrgs directly and should keep doing so instead of
// calling this -- it exists for admin_users.html, which has neither).
async function _loadOrgSearchData() {
  if (!_orgsData.length) {
    try {
      const json = await fetch('../api/organizations').then(r => r.json());
      if (Array.isArray(json.data)) _orgsData = json.data;
    } catch (_) { /* search still works with whichever list did load */ }
  }
  if (!_publicOrgs.length) {
    try {
      const data = await fetch('../api/public-orgs').then(r => r.json());
      if (Array.isArray(data)) _publicOrgs = data;
    } catch (_) { /* same */ }
  }
}
