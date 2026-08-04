"""Curated descriptions for /api-docs and /api-console.

Cross-referenced against app.url_map at request time (see build_route_meta()
below, called from app.py's /api/_meta/routes) rather than trusted blindly --
a route renamed/removed here without updating app.py would otherwise show a
description for something that no longer exists, or (worse) silently hide a
real route this file hasn't been updated to describe. build_route_meta()
verifies every entry below against the live url_map and buckets anything
undocumented into its own category instead of dropping it.

Each category is `{"id", "title", "desc"}`. Each route is
`{"methods": [...], "path", "desc", "admin": bool|str, "limit": str, "params": str}`
-- only "methods"/"path"/"desc" are required, the rest are optional tags.
"""

CATEGORIES = [
    {"id": "auth", "title": "Auth & Session",
     "desc": "Login, WebAuthn passkey sign-in, password reset/invite flows."},
    {"id": "account", "title": "Account & Admin",
     "desc": "Self-service account settings, passkeys, and admin-only user/access management."},
    {"id": "dashboard", "title": "Dashboard & Health",
     "desc": "The main shell, uptime monitoring, and portal-wide stat snapshots."},
    {"id": "catalog", "title": "Dataset Catalog",
     "desc": "CKAN dataset search/detail and the Organizations tab."},
    {"id": "quality", "title": "Quality Checks",
     "desc": "HVD / DCAT-AP / GeoDCAT-AP SHACL compliance runs and the EU MQA score."},
    {"id": "comms", "title": "Communications & Cases",
     "desc": "Outreach log to public-sector orgs -- paginated, search/filter/sort/group_by, plus the live SSE stream."},
    {"id": "inbound", "title": "Inbound Email",
     "desc": "SendGrid parse webhook and the review queue for emails that need a human match."},
    {"id": "contacts", "title": "Contacts & Portal Members",
     "desc": "The org-contact roster, CKAN portal accounts, and one-off data-cleanup tools."},
    {"id": "matomo", "title": "Matomo Analytics",
     "desc": "Traffic tab data -- visits, top content, live visitors. Gated on MATOMO_TOKEN being configured."},
]

