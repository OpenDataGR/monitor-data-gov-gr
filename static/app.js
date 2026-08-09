// ── CSRF ─────────────────────────────────────────────────────────────────────
// Flask-WTF requires an X-CSRFToken header on every POST/PUT/PATCH/DELETE.
// Patching fetch here once means the many existing fetch() call sites below
// don't each need to remember to attach it. webauthn.js carries an identical
// guarded patch (it's a standalone, dependency-free file also loaded on its
// own by login.html) -- the __csrfFetchPatched guard means whichever of the
// two loads first on a page that has both (index.html) is the one that wins.
if (!window.__csrfFetchPatched) {
  window.__csrfFetchPatched = true;
  const token = document.querySelector('meta[name="csrf-token"]')?.content;
  const loginUrl = document.querySelector('meta[name="login-url"]')?.content;
  if (token) {
    const origFetch = window.fetch;
    window.fetch = function (input, init) {
      init = init || {};
      const method = (init.method || 'GET').toUpperCase();
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const headers = new Headers(init.headers || {});
        headers.set('X-CSRFToken', token);
        init = { ...init, headers };
      }
      return origFetch(input, init).then(resp => {
        // Idle-session expiry (server-side, after 60 min) surfaces as a 401
        // on whichever request happens to run next -- redirect once instead
        // of leaving every open tab's periodic polling silently failing
        // until a manual refresh. loginUrl is only rendered on authenticated
        // pages, so this never fires on the login page itself.
        if (loginUrl && resp.status === 401 && !window.__sessionExpiredRedirecting) {
          window.__sessionExpiredRedirecting = true;
          location.href = loginUrl + '?next=' + encodeURIComponent(location.pathname + location.search);
        }
        return resp;
      });
    };
  }
}

// ── Overlay stacking ─────────────────────────────────────────────────────────
// Modals and offcanvases in this app can legitimately open each other in
// either direction (e.g. the user panel opens the org panel via an org
// badge, but the org panel can also open the user panel via a member's edit
// button) -- a fixed z-index per element only ever gets one of those two
// directions right, since whichever has the lower static value always ends
// up behind the other regardless of open order. Instead, bump whichever one
// is shown *most recently* (and its backdrop) above everything already open,
// so the last thing you opened is always the one on top and interactive.
// Delegated on document since show.bs.modal/show.bs.offcanvas bubble from
// whichever element was just shown -- covers every current and future
// modal/offcanvas without per-element z-index tuning.
let _topOverlayZ = 1055;
// Maps an overlay element to its own backdrop -- needed because callers also
// invoke this directly (not just via the show.bs.* events below) to re-front
// a panel that's already open and just being reused for new content (e.g.
// clicking a related dataset, or a dataset link from inside the org panel).
// Bootstrap's .show() is a no-op there (no fresh backdrop gets inserted), so
// "grab whichever backdrop is last in the DOM" would grab someone else's --
// remembering each element's actual backdrop keeps the pairing correct.
const _overlayBackdrops = new WeakMap();
function _bringOverlayToFront(el) {
  _topOverlayZ += 20;
  const z = _topOverlayZ;
  el.style.zIndex = z;
  // The backdrop is a sibling Bootstrap inserts into <body> right as it
  // shows this element -- not present yet on this same event tick, so grab
  // it on the next frame instead of guessing an id/selector for it.
  requestAnimationFrame(() => {
    let backdrop = _overlayBackdrops.get(el);
    if (!backdrop || !backdrop.isConnected) {
      const backdrops = document.querySelectorAll('.modal-backdrop, .offcanvas-backdrop');
      backdrop = backdrops[backdrops.length - 1];
      if (backdrop) _overlayBackdrops.set(el, backdrop);
    }
    if (backdrop) backdrop.style.zIndex = z - 1;
  });
}
document.addEventListener('show.bs.modal', e => _bringOverlayToFront(e.target));
document.addEventListener('show.bs.offcanvas', e => _bringOverlayToFront(e.target));

// ── i18n ─────────────────────────────────────────────────────────────────────
const TRANSLATIONS = {
  en: {
    'page.title': 'data.gov.gr Monitor',
    'nav.last_check': 'Last check:',
    'nav.check_now': 'Check Now',
    'nav.admin_panel': 'Admin Panel',
    'sidebar.toggle': 'Collapse sidebar',
    'token.missing': 'API token not configured.',
    'token.desc': 'Dataset queries and quality checks need one. Set DATAGOVGR_TOKEN in your environment or',
    'token.request': 'request a token here',
    'stat.total_datasets': 'Total Datasets',
    'stat.data_services': 'Data Services',
    'stat.resources': 'Resources',
    'stat.organizations': 'Organizations',
    'stat.uptime': 'Portal Uptime (24h)',
    'tab.overview': 'Overview',
    'contacts.title': 'Contacts',
    'contacts.view_all': 'All',
    'contacts.view_by_org': 'By Organization',
    'contacts.scope_portal': 'Portal Members',
    'contacts.scope_file': 'File Contacts',
    'contacts.col_portal': 'Portal account',
    'contacts.no_portal_account': 'No portal account',
    'contacts.reload': 'Reload',
    'contacts.export_modal_title': 'Export Contacts',
    'contacts.export_modal_hint': 'Choose which columns to include.',
    'contacts.export_select_all': 'All',
    'contacts.export_select_none': 'None',
    'contacts.export_none_selected': 'Select at least one column.',
    'contacts.export_download': 'Download',
    'contacts.export_anonymize': 'Anonymize personal data',
    'contacts.export_anonymize_hint': 'Masks First Name, Last Name, Email, Tel and Mobile — keeps the first and last character (e.g. "Kostas" → "K____s").',
    'contacts.export_col_org': 'Organization',
    'contacts.export_col_first_name': 'First Name',
    'contacts.export_col_last_name': 'Last Name',
    'contacts.export_col_position': 'Position',
    'contacts.export_col_username': 'Portal Username',
    'contacts.export_col_email': 'Email',
    'contacts.export_col_role': 'Role',
    'contacts.export_col_state': 'State',
    'contacts.export_col_tel': 'Tel',
    'contacts.export_col_mobile': 'Mobile',
    'contacts.export_col_created_at': 'Registered On',
    'contacts.export_filter_label': 'Exporting',
    'contacts.export_filter_none': 'all portal members',
    'contacts.col_username': 'Username',
    'contacts.col_role': 'Role',
    'contacts.col_type': 'Type',
    'contacts.col_state': 'State',
    'contacts.role_admin': 'Admin',
    'contacts.role_editor': 'Editor',
    'contacts.role_member': 'Member',
    'contacts.role_user': 'User',
    'contacts.role_sysadmin': 'Sysadmin',
    'contacts.total': 'Total',
    'contacts.loading_portal': 'Loading portal members…',
    'contacts.progress_unit_orgs': 'organizations',
    'contacts.no_token': 'No API token configured.',
    'contacts.all_types': 'All Types',
    'contacts.all_sources': 'All sources',
    'contacts.source_db': 'File',
    'contacts.source_portal': 'Portal',
    'contacts.search_ph': 'Search contacts…',
    'contacts.add_contact': 'Add contact',
    'contacts.import': 'Import Excel',
    'contacts.col_org': 'Organization',
    'contacts.col_name': 'Name',
    'contacts.col_tel': 'Tel / Mobile',
    'contacts.tab_hint': 'Open this tab to load contacts.',
    'contacts.no_results': 'No contacts match the current filter.',
    'contacts.unmatched_heading': 'Contacts without portal account',
    'contacts.has_portal_account': 'Has portal account',
    'contacts.has_contact_file': 'Has contact file entry',
    'contacts.no_contact_file': 'No contact file entry',
    'contacts.filter_group_file': 'File Info',
    'contacts.edit_contact_info': 'Edit contact info',
    'contacts.delete_contact_record': 'Delete contact record',
    'contacts.email_from_file': 'Email from contacts file: {email}',
    'contacts.view_contacts': 'View contacts',
    'contacts.importing': 'Importing…',
    'contacts.import_result': 'Imported {n} contact(s), skipped {skipped}.',
    'contacts.import_errors_prefix': '\nErrors:\n',
    'contacts.import_fixed_org_codes': ' (fixed {n} org code(s))',
    'contacts.import_fixed_contact_types': ' (fixed {n} contact type(s))',
    'contacts.import_fixed_tel_mobile': ' (fixed {n} tel→mobile)',
    'contacts.import_failed': 'Import failed: {msg}',
    'contacts.portal_loading': 'Loading portal users…',
    'contacts.all_orgs':    'All organizations',
    'contacts.state_all':   'All states',
    'contacts.state_active':  'Active',
    'contacts.state_pending': 'Pending',
    'contacts.state_deleted': 'Deleted',
    'contacts.filter_group_role': 'Role',
    'contacts.filter_group_state': 'State',
    'traffic.today_title': "Today's Traffic",
    'traffic.today': 'Today',
    'traffic.visits': 'Visits',
    'traffic.unique': 'Unique Visitors',
    'traffic.pageviews': 'Pageviews',
    'traffic.downloads': 'Downloads',
    'traffic.api_calls': 'API Calls',
    'traffic.visits_chart': 'Visits Over Time',
    'traffic.top_datasets': 'Top Dataset Pages',
    'traffic.top_queries': 'Top Search Queries',
    'traffic.top_api': 'Top API Calls',
    'traffic.top_downloads': 'Top Downloads',
    'traffic.period': 'Period:',
    'traffic.last7': 'Last 7 days',
    'traffic.last30': 'Last 30 days',
    'traffic.last90': 'Last 90 days',
    'traffic.from': 'From',
    'traffic.to': 'To',
    'traffic.apply': 'Apply',
    'traffic.range_required': 'Pick both a from and to date.',
    'traffic.range_invalid': 'The from date must be before the to date.',
    'health.endpoint_status': 'Endpoint Status',
    'health.uptime_24h': 'Uptime Last 24h',
    'live.title': 'Live Visitors',
    'live.active_now': 'active in the last 30 min',
    'live.none': 'No recent visits.',
    'live.just_now': 'just now',
    'live.min_ago': ' min ago',
    'live.unknown': 'Unknown',
    'live.col_time': 'Time',
    'live.col_location': 'Location / Last Page',
    'live.col_device': 'Device',
    'live.col_browser': 'Browser',
    'live.col_actions': 'Actions',
    'health.response_history': 'Response Time History',
    'health.recent_checks': 'Recent Checks',
    'health.6h': '6 h',
    'health.24h': '24 h',
    'health.72h': '72 h',
    'health.7d': '7 days',
    'stats.dataset_count': 'Dataset Count Over Time',
    'stats.latest_snapshot': 'Latest Snapshot',
    'quality.dcat_title': 'DCAT-AP Compliance Check (SHACL)',
    'quality.dcat_run': 'Run DCAT-AP Check',
    'quality.dcat_desc': "Validates every dataset's real DCAT-AP RDF metadata against the EU's baseline DCAT-AP structural shapes and MDR controlled-vocabulary shapes (vendored from SEMICeu's dcat-ap_shacl repo) — the same rules data.europa.eu itself checks harvested metadata against.",
    'quality.dcat_hint': 'Click Run DCAT-AP Check to validate every dataset on the portal. This covers the full catalog (tens of thousands of datasets) and can take a long time on the first run.',
    'quality.dcat_running': 'Validating every dataset on the portal against the official DCAT-AP + MDR vocabulary SHACL shapes… a full first run can take hours. Feel free to switch tabs — it keeps running in the background.',
    'quality.dcat_still_running': 'Still running after a long wait — a full first run over the whole catalog can take hours. It will keep going in the background; check back later.',
    'quality.dcat_rerun_title': 'Run DCAT-AP Check Again?',
    'quality.dcat_rerun_line2': "Datasets are checked incrementally, so a new run only re-validates what actually changed on the portal — there's usually no need to run it again unless you know something major has changed on data.gov.gr. A full re-check of the whole catalog can take a long time.",
    'quality.dcat_structural_issue': 'Structural issue',
    'quality.dcat_vocabulary_issue': 'Vocabulary issue',
    'quality.dcat_col_structural': 'Structural',
    'quality.dcat_col_vocabulary': 'Vocabulary',
    'quality.dcat_all_clean': 'No issues found across all checked datasets.',
    'quality.hvd_title': 'HVD Compliance Check (SHACL)',
    'quality.hvd_run': 'Run HVD Check',
    'quality.hvd_desc': "Validates every HVD-tagged dataset's real DCAT-AP RDF metadata against the EU's official DCAT-AP-HVD SHACL shapes (Regulation (EU) 2023/138) — not just whether it carries the hvd_category tag.",
    'quality.hvd_hint': 'Click Run HVD Check to validate all HVD-tagged datasets. This checks every dataset currently tagged as an EU High-Value Dataset and can take several minutes.',
    'quality.hvd_running': 'Validating HVD-tagged datasets against the official SHACL shapes… this can take several minutes. Feel free to switch tabs — it keeps running in the background.',
    'quality.hvd_still_running': 'Still running after a long wait — it may still finish in the background. Try clicking Run HVD Check again in a bit to check the latest status.',
    'quality.hvd_last_run': 'Last run',
    'quality.hvd_rerun_title': 'Run HVD Check Again?',
    'quality.hvd_rerun_line1': 'The results shown are already up to date.',
    'quality.hvd_rerun_line2': 'Datasets are checked incrementally, so a new run only re-validates what actually changed on the portal — there\'s usually no need to run it again unless you know something major has changed on data.gov.gr.',
    'quality.hvd_rerun_cancel': 'Cancel',
    'quality.hvd_rerun_confirm_btn': 'Run Anyway',
    'quality.hvd_checked': 'Checked',
    'quality.hvd_compliant': 'Compliant',
    'quality.hvd_non_conforming': 'Non-conforming',
    'quality.hvd_legal_issue': 'Legal citation not linked',
    'quality.hvd_no_api': 'No API access',
    'quality.hvd_license_missing': 'License missing',
    'quality.hvd_license_non_open': 'License not confirmed open',
    'quality.hvd_license_open': 'Open license',
    'quality.hvd_failed_note': '{n} dataset(s) could not be fetched and were skipped.',
    'quality.hvd_cache_note': '{n} of {total} datasets were unchanged since the last check and served from cache.',
    'quality.hvd_all_clean': 'No issues found across all checked HVD-tagged datasets.',
    'quality.hvd_cancel': 'Cancel',
    'quality.hvd_cancelling': 'Cancelling…',
    'quality.hvd_partial_note': 'Cancelled early — results reflect only the {n} of {total} datasets checked before cancelling.',
    'quality.hvd_details': 'Issues found',
    'quality.hvd_col_violations': 'Violations',
    'quality.hvd_col_legal': 'Legal citation',
    'quality.hvd_col_api': 'API access',
    'quality.hvd_col_license': 'License',
    'quality.hvd_unknown_org': 'Unknown organization',
    'quality.hvd_results_search_placeholder': 'Search results by title…',
    'quality.hvd_publisher_mismatch': 'Publisher looks wrong',
    'quality.hvd_publisher_mismatch_hint': 'The dataset\'s publisher name doesn\'t match its organization ({org}) — likely a contact person\'s name entered by mistake instead of the organization.',
    'quality.hvd_col_publisher': 'Publisher',
    'quality.hvd_filter_no_match': 'No datasets match the selected filters.',
    'quality.hvd_filter_group_compliance': 'Compliance',
    'quality.hvd_filter_group_metadata': 'Metadata',
    'quality.view_flat': 'All',
    'quality.view_grouped': 'By Organization',
    'quality.col_org': 'Organization',
    'quality.tab_hvd': 'HVD',
    'quality.tab_dcat': 'DCAT-AP',
    'quality.tab_geodcat': 'GeoDCAT-AP',
    'quality.tab_mqa': 'MQA Score',
    'quality.geodcat_title': 'GeoDCAT-AP Compliance Check (SHACL)',
    'quality.geodcat_run': 'Run GeoDCAT-AP Check',
    'quality.geodcat_desc': "Validates every geospatial-tagged dataset's real DCAT-AP RDF metadata against the EU's official GeoDCAT-AP geospatial extension SHACL shapes (SEMICeu GeoDCAT-AP 3.1.0) — covers the ~12,500 datasets the portal itself classifies as geospatial (GIS layers, WMS/WFS services, etc).",
    'quality.geodcat_hint': 'Click Run GeoDCAT-AP Check to validate every geospatial-tagged dataset on the portal. This can take a long time on the first run.',
    'quality.geodcat_running': 'Validating every geospatial-tagged dataset against the official GeoDCAT-AP SHACL shapes… a full first run can take a long time. Feel free to switch tabs — it keeps running in the background.',
    'quality.geodcat_rerun_title': 'Run GeoDCAT-AP Check Again?',
    'quality.geodcat_all_clean': 'No issues found across all checked geospatial datasets.',
    'quality.mqa_title': 'EU Metadata Quality Assessment (MQA)',
    'quality.mqa_desc': "data.europa.eu continuously computes this FAIR+ metadata quality score for data.gov.gr's harvested catalogue — findability, accessibility, interoperability, reusability and contextuality. This is fetched from their public API and cached here, not recomputed locally.",
    'quality.mqa_hint': "The MQA score hasn't been fetched yet. Click Refresh Now to pull the latest score from data.europa.eu.",
    'quality.mqa_refresh': 'Refresh Now',
    'quality.mqa_refreshing': 'Refreshing…',
    'quality.mqa_findability': 'Findability',
    'quality.mqa_accessibility': 'Accessibility',
    'quality.mqa_interoperability': 'Interoperability',
    'quality.mqa_reusability': 'Reusability',
    'quality.mqa_contextuality': 'Contextuality',
    'orgs.title': 'Organizations & Dataset Counts',
    'orgs.portal': 'data.gov.gr',
    'orgs.all': 'All Public Sector',
    'orgs.search': 'Search organizations…',
    'orgs.search_all': 'Search organizations…',
    'orgs.refresh': 'Refresh',
    'orgs.col_num': '#',
    'orgs.col_org': 'Organization',
    'orgs.col_datasets': 'Datasets',
    'orgs.col_updated': 'Last Updated',
    'orgs.col_contacts': 'Contacts',
    'orgs.col_status': 'Status',
    'orgs.as': 'as',
    'orgs.on_portal': 'On portal',
    'orgs.not_registered': 'Not registered',
    'orgs.loading': 'Loading…',
    'orgs.loading_public': 'Loading public sector organizations…',
    'orgs.none_found': 'No organizations found.',
    'orgs.cant_load': 'Could not load public organizations list.',
    'orgs.total_public': 'total public sector organizations',
    'orgs.fetched': 'Fetched',
    'orgs.server_error': 'Server error',
    'orgs.server_error_hint': '— check the server logs.',
    'org_detail.org': 'Organization',
    'org_detail.datasets': 'datasets published',
    'org_detail.member_since': 'Member since',
    'org_detail.view': 'View on data.gov.gr',
    'comms.title': 'Communications Log',
    'comms.view_all': 'All',
    'comms.view_by_org': 'By Organization',
    'comms.view_cases': 'Cases',
    'comms.view_timeline': 'Timeline',
    'comms.initial_contact': 'Initial Contact',
    'comms.intermediate_contact': 'Intermediate Contact',
    'comms.positive_response': 'Positive Response',
    'comms.negative_response': 'Negative Response',
    'comms.no_response': 'No Response',
    'comms.medium_telephone': 'Telephone',
    'comms.medium_email': 'Email',
    'comms.medium_in_person': 'In Person',
    'comms.medium_other': 'Other',
    'comms.direction_inbound': 'Inbound',
    'comms.direction_outbound': 'Outbound',
    'comms.direction_unset': 'Direction not set (click to cycle)',
    'comms.direction_unset_short': 'Not set',
    'comms.case_open': 'Open',
    'comms.case_closed': 'Closed',
    'comms.open_cases': 'Open Cases',
    'comms.closed_cases': 'Closed Cases',
    'comms.stale_cases': 'Needs Follow-up',
    'comms.not_stale_cases': 'On Track',
    'comms.filter_group_case': 'Case',
    'comms.filter_group_stale': 'Follow-up',
    'comms.filter_group_status': 'Status',
    'comms.case_stale': 'No Response',
    'comms.case_stale_hint': 'The last logged attempt got no response, or the case has had no activity for 14+ days.',
    'comms.case_opened': 'Opened',
    'comms.case_closed_on': 'Closed',
    'comms.case_add_entry': 'Add entry to this case',
    'comms.case_add_followup': 'Add Follow-up',
    'comms.case_close': 'Close Case',
    'comms.case_reopen': 'Reopen Case',
    'comms.case_col': 'Case',
    'comms.search': 'Search communications…',
    'comms.download_excel_title': 'Download current view as Excel',
    'comms.add_comm_for_org': 'Add new communication for this organization',
    'comms.add_contact_for_org': 'Add contact for this organization',
    'comms.add': 'Add',
    'comms.none': 'No communications recorded yet — click Add to start.',
    'comms.col_date': 'Date',
    'comms.col_org': 'Organization',
    'comms.col_subject': 'Subject',
    'comms.col_status': 'Status',
    'comms.col_medium': 'Medium',
    'comms.col_notes': 'Notes',
    'comms.total': 'Total',
    'comms.entry': 'entry',
    'comms.entries': 'entries',
    'comms.today': 'Today',
    'comms.yesterday': 'Yesterday',
    'comm_modal.add_title': 'Add Communication',
    'comm_modal.edit_title': 'Edit Communication',
    'comm_modal.date': 'Date',
    'comm_modal.deadline': 'Deadline',
    'comm_modal.deadline_hint': 'If no follow-up is logged by this date, the case is treated as No Response.',
    'comm_modal.org': 'Organization',
    'comm_modal.org_ph': 'Search by organization or contact name…',
    'comm_modal.org_locked': '(fixed to this case\'s organization)',
    'comm_modal.contact': 'Contact Person',
    'comm_modal.contact_add_ph': '— select a contact to add —',
    'comm_modal.subject': 'Subject',
    'comm_modal.subject_ph': 'Dataset requested or topic',
    'comm_modal.status': 'Status',
    'comm_modal.medium': 'Medium',
    'comm_modal.medium_ph': '— select medium —',
    'comm_modal.direction': 'Direction',
    'comm_modal.status_closes_case': 'This will close the case.',
    'comm_modal.notes': 'Notes',
    'comm_modal.notes_ph': 'Any additional context…',
    'comm_modal.cancel': 'Cancel',
    'comm_modal.save': 'Save',
    'comm_modal.required': 'Date, organization and subject are required.',
    'comm_modal.delete_confirm': 'Delete this communication record?',
    'comm_modal.delete_failed': 'Delete failed:',
    'inbound.pending_title': 'Pending Approval',
    'inbound.reason_no_contact': 'Unknown sender',
    'inbound.reason_no_case': 'No open case',
    'inbound.reason_multiple_cases': 'Multiple open cases',
    'inbound.reason_multiple_contacts': 'Multiple possible contacts',
    'inbound.reason_comm_deleted': 'Communication was deleted',
    'inbound.reason_processing_error': 'Could not be processed automatically',
    'inbound.toast_title': 'New email needs review',
    'inbound.toast_multi': '{n} new emails need review',
    'inbound.toast_title_comm': 'New communication logged',
    'inbound.toast_multi_comms': '{n} new communications logged',
    'inbound.attach': 'Attach',
    'inbound.dismiss': 'Dismiss',
    'inbound.attach_title': 'Attach Email to a Case',
    'inbound.from': 'From',
    'inbound.subject_label': 'Subject',
    'inbound.case': 'Case',
    'inbound.new_case': '— Open new case —',
    'inbound.candidates_label': 'Which contact is this?',
    'inbound.use_this_contact': 'Use this contact',
    'inbound.detected_hint': 'Detected in this email:',
    'inbound.register_contact': 'Also register this sender as a contact',
    'inbound.skip_duplicate_contact': "Don't create a duplicate",
    'inbound.attach_required': 'Organization and subject are required to open a new case.',
    'inbound.dismiss_confirm': 'Dismiss this email? It will not be attached to any case.',
    'inbound.auto_badge': 'Auto',
    'inbound.auto_badge_title': 'Auto-captured from an inbound email',
    'contacts.panel_title': 'Contacts',
    'contacts.org_panel_no_access': 'You don\'t have access to Contacts, so member details can\'t be shown here.',
    'contacts.add': 'Add Contact',
    'contacts.none': 'No contacts yet — click Add to start.',
    'contacts.modal_add': 'Add Contact',
    'contacts.modal_edit': 'Edit Contact',
    'contacts.first_name': 'First Name',
    'contacts.last_name': 'Last Name',
    'contacts.position': 'Position',
    'contacts.type': 'Contact Type',
    'contacts.type_org_administrator': 'Org Administrator',
    'contacts.type_org_member': 'Org Member',
    'contacts.type_data_officer': 'Data Governance Officer',
    'contacts.type_data_steward': 'Data Steward',
    'contacts.type_org_editor': 'Org Editor',
    'contacts.type_contact_point': 'Org Central Administrator 🎩',
    'contacts.type_multiselect_hint': 'Hold Ctrl (Windows) or ⌘ (Mac) and click to select or deselect multiple roles.',
    'contacts.email': 'Email',
    'contacts.tel': 'Tel',
    'contacts.mobile': 'Mobile',
    'contacts.err_email': 'Invalid email address.',
    'contacts.err_phone': 'Invalid phone number.',
    'contacts.cancel': 'Cancel',
    'contacts.save': 'Save',
    'contacts.delete_confirm': 'Delete this contact?',
    'contacts.delete_confirm_linked': 'This contact is linked to {n} Communication(s) -- deleting it will remove that credit (the Communications themselves are kept). Delete anyway?',
    'contacts.delete_failed': 'Delete failed:',
    'health.col_endpoint': 'Endpoint',
    'health.col_status': 'Status',
    'health.col_uptime': 'Uptime',
    'health.col_avg_response': 'Avg Response',
    'health.col_checks': 'Checks',
    'health.col_time': 'Time',
    'health.col_http': 'HTTP',
    'health.col_response': 'Response',
    'health.no_checks': 'No checks recorded yet — click Check Now.',
    'health.status_up': 'UP',
    'health.status_down': 'DOWN',
    'health.critical': 'critical',
    'health.as_of': 'as of',
    'stats.col_datasets': 'Datasets',
    'stats.col_orgs': 'Organizations',
    'stats.col_resources': 'Resources',
    'stats.col_services': 'Services',
    'stats.col_updated': 'Updated',
    'stats.no_snapshot': 'No snapshot yet.',
    'stats.accumulating': 'Data accumulates over time — check back later.',
    'stats.geo_map_title': 'Geospatial Dataset Locations',
    'stats.geo_map_loading': 'Locating organizations\' geospatial datasets…',
    'stats.geo_map_none': 'No geospatial dataset locations available.',
    'stats.geo_map_orgs': 'organizations',
    'stats.geo_map_datasets': 'datasets',
    'stats.geo_map_click_hint': 'Click for organization details',
    'temporal.coming_soon': 'Coming soon.',
    'traffic.col_dataset': 'Dataset',
    'traffic.col_visits': 'Visits',
    'traffic.col_query': 'Query',
    'traffic.col_searches': 'Searches',
    'traffic.col_endpoint': 'Endpoint',
    'traffic.col_calls': 'Calls',
    'traffic.col_file': 'File',
    'traffic.col_downloads': 'Downloads',
    'traffic.no_dataset': 'No dataset page data available.',
    'traffic.no_search': 'No search query data available.',
    'traffic.no_api': 'No API tracking data found. API calls may not be tracked by Matomo.',
    'traffic.no_downloads': 'No download data available.',
    'traffic.failed': 'Failed to load',
    'traffic.no_api2': 'No API tracking data found.',
    'quality.col_dataset': 'Dataset',
    'catalog.title': 'Dataset Catalog',
    'catalog.search_ph': 'Search datasets…',
    'catalog.hint': 'Search for datasets by title or keyword, or leave blank to browse the most recently updated.',
    'catalog.filter_since': 'Uploaded since',
    'catalog.filter_hvd_all': 'All',
    'catalog.filter_hvd_only': 'HVD',
    'catalog.filter_hvd_non': 'Non-HVD',
    'catalog.hvd_full': 'High-Value Dataset',
    'catalog.filter_harvest_all': 'Total',
    'catalog.filter_harvest_harvested': 'Harvested',
    'catalog.filter_harvest_manual': 'Manual',
    'catalog.harvested_tooltip': 'Imported automatically by a harvester, not created directly on the portal',
    'catalog.hvd_tooltip': 'High-Value Dataset — Commission Implementing Regulation (EU) 2023/138',
    'catalog.filter_geo_all': 'Total',
    'catalog.filter_geo_only': 'Geospatial',
    'catalog.filter_geo_non': 'Non-geospatial',
    'catalog.geo_full': 'Geospatial',
    'catalog.geo_tooltip': 'Spatial data — GIS layers, maps, WMS/WFS services',
    'catalog.filter_group_type': 'Type',
    'catalog.filter_group_hvd': 'HVD',
    'catalog.filter_group_harvest': 'Harvested',
    'catalog.filter_group_geo': 'Geospatial',
    'filters.clear': 'Clear filters',
    'catalog.results_for': 'results for',
    'catalog.total_datasets': 'datasets total',
    'catalog.none': 'No datasets match your search.',
    'catalog.end_of_results': '— End of results —',
    'catalog.col_title': 'Title',
    'catalog.col_org': 'Organization',
    'catalog.col_resources': 'Resources',
    'catalog.resources_not_sortable': 'Not sortable',
    'catalog.col_modified': 'Last Modified',
    'catalog.panel_title': 'Dataset',
    'catalog.created': 'Created',
    'catalog.license': 'License',
    'catalog.tags': 'Tags',
    'catalog.resources': 'Resources',
    'catalog.no_resources': 'No resources.',
    'catalog.download': 'Download',
    'catalog.view_on_portal': 'View on data.gov.gr',
    'catalog.formats_title': 'Format Distribution',
    'catalog.formats_none': 'No format data available.',
    'catalog.formats_other': 'Other',
    'catalog.stats_views_tooltip': 'People who viewed this dataset\'s page, last 30 days',
    'catalog.stats_downloads_tooltip': 'Downloads, last 30 days',
    'catalog.ckan_views_tooltip': 'Dataset page views recorded by CKAN, all-time',
    'catalog.ckan_downloads_tooltip': 'Resource page views recorded by CKAN, all-time',
    'catalog.source_ckan': 'CKAN',
    'catalog.source_matomo': 'Matomo',
    'catalog.loading_matomo': 'Loading Matomo stats…',
    'catalog.view_analytics': 'View detailed analytics',
    'catalog.analytics_title': 'Dataset Analytics',
    'catalog.analytics_over_time': 'Visits over time (last 30 days)',
    'catalog.analytics_countries': 'Visitor countries',
    'catalog.analytics_referrers': 'How visitors found this dataset',
    'catalog.analytics_downloads': 'Downloads by resource',
    'catalog.analytics_no_data': 'Not enough data yet.',
    'catalog.analytics_visits': 'Visits',
    'catalog.analytics_unique_visitors': 'Unique visitors',
    'catalog.filter_org_all': 'All organizations',
    'catalog.filter_format_all': 'All formats',
    'catalog.related': 'Related Datasets',
    'catalog.related_none': 'No related datasets found.',
    'catalog.filter_type_all': 'All types',
    'catalog.type_dataset': 'Dataset',
    'catalog.type_data_service': 'Data Service',
    'catalog.type_decision': 'Decision',
    'catalog.endpoints': 'Endpoints',
    'catalog.no_endpoints': 'No endpoint URLs listed.',
    'catalog.open_endpoint': 'Open endpoint',
    'name.modal_title': 'Edit Name',
    'name.label': 'Name',
    'name.success': 'Name updated successfully.',
    'name.save': 'Save',
    'name.err_required': 'Name is required.',
    'name.err_generic': 'Failed to update name.',
    'pw.modal_title': 'Change Password',
    'pw.current': 'Current password',
    'pw.new': 'New password',
    'pw.new_hint': 'At least 8 characters.',
    'pw.confirm': 'Confirm new password',
    'pw.success': 'Password changed successfully.',
    'pw.save': 'Change Password',
    'pw.err_length': 'New password must be at least 8 characters.',
    'pw.err_mismatch': 'New passwords do not match.',
    'pw.err_generic': 'Failed to change password.',
    'passkey.modal_title': 'Manage Passkeys',
    'passkey.modal_hint': "A passkey lets you sign in with Touch ID, Windows Hello, or a security key instead of your password.",
    'passkey.nickname_label': 'Name this passkey',
    'passkey.nickname_placeholder': 'e.g. My laptop',
    'passkey.add': 'Add a passkey',
    'passkey.adding': 'Waiting for passkey…',
    'passkey.unsupported': "This browser doesn't support passkeys.",
    'passkey.none': "You haven't added any passkeys yet.",
    'passkey.added': 'Added',
    'passkey.last_used': 'last used',
    'passkey.delete_confirm': 'Remove this passkey? You can add it again later if needed.',
    'footer.changelog': 'Changelog',
    'footer.changelog_title': 'Changelog',
    'footer.changelog_none': 'No changelog entries available.',
    'loading': 'Loading…',
    'error': 'Error:',
    'common.edit': 'Edit',
    'common.delete': 'Delete',
    'common.add': 'Add',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.clear': 'Clear',
    'common.view': 'View',
    'common.remove': 'Remove',
    'common.export_excel': 'Export Excel',
    'common.expand_all': 'Expand all',
    'common.collapse_all': 'Collapse all',
    'common.confirm_delete_title': 'Confirm Delete',
    'common.save_failed': 'Save failed.',
    'common.network_error': 'Network error: {msg}',
    'common.saving': 'Saving…',
    'contacts.select_org_required': 'Please select at least one organization.',
    'userPanel.no_datasets': 'No datasets found.',
    'userPanel.no_activity': 'No activity found.',
    'userPanel.no_recent_datasets': 'No recent datasets found.',
    'userPanel.no_members': 'No members found.',
    'contacts.organizations': 'Organizations',
    'contacts.add_org_placeholder': 'Add organization…',
    'contacts.fill_from_existing': 'Fill from existing',
    'contacts.ignore': 'Ignore',
    'contacts.email_duplicate_found': 'A contact with this email already exists: {who}',
    'contacts.row_mismatch': 'Portal and file info disagree for this person',
    'userPanel.email_file': 'Email (file)',
    'userPanel.org_file': 'Organization (file)',
    'userPanel.org_portal': 'Organization (portal)',
    'userPanel.org_mismatch': 'The contact file and the portal account disagree on this person\'s organization',
    'userPanel.file_contact_only': 'No linked portal account',
    'userPanel.info': 'Info',
    'userPanel.portal': 'Portal',
    'userPanel.file': 'File',
    'userPanel.name_mismatch': 'The contact file and the portal account disagree on this person\'s name',
    'userPanel.email_mismatch': 'The contact file and the portal account disagree on this person\'s email',
    'userPanel.role_mismatch': 'The contact file and the portal account disagree on this person\'s role',
    'userPanel.add_contact_record': 'Add contact record',
    'userPanel.registered': 'Registered',
    'userPanel.last_active': 'Last active',
    'userPanel.datasets': 'Datasets',
    'userPanel.edits': 'Edits',
    'userPanel.recent_activity': 'Recent Activity',
    'userPanel.about': 'About',
    'userPanel.no_organization': 'No organization',
    'userPanel.failed_load_user': 'Failed to load user: {msg}',
    'userPanel.failed_load_datasets': 'Failed to load datasets: {msg}',
    'userPanel.failed_load_activity': 'Failed to load activity: {msg}',
    'userPanel.private': 'Private',
    'userPanel.resources_count': '{n} resources',
    'userPanel.act_new_package': 'Created dataset',
    'userPanel.act_changed_package': 'Updated dataset',
    'userPanel.act_deleted_package': 'Deleted dataset',
    'userPanel.act_new_resource': 'Added resource',
    'userPanel.act_changed_resource': 'Updated resource',
    'userPanel.act_deleted_resource': 'Deleted resource',
    'userPanel.act_new_user': 'Joined portal',
    'userPanel.act_changed_user': 'Updated profile',
    'date.never': '—',
    'date.just_now': 'just now',
    'date.m_ago': 'm ago',
    'date.h_ago': 'h ago',
    'date.yesterday': 'yesterday',
    'date.d_ago': 'd ago',
    'date.mo_ago': 'mo ago',
    'date.y_ago': 'y ago',
  },
  el: {
    'page.title': 'data.gov.gr Monitor',
    'nav.last_check': 'Τελευταίος έλεγχος:',
    'nav.check_now': 'Έλεγχος τώρα',
    'nav.admin_panel': 'Πίνακας Διαχείρισης',
    'sidebar.toggle': 'Σύμπτυξη μενού',
    'token.missing': 'Το API token δεν έχει ρυθμιστεί.',
    'token.desc': 'Τα ερωτήματα συνόλων δεδομένων και οι ποιοτικοί έλεγχοι το χρειάζονται. Ορίστε DATAGOVGR_TOKEN στο περιβάλλον σας ή',
    'token.request': 'ζητήστε token εδώ',
    'stat.total_datasets': 'Σύνολα Δεδομένων',
    'stat.data_services': 'Υπηρεσίες Δεδομένων',
    'stat.resources': 'Πόροι',
    'stat.organizations': 'Οργανισμοί',
    'stat.uptime': 'Διαθεσιμότητα Πύλης (24ω)',
    'tab.overview': 'Επισκόπηση',
    'contacts.title': 'Επαφές',
    'contacts.view_all': 'Όλα',
    'contacts.view_by_org': 'Ανά Οργανισμό',
    'contacts.scope_portal': 'Μέλη Πύλης',
    'contacts.scope_file': 'Επαφές Αρχείου',
    'contacts.col_portal': 'Λογαριασμός πύλης',
    'contacts.no_portal_account': 'Χωρίς λογαριασμό πύλης',
    'contacts.reload': 'Ανανέωση',
    'contacts.export_modal_title': 'Εξαγωγή Επαφών',
    'contacts.export_modal_hint': 'Επιλέξτε ποιες στήλες θα συμπεριληφθούν.',
    'contacts.export_select_all': 'Όλα',
    'contacts.export_select_none': 'Κανένα',
    'contacts.export_none_selected': 'Επιλέξτε τουλάχιστον μία στήλη.',
    'contacts.export_download': 'Λήψη',
    'contacts.export_anonymize': 'Ανωνυμοποίηση προσωπικών δεδομένων',
    'contacts.export_anonymize_hint': 'Αποκρύπτει Όνομα, Επώνυμο, Email, Τηλέφωνο και Κινητό — διατηρεί τον πρώτο και τελευταίο χαρακτήρα (π.χ. «Κώστας» → «Κ____ς»).',
    'contacts.export_col_org': 'Οργανισμός',
    'contacts.export_col_first_name': 'Όνομα',
    'contacts.export_col_last_name': 'Επώνυμο',
    'contacts.export_col_position': 'Θέση',
    'contacts.export_col_role': 'Ρόλος',
    'contacts.export_col_state': 'Κατάσταση',
    'contacts.export_col_username': 'Όνομα Χρήστη Πύλης',
    'contacts.export_col_email': 'Email',
    'contacts.export_col_tel': 'Τηλέφωνο',
    'contacts.export_col_mobile': 'Κινητό',
    'contacts.export_col_created_at': 'Ημερομηνία Εγγραφής',
    'contacts.export_filter_label': 'Εξαγωγή',
    'contacts.export_filter_none': 'όλων των μελών πύλης',
    'contacts.col_username': 'Όνομα Χρήστη',
    'contacts.col_role': 'Ρόλος',
    'contacts.col_type': 'Τύπος',
    'contacts.col_state': 'Κατάσταση',
    'contacts.role_admin': 'Διαχειριστής',
    'contacts.role_editor': 'Συντάκτης',
    'contacts.role_member': 'Μέλος',
    'contacts.role_user': 'Χρήστης',
    'contacts.role_sysadmin': 'Διαχειριστής Συστήματος',
    'contacts.total': 'Σύνολο',
    'contacts.loading_portal': 'Φόρτωση μελών πύλης…',
    'contacts.progress_unit_orgs': 'οργανισμοί',
    'contacts.no_token': 'Δεν έχει ρυθμιστεί API token.',
    'contacts.all_types': 'Όλοι οι τύποι',
    'contacts.all_sources': 'Όλες οι πηγές',
    'contacts.source_db': 'Αρχείο',
    'contacts.source_portal': 'Πύλη',
    'contacts.search_ph': 'Αναζήτηση επαφών…',
    'contacts.add_contact': 'Προσθήκη επαφής',
    'contacts.import': 'Εισαγωγή Excel',
    'contacts.col_org': 'Οργανισμός',
    'contacts.col_name': 'Όνομα',
    'contacts.col_tel': 'Τηλ / Κινητό',
    'contacts.tab_hint': 'Ανοίξτε αυτή την καρτέλα για φόρτωση επαφών.',
    'contacts.no_results': 'Δεν βρέθηκαν επαφές με τα τρέχοντα κριτήρια.',
    'contacts.unmatched_heading': 'Επαφές χωρίς λογαριασμό πύλης',
    'contacts.has_portal_account': 'Έχει λογαριασμό πύλης',
    'contacts.has_contact_file': 'Έχει εγγραφή στο αρχείο επαφών',
    'contacts.no_contact_file': 'Χωρίς εγγραφή στο αρχείο επαφών',
    'contacts.filter_group_file': 'Στοιχεία Αρχείου',
    'contacts.edit_contact_info': 'Επεξεργασία στοιχείων επαφής',
    'contacts.delete_contact_record': 'Διαγραφή εγγραφής επαφής',
    'contacts.email_from_file': 'Email από το αρχείο επαφών: {email}',
    'contacts.view_contacts': 'Προβολή επαφών',
    'contacts.importing': 'Εισαγωγή…',
    'contacts.import_result': 'Εισήχθησαν {n} επαφή(-ές), παραλείφθηκαν {skipped}.',
    'contacts.import_errors_prefix': '\nΣφάλματα:\n',
    'contacts.import_fixed_org_codes': ' (διορθώθηκαν {n} κωδικός(-οί) οργανισμού)',
    'contacts.import_fixed_contact_types': ' (διορθώθηκαν {n} τύπος(-οι) επαφής)',
    'contacts.import_fixed_tel_mobile': ' (διορθώθηκαν {n} τηλέφωνο→κινητό)',
    'contacts.import_failed': 'Η εισαγωγή απέτυχε: {msg}',
    'contacts.portal_loading': 'Φόρτωση χρηστών πύλης…',
    'contacts.all_orgs':    'Όλοι οι φορείς',
    'contacts.state_all':   'Όλες οι καταστάσεις',
    'contacts.state_active':  'Ενεργοί',
    'contacts.state_pending': 'Σε εκκρεμότητα',
    'contacts.state_deleted': 'Διαγραμμένοι',
    'contacts.filter_group_role': 'Ρόλος',
    'contacts.filter_group_state': 'Κατάσταση',
    'traffic.today_title': 'Σημερινή Επισκεψιμότητα',
    'traffic.today': 'Σήμερα',
    'traffic.visits': 'Επισκέψεις',
    'traffic.unique': 'Μοναδικοί Επισκέπτες',
    'traffic.pageviews': 'Προβολές Σελίδων',
    'traffic.downloads': 'Λήψεις',
    'traffic.api_calls': 'Κλήσεις API',
    'traffic.visits_chart': 'Εξέλιξη Επισκέψεων',
    'traffic.top_datasets': 'Κορυφαίες Σελίδες Δεδομένων',
    'traffic.top_queries': 'Κορυφαίες Αναζητήσεις',
    'traffic.top_api': 'Κορυφαίες Κλήσεις API',
    'traffic.top_downloads': 'Κορυφαίες Λήψεις',
    'traffic.period': 'Περίοδος:',
    'traffic.last7': 'Τελευταίες 7 ημέρες',
    'traffic.last30': 'Τελευταίες 30 ημέρες',
    'traffic.last90': 'Τελευταίες 90 ημέρες',
    'traffic.from': 'Από',
    'traffic.to': 'Έως',
    'traffic.apply': 'Εφαρμογή',
    'traffic.range_required': 'Επιλέξτε και τις δύο ημερομηνίες.',
    'traffic.range_invalid': 'Η ημερομηνία «Από» πρέπει να είναι πριν την «Έως».',
    'health.endpoint_status': 'Κατάσταση Τελικών Σημείων',
    'health.uptime_24h': 'Διαθεσιμότητα 24ω',
    'live.title': 'Ζωντανοί Επισκέπτες',
    'live.active_now': 'ενεργοί τα τελευταία 30 λεπτά',
    'live.none': 'Καμία πρόσφατη επίσκεψη.',
    'live.just_now': 'μόλις τώρα',
    'live.min_ago': ' λεπτά πριν',
    'live.unknown': 'Άγνωστο',
    'live.col_time': 'Ώρα',
    'live.col_location': 'Τοποθεσία / Τελευταία Σελίδα',
    'live.col_device': 'Συσκευή',
    'live.col_browser': 'Πρόγραμμα Περιήγησης',
    'live.col_actions': 'Ενέργειες',
    'health.response_history': 'Ιστορικό Χρόνου Απόκρισης',
    'health.recent_checks': 'Πρόσφατοι Έλεγχοι',
    'health.6h': '6 ω',
    'health.24h': '24 ω',
    'health.72h': '72 ω',
    'health.7d': '7 ημέρες',
    'stats.dataset_count': 'Εξέλιξη Συνόλων Δεδομένων',
    'stats.latest_snapshot': 'Τελευταίο Στιγμιότυπο',
    'quality.dcat_title': 'Έλεγχος Συμμόρφωσης DCAT-AP (SHACL)',
    'quality.dcat_run': 'Εκτέλεση Ελέγχου DCAT-AP',
    'quality.dcat_desc': 'Επικυρώνει τα πραγματικά μεταδεδομένα DCAT-AP κάθε συνόλου δεδομένων βάσει των βασικών δομικών μορφών SHACL DCAT-AP και των μορφών ελεγχόμενου λεξιλογίου MDR της ΕΕ (από το αποθετήριο SEMICeu dcat-ap_shacl) — τους ίδιους κανόνες που ελέγχει το data.europa.eu στα συλλεγμένα μεταδεδομένα.',
    'quality.dcat_hint': 'Κάντε κλικ στο «Εκτέλεση Ελέγχου DCAT-AP» για επαλήθευση όλων των συνόλων δεδομένων της πύλης. Καλύπτει ολόκληρο τον κατάλογο (δεκάδες χιλιάδες σύνολα δεδομένων) και μπορεί να διαρκέσει πολύ την πρώτη φορά.',
    'quality.dcat_running': 'Επικύρωση όλων των συνόλων δεδομένων της πύλης βάσει των επίσημων μορφών SHACL DCAT-AP + MDR… μια πρώτη πλήρης εκτέλεση μπορεί να διαρκέσει ώρες. Μπορείτε να αλλάξετε καρτέλα — η διαδικασία συνεχίζεται στο παρασκήνιο.',
    'quality.dcat_still_running': 'Εξακολουθεί να εκτελείται μετά από μεγάλη αναμονή — μια πρώτη πλήρης εκτέλεση σε όλο τον κατάλογο μπορεί να διαρκέσει ώρες. Θα συνεχίσει στο παρασκήνιο· δοκιμάστε ξανά αργότερα.',
    'quality.dcat_rerun_title': 'Εκτέλεση Ελέγχου DCAT-AP Ξανά;',
    'quality.dcat_rerun_line2': 'Ο έλεγχος γίνεται σταδιακά, οπότε μια νέα εκτέλεση επικυρώνει εκ νέου μόνο ό,τι έχει πράγματι αλλάξει στην πύλη — συνήθως δεν χρειάζεται να τον εκτελέσετε ξανά, εκτός αν γνωρίζετε ότι έχει γίνει κάποια σημαντική αλλαγή στο data.gov.gr. Μια πλήρης επανεκτέλεση σε όλο τον κατάλογο μπορεί να διαρκέσει πολύ.',
    'quality.dcat_structural_issue': 'Δομικό πρόβλημα',
    'quality.dcat_vocabulary_issue': 'Πρόβλημα λεξιλογίου',
    'quality.dcat_col_structural': 'Δομή',
    'quality.dcat_col_vocabulary': 'Λεξιλόγιο',
    'quality.dcat_all_clean': 'Δεν βρέθηκαν προβλήματα σε όλα τα ελεγμένα σύνολα δεδομένων.',
    'quality.hvd_title': 'Έλεγχος Συμμόρφωσης HVD (SHACL)',
    'quality.hvd_run': 'Εκτέλεση Ελέγχου HVD',
    'quality.hvd_desc': 'Επικυρώνει τα πραγματικά μεταδεδομένα DCAT-AP κάθε συνόλου δεδομένων με ετικέτα HVD βάσει των επίσημων μορφών SHACL DCAT-AP-HVD της ΕΕ (Κανονισμός (ΕΕ) 2023/138) — όχι απλώς αν φέρει την ετικέτα hvd_category.',
    'quality.hvd_hint': 'Κάντε κλικ στο «Εκτέλεση Ελέγχου HVD» για επαλήθευση όλων των συνόλων δεδομένων με ετικέτα HVD. Ελέγχει κάθε σύνολο δεδομένων που φέρει σήμερα ετικέτα HVD της ΕΕ και μπορεί να διαρκέσει αρκετά λεπτά.',
    'quality.hvd_running': 'Επικύρωση συνόλων δεδομένων HVD βάσει των επίσημων μορφών SHACL… μπορεί να διαρκέσει αρκετά λεπτά. Μπορείτε να αλλάξετε καρτέλα — η διαδικασία συνεχίζεται στο παρασκήνιο.',
    'quality.hvd_still_running': 'Εξακολουθεί να εκτελείται μετά από μεγάλη αναμονή — ενδέχεται να ολοκληρωθεί στο παρασκήνιο. Δοκιμάστε ξανά το «Εκτέλεση Ελέγχου HVD» σε λίγο για την πιο πρόσφατη κατάσταση.',
    'quality.hvd_last_run': 'Τελευταία εκτέλεση',
    'quality.hvd_rerun_title': 'Εκτέλεση Ελέγχου HVD Ξανά;',
    'quality.hvd_rerun_line1': 'Τα αποτελέσματα που εμφανίζονται είναι ήδη ενημερωμένα.',
    'quality.hvd_rerun_line2': 'Ο έλεγχος γίνεται σταδιακά, οπότε μια νέα εκτέλεση επικυρώνει εκ νέου μόνο ό,τι έχει πράγματι αλλάξει στην πύλη — συνήθως δεν χρειάζεται να τον εκτελέσετε ξανά, εκτός αν γνωρίζετε ότι έχει γίνει κάποια σημαντική αλλαγή στο data.gov.gr.',
    'quality.hvd_rerun_cancel': 'Ακύρωση',
    'quality.hvd_rerun_confirm_btn': 'Εκτέλεση Ούτως ή Άλλως',
    'quality.hvd_checked': 'Ελέγχθηκαν',
    'quality.hvd_compliant': 'Συμμορφούμενα',
    'quality.hvd_non_conforming': 'Μη συμμορφούμενα',
    'quality.hvd_legal_issue': 'Μη συνδεδεμένη νομική αναφορά',
    'quality.hvd_no_api': 'Χωρίς πρόσβαση API',
    'quality.hvd_license_missing': 'Λείπει άδεια χρήσης',
    'quality.hvd_license_non_open': 'Μη επιβεβαιωμένη ανοιχτή άδεια',
    'quality.hvd_license_open': 'Ανοιχτή άδεια',
    'quality.hvd_failed_note': '{n} σύνολο(-α) δεδομένων δεν ήταν δυνατό να ανακτηθούν και παραλείφθηκαν.',
    'quality.hvd_cache_note': '{n} από {total} σύνολα δεδομένων ήταν αμετάβλητα από τον τελευταίο έλεγχο και προήλθαν από την cache.',
    'quality.hvd_all_clean': 'Δεν βρέθηκαν προβλήματα σε όλα τα ελεγμένα σύνολα δεδομένων HVD.',
    'quality.hvd_cancel': 'Ακύρωση',
    'quality.hvd_cancelling': 'Ακύρωση…',
    'quality.hvd_partial_note': 'Ακυρώθηκε νωρίτερα — τα αποτελέσματα αντικατοπτρίζουν μόνο τα {n} από τα {total} σύνολα δεδομένων που ελέγχθηκαν πριν την ακύρωση.',
    'quality.hvd_details': 'Ευρήματα',
    'quality.hvd_col_violations': 'Παραβιάσεις',
    'quality.hvd_col_legal': 'Νομική αναφορά',
    'quality.hvd_col_api': 'Πρόσβαση API',
    'quality.hvd_col_license': 'Άδεια χρήσης',
    'quality.hvd_unknown_org': 'Άγνωστος φορέας',
    'quality.hvd_results_search_placeholder': 'Αναζήτηση αποτελεσμάτων με τίτλο…',
    'quality.hvd_publisher_mismatch': 'Ύποπτος εκδότης',
    'quality.hvd_publisher_mismatch_hint': 'Το όνομα εκδότη του συνόλου δεδομένων δεν ταιριάζει με τον οργανισμό του ({org}) — πιθανώς καταχωρήθηκε εκ παραδρομής το όνομα ενός υπαλλήλου αντί του οργανισμού.',
    'quality.hvd_col_publisher': 'Εκδότης',
    'quality.hvd_filter_no_match': 'Κανένα σύνολο δεδομένων δεν ταιριάζει με τα επιλεγμένα φίλτρα.',
    'quality.hvd_filter_group_compliance': 'Συμμόρφωση',
    'quality.hvd_filter_group_metadata': 'Μεταδεδομένα',
    'quality.view_flat': 'Όλα',
    'quality.view_grouped': 'Ανά Οργανισμό',
    'quality.col_org': 'Οργανισμός',
    'quality.tab_hvd': 'HVD',
    'quality.tab_dcat': 'DCAT-AP',
    'quality.tab_geodcat': 'GeoDCAT-AP',
    'quality.tab_mqa': 'Βαθμολογία MQA',
    'quality.geodcat_title': 'Έλεγχος Συμμόρφωσης GeoDCAT-AP (SHACL)',
    'quality.geodcat_run': 'Εκτέλεση Ελέγχου GeoDCAT-AP',
    'quality.geodcat_desc': 'Επικυρώνει τα πραγματικά μεταδεδομένα DCAT-AP κάθε γεωχωρικού συνόλου δεδομένων βάσει των επίσημων μορφών SHACL της γεωχωρικής επέκτασης GeoDCAT-AP της ΕΕ (SEMICeu GeoDCAT-AP 3.1.0) — καλύπτει τα ~12.500 σύνολα δεδομένων που η ίδια η πύλη χαρακτηρίζει ως γεωχωρικά (επίπεδα GIS, υπηρεσίες WMS/WFS κ.λπ.).',
    'quality.geodcat_hint': 'Κάντε κλικ στο «Εκτέλεση Ελέγχου GeoDCAT-AP» για επαλήθευση κάθε γεωχωρικού συνόλου δεδομένων της πύλης. Μπορεί να διαρκέσει πολύ την πρώτη φορά.',
    'quality.geodcat_running': 'Επικύρωση κάθε γεωχωρικού συνόλου δεδομένων βάσει των επίσημων μορφών SHACL GeoDCAT-AP… μια πρώτη πλήρης εκτέλεση μπορεί να διαρκέσει πολύ. Μπορείτε να αλλάξετε καρτέλα — η διαδικασία συνεχίζεται στο παρασκήνιο.',
    'quality.geodcat_rerun_title': 'Εκτέλεση Ελέγχου GeoDCAT-AP Ξανά;',
    'quality.geodcat_all_clean': 'Δεν βρέθηκαν προβλήματα σε όλα τα ελεγμένα γεωχωρικά σύνολα δεδομένων.',
    'quality.mqa_title': 'Αξιολόγηση Ποιότητας Μεταδεδομένων ΕΕ (MQA)',
    'quality.mqa_desc': 'Το data.europa.eu υπολογίζει συνεχώς αυτή τη βαθμολογία ποιότητας μεταδεδομένων FAIR+ για τον κατάλογο του data.gov.gr — ευρετότητα, προσβασιμότητα, διαλειτουργικότητα, επαναχρησιμοποίηση και συμφραζόμενα. Ανακτάται από το δημόσιο API τους και αποθηκεύεται εδώ, δεν υπολογίζεται τοπικά.',
    'quality.mqa_hint': 'Η βαθμολογία MQA δεν έχει ανακτηθεί ακόμα. Κάντε κλικ στο «Ανανέωση Τώρα» για να ανακτήσετε την πιο πρόσφατη βαθμολογία από το data.europa.eu.',
    'quality.mqa_refresh': 'Ανανέωση Τώρα',
    'quality.mqa_refreshing': 'Ανανέωση…',
    'quality.mqa_findability': 'Ευρετότητα',
    'quality.mqa_accessibility': 'Προσβασιμότητα',
    'quality.mqa_interoperability': 'Διαλειτουργικότητα',
    'quality.mqa_reusability': 'Επαναχρησιμοποίηση',
    'quality.mqa_contextuality': 'Συμφραζόμενα',
    'orgs.title': 'Οργανισμοί & Αριθμός Συνόλων Δεδομένων',
    'orgs.portal': 'data.gov.gr',
    'orgs.all': 'Όλος ο Δημόσιος Τομέας',
    'orgs.search': 'Αναζήτηση οργανισμών…',
    'orgs.search_all': 'Αναζήτηση οργανισμών…',
    'orgs.refresh': 'Ανανέωση',
    'orgs.col_num': '#',
    'orgs.col_org': 'Οργανισμός',
    'orgs.col_datasets': 'Δεδομένα',
    'orgs.col_updated': 'Τελευταία Ενημέρωση',
    'orgs.col_contacts': 'Επαφές',
    'orgs.col_status': 'Κατάσταση',
    'orgs.as': 'ως',
    'orgs.on_portal': 'Στην πύλη',
    'orgs.not_registered': 'Μη εγγεγραμμένος',
    'orgs.loading': 'Φόρτωση…',
    'orgs.loading_public': 'Φόρτωση δημοσίων οργανισμών…',
    'orgs.none_found': 'Δεν βρέθηκαν οργανισμοί.',
    'orgs.cant_load': 'Αδύνατη η φόρτωση λίστας δημοσίων οργανισμών.',
    'orgs.total_public': 'συνολικοί δημόσιοι οργανισμοί',
    'orgs.fetched': 'Ανακτήθηκε',
    'orgs.server_error': 'Σφάλμα διακομιστή',
    'orgs.server_error_hint': '— ελέγξτε τα αρχεία καταγραφής.',
    'org_detail.org': 'Οργανισμός',
    'org_detail.datasets': 'σύνολα δεδομένων',
    'org_detail.member_since': 'Μέλος από',
    'org_detail.view': 'Προβολή στο data.gov.gr',
    'comms.title': 'Αρχείο Επικοινωνιών',
    'comms.view_all': 'Όλες',
    'comms.view_by_org': 'Ανά Οργανισμό',
    'comms.view_cases': 'Υποθέσεις',
    'comms.view_timeline': 'Χρονολόγιο',
    'comms.initial_contact': 'Αρχική Επικοινωνία',
    'comms.intermediate_contact': 'Ενδιάμεση Επικοινωνία',
    'comms.positive_response': 'Θετική Απάντηση',
    'comms.negative_response': 'Αρνητική Απάντηση',
    'comms.no_response': 'Χωρίς Απάντηση',
    'comms.medium_telephone': 'Τηλέφωνο',
    'comms.medium_email': 'Email',
    'comms.medium_in_person': 'Δια Ζώσης',
    'comms.medium_other': 'Άλλο',
    'comms.direction_inbound': 'Εισερχόμενη',
    'comms.direction_outbound': 'Εξερχόμενη',
    'comms.direction_unset': 'Χωρίς κατεύθυνση (κλικ για εναλλαγή)',
    'comms.direction_unset_short': 'Χωρίς κατεύθυνση',
    'comms.case_open': 'Ανοιχτή',
    'comms.case_closed': 'Κλειστή',
    'comms.open_cases': 'Ανοιχτές Υποθέσεις',
    'comms.closed_cases': 'Κλειστές Υποθέσεις',
    'comms.stale_cases': 'Χρήζει Παρακολούθησης',
    'comms.not_stale_cases': 'Εντάξει',
    'comms.filter_group_case': 'Υπόθεση',
    'comms.filter_group_stale': 'Παρακολούθηση',
    'comms.filter_group_status': 'Κατάσταση',
    'comms.case_stale': 'Χωρίς Απάντηση',
    'comms.case_stale_hint': 'Η τελευταία προσπάθεια έμεινε αναπάντητη, ή δεν υπάρχει δραστηριότητα εδώ και 14+ ημέρες.',
    'comms.case_opened': 'Άνοιξε',
    'comms.case_closed_on': 'Έκλεισε',
    'comms.case_add_entry': 'Προσθήκη καταχώρησης σε αυτή την υπόθεση',
    'comms.case_add_followup': 'Προσθήκη Επόμενου Βήματος',
    'comms.case_close': 'Κλείσιμο Υπόθεσης',
    'comms.case_reopen': 'Επανάνοιγμα Υπόθεσης',
    'comms.case_col': 'Υπόθεση',
    'comms.search': 'Αναζήτηση επικοινωνιών…',
    'comms.download_excel_title': 'Λήψη της τρέχουσας προβολής ως Excel',
    'comms.add_comm_for_org': 'Προσθήκη νέας επικοινωνίας για αυτόν τον οργανισμό',
    'comms.add_contact_for_org': 'Προσθήκη επαφής για αυτόν τον οργανισμό',
    'comms.add': 'Προσθήκη',
    'comms.none': 'Δεν έχουν καταγραφεί επικοινωνίες — κάντε κλικ στο «Προσθήκη».',
    'comms.col_date': 'Ημερομηνία',
    'comms.col_org': 'Οργανισμός',
    'comms.col_subject': 'Θέμα',
    'comms.col_status': 'Κατάσταση',
    'comms.col_medium': 'Μέσο',
    'comms.col_notes': 'Σημειώσεις',
    'comms.total': 'Σύνολο',
    'comms.entry': 'εγγραφή',
    'comms.entries': 'εγγραφές',
    'comms.today': 'Σήμερα',
    'comms.yesterday': 'Χθες',
    'comm_modal.add_title': 'Προσθήκη Επικοινωνίας',
    'comm_modal.edit_title': 'Επεξεργασία Επικοινωνίας',
    'comm_modal.date': 'Ημερομηνία',
    'comm_modal.deadline': 'Προθεσμία',
    'comm_modal.deadline_hint': 'Αν δεν καταχωρηθεί απάντηση μέχρι αυτή την ημερομηνία, η υπόθεση θεωρείται χωρίς απάντηση.',
    'comm_modal.org': 'Οργανισμός',
    'comm_modal.org_ph': 'Αναζήτηση με οργανισμό ή όνομα επαφής…',
    'comm_modal.org_locked': '(σταθερός οργανισμός για αυτή την υπόθεση)',
    'comm_modal.contact': 'Άτομο Επαφής',
    'comm_modal.contact_add_ph': '— επιλογή επαφής για προσθήκη —',
    'comm_modal.subject': 'Θέμα',
    'comm_modal.subject_ph': 'Ζητούμενο σύνολο δεδομένων ή θέμα',
    'comm_modal.status': 'Κατάσταση',
    'comm_modal.medium': 'Μέσο',
    'comm_modal.medium_ph': '— επιλογή μέσου —',
    'comm_modal.direction': 'Κατεύθυνση',
    'comm_modal.status_closes_case': 'Αυτό θα κλείσει την υπόθεση.',
    'comm_modal.notes': 'Σημειώσεις',
    'comm_modal.notes_ph': 'Επιπλέον πλαίσιο…',
    'comm_modal.cancel': 'Ακύρωση',
    'comm_modal.save': 'Αποθήκευση',
    'comm_modal.required': 'Η ημερομηνία, ο οργανισμός και το θέμα είναι υποχρεωτικά.',
    'comm_modal.delete_confirm': 'Διαγραφή αυτής της επικοινωνίας;',
    'comm_modal.delete_failed': 'Η διαγραφή απέτυχε:',
    'inbound.pending_title': 'Εκκρεμεί Έγκριση',
    'inbound.reason_no_contact': 'Άγνωστος αποστολέας',
    'inbound.reason_no_case': 'Καμία ενεργή υπόθεση',
    'inbound.reason_multiple_cases': 'Πολλαπλές ενεργές υποθέσεις',
    'inbound.reason_multiple_contacts': 'Πολλαπλές πιθανές επαφές',
    'inbound.reason_comm_deleted': 'Η επικοινωνία διαγράφηκε',
    'inbound.reason_processing_error': 'Δεν ήταν δυνατή η αυτόματη επεξεργασία',
    'inbound.toast_title': 'Νέο email προς έλεγχο',
    'inbound.toast_multi': '{n} νέα email προς έλεγχο',
    'inbound.toast_title_comm': 'Νέα επικοινωνία καταχωρήθηκε',
    'inbound.toast_multi_comms': '{n} νέες επικοινωνίες καταχωρήθηκαν',
    'inbound.attach': 'Επισύναψη',
    'inbound.dismiss': 'Απόρριψη',
    'inbound.attach_title': 'Επισύναψη Email σε Υπόθεση',
    'inbound.from': 'Από',
    'inbound.subject_label': 'Θέμα',
    'inbound.case': 'Υπόθεση',
    'inbound.new_case': '— Νέα υπόθεση —',
    'inbound.candidates_label': 'Ποια είναι η σωστή επαφή;',
    'inbound.use_this_contact': 'Χρήση αυτής της επαφής',
    'inbound.detected_hint': 'Εντοπίστηκε σε αυτό το email:',
    'inbound.register_contact': 'Καταχώρηση και του αποστολέα ως επαφή',
    'inbound.skip_duplicate_contact': 'Να μην δημιουργηθεί διπλή εγγραφή',
    'inbound.attach_required': 'Απαιτούνται οργανισμός και θέμα για το άνοιγμα νέας υπόθεσης.',
    'inbound.dismiss_confirm': 'Απόρριψη αυτού του email; Δεν θα επισυναφθεί σε καμία υπόθεση.',
    'inbound.auto_badge': 'Αυτόματο',
    'inbound.auto_badge_title': 'Καταγράφηκε αυτόματα από εισερχόμενο email',
    'contacts.panel_title': 'Επαφές',
    'contacts.org_panel_no_access': 'Δεν έχετε πρόσβαση στις Επαφές, οπότε τα στοιχεία μελών δεν μπορούν να εμφανιστούν εδώ.',
    'contacts.add': 'Προσθήκη Επαφής',
    'contacts.none': 'Δεν υπάρχουν επαφές — κάντε κλικ στο «Προσθήκη».',
    'contacts.modal_add': 'Προσθήκη Επαφής',
    'contacts.modal_edit': 'Επεξεργασία Επαφής',
    'contacts.first_name': 'Όνομα',
    'contacts.last_name': 'Επώνυμο',
    'contacts.position': 'Θέση',
    'contacts.type': 'Τύπος Επαφής',
    'contacts.type_org_administrator': 'Διαχειριστής Οργανισμού',
    'contacts.type_org_member': 'Μέλος Οργανισμού',
    'contacts.type_data_officer': 'Υπεύθυνος Διακυβέρνησης Δεδομένων',
    'contacts.type_data_steward': 'Διαχειριστής Δεδομένων',
    'contacts.type_org_editor': 'Συντάκτης Οργανισμού',
    'contacts.type_contact_point': 'Κεντρικός Διαχειριστής Οργανισμού 🎩',
    'contacts.type_multiselect_hint': 'Κρατήστε πατημένο το Ctrl (Windows) ή το ⌘ (Mac) και κάντε κλικ για επιλογή ή αποεπιλογή πολλαπλών ρόλων.',
    'contacts.email': 'Email',
    'contacts.tel': 'Τηλ',
    'contacts.mobile': 'Κινητό',
    'contacts.err_email': 'Μη έγκυρη διεύθυνση email.',
    'contacts.err_phone': 'Μη έγκυρος αριθμός τηλεφώνου.',
    'contacts.cancel': 'Ακύρωση',
    'contacts.save': 'Αποθήκευση',
    'contacts.delete_confirm': 'Διαγραφή αυτής της επαφής;',
    'contacts.delete_confirm_linked': 'Αυτή η επαφή είναι συνδεδεμένη με {n} Επικοινωνία(-ες) -- η διαγραφή θα αφαιρέσει αυτή την απόδοση (οι ίδιες οι Επικοινωνίες παραμένουν). Διαγραφή ούτως ή άλλως;',
    'contacts.delete_failed': 'Η διαγραφή απέτυχε:',
    'health.col_endpoint': 'Τελικό Σημείο',
    'health.col_status': 'Κατάσταση',
    'health.col_uptime': 'Διαθεσιμότητα',
    'health.col_avg_response': 'Μέσος Χρόνος',
    'health.col_checks': 'Έλεγχοι',
    'health.col_time': 'Ώρα',
    'health.col_http': 'HTTP',
    'health.col_response': 'Απόκριση',
    'health.no_checks': 'Δεν υπάρχουν έλεγχοι — κάντε κλικ στο «Έλεγχος τώρα».',
    'health.status_up': 'ΕΝΕΡΓΟ',
    'health.status_down': 'ΑΝΕΝΕΡΓΟ',
    'health.critical': 'κρίσιμο',
    'health.as_of': 'ως',
    'stats.col_datasets': 'Δεδομένα',
    'stats.col_orgs': 'Οργανισμοί',
    'stats.col_resources': 'Πόροι',
    'stats.col_services': 'Υπηρεσίες',
    'stats.col_updated': 'Ενημέρωση',
    'stats.no_snapshot': 'Δεν υπάρχει στιγμιότυπο ακόμα.',
    'stats.accumulating': 'Τα δεδομένα συσσωρεύονται με τον χρόνο — ελέγξτε αργότερα.',
    'stats.geo_map_title': 'Τοποθεσίες Γεωχωρικών Συνόλων Δεδομένων',
    'stats.geo_map_loading': 'Εντοπισμός γεωχωρικών συνόλων δεδομένων ανά φορέα…',
    'stats.geo_map_none': 'Δεν υπάρχουν διαθέσιμες τοποθεσίες γεωχωρικών συνόλων δεδομένων.',
    'stats.geo_map_orgs': 'φορείς',
    'stats.geo_map_datasets': 'σύνολα δεδομένων',
    'stats.geo_map_click_hint': 'Κλικ για πληροφορίες φορέα',
    'temporal.coming_soon': 'Σύντομα διαθέσιμο.',
    'traffic.col_dataset': 'Σύνολο Δεδομένων',
    'traffic.col_visits': 'Επισκέψεις',
    'traffic.col_query': 'Αναζήτηση',
    'traffic.col_searches': 'Αριθμός',
    'traffic.col_endpoint': 'Τελικό Σημείο',
    'traffic.col_calls': 'Κλήσεις',
    'traffic.col_file': 'Αρχείο',
    'traffic.col_downloads': 'Λήψεις',
    'traffic.no_dataset': 'Δεν υπάρχουν διαθέσιμα δεδομένα σελίδων.',
    'traffic.no_search': 'Δεν υπάρχουν διαθέσιμα δεδομένα αναζητήσεων.',
    'traffic.no_api': 'Δεν βρέθηκαν δεδομένα API. Οι κλήσεις API ενδέχεται να μην παρακολουθούνται από το Matomo.',
    'traffic.no_downloads': 'Δεν υπάρχουν διαθέσιμα δεδομένα λήψεων.',
    'traffic.failed': 'Αποτυχία φόρτωσης',
    'traffic.no_api2': 'Δεν βρέθηκαν δεδομένα API.',
    'quality.col_dataset': 'Σύνολο Δεδομένων',
    'catalog.title': 'Κατάλογος Συνόλων Δεδομένων',
    'catalog.search_ph': 'Αναζήτηση συνόλων δεδομένων…',
    'catalog.hint': 'Αναζητήστε σύνολα δεδομένων με τίτλο ή λέξη-κλειδί, ή αφήστε κενό για τα πιο πρόσφατα ενημερωμένα.',
    'catalog.filter_since': 'Ανέβηκε από',
    'catalog.filter_hvd_all': 'Όλα',
    'catalog.filter_hvd_only': 'HVD',
    'catalog.filter_hvd_non': 'Μη HVD',
    'catalog.hvd_full': 'Σύνολο Δεδομένων Υψηλής Αξίας',
    'catalog.hvd_tooltip': 'Σύνολο Δεδομένων Υψηλής Αξίας — Εκτελεστικός Κανονισμός (ΕΕ) 2023/138 της Επιτροπής',
    'catalog.filter_harvest_all': 'Σύνολο',
    'catalog.filter_harvest_harvested': 'Συλλεγμένα',
    'catalog.filter_harvest_manual': 'Χειροκίνητα',
    'catalog.harvested_tooltip': 'Εισήχθη αυτόματα μέσω συλλέκτη δεδομένων (harvester), όχι απευθείας στην πύλη',
    'catalog.filter_geo_all': 'Σύνολο',
    'catalog.filter_geo_only': 'Γεωχωρικά',
    'catalog.filter_geo_non': 'Μη γεωχωρικά',
    'catalog.geo_full': 'Γεωχωρικό',
    'catalog.geo_tooltip': 'Χωρικά δεδομένα — επίπεδα GIS, χάρτες, υπηρεσίες WMS/WFS',
    'catalog.filter_group_type': 'Τύπος',
    'catalog.filter_group_hvd': 'HVD',
    'catalog.filter_group_harvest': 'Συλλεγμένα',
    'catalog.filter_group_geo': 'Γεωχωρικά',
    'filters.clear': 'Καθαρισμός φίλτρων',
    'catalog.results_for': 'αποτελέσματα για',
    'catalog.total_datasets': 'σύνολα δεδομένων συνολικά',
    'catalog.none': 'Δεν βρέθηκαν σύνολα δεδομένων με αυτά τα κριτήρια.',
    'catalog.end_of_results': '— Τέλος αποτελεσμάτων —',
    'catalog.col_title': 'Τίτλος',
    'catalog.col_org': 'Οργανισμός',
    'catalog.col_resources': 'Πόροι',
    'catalog.resources_not_sortable': 'Δεν ταξινομείται',
    'catalog.col_modified': 'Τελευταία Ενημέρωση',
    'catalog.panel_title': 'Σύνολο Δεδομένων',
    'catalog.created': 'Δημιουργήθηκε',
    'catalog.license': 'Άδεια Χρήσης',
    'catalog.tags': 'Ετικέτες',
    'catalog.resources': 'Πόροι',
    'catalog.no_resources': 'Δεν υπάρχουν πόροι.',
    'catalog.download': 'Λήψη',
    'catalog.view_on_portal': 'Προβολή στο data.gov.gr',
    'catalog.formats_title': 'Κατανομή Μορφοτύπων',
    'catalog.formats_none': 'Δεν υπάρχουν διαθέσιμα δεδομένα μορφοτύπων.',
    'catalog.formats_other': 'Άλλα',
    'catalog.stats_views_tooltip': 'Άτομα που είδαν τη σελίδα αυτού του συνόλου δεδομένων, τις τελευταίες 30 ημέρες',
    'catalog.stats_downloads_tooltip': 'Λήψεις, τις τελευταίες 30 ημέρες',
    'catalog.ckan_views_tooltip': 'Προβολές σελίδας συνόλου δεδομένων όπως καταγράφονται από το CKAN, συνολικά',
    'catalog.ckan_downloads_tooltip': 'Προβολές σελίδας πόρων όπως καταγράφονται από το CKAN, συνολικά',
    'catalog.source_ckan': 'CKAN',
    'catalog.source_matomo': 'Matomo',
    'catalog.loading_matomo': 'Φόρτωση στατιστικών Matomo…',
    'catalog.view_analytics': 'Προβολή αναλυτικών στοιχείων',
    'catalog.analytics_title': 'Αναλυτικά Στοιχεία Συνόλου Δεδομένων',
    'catalog.analytics_over_time': 'Επισκέψεις με την πάροδο του χρόνου (τελευταίες 30 ημέρες)',
    'catalog.analytics_countries': 'Χώρες επισκεπτών',
    'catalog.analytics_referrers': 'Πώς βρήκαν οι επισκέπτες αυτό το σύνολο δεδομένων',
    'catalog.analytics_downloads': 'Λήψεις ανά πόρο',
    'catalog.analytics_no_data': 'Δεν υπάρχουν ακόμα αρκετά δεδομένα.',
    'catalog.analytics_visits': 'Επισκέψεις',
    'catalog.analytics_unique_visitors': 'Μοναδικοί επισκέπτες',
    'catalog.filter_org_all': 'Όλοι οι οργανισμοί',
    'catalog.filter_format_all': 'Όλοι οι μορφότυποι',
    'catalog.related': 'Σχετικά Σύνολα Δεδομένων',
    'catalog.related_none': 'Δεν βρέθηκαν σχετικά σύνολα δεδομένων.',
    'catalog.filter_type_all': 'Όλοι οι τύποι',
    'catalog.type_dataset': 'Σύνολο Δεδομένων',
    'catalog.type_data_service': 'Υπηρεσία Δεδομένων',
    'catalog.type_decision': 'Απόφαση',
    'catalog.endpoints': 'Σημεία Πρόσβασης',
    'catalog.no_endpoints': 'Δεν υπάρχουν διαθέσιμα URL σημείων πρόσβασης.',
    'catalog.open_endpoint': 'Άνοιγμα σημείου πρόσβασης',
    'name.modal_title': 'Επεξεργασία Ονόματος',
    'name.label': 'Όνομα',
    'name.success': 'Το όνομα ενημερώθηκε με επιτυχία.',
    'name.save': 'Αποθήκευση',
    'name.err_required': 'Το όνομα είναι υποχρεωτικό.',
    'name.err_generic': 'Αποτυχία ενημέρωσης ονόματος.',
    'pw.modal_title': 'Αλλαγή Κωδικού',
    'pw.current': 'Τρέχων κωδικός',
    'pw.new': 'Νέος κωδικός',
    'pw.new_hint': 'Τουλάχιστον 8 χαρακτήρες.',
    'pw.confirm': 'Επιβεβαίωση νέου κωδικού',
    'pw.success': 'Ο κωδικός άλλαξε με επιτυχία.',
    'pw.save': 'Αλλαγή Κωδικού',
    'pw.err_length': 'Ο νέος κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.',
    'pw.err_mismatch': 'Οι νέοι κωδικοί δεν ταιριάζουν.',
    'pw.err_generic': 'Αποτυχία αλλαγής κωδικού.',
    'passkey.modal_title': 'Διαχείριση Passkeys',
    'passkey.modal_hint': 'Ένα passkey σας επιτρέπει να συνδέεστε με Touch ID, Windows Hello, ή κλειδί ασφαλείας αντί για τον κωδικό σας.',
    'passkey.nickname_label': 'Ονομασία passkey',
    'passkey.nickname_placeholder': 'π.χ. Ο υπολογιστής μου',
    'passkey.add': 'Προσθήκη passkey',
    'passkey.adding': 'Αναμονή για passkey…',
    'passkey.unsupported': 'Αυτό το πρόγραμμα περιήγησης δεν υποστηρίζει passkeys.',
    'passkey.none': 'Δεν έχετε προσθέσει κανένα passkey ακόμα.',
    'passkey.added': 'Προστέθηκε',
    'passkey.last_used': 'τελευταία χρήση',
    'passkey.delete_confirm': 'Αφαίρεση αυτού του passkey; Μπορείτε να το προσθέσετε ξανά αργότερα αν χρειαστεί.',
    'footer.changelog': 'Ιστορικό αλλαγών',
    'footer.changelog_title': 'Ιστορικό αλλαγών',
    'footer.changelog_none': 'Δεν υπάρχουν διαθέσιμες καταχωρήσεις ιστορικού αλλαγών.',
    'loading': 'Φόρτωση…',
    'error': 'Σφάλμα:',
    'common.edit': 'Επεξεργασία',
    'common.delete': 'Διαγραφή',
    'common.add': 'Προσθήκη',
    'common.cancel': 'Ακύρωση',
    'common.save': 'Αποθήκευση',
    'common.clear': 'Εκκαθάριση',
    'common.view': 'Προβολή',
    'common.remove': 'Αφαίρεση',
    'common.export_excel': 'Εξαγωγή Excel',
    'common.expand_all': 'Ανάπτυξη όλων',
    'common.collapse_all': 'Σύμπτυξη όλων',
    'common.confirm_delete_title': 'Επιβεβαίωση Διαγραφής',
    'common.save_failed': 'Η αποθήκευση απέτυχε.',
    'common.network_error': 'Σφάλμα δικτύου: {msg}',
    'common.saving': 'Αποθήκευση…',
    'contacts.select_org_required': 'Επιλέξτε τουλάχιστον έναν οργανισμό.',
    'userPanel.no_datasets': 'Δεν βρέθηκαν σύνολα δεδομένων.',
    'userPanel.no_activity': 'Δεν βρέθηκε δραστηριότητα.',
    'userPanel.no_recent_datasets': 'Δεν βρέθηκαν πρόσφατα σύνολα δεδομένων.',
    'userPanel.no_members': 'Δεν βρέθηκαν μέλη.',
    'contacts.organizations': 'Οργανισμοί',
    'contacts.add_org_placeholder': 'Προσθήκη οργανισμού…',
    'contacts.fill_from_existing': 'Συμπλήρωση από υπάρχουσα',
    'contacts.ignore': 'Παράβλεψη',
    'contacts.email_duplicate_found': 'Υπάρχει ήδη επαφή με αυτό το email: {who}',
    'contacts.row_mismatch': 'Τα στοιχεία πύλης και αρχείου διαφωνούν για αυτό το άτομο',
    'userPanel.email_file': 'Email (αρχείο)',
    'userPanel.org_file': 'Οργανισμός (αρχείο)',
    'userPanel.org_portal': 'Οργανισμός (πύλη)',
    'userPanel.org_mismatch': 'Το αρχείο επαφής και ο λογαριασμός πύλης διαφωνούν ως προς τον οργανισμό αυτού του ατόμου',
    'userPanel.file_contact_only': 'Χωρίς συνδεδεμένο λογαριασμό πύλης',
    'userPanel.info': 'Στοιχεία',
    'userPanel.portal': 'Πύλη',
    'userPanel.file': 'Αρχείο',
    'userPanel.name_mismatch': 'Το αρχείο επαφής και ο λογαριασμός πύλης διαφωνούν ως προς το όνομα αυτού του ατόμου',
    'userPanel.email_mismatch': 'Το αρχείο επαφής και ο λογαριασμός πύλης διαφωνούν ως προς το email αυτού του ατόμου',
    'userPanel.role_mismatch': 'Το αρχείο επαφής και ο λογαριασμός πύλης διαφωνούν ως προς τον ρόλο αυτού του ατόμου',
    'userPanel.add_contact_record': 'Προσθήκη εγγραφής επαφής',
    'userPanel.registered': 'Εγγραφή',
    'userPanel.last_active': 'Τελευταία ενεργός',
    'userPanel.datasets': 'Σύνολα Δεδομένων',
    'userPanel.edits': 'Επεξεργασίες',
    'userPanel.recent_activity': 'Πρόσφατη Δραστηριότητα',
    'userPanel.about': 'Σχετικά',
    'userPanel.no_organization': 'Χωρίς οργανισμό',
    'userPanel.failed_load_user': 'Αποτυχία φόρτωσης χρήστη: {msg}',
    'userPanel.failed_load_datasets': 'Αποτυχία φόρτωσης συνόλων δεδομένων: {msg}',
    'userPanel.failed_load_activity': 'Αποτυχία φόρτωσης δραστηριότητας: {msg}',
    'userPanel.private': 'Ιδιωτικό',
    'userPanel.resources_count': '{n} πόροι',
    'userPanel.act_new_package': 'Δημιουργήθηκε σύνολο δεδομένων',
    'userPanel.act_changed_package': 'Ενημερώθηκε σύνολο δεδομένων',
    'userPanel.act_deleted_package': 'Διαγράφηκε σύνολο δεδομένων',
    'userPanel.act_new_resource': 'Προστέθηκε πόρος',
    'userPanel.act_changed_resource': 'Ενημερώθηκε πόρος',
    'userPanel.act_deleted_resource': 'Διαγράφηκε πόρος',
    'userPanel.act_new_user': 'Εγγραφή στην πύλη',
    'userPanel.act_changed_user': 'Ενημέρωση προφίλ',
    'date.never': '—',
    'date.just_now': 'μόλις τώρα',
    'date.m_ago': ' λεπτά πριν',
    'date.h_ago': ' ώρες πριν',
    'date.yesterday': 'χθες',
    'date.d_ago': ' ημέρες πριν',
    'date.mo_ago': ' μήνες πριν',
    'date.y_ago': ' χρόνια πριν',
  }
};
let _lang = localStorage.getItem('lang') || 'el';
function t(key) {
  return (TRANSLATIONS[_lang] && TRANSLATIONS[_lang][key]) || TRANSLATIONS.en[key]
    || (I18N_SHARED[_lang] && I18N_SHARED[_lang][key]) || I18N_SHARED.en[key] || key;
}
function applyI18n() {
  document.getElementById('langEl').classList.toggle('active', _lang === 'el');
  document.getElementById('langEn').classList.toggle('active', _lang === 'en');
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.getAttribute('data-i18n')); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.getAttribute('data-i18n-ph')); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.getAttribute('data-i18n-title')); });
  document.title = t('page.title') + (window.__GIT_SHA_SUFFIX__ || '');
}
function setLang(lang) {
  _lang = lang;
  localStorage.setItem('lang', lang);
  document.getElementById('langEn').classList.toggle('active', lang === 'en');
  document.getElementById('langEl').classList.toggle('active', lang === 'el');
  applyI18n();
  if (typeof _healthLoaded !== 'undefined' && _healthLoaded)   { loadOverview(); }
  if (typeof _orgsLoaded   !== 'undefined' && _orgsLoaded)     { filterOrgs(); }
  if (typeof _commsLoaded  !== 'undefined' && _commsLoaded)    { renderCommsSummary(); filterComms(); }
  if (typeof _trafficLoaded !== 'undefined' && _trafficLoaded) { loadTrafficTab(); }
  if (typeof _portalMembersCache !== 'undefined' && _portalMembersCache) { renderContactsSummary(); filterContactsTab(); }
  if (typeof _catalogLoaded !== 'undefined' && _catalogLoaded) { loadCatalog(); }
}

// ── Dark theme ───────────────────────────────────────────────────────────────
function _isDarkTheme() { return document.documentElement.getAttribute('data-bs-theme') === 'dark'; }
function _chartGridColor() { return _isDarkTheme() ? 'rgba(255,255,255,.08)' : '#f0f0f0'; }
function _chartTextColor() { return _isDarkTheme() ? '#adb5bd' : '#6c757d'; }

function applyThemeIcon() {
  const icon = document.getElementById('themeToggleIcon');
  if (icon) icon.className = 'bi ' + (_isDarkTheme() ? 'bi-sun' : 'bi-moon-stars');
}

function _applyChartTheme(chart) {
  if (!chart) return;
  const grid = _chartGridColor(), text = _chartTextColor();
  // Only the two main axes get theme-aware colors; per-axis brand colors
  // (e.g. the traffic chart's orange downloads axis) are left alone.
  ['x', 'y'].forEach(ax => {
    const scale = chart.options.scales && chart.options.scales[ax];
    if (!scale) return;
    if (scale.grid) scale.grid.color = grid;
    if (scale.ticks) scale.ticks.color = text;
  });
  if (chart.options.plugins && chart.options.plugins.legend && chart.options.plugins.legend.display !== false) {
    chart.options.plugins.legend.labels = { ...(chart.options.plugins.legend.labels || {}), color: text };
  }
  chart.update();
}

function refreshChartsForTheme() {
  [
    typeof _uptimeChart !== 'undefined' && _uptimeChart,
    typeof _rtChart !== 'undefined' && _rtChart,
    typeof _statsChart !== 'undefined' && _statsChart,
    typeof _trafficChart !== 'undefined' && _trafficChart,
    typeof _catalogFormatChart !== 'undefined' && _catalogFormatChart,
    typeof _datasetAnalyticsChart !== 'undefined' && _datasetAnalyticsChart,
  ].forEach(_applyChartTheme);
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-bs-theme', theme);
  localStorage.setItem('theme', theme);
  applyThemeIcon();
  refreshChartsForTheme();
}

function toggleTheme() {
  setTheme(_isDarkTheme() ? 'light' : 'dark');
}

// ── Shared destructive-action confirmation modal ────────────────────────────
// One modal (#dangerConfirmModal), reused by every "delete this record"
// action instead of each tab rolling its own plain confirm() -- gives
// destructive actions real danger-colored styling consistently.
let _dangerConfirmModal    = null;
let _dangerConfirmCallback = null;

function confirmDangerAction(message, onConfirm) {
  document.getElementById('dangerConfirmBody').textContent = message;
  _dangerConfirmCallback = onConfirm;
  if (!_dangerConfirmModal) _dangerConfirmModal = new bootstrap.Modal(document.getElementById('dangerConfirmModal'));
  _dangerConfirmModal.show();
}

function _confirmDangerAction() {
  if (_dangerConfirmModal) _dangerConfirmModal.hide();
  const cb = _dangerConfirmCallback;
  _dangerConfirmCallback = null;
  if (cb) cb();
}

// ── Sidebar navigation ───────────────────────────────────────────────────────
function initSidebar() {
  const sidebar = document.getElementById('dashboardSidebar');
  if (localStorage.getItem('sidebarCollapsed') === '1') sidebar.classList.add('collapsed');
  document.getElementById('mainTabs').addEventListener('click', (e) => {
    if (e.target.closest('.nav-link')) closeMobileSidebar();
  });
}

function toggleSidebar() {
  const sidebar = document.getElementById('dashboardSidebar');
  sidebar.classList.toggle('collapsed');
  localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed') ? '1' : '0');
}

function toggleMobileSidebar() {
  document.getElementById('dashboardSidebar').classList.toggle('mobile-open');
  document.getElementById('sidebarBackdrop').classList.toggle('show');
}

function closeMobileSidebar() {
  document.getElementById('dashboardSidebar').classList.remove('mobile-open');
  document.getElementById('sidebarBackdrop').classList.remove('show');
}

// ── Chart instances ─────────────────────────────────────────────────────────
let _uptimeChart = null, _rtChart = null, _statsChart = null;
let _contactsPanel = null;
let _panelOrgCode = '', _panelOrgLabel = '', _panelCkanName = null;
let _displayedPublicOrgs = [], _contactSummary = {};

// Absolute base URL so API calls work regardless of sub-path prefix
const API_BASE = (() => {
  const h = window.location.href.split('?')[0].split('#')[0];
  return h.endsWith('/') ? h : h + '/';
})();

// null = unrestricted (admins, or a user with no explicit allow-list); otherwise
// an array of tab keys (e.g. "health") matching the "tab-health" pane id suffix.
const ALLOWED_TABS = window.__ALLOWED_TABS__;

function _applyTabRestrictions() {
  if (!ALLOWED_TABS) return;
  let activeRemoved = false;
  document.querySelectorAll('#mainTabs .nav-link[data-bs-target^="#tab-"]').forEach(btn => {
    const key = btn.dataset.bsTarget.replace('#tab-', '');
    if (ALLOWED_TABS.includes(key)) return;
    if (btn.classList.contains('active')) activeRemoved = true;
    const li = btn.closest('li.nav-item') || btn;
    li.classList.add('d-none');
    const pane = document.getElementById(`tab-${key}`);
    if (pane) pane.classList.remove('show', 'active');
  });
  if (activeRemoved) {
    const firstAllowed = document.querySelector('#mainTabs li.nav-item:not(.d-none) .nav-link[data-bs-target^="#tab-"]');
    if (firstAllowed) bootstrap.Tab.getOrCreateInstance(firstAllowed).show();
  }
}
_applyTabRestrictions();

// ── Deep-linkable tabs — a URL like #contacts opens directly to that tab ────
function _tabKeyFromHash(hash) {
  return (hash || '').replace(/^#/, '');
}

function _activateTabByKey(key) {
  if (!key) return false;
  if (ALLOWED_TABS && !ALLOWED_TABS.includes(key)) return false;
  const btn = document.querySelector(`#mainTabs .nav-link[data-bs-target="#tab-${key}"]`);
  if (!btn || btn.closest('li.nav-item')?.classList.contains('d-none')) return false;
  btn.click();  // a real click (not just Tab.show()) so each tab's lazy-load listener still fires
  return true;
}

document.getElementById('mainTabs').addEventListener('shown.bs.tab', (e) => {
  const key = e.target.dataset.bsTarget?.replace('#tab-', '');
  // replaceState (not location.hash=) so switching tabs doesn't clutter browser history --
  // the address bar still updates and stays copyable/bookmarkable.
  if (key) history.replaceState(null, '', '#' + key);
});

// Organizations, Contacts, and the Quality sub-tabs (HVD/DCAT-AP/GeoDCAT-AP --
// the latter two check every dataset in the catalog, so their result tables
// can run into the tens of thousands of rows) each render every row into one
// big table. Bootstrap tabs only toggle display:none on the inactive pane, so
// that DOM stays mounted and keeps costing style/layout recalculation
// everywhere else in the page (e.g. scroll jank) unless we empty it out here.
// All of them keep their data cached in memory and fully rebuild from that
// cache on the next visit (see the shown.bs.tab listener below and the
// orgsTabBtn/contactsTabBtn click handlers further down), so this is a pure
// DOM-size optimization -- no extra network fetch, no data loss.
//
// Listening on `document` (not just #mainTabs) so this also catches the
// Quality tab's nested HVD/DCAT-AP/GeoDCAT-AP sub-tabs, which are a separate
// tab group nested inside #tab-quality.
function _clearIfPresent(id) {
  const el = show(id);
  if (el) el.innerHTML = '';
}
document.addEventListener('hidden.bs.tab', (e) => {
  const target = e.target.dataset.bsTarget;
  if (target === '#tab-orgs' && _orgsLoaded) show('orgsTable').innerHTML = '';
  if (target === '#tab-contacts' && _portalMembersCache) show('contactsTableBody').innerHTML = '';
  // Communications/Cases: same DOM-size reasoning, though the data behind
  // it is paginated now -- _commsSyncView's reuse path rebuilds whichever
  // view was showing from its own cache (_commsFlatRows/_commsCaseGroups/
  // etc.) without a network call once this tab is shown again.
  if (target === '#tab-comms' && _commsLoaded) show('commsTable').innerHTML = '';
  // hvdTableWrap/dcatTableWrap/geodcatTableWrap only exist once their check has
  // actually been run at least once this session (they're created dynamically
  // inside _renderHvdCheck/_renderDcatCheck/_renderGeoDcatCheck), so guard
  // every access -- most users won't have run all three.
  if (target === '#qsub-hvd') _clearIfPresent('hvdTableWrap');
  if (target === '#qsub-dcat') _clearIfPresent('dcatTableWrap');
  if (target === '#qsub-geodcat') _clearIfPresent('geodcatTableWrap');
  // Leaving the whole Quality tab hides whichever sub-tab was active without
  // firing its own hidden.bs.tab (only the ancestor's fires) -- clear all
  // three explicitly since we don't track which one was showing.
  if (target === '#tab-quality') {
    _clearIfPresent('hvdTableWrap');
    _clearIfPresent('dcatTableWrap');
    _clearIfPresent('geodcatTableWrap');
  }
});

// Mirror image of the above: rebuild whichever table was just emptied, from
// the in-memory result cache, the moment its tab (or the Quality tab itself,
// landing back on whichever sub-tab is active) becomes visible again.
document.addEventListener('shown.bs.tab', (e) => {
  let target = e.target.dataset.bsTarget;
  // Landing back on the Quality tab doesn't re-fire its nested sub-tab's own
  // shown.bs.tab (only #tab-quality's fires), so resolve to whichever
  // sub-tab is actually visible -- rebuilding only that one, not all three.
  if (target === '#tab-quality') {
    target = ['#qsub-hvd', '#qsub-dcat', '#qsub-geodcat'].find(id => _isTabActive(id.slice(1))) || target;
  }
  if (target === '#qsub-hvd' && _hvdLastResult && !show('hvdTableWrap')?.innerHTML) _renderHvdTable();
  if (target === '#qsub-dcat' && _dcatLastResult && !show('dcatTableWrap')?.innerHTML) _renderDcatTable();
  if (target === '#qsub-geodcat' && _geodcatLastResult && !show('geodcatTableWrap')?.innerHTML) _renderGeoDcatTable();
});

// Both tabs also get refreshed from background polls (enrichment / stale-cache
// refresh) that run on a timer regardless of which tab the user is looking
// at. Without this check those polls would rebuild the big table right after
// the hidden.bs.tab handler above just emptied it out.
function _isTabActive(paneId) {
  const pane = document.getElementById(paneId);
  return !!pane && pane.classList.contains('active');
}

window.addEventListener('hashchange', () => _activateTabByKey(_tabKeyFromHash(location.hash)));

// Honor a hash already in the URL on first load (a bookmarked or shared link).
// Deferred via setTimeout(...,0): this line runs partway through a single long
// script block, before the per-tab lazy-load listeners further down (e.g.
// qualityTabBtn's) have been registered yet -- clicking now would switch the
// visual tab (Bootstrap's own handling, wired up separately) without ever
// triggering that tab's data fetch. Deferring to the next tick runs this
// after the rest of the script -- and all those addEventListener calls --
// has finished.
setTimeout(() => _activateTabByKey(_tabKeyFromHash(location.hash)), 0);

// ── Tiny helpers ─────────────────────────────────────────────────────────────
const fmt  = n  => n == null ? '—' : Number(n).toLocaleString('el-GR');
const show = id => document.getElementById(id);

function statusBadge(up) {
  if (up === true)  return `<span class="badge bg-success px-2 py-1">${t('health.status_up')}</span>`;
  if (up === false) return `<span class="badge bg-danger  px-2 py-1">${t('health.status_down')}</span>`;
  return '<span class="badge bg-secondary px-2 py-1">?</span>';
}

function dot(up) {
  const cls = up === true ? 'dot-up' : up === false ? 'dot-down' : 'dot-unknown';
  return `<span class="status-dot ${cls} me-2"></span>`;
}

function uptimeColor(pct) {
  if (pct == null) return '#6c757d';
  return pct >= 99 ? '#198754' : pct >= 95 ? '#ffc107' : '#dc3545';
}

function showSpinner(v) {
  show('spinner').classList.toggle('active', v);
}

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

// Shared by every search box's clear ("x") button (see .search-clear-wrap
// CSS) -- dispatches a real 'input' event instead of calling each box's own
// filter function by name, so one generic handler works for all of them
// regardless of which (possibly debounced) oninput handler each already has
// wired up.
function _clearSearchInput(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = '';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.focus();
}

// Debounced search-input handlers — the underlying functions each re-filter/sort
// the full dataset and rebuild a table's innerHTML, so running them on every
// keystroke is what made typing in these boxes feel laggy. Programmatic callers
// (data loads, sort/view toggles, etc.) keep calling the undebounced functions
// directly, so only the search boxes below get the delay.
const debouncedFilterContactsTab  = debounce(() => filterContactsTab(),  200);
const debouncedFilterOrgs         = debounce(() => filterOrgs(),         200);
const debouncedFilterComms        = debounce(() => filterComms(),        200);
// Each also re-renders that check's summary cards, not just the table --
// the cards' counts are faceted against the current search text too (see
// _hvdCardCount and friends), so a search needs to refresh both.
const debouncedRenderHvdTable     = debounce(() => { _renderHvdSummaryCards();     _renderHvdTable();     }, 200);
const debouncedRenderDcatTable    = debounce(() => { _renderDcatSummaryCards();    _renderDcatTable();    }, 200);
const debouncedRenderGeoDcatTable = debounce(() => { _renderGeoDcatSummaryCards(); _renderGeoDcatTable(); }, 200);

// ── Today's Traffic ──────────────────────────────────────────────────────────
async function loadTodayTraffic() {
  try {
    const d = await fetch(API_BASE + 'api/matomo/today').then(r => r.json());
    if (d.error) { show('todayCard').classList.add('d-none'); return; }
    show('todayVisits').textContent    = fmt(d.visits);
    show('todayUnique').textContent    = fmt(d.unique_visitors);
    show('todayPageviews').textContent = fmt(d.pageviews);
    show('todayDownloads').textContent = fmt(d.downloads);
    show('todayUpdated').textContent   = t('health.as_of') + ' ' + new Date().toLocaleTimeString('el-GR', {hour: '2-digit', minute: '2-digit'});
  } catch (_) { show('todayCard').classList.add('d-none'); }
}

// ── Overview ─────────────────────────────────────────────────────────────────
// Populated as a side effect of the header KPI card below -- also used as an
// immediate best-guess "total" for the Portal Members cold-load progress bar
// (see loadPortalMembersTab/_loadPortalMembersGroups), so it can render with
// a real total right away instead of waiting for the slow per-org fetch's
// own first progress report to confirm one org count.
let _kpiOrgCount = null;

async function loadOverview() {
  loadTodayTraffic();
  // Portal stats — snapshot first (fast), then live fetch updates all cards
  try {
    const snap = await fetch(API_BASE + 'api/stats/latest').then(r => r.ok ? r.json() : null);
    if (snap && !snap.error) {
      show('statDatasets').textContent  = fmt(snap.total_datasets);
      show('statServices').textContent  = fmt(snap.total_services);
      show('statResources').textContent = fmt(snap.total_resources);
      show('statOrgs').textContent      = fmt(snap.total_organizations);
      if (snap.total_organizations != null) _kpiOrgCount = snap.total_organizations;
    }
  } catch (_) {}
  // Live fetch from CKAN — corrects any snapshot staleness
  try {
    const live = await fetch(API_BASE + 'api/stats/live').then(r => r.ok ? r.json() : null);
    if (live) {
      if (live.total_datasets     != null) show('statDatasets').textContent  = fmt(live.total_datasets);
      if (live.total_services     != null) show('statServices').textContent  = fmt(live.total_services);
      if (live.total_resources    != null) show('statResources').textContent = fmt(live.total_resources);
      if (live.total_organizations != null) { show('statOrgs').textContent = fmt(live.total_organizations); _kpiOrgCount = live.total_organizations; }
    }
  } catch (_) {}

  // Health summary
  try {
    const summary = await fetch(API_BASE + 'api/health/summary').then(r => r.json());

    // Uptime card — average of critical endpoints
    const crit = summary.filter(s => s.critical && s.uptime_pct != null);
    if (crit.length) {
      const avg = crit.reduce((a, b) => a + b.uptime_pct, 0) / crit.length;
      const el  = show('statUptime');
      el.textContent = avg.toFixed(1) + '%';
      el.className   = 'stat-value ' + (avg >= 99 ? 'text-success' : avg >= 95 ? 'text-warning' : 'text-danger');
    }

    renderEndpointTable(summary);
    renderUptimeChart(summary);

    const newest = summary.find(s => s.last_up);
    if (newest) show('lastChecked').textContent = new Date(newest.last_up + 'Z').toLocaleString('el-GR');
  } catch (_) {}
}

function renderEndpointTable(summary) {
  const el = show('endpointTable');
  if (!summary.length) { el.innerHTML = `<p class="text-muted mb-0">${t('health.no_checks')}</p>`; return; }
  el.innerHTML = `
    <table class="table table-hover align-middle mb-0">
      <thead><tr><th>${t('health.col_endpoint')}</th><th>${t('health.col_status')}</th><th>${t('health.col_uptime')}</th><th>${t('health.col_avg_response')}</th><th>${t('health.col_checks')}</th></tr></thead>
      <tbody>
        ${summary.map(s => `
          <tr>
            <td>
              <div class="d-flex align-items-center">
                ${dot(s.uptime_pct != null ? s.uptime_pct >= 95 : null)}
                <div>
                  <div class="fw-semibold">${s.name}</div>
                  <div class="text-muted small">${s.url}</div>
                </div>
                ${s.critical ? `<span class="badge bg-warning text-dark ms-2" style="font-size:.7rem">${t('health.critical')}</span>` : ''}
              </div>
            </td>
            <td>${statusBadge(s.uptime_pct != null ? s.uptime_pct >= 95 : null)}</td>
            <td><span style="color:${uptimeColor(s.uptime_pct)};font-weight:600">${s.uptime_pct != null ? s.uptime_pct.toFixed(1)+'%' : '—'}</span></td>
            <td class="mono">${s.avg_response_ms != null ? s.avg_response_ms.toFixed(0)+' ms' : '—'}</td>
            <td class="text-muted">${s.total_checks}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

function renderUptimeChart(summary) {
  const ctx = show('uptimeChart').getContext('2d');
  if (_uptimeChart) _uptimeChart.destroy();
  _uptimeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: summary.map(s => s.name),
      datasets: [{
        label: t('health.col_uptime') + ' %',
        data: summary.map(s => s.uptime_pct ?? 0),
        backgroundColor: summary.map(s => uptimeColor(s.uptime_pct) + '33'),
        borderColor:     summary.map(s => uptimeColor(s.uptime_pct)),
        borderWidth: 2, borderRadius: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      layout: { padding: { bottom: 4 } },
      scales: {
        y: { min: 0, max: 100, ticks: { callback: v => v + '%', color: _chartTextColor() }, grid: { color: _chartGridColor() } },
        x: { grid: { display: false }, ticks: { font: { size: 11 }, color: _chartTextColor(), autoSkip: false, maxRotation: 40, minRotation: 0 } }
      }
    }
  });
}

// ── Dataset Catalog tab ──────────────────────────────────────────────────────
let _catalogLoaded = false;
let _catalogStart  = 0;
let _catalogDebounceTimer = null;
let _catalogSortCol = null;   // null = default (relevance while searching, else last-modified)
let _catalogSortDir = 'desc';
const CATALOG_PAGE_SIZE = 20;

// Type, HVD-vs-non-HVD, and harvested-vs-manual summary cards — same
// clickable-filter-card pattern as the Contacts and Communications tabs
// (renderContactsSummary/renderCommsSummary), but rendered small (unlike
// those) since the catalog can stack up to three of these rows at once.
// The three are independent, combinable facets (a dataset can be a
// data-service AND HVD AND harvested all at once), so each gets its own
// row and its own toggleable filter state, rather than the single-
// selection model Contacts uses for role-or-state.
// Shared renderer for the small clickable/informational summary-card rows
// used across the Dataset Catalog, Communications, Contacts, and HVD Quality
// tabs -- same markup and "border+background highlight when active" idiom
// everywhere. Each entry in `cards` must carry: value, label, bg, text, icon,
// and the two fields that vary per tab: `active` (bool, already resolved by
// the caller against whatever filter model that tab uses) and `onclick` (a
// literal JS call as a string, or falsy for a non-clickable informational
// card, e.g. HVD's "Checked" total). `dotInfo` is `{label?}` to show a dot on
// the tab label (with an optional hover label) or falsy to hide it -- callers
// decide when that applies since "is the default/no-filter card selected"
// means different things per tab.
function _renderFilterCardsGrid(elId, cards, tabDotId, dotInfo) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = cards.map(c => {
    const clickable = !!c.onclick;
    const borderColor = c.active ? (CARD_BORDER_COLOR[c.text] || '#0057b8') : 'rgba(0,0,0,.06)';
    return `
    <div class="col-6 col-sm-4 col-lg-2">
      <div class="rounded-3 p-2 d-flex align-items-center gap-2 ${c.bg}"
           style="border:${c.active ? 2 : 1}px solid ${borderColor};${clickable ? 'cursor:pointer' : ''}"
           ${clickable ? `onclick="${c.onclick}"` : ''}${c.title ? ` title="${esc(c.title)}"` : ''}>
        <i class="bi ${c.icon} fs-5 ${c.text}"></i>
        <div>
          <div class="fw-bold fs-6 lh-1 ${c.text}">${fmt(c.value)}</div>
          <div class="text-muted" style="font-size:.7rem">${c.label}</div>
        </div>
      </div>
    </div>`;
  }).join('');

  // Small dot on the tab label itself, so a selection is visible even while
  // looking at a different tab — with the active option's label on hover.
  if (!tabDotId) return;
  const dot = document.getElementById(tabDotId);
  if (!dot) return;
  dot.classList.toggle('d-none', !dotInfo);
  dot.title = (dotInfo && dotInfo.label) || '';
}

function _renderCatalogFilterCards(elId, cards, activeFilter, onclickName, tabDotId) {
  const prepared = cards.map((c, i) => ({ ...c, active: c.filter === activeFilter, onclick: `${onclickName}(${i})` }));
  const activeCard = activeFilter ? cards.find(c => c.filter === activeFilter) : null;
  _renderFilterCardsGrid(elId, prepared, tabDotId, activeCard ? { label: activeCard.label } : null);
}

let _catalogTypeFilter = '';   // '' = all, else an exact CKAN package type (e.g. "dataset")
let _catalogTypeSummaryCards = [];
const _CATALOG_TYPE_ICON = { dataset: 'bi-file-earmark-text', 'data-service': 'bi-hdd-network', decision: 'bi-journal-text' };

function renderCatalogTypeSummary(typeCounts) {
  const el = document.getElementById('catalogTypeSummary');
  if (!Array.isArray(typeCounts) || typeCounts.length < 2) { el.innerHTML = ''; return; }  // nothing to filter if only one type exists
  const total = typeCounts.reduce((sum, ty) => sum + ty.count, 0);
  _catalogTypeSummaryCards = [
    { filter: '', label: t('catalog.filter_type_all'), value: total, bg: "bg-secondary bg-opacity-10", text: "text-secondary", icon: "bi-database" },
    ...typeCounts.map(ty => ({
      filter: ty.name, label: _datasetTypeLabel(ty.name), value: ty.count,
      bg: "bg-primary bg-opacity-10", text: "text-primary", icon: _CATALOG_TYPE_ICON[ty.name] || 'bi-tag',
    })),
  ];
  _renderCatalogFilterCards('catalogTypeSummary', _catalogTypeSummaryCards, _catalogTypeFilter, 'setCatalogTypeFilter', 'catalogTypeTabDot');
}

function setCatalogTypeFilter(idx) {
  const card = _catalogTypeSummaryCards[idx];
  if (!card) return;
  _catalogTypeFilter = card.filter === _catalogTypeFilter ? '' : card.filter;
  _catalogStart = 0;
  loadCatalog();
}

let _catalogHvdFilter = '';   // '' = all, '1' = HVD only, '0' = non-HVD only
let _catalogHvdSummaryCards = [];

function renderCatalogHvdSummary(hvdCount, nonHvdCount) {
  const el = document.getElementById('catalogHvdSummary');
  if (hvdCount == null || nonHvdCount == null) { el.innerHTML = ''; return; }
  _catalogHvdSummaryCards = [
    { filter: '',  label: t('catalog.filter_hvd_all'), value: hvdCount + nonHvdCount, bg: "bg-secondary bg-opacity-10", text: "text-secondary", icon: "bi-database" },
    { filter: '1', label: t('catalog.filter_hvd_only'), value: hvdCount,               bg: "bg-warning bg-opacity-10",    text: "text-warning",   icon: "bi-gem",
      title: "High-Value Dataset — Commission Implementing Regulation (EU) 2023/138" },
    { filter: '0', label: t('catalog.filter_hvd_non'),  value: nonHvdCount,            bg: "bg-secondary bg-opacity-10", text: "text-secondary", icon: "bi-gem" },
  ];
  _renderCatalogFilterCards('catalogHvdSummary', _catalogHvdSummaryCards, _catalogHvdFilter, 'setCatalogHvdFilter', 'catalogHvdTabDot');
}

function setCatalogHvdFilter(idx) {
  const card = _catalogHvdSummaryCards[idx];
  if (!card) return;
  _catalogHvdFilter = card.filter === _catalogHvdFilter ? '' : card.filter;
  _catalogStart = 0;
  loadCatalog();
}

let _catalogHarvestedFilter = '';   // '' = all, '1' = harvested only, '0' = manual only
let _catalogHarvestSummaryCards = [];

function renderCatalogHarvestSummary(harvestedCount, manualCount) {
  const el = document.getElementById('catalogHarvestSummary');
  if (harvestedCount == null || manualCount == null) { el.innerHTML = ''; return; }
  _catalogHarvestSummaryCards = [
    { filter: '',  label: t('catalog.filter_harvest_all'),      value: harvestedCount + manualCount, bg: "bg-secondary bg-opacity-10", text: "text-secondary", icon: "bi-database" },
    { filter: '1', label: t('catalog.filter_harvest_harvested'), value: harvestedCount,               bg: "bg-info bg-opacity-10",      text: "text-info",      icon: "bi-cloud-arrow-down" },
    { filter: '0', label: t('catalog.filter_harvest_manual'),    value: manualCount,                  bg: "bg-success bg-opacity-10",   text: "text-success",   icon: "bi-pencil-square" },
  ];
  _renderCatalogFilterCards('catalogHarvestSummary', _catalogHarvestSummaryCards, _catalogHarvestedFilter, 'setCatalogHarvestFilter', 'catalogHarvestTabDot');
}

function setCatalogHarvestFilter(idx) {
  const card = _catalogHarvestSummaryCards[idx];
  if (!card) return;
  _catalogHarvestedFilter = card.filter === _catalogHarvestedFilter ? '' : card.filter;
  _catalogStart = 0;
  loadCatalog();
}

let _catalogGeoFilter = '';   // '' = all, '1' = geospatial only, '0' = non-geospatial only
let _catalogGeoSummaryCards = [];

function renderCatalogGeoSummary(geoCount, nonGeoCount) {
  const el = document.getElementById('catalogGeoSummary');
  if (geoCount == null || nonGeoCount == null) { el.innerHTML = ''; return; }
  _catalogGeoSummaryCards = [
    { filter: '',  label: t('catalog.filter_geo_all'),  value: geoCount + nonGeoCount, bg: "bg-secondary bg-opacity-10", text: "text-secondary", icon: "bi-database" },
    { filter: '1', label: t('catalog.filter_geo_only'), value: geoCount,               bg: "bg-success bg-opacity-10",   text: "text-success",   icon: "bi-geo-alt",
      title: t('catalog.geo_tooltip') },
    { filter: '0', label: t('catalog.filter_geo_non'),  value: nonGeoCount,            bg: "bg-secondary bg-opacity-10", text: "text-secondary", icon: "bi-geo-alt" },
  ];
  _renderCatalogFilterCards('catalogGeoSummary', _catalogGeoSummaryCards, _catalogGeoFilter, 'setCatalogGeoFilter', 'catalogGeoTabDot');
}

function setCatalogGeoFilter(idx) {
  const card = _catalogGeoSummaryCards[idx];
  if (!card) return;
  _catalogGeoFilter = card.filter === _catalogGeoFilter ? '' : card.filter;
  _catalogStart = 0;
  loadCatalog();
}

function clearCatalogFilters() {
  _catalogTypeFilter = '';
  _catalogHvdFilter = '';
  _catalogHarvestedFilter = '';
  _catalogGeoFilter = '';
  _catalogStart = 0;
  loadCatalog();
}

document.getElementById('datasetsTabBtn').addEventListener('click', () => {
  if (_catalogLoaded) return;
  _catalogLoaded = true;
  loadCatalog();
  _loadCatalogOrgFilter();
  _loadCatalogFormatFilterOptions();
});

function _datasetTypeLabel(type) {
  if (type === 'data-service') return t('catalog.type_data_service');
  if (type === 'decision')     return t('catalog.type_decision');
  if (type && type !== 'dataset') return type;
  return t('catalog.type_dataset');
}

async function _loadCatalogOrgFilter() {
  try {
    if (!_orgsData.length) {
      const json = await fetch(API_BASE + 'api/organizations').then(r => r.json());
      if (json.data) _orgsData = json.data;
    }
    const sel = show('catalogOrgFilter');
    [..._orgsData].sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name)).forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.name;
      opt.textContent = o.title || o.name;
      sel.appendChild(opt);
    });
  } catch (e) { /* filter just stays "All organizations" */ }
}

async function _loadCatalogFormatFilterOptions() {
  try {
    const formats = await fetch(API_BASE + 'api/datasets/formats').then(r => r.json());
    if (!Array.isArray(formats) || !formats.length) return;
    const sel = show('catalogFormatFilter');
    formats.slice(0, 30).forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.name;
      opt.textContent = `${f.name} (${fmt(f.count)})`;
      sel.appendChild(opt);
    });
  } catch (e) { /* filter just stays "All formats" */ }
}

let _catalogFormatChart = null;
async function _loadStatsFormatChart() {
  try {
    const formats = await fetch(API_BASE + 'api/datasets/formats').then(r => r.json());
    if (!Array.isArray(formats) || !formats.length) {
      show('catalogFormatChartWrap').classList.add('d-none');
      show('catalogFormatChartEmpty').classList.remove('d-none');
      return;
    }
    const top = formats.slice(0, 8);
    const otherCount = formats.slice(8).reduce((s, f) => s + f.count, 0);
    const labels = top.map(f => f.name);
    const counts = top.map(f => f.count);
    if (otherCount > 0) { labels.push(t('catalog.formats_other')); counts.push(otherCount); }
    const palette = ['#0057b8','#0dcaf0','#20c997','#ffc107','#fd7e14','#dc3545','#6f42c1','#6c757d','#adb5bd'];
    const ctx = show('catalogFormatChart').getContext('2d');
    if (_catalogFormatChart) _catalogFormatChart.destroy();
    _catalogFormatChart = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: counts, backgroundColor: palette }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 }, color: _chartTextColor() } } },
      },
    });
  } catch (e) {
    show('catalogFormatChartWrap').classList.add('d-none');
    show('catalogFormatChartEmpty').classList.remove('d-none');
  }
}

function _catalogSearchDebounced() {
  clearTimeout(_catalogDebounceTimer);
  _catalogDebounceTimer = setTimeout(() => { _catalogStart = 0; loadCatalog(); }, 400);
}

function sortCatalog(col) {
  if (_catalogSortCol === col) {
    _catalogSortDir = _catalogSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    _catalogSortCol = col;
    _catalogSortDir = (col === 'title' || col === 'org') ? 'asc' : 'desc';
  }
  _catalogStart = 0;
  loadCatalog();
}

function _catalogSortArrow(col) {
  if (_catalogSortCol !== col) return '<span style="opacity:.25;font-size:.8em"> ↕</span>';
  return _catalogSortDir === 'asc' ? ' ↑' : ' ↓';
}

let _catalogTotalCount  = 0;
let _catalogLoadingMore = false;
let _catalogObserver    = null;

function _ensureCatalogObserver() {
  if (!_catalogObserver) {
    _catalogObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) _catalogLoadMore();
    }, { rootMargin: '400px 0px' });
  }
  return _catalogObserver;
}

function _catalogLoadMore() {
  if (_catalogLoadingMore || _catalogStart >= _catalogTotalCount) return;
  loadCatalog(true);
}

function _catalogModifiedLabel(iso) {
  if (!iso) return '—';
  const d = new Date(/[Zz]$/.test(iso) || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + 'Z');
  if (isNaN(d)) return esc(iso.slice(0, 10));
  const now = new Date();
  const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return isToday ? relativeDate(iso) : esc(iso.slice(0, 10));
}

// Keeps loading more pages while the sentinel is still on-screen — plain
// IntersectionObserver only fires on enter/exit, so a short result list that
// never fully leaves the viewport would otherwise stop after one page.
function _catalogMaybeAutoLoadMore() {
  // Bootstrap hides an inactive tab-pane with display:none, which collapses
  // getBoundingClientRect() to all zeros -- that still satisfies the "on
  // screen" check below, so without this guard switching away from Datasets
  // never stops the loop: it free-runs through the entire catalog in the
  // background regardless of which tab is actually showing.
  if (!_isTabActive('tab-datasets')) return;
  const sentinel = document.getElementById('catalogLoadMoreSentinel');
  if (!sentinel || _catalogLoadingMore || _catalogStart >= _catalogTotalCount) return;
  const rect = sentinel.getBoundingClientRect();
  if (rect.top < window.innerHeight && rect.bottom >= 0) _catalogLoadMore();
}

async function loadCatalog(append = false) {
  if (!append) _catalogStart = 0;
  const q  = show('catalogSearch').value.trim();
  const el = show('catalogResults');
  const sentinelBefore = document.getElementById('catalogLoadMoreSentinel');
  if (append) {
    _catalogLoadingMore = true;
    if (sentinelBefore) sentinelBefore.innerHTML = `<div class="spinner-border spinner-border-sm me-2"></div>${t('loading')}`;
  } else {
    if (_catalogObserver) _catalogObserver.disconnect();
    el.innerHTML = `<div class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm me-2"></div>${t('loading')}</div>`;
  }
  try {
    const org   = show('catalogOrgFilter').value;
    const fmt_  = show('catalogFormatFilter').value;
    const since = show('catalogSinceFilter').value;
    const params = new URLSearchParams({ rows: CATALOG_PAGE_SIZE, start: _catalogStart });
    if (q) params.set('q', q);
    if (org) params.set('org', org);
    if (fmt_) params.set('format', fmt_);
    if (_catalogTypeFilter) params.set('type', _catalogTypeFilter);
    if (since) params.set('since', since);
    if (_catalogHvdFilter) params.set('hvd', _catalogHvdFilter);
    if (_catalogHarvestedFilter) params.set('harvested', _catalogHarvestedFilter);
    if (_catalogGeoFilter) params.set('geo', _catalogGeoFilter);
    if (_catalogSortCol) params.set('sort', `${_catalogSortCol}_${_catalogSortDir}`);
    const resp = await fetch(`${API_BASE}api/datasets/search?${params}`);
    const data = await resp.json();
    if (data.error) {
      _catalogTotalCount = 0;
      if (!append) { el.innerHTML = `<div class="alert alert-warning mb-0">${esc(data.error)}</div>`; renderCatalogTypeSummary(null); renderCatalogHvdSummary(null, null); renderCatalogHarvestSummary(null, null); renderCatalogGeoSummary(null, null); }
      return;
    }
    _catalogTotalCount = data.count;
    if (!append) { renderCatalogTypeSummary(data.type_counts); renderCatalogHvdSummary(data.hvd_count, data.non_hvd_count); renderCatalogHarvestSummary(data.harvested_count, data.manual_count); renderCatalogGeoSummary(data.geo_count, data.non_geo_count); }
    show('catalogCount').textContent = q
      ? `${fmt(data.count)} ${t('catalog.results_for')} "${q}"`
      : `${fmt(data.count)} ${t('catalog.total_datasets')}`;
    if (!append && !data.datasets.length) {
      el.innerHTML = `<p class="text-muted text-center py-4">${t('catalog.none')}</p>`;
      return;
    }

    const rowsHtml = data.datasets.map(d => `
      <tr>
        <td>
          ${d.is_hvd ? `<i class="bi bi-gem text-warning me-1" title="${esc(t('catalog.hvd_tooltip'))}"></i>` : ''}
          ${d.harvest_source ? `<i class="bi bi-cloud-arrow-down text-info me-1" title="${esc(t('catalog.harvested_tooltip'))}: ${esc(d.harvest_source)}"></i>` : ''}
          ${d.is_geospatial ? `<i class="bi bi-geo-alt text-success me-1" title="${esc(t('catalog.geo_tooltip'))}"></i>` : ''}
          <a href="#" onclick="openDatasetPanel('${esc(d.name)}');return false;" class="text-decoration-none fw-semibold">${esc(d.title)}</a>
          ${d.type && d.type !== 'dataset' ? `<span class="badge bg-info-subtle text-info-emphasis border ms-1" style="font-size:.65rem">${esc(_datasetTypeLabel(d.type))}</span>` : ''}
        </td>
        <td class="small text-muted">${esc(d.org_title)}</td>
        <td class="text-end">${fmt(d.num_resources)}</td>
        <td class="text-end small text-muted" title="${d.metadata_modified ? esc(d.metadata_modified.replace('T', ' ').slice(0, 16)) : ''}">${_catalogModifiedLabel(d.metadata_modified)}</td>
      </tr>`).join('');

    if (append) {
      const tbody = document.getElementById('catalogTableBody');
      if (tbody) tbody.insertAdjacentHTML('beforeend', rowsHtml);
    } else {
      const th = (col, label, extraClass = '') =>
        `<th class="${extraClass}" style="cursor:pointer;user-select:none" onclick="sortCatalog('${col}')">${label}${_catalogSortArrow(col)}</th>`;
      el.innerHTML = `
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-0">
            <thead><tr>
              ${th('title', t('catalog.col_title'))}
              ${th('org',   t('catalog.col_org'))}
              <th class="text-end" title="${esc(t('catalog.resources_not_sortable'))}">${t('catalog.col_resources')}</th>
              ${th('modified', t('catalog.col_modified'), 'text-end')}
            </tr></thead>
            <tbody id="catalogTableBody">${rowsHtml}</tbody>
          </table>
        </div>
        <div id="catalogLoadMoreSentinel" class="text-center py-3 text-muted small"></div>`;
    }

    _catalogStart += data.datasets.length;

    const sentinel = document.getElementById('catalogLoadMoreSentinel');
    if (sentinel) {
      if (_catalogStart < _catalogTotalCount) {
        sentinel.innerHTML = '';
        _ensureCatalogObserver().observe(sentinel);
      } else {
        _ensureCatalogObserver().unobserve(sentinel);
        sentinel.innerHTML = data.count ? t('catalog.end_of_results') : '';
      }
    }
  } catch (e) {
    if (!append) el.innerHTML = `<div class="alert alert-danger mb-0">${t('error')} ${esc(e.message)}</div>`;
  } finally {
    _catalogLoadingMore = false;
  }
  _catalogMaybeAutoLoadMore();
}

// ── Health tab ───────────────────────────────────────────────────────────────
let _healthLoaded = false;

document.getElementById('healthTabBtn').addEventListener('click', () => {
  if (_healthLoaded) return;
  _healthLoaded = true;
  loadResponseTimeChart();
  loadRecentChecks();
});

async function loadResponseTimeChart() {
  const ep    = show('endpointSelect').value;
  const hours = show('hoursSelect').value;
  try {
    const data = await fetch(`${API_BASE}api/health/history?endpoint=${encodeURIComponent(ep)}&hours=${hours}`).then(r => r.json());
    const ctx  = show('responseTimeChart').getContext('2d');
    if (_rtChart) _rtChart.destroy();

    // Keep every point, including null-response ones (outage / a check that
    // couldn't measure a response time), instead of filtering them out --
    // dropping them entirely gave Chart.js no idea a gap ever existed, just
    // two real points that happened to be far apart in time, which with
    // tension+monotone interpolation it drew as one smooth curve gradually
    // climbing/falling across the whole gap -- reading as real, gradually-
    // changing response times rather than the missing data it actually was.
    const pts  = data.map(d => ({ x: new Date(d.timestamp + 'Z'), y: d.response_time_ms }));
    const down = data.filter(d => !d.is_up).map(d => ({ x: new Date(d.timestamp + 'Z'), y: 0 }));

    _rtChart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          { label: 'Response (ms)', data: pts,  borderColor: '#0057b8', backgroundColor: 'rgba(0,87,184,.08)', fill: true, tension: 0.35, cubicInterpolationMode: 'monotone', pointRadius: 2, pointHoverRadius: 4, spanGaps: false },
          { label: 'Outage',        data: down, borderColor: '#dc3545', backgroundColor: '#dc354566', pointStyle: 'triangle', pointRadius: 8, showLine: false }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: _chartTextColor() } } },
        scales: {
          x: { type: 'time', time: { tooltipFormat: 'dd/MM HH:mm' }, grid: { color: _chartGridColor() }, ticks: { color: _chartTextColor() } },
          y: { min: 0, ticks: { callback: v => v + ' ms', color: _chartTextColor() }, grid: { color: _chartGridColor() } }
        }
      }
    });
  } catch (_) {}
}

async function loadRecentChecks() {
  const ep = show('endpointSelect')?.value ?? '';
  try {
    const data   = await fetch(`${API_BASE}api/health/history?endpoint=${encodeURIComponent(ep)}&hours=2`).then(r => r.json());
    const last20 = data.slice(-20).reverse();
    const el     = show('recentChecksTable');
    if (!last20.length) { el.innerHTML = `<p class="text-muted text-center py-3">${t('health.no_checks')}</p>`; return; }
    el.innerHTML = `
      <table class="table table-sm table-hover mb-0">
        <thead><tr><th>${t('health.col_time')}</th><th>${t('health.col_status')}</th><th>${t('health.col_http')}</th><th>${t('health.col_response')}</th></tr></thead>
        <tbody>
          ${last20.map(d => `
            <tr>
              <td class="text-muted mono">${new Date(d.timestamp + 'Z').toLocaleTimeString('el-GR')}</td>
              <td>${statusBadge(d.is_up)}</td>
              <td class="mono">${d.status_code ?? '—'}</td>
              <td class="mono">${d.response_time_ms != null ? d.response_time_ms.toFixed(0)+' ms' : '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (_) {}
}

// ── Insights tab ─────────────────────────────────────────────────────────────
let _statsLoaded = false;

document.getElementById('statsTabBtn').addEventListener('click', () => {
  if (_statsLoaded) return;
  _statsLoaded = true;
  loadStatsTab();
  _loadStatsFormatChart();
});

// ── Geospatial Insights tab ──────────────────────────────────────────────────
let _geoInsightsLoaded = false;

document.getElementById('geoInsightsTabBtn').addEventListener('click', () => {
  if (_geoInsightsLoaded) return;
  _geoInsightsLoaded = true;
  loadGeoDatasetsMap();
});

// Leaflet measures its container on init; if that happens while the tab-pane
// is still hidden (display:none), the map ends up sized 0x0 and never
// self-corrects. Re-measuring once Bootstrap finishes showing the tab fixes it.
document.getElementById('geoInsightsTabBtn').addEventListener('shown.bs.tab', () => {
  if (_geoDatasetsMap) _geoDatasetsMap.invalidateSize();
});

async function loadStatsTab() {
  // Latest snapshot
  try {
    const snap = await fetch(API_BASE + 'api/stats/latest').then(r => r.ok ? r.json() : null);
    const el   = show('latestSnapshot');
    if (snap && !snap.error) {
      el.innerHTML = `
        <dl class="row mb-0 small">
          <dt class="col-7 text-muted">${t('stats.col_datasets')}</dt>      <dd class="col-5 fw-bold text-end mb-1">${fmt(snap.total_datasets)}</dd>
          <dt class="col-7 text-muted">${t('stats.col_orgs')}</dt> <dd class="col-5 fw-bold text-end mb-1">${fmt(snap.total_organizations)}</dd>
          <dt class="col-7 text-muted">${t('stats.col_resources')}</dt>     <dd class="col-5 fw-bold text-end mb-1">${fmt(snap.total_resources)}</dd>
          <dt class="col-7 text-muted">${t('stats.col_services')}</dt>      <dd class="col-5 fw-bold text-end mb-1">${fmt(snap.total_services)}</dd>
          <dt class="col-12 text-muted mt-2">${t('stats.col_updated')}</dt>
          <dd class="col-12 text-end">${new Date(snap.timestamp + 'Z').toLocaleString('el-GR')}</dd>
        </dl>`;
    } else {
      el.innerHTML = `<p class="text-muted text-center">${t('stats.no_snapshot')}</p>`;
    }
  } catch (_) {}

  // History chart
  try {
    const [history, growth] = await Promise.all([
      fetch(API_BASE + 'api/stats/history?days=365&step=week').then(r => r.json()),
      fetch(API_BASE + 'api/stats/dataset-growth').then(r => r.json()),
    ]);
    _renderStatsChart(history, growth);
    if (growth.enriching) _pollDatasetGrowth();
  } catch (_) {}

}

function _renderStatsChart(history, growth) {
  const wrap       = show('statsChart').closest('div');
  const hasHistory = history && history.length;
  const hasGrowth  = growth && growth.weeks && growth.weeks.length;

  if (!hasHistory && !hasGrowth) {
    if (!growth || !growth.enriching) {
      wrap.innerHTML = `<p class="text-muted text-center py-5">${t('stats.accumulating')}</p>`;
    }
    return;
  }

  const ctx = show('statsChart').getContext('2d');
  if (_statsChart) _statsChart.destroy();

  const rangeEnd   = new Date();
  const rangeStart = new Date(rangeEnd.getTime() - 365 * 24 * 3600 * 1000);

  const datasets = [];
  if (hasGrowth) {
    datasets.push({
      label: t('stats.col_datasets'),
      data:  growth.weeks.map(w => ({ x: new Date(w.week_start + 'T00:00:00Z'), y: w.count })),
      borderColor: '#0057b8', backgroundColor: 'rgba(0,87,184,.08)', fill: true, tension: 0.3, pointRadius: 2, pointHoverRadius: 4,
    });
  }
  if (hasHistory) {
    datasets.push({
      label: t('stats.col_resources'),
      data:  history.filter(d => d.total_resources).map(d => ({ x: new Date(d.timestamp + 'Z'), y: d.total_resources })),
      borderColor: '#0dcaf0', backgroundColor: 'rgba(13,202,240,.08)', fill: true, tension: 0.3, pointRadius: 2, pointHoverRadius: 4,
      hidden: true,
    });
  }

  _statsChart = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: _chartTextColor() } } },
      scales: {
        x: {
          type: 'time',
          time: { unit: 'week', tooltipFormat: 'dd/MM/yyyy', displayFormats: { week: 'dd/MM' } },
          min: rangeStart, max: rangeEnd,
          grid: { color: _chartGridColor() }, ticks: { color: _chartTextColor() },
        },
        y: { min: 0, grid: { color: _chartGridColor() }, ticks: { color: _chartTextColor() } }
      }
    }
  });
}

async function _pollDatasetGrowth(attempts = 0) {
  if (attempts > 12) return;  // give up after ~2 min
  await new Promise(r => setTimeout(r, 10000));
  // Skip the fetch+rebuild while nobody's looking at this tab -- otherwise
  // it keeps re-fetching and fully destroying/rebuilding the Chart.js chart
  // (silently reverting any legend-series toggle) in the background,
  // regardless of which tab is actually open.
  if (!_isTabActive('tab-stats') || document.visibilityState !== 'visible') {
    _pollDatasetGrowth(attempts + 1);
    return;
  }
  try {
    const [history, growth] = await Promise.all([
      fetch(API_BASE + 'api/stats/history?days=365&step=week').then(r => r.json()),
      fetch(API_BASE + 'api/stats/dataset-growth').then(r => r.json()),
    ]);
    _renderStatsChart(history, growth);
    if (growth.enriching) _pollDatasetGrowth(attempts + 1);
  } catch (_) {}
}

// ── Geospatial dataset locations map (Geospatial Insights tab) ──────────────
let _geoDatasetsMap = null;
let _geoDatasetsMarkers = [];

function _initGeoDatasetsMap() {
  if (_geoDatasetsMap || typeof L === 'undefined') return;
  _geoDatasetsMap = L.map('geoDatasetsMap', { attributionControl: true, scrollWheelZoom: true })
    .setView([38.8, 23.7], 6);  // roughly centered on Greece
  _geoDatasetsMap.attributionControl.setPrefix(false);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19, subdomains: 'abcd',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(_geoDatasetsMap);
}

function _renderGeoDatasetsMap(locations) {
  _geoDatasetsMarkers.forEach(m => _geoDatasetsMap.removeLayer(m));
  _geoDatasetsMarkers = [];
  const maxCount = Math.max(1, ...locations.map(l => l.count));
  for (const loc of locations) {
    // Area-proportional (sqrt) radius so a 10x larger org isn't a 10x wider circle.
    const radius = 6 + Math.sqrt(loc.count / maxCount) * 34;
    const marker = L.circleMarker([loc.lat, loc.lon], {
      radius, color: '#198754', fillColor: '#198754', fillOpacity: 0.35, weight: 1.5,
    })
      .bindTooltip(`<strong>${esc(loc.org_title)}</strong><br>${fmt(loc.count)} ${t('stats.geo_map_datasets')}<br><span class="text-muted">${esc(t('stats.geo_map_click_hint'))}</span>`)
      .on('click', () => openOrgPanel(loc.org_name));
    marker.addTo(_geoDatasetsMap);
    _geoDatasetsMarkers.push(marker);
  }
}

async function loadGeoDatasetsMap() {
  _initGeoDatasetsMap();
  try {
    const data = await fetch(API_BASE + 'api/datasets/geo-locations').then(r => r.json());
    const locations = data.locations || [];
    if (locations.length) {
      show('geoMapLoading').classList.add('d-none');
      show('geoMapEmpty').classList.add('d-none');
      _renderGeoDatasetsMap(locations);
      const totalCount = locations.reduce((s, l) => s + l.count, 0);
      show('geoMapSummary').textContent =
        `${fmt(locations.length)} ${t('stats.geo_map_orgs')} · ${fmt(totalCount)} ${t('stats.geo_map_datasets')}`;
    } else if (!data.enriching) {
      show('geoMapLoading').classList.add('d-none');
      show('geoMapEmpty').classList.remove('d-none');
    }
    if (data.enriching) _pollGeoDatasetsMap();
  } catch (_) {
    show('geoMapLoading').classList.add('d-none');
    show('geoMapEmpty').classList.remove('d-none');
  }
}

async function _pollGeoDatasetsMap(attempts = 0) {
  if (attempts > 12) return;  // give up after ~2 min
  await new Promise(r => setTimeout(r, 10000));
  // Same reasoning as _pollDatasetGrowth -- don't re-fetch and rebuild every
  // Leaflet marker while this tab isn't the one showing.
  if (!_isTabActive('tab-geo-insights') || document.visibilityState !== 'visible') {
    _pollGeoDatasetsMap(attempts + 1);
    return;
  }
  try {
    const data = await fetch(API_BASE + 'api/datasets/geo-locations').then(r => r.json());
    const locations = data.locations || [];
    if (locations.length) {
      show('geoMapLoading').classList.add('d-none');
      _renderGeoDatasetsMap(locations);
      const totalCount = locations.reduce((s, l) => s + l.count, 0);
      show('geoMapSummary').textContent =
        `${fmt(locations.length)} ${t('stats.geo_map_orgs')} · ${fmt(totalCount)} ${t('stats.geo_map_datasets')}`;
    }
    if (data.enriching) _pollGeoDatasetsMap(attempts + 1);
  } catch (_) {}
}

// ── Traffic tab ──────────────────────────────────────────────────────────────
let _trafficLoaded = false;
let _trafficPeriod = 30;
let _trafficCustomRange = null;  // { start, end } (YYYY-MM-DD) when a custom range is active, else null
let _trafficChart  = null;

document.getElementById('trafficTabBtn').addEventListener('click', () => {
  if (_trafficLoaded) return;
  _trafficLoaded = true;
  loadTrafficTab();
});

async function setTrafficPeriod(days) {
  _trafficPeriod = days;
  _trafficCustomRange = null;
  [7, 30, 90].forEach(d => {
    const btn = show('trafficBtn' + d);
    btn.className = 'btn btn-sm ' + (d === days ? 'btn-primary' : 'btn-outline-primary');
  });
  await loadTrafficTab();
}

// Mirrors the server's _matomo_date_range(days): "last N days" inclusive of
// today, so From = today - (N-1) and To = today.
function _fillTrafficDatesForPeriod(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  const toISODate = d => d.toISOString().slice(0, 10);
  show('trafficFrom').value = toISODate(start);
  show('trafficTo').value   = toISODate(end);
}

async function applyTrafficCustomRange() {
  const start = show('trafficFrom').value;
  const end   = show('trafficTo').value;
  show('trafficError').classList.add('d-none');
  if (!start || !end) {
    show('trafficError').textContent = t('traffic.range_required');
    show('trafficError').classList.remove('d-none');
    return;
  }
  if (start > end) {
    show('trafficError').textContent = t('traffic.range_invalid');
    show('trafficError').classList.remove('d-none');
    return;
  }
  _trafficCustomRange = { start, end };
  [7, 30, 90].forEach(d => { show('trafficBtn' + d).className = 'btn btn-sm btn-outline-primary'; });
  await loadTrafficTab();
}

function _trafficRangeQuery() {
  const p = new URLSearchParams();
  if (_trafficCustomRange) {
    p.set('start', _trafficCustomRange.start);
    p.set('end', _trafficCustomRange.end);
  } else {
    p.set('days', _trafficPeriod);
  }
  return p.toString();
}

async function loadTrafficTab() {
  show('trafficError').classList.add('d-none');
  if (!_trafficCustomRange) _fillTrafficDatesForPeriod(_trafficPeriod);
  const qs = _trafficRangeQuery();

  const [summary, history, topDatasets, topSearches, topApi, topDownloads] = await Promise.allSettled([
    fetch(API_BASE + 'api/matomo/summary?' + qs).then(r => r.json()),
    fetch(API_BASE + 'api/matomo/visits-history?' + qs).then(r => r.json()),
    fetch(API_BASE + 'api/matomo/top-datasets?' + qs + '&limit=20').then(r => r.json()),
    fetch(API_BASE + 'api/matomo/top-searches?' + qs + '&limit=20').then(r => r.json()),
    fetch(API_BASE + 'api/matomo/top-api-calls?' + qs + '&limit=20').then(r => r.json()),
    fetch(API_BASE + 'api/matomo/top-downloads?' + qs + '&limit=20').then(r => r.json()),
  ]);

  // Summary cards
  const s = summary.status === 'fulfilled' ? summary.value : null;
  if (s && !s.error) {
    show('trafficVisits').textContent    = fmt(s.visits);
    show('trafficUnique').textContent    = (s.unique_approx ? '~' : '') + fmt(s.unique_visitors);
    show('trafficPageviews').textContent = fmt(s.pageviews);
    show('trafficDownloads').textContent = fmt(s.downloads);
    // Show a subtle note when unique visitors is an approximation
    const uniqueLabel = show('trafficUniqueLabel');
    if (uniqueLabel) uniqueLabel.textContent = s.unique_approx ? t('traffic.unique') + ' (est.)' : t('traffic.unique');
  } else if (s && s.error) {
    show('trafficError').textContent = s.error;
    show('trafficError').classList.remove('d-none');
  }

  // Visits trend chart
  if (history.status === 'fulfilled' && Array.isArray(history.value)) {
    renderTrafficChart(history.value);
  }

  // Top datasets
  if (topDatasets.status === 'fulfilled' && Array.isArray(topDatasets.value)) {
    renderTrafficTopDatasets(topDatasets.value);
  } else {
    const msg = topDatasets.status === 'fulfilled' && topDatasets.value.error
      ? topDatasets.value.error : t('traffic.failed');
    show('trafficTopDatasets').innerHTML = `<p class="text-muted small">${msg}</p>`;
  }

  // Top searches
  if (topSearches.status === 'fulfilled' && Array.isArray(topSearches.value)) {
    renderTrafficTopSearches(topSearches.value);
  } else {
    const msg = topSearches.status === 'fulfilled' && topSearches.value.error
      ? topSearches.value.error : t('traffic.failed');
    show('trafficTopSearches').innerHTML = `<p class="text-muted small">${msg}</p>`;
  }

  // Top API calls
  if (topApi.status === 'fulfilled' && !topApi.value.error) {
    show('trafficApiCalls').textContent = fmt(topApi.value.total);
    renderTrafficTopApi(topApi.value.endpoints || []);
  } else {
    show('trafficTopApi').innerHTML = `<p class="text-muted small">${t('traffic.no_api2')}</p>`;
  }

  // Top downloads
  if (topDownloads.status === 'fulfilled' && Array.isArray(topDownloads.value)) {
    renderTrafficTopDownloads(topDownloads.value);
  } else {
    const msg = topDownloads.status === 'fulfilled' && topDownloads.value.error
      ? topDownloads.value.error : t('traffic.failed');
    show('trafficTopDownloads').innerHTML = `<p class="text-muted small">${msg}</p>`;
  }
}

function _trafficDayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const locale  = _lang === 'el' ? 'el-GR' : 'en-GB';
  const weekday = d.toLocaleDateString(locale, { weekday: 'short' });
  const dm      = d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
  return `${weekday} ${dm}`;
}

function renderTrafficChart(history) {
  const ctx = show('trafficChart').getContext('2d');
  if (_trafficChart) _trafficChart.destroy();

  const hasDownloads = history.some(d => (d.downloads || 0) > 0);

  const datasets = [
    {
      label: t('traffic.pageviews'),
      data: history.map(d => d.pageviews),
      borderColor: '#0dcaf0', backgroundColor: 'rgba(13,202,240,.06)',
      fill: true, tension: 0.3, pointRadius: 2, borderWidth: 1.5,
    },
    {
      label: t('traffic.visits'),
      data: history.map(d => d.visits),
      borderColor: '#0057b8', backgroundColor: 'rgba(0,87,184,.08)',
      fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2,
    },
    {
      label: t('traffic.unique'),
      data: history.map(d => d.unique_visitors),
      borderColor: '#198754', backgroundColor: 'rgba(25,135,84,.05)',
      fill: true, tension: 0.3, pointRadius: 2, borderWidth: 1.5,
    },
  ];

  if (hasDownloads) {
    datasets.push({
      label: t('traffic.downloads'),
      data: history.map(d => d.downloads),
      borderColor: '#fd7e14', backgroundColor: 'rgba(253,126,20,.06)',
      fill: false, tension: 0.3, pointRadius: 3, borderWidth: 2,
      borderDash: [4, 3],
      yAxisID: 'yDownloads',
    });
  }

  _trafficChart = new Chart(ctx, {
    type: 'line',
    data: { labels: history.map(d => _trafficDayLabel(d.date)), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { color: _chartTextColor() } } },
      scales: {
        x: { grid: { color: _chartGridColor() }, ticks: { maxTicksLimit: 10, font: { size: 11 }, color: _chartTextColor() } },
        y: { min: 0, grid: { color: _chartGridColor() }, ticks: { font: { size: 11 }, color: _chartTextColor() }, title: { display: false } },
        ...(hasDownloads ? {
          yDownloads: {
            position: 'right', min: 0,
            grid: { drawOnChartArea: false },
            ticks: { font: { size: 10 }, color: '#fd7e14' },
            title: { display: true, text: t('traffic.downloads'), color: '#fd7e14', font: { size: 10 } },
          }
        } : {}),
      }
    }
  });
}

function renderTrafficTopDatasets(datasets) {
  const el = show('trafficTopDatasets');
  if (!datasets.length) {
    el.innerHTML = `<p class="text-muted small">${t('traffic.no_dataset')}</p>`;
    return;
  }
  const max = Math.max(...datasets.map(d => d.visits), 1);
  el.innerHTML = `
    <div style="max-height:380px;overflow-y:auto">
      <table class="table table-sm table-hover mb-0">
        <thead class="sticky-top bg-white">
          <tr><th>${t('traffic.col_dataset')}</th><th class="text-end" style="width:80px">${t('traffic.col_visits')}</th></tr>
        </thead>
        <tbody>
          ${datasets.map(d => `
            <tr>
              <td style="max-width:260px">
                <a href="#" onclick="openDatasetPanel('${esc(d.slug)}');return false;"
                   class="text-decoration-none small">${esc(d.title || d.slug)}</a>
                <div class="mt-1" style="height:2px;border-radius:1px;background:#e9ecef">
                  <div style="width:${Math.round(d.visits/max*100)}%;height:100%;background:#0057b8;border-radius:1px"></div>
                </div>
              </td>
              <td class="text-end fw-semibold small">${fmt(d.visits)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderTrafficTopSearches(searches) {
  const el = show('trafficTopSearches');
  if (!searches.length) {
    el.innerHTML = `<p class="text-muted small">${t('traffic.no_search')}</p>`;
    return;
  }
  const max = Math.max(...searches.map(s => s.searches), 1);
  el.innerHTML = `
    <div style="max-height:380px;overflow-y:auto">
      <table class="table table-sm table-hover mb-0">
        <thead class="sticky-top bg-white">
          <tr><th>${t('traffic.col_query')}</th><th class="text-end" style="width:80px">${t('traffic.col_searches')}</th></tr>
        </thead>
        <tbody>
          ${searches.map(s => `
            <tr>
              <td style="max-width:260px">
                <span class="small">${s.keyword.replace(/</g,'&lt;')}</span>
                <div class="mt-1" style="height:2px;border-radius:1px;background:#e9ecef">
                  <div style="width:${Math.round(s.searches/max*100)}%;height:100%;background:#198754;border-radius:1px"></div>
                </div>
              </td>
              <td class="text-end fw-semibold small">${fmt(s.searches)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderTrafficTopApi(endpoints) {
  const el = show('trafficTopApi');
  if (!endpoints.length) {
    el.innerHTML = `<p class="text-muted small">${t('traffic.no_api')}</p>`;
    return;
  }
  const max = Math.max(...endpoints.map(e => e.visits), 1);
  el.innerHTML = `
    <div style="max-height:380px;overflow-y:auto">
      <table class="table table-sm table-hover mb-0">
        <thead class="sticky-top bg-white">
          <tr><th>${t('traffic.col_endpoint')}</th><th class="text-end" style="width:80px">${t('traffic.col_calls')}</th></tr>
        </thead>
        <tbody>
          ${endpoints.map(e => `
            <tr>
              <td style="max-width:260px">
                <span class="small mono text-truncate d-block" title="${e.path.replace(/"/g,'&quot;')}">${e.path.replace(/</g,'&lt;')}</span>
                <div class="mt-1" style="height:2px;border-radius:1px;background:#e9ecef">
                  <div style="width:${Math.round(e.visits/max*100)}%;height:100%;background:#dc3545;border-radius:1px"></div>
                </div>
              </td>
              <td class="text-end fw-semibold small">${fmt(e.visits)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderTrafficTopDownloads(downloads) {
  const el = show('trafficTopDownloads');
  if (!downloads.length) {
    el.innerHTML = `<p class="text-muted small">${t('traffic.no_downloads')}</p>`;
    return;
  }
  const max = Math.max(...downloads.map(d => d.visits), 1);
  el.innerHTML = `
    <div style="max-height:380px;overflow-y:auto">
      <table class="table table-sm table-hover mb-0">
        <thead class="sticky-top bg-white">
          <tr><th>${t('traffic.col_file')}</th><th class="text-end" style="width:80px">${t('traffic.col_downloads')}</th></tr>
        </thead>
        <tbody>
          ${downloads.map(d => {
            const name = d.url.split('/').pop().split('?')[0] || d.url;
            return `
            <tr>
              <td style="max-width:260px">
                <a href="${d.url.replace(/"/g,'&quot;')}" target="_blank"
                   class="small text-decoration-none text-truncate d-block" title="${d.url.replace(/"/g,'&quot;')}">${name.replace(/</g,'&lt;')}</a>
                <div class="mt-1" style="height:2px;border-radius:1px;background:#e9ecef">
                  <div style="width:${Math.round(d.visits/max*100)}%;height:100%;background:#ffc107;border-radius:1px"></div>
                </div>
              </td>
              <td class="text-end fw-semibold small">${fmt(d.visits)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

// ── HVD compliance check (SHACL) ─────────────────────────────────────────────
let _hvdLastResult = null;  // set by _renderHvdCheck() -- used to warn before an unnecessary re-run
let _hvdSortCol = 'violation_count';
let _hvdSortDir = 'desc';
let _hvdViewMode = 'grouped';
let _hvdExpandedOrgs = new Set();
// Set right before a render call that should reveal-animate exactly the one
// group just toggled -- see _renderHvdTable's comment.
let _hvdRevealKey = null;
let _hvdGroupsCache = [];  // [[orgTitle, datasets[]], ...] from the most recent table render
let _hvdActiveFilters = new Set();  // summary-card filter keys currently toggled on
let _hvdSummaryCards = [];

// Each card key maps to a predicate over a flagged dataset row. Independent,
// combinable facets (a dataset can be non-conforming AND have no API access
// at once) -- same reasoning as the Dataset Catalog's Type/HVD/Harvested
// filter cards -- so toggling one narrows the table without resetting the
// others; all active predicates must match (AND).
const HVD_FILTER_PREDICATES = {
  compliant:            d => d.flagged === false,
  non_conforming:       d => !d.conforms,
  legal_citation_issue: d => d.legal_citation_issue,
  no_api_access:        d => d.no_api_access,
  license_missing:      d => d.license_status === 'missing',
  license_non_open:     d => d.license_status === 'non_open',
  publisher_mismatch:   d => d.publisher_mismatch,
};

// Datasets with no issue at all are hidden from the default (flagged-only)
// view -- same as before this became a filter card -- but selecting the
// "Compliant" card explicitly asks for them, so it lifts that default hiding.
const HVD_ISSUE_FILTER_KEYS = ['non_conforming', 'legal_citation_issue', 'no_api_access', 'license_missing', 'license_non_open', 'publisher_mismatch'];

// Pure -- what _hvdActiveFilters would become if `key` were toggled right
// now, without mutating it. Shared by the real toggle handler and by
// _hvdCardCount's "what would this card show if I clicked it" preview, so
// the two can never drift out of sync with each other.
function _hvdFiltersIfToggled(key) {
  const next = new Set(_hvdActiveFilters);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
    // license_missing/license_non_open are two values of the same field --
    // a dataset can never match both, so selecting one clears the other.
    if (key === 'license_missing')  next.delete('license_non_open');
    if (key === 'license_non_open') next.delete('license_missing');
    // "Compliant" means zero issues, so it can never match alongside any
    // issue-flag filter (and vice versa) -- AND-combining them would always
    // produce an empty result, so selecting one clears the other side.
    if (key === 'compliant') HVD_ISSUE_FILTER_KEYS.forEach(k => next.delete(k));
    else if (HVD_ISSUE_FILTER_KEYS.includes(key)) next.delete('compliant');
  }
  return next;
}

// Single source of truth for "which datasets are currently visible", shared
// by the table render and by every summary card's count -- so a card's
// number can never disagree with what the table underneath actually shows.
function _hvdFilteredDatasets(filters) {
  const source = _hvdLastResult?.datasets || [];
  let list = filters.has('compliant') ? source : source.filter(d => d.flagged !== false);
  if (filters.size) list = list.filter(d => [...filters].every(key => HVD_FILTER_PREDICATES[key](d)));
  const q = _ns(show('hvdResultsSearchInput')?.value || '').trim();
  if (q) list = list.filter(d => _ns(d.title).includes(q) || _ns(d.org_title || '').includes(q));
  return list;
}

// A filterable card's count reflects the current search text and every
// *other* active filter -- same "faceted search" convention as the Dataset
// Catalog's filter cards -- so an unselected card previews "how many you'd
// get if you added this one" and an already-selected card shows "how many
// currently match" (the same set the table displays). Recomputed on every
// filter toggle and on every (debounced) search keystroke, not just once
// per check run, which is what made these numbers static before.
function _hvdCardCount(key) {
  if (key === null) return _hvdLastResult?.summary?.checked ?? 0;
  const filters = _hvdActiveFilters.has(key) ? _hvdActiveFilters : _hvdFiltersIfToggled(key);
  return _hvdFilteredDatasets(filters).length;
}

// Compliance = SHACL-shape-driven checks (structural conformance, legal
// citation, API access). Metadata = checks the SHACL shapes themselves can't
// express (license openness, publisher name vs. the real CKAN organization)
// -- same "each gets its own tab, all combine (AND)" reasoning as the
// Dataset Catalog's Type/HVD/Harvested/Geo tabs.
function _renderHvdSummaryCards() {
  const s = _hvdLastResult.summary;
  const checkedCard = { key: null, value: s.checked, label: t('quality.hvd_checked'), bg: 'bg-secondary bg-opacity-10', text: 'text-secondary', icon: 'bi-list-ul' };
  _hvdSummaryCards = [
    { ...checkedCard, group: 'compliance' },
    { key: 'compliant', group: 'compliance', value: _hvdCardCount('compliant'), label: t('quality.hvd_compliant'), bg: 'bg-success bg-opacity-10', text: 'text-success', icon: 'bi-check-circle' },
    { key: 'non_conforming',       group: 'compliance', value: _hvdCardCount('non_conforming'),       label: t('quality.hvd_non_conforming'), bg: 'bg-danger bg-opacity-10',  text: 'text-danger',  icon: 'bi-x-octagon' },
    { key: 'legal_citation_issue', group: 'compliance', value: _hvdCardCount('legal_citation_issue'), label: t('quality.hvd_legal_issue'),    bg: 'bg-warning bg-opacity-10', text: 'text-warning', icon: 'bi-file-earmark-text' },
    { key: 'no_api_access',        group: 'compliance', value: _hvdCardCount('no_api_access'),        label: t('quality.hvd_no_api'),         bg: 'bg-warning bg-opacity-10', text: 'text-warning', icon: 'bi-hdd-network' },
    { ...checkedCard, group: 'metadata' },
    { key: 'license_missing',    group: 'metadata', value: _hvdCardCount('license_missing'),    label: t('quality.hvd_license_missing'),   bg: 'bg-danger bg-opacity-10',  text: 'text-danger',  icon: 'bi-file-earmark-x' },
    { key: 'license_non_open',   group: 'metadata', value: _hvdCardCount('license_non_open'),   label: t('quality.hvd_license_non_open'),  bg: 'bg-warning bg-opacity-10', text: 'text-warning', icon: 'bi-file-earmark-lock' },
    { key: 'publisher_mismatch', group: 'metadata', value: _hvdCardCount('publisher_mismatch'), label: t('quality.hvd_publisher_mismatch'),bg: 'bg-warning bg-opacity-10', text: 'text-warning', icon: 'bi-person-badge' },
  ];
  _renderHvdCardGroup('hvdComplianceSummary', _hvdSummaryCards.filter(c => c.group === 'compliance'), 'hvdComplianceTabDot');
  _renderHvdCardGroup('hvdMetadataSummary',   _hvdSummaryCards.filter(c => c.group === 'metadata'),   'hvdMetadataTabDot');
}

function _hvdFlaggedCount() {
  return (_hvdLastResult?.datasets || []).filter(d => d.flagged !== false).length;
}

function _renderHvdCardGroup(elId, cards, tabDotId) {
  const prepared = cards.map(c => {
    const clickable = c.key !== null;
    return { ...c, active: clickable && _hvdActiveFilters.has(c.key), onclick: clickable ? `toggleHvdCardFilter('${c.key}')` : null };
  });
  const hasActive = cards.some(c => c.key !== null && _hvdActiveFilters.has(c.key));
  _renderFilterCardsGrid(elId, prepared, tabDotId, hasActive ? {} : null);
}

function toggleHvdCardFilter(key) {
  _hvdActiveFilters = _hvdFiltersIfToggled(key);
  _renderHvdSummaryCards();
  _renderHvdTable();
}

function clearHvdCardFilters() {
  _hvdActiveFilters.clear();
  _renderHvdSummaryCards();
  _renderHvdTable();
}

// Shared by every long-running, incrementally-progressing operation on the
// site (HVD/DCAT-AP/GeoDCAT-AP checks, the Contacts tab's cold portal-members
// load) -- anything that can report {completed, total} as it goes, rather
// than a plain indeterminate spinner for something that's just "still
// fetching." Expects a "${prefix}ProgressWrap" containing "${prefix}ProgressBar"
// / "${prefix}ProgressLabel" / "${prefix}ProgressPct" -- see _progressBarHtml
// for a ready-made block using that convention.
// unit is an optional trailing label (e.g. "organizations") clarifying what
// completed/total are actually counting -- worth passing whenever that
// count could otherwise be mistaken for something else the page also shows
// a number for (e.g. Portal Members' progress counts organizations
// processed, one organization_show call each, not members loaded -- and
// 482 organizations happens to be exactly what the header's own
// "Organizations" KPI card shows too, so leaving it unlabeled reads as
// members loaded / members total).
function _showProgressBar(prefix, completed, total, unit = '') {
  const wrap = document.getElementById(`${prefix}ProgressWrap`);
  if (wrap) wrap.classList.remove('d-none');
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const bar = document.getElementById(`${prefix}ProgressBar`);
  if (bar) { bar.style.width = pct + '%'; bar.setAttribute('aria-valuenow', pct); }
  const label = document.getElementById(`${prefix}ProgressLabel`);
  if (label) label.textContent = `${fmt(completed)} / ${fmt(total)}` + (unit ? ` ${unit}` : '');
  const pctEl = document.getElementById(`${prefix}ProgressPct`);
  if (pctEl) pctEl.textContent = `${pct}%`;
}

function _hideProgressBar(prefix) {
  document.getElementById(`${prefix}ProgressWrap`)?.classList.add('d-none');
}

// For operations whose progress UI is injected dynamically (rather than a
// static block toggled with d-none, like the quality checks' markup in
// index.html) -- same id convention, so _showProgressBar/_hideProgressBar
// work on it unmodified.
function _progressBarHtml(prefix, wrapClass = 'mb-3', wrapStyle = '') {
  return `
    <div id="${prefix}ProgressWrap" class="${wrapClass} d-none"${wrapStyle ? ` style="${wrapStyle}"` : ''}>
      <div class="d-flex justify-content-between small text-muted mb-1">
        <span id="${prefix}ProgressLabel"></span>
        <span id="${prefix}ProgressPct"></span>
      </div>
      <div class="progress" style="height:6px">
        <div id="${prefix}ProgressBar" class="progress-bar" role="progressbar" style="width:0%"></div>
      </div>
    </div>`;
}

function _showHvdProgress(completed, total) { _showProgressBar('hvd', completed, total); }

function _resetHvdControls() {
  show('hvdCheckBtn').disabled = false;
  _hideProgressBar('hvd');
  const cancelBtn = show('hvdCancelBtn');
  cancelBtn.classList.add('d-none');
  cancelBtn.disabled = false;
  cancelBtn.innerHTML = `<i class="bi bi-x-circle me-1"></i><span data-i18n="quality.hvd_cancel">${t('quality.hvd_cancel')}</span>`;
}

let _hvdRerunModal = null;

function runHvdCheck() {
  if (_hvdLastResult?.finished_at) {
    show('hvdRerunLastRun').textContent = t('quality.hvd_last_run') + ' ' + relativeDate(_hvdLastResult.finished_at);
    if (!_hvdRerunModal) _hvdRerunModal = new bootstrap.Modal(document.getElementById('hvdRerunModal'));
    _hvdRerunModal.show();
    return;
  }
  _startHvdCheck();
}

function _confirmHvdRerun() {
  if (_hvdRerunModal) _hvdRerunModal.hide();
  _startHvdCheck();
}

async function _startHvdCheck() {
  const btn = show('hvdCheckBtn');
  const el  = show('hvdCheckResults');
  try {
    const resp = await fetch(API_BASE + 'api/quality/hvd-check', { method: 'POST' }).then(r => r.json());
    if (resp.error) {
      el.innerHTML = `<div class="alert alert-warning mb-0"><i class="bi bi-key me-2"></i>${esc(resp.error)}</div>`;
      return;
    }
    if (!resp.started && !resp.already_running) return;  // e.g. non-admin: silently ignored by the backend gate
    btn.disabled = true;
    show('hvdCancelBtn').classList.remove('d-none');
    _showHvdProgress(0, 0);
    el.innerHTML = `<div class="text-center py-4 text-muted">${esc(t('quality.hvd_running'))}</div>`;
    _pollHvdCheck();
  } catch (e) {
    el.innerHTML = `<div class="alert alert-danger mb-0">${t('error')} ${esc(e.message)}</div>`;
  }
}

function downloadHvdExcel() {
  const params = new URLSearchParams();
  if (_hvdActiveFilters.size) params.set('filters', [..._hvdActiveFilters].join(','));
  const q = show('hvdResultsSearchInput')?.value.trim();
  if (q) params.set('q', q);
  window.location.href = `${API_BASE}api/quality/hvd-check/export?${params}`;
}

async function cancelHvdCheck() {
  const btn = show('hvdCancelBtn');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>${t('quality.hvd_cancelling')}`;
  try {
    await fetch(API_BASE + 'api/quality/hvd-check/cancel', { method: 'POST' });
  } catch (e) { /* the next poll tick will reflect whatever the server ends up doing */ }
}

async function _pollHvdCheck(attempts = 0) {
  // Checking ~1,100 datasets one by one (rate-limited to be a considerate API
  // citizen) can genuinely take several minutes -- give up only after ~20 min.
  // The backend run isn't tied to this poll loop: if the tab is closed or
  // this gives up, the check keeps running server-side and the result is
  // still there next time "Run HVD Check" is clicked.
  if (attempts > 240) {
    _resetHvdControls();
    show('hvdCheckResults').innerHTML =
      `<div class="alert alert-warning mb-0">${esc(t('quality.hvd_still_running'))}</div>`;
    return;
  }
  await new Promise(r => setTimeout(r, 5000));
  try {
    const data = await fetch(API_BASE + 'api/quality/hvd-check').then(r => r.json());
    if (data.running) {
      _showHvdProgress(data.completed, data.total);
      if (data.cancelling) {
        const cancelBtn = show('hvdCancelBtn');
        cancelBtn.disabled = true;
        cancelBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>${t('quality.hvd_cancelling')}`;
      }
      _pollHvdCheck(attempts + 1);
      return;
    }
    _resetHvdControls();
    if (data.error) {
      show('hvdCheckResults').innerHTML = `<div class="alert alert-danger mb-0">${t('error')} ${esc(data.error)}</div>`;
      return;
    }
    if (data.result) _renderHvdCheck(data.result);
  } catch (e) {
    _resetHvdControls();
  }
}

function _renderHvdCheck(result) {
  _hvdLastResult = result;
  _hvdActiveFilters = new Set();
  show('hvdResultsSearchInput').value = '';
  const s = result.summary;
  show('hvdLastRunAt').textContent = result.finished_at
    ? t('quality.hvd_last_run') + ' ' + relativeDate(result.finished_at) : '';
  show('hvdExportBtn').classList.toggle('d-none', !(result.datasets || []).length);
  _updateHvdViewControls();
  const partialNote = result.partial
    ? `<div class="alert alert-secondary small py-2 mb-3"><i class="bi bi-info-circle me-1"></i>${t('quality.hvd_partial_note').replace('{n}', fmt(s.checked)).replace('{total}', fmt(s.total))}</div>`
    : '';
  const cardsHtml = `
    <div class="p-2 rounded-3 mb-3 filter-summary-panel">
      <div class="d-flex justify-content-between align-items-center">
        <ul class="nav nav-underline small mb-2">
          <li class="nav-item">
            <button class="nav-link active py-1 px-2" data-bs-toggle="tab" data-bs-target="#hvdComplianceSummaryPane" type="button">
              <i class="bi bi-x-octagon me-1"></i><span data-i18n="quality.hvd_filter_group_compliance">${t('quality.hvd_filter_group_compliance')}</span>
              <span id="hvdComplianceTabDot" class="rounded-circle d-none ms-1" style="width:6px;height:6px;background:#0057b8;display:inline-block"></span>
            </button>
          </li>
          <li class="nav-item">
            <button class="nav-link py-1 px-2" data-bs-toggle="tab" data-bs-target="#hvdMetadataSummaryPane" type="button">
              <i class="bi bi-file-earmark-lock me-1"></i><span data-i18n="quality.hvd_filter_group_metadata">${t('quality.hvd_filter_group_metadata')}</span>
              <span id="hvdMetadataTabDot" class="rounded-circle d-none ms-1" style="width:6px;height:6px;background:#0057b8;display:inline-block"></span>
            </button>
          </li>
        </ul>
        <button type="button" class="btn btn-sm btn-link text-muted text-decoration-none py-0 px-1 mb-2 flex-shrink-0" onclick="clearHvdCardFilters()">
          <i class="bi bi-x-circle me-1"></i><span data-i18n="filters.clear">${t('filters.clear')}</span>
        </button>
      </div>
      <div class="tab-content">
        <div class="tab-pane fade show active" id="hvdComplianceSummaryPane">
          <div id="hvdComplianceSummary" class="row g-2"></div>
        </div>
        <div class="tab-pane fade" id="hvdMetadataSummaryPane">
          <div id="hvdMetadataSummary" class="row g-2"></div>
        </div>
      </div>
    </div>`;

  const failedNote = s.failed_to_fetch
    ? `<p class="text-muted small mb-2">${t('quality.hvd_failed_note').replace('{n}', fmt(s.failed_to_fetch))}</p>` : '';
  const cacheNote = s.reused_from_cache
    ? `<p class="text-muted small mb-2"><i class="bi bi-lightning-charge me-1"></i>${t('quality.hvd_cache_note').replace('{n}', fmt(s.reused_from_cache)).replace('{total}', fmt(s.total))}</p>`
    : '';

  if (!result.datasets.length) {
    show('hvdCheckResults').innerHTML = partialNote + cardsHtml + cacheNote + failedNote +
      `<p class="text-success small mb-0"><i class="bi bi-check-circle me-1"></i>${t('quality.hvd_all_clean')}</p>`;
    _renderHvdSummaryCards();
    return;
  }

  // Even with no issues, datasets are still there to browse (via "show
  // compliant datasets") -- only skip the table entirely when nothing at
  // all was checked, handled above.
  const allCleanNote = !_hvdFlaggedCount()
    ? `<p class="text-success small mb-2"><i class="bi bi-check-circle me-1"></i>${t('quality.hvd_all_clean')}</p>` : '';

  _hvdExpandedOrgs = new Set();
  show('hvdCheckResults').innerHTML = partialNote + cardsHtml + cacheNote + failedNote + allCleanNote + `<div id="hvdTableWrap"></div>`;
  _renderHvdSummaryCards();
  _renderHvdTable();
}

function _hvdCompare(a, b, col) {
  switch (col) {
    case 'title':      return a.title.localeCompare(b.title);
    case 'legal_citation_issue':
    case 'no_api_access':
    case 'publisher_mismatch':
      return (a[col] ? 1 : 0) - (b[col] ? 1 : 0);
    case 'license_status': {
      const rank = { missing: 2, non_open: 1, open: 0 };
      return (rank[a.license_status] ?? 0) - (rank[b.license_status] ?? 0);
    }
    default: return a.violation_count - b.violation_count;
  }
}

function _updateHvdViewControls() {
  const hasData = !!(_hvdLastResult?.datasets || []).length;
  show('hvdViewToggle').classList.toggle('d-none', !hasData);
  show('hvdViewFlatBtn').className    = 'btn btn-sm ' + (_hvdViewMode === 'flat'    ? 'btn-primary' : 'btn-outline-primary');
  show('hvdViewGroupedBtn').className = 'btn btn-sm ' + (_hvdViewMode === 'grouped' ? 'btn-primary' : 'btn-outline-primary');
  show('hvdExpandAllBtn').classList.toggle('d-none', !hasData || _hvdViewMode !== 'grouped');
  show('hvdCollapseAllBtn').classList.toggle('d-none', !hasData || _hvdViewMode !== 'grouped');
}

function setHvdView(mode) {
  _hvdViewMode = mode;
  _updateHvdViewControls();
  _renderHvdTable();
}

function sortHvdTable(col) {
  if (_hvdSortCol === col) {
    _hvdSortDir = _hvdSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    _hvdSortCol = col;
    _hvdSortDir = col === 'title' ? 'asc' : 'desc';
  }
  _renderHvdTable();
}

function hvdSortArrow(col) {
  if (_hvdSortCol !== col) return '<span style="opacity:.25;font-size:.8em"> ↕</span>';
  return _hvdSortDir === 'asc' ? ' ↑' : ' ↓';
}

function toggleHvdOrg(idx) {
  const entry = _hvdGroupsCache[idx];
  if (!entry) return;
  const [orgTitle] = entry;
  if (_hvdExpandedOrgs.has(orgTitle)) {
    _hvdExpandedOrgs.delete(orgTitle);
  } else {
    _hvdExpandedOrgs.add(orgTitle);
    _hvdRevealKey = orgTitle;  // only fade in on expand, not collapse
  }
  // No fetch involved here (every dataset's result is already in memory),
  // so unlike Comms' toggles this only ever needs the height smoothing, not
  // a spinner -- _renderHvdTable runs synchronously either way.
  _animateHeightSwap(show('hvdTableWrap'), _renderHvdTable);
}

function expandAllHvd() {
  _hvdGroupsCache.forEach(([orgTitle]) => _hvdExpandedOrgs.add(orgTitle));
  _renderHvdTable();
}

function collapseAllHvd() {
  _hvdExpandedOrgs.clear();
  _renderHvdTable();
}

function _hvdRowHtml(d, { indent = false, hidden = false, showOrg = false, reveal = false } = {}) {
  return `
      <tr${hidden ? ' style="display:none"' : ''}${reveal ? ' class="just-revealed"' : ''}>
        <td${indent ? ' class="ps-4"' : ''}><a href="#" onclick="openDatasetPanel('${esc(d.name)}');return false;" class="text-decoration-none">${esc(d.title)}</a></td>
        ${showOrg ? `<td class="text-muted small">${esc(d.org_title || t('quality.hvd_unknown_org'))}</td>` : ''}
        <td>${d.conforms ? '' : `<span class="badge bg-danger" title="${esc(t('quality.hvd_non_conforming'))}">${d.violation_count}</span>`}</td>
        <td>${d.legal_citation_issue ? `<i class="bi bi-file-earmark-text text-warning" title="${esc(t('quality.hvd_legal_issue'))}"></i>` : ''}</td>
        <td>${d.no_api_access ? `<i class="bi bi-hdd-network text-warning" title="${esc(t('quality.hvd_no_api'))}"></i>` : ''}</td>
        <td>${d.license_status === 'missing' ? `<span class="badge bg-danger">${t('quality.hvd_license_missing')}</span>`
            : d.license_status === 'non_open' ? `<span class="badge bg-warning text-dark">${t('quality.hvd_license_non_open')}</span>`
            : `<span class="badge bg-success">${t('quality.hvd_license_open')}</span>`}</td>
        <td>${d.publisher_mismatch
            ? `<i class="bi bi-person-badge text-warning" title="${esc(t('quality.hvd_publisher_mismatch_hint').replace('{org}', d.org_title || ''))}"></i>`
            : ''}</td>
        <td>${d.details.length ? `<details><summary class="small text-muted" style="cursor:pointer">${t('quality.hvd_details')}</summary>
          <ul class="small mb-0 mt-1">${d.details.map(v => `<li class="${v.severity === 'violation' ? 'text-danger' : 'text-warning'}" title="${esc(v.raw_message || '')}">${esc(v.message)}${v.count > 1 ? ` <span class="text-muted">(×${v.count})</span>` : ''}</li>`).join('')}</ul>
        </details>` : ''}</td>
      </tr>`;
}

// Fixed column widths, matched to _hvdRowHtml's own td order -- without
// these the table has no explicit column widths at all, so the browser
// sizes them from whatever's actually in the tbody. A collapsed group row
// is one single colspan cell with no per-column content to size against;
// an expanded one suddenly has real per-column content. Toggling a group
// was recalculating every column's width (and often wrapping header text
// differently) each time, on top of the height transition -- table-layout:
// fixed + this colgroup keeps every column's width constant regardless of
// which rows are currently expanded.
function _hvdColgroup(showOrg) {
  return showOrg
    ? '<colgroup><col style="width:24%"><col style="width:16%"><col style="width:9%"><col style="width:12%"><col style="width:9%"><col style="width:11%"><col style="width:10%"><col style="width:9%"></colgroup>'
    : '<colgroup><col style="width:32%"><col style="width:11%"><col style="width:14%"><col style="width:11%"><col style="width:13%"><col style="width:11%"><col style="width:8%"></colgroup>';
}

function _hvdTableHead(showOrg) {
  return `
      ${_hvdColgroup(showOrg)}
      <thead><tr>
        <th style="cursor:pointer" onclick="sortHvdTable('title')">${t('quality.col_dataset')}${hvdSortArrow('title')}</th>
        ${showOrg ? `<th>${t('quality.col_org')}</th>` : ''}
        <th style="cursor:pointer" onclick="sortHvdTable('violation_count')">${t('quality.hvd_col_violations')}${hvdSortArrow('violation_count')}</th>
        <th style="cursor:pointer" onclick="sortHvdTable('legal_citation_issue')">${t('quality.hvd_col_legal')}${hvdSortArrow('legal_citation_issue')}</th>
        <th style="cursor:pointer" onclick="sortHvdTable('no_api_access')">${t('quality.hvd_col_api')}${hvdSortArrow('no_api_access')}</th>
        <th style="cursor:pointer" onclick="sortHvdTable('license_status')">${t('quality.hvd_col_license')}${hvdSortArrow('license_status')}</th>
        <th style="cursor:pointer" onclick="sortHvdTable('publisher_mismatch')">${t('quality.hvd_col_publisher')}${hvdSortArrow('publisher_mismatch')}</th>
        <th></th>
      </tr></thead>`;
}

function _renderHvdTable() {
  const wrap = show('hvdTableWrap');
  if (!wrap) return;
  if (!(_hvdLastResult?.datasets || []).length) { wrap.innerHTML = ''; return; }

  const datasets = _hvdFilteredDatasets(_hvdActiveFilters);
  if (!datasets.length) {
    wrap.innerHTML = `<p class="text-muted small mb-0 mt-2">${esc(t('quality.hvd_filter_no_match'))}</p>`;
    return;
  }

  const dir = _hvdSortDir === 'asc' ? 1 : -1;

  if (_hvdViewMode === 'flat') {
    const sorted = [...datasets].sort((a, b) => dir * _hvdCompare(a, b, _hvdSortCol));
    wrap.innerHTML = `
    <table class="table table-hover align-middle mb-0" style="table-layout:fixed">
      ${_hvdTableHead(true)}
      <tbody>${sorted.map(d => _hvdRowHtml(d, { showOrg: true })).join('')}</tbody>
    </table>`;
    return;
  }

  const groups = new Map();
  for (const d of datasets) {
    const key = d.org_title || t('quality.hvd_unknown_org');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }

  for (const list of groups.values()) {
    list.sort((a, b) => dir * _hvdCompare(a, b, _hvdSortCol));
  }

  // Groups with the most flagged datasets first, alphabetical among ties.
  _hvdGroupsCache = [...groups.entries()].sort(
    ([an, al], [bn, bl]) => bl.length - al.length || an.localeCompare(bn)
  );

  // DCAT-AP/GeoDCAT-AP-style checks cover the *entire* catalog (tens of
  // thousands of datasets), and every org starts collapsed -- building every
  // group's dataset rows up front (just hidden via CSS) meant a check with a
  // large result set could block the main thread for seconds on tab open,
  // for rows nobody was even looking at. Only expanded groups get their rows
  // built; toggling a group re-renders (cheap: everyone else stays header-only).
  // _hvdRevealKey (set by toggleHvdOrg, consumed here) limits the fade-in to
  // the one group actually being toggled -- every render rebuilds every
  // expanded group's rows, not just that one, so animating all of them
  // unconditionally would replay the fade on every already-open group any
  // time any one of them is toggled (the same bug Comms' grouped views had).
  const revealKey = _hvdRevealKey;
  _hvdRevealKey = null;
  const bodyRows = _hvdGroupsCache.map(([orgTitle, list], idx) => {
    const isExpanded = _hvdExpandedOrgs.has(orgTitle);
    const reveal = orgTitle === revealKey;
    const groupRow = `
      <tr class="comm-group-row" style="cursor:pointer" onclick="toggleHvdOrg(${idx})">
        <td colspan="7">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-chevron-${isExpanded ? 'down' : 'right'} text-muted small"></i>
            <span class="fw-semibold">${esc(orgTitle)}</span>
            <span class="badge bg-secondary rounded-pill" style="font-size:.7rem">${list.length}</span>
          </div>
        </td>
      </tr>`;
    const datasetRows = isExpanded ? list.map(d => _hvdRowHtml(d, { indent: true, reveal })).join('') : '';
    return groupRow + datasetRows;
  }).join('');

  wrap.innerHTML = `
    <table class="table table-hover align-middle mb-0" style="table-layout:fixed">
      ${_hvdTableHead(false)}
      <tbody>${bodyRows}</tbody>
    </table>`;
}

let _qualityTabLoaded = false;
document.getElementById('qualityTabBtn').addEventListener('click', () => {
  if (_qualityTabLoaded) return;
  _qualityTabLoaded = true;
  _loadQualityTab();
});

// Shown the instant the Quality tab opens, replacing the static "Click Run
// ... Check" hint, so a user landing on a deep link (e.g. #quality) doesn't
// see "click to run" and fire off a real (slow) check while the previous
// cached result is still in flight over the network.
function _qualityLoadingHtml() {
  return `<div class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm me-2"></div>${esc(t('loading'))}</div>`;
}

function _qualityHintHtml(iconClass, key) {
  return `<div class="text-center py-5 text-muted">
    <i class="bi ${iconClass} fs-2 d-block mb-2"></i>
    <span>${esc(t(key))}</span>
  </div>`;
}

// Shows whatever's already there (a stored result from a previous run, or a
// check someone else left running) without triggering a new one -- "Run HVD
// Check" is the only thing that ever starts a fresh check.
async function _loadQualityTab() {
  show('hvdCheckResults').innerHTML = _qualityLoadingHtml();
  show('dcatCheckResults').innerHTML = _qualityLoadingHtml();
  show('geodcatCheckResults').innerHTML = _qualityLoadingHtml();
  show('mqaContent').innerHTML = _qualityLoadingHtml();
  try {
    const data = await fetch(API_BASE + 'api/quality/hvd-check').then(r => r.json());
    if (data.running) {
      show('hvdCheckBtn').disabled = true;
      show('hvdCancelBtn').classList.remove('d-none');
      _showHvdProgress(data.completed, data.total);
      show('hvdCheckResults').innerHTML = `<div class="text-center py-4 text-muted">${esc(t('quality.hvd_running'))}</div>`;
      _pollHvdCheck();
    } else if (data.result) {
      _renderHvdCheck(data.result);
    } else {
      show('hvdCheckResults').innerHTML = _qualityHintHtml('bi-patch-question', 'quality.hvd_hint');
    }
  } catch (e) {
    show('hvdCheckResults').innerHTML = _qualityHintHtml('bi-patch-question', 'quality.hvd_hint');
  }
  _loadDcatTab();
}

// ── DCAT-AP compliance check (base DCAT-AP + MDR vocabulary SHACL) ──────────
// Same architecture/UI pattern as the HVD check above, just scoped to every
// dataset on the portal instead of only the HVD-tagged ones.
let _dcatLastResult = null;
let _dcatSortCol = 'violation_count';
let _dcatSortDir = 'desc';
let _dcatViewMode = 'grouped';
let _dcatExpandedOrgs = new Set();
// Set right before a render call that should reveal-animate exactly the one
// group just toggled -- see _renderDcatTable's comment.
let _dcatRevealKey = null;
let _dcatGroupsCache = [];
let _dcatActiveFilters = new Set();
let _dcatSummaryCards = [];

const DCAT_FILTER_PREDICATES = {
  non_conforming:   d => !d.conforms,
  vocabulary_issue: d => d.vocabulary_issue,
  structural_issue: d => d.structural_issue,
};

// Single source of truth for "which datasets are currently visible", shared
// by the table render and by every summary card's count.
function _dcatFilteredDatasets(filters) {
  const source = _dcatLastResult?.datasets || [];
  let list = filters.size ? source.filter(d => [...filters].every(key => DCAT_FILTER_PREDICATES[key](d))) : source;
  const q = _ns(show('dcatResultsSearchInput')?.value || '').trim();
  if (q) list = list.filter(d => _ns(d.title).includes(q) || _ns(d.org_title || '').includes(q));
  return list;
}

// Faceted count: reflects the current search text and every *other* active
// filter -- see _hvdCardCount's comment for the full reasoning.
function _dcatCardCount(key) {
  if (key === null) return _dcatLastResult?.summary?.checked ?? 0;
  const filters = _dcatActiveFilters.has(key) ? _dcatActiveFilters : new Set([..._dcatActiveFilters, key]);
  return _dcatFilteredDatasets(filters).length;
}

function _renderDcatSummaryCards() {
  const s = _dcatLastResult.summary;
  _dcatSummaryCards = [
    { key: null, value: s.checked, label: t('quality.hvd_checked'), bg: 'bg-secondary bg-opacity-10', text: 'text-secondary', icon: 'bi-list-ul' },
    { key: 'non_conforming',   value: _dcatCardCount('non_conforming'),   label: t('quality.hvd_non_conforming'),   bg: 'bg-danger bg-opacity-10',  text: 'text-danger',  icon: 'bi-x-octagon' },
    { key: 'structural_issue', value: _dcatCardCount('structural_issue'), label: t('quality.dcat_structural_issue'), bg: 'bg-warning bg-opacity-10', text: 'text-warning', icon: 'bi-file-earmark-text' },
    { key: 'vocabulary_issue', value: _dcatCardCount('vocabulary_issue'), label: t('quality.dcat_vocabulary_issue'), bg: 'bg-warning bg-opacity-10', text: 'text-warning', icon: 'bi-tags' },
  ];
  const prepared = _dcatSummaryCards.map(c => {
    const clickable = c.key !== null;
    return { ...c, active: clickable && _dcatActiveFilters.has(c.key), onclick: clickable ? `toggleDcatCardFilter('${c.key}')` : null };
  });
  const hasActive = _dcatSummaryCards.some(c => c.key !== null && _dcatActiveFilters.has(c.key));
  _renderFilterCardsGrid('dcatSummary', prepared, null, hasActive ? {} : null);
}

function toggleDcatCardFilter(key) {
  if (_dcatActiveFilters.has(key)) _dcatActiveFilters.delete(key);
  else _dcatActiveFilters.add(key);
  _renderDcatSummaryCards();
  _renderDcatTable();
}

function clearDcatCardFilters() {
  _dcatActiveFilters.clear();
  _renderDcatSummaryCards();
  _renderDcatTable();
}

function _showDcatProgress(completed, total) { _showProgressBar('dcat', completed, total); }

function _resetDcatControls() {
  show('dcatCheckBtn').disabled = false;
  _hideProgressBar('dcat');
  const cancelBtn = show('dcatCancelBtn');
  cancelBtn.classList.add('d-none');
  cancelBtn.disabled = false;
  cancelBtn.innerHTML = `<i class="bi bi-x-circle me-1"></i><span data-i18n="quality.hvd_cancel">${t('quality.hvd_cancel')}</span>`;
}

let _dcatRerunModal = null;

function runDcatCheck() {
  if (_dcatLastResult?.finished_at) {
    show('dcatRerunLastRun').textContent = t('quality.hvd_last_run') + ' ' + relativeDate(_dcatLastResult.finished_at);
    if (!_dcatRerunModal) _dcatRerunModal = new bootstrap.Modal(document.getElementById('dcatRerunModal'));
    _dcatRerunModal.show();
    return;
  }
  _startDcatCheck();
}

function _confirmDcatRerun() {
  if (_dcatRerunModal) _dcatRerunModal.hide();
  _startDcatCheck();
}

async function _startDcatCheck() {
  const btn = show('dcatCheckBtn');
  const el  = show('dcatCheckResults');
  try {
    const resp = await fetch(API_BASE + 'api/quality/dcat-check', { method: 'POST' }).then(r => r.json());
    if (resp.error) {
      el.innerHTML = `<div class="alert alert-warning mb-0"><i class="bi bi-key me-2"></i>${esc(resp.error)}</div>`;
      return;
    }
    if (!resp.started && !resp.already_running) return;
    btn.disabled = true;
    show('dcatCancelBtn').classList.remove('d-none');
    _showDcatProgress(0, 0);
    el.innerHTML = `<div class="text-center py-4 text-muted">${esc(t('quality.dcat_running'))}</div>`;
    _pollDcatCheck();
  } catch (e) {
    el.innerHTML = `<div class="alert alert-danger mb-0">${t('error')} ${esc(e.message)}</div>`;
  }
}

function downloadDcatExcel() {
  const params = new URLSearchParams();
  if (_dcatActiveFilters.size) params.set('filters', [..._dcatActiveFilters].join(','));
  const q = show('dcatResultsSearchInput')?.value.trim();
  if (q) params.set('q', q);
  window.location.href = `${API_BASE}api/quality/dcat-check/export?${params}`;
}

async function cancelDcatCheck() {
  const btn = show('dcatCancelBtn');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>${t('quality.hvd_cancelling')}`;
  try {
    await fetch(API_BASE + 'api/quality/dcat-check/cancel', { method: 'POST' });
  } catch (e) { /* the next poll tick will reflect whatever the server ends up doing */ }
}

async function _pollDcatCheck(attempts = 0) {
  // Full-catalog run (~22,000+ datasets) can genuinely take hours on a first
  // pass -- give up polling (not running) only after a much longer wait than
  // the HVD check's.
  if (attempts > 1000) {
    _resetDcatControls();
    show('dcatCheckResults').innerHTML =
      `<div class="alert alert-warning mb-0">${esc(t('quality.dcat_still_running'))}</div>`;
    return;
  }
  await new Promise(r => setTimeout(r, 5000));
  try {
    const data = await fetch(API_BASE + 'api/quality/dcat-check').then(r => r.json());
    if (data.running) {
      _showDcatProgress(data.completed, data.total);
      if (data.cancelling) {
        const cancelBtn = show('dcatCancelBtn');
        cancelBtn.disabled = true;
        cancelBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>${t('quality.hvd_cancelling')}`;
      }
      _pollDcatCheck(attempts + 1);
      return;
    }
    _resetDcatControls();
    if (data.error) {
      show('dcatCheckResults').innerHTML = `<div class="alert alert-danger mb-0">${t('error')} ${esc(data.error)}</div>`;
      return;
    }
    if (data.result) _renderDcatCheck(data.result);
  } catch (e) {
    _resetDcatControls();
  }
}

function _renderDcatCheck(result) {
  _dcatLastResult = result;
  _dcatActiveFilters = new Set();
  show('dcatResultsSearchInput').value = '';
  const s = result.summary;
  show('dcatLastRunAt').textContent = result.finished_at
    ? t('quality.hvd_last_run') + ' ' + relativeDate(result.finished_at) : '';
  show('dcatExportBtn').classList.toggle('d-none', !(result.datasets || []).length);
  _updateDcatViewControls();
  const partialNote = result.partial
    ? `<div class="alert alert-secondary small py-2 mb-3"><i class="bi bi-info-circle me-1"></i>${t('quality.hvd_partial_note').replace('{n}', fmt(s.checked)).replace('{total}', fmt(s.total))}</div>`
    : '';
  const cardsHtml = `
    <div class="p-2 rounded-3 mb-3 filter-summary-panel">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span></span>
        <button type="button" class="btn btn-sm btn-link text-muted text-decoration-none py-0 px-1" onclick="clearDcatCardFilters()">
          <i class="bi bi-x-circle me-1"></i><span data-i18n="filters.clear">${t('filters.clear')}</span>
        </button>
      </div>
      <div id="dcatSummary" class="row g-2"></div>
    </div>`;

  const failedNote = s.failed_to_fetch
    ? `<p class="text-muted small mb-2">${t('quality.hvd_failed_note').replace('{n}', fmt(s.failed_to_fetch))}</p>` : '';
  const cacheNote = s.reused_from_cache
    ? `<p class="text-muted small mb-2"><i class="bi bi-lightning-charge me-1"></i>${t('quality.hvd_cache_note').replace('{n}', fmt(s.reused_from_cache)).replace('{total}', fmt(s.total))}</p>`
    : '';

  if (!result.datasets.length) {
    show('dcatCheckResults').innerHTML = partialNote + cardsHtml + cacheNote + failedNote +
      `<p class="text-success small mb-0"><i class="bi bi-check-circle me-1"></i>${t('quality.dcat_all_clean')}</p>`;
    _renderDcatSummaryCards();
    return;
  }

  _dcatExpandedOrgs = new Set();
  show('dcatCheckResults').innerHTML = partialNote + cardsHtml + cacheNote + failedNote + `<div id="dcatTableWrap"></div>`;
  _renderDcatSummaryCards();
  _renderDcatTable();
}

function _dcatCompare(a, b, col) {
  switch (col) {
    case 'title': return a.title.localeCompare(b.title);
    case 'vocabulary_issue':
    case 'structural_issue':
      return (a[col] ? 1 : 0) - (b[col] ? 1 : 0);
    default: return a.violation_count - b.violation_count;
  }
}

function _updateDcatViewControls() {
  const hasData = !!(_dcatLastResult?.datasets || []).length;
  show('dcatViewToggle').classList.toggle('d-none', !hasData);
  show('dcatViewFlatBtn').className    = 'btn btn-sm ' + (_dcatViewMode === 'flat'    ? 'btn-primary' : 'btn-outline-primary');
  show('dcatViewGroupedBtn').className = 'btn btn-sm ' + (_dcatViewMode === 'grouped' ? 'btn-primary' : 'btn-outline-primary');
  show('dcatExpandAllBtn').classList.toggle('d-none', !hasData || _dcatViewMode !== 'grouped');
  show('dcatCollapseAllBtn').classList.toggle('d-none', !hasData || _dcatViewMode !== 'grouped');
}

function setDcatView(mode) {
  _dcatViewMode = mode;
  _updateDcatViewControls();
  _renderDcatTable();
}

function sortDcatTable(col) {
  if (_dcatSortCol === col) {
    _dcatSortDir = _dcatSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    _dcatSortCol = col;
    _dcatSortDir = col === 'title' ? 'asc' : 'desc';
  }
  _renderDcatTable();
}

function dcatSortArrow(col) {
  if (_dcatSortCol !== col) return '<span style="opacity:.25;font-size:.8em"> ↕</span>';
  return _dcatSortDir === 'asc' ? ' ↑' : ' ↓';
}

function toggleDcatOrg(idx) {
  const entry = _dcatGroupsCache[idx];
  if (!entry) return;
  const [orgTitle] = entry;
  if (_dcatExpandedOrgs.has(orgTitle)) {
    _dcatExpandedOrgs.delete(orgTitle);
  } else {
    _dcatExpandedOrgs.add(orgTitle);
    _dcatRevealKey = orgTitle;  // only fade in on expand, not collapse
  }
  // See toggleHvdOrg's comment -- no fetch involved, just the height smoothing.
  _animateHeightSwap(show('dcatTableWrap'), _renderDcatTable);
}

function expandAllDcat() {
  _dcatGroupsCache.forEach(([orgTitle]) => _dcatExpandedOrgs.add(orgTitle));
  _renderDcatTable();
}

function collapseAllDcat() {
  _dcatExpandedOrgs.clear();
  _renderDcatTable();
}

function _dcatRowHtml(d, { indent = false, hidden = false, showOrg = false, reveal = false } = {}) {
  return `
      <tr${hidden ? ' style="display:none"' : ''}${reveal ? ' class="just-revealed"' : ''}>
        <td${indent ? ' class="ps-4"' : ''}><a href="#" onclick="openDatasetPanel('${esc(d.name)}');return false;" class="text-decoration-none">${esc(d.title)}</a></td>
        ${showOrg ? `<td class="text-muted small">${esc(d.org_title || t('quality.hvd_unknown_org'))}</td>` : ''}
        <td>${d.conforms ? '' : `<span class="badge bg-danger" title="${esc(t('quality.hvd_non_conforming'))}">${d.violation_count}</span>`}</td>
        <td>${d.structural_issue ? `<i class="bi bi-file-earmark-text text-warning" title="${esc(t('quality.dcat_structural_issue'))}"></i>` : ''}</td>
        <td>${d.vocabulary_issue ? `<i class="bi bi-tags text-warning" title="${esc(t('quality.dcat_vocabulary_issue'))}"></i>` : ''}</td>
        <td><details><summary class="small text-muted" style="cursor:pointer">${t('quality.hvd_details')}</summary>
          <ul class="small mb-0 mt-1">${d.details.map(v => `<li class="${v.severity === 'violation' ? 'text-danger' : 'text-warning'}" title="${esc(v.raw_message || '')}">${esc(v.message)}${v.count > 1 ? ` <span class="text-muted">(×${v.count})</span>` : ''}</li>`).join('')}</ul>
        </details></td>
      </tr>`;
}

// See _hvdColgroup's comment -- same reasoning, matched to _dcatRowHtml's
// own td order.
function _dcatColgroup(showOrg) {
  return showOrg
    ? '<colgroup><col style="width:34%"><col style="width:18%"><col style="width:11%"><col style="width:13%"><col style="width:13%"><col style="width:11%"></colgroup>'
    : '<colgroup><col style="width:46%"><col style="width:14%"><col style="width:16%"><col style="width:15%"><col style="width:9%"></colgroup>';
}

function _dcatTableHead(showOrg) {
  return `
      ${_dcatColgroup(showOrg)}
      <thead><tr>
        <th style="cursor:pointer" onclick="sortDcatTable('title')">${t('quality.col_dataset')}${dcatSortArrow('title')}</th>
        ${showOrg ? `<th>${t('quality.col_org')}</th>` : ''}
        <th style="cursor:pointer" onclick="sortDcatTable('violation_count')">${t('quality.hvd_col_violations')}${dcatSortArrow('violation_count')}</th>
        <th style="cursor:pointer" onclick="sortDcatTable('structural_issue')">${t('quality.dcat_col_structural')}${dcatSortArrow('structural_issue')}</th>
        <th style="cursor:pointer" onclick="sortDcatTable('vocabulary_issue')">${t('quality.dcat_col_vocabulary')}${dcatSortArrow('vocabulary_issue')}</th>
        <th></th>
      </tr></thead>`;
}

function _renderDcatTable() {
  const wrap = show('dcatTableWrap');
  if (!wrap) return;
  if (!(_dcatLastResult?.datasets || []).length) { wrap.innerHTML = ''; return; }

  const datasets = _dcatFilteredDatasets(_dcatActiveFilters);
  if (!datasets.length) {
    wrap.innerHTML = `<p class="text-muted small mb-0 mt-2">${esc(t('quality.hvd_filter_no_match'))}</p>`;
    return;
  }

  const dir = _dcatSortDir === 'asc' ? 1 : -1;

  if (_dcatViewMode === 'flat') {
    const sorted = [...datasets].sort((a, b) => dir * _dcatCompare(a, b, _dcatSortCol));
    wrap.innerHTML = `
    <table class="table table-hover align-middle mb-0" style="table-layout:fixed">
      ${_dcatTableHead(true)}
      <tbody>${sorted.map(d => _dcatRowHtml(d, { showOrg: true })).join('')}</tbody>
    </table>`;
    return;
  }

  const groups = new Map();
  for (const d of datasets) {
    const key = d.org_title || t('quality.hvd_unknown_org');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }

  for (const list of groups.values()) {
    list.sort((a, b) => dir * _dcatCompare(a, b, _dcatSortCol));
  }

  _dcatGroupsCache = [...groups.entries()].sort(
    ([an, al], [bn, bl]) => bl.length - al.length || an.localeCompare(bn)
  );

  // See toggleHvdOrg/_renderHvdTable's comments -- same capture-and-clear
  // reveal key so only the group just toggled fades in.
  const revealKey = _dcatRevealKey;
  _dcatRevealKey = null;
  const bodyRows = _dcatGroupsCache.map(([orgTitle, list], idx) => {
    const isExpanded = _dcatExpandedOrgs.has(orgTitle);
    const reveal = orgTitle === revealKey;
    const groupRow = `
      <tr class="comm-group-row" style="cursor:pointer" onclick="toggleDcatOrg(${idx})">
        <td colspan="5">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-chevron-${isExpanded ? 'down' : 'right'} text-muted small"></i>
            <span class="fw-semibold">${esc(orgTitle)}</span>
            <span class="badge bg-secondary rounded-pill" style="font-size:.7rem">${list.length}</span>
          </div>
        </td>
      </tr>`;
    const datasetRows = isExpanded ? list.map(d => _dcatRowHtml(d, { indent: true, reveal })).join('') : '';
    return groupRow + datasetRows;
  }).join('');

  wrap.innerHTML = `
    <table class="table table-hover align-middle mb-0" style="table-layout:fixed">
      ${_dcatTableHead(false)}
      <tbody>${bodyRows}</tbody>
    </table>`;
}

async function _loadDcatTab() {
  try {
    const data = await fetch(API_BASE + 'api/quality/dcat-check').then(r => r.json());
    if (data.running) {
      show('dcatCheckBtn').disabled = true;
      show('dcatCancelBtn').classList.remove('d-none');
      _showDcatProgress(data.completed, data.total);
      show('dcatCheckResults').innerHTML = `<div class="text-center py-4 text-muted">${esc(t('quality.dcat_running'))}</div>`;
      _pollDcatCheck();
      return;
    }
    if (data.result) {
      _renderDcatCheck(data.result);
    } else {
      show('dcatCheckResults').innerHTML = _qualityHintHtml('bi-patch-question', 'quality.dcat_hint');
    }
  } catch (e) {
    show('dcatCheckResults').innerHTML = _qualityHintHtml('bi-patch-question', 'quality.dcat_hint');
  }
  _loadGeoDcatTab();
  _loadMqaTab();
}

// ── GeoDCAT-AP compliance check (geospatial extension SHACL) ────────────────
// Same architecture/UI pattern as the HVD/DCAT-AP checks above, scoped to
// only the geospatial-tagged datasets. No vocabulary/structural split here
// (GeoDCAT-AP's shapes aren't classified that way) -- just violations.
let _geodcatLastResult = null;
let _geodcatSortCol = 'violation_count';
let _geodcatSortDir = 'desc';
let _geodcatViewMode = 'grouped';
let _geodcatExpandedOrgs = new Set();
// Set right before a render call that should reveal-animate exactly the one
// group just toggled -- see _renderGeoDcatTable's comment.
let _geodcatRevealKey = null;
let _geodcatGroupsCache = [];
let _geodcatActiveFilters = new Set();
let _geodcatSummaryCards = [];

const GEODCAT_FILTER_PREDICATES = {
  non_conforming: d => !d.conforms,
};

// Single source of truth for "which datasets are currently visible", shared
// by the table render and by every summary card's count.
function _geodcatFilteredDatasets(filters) {
  const source = _geodcatLastResult?.datasets || [];
  let list = filters.size ? source.filter(d => [...filters].every(key => GEODCAT_FILTER_PREDICATES[key](d))) : source;
  const q = _ns(show('geodcatResultsSearchInput')?.value || '').trim();
  if (q) list = list.filter(d => _ns(d.title).includes(q) || _ns(d.org_title || '').includes(q));
  return list;
}

// Faceted count: reflects the current search text and every *other* active
// filter -- see _hvdCardCount's comment for the full reasoning.
function _geodcatCardCount(key) {
  if (key === null) return _geodcatLastResult?.summary?.checked ?? 0;
  const filters = _geodcatActiveFilters.has(key) ? _geodcatActiveFilters : new Set([..._geodcatActiveFilters, key]);
  return _geodcatFilteredDatasets(filters).length;
}

function _renderGeoDcatSummaryCards() {
  const s = _geodcatLastResult.summary;
  _geodcatSummaryCards = [
    { key: null, value: s.checked, label: t('quality.hvd_checked'), bg: 'bg-secondary bg-opacity-10', text: 'text-secondary', icon: 'bi-list-ul' },
    { key: 'non_conforming', value: _geodcatCardCount('non_conforming'), label: t('quality.hvd_non_conforming'), bg: 'bg-danger bg-opacity-10', text: 'text-danger', icon: 'bi-x-octagon' },
  ];
  const prepared = _geodcatSummaryCards.map(c => {
    const clickable = c.key !== null;
    return { ...c, active: clickable && _geodcatActiveFilters.has(c.key), onclick: clickable ? `toggleGeoDcatCardFilter('${c.key}')` : null };
  });
  const hasActive = _geodcatSummaryCards.some(c => c.key !== null && _geodcatActiveFilters.has(c.key));
  _renderFilterCardsGrid('geodcatSummary', prepared, null, hasActive ? {} : null);
}

function toggleGeoDcatCardFilter(key) {
  if (_geodcatActiveFilters.has(key)) _geodcatActiveFilters.delete(key);
  else _geodcatActiveFilters.add(key);
  _renderGeoDcatSummaryCards();
  _renderGeoDcatTable();
}

function clearGeoDcatCardFilters() {
  _geodcatActiveFilters.clear();
  _renderGeoDcatSummaryCards();
  _renderGeoDcatTable();
}

function _showGeoDcatProgress(completed, total) { _showProgressBar('geodcat', completed, total); }

function _resetGeoDcatControls() {
  show('geodcatCheckBtn').disabled = false;
  _hideProgressBar('geodcat');
  const cancelBtn = show('geodcatCancelBtn');
  cancelBtn.classList.add('d-none');
  cancelBtn.disabled = false;
  cancelBtn.innerHTML = `<i class="bi bi-x-circle me-1"></i><span data-i18n="quality.hvd_cancel">${t('quality.hvd_cancel')}</span>`;
}

let _geodcatRerunModal = null;

function runGeoDcatCheck() {
  if (_geodcatLastResult?.finished_at) {
    show('geodcatRerunLastRun').textContent = t('quality.hvd_last_run') + ' ' + relativeDate(_geodcatLastResult.finished_at);
    if (!_geodcatRerunModal) _geodcatRerunModal = new bootstrap.Modal(document.getElementById('geodcatRerunModal'));
    _geodcatRerunModal.show();
    return;
  }
  _startGeoDcatCheck();
}

function _confirmGeoDcatRerun() {
  if (_geodcatRerunModal) _geodcatRerunModal.hide();
  _startGeoDcatCheck();
}

async function _startGeoDcatCheck() {
  const btn = show('geodcatCheckBtn');
  const el  = show('geodcatCheckResults');
  try {
    const resp = await fetch(API_BASE + 'api/quality/geodcat-check', { method: 'POST' }).then(r => r.json());
    if (resp.error) {
      el.innerHTML = `<div class="alert alert-warning mb-0"><i class="bi bi-key me-2"></i>${esc(resp.error)}</div>`;
      return;
    }
    if (!resp.started && !resp.already_running) return;
    btn.disabled = true;
    show('geodcatCancelBtn').classList.remove('d-none');
    _showGeoDcatProgress(0, 0);
    el.innerHTML = `<div class="text-center py-4 text-muted">${esc(t('quality.geodcat_running'))}</div>`;
    _pollGeoDcatCheck();
  } catch (e) {
    el.innerHTML = `<div class="alert alert-danger mb-0">${t('error')} ${esc(e.message)}</div>`;
  }
}

function downloadGeoDcatExcel() {
  const params = new URLSearchParams();
  if (_geodcatActiveFilters.size) params.set('filters', [..._geodcatActiveFilters].join(','));
  const q = show('geodcatResultsSearchInput')?.value.trim();
  if (q) params.set('q', q);
  window.location.href = `${API_BASE}api/quality/geodcat-check/export?${params}`;
}

async function cancelGeoDcatCheck() {
  const btn = show('geodcatCancelBtn');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>${t('quality.hvd_cancelling')}`;
  try {
    await fetch(API_BASE + 'api/quality/geodcat-check/cancel', { method: 'POST' });
  } catch (e) { /* the next poll tick will reflect whatever the server ends up doing */ }
}

async function _pollGeoDcatCheck(attempts = 0) {
  // ~12,500 geospatial datasets -- similar order of magnitude to the DCAT-AP
  // check, so give up polling (not running) on the same long timescale.
  if (attempts > 1000) {
    _resetGeoDcatControls();
    show('geodcatCheckResults').innerHTML =
      `<div class="alert alert-warning mb-0">${esc(t('quality.dcat_still_running'))}</div>`;
    return;
  }
  await new Promise(r => setTimeout(r, 5000));
  try {
    const data = await fetch(API_BASE + 'api/quality/geodcat-check').then(r => r.json());
    if (data.running) {
      _showGeoDcatProgress(data.completed, data.total);
      if (data.cancelling) {
        const cancelBtn = show('geodcatCancelBtn');
        cancelBtn.disabled = true;
        cancelBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>${t('quality.hvd_cancelling')}`;
      }
      _pollGeoDcatCheck(attempts + 1);
      return;
    }
    _resetGeoDcatControls();
    if (data.error) {
      show('geodcatCheckResults').innerHTML = `<div class="alert alert-danger mb-0">${t('error')} ${esc(data.error)}</div>`;
      return;
    }
    if (data.result) _renderGeoDcatCheck(data.result);
  } catch (e) {
    _resetGeoDcatControls();
  }
}

function _renderGeoDcatCheck(result) {
  _geodcatLastResult = result;
  _geodcatActiveFilters = new Set();
  show('geodcatResultsSearchInput').value = '';
  const s = result.summary;
  show('geodcatLastRunAt').textContent = result.finished_at
    ? t('quality.hvd_last_run') + ' ' + relativeDate(result.finished_at) : '';
  show('geodcatExportBtn').classList.toggle('d-none', !(result.datasets || []).length);
  _updateGeoDcatViewControls();
  const partialNote = result.partial
    ? `<div class="alert alert-secondary small py-2 mb-3"><i class="bi bi-info-circle me-1"></i>${t('quality.hvd_partial_note').replace('{n}', fmt(s.checked)).replace('{total}', fmt(s.total))}</div>`
    : '';
  const cardsHtml = `
    <div class="p-2 rounded-3 mb-3 filter-summary-panel">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span></span>
        <button type="button" class="btn btn-sm btn-link text-muted text-decoration-none py-0 px-1" onclick="clearGeoDcatCardFilters()">
          <i class="bi bi-x-circle me-1"></i><span data-i18n="filters.clear">${t('filters.clear')}</span>
        </button>
      </div>
      <div id="geodcatSummary" class="row g-2"></div>
    </div>`;

  const failedNote = s.failed_to_fetch
    ? `<p class="text-muted small mb-2">${t('quality.hvd_failed_note').replace('{n}', fmt(s.failed_to_fetch))}</p>` : '';
  const cacheNote = s.reused_from_cache
    ? `<p class="text-muted small mb-2"><i class="bi bi-lightning-charge me-1"></i>${t('quality.hvd_cache_note').replace('{n}', fmt(s.reused_from_cache)).replace('{total}', fmt(s.total))}</p>`
    : '';

  if (!result.datasets.length) {
    show('geodcatCheckResults').innerHTML = partialNote + cardsHtml + cacheNote + failedNote +
      `<p class="text-success small mb-0"><i class="bi bi-check-circle me-1"></i>${t('quality.geodcat_all_clean')}</p>`;
    _renderGeoDcatSummaryCards();
    return;
  }

  _geodcatExpandedOrgs = new Set();
  show('geodcatCheckResults').innerHTML = partialNote + cardsHtml + cacheNote + failedNote + `<div id="geodcatTableWrap"></div>`;
  _renderGeoDcatSummaryCards();
  _renderGeoDcatTable();
}

function _geodcatCompare(a, b, col) {
  switch (col) {
    case 'title': return a.title.localeCompare(b.title);
    default: return a.violation_count - b.violation_count;
  }
}

function _updateGeoDcatViewControls() {
  const hasData = !!(_geodcatLastResult?.datasets || []).length;
  show('geodcatViewToggle').classList.toggle('d-none', !hasData);
  show('geodcatViewFlatBtn').className    = 'btn btn-sm ' + (_geodcatViewMode === 'flat'    ? 'btn-primary' : 'btn-outline-primary');
  show('geodcatViewGroupedBtn').className = 'btn btn-sm ' + (_geodcatViewMode === 'grouped' ? 'btn-primary' : 'btn-outline-primary');
  show('geodcatExpandAllBtn').classList.toggle('d-none', !hasData || _geodcatViewMode !== 'grouped');
  show('geodcatCollapseAllBtn').classList.toggle('d-none', !hasData || _geodcatViewMode !== 'grouped');
}

function setGeoDcatView(mode) {
  _geodcatViewMode = mode;
  _updateGeoDcatViewControls();
  _renderGeoDcatTable();
}

function sortGeoDcatTable(col) {
  if (_geodcatSortCol === col) {
    _geodcatSortDir = _geodcatSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    _geodcatSortCol = col;
    _geodcatSortDir = col === 'title' ? 'asc' : 'desc';
  }
  _renderGeoDcatTable();
}

function geodcatSortArrow(col) {
  if (_geodcatSortCol !== col) return '<span style="opacity:.25;font-size:.8em"> ↕</span>';
  return _geodcatSortDir === 'asc' ? ' ↑' : ' ↓';
}

function toggleGeoDcatOrg(idx) {
  const entry = _geodcatGroupsCache[idx];
  if (!entry) return;
  const [orgTitle] = entry;
  if (_geodcatExpandedOrgs.has(orgTitle)) {
    _geodcatExpandedOrgs.delete(orgTitle);
  } else {
    _geodcatExpandedOrgs.add(orgTitle);
    _geodcatRevealKey = orgTitle;  // only fade in on expand, not collapse
  }
  // See toggleHvdOrg's comment -- no fetch involved, just the height smoothing.
  _animateHeightSwap(show('geodcatTableWrap'), _renderGeoDcatTable);
}

function expandAllGeoDcat() {
  _geodcatGroupsCache.forEach(([orgTitle]) => _geodcatExpandedOrgs.add(orgTitle));
  _renderGeoDcatTable();
}

function collapseAllGeoDcat() {
  _geodcatExpandedOrgs.clear();
  _renderGeoDcatTable();
}

function _geodcatRowHtml(d, { indent = false, hidden = false, showOrg = false, reveal = false } = {}) {
  return `
      <tr${hidden ? ' style="display:none"' : ''}${reveal ? ' class="just-revealed"' : ''}>
        <td${indent ? ' class="ps-4"' : ''}><a href="#" onclick="openDatasetPanel('${esc(d.name)}');return false;" class="text-decoration-none">${esc(d.title)}</a></td>
        ${showOrg ? `<td class="text-muted small">${esc(d.org_title || t('quality.hvd_unknown_org'))}</td>` : ''}
        <td>${d.conforms ? '' : `<span class="badge bg-danger" title="${esc(t('quality.hvd_non_conforming'))}">${d.violation_count}</span>`}</td>
        <td><details><summary class="small text-muted" style="cursor:pointer">${t('quality.hvd_details')}</summary>
          <ul class="small mb-0 mt-1">${d.details.map(v => `<li class="${v.severity === 'violation' ? 'text-danger' : 'text-warning'}" title="${esc(v.raw_message || '')}">${esc(v.message)}${v.count > 1 ? ` <span class="text-muted">(×${v.count})</span>` : ''}</li>`).join('')}</ul>
        </details></td>
      </tr>`;
}

// See _hvdColgroup's comment -- same reasoning, matched to _geodcatRowHtml's
// own td order.
function _geodcatColgroup(showOrg) {
  return showOrg
    ? '<colgroup><col style="width:50%"><col style="width:24%"><col style="width:15%"><col style="width:11%"></colgroup>'
    : '<colgroup><col style="width:70%"><col style="width:18%"><col style="width:12%"></colgroup>';
}

function _geodcatTableHead(showOrg) {
  return `
      ${_geodcatColgroup(showOrg)}
      <thead><tr>
        <th style="cursor:pointer" onclick="sortGeoDcatTable('title')">${t('quality.col_dataset')}${geodcatSortArrow('title')}</th>
        ${showOrg ? `<th>${t('quality.col_org')}</th>` : ''}
        <th style="cursor:pointer" onclick="sortGeoDcatTable('violation_count')">${t('quality.hvd_col_violations')}${geodcatSortArrow('violation_count')}</th>
        <th></th>
      </tr></thead>`;
}

function _renderGeoDcatTable() {
  const wrap = show('geodcatTableWrap');
  if (!wrap) return;
  if (!(_geodcatLastResult?.datasets || []).length) { wrap.innerHTML = ''; return; }

  const datasets = _geodcatFilteredDatasets(_geodcatActiveFilters);
  if (!datasets.length) {
    wrap.innerHTML = `<p class="text-muted small mb-0 mt-2">${esc(t('quality.hvd_filter_no_match'))}</p>`;
    return;
  }

  const dir = _geodcatSortDir === 'asc' ? 1 : -1;

  if (_geodcatViewMode === 'flat') {
    const sorted = [...datasets].sort((a, b) => dir * _geodcatCompare(a, b, _geodcatSortCol));
    wrap.innerHTML = `
    <table class="table table-hover align-middle mb-0" style="table-layout:fixed">
      ${_geodcatTableHead(true)}
      <tbody>${sorted.map(d => _geodcatRowHtml(d, { showOrg: true })).join('')}</tbody>
    </table>`;
    return;
  }

  const groups = new Map();
  for (const d of datasets) {
    const key = d.org_title || t('quality.hvd_unknown_org');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }

  for (const list of groups.values()) {
    list.sort((a, b) => dir * _geodcatCompare(a, b, _geodcatSortCol));
  }

  _geodcatGroupsCache = [...groups.entries()].sort(
    ([an, al], [bn, bl]) => bl.length - al.length || an.localeCompare(bn)
  );

  // See toggleHvdOrg/_renderHvdTable's comments -- same capture-and-clear
  // reveal key so only the group just toggled fades in.
  const revealKey = _geodcatRevealKey;
  _geodcatRevealKey = null;
  const bodyRows = _geodcatGroupsCache.map(([orgTitle, list], idx) => {
    const isExpanded = _geodcatExpandedOrgs.has(orgTitle);
    const reveal = orgTitle === revealKey;
    const groupRow = `
      <tr class="comm-group-row" style="cursor:pointer" onclick="toggleGeoDcatOrg(${idx})">
        <td colspan="3">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-chevron-${isExpanded ? 'down' : 'right'} text-muted small"></i>
            <span class="fw-semibold">${esc(orgTitle)}</span>
            <span class="badge bg-secondary rounded-pill" style="font-size:.7rem">${list.length}</span>
          </div>
        </td>
      </tr>`;
    const datasetRows = isExpanded ? list.map(d => _geodcatRowHtml(d, { indent: true, reveal })).join('') : '';
    return groupRow + datasetRows;
  }).join('');

  wrap.innerHTML = `
    <table class="table table-hover align-middle mb-0" style="table-layout:fixed">
      ${_geodcatTableHead(false)}
      <tbody>${bodyRows}</tbody>
    </table>`;
}

async function _loadGeoDcatTab() {
  try {
    const data = await fetch(API_BASE + 'api/quality/geodcat-check').then(r => r.json());
    if (data.running) {
      show('geodcatCheckBtn').disabled = true;
      show('geodcatCancelBtn').classList.remove('d-none');
      _showGeoDcatProgress(data.completed, data.total);
      show('geodcatCheckResults').innerHTML = `<div class="text-center py-4 text-muted">${esc(t('quality.geodcat_running'))}</div>`;
      _pollGeoDcatCheck();
      return;
    }
    if (data.result) {
      _renderGeoDcatCheck(data.result);
    } else {
      show('geodcatCheckResults').innerHTML = _qualityHintHtml('bi-patch-question', 'quality.geodcat_hint');
    }
  } catch (e) {
    show('geodcatCheckResults').innerHTML = _qualityHintHtml('bi-patch-question', 'quality.geodcat_hint');
  }
}

// ── EU Metadata Quality Assessment (MQA) score ──────────────────────────────
// Not a check we run ourselves -- just a periodic fetch+cache of data.europa.eu's
// own already-computed FAIR+ score for data.gov.gr's catalogue. No run/cancel,
// no progress bar, just a score dashboard + manual refresh.
const MQA_DIMENSIONS = [
  { key: 'findability',     label: 'quality.mqa_findability' },
  { key: 'accessibility',   label: 'quality.mqa_accessibility' },
  { key: 'interoperability', label: 'quality.mqa_interoperability' },
  { key: 'reusability',     label: 'quality.mqa_reusability' },
  { key: 'contextuality',   label: 'quality.mqa_contextuality' },
];

function _mqaBarColor(pct) {
  if (pct >= 80) return '#198754';
  if (pct >= 50) return '#fd7e14';
  return '#dc3545';
}

function _renderMqa(cached) {
  const el = show('mqaContent');
  if (!cached || !cached.data) {
    el.innerHTML = `<div class="text-center py-5 text-muted">
      <i class="bi bi-speedometer2 fs-2 d-block mb-2"></i>
      <span>${esc(t('quality.mqa_hint'))}</span>
    </div>`;
    show('mqaLastUpdated').textContent = '';
    return;
  }
  const data = cached.data;
  const maxTotal = MQA_DIMENSIONS.reduce((sum, d) => sum + (data[d.key]?.score?.max || 0), 0);
  const overallPct = maxTotal ? Math.round((data.score / maxTotal) * 100) : 0;
  show('mqaLastUpdated').textContent = cached.fetched_at
    ? t('quality.hvd_last_run') + ' ' + relativeDate(cached.fetched_at) : '';

  const rows = MQA_DIMENSIONS.map(d => {
    const dim = data[d.key];
    const pct = dim?.score?.percentage ?? 0;
    const color = _mqaBarColor(pct);
    return `
      <div class="mb-3">
        <div class="d-flex justify-content-between small mb-1">
          <span class="fw-semibold">${esc(t(d.label))}</span>
          <span class="text-muted">${fmt(dim?.score?.points ?? 0)} / ${fmt(dim?.score?.max ?? 0)} (${pct}%)</span>
        </div>
        <div class="progress" style="height:8px">
          <div class="progress-bar" role="progressbar" style="width:${pct}%;background-color:${color}"></div>
        </div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="text-center mb-4">
      <div class="display-5 fw-bold">${fmt(data.score)} <span class="fs-5 text-muted">/ ${fmt(maxTotal)}</span></div>
      <div class="text-muted small">${overallPct}% &mdash; data.gov.gr</div>
    </div>
    ${rows}`;
}

async function _loadMqaTab() {
  try {
    const data = await fetch(API_BASE + 'api/quality/mqa').then(r => r.json());
    _renderMqa(data.result);
  } catch (e) {
    _renderMqa(null);
  }
}

async function refreshMqa() {
  const btn = show('mqaRefreshBtn');
  btn.disabled = true;
  const originalHtml = btn.innerHTML;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>${esc(t('quality.mqa_refreshing'))}`;
  try {
    const resp = await fetch(API_BASE + 'api/quality/mqa/refresh', { method: 'POST' }).then(r => r.json());
    if (resp.refreshed) {
      _renderMqa(resp.result);
    } else if (resp.error) {
      show('mqaContent').innerHTML = `<div class="alert alert-danger mb-0">${t('error')} ${esc(resp.error)}</div>`;
    }
  } catch (e) {
    show('mqaContent').innerHTML = `<div class="alert alert-danger mb-0">${t('error')} ${esc(e.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// ── Organizations tab ────────────────────────────────────────────────────────
function relativeDate(iso) {
  if (!iso) return t('date.never');
  // Accept both Z and +HH:MM suffixes without double-appending
  const d = new Date(/[Zz]$/.test(iso) || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + 'Z');
  if (isNaN(d)) return t('date.never');
  const secs = Math.floor((Date.now() - d) / 1000);
  if (secs <   60) return t('date.just_now');
  if (secs < 3600) return Math.floor(secs / 60) + t('date.m_ago');
  const hours = Math.floor(secs / 3600);
  if (hours <  24) return hours + t('date.h_ago');
  const days = Math.floor(secs / 86400);
  if (days  ===  1) return t('date.yesterday');
  if (days  <   30) return days + t('date.d_ago');
  if (days  <  365) return Math.floor(days / 30) + t('date.mo_ago');
  return Math.floor(days / 365) + t('date.y_ago');
}

// _orgsData/_publicOrgs/_ckanByHrms are declared in org_search.js (loaded
// right before this file) -- shared with the Mail Parser admin panel.
let _orgsLoaded  = false;
let _orgsSortCol  = 'last_updated';
let _orgsSortDir  = 'desc';
let _orgsViewMode = 'portal';
let _ckanLookup   = null;
let _hrmsLookup   = null;   // ckan slug → hrms code

function sortOrgs(col) {
  if (_orgsSortCol === col) {
    _orgsSortDir = _orgsSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    _orgsSortCol = col;
    _orgsSortDir = col === 'title' ? 'asc' : 'desc';
  }
  filterOrgs();
}

function sortArrow(col) {
  if (_orgsSortCol !== col) return '<span style="opacity:.25;font-size:.8em"> ↕</span>';
  return _orgsSortDir === 'asc' ? ' ↑' : ' ↓';
}

document.getElementById('orgsTabBtn').addEventListener('click', () => {
  // Already-loaded data lives in _orgsData/_publicOrgs -- re-render from
  // there instead of skipping outright, since the table DOM is emptied
  // whenever this tab is hidden (see the hidden.bs.tab listener above).
  if (_orgsLoaded) { filterOrgs(); return; }
  loadOrgs();
});

// _ORGS_CACHE_KEY lives in org_search.js (loaded before this file).
const _ORGS_STALE_MS   = 30 * 60 * 1000;
const _ORGS_EXPIRE_MS  = 2  * 60 * 60 * 1000;

function _orgsSaveCache(data, fetched_at) {
  try { localStorage.setItem(_ORGS_CACHE_KEY, JSON.stringify({ data, fetched_at, ts: Date.now() })); } catch (_) {}
}
function _orgsReadCache() {
  try {
    const c = JSON.parse(localStorage.getItem(_ORGS_CACHE_KEY) || 'null');
    if (!c || !Array.isArray(c.data) || Date.now() - c.ts > _ORGS_EXPIRE_MS) return null;
    return c;
  } catch (_) { return null; }
}

async function loadOrgs(force = false) {
  if (!force && _orgsLoaded) return;

  if (!force) {
    const cached = _orgsReadCache();
    if (cached) {
      _orgsData   = cached.data;
      _orgsLoaded = true;
      show('orgSearch').value = '';
      show('orgsFetchedAt').textContent = cached.fetched_at
        ? t('orgs.fetched') + ' ' + relativeDate(cached.fetched_at)
        : '';
      renderOrgsTable(_orgsData);
      _loadPublicOrgsForPortal();
      // Contact-count badges need the full portal-members data (loadContactSummary()
      // alone only has the raw per-org_code DB counts, which undercounts orgs whose
      // contacts weren't stored under an org_code loadContactSummary can resolve) --
      // warm it in the background the same way the Comms tab already does, instead of
      // leaving badges wrong until the user happens to open the Contacts tab first.
      if (!_portalMembersCache) loadContactsTab();
      // Silently refresh in background if stale
      if (Date.now() - cached.ts > _ORGS_STALE_MS) _loadOrgsBackground();
      return;
    }
  }

  const el  = show('orgsTable');
  const btn = show('orgsRefreshBtn');
  el.innerHTML = `<div class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm me-2"></div>${t('orgs.loading')}</div>`;
  btn.disabled = true;
  try {
    const resp = await fetch(API_BASE + 'api/organizations', { method: force ? 'POST' : 'GET' });
    if (!resp.ok) {
      el.innerHTML = `<div class="alert alert-warning mb-0">${t('orgs.server_error')} ${resp.status} ${t('orgs.server_error_hint')}</div>`;
      return;
    }
    const json = await resp.json();
    if (json.error) {
      el.innerHTML = `<div class="alert alert-warning mb-0">${json.error}</div>`;
      return;
    }
    _orgsData   = json.data;
    _orgsLoaded = true;
    _orgsSaveCache(_orgsData, json.fetched_at);
    show('orgSearch').value = '';
    show('orgsFetchedAt').textContent = json.fetched_at
      ? t('orgs.fetched') + ' ' + relativeDate(json.fetched_at)
      : '';
    renderOrgsTable(_orgsData);
    if (json.enriching) _pollUntilEnriched();
    _loadPublicOrgsForPortal();
    if (!_portalMembersCache) loadContactsTab();
  } catch (e) {
    el.innerHTML = `<div class="alert alert-danger mb-0">${t('error')} ${e.message}</div>`;
  } finally {
    btn.disabled = false;
  }
}

async function _loadOrgsBackground() {
  try {
    const resp = await fetch(API_BASE + 'api/organizations');
    if (!resp.ok) return;
    const json = await resp.json();
    if (json.error || !json.data) return;
    _orgsData   = json.data;
    _orgsSaveCache(_orgsData, json.fetched_at);
    show('orgsFetchedAt').textContent = json.fetched_at
      ? t('orgs.fetched') + ' ' + relativeDate(json.fetched_at)
      : '';
    if (_isTabActive('tab-orgs')) renderOrgsTable(_orgsData);
    if (json.enriching) _pollUntilEnriched();
  } catch (_) {}
}

// _ns lives in org_search.js (loaded before this file).

function filterOrgs() {
  const q = _ns(show('orgSearch').value);
  if (_orgsViewMode === 'all') {
    renderAllOrgsTable(q
      ? _publicOrgs.filter(o => {
          if (_ns(o.label).includes(q)) return true;
          // also match the portal alias shown as "(as <ckan.title>)" — it's
          // only attached at render time, so search has to look it up too
          const ckan = _ckanLookup ? _ckanLookup.get(_normOrg(o.label)) : null;
          return !!ckan && _ns(ckan.title).includes(q);
        })
      : _publicOrgs);
  } else {
    renderOrgsTable(q
      ? _orgsData.filter(o => _ns(o.title).includes(q) || _ns(o.name).includes(q))
      : _orgsData);
  }
}

function renderOrgsTable(orgs) {
  const el = show('orgsTable');
  if (!orgs.length) { el.innerHTML = `<p class="text-muted text-center py-3">${t('orgs.none_found')}</p>`; return; }

  const sorted = [...orgs].sort((a, b) => {
    if (_orgsSortCol === 'last_updated') {
      const aHas = !!a.last_updated, bHas = !!b.last_updated;
      if (aHas && bHas) {
        if (a.last_updated < b.last_updated) return _orgsSortDir === 'asc' ? -1 : 1;
        if (a.last_updated > b.last_updated) return _orgsSortDir === 'asc' ? 1  : -1;
        return 0;
      }
      if (aHas !== bHas) {
        // an org with a known date always ranks above one without, in either direction
        return _orgsSortDir === 'asc' ? (aHas ? 1 : -1) : (aHas ? -1 : 1);
      }
      return b.package_count - a.package_count;  // neither has a date — fall back to dataset count
    }
    let av, bv;
    switch (_orgsSortCol) {
      case 'title': av = a.title.toLowerCase(); bv = b.title.toLowerCase(); break;
      default:      av = a.package_count;       bv = b.package_count;
    }
    if (av < bv) return _orgsSortDir === 'asc' ? -1 : 1;
    if (av > bv) return _orgsSortDir === 'asc' ? 1  : -1;
    return 0;
  });

  const max = Math.max(...sorted.map(o => o.package_count), 1);
  const th  = (col, label, cls = '') =>
    `<th class="text-nowrap${cls ? ' ' + cls : ''}" style="cursor:pointer;user-select:none" onclick="sortOrgs('${col}')">${label}${sortArrow(col)}</th>`;

  el.innerHTML = `
    <table class="table table-hover align-middle mb-0">
      <thead><tr>
        <th style="width:3rem">${t('orgs.col_num')}</th>
        ${th('title', t('orgs.col_org'))}
        ${th('package_count', t('orgs.col_datasets'), 'text-end')}
        ${th('last_updated', t('orgs.col_updated'), 'text-end')}
        <th class="text-center" style="width:80px">${t('orgs.col_contacts')}</th>
      </tr></thead>
      <tbody>
        ${sorted.map((o, i) => `
          <tr>
            <td class="text-muted small">${i + 1}</td>
            <td>
              <a href="#" onclick="openOrgPanel('${o.name}');return false;" class="fw-semibold text-decoration-none">
                ${o.title}
              </a>
              <div class="mt-1" style="height:3px;border-radius:2px;background:#e9ecef;overflow:hidden">
                <div style="width:${Math.round(o.package_count / max * 100)}%;height:100%;background:#0057b8;border-radius:2px;transition:width .3s"></div>
              </div>
            </td>
            <td class="text-end fw-bold">${fmt(o.package_count)}</td>
            <td class="text-end text-muted small" title="${o.last_updated ?? ''}">${relativeDate(o.last_updated)}</td>
            <td class="text-center">${_portalContactCell(o.name, o.title)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// ── All Public Sector view (hrms.gov.gr) ────────────────────────────────────

function _normOrg(s) {
  // NFD splits ά → α + combining-tonos; \p{M} removes all combining marks
  // so ΑΘΗΝΑΙΩΝ (no accents) matches Αθηναίων (with accents)
  return (s || '').replace(/\s*\([^)]*\)\s*/g, ' ')  // strip parenthesised content entirely
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase().trim()
    .replace(/[.,\-]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function _buildCkanLookup() {
  _ckanLookup = new Map();
  for (const org of _orgsData) {
    _ckanLookup.set(_normOrg(org.title), org);
    _ckanLookup.set(_normOrg(org.name), org);
  }
  _hrmsLookup = new Map();   // ckan slug → hrms code
  _ckanByHrms = new Map();   // hrms code → ckan slug  +  hrms label → ckan slug
  for (const hrmsOrg of _publicOrgs) {
    const matched = _ckanLookup.get(_normOrg(hrmsOrg.label));
    if (matched) {
      _hrmsLookup.set(matched.name, hrmsOrg.code);
      _ckanByHrms.set(hrmsOrg.code,  matched.name);
      _ckanByHrms.set(hrmsOrg.label, matched.name);  // covers old contacts stored with label
    }
  }
}

async function _loadPublicOrgsForPortal() {
  if (!_publicOrgs.length) {
    try {
      const data = await fetch(API_BASE + 'api/public-orgs').then(r => r.json());
      if (Array.isArray(data)) _publicOrgs = data;
    } catch (_) { return; }
  }
  if (_publicOrgs.length && _orgsData.length) {
    _buildCkanLookup();
    await loadContactSummary();
  }
}

// Warms the HRMS<->CKAN code bridge (_hrmsLookup/_ckanByHrms, built by
// _buildCkanLookup above) in the background for callers -- like the user
// panel's org-mismatch check -- that need _orgCodeMatches to actually
// resolve codes across the two systems, not just fall back to exact-string
// comparison. Unlike _loadPublicOrgsForPortal, this also fetches _orgsData
// itself if it's missing (quietly, via _loadOrgsBackground, not the
// Organizations tab's own loadOrgs -- no need to touch that tab's visible
// state just to build this). Returns a promise so a caller that actually
// needs to react once the bridge lands (re-render, re-check) can -- most
// callers just fire-and-forget it and let the next panel opened find it
// ready, which is still fine, since a resolved/in-flight promise costs
// nothing extra to ignore.
let _orgCkanBridgePromise = null;
let _pmCacheWarmingForPanel = false;
function _ensureOrgCkanBridge() {
  if (_hrmsLookup) return Promise.resolve();
  if (_orgCkanBridgePromise) return _orgCkanBridgePromise;
  const ready = _orgsData.length ? Promise.resolve() : _loadOrgsBackground();
  _orgCkanBridgePromise = ready.then(_loadPublicOrgsForPortal).finally(() => { _orgCkanBridgePromise = null; });
  return _orgCkanBridgePromise;
}

function _portalContactCell(orgName, orgTitle) {
  // The panel this opens needs contacts access (see _renderOrgContactsPanel) --
  // don't offer the button at all to someone who'd just hit its permission
  // message, same as how restricted nav tabs are hidden outright rather than
  // shown-then-blocked.
  if (ALLOWED_TABS && !ALLOWED_TABS.includes('contacts')) return '';
  const cnt = _contactSummary[orgName] || 0;
  return '<button class="btn btn-outline-primary btn-sm py-0 px-2" onclick="openContactsPanel(\'' + orgName + '\',\'' + esc(orgTitle) + '\',\'' + orgName + '\')" title="' + esc(t('contacts.view_contacts')) + '">'
    + '<i class="bi bi-people"></i>'
    + (cnt ? '<span class="badge bg-primary rounded-pill ms-1">' + cnt + '</span>' : '')
    + '</button>';
}

async function setOrgsView(mode) {
  _orgsViewMode = mode;

  show('orgsViewPortalBtn').className = 'btn btn-sm ' + (mode === 'portal' ? 'btn-primary' : 'btn-outline-primary');
  show('orgsViewAllBtn').className    = 'btn btn-sm ' + (mode === 'all'    ? 'btn-primary' : 'btn-outline-primary');
  show('orgsRefreshBtn').style.display  = mode === 'portal' ? '' : 'none';
  show('orgsFetchedAt').style.display   = mode === 'portal' ? '' : 'none';
  show('orgSearch').placeholder = mode === 'portal' ? t('orgs.search') : t('orgs.search_all');

  if (mode === 'all') {
    if (!_publicOrgs.length) {
      show('orgsTable').innerHTML = `<div class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm me-2"></div>${t('orgs.loading_public')}</div>`;
      try {
        const data = await fetch(API_BASE + 'api/public-orgs').then(r => r.json());
        if (Array.isArray(data)) _publicOrgs = data;
        else { show('orgsTable').innerHTML = `<div class="alert alert-warning mb-0">${t('orgs.cant_load')}</div>`; return; }
      } catch (e) {
        show('orgsTable').innerHTML = `<div class="alert alert-danger mb-0">${t('error')} ${e.message}</div>`;
        return;
      }
    }
    _buildCkanLookup();
  }

  filterOrgs();
}

function renderAllOrgsTable(orgs) {
  const el = show('orgsTable');
  if (!orgs.length) {
    el.innerHTML = `<p class="text-muted text-center py-3">${t('orgs.none_found')}</p>`;
    return;
  }

  const annotated = orgs.map(o => ({
    ...o,
    ckan: _ckanLookup ? (_ckanLookup.get(_normOrg(o.label)) || null) : null,
  }));

  annotated.sort((a, b) => {
    const aReg = !!a.ckan, bReg = !!b.ckan;
    if (aReg !== bReg) return aReg ? -1 : 1;
    if (aReg) return (b.ckan.package_count || 0) - (a.ckan.package_count || 0);
    return a.label.localeCompare(b.label, 'el');
  });

  const regCount   = annotated.filter(o => o.ckan).length;
  const unregCount = annotated.length - regCount;

  _displayedPublicOrgs = annotated;
  el.innerHTML = `
    <div class="d-flex gap-2 mb-3 flex-wrap">
      <span class="badge bg-success px-3 py-2" style="font-size:.85rem">
        <i class="bi bi-check-circle me-1"></i>${fmt(regCount)} ${t('orgs.on_portal')}
      </span>
      <span class="badge bg-secondary px-3 py-2" style="font-size:.85rem">
        <i class="bi bi-dash-circle me-1"></i>${fmt(unregCount)} ${t('orgs.not_registered')}
      </span>
      <span class="text-muted small align-self-center">(${fmt(annotated.length)} ${t('orgs.total_public')})</span>
    </div>
    <div style="max-height:580px;overflow-y:auto">
      <table class="table table-hover align-middle mb-0 table-sm">
        <thead class="sticky-top bg-white"><tr>
          <th style="width:2.5rem">${t('orgs.col_num')}</th>
          <th>${t('orgs.col_org')}</th>
          <th style="width:165px">${t('orgs.col_status')}</th>
          <th class="text-end" style="width:90px">${t('orgs.col_datasets')}</th>
          <th class="text-center" style="width:80px">${t('orgs.col_contacts')}</th>
        </tr></thead>
        <tbody>
          ${annotated.map((o, i) => `<tr>
            <td class="text-muted small">${i + 1}</td>
            <td class="small${o.ckan ? ' fw-semibold' : ''}">
              ${o.ckan
                ? '<a href="#" onclick="openOrgPanel(\'' + o.ckan.name + '\');return false;" class="text-decoration-none">' + o.label + ' <span class="text-muted fw-normal">(' + t('orgs.as') + ' ' + o.ckan.title + ')</span></a>'
                : o.label}
            </td>
            <td>
              ${o.ckan
                ? `<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>${t('orgs.on_portal')}</span>`
                : `<span class="badge bg-secondary">${t('orgs.not_registered')}</span>`}
            </td>
            <td class="text-end fw-bold small">${o.ckan ? fmt(o.ckan.package_count) : '—'}</td>
            <td class="text-center">${(() => {
              // Contacts added directly against an unregistered (HRMS-only) org are saved
              // under its raw HRMS code (see the org panel's "add" button, openNewContactPanel), not its label -- and
              // there's no CKAN slug to cross-reference through for those, unlike orgs that
              // are also on the portal. Fall back to the code so the badge still finds them.
              const cnt = _contactSummary[o.label] || _contactSummary[o.code] || 0;
              return `<button class="btn btn-outline-primary btn-sm py-0 px-2" onclick="openContactsByIdx(${i})" title="${t('contacts.view_contacts')}"><i class="bi bi-people"></i>${cnt ? '<span class="badge bg-primary rounded-pill ms-1">' + cnt + '</span>' : ''}</button>`;
            })()}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function _pollUntilEnriched(attempts = 0) {
  if (attempts > 12) return;  // give up after ~2 min
  await new Promise(r => setTimeout(r, 10000));  // wait 10 s
  try {
    const resp = await fetch(API_BASE + 'api/organizations');
    if (!resp.ok) return;
    const json = await resp.json();
    if (json.error) return;
    _orgsData = json.data;
    _orgsSaveCache(_orgsData, json.fetched_at);
    if (_publicOrgs.length) _buildCkanLookup();
    show('orgsFetchedAt').textContent = json.fetched_at ? t('orgs.fetched') + ' ' + relativeDate(json.fetched_at) : '';
    if (_orgsViewMode === 'portal' && _isTabActive('tab-orgs')) renderOrgsTable(_orgsData);
    if (json.enriching) _pollUntilEnriched(attempts + 1);
  } catch (_) {}
}

// ── Communications tab ───────────────────────────────────────────────────────
// Server-paginated: /api/communications is queried per view instead of once
// for everything, mirroring the Dataset Catalog/Contacts tabs' design (see
// that route's docstring in app.py). Unlike those, there's no cold-cache
// 202-polling dance here -- this queries the DB directly, which stays fast
// even as row counts grow, so every fetch below just resolves immediately.
let _commsLoaded   = false;
let _inboundEmailsData = [];  // pending_review InboundEmail rows -- not real Communications yet, shown above the log for approval
let _inboundAttachModal = null;
// _publicOrgs (HRMS orgs) lives in org_search.js (loaded before this file).
let _commModal     = null;
let _commContactsPrefetchStarted = false;
let _commsSortCol   = 'contact_date';
let _commsSortDir   = 'desc';
let _commsViewMode  = 'cases';
let _expandedOrgs   = new Set();
let _expandedCases  = new Set();
let _expandedTimelineDays = new Set();
let _timelineDaysInitialized = false;
// Set right before a render call that should reveal-animate exactly one
// group (the one the user just expanded), consumed and cleared by that
// render function on its very next call -- see the render functions'
// comments for why a blanket per-class animation doesn't work here.
let _commsRevealKey = null;
// A spinner shown immediately, then replaced a beat later by the real rows
// once the (usually fast) per-group fetch resolves, is itself the visible
// "flash"/jump -- delaying it this long means a fetch that resolves faster
// than this never shows a spinner at all, going straight from collapsed to
// the final content in one clean transition. Long enough that a genuinely
// slow fetch still gets feedback, short enough that it doesn't read as
// unresponsive.
const COMMS_SPINNER_DELAY_MS = 150;

// Server-computed cross-scoped facet counts (case_status/stale/status),
// replacing the old client-side computation over full _commsData/_casesData
// arrays -- refreshed by _applyCommsFacets() whenever any view's fresh
// (start=0) fetch resolves.
let _commsCaseStatusCounts = null;
let _commsStaleCounts      = null;
let _commsStatusCounts     = null;

// q/case_status/stale/status shared by every /api/communications call this
// tab makes (flat rows, group listings, and a single group's expand-fetch)
// -- so all of them stay in sync with the search box and filter cards.
// Sort/dir are NOT included here since only the flat view exposes sorting.
function _commsQueryParams() {
  const p = new URLSearchParams();
  const search = (show('commsSearch').value || '').trim();
  if (search) p.set('q', search);
  if (_commsCaseStatusFilter) p.set('case_status', _commsCaseStatusFilter);
  if (_commsStaleFilter)      p.set('stale', _commsStaleFilter);
  if (_commsStatusFilter)     p.set('status', _commsStatusFilter);
  return p;
}

// Snapshot of _commsQueryParams().toString() as of the last successful fetch
// for ANY view -- same fingerprint-staleness pattern as Portal Members'
// _pmLoadedFingerprint. All 4 views share one fingerprint since they all
// depend on exactly the same 4 filter dimensions.
let _commsLoadedFingerprint = null;

function _applyCommsFacets(data) {
  if (data.case_status_counts) _commsCaseStatusCounts = data.case_status_counts;
  if (data.stale_counts)       _commsStaleCounts      = data.stale_counts;
  if (data.status_counts)      _commsStatusCounts     = data.status_counts;
  renderCommsSummary();
}

// Every id a user can click an edit/follow-up button on is, by construction,
// already sitting in one of the caches below (the button only exists on an
// already-rendered row) -- so a plain in-memory scan across all of them
// always finds it, no fetch needed. Used by openCommModal/addFollowupForComm.
function _commsFindById(id) {
  const inFlat = _commsFlatRows.find(c => c.id === id);
  if (inFlat) return inFlat;
  for (const rows of _commsCaseExpandRows.values()) {
    const hit = rows.find(c => c.id === id);
    if (hit) return hit;
  }
  for (const rows of _commsOrgExpandRows.values()) {
    const hit = rows.find(c => c.id === id);
    if (hit) return hit;
  }
  for (const rows of _commsDayExpandRows.values()) {
    const hit = rows.find(c => c.id === id);
    if (hit) return hit;
  }
  return null;
}

// Case-level fields (deadline/opened_at/closed_at/status) aren't carried by
// every Communication row (only its case_status/case_is_stale snapshot is) --
// fetched on demand via the existing /api/cases/<id> route and cached here,
// since a case's own details rarely change within one modal interaction.
const _commsCaseDetailCache = new Map();
async function _commsFetchCaseDetail(caseId) {
  if (_commsCaseDetailCache.has(caseId)) return _commsCaseDetailCache.get(caseId);
  const resp = await fetch(`${API_BASE}api/cases/${caseId}`);
  const cs = await _fetchJsonOrThrow(resp);
  _commsCaseDetailCache.set(caseId, cs);
  return cs;
}

const STATUS_BADGE = {
  "Initial Contact":      "bg-primary",
  "Intermediate Contact": "bg-info text-dark",
  "Positive Response":    "bg-success",
  "Negative Response":    "bg-danger",
  "No Response":          "bg-secondary",
};
// Built lazily (not at module-eval time) since it depends on t(), which
// needs i18n strings loaded first -- called fresh by every renderer below
// rather than cached, since the active language can change mid-session.
function _commsStatusLabels() {
  return {
    "Initial Contact":      t('comms.initial_contact'),
    "Intermediate Contact": t('comms.intermediate_contact'),
    "Positive Response":    t('comms.positive_response'),
    "Negative Response":    t('comms.negative_response'),
    "No Response":          t('comms.no_response'),
  };
}

const CASE_STATUS_BADGE = { "Open": "bg-warning text-dark", "Closed": "bg-success" };
function caseStatusLabel(status) {
  return status === 'Closed' ? t('comms.case_closed') : t('comms.case_open');
}
function caseBadgeHtml(c, extraClass = '') {
  if (!c.case_id) return '';
  const label = c.case_status ? caseStatusLabel(c.case_status) : '';
  return `<span class="badge ${CASE_STATUS_BADGE[c.case_status] || 'bg-secondary'} ${extraClass}" style="font-size:.62rem" title="${t('comms.case_col')} #${c.case_id}">#${c.case_id}${label ? ' · ' + label : ''}</span>`;
}

function contactPersonHtml(c) {
  if (!c.contact_person) return '';
  return `<div class="text-muted" style="font-size:.7rem"><i class="bi bi-person me-1"></i>${esc(c.contact_person)}</div>`;
}

const MEDIUM_ICON = {
  "Telephone": "bi-telephone",
  "Email":     "bi-envelope",
  "In Person": "bi-person-video3",
  "Other":     "bi-three-dots",
};
function mediumLabel(medium) {
  const KEY = { "Telephone": "comms.medium_telephone", "Email": "comms.medium_email", "In Person": "comms.medium_in_person", "Other": "comms.medium_other" };
  return KEY[medium] ? t(KEY[medium]) : '';
}
// Independent of status/medium -- who this specific entry was actually
// from. Read-only signal in the list (see the direction pill in the edit
// modal for actually changing it) -- blank for unset rather than a dash
// icon, so it doesn't read as a button when there's nothing to show.
const DIRECTION_META = {
  'Inbound':  { icon: 'bi-arrow-down', cls: 'text-danger',  key: 'comms.direction_inbound' },
  'Outbound': { icon: 'bi-arrow-up',   cls: 'text-success', key: 'comms.direction_outbound' },
};
function directionIcon(c) {
  if (!c.direction) return '';
  const meta = DIRECTION_META[c.direction];
  return `<i class="bi ${meta.icon} me-1 ${meta.cls}" style="font-size:1.2em" title="${esc(t(meta.key))}"></i>`;
}
// Comm modal's Direction field -- a single sliding 3-position switch rather
// than a dropdown. saveComm() only ever reads the hidden #commDirection
// input; everything here just keeps the switch's visual state (and the text
// label next to it) in sync with that same value.
const DIRECTION_LABEL_KEY = { '': 'comms.direction_unset_short', 'Inbound': 'comms.direction_inbound', 'Outbound': 'comms.direction_outbound' };
function _applyDirectionSwitchVisual(el, dir) {
  el.dataset.state = dir;
  const key = DIRECTION_LABEL_KEY[dir];
  const titleKey = dir ? key : 'comms.direction_unset';
  el.setAttribute('data-i18n-title', titleKey);
  el.title = t(titleKey);
  const label = show('commDirectionSwitchLabel');
  label.setAttribute('data-i18n', key);
  label.textContent = t(key);
}
function setCommDirectionPill(dir) {
  show('commDirection').value = dir || '';
  _applyDirectionSwitchVisual(show('commDirectionSwitch'), dir || '');
}
const DIRECTION_ORDER = ['Inbound', '', 'Outbound'];
// Sets whichever of the 3 positions was actually clicked -- left third is
// Inbound, middle is unset, right third is Outbound -- rather than cycling
// through them regardless of where the click landed.
function clickDirectionSwitch(ev) {
  const el = ev.currentTarget;
  const rect = el.getBoundingClientRect();
  const frac = (ev.clientX - rect.left) / rect.width;
  const next = frac < 1 / 3 ? 'Inbound' : frac < 2 / 3 ? '' : 'Outbound';
  show('commDirection').value = next;
  _applyDirectionSwitchVisual(el, next);
}
// Keyboard equivalent, since arrow keys have no "click position" -- Left/
// Right move one position at a time, Enter/Space cycles forward.
function keyDirectionSwitch(ev) {
  let idx = DIRECTION_ORDER.indexOf(show('commDirectionSwitch').dataset.state || '');
  if (ev.key === 'ArrowLeft') idx = Math.max(0, idx - 1);
  else if (ev.key === 'ArrowRight') idx = Math.min(DIRECTION_ORDER.length - 1, idx + 1);
  else if (ev.key === 'Enter' || ev.key === ' ') idx = (idx + 1) % DIRECTION_ORDER.length;
  else return;
  ev.preventDefault();
  const next = DIRECTION_ORDER[idx];
  show('commDirection').value = next;
  _applyDirectionSwitchVisual(show('commDirectionSwitch'), next);
}
function autoEmailBadge(c) {
  // Distinguishes a Communication that was auto-captured (or approved) from an
  // inbound email from one logged by hand, even when both have medium=Email.
  return c.source === 'email'
    ? `<span class="badge rounded-pill ms-1" style="font-size:.65rem;background:#e8f0fe;color:#1a56db" data-i18n-title="inbound.auto_badge_title" title="${esc(t('inbound.auto_badge_title'))}"><i class="bi bi-robot me-1"></i>${esc(t('inbound.auto_badge'))}</span>`
    : '';
}

document.getElementById('commsTabBtn').addEventListener('click', () => {
  if (!_commsLoaded) {
    _commsLoaded = true;
    if (!_portalMembersCache) loadContactsTab();
    if (!_orgsData.length) {
      // Warm the portal-orgs cache so the "add communication" org search has
      // more than just HRMS matches, even if the user never opened the Orgs tab.
      const cached = _orgsReadCache();
      if (cached) _orgsData = cached.data;
      else _loadOrgsBackground();
    }
    if (!_publicOrgs.length) fetch(API_BASE + 'api/public-orgs').then(r => r.ok ? r.json() : []).then(d => { _publicOrgs = Array.isArray(d) ? d : []; }).catch(() => {});
    _refreshCommSubjectDatalist();
    _loadInboundEmails();
  }
  // Re-syncs whichever view is active, reusing already-loaded data if the
  // filters haven't changed since -- same relationship _contactsSyncActiveScope
  // has to filterPortalMembersTab (that one resets+refetches; this one doesn't).
  renderCommsSummary();
  _commsSyncView();
});

async function _loadInboundEmails() {
  try {
    const data = await fetch(API_BASE + 'api/inbound-emails?status=pending_review').then(r => r.ok ? r.json() : []);
    _inboundEmailsData = Array.isArray(data) ? data : [];
  } catch (_) {
    _inboundEmailsData = [];
  }
  renderCommsReviewSection();
}

// Called whenever the underlying data changed elsewhere -- this admin's own
// edit, another admin's edit (the 20s multi-editor poll), or an auto-captured
// inbound email (the SSE new_communication event). Refetches the active
// view's data every time (cheap now that it's paginated instead of the whole
// table) but WITHOUT filterComms()'s full reset -- that used to collapse
// every expanded group and jump flat-view scroll back to the top on every
// single tick, which reads as a jarring "the page just refreshed" even
// though nothing the user was looking at necessarily changed. Whichever
// groups are already expanded get their rows refreshed too (so this still
// picks up someone else's edit to something you already have open), just
// without the visual reset.
// Re-fetches whichever groups are already expanded so a quiet background
// refresh still picks up someone else's edit to them -- but only actually
// re-renders (tearing down and recreating every row as fresh DOM nodes,
// which is what made a row's hover highlight visibly flash) if something in
// there genuinely changed. Re-fetching unconditionally while rendering
// conditionally keeps data fresh without the visible churn when it wasn't.
async function _commsRefreshInPlace() {
  if (_commsViewMode === 'cases') {
    await _loadCommsCaseGroups(true);
    const stillExpanded = [..._expandedCases].filter(id => _commsCaseGroups.some(cs => cs.id === id));
    let rowsChanged = false;
    await Promise.all(stillExpanded.map(async id => {
      const before = _commsCaseExpandRows.get(id);
      _commsCaseExpandRows.delete(id);
      await _fetchCommsCaseRows(id);
      if (JSON.stringify(before) !== JSON.stringify(_commsCaseExpandRows.get(id))) rowsChanged = true;
    }));
    if (rowsChanged) _renderCommsCaseGroups();
  } else if (_commsViewMode === 'grouped') {
    await _loadCommsOrgGroups(true);
    const stillExpanded = [..._expandedOrgs].filter(k => _commsOrgGroups.some(g => g.org_title === k));
    let rowsChanged = false;
    await Promise.all(stillExpanded.map(async k => {
      const before = _commsOrgExpandRows.get(k);
      _commsOrgExpandRows.delete(k);
      await _fetchCommsOrgRows(k);
      if (JSON.stringify(before) !== JSON.stringify(_commsOrgExpandRows.get(k))) rowsChanged = true;
    }));
    if (rowsChanged) _renderCommsOrgGroups();
  } else if (_commsViewMode === 'timeline') {
    await _loadCommsDayGroups(true);
    const stillExpanded = [..._expandedTimelineDays].filter(d => _commsDayGroups.some(g => g.day === d));
    let rowsChanged = false;
    await Promise.all(stillExpanded.map(async d => {
      const before = _commsDayExpandRows.get(d);
      _commsDayExpandRows.delete(d);
      await _fetchCommsDayRows(d);
      if (JSON.stringify(before) !== JSON.stringify(_commsDayExpandRows.get(d))) rowsChanged = true;
    }));
    if (rowsChanged) _renderCommsDayGroups();
  } else {
    await loadCommsFlat(false, true);
  }
}

let _commsReloadInFlight = null;
let _commsReloadQueued = false;

// Coalesces overlapping calls instead of running them concurrently -- the
// SSE new_communication handler fires once per Communication (a single
// forwarded thread can now auto-log several at once, see the per-message
// splitting), and the 20s poll can land in the same window, so without this
// two reloads could interleave: one's _commsCaseExpandRows.delete(caseId)
// (see _commsRefreshInPlace) landing between the other's delete and its
// re-fetch resolving made an already-expanded case's rows vanish out from
// under it, showing a stray loading spinner for content that was never
// actually gone. A call that arrives mid-reload just marks one more run
// queued rather than starting its own overlapping chain; at most one
// trailing run happens after the current one finishes, so whatever changed
// during the overlap still gets picked up.
async function _reloadCasesAndComms() {
  if (_commsReloadInFlight) {
    _commsReloadQueued = true;
    return _commsReloadInFlight;
  }
  _commsReloadInFlight = _reloadCasesAndCommsImpl().finally(() => {
    _commsReloadInFlight = null;
    if (_commsReloadQueued) {
      _commsReloadQueued = false;
      _reloadCasesAndComms();
    }
  });
  return _commsReloadInFlight;
}

async function _reloadCasesAndCommsImpl() {
  if (!_isTabActive('tab-comms')) {
    // Not looking at the tab right now -- just mark every view stale so the
    // next visit fetches fresh instead of showing pre-change data.
    _commsLoadedFingerprint = null;
    return;
  }
  await _loadInboundEmails();
  if (_commsFlatLoaded || _commsCaseGroupsLoaded || _commsOrgGroupsLoaded || _commsDayGroupsLoaded) {
    await _commsRefreshInPlace();
  } else {
    filterComms();
  }
}

async function _refreshCommSubjectDatalist() {
  const list = document.getElementById('commSubjectDatalist');
  if (!list) return;
  let subjects;
  try {
    subjects = await fetch(API_BASE + 'api/communications/subjects').then(r => r.ok ? r.json() : []);
  } catch (_) {
    return;  // leave the datalist as it was rather than wiping it on a transient error
  }
  if (!Array.isArray(subjects)) return;
  list.innerHTML = subjects.map(s => `<option value="${esc(s)}">`).join('');
}

// Independently combinable, same as the Dataset Catalog's Type/HVD/Harvested
// tabs and the Contacts tab's Role/State split: each dimension can be
// filtered on its own and they AND together, instead of the old single
// mutually-exclusive _commsActiveFilter.
let _commsCaseStatusFilter = null;  // null | 'Open' | 'Closed'
let _commsStaleFilter      = null;  // null | '1' (stale) | '0' (not stale)
let _commsStatusFilter     = null;  // null | 'Initial Contact' | 'Intermediate Contact' | 'Positive Response' | 'Negative Response'
let _commsSummaryCards = [];

const CARD_BORDER_COLOR = {
  'text-secondary': '#6c757d', 'text-warning': '#ffc107', 'text-success': '#198754',
  'text-primary':   '#0057b8', 'text-info':    '#0dcaf0', 'text-danger':  '#dc3545',
};

const INBOUND_REASON_KEY = {
  no_contact_match:       'inbound.reason_no_contact',
  no_open_case:           'inbound.reason_no_case',
  multiple_open_cases:    'inbound.reason_multiple_cases',
  multiple_contacts_match: 'inbound.reason_multiple_contacts',
  communication_deleted:  'inbound.reason_comm_deleted',
  processing_error:       'inbound.reason_processing_error',
};

function renderCommsReviewSection() {
  const el = document.getElementById('commsReviewSection');
  if (!el) return;
  if (!_inboundEmailsData.length) {
    el.classList.add('d-none');
    el.innerHTML = '';
    return;
  }
  el.classList.remove('d-none');

  const cards = _inboundEmailsData.map(e => {
    const matchedContacts = e.matched_contacts || [];
    // An email can name registered contacts from more than one org (e.g.
    // two orgs, neither with an Open case) -- list every one instead of
    // just the first, one per line.
    const orgLine = matchedContacts.length
      ? `<div class="small text-muted">${matchedContacts.map(c => {
          const name = `${c.first_name || ''} ${c.last_name || ''}`.trim();
          const org = c.org_label || c.org_code || '';
          return esc(org) + (name ? ' &middot; ' + esc(name) : '');
        }).join('<br>')}</div>`
      : '';
    const candidatesLine = (e.reason === 'multiple_contacts_match' && (e.candidate_contacts || []).length)
      ? `<div class="small text-muted">${e.candidate_contacts.map(c => esc(`${c.first_name || ''} ${c.last_name || ''}`.trim() + (c.org_label ? ` (${c.org_label})` : ''))).join(' &middot; ')}</div>`
      : '';
    const body = e.body_text || '';
    const preview = body.length > 220 ? body.slice(0, 220) + '…' : body;
    return `
    <div class="card mb-2 border-warning">
      <div class="card-body py-2 px-3">
        <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
          <div class="flex-grow-1" style="min-width:0">
            <div class="fw-semibold">
              ${esc(e.from_name || e.from_email || '')}
              ${e.from_email ? `<span class="text-muted small fw-normal">&lt;${esc(e.from_email)}&gt;</span>` : ''}
              <span class="badge bg-warning text-dark ms-1">${esc(t(INBOUND_REASON_KEY[e.reason]) || e.reason || '')}</span>
            </div>
            <div class="small">${esc(e.subject || '')}</div>
            ${orgLine}
            ${candidatesLine}
            ${preview ? `<div class="text-muted small mt-1" style="white-space:pre-wrap">${esc(preview)}</div>` : ''}
            <div class="text-muted small mt-1">${relativeDate(e.received_at)}</div>
          </div>
          <div class="d-flex gap-1 flex-shrink-0">
            <button class="btn btn-primary btn-sm py-0 px-2" onclick="openInboundAttachModal(${e.id})"><i class="bi bi-check-lg me-1"></i>${t('inbound.attach')}</button>
            <button class="btn btn-outline-secondary btn-sm py-0 px-2" onclick="dismissInboundEmail(${e.id})"><i class="bi bi-x-lg me-1"></i>${t('inbound.dismiss')}</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <h6 class="fw-semibold small text-uppercase text-muted mb-2">
      <i class="bi bi-inbox me-1"></i>${t('inbound.pending_title')} <span class="badge bg-warning text-dark rounded-pill">${_inboundEmailsData.length}</span>
    </h6>
    ${cards}`;
}

function renderCommsSummary() {
  // Counts come from the server (_commsCaseStatusCounts/_commsStaleCounts/
  // _commsStatusCounts, refreshed by _applyCommsFacets whenever any view's
  // fresh fetch resolves) instead of being computed here over full
  // _commsData/_casesData arrays -- each is already cross-scoped by the
  // *other* two filter dimensions server-side, same relationship the old
  // client-side computation had. null-safe defaults so the cards render as
  // all-zero before the first fetch resolves rather than throwing.
  const csc = _commsCaseStatusCounts || { total: 0, Open: 0, Closed: 0 };
  const sc  = _commsStaleCounts      || { total: 0, '1': 0, '0': 0 };
  const stc = _commsStatusCounts     || { total: 0, "Initial Contact": 0, "Intermediate Contact": 0, "Positive Response": 0, "Negative Response": 0 };

  _commsSummaryCards = [
    { filter: { dim: 'case_status', value: null },       label: t('comms.total'),        value: csc.total,        bg: "bg-secondary bg-opacity-10", text: "text-secondary", icon: "bi-list-ul" },
    { filter: { dim: 'case_status', value: 'Open' },      label: t('comms.open_cases'),   value: csc.Open || 0,   bg: "bg-warning bg-opacity-10", text: "text-warning",   icon: "bi-folder2-open" },
    { filter: { dim: 'case_status', value: 'Closed' },    label: t('comms.closed_cases'), value: csc.Closed || 0, bg: "bg-success bg-opacity-10", text: "text-success",   icon: "bi-folder-check" },

    { filter: { dim: 'stale', value: null }, label: t('comms.total'),          value: sc.total,      bg: "bg-secondary bg-opacity-10", text: "text-secondary", icon: "bi-list-ul" },
    { filter: { dim: 'stale', value: '1' },  label: t('comms.stale_cases'),     value: sc['1'] || 0,  bg: "bg-danger bg-opacity-10",    text: "text-danger",    icon: "bi-hourglass-split" },
    { filter: { dim: 'stale', value: '0' },  label: t('comms.not_stale_cases'), value: sc['0'] || 0,  bg: "bg-secondary bg-opacity-10", text: "text-secondary", icon: "bi-hourglass-split" },

    { filter: { dim: 'status', value: null },                     label: t('comms.total'),                value: stc.total,                                  bg: "bg-secondary bg-opacity-10", text: "text-secondary", icon: "bi-list-ul" },
    { filter: { dim: 'status', value: 'Initial Contact' },        label: t('comms.initial_contact'),      value: stc["Initial Contact"] || 0,      bg: "bg-primary bg-opacity-10", text: "text-primary", icon: "bi-envelope" },
    { filter: { dim: 'status', value: 'Intermediate Contact' },   label: t('comms.intermediate_contact'), value: stc["Intermediate Contact"] || 0, bg: "bg-info bg-opacity-10",    text: "text-info",    icon: "bi-reply" },
    { filter: { dim: 'status', value: 'Positive Response' },      label: t('comms.positive_response'),    value: stc["Positive Response"] || 0,    bg: "bg-success bg-opacity-10", text: "text-success", icon: "bi-hand-thumbs-up" },
    { filter: { dim: 'status', value: 'Negative Response' },      label: t('comms.negative_response'),    value: stc["Negative Response"] || 0,    bg: "bg-danger bg-opacity-10",   text: "text-danger",  icon: "bi-hand-thumbs-down" },
  ];

  _renderCommsFilterGroup('commsCaseSummary',   [0, 1, 2],       'commsCaseTabDot');
  _renderCommsFilterGroup('commsStaleSummary',  [3, 4, 5],       'commsStaleTabDot');
  _renderCommsFilterGroup('commsStatusSummary', [6, 7, 8, 9, 10],'commsStatusTabDot');
}

function _commsFilterIsActive(f) {
  if (f.dim === 'case_status') return _commsCaseStatusFilter === f.value;
  if (f.dim === 'stale')       return _commsStaleFilter === f.value;
  if (f.dim === 'status')      return _commsStatusFilter === f.value;
  return false;
}

function _renderCommsFilterGroup(elId, indices, tabDotId) {
  const prepared = indices.map(idx => {
    const c = _commsSummaryCards[idx];
    return { ...c, active: _commsFilterIsActive(c.filter), onclick: `setCommsFilter(${idx})` };
  });
  const hasActive = indices.some(idx => {
    const f = _commsSummaryCards[idx].filter;
    return f.value !== null && _commsFilterIsActive(f);
  });
  _renderFilterCardsGrid(elId, prepared, tabDotId, hasActive ? {} : null);
}

function setCommsFilter(idx) {
  const card = _commsSummaryCards[idx];
  if (!card) return;
  const f = card.filter;
  if (f.dim === 'case_status') _commsCaseStatusFilter = (_commsCaseStatusFilter === f.value) ? null : f.value;
  else if (f.dim === 'stale')  _commsStaleFilter      = (_commsStaleFilter === f.value) ? null : f.value;
  else if (f.dim === 'status') _commsStatusFilter     = (_commsStatusFilter === f.value) ? null : f.value;
  renderCommsSummary();
  filterComms();
}

function clearCommsFilters() {
  _commsCaseStatusFilter = null;
  _commsStaleFilter = null;
  _commsStatusFilter = null;
  renderCommsSummary();
  filterComms();
}


function sortComms(col) {
  if (_commsSortCol === col) {
    _commsSortDir = _commsSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    _commsSortCol = col;
    _commsSortDir = col === 'contact_date' ? 'desc' : 'asc';
  }
  loadCommsFlat(false);  // only the flat view exposes sorting -- the 3 grouped views are unaffected
}

function commsArrow(col) {
  if (_commsSortCol !== col) return '<span style="opacity:.25;font-size:.8em"> ↕</span>';
  return _commsSortDir === 'asc' ? ' ↑' : ' ↓';
}

// Re-syncs whichever view is currently selected, reusing already-loaded data
// if the 4 filter dimensions haven't changed since -- mirrors _pmSyncView.
// Used on view-mode toggle and re-clicking the tab button; filterComms()
// below is for when the result set itself actually changed.
function _commsSyncView() {
  const stale = _commsQueryParams().toString() !== _commsLoadedFingerprint;
  if (_commsViewMode === 'cases') {
    if (_commsCaseGroupsLoaded && !stale) _renderCommsCaseGroups();
    else _loadCommsCaseGroups();
  } else if (_commsViewMode === 'grouped') {
    if (_commsOrgGroupsLoaded && !stale) _renderCommsOrgGroups();
    else _loadCommsOrgGroups();
  } else if (_commsViewMode === 'timeline') {
    if (_commsDayGroupsLoaded && !stale) _renderCommsDayGroups();
    else _loadCommsDayGroups();
  } else if (!_commsFlatLoaded || stale) {
    loadCommsFlat(false);
  } else {
    // Either #commsTable was emptied by the hidden.bs.tab listener while we
    // were on another tab, or it's still showing a DIFFERENT view's markup
    // (switched to Cases/Grouped/Timeline and back) -- #commsTable is a
    // shared container for all 4 views, so a `tbody` existing there doesn't
    // mean it's flat's own. Always rebuild from the already-fetched cache
    // instead (no network call either way).
    _renderCommsFlat(_commsFlatRows, false);
  }
}

// Search box / filter card clicks funnel here -- the result set has
// genuinely changed, so every view's cached data (and any expanded groups,
// which no longer necessarily apply to the new result set) is stale.
function filterComms() {
  _commsFlatRows = []; _commsFlatLoaded = false; _commsFlatStart = 0; _commsFlatTotal = 0;
  _commsCaseGroups = []; _commsCaseGroupsLoaded = false; _commsCaseExpandRows.clear(); _expandedCases.clear();
  _commsOrgGroups = []; _commsOrgGroupsLoaded = false; _commsOrgExpandRows.clear(); _expandedOrgs.clear();
  _commsDayGroups = []; _commsDayGroupsLoaded = false; _commsDayExpandRows.clear(); _expandedTimelineDays.clear(); _timelineDaysInitialized = false;
  _commsSyncView();
}

function setCommsView(mode) {
  _commsViewMode = mode;
  show('commsViewFlatBtn').className     = 'btn btn-sm ' + (mode === 'flat'     ? 'btn-primary' : 'btn-outline-primary');
  show('commsViewGroupedBtn').className  = 'btn btn-sm ' + (mode === 'grouped'  ? 'btn-primary' : 'btn-outline-primary');
  show('commsViewCasesBtn').className    = 'btn btn-sm ' + (mode === 'cases'    ? 'btn-primary' : 'btn-outline-primary');
  show('commsViewTimelineBtn').className = 'btn btn-sm ' + (mode === 'timeline' ? 'btn-primary' : 'btn-outline-primary');
  const showExpandBtns = (mode === 'cases' || mode === 'grouped' || mode === 'timeline');
  show('commsExpandAllBtn').classList.toggle('d-none', !showExpandBtns);
  show('commsCollapseAllBtn').classList.toggle('d-none', !showExpandBtns);
  _commsSyncView();  // reuses already-loaded data for this view if we have it
}

// Shared by expandAllComms's 3 group-view branches -- throttled (not
// all-at-once) the same way Portal Members' expandAllPortalMembers is, so
// expanding e.g. 40 groups doesn't fire 40 simultaneous requests.
async function _commsThrottledExpand(keys, markFn, fetchFn, renderFn) {
  const btn = show('commsExpandAllBtn');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
  keys.forEach(markFn);
  renderFn();
  const CONCURRENCY = 4;
  let next = 0;
  async function worker() {
    while (next < keys.length) {
      const k = keys[next++];
      await fetchFn(k);
      renderFn();
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, keys.length) }, worker));
  btn.disabled = false;
  btn.innerHTML = originalHtml;
}

async function expandAllComms() {
  if (_commsViewMode === 'cases') {
    const ids = _commsCaseGroups.map(cs => cs.id).filter(id => !_expandedCases.has(id));
    if (ids.length) await _commsThrottledExpand(ids, id => _expandedCases.add(id), id => _fetchCommsCaseRows(id), _renderCommsCaseGroups);
  } else if (_commsViewMode === 'grouped') {
    const keys = _commsOrgGroups.map(g => g.org_title).filter(k => !_expandedOrgs.has(k));
    if (keys.length) await _commsThrottledExpand(keys, k => _expandedOrgs.add(k), k => _fetchCommsOrgRows(k), _renderCommsOrgGroups);
  } else if (_commsViewMode === 'timeline') {
    const days = _commsDayGroups.map(g => g.day).filter(d => !_expandedTimelineDays.has(d));
    if (days.length) await _commsThrottledExpand(days, d => _expandedTimelineDays.add(d), d => _fetchCommsDayRows(d), _renderCommsDayGroups);
  }
}

function collapseAllComms() {
  if (_commsViewMode === 'cases') { _expandedCases.clear(); _renderCommsCaseGroups(); }
  else if (_commsViewMode === 'grouped') { _expandedOrgs.clear(); _renderCommsOrgGroups(); }
  else if (_commsViewMode === 'timeline') { _expandedTimelineDays.clear(); _renderCommsDayGroups(); }
}

function _commsFlatRowHtml(c) {
  const statusLabel = _commsStatusLabels();
  return `
    <tr onclick="openCommModal(${c.id})" style="cursor:pointer">
      <td class="text-muted small mono text-nowrap">${esc(c.contact_date)}</td>
      <td class="fw-semibold small">${esc(c.org_title)}</td>
      <td class="small">${esc(c.subject)} ${caseBadgeHtml(c)}${contactPersonHtml(c)}</td>
      <td><span class="badge ${STATUS_BADGE[c.status] || 'bg-secondary'}">${statusLabel[c.status] || c.status}</span></td>
      <td class="small text-muted">${directionIcon(c)}${c.medium ? `<i class="bi ${MEDIUM_ICON[c.medium] || 'bi-dash'} me-1"></i>${mediumLabel(c.medium)}` : ''}${autoEmailBadge(c)}</td>
      <td class="small text-muted text-truncate" style="max-width:0" title="${esc(c.notes || '')}">${esc(c.notes || '')}</td>
      <td class="text-end text-nowrap" onclick="event.stopPropagation()">
        <div class="d-flex gap-1 justify-content-end">
          ${c.case_id ? `<button class="btn btn-outline-primary btn-sm py-0 px-1" onclick="addFollowupForComm(${c.id})" title="${t('comms.case_add_followup')}"><i class="bi bi-plus-circle"></i></button>` : ''}
          <button class="btn btn-outline-secondary btn-sm py-0 px-1" onclick="openCommModal(${c.id})" title="${t('common.edit')}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-outline-danger btn-sm py-0 px-1" onclick="deleteComm(${c.id})" title="${t('common.delete')}"><i class="bi bi-trash"></i></button>
        </div>
      </td>
    </tr>`;
}

// ── Communications: flat/all view (real infinite scroll) ───────────────────
// The only one of the 4 views where the underlying row count can genuinely
// grow large enough to matter -- the 3 grouped views below fetch their whole
// group listing in one shot instead (bounded by case/org/day count, not by
// total communications logged), same tradeoff Portal Members' org grouping
// already makes.
const COMMS_PAGE_SIZE = 50;
let _commsFlatRows = [];
let _commsFlatStart = 0;
let _commsFlatTotal = 0;
let _commsFlatLoaded = false;
let _commsFlatLoadingMore = false;
let _commsFlatObserver = null;

function _ensureCommsFlatObserver() {
  if (!_commsFlatObserver) {
    _commsFlatObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) _commsFlatLoadMoreTrigger();
    }, { rootMargin: '400px 0px' });
  }
  return _commsFlatObserver;
}
function _commsFlatLoadMoreTrigger() {
  if (_commsFlatLoadingMore || _commsFlatStart >= _commsFlatTotal) return;
  loadCommsFlat(true);
}

// Quiet background refresh for the flat view -- unlike a normal (re)load,
// this has to re-fetch EVERYTHING currently loaded (not just page 1), or a
// 20s tick would silently discard any extra pages scrolled into via
// infinite scroll and reset the view back to just the first page. Diffs
// before rendering, same reasoning as the other 3 views' quiet refresh
// (_commsRefreshInPlace) -- skips the rebuild (and the hover-flash that
// comes with tearing down and recreating every row) when nothing changed.
async function _refreshCommsFlatInPlace() {
  try {
    const currentCount = _commsFlatRows.length || COMMS_PAGE_SIZE;
    const params = _commsQueryParams();
    params.set('sort', _commsSortCol);
    params.set('dir', _commsSortDir);
    params.set('rows', currentCount);
    params.set('start', 0);
    const resp = await fetch(API_BASE + 'api/communications?' + params.toString());
    const data = await _fetchJsonOrThrow(resp);
    const newRows = data.rows || [];
    _applyCommsFacets(data);
    _commsLoadedFingerprint = _commsQueryParams().toString();
    _commsFlatTotal = data.total || 0;
    if (JSON.stringify(newRows) === JSON.stringify(_commsFlatRows)) return;
    _commsFlatRows = newRows;
    _commsFlatStart = newRows.length;
    _renderCommsFlat(_commsFlatRows, false);
  } catch (e) { /* quiet -- leave whatever's already on screen rather than disrupt it */ }
}

async function loadCommsFlat(append = false, background = false) {
  if (_commsViewMode !== 'flat') return;
  if (background && !append) return _refreshCommsFlatInPlace();
  if (!append) _commsFlatStart = 0;
  if (append) {
    _commsFlatLoadingMore = true;
  } else {
    if (_commsFlatObserver) _commsFlatObserver.disconnect();
    show('commsTable').innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>`;
  }
  try {
    const params = _commsQueryParams();
    params.set('sort', _commsSortCol);
    params.set('dir', _commsSortDir);
    params.set('rows', COMMS_PAGE_SIZE);
    params.set('start', _commsFlatStart);
    const resp = await fetch(API_BASE + 'api/communications?' + params.toString());
    const data = await _fetchJsonOrThrow(resp);
    _commsFlatTotal = data.total || 0;
    if (!append) {
      _commsFlatRows = [];
      _applyCommsFacets(data);
      _commsLoadedFingerprint = _commsQueryParams().toString();
    }
    const newRows = data.rows || [];
    _commsFlatRows = _commsFlatRows.concat(newRows);
    _commsFlatStart += newRows.length;
    if (!append && !newRows.length) {
      show('commsTable').innerHTML = `<p class="text-muted text-center py-4">${t('comms.none')}</p>`;
    } else {
      _renderCommsFlat(append ? newRows : _commsFlatRows, append);
    }
    _commsFlatLoaded = true;
  } catch (e) {
    if (!append && !background) show('commsTable').innerHTML = `<div class="alert alert-danger mb-0">${esc(e.message)}</div>`;
  } finally {
    _commsFlatLoadingMore = false;
  }
}

// rows/append: append=false always means "render this full set from
// scratch" (used both for a fresh page-1 load and for rebuilding from cache
// after the DOM was wiped -- see _commsSyncView); append=true means "insert
// just these new rows at the bottom of the existing table".
function _renderCommsFlat(rows, append) {
  if (append) {
    const tbody = document.querySelector('#commsTable tbody');
    if (tbody) tbody.insertAdjacentHTML('beforeend', rows.map(_commsFlatRowHtml).join(''));
  } else {
    const thS = (col, label, cls = '') =>
      `<th class="${cls}" style="cursor:pointer;user-select:none;white-space:nowrap" onclick="sortComms('${col}')">${label}${commsArrow(col)}</th>`;
    show('commsTable').innerHTML = `
      <table class="table table-hover table-sm align-middle mb-0" style="table-layout:fixed">
        <colgroup><col style="width:110px"><col><col><col style="width:140px"><col style="width:120px"><col><col style="width:80px"></colgroup>
        <thead><tr>
          ${thS('contact_date', t('comms.col_date'), 'text-nowrap')}
          ${thS('org_title',    t('comms.col_org'))}
          ${thS('subject',      t('comms.col_subject'))}
          ${thS('status',       t('comms.col_status'))}
          <th>${t('comms.col_medium')}</th>
          <th>${t('comms.col_notes')}</th>
          <th></th>
        </tr></thead>
        <tbody>${rows.map(_commsFlatRowHtml).join('')}</tbody>
      </table>
      <div id="commsLoadMoreSentinel" class="text-center text-muted small py-2"></div>`;
  }
  const sentinel = document.getElementById('commsLoadMoreSentinel');
  if (sentinel) {
    if (_commsFlatStart < _commsFlatTotal) {
      sentinel.innerHTML = '';
      _ensureCommsFlatObserver().observe(sentinel);
    } else {
      _ensureCommsFlatObserver().unobserve(sentinel);
      sentinel.innerHTML = _commsFlatTotal ? t('catalog.end_of_results') : '';
    }
  }
}

// Shared by the org and case grouped views' expanded rows -- identical
// markup except the case view omits the case badge (redundant once you're
// already looking inside that case's own group).
function _commsHistRowHtml(c, showCaseBadge, reveal = false) {
  const statusLabel = _commsStatusLabels();
  return `
    <tr class="comm-hist-row${reveal ? ' just-revealed' : ''}" onclick="openCommModal(${c.id})" style="cursor:pointer">
      <td class="text-muted small mono text-nowrap ps-4">${esc(c.contact_date)}</td>
      <td class="small">${esc(c.subject)}${showCaseBadge ? ' ' + caseBadgeHtml(c) : ''}${autoEmailBadge(c) ? ' ' + autoEmailBadge(c) : ''}${contactPersonHtml(c)}</td>
      <td><span class="badge ${STATUS_BADGE[c.status] || 'bg-secondary'}" style="white-space:normal">${statusLabel[c.status] || c.status}</span></td>
      <td class="small text-muted">${directionIcon(c)}${c.medium ? `<i class="bi ${MEDIUM_ICON[c.medium] || 'bi-dash'} me-1"></i>${mediumLabel(c.medium)}` : ''}</td>
      <td class="small text-muted text-truncate" style="max-width:0" title="${esc(c.notes || '')}">${esc(c.notes || '')}</td>
      <td class="text-end text-nowrap" onclick="event.stopPropagation()">
        <div class="d-flex gap-1 justify-content-end">
          ${c.case_id ? `<button class="btn btn-outline-primary btn-sm py-0 px-1" onclick="addFollowupForComm(${c.id})" title="${t('comms.case_add_followup')}"><i class="bi bi-plus-circle"></i></button>` : ''}
          <button class="btn btn-outline-secondary btn-sm py-0 px-1" onclick="openCommModal(${c.id})" title="${t('common.edit')}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-outline-danger btn-sm py-0 px-1" onclick="deleteComm(${c.id})" title="${t('common.delete')}"><i class="bi bi-trash"></i></button>
        </div>
      </td>
    </tr>`;
}
function _commsGroupTableShell(rows) {
  return `
    <table class="table table-hover table-sm align-middle mb-0" style="table-layout:fixed">
      <colgroup><col style="width:110px"><col><col style="width:190px"><col style="width:110px"><col><col style="width:80px"></colgroup>
      <thead><tr>
        <th>${t('comms.col_date')}</th>
        <th>${t('comms.col_subject')}</th>
        <th>${t('comms.col_status')}</th>
        <th>${t('comms.col_medium')}</th>
        <th>${t('comms.col_notes')}</th>
        <th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Communications: By-Organization view ────────────────────────────────────
// Same lazy-loading design as Portal Members' org grouping: group_by=org
// gets accurate per-org counts from one aggregate pass with no row fetching,
// so every group card renders immediately; a group's actual rows are only
// fetched the first time it's expanded, then cached here.
let _commsOrgGroups = [];
let _commsOrgGroupsLoaded = false;
const _commsOrgExpandRows = new Map();     // org_title -> rows[]
const _commsOrgExpandLoading = new Set();  // org_titles currently fetching

// background=true is the 20s/SSE poll's quiet refresh: keep whatever's
// already on screen (and whichever groups are expanded) instead of flashing
// a full-page spinner and wiping every group's cached rows, both of which
// only make sense for an actual first load or a real filter change.
async function _loadCommsOrgGroups(background = false) {
  if (_commsViewMode !== 'grouped') return;
  if (!background) show('commsTable').innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>`;
  try {
    const params = _commsQueryParams();
    params.set('group_by', 'org');
    params.set('rows', 500);  // groups are bounded by org count, not total comms -- one shot, no scrolling needed
    const resp = await fetch(API_BASE + 'api/communications?' + params.toString());
    const data = await _fetchJsonOrThrow(resp);
    const newGroups = data.groups || [];
    // A background refresh whose group list came back byte-for-byte
    // identical has nothing to actually show -- re-rendering anyway would
    // tear down and recreate every row as fresh DOM nodes for no reason,
    // which is what made whichever row your mouse happened to be resting
    // on visibly flash its hover highlight every 20s even when nothing
    // had changed (the browser has to recompute :hover on the new node).
    const unchanged = background && JSON.stringify(newGroups) === JSON.stringify(_commsOrgGroups);
    _commsOrgGroupsLoaded = true;
    _applyCommsFacets(data);
    _commsLoadedFingerprint = _commsQueryParams().toString();
    if (unchanged) return;
    _commsOrgGroups = newGroups;
    if (!background) _commsOrgExpandRows.clear();
    _renderCommsOrgGroups();
  } catch (e) {
    if (!background) show('commsTable').innerHTML = `<div class="alert alert-danger mb-0">${esc(e.message)}</div>`;
  }
}

function _renderCommsOrgGroups() {
  const el = show('commsTable');
  if (!_commsOrgGroups.length) {
    el.innerHTML = `<p class="text-muted text-center py-4">${t('comms.none')}</p>`;
    return;
  }
  // Every call rebuilds every group's rows, not just the one actually being
  // toggled -- capturing (and immediately clearing) the key here means only
  // the group that just got explicitly expanded gets the reveal animation
  // this pass; a full rebuild triggered by something else (a background
  // refresh, or toggling a *different* group) leaves _commsRevealKey unset
  // and so animates nothing.
  const revealKey = _commsRevealKey;
  _commsRevealKey = null;
  const statusLabel = _commsStatusLabels();
  const rows = _commsOrgGroups.map(g => {
    const orgTitle   = g.org_title;
    const isExpanded = _expandedOrgs.has(orgTitle);
    const cachedRows = _commsOrgExpandRows.get(orgTitle);
    const isLoading  = _commsOrgExpandLoading.has(orgTitle);
    const safeAttr   = orgTitle.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
    const reveal     = orgTitle === revealKey;
    let body = '';
    if (isExpanded) {
      body = (isLoading || !cachedRows)
        ? `<tr class="comm-hist-row${reveal ? ' just-revealed' : ''}"><td colspan="6" class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div></td></tr>`
        : cachedRows.map(c => _commsHistRowHtml(c, true, reveal)).join('');
    }
    return `
      <tr class="comm-group-row" style="cursor:pointer" data-org="${safeAttr}" onclick="toggleOrgComms(this.dataset.org)">
        <td colspan="6">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-chevron-${isExpanded ? 'down' : 'right'} text-muted small"></i>
            <span class="fw-semibold">${esc(orgTitle)}</span>
            <span class="badge bg-secondary rounded-pill" style="font-size:.7rem">${g.count} ${g.count === 1 ? t('comms.entry') : t('comms.entries')}</span>
            <span class="badge ${STATUS_BADGE[g.latest_status] || 'bg-secondary'}" style="font-size:.7rem">${statusLabel[g.latest_status] || g.latest_status}</span>
            <span class="text-muted small ms-auto">${g.latest_date}</span>
            <button class="btn btn-outline-primary btn-sm py-0 px-2 ms-2" data-org="${safeAttr}" data-orgcode="${esc(g.org_name || '')}"
                    onclick="event.stopPropagation();openCommModal(null,this.dataset.org,this.dataset.orgcode)"
                    title="${t('comms.add_comm_for_org')}">
              <i class="bi bi-plus"></i>
            </button>
          </div>
        </td>
      </tr>
      ${body}`;
  }).join('');

  el.innerHTML = _commsGroupTableShell(rows);
}

// A group's spinner-row is short; the rows that replace it usually aren't --
// swapping between them with no transition snaps #commsTable to its new
// height in one frame, instantly shoving everything below it down (or up,
// on collapse). This fades the *content* (see the .comm-hist-row/
// .comm-timeline-item CSS animation), but never smoothed the *height*
// change itself, which is the bigger part of what actually reads as a
// jump. Wraps a render call so the container's height animates from its
// old value to its new one instead of snapping -- same idea as a CSS
// height transition, just done in JS because "auto" heights aren't
// transitionable directly.
function _animateHeightSwap(el, updateFn) {
  const fromHeight = el.getBoundingClientRect().height;
  el.style.transition = 'none';
  el.style.height = fromHeight + 'px';
  el.style.overflow = 'hidden';
  void el.offsetHeight;  // force layout so the explicit height above actually commits before the swap
  updateFn();
  const toHeight = el.scrollHeight;
  const release = () => {
    el.style.transition = '';
    el.style.height = '';
    el.style.overflow = '';
  };
  // Setting height to the SAME value it's already at never fires a CSS
  // transition (nothing actually changed for the browser to animate), so
  // transitionend would never come and this container would stay pinned at
  // that height with overflow:hidden forever -- clipping whatever content
  // came after, since nothing would ever release it. A same-height toggle
  // is a real, fairly common coincidence (similarly-sized entries), not an
  // edge case worth ignoring.
  if (Math.round(fromHeight) === toHeight) { release(); return; }
  requestAnimationFrame(() => {
    el.style.transition = 'height .2s ease';
    el.style.height = toHeight + 'px';
  });
  const done = (ev) => {
    if (ev && ev.target !== el) return;  // ignore bubbled transitions from children
    release();
    el.removeEventListener('transitionend', done);
    clearTimeout(fallback);
  };
  el.addEventListener('transitionend', done);
  // Defensive fallback in case transitionend never fires for some other
  // reason too (backgrounded tab throttling, element removed mid-transition,
  // etc.) -- comfortably longer than the transition itself so it never
  // fires first under normal conditions, just guarantees this can't stay
  // pinned indefinitely no matter what goes wrong.
  const fallback = setTimeout(() => { release(); el.removeEventListener('transitionend', done); }, 500);
}

function toggleOrgComms(orgTitle) {
  const el = show('commsTable');
  if (_expandedOrgs.has(orgTitle)) {
    _expandedOrgs.delete(orgTitle);
    _animateHeightSwap(el, _renderCommsOrgGroups);
    return;
  }
  _expandedOrgs.add(orgTitle);
  // Rendering the spinner immediately, then replacing it with the real rows
  // a beat later once the (usually fast) fetch resolves, is itself the
  // "flash" that reads as a jump -- delay showing it until the fetch has
  // actually taken long enough to need one (see COMMS_SPINNER_DELAY_MS).
  const spinnerTimer = setTimeout(() => { _commsRevealKey = orgTitle; _animateHeightSwap(el, _renderCommsOrgGroups); }, COMMS_SPINNER_DELAY_MS);
  _fetchCommsOrgRows(orgTitle).then(() => {
    clearTimeout(spinnerTimer);
    _commsRevealKey = orgTitle;
    _animateHeightSwap(el, _renderCommsOrgGroups);
  });
}

async function _fetchCommsOrgRows(orgTitle) {
  if (_commsOrgExpandRows.has(orgTitle) || _commsOrgExpandLoading.has(orgTitle)) return;
  _commsOrgExpandLoading.add(orgTitle);
  try {
    const params = _commsQueryParams();
    params.set('org', orgTitle);
    params.set('rows', 200);  // generous cap for one org; a larger one would need its own load-more
    const resp = await fetch(API_BASE + 'api/communications?' + params.toString());
    const data = await _fetchJsonOrThrow(resp);
    _commsOrgExpandRows.set(orgTitle, data.rows || []);
  } catch (e) {
    _commsOrgExpandRows.set(orgTitle, []);
  } finally {
    _commsOrgExpandLoading.delete(orgTitle);
  }
}

// ── Communications: Cases view (default) ───────────────────────────────────
// Same lazy-loading shape as the org grouping above: group_by=case returns
// full Case.to_dict() groups (deadline/opened_at/closed_at/entry_count/
// is_stale all already correct, unaffected by the comms-level filters) in
// one shot; a case's own communications are only fetched once expanded.
let _commsCaseGroups = [];
let _commsCaseGroupsLoaded = false;
const _commsCaseExpandRows = new Map();     // caseId -> rows[]
const _commsCaseExpandLoading = new Set();  // caseIds currently fetching

// background=true: see _loadCommsOrgGroups's comment -- same quiet-refresh shape.
async function _loadCommsCaseGroups(background = false) {
  if (_commsViewMode !== 'cases') return;
  if (!background) show('commsTable').innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>`;
  try {
    const params = _commsQueryParams();
    params.set('group_by', 'case');
    params.set('rows', 500);  // groups are bounded by case count, not total comms -- one shot, no scrolling needed
    const resp = await fetch(API_BASE + 'api/communications?' + params.toString());
    const data = await _fetchJsonOrThrow(resp);
    const newGroups = data.groups || [];
    // See _loadCommsOrgGroups's comment -- skip the rebuild entirely when a
    // background refresh found nothing actually different.
    const unchanged = background && JSON.stringify(newGroups) === JSON.stringify(_commsCaseGroups);
    _commsCaseGroupsLoaded = true;
    _applyCommsFacets(data);
    _commsLoadedFingerprint = _commsQueryParams().toString();
    if (unchanged) return;
    _commsCaseGroups = newGroups;
    if (!background) _commsCaseExpandRows.clear();
    _renderCommsCaseGroups();
  } catch (e) {
    if (!background) show('commsTable').innerHTML = `<div class="alert alert-danger mb-0">${esc(e.message)}</div>`;
  }
}

function _renderCommsCaseGroups() {
  const el = show('commsTable');
  if (!_commsCaseGroups.length) {
    el.innerHTML = `<p class="text-muted text-center py-4">${t('comms.none')}</p>`;
    return;
  }
  // See _renderCommsOrgGroups's comment -- same capture-and-clear so a full
  // rebuild triggered by something other than expanding this exact case
  // doesn't replay the reveal animation on it.
  const revealKey = _commsRevealKey;
  _commsRevealKey = null;
  const rows = _commsCaseGroups.map(cs => {
    const isExpanded = _expandedCases.has(cs.id);
    const isClosed    = cs.status === 'Closed';
    const cachedRows = _commsCaseExpandRows.get(cs.id);
    const isLoading  = _commsCaseExpandLoading.has(cs.id);
    const reveal     = cs.id === revealKey;
    let body = '';
    if (isExpanded) {
      body = (isLoading || !cachedRows)
        ? `<tr class="comm-hist-row${reveal ? ' just-revealed' : ''}"><td colspan="6" class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div></td></tr>`
        : cachedRows.map(c => _commsHistRowHtml(c, false, reveal)).join('');
    }
    return `
      <tr class="comm-group-row" style="cursor:pointer" onclick="toggleCaseExpand(${cs.id})">
        <td colspan="6">
          <div class="d-flex flex-column gap-1">
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <i class="bi bi-chevron-${isExpanded ? 'down' : 'right'} text-muted small"></i>
              <span class="text-muted small mono">#${cs.id}</span>
              <span class="badge ${CASE_STATUS_BADGE[cs.status] || 'bg-secondary'}" style="font-size:.7rem">
                <i class="bi ${isClosed ? 'bi-folder-check' : 'bi-folder2-open'} me-1"></i>${caseStatusLabel(cs.status)}
              </span>
              ${cs.is_stale ? `<span class="badge bg-secondary" style="font-size:.7rem" title="${t('comms.case_stale_hint')}"><i class="bi bi-hourglass-split me-1"></i>${t('comms.case_stale')}</span>` : ''}
              <span class="fw-semibold">${esc(cs.org_title)}</span>
              <span class="text-muted small">— ${esc(cs.subject)}</span>
              <span class="badge bg-secondary rounded-pill" style="font-size:.7rem">${cs.entry_count} ${cs.entry_count === 1 ? t('comms.entry') : t('comms.entries')}</span>
              ${cs.has_auto_entry ? `<span class="badge rounded-pill" style="font-size:.65rem;background:#e8f0fe;color:#1a56db" title="${esc(t('inbound.auto_badge_title'))}"><i class="bi bi-robot me-1"></i>${esc(t('inbound.auto_badge'))}</span>` : ''}
            </div>
            <div class="d-flex align-items-center gap-2">
              <span class="text-muted small">${t('comms.case_opened')} ${(cs.opened_at || '').slice(0, 10)}${isClosed ? ` · ${t('comms.case_closed_on')} ${(cs.closed_at || '').slice(0, 10)}` : (cs.deadline ? ` · ${t('comm_modal.deadline')}: ${cs.deadline}` : '')}</span>
              <div class="d-flex gap-1 ms-auto">
                <button class="btn btn-outline-primary btn-sm py-0 px-2" title="${t('comms.case_add_entry')}"
                        onclick="event.stopPropagation();openFollowupForCase(${cs.id})">
                  <i class="bi bi-plus"></i>
                </button>
                ${isClosed
                  ? `<button class="btn btn-outline-success btn-sm py-0 px-2" title="${t('comms.case_reopen')}" onclick="event.stopPropagation();reopenCase(${cs.id})"><i class="bi bi-arrow-counterclockwise"></i></button>`
                  : `<button class="btn btn-outline-secondary btn-sm py-0 px-2" title="${t('comms.case_close')}" onclick="event.stopPropagation();closeCase(${cs.id})"><i class="bi bi-check2-circle"></i></button>`}
              </div>
            </div>
          </div>
        </td>
      </tr>
      ${body}`;
  }).join('');

  el.innerHTML = _commsGroupTableShell(rows);
}

function toggleCaseExpand(caseId) {
  const el = show('commsTable');
  if (_expandedCases.has(caseId)) {
    _expandedCases.delete(caseId);
    _animateHeightSwap(el, _renderCommsCaseGroups);
    return;
  }
  _expandedCases.add(caseId);
  // See toggleOrgComms's comment -- delay the spinner instead of showing it
  // immediately.
  const spinnerTimer = setTimeout(() => { _commsRevealKey = caseId; _animateHeightSwap(el, _renderCommsCaseGroups); }, COMMS_SPINNER_DELAY_MS);
  _fetchCommsCaseRows(caseId).then(() => {
    clearTimeout(spinnerTimer);
    _commsRevealKey = caseId;
    _animateHeightSwap(el, _renderCommsCaseGroups);
  });
}

async function _fetchCommsCaseRows(caseId) {
  if (_commsCaseExpandRows.has(caseId) || _commsCaseExpandLoading.has(caseId)) return;
  _commsCaseExpandLoading.add(caseId);
  try {
    const params = _commsQueryParams();
    params.set('case_id', caseId);
    params.set('rows', 200);  // generous cap for one case; a larger one would need its own load-more
    const resp = await fetch(API_BASE + 'api/communications?' + params.toString());
    const data = await _fetchJsonOrThrow(resp);
    _commsCaseExpandRows.set(caseId, data.rows || []);
  } catch (e) {
    _commsCaseExpandRows.set(caseId, []);
  } finally {
    _commsCaseExpandLoading.delete(caseId);
  }
}

async function closeCase(caseId) {
  await fetch(`${API_BASE}api/cases/${caseId}/close`, { method: 'POST', cache: 'no-store' });
  _commsCaseDetailCache.delete(caseId);  // stale status/closed_at otherwise
  await _reloadCasesAndComms();
}

async function reopenCase(caseId) {
  await fetch(`${API_BASE}api/cases/${caseId}/reopen`, { method: 'POST', cache: 'no-store' });
  _commsCaseDetailCache.delete(caseId);
  await _reloadCasesAndComms();
}

const COMM_STATUS_ICON = {
  "Initial Contact":      "bi-envelope",
  "Intermediate Contact": "bi-reply",
  "Positive Response":    "bi-hand-thumbs-up",
  "Negative Response":    "bi-hand-thumbs-down",
  "No Response":          "bi-clock",
};
const COMM_STATUS_DOT = {
  "Initial Contact":      "#0d6efd",
  "Intermediate Contact": "#0dcaf0",
  "Positive Response":    "#198754",
  "Negative Response":    "#dc3545",
  "No Response":          "#6c757d",
};

// ── Communications: Timeline view ───────────────────────────────────────────
// Same lazy-loading shape as the org/case views above, grouped by
// contact_date instead. Today's day is auto-expanded (and its rows
// pre-fetched) the first time this view loads each session, matching the
// old behavior of always showing today's activity without an extra click.
let _commsDayGroups = [];
let _commsDayGroupsLoaded = false;
const _commsDayExpandRows = new Map();     // day -> rows[]
const _commsDayExpandLoading = new Set();  // days currently fetching

// background=true: see _loadCommsOrgGroups's comment -- same quiet-refresh shape.
async function _loadCommsDayGroups(background = false) {
  if (_commsViewMode !== 'timeline') return;
  if (!background) show('commsTable').innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>`;
  try {
    const params = _commsQueryParams();
    params.set('group_by', 'day');
    params.set('rows', 1000);  // groups are bounded by distinct days logged, not total comms -- one shot
    const resp = await fetch(API_BASE + 'api/communications?' + params.toString());
    const data = await _fetchJsonOrThrow(resp);
    const newGroups = data.groups || [];
    // See _loadCommsOrgGroups's comment -- skip the rebuild entirely when a
    // background refresh found nothing actually different. firstInit still
    // forces a render regardless, since that's the one-time today-auto-expand
    // (background refreshes normally never coincide with it, but just in case).
    const firstInit = !_timelineDaysInitialized;
    const unchanged = background && !firstInit && JSON.stringify(newGroups) === JSON.stringify(_commsDayGroups);
    _commsDayGroupsLoaded = true;
    _applyCommsFacets(data);
    _commsLoadedFingerprint = _commsQueryParams().toString();
    const todayIso = new Date().toISOString().slice(0, 10);
    if (firstInit) {
      _expandedTimelineDays.add(todayIso);
      _timelineDaysInitialized = true;
    }
    if (unchanged) return;
    _commsDayGroups = newGroups;
    if (!background) _commsDayExpandRows.clear();
    _renderCommsDayGroups();
    if (_expandedTimelineDays.has(todayIso) && _commsDayGroups.some(g => g.day === todayIso)) {
      _fetchCommsDayRows(todayIso).then(_renderCommsDayGroups);
    }
  } catch (e) {
    if (!background) show('commsTable').innerHTML = `<div class="alert alert-danger mb-0">${esc(e.message)}</div>`;
  }
}

function _commsDayLabel(iso) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const yesterdayIso = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (iso === todayIso) return t('comms.today');
  if (iso === yesterdayIso) return t('comms.yesterday');
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(_lang === 'el' ? 'el-GR' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function _commsTimelineItemHtml(c, reveal = false) {
  const statusLabel = _commsStatusLabels();
  return `
    <div class="comm-timeline-item${reveal ? ' just-revealed' : ''}" onclick="openCommModal(${c.id})" style="cursor:pointer">
      <span class="comm-dot" style="background:${COMM_STATUS_DOT[c.status] || '#6c757d'}"></span>
      <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
        <div>
          <span class="fw-semibold small">${esc(c.org_title)}</span>
          <span class="badge ${STATUS_BADGE[c.status] || 'bg-secondary'} ms-2" style="font-size:.68rem">
            <i class="bi ${COMM_STATUS_ICON[c.status] || 'bi-circle'} me-1"></i>${statusLabel[c.status] || c.status}
          </span>
          ${caseBadgeHtml(c, 'ms-1')}
        </div>
        <div class="text-end text-nowrap" onclick="event.stopPropagation()">
          <div class="d-flex gap-1 justify-content-end">
            ${c.case_id ? `<button class="btn btn-outline-primary btn-sm py-0 px-1" onclick="addFollowupForComm(${c.id})" title="${t('comms.case_add_followup')}"><i class="bi bi-plus-circle"></i></button>` : ''}
            <button class="btn btn-outline-secondary btn-sm py-0 px-1" onclick="openCommModal(${c.id})" title="${t('common.edit')}"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-outline-danger btn-sm py-0 px-1" onclick="deleteComm(${c.id})" title="${t('common.delete')}"><i class="bi bi-trash"></i></button>
          </div>
        </div>
      </div>
      <div class="small mt-1">${esc(c.subject)}</div>
      ${c.contact_person ? `<div class="text-muted" style="font-size:.72rem"><i class="bi bi-person me-1"></i>${esc(c.contact_person)}</div>` : ''}
      ${(c.medium || c.direction) ? `<div class="text-muted" style="font-size:.72rem">${directionIcon(c)}${c.medium ? `<i class="bi ${MEDIUM_ICON[c.medium] || 'bi-dash'} me-1"></i>${mediumLabel(c.medium)}` : ''}${autoEmailBadge(c)}</div>` : ''}
      ${c.notes ? `<div class="text-muted small mt-1">${esc(c.notes)}</div>` : ''}
    </div>`;
}

function _renderCommsDayGroups() {
  const el = show('commsTable');
  if (!_commsDayGroups.length) {
    el.innerHTML = `<p class="text-muted text-center py-4">${t('comms.none')}</p>`;
    return;
  }
  // See _renderCommsOrgGroups's comment -- same capture-and-clear.
  const revealKey = _commsRevealKey;
  _commsRevealKey = null;
  let html = '<div class="comm-timeline">';
  for (const g of _commsDayGroups) {
    const isExpanded = _expandedTimelineDays.has(g.day);
    const reveal = g.day === revealKey;
    html += `
      <div class="comm-timeline-day" style="cursor:pointer" data-day="${g.day}" onclick="toggleTimelineDay(this.dataset.day)">
        <i class="bi bi-chevron-${isExpanded ? 'down' : 'right'} me-1" style="font-size:.75rem"></i>${_commsDayLabel(g.day)}
        <span class="badge bg-secondary rounded-pill ms-1" style="font-size:.65rem">${g.count}</span>
      </div>`;
    if (!isExpanded) continue;
    const cachedRows = _commsDayExpandRows.get(g.day);
    const isLoading  = _commsDayExpandLoading.has(g.day);
    html += (isLoading || !cachedRows)
      ? `<div class="text-center py-2"><div class="spinner-border spinner-border-sm text-primary"></div></div>`
      : cachedRows.map(c => _commsTimelineItemHtml(c, reveal)).join('');
  }
  html += '</div>';
  el.innerHTML = html;
}

function toggleTimelineDay(day) {
  const el = show('commsTable');
  if (_expandedTimelineDays.has(day)) {
    _expandedTimelineDays.delete(day);
    _animateHeightSwap(el, _renderCommsDayGroups);
    return;
  }
  _expandedTimelineDays.add(day);
  // See toggleOrgComms's comment -- delay the spinner instead of showing it
  // immediately.
  const spinnerTimer = setTimeout(() => { _commsRevealKey = day; _animateHeightSwap(el, _renderCommsDayGroups); }, COMMS_SPINNER_DELAY_MS);
  _fetchCommsDayRows(day).then(() => {
    clearTimeout(spinnerTimer);
    _commsRevealKey = day;
    _animateHeightSwap(el, _renderCommsDayGroups);
  });
}

async function _fetchCommsDayRows(day) {
  if (_commsDayExpandRows.has(day) || _commsDayExpandLoading.has(day)) return;
  _commsDayExpandLoading.add(day);
  try {
    const params = _commsQueryParams();
    params.set('day', day);
    params.set('rows', 200);  // generous cap for one day; a larger one would need its own load-more
    const resp = await fetch(API_BASE + 'api/communications?' + params.toString());
    const data = await _fetchJsonOrThrow(resp);
    // default sort (contact_date, created_at) desc already matches the old
    // client sort (newest-first by created_at) within a single day.
    _commsDayExpandRows.set(day, data.rows || []);
  } catch (e) {
    _commsDayExpandRows.set(day, []);
  } finally {
    _commsDayExpandLoading.delete(day);
  }
}

async function openCommModal(id, prefillOrg = null, prefillOrgCode = null, prefillCaseId = null, prefillSubject = null, prefillMedium = null, prefillContactPerson = null) {
  if (!_commModal) _commModal = new bootstrap.Modal(document.getElementById('commModal'));
  show('commError').classList.add('d-none');
  show('commSaveBtn').disabled = false;
  _commOrgReset();
  _resetCommContact();
  // A comms-only user (no "contacts" tab) 403s on this every time the modal
  // opens -- caught and silent, so nothing visibly breaks, but it's a
  // guaranteed-failing request for that user on every single open.
  const _canPrefetchContacts = !ALLOWED_TABS || ALLOWED_TABS.includes('contacts');
  if (_canPrefetchContacts && !_commContactsPrefetchStarted && _portalMembersCache === null) {
    _commContactsPrefetchStarted = true;
    loadContactsTab();  // warm the contacts cache so the org search can also match by contact name
  }

  if (id) {
    // id normally comes from a currently-rendered row's own edit button, so
    // it's already sitting in one of the loaded caches -- see _commsFindById.
    // The one exception is the Mail Parser admin panel's deep link (?action=
    // edit-comm&comm=<id>), which can name a comm nothing on this page has
    // rendered/expanded yet -- fetch it directly in that case instead of
    // just giving up.
    let c = _commsFindById(id);
    if (!c) {
      try { c = await fetch(`${API_BASE}api/communications/${id}`).then(r => r.ok ? r.json() : null); } catch (_) { c = null; }
    }
    if (!c) return;
    show('commModalTitle').textContent = t('comm_modal.edit_title');
    show('commId').value      = c.id;
    show('commCaseId').value  = c.case_id || '';
    show('commDate').value    = c.contact_date;
    const cs = c.case_id ? await _commsFetchCaseDetail(c.case_id).catch(() => null) : null;
    show('commDeadline').value = (cs && cs.deadline) || _plus14(c.contact_date);
    show('commSubject').value = c.subject;
    show('commStatus').value  = c.status;
    show('commStatus').disabled = c.status === 'Initial Contact';  // the entry that opened the case must stay Initial Contact
    show('commStatusInitialOption').hidden = false;
    show('commMedium').value  = c.medium || '';
    setCommDirectionPill(c.direction || '');
    show('commNotes').value   = c.notes;
    _refreshCommNotesPreview();
    _commOrgSet(c.org_name, c.org_title);
    _setOrgLocked(false);
    onCommOrgInput(_commPreselectFromComm(c));
    _renderCommCaseInfo(cs, true);
  } else {
    show('commModalTitle').textContent = prefillOrg ? `${t('comm_modal.add_title')} — ${prefillOrg}` : t('comm_modal.add_title');
    show('commId').value      = '';
    show('commCaseId').value  = prefillCaseId || '';
    show('commDate').value    = new Date().toISOString().slice(0, 10);
    const cs = prefillCaseId ? await _commsFetchCaseDetail(prefillCaseId).catch(() => null) : null;
    show('commDeadline').value = (cs && cs.deadline) || _plus14(show('commDate').value);
    show('commSubject').value = prefillSubject || '';
    show('commStatus').disabled = !prefillCaseId;  // a brand-new case always opens as Initial Contact
    show('commStatusInitialOption').hidden = !!prefillCaseId;  // reserved for the entry that opens a case
    show('commStatus').value  = prefillCaseId ? 'Intermediate Contact' : 'Initial Contact';
    show('commMedium').value  = prefillMedium || '';
    setCommDirectionPill('');
    show('commNotes').value   = '';
    _refreshCommNotesPreview();
    if (prefillOrg) { _commOrgSet(prefillOrgCode || prefillOrg, prefillOrg); onCommOrgInput(prefillContactPerson ? [{ id: null, label: prefillContactPerson }] : []); }
    _setOrgLocked(!!prefillCaseId);  // a follow-up stays tied to its case's organization
    _renderCommCaseInfo(cs, false);
  }
  _onCommStatusChange();
  _commModal.show();
}

function _refreshCommNotesPreview() {
  const val = show('commNotes').value || '';
  const preview = show('commNotesPreview');
  preview.textContent = val.trim() ? val.replace(/\s+/g, ' ').trim() : t('comm_modal.notes_ph');
  preview.classList.toggle('text-muted', !val.trim());
}

let _commNotesModal = null;

// Bigger textarea for editing notes, drilled into from the Communication
// modal -- hides it while open and reopens on close (same stacked-modal
// avoidance as the admin panel's raw body pane), rather than just being a
// cramped 3-row textarea crammed into the main form.
function openCommNotesModal() {
  show('commNotesModalTextarea').value = show('commNotes').value || '';
  _commModal.hide();
  if (!_commNotesModal) {
    _commNotesModal = new bootstrap.Modal(document.getElementById('commNotesModal'));
    document.getElementById('commNotesModal').addEventListener('hidden.bs.modal', () => _commModal.show());
  }
  _commNotesModal.show();
}

function saveCommNotesModal() {
  show('commNotes').value = show('commNotesModalTextarea').value;
  _refreshCommNotesPreview();
  _commNotesModal.hide();
}

// Takes the already-fetched case-detail object (not just its id) -- every
// caller has one in hand already, either from _commsFetchCaseDetail (above)
// or from openFollowupForCase's own fetch, so there's no need for this to
// do its own lookup/fetch.
function _renderCommCaseInfo(cs, isEdit = false) {
  const box = show('commCaseInfo');
  if (!cs) { box.classList.add('d-none'); return; }
  box.classList.remove('d-none');
  box.dataset.caseId = cs.id;
  box.dataset.caseStatus = cs.status;  // read back by _toggleCaseFromModal instead of a second lookup
  box.dataset.isEdit = isEdit ? '1' : '';
  const isClosed = cs.status === 'Closed';
  show('commCaseStatusBadge').className = 'badge ' + (CASE_STATUS_BADGE[cs.status] || 'bg-secondary');
  show('commCaseStatusBadge').textContent = caseStatusLabel(cs.status);
  show('commCaseInfoText').textContent = `${t('comms.case_col')} #${cs.id} · ${t('comms.case_opened')} ${(cs.opened_at || '').slice(0, 10)}` +
    (isClosed ? ` · ${t('comms.case_closed_on')} ${(cs.closed_at || '').slice(0, 10)}` : (cs.deadline ? ` · ${t('comm_modal.deadline')}: ${cs.deadline}` : ''));
  show('commCaseFollowupBtn').classList.toggle('d-none', !isEdit);
  const btn = show('commCaseToggleBtn');
  btn.textContent = isClosed ? t('comms.case_reopen') : t('comms.case_close');
  btn.className = 'btn btn-sm py-0 px-2 ms-auto ' + (isClosed ? 'btn-outline-success' : 'btn-outline-secondary');
}

async function _toggleCaseFromModal() {
  const caseId = parseInt(show('commCaseInfo').dataset.caseId, 10);
  if (!caseId) return;
  const action = show('commCaseInfo').dataset.caseStatus === 'Closed' ? 'reopen' : 'close';
  await fetch(`${API_BASE}api/cases/${caseId}/${action}`, { method: 'POST', cache: 'no-store' });
  _commsCaseDetailCache.delete(caseId);
  await _reloadCasesAndComms();
  const cs = await _commsFetchCaseDetail(caseId).catch(() => null);
  _renderCommCaseInfo(cs, show('commCaseInfo').dataset.isEdit === '1');
}

function _addFollowupFromModal() {
  const caseId = parseInt(show('commCaseInfo').dataset.caseId, 10);
  if (!caseId) return;
  openFollowupForCase(caseId);
}

function addFollowupForComm(commId) {
  const c = _commsFindById(commId);
  if (!c || !c.case_id) return;
  openFollowupForCase(c.case_id);
}

async function openFollowupForCase(caseId) {
  let cs;
  try {
    cs = await _commsFetchCaseDetail(caseId);
  } catch (e) {
    return;
  }
  // entries oldest-first (same ordering as Case.to_dict on the backend)
  const entries = (cs.communications || []).slice().sort((a, b) =>
    a.contact_date !== b.contact_date
      ? a.contact_date.localeCompare(b.contact_date)
      : new Date(a.created_at) - new Date(b.created_at));
  const last = entries[entries.length - 1];
  // walk backwards for the most recent entry that actually set each field —
  // a later entry (e.g. a phone call with no contact logged) shouldn't blank out
  // a value a previous step already established
  const findRecent = (field) => [...entries].reverse().find(c => c[field]);
  const lastMedium  = findRecent('medium');
  const lastContact = findRecent('contact_person');
  openCommModal(null, cs.org_title, cs.org_name, caseId,
    (last && last.subject) || cs.subject,
    lastMedium ? lastMedium.medium : '',
    lastContact ? lastContact.contact_person : '');
}

function _onCommStatusChange() {
  const isAdding = !show('commId').value;
  const status = show('commStatus').value;
  const closes = isAdding && (status === 'Positive Response' || status === 'Negative Response');
  show('commStatusCloseHint').classList.toggle('d-none', !closes);
}

function _plus14(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

function _onCommDateChange() {
  show('commDeadline').value = _plus14(show('commDate').value);
}

// The comm modal's Contact Person field -- a multi-select built from a
// plain <select> (picking an option ADDS that contact) plus a row of
// removable chips for whichever are already added, rather than a native
// <select multiple> (poor discoverability, awkward on touch, no per-item
// remove). _commOrgContacts holds every contact for the currently-selected
// org (id/label/email/tel); _commSelectedContacts holds the ones actually
// added, in add-order.
let _commOrgContacts = [];
let _commSelectedContacts = [];

function _resetCommContact() {
  show('commContactSection').classList.add('d-none');
  _commOrgContacts = [];
  _commSelectedContacts = [];
  show('commContact').innerHTML = `<option value="">${t('comm_modal.contact_add_ph')}</option>`;
  show('commContactChips').innerHTML = '';
}

function _orgCodeMatches(stored, query) {
  if (!stored || !query) return false;
  if (stored === query) return true;
  const toHrms = _hrmsLookup ? _hrmsLookup.get(stored) : null;
  if (toHrms === query) return true;
  const toCkan = _ckanByHrms ? _ckanByHrms.get(stored) : null;
  return toCkan === query;
}
function _getContactsForOrg(orgCode) {
  const contacts = [];
  const seen = new Set();
  for (const m of (_portalMembersCache || [])) {
    if (!m.contact_id || seen.has(m.contact_id)) continue;
    const primaryMatch = _orgCodeMatches(m.org_name || '', orgCode);
    const extraMatch   = (m.contact_org_codes || []).some(o => _orgCodeMatches(o.code || '', orgCode));
    if (primaryMatch || extraMatch) {
      seen.add(m.contact_id);
      contacts.push({ id: m.contact_id, first_name: m.contact_first_name, last_name: m.contact_last_name,
                      position: m.contact_position, email: m.contact_email, tel: m.contact_tel });
    }
  }
  for (const c of (_pmUnmatched || [])) {
    if (seen.has(c.id)) continue;
    const primaryMatch = _orgCodeMatches(c.org_code || '', orgCode);
    const extraMatch   = (c.org_codes || []).some(o => _orgCodeMatches(o.code || '', orgCode));
    if (primaryMatch || extraMatch) {
      seen.add(c.id);
      contacts.push({ id: c.id, first_name: c.first_name, last_name: c.last_name,
                      position: c.position, email: c.email, tel: c.tel });
    }
  }
  return contacts;
}

function _commContactBaseName(label) {
  // Strips the trailing " (position)" so a stored contact_person still
  // matches after the contact's position text changes (e.g. re-fetched
  // portal-member data with an updated title).
  return (label || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// Builds onCommOrgInput's preselect array from an already-fetched comm --
// prefers the real linked contacts (c.contacts, from CommunicationContact)
// when there are any, falling back to the old free-text contact_person for
// a comm that predates that table (or otherwise never got a real link).
function _commPreselectFromComm(c) {
  if (c.contacts && c.contacts.length) {
    return c.contacts.map(x => ({
      id: x.id,
      label: [x.first_name, x.last_name].filter(Boolean).join(' ') + (x.position ? ' (' + x.position + ')' : ''),
    }));
  }
  return c.contact_person ? [{ id: null, label: c.contact_person }] : [];
}

// preselect: array of {id, label} -- id is the real OrgContact id when
// known (a comm already linked via CommunicationContact, or a contact just
// picked from a real search result), null for a legacy comm that only ever
// had a free-text contact_person and needs matching by name instead.
function _buildCommContactEntry(c) {
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ');
  return {
    id: c.id != null ? c.id : null,
    name, position: c.position || '',
    label: name + (c.position ? ' (' + c.position + ')' : ''),
    email: c.email || '', tel: c.tel || '',
  };
}

function _fillCommContacts(contacts, preselect) {
  _commOrgContacts = contacts.map(_buildCommContactEntry);
  _commSelectedContacts = [];
  (preselect || []).forEach(want => {
    if (!want || (want.id == null && !want.label)) return;
    let match = want.id != null ? _commOrgContacts.find(c => c.id === want.id) : null;
    if (!match && want.label) {
      const base = _commContactBaseName(want.label);
      match = _commOrgContacts.find(c => c.label === want.label)
           || _commOrgContacts.find(c => _commContactBaseName(c.label) === base);
    }
    if (match && !_commSelectedContacts.includes(match)) _commSelectedContacts.push(match);
  });
  show('commContactSection').classList.remove('d-none');
  _renderCommContactPicker();
  _renderCommContactChips();
}

// Position/department text on real org records can run very long -- shown
// in full via a title tooltip everywhere, but the visible text itself is
// kept short so it can't stretch the dropdown or a chip out wide.
function _truncateContactLabel(name, position, max = 50) {
  if (!position) return name;
  const full = `${name} (${position})`;
  if (full.length <= max) return full;
  const room = Math.max(0, max - name.length - 4);  // " (" + "…)"
  return `${name} (${position.slice(0, room)}…)`;
}

function _renderCommContactPicker() {
  const sel = show('commContact');
  const selectedLabels = new Set(_commSelectedContacts.map(c => c.label));
  sel.innerHTML = `<option value="">${t('comm_modal.contact_add_ph')}</option>` +
    _commOrgContacts.map((c, i) => ({ c, i })).filter(({ c }) => !selectedLabels.has(c.label))
      .map(({ c, i }) => `<option value="${i}" title="${esc(c.label)}">${esc(_truncateContactLabel(c.name, c.position))}</option>`).join('') +
    `<option value="__new__">+ ${esc(t('comms.add_contact_for_org'))}</option>`;
}

function _renderCommContactChips() {
  show('commContactChips').innerHTML = _commSelectedContacts.map((c, i) => `
    <span class="badge bg-secondary d-inline-flex align-items-center gap-1" style="font-size:.8em;max-width:240px"
          title="${esc([c.label, c.email, c.tel].filter(Boolean).join(' · '))}">
      <i class="bi bi-person-fill flex-shrink-0"></i>
      <span class="text-truncate" style="min-width:0">${esc(_truncateContactLabel(c.name, c.position))}</span>
      <button type="button" class="btn-close btn-close-white flex-shrink-0" style="font-size:.55em;margin-left:.25em"
              onclick="_removeCommContact(${i})" title="${t('common.remove')}"></button>
    </span>`).join('');
}

function _addCommContact() {
  const sel = show('commContact');
  if (!sel.value) return;
  if (sel.value === '__new__') {
    sel.value = '';  // reset so "+ Add contact for this organization" doesn't sit there as if selected
    _openAddContactForComm();
    return;
  }
  const c = _commOrgContacts[parseInt(sel.value, 10)];
  if (!c) return;
  _commSelectedContacts.push(c);
  _renderCommContactPicker();
  _renderCommContactChips();
}

function _removeCommContact(i) {
  _commSelectedContacts.splice(i, 1);
  _renderCommContactPicker();
  _renderCommContactChips();
}

function _openAddContactForComm() {
  const orgCode  = show('commOrgCode').value;
  const orgLabel = show('commOrgLabel').value;
  if (!orgCode) return;
  openNewContactPanel(orgCode, orgLabel);
}

function onCommOrgInput(preselect) {
  _resetCommContact();
  const orgCode = show('commOrgCode').value;
  if (!orgCode) return;
  show('commContactSection').classList.remove('d-none');
  if (_portalMembersCache !== null) {
    _fillCommContacts(_getContactsForOrg(orgCode), preselect);
  } else {
    fetch(API_BASE + 'api/contacts/' + encodeURIComponent(orgCode))
      .then(r => r.json())
      .then(contacts => _fillCommContacts(contacts, preselect))
      .catch(() => {});
  }
}

async function saveComm() {
  const btn = show('commSaveBtn');
  if (btn.disabled) return;  // guard against double-submit (e.g. a fast double-click)

  const err      = show('commError');
  const id       = show('commId').value;
  const orgName  = show('commOrgCode').value.trim();
  const orgTitle = show('commOrgLabel').value.trim() || orgName;

  const body = {
    contact_date: show('commDate').value,
    deadline:     show('commDeadline').value || null,
    org_name:     orgName,
    org_title:    orgTitle,
    subject:      show('commSubject').value.trim(),
    status:       show('commStatus').value,
    medium:       show('commMedium').value,
    direction:    show('commDirection').value,
    notes:        show('commNotes').value.trim(),
    case_id:      show('commCaseId').value || null,
    contact_person: _commSelectedContacts.map(c => c.label).join(', '),
    contact_ids:    _commSelectedContacts.map(c => c.id).filter(id => id != null),
  };

  if (!body.contact_date || !body.org_name || !body.subject) {
    err.textContent = t('comm_modal.required');
    err.classList.remove('d-none');
    return;
  }

  btn.disabled = true;
  try {
    const url  = id ? `${API_BASE}api/communications/${id}?d=${_b64enc(body)}` : `${API_BASE}api/communications?d=${_b64enc(body)}`;
    const resp = await fetch(url, { method: id ? 'PATCH' : 'POST', cache: 'no-store' });
    const json   = await resp.json();
    if (!resp.ok) { err.textContent = json.error || t('common.save_failed'); err.classList.remove('d-none'); return; }

    // Adding/editing an entry can change its case's computed is_stale/
    // entry_count/communications list -- drop the cached case detail so the
    // next time this case is opened (edit/follow-up modal, or the Cases
    // view's own group_by=case fetch) it's not shown stale.
    if (body.case_id) _commsCaseDetailCache.delete(parseInt(body.case_id, 10));
    // Full reload (not a local patch) -- same reasoning as the case cache
    // drop above, but for every OTHER entry in that case, which each carry
    // their own denormalized case_status/case_is_stale snapshot too.
    await _reloadCasesAndComms();
    _commModal.hide();
    _refreshCommSubjectDatalist();
  } catch (e) {
    err.textContent = t('common.network_error').replace('{msg}', e.message);
    err.classList.remove('d-none');
  } finally {
    btn.disabled = false;
  }
}

function deleteComm(id) {
  confirmDangerAction(t('comm_modal.delete_confirm'), async () => {
    const caseId = (_commsFindById(id) || {}).case_id;
    try {
      const resp = await fetch(`${API_BASE}api/communications/${id}/delete`, { method: 'DELETE', cache: 'no-store' });
      // fetch() only rejects on a network failure, not an HTTP error status --
      // without this check a 500 (e.g. a save/delete conflict) silently left
      // the row in place with no feedback at all.
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      if (caseId) _commsCaseDetailCache.delete(caseId);  // same staleness reasoning as saveComm
      // Full reload (not a local splice) -- removing an entry can change its case's
      // computed is_stale/entry_count, which every remaining entry in that case
      // carries a denormalized snapshot of, so a partial patch left the filter-tab
      // counts (Follow-up/Status) showing stale values.
      await _reloadCasesAndComms();
    } catch (e) {
      alert(t('comm_modal.delete_failed') + ' ' + e.message);
    }
  });
}

// ── Inbound email review queue (pending Communications awaiting approval) ────

function _inboundAttachOrgSearch(q) {
  const dd = document.getElementById('inboundAttachOrgDropdown');
  const nq = _ns((q || '').trim());
  const ckanPool = _orgsData.length ? _orgsData : [];
  const ckanMatches = nq
    ? ckanPool.filter(o => _ns(o.title).includes(nq) || _ns(o.name).includes(nq)).slice(0, 10)
    : ckanPool.slice(0, 20);
  const hrmsMatches = nq && _publicOrgs.length
    ? _publicOrgs.filter(o => !(_ckanByHrms && _ckanByHrms.get(o.code)) && _ns(o.label).includes(nq)).slice(0, 5)
    : [];
  if (!ckanMatches.length && !hrmsMatches.length) { dd.classList.add('d-none'); return; }
  dd.innerHTML = [
    ...ckanMatches.map(o =>
      `<li class="list-group-item list-group-item-action py-2 px-2" style="cursor:pointer"
           data-code="${esc(o.name)}" data-label="${esc(o.title)}"
           onmousedown="_inboundAttachOrgSelect(this.dataset.code,this.dataset.label)">
         <i class="bi bi-building me-1 text-muted"></i><span class="fw-semibold">${esc(o.title)}</span></li>`
    ),
    ...hrmsMatches.map(o =>
      `<li class="list-group-item list-group-item-action py-2 px-2" style="cursor:pointer"
           data-code="${esc(o.code)}" data-label="${esc(o.label)}"
           onmousedown="_inboundAttachOrgSelect(this.dataset.code,this.dataset.label)">
         <i class="bi bi-building me-1 text-muted"></i><span class="fw-semibold">${esc(o.label)}</span>
         <span class="badge bg-secondary ms-1" style="font-size:.75rem">HRMS only</span></li>`
    ),
  ].join('');
  dd.classList.remove('d-none');
}

// Tracks whether the current org value came from an automatic guess
// (text-based or domain-based) rather than a deliberate user pick -- so a
// later, stronger auto-guess (domain match resolving after the instant
// text-based one already filled something in) knows it's still safe to
// override, while a real user selection never gets clobbered by either.
let _inboundAttachOrgAutoFilled = false;

function _inboundAttachOrgSelect(code, label) {
  _inboundAttachSetOrg(code, label, false);
}

function _inboundAttachSetOrg(code, label, isAuto) {
  show('inboundAttachOrgCode').value  = code;
  show('inboundAttachOrgLabel').value = label;
  show('inboundAttachOrgSearch').value = label;
  document.getElementById('inboundAttachOrgDropdown').classList.add('d-none');
  _inboundAttachOrgAutoFilled = !!isAuto;
  _refreshInboundAttachCases();
}

async function _refreshInboundAttachCases() {
  const orgCode = show('inboundAttachOrgCode').value.trim();
  const sel  = document.getElementById('inboundAttachCaseSelect');
  const wrap = document.getElementById('inboundAttachCaseWrap');
  if (!orgCode) {
    wrap.classList.add('d-none');
    sel.innerHTML = '';
    _onInboundAttachCaseChange();
    return;
  }
  wrap.classList.remove('d-none');
  // "All open cases" is small and bounded (current outreach efforts, not the
  // full historical archive) regardless of how large the Communications log
  // grows -- fine to fetch fresh here rather than needing its own cache.
  let cases;
  try {
    cases = await fetch(`${API_BASE}api/cases?status=Open`).then(r => r.ok ? r.json() : []);
  } catch (_) {
    cases = [];
  }
  const openCases = (Array.isArray(cases) ? cases : []).filter(c => _orgCodeMatches(c.org_name || '', orgCode));
  sel.innerHTML = [
    `<option value="">${esc(t('inbound.new_case'))}</option>`,
    ...openCases.map(c => `<option value="${c.id}">${esc(c.subject)}</option>`),
  ].join('');
  sel.value = '';
  _onInboundAttachCaseChange();
}

function _onInboundAttachCaseChange() {
  const sel = document.getElementById('inboundAttachCaseSelect');
  // No case selected (including when the picker itself is hidden because the
  // org isn't known yet) means this attach will open a brand new case, which
  // needs its own subject.
  document.getElementById('inboundAttachSubjectWrap').classList.toggle('d-none', !!sel.value);
}

async function openInboundAttachModal(id) {
  let e = _inboundEmailsData.find(x => x.id === id);
  if (!e) {
    // The admin panel's Parsed Emails view deep-links its own "Attach to a
    // Case" button here (?action=attach-email&inbound=<id>) -- can name an
    // email nothing on this page has loaded yet, same situation openCommModal
    // already handles for its own edit-comm deep link.
    await _loadInboundEmails();
    e = _inboundEmailsData.find(x => x.id === id);
  }
  if (!e) return;

  show('inboundAttachId').value = id;
  show('inboundAttachFrom').textContent = e.from_name ? `${e.from_name} <${e.from_email || ''}>` : (e.from_email || '');
  show('inboundAttachSubjectView').textContent = e.subject || '';
  show('inboundAttachSubject').value = e.subject || '';
  show('inboundAttachError').classList.add('d-none');

  // Several equally-plausible contacts were found and none has been chosen
  // yet -- ask which one is real before showing anything org/case-related,
  // since we don't know the org (and therefore the case options) until then.
  const needsContactPick = e.reason === 'multiple_contacts_match' && !e.matched_org_code;
  document.getElementById('inboundAttachCandidatesWrap').classList.toggle('d-none', !needsContactPick);
  document.getElementById('inboundAttachOrgKnown').classList.add('d-none');
  document.getElementById('inboundAttachOrgSearchWrap').classList.add('d-none');
  document.getElementById('inboundAttachCaseWrap').classList.add('d-none');
  document.getElementById('inboundAttachSubjectWrap').classList.add('d-none');

  if (needsContactPick) {
    document.getElementById('inboundAttachCandidateSelect').innerHTML = (e.candidate_contacts || []).map(c =>
      `<option value="${c.id}">${esc(`${c.first_name || ''} ${c.last_name || ''}`.trim())}${c.org_label ? ' — ' + esc(c.org_label) : ''}</option>`
    ).join('');
    if (!_inboundAttachModal) _inboundAttachModal = new bootstrap.Modal(document.getElementById('inboundAttachModal'));
    _inboundAttachModal.show();
    return;
  }

  const hasOrg = !!e.matched_org_code;
  document.getElementById('inboundAttachOrgKnown').classList.toggle('d-none', !hasOrg);
  document.getElementById('inboundAttachOrgSearchWrap').classList.toggle('d-none', hasOrg);
  document.getElementById('inboundAttachOrgDropdown').classList.add('d-none');
  show('inboundAttachOrgCode').value   = hasOrg ? e.matched_org_code : '';
  show('inboundAttachOrgLabel').value  = hasOrg ? (e.matched_org_label || e.matched_org_code) : '';
  show('inboundAttachOrgSearch').value = '';
  if (hasOrg) show('inboundAttachOrgBadge').textContent = e.matched_org_label || e.matched_org_code;

  // Org unknown -- surface whoever was found quoted in the body (even though
  // they aren't a registered contact) so the search isn't a total blank slate.
  const hintEl = document.getElementById('inboundAttachDetectedHint');
  if (!hasOrg && (e.detected_name || e.detected_email)) {
    const who = [e.detected_name, e.detected_email].filter(Boolean).join(' — ');
    hintEl.innerHTML = `<i class="bi bi-info-circle me-1"></i>${t('inbound.detected_hint')} ${esc(who)}`;
    hintEl.classList.remove('d-none');
  } else {
    hintEl.classList.add('d-none');
  }

  const stillUnmatched = (e.unmatched_contacts || []).find(u => u.status === 'pending');
  const senderMsg = stillUnmatched ? _findSenderMessage(e, stillUnmatched.email) : null;

  // Two auto-guess tiers, weakest first so something shows immediately: an
  // ALL-CAPS acronym in the subject/signature (sync, e.g. "... ΡΑΑΕΥ")
  // prefills right away; a domain match against an already-registered
  // contact (async) then overrides it if one resolves, since a real
  // existing contact at this domain is stronger evidence than a text
  // guess -- but only while the field still holds an auto-guess, never
  // once the user has actually picked/typed something themselves.
  _inboundAttachOrgAutoFilled = false;
  if (!hasOrg) {
    const textGuess = _guessOrgFromText(e.subject) || (senderMsg && _guessOrgFromText(senderMsg.body));
    if (textGuess) _inboundAttachSetOrg(textGuess.code, textGuess.label, true);
  }
  if (!hasOrg && e.detected_email) _inboundAttachGuessOrgByDomain(id, e.detected_email);

  // Offer to register the detected sender as a contact in the same action
  // -- reuses the same extraction functions (contact_extract.js) the admin
  // panel's own Register Contact flow uses, so a regular comms-tab user
  // doesn't have to make a separate trip through the (superadmin-only)
  // admin page just to get this person on record. Only when still pending
  // -- if it was already resolved/dropped there's nothing left to offer.
  const contactWrap = document.getElementById('inboundAttachNewContactWrap');
  if (!hasOrg && stillUnmatched) {
    const u = stillUnmatched;
    const nameSource = (senderMsg && _extractName(senderMsg.body)) || u.name || _guessNameFromEmail(u.email) || '';
    const parts = nameSource.trim().split(/\s+/);
    show('inboundAttachUnmatchedId').value = u.id;
    show('inboundAttachContactFirstName').value = parts.slice(0, -1).join(' ') || parts[0] || '';
    show('inboundAttachContactLastName').value  = parts.length > 1 ? parts[parts.length - 1] : '';
    show('inboundAttachContactEmail').value    = u.email || '';
    show('inboundAttachContactPosition').value = (senderMsg && _extractPosition(senderMsg.body)) || '';
    show('inboundAttachContactTel').value      = (senderMsg && _extractPhone(senderMsg.body)) || '';
    show('inboundAttachContactMobile').value   = '';
    show('inboundAttachRegisterContact').checked = true;
    document.getElementById('inboundAttachNewContactFields').classList.remove('d-none');
    contactWrap.classList.remove('d-none');
    _inboundAttachCheckEmailDuplicate();
    // The duplicate check reads the same portal-members/file-contacts caches
    // openCommModal warms -- if nothing's opened one yet this session (a
    // comms-only user may never hit that path at all), warm it here too so
    // the check isn't silently a no-op the whole time, then re-run once it
    // lands.
    const _canPrefetchContacts = !ALLOWED_TABS || ALLOWED_TABS.includes('contacts');
    if (_canPrefetchContacts && !_commContactsPrefetchStarted && _portalMembersCache === null) {
      _commContactsPrefetchStarted = true;
      loadContactsTab().then(_inboundAttachCheckEmailDuplicate);
    }
  } else {
    show('inboundAttachUnmatchedId').value = '';
    contactWrap.classList.add('d-none');
  }

  _refreshInboundAttachCases();

  if (!_inboundAttachModal) _inboundAttachModal = new bootstrap.Modal(document.getElementById('inboundAttachModal'));
  _inboundAttachModal.show();
}

// Same duplicate check the Contacts tab's own blank-new form runs
// (_findExistingContactByEmail, via _upCheckEmailDuplicate) -- catches
// someone editing the prefilled email into one that's already a real
// contact (whether they mistyped the original or the sender turned out to
// be someone already on record). "Don't create a duplicate" just unchecks
// the registration checkbox rather than navigating away like the Contacts
// tab's own hint does -- this modal's job is attaching the email to a
// case, which still goes ahead either way.
function _inboundAttachCheckEmailDuplicate() {
  const hint = document.getElementById('inboundAttachEmailHint');
  if (!hint) return;
  const found = _findExistingContactByEmail(show('inboundAttachContactEmail').value);
  if (found) {
    document.getElementById('inboundAttachEmailHintMsg').textContent =
      t('contacts.email_duplicate_found').replace('{who}', [found.label, found.org].filter(Boolean).join(' — '));
    hint.classList.remove('d-none');
  } else {
    hint.classList.add('d-none');
  }
}
function _inboundAttachSkipDuplicateContact() {
  show('inboundAttachRegisterContact').checked = false;
  document.getElementById('inboundAttachNewContactFields').classList.add('d-none');
  document.getElementById('inboundAttachEmailHint').classList.add('d-none');
}
function _inboundAttachDismissEmailHint() {
  document.getElementById('inboundAttachEmailHint').classList.add('d-none');
}

// See /api/contacts/guess-org-by-domain -- fires after the modal's already
// open, and only applies its result if the modal's still sitting on this
// same email when it resolves (guards against it landing late after the
// modal moved on or closed) AND the org field still only holds an earlier
// auto-guess (or nothing) -- never overrides a value the user actually
// picked or typed themselves, but IS allowed to override the weaker
// synchronous text-based guess that may have already filled it in.
async function _inboundAttachGuessOrgByDomain(id, email) {
  try {
    const data = await fetch(`${API_BASE}api/contacts/guess-org-by-domain?email=${encodeURIComponent(email)}`).then(r => r.json());
    if (Number(show('inboundAttachId').value) !== id) return;
    if (show('inboundAttachOrgCode').value && !_inboundAttachOrgAutoFilled) return;
    if (data.found) _inboundAttachSetOrg(data.found.code, data.found.label, true);
  } catch (_) {}
}

async function pickInboundContact() {
  const id = Number(show('inboundAttachId').value);
  const contactId = document.getElementById('inboundAttachCandidateSelect').value;
  if (!contactId) return;
  const err = show('inboundAttachError');
  err.classList.add('d-none');
  try {
    const resp = await fetch(`${API_BASE}api/inbound-emails/${id}/pick-contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_id: contactId }),
    });
    const data = await resp.json();
    if (!resp.ok) { err.textContent = data.error || t('common.save_failed'); err.classList.remove('d-none'); return; }

    const idx = _inboundEmailsData.findIndex(x => x.id === id);
    if (idx >= 0) _inboundEmailsData[idx] = data;
    renderCommsReviewSection();

    if (data.status === 'attached') {
      _inboundAttachModal.hide();
      await _reloadCasesAndComms();
    } else {
      // Contact resolved but the case still needs a human -- reopen the same
      // modal, now with the org known, so it continues straight to the
      // normal case picker / new-case flow instead of a second click.
      openInboundAttachModal(id);
    }
  } catch (e) {
    err.textContent = t('common.network_error').replace('{msg}', e.message);
    err.classList.remove('d-none');
  }
}

async function saveInboundAttach() {
  const btn = show('inboundAttachSaveBtn');
  if (btn.disabled) return;

  const err    = show('inboundAttachError');
  const id     = show('inboundAttachId').value;
  const caseId = show('inboundAttachCaseSelect').value || '';
  const orgCode  = show('inboundAttachOrgCode').value.trim();
  const orgLabel = show('inboundAttachOrgLabel').value.trim() || orgCode;
  const subject  = show('inboundAttachSubject').value.trim();

  const body = {};
  if (caseId) {
    body.case_id = caseId;
  } else {
    if (!orgCode || !subject) {
      err.textContent = t('inbound.attach_required');
      err.classList.remove('d-none');
      return;
    }
    body.org_name  = orgCode;
    body.org_title = orgLabel;
    body.subject   = subject;
  }

  // Register the detected sender as a contact in the same request -- see
  // inbound_email_attach's own new_contact handling, which always credits
  // it under whichever org the case above resolves to, never something
  // separately supplied.
  const unmatchedId = show('inboundAttachUnmatchedId').value;
  if (unmatchedId && show('inboundAttachRegisterContact').checked) {
    body.unmatched_id = unmatchedId;
    body.new_contact = {
      first_name: show('inboundAttachContactFirstName').value.trim(),
      last_name:  show('inboundAttachContactLastName').value.trim(),
      email:      show('inboundAttachContactEmail').value.trim(),
      position:   show('inboundAttachContactPosition').value.trim(),
      tel:        show('inboundAttachContactTel').value.trim(),
      mobile:     show('inboundAttachContactMobile').value.trim(),
    };
  }

  btn.disabled = true;
  try {
    const resp = await fetch(`${API_BASE}api/inbound-emails/${id}/attach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await resp.json();
    if (!resp.ok) { err.textContent = json.error || t('common.save_failed'); err.classList.remove('d-none'); return; }
    _inboundAttachModal.hide();
    // Full reload -- pulls the newly created Communication/Case into the main
    // views and refreshes the pending-review list in the same round trip.
    await _reloadCasesAndComms();
  } catch (e) {
    err.textContent = t('common.network_error').replace('{msg}', e.message);
    err.classList.remove('d-none');
  } finally {
    btn.disabled = false;
  }
}

function dismissInboundEmail(id) {
  confirmDangerAction(t('inbound.dismiss_confirm'), async () => {
    try {
      const resp = await fetch(`${API_BASE}api/inbound-emails/${id}/dismiss`, { method: 'POST' });
      const json = await resp.json();
      if (!resp.ok) { alert(json.error || t('common.save_failed')); return; }
      _inboundEmailsData = _inboundEmailsData.filter(e2 => e2.id !== id);
      renderCommsReviewSection();
    } catch (e) {
      alert(t('common.network_error').replace('{msg}', e.message));
    }
  });
}

function downloadCommsExcel() {
  const q = document.getElementById('commsSearch').value;
  const params = new URLSearchParams();
  if (_commsCaseStatusFilter) params.set('case_status', _commsCaseStatusFilter);
  if (_commsStaleFilter)      params.set('stale', _commsStaleFilter);
  if (_commsStatusFilter)     params.set('status', _commsStatusFilter);
  if (q) params.set('q', q);
  window.location.href = `${API_BASE}api/communications/export?${params}`;
}


// ── Org Contacts ─────────────────────────────────────────────────────────────

function esc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function openContactsByIdx(i) {
  const o = _displayedPublicOrgs[i];
  if (!o) return;
  const ckan = o.ckan ? o.ckan.name : null;
  openContactsPanel(ckan || o.code, o.label, ckan);
}

function openContactsPanel(orgCode, orgLabel, ckanName = null) {
  _panelOrgCode  = orgCode;
  _panelOrgLabel = orgLabel;
  _panelCkanName = ckanName;
  if (!_contactsPanel) _contactsPanel = new bootstrap.Offcanvas(document.getElementById('orgContactsPanel'));
  _bringOverlayToFront(document.getElementById('orgContactsPanel'));
  show('orgContactsTitle').textContent    = t('contacts.panel_title');
  show('orgContactsSubtitle').textContent = orgLabel;
  _contactsPanel.show();
  _renderOrgContactsPanel();
}

function _renderOrgContactsPanel() {
  const orgCode  = _panelOrgCode;
  const orgLabel = _panelOrgLabel;
  const ckanName = _panelCkanName;

  // This panel is reachable from Organizations (which doesn't require
  // "contacts" access), but its data comes from the contacts-gated
  // /api/portal-members -- without this check, a contacts-less user's fetch
  // 403s silently and the spinner below waits forever for a cache that will
  // never populate.
  if (ALLOWED_TABS && !ALLOWED_TABS.includes('contacts')) {
    show('orgContactsBody').innerHTML = `<div class="alert alert-warning mb-0">${t('contacts.org_panel_no_access')}</div>`;
    return;
  }

  if (!_portalMembersCache) {
    show('orgContactsBody').innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
    const _wait = () => { if (_portalMembersCache) _renderOrgContactsPanel(); else setTimeout(_wait, 300); };
    loadContactsTab();
    _wait();
    return;
  }

  // _orgCodeMatches (used both for member inclusion below and for the
  // orgsDiffer mismatch flag further down) silently degrades to exact-string
  // comparison until _hrmsLookup/_ckanByHrms are built -- unlike this same
  // comparison everywhere else it's used (renderUserPanel, _rowFieldsDiffer),
  // this panel never warmed that bridge, so opening it before ever visiting
  // Organizations this session could both wrongly flag a genuinely-matching
  // HRMS<->CKAN org pair as a mismatch AND silently drop a member who's only
  // tied to this org through that file-side code. Warm it and re-render once
  // it lands -- cheap to call again, this function always reads live module
  // state (_panelOrgCode etc.), not a snapshot, so re-invoking it later for
  // whatever org is currently selected is always correct.
  if (!(_hrmsLookup && _ckanByHrms)) {
    _ensureOrgCkanBridge().then(() => { if (document.getElementById('orgContactsPanel')?.classList.contains('show')) _renderOrgContactsPanel(); });
  }

  // All portal members for this org (dedup by username, highest role) -- match
  // both by live CKAN org membership AND by what the linked contact file says.
  // A member's portal account can have no CKAN org (or a different one) while
  // their HR contact record still ties them to this org (e.g. an account that
  // was never added to any organization on the portal), so relying on
  // m.org_name alone silently drops them from every org's contact list even
  // though the badge count (driven by org_code, not live membership) counts them.
  const roleRank = { admin: 3, editor: 2, member: 1 };
  const rankM = m => m.sysadmin ? 4 : (roleRank[m.capacity] || 0);
  const memberMap = new Map();
  for (const m of _portalMembersCache) {
    const orgMatch  = orgCode && _orgCodeMatches(m.org_name || '', orgCode);
    const fileMatch = orgCode && (m.contact_org_codes || []).some(o => _orgCodeMatches(o.code || '', orgCode));
    if (!orgMatch && !fileMatch) continue;
    const prev = memberMap.get(m.username);
    if (!prev || rankM(m) > rankM(prev)) memberMap.set(m.username, m);
  }
  const portalMembers = [...memberMap.values()];

  // Unmatched contacts for this org — match by stored key, CKAN slug, or reverse HRMS lookup
  const unmatched = (_pmUnmatched || []).filter(c => {
    const key = c.org_code || '';
    if (orgCode  && key === orgCode)  return true;
    if (ckanName && key === ckanName) return true;
    // Old contacts stored with HRMS code or label: resolve to CKAN slug and compare
    if (ckanName && _ckanByHrms) { const resolved = _ckanByHrms.get(key); if (resolved === ckanName) return true; }
    return false;
  });

  const addBtn = `<button class="btn btn-primary btn-sm mb-3 w-100" onclick="openNewContactPanel(_panelCkanName || _panelOrgCode, _panelOrgLabel)">
    <i class="bi bi-person-plus me-1"></i>${t('contacts.add')}
  </button>`;

  const memberCards = portalMembers.map(m => {
    const roleLabel = _portalRoleLabel(m);
    const roleCls   = _portalRoleClass(m);
    const hasFile   = !!m.contact_id;
    const displayName = esc(_pmDisplayName(m));
    // Surface both org sources side by side -- they can legitimately disagree
    // (e.g. an account with no CKAN org membership whose contact file still
    // ties it to one), which is exactly the case this panel now also matches on.
    const fileOrgLabel   = (m.contact_org_codes || []).map(o => o.label || o.code).join(', ');
    const portalOrgLabel = m.org_name ? (m.org_title || m.org_name) : t('userPanel.no_organization');
    const orgsDiffer = hasFile && fileOrgLabel &&
      !(m.contact_org_codes || []).some(o => _orgCodeMatches(o.code || '', m.org_name || ''));
    return `
    <div class="card mb-2 border" style="${hasFile ? '' : 'border-style:dashed!important;opacity:.8'}">
      <div class="card-body py-2 px-3">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div class="flex-grow-1" style="min-width:0">
            <div class="fw-semibold">
              ${displayName}
              <span class="badge ${roleCls} ms-1" style="font-size:.7rem">${esc(roleLabel)}</span>
              <span class="badge rounded-pill ms-1" style="font-size:.65rem;background:#e8f0fe;color:#1a56db"><i class="bi bi-globe2 me-1"></i>Portal</span>
              ${hasFile ? `<span class="badge rounded-pill ms-1" style="font-size:.65rem;background:#e6f4ea;color:#188038"><i class="bi bi-file-earmark-person me-1"></i>File</span>` : ''}
            </div>
            ${hasFile ? `<div class="small ${orgsDiffer ? 'text-warning' : 'text-muted'}"${orgsDiffer ? ` title="${t('userPanel.org_mismatch')}"` : ''}>
              ${orgsDiffer ? '<i class="bi bi-exclamation-triangle-fill me-1"></i>' : ''}${t('userPanel.org_file')}: ${esc(fileOrgLabel || '—')} &middot; ${t('userPanel.org_portal')}: ${esc(portalOrgLabel)}
            </div>` : ''}
            ${hasFile && m.contact_position ? `<div class="text-muted small">${esc(m.contact_position)}</div>` : ''}
            ${m.email ? `<div class="small"><i class="bi bi-envelope me-1 text-muted"></i><a href="mailto:${esc(m.email)}">${esc(m.email)}</a></div>` : ''}
            ${hasFile && m.contact_tel    ? `<div class="small"><i class="bi bi-telephone me-1 text-muted"></i><a href="tel:${esc(m.contact_tel)}">${esc(m.contact_tel)}</a></div>` : ''}
            ${hasFile && m.contact_mobile ? `<div class="small"><i class="bi bi-phone me-1 text-muted"></i><a href="tel:${esc(m.contact_mobile)}">${esc(m.contact_mobile)}</a></div>` : ''}
          </div>
          <div class="d-flex gap-1 flex-shrink-0">
            ${hasFile
              ? `<button class="btn btn-outline-secondary btn-sm py-0 px-1" onclick="openUserPanel('${esc(m.username)}', true)" title="${t('common.edit')}"><i class="bi bi-pencil"></i></button>
                 <button class="btn btn-outline-danger btn-sm py-0 px-1" onclick="deletePmContactRecord(${m.contact_id},'${esc(m.username)}')" title="${t('common.delete')}"><i class="bi bi-trash"></i></button>`
              : `<button class="btn btn-outline-primary btn-sm py-0 px-1" onclick="openUserPanel('${esc(m.username)}', true)" title="${t('userPanel.add_contact_record')}"><i class="bi bi-person-plus me-1"></i>${t('common.add')}</button>`}
          </div>
        </div>
      </div>
    </div>`;
  });

  const unmatchedCards = unmatched.map(c => {
    const typeBadges = (c.contact_type || '').split(',').map(s => s.trim()).filter(Boolean).map(typ =>
      `<span class="badge ${CONTACT_TYPE_CLS[typ] || 'bg-secondary'} ms-1" style="font-size:.7rem">${esc(typ)}</span>`
    ).join('');
    return `
    <div class="card mb-2 border">
      <div class="card-body py-2 px-3">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div class="flex-grow-1" style="min-width:0">
            <div class="fw-semibold">
              ${esc(c.first_name || '')} ${esc(c.last_name || '')}${typeBadges}
              <span class="badge rounded-pill ms-1" style="font-size:.65rem;background:#e6f4ea;color:#188038"><i class="bi bi-file-earmark-person me-1"></i>File</span>
            </div>
            ${c.position ? `<div class="text-muted small">${esc(c.position)}</div>` : ''}
            ${c.email  ? `<div class="small"><i class="bi bi-envelope me-1 text-muted"></i><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>` : ''}
            ${c.tel    ? `<div class="small"><i class="bi bi-telephone me-1 text-muted"></i><a href="tel:${esc(c.tel)}">${esc(c.tel)}</a></div>` : ''}
            ${c.mobile ? `<div class="small"><i class="bi bi-phone me-1 text-muted"></i><a href="tel:${esc(c.mobile)}">${esc(c.mobile)}</a></div>` : ''}
          </div>
          <div class="d-flex gap-1 flex-shrink-0">
            <button class="btn btn-outline-secondary btn-sm py-0 px-1" onclick="openFileContactPanel(${c.id}, true)" title="${t('common.edit')}"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-outline-danger btn-sm py-0 px-1" onclick="deletePmContactRecord(${c.id}, null)" title="${t('common.delete')}"><i class="bi bi-trash"></i></button>
          </div>
        </div>
      </div>
    </div>`;
  });

  const allCards = [...memberCards, ...unmatchedCards];
  show('orgContactsBody').innerHTML = addBtn +
    (allCards.length ? allCards.join('') : `<p class="text-muted small mt-2">${t('contacts.none')}</p>`);
}

async function importContactsExcel(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  const fd = new FormData();
  fd.append('file', file);
  const btn = input.closest('label, button');
  const origHtml = btn ? btn.innerHTML : '';
  if (btn) { btn.style.pointerEvents = 'none'; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>' + esc(t('contacts.importing')); }
  try {
    const resp = await fetch(API_BASE + 'api/contacts/import', { method: 'POST', body: fd });
    const json = await resp.json();
    if (!resp.ok) throw new Error(json.error || resp.status);
    let msg = t('contacts.import_result').replace('{n}', json.imported).replace('{skipped}', json.skipped);
    if (json.errors && json.errors.length) msg += t('contacts.import_errors_prefix') + json.errors.join('\n');
    // Repair org_codes in case the HRMS cache was empty during import
    try {
      const fix = await fetch(API_BASE + 'api/contacts/fix-org-codes', {method:'POST'});
      const fixJson = await fix.json();
      if (fixJson.fixed) msg += t('contacts.import_fixed_org_codes').replace('{n}', fixJson.fixed);
    } catch (_) {}
    // Normalize contact types (Greek role names → canonical English values)
    try {
      const fixT = await fetch(API_BASE + 'api/contacts/fix-contact-types', {method:'POST'});
      const fixTJson = await fixT.json();
      if (fixTJson.fixed) msg += t('contacts.import_fixed_contact_types').replace('{n}', fixTJson.fixed);
    } catch (_) {}
    // Move 69x numbers from tel to mobile
    try {
      const fixM = await fetch(API_BASE + 'api/contacts/fix-tel-mobile', {method:'POST'});
      const fixMJson = await fixM.json();
      if (fixMJson.fixed) msg += t('contacts.import_fixed_tel_mobile').replace('{n}', fixMJson.fixed);
    } catch (_) {}
    alert(msg);
    _allContacts = null; _allUnified = null;  // invalidate contacts tab cache
    _contactSummary = await fetch(API_BASE + 'api/contacts/summary').then(r => r.json());
    if (_orgsViewMode === 'all') filterOrgs();
  } catch (e) {
    alert(t('contacts.import_failed').replace('{msg}', e.message));
  } finally {
    if (btn) { btn.style.pointerEvents = ''; btn.innerHTML = origHtml; }
  }
}

async function loadContactSummary() {
  const s = {};

  if (_portalMembersCache) {
    // Rebuild locally so keys match what _portalContactCell looks up (HRMS label OR CKAN slug).
    // Dedup is scoped PER ORG KEY (not globally by contact_id) -- the same
    // person can hold portal roles in more than one organization, and a
    // global dedup would only ever credit whichever org's row happened to be
    // processed first, silently dropping that person from every other org's
    // count (matches the per-org filter-then-dedup _renderOrgContactsPanel
    // already does correctly).
    const seenPerKey = new Map();
    const bump = (key, id) => {
      if (!key) return;
      let seen = seenPerKey.get(key);
      if (!seen) { seen = new Set(); seenPerKey.set(key, seen); }
      if (id != null) {
        if (seen.has(id)) return;
        seen.add(id);
      }
      s[key] = (s[key] || 0) + 1;
    };
    for (const m of _portalMembersCache) {
      if (!m.contact_id) continue;
      const ckan = m.org_name || '';
      bump(ckan, m.contact_id);
      // Also index by HRMS code so "All orgs" view count badge works
      if (_hrmsLookup) bump(_hrmsLookup.get(ckan), m.contact_id);
    }
    for (const c of (_pmUnmatched || [])) {
      const key = c.org_code || '';
      bump(key, c.id);
      // If stored with HRMS code or label, also index under CKAN slug so portal view count works
      if (_ckanByHrms) bump(_ckanByHrms.get(key), c.id);
      // If stored with CKAN slug, also index under HRMS code for "All orgs" view
      if (_hrmsLookup) bump(_hrmsLookup.get(key), c.id);
    }
  }

  // Always fold in the plain per-org_code contact count from the backend too,
  // as a floor (via max, never summed -- these two sources overlap). The
  // portal-members reconstruction above only counts a contact if its email
  // happens to match a live portal account under the same org; any contact
  // that doesn't clear that bar would otherwise silently drop out of the
  // badge count the moment the portal-members cache warms up (e.g. as soon
  // as the user opens one org's contact list), even though it's still a
  // perfectly real row in the contacts table.
  try {
    const raw = await fetch(API_BASE + 'api/contacts/summary').then(r => r.json());
    for (const [key, cnt] of Object.entries(raw)) {
      const ckan = _ckanByHrms ? _ckanByHrms.get(key) : null;
      const hrms = _hrmsLookup ? _hrmsLookup.get(key) : null;
      for (const k of [key, ckan, hrms].filter(Boolean)) s[k] = Math.max(s[k] || 0, cnt);
    }
  } catch (_) {}

  _contactSummary = s;
  if (_isTabActive('tab-orgs')) {
    if (_orgsViewMode === 'portal' && _orgsLoaded) renderOrgsTable(_orgsData);
    if (_orgsViewMode === 'all') filterOrgs();
  }
}
// ── Org detail panel ─────────────────────────────────────────────────────────
let _orgPanel = null;

function openOrgPanel(name) {
  if (!_orgPanel) _orgPanel = new bootstrap.Offcanvas(document.getElementById('orgDetailPanel'));
  _bringOverlayToFront(document.getElementById('orgDetailPanel'));
  document.getElementById('orgDetailTitle').textContent = t('loading');
  document.getElementById('orgDetailIdLink').classList.add('d-none');
  document.getElementById('orgDetailBody').innerHTML =
    '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
  _orgPanel.show();
  fetch(API_BASE + 'api/organizations/' + encodeURIComponent(name))
    .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.error || r.status)))
    .then(data => renderOrgPanel(data))
    .catch(err => {
      document.getElementById('orgDetailBody').innerHTML =
        `<div class="alert alert-danger mb-0">${t('traffic.failed')}: ${err}</div>`;
    });
}

// ── Dataset detail panel ─────────────────────────────────────────────────────
let _datasetPanel = null;

function openDatasetPanel(name) {
  if (!_datasetPanel) _datasetPanel = new bootstrap.Offcanvas(document.getElementById('datasetDetailPanel'));
  _bringOverlayToFront(document.getElementById('datasetDetailPanel'));
  show('datasetDetailTitle').textContent = t('loading');
  document.getElementById('datasetDetailIdLink').classList.add('d-none');
  show('datasetDetailBody').innerHTML =
    '<div class="text-center py-5 text-muted"><div class="spinner-border text-primary"></div></div>';
  _datasetPanel.show();
  fetch(API_BASE + 'api/datasets/' + encodeURIComponent(name))
    .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.error || r.status)))
    .then(renderDatasetPanel)
    .catch(err => {
      show('datasetDetailBody').innerHTML =
        `<div class="alert alert-danger mb-0">${t('error')} ${esc(String(err))}</div>`;
    });
}

function renderDatasetPanel(d) {
  show('datasetDetailTitle').textContent = d.title;
  const idLink = document.getElementById('datasetDetailIdLink');
  idLink.innerHTML = `${esc(d.name)}&ensp;<a href="https://data.gov.gr/dataset/${encodeURIComponent(d.name)}" target="_blank" rel="noopener" class="text-muted" title="${t('catalog.view_on_portal')}"><i class="bi bi-box-arrow-up-right"></i></a>`;
  idLink.classList.remove('d-none');
  const fmtDate = (s) => s ? esc(s.slice(0, 10)) : '—';
  const isService = d.type === 'data-service';
  const ckanResourceViews = (d.resources || []).reduce((sum, r) => sum + (r.ckan_views || 0), 0);

  const tagsHtml = (d.tags || []).map(tag =>
    `<span class="badge bg-light text-dark border me-1 mb-1">${esc(tag)}</span>`
  ).join('') || `<span class="text-muted small">—</span>`;

  const resourcesHtml = isService
    ? ((d.endpoints || []).length
        ? `<div class="list-group list-group-flush">
            ${d.endpoints.map(url => `
              <div class="list-group-item px-0 py-2 d-flex justify-content-between align-items-center gap-2">
                <span class="small text-truncate" style="max-width:260px" title="${esc(url)}">
                  ${esc(url)}
                  ${d.service_format ? `<span class="badge bg-secondary ms-1" style="font-size:.65rem">${esc(d.service_format)}</span>` : ''}
                </span>
                <a href="${esc(url)}" target="_blank" rel="noopener" class="btn btn-outline-secondary btn-sm py-0 px-2 flex-shrink-0" title="${t('catalog.open_endpoint')}"><i class="bi bi-box-arrow-up-right"></i></a>
              </div>`).join('')}
          </div>`
        : `<p class="text-muted small">${t('catalog.no_endpoints')}</p>`)
    : ((d.resources || []).length
        ? `<div class="list-group list-group-flush">
            ${d.resources.map(r => `
              <div class="list-group-item px-0 py-2 d-flex justify-content-between align-items-center gap-2">
                <span class="small text-truncate" style="max-width:260px" title="${esc(r.name)}">
                  ${esc(r.name)}
                  ${r.format ? `<span class="badge bg-secondary ms-1" style="font-size:.65rem">${esc(r.format)}</span>` : ''}
                </span>
                ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener" class="btn btn-outline-secondary btn-sm py-0 px-2 flex-shrink-0" title="${t('catalog.download')}"><i class="bi bi-download"></i></a>` : ''}
              </div>`).join('')}
          </div>`
        : `<p class="text-muted small">${t('catalog.no_resources')}</p>`);

  show('datasetDetailBody').innerHTML = `
    <div class="mb-3 d-flex align-items-center gap-2 flex-wrap">
      <a href="#" onclick="openOrgPanel('${esc(d.org_name)}');return false;"
         class="badge bg-light text-dark border text-decoration-none d-inline-block">
        <i class="bi bi-building me-1"></i>${esc(d.org_title)}
      </a>
      ${d.type && d.type !== 'dataset' ? `<span class="badge bg-info-subtle text-info-emphasis border">${esc(_datasetTypeLabel(d.type))}</span>` : ''}
      ${d.is_hvd ? `<span class="badge bg-warning-subtle text-warning-emphasis border" title="${esc(t('catalog.hvd_tooltip'))}"><i class="bi bi-gem me-1"></i>${t('catalog.hvd_full')}</span>` : ''}
      ${d.harvest_source ? `<span class="badge bg-info-subtle text-info-emphasis border" title="${esc(t('catalog.harvested_tooltip'))}"><i class="bi bi-cloud-arrow-down me-1"></i>${esc(d.harvest_source)}</span>` : ''}
      ${d.is_geospatial ? `<span class="badge bg-success-subtle text-success-emphasis border" title="${esc(t('catalog.geo_tooltip'))}"><i class="bi bi-geo-alt me-1"></i>${t('catalog.geo_full')}</span>` : ''}
    </div>
    <div class="small text-muted mb-3">
      <div class="d-flex flex-wrap align-items-center gap-3">
        <span title="${esc(t('catalog.ckan_views_tooltip'))}"><i class="bi bi-eye me-1"></i>${fmt(d.ckan_views || 0)}</span>
        ${!isService ? `<span title="${esc(t('catalog.ckan_downloads_tooltip'))}"><i class="bi bi-download me-1"></i>${fmt(ckanResourceViews)}</span>` : ''}
        <span class="text-muted" style="font-size:.7em">${t('catalog.source_ckan')}</span>
      </div>
      <div id="datasetStatsRow" class="d-flex flex-wrap align-items-center gap-2 mt-1">
        <div class="spinner-border spinner-border-sm text-muted" style="width:.75rem;height:.75rem;border-width:2px"></div>
        <span class="text-muted">${t('catalog.loading_matomo')}</span>
      </div>
    </div>
    ${d.notes ? `<p class="small">${esc(d.notes).replace(/\n/g, '<br>')}</p>` : ''}
    <div class="row g-2 small text-muted mb-3">
      <div class="col-6"><strong>${t('catalog.created')}</strong><br>${fmtDate(d.metadata_created)}</div>
      <div class="col-6"><strong>${t('catalog.col_modified')}</strong><br>${fmtDate(d.metadata_modified)}</div>
      ${d.license_title ? `<div class="col-12 mt-1"><strong>${t('catalog.license')}</strong><br>${esc(d.license_title)}</div>` : ''}
    </div>
    <h6 class="fw-semibold small text-uppercase text-muted mb-2">${t('catalog.tags')}</h6>
    <div class="mb-3">${tagsHtml}</div>
    <h6 class="fw-semibold small text-uppercase text-muted mb-2">${isService ? t('catalog.endpoints') : t('catalog.resources')} (${isService ? (d.endpoints || []).length : (d.resources ? d.resources.length : 0)})</h6>
    ${resourcesHtml}
    <h6 class="fw-semibold small text-uppercase text-muted mb-2 mt-4">${t('catalog.related')}</h6>
    <div id="datasetRelated"><div class="text-center py-2 text-muted"><div class="spinner-border spinner-border-sm"></div></div></div>`;
  _loadRelatedDatasets(d.name, d.org_name);
  _loadDatasetStats(d.name, d.title, d.resources || []);
}

async function _loadDatasetStats(name, title, resources) {
  const row = document.getElementById('datasetStatsRow');
  try {
    const params = new URLSearchParams({ name });
    resources.forEach(r => { if (r.url) params.append('resource_url', r.url); });
    const data = await fetch(API_BASE + 'api/matomo/dataset-stats?' + params).then(r => r.json());
    if (!row) return;  // panel closed/replaced while fetching
    if (data.error) { row.classList.add('d-none'); return; }  // Matomo not configured
    row.innerHTML = `
      <span title="${esc(t('catalog.stats_views_tooltip'))}"><i class="bi bi-eye me-1"></i>${fmt(data.unique_visitors)}</span>
      <span title="${esc(t('catalog.stats_downloads_tooltip'))}"><i class="bi bi-download me-1"></i>${fmt(data.downloads)}</span>
      <span class="text-muted" style="font-size:.7em">${t('catalog.source_matomo')}</span>
      <a href="#" class="small" id="datasetAnalyticsLink">
        <i class="bi bi-graph-up me-1"></i>${t('catalog.view_analytics')}
      </a>`;
    document.getElementById('datasetAnalyticsLink').addEventListener('click', (e) => {
      e.preventDefault();
      openDatasetAnalyticsPanel(name, title, resources);
    });
  } catch (e) {
    if (row) row.classList.add('d-none');  // stats are a nice-to-have — fail silently
  }
}

// ── Dataset analytics offcanvas ──────────────────────────────────────────────
let _datasetAnalyticsPanel = null;
let _datasetAnalyticsChart = null;

function openDatasetAnalyticsPanel(name, title, resources) {
  if (!_datasetAnalyticsPanel) _datasetAnalyticsPanel = new bootstrap.Offcanvas(document.getElementById('datasetAnalyticsPanel'));
  _bringOverlayToFront(document.getElementById('datasetAnalyticsPanel'));
  document.getElementById('datasetAnalyticsSubtitle').textContent = title || '';
  document.getElementById('datasetAnalyticsBody').innerHTML =
    '<div class="text-center py-5 text-muted"><div class="spinner-border text-primary"></div></div>';
  _datasetAnalyticsPanel.show();
  const params = new URLSearchParams({ name });
  (resources || []).forEach(r => { if (r.url) params.append('resource_url', r.url); });
  const resourceNameByUrl = new Map((resources || []).filter(r => r.url).map(r => [r.url, r.name]));
  fetch(API_BASE + 'api/matomo/dataset-analytics?' + params)
    .then(r => r.json())
    .then(data => renderDatasetAnalytics(data, resourceNameByUrl))
    .catch(() => renderDatasetAnalytics({ error: t('error') }, new Map()));
}

const _REFERRER_ICON = {
  'direct entry':     'bi-arrow-right-circle',
  'websites':         'bi-globe',
  'search engines':   'bi-search',
  'social networks':  'bi-share',
  'campaigns':        'bi-megaphone',
};

function renderDatasetAnalytics(data, resourceNameByUrl) {
  const body = document.getElementById('datasetAnalyticsBody');
  if (!body) return;  // panel closed while fetching
  if (data.error) {
    body.innerHTML = `<div class="alert alert-secondary small mb-0">${esc(data.error)}</div>`;
    return;
  }
  resourceNameByUrl = resourceNameByUrl || new Map();
  const hasSeries = (data.time_series || []).some(pt => pt.visits || pt.unique_visitors);
  body.innerHTML = `
    <h6 class="fw-semibold small text-uppercase text-muted mb-2">${t('catalog.analytics_over_time')}</h6>
    ${hasSeries
      ? `<div style="position:relative;height:220px" class="mb-4"><canvas id="datasetAnalyticsChart"></canvas></div>`
      : `<p class="text-muted small mb-4">${t('catalog.analytics_no_data')}</p>`}
    <h6 class="fw-semibold small text-uppercase text-muted mb-2">${t('catalog.analytics_countries')}</h6>
    ${(data.countries || []).length
      ? `<div class="list-group list-group-flush mb-4">${data.countries.map(c => `
          <div class="list-group-item px-0 py-1 d-flex align-items-center gap-2 small">
            <span class="fs-6" style="width:20px">${flagHtml(c.code)}</span>
            <span class="flex-grow-1">${esc(c.name)}</span>
            <span class="text-muted mono">${fmt(c.visits)}</span>
          </div>`).join('')}</div>`
      : `<p class="text-muted small mb-4">${t('catalog.analytics_no_data')}</p>`}
    <h6 class="fw-semibold small text-uppercase text-muted mb-2">${t('catalog.analytics_referrers')}</h6>
    ${(data.referrers || []).length
      ? `<div class="list-group list-group-flush mb-4">${data.referrers.map(r => `
          <div class="list-group-item px-0 py-1 d-flex align-items-center gap-2 small">
            <i class="bi ${_REFERRER_ICON[(r.type || '').toLowerCase()] || 'bi-question-circle'} text-muted" style="width:20px"></i>
            <span class="flex-grow-1">${esc(r.type)}</span>
            <span class="text-muted mono">${fmt(r.visits)}</span>
          </div>`).join('')}</div>`
      : `<p class="text-muted small mb-4">${t('catalog.analytics_no_data')}</p>`}
    <h6 class="fw-semibold small text-uppercase text-muted mb-2">${t('catalog.analytics_downloads')}</h6>
    ${(data.downloads || []).length
      ? `<div class="list-group list-group-flush">${data.downloads.map(dl => `
          <div class="list-group-item px-0 py-1 d-flex align-items-center gap-2 small">
            <i class="bi bi-file-earmark-arrow-down text-muted" style="width:20px"></i>
            <span class="flex-grow-1 text-truncate" title="${esc(resourceNameByUrl.get(dl.url) || dl.url)}">${esc(resourceNameByUrl.get(dl.url) || dl.url)}</span>
            <span class="text-muted mono">${fmt(dl.downloads)}</span>
          </div>`).join('')}</div>`
      : `<p class="text-muted small mb-0">${t('catalog.analytics_no_data')}</p>`}`;

  if (!hasSeries) return;
  const ctx = document.getElementById('datasetAnalyticsChart').getContext('2d');
  if (_datasetAnalyticsChart) _datasetAnalyticsChart.destroy();
  _datasetAnalyticsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.time_series.map(pt => pt.date),
      datasets: [
        { label: t('catalog.analytics_visits'), data: data.time_series.map(pt => pt.visits),
          borderColor: '#0057b8', backgroundColor: 'rgba(0,87,184,.08)', fill: true, tension: 0.3, pointRadius: 1 },
        { label: t('catalog.analytics_unique_visitors'), data: data.time_series.map(pt => pt.unique_visitors),
          borderColor: '#20c997', backgroundColor: 'rgba(32,201,151,.08)', fill: true, tension: 0.3, pointRadius: 1 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 }, color: _chartTextColor() } } },
      scales: {
        x: { ticks: { font: { size: 9 }, maxTicksLimit: 8, color: _chartTextColor() }, grid: { color: _chartGridColor() } },
        y: { min: 0, ticks: { font: { size: 10 }, color: _chartTextColor() }, grid: { color: _chartGridColor() } },
      },
    },
  });
}

async function _loadRelatedDatasets(name, orgName) {
  const el = document.getElementById('datasetRelated');
  if (!el) return;
  try {
    const params = new URLSearchParams({ org: orgName, rows: 6, sort: 'modified_desc' });
    const data = await fetch(API_BASE + 'api/datasets/search?' + params).then(r => r.json());
    const related = (data.datasets || []).filter(x => x.name !== name).slice(0, 5);
    if (!document.getElementById('datasetRelated')) return;  // panel closed/replaced while fetching
    if (!related.length) {
      el.innerHTML = `<p class="text-muted small mb-0">${t('catalog.related_none')}</p>`;
      return;
    }
    el.innerHTML = `<div class="list-group list-group-flush">${related.map(r => `
      <a href="#" onclick="openDatasetPanel('${esc(r.name)}');return false;"
         class="list-group-item list-group-item-action px-0 py-2 small text-truncate">${esc(r.title)}</a>`).join('')}</div>`;
  } catch (e) {
    if (document.getElementById('datasetRelated')) el.innerHTML = '';
  }
}

// ── User detail panel ─────────────────────────────────────────────────────────
let _userPanel = null;

// startEditing: true opens straight into inline-edit mode (used by the
// table row-level edit-pencil buttons, which used to open pmEditModal) --
// false is the plain row-click, read-only open.
function openUserPanel(username, startEditing = false) {
  if (!username) return;
  if (!_userPanel) _userPanel = new bootstrap.Modal(document.getElementById('userPanel'));
  _bringOverlayToFront(document.getElementById('userPanel'));
  _userDatasetsLoaded = null;
  _userActivityLoaded = null;
  _upEditing = false;
  document.getElementById('userPanelName').textContent = username;
  document.getElementById('userPanelUsername').textContent = '@' + username;
  document.getElementById('userPanelBody').innerHTML =
    '<div class="text-center py-5 text-muted"><div class="spinner-border text-primary"></div></div>';
  _userPanel.show();
  // Query param, not a path segment -- see the matching comment on the
  // /api/portal-user route in app.py for why (WAF false positive on
  // usernames that are personal emails ending in .com).
  fetch(API_BASE + 'api/portal-user?username=' + encodeURIComponent(username))
    .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.error || r.status)))
    .then(data => {
      if (startEditing) {
        // Two cases: editing an existing linked contact (seed from it), or
        // this portal member has no contact file yet -- same edit mode, but
        // seeded from their own portal org membership(s) instead, so the
        // panel goes straight into "create" rather than showing the
        // separate Add-record button first.
        _upEditOrgs = data.contact ? _seedUpEditOrgs(data.contact) : _seedUpEditOrgsFromPortal(data.username);
        _upEditing = true;
      }
      renderUserPanel(data);
    })
    .catch(err => {
      document.getElementById('userPanelBody').innerHTML =
        `<div class="alert alert-danger mb-0">${t('userPanel.failed_load_user').replace('{msg}', err)}</div>`;
    });
}

// Same offcanvas as openUserPanel, for a File Contact that has no linked
// portal account -- there's no /api/portal-user fetch to make (no CKAN
// account exists), so this wraps the already-loaded contact record straight
// into the same u-shaped object renderUserPanel expects, with every
// portal-only field left null/empty. renderUserPanel's _hasPortal check
// (username present or not) takes it from there: no Portal column, no
// Registered/Last active/Datasets/Edits section.
function openFileContactPanel(id, startEditing = false) {
  const c = _findLoadedFileContact(id) || (_pmUnmatched || []).find(x => x.id === id);
  if (!c) return;
  if (!_userPanel) _userPanel = new bootstrap.Modal(document.getElementById('userPanel'));
  _bringOverlayToFront(document.getElementById('userPanel'));
  _userDatasetsLoaded = null;
  _userActivityLoaded = null;
  _upEditing = false;
  if (startEditing) { _upEditOrgs = _seedUpEditOrgs(c); _upEditing = true; }
  renderUserPanel({
    username: null, contact: c, display_name: null, email: null,
    state: null, sysadmin: false, created: null, last_active: null,
    num_packages: 0, num_edits: 0, about: null,
  });
  _userPanel.show();
}

// Same panel again, for a contact with no anchor identity at all -- no
// portal account, no existing file record, nothing but maybe an org
// (org-scoped "add contact" buttons pass one in). Straight into edit mode
// on a fully blank u/contact; _isBlankNew in renderUserPanel (username and
// contact both null) is what turns on the email-duplicate check below, since
// that's only meaningful when there's no already-known identity to conflict
// with.
function openNewContactPanel(orgCode, orgLabel) {
  if (!_userPanel) _userPanel = new bootstrap.Modal(document.getElementById('userPanel'));
  _bringOverlayToFront(document.getElementById('userPanel'));
  _userDatasetsLoaded = null;
  _userActivityLoaded = null;
  _upEditOrgs = orgCode ? [{code: orgCode, label: orgLabel || orgCode}] : [];
  _upEditing = true;
  renderUserPanel({
    username: null, contact: null, display_name: null, email: null,
    state: null, sysadmin: false, created: null, last_active: null,
    num_packages: 0, num_edits: 0, about: null,
  });
  _userPanel.show();
  // Preload HRMS orgs in background so they appear in the org picker.
  if (!_publicOrgs.length) fetch(API_BASE + 'api/public-orgs').then(r => r.json()).then(d => { if (Array.isArray(d)) _publicOrgs = d; }).catch(() => {});
}

// Inline editing state for the user panel's Info/Organizations table -- lets
// "Edit" turn the linked contact record's own fields into inputs in place
// instead of opening the separate pmEditModal. _userPanelUser is kept so
// cancel/save can re-render from the last-fetched data without a refetch.
let _userPanelUser = null;
let _upEditing      = false;
let _upEditOrgs     = [];  // [{code, label}, ...] -- mirrors _pmEditOrgs but for this picker

// Shared by startUserPanelEdit and the startEditing=true paths in
// openUserPanel/openFileContactPanel (row-level edit-pencil buttons that
// jump straight into edit mode instead of opening the panel read-only first).
function _seedUpEditOrgs(c) {
  return (c.org_codes && c.org_codes.length)
    ? c.org_codes.map(o => ({...o}))
    : (c.org_code ? [{code: c.org_code, label: c.org_label || c.org_code}] : []);
}

// For a portal member with no contact file yet -- pre-fill the org picker
// from their actual portal org membership(s) rather than starting empty,
// same idea as pmEditModal's old _pmApplyPortalOrgLocks (minus the "locked"
// tag styling, which this simpler picker doesn't have).
function _seedUpEditOrgsFromPortal(username) {
  return (_portalMembersCache || [])
    .filter(m => m.username === username && m.org_name)
    .map(m => ({code: m.org_name, label: m.org_title || m.org_name}));
}

// Blank/prefilled field values for a contact that doesn't exist yet --
// renderUserPanel's edit-mode template reads from this (via `ec`) instead of
// `c` when creating, so the same inputs/ids serve both create and update.
function _newContactDefaults(u) {
  const parts = (u.display_name || '').trim().split(/\s+/).filter(Boolean);
  const bestRole = _dedupeContacts(_portalMembersCache || []).find(m => m.username === u.username);
  return {
    id: null,
    first_name: parts[0] || '',
    last_name: parts.slice(1).join(' '),
    email: u.email || '',
    position: '',
    contact_type: (!u.sysadmin && bestRole) ? _capacityToType(bestRole.capacity) : '',
    tel: '',
    mobile: '',
  };
}

function startUserPanelEdit() {
  const c = _userPanelUser && _userPanelUser.contact;
  if (!c) return;
  _upEditOrgs = _seedUpEditOrgs(c);
  _upEditing = true;
  renderUserPanel(_userPanelUser);
}

// Counterpart to startUserPanelEdit for a portal member with no contact file
// yet -- same inline editor, seeded from their portal identity instead of an
// existing contact. Replaces the old "Add contact record" button opening
// pmEditModal.
function startUserPanelEditNew() {
  const u = _userPanelUser;
  if (!u || u.contact) return;
  _upEditOrgs = _seedUpEditOrgsFromPortal(u.username);
  _upEditing = true;
  renderUserPanel(u);
}

function cancelUserPanelEdit() {
  _upEditing = false;
  renderUserPanel(_userPanelUser);
}

function _upOrgRenderTags() {
  const container = document.getElementById('upOrgTags');
  if (!container) return;
  container.innerHTML = _upEditOrgs.map(o =>
    `<span class="badge bg-secondary d-inline-flex align-items-center gap-1" style="font-size:.8em;white-space:normal;text-align:left">${esc(o.label || o.code)}` +
    `<button type="button" class="btn-close btn-close-white flex-shrink-0" style="font-size:.55em;margin-left:.25em"` +
    ` onclick="_upOrgRemove('${esc(o.code)}')" title="${t('common.remove')}"></button></span>`
  ).join('');
}
function _upOrgRemove(code) {
  _upEditOrgs = _upEditOrgs.filter(o => o.code !== code);
  _upOrgRenderTags();
}
function _upOrgSelect(code, label) {
  if (!code || _upEditOrgs.some(o => o.code === code)) return;
  _upEditOrgs.push({code, label: label || code});
  _upOrgRenderTags();
  const s = document.getElementById('upOrgSearch');
  if (s) s.value = '';
  document.getElementById('upOrgDropdown').classList.add('d-none');
}
function _upOrgSearch(q) { _orgSearchDropdown(q, 'upOrgDropdown', '_upOrgSelect'); }

// Only wired up when _isBlankNew (see renderUserPanel) -- there's no already-
// known identity to conflict with once u.username or c is set, so the check
// only fires for the fully-blank openNewContactPanel flow. Rather than
// copying the matched person's fields into this blank form (which would let
// Save create a second, duplicate contact record for them), this reopens the
// panel on the ALREADY-EXISTING record -- same fix, no duplicate risk, and
// the Portal|File columns immediately reflect who they really are.
// Shared by _upCheckEmailDuplicate and the inbound-attach modal's own
// register-a-new-contact fields -- both run on the main dashboard, which
// already has these two caches loaded, so a local scan is instant and
// needs no server round trip (contrast the admin panel's own check, which
// has neither cache and hits /api/contacts/check-email instead). Unmatched
// file contacts first, then portal members -- same priority pmEditModal
// used.
function _findExistingContactByEmail(email) {
  email = (email || '').trim().toLowerCase();
  if (!email) return null;
  for (const c of (_pmUnmatched || [])) {
    if ((c.email || '').toLowerCase() === email) {
      return { type: 'file', id: c.id,
        label: [c.first_name, c.last_name].filter(Boolean).join(' ') || email,
        org: c.org_label || c.org_code || '' };
    }
  }
  const seen = new Set();
  for (const m of (_portalMembersCache || [])) {
    if ((m.email || '').toLowerCase() !== email || seen.has(m.username)) continue;
    seen.add(m.username);
    return { type: 'portal', username: m.username,
      label: m.contact_name || m.display_name || email,
      org: m.org_title || m.org_name || '' };
  }
  return null;
}

let _upExistingMatch = null;
function _upCheckEmailDuplicate() {
  const emailInput = document.getElementById('upEditEmail');
  const hint = document.getElementById('upEmailHint');
  if (!emailInput || !hint) return;
  const found = _findExistingContactByEmail(emailInput.value);
  _upExistingMatch = found;
  if (found) {
    document.getElementById('upEmailHintMsg').textContent =
      t('contacts.email_duplicate_found').replace('{who}', [found.label, found.org].filter(Boolean).join(' — '));
    hint.classList.remove('d-none');
  } else {
    hint.classList.add('d-none');
  }
}
function _upUseExistingMatch() {
  if (!_upExistingMatch) return;
  const m = _upExistingMatch;
  _upExistingMatch = null;
  if (m.type === 'portal') openUserPanel(m.username, true);
  else openFileContactPanel(m.id, true);
}
function _upDismissEmailHint() {
  document.getElementById('upEmailHint')?.classList.add('d-none');
  _upExistingMatch = null;
}

// Keeps the collapsed dropdown button's label in sync with whichever role
// checkboxes are currently ticked (see the Role row in renderUserPanel).
function _upUpdateContactTypeLabel() {
  const menu = document.getElementById('upEditContactTypeMenu');
  const label = document.getElementById('upEditContactTypeLabel');
  if (!menu || !label) return;
  const checked = Array.from(menu.querySelectorAll('input:checked'));
  label.textContent = checked.length ? checked.map(cb => cb.dataset.label).join(', ') : '—';
}

// c may be null here (creating a brand-new contact record via
// startUserPanelEditNew) -- payload.id stays undefined in that case, which
// /api/contacts/save treats as a create rather than an update.
async function saveUserPanelEdit() {
  const u = _userPanelUser;
  if (!u) return;
  const c = u.contact;
  if (!_upEditOrgs.length) {
    show('upEditStatus').textContent = t('contacts.select_org_required');
    document.getElementById('upOrgSearch')?.focus();
    return;
  }
  const payload = {
    id:           c ? c.id : undefined,
    org_codes:    _upEditOrgs.map(({code, label}) => ({code, label})),
    org_code:     _upEditOrgs[0].code,
    org_label:    _upEditOrgs[0].label,
    email:        show('upEditEmail').value,
    first_name:   show('upEditFirstName').value.trim(),
    last_name:    show('upEditLastName').value.trim(),
    position:     show('upEditPosition').value.trim(),
    contact_type: Array.from(document.querySelectorAll('#upEditContactTypeMenu input:checked')).map(cb => cb.value).join(','),
    tel:          show('upEditTel').value.trim(),
    mobile:       show('upEditMobile').value.trim(),
  };
  show('upEditStatus').textContent = t('common.saving');
  const resp = await fetch(API_BASE + 'api/contacts/save', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload),
  });
  const data = await resp.json();
  if (data.error) { show('upEditStatus').textContent = data.error; return; }

  _applyContactSaveResult(data, u.username, c ? c.id : null);
  u.contact = data;
  _upEditing = false;
  renderUserPanel(u);
}

function renderUserPanel(u) {
  _userPanelUser = u;
  // Whether this person has an actual CKAN account at all -- false for a
  // File Contact opened via openFileContactPanel (synthetic u with
  // username: null). Gates every portal-only section: the state/sysadmin
  // badges, the Portal column in Info/Organizations, and the whole Portal
  // (registered/last active/datasets/edits) section further down.
  const _hasPortal = !!u.username;
  const fmt = s => {
    if (!s) return '—';
    const d = new Date(s);
    return isNaN(d) ? s : d.toLocaleDateString('el-GR', {year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  };
  // Same three-way mapping (active/pending/deleted) the Contacts list uses
  // (STATE_BADGE_CLS/STATE_BADGE) -- this used to only distinguish active
  // vs. everything else, so "Pending" showed as a plain gray badge here
  // instead of the same orange it gets in the list.
  const stateCls = STATE_BADGE_CLS[u.state] || 'bg-secondary';
  // Prefer the name on file over the portal account's own display name — the
  // CKAN profile is often a romanized username, the contact file has the real name.
  const _fileName = u.contact ? `${u.contact.first_name || ''} ${u.contact.last_name || ''}`.trim() : '';
  document.getElementById('userPanelName').textContent = _fileName || u.display_name || u.username;
  document.getElementById('userPanelUsername').innerHTML = _hasPortal
    ? `@${esc(u.username)}&ensp;<a href="https://data.gov.gr/user/${encodeURIComponent(u.username)}" target="_blank" rel="noopener" class="text-muted" title="${t('catalog.view_on_portal')}"><i class="bi bi-box-arrow-up-right"></i></a>`
    : `<span class="text-muted">${t('userPanel.file_contact_only')}</span>`;

  // _portalMembersCache only gets populated once the Contacts tab has fetched
  // portal members at least once this session -- opening this panel from the
  // org panel (or anywhere else that skips Contacts) left it null, silently
  // showing "No organization" for members who actually have plenty. Unlike
  // _ensureOrgCkanBridge (a background-only warm for a decorative mismatch
  // icon), the org list IS the content here, so re-render once it lands
  // rather than staying silent -- but only if this is still the panel
  // showing this same user by the time it resolves.
  if (!_portalMembersCache && !_pmCacheWarmingForPanel) {
    _pmCacheWarmingForPanel = true;
    loadContactsTab();
    const _waitForPmCache = () => {
      if (_portalMembersCache) {
        _pmCacheWarmingForPanel = false;
        if (_userPanelUser === u) {
          // The edit-mode org picker for a portal member with no contact
          // file yet is seeded from this same cache (_seedUpEditOrgsFromPortal,
          // called by openUserPanel/startUserPanelEditNew before this cache
          // was ready) -- if it came up empty because of that, and nothing's
          // been added to it since, re-seed it now instead of leaving the
          // picker looking like the member has no orgs at all.
          if (_upEditing && !u.contact && !_upEditOrgs.length) _upEditOrgs = _seedUpEditOrgsFromPortal(u.username);
          renderUserPanel(u);
        }
      } else if (_userPanelUser === u) {
        setTimeout(_waitForPmCache, 300);
      } else {
        _pmCacheWarmingForPanel = false;
      }
    };
    setTimeout(_waitForPmCache, 300);
  }
  const _userOrgMemberships = (_portalMembersCache || []).filter(m => m.username === u.username && m.org_name);
  const orgs = _userOrgMemberships.map(m => `<a href="#" class="badge bg-light text-dark border text-decoration-none me-1 mb-1" style="white-space:normal;text-align:left"
        onclick="event.stopPropagation();openOrgPanel('${esc(m.org_name)}');return false;">${esc(m.org_title || m.org_name)}</a>`);

  const orgHtml = orgs.length
    ? `<div>${orgs.join('')}</div>`
    : `<span class="text-muted small">${t('userPanel.no_organization')}</span>`;

  const c = u.contact;

  // Portal's own name, split from display_name (CKAN has no separate first/last fields)
  const _portalNameParts = (u.display_name || '').trim().split(/\s+/).filter(Boolean);
  const _portalFirst = _portalNameParts[0] || '';
  const _portalLast  = _portalNameParts.slice(1).join(' ');
  const _portalFullName = [_portalFirst, _portalLast].filter(Boolean).join(' ');
  const _fileFullName   = c ? [c.first_name, c.last_name].filter(Boolean).join(' ') : '';

  // Effective role: same highest-rank-wins logic as the Contacts table, so it
  // always matches what's shown there rather than just the first org found.
  const _bestRole = _dedupeContacts(_portalMembersCache || []).find(m => m.username === u.username);
  const _uPortalRoleLabel = u.sysadmin ? t('contacts.role_sysadmin') : _portalRoleLabel({ capacity: _bestRole?.capacity });
  const _portalRoleCls   = u.sysadmin ? ROLE_BADGE_CLS.sysadmin : (_bestRole ? (ROLE_BADGE_CLS[_bestRole.capacity] || 'bg-secondary') : 'bg-secondary');

  // Portal role and file contact_type are the same underlying concept, not
  // two different things that happen to overlap -- CONTACT_TYPE_CLS's own
  // keys include "Org Administrator"/"Org Editor"/"Org Member" (the exact
  // strings _capacityToType()/_PORTAL_ROLE_LOOKUP_KEY derive from capacity)
  // alongside file-only categories like "Data Steward". Compared on that
  // shared fixed-English-key vocabulary; sysadmin has no per-org capacity
  // to map from, so it's never flagged as disagreeing with anything.
  const _fileTypeKeys = c && c.contact_type ? c.contact_type.split(',').map(s => s.trim()).filter(Boolean) : [];
  const _portalRoleKey = !u.sysadmin && _bestRole ? _PORTAL_ROLE_LOOKUP_KEY[_bestRole.capacity] : null;
  const _roleDiffers = !!(c && _fileTypeKeys.length && _portalRoleKey && !_fileTypeKeys.includes(_portalRoleKey));
  const _fileTypeHtml = _fileTypeKeys.length
    ? _fileTypeKeys.map(s => `<span class="badge me-1 mb-1 ${CONTACT_TYPE_CLS[s] || 'bg-secondary'}" style="font-size:.7rem">${esc(_CONTACT_TYPE_I18N_KEY[s] ? t(_CONTACT_TYPE_I18N_KEY[s]) : s)}</span>`).join('')
    : '—';

  // Same "genuinely conflicting, not just missing" bar as name/email --
  // only flagged when both sides actually name an org and neither matches
  // the other, mirroring the org panel's own member-card mismatch check.
  // _orgCodeMatches can only resolve an HRMS code to its CKAN slug (or vice
  // versa) once _hrmsLookup/_ckanByHrms are built -- which only happens
  // once the Organizations tab has loaded both the CKAN org list and the
  // HRMS public-org list (_buildCkanLookup). Opening this panel from
  // Contacts without ever visiting Organizations left that bridge unbuilt,
  // so a genuinely-matching org (linked by HRMS code on the file side, CKAN
  // slug on the portal side) looked like a mismatch -- _ensureOrgCkanBridge
  // (below) warms it in the background, but until it's actually ready,
  // silence is the safe default, not a false positive.
  const _orgLookupReady = !!(_hrmsLookup && _ckanByHrms);
  const _fileOrgCodes = (c && c.org_codes) || [];
  // Same HRMS-code-to-CKAN-slug resolution as the org-code matching above --
  // link to the org panel when we can resolve it, otherwise a plain badge.
  const fileOrgHtml = _fileOrgCodes.length
    ? `<div>${_fileOrgCodes.map(o => {
        const ckanSlug = _ckanByHrms ? (_ckanByHrms.get(o.code) || _ckanByHrms.get(o.label)) : null;
        return ckanSlug
          ? `<a href="#" class="badge bg-light text-dark border text-decoration-none me-1 mb-1" style="white-space:normal;text-align:left"
                onclick="event.stopPropagation();openOrgPanel('${esc(ckanSlug)}');return false;">${esc(o.label || o.code)}</a>`
          : `<span class="badge bg-light text-dark border me-1 mb-1" style="white-space:normal;text-align:left">${esc(o.label || o.code)}</span>`;
      }).join('')}</div>`
    : `<span class="text-muted small">${t('userPanel.no_organization')}</span>`;
  const _orgsDiffer = !!(_orgLookupReady && c && _fileOrgCodes.length && _userOrgMemberships.length &&
    !_fileOrgCodes.some(o => _userOrgMemberships.some(m => _orgCodeMatches(o.code || '', m.org_name || ''))));
  if (!_orgLookupReady) _ensureOrgCkanBridge();

  // Name/Email/Role/Tel/Mobile/Organizations/Position all live in ONE table
  // (infoHtml) when a contact file is linked, so the Portal|File columns
  // stay pixel-aligned across the whole thing -- splitting them into
  // separate <table>s per section let each one size its columns slightly
  // differently. A colspan divider row marks where "Organizations" starts.
  // Registered/last-active/datasets/edits have no file-side counterpart at
  // all, so they get their own single-column "Portal" section further down.
  const _nameDiffers  = !!(c && _fileFullName && _portalFullName && _fileFullName.trim().toLowerCase() !== _portalFullName.trim().toLowerCase());
  const _emailDiffers = !!(c && c.email && u.email && c.email !== u.email);
  const _mismatchIcon = (msgKey) => ` <i class="bi bi-exclamation-triangle-fill text-warning" title="${esc(t(msgKey))}"></i>`;
  const _datasetsValue = u.num_packages > 0
    ? `<a href="#" class="fw-semibold text-decoration-none" onclick="loadUserDatasets('${esc(u.username)}');return false;">${u.num_packages} <i class="bi bi-chevron-down small"></i></a>`
    : '0';
  const _editsValue = u.num_edits > 0
    ? `<a href="#" class="fw-semibold text-decoration-none" onclick="loadUserActivity('${esc(u.username)}');return false;">${u.num_edits} <i class="bi bi-chevron-down small"></i></a>`
    : '0';
  const _positionValue = c && c.position ? esc(c.position) : '—';
  const _telValue = c && c.tel ? `<a href="tel:${esc(c.tel)}" class="text-decoration-none">${esc(c.tel)}</a>` : '—';
  const _mobileValue = c && c.mobile ? `<a href="tel:${esc(c.mobile)}" class="text-decoration-none">${esc(c.mobile)}</a>` : '—';
  // Effective contact for edit-mode purposes: the real thing when editing an
  // existing record, or blank/portal-derived defaults when _upEditing was
  // entered via startUserPanelEditNew for someone with no contact file yet
  // (see _newContactDefaults). Only the edit-mode template below reads from
  // `ec` -- view mode still reads straight from `c`.
  const ec = c || (_upEditing ? _newContactDefaults(u) : null);
  const _editTypeKeys = ec ? (ec.contact_type || '').split(',').map(s => s.trim()).filter(Boolean) : [];
  // No anchor identity at all (openNewContactPanel) -- the only case where
  // typing an email that already belongs to someone is actually ambiguous
  // enough to warn about. Once u.username or c is set, we already know
  // exactly who this record is for.
  const _isBlankNew = _upEditing && !c && !u.username;
  // A native <select multiple size="7"> always renders all 7 rows open,
  // which is a lot of vertical space for a field that's usually one or two
  // values -- a checkbox dropdown collapses to a single line, only
  // expanding while it's actually being changed.
  const _contactTypeMenuHtml = _CONTACT_TYPE_OPTIONS.map((o, i) => o
    ? `<div class="form-check">
         <input class="form-check-input" type="checkbox" value="${esc(o.value)}" data-label="${esc(t(o.key))}"
                id="upEditCt${i}" ${_editTypeKeys.includes(o.value) ? 'checked' : ''} onchange="_upUpdateContactTypeLabel()">
         <label class="form-check-label small" for="upEditCt${i}">${esc(t(o.key))}</label>
       </div>`
    : `<hr class="dropdown-divider my-1">`
  ).join('');
  const _contactTypeLabel = _editTypeKeys.length
    ? esc(_editTypeKeys.map(k => _CONTACT_TYPE_I18N_KEY[k] ? t(_CONTACT_TYPE_I18N_KEY[k]) : k).join(', '))
    : '—';
  // One unified table regardless of _hasPortal -- a File Contact with no
  // linked CKAN account just shows its Portal column fields as empty ('—'),
  // the same way a linked contact shows an empty File column when some file
  // field is blank. _portalFullName/u.email/_uPortalRoleLabel/orgHtml are
  // already '—'/blank-safe when u.username is null (no portal member row
  // matches a null username), so no extra branching is needed here.
  // Edit mode also has to work with no `c` at all (creating a brand-new
  // record via startUserPanelEditNew), so it's gated on _upEditing first,
  // falling back to the read-only view only when a contact actually exists.
  const infoHtml = _upEditing ? `
    <div class="mb-3">
      <div class="fw-semibold small text-uppercase text-muted mb-2">${t('userPanel.info')}</div>
      <table class="table table-sm table-borderless mb-0" style="font-size:.85rem;table-layout:fixed;width:100%">
        <thead><tr class="text-muted">
          <th style="width:20%"></th>
          <th style="width:35%"><i class="bi bi-globe2 me-1"></i>${t('userPanel.portal')}</th>
          <th style="width:45%">
            <div class="d-flex align-items-center justify-content-between">
              <span><i class="bi bi-file-earmark-person me-1"></i>${t('userPanel.file')}</span>
              <span class="d-flex gap-1">
                <button class="btn btn-outline-success btn-sm py-0 px-1" title="${t('contacts.save')}"
                  onclick="saveUserPanelEdit()"><i class="bi bi-check-lg"></i></button>
                <button class="btn btn-outline-secondary btn-sm py-0 px-1" title="${t('contacts.cancel')}"
                  onclick="cancelUserPanelEdit()"><i class="bi bi-x-lg"></i></button>
              </span>
            </div>
          </th>
        </tr></thead>
        <tbody>
          <tr>
            <td class="text-muted">${t('contacts.col_name')}</td>
            <td>${_portalFullName ? esc(_portalFullName) : '—'}</td>
            <td>
              <input type="text" class="form-control form-control-sm mb-1" id="upEditFirstName" placeholder="${esc(t('contacts.first_name'))}" value="${esc(ec.first_name || '')}">
              <input type="text" class="form-control form-control-sm" id="upEditLastName" placeholder="${esc(t('contacts.last_name'))}" value="${esc(ec.last_name || '')}">
            </td>
          </tr>
          <tr>
            <td class="text-muted">${t('contacts.email')}</td>
            <td>${u.email ? `<a href="mailto:${esc(u.email)}">${esc(u.email)}</a>` : '—'}</td>
            <td>
              <input type="email" class="form-control form-control-sm" id="upEditEmail" value="${esc(ec.email || '')}"
                     ${_isBlankNew ? 'onblur="_upCheckEmailDuplicate()"' : ''}>
              ${_isBlankNew ? `<div id="upEmailHint" class="d-none mt-1 p-2 rounded border border-warning-subtle bg-warning-subtle small">
                <span id="upEmailHintMsg"></span>
                <div class="mt-1">
                  <button type="button" class="btn btn-warning btn-sm py-0 px-2 me-1" onclick="_upUseExistingMatch()">${t('contacts.fill_from_existing')}</button>
                  <button type="button" class="btn btn-outline-secondary btn-sm py-0 px-2" onclick="_upDismissEmailHint()">${t('contacts.ignore')}</button>
                </div>
              </div>` : ''}
            </td>
          </tr>
          <tr>
            <td class="text-muted">${t('contacts.col_role')}</td>
            <td><span class="badge ${_portalRoleCls}">${esc(_uPortalRoleLabel)}</span></td>
            <td>
              <div class="dropdown">
                <button class="btn btn-outline-secondary btn-sm form-select-sm w-100 text-start text-truncate dropdown-toggle"
                        type="button" data-bs-toggle="dropdown" data-bs-auto-close="outside" data-bs-strategy="fixed" aria-expanded="false">
                  <span id="upEditContactTypeLabel">${_contactTypeLabel}</span>
                </button>
                <div class="dropdown-menu p-2" id="upEditContactTypeMenu" style="max-height:220px;overflow-y:auto">${_contactTypeMenuHtml}</div>
              </div>
            </td>
          </tr>
          <tr>
            <td class="text-muted">${t('contacts.tel')}</td>
            <td class="text-muted">—</td>
            <td><input type="text" class="form-control form-control-sm" id="upEditTel" value="${esc(ec.tel || '')}"></td>
          </tr>
          <tr>
            <td class="text-muted">${t('contacts.mobile')}</td>
            <td class="text-muted">—</td>
            <td><input type="text" class="form-control form-control-sm" id="upEditMobile" value="${esc(ec.mobile || '')}"></td>
          </tr>
          <tr><td colspan="3" class="pt-3 pb-1"><span class="fw-semibold small text-uppercase text-muted">${t('contacts.organizations')}</span></td></tr>
          <tr>
            <td class="text-muted"></td>
            <td>${orgHtml}</td>
            <td>
              <div id="upOrgTags" class="d-flex flex-wrap gap-1 mb-1"></div>
              <div class="position-relative">
                <input type="text" class="form-control form-control-sm" id="upOrgSearch" autocomplete="off"
                       placeholder="${esc(t('contacts.add_org_placeholder'))}"
                       oninput="_upOrgSearch(this.value)" onfocus="_upOrgSearch(this.value)"
                       onblur="setTimeout(()=>document.getElementById('upOrgDropdown').classList.add('d-none'),150)">
                <ul class="list-group shadow-sm position-absolute w-100 d-none" id="upOrgDropdown"
                    style="z-index:1060;max-height:180px;overflow-y:auto;top:100%"></ul>
              </div>
            </td>
          </tr>
          <tr>
            <td class="text-muted">${t('contacts.position')}</td>
            <td class="text-muted">—</td>
            <td><input type="text" class="form-control form-control-sm" id="upEditPosition" value="${esc(ec.position || '')}"></td>
          </tr>
        </tbody>
      </table>
      <div id="upEditStatus" class="text-danger small mt-1"></div>
    </div>` : `
    <div class="mb-3">
      <div class="fw-semibold small text-uppercase text-muted mb-2">${t('userPanel.info')}</div>
      <table class="table table-sm table-borderless mb-0" style="font-size:.85rem;table-layout:fixed;width:100%">
        <thead><tr class="text-muted">
          <th style="width:20%"></th>
          <th style="width:35%"><i class="bi bi-globe2 me-1"></i>${t('userPanel.portal')}</th>
          <th style="width:45%">
            <div class="d-flex align-items-center justify-content-between">
              <span><i class="bi bi-file-earmark-person me-1"></i>${t('userPanel.file')}</span>
              <span class="d-flex gap-1">
                ${c ? `
                <button class="btn btn-outline-secondary btn-sm py-0 px-1" title="${t('common.edit')}"
                  onclick="startUserPanelEdit()"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-outline-danger btn-sm py-0 px-1" title="${t('common.delete')}"
                  onclick="deletePmContactRecord(${c.id}, ${_hasPortal ? `'${esc(u.username)}'` : 'null'})"><i class="bi bi-trash"></i></button>
                ` : `
                <button class="btn btn-outline-primary btn-sm py-0 px-1" title="${t('userPanel.add_contact_record')}"
                  onclick="startUserPanelEditNew()"><i class="bi bi-person-plus"></i></button>
                `}
              </span>
            </div>
          </th>
        </tr></thead>
        <tbody>
          <tr>
            <td class="text-muted">${t('contacts.col_name')}${_nameDiffers ? _mismatchIcon('userPanel.name_mismatch') : ''}</td>
            <td>${_portalFullName ? esc(_portalFullName) : '—'}</td>
            <td>${_fileFullName ? esc(_fileFullName) : '—'}</td>
          </tr>
          <tr>
            <td class="text-muted">${t('contacts.email')}${_emailDiffers ? _mismatchIcon('userPanel.email_mismatch') : ''}</td>
            <td>${u.email ? `<a href="mailto:${esc(u.email)}">${esc(u.email)}</a>` : '—'}</td>
            <td>${c && c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '—'}</td>
          </tr>
          <tr>
            <td class="text-muted">${t('contacts.col_role')}${_roleDiffers ? _mismatchIcon('userPanel.role_mismatch') : ''}</td>
            <td><span class="badge ${_portalRoleCls}">${esc(_uPortalRoleLabel)}</span></td>
            <td>${_fileTypeHtml}</td>
          </tr>
          <tr>
            <td class="text-muted">${t('contacts.tel')}</td>
            <td class="text-muted">—</td>
            <td>${_telValue}</td>
          </tr>
          <tr>
            <td class="text-muted">${t('contacts.mobile')}</td>
            <td class="text-muted">—</td>
            <td>${_mobileValue}</td>
          </tr>
          <tr><td colspan="3" class="pt-3 pb-1"><span class="fw-semibold small text-uppercase text-muted">${t('contacts.organizations')}</span></td></tr>
          <tr>
            <td class="text-muted">${_orgsDiffer ? _mismatchIcon('userPanel.org_mismatch') : ''}</td>
            <td>${orgHtml}</td>
            <td>${fileOrgHtml}</td>
          </tr>
          <tr>
            <td class="text-muted">${t('contacts.position')}</td>
            <td class="text-muted">—</td>
            <td>${_positionValue}</td>
          </tr>
        </tbody>
      </table>
    </div>`;

  // Registered/last-active/datasets/edits are portal-account stats -- no
  // file-side counterpart, and no meaning at all for a File Contact with no
  // CKAN account, so this whole section is skipped when !_hasPortal.
  const portalStatsHtml = _hasPortal ? `
    <div class="mt-3 pt-3 border-top">
      <div class="fw-semibold small text-uppercase text-muted mb-2"><i class="bi bi-globe2 me-1"></i>${t('userPanel.portal')}</div>
      <dl class="row g-1 small mb-0">
        <dt class="col-5 text-muted fw-normal mb-1">${t('userPanel.registered')}</dt>
        <dd class="col-7 mb-1">${fmt(u.created)}</dd>
        <dt class="col-5 text-muted fw-normal mb-1">${t('userPanel.last_active')}</dt>
        <dd class="col-7 mb-1">${fmt(u.last_active)}</dd>
        <dt class="col-5 text-muted fw-normal mb-1">${t('userPanel.datasets')}</dt>
        <dd class="col-7 mb-1">${_datasetsValue}</dd>
        <dt class="col-5 text-muted fw-normal mb-1">${t('userPanel.edits')}</dt>
        <dd class="col-7 mb-1">${_editsValue}</dd>
      </dl>
    </div>` : '';

  document.getElementById('userPanelBody').innerHTML = `
    ${_hasPortal ? `<div class="d-flex align-items-center gap-2 mb-3">
      <span class="badge ${stateCls}">${esc(_contactStateLabel(u.state))}</span>
      ${u.sysadmin ? `<span class="badge bg-danger">${t('contacts.role_sysadmin')}</span>` : ''}
    </div>` : ''}
    ${infoHtml}
    ${portalStatsHtml}
    <div id="userPanelActivitySection" class="d-none mt-3 pt-3 border-top">
      <div class="fw-semibold small text-uppercase text-muted mb-2">${t('userPanel.recent_activity')}</div>
      <div id="userPanelActivityList">
        <div class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div></div>
      </div>
    </div>
    <div id="userPanelDatasetsSection" class="d-none mt-3 pt-3 border-top">
      <div class="fw-semibold small text-uppercase text-muted mb-2">${t('userPanel.datasets')}</div>
      <div id="userPanelDatasetsList">
        <div class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div></div>
      </div>
    </div>
    ${u.about ? `<div class="mt-3 pt-3 border-top"><div class="fw-semibold small text-uppercase text-muted mb-2">${t('userPanel.about')}</div><p class="small text-muted mb-0">${esc(u.about)}</p></div>` : ''}
  `;
  if (_upEditing) _upOrgRenderTags();
}

let _userDatasetsLoaded = null;
let _userActivityLoaded = null;

async function loadUserDatasets(username) {
  const section = document.getElementById('userPanelDatasetsSection');
  const list    = document.getElementById('userPanelDatasetsList');
  if (!section || !list) return;

  // Toggle off if already showing for same user
  if (_userDatasetsLoaded === username && !section.classList.contains('d-none')) {
    section.classList.add('d-none');
    return;
  }
  _userDatasetsLoaded = username;
  section.classList.remove('d-none');
  list.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div></div>';

  try {
    const data = await fetch(API_BASE + 'api/portal-user/' + encodeURIComponent(username) + '/datasets').then(r => r.json());
    if (data.error) throw new Error(data.error);
    const ds = data.datasets || [];
    if (!ds.length) {
      list.innerHTML = `<p class="text-muted small mb-0">${t('userPanel.no_datasets')}</p>`;
      return;
    }
    list.innerHTML = ds.map(d => `
      <div class="py-2 border-bottom">
        <div class="d-flex align-items-center gap-2">
          <a href="#" onclick="openDatasetPanel('${esc(d.name)}');return false;"
             class="small fw-semibold text-decoration-none flex-grow-1" style="word-break:break-word">${esc(d.title)}</a>
          ${d.private ? `<span class="badge bg-warning text-dark text-nowrap" style="font-size:.65rem"><i class="bi bi-lock-fill me-1"></i>${t('userPanel.private')}</span>` : ''}
        </div>
        <div class="d-flex gap-2 mt-1 text-muted" style="font-size:.72rem">
          ${d.org ? `<span><i class="bi bi-building me-1"></i>${esc(d.org)}</span>` : ''}
          <span><i class="bi bi-files me-1"></i>${t('userPanel.resources_count').replace('{n}', d.num_resources)}</span>
          ${d.modified ? `<span>${relativeDate(d.modified)}</span>` : ''}
        </div>
      </div>`).join('');
  } catch (e) {
    list.innerHTML = `<p class="text-danger small mb-0">${t('userPanel.failed_load_datasets').replace('{msg}', esc(e.message))}</p>`;
  }
}

async function loadUserActivity(username) {
  const section = document.getElementById('userPanelActivitySection');
  const list    = document.getElementById('userPanelActivityList');
  if (!section || !list) return;

  if (_userActivityLoaded === username && !section.classList.contains('d-none')) {
    section.classList.add('d-none');
    return;
  }
  _userActivityLoaded = username;
  section.classList.remove('d-none');
  list.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div></div>';

  try {
    const data = await fetch(API_BASE + 'api/portal-user/' + encodeURIComponent(username) + '/activity').then(r => r.json());
    if (data.error) throw new Error(data.error);
    const acts = data.activities || [];
    if (!acts.length) {
      list.innerHTML = `<p class="text-muted small mb-0">${t('userPanel.no_activity')}</p>`;
      return;
    }
    const typeLabel = at => {
      const map = {
        'new package':      'userPanel.act_new_package',
        'changed package':  'userPanel.act_changed_package',
        'deleted package':  'userPanel.act_deleted_package',
        'new resource':     'userPanel.act_new_resource',
        'changed resource': 'userPanel.act_changed_resource',
        'deleted resource': 'userPanel.act_deleted_resource',
        'new user':         'userPanel.act_new_user',
        'changed user':     'userPanel.act_changed_user',
      };
      return map[at] ? t(map[at]) : at;
    };
    list.innerHTML = acts.map(a => `
      <div class="py-2 border-bottom">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <span class="small fw-semibold">${esc(typeLabel(a.activity_type))}</span>
          ${a.timestamp ? `<span class="text-muted text-nowrap" style="font-size:.72rem">${relativeDate(a.timestamp)}</span>` : ''}
        </div>
        ${a.package_name ? `
        <div class="d-flex align-items-center gap-2">
          <a href="#" onclick="openDatasetPanel('${esc(a.package_name)}');return false;"
              class="text-muted text-decoration-none flex-grow-1" style="font-size:.8rem;word-break:break-word">${esc(a.package_title || a.package_name)}</a>
          ${a.private ? `<span class="badge bg-warning text-dark text-nowrap" style="font-size:.62rem"><i class="bi bi-lock-fill me-1"></i>${t('userPanel.private')}</span>` : ''}
        </div>` : ''}
      </div>`).join('');
  } catch (e) {
    list.innerHTML = `<p class="text-danger small mb-0">${t('userPanel.failed_load_activity').replace('{msg}', esc(e.message))}</p>`;
  }
}

function renderOrgPanel(data) {
  const org = data.org;
  document.getElementById('orgDetailTitle').textContent = org.title;
  const orgIdLink = document.getElementById('orgDetailIdLink');
  orgIdLink.innerHTML = `${esc(org.name)}&ensp;<a href="https://data.gov.gr/organization/${encodeURIComponent(org.name)}" target="_blank" rel="noopener" class="text-muted" title="${t('org_detail.view')}"><i class="bi bi-box-arrow-up-right"></i></a>`;
  orgIdLink.classList.remove('d-none');

  const imgHtml = org.image_url
    ? `<img src="${org.image_url}" class="d-block mb-3" style="max-height:72px;max-width:180px;object-fit:contain" onerror="this.remove()">`
    : '';

  const descHtml = org.description
    ? `<p class="text-muted small mb-3">${org.description.replace(/</g,'&lt;').replace(/\n/g,'<br>')}</p>`
    : '';

  const createdHtml = org.created
    ? `<div class="text-end">
         <div class="small text-muted">${t('org_detail.member_since')}</div>
         <div class="small fw-semibold">${new Date(org.created).toLocaleDateString('el-GR')}</div>
       </div>`
    : '';

  const datasets = data.recent_datasets || [];
  const datasetsHtml = datasets.length
    ? `<h6 class="fw-semibold mt-4 mb-2">Recent Datasets</h6>
       <div class="list-group list-group-flush">
         ${datasets.map(d => `
           <div class="list-group-item px-0 py-2">
             <div class="d-flex justify-content-between align-items-start gap-2">
               <a href="#" onclick="openDatasetPanel('${esc(d.name)}');return false;"
                  class="small fw-semibold text-decoration-none flex-grow-1"
                  style="word-break:break-word">${d.title.replace(/</g,'&lt;')}</a>
               <span class="badge bg-secondary text-nowrap">${d.num_resources} res.</span>
             </div>
             <div class="text-muted mt-1" style="font-size:.72rem">${relativeDate(d.metadata_modified)}</div>
           </div>`).join('')}
       </div>`
    : `<p class="text-muted small mt-3">${t('userPanel.no_recent_datasets')}</p>`;

  // Role/state/comm-status badge colors all reuse the same top-level maps
  // everything else in the app uses (ROLE_BADGE_CLS/STATE_BADGE_CLS/
  // STATUS_BADGE) instead of keeping their own local copies -- this panel
  // used to have its own near-identical copies, which is exactly how the
  // "Pending" badge silently drifted to plain gray here while staying
  // orange in the Contacts list.
  const STATE_ICON  = { active: 'bi-check-circle-fill', deleted: 'bi-x-circle-fill', pending: 'bi-hourglass-split' };
  const members = (org.members || []).sort((a, b) => {
    const order = { admin: 0, editor: 1, member: 2 };
    return (order[a.capacity] ?? 3) - (order[b.capacity] ?? 3);
  });
  const PENDING_STATUSES = new Set(['Initial Contact', 'Intermediate Contact']);
  const cs = data.comms_summary || {};
  const byStatus = cs.by_status || {};
  const statusOrder = ['Initial Contact', 'Intermediate Contact', 'Positive Response', 'Negative Response', 'No Response'];
  const commsHtml = cs.total > 0
    ? `<h6 class="fw-semibold mt-4 mb-2"><i class="bi bi-envelope me-1 text-primary"></i>Communications</h6>
       <div class="d-flex flex-wrap gap-2 mb-1">
         ${statusOrder.filter(s => byStatus[s]).map(s => `
           <span class="badge ${STATUS_BADGE[s]} d-flex align-items-center gap-1${PENDING_STATUSES.has(s) ? '' : ''}">
             ${PENDING_STATUSES.has(s) ? '<i class="bi bi-clock-history"></i>' : ''}
             ${s} <span class="ms-1 fw-bold">${byStatus[s]}</span>
           </span>`).join('')}
       </div>
       ${cs.latest_date ? `<div class="text-muted" style="font-size:.75rem">Last contact: ${cs.latest_date}</div>` : ''}`
    : `<h6 class="fw-semibold mt-4 mb-2"><i class="bi bi-envelope me-1 text-primary"></i>Communications</h6>
       <p class="text-muted small">No communications recorded.</p>`;

  // Clicking through to a member's own panel needs the same "contacts" access
  // that panel's own data (/api/portal-user) is gated behind -- without this
  // check an orgs/datasets-only user could click a row here and just get an
  // error where the panel used to load.
  const canOpenMember = !ALLOWED_TABS || ALLOWED_TABS.includes('contacts');
  const membersHtml = `
    <h6 class="fw-semibold mt-4 mb-2"><i class="bi bi-person-badge me-1 text-primary"></i>Portal Members</h6>
    ${members.length
      ? `<div class="list-group list-group-flush">
           ${members.map(m => {
             const state     = m.state || 'active';
             const stateCls  = STATE_BADGE_CLS[state]  || 'bg-secondary';
             const stateIcon = STATE_ICON[state]   || 'bi-circle';
             const rowStyle  = [state !== 'active' ? 'opacity:.7' : '', canOpenMember ? 'cursor:pointer' : ''].filter(Boolean).join(';');
             return `
             <div class="list-group-item px-0 py-2 d-flex justify-content-between align-items-center gap-2${canOpenMember ? ' list-group-item-action' : ''}"
                  style="${rowStyle}"
                  ${canOpenMember ? `onclick="openUserPanel('${esc(m.name)}')"` : ''}>
               <div>
                 <div class="small fw-semibold">${m.display_name.replace(/</g,'&lt;')}</div>
                 <div class="text-muted" style="font-size:.72rem">@${m.name.replace(/</g,'&lt;')}</div>
               </div>
               <div class="d-flex gap-1 flex-wrap justify-content-end">
                 <span class="badge ${ROLE_BADGE_CLS[m.capacity] || 'bg-secondary'}">${m.capacity}</span>
                 <span class="badge ${stateCls}" title="Account status: ${state}">
                   <i class="bi ${stateIcon} me-1"></i>${state}
                 </span>
               </div>
             </div>`;
           }).join('')}
         </div>`
      : `<p class="text-muted small">${t('userPanel.no_members')}</p>`
    }`;

  document.getElementById('orgDetailBody').innerHTML = `
    ${imgHtml}
    <div class="d-flex align-items-start gap-3 mb-3">
      <div>
        <div class="fs-2 fw-bold text-primary lh-1">${fmt(org.package_count)}</div>
        <div class="text-muted small">${t('org_detail.datasets')}</div>
      </div>
      ${createdHtml}
    </div>
    ${descHtml}
    ${datasetsHtml}
    ${commsHtml}
    ${membersHtml}`;
}

// ── Manual trigger ───────────────────────────────────────────────────────────
async function triggerCheck() {
  showSpinner(true);
  try {
    await fetch(API_BASE + 'api/trigger-check', { method: 'POST' });
    // Wait 6s for the background health check to complete, then reload
    await new Promise(r => setTimeout(r, 6000));
    _healthLoaded = false;
    _statsLoaded  = false;
    await loadOverview();
    show('lastChecked').textContent = new Date().toLocaleString('el-GR');
  } catch (e) {
    alert(t('error') + ' ' + e.message);
  } finally {
    showSpinner(false);
  }
}

let _changePasswordModal = null;

function openChangePasswordModal() {
  if (!_changePasswordModal) _changePasswordModal = new bootstrap.Modal(document.getElementById('changePasswordModal'));
  document.getElementById('pwCurrent').value = '';
  document.getElementById('pwNew').value = '';
  document.getElementById('pwConfirm').value = '';
  document.getElementById('pwError').classList.add('d-none');
  document.getElementById('pwSuccess').classList.add('d-none');
  document.getElementById('pwSaveBtn').disabled = false;
  _changePasswordModal.show();
  setTimeout(() => document.getElementById('pwCurrent').focus(), 400);
}

async function submitChangePassword() {
  const btn = document.getElementById('pwSaveBtn');
  if (btn.disabled) return;
  const current_password  = document.getElementById('pwCurrent').value;
  const new_password      = document.getElementById('pwNew').value;
  const new_password2     = document.getElementById('pwConfirm').value;
  const errEl = document.getElementById('pwError');
  const okEl  = document.getElementById('pwSuccess');
  errEl.classList.add('d-none');
  okEl.classList.add('d-none');

  if (new_password.length < 8) {
    errEl.textContent = t('pw.err_length');
    errEl.classList.remove('d-none');
    return;
  }
  if (new_password !== new_password2) {
    errEl.textContent = t('pw.err_mismatch');
    errEl.classList.remove('d-none');
    return;
  }

  btn.disabled = true;
  try {
    const resp = await fetch(`${API_BASE}api/account/change-password`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({current_password, new_password, new_password2}),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || t('pw.err_generic'));
    okEl.classList.remove('d-none');
    setTimeout(() => _changePasswordModal.hide(), 1200);
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.remove('d-none');
  } finally {
    btn.disabled = false;
  }
}

if (typeof webauthnSupported === 'function' && webauthnSupported()) {
  document.getElementById('managePasskeysNavItem')?.classList.remove('d-none');
}

const _PASSKEY_URLS = {
  begin:    `${API_BASE}api/account/passkeys/register/begin`,
  complete: `${API_BASE}api/account/passkeys/register/complete`,
};

let _managePasskeysModal = null;

function openManagePasskeysModal() {
  if (!_managePasskeysModal) _managePasskeysModal = new bootstrap.Modal(document.getElementById('managePasskeysModal'));
  document.getElementById('passkeyNickname').value = '';
  document.getElementById('passkeyAddError').classList.add('d-none');
  document.getElementById('passkeyAddBtn').disabled = false;
  const unsupported = !webauthnSupported();
  document.getElementById('passkeyUnsupported').classList.toggle('d-none', !unsupported);
  document.getElementById('passkeyAddBtn').classList.toggle('d-none', unsupported);
  document.getElementById('passkeyNickname').classList.toggle('d-none', unsupported);
  _managePasskeysModal.show();
  loadPasskeysList();
}

async function loadPasskeysList() {
  const el = document.getElementById('passkeysList');
  el.innerHTML = `<div class="text-center py-3 text-muted"><div class="spinner-border spinner-border-sm"></div></div>`;
  try {
    const passkeys = await fetch(`${API_BASE}api/account/passkeys`).then(r => r.json());
    if (!passkeys.length) {
      el.innerHTML = `<p class="text-muted small mb-0" data-i18n="passkey.none">You haven't added any passkeys yet.</p>`;
      return;
    }
    el.innerHTML = passkeys.map(p => `
      <div class="d-flex justify-content-between align-items-center border rounded px-3 py-2 mb-2">
        <div>
          <div class="fw-semibold small">${esc(p.nickname)}</div>
          <div class="text-muted" style="font-size:.75rem">
            ${t('passkey.added')} ${relativeDate(p.created_at)}${p.last_used_at ? ' · ' + t('passkey.last_used') + ' ' + relativeDate(p.last_used_at) : ''}
          </div>
        </div>
        <button class="btn btn-outline-danger btn-sm py-0 px-2" onclick="deletePasskey(${p.id})"><i class="bi bi-trash"></i></button>
      </div>`).join('');
  } catch (e) {
    el.innerHTML = `<div class="alert alert-danger mb-0">${t('error')} ${esc(e.message)}</div>`;
  }
}

async function submitAddPasskey() {
  const btn = document.getElementById('passkeyAddBtn');
  if (btn.disabled) return;
  const nickname = document.getElementById('passkeyNickname').value.trim() || 'Passkey';
  const errEl = document.getElementById('passkeyAddError');
  errEl.classList.add('d-none');
  btn.disabled = true;
  const originalHtml = btn.innerHTML;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>${esc(t('passkey.adding'))}`;
  try {
    await registerPasskey(nickname, _PASSKEY_URLS);
    document.getElementById('passkeyNickname').value = '';
    await loadPasskeysList();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.remove('d-none');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

async function deletePasskey(id) {
  if (!confirm(t('passkey.delete_confirm'))) return;
  try {
    const resp = await fetch(`${API_BASE}api/account/passkeys/${id}/delete`, { method: 'POST' });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || t('pw.err_generic'));
    await loadPasskeysList();
  } catch (e) {
    alert(e.message);
  }
}

let _editNameModal = null;

function openEditNameModal() {
  if (!_editNameModal) _editNameModal = new bootstrap.Modal(document.getElementById('editNameModal'));
  document.getElementById('nameInput').value = document.getElementById('navUserName')?.textContent.trim() || '';
  document.getElementById('nameError').classList.add('d-none');
  document.getElementById('nameSuccess').classList.add('d-none');
  document.getElementById('nameSaveBtn').disabled = false;
  _editNameModal.show();
  setTimeout(() => document.getElementById('nameInput').focus(), 400);
}

async function submitEditName() {
  const btn = document.getElementById('nameSaveBtn');
  if (btn.disabled) return;
  const name  = document.getElementById('nameInput').value.trim();
  const errEl = document.getElementById('nameError');
  const okEl  = document.getElementById('nameSuccess');
  errEl.classList.add('d-none');
  okEl.classList.add('d-none');

  if (!name) {
    errEl.textContent = t('name.err_required');
    errEl.classList.remove('d-none');
    return;
  }

  btn.disabled = true;
  try {
    const resp = await fetch(`${API_BASE}api/account/update-name`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name}),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || t('name.err_generic'));
    const navName = document.getElementById('navUserName');
    if (navName) navName.textContent = data.name;
    okEl.classList.remove('d-none');
    setTimeout(() => _editNameModal.hide(), 1200);
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.remove('d-none');
  } finally {
    btn.disabled = false;
  }
}

// ── Contacts tab ─────────────────────────────────────────────────────────────
function _b64enc(obj) {
  // Encode any object as a URL-safe base64 string so WAF rules cannot inspect field values.
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  bytes.forEach(b => bin += String.fromCharCode(b));
  return encodeURIComponent(btoa(bin));
}

let _allContacts     = null;   // raw local DB contacts
let _portalRows      = null;   // normalised portal-member rows (persists across reloads)
let _allUnified      = null;   // merged display list; null = needs rebuild
let _tabContactRows  = [];
let _contactsSortCol = 'name';
let _contactsSortDir = 'asc';

function _capacityToType(cap) {
  return { admin: 'Org Administrator', editor: 'Org Editor', member: 'Org Member' }[cap] || cap;
}
function _normalisePortalMember(m) {
  return {
    _source:      'portal',
    id:           null,
    org_code:     m.org_code,
    org_label:    m.org_label,
    first_name:   m.display_name || m.username || '',
    last_name:    '',
    position:     m.username ? `@${m.username}` : '',
    contact_type: _capacityToType(m.capacity),
    email:        m.email || '',
    tel:          '',
    mobile:       '',
    _capacity:    m.capacity,
    _state:       m.state || 'active',
  };
}

document.getElementById('contactsTabBtn').addEventListener('click', () => {
  loadContactsTab();
});

let _portalMembersCache = null;
let _pmPollTimer = null;

// ── localStorage cache helpers ────────────────────────────────────────────────
const _PM_CACHE_KEY   = 'pm_cache_v2';
const _PM_STALE_MS    = 30 * 60 * 1000;   // background-refresh after 30 min
const _PM_EXPIRE_MS   = 2  * 60 * 60 * 1000; // discard after 2 h

function _pmSaveCache(members, unmatched) {
  try { localStorage.setItem(_PM_CACHE_KEY, JSON.stringify({ members, unmatched, ts: Date.now() })); } catch (_) {}
}
function _pmSetFetchedAt(ts) {
  const el = document.getElementById('contactsFetchedAt');
  if (el) el.textContent = ts ? t('orgs.fetched') + ' ' + relativeDate(new Date(ts).toISOString()) : '';
}
function _pmReadCache() {
  try {
    const c = JSON.parse(localStorage.getItem(_PM_CACHE_KEY) || 'null');
    if (!c || !Array.isArray(c.members) || Date.now() - c.ts > _PM_EXPIRE_MS) return null;
    return c;
  } catch (_) { return null; }
}

async function loadContactsTab(force = false) {
  // Re-clicking the Contacts tab button always calls this -- when data's
  // already warm, just re-sync the active scope's view (reusing what's
  // loaded) rather than calling filterContactsTab(), which unconditionally
  // resets Portal Members' pagination state and re-fetches from scratch
  // even though nothing about the underlying data changed. That's what
  // made switching to another tab and back re-show the cold-load spinner.
  if (_portalMembersCache && !force) { _contactsSyncActiveScope(); return; }

  if (!force) {
    const cached = _pmReadCache();
    if (cached) {
      _portalMembersCache = cached.members;
      _pmUnmatched = cached.unmatched || [];
      show('contactsReloadBtn').disabled = false;
      _pmSetFetchedAt(cached.ts);
      // This branch also runs as a background warm-up triggered from the
      // Comms tab (see loadComms()'s `if (!_portalMembersCache) loadContactsTab()`),
      // so the Contacts tab may not be visible here.
      if (_isTabActive('tab-contacts')) _contactsSyncActiveScope();
      if (_orgsLoaded) loadContactSummary();
      // Silently refresh in background if stale
      if (Date.now() - cached.ts > _PM_STALE_MS) {
        if (_pmPollTimer) { clearTimeout(_pmPollTimer); _pmPollTimer = null; }
        _pollPortalMembers(0, true);
      }
      return;
    }
  }

  _portalMembersCache = null;
  if (_pmPollTimer) { clearTimeout(_pmPollTimer); _pmPollTimer = null; }
  _pollPortalMembers(0, false, force);
  // _pollPortalMembers only warms _portalMembersCache now (see its own
  // comment) -- with no localStorage cache to fall back on, nothing else
  // would kick off the paginated table's own cold-load/retry/progress-bar
  // handling until that background poll finishes, leaving the table stuck
  // on its static "open this tab" placeholder for the whole wait. Kick it
  // off immediately too; it hits the same _pm_cache and has its own 202
  // retry loop, so it shows real loading progress right away instead.
  if (_isTabActive('tab-contacts')) filterContactsTab();
}

// The slow part of a cold portal-members fetch is one organization_show call
// per CKAN organization; the backend reports {phase: 'members', done, total}
// as those complete so this can be a real progress bar (shared with the
// quality checks' — see _showProgressBar). The brief phase: 'orgs' step
// beforehand (organization_list + user_list) has no meaningful done/total
// of its own -- fall back to the header KPI's own org count as a
// placeholder total instead of leaving the bar hidden for however long that
// step takes. Checked here (re-run on every 5s retry, not just the first
// attempt) rather than once at the very start of the cold-load: on a page
// opened straight to #contacts, this whole chain can fire before
// loadOverview()'s own fetch has resolved, so _kpiOrgCount may still be
// null the very first time -- re-checking on every retry means it's picked
// up as soon as it becomes available instead of being missed for good.
function _updateContactsLoadingProgress(progress) {
  // Both branches count ORGANIZATIONS processed (one organization_show call
  // each), not members loaded -- see t('contacts.progress_unit_orgs') for why
  // that needs to be explicit.
  if (progress && progress.phase === 'members' && progress.total) {
    _showProgressBar('pm', progress.done, progress.total, t('contacts.progress_unit_orgs'));
  } else if (_kpiOrgCount) {
    _showProgressBar('pm', 0, _kpiOrgCount, t('contacts.progress_unit_orgs'));
  }
}

// Purely warms _portalMembersCache (the full raw per-membership list --
// Comms contact picker, org panel, user panel, edit/save syncing all depend
// on holding this in full) plus its localStorage mirror. Deliberately never
// touches #contactsTableBody itself -- the visible table has its own
// independent cold-load/retry/progress handling in loadPortalMembersTab,
// which hits the exact same underlying _pm_cache; having both this function
// AND that one write into the same DOM element raced against each other
// (whichever resolved last won, sometimes leaving a stale row behind).
// Throws a clear "HTTP <status>" error instead of a cryptic JSON-parse
// exception when a response isn't actually JSON -- e.g. Flask-Limiter's
// default 429 response is an HTML page, and blindly calling resp.json()
// on it throws a SyntaxError that's meaningless in an error message. 202
// is accepted here too since several of this file's cold-load endpoints
// deliberately use it with a real JSON body (progress info).
async function _fetchJsonOrThrow(resp) {
  if (!resp.ok && resp.status !== 202) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function _pollPortalMembers(attempt, silent = false, force = false) {
  const MAX = 40;   // give up after ~200 s
  const INTERVAL = 5000;

  if (attempt === 0 && !silent) show('contactsReloadBtn').disabled = true;

  try {
    // POST forces the server to bypass its own 2-hour cache and recompute
    // from CKAN — only needed on the first request of an explicit Reload.
    // full=1 asks for the complete raw per-membership list (undeduped) —
    // this cache backs the Comms contact picker, org panel, user panel etc,
    // which all expect that shape; the paginated table view fetches separately.
    const resp = await fetch(API_BASE + 'api/portal-members?full=1', { method: (attempt === 0 && force) ? 'POST' : 'GET' });
    const data = await _fetchJsonOrThrow(resp);

    if (resp.status === 202) {
      if (attempt < MAX) {
        _pmPollTimer = setTimeout(() => _pollPortalMembers(attempt + 1, silent, force), INTERVAL);
      } else if (!silent) {
        show('contactsReloadBtn').disabled = false;
      }
      return;
    }

    if (data.error) throw new Error(data.error);
    _portalMembersCache = data.members || [];
    _pmUnmatched = data.unmatched || [];
    _pmSaveCache(_portalMembersCache, _pmUnmatched);
    _pmSetFetchedAt(Date.now());
    show('contactsReloadBtn').disabled = false;
    // Only an explicit force-reload re-triggers the visible table here.
    // loadPortalMembersTab manages its own independent fetch/retry/render
    // lifecycle (guarded by _pmLoadGeneration) and already gets kicked off
    // on tab-open independently of this poll -- re-triggering it again from
    // here on every routine/background completion raced against whatever
    // it was already doing (this poll runs on its own, much slower cadence,
    // a full CKAN re-fetch vs a cheap paginated query), so whichever landed
    // last won, sometimes overwriting fresh, correctly filtered summary
    // cards with stale ones. force=true is the one case this signal is
    // still genuinely needed: a Reload replaces _pm_cache["data"] server-
    // side only once the new fetch finishes, so nothing else would tell an
    // already-warm paginated table to go re-fetch and pick up the change.
    if (force && _isTabActive('tab-contacts')) filterContactsTab();
    if (_orgsLoaded) loadContactSummary();
  } catch (e) {
    if (!silent) show('contactsReloadBtn').disabled = false;
  }
}

// Prefers the name on file (entered manually / from the contacts Excel) over
// the portal account's own display name, since the CKAN profile is often a
// romanized username while the contact file has the person's real name.
function _pmDisplayName(m) {
  const fileName = `${m.contact_first_name || ''} ${m.contact_last_name || ''}`.trim();
  return fileName || m.display_name || m.username || '';
}

// Every row in this table is already a portal account, so a "Portal" badge
// on every single one says nothing -- only whether it's ALSO matched to a
// contact-file record varies, so that's the only badge worth showing here.
function _pmFileBadge(m) {
  return m.contact_id
    ? `<span class="badge rounded-pill" style="font-size:.65rem;background:#e6f4ea;color:#188038" title="${esc(t('contacts.has_contact_file'))}"><i class="bi bi-file-earmark-person me-1"></i>File</span>`
    : '';
}

// A portal member with no contact_id has no file record to edit -- clicking
// the row action opens the same blank/pre-filled modal either way, but
// showing "Edit" on a row with nothing to edit is backwards. Add when
// there's no file record yet, Edit once one exists.
function _pmEditOrAddButton(m, onclickExpr) {
  return m.contact_id
    ? `<button class="btn btn-outline-secondary btn-sm py-0 px-1" title="${esc(t('contacts.edit_contact_info'))}" onclick="${onclickExpr}"><i class="bi bi-pencil"></i></button>`
    : `<button class="btn btn-outline-primary btn-sm py-0 px-1" title="${esc(t('userPanel.add_contact_record'))}" onclick="${onclickExpr}"><i class="bi bi-person-plus"></i></button>`;
}

function sortContacts(col) {
  if (_contactsSortCol === col) _contactsSortDir = _contactsSortDir === 'asc' ? 'desc' : 'asc';
  else { _contactsSortCol = col; _contactsSortDir = 'asc'; }
  filterPortalMembersTab();
}

// Shared by both sortable tables (Portal Members / File Contacts) -- each
// keeps its own {sortCol, sortDir} state, only the arrow glyph logic is common.
function _sortArrow(currentCol, currentDir, col) {
  if (currentCol !== col) return '<span style="opacity:.25;font-size:.8em"> ↕</span>';
  return currentDir === 'asc' ? ' ↑' : ' ↓';
}

function _contactsSortArrow(col) {
  return _sortArrow(_contactsSortCol, _contactsSortDir, col);
}


const ROLE_BADGE_CLS = { admin: 'bg-primary', editor: 'bg-success', member: 'bg-secondary', user: 'bg-light text-dark border', sysadmin: 'bg-danger' };
const STATE_BADGE_CLS = { active: 'bg-success', deleted: 'bg-danger', pending: 'bg-warning text-dark' };
const CONTACT_TYPE_CLS = {
  'Org Administrator':    'bg-primary',
  'Org Editor':           'bg-success',
  'Org Member':           'bg-secondary',
  'Data Governance Officer': 'bg-info text-dark',
  'Data Steward':         'bg-warning text-dark',
  'Κεντρικός Διαχειριστής Οργανισμού': 'bg-dark',
};

// Portal capacity ('admin'/'editor'/'member'/'user') -> the English label used
// only as a CONTACT_TYPE_CLS lookup key (that object's keys are fixed English
// strings, unrelated to the current UI language) -- kept separate from the
// actual translated text shown to the user, via _portalRoleLabel() below.
const _PORTAL_ROLE_LOOKUP_KEY = { admin: 'Org Administrator', editor: 'Org Editor', member: 'Org Member', user: 'User' };
const _PORTAL_ROLE_I18N_KEY   = { admin: 'contacts.type_org_administrator', editor: 'contacts.type_org_editor', member: 'contacts.type_org_member', user: 'contacts.role_user' };

// The contacts-file "contact type" is stored as fixed English strings (see
// CONTACT_TYPE_CLS above) -- this maps each one to its translated display text.
const _CONTACT_TYPE_I18N_KEY = {
  'Org Administrator':       'contacts.type_org_administrator',
  'Org Editor':               'contacts.type_org_editor',
  'Org Member':               'contacts.type_org_member',
  'Data Governance Officer': 'contacts.type_data_officer',
  'Data Steward':             'contacts.type_data_steward',
  'Κεντρικός Διαχειριστής Οργανισμού': 'contacts.type_contact_point',
};

// Same option list/order as #pmEditContactType in index.html -- kept here too
// so the inline user-panel editor can build an identical <select> in JS.
const _CONTACT_TYPE_OPTIONS = [
  { value: 'Κεντρικός Διαχειριστής Οργανισμού', key: 'contacts.type_contact_point' },
  { value: 'Org Administrator', key: 'contacts.type_org_administrator' },
  { value: 'Org Editor', key: 'contacts.type_org_editor' },
  { value: 'Org Member', key: 'contacts.type_org_member' },
  null,
  { value: 'Data Governance Officer', key: 'contacts.type_data_officer' },
  { value: 'Data Steward', key: 'contacts.type_data_steward' },
];

function _portalRoleLabel(m) {
  if (m.sysadmin) return t('contacts.role_sysadmin');
  const key = _PORTAL_ROLE_I18N_KEY[m.capacity];
  return key ? t(key) : (m.capacity || '—');
}
function _portalRoleClass(m) {
  if (m.sysadmin) return ROLE_BADGE_CLS.sysadmin;
  return CONTACT_TYPE_CLS[_PORTAL_ROLE_LOOKUP_KEY[m.capacity]] || ROLE_BADGE_CLS[m.capacity] || 'bg-secondary';
}

const _CONTACT_STATE_I18N_KEY = { active: 'contacts.state_active', pending: 'contacts.state_pending', deleted: 'contacts.state_deleted' };
function _contactStateLabel(state) {
  return t(_CONTACT_STATE_I18N_KEY[state] || 'contacts.state_active');
}

function _dedupeContacts(rows) {
  // Keep highest role per username (sysadmin > admin > editor > member)
  const _roleRank = { admin: 3, editor: 2, member: 1 };
  const _rank = m => m.sysadmin ? 4 : (_roleRank[m.capacity] || 0);
  const seen = new Map();
  for (const m of rows) {
    const prev = seen.get(m.username);
    if (!prev || _rank(m) > _rank(prev)) seen.set(m.username, m);
  }
  return [...seen.values()];
}

// Role, State, and File info are independent, combinable facets (same
// reasoning as the Dataset Catalog's Type/HVD/Harvested tabs) — a contact can
// be filtered by role AND state AND file-info presence at once, so each
// dimension gets its own filter value rather than the old single
// _contactsActiveFilter that could only hold one.
let _contactsRoleFilter  = null;   // e.g. 'admin', or null = every role
let _contactsStateFilter = null;   // e.g. 'active', or null = every state
let _contactsFileFilter  = null;   // 'has' | 'none', or null = regardless of file info
let _contactsSummaryCards = [];

function _contactsFilterIsActive(f) {
  if (f.type === 'role')  return _contactsRoleFilter  === f.value;
  if (f.type === 'state') return _contactsStateFilter === f.value;
  if (f.type === 'file')  return _contactsFileFilter  === f.value;
  return false;
}

// Renders a subset of a summary-cards array (by original index, so the
// setter function keeps working unmodified) into one tab's row, plus a dot
// on that tab's label if any card in it is the active filter — same pattern
// as the Dataset Catalog's filter-card tabs. Shared by both the Role/State
// facets (Portal Members) and the Type/Portal-account facets (File
// Contacts), which otherwise duplicated this verbatim.
function _renderFilterGroup(elId, indices, tabDotId, cardsArray, isActiveFn, setterFnName) {
  const prepared = indices.map(idx => {
    const c = cardsArray[idx];
    return { ...c, active: isActiveFn(c.filter), onclick: `${setterFnName}(${idx})` };
  });
  const hasActive = indices.some(idx => {
    const f = cardsArray[idx].filter;
    return f.value !== null && isActiveFn(f);
  });
  _renderFilterCardsGrid(elId, prepared, tabDotId, hasActive ? {} : null);
}

function _renderContactsFilterGroup(elId, indices, tabDotId) {
  _renderFilterGroup(elId, indices, tabDotId, _contactsSummaryCards, _contactsFilterIsActive, 'setContactsFilter');
}

// roleCounts/stateCounts/fileCounts come straight from the backend response
// ({total, admin, editor, ...}/{total, active, ...}/{total, has, none}) --
// only present on a fresh page (start=0), same as File Contacts' facet
// counts (see renderFileContactsSummary). Called with no args to just
// re-render the last-known counts (e.g. after toggling a filter, before the
// new fetch resolves) using whatever's already in the cards array.
function renderContactsSummary(roleCounts, stateCounts, fileCounts) {
  if (roleCounts) {
    _contactsSummaryCards = [
      { filter: { type: 'role', value: null },       label: t('contacts.total'), value: roleCounts.total,    bg: "bg-secondary bg-opacity-10", text: "text-secondary", icon: "bi-people" },
      { filter: { type: 'role', value: 'admin' },    label: t('contacts.role_admin'),    value: roleCounts.admin,    bg: "bg-primary bg-opacity-10",   text: "text-primary",   icon: "bi-shield-check" },
      { filter: { type: 'role', value: 'editor' },   label: t('contacts.role_editor'),   value: roleCounts.editor,   bg: "bg-success bg-opacity-10",   text: "text-success",   icon: "bi-pencil-square" },
      { filter: { type: 'role', value: 'member' },   label: t('contacts.role_member'),   value: roleCounts.member,   bg: "bg-secondary bg-opacity-10", text: "text-secondary", icon: "bi-person" },
      { filter: { type: 'role', value: 'user' },     label: t('contacts.role_user'),     value: roleCounts.user,     bg: "bg-secondary bg-opacity-10", text: "text-secondary", icon: "bi-person-badge" },
      { filter: { type: 'role', value: 'sysadmin' }, label: t('contacts.role_sysadmin'), value: roleCounts.sysadmin, bg: "bg-danger bg-opacity-10",    text: "text-danger",    icon: "bi-shield-lock" },
      { filter: { type: 'state', value: null },      label: t('contacts.total'), value: stateCounts.total,      bg: "bg-secondary bg-opacity-10", text: "text-secondary", icon: "bi-people" },
      { filter: { type: 'state', value: 'active' },  label: t('contacts.state_active'),  value: stateCounts.active,  bg: "bg-success bg-opacity-10",   text: "text-success",   icon: "bi-check-circle" },
      { filter: { type: 'state', value: 'pending' }, label: t('contacts.state_pending'), value: stateCounts.pending, bg: "bg-warning bg-opacity-10",   text: "text-warning",   icon: "bi-hourglass-split" },
      { filter: { type: 'state', value: 'deleted' }, label: t('contacts.state_deleted'), value: stateCounts.deleted, bg: "bg-danger bg-opacity-10",    text: "text-danger",    icon: "bi-x-circle" },
      { filter: { type: 'file', value: null },       label: t('contacts.total'),            value: fileCounts.total, bg: "bg-secondary bg-opacity-10", text: "text-secondary", icon: "bi-people" },
      { filter: { type: 'file', value: 'has' },      label: t('contacts.has_contact_file'), value: fileCounts.has,  bg: "bg-success bg-opacity-10",   text: "text-success",   icon: "bi-file-earmark-person" },
      { filter: { type: 'file', value: 'none' },     label: t('contacts.no_contact_file'),  value: fileCounts.none, bg: "bg-secondary bg-opacity-10", text: "text-secondary", icon: "bi-file-earmark-x" },
    ];
  }
  if (!_contactsSummaryCards.length) {
    document.getElementById('contactsRoleSummary').innerHTML = '';
    document.getElementById('contactsStateSummary').innerHTML = '';
    document.getElementById('contactsFileSummary').innerHTML = '';
    return;
  }
  _renderContactsFilterGroup('contactsRoleSummary',  [0, 1, 2, 3, 4, 5], 'contactsRoleTabDot');
  _renderContactsFilterGroup('contactsStateSummary', [6, 7, 8, 9],       'contactsStateTabDot');
  _renderContactsFilterGroup('contactsFileSummary',  [10, 11, 12],      'contactsFileTabDot');
}

function setContactsFilter(idx) {
  const card = _contactsSummaryCards[idx];
  if (!card) return;
  const f = card.filter;
  if (f.type === 'role') {
    _contactsRoleFilter = (_contactsRoleFilter === f.value) ? null : f.value;
  } else if (f.type === 'state') {
    _contactsStateFilter = (_contactsStateFilter === f.value) ? null : f.value;
  } else if (f.type === 'file') {
    _contactsFileFilter = (_contactsFileFilter === f.value) ? null : f.value;
  }
  filterPortalMembersTab();
}

function clearContactsFilters() {
  _contactsRoleFilter = null;
  _contactsStateFilter = null;
  _contactsFileFilter = null;
  filterPortalMembersTab();
}

// Dispatches to whichever scope is active -- File Contacts' own
// filterFileContactsTab (server-paginated against the live DB) or Portal
// Members' filterPortalMembersTab below (server-paginated against the
// CKAN-derived _pm_cache, see portal_members_all in app.py).
function filterContactsTab() {
  if (_contactsScope === 'file') { filterFileContactsTab(); return; }
  filterPortalMembersTab();
}

function _pmOrgsHtml(m) {
  const userOrgs = m.org_memberships || [];
  const MAX_ORGS = 2;
  if (!userOrgs.length) return `<span class="text-muted small fst-italic">—</span>`;
  return userOrgs.slice(0, MAX_ORGS).map(o =>
      `<span class="badge bg-light text-dark border me-1" style="font-size:.7rem;max-width:140px;overflow:hidden;text-overflow:ellipsis;display:inline-block;white-space:nowrap"
        title="${esc(o.org_title || o.org_name)}">${esc(o.org_title || o.org_name)}</span>`
    ).join('') +
    (userOrgs.length > MAX_ORGS ? `<span class="text-muted small">+${userOrgs.length - MAX_ORGS}</span>` : '');
}
// Same "genuinely conflicting, not just missing" comparison renderUserPanel
// does per-field (name/email/role/org), condensed into one yes/no so the
// Portal Members and File Contacts tables can flag it next to the name
// without opening the full panel. Org comparison is silently skipped until
// the HRMS<->CKAN bridge is built (_hrmsLookup/_ckanByHrms), same as the
// panel -- a false positive there is worse than a brief false silence.
function _rowFieldsDiffer({ portalName, fileName, portalEmail, fileEmail, portalRoleKey, fileTypeKeys, portalOrgName, fileOrgCodes }) {
  const nameDiffers  = !!(fileName && portalName && fileName.trim().toLowerCase() !== portalName.trim().toLowerCase());
  const emailDiffers = !!(fileEmail && portalEmail && fileEmail.toLowerCase() !== portalEmail.toLowerCase());
  const roleDiffers  = !!(fileTypeKeys.length && portalRoleKey && !fileTypeKeys.includes(portalRoleKey));
  const orgsDiffer   = !!(_hrmsLookup && _ckanByHrms && fileOrgCodes.length && portalOrgName &&
    !fileOrgCodes.some(o => _orgCodeMatches(o.code || '', portalOrgName || '')));
  return nameDiffers || emailDiffers || roleDiffers || orgsDiffer;
}
function _pmRowMismatch(m) {
  if (!m.contact_id) return false;
  return _rowFieldsDiffer({
    portalName: m.display_name || '',
    fileName: [m.contact_first_name, m.contact_last_name].filter(Boolean).join(' '),
    portalEmail: m.email || '', fileEmail: m.contact_email || '',
    portalRoleKey: !m.sysadmin ? _PORTAL_ROLE_LOOKUP_KEY[m.capacity] : null,
    fileTypeKeys: (m.contact_type || '').split(',').map(s => s.trim()).filter(Boolean),
    portalOrgName: m.org_name || '', fileOrgCodes: m.contact_org_codes || [],
  });
}
// Lazily built and cached against the current _portalMembersCache array
// reference -- rebuilt only when that reference actually changes (a fresh
// fetch/filter swaps the array wholesale; per-row property mutations like
// _applyContactSaveResult's don't), so _fileRowMismatch doesn't rescan the
// whole portal-members list for every file-contact row when many render at
// once (e.g. several expanded groups in the "By Organization" view). First
// occurrence per username wins, matching what the old .find() would have
// picked for someone with multiple org-membership rows.
let _portalMembersByUsernameCache = null;
let _portalMembersByUsernameSource = null;
function _portalMembersByUsername() {
  if (_portalMembersByUsernameSource !== _portalMembersCache) {
    _portalMembersByUsernameCache = new Map();
    for (const m of (_portalMembersCache || [])) {
      if (m.username && !_portalMembersByUsernameCache.has(m.username)) {
        _portalMembersByUsernameCache.set(m.username, m);
      }
    }
    _portalMembersByUsernameSource = _portalMembersCache;
  }
  return _portalMembersByUsernameCache;
}

function _fileRowMismatch(c) {
  if (!c.linked_username) return false;
  const m = _portalMembersByUsername().get(c.linked_username);
  if (!m) return false;
  const fileOrgCodes = (c.org_codes && c.org_codes.length) ? c.org_codes
    : (c.org_code ? [{code: c.org_code, label: c.org_label || c.org_code}] : []);
  return _rowFieldsDiffer({
    portalName: m.display_name || '',
    fileName: [c.first_name, c.last_name].filter(Boolean).join(' '),
    portalEmail: m.email || '', fileEmail: c.email || '',
    portalRoleKey: !m.sysadmin ? _PORTAL_ROLE_LOOKUP_KEY[m.capacity] : null,
    fileTypeKeys: (c.contact_type || '').split(',').map(s => s.trim()).filter(Boolean),
    portalOrgName: m.org_name || '', fileOrgCodes,
  });
}
// Shared icon for both tables -- same warning-triangle-with-tooltip
// convention as renderUserPanel's own per-field mismatch icons.
function _rowMismatchIcon(hasMismatch) {
  return hasMismatch
    ? ` <i class="bi bi-exclamation-triangle-fill text-warning" title="${esc(t('contacts.row_mismatch'))}"></i>`
    : '';
}

// index === null renders the compact grouped-view row (no #/org columns,
// since a group card's own header already says which org); otherwise the
// full flat-view row -- same convention as _fileContactRowHtml.
function _pmRowHtml(m, index, reveal = false) {
  const state     = m.state || 'active';
  const roleCls   = _portalRoleClass(m);
  const roleLabel = _portalRoleLabel(m);
  const stateCls  = STATE_BADGE_CLS[state] || 'bg-secondary';
  const nameCell = `<span class="fw-semibold">${esc(_pmDisplayName(m))}</span>${_rowMismatchIcon(_pmRowMismatch(m))} ${_pmFileBadge(m)}`;
  // Same panel as a row click either way, straight into inline-edit mode --
  // openUserPanel's startEditing flag seeds from the existing contact when
  // there is one, or from this portal member's own identity/org when not
  // (pmEditModal is no longer used for either case).
  const editOnclick = `openUserPanel('${esc(m.username)}', true)`;
  const tail = `
    <td><span class="badge ${roleCls}">${esc(roleLabel)}</span></td>
    <td><span class="badge ${stateCls}">${esc(_contactStateLabel(state))}</span></td>
    <td class="small" style="max-width:150px;overflow:hidden" onclick="event.stopPropagation()">
      ${m.email ? `<a href="mailto:${esc(m.email)}" class="d-block text-truncate" title="${esc(m.email)}">${esc(m.email)}</a>` : ''}
      ${m.contact_email && m.contact_email !== m.email
        ? `<div class="text-muted text-truncate" style="font-size:.75em" title="${esc(t('contacts.email_from_file').replace('{email}', m.contact_email))}"><i class="bi bi-file-earmark-person me-1"></i>${esc(m.contact_email)}</div>`
        : ''}
    </td>
    <td class="small text-nowrap" style="width:90px" onclick="event.stopPropagation()">
      ${m.contact_tel ? `<a href="tel:${esc(m.contact_tel)}" class="text-decoration-none"><i class="bi bi-telephone me-1"></i>${esc(m.contact_tel)}</a>` : ''}
    </td>
    <td onclick="event.stopPropagation()">
      <div class="d-flex gap-1">
        ${_pmEditOrAddButton(m, editOnclick)}
        ${m.contact_id ? `<button class="btn btn-outline-danger btn-sm py-0 px-1" title="${esc(t('contacts.delete_contact_record'))}"
          onclick="deletePmContactRecord(${m.contact_id}, '${esc(m.username)}')"><i class="bi bi-trash"></i></button>` : ''}
      </div>
    </td>`;
  const rowStyle = `cursor:pointer;${state !== 'active' ? 'opacity:.6' : ''}`;
  if (index == null) {
    return `<tr${reveal ? ' class="just-revealed"' : ''} style="${rowStyle}" onclick="openUserPanel('${esc(m.username)}')">
      <td style="max-width:200px">${nameCell}</td>${tail}
    </tr>`;
  }
  return `<tr style="${rowStyle}" onclick="openUserPanel('${esc(m.username)}')">
    <td class="text-muted small">${index}</td>
    <td style="max-width:200px">${nameCell}</td>
    <td style="max-width:180px">${_pmOrgsHtml(m)}</td>
    ${tail}
  </tr>`;
}

function _pmRenderHeader() {
  const th = (col, label, extraStyle = '') =>
    `<th style="cursor:pointer;user-select:none;${extraStyle}" onclick="sortContacts('${col}')">${label}${_contactsSortArrow(col)}</th>`;
  document.querySelector('#contactsTable thead tr').innerHTML =
    `<th style="width:3rem">#</th>` +
    th('name',  t('contacts.col_name'))   +
    th('org',   t('contacts.col_org'))   +
    th('type',  t('contacts.col_role'))  +
    th('state', t('contacts.col_state')) +
    th('email', t('contacts.email'), 'width:150px') +
    `<th style="width:90px">${t('contacts.col_tel')}</th>` +
    `<th style="width:2.5rem"></th>`;
}

// Query params shared by every /api/portal-members call this view makes (the
// flat list, the org-group counts, and a single group's expand-fetch) -- so
// search/role/state/file_info/sort always stay in sync across all three.
function _pmQueryParams() {
  const p = new URLSearchParams();
  const search = (show('contactsSearch').value || '').trim();
  if (search) p.set('q', search);
  if (_contactsRoleFilter)  p.set('role', _contactsRoleFilter);
  if (_contactsStateFilter) p.set('state', _contactsStateFilter);
  if (_contactsFileFilter)  p.set('file_info', _contactsFileFilter);
  p.set('sort', _contactsSortCol);
  p.set('dir', _contactsSortDir);
  return p;
}

// Snapshot of _pmQueryParams().toString() as of the last successful flat or
// grouped fetch -- the search box is shared between Portal Members and File
// Contacts, but only the *active* scope's cache gets invalidated when the
// user types (filterPortalMembersTab only fires while scope === 'portal').
// So typing a search term while on File Contacts, then switching back to
// Portal Members, left _pmFlatLoaded/_pmGroupsLoaded still true from
// *before* the search -- the reuse path in _pmSyncView had no way to know
// the search/filters had changed underneath it, and just kept showing the
// stale unfiltered list. _pmSyncView now also checks this fingerprint and
// forces a fresh fetch (instead of reusing) whenever it's out of date.
let _pmLoadedFingerprint = null;

const PORTAL_MEMBERS_PAGE_SIZE = 30;
let _pmCache = [];          // rows loaded so far, in the active view's order
let _pmStart = 0;           // next offset to fetch
let _pmTotalCount = 0;
let _pmFlatLoaded = false;  // distinguishes "never loaded" from "loaded, zero results"
let _pmLoadingMore = false;
let _pmObserver = null;

function _ensurePortalMembersObserver() {
  if (!_pmObserver) {
    // Viewport-rooted, same as the Dataset Catalog/File Contacts -- this
    // table grows with the page rather than scrolling inside a fixed-height
    // card.
    _pmObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) _portalMembersLoadMoreTrigger();
    }, { rootMargin: '400px 0px' });
  }
  return _pmObserver;
}
function _portalMembersLoadMoreTrigger() {
  if (_pmLoadingMore || _pmStart >= _pmTotalCount) return;
  loadPortalMembersTab(true);
}
function _portalMembersMaybeAutoLoadMore() {
  const sentinel = document.getElementById('contactsLoadMoreSentinel');
  if (!sentinel || _pmLoadingMore || _pmStart >= _pmTotalCount) return;
  const rect = sentinel.getBoundingClientRect();
  if (rect.top < window.innerHeight && rect.bottom >= 0) _portalMembersLoadMoreTrigger();
}

const _PM_LOAD_MAX_ATTEMPTS = 40;   // give up after ~200s, same budget as _pollPortalMembers
const _PM_LOAD_RETRY_MS     = 5000;
let _pmLoadRetryTimer = null;

// Bumped ONLY when a load truly (re)starts from scratch (attempt 0,
// non-append) -- loadPortalMembersTab and _loadPortalMembersGroups share
// this because they also share the same progress-bar DOM ids (see
// _progressBarHtml('pm', ...)). A retry continuation (attempt > 0) does
// NOT bump it -- it inherits the generation its own attempt-0 call minted,
// threaded through the `generation` parameter below, and just compares
// against it. Bumping on every non-append call (an earlier version of
// this fix did) was itself buggy: a stale retry timer left over from a
// chain that should have died when scope changed away can still fire
// later if the user switches back to Portal before its 5s delay elapses --
// the top-of-function scope check passes again by then, so that stale
// continuation would bump the counter itself, invalidating the *real*
// fresh load's own in-flight request by comparison and silently killing
// the progress bar it was about to show.
let _pmLoadGeneration = 0;

// attempt only applies to a fresh (non-append) load -- _pm_cache backing
// this table is the SAME server-side cache loadContactsTab's full=1 poll
// warms, so a cold response here is common (whichever of the two requests
// happens to lose the race against _do_fetch_portal_members finishing),
// not exceptional; retry with the shared progress bar instead of dead-ending.
// `generation` is only ever passed internally, by this function's own retry
// setTimeout -- omit it to mint a fresh one.
async function loadPortalMembersTab(append = false, attempt = 0, generation = null) {
  if (_contactsScope !== 'portal') return;
  if (_pmLoadRetryTimer) { clearTimeout(_pmLoadRetryTimer); _pmLoadRetryTimer = null; }
  if (!append) _pmStart = 0;
  const myGeneration = (!append && attempt === 0) ? ++_pmLoadGeneration : (generation ?? _pmLoadGeneration);
  const sentinelBefore = document.getElementById('contactsLoadMoreSentinel');
  if (append) {
    _pmLoadingMore = true;
    if (sentinelBefore) sentinelBefore.innerHTML = `<div class="spinner-border spinner-border-sm me-2"></div>${t('loading')}`;
  } else if (attempt === 0) {
    if (_pmObserver) _pmObserver.disconnect();
    show('contactsTableBody').innerHTML =
      `<tr><td colspan="8" class="text-center py-5">
         <div class="spinner-border text-primary mb-2"></div>
         <div class="text-muted small mb-2">${t('contacts.loading_portal')}</div>
         ${_progressBarHtml('pm', 'mx-auto', 'max-width:280px')}
       </td></tr>`;
    // Don't wait for the slow per-org fetch's own first progress report just
    // to learn how many orgs there are -- that number's already sitting in
    // the header's own "Organizations" KPI card (from the same /api/stats
    // call every page load makes regardless of which tab is open). Show the
    // bar immediately with that as a best-guess total; the real one (from
    // _pm_cache's own progress, once phase 'members' starts reporting)
    // still overwrites it as soon as it arrives, correcting any drift.
    if (_kpiOrgCount) _showProgressBar('pm', 0, _kpiOrgCount);
  }
  try {
    const params = _pmQueryParams();
    params.set('rows', PORTAL_MEMBERS_PAGE_SIZE);
    params.set('start', _pmStart);
    const resp = await fetch(API_BASE + 'api/portal-members?' + params.toString());
    const data = await _fetchJsonOrThrow(resp);
    if (myGeneration !== _pmLoadGeneration) return;  // superseded by a newer load while this was in flight
    if (resp.status === 202) {
      if (append) return;  // can't happen (append never fires while cold, see guards below), but stay safe
      _updateContactsLoadingProgress(data.progress);
      if (attempt < _PM_LOAD_MAX_ATTEMPTS) {
        _pmLoadRetryTimer = setTimeout(() => loadPortalMembersTab(false, attempt + 1, myGeneration), _PM_LOAD_RETRY_MS);
      } else {
        show('contactsTableBody').innerHTML =
          `<tr><td colspan="8" class="text-center text-danger py-4">Timed out waiting for portal data.</td></tr>`;
      }
      return;
    }
    _pmTotalCount = data.count || 0;
    if (!append) {
      _pmCache = [];
      if (data.unmatched) _pmUnmatched = data.unmatched;
      renderContactsSummary(data.role_counts, data.state_counts, data.file_counts);
      _pmLoadedFingerprint = _pmQueryParams().toString();
    }
    const newRows = data.members || [];
    _pmCache = _pmCache.concat(newRows);
    _pmFlatCountLabel();

    if (!append && !newRows.length) {
      show('contactsTableBody').innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">${t('contacts.no_results')}</td></tr>`;
    } else {
      const rowsHtml = newRows.map((m, i) => _pmRowHtml(m, _pmStart + i + 1)).join('');
      if (append) {
        document.getElementById('contactsTableBody').insertAdjacentHTML('beforeend', rowsHtml);
      } else {
        _pmRenderHeader();
        document.getElementById('contactsTableBody').innerHTML = rowsHtml;
      }
    }

    _pmStart += newRows.length;

    const sentinel = document.getElementById('contactsLoadMoreSentinel');
    if (sentinel) {
      if (_pmStart < _pmTotalCount) {
        sentinel.innerHTML = '';
        _ensurePortalMembersObserver().observe(sentinel);
      } else {
        _ensurePortalMembersObserver().unobserve(sentinel);
        sentinel.innerHTML = data.count ? t('catalog.end_of_results') : '';
      }
    }
    if (!append) _pmFlatLoaded = true;
  } catch (e) {
    if (!append) show('contactsTableBody').innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">${esc(e.message)}</td></tr>`;
  } finally {
    _pmLoadingMore = false;
  }
  _portalMembersMaybeAutoLoadMore();
}

// ── Portal Members grouped-by-org view ──────────────────────────────────────
// Same lazy-loading design as File Contacts' grouped view (see
// _loadFileContactsGroups): group_by=org gets accurate per-org counts from
// one aggregate pass with no row fetching, so every group card renders
// immediately; a group's actual rows are only fetched the first time it's
// expanded, then cached here.
let _pmGroups = [];              // [{org_code, org_label, count}]
let _pmGroupsLoaded = false;
let _pmExpandedOrgs = new Set(); // slugs ('__none__' for no-org)
const _pmGroupRows = new Map();    // slug -> rows[]
const _pmGroupLoading = new Set(); // slugs currently fetching
// Set right before a render call that should reveal-animate exactly the one
// group just toggled -- see _renderPortalMembersGroups's comment.
let _pmRevealKey = null;

function _pmGroupSlug(orgCode) { return orgCode || '__none__'; }
function _pmSlugToOrgParam(slug) { return slug === '__none__' ? '' : slug; }

let _pmGroupsRetryTimer = null;

// Same cold-cache retry reasoning as loadPortalMembersTab -- group_by=org
// hits the identical _pm_cache, so it can just as easily race a 202 while
// _do_fetch_portal_members is still running; without a retry this silently
// rendered "no results" forever instead of ever showing real groups.
// `generation` is only ever passed internally, by this function's own
// retry setTimeout -- see loadPortalMembersTab's matching comment for why
// a retry continuation (attempt > 0) must inherit it rather than re-read
// the shared counter.
async function _loadPortalMembersGroups(attempt = 0, generation = null) {
  if (_contactsScope !== 'portal') return;
  if (_pmGroupsRetryTimer) { clearTimeout(_pmGroupsRetryTimer); _pmGroupsRetryTimer = null; }
  const myGeneration = attempt === 0 ? ++_pmLoadGeneration : (generation ?? _pmLoadGeneration);
  const el = show('contactsGroupedView');
  if (attempt === 0) {
    el.innerHTML = `<div class="text-center py-4"><div class="spinner-border text-primary mb-2"></div>
      <div class="text-muted small mb-2">${t('contacts.loading_portal')}</div>
      ${_progressBarHtml('pm', 'mx-auto', 'max-width:280px')}</div>`;
    // Same best-guess-total trick as loadPortalMembersTab -- see its comment.
    if (_kpiOrgCount) _showProgressBar('pm', 0, _kpiOrgCount);
  }
  try {
    const params = _pmQueryParams();
    params.set('group_by', 'org');
    const resp = await fetch(API_BASE + 'api/portal-members?' + params.toString());
    const data = await _fetchJsonOrThrow(resp);
    if (myGeneration !== _pmLoadGeneration) return;  // superseded by a newer load while this was in flight
    if (resp.status === 202) {
      _updateContactsLoadingProgress(data.progress);
      if (attempt < _PM_LOAD_MAX_ATTEMPTS) {
        _pmGroupsRetryTimer = setTimeout(() => _loadPortalMembersGroups(attempt + 1, myGeneration), _PM_LOAD_RETRY_MS);
      } else {
        el.innerHTML = `<div class="alert alert-danger mb-0">Timed out waiting for portal data.</div>`;
      }
      return;
    }
    _pmGroups = data.groups || [];
    _pmGroupsLoaded = true;
    _pmLoadedFingerprint = _pmQueryParams().toString();
    _pmGroupedCountLabel();
    _renderPortalMembersGroups();
  } catch (e) {
    el.innerHTML = `<div class="alert alert-danger mb-0">${esc(e.message)}</div>`;
  }
}

function _renderPortalMembersGroups() {
  const el = show('contactsGroupedView');
  if (!_pmGroups.length) {
    el.innerHTML = `<p class="text-muted text-center py-4">${t('contacts.no_results')}</p>`;
    return;
  }
  // Every call rebuilds every group, not just the one being toggled -- see
  // Comms' _renderCommsOrgGroups for the full reasoning. Capture-and-clear
  // means only the group actually just expanded gets the reveal animation.
  const revealKey = _pmRevealKey;
  _pmRevealKey = null;
  el.innerHTML = _pmGroups.map(g => {
    const slug       = _pmGroupSlug(g.org_code);
    const isNone     = slug === '__none__';
    const isExpanded = _pmExpandedOrgs.has(slug);
    const isLoading  = _pmGroupLoading.has(slug);
    const cachedRows = _pmGroupRows.get(slug);
    const reveal     = slug === revealKey;
    const gId = 'cg_' + slug.replace(/\W/g, '_');
    let body = '';
    if (isExpanded) {
      body = (isLoading || !cachedRows)
        ? `<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div></div>`
        : `<table class="table table-hover table-sm align-middle mb-0"><tbody>${cachedRows.map(m => _pmRowHtml(m, null, reveal)).join('')}</tbody></table>`;
    }
    return `
    <div class="border rounded mb-2" ${isNone ? 'style="border-color:#fd7e14!important"' : ''}>
      <div class="d-flex align-items-center justify-content-between px-3 py-2 ${isNone ? 'comm-group-row-warn' : 'comm-group-row'}"
           style="cursor:pointer" onclick="toggleContactsOrg('${esc(slug)}')">
        <div class="d-flex align-items-center gap-2">
          <i class="bi bi-chevron-${isExpanded ? 'down' : 'right'} text-muted small"></i>
          <i class="bi bi-${isNone ? 'person-slash text-warning' : 'building text-primary'}"></i>
          <span class="fw-semibold small ${isNone ? 'text-warning-emphasis' : ''}">${esc(g.org_label || '(no organization)')}</span>
          <span class="badge ${isNone ? 'bg-warning text-dark' : 'bg-secondary'} rounded-pill">${g.count}</span>
        </div>
        ${!isNone ? `<button class="btn btn-outline-primary btn-sm py-0 px-2" title="${esc(g.org_label)}"
          onclick="event.stopPropagation();openOrgPanel('${esc(slug)}')">
          <i class="bi bi-box-arrow-up-right"></i>
        </button>` : ''}
      </div>
      <div id="${gId}" class="${isExpanded ? '' : 'd-none'} px-3">${body}</div>
    </div>`;
  }).join('');
}

async function _fetchPortalMembersGroupRows(slug) {
  if (_pmGroupRows.has(slug) || _pmGroupLoading.has(slug)) return;
  _pmGroupLoading.add(slug);
  try {
    const params = _pmQueryParams();
    params.set('org', _pmSlugToOrgParam(slug));
    params.set('rows', 200); // generous cap for a single org; larger ones would need their own load-more
    params.set('start', 0);
    const resp = await fetch(API_BASE + 'api/portal-members?' + params.toString());
    const data = await _fetchJsonOrThrow(resp);
    _pmGroupRows.set(slug, data.members || []);
  } catch (e) {
    _pmGroupRows.set(slug, []);
  } finally {
    _pmGroupLoading.delete(slug);
  }
}

function togglePortalMembersOrg(slug) {
  const el = show('contactsGroupedView');
  if (_pmExpandedOrgs.has(slug)) {
    _pmExpandedOrgs.delete(slug);
    _animateHeightSwap(el, _renderPortalMembersGroups);
    return;
  }
  _pmExpandedOrgs.add(slug);
  // Delay the spinner (see Comms' toggleOrgComms for the full reasoning) --
  // these per-group fetches are usually fast enough that showing one
  // immediately just to replace it a beat later is itself the visible jump.
  const spinnerTimer = setTimeout(() => { _pmRevealKey = slug; _animateHeightSwap(el, _renderPortalMembersGroups); }, COMMS_SPINNER_DELAY_MS);
  _fetchPortalMembersGroupRows(slug).then(() => {
    clearTimeout(spinnerTimer);
    _pmRevealKey = slug;
    _animateHeightSwap(el, _renderPortalMembersGroups);
  });
}

// Throttled (not all-at-once), same reasoning as expandAllFileContacts.
async function expandAllPortalMembers() {
  const slugs = _pmGroups.map(g => _pmGroupSlug(g.org_code)).filter(s => !_pmExpandedOrgs.has(s));
  if (!slugs.length) return;
  const btn = show('contactsExpandAllBtn');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
  slugs.forEach(s => _pmExpandedOrgs.add(s));
  _renderPortalMembersGroups();
  const CONCURRENCY = 4;
  let next = 0;
  async function worker() {
    while (next < slugs.length) {
      const slug = slugs[next++];
      await _fetchPortalMembersGroupRows(slug);
      _renderPortalMembersGroups();
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, slugs.length) }, worker));
  btn.disabled = false;
  btn.innerHTML = originalHtml;
}

function collapseAllPortalMembers() {
  _pmExpandedOrgs.clear();
  _renderPortalMembersGroups();
}

// #contactsCount is a single shared badge both layouts write to -- whichever
// one last loaded overwrites what the other one had shown. Re-asserting the
// active layout's own value here (not just after a fresh fetch) is what
// makes switching layouts/scopes WITHOUT a refetch (the reuse branches in
// _pmSyncView below) still show the right number instead of leaving
// whatever the other layout last put there.
function _pmFlatCountLabel() {
  show('contactsCount').innerHTML = _pmCache.length < _pmTotalCount
    ? `${_pmCache.length} / ${_pmTotalCount}` : `${_pmTotalCount}`;
}
function _pmGroupedCountLabel() {
  const total = _pmGroups.reduce((sum, g) => sum + (g.count || 0), 0);
  show('contactsCount').innerHTML = `${total}`;
}

// Re-syncs whichever layout (flat/grouped) is currently selected without
// invalidating anything -- used when just toggling All/By-Organization, as
// opposed to filterPortalMembersTab() below, which is for when the actual
// result set has changed. Mirrors _fileContactsSyncView.
// Re-renders the flat table straight from _pmCache (already-fetched data,
// no network call) -- used when _pmFlatLoaded is true but the DOM itself
// was wiped out from under it (see the hidden.bs.tab listener up top: it
// clears #contactsTableBody whenever the Contacts tab is hidden, as a
// DOM-size optimization written back when this table always did a full
// rebuild on every visit anyway). _pmSyncView's reuse path skips that
// rebuild now, so without this, coming back to the tab left the table
// permanently blank -- header and summary cards still correct (untouched
// by that wipe), but no rows, and the scroll sentinel (also untouched, now
// visible since the "table" reads as empty) firing an append fetch into
// nothing.
function _pmRenderRowsFromCache() {
  _pmRenderHeader();
  const rowsHtml = _pmCache.map((m, i) => _pmRowHtml(m, i + 1)).join('');
  document.getElementById('contactsTableBody').innerHTML = rowsHtml
    || `<tr><td colspan="8" class="text-center text-muted py-4">${t('contacts.no_results')}</td></tr>`;
  const sentinel = document.getElementById('contactsLoadMoreSentinel');
  if (sentinel) {
    if (_pmStart < _pmTotalCount) {
      sentinel.innerHTML = '';
      _ensurePortalMembersObserver().observe(sentinel);
    } else {
      _ensurePortalMembersObserver().unobserve(sentinel);
      sentinel.innerHTML = _pmTotalCount ? t('catalog.end_of_results') : '';
    }
  }
}

function _pmSyncView() {
  // The search box (and role/state/file facet filters) are shared with File
  // Contacts, but only the *active* scope's cache gets invalidated when the
  // user changes one (filterPortalMembersTab only runs while scope ===
  // 'portal') -- so typing a search term while on File Contacts, then
  // switching back here, left _pmFlatLoaded/_pmGroupsLoaded still true from
  // *before* that change. Treat a fingerprint mismatch the same as
  // "not loaded" so it forces a fresh fetch instead of reusing a cache that
  // no longer matches what's actually selected.
  const stale = _pmQueryParams().toString() !== _pmLoadedFingerprint;
  if (_contactsViewMode === 'grouped') {
    if (_pmGroupsLoaded && !stale) { _renderPortalMembersGroups(); _pmGroupedCountLabel(); }
    else _loadPortalMembersGroups();
  } else if (!_pmFlatLoaded || stale) {
    loadPortalMembersTab(false);
  } else {
    _pmFlatCountLabel();
    if (!document.getElementById('contactsTableBody').children.length) _pmRenderRowsFromCache();
  }
}

// Search box / sort click / filter card click all funnel here -- the result
// set has genuinely changed, so both view modes' cached data are stale.
function filterPortalMembersTab() {
  if (_contactsScope !== 'portal') return;
  _pmCache = [];
  _pmTotalCount = 0;
  _pmFlatLoaded = false;
  _pmGroups = [];
  _pmGroupsLoaded = false;
  _pmGroupRows.clear();
  _pmExpandedOrgs.clear();
  renderContactsSummary(); // repaint cards' active state immediately; counts refresh once the fetch below resolves
  _pmSyncView();
}

let _contactsViewMode = 'flat';

function setContactsView(mode) {
  _contactsViewMode = mode;
  show('contactsViewFlatBtn').className    = 'btn btn-sm ' + (mode === 'flat'    ? 'btn-primary' : 'btn-outline-primary');
  show('contactsViewGroupedBtn').className = 'btn btn-sm ' + (mode === 'grouped' ? 'btn-primary' : 'btn-outline-primary');
  show('contactsExpandAllBtn').classList.toggle('d-none', mode !== 'grouped');
  show('contactsCollapseAllBtn').classList.toggle('d-none', mode !== 'grouped');
  // The layout toggle is shared across both scopes, but each has its own pair
  // of flat/grouped containers -- only the active scope's pair should
  // actually flip; the inactive scope's containers stay however
  // setContactsScope last left them; filterContactsTab()/filterFileContactsTab()
  // (below) re-show the right one for whichever scope is current.
  if (_contactsScope === 'file') {
    show('fileContactsFlatView').classList.toggle('d-none', mode !== 'flat');
    show('fileContactsGroupedView').classList.toggle('d-none', mode !== 'grouped');
    _fileContactsSyncView();  // reuses already-loaded data for this layout if we have it
    return;
  }
  show('contactsFlatView').classList.toggle('d-none', mode !== 'flat');
  show('contactsGroupedView').classList.toggle('d-none', mode !== 'grouped');
  _pmSyncView();  // reuses already-loaded data for this layout if we have it
}

// Portal Members = every portal account, enriched with matched contact-file
// data (position/tel/etc.) when a match exists by email. File Contacts =
// every org_contacts row regardless of portal match, fetched separately via
// /api/contacts. Both share the same All/By-Organization layout toggle and
// search box; each has its own filter-card facets (Role/State vs
// Type/Portal-account) since the underlying data differs.
let _contactsScope = 'portal';   // 'portal' | 'file'

// Re-syncs whichever Contacts scope (Portal Members/File Contacts) is
// currently active, reusing already-loaded data instead of unconditionally
// resetting and refetching -- unlike filterContactsTab()/
// filterPortalMembersTab()/filterFileContactsTab(), which are for when the
// actual result set changed (search/filter/sort). Use this whenever
// _portalMembersCache is already warm and something just wants the visible
// tab re-shown as-is -- e.g. re-clicking the Contacts tab button after
// having been on a different tab, which used to go through
// filterContactsTab() instead and always fully reset + re-fetch Portal
// Members from scratch even though nothing about the underlying data
// had changed.
function _contactsSyncActiveScope() {
  if (_contactsScope === 'file') {
    renderFileContactsSummary();
    _fileContactsSyncView();
  } else {
    renderContactsSummary();
    _pmSyncView();
  }
}

function setContactsScope(scope) {
  _contactsScope = scope;
  show('contactsScopePortalBtn').className  = 'btn btn-sm ' + (scope === 'portal' ? 'btn-primary' : 'btn-outline-primary');
  show('contactsScopeFileBtn').className    = 'btn btn-sm ' + (scope === 'file'   ? 'btn-primary' : 'btn-outline-primary');

  const isFile = scope === 'file';
  // "Add contact" always creates an org_contacts (file) record -- there's no
  // way to create a portal account from this dashboard, CKAN owns that.
  // Shown in both scopes: from Portal Members it's still useful for adding
  // someone who isn't a portal member at all yet (e.g. a phone/paper-only
  // contact for an org), and the blank-new flow's own email-duplicate check
  // (_upCheckEmailDuplicate) already redirects to an existing portal
  // member's record instead of creating a duplicate if the email matches.
  show('contactsAddBtn').classList.remove('d-none');
  show('contactsFilterSummaryPanel').classList.toggle('d-none', isFile);
  show('fileContactsFilterSummaryPanel').classList.toggle('d-none', !isFile);
  show('fileContactsView').classList.toggle('d-none', !isFile);
  show('contactsFlatView').classList.toggle('d-none', isFile || _contactsViewMode !== 'flat');
  show('contactsGroupedView').classList.toggle('d-none', isFile || _contactsViewMode !== 'grouped');
  show('fileContactsFlatView').classList.toggle('d-none', !isFile || _contactsViewMode !== 'flat');
  show('fileContactsGroupedView').classList.toggle('d-none', !isFile || _contactsViewMode !== 'grouped');

  _contactsSyncActiveScope();
}

function reloadContactsTab() {
  if (_contactsScope === 'file') filterFileContactsTab();
  else loadContactsTab(true);
}

// Dispatches to whichever scope is active -- mirrors filterContactsTab.
function toggleContactsOrg(slug) {
  if (_contactsScope === 'file') { toggleFileContactsOrg(slug); return; }
  togglePortalMembersOrg(slug);
}

function expandAllContacts() {
  if (_contactsScope === 'file') { expandAllFileContacts(); return; }
  expandAllPortalMembers();
}

function collapseAllContacts() {
  if (_contactsScope === 'file') { collapseAllFileContacts(); return; }
  collapseAllPortalMembers();
}

let _pmUnmatched = [];

// ── File Contacts view — every org_contacts row (Excel import / manual entry),
// matched or not, independent of whether it also has a portal account. Backs
// the "File Contacts" scope. Server-paginated + server-filtered (like the
// Dataset Catalog's /api/datasets/search) rather than fetch-everything-once,
// since this table has no natural upper bound on row count. The backend now
// also resolves is_linked/linked_username per row (see _org_contacts_portal_link_info
// in app.py), so the client no longer needs its own copy of the
// portal-members cache just to render this table's badges.
const FILE_CONTACTS_PAGE_SIZE = 30;
let _fileContactsCache = [];          // rows loaded so far, in the active view's order
let _fileContactsStart = 0;           // next offset to fetch
let _fileContactsTotalCount = 0;
let _fileContactsFlatLoaded = false;  // distinguishes "never loaded" from "loaded, zero results"
let _fileContactsLoadingMore = false;
let _fileContactsObserver = null;

let _fileContactsSortCol = 'name';
let _fileContactsSortDir = 'asc';

function sortFileContacts(col) {
  if (_fileContactsSortCol === col) _fileContactsSortDir = _fileContactsSortDir === 'asc' ? 'desc' : 'asc';
  else { _fileContactsSortCol = col; _fileContactsSortDir = 'asc'; }
  filterFileContactsTab();
}

function _fileContactsSortArrow(col) {
  return _sortArrow(_fileContactsSortCol, _fileContactsSortDir, col);
}

// Type and Portal-link are independent, combinable facets -- same pattern as
// the Unified/Portal Role+State cards. A file contact can hold several
// contact_type values at once (comma-separated), so the backend's Type facet
// filters by "list includes this value" rather than exclusive equality.
let _fileContactsTypeFilter   = null;  // e.g. 'Org Administrator', or null = every type
let _fileContactsLinkedFilter = null;  // '1' | '0' | null, matches the backend's linked param
let _fileContactsSummaryCards = [];

const _FILE_CONTACT_TYPES = Object.keys(CONTACT_TYPE_CLS);
const _FILE_CONTACT_TYPE_CARD = {
  'Org Administrator':                { bg: 'bg-primary bg-opacity-10',   text: 'text-primary',   icon: 'bi-shield-check' },
  'Org Editor':                       { bg: 'bg-success bg-opacity-10',   text: 'text-success',   icon: 'bi-pencil-square' },
  'Org Member':                       { bg: 'bg-secondary bg-opacity-10', text: 'text-secondary', icon: 'bi-person' },
  'Data Governance Officer':          { bg: 'bg-info bg-opacity-10',      text: 'text-info',      icon: 'bi-clipboard-data' },
  'Data Steward':                     { bg: 'bg-warning bg-opacity-10',   text: 'text-warning',   icon: 'bi-briefcase' },
  'Κεντρικός Διαχειριστής Οργανισμού': { bg: 'bg-secondary bg-opacity-10', text: 'text-secondary', icon: 'bi-award' },
};

function _fileContactsFilterIsActive(f) {
  if (f.type === 'type')   return _fileContactsTypeFilter   === f.value;
  if (f.type === 'linked') return _fileContactsLinkedFilter === f.value;
  return false;
}

function _renderFileContactsFilterGroup(elId, indices, tabDotId) {
  _renderFilterGroup(elId, indices, tabDotId, _fileContactsSummaryCards, _fileContactsFilterIsActive, 'setFileContactsFilter');
}

// typeCounts/linkedCounts come straight from the backend response
// ({total, items}/{total, has, none}) -- only present on a fresh page
// (start=0), same as the Dataset Catalog's facet counts. Called with no args
// to just re-render the last-known counts (e.g. after toggling a filter,
// before the new fetch resolves) using whatever's already in the cards array.
function renderFileContactsSummary(typeCounts, linkedCounts) {
  if (typeCounts) {
    const byName = {};
    typeCounts.items.forEach(i => { byName[i.name] = i.count; });
    _fileContactsSummaryCards = [
      { filter: { type: 'type', value: null }, label: t('contacts.total'), value: typeCounts.total, bg: "bg-secondary bg-opacity-10", text: "text-secondary", icon: "bi-people" },
      ..._FILE_CONTACT_TYPES.map(ty => ({
        filter: { type: 'type', value: ty },
        label: _CONTACT_TYPE_I18N_KEY[ty] ? t(_CONTACT_TYPE_I18N_KEY[ty]) : ty,
        value: byName[ty] || 0,
        ..._FILE_CONTACT_TYPE_CARD[ty],
      })),
      ..._fileContactsSummaryCards.filter(c => c.filter.type === 'linked'),
    ];
  }
  if (linkedCounts) {
    _fileContactsSummaryCards = [
      ..._fileContactsSummaryCards.filter(c => c.filter.type === 'type'),
      { filter: { type: 'linked', value: null }, label: t('contacts.total'),              value: linkedCounts.total, bg: "bg-secondary bg-opacity-10", text: "text-secondary", icon: "bi-people" },
      { filter: { type: 'linked', value: '1' },  label: t('contacts.has_portal_account'), value: linkedCounts.has,  bg: "bg-primary bg-opacity-10",   text: "text-primary",   icon: "bi-globe2" },
      { filter: { type: 'linked', value: '0' },  label: t('contacts.no_portal_account'),  value: linkedCounts.none, bg: "bg-secondary bg-opacity-10", text: "text-secondary", icon: "bi-file-earmark-person" },
    ];
  }
  if (!_fileContactsSummaryCards.length) {
    document.getElementById('fileContactsTypeSummary').innerHTML = '';
    document.getElementById('fileContactsLinkedSummary').innerHTML = '';
    return;
  }
  const typeIndices   = _fileContactsSummaryCards.map((_, i) => i).filter(i => _fileContactsSummaryCards[i].filter.type === 'type');
  const linkedIndices = _fileContactsSummaryCards.map((_, i) => i).filter(i => _fileContactsSummaryCards[i].filter.type === 'linked');
  _renderFileContactsFilterGroup('fileContactsTypeSummary',   typeIndices,   'fileContactsTypeTabDot');
  _renderFileContactsFilterGroup('fileContactsLinkedSummary', linkedIndices, 'fileContactsLinkedTabDot');
}

function setFileContactsFilter(idx) {
  const card = _fileContactsSummaryCards[idx];
  if (!card) return;
  const f = card.filter;
  if (f.type === 'type') _fileContactsTypeFilter = (_fileContactsTypeFilter === f.value) ? null : f.value;
  else if (f.type === 'linked') _fileContactsLinkedFilter = (_fileContactsLinkedFilter === f.value) ? null : f.value;
  filterFileContactsTab();
}

function clearFileContactsFilters() {
  _fileContactsTypeFilter = null;
  _fileContactsLinkedFilter = null;
  filterFileContactsTab();
}

// Query params shared by every /api/contacts call this view makes (the flat
// list, the org-group counts, and a single group's expand-fetch) -- so
// search/type/linked/sort always stay in sync across all three.
// Snapshot of _fileContactsQueryParams().toString() as of the last
// successful flat or grouped fetch -- same reasoning as Portal Members'
// _pmLoadedFingerprint (see its comment): the search box is shared between
// scopes, so switching here after typing a search term while on Portal
// Members needs this to force a fresh fetch instead of reusing a
// pre-search cache.
let _fileContactsLoadedFingerprint = null;

function _fileContactsQueryParams() {
  const p = new URLSearchParams();
  const search = (show('contactsSearch').value || '').trim();
  if (search) p.set('q', search);
  if (_fileContactsTypeFilter) p.set('type', _fileContactsTypeFilter);
  if (_fileContactsLinkedFilter) p.set('linked', _fileContactsLinkedFilter);
  p.set('sort', _fileContactsSortCol);
  p.set('dir', _fileContactsSortDir);
  return p;
}

function _fileContactTypeBadges(c) {
  const badges = (c.contact_type || '').split(',').map(s => s.trim()).filter(Boolean)
    .map(s => `<span class="badge me-1 ${CONTACT_TYPE_CLS[s] || 'bg-secondary'}" style="font-size:.7rem">${esc(_CONTACT_TYPE_I18N_KEY[s] ? t(_CONTACT_TYPE_I18N_KEY[s]) : s)}</span>`).join('');
  return badges || '<span class="text-muted small">—</span>';
}
// is_linked/linked_username now come straight from the backend (see
// _org_contacts_portal_link_info in app.py) -- no more client-side
// portal-cache lookups needed to know whether/who this contact is linked to.
// Rendered next to the contact's name (not its own column) -- mirrors
// _pmFileBadge's "only show something when the flag is true, silent
// otherwise" pattern (the opposite direction: Portal Members badges whoever
// ALSO has a file record, this badges whoever ALSO has a portal account).
function _fileContactPortalBadge(c) {
  if (!c.linked_username && !c.is_linked) return '';
  // Same fixed label for everyone (mirrors _pmFileBadge's plain "File" text)
  // -- the username, when known, only drives whether the badge is clickable
  // to open that user's panel, not what the badge itself says.
  const style = `font-size:.65rem;background:#e8f0fe;color:#1a56db${c.linked_username ? ';cursor:pointer' : ''}`;
  const onclick = c.linked_username
    ? ` onclick="event.stopPropagation();openUserPanel('${esc(c.linked_username)}')"`
    : '';
  return `<span class="badge rounded-pill" style="${style}" title="${esc(t('contacts.has_portal_account'))}"${onclick}><i class="bi bi-globe2 me-1"></i>Portal</span>`;
}
function _fileContactActions(c) {
  // Same panel the row click itself opens (openUserPanel for linked
  // contacts, openFileContactPanel otherwise), just straight into edit mode
  // -- pmEditModal (openPmEditFileContact) is retired from this button.
  const editOnclick = c.linked_username
    ? `openUserPanel('${esc(c.linked_username)}', true)`
    : `openFileContactPanel(${c.id}, true)`;
  return `<div class="d-flex gap-1">
      <button class="btn btn-outline-secondary btn-sm py-0 px-1" title="${esc(t('common.edit'))}"
        onclick="${editOnclick}"><i class="bi bi-pencil"></i></button>
      <button class="btn btn-outline-danger btn-sm py-0 px-1" title="${esc(t('common.delete'))}"
        onclick="deletePmContactRecord(${c.id}, ${c.linked_username ? `'${esc(c.linked_username)}'` : 'null'})"><i class="bi bi-trash"></i></button>
    </div>`;
}
// index === null renders the compact grouped-view row (no #/org columns,
// since a group card's own header already says which org); otherwise the
// full flat-view row.
function _fileContactRowHtml(c, index, reveal = false) {
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ');
  const nameCell = `<span class="fw-semibold">${esc(name) || '<span class="text-muted fst-italic">—</span>'}</span>${_rowMismatchIcon(_fileRowMismatch(c))} ${_fileContactPortalBadge(c)}`;
  const tail = `
    <td>${_fileContactTypeBadges(c)}</td>
    <td class="small" style="max-width:150px;overflow:hidden" onclick="event.stopPropagation()">
      ${c.email ? `<a class="d-block text-truncate" href="mailto:${esc(c.email)}" title="${esc(c.email)}">${esc(c.email)}</a>` : ''}
    </td>
    <td class="small text-nowrap" style="width:90px" onclick="event.stopPropagation()">
      ${c.tel ? `<a href="tel:${esc(c.tel)}" class="text-decoration-none"><i class="bi bi-telephone me-1"></i>${esc(c.tel)}</a>`
              : c.mobile ? `<a href="tel:${esc(c.mobile)}" class="text-decoration-none"><i class="bi bi-phone me-1"></i>${esc(c.mobile)}</a>` : ''}
    </td>
    <td onclick="event.stopPropagation()">${_fileContactActions(c)}</td>`;
  // Every row opens the same detail panel now -- linked contacts go to the
  // portal user panel (openUserPanel), unlinked ones get the file-only
  // variant (openFileContactPanel) since there's no CKAN account to fetch.
  const rowOnclick = ` style="cursor:pointer" onclick="${c.linked_username ? `openUserPanel('${esc(c.linked_username)}')` : `openFileContactPanel(${c.id})`}"`;
  if (index == null) {
    return `<tr${reveal ? ' class="just-revealed"' : ''}${rowOnclick}><td style="max-width:200px">${nameCell}</td>${tail}</tr>`;
  }
  const orgBadge = (c.org_label || c.org_code)
    ? `<span class="badge bg-light text-dark border" style="font-size:.7rem;max-width:140px;overflow:hidden;text-overflow:ellipsis;display:inline-block;white-space:nowrap"
         title="${esc(c.org_label || c.org_code)}">${esc(c.org_label || c.org_code)}</span>` : '—';
  return `<tr${rowOnclick}>
    <td class="text-muted small">${index}</td>
    <td style="max-width:200px">${nameCell}</td>
    <td style="max-width:180px">${orgBadge}</td>
    ${tail}
  </tr>`;
}

function _fileContactsRenderHeader() {
  const th = (col, label, extraStyle = '') =>
    `<th style="cursor:pointer;user-select:none;${extraStyle}" onclick="sortFileContacts('${col}')">${label}${_fileContactsSortArrow(col)}</th>`;
  document.querySelector('#fileContactsTable thead tr').innerHTML =
    `<th style="width:3rem">#</th>` +
    th('name',  t('contacts.col_name'))   +
    th('org',   t('contacts.col_org'))   +
    th('type',  t('contacts.col_type'))  +
    th('email', t('contacts.email'), 'width:150px') +
    `<th style="width:90px">${t('contacts.col_tel')}</th>` +
    `<th style="width:4rem"></th>`;
}

function _fileContactsUpdateCountLabel() {
  show('contactsCount').innerHTML = _fileContactsCache.length < _fileContactsTotalCount
    ? `${_fileContactsCache.length} / ${_fileContactsTotalCount}` : `${_fileContactsTotalCount}`;
}

function _ensureFileContactsObserver() {
  if (!_fileContactsObserver) {
    // Viewport-rooted, same as the Dataset Catalog -- this table grows with
    // the page rather than scrolling inside a fixed-height card, so the
    // same 400px pre-fetch margin applies unmodified.
    _fileContactsObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) _fileContactsLoadMoreTrigger();
    }, { rootMargin: '400px 0px' });
  }
  return _fileContactsObserver;
}
function _fileContactsLoadMoreTrigger() {
  if (_fileContactsLoadingMore || _fileContactsStart >= _fileContactsTotalCount) return;
  loadFileContactsTab(true);
}
// Keeps loading more pages while the sentinel is still on-screen -- plain
// IntersectionObserver only fires on enter/exit, so a short result list that
// never fully leaves the viewport would otherwise stop after one page (same
// reasoning as the Dataset Catalog's _catalogMaybeAutoLoadMore).
function _fileContactsMaybeAutoLoadMore() {
  const sentinel = document.getElementById('fileContactsLoadMoreSentinel');
  if (!sentinel || _fileContactsLoadingMore || _fileContactsStart >= _fileContactsTotalCount) return;
  const rect = sentinel.getBoundingClientRect();
  if (rect.top < window.innerHeight && rect.bottom >= 0) _fileContactsLoadMoreTrigger();
}

async function loadFileContactsTab(append = false) {
  if (_contactsScope !== 'file') return;
  if (!append) _fileContactsStart = 0;
  const sentinelBefore = document.getElementById('fileContactsLoadMoreSentinel');
  if (append) {
    _fileContactsLoadingMore = true;
    if (sentinelBefore) sentinelBefore.innerHTML = `<div class="spinner-border spinner-border-sm me-2"></div>${t('loading')}`;
  } else {
    if (_fileContactsObserver) _fileContactsObserver.disconnect();
    show('fileContactsTableBody').innerHTML = `<tr><td colspan="7" class="text-center py-5"><div class="spinner-border text-primary"></div></td></tr>`;
  }
  try {
    const params = _fileContactsQueryParams();
    params.set('rows', FILE_CONTACTS_PAGE_SIZE);
    params.set('start', _fileContactsStart);
    const resp = await fetch(API_BASE + 'api/contacts?' + params.toString());
    const data = await _fetchJsonOrThrow(resp);
    _fileContactsTotalCount = data.count || 0;
    if (!append) {
      _fileContactsCache = [];
      renderFileContactsSummary(data.type_counts, data.linked_counts);
      _fileContactsLoadedFingerprint = _fileContactsQueryParams().toString();
    }
    const newRows = data.contacts || [];
    _fileContactsCache = _fileContactsCache.concat(newRows);
    _fileContactsUpdateCountLabel();

    if (!append && !newRows.length) {
      show('fileContactsTableBody').innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">${t('contacts.no_results')}</td></tr>`;
    } else {
      const rowsHtml = newRows.map((c, i) => _fileContactRowHtml(c, _fileContactsStart + i + 1)).join('');
      if (append) {
        document.getElementById('fileContactsTableBody').insertAdjacentHTML('beforeend', rowsHtml);
      } else {
        _fileContactsRenderHeader();
        document.getElementById('fileContactsTableBody').innerHTML = rowsHtml;
      }
    }

    _fileContactsStart += newRows.length;

    const sentinel = document.getElementById('fileContactsLoadMoreSentinel');
    if (sentinel) {
      if (_fileContactsStart < _fileContactsTotalCount) {
        sentinel.innerHTML = '';
        _ensureFileContactsObserver().observe(sentinel);
      } else {
        _ensureFileContactsObserver().unobserve(sentinel);
        sentinel.innerHTML = data.count ? t('catalog.end_of_results') : '';
      }
    }
    if (!append) _fileContactsFlatLoaded = true;
  } catch (e) {
    if (!append) show('fileContactsTableBody').innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">${esc(e.message)}</td></tr>`;
  } finally {
    _fileContactsLoadingMore = false;
  }
  _fileContactsMaybeAutoLoadMore();
}

// ── File Contacts grouped-by-org view ───────────────────────────────────────
// Lazy by design: a lightweight group_by=org request gets accurate
// per-organization counts (one aggregate pass server-side, no row fetching)
// so every group card renders immediately with a correct badge; a group's
// actual rows are only fetched the first time it's expanded, then cached
// here so re-collapsing/re-expanding doesn't refetch. Filter/search/sort
// changes invalidate this cache (see filterFileContactsTab) since the
// underlying result set changed.
let _fileContactsGroups = [];                // [{org_code, org_label, count}]
let _fileContactsGroupsLoaded = false;
let _fileContactsExpandedOrgs = new Set();    // slugs ('__none__' for no-org)
const _fileContactsGroupRows = new Map();     // slug -> rows[]
const _fileContactsGroupLoading = new Set();  // slugs currently fetching
// Set right before a render call that should reveal-animate exactly the one
// group just toggled -- see _renderFileContactsGroups's comment.
let _fileContactsRevealKey = null;

function _fcGroupSlug(orgCode) { return orgCode || '__none__'; }
function _fcSlugToOrgParam(slug) { return slug === '__none__' ? '' : slug; }

async function _loadFileContactsGroups() {
  if (_contactsScope !== 'file') return;
  const el = show('fileContactsGroupedView');
  el.innerHTML = `<div class="text-center py-4"><div class="spinner-border text-primary"></div></div>`;
  try {
    const params = _fileContactsQueryParams();
    params.set('group_by', 'org');
    const resp = await fetch(API_BASE + 'api/contacts?' + params.toString());
    const data = await _fetchJsonOrThrow(resp);
    _fileContactsGroups = data.groups || [];
    _fileContactsGroupsLoaded = true;
    _fileContactsLoadedFingerprint = _fileContactsQueryParams().toString();
    _fileContactsGroupedCountLabel();
    _renderFileContactsGroups();
  } catch (e) {
    el.innerHTML = `<div class="alert alert-danger mb-0">${esc(e.message)}</div>`;
  }
}

// #contactsCount is shared with Portal Members' flat/grouped labels (see
// _pmFlatCountLabel/_pmGroupedCountLabel) -- re-asserting this on reuse
// (not just after a fresh fetch) is what makes toggling layouts/scopes
// without a refetch still show the right number.
function _fileContactsGroupedCountLabel() {
  const total = _fileContactsGroups.reduce((sum, g) => sum + (g.count || 0), 0);
  show('contactsCount').innerHTML = `${total}`;
}

function _renderFileContactsGroups() {
  const el = show('fileContactsGroupedView');
  if (!_fileContactsGroups.length) {
    el.innerHTML = `<p class="text-muted text-center py-4">${t('contacts.no_results')}</p>`;
    return;
  }
  // See Comms' _renderCommsOrgGroups / Portal Members' _renderPortalMembersGroups
  // -- same capture-and-clear reveal key.
  const revealKey = _fileContactsRevealKey;
  _fileContactsRevealKey = null;
  el.innerHTML = _fileContactsGroups.map(g => {
    const slug       = _fcGroupSlug(g.org_code);
    const isNone      = slug === '__none__';
    const isExpanded  = _fileContactsExpandedOrgs.has(slug);
    const isLoading   = _fileContactsGroupLoading.has(slug);
    const cachedRows  = _fileContactsGroupRows.get(slug);
    const reveal      = slug === revealKey;
    const gId = 'fcg_' + slug.replace(/\W/g, '_');
    let body = '';
    if (isExpanded) {
      body = (isLoading || !cachedRows)
        ? `<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div></div>`
        : `<table class="table table-hover table-sm align-middle mb-0"><tbody>${cachedRows.map(c => _fileContactRowHtml(c, null, reveal)).join('')}</tbody></table>`;
    }
    return `
    <div class="border rounded mb-2" ${isNone ? 'style="border-color:#fd7e14!important"' : ''}>
      <div class="d-flex align-items-center justify-content-between px-3 py-2 ${isNone ? 'comm-group-row-warn' : 'comm-group-row'}"
           style="cursor:pointer" onclick="toggleFileContactsOrg('${esc(slug)}')">
        <div class="d-flex align-items-center gap-2">
          <i class="bi bi-chevron-${isExpanded ? 'down' : 'right'} text-muted small"></i>
          <i class="bi bi-${isNone ? 'person-slash text-warning' : 'building text-primary'}"></i>
          <span class="fw-semibold small ${isNone ? 'text-warning-emphasis' : ''}">${esc(g.org_label || '(no organization)')}</span>
          <span class="badge ${isNone ? 'bg-warning text-dark' : 'bg-secondary'} rounded-pill">${g.count}</span>
        </div>
        ${!isNone ? `<button class="btn btn-outline-primary btn-sm py-0 px-2" title="${esc(g.org_label)}"
          onclick="event.stopPropagation();openOrgPanel('${esc(slug)}')">
          <i class="bi bi-box-arrow-up-right"></i>
        </button>` : ''}
      </div>
      <div id="${gId}" class="${isExpanded ? '' : 'd-none'} px-3">${body}</div>
    </div>`;
  }).join('');
}

async function _fetchFileContactsGroupRows(slug) {
  if (_fileContactsGroupRows.has(slug) || _fileContactsGroupLoading.has(slug)) return;
  _fileContactsGroupLoading.add(slug);
  try {
    const params = _fileContactsQueryParams();
    params.set('org', _fcSlugToOrgParam(slug));
    params.set('rows', 200);  // generous cap for a single org; larger ones would need their own load-more
    params.set('start', 0);
    const resp = await fetch(API_BASE + 'api/contacts?' + params.toString());
    const data = await _fetchJsonOrThrow(resp);
    _fileContactsGroupRows.set(slug, data.contacts || []);
  } catch (e) {
    _fileContactsGroupRows.set(slug, []);
  } finally {
    _fileContactsGroupLoading.delete(slug);
  }
}

function toggleFileContactsOrg(slug) {
  const el = show('fileContactsGroupedView');
  if (_fileContactsExpandedOrgs.has(slug)) {
    _fileContactsExpandedOrgs.delete(slug);
    _animateHeightSwap(el, _renderFileContactsGroups);
    return;
  }
  _fileContactsExpandedOrgs.add(slug);
  // See Comms' toggleOrgComms for the full reasoning behind the delay.
  const spinnerTimer = setTimeout(() => { _fileContactsRevealKey = slug; _animateHeightSwap(el, _renderFileContactsGroups); }, COMMS_SPINNER_DELAY_MS);
  _fetchFileContactsGroupRows(slug).then(() => {
    clearTimeout(spinnerTimer);
    _fileContactsRevealKey = slug;
    _animateHeightSwap(el, _renderFileContactsGroups);
  });
}

// Throttled (not all-at-once): fires a bounded number of concurrent
// per-group fetches rather than one request per organization simultaneously,
// which could otherwise burst dozens of requests at once on a large org list.
async function expandAllFileContacts() {
  const slugs = _fileContactsGroups.map(g => _fcGroupSlug(g.org_code)).filter(s => !_fileContactsExpandedOrgs.has(s));
  if (!slugs.length) return;
  const btn = show('contactsExpandAllBtn');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
  slugs.forEach(s => _fileContactsExpandedOrgs.add(s));
  _renderFileContactsGroups();
  const CONCURRENCY = 4;
  let next = 0;
  async function worker() {
    while (next < slugs.length) {
      const slug = slugs[next++];
      await _fetchFileContactsGroupRows(slug);
      _renderFileContactsGroups();
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, slugs.length) }, worker));
  btn.disabled = false;
  btn.innerHTML = originalHtml;
}

function collapseAllFileContacts() {
  _fileContactsExpandedOrgs.clear();
  _renderFileContactsGroups();
}

// Re-syncs whichever layout (flat/grouped) is currently selected without
// invalidating anything -- used when just switching scope or toggling
// All/By-Organization, as opposed to filterFileContactsTab() below, which
// is for when the actual result set has changed.
function _fileContactsSyncView() {
  // See _pmSyncView's matching comment -- the search box (and type/linked
  // facet filters) are shared with Portal Members, but only the *active*
  // scope invalidates its own cache when one changes.
  const stale = _fileContactsQueryParams().toString() !== _fileContactsLoadedFingerprint;
  if (_contactsViewMode === 'grouped') {
    if (_fileContactsGroupsLoaded && !stale) { _renderFileContactsGroups(); _fileContactsGroupedCountLabel(); }
    else _loadFileContactsGroups();
  } else if (!_fileContactsFlatLoaded || stale) {
    loadFileContactsTab(false);
  } else {
    _fileContactsUpdateCountLabel();
  }
}

// Search box / sort click / filter card click all funnel here -- the result
// set has genuinely changed, so both view modes' cached data are stale.
function filterFileContactsTab() {
  if (_contactsScope !== 'file') return;
  _fileContactsCache = [];
  _fileContactsTotalCount = 0;
  _fileContactsFlatLoaded = false;
  _fileContactsGroups = [];
  _fileContactsGroupsLoaded = false;
  _fileContactsGroupRows.clear();
  _fileContactsExpandedOrgs.clear();
  renderFileContactsSummary();  // repaint cards' active state immediately; counts refresh once the fetch below resolves
  _fileContactsSyncView();
}

function _findLoadedFileContact(id) {
  const inFlat = (_fileContactsCache || []).find(c => c.id === id);
  if (inFlat) return inFlat;
  for (const rows of _fileContactsGroupRows.values()) {
    const found = rows.find(c => c.id === id);
    if (found) return found;
  }
  return null;
}

// Org search picker helper (_orgSearchDropdown) and its _ORGS_CACHE_KEY
// localStorage fallback live in org_search.js, loaded before this file.
function _commAllContacts() {
  const contacts = [];
  const seen = new Set();
  for (const m of (_portalMembersCache || [])) {
    if (!m.contact_id || seen.has(m.contact_id)) continue;
    seen.add(m.contact_id);
    contacts.push({
      id: m.contact_id, first_name: m.contact_first_name, last_name: m.contact_last_name,
      position: m.contact_position, email: m.contact_email, tel: m.contact_tel,
      org_code: m.org_name || '', org_label: m.org_title || m.org_name || '',
    });
  }
  for (const c of (_pmUnmatched || [])) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    contacts.push({
      id: c.id, first_name: c.first_name, last_name: c.last_name,
      position: c.position, email: c.email, tel: c.tel,
      org_code: c.org_code || '', org_label: c.org_label || c.org_code || '',
    });
  }
  return contacts.filter(c => c.first_name || c.last_name);
}
function _commContactLabel(c) {
  return [c.first_name, c.last_name].filter(Boolean).join(' ') + (c.position ? ' (' + c.position + ')' : '');
}
function _commContactName(c) {
  return [c.first_name, c.last_name].filter(Boolean).join(' ');
}

let _commContactSearchResults = [];

function _commOrgSearch(q) {
  const dd = document.getElementById('commOrgDropdown');
  const nq = _ns((q || '').trim());

  const ckanPool = _orgsData.length ? _orgsData : (() => {
    try { const c = JSON.parse(localStorage.getItem(_ORGS_CACHE_KEY) || 'null'); return (c && c.data) || []; } catch(_) { return []; }
  })();
  const ckanMatches = nq
    ? ckanPool.filter(o => _ns(o.title).includes(nq) || _ns(o.name).includes(nq)).slice(0, 10)
    : ckanPool.slice(0, 20);
  const hrmsMatches = nq && _publicOrgs.length
    ? _publicOrgs.filter(o => !(_ckanByHrms && _ckanByHrms.get(o.code)) && _ns(o.label).includes(nq)).slice(0, 5)
    : [];
  const contactMatches = nq
    ? _commAllContacts().filter(c => _ns(_commContactLabel(c)).includes(nq)).slice(0, 10)
    : [];
  _commContactSearchResults = contactMatches;

  if (!ckanMatches.length && !hrmsMatches.length && !contactMatches.length) { dd.classList.add('d-none'); return; }

  dd.innerHTML = [
    ...contactMatches.map((c, i) =>
      `<li class="list-group-item list-group-item-action py-2 px-2" style="cursor:pointer"
           onmousedown="_commContactPick(${i})">
         <i class="bi bi-person-fill me-1 text-primary"></i><span class="fw-semibold">${esc(_commContactName(c))}</span>
         <span class="badge bg-light text-dark border ms-1">${esc(c.org_label)}</span></li>`
    ),
    ...ckanMatches.map(o =>
      `<li class="list-group-item list-group-item-action py-2 px-2" style="cursor:pointer"
           data-code="${esc(o.name)}" data-label="${esc(o.title)}"
           onmousedown="_commOrgSelect(this.dataset.code,this.dataset.label)">
         <i class="bi bi-building me-1 text-muted"></i><span class="fw-semibold">${esc(o.title)}</span></li>`
    ),
    ...hrmsMatches.map(o =>
      `<li class="list-group-item list-group-item-action py-2 px-2" style="cursor:pointer"
           data-code="${esc(o.code)}" data-label="${esc(o.label)}"
           onmousedown="_commOrgSelect(this.dataset.code,this.dataset.label)">
         <i class="bi bi-building me-1 text-muted"></i><span class="fw-semibold">${esc(o.label)}</span>
         <span class="badge bg-secondary ms-1" style="font-size:.75rem">HRMS only</span></li>`
    ),
  ].join('');
  dd.classList.remove('d-none');
}

function _commContactPick(i) {
  const c = _commContactSearchResults[i];
  if (!c) return;
  // Contacts are keyed by HRMS org_code/label; communications must be keyed by the
  // CKAN slug (what the org panel filters by), or this comm silently won't show up
  // there. Resolve through the same alias map _orgCodeMatches uses, when available.
  const ckanCode = (_ckanByHrms && _ckanByHrms.get(c.org_code)) || c.org_code;
  _commOrgSet(ckanCode, c.org_label);
  onCommOrgInput([{ id: c.id != null ? c.id : null, label: _commContactLabel(c) }]);
}
function _commOrgSet(code, label) {
  show('commOrgCode').value  = code;
  show('commOrgLabel').value = label;
  show('commOrgSearch').value = '';
  document.getElementById('commOrgDropdown').classList.add('d-none');
  show('commOrgBadge').textContent = label || code;
  show('commOrgSelected').classList.remove('d-none');
  show('commOrgSearch').classList.add('d-none');
}
function _commOrgSelect(code, label) {
  _commOrgSet(code, label);
  onCommOrgInput();
}
function _commOrgClear() {
  show('commOrgCode').value  = '';
  show('commOrgLabel').value = '';
  show('commOrgSearch').value = '';
  show('commOrgSelected').classList.add('d-none');
  show('commOrgSearch').classList.remove('d-none');
  show('commOrgSearch').focus();
  _resetCommContact();
}
function _commOrgReset() {
  show('commOrgCode').value  = '';
  show('commOrgLabel').value = '';
  show('commOrgSearch').value = '';
  document.getElementById('commOrgDropdown').classList.add('d-none');
  show('commOrgSelected').classList.add('d-none');
  show('commOrgSearch').classList.remove('d-none');
  _setOrgLocked(false);
}

function _setOrgLocked(locked) {
  show('commOrgClearBtn').classList.toggle('d-none', locked);
  show('commOrgLockedHint').classList.toggle('d-none', !locked);
}

async function deletePmContactRecord(contactId, username) {
  // Deleting a contact severs its credit on every Communication it's
  // linked to (the Communications themselves are kept, see /api/contacts/
  // remove) -- worth a specific warning instead of the generic confirm,
  // since that attribution loss isn't otherwise obvious from this list.
  let linkedCount = 0;
  try {
    const usage = await fetch(`${API_BASE}api/contacts/id/${contactId}/usage`).then(r => r.ok ? r.json() : {});
    linkedCount = usage.communication_count || 0;
  } catch (_) {}
  const confirmMsg = linkedCount > 0
    ? t('contacts.delete_confirm_linked').replace('{n}', linkedCount)
    : t('contacts.delete_confirm');
  confirmDangerAction(confirmMsg, async () => {
    try {
      await fetch(`${API_BASE}api/contacts/remove?d=${_b64enc({id: contactId})}`, { method: 'DELETE', cache: 'no-store' });
      if (username && _portalMembersCache) {
        _portalMembersCache.forEach(m => {
          if (m.username === username) {
            m.contact_id = null; m.contact_name = ''; m.contact_first_name = '';
            m.contact_last_name = ''; m.contact_position = ''; m.contact_type = '';
            m.contact_tel = ''; m.contact_mobile = ''; m.contact_email = '';
          }
        });
        _pmSaveCache(_portalMembersCache, _pmUnmatched);
      } else {
        _pmUnmatched = _pmUnmatched.filter(c => c.id !== contactId);
        _pmSaveCache(_portalMembersCache || [], _pmUnmatched);
      }
      // filterContactsTab() below already does a full refetch if File
      // Contacts is the active scope (simplest way to keep counts/groups
      // consistent) -- when it's not, just patch the caches so a later
      // switch there without an intervening filter change (see
      // _fileContactsSyncView) doesn't show a deleted row.
      if (_contactsScope !== 'file') {
        _fileContactsCache = _fileContactsCache.filter(c => c.id !== contactId);
        _fileContactsGroupRows.clear();
        _fileContactsGroups = [];
        _fileContactsGroupsLoaded = false;
      }
      _allContacts = null; _allUnified = null;
      filterContactsTab();
      if (document.getElementById('orgContactsPanel')?.classList.contains('show')) _renderOrgContactsPanel();
      loadContactSummary();
    } catch (e) {
      alert(t('contacts.delete_failed') + ' ' + e.message);
    }
  });
}

// Shared by saveUserPanelEdit -- everything a save needs to do to the
// in-memory caches once /api/contacts/save has responded.
function _applyContactSaveResult(data, username, contactId) {
  const savedEmail = (data.email || '').toLowerCase().trim();
  const applyToPortalRow = m => {
    m.contact_id         = data.id;
    m.contact_first_name = data.first_name || '';
    m.contact_last_name  = data.last_name  || '';
    m.contact_name       = `${data.first_name || ''} ${data.last_name || ''}`.trim();
    m.contact_position   = data.position     || '';
    m.contact_type       = data.contact_type || '';
    m.contact_tel        = data.tel          || '';
    m.contact_mobile     = data.mobile       || '';
    m.contact_email      = data.email        || '';
    m.contact_org_codes  = data.org_codes    || [];
  };
  // Already-matched file contacts opened from the File Contacts view carry no
  // username (that field only gets set when the edit was opened from a portal
  // row) — look them up by contact_id so editing them updates the linked
  // portal row(s) in place instead of misfiling them as newly unmatched.
  const existingPortalMatches = contactId && _portalMembersCache
    ? _portalMembersCache.filter(m => String(m.contact_id) === String(contactId))
    : [];

  if (username && _portalMembersCache) {
    // Editing a known portal member
    _portalMembersCache.forEach(m => { if (m.username === username) applyToPortalRow(m); });
    filterContactsTab();
  } else if (!contactId && savedEmail && _portalMembersCache) {
    // New contact — check if email matches a portal member
    const matched = _portalMembersCache.filter(m => (m.email || '').toLowerCase() === savedEmail);
    if (matched.length) {
      matched.forEach(applyToPortalRow);
      filterContactsTab();
    } else {
      _pmUnmatched.unshift(data);
    }
  } else if (existingPortalMatches.length) {
    existingPortalMatches.forEach(applyToPortalRow);
    filterContactsTab();
  } else {
    // Editing an existing unmatched contact
    const idx = _pmUnmatched.findIndex(c => c.id === data.id);
    if (idx >= 0) _pmUnmatched[idx] = data;
    else _pmUnmatched.unshift(data);
  }
  // Same reasoning as deletePmContactRecord above: a full refetch when File
  // Contacts is the active scope, otherwise just patch/invalidate its caches
  // for next time.
  if (_contactsScope === 'file') {
    filterFileContactsTab();
  } else {
    const fIdx = _fileContactsCache.findIndex(c => c.id === data.id);
    if (fIdx >= 0) _fileContactsCache[fIdx] = data;
    else _fileContactsCache.unshift(data);
    _fileContactsGroupRows.clear();
    _fileContactsGroups = [];
    _fileContactsGroupsLoaded = false;
  }
  _pmSaveCache(_portalMembersCache, _pmUnmatched);
  if (document.getElementById('orgContactsPanel')?.classList.contains('show')) _renderOrgContactsPanel();
  loadContactSummary();
  // If opened from the comm modal, refresh its contact list and add the new
  // person to whatever's already selected -- onCommOrgInput() would work
  // too, but it fully resets the picker, discarding any other contacts
  // already added as chips before this one was created.
  if (document.getElementById('commModal')?.classList.contains('show')) {
    _addNewlyCreatedCommContact(data);
  }
}

function _addNewlyCreatedCommContact(data) {
  const orgCode = show('commOrgCode').value;
  if (!orgCode) return;
  const apply = (contacts) => {
    const keep = _commSelectedContacts;
    _commOrgContacts = contacts.map(_buildCommContactEntry);
    // Re-resolve the preserved selection by id against the refreshed list
    // (falling back to the stale entry if it somehow vanished) instead of
    // just keeping the old array as-is, so it reflects anything the
    // refresh changed about them.
    _commSelectedContacts = keep.map(k => (k.id != null && _commOrgContacts.find(c => c.id === k.id)) || k);
    if ((data.first_name || data.last_name) && !_commSelectedContacts.some(c => c.id != null && c.id === data.id)) {
      _commSelectedContacts.push(_commOrgContacts.find(c => c.id === data.id) || _buildCommContactEntry(data));
    }
    show('commContactSection').classList.remove('d-none');
    _renderCommContactPicker();
    _renderCommContactChips();
  };
  if (_portalMembersCache !== null) {
    apply(_getContactsForOrg(orgCode));
  } else {
    fetch(API_BASE + 'api/contacts/' + encodeURIComponent(orgCode)).then(r => r.json()).then(apply).catch(() => {});
  }
}

const CONTACTS_EXPORT_COLUMNS = [
  { key: 'org',          i18n: 'contacts.export_col_org' },
  { key: 'first_name',   i18n: 'contacts.export_col_first_name' },
  { key: 'last_name',    i18n: 'contacts.export_col_last_name' },
  { key: 'position',     i18n: 'contacts.export_col_position' },
  { key: 'role',         i18n: 'contacts.export_col_role' },
  { key: 'state',        i18n: 'contacts.export_col_state' },
  { key: 'username',     i18n: 'contacts.export_col_username' },
  { key: 'email',        i18n: 'contacts.export_col_email' },
  { key: 'tel',          i18n: 'contacts.export_col_tel' },
  { key: 'mobile',       i18n: 'contacts.export_col_mobile' },
  { key: 'created_at',   i18n: 'contacts.export_col_created_at' },
];
const CONTACTS_EXPORT_COLS_STORAGE_KEY = 'contactsExportColumns';

let _contactsExportModal = null;

function _contactsExportFilterLabel() {
  const parts = [];
  const search = (show('contactsSearch').value || '').trim();
  if (search) parts.push(`"${search}"`);
  if (_contactsRoleFilter) {
    const card = _contactsSummaryCards.find(c => c.filter.type === 'role' && c.filter.value === _contactsRoleFilter);
    if (card) parts.push(card.label);
  }
  if (_contactsStateFilter) {
    const card = _contactsSummaryCards.find(c => c.filter.type === 'state' && c.filter.value === _contactsStateFilter);
    if (card) parts.push(card.label);
  }
  return parts.length ? parts.join(' + ') : t('contacts.export_filter_none');
}

function openContactsExportModal() {
  if (!_contactsExportModal) _contactsExportModal = new bootstrap.Modal(document.getElementById('contactsExportModal'));
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(CONTACTS_EXPORT_COLS_STORAGE_KEY) || 'null'); } catch (e) {}
  show('contactsExportError').classList.add('d-none');
  show('contactsExportAnonymize').checked = false;
  show('contactsExportFilterHint').textContent = `${t('contacts.export_filter_label')}: ${_contactsExportFilterLabel()}`;
  show('contactsExportColumns').innerHTML = CONTACTS_EXPORT_COLUMNS.map(c => `
    <div class="form-check">
      <input class="form-check-input" type="checkbox" id="expcol_${c.key}" ${(!saved || saved.includes(c.key)) ? 'checked' : ''}>
      <label class="form-check-label small" for="expcol_${c.key}">${t(c.i18n)}</label>
    </div>`).join('');
  _contactsExportModal.show();
}

function _setContactsExportCols(checked) {
  CONTACTS_EXPORT_COLUMNS.forEach(c => {
    const el = document.getElementById('expcol_' + c.key);
    if (el) el.checked = checked;
  });
}

function submitContactsExport() {
  const selected = CONTACTS_EXPORT_COLUMNS
    .map(c => c.key)
    .filter(key => document.getElementById('expcol_' + key)?.checked);
  if (!selected.length) {
    show('contactsExportError').classList.remove('d-none');
    return;
  }
  localStorage.setItem(CONTACTS_EXPORT_COLS_STORAGE_KEY, JSON.stringify(selected));
  const search = (show('contactsSearch').value || '').trim();
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (_contactsRoleFilter) params.set('role', _contactsRoleFilter);
  if (_contactsStateFilter) params.set('state', _contactsStateFilter);
  selected.forEach(key => params.append('columns', key));
  if (show('contactsExportAnonymize').checked) params.set('anonymize', '1');
  window.location = API_BASE + 'api/contacts/export?' + params.toString();
  _contactsExportModal.hide();
}

let _liveMap = null;
const _liveMarkers = new Map();  // id_visit -> {marker, removedAt: null|epochSeconds}
const LIVE_MAP_EXIT_FADE_SECONDS = 8;  // how long a marker takes to fade once it drops off the list

// Shared by both the marker map and the list's own row rendering so the two
// always agree on which key identifies "the same visit" -- id_visit when
// Matomo gives one (always, in practice), falling back to a composite key
// for the rare visit missing it rather than dropping it from either side.
function _liveVisitKey(v) {
  return v.id_visit ?? `${v.lat},${v.lon},${v.timestamp}`;
}

const LIVE_MARKER_COLOR = '#dc3545';
const LIVE_MARKER_SELECTED_COLOR = '#ffc107';
const LIVE_TOOLTIP_AUTOCLOSE_MS = 2500;

// Selecting a visit recolors its marker so the selection persists on the
// map -- with several markers clustered close together (e.g. multiple
// Athens visits), that's a clearer indicator than a label. The tooltip
// still pops up too (so a click still names the place), but only briefly:
// openTooltip() forces it open regardless of hover and Leaflet never closes
// it again on its own, so left alone it would stay stuck open forever.
let _liveSelectedMarker = null;
let _liveTooltipTimer = null;

// Leaflet's own opacity-transition CSS for tooltips (.leaflet-fade-anim
// .leaflet-tooltip) doesn't end up applying to a tooltip force-opened via
// openTooltip() here, so closeTooltip() just snaps it away instantly.
// Fading it out by hand on the actual DOM node first -- cheap, it's one
// small element and a single CSS transition -- then closing for real once
// the transition's had time to finish.
const LIVE_TOOLTIP_FADE_MS = 200;
function _closeMarkerTooltipFaded(marker) {
  if (!marker || !marker.isTooltipOpen || !marker.isTooltipOpen()) {
    if (marker) marker.closeTooltip();
    return;
  }
  const el = marker.getTooltip().getElement();
  if (!el) { marker.closeTooltip(); return; }
  el.style.transition = `opacity ${LIVE_TOOLTIP_FADE_MS}ms ease`;
  el.style.opacity = '0';
  setTimeout(() => marker.closeTooltip(), LIVE_TOOLTIP_FADE_MS);
}

// Clicking either a map marker or a list row selects both -- pans to,
// recolors, and briefly labels the marker, and highlights the matching row
// (or vice versa). A visit with no lat/lon never got a marker in the first
// place (see _updateLiveMapMarkers), so the map side is silently skipped
// for those; the row still highlights on its own.
function _selectLiveVisit(key) {
  if (_liveTooltipTimer) {
    clearTimeout(_liveTooltipTimer);
    _liveTooltipTimer = null;
  }
  if (_liveSelectedMarker) {
    _closeMarkerTooltipFaded(_liveSelectedMarker);
    _liveSelectedMarker.setStyle({ color: LIVE_MARKER_COLOR, fillColor: LIVE_MARKER_COLOR });
    _liveSelectedMarker = null;
  }
  const entry = _liveMarkers.get(key);
  if (entry && _liveMap) {
    const marker = entry.marker;
    _liveMap.panTo(marker.getLatLng());
    marker.setStyle({ color: LIVE_MARKER_SELECTED_COLOR, fillColor: LIVE_MARKER_SELECTED_COLOR });
    marker.openTooltip();
    _liveTooltipTimer = setTimeout(() => {
      _closeMarkerTooltipFaded(marker);
      _liveTooltipTimer = null;
    }, LIVE_TOOLTIP_AUTOCLOSE_MS);
    _liveSelectedMarker = marker;
  }
  document.querySelectorAll('#liveVisitorsList tr.live-row-selected')
    .forEach(el => el.classList.remove('live-row-selected'));
  const row = document.querySelector(`#liveVisitorsList tr[data-visit-key="${CSS.escape(String(key))}"]`);
  if (row) {
    row.classList.add('live-row-selected');
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function _initLiveMap() {
  if (_liveMap || typeof L === 'undefined') return;
  _liveMap = L.map('liveVisitorsMap', { attributionControl: true, scrollWheelZoom: true })
    .setView([30, 15], 2);
  _liveMap.attributionControl.setPrefix(false);  // drops Leaflet's own logo/link from the attribution
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19, subdomains: 'abcd',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(_liveMap);

  // Leaflet measures its container once at init, but this runs very early
  // (straight from DOMContentLoaded) -- web fonts loading, the stat cards
  // above it resolving, a sidebar toggle, etc. can all still resize this
  // container afterward, and Leaflet never re-checks on its own. Unlike the
  // geo-insights map (hidden tab-pane -> shown.bs.tab is the one trigger that
  // matters there), there's no single event to hook here, so a ResizeObserver
  // catches whichever one actually fires instead of guessing.
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => _liveMap.invalidateSize())
      .observe(document.getElementById('liveVisitorsMap'));
  }
}

function _updateLiveMapMarkers(visits) {
  if (!_liveMap) return;
  const currentKeys = new Set();
  for (const v of visits) {
    if (v.lat == null || v.lon == null) continue;
    const key = _liveVisitKey(v);
    currentKeys.add(key);
    if (_liveMarkers.has(key)) {
      // still in the list — cancel any fade-out in case it had just started
      const entry = _liveMarkers.get(key);
      if (entry.removedAt != null) {
        entry.removedAt = null;
        entry.marker.setStyle({ opacity: 1, fillOpacity: 0.6 });
      }
      continue;
    }
    const marker = L.circleMarker([v.lat, v.lon], {
      radius: 6, color: LIVE_MARKER_COLOR, fillColor: LIVE_MARKER_COLOR, fillOpacity: 0.6, weight: 1, opacity: 1,
    }).bindTooltip(`${esc(v.city ? v.city + ', ' : '')}${esc(v.country || t('live.unknown'))}`)
      .on('click', () => _selectLiveVisit(key));
    marker.addTo(_liveMap);
    _liveMarkers.set(key, { marker, removedAt: null });
  }
  // A marker starts fading only once its visit has dropped off the list
  const nowSec = Date.now() / 1000;
  for (const [key, entry] of _liveMarkers) {
    if (!currentKeys.has(key) && entry.removedAt == null) {
      entry.removedAt = nowSec;
    }
  }
}

function _fadeLiveMapMarkers() {
  if (!_liveMap) return;
  const nowSec = Date.now() / 1000;
  for (const [key, entry] of _liveMarkers) {
    if (entry.removedAt == null) continue;  // still in the list — stay at full opacity
    const age = nowSec - entry.removedAt;
    if (age >= LIVE_MAP_EXIT_FADE_SECONDS) {
      _liveMap.removeLayer(entry.marker);
      _liveMarkers.delete(key);
      continue;
    }
    const frac = 1 - (age / LIVE_MAP_EXIT_FADE_SECONDS);
    entry.marker.setStyle({ opacity: frac, fillOpacity: frac * 0.6 });
  }
}

// Actual flag images (flag-icons lib) instead of Unicode flag emoji — regional-indicator
// emoji don't render as flags on every OS/font (notably plain two-letter codes on Windows).
function flagHtml(cc) {
  return (cc && /^[a-z]{2}$/.test(cc) && cc !== 'xx')
    ? `<span class="fi fi-${cc}" style="border-radius:2px"></span>`
    : `<i class="bi bi-globe2 text-muted"></i>`;
}

async function loadLiveVisitors() {
  const el      = document.getElementById('liveVisitorsList');
  const countEl = document.getElementById('liveActiveCount');
  _initLiveMap();
  try {
    const resp = await fetch(`${API_BASE}api/matomo/live?limit=15&minutes=30`, {cache: 'no-store'});
    const data = await resp.json();
    if (data.error) {
      countEl.textContent = '—';
      el.innerHTML = `<p class="text-muted text-center py-3 mb-0 small">${esc(data.error)}</p>`;
      return;
    }
    _updateLiveMapMarkers(data.visits || []);
    countEl.textContent = fmt(data.active_visitors ?? data.active_visits ?? 0);
    if (!data.visits || !data.visits.length) {
      el.innerHTML = `<p class="text-muted text-center py-3 mb-0 small">${t('live.none')}</p>`;
      return;
    }
    // Confirmed real values from Matomo: "Desktop", "Smartphone", "Tablet", etc.
    const deviceIcon = {
      desktop: 'bi-display', smartphone: 'bi-phone', phablet: 'bi-phone', tablet: 'bi-tablet',
      tv: 'bi-tv', 'smart display': 'bi-tv', console: 'bi-controller', camera: 'bi-camera',
      'car browser': 'bi-car-front', 'portable media player': 'bi-music-player-fill',
    };
    const deviceIconFor = (d) => deviceIcon[(d || '').toLowerCase()] || 'bi-question-circle';
    const nowSec = Date.now() / 1000;
    const relTime = (ts, fallback) => {
      if (!ts) return fallback || '';
      const mins = Math.max(0, Math.round((nowSec - ts) / 60));
      return mins < 1 ? t('live.just_now') : (mins + t('live.min_ago'));
    };
    el.innerHTML = `
      <div class="table-responsive" style="max-height:320px;overflow-y:auto">
        <table class="table table-sm table-hover align-middle mb-0">
          <thead>
            <tr>
              <th class="small text-muted fw-semibold" style="width:80px">${t('live.col_time')}</th>
              <th class="small text-muted fw-semibold" style="width:32px"></th>
              <th class="small text-muted fw-semibold">${t('live.col_location')}</th>
              <th class="small text-muted fw-semibold text-center" style="width:32px" title="${t('live.col_device')}"><i class="bi bi-display"></i></th>
              <th class="small text-muted fw-semibold">${t('live.col_browser')}</th>
              <th class="small text-muted fw-semibold text-end" style="width:60px">${t('live.col_actions')}</th>
            </tr>
          </thead>
          <tbody>
            ${data.visits.map(v => `
              <tr data-visit-key="${esc(String(_liveVisitKey(v)))}" style="cursor:pointer" onclick='_selectLiveVisit(${JSON.stringify(_liveVisitKey(v))})'>
                <td class="text-nowrap small text-muted" style="width:80px">${esc(relTime(v.timestamp, v.time_pretty))}</td>
                <td style="width:32px" class="text-center fs-5" title="${esc(v.country || '')}">${flagHtml(v.country_code)}</td>
                <td class="small">
                  <span class="fw-semibold">${esc(v.country || t('live.unknown'))}</span>
                  ${v.city ? `<span class="text-muted"> — ${esc(v.city)}</span>` : ''}
                  <div class="text-truncate" style="max-width:320px" title="${esc(v.last_page_url || v.last_page || '')}">
                    ${v.last_page_url
                      ? `<a href="${esc(v.last_page_url)}" target="_blank" rel="noopener" class="text-muted">${esc(v.last_page || v.last_page_url)}</a>`
                      : `<span class="text-muted">${esc(v.last_page || '')}</span>`}
                  </div>
                </td>
                <td class="text-muted small text-center" style="width:32px" title="${esc(v.device_type || '')}"><i class="bi ${deviceIconFor(v.device_type)}"></i></td>
                <td class="text-muted small text-nowrap" style="width:90px">${esc(v.browser || '')}</td>
                <td class="text-muted small text-end text-nowrap" style="width:60px">${v.actions} <i class="bi bi-arrow-right-short"></i></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (e) {
    countEl.textContent = '—';
    el.innerHTML = `<p class="text-danger text-center py-3 mb-0 small">${esc(e.message)}</p>`;
  }
}

// ── Toast notifications ─────────────────────────────────────────────────────
function showToast(title, body, { onClick } = {}) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast align-items-center border-0 shadow';
  el.setAttribute('role', 'alert');
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body"${onClick ? ' style="cursor:pointer"' : ''}>
        <div class="fw-semibold">${esc(title)}</div>
        <div class="small">${esc(body)}</div>
      </div>
      <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>`;
  if (onClick) el.querySelector('.toast-body').addEventListener('click', onClick);
  container.appendChild(el);
  const toast = new bootstrap.Toast(el, { delay: 8000 });
  el.addEventListener('hidden.bs.toast', () => el.remove());
  toast.show();
}

// ── Live Comms notifications (Server-Sent Events) ───────────────────────────
// One stream covers both a new inbound email needing review and a new
// Communication being logged (by hand or auto-captured) -- a single bounded
// connection per open dashboard tab, not two. A long poll, not a permanent
// socket: the server deliberately ends the stream every ~55s so it can never pin a worker
// indefinitely, and the browser's EventSource auto-reconnects on that close
// the same as any other -- onerror fires on *every* one of those routine
// cycles, not just genuine failures, so onopen (a successful (re)connect) is
// what resets the failure streak; only failures that never make it back to
// OPEN accumulate.
let _commsLiveSource = null;
let _commsLiveErrorStreak = 0;

function _startCommsLiveStream() {
  if (ALLOWED_TABS && !ALLOWED_TABS.includes('comms')) return;  // no Comms access -- nothing to stream
  if (_commsLiveSource) return;
  _commsLiveSource = new EventSource(API_BASE + 'api/communications/stream');
  _commsLiveSource.onopen = () => { _commsLiveErrorStreak = 0; };
  _commsLiveSource.onerror = () => {
    if (++_commsLiveErrorStreak > 5) {
      _commsLiveSource.close();
      _commsLiveSource = null;
    }
  };
  _commsLiveSource.addEventListener('new_inbound_email', ev => {
    let items;
    try { items = JSON.parse(ev.data); } catch (_) { return; }
    if (!Array.isArray(items) || !items.length) return;

    const first = items[0];
    const who = first.from_name || first.from_email || '';
    const body = items.length === 1
      ? [who, first.subject].filter(Boolean).join(' — ')
      : t('inbound.toast_multi').replace('{n}', items.length);
    showToast(t('inbound.toast_title'), body, {
      onClick: () => { if (typeof _activateTabByKey === 'function') _activateTabByKey('comms'); },
    });

    if (_isTabActive('tab-comms')) _loadInboundEmails();
  });
  _commsLiveSource.addEventListener('new_communication', ev => {
    let items;
    try { items = JSON.parse(ev.data); } catch (_) { return; }
    if (!Array.isArray(items) || !items.length) return;

    const first = items[0];
    const body = items.length === 1
      ? [first.org_title, first.subject].filter(Boolean).join(' — ')
      : t('inbound.toast_multi_comms').replace('{n}', items.length);
    showToast(t('inbound.toast_title_comm'), body, {
      onClick: () => { if (typeof _activateTabByKey === 'function') _activateTabByKey('comms'); },
    });

    if (_isTabActive('tab-comms')) _reloadCasesAndComms();
  });
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyI18n();
  applyThemeIcon();
  initSidebar();
  // The admin panel is a separate standalone page with no account-modal
  // markup or webauthn.js of its own -- its user-menu items deep-link back
  // here with ?action=... instead of duplicating that logic there.
  const _deepLinkParams = new URLSearchParams(location.search);
  const _deepLinkAction = _deepLinkParams.get('action');
  if (_deepLinkAction) {
    const _deepLinkCommId = Number(_deepLinkParams.get('comm'));
    const _deepLinkInboundId = Number(_deepLinkParams.get('inbound'));
    history.replaceState(null, '', location.pathname);
    if (_deepLinkAction === 'edit-name') openEditNameModal();
    else if (_deepLinkAction === 'change-password') openChangePasswordModal();
    else if (_deepLinkAction === 'manage-passkeys') openManagePasskeysModal();
    else if (_deepLinkAction === 'edit-comm' && _deepLinkCommId) {
      if (typeof _activateTabByKey === 'function') _activateTabByKey('comms');
      openCommModal(_deepLinkCommId);
    }
    else if (_deepLinkAction === 'attach-email' && _deepLinkInboundId) {
      if (typeof _activateTabByKey === 'function') _activateTabByKey('comms');
      openInboundAttachModal(_deepLinkInboundId);
    }
  }
  loadOverview();
  // Same "only while that tab is actually visible" gate as the Comms poll
  // below -- these used to keep firing (and the live-visitors one shipping a
  // 13KB+ payload every 20s) no matter which tab was open, competing for the
  // browser's connection pool with whatever the user was actually doing.
  setInterval(() => {
    if (_isTabActive('tab-overview') && document.visibilityState === 'visible') loadOverview();
  }, 60_000);  // auto-refresh overview every 60 s
  loadLiveVisitors();
  setInterval(() => {
    if (_isTabActive('tab-overview') && document.visibilityState === 'visible') loadLiveVisitors();
  }, 20_000);  // faster cadence — this widget is meant to feel live
  setInterval(() => {
    if (_isTabActive('tab-overview')) _fadeLiveMapMarkers();
  }, 2_000);  // smooth fade independent of the data-refresh cadence
  // Communications are edited by multiple people at once; poll for other
  // people's changes so nobody has to remember to hit refresh. Only once the
  // tab has actually been opened, and only while this browser tab is visible,
  // to keep it cheap.
  setInterval(() => {
    if (_commsLoaded && document.visibilityState === 'visible') _reloadCasesAndComms();
  }, 20_000);
  _startCommsLiveStream();
});

// ── Back-to-top floating button ─────────────────────────────────────────────
let _scrollTicking = false;
window.addEventListener('scroll', () => {
  if (_scrollTicking) return;
  _scrollTicking = true;
  requestAnimationFrame(() => {
    show('backToTopBtn').classList.toggle('show', window.scrollY > 300);
    _scrollTicking = false;
  });
});

// ── Changelog modal ─────────────────────────────────────────────────────────
let _changelogModal = null;
let _changelogLoaded = false;
async function openChangelog() {
  if (!_changelogModal) _changelogModal = new bootstrap.Modal(document.getElementById('changelogModal'));
  _changelogModal.show();
  if (_changelogLoaded) return;
  try {
    const entries = await fetch(API_BASE + 'api/changelog').then(r => r.json());
    _changelogLoaded = true;
    const body = document.getElementById('changelogBody');
    body.innerHTML = entries.length
      ? `<ul class="list-unstyled mb-0">${entries.map(e => `
          <li class="d-flex gap-2 py-2 border-bottom">
            <span class="text-muted small text-nowrap font-monospace">${esc(e.date)}</span>
            <span class="flex-grow-1">${esc(e.message)}</span>
          </li>`).join('')}</ul>`
      : `<p class="text-muted text-center mb-0" data-i18n="footer.changelog_none">No changelog entries available.</p>`;
  } catch (e) {
    document.getElementById('changelogBody').innerHTML =
      `<div class="alert alert-danger mb-0">${t('error')} ${esc(e.message)}</div>`;
  }
}
