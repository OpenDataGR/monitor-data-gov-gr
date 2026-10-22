# monitor-data-gov-gr

Internal Flask + SQLAlchemy + vanilla-JS CRM/monitoring dashboard for
`monitor.data.gov.gr` (the Greek government open-data portal). Tracks
organization communications/cases, portal member & file-contact data,
dataset/catalog quality checks (HVD/DCAT-AP/GeoDCAT-AP), traffic analytics,
and a Mail Parser pipeline that auto-ingests inbound emails into Cases and
Communications.

This file is committed to the repo (unlike Claude Code's local
per-machine conversation history/auto-memory) specifically so it travels
across machines/clones. Keep it updated as durable project facts change;
don't let it go stale.

## Architecture

- `app.py` — the whole backend: one large Flask app, every route and most
  business logic. No blueprints; grep for route paths/function names.
- `models.py` — SQLAlchemy models.
- `static/app.js` — the main dashboard's frontend. Large vanilla-JS file,
  no build step, no framework.
- `templates/index.html` — the main dashboard template.
- `templates/admin_users.html` — a **separate, standalone** admin panel
  page (its own inline `<script>`, not app.js) for superadmin-only tools:
  user management, Mail Parser config/Parsed-Emails log, mass email.
- Shared JS modules, loaded via plain `<script>` tags on both `index.html`
  and `admin_users.html` (no bundler) to avoid two independently-drifting
  copies of the same logic:
  - `static/i18n_shared.js` — shared i18n helper.
  - `static/org_search.js` — org-name typeahead + best-effort org guessing
    from free text (`_guessOrgFromText`).
  - `static/contact_extract.js` — signature/name/phone/position extraction
    from email bodies (`_extractName`, `_extractPhone`, `_extractPosition`,
    `_guessNameFromEmail`, `_findSenderMessage`).
- `api_docs_data.py` — powers an in-app API reference page. **Update this
  when a route's path/params/behavior changes** (existence-drift alone is
  fine to skip; behavior changes are not).
- `deploy/README.md` — VM/deployment architecture; check here before
  guessing at prod infrastructure.

## Local development

- `venv/` (gitignored) holds the Python environment; `pip install -r
  requirements.txt` after cloning fresh.
- No `DATABASE_URL` env var set → falls back to a local SQLite file at
  `instance/dashboard.db` (also gitignored). Production uses Postgres via
  `DATABASE_URL`.
- **`app.py` binds its real SQLAlchemy engine at import time** — a startup
  migration block (`if _is_main_process(): with app.app_context(): ...
  ALTER TABLE ...`) runs immediately on `import app`. Setting
  `app.config["SQLALCHEMY_DATABASE_URI"]` *after* import has no effect.
  This matters for any ad-hoc verification script, not just tests (see
  Testing below).

## Testing

- `tests/` — pytest suite, currently covering the mail-ingestion matching
  engine and the Contacts-to-Review backend. **Grow this alongside new
  work**: when a backend fix/feature is worth hand-verifying, write it as
  a real test here instead of a throwaway script.
- `tests/conftest.py` sets `DATABASE_URL` to an isolated temp file
  **before** `import app` (the only way to actually isolate it, per the
  import-time engine binding above). The schema is built **once per run**
  (session fixture) and every table is emptied (`DELETE`) before each test --
  dropping/recreating ~32 tables per test used to cost ~1.4s each and was almost
  the whole suite's runtime (the suite went from ~3.5 min to ~10s). Row ids still
  restart at 1 per test (SQLite reuses rowids in an emptied table); the sqlite
  PRAGMAs in conftest (`synchronous=OFF`, `journal_mode=MEMORY`) apply to the
  test process only.
- **Never point a verification script at the real `instance/dashboard.db`.**
  Always use an isolated DB (either the test suite's own fixture, or a
  fresh temp file with `DATABASE_URL` set before importing `app`).
- SQLite does **not** enforce foreign-key constraints by default, and this
  app never turns that on (`PRAGMA foreign_keys=ON`) — a test can falsely
  pass even with a dangling FK left behind. When testing FK-related
  behavior specifically, register `@event.listens_for(Engine, "connect")`
  to enable the pragma on the test connection, or the test isn't checking
  what it claims to.