ROUTES = {
    "auth": [
        {"methods": ["GET", "POST"], "path": "/login",
         "desc": "Renders the login form; on POST validates email + password (with a honeypot bot-trap field) and starts the session."},
        {"methods": ["POST"], "path": "/webauthn/login/begin",
         "desc": "Generates a usernameless WebAuthn authentication challenge and stores it in the session."},
        {"methods": ["POST"], "path": "/webauthn/login/complete",
         "desc": "Verifies the WebAuthn assertion against the stored credential and logs the matching user in."},
        {"methods": ["GET", "POST"], "path": "/forgot-password", "limit": "5/hr",
         "desc": "Shows the request form; on POST emails a reset link if the address matches a user (no account-enumeration leak)."},
        {"methods": ["GET", "POST"], "path": "/set-password", "limit": "20/hr",
         "desc": "Validates a password-reset/invite token; on POST sets the new password and logs the user in."},
        {"methods": ["GET"], "path": "/logout",
         "desc": "Clears the session and redirects to login."},
    ],
    "account": [
        {"methods": ["GET"], "path": "/admin/users", "admin": True,
         "desc": "Renders the admin user-management page."},
        {"methods": ["GET", "POST"], "path": "/api/users", "admin": True, "limit": "20/hr POST",
         "desc": "Lists all users (GET) or creates one + sends an invite link (POST). POST may optionally set an initial tab restriction (restricted + tabs, same shape as /api/users/<id>/tabs) for a non-admin user before the invite email goes out."},
        {"methods": ["POST"], "path": "/api/users/<int:user_id>/resend-invite", "admin": True,
         "desc": "Re-sends an invite, or a reset link if the user already set a password."},
        {"methods": ["POST"], "path": "/api/users/<int:user_id>/toggle-admin", "admin": "superadmin",
         "desc": "Flips a user's is_admin flag. Can't target self or a superadmin."},
        {"methods": ["POST"], "path": "/api/users/<int:user_id>/tabs", "admin": True,
         "desc": "Sets which dashboard tabs a user is restricted to (or clears the restriction)."},
        {"methods": ["POST"], "path": "/api/users/<int:user_id>/delete", "admin": "superadmin",
         "desc": "Deletes a user account. Can't delete self or a superadmin."},
        {"methods": ["POST"], "path": "/api/account/change-password",
         "desc": "Changes the current user's own password after verifying the current one."},
        {"methods": ["POST"], "path": "/api/account/update-name",
         "desc": "Updates the current user's display name in the DB and session."},
        {"methods": ["GET"], "path": "/api/account/passkeys",
         "desc": "Lists the current user's registered WebAuthn passkeys."},
        {"methods": ["POST"], "path": "/api/account/passkeys/register/begin",
         "desc": "Generates WebAuthn registration options for adding a new passkey."},
        {"methods": ["POST"], "path": "/api/account/passkeys/register/complete",
         "desc": "Verifies the registration response and saves the new passkey credential."},
        {"methods": ["POST"], "path": "/api/account/passkeys/<int:cred_id>/delete",
         "desc": "Deletes one of the current user's own passkeys."},
        {"methods": ["GET"], "path": "/api/tokens",
         "desc": "Lists the current user's own personal API tokens (never the raw values -- those are shown once, at creation)."},
        {"methods": ["POST"], "path": "/api/tokens",
         "desc": "Creates a new personal API token for calling this API with Authorization: Bearer <token> instead of a browser session."},
        {"methods": ["POST"], "path": "/api/tokens/<int:token_id>/revoke",
         "desc": "Revokes one of the current user's own tokens immediately."},
        {"methods": ["GET", "POST"], "path": "/api/admin/reset", "admin": True, "limit": "10/hr",
         "desc": "Wipes all health-check history and restarts monitoring; requires re-entering your own password."},
        {"methods": ["POST"], "path": "/api/admin/test-email", "admin": True, "limit": "10/hr",
         "desc": "Sends a one-off test email via SendGrid to verify the mail configuration."},
        {"methods": ["POST"], "path": "/api/admin/mass-email", "admin": True, "limit": "5/hr",
         "desc": "Sends an HTML announcement to selected user IDs one at a time and logs the send."},
        {"methods": ["GET"], "path": "/api/admin/mass-email/history", "admin": True,
         "desc": "Lists past mass-email sends with recipient/success counts."},
        {"methods": ["GET", "POST"], "path": "/api/admin/excluded-emails", "admin": "superadmin",
         "desc": "Lists (GET) or adds (POST) email addresses/domains excluded from mass-mail/matching. Now surfaced on the admin panel's Mail Parser tab (superadmin-only), not System."},
        {"methods": ["POST"], "path": "/api/admin/excluded-emails/<int:excl_id>/delete", "admin": "superadmin",
         "desc": "Removes one excluded-email entry."},
        {"methods": ["GET", "POST"], "path": "/api/admin/listen-addresses", "admin": "superadmin",
         "desc": "Lists (GET) or adds (POST) recipient addresses/domains the inbound webhook actually processes. Empty (the default) means listen to everything; anything sent to a To/Cc not on this list gets recorded dismissed (reason=not_listening_address) instead of matched."},
        {"methods": ["POST"], "path": "/api/admin/listen-addresses/<int:listen_id>/delete", "admin": "superadmin",
         "desc": "Removes one listening-address entry."},
    ],
    "dashboard": [
        {"methods": ["GET"], "path": "/",
         "desc": "Renders the main dashboard shell with monitored endpoints, build info, and the current user/tab context."},
        {"methods": ["GET"], "path": "/robots.txt",
         "desc": "Static Disallow: / response -- this dashboard isn't meant to be crawled."},
        {"methods": ["GET"], "path": "/api/changelog",
         "desc": "Returns the app's changelog entries."},
        {"methods": ["GET"], "path": "/api/health/current",
         "desc": "Live check of every configured endpoint, run right now."},
        {"methods": ["GET"], "path": "/api/health/history", "params": "?endpoint=&hours=24",
         "desc": "History of checks for one endpoint."},
        {"methods": ["GET"], "path": "/api/health/summary",
         "desc": "Per-endpoint 24h uptime %, avg response time, and last-up timestamp."},
        {"methods": ["GET"], "path": "/api/stats/latest",
         "desc": "Most recent portal snapshot (dataset/org counts, etc.)."},
        {"methods": ["GET"], "path": "/api/stats/live",
         "desc": "Fetches current portal stats live from CKAN -- bypasses the DB snapshot."},
        {"methods": ["GET"], "path": "/api/stats/history", "params": "?days=30&step=week",
         "desc": "Historical snapshot rows, optionally downsampled to weekly."},
        {"methods": ["GET"], "path": "/api/stats/dataset-growth",
         "desc": "Dataset-count growth over time, shared-cache backed."},
        {"methods": ["POST"], "path": "/api/trigger-check", "limit": "10/hr",
         "desc": "Manually kicks off a background health-check run for every endpoint."},
    ],
    "catalog": [
        {"methods": ["GET"], "path": "/api/datasets/search",
         "params": "?q=&org=&format=&type=&hvd=&harvested=&geo=&sort=&rows=&start=",
         "desc": "Faceted CKAN dataset search with summary-card counts."},
        {"methods": ["GET"], "path": "/api/datasets/<name>",
         "desc": "Full detail for one dataset -- resources, HVD/geospatial flags, data-service endpoints."},
        {"methods": ["GET"], "path": "/api/datasets/formats",
         "desc": "Cached (1h) resource-format facet counts across all datasets."},
        {"methods": ["GET"], "path": "/api/datasets/geo-locations",
         "desc": "Cached per-org geospatial-dataset centroids for map plotting; refreshed daily in the background."},
        {"methods": ["GET", "POST"], "path": "/api/organizations", "limit": "10/hr POST",
         "desc": "Cached CKAN org list with dataset counts. POST forces a refresh."},
        {"methods": ["GET"], "path": "/api/organizations/<org_name>",
         "desc": "Org detail: metadata, 6 most-recent datasets, members, communications summary."},
        {"methods": ["GET"], "path": "/api/public-orgs",
         "desc": "Cached list of Greek public-sector orgs from HRMS, for org-picker dropdowns."},
    ],
    "quality": [
        {"methods": ["POST"], "path": "/api/quality/<check_type>-check", "admin": True,
         "params": "check_type = hvd | dcat | geodcat",
         "desc": "Starts a background SHACL compliance run. No-op if one is already running."},
        {"methods": ["GET"], "path": "/api/quality/<check_type>-check",
         "desc": "Current run status (running/progress/error) plus the last saved result."},
        {"methods": ["POST"], "path": "/api/quality/<check_type>-check/cancel", "admin": True,
         "desc": "Requests cancellation of a running check."},
        {"methods": ["GET"], "path": "/api/quality/<check_type>-check/export", "params": "?filters=&q=",
         "desc": "Exports flagged datasets to .xlsx."},
        {"methods": ["POST"], "path": "/api/quality/<check_type>-check/clear", "admin": True,
         "desc": "Deletes cached results for a check type. Blocked while a run is in progress."},
        {"methods": ["GET"], "path": "/api/quality/mqa",
         "desc": "Cached EU data.europa.eu Metadata Quality Assessment score for the catalogue."},
        {"methods": ["POST"], "path": "/api/quality/mqa/refresh", "admin": True,
         "desc": "Force-refreshes the MQA score from data.europa.eu."},
        {"methods": ["GET"], "path": "/api/debug/portal",
         "desc": "Diagnostic dump of raw CKAN API responses (package_search, resource_search, status_show, organization_list)."},
    ],
    "comms": [
        {"methods": ["GET"], "path": "/api/communications",
         "params": "?q=&case_status=&stale=&status=&group_by=case|org|day&case_id=|org=|day=&sort=&dir=&rows=&start=",
         "desc": "Paginated, searchable, filterable, sortable, groupable log of every logged contact."},
        {"methods": ["POST"], "path": "/api/communications",
         "desc": "Logs a new communication, opening a new case unless case_id is given. Accepts an optional direction (Inbound|Outbound), independent of status -- unset by default. Accepts an optional contact_ids list (OrgContact ids) linking real contacts via CommunicationContact, alongside the existing free-text contact_person."},
        {"methods": ["GET", "PATCH", "POST"], "path": "/api/communications/<int:comm_id>",
         "desc": "Reads or edits one communication entry, including its direction (Inbound|Outbound). PATCH with contact_ids replaces the entry's full set of linked contacts (an empty list clears them); omitting the field leaves existing links untouched."},
        {"methods": ["DELETE", "POST"], "path": "/api/communications/<int:comm_id>/delete",
         "desc": "Deletes an entry; deletes its case too if that was the last entry. Un-links it from every InboundEmail that produced it first (catch-all-contacts can credit one email with several), parking each back in pending_review."},
        {"methods": ["GET"], "path": "/api/communications/subjects",
         "desc": "Distinct historical subjects, newest first, for the add-entry autocomplete."},
        {"methods": ["GET"], "path": "/api/communications/export", "params": "?status=&case_status=&stale=&q=",
         "desc": "Exports the log to .xlsx."},
        {"methods": ["GET"], "path": "/api/communications/stream",
         "desc": "Server-Sent Events stream -- pushes a toast the moment a new inbound email or communication lands. Redis Pub/Sub-backed across workers when configured."},
        {"methods": ["GET"], "path": "/api/cases", "params": "?status=Open|Closed",
         "desc": "All cases, optionally filtered to one status."},
        {"methods": ["GET"], "path": "/api/cases/<int:case_id>",
         "desc": "One case plus its full communications history."},
        {"methods": ["PATCH", "POST"], "path": "/api/cases/<int:case_id>",
         "desc": "Edits a case's subject, org, or deadline."},
        {"methods": ["POST"], "path": "/api/cases/<int:case_id>/close",
         "desc": "Marks a case Closed."},
        {"methods": ["POST"], "path": "/api/cases/<int:case_id>/reopen",
         "desc": "Marks a case Open again."},
        {"methods": ["DELETE", "POST"], "path": "/api/cases/<int:case_id>/delete",
         "desc": "Deletes a case and its communications."},
    ],
    "inbound": [
        {"methods": ["POST"], "path": "/api/email-sync/inbound-webhook/<secret>",
         "desc": "Receives an inbound email, matches every participant against registered contacts grouped by org, and creates one Communication per org that resolves to exactly one Open case (an org with none/several is simply skipped, not blocking the others). Any participant that isn't a registered contact at all is recorded as an UnmatchedEmailContact for review, regardless of whether other participants succeeded. Secret-token gated, CSRF-exempt. If any InboundListenAddress rows exist, a To/Cc not on that list gets recorded dismissed instead of processed."},
        {"methods": ["GET"], "path": "/api/inbound-emails", "params": "?status=",
         "desc": "Lists inbound emails, each including its full split-out thread_messages (see _extract_thread_messages) for display, not just the raw body."},
        {"methods": ["POST"], "path": "/api/inbound-emails/<int:inbound_id>/pick-contact",
         "desc": "Resolves a multi-candidate match (reason=multiple_contacts_match) to a chosen contact; auto-attaches if their case is unambiguous. Largely superseded by the webhook's own per-org grouping, which no longer treats several matched contacts as ambiguous -- kept for any pre-existing rows still carrying that reason."},
        {"methods": ["POST"], "path": "/api/inbound-emails/<int:inbound_id>/attach",
         "desc": "Attaches an email to an existing case or opens a new one, creating a communication."},
        {"methods": ["POST"], "path": "/api/inbound-emails/<int:inbound_id>/dismiss",
         "desc": "Marks an inbound email dismissed -- no action taken."},
        {"methods": ["POST"], "path": "/api/inbound-emails/<int:inbound_id>/rematch", "admin": "superadmin",
         "desc": "Reprocesses a pending_review email's stored From/To/subject/body against the current contact registry and excluded/listen config -- for after fixing a config gap or registering a previously-unmatched contact, without waiting for a new email. Only pending_review rows qualify."},
        {"methods": ["DELETE"], "path": "/api/inbound-emails/<int:inbound_id>", "admin": "superadmin",
         "desc": "Permanently deletes a Parsed Emails row (cascades to its link/unmatched rows only, never to any Communication it produced)."},
        {"methods": ["DELETE"], "path": "/api/inbound-emails/<int:inbound_id>/communications/<int:comm_id>", "admin": "superadmin",
         "desc": "Un-links a Communication from this email without deleting the Communication -- reverts the email to pending_review if that was its only remaining link."},
        {"methods": ["POST"], "path": "/api/inbound-emails/<int:inbound_id>/thread-messages/<int:msg_index>/attach", "admin": "superadmin",
         "desc": "Manually logs one specific message from a split forwarded thread (by its 0-based index in thread_messages) as its own Communication, using that message's own sender/date/subject/body rather than the whole email's. Needs org_code or case_id, plus an optional contact_id or contact_email; requires an existing Open case (no new-case branch)."},
        {"methods": ["POST"], "path": "/api/unmatched-contacts/<int:unmatched_id>/drop", "admin": "superadmin",
         "desc": "Dismisses an UnmatchedEmailContact flag (a participant found on a processed email who isn't a registered contact) without registering them."},
        {"methods": ["POST"], "path": "/api/unmatched-contacts/<int:unmatched_id>/create", "admin": "superadmin",
         "desc": "Registers a flagged unmatched participant as a real OrgContact (same fields as POST /api/contacts/<org_code>). Also retroactively credits them on any Communication the same email already produced for the same org."},
    ],
    "contacts": [
        {"methods": ["GET"], "path": "/api/contacts",
         "desc": "Paginated File Contacts list with search/filter/group_by=org and cross-scoped facets -- same design as Communications."},
        {"methods": ["GET", "POST"], "path": "/api/portal-members",
         "desc": "Paginated CKAN portal-user list, enriched with matched contact info, backed by a 2h server-side cache. POST forces a refresh."},
        {"methods": ["GET"], "path": "/api/portal-user", "params": "?username=",
         "desc": "CKAN user detail plus matched OrgContact. Username is a query param (not path) to dodge a WAF .com-extension rule."},
        {"methods": ["GET"], "path": "/api/portal-user/<username>/datasets",
         "desc": "Datasets (incl. private) created by this portal user."},
        {"methods": ["GET"], "path": "/api/portal-user/<username>/activity", "params": "?limit=50",
         "desc": "Recent CKAN activity-stream entries for a portal user."},
        {"methods": ["GET"], "path": "/api/contacts/<path:org_code>",
         "desc": "Lists contacts under one organization."},
        {"methods": ["POST"], "path": "/api/contacts/<path:org_code>",
         "desc": "Creates a contact under one organization."},
        {"methods": ["PATCH", "POST"], "path": "/api/contacts/id/<int:contact_id>",
         "desc": "Updates a contact's fields."},
        {"methods": ["DELETE", "POST"], "path": "/api/contacts/id/<int:contact_id>/delete",
         "desc": "Deletes a contact."},
        {"methods": ["POST", "PATCH"], "path": "/api/contacts/save",
         "desc": "Upserts a contact and keeps the portal-members cache in sync."},
        {"methods": ["POST", "DELETE"], "path": "/api/contacts/remove",
         "desc": "Deletes a contact by id and syncs the portal-members cache."},
        {"methods": ["GET"], "path": "/api/contacts/summary",
         "desc": "Contact counts grouped by organization."},
        {"methods": ["GET"], "path": "/api/contacts/export", "params": "?search=&role=&state=&anonymize=&columns=",
         "desc": "Exports the full active.gov.gr portal-member roster to .xlsx."},
        {"methods": ["POST"], "path": "/api/contacts/import", "admin": True,
         "desc": "Bulk-imports contacts from an uploaded .xlsx, mapping org labels to HRMS codes."},
        {"methods": ["POST"], "path": "/api/contacts/fix-org-codes", "admin": True,
         "desc": "Backfills/repairs org_code via HRMS and CKAN title matching."},
        {"methods": ["POST"], "path": "/api/contacts/fix-contact-types", "admin": True,
         "desc": "Backfills contact_type from a leftover [role] suffix in the position field."},
        {"methods": ["POST"], "path": "/api/contacts/fix-tel-mobile", "admin": True,
         "desc": "Moves any tel number starting with the Greek mobile prefix into the mobile field."},
    ],
    "matomo": [
        {"methods": ["GET"], "path": "/api/matomo/summary", "params": "?days=30 or ?start=&end=",
         "desc": "Visits, unique visitors, pageviews, downloads for a range."},
        {"methods": ["GET"], "path": "/api/matomo/visits-history",
         "desc": "Same metrics broken out per day over the range."},
        {"methods": ["GET"], "path": "/api/matomo/top-datasets", "params": "?limit=20",
         "desc": "Top dataset pages by visits, enriched with CKAN titles."},
        {"methods": ["GET"], "path": "/api/matomo/top-searches", "params": "?limit=20",
         "desc": "Top on-site search keywords."},
        {"methods": ["GET"], "path": "/api/matomo/top-downloads", "params": "?limit=20",
         "desc": "Top downloaded resource URLs by visit count."},
        {"methods": ["GET"], "path": "/api/matomo/dataset-stats", "params": "?name=&resource_url=",
         "desc": "Visits/unique/downloads for one dataset (30-day window)."},
        {"methods": ["GET"], "path": "/api/matomo/dataset-analytics",
         "desc": "Time series, visitor countries, referrer types, per-resource downloads for one dataset."},
        {"methods": ["GET"], "path": "/api/matomo/top-api-calls", "params": "?limit=20",
         "desc": "Top CKAN API actions tracked as Matomo events."},
        {"methods": ["GET"], "path": "/api/matomo/today",
         "desc": "Today's visits/unique/pageviews/downloads, uncached."},
        {"methods": ["GET"], "path": "/api/matomo/live", "params": "?minutes=30&limit=20",
         "desc": "Currently-active visit counters plus recent live visit details."},
        {"methods": ["GET"], "path": "/api/matomo/debug-pages",
         "desc": "Diagnostic dump of the top 30 raw Matomo page labels."},
    ],
}


