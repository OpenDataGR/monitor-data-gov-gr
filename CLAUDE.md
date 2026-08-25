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
  import-time engine binding above), and wipes/recreates all tables
  between tests via an autouse fixture.
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
- No staging environment — pushing to `main` deploys straight to
  production. A request landing during a deploy's brief gunicorn restart
  can surface as a transient frontend error (stray spinner, a JSON.parse
  failure) — not necessarily a real bug; check `gh run list` for timing
  correlation before chasing it as one.

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

## Communications tab: split-workspace layout (shipped 2026-08-25)

The Comms tab is a list-left/detail-right layout (`col-lg-7`/`col-lg-5`,
stacking below 992px like every other 2-column area in the app), not a
single full-width list. All four view modes (Cases/Timeline/By
Org/All) keep their own existing grouping/expand behavior on the left;
clicking any row or case-header selects that entry's case and shows its
full thread in one shared, sticky right-hand panel (`#commsDetailPanel`)
— reading a case no longer needs the Add/Edit modal or an inline expand.

- Selection state is two plain module vars, `_commsSelectedCaseId`/
  `_commsSelectedCommId` (in-memory only, not persisted) — same shape as
  the Live Visitors list↔map selection (`_selectLiveVisit`).
  `_selectCommsEntry(commId)` is the one entry point every row's
  `onclick` calls; it resolves to `_selectCommsCase` unless the entry
  has no `case_id`. Highlight is a pure CSS-class toggle
  (`.comms-row-selected`, resolved via `data-case-id`/`data-comm-id`
  attributes already on each row) reapplied at the end of every one of
  the 4 render functions, since each fully replaces `#commsTable`'s
  innerHTML.
- `_renderCommsDetailPanel`/`_renderCommsDetailHeader` (app.js) reuse
  the existing row/table renderers (`_commsHistRowHtml`,
  `_commsGroupTableShell`) and case-detail fetch (`_fetchCommsCaseRows`,
  `_commsFetchCaseDetail`) verbatim — there's no separate detail-panel
  data path. The panel hosts Add-follow-up, Close/Reopen, and
  (superadmin-only) Edit-orgs/Merge; `openCaseOrgEditModal`/
  `openCaseMergeModal`/`openCaseReassignModal` each take an optional
  id-override parameter so they can be triggered from the panel (which
  has no `#commModal`/`#commCaseInfo` DOM to read a case id off of) as
  well as from their original modal-internal buttons.
- A superadmin-only Reassign icon exists on every row template
  (`_commsReassignIconHtml`), not just in the modal — reassigning
  without ever opening `#commModal` in that session is now a normal
  path, which is what surfaced (and required fixing) a latent bug:
  `_confirmCaseTarget`'s reassign branch called `_commModal.hide()`
  unconditionally; it's now guarded (`if (_commModal)`).
- The filter-facet panel (3 tabbed dimensions, unchanged logic) moved
  behind a "Filters" dropdown button, reusing the same
  `data-bs-auto-close="outside"` pattern as the Contacts tab's role
  picker.
- `_commsRefreshInPlace()` (SSE/save/close/reopen/merge/reassign all
  funnel through it) also refreshes the selected detail panel now
  (`_commsRefreshSelectedDetail`), independent of which left-view mode
  is active — the selected case can differ from whatever the left
  column happens to be displaying.