- Run everything: `venv/Scripts/python.exe -m pytest tests/ -v` (or just
  `pytest` from the repo root once the venv is active).
- VS Code: `.vscode/settings.json` enables pytest test discovery via the
  Testing panel — no hardcoded interpreter path, so it works on any
  machine with its own `venv/`.

## Deployment / CI

- `.github/workflows/deploy.yml`, triggered on push to `main`.
- Runs on a **self-hosted** GitHub Actions runner — the production Azure
  VM itself pulls, installs deps, and restarts its own services. This is
  free on GitHub's side regardless of repo visibility (unlike a
  GitHub-hosted runner, which would bill against this private repo's
  Actions minutes).
- A `test` job runs `pytest tests/` first; `deploy` has `needs: test`, so
  a failing test blocks the deploy from ever reaching prod.
- The `test` job runs in its own scratch `git worktree` of the pushed commit
  (not the live dir after a `git pull`, which would let the still-running
  old code serve new templates for the whole test run), git/pip go through
  one `flock`, deploys are serialized by a `concurrency` group, and a
  `/health` smoke test follows the restart (pattern from loader.data.gov.gr).
  `pytest -n 2` was deliberately NOT adopted: xdist workers failed to start on
  the dev machine (non-ASCII OneDrive path) so it was never verified;
  `conftest.py` is already per-worker-DB safe if you try it on the VM.
- No staging environment — pushing to `main` deploys straight to
  production. A request landing during a deploy's brief gunicorn restart
  can surface as a transient frontend error (stray spinner, a JSON.parse
  failure) — not necessarily a real bug; check `gh run list` for timing
  correlation before chasing it as one.

## Login with the data.gov.gr Keycloak (shipped 2026-10-21)

`keycloak_auth.py` (OIDC authorization-code + PKCE, ported from
loader.data.gov.gr's `oidc_login.py`/`ckan_access.py`); routes
`/login/keycloak` + `/auth/callback` in app.py; a "Sign in with data.gov.gr"
button on `login.html`. **Off until `KEYCLOAK_ISSUER`, `KEYCLOAK_CLIENT_ID`,
`KEYCLOAK_CLIENT_SECRET` and `CKAN_SYSADMIN_API_TOKEN` are all set** (see
`config.py`); email/password and passkeys are untouched alongside it.
- Keycloak only says who the person is. Access is decided by CKAN: only a
  CKAN **sysadmin** or an **org admin** (`organization_list_for_user`
  with `permission=admin`) gets in; fails closed if CKAN is unreachable.
  The CKAN user is `user_<Keycloak sub>`, never matched by name.
- New CRM user: sysadmin -> `is_admin`+`is_superadmin`; org admin -> an
  org-scoped user (see "Org-scoped users" below). Existing user with the same email is **linked** (`User.ckan_sub`)
  and keeps their roles untouched -- but only if Keycloak says
  `email_verified`. Roles are not re-derived from CKAN on later logins.
- The one-time state/nonce/verifier live in the Flask session (`kc_tx`);
  logout also ends the Keycloak session when the login came from it.
- Keycloak client `monitor-data-gov-gr` (realm `data`, confidential, standard
  flow only, redirect URI `<PUBLIC_BASE_URL>/auth/callback`) is registered and
  the login was verified working end to end in production on 2026-10-21.
  Automated tests use a faked Keycloak/CKAN (`tests/test_keycloak_login.py`).

## MQA tab: history + EU-vs-our DCAT-AP comparison (shipped 2026-10-22)

data.europa.eu moved its MQA API to metricsVersion 2.x: an overall score (`{value, max}`, ~5.85/7.5), entity
counts, and per-metric coverage (weight + dimension) -- **no per-dimension scores any more**, which made the
page show "NaN / 0". `_normalize_mqa()` (app.py) reshapes it (idempotent; also repairs an already-cached raw row
on read): the official overall score, plus per-dimension *weighted metric coverage* computed here and labelled
as such on the page. `MqaSnapshot` keeps a dated history (one row per distinct published score;
`/api/quality/mqa/history`, chart on the tab). Their history API only goes back to Sep 2026 under v2.
- **Violations comparison**: their `GET .../catalogues/data-gov-gr/violations` lists every DCAT-AP SHACL
  violation (~158.7k rows, ~70 MB). `_fetch_mqa_violation_summary()` pulls it in a background thread (on a
  newly published score, or the admin button) and keeps only per-property counts + a count per dataset
  (`MqaViolationSummary`, latest 5 kept); `/api/quality/mqa/comparison` lines it up with
  `_our_dcat_violations()` (our DCAT-AP check, violations only, grouped by property IRI).
- **Their API paging is slow and erratic at depth** (found by running it for real, not from the mocked tests):
  `offset` works, `page`/`skip`/`start` are ignored, a 20k-row page deep in the list timed out at 180 s and
  discarded the whole pull. So: 5000-row pages, 240 s timeout, 4 attempts, and a page that still fails is
  skipped and the summary marked `complete: false` (the page shows a "partial" note). A full real pull took
  ~5.5 min. Row count can exceed `count` slightly (the list shifts while paging).
- **Real result (2026-10-22)**: 158,700 violations on 21,966 datasets, all severity Violation: `dct:format`
  not an IRI (82,556), `dcat:byteSize` not xsd:decimal (74,203), applicableLegislation (1,890), then a long tail
  (identifier 80, language 21, mediaType 17). Note the score's own `counts.datasets` (5,391 on 2026-10-18, up from
  3,780 in Sep) is far below the ~22k datasets the violation list references -- they are computed at different
  stages, so don't present "N of counts.datasets" anywhere. An early 5,000-row sample suggested a very
  different split (54/38/8%) because rows are grouped by dataset -- only trust the full pull.