def build_route_meta(url_map):
    """Cross-references the curated CATEGORIES/ROUTES above against the
    live Flask url_map, so /api/_meta/routes always reflects reality:
    - a curated entry whose (path, methods) no longer exists is dropped
      silently (renamed/removed route -- stale docs, not a real endpoint).
    - a live route with no curated entry lands in a catch-all "Undocumented"
      category instead of vanishing, so nothing actually served is hidden.
    """
    live = set()
    for rule in url_map.iter_rules():
        if rule.endpoint in ("static", "api_meta_routes", "api_docs_page", "api_console_page"):
            continue
        methods = frozenset(m for m in rule.methods if m not in ("HEAD", "OPTIONS"))
        if not methods:
            continue
        live.add((rule.rule, methods))

    matched = set()
    categories = []
    for cat in CATEGORIES:
        routes = []
        for entry in ROUTES.get(cat["id"], []):
            key = (entry["path"], frozenset(entry["methods"]))
            if key not in live:
                continue  # stale curated entry -- route no longer registered as described
            matched.add(key)
            routes.append(entry)
        categories.append({**cat, "routes": routes})

    leftover = sorted(live - matched)
    if leftover:
        categories.append({
            "id": "other", "title": "Undocumented", "routes": [
                {"methods": sorted(methods), "path": path, "desc": "Not documented yet."}
                for path, methods in leftover
            ],
            "desc": "Routes that exist in the app but don't have a curated description here yet.",
        })
    return categories