- Dataset-level comparison is NOT done: their `reference` is a data.europa.eu uuid and ours is the CKAN `name`;
  whether the uuid equals the CKAN package id was never verified (would need one read of the live portal).

## Org-scoped users: org admins see only their own organizations (shipped 2026-10-21)

A CKAN org admin who signs in through Keycloak becomes an **org-scoped** user
(`User.org_scoped`, `User.ckan_orgs` = JSON list of CKAN org slugs, refreshed from
CKAN at every Keycloak login). They see Organizations, Org Analytics, Datasets,
Quality and Traffic -- for their own orgs only -- and nothing else (no Overview,
Comms, Contacts, Health, Stats, Geo/Temporal Insights, MQA, admin panel; the
header's portal-wide totals and "Check Now" are not rendered for them). The sidebar
tab list for them is the fixed `_ORG_SCOPED_TABS`, not the stored `allowed_tabs`.
- **Enforced server-side, deny-by-default**: `require_login` calls
  `_org_scope_route_ok`, a method+regex allowlist (`_ORG_SCOPE_ALLOWED`); any
  route not on it is a 403 for a scoped user, *independent of `allowed_tabs`*
  (a superadmin granting extra tabs doesn't widen it). **A new `/api/...` route
  is therefore invisible to scoped users until it is added to that list** --
  and if you add it, it must filter by `_session_org_scope()` itself.
- Per-route filtering: org-analytics (slug must be in scope; peer/portal
  benchmarks are averages and percentile only, never another org's name),
  `datasets/search` (scope injected as `fq`; `format`/`type` containing `"` are
  refused because they are interpolated in quotes and could OR the scope away),
  `datasets/<name>` (404 if another org's), `datasets/formats`,
  `organizations` list/detail, quality results + Excel export
  (`_load_check_result_for_user`: datasets filtered by `org_slug`, summary
  recomputed from the org's own cache rows; a row with no `org_slug` is never shown),
  Matomo `top-datasets` (their datasets' own pages, from the WHOLE portal page list
  via `_matomo_dataset_page_visits` -- filtering the top-300 left them with an empty
  list) and `dataset-stats`/`dataset-analytics` (dataset's CKAN org looked up first). Portal-wide Matomo summary/searches/API
  calls/downloads are not available to them.
- The scope is cached in the session as `session["org_scope"]` by **every** place
  that fills the session from a user (password login, passkey, set-password,
  Keycloak callback, and API-token auth -- a scoped user's token is scoped too).
  A session missing the key is resolved from the DB (fails closed). A CKAN
  membership change applies at the user's next Keycloak sign-in.
- Only users **created** by the Keycloak login are scoped (non-sysadmin). An
  existing CRM user linked by email keeps their roles and is *not* scoped; there
  is no admin-panel toggle for `org_scoped` yet. Their Organizations tab never
  reads/writes the browser-wide `orgs_cache_v2` localStorage list.
- Frontend: `window.__ORG_SCOPED__` (`ORG_SCOPED` in app.js) skips Overview/Live
  Visitors/MQA loading, hides the check-run buttons and the portal-wide traffic
  panels, and opens Org Analytics on the user's first org. Tests:
  `tests/test_org_scope.py`.

## Conventions

- i18n: every user-facing string needs both an `en` and `el` entry, kept
  in sync (both `static/app.js`'s `TRANSLATIONS` object and
  `admin_users.html`'s own separate i18n dicts, since that page is
  standalone).
- When multiple unrelated changes are mid-flight in the same file, check
  `git diff` before `git add <file>` — staging by filename stages the
  *whole* file, not just your intended hunk.
- Superadmin gates (`_require_superadmin()`) are purely additive on top of
  routes with no other restriction — never build a superadmin-only path
  that accidentally excludes superadmins from something a regular user can
  already do. Superadmin must always be a strict superset.
- Auto commit+push to `main` is authorized for this repo (no need to ask
  before each push) until the user says otherwise.
- Don't originate test/verification traffic at the actual production
  infrastructure without asking first.

## Mail-ingestion pipeline redesign (completed 2026-08-17)

Goal: automate the inbound-email → Case/Communication pipeline end to end,
**except contact creation**, which stays the one human checkpoint (via a
new superadmin-only review queue), because a bad contact pollutes a
persistent, reused directory (mailing lists, exports) in a way a bad case
match doesn't. All 7 planned sections have shipped; kept here as a
reference for the reasoning behind the current shape of this subsystem,
not as a pending-work tracker.

Key decisions implemented:
- `_resolve_case_for_contacts` (app.py): no more sender-history
  tie-breaker for attaching to an existing case — if no Open case's
  subject matches, a new case is always opened. Subject matching is
  substring containment (not exact equality). `multiple_open_cases`
  auto-resolves (prefer a subject-matched candidate with prior contact
  history, then the most-recently-active one) instead of asking a human.
- `Case` is now **multi-org**: `Case.org_codes` (JSON list of
  `{code, label}`, mirrors `OrgContact.org_codes` exactly, same
  parse-with-fallback pattern). An email/thread always attaches to
  **exactly one** case, however many orgs or messages it touches — never
  splits into several. `Communication.org_name`/`org_title` stay
  single-value per entry, always derived from the actual contacts being
  credited on that entry (`_create_email_communication`), **never** from
  the case's own primary org (a case's primary org can now differ from a
  given Communication's own org).
- `_finish_unmatched_resolution` (app.py): resolving an unmatched
  participant (approve-as-new or merge-into-existing, via
  `/api/unmatched-contacts/<id>/create|resolve`) now automatically
  resolves/opens a case and logs a Communication for them — the human
  step is *only* identifying the contact; everything downstream is
  automatic. Deliberately does NOT just re-run the ordinary email-based
  matcher (which fails when merging into a contact registered under a
  different email than the one the participant actually sent from).
- **Contacts to Review** page shipped: `admin_users.html`'s
  `panel-contact-review` tab (superadmin-only) — a flat table of every
  pending `UnmatchedEmailContact` (via `GET /api/unmatched-contacts`),
  with a resolve modal (`contactReviewModal`) offering "Register as new"
  (calls `/create` directly, one request) or "Merge into existing" (a new
  contact search-and-pick widget, feeds `/resolve`).
- **Deprecated old inline flows removed**: `admin_users.html`'s old
  per-email "Unregistered participants" register-contact block +
  `unmatchedContactCreateModal`, and the main dashboard's inline "Also
  register this sender as a contact" fields in `openInboundAttachModal`
  (plus `saveInboundAttach`'s `new_contact`/`unmatched_id` payload and
  `inbound_email_attach`'s handling of it in app.py). The **Contacts to
  Review** queue is now the sole place a sender gets turned into a
  contact.
- **Superadmin case-correction tools shipped**: `PATCH /api/cases/<id>`
  now also accepts `org_codes`/`org_name`/`org_title` (superadmin-gated;
  `subject`/`deadline` stay open to everyone). New
  `POST /api/communications/<id>/reassign-case` (move one entry off the
  wrong case; refuses the Initial Contact entry) and
  `POST /api/cases/<id>/merge` (fold one case entirely into another,
  demoting the source's Initial Contact to a regular entry, unioning
  `org_codes`). Frontend: "Edit organizations"/"Merge into another case"
  buttons on the Comm modal's case-info box, plus a "Reassign to another
  case" link by the status field — all gated on the main dashboard's new
  `window.__IS_SUPERADMIN__` flag (`is_superadmin` wasn't previously
  passed to `index.html` at all; only `admin_users.html` had it). When
  moving a `Communication` between cases in code, always assign via the
  relationship (`comm.case = target`), never the raw `comm.case_id`
  column — `Case.communications` carries `cascade="all,
  delete-orphan"`, which tracks membership off the in-memory collection,
  so a raw FK write left stale in a loaded `case.communications`
  collection gets cascade-deleted out from under you the moment the old
  case is deleted.

If you need to change this area further, note that the design went
through many iterations and reversals during the original discussion
(e.g. several "open to everyone" permission decisions were later reversed
to superadmin-only) that aren't all re-derivable from the code alone — a
quick recap of intent from the user before diving in is the safest move
for anything non-trivial here.

## Communications tab: split-workspace layout (shipped 2026-08-25, revised through 2026-08-26)

**The split-workspace list-left/detail-right layout applies to Cases and
By-Org** (`col-lg-4`/`col-lg-8` — widened from an initial
`col-lg-7`/`col-lg-5` per user feedback that the detail panel should be
the dominant column, stacking below 992px like every other 2-column area
in the app). Timeline/All don't get it — they're plain browse/scan views
over individual entries, not a "read one thing's detail" view — so
`setCommsView(mode)` sets `#commsListCol`/`#commsDetailCol`'s width/
visibility per mode: `mode === 'cases'` or `mode === 'grouped'` keeps the
split (`col-lg-4` + visible panel), Timeline/All get `#commsListCol` at
full `col-12` and `#commsDetailCol` hidden (`d-none`), and clicking a row
in those 2 opens the ordinary Add/Edit modal (`openCommModal`) instead.
Cases and By-Org show different things in the same panel — a case's
thread vs. an org's communications (which, unlike a case, can span
several cases) — so `_renderCommsDetailPanel()` is just a small
dispatcher on `_commsViewMode` that calls `_renderCommsCaseDetailPanel()`
or `_renderCommsOrgDetailPanel()`. `setCommsView` clears whichever
selection doesn't belong to the mode being switched to and re-renders the
panel immediately, so there's no stale selection/content left visible
behind a mode switch.

- Selection state is two plain module vars, `_commsSelectedCaseId`/
  `_commsSelectedOrgTitle` (in-memory only, not persisted, only one set at
  a time) — same shape as the Live Visitors list↔map selection
  (`_selectLiveVisit`). `_selectCommsCase(caseId)`/`_selectCommsOrg(orgTitle)`,
  called only from a Cases-view card's or By-Org row's own `onclick`, are
  the two entry points. Highlight is a pure CSS-class toggle
  (`.comms-row-selected`) reapplied at the end of `_renderCommsCaseGroups`/
  `_renderCommsOrgGroups` — resolved via the `data-case-id` attribute for
  cases, but via a plain `dataset.org` comparison (not a
  `[data-org="..."]` selector string) for orgs, since an org title
  containing a `"` would otherwise break the selector.
- By-Org's own left-column rows dropped their inline expand-in-place
  entirely (same move Cases view made first) — clicking an org selects it
  into the panel instead, which shows every communication for that org
  (`_commsListRowHtml` rows, `showCaseBadge: true` since one org can span
  more than one case) with an "Add" button in the header
  (`openCommModal(null, org, orgCode)`, replacing the old per-row "+"
  button). An org has no status/deadline/close-reopen concept the way a
  case does, so its header only names it and its entry count — no
  case-tools dropdown, no Close/Reopen, no Add Follow-up (those 3 buttons
  are explicitly hidden by `_renderCommsOrgDetailHeader`, and the case
  header explicitly hides the org's own Add button in turn).
- **None of the left column's row templates are `<table>`s any more.**
  The original implementation kept each view's pre-existing fixed-pixel
  `<table>` (e.g. a 190px status column, sized for the old full-width
  card) and only added the detail panel alongside it — at the narrower
  `col-lg-4` width that produced actually-broken rendering (a column
  header like "Σημειώσεις" wrapping one character per line because its
  column had been squeezed to near-zero). Cases view was rebuilt first
  (compact `.comms-case-item` divs, no table). By-Org and the flat "All"
  view were rebuilt the same way once the same breakage showed up there
  too: `_commsListRowHtml(c, {showOrg, showCaseBadge, reveal})` is the
  one shared compact one-line row (date · org (flat view only) · subject
  · status pill · kebab actions menu — medium/direction/notes were
  dropped from this row entirely). It's used by `_renderCommsFlat`
  (rows open the ordinary Add/Edit modal on click, no panel there) and,
  separately, by `_renderCommsOrgDetailPanel` for the selected org's
  entries inside the detail panel (rows there also open the Add/Edit
  modal — there's no further nested selection once you're already inside
  the panel). The flat view's old clickable `<th>` column sort UI became
  `_commsSortMenuHtml()`, a small dropdown driving the same
  `_commsSortCol`/`_commsSortDir`/`sortComms()` state — there's no header
  row left to click. Timeline's own `.comm-timeline-item` divs were
  already flex-based, not a table, so they were never affected by this
  and are untouched. The Cases-view detail panel's own row template
  (`_commsDetailRowHtml`) is separate again from `_commsListRowHtml` —
  the panel already names the case's org/subject once in its own header,
  so its rows lead with contact name instead of repeating the subject on
  every line.
- Every row's edit/reassign/delete/follow-up actions collapsed from 2-4
  separate icon buttons into one round kebab-menu button
  (`_commsRowActionsMenuHtml(c, {followup})`, a Bootstrap dropdown) —
  shared by every row template (including the detail panel's own row) —
  once the narrower left column made that many icon buttons stop
  fitting without wrapping. Reassign is superadmin-gated inside that
  same menu, not a separate icon.
- `_renderCommsCaseDetailPanel`/`_renderCommsDetailHeader` (app.js) reuse
  `_fetchCommsCaseRows`/`_commsFetchCaseDetail` verbatim for data — no
  separate detail-panel data path. The header shows the case's
  status/no-response/auto-captured state as separate pill badges
  (`Case.to_dict` already computes `is_stale`/`has_auto_entry` — no
  backend change needed) rather than one run-on text line, with the org
  name/subject/opened-deadline info stacked below. Its action buttons:
  a superadmin-only "case tools" dropdown (Edit-orgs + Merge, folded
  into one button the same way row actions are), Close/Reopen
  (`#commsDetailToggleBtn`), and Add Follow-up. `openCaseOrgEditModal`/
  `openCaseMergeModal`/`openCaseReassignModal` each take an optional
  id-override parameter so they can be triggered from the panel (which
  has no `#commModal`/`#commCaseInfo` DOM to read a case id off of) as
  well as from their original modal-internal buttons.
- Fixed a latent bug this surfaced: `_confirmCaseTarget`'s reassign
  branch called `_commModal.hide()` unconditionally; reassigning without
  ever opening `#commModal` in that session (now a normal path via the
  row kebab menu or the panel) would throw. It's now guarded
  (`if (_commModal)`).
- The filter-facet panel (3 tabbed dimensions, unchanged logic) moved
  behind a "Filters" dropdown button, reusing the same
  `data-bs-auto-close="outside"` pattern as the Contacts tab's role
  picker. Its filter-card icons (and every other filter panel that
  reuses the shared `_renderFilterCardsGrid` — Catalog type, Contacts,
  File-contacts) are a small solid-color circle (white icon on the
  card's own accent color, via the existing `CARD_BORDER_COLOR` map)
  instead of a bare colored glyph.
- `_commsRefreshInPlace()` (SSE/save/close/reopen/merge/reassign all
  funnel through it) also refreshes the selected detail panel now
  (`_commsRefreshSelectedDetail`), independent of which left-view mode
  is active — the selected case can differ from whatever the left
  column happens to be displaying.
- **Button shape:** a fully-rounded "pill" button style (`border-radius:
  999px`) was tried on the main header and the Comms toolbar/detail-panel
  buttons, then explicitly reverted the same session — the user prefers
  Bootstrap's default rectangular (~6px corner) button style everywhere.
  Don't reintroduce a blanket pill-button rule; see
  `feedback_no_pill_shaped_buttons` in local memory for the fuller history
  if this comes up again.

## Organization Analytics (Phases 0–2 shipped 2026-09-16; Phase 3 open)

Per-org performance analytics: dataset count + HVD/DCAT-AP/GeoDCAT-AP pass
rates for a given org, benchmarked against its peer-group category average,
the portal-wide average/percentile, and its own history over time. A 4th
benchmark — "datasets published vs. datasets that could/should be
published" (a coverage/plurality ratio) — was deliberately deferred by the
user pending their own definition of what "should be published" means; the
schema leaves room for it (a future nullable column) but nothing computes
it yet. This was greenfield: no `Organization` model, no per-org quality
rollup, and no org-categorization concept existed anywhere before this.

Key decisions/shape:
- **No dedicated `Organization` model.** Orgs are still live CKAN data
  (`OrgsCache`). Peer-group categorization instead lives in a new
  `OrgClassification` table (models.py), keyed by CKAN org slug.
  `app._classify_org()` guesses a category (`ministry` / `municipality` /
  `region` / `decentralized_admin` / `university` / `other`) from the org's
  Greek-language title via ordered keyword matching — **not** from an HRMS
  type field, because `public_orgs()` (app.py) has only ever extracted
  `code`+`preferredLabel` from HRMS's response and the actual shape of that
  payload (whether it exposes a usable type/category field) was never
  confirmed (network-blocked from the dev sandbox at the time). If revisiting
  this, check the live HRMS payload first — it may simplify or replace the
  heuristic. `heuristic_category` is stored separately from the effective
  `category` so re-running the classifier (`app._do_classify_orgs()`, on the
  same cadence as `_do_refresh_orgs()`, i.e. every 30 min + once at startup)
  never clobbers a superadmin's manual override (`is_override`); only
  `heuristic_category` gets refreshed on an overridden row.
- **Org info on `package_search` results (two bugs, the second found 2026-10-22)**:
  `_list_hvd_datasets`/`_list_all_datasets`/`_list_geo_datasets` first read a nonexistent
  `organization_card` key (so `org_title`, and HVD's `publisher_mismatch`, was silently
  empty). Phase 0 "fixed" it to read `organization` as an object -- but those queries
  restrict fields with `fl`, and then CKAN returns `organization` as a bare **slug string**,
  so every check run crashed with `'str' object has no attribute 'get'` (invisible for a
  month because the checks only run when stale, and it left every org-analytics pass rate
  empty). Now `_package_org()` handles both shapes, resolving the title from the orgs
  cache via `_org_title_by_slug()`; `tests/test_quality_listers.py`. Lesson: a mocked
  response can't tell you a field's shape -- the dev sandbox couldn't reach CKAN, so this
  was never seen against the real API until it failed in production.
  A **second** bug sat behind it (found the same day): `_do_run_check` committed the
  org_slug backfill and then kept using the now-expired cached ORM rows after the
  backfill's `app.app_context()` had closed -> "Instance <...CheckCache> is not bound to a
  Session". It now copies what it needs into plain tuples (`cached_snap`) inside the
  session. `_do_run_check` swallows every exception into the check's `error` status, so a
  test must assert `_get_check_status(...)["error"] is None` -- the older backfill test
  only looked at a side effect and passed while the run crashed
  (`tests/test_quality_run_end_to_end.py` covers it, incl. in a plain thread like prod).
- **Per-dataset quality-check rows now carry `org_slug`**: a nullable,
  indexed column added to `HvdDatasetCheckCache`/`DcatApDatasetCheckCache`/
  `GeoDcatDatasetCheckCache`. `_do_run_check()` backfills it for **every**
  dataset in the current run's list each time it runs — including
  cache-reused rows, not just newly re-checked ones — since
  `list_datasets()` already returns org info at zero extra CKAN-call cost.
  This matters: the old cache-hit path never touched a dataset's DB row at
  all when reusing it as-is, so without this an org rename/transfer would
  never be reflected without a full re-check.
- **`OrgSnapshot`** (models.py) is an append-only time series — one row per
  org per background-loop run, mirroring `PortalSnapshot`'s shape rather
  than a singleton cache, since the point is a queryable trend history.
  Built daily by `app._do_build_org_snapshots()` (rolls up the 3 quality
  caches grouped by `org_slug`, joined with `OrgsCache` dataset counts and
  `OrgClassification` categories) — wired into `_background_loop()` at
  startup + every `_ORG_SNAPSHOT_INTERVAL` (24h). `app._latest_org_snapshots()`
  returns every row sharing the most recent `computed_at` (one full batch),
  not each org's own latest row independently — avoids mixing a crashed
  partial run with a later complete one.
- **Routes**: `/api/org-analytics/categories` (peer-group leaderboard),
  `/<org_slug>/scorecard` (snapshot + portal avg + percentile),
  `/<org_slug>/peer-comparison` (vs. same-category orgs), `/<org_slug>/trend`
  (full history), plus superadmin-gated `/classifications` (list) and
  `POST`/`DELETE .../classifications/<org_slug>/override`. All gated behind
  a new `"org-analytics"` tab (`ALL_TABS`, `_TAB_ROUTE_RULES` in app.py).
  `organization_detail()` also gained a `quality_summary` block (category +
  latest snapshot), gated on `"quality"` tab access the same way
  `comms_summary` is gated on `"comms"` access.
- **Frontend**: a new sidebar tab (`#tab-org-analytics`) — org picker
  (reuses `org_search.js`'s shared typeahead), scorecard cards, a Chart.js
  grouped-bar comparison chart and per-check trend line chart, and a
  peer-group leaderboard table. The existing org detail panel
  (`openOrgPanel`/`renderOrgPanel`) gained a compact "Data Quality" section
  reading `quality_summary`, linking into the new tab via
  `openOrgAnalyticsFor()`.
- **The classification override table lives in the standalone admin panel
  (`admin_users.html`'s "Org Classifications" panel), not the main
  dashboard** — it was first built inline on the Organization Analytics
  tab, gated only by hiding it client-side from non-superadmins, but that
  doesn't match this app's convention (superadmin maintenance tooling —
  Mail Parser config, Contacts to Review — lives in `admin_users.html`, not
  the main dashboard) and was moved there the same session. Since that page
  is standalone (loads neither `app.js` nor its `TRANSLATIONS`), the
  category labels/column headers are duplicated into `admin_users.html`'s
  own i18n dict under an `admin.org_class_*` prefix rather than reusing
  `app.js`'s `org_analytics.*` keys.
- **`admin_users.html`'s `TAB_DEFS` list is hardcoded, not driven by the
  server's `ALL_TABS`** — easy to miss when adding a new tab. Missing an
  entry there means a superadmin can never actually grant a tab-restricted
  user access to it, even though the tab itself works fine for
  unrestricted users. Added an entry for `org-analytics` here; check this
  list too whenever a future tab is added.

Still open: the coverage/plurality benchmark (deferred, needs the user's
own definition of "expected" datasets per org first), and confirming the
live HRMS payload shape (see above).
