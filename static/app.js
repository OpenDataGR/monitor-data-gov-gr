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
      return origFetch(input, init);
    };
  }
}

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
    'contacts.title': 'Portal Members',
    'contacts.view_all': 'All',
    'contacts.view_by_org': 'By Organization',
    'contacts.scope_unified': 'Unified',
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
    'contacts.col_state': 'State',
    'contacts.role_admin': 'Admin',
    'contacts.role_editor': 'Editor',
    'contacts.role_member': 'Member',
    'contacts.role_user': 'User',
    'contacts.role_sysadmin': 'Sysadmin',
    'contacts.total': 'Total',
    'contacts.loading_portal': 'Loading portal members…',
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
    'comm_modal.contact_ph': '— select contact —',
    'comm_modal.subject': 'Subject',
    'comm_modal.subject_ph': 'Dataset requested or topic',
    'comm_modal.status': 'Status',
    'comm_modal.medium': 'Medium',
    'comm_modal.medium_ph': '— select medium —',
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
    'inbound.attach_required': 'Organization and subject are required to open a new case.',
    'inbound.dismiss_confirm': 'Dismiss this email? It will not be attached to any case.',
    'inbound.auto_badge': 'Auto',
    'inbound.auto_badge_title': 'Auto-captured from an inbound email',
    'contacts.panel_title': 'Contacts',
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
    'catalog.stats_views_tooltip': 'Views in the last 30 days',
    'catalog.stats_downloads_tooltip': 'Downloads in the last 30 days',
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
    'userPanel.contact_file': 'Contact File',
    'userPanel.email_file': 'Email (file)',
    'userPanel.org_file': 'Organization (file)',
    'userPanel.org_portal': 'Organization (portal)',
    'userPanel.org_mismatch': 'The contact file and the portal account disagree on this person\'s organization',
    'userPanel.no_contact_record': 'No contact record linked.',
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
    'contacts.title': 'Μέλη Πύλης',
    'contacts.view_all': 'Όλα',
    'contacts.view_by_org': 'Ανά Οργανισμό',
    'contacts.scope_unified': 'Ενοποιημένη',
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
    'contacts.col_state': 'Κατάσταση',
    'contacts.role_admin': 'Διαχειριστής',
    'contacts.role_editor': 'Συντάκτης',
    'contacts.role_member': 'Μέλος',
    'contacts.role_user': 'Χρήστης',
    'contacts.role_sysadmin': 'Διαχειριστής Συστήματος',
    'contacts.total': 'Σύνολο',
    'contacts.loading_portal': 'Φόρτωση μελών πύλης…',
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
    'comm_modal.contact_ph': '— επιλογή επαφής —',
    'comm_modal.subject': 'Θέμα',
    'comm_modal.subject_ph': 'Ζητούμενο σύνολο δεδομένων ή θέμα',
    'comm_modal.status': 'Κατάσταση',
    'comm_modal.medium': 'Μέσο',
    'comm_modal.medium_ph': '— επιλογή μέσου —',
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
    'inbound.attach_required': 'Απαιτούνται οργανισμός και θέμα για το άνοιγμα νέας υπόθεσης.',
    'inbound.dismiss_confirm': 'Απόρριψη αυτού του email; Δεν θα επισυναφθεί σε καμία υπόθεση.',
    'inbound.auto_badge': 'Αυτόματο',
    'inbound.auto_badge_title': 'Καταγράφηκε αυτόματα από εισερχόμενο email',
    'contacts.panel_title': 'Επαφές',
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
    'catalog.stats_views_tooltip': 'Προβολές τις τελευταίες 30 ημέρες',
    'catalog.stats_downloads_tooltip': 'Λήψεις τις τελευταίες 30 ημέρες',
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
    'userPanel.contact_file': 'Αρχείο Επαφής',
    'userPanel.email_file': 'Email (αρχείο)',
    'userPanel.org_file': 'Οργανισμός (αρχείο)',
    'userPanel.org_portal': 'Οργανισμός (πύλη)',
    'userPanel.org_mismatch': 'Το αρχείο επαφής και ο λογαριασμός πύλης διαφωνούν ως προς τον οργανισμό αυτού του ατόμου',
    'userPanel.no_contact_record': 'Δεν υπάρχει συνδεδεμένη εγγραφή επαφής.',
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
  // Communications/Cases: same story -- every row of _commsData/_casesData
  // ever logged renders into one #commsTable, unpaginated, and grows for as
  // long as the dashboard is used.
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
    }
  } catch (_) {}
  // Live fetch from CKAN — corrects any snapshot staleness
  try {
    const live = await fetch(API_BASE + 'api/stats/live').then(r => r.ok ? r.json() : null);
    if (live) {
      if (live.total_datasets     != null) show('statDatasets').textContent  = fmt(live.total_datasets);
      if (live.total_services     != null) show('statServices').textContent  = fmt(live.total_services);
      if (live.total_resources    != null) show('statResources').textContent = fmt(live.total_resources);
      if (live.total_organizations != null) show('statOrgs').textContent     = fmt(live.total_organizations);
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

    const pts  = data.filter(d => d.response_time_ms != null).map(d => ({ x: new Date(d.timestamp + 'Z'), y: d.response_time_ms }));
    const down = data.filter(d => !d.is_up).map(d => ({ x: new Date(d.timestamp + 'Z'), y: 0 }));

    _rtChart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          { label: 'Response (ms)', data: pts,  borderColor: '#0057b8', backgroundColor: 'rgba(0,87,184,.08)', fill: true, tension: 0.35, cubicInterpolationMode: 'monotone', pointRadius: 2, pointHoverRadius: 4 },
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

function _showHvdProgress(completed, total) {
  show('hvdProgressWrap').classList.remove('d-none');
  const pct = total ? Math.round((completed / total) * 100) : 0;
  show('hvdProgressBar').style.width = pct + '%';
  show('hvdProgressLabel').textContent = `${fmt(completed)} / ${fmt(total)}`;
  show('hvdProgressPct').textContent = `${pct}%`;
}

function _resetHvdControls() {
  show('hvdCheckBtn').disabled = false;
  show('hvdProgressWrap').classList.add('d-none');
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
  if (_hvdExpandedOrgs.has(orgTitle)) _hvdExpandedOrgs.delete(orgTitle);
  else _hvdExpandedOrgs.add(orgTitle);
  _renderHvdTable();
}

function expandAllHvd() {
  _hvdGroupsCache.forEach(([orgTitle]) => _hvdExpandedOrgs.add(orgTitle));
  _renderHvdTable();
}

function collapseAllHvd() {
  _hvdExpandedOrgs.clear();
  _renderHvdTable();
}

function _hvdRowHtml(d, { indent = false, hidden = false, showOrg = false } = {}) {
  return `
      <tr${hidden ? ' style="display:none"' : ''}>
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

function _hvdTableHead(showOrg) {
  return `
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
    <table class="table table-hover align-middle mb-0">
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
  const bodyRows = _hvdGroupsCache.map(([orgTitle, list], idx) => {
    const isExpanded = _hvdExpandedOrgs.has(orgTitle);
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
    const datasetRows = isExpanded ? list.map(d => _hvdRowHtml(d, { indent: true })).join('') : '';
    return groupRow + datasetRows;
  }).join('');

  wrap.innerHTML = `
    <table class="table table-hover align-middle mb-0">
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

function _showDcatProgress(completed, total) {
  show('dcatProgressWrap').classList.remove('d-none');
  const pct = total ? Math.round((completed / total) * 100) : 0;
  show('dcatProgressBar').style.width = pct + '%';
  show('dcatProgressLabel').textContent = `${fmt(completed)} / ${fmt(total)}`;
  show('dcatProgressPct').textContent = `${pct}%`;
}

function _resetDcatControls() {
  show('dcatCheckBtn').disabled = false;
  show('dcatProgressWrap').classList.add('d-none');
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
  if (_dcatExpandedOrgs.has(orgTitle)) _dcatExpandedOrgs.delete(orgTitle);
  else _dcatExpandedOrgs.add(orgTitle);
  _renderDcatTable();
}

function expandAllDcat() {
  _dcatGroupsCache.forEach(([orgTitle]) => _dcatExpandedOrgs.add(orgTitle));
  _renderDcatTable();
}

function collapseAllDcat() {
  _dcatExpandedOrgs.clear();
  _renderDcatTable();
}

function _dcatRowHtml(d, { indent = false, hidden = false, showOrg = false } = {}) {
  return `
      <tr${hidden ? ' style="display:none"' : ''}>
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

function _dcatTableHead(showOrg) {
  return `
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
    <table class="table table-hover align-middle mb-0">
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

  const bodyRows = _dcatGroupsCache.map(([orgTitle, list], idx) => {
    const isExpanded = _dcatExpandedOrgs.has(orgTitle);
    const groupRow = `
      <tr class="comm-group-row" style="cursor:pointer" onclick="toggleDcatOrg(${idx})">
        <td colspan="4">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-chevron-${isExpanded ? 'down' : 'right'} text-muted small"></i>
            <span class="fw-semibold">${esc(orgTitle)}</span>
            <span class="badge bg-secondary rounded-pill" style="font-size:.7rem">${list.length}</span>
          </div>
        </td>
      </tr>`;
    const datasetRows = isExpanded ? list.map(d => _dcatRowHtml(d, { indent: true })).join('') : '';
    return groupRow + datasetRows;
  }).join('');

  wrap.innerHTML = `
    <table class="table table-hover align-middle mb-0">
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

function _showGeoDcatProgress(completed, total) {
  show('geodcatProgressWrap').classList.remove('d-none');
  const pct = total ? Math.round((completed / total) * 100) : 0;
  show('geodcatProgressBar').style.width = pct + '%';
  show('geodcatProgressLabel').textContent = `${fmt(completed)} / ${fmt(total)}`;
  show('geodcatProgressPct').textContent = `${pct}%`;
}

function _resetGeoDcatControls() {
  show('geodcatCheckBtn').disabled = false;
  show('geodcatProgressWrap').classList.add('d-none');
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
  if (_geodcatExpandedOrgs.has(orgTitle)) _geodcatExpandedOrgs.delete(orgTitle);
  else _geodcatExpandedOrgs.add(orgTitle);
  _renderGeoDcatTable();
}

function expandAllGeoDcat() {
  _geodcatGroupsCache.forEach(([orgTitle]) => _geodcatExpandedOrgs.add(orgTitle));
  _renderGeoDcatTable();
}

function collapseAllGeoDcat() {
  _geodcatExpandedOrgs.clear();
  _renderGeoDcatTable();
}

function _geodcatRowHtml(d, { indent = false, hidden = false, showOrg = false } = {}) {
  return `
      <tr${hidden ? ' style="display:none"' : ''}>
        <td${indent ? ' class="ps-4"' : ''}><a href="#" onclick="openDatasetPanel('${esc(d.name)}');return false;" class="text-decoration-none">${esc(d.title)}</a></td>
        ${showOrg ? `<td class="text-muted small">${esc(d.org_title || t('quality.hvd_unknown_org'))}</td>` : ''}
        <td>${d.conforms ? '' : `<span class="badge bg-danger" title="${esc(t('quality.hvd_non_conforming'))}">${d.violation_count}</span>`}</td>
        <td><details><summary class="small text-muted" style="cursor:pointer">${t('quality.hvd_details')}</summary>
          <ul class="small mb-0 mt-1">${d.details.map(v => `<li class="${v.severity === 'violation' ? 'text-danger' : 'text-warning'}" title="${esc(v.raw_message || '')}">${esc(v.message)}${v.count > 1 ? ` <span class="text-muted">(×${v.count})</span>` : ''}</li>`).join('')}</ul>
        </details></td>
      </tr>`;
}

function _geodcatTableHead(showOrg) {
  return `
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
    <table class="table table-hover align-middle mb-0">
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

  const bodyRows = _geodcatGroupsCache.map(([orgTitle, list], idx) => {
    const isExpanded = _geodcatExpandedOrgs.has(orgTitle);
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
    const datasetRows = isExpanded ? list.map(d => _geodcatRowHtml(d, { indent: true })).join('') : '';
    return groupRow + datasetRows;
  }).join('');

  wrap.innerHTML = `
    <table class="table table-hover align-middle mb-0">
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

let _orgsLoaded  = false;
let _orgsData    = [];
let _orgsSortCol  = 'last_updated';
let _orgsSortDir  = 'desc';
let _orgsViewMode = 'portal';
let _ckanLookup   = null;
let _hrmsLookup   = null;   // ckan slug → hrms code
let _ckanByHrms   = null;   // hrms code → ckan slug  (+ hrms label → ckan slug for old data)

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

const _ORGS_CACHE_KEY  = 'orgs_cache_v2';
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

function _ns(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

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

function _portalContactCell(orgName, orgTitle) {
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
              // under its raw HRMS code (see openPmEditNewForOrg), not its label -- and
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
let _commsLoaded   = false;
let _commsData     = [];
let _casesData     = [];   // [{id, org_name, org_title, subject, status, opened_at, closed_at, entry_count, last_update}]
let _commsPollSnapshot = '';  // last-seen JSON of comms+cases, so the 20s poll can skip re-rendering when nothing changed
let _inboundEmailsData = [];  // pending_review InboundEmail rows -- not real Communications yet, shown above the log for approval
let _inboundAttachModal = null;
let _publicOrgs    = [];   // [{code, label}] from hrms.gov.gr
let _commModal     = null;
let _commContactsPrefetchStarted = false;
let _commsSortCol   = 'contact_date';
let _commsSortDir   = 'desc';
let _commsViewMode  = 'cases';
let _expandedOrgs   = new Set();
let _expandedCases  = new Set();
let _expandedTimelineDays = new Set();
let _timelineDaysInitialized = false;

const STATUS_BADGE = {
  "Initial Contact":      "bg-primary",
  "Intermediate Contact": "bg-info text-dark",
  "Positive Response":    "bg-success",
  "Negative Response":    "bg-danger",
  "No Response":          "bg-secondary",
};

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
function autoEmailBadge(c) {
  // Distinguishes a Communication that was auto-captured (or approved) from an
  // inbound email from one logged by hand, even when both have medium=Email.
  return c.source === 'email'
    ? `<span class="badge rounded-pill ms-1" style="font-size:.65rem;background:#e8f0fe;color:#1a56db" data-i18n-title="inbound.auto_badge_title" title="${esc(t('inbound.auto_badge_title'))}"><i class="bi bi-robot me-1"></i>${esc(t('inbound.auto_badge'))}</span>`
    : '';
}

document.getElementById('commsTabBtn').addEventListener('click', () => {
  // Already-loaded data lives in _commsData/_casesData -- re-render from
  // there instead of skipping outright, since #commsTable is emptied
  // whenever this tab is hidden (see the hidden.bs.tab listener above).
  if (_commsLoaded) { renderCommsSummary(); filterComms(); return; }
  loadComms();
});

async function loadComms() {
  try {
    const fetches = [
      fetch(API_BASE + 'api/communications').then(r => r.json()),
      fetch(API_BASE + 'api/cases').then(r => r.json()),
    ];
    if (!_publicOrgs.length) fetches.push(fetch(API_BASE + 'api/public-orgs').then(r => r.ok ? r.json() : []));
    const results = await Promise.all(fetches);
    _commsData = results[0];
    _casesData = Array.isArray(results[1]) ? results[1] : [];
    _commsPollSnapshot = JSON.stringify([_commsData, _casesData]);
    if (results[2]) _publicOrgs = Array.isArray(results[2]) ? results[2] : [];
    _commsLoaded = true;
    if (!_portalMembersCache) loadContactsTab();
    if (!_orgsData.length) {
      // Warm the portal-orgs cache so the "add communication" org search has
      // more than just HRMS matches, even if the user never opened the Orgs tab.
      const cached = _orgsReadCache();
      if (cached) _orgsData = cached.data;
      else _loadOrgsBackground();
    }
    renderCommsSummary();
    filterComms();
    _refreshCommSubjectDatalist();
    _loadInboundEmails();
  } catch (e) {
    show('commsTable').innerHTML = `<div class="alert alert-danger mb-0">${t('error')}: ${e.message}</div>`;
  }
}

async function _loadInboundEmails() {
  try {
    const data = await fetch(API_BASE + 'api/inbound-emails?status=pending_review').then(r => r.ok ? r.json() : []);
    _inboundEmailsData = Array.isArray(data) ? data : [];
  } catch (_) {
    _inboundEmailsData = [];
  }
  renderCommsReviewSection();
}

async function _reloadCasesAndComms() {
  const [comms, cases] = await Promise.all([
    fetch(API_BASE + 'api/communications').then(r => r.json()),
    fetch(API_BASE + 'api/cases').then(r => r.json()),
  ]);
  const casesArr = Array.isArray(cases) ? cases : [];
  const snapshot = JSON.stringify([comms, casesArr]);
  const changed = snapshot !== _commsPollSnapshot;
  if (changed) {
    _commsPollSnapshot = snapshot;
    _commsData = comms;
    _casesData = casesArr;
  }
  if (_isTabActive('tab-comms')) {
    // Refreshed unconditionally -- a new pending email doesn't touch comms/cases
    // at all, so it would never surface if gated behind the snapshot-changed check.
    await _loadInboundEmails();
    if (changed) {
      renderCommsSummary();
      filterComms();
    }
  }
}

function _refreshCommSubjectDatalist() {
  const list = document.getElementById('commSubjectDatalist');
  if (!list) return;
  const seen = new Set();
  const subjects = [];
  for (const c of [..._commsData].sort((a, b) => b.contact_date.localeCompare(a.contact_date))) {
    const subj = (c.subject || '').trim();
    const key = subj.toLowerCase();
    if (!subj || seen.has(key)) continue;
    seen.add(key);
    subjects.push(subj);
  }
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
    const contact = e.matched_contact;
    const contactName = contact ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() : '';
    const orgLine = (e.matched_org_label || e.matched_org_code)
      ? `<div class="small text-muted">${esc(e.matched_org_label || e.matched_org_code)}${contactName ? ' &middot; ' + esc(contactName) : ''}</div>`
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
  // Cases with a communications entry matching the current Status filter
  // (null = no restriction) — used to scope the Case/Follow-up tabs by the
  // Status tab's selection, same cross-scoping the Catalog/Contacts tabs do.
  const statusScopeCaseIds = _commsStatusFilter
    ? new Set(_commsData.filter(c => c.status === _commsStatusFilter).map(c => c.case_id))
    : null;
  const matchesStatusScope = (c) => !statusScopeCaseIds || statusScopeCaseIds.has(c.id);
  const matchesStale       = (c) => !_commsStaleFilter || (_commsStaleFilter === '1' ? !!c.is_stale : !c.is_stale);
  const matchesCaseStatus  = (c) => !_commsCaseStatusFilter || c.status === _commsCaseStatusFilter;

  const caseScopeForCaseStatus = _casesData.filter(c => matchesStale(c) && matchesStatusScope(c));
  const caseScopeForStale      = _casesData.filter(c => matchesCaseStatus(c) && matchesStatusScope(c));
  const openCases      = caseScopeForCaseStatus.filter(c => c.status === 'Open').length;
  const closedCases    = caseScopeForCaseStatus.filter(c => c.status === 'Closed').length;
  const staleCases     = caseScopeForStale.filter(c => c.is_stale).length;
  const notStaleCases  = caseScopeForStale.filter(c => !c.is_stale).length;

  // Entry Status counts are scoped by the case-level filters — each comms
  // entry already carries its case's status/staleness (case_status/case_is_stale).
  const entryScopeRows = _commsData.filter(c =>
    (!_commsCaseStatusFilter || c.case_status === _commsCaseStatusFilter) &&
    (!_commsStaleFilter || (_commsStaleFilter === '1' ? !!c.case_is_stale : !c.case_is_stale))
  );
  const statusCounts = { "Initial Contact": 0, "Intermediate Contact": 0, "Positive Response": 0, "Negative Response": 0 };
  for (const c of entryScopeRows) if (c.status in statusCounts) statusCounts[c.status]++;

  _commsSummaryCards = [
    { filter: { dim: 'case_status', value: null },       label: t('comms.total'),        value: caseScopeForCaseStatus.length, bg: "bg-secondary bg-opacity-10", text: "text-secondary", icon: "bi-list-ul" },
    { filter: { dim: 'case_status', value: 'Open' },      label: t('comms.open_cases'),   value: openCases,   bg: "bg-warning bg-opacity-10", text: "text-warning",   icon: "bi-folder2-open" },
    { filter: { dim: 'case_status', value: 'Closed' },    label: t('comms.closed_cases'), value: closedCases, bg: "bg-success bg-opacity-10", text: "text-success",   icon: "bi-folder-check" },

    { filter: { dim: 'stale', value: null }, label: t('comms.total'),          value: caseScopeForStale.length, bg: "bg-secondary bg-opacity-10", text: "text-secondary", icon: "bi-list-ul" },
    { filter: { dim: 'stale', value: '1' },  label: t('comms.stale_cases'),     value: staleCases,    bg: "bg-danger bg-opacity-10",    text: "text-danger",    icon: "bi-hourglass-split" },
    { filter: { dim: 'stale', value: '0' },  label: t('comms.not_stale_cases'), value: notStaleCases, bg: "bg-secondary bg-opacity-10", text: "text-secondary", icon: "bi-hourglass-split" },

    { filter: { dim: 'status', value: null },                     label: t('comms.total'),                value: entryScopeRows.length,           bg: "bg-secondary bg-opacity-10", text: "text-secondary", icon: "bi-list-ul" },
    { filter: { dim: 'status', value: 'Initial Contact' },        label: t('comms.initial_contact'),      value: statusCounts["Initial Contact"],      bg: "bg-primary bg-opacity-10", text: "text-primary", icon: "bi-envelope" },
    { filter: { dim: 'status', value: 'Intermediate Contact' },   label: t('comms.intermediate_contact'), value: statusCounts["Intermediate Contact"], bg: "bg-info bg-opacity-10",    text: "text-info",    icon: "bi-reply" },
    { filter: { dim: 'status', value: 'Positive Response' },      label: t('comms.positive_response'),    value: statusCounts["Positive Response"],    bg: "bg-success bg-opacity-10", text: "text-success", icon: "bi-hand-thumbs-up" },
    { filter: { dim: 'status', value: 'Negative Response' },      label: t('comms.negative_response'),    value: statusCounts["Negative Response"],    bg: "bg-danger bg-opacity-10",   text: "text-danger",  icon: "bi-hand-thumbs-down" },
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
  filterComms();
}

function commsArrow(col) {
  if (_commsSortCol !== col) return '<span style="opacity:.25;font-size:.8em"> ↕</span>';
  return _commsSortDir === 'asc' ? ' ↑' : ' ↓';
}

function filterComms() {
  const q = _ns(show('commsSearch').value);
  const filtered = _commsData.filter(c => {
    const matchQ = !q || _ns(c.org_title).includes(q) || _ns(c.subject).includes(q) || _ns(c.notes || '').includes(q);
    let matchFilter = true;
    if (_commsCaseStatusFilter) matchFilter = matchFilter && c.case_status === _commsCaseStatusFilter;
    if (_commsStaleFilter)      matchFilter = matchFilter && (_commsStaleFilter === '1' ? !!c.case_is_stale : !c.case_is_stale);
    if (_commsStatusFilter)     matchFilter = matchFilter && c.status === _commsStatusFilter;
    return matchQ && matchFilter;
  });
  if (_commsViewMode === 'grouped') renderCommsGrouped(filtered);
  else if (_commsViewMode === 'cases') renderCommsCases(filtered);
  else if (_commsViewMode === 'timeline') renderCommsTimeline(filtered);
  else renderCommsTable(filtered);
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
  filterComms();
}

function expandAllComms() {
  if (_commsViewMode === 'cases') {
    for (const cs of _casesData) _expandedCases.add(cs.id);
  } else if (_commsViewMode === 'grouped') {
    for (const c of _commsData) _expandedOrgs.add(c.org_title || c.org_name);
  } else if (_commsViewMode === 'timeline') {
    for (const c of _commsData) _expandedTimelineDays.add(c.contact_date);
  }
  filterComms();
}

function collapseAllComms() {
  if (_commsViewMode === 'cases') _expandedCases.clear();
  else if (_commsViewMode === 'grouped') _expandedOrgs.clear();
  else if (_commsViewMode === 'timeline') _expandedTimelineDays.clear();
  filterComms();
}

function renderCommsTable(rows) {
  const el = show('commsTable');
  if (!rows.length) {
    el.innerHTML = `<p class="text-muted text-center py-4">${t('comms.none')}</p>`;
    return;
  }

  const STATUS_ORDER = { "Initial Contact": 0, "Intermediate Contact": 1, "Positive Response": 2, "Negative Response": 3, "No Response": 4 };
  const statusLabel = { "Initial Contact": t('comms.initial_contact'), "Intermediate Contact": t('comms.intermediate_contact'), "Positive Response": t('comms.positive_response'), "Negative Response": t('comms.negative_response'), "No Response": t('comms.no_response') };
  const sorted = [...rows].sort((a, b) => {
    let av, bv;
    switch (_commsSortCol) {
      case 'org_title':     av = a.org_title.toLowerCase(); bv = b.org_title.toLowerCase(); break;
      case 'subject':       av = a.subject.toLowerCase();   bv = b.subject.toLowerCase();   break;
      case 'status':        av = STATUS_ORDER[a.status] ?? 99; bv = STATUS_ORDER[b.status] ?? 99; break;
      default:              av = a.contact_date;             bv = b.contact_date;
    }
    if (av < bv) return _commsSortDir === 'asc' ? -1 : 1;
    if (av > bv) return _commsSortDir === 'asc' ?  1 : -1;
    return 0;
  });

  const thS = (col, label, cls = '') =>
    `<th class="${cls}" style="cursor:pointer;user-select:none;white-space:nowrap" onclick="sortComms('${col}')">${label}${commsArrow(col)}</th>`;

  el.innerHTML = `
    <table class="table table-hover table-sm align-middle mb-0">
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
      <tbody>
        ${sorted.map(c => `
          <tr>
            <td class="text-muted small mono text-nowrap">${esc(c.contact_date)}</td>
            <td class="fw-semibold small">${esc(c.org_title)}</td>
            <td class="small">${esc(c.subject)} ${caseBadgeHtml(c)}${contactPersonHtml(c)}</td>
            <td><span class="badge ${STATUS_BADGE[c.status] || 'bg-secondary'}">${statusLabel[c.status] || c.status}</span></td>
            <td class="small text-muted">${c.medium ? `<i class="bi ${MEDIUM_ICON[c.medium] || 'bi-dash'} me-1"></i>${mediumLabel(c.medium)}` : ''}${autoEmailBadge(c)}</td>
            <td class="small text-muted text-truncate" style="max-width:0" title="${esc(c.notes || '')}">${esc(c.notes || '')}</td>
            <td class="text-end text-nowrap">
              <div class="d-flex gap-1 justify-content-end">
                ${c.case_id ? `<button class="btn btn-outline-primary btn-sm py-0 px-1" onclick="addFollowupForComm(${c.id})" title="${t('comms.case_add_followup')}"><i class="bi bi-plus-circle"></i></button>` : ''}
                <button class="btn btn-outline-secondary btn-sm py-0 px-1" onclick="openCommModal(${c.id})" title="${t('common.edit')}"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-outline-danger btn-sm py-0 px-1" onclick="deleteComm(${c.id})" title="${t('common.delete')}"><i class="bi bi-trash"></i></button>
              </div>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderCommsGrouped(data) {
  const el = show('commsTable');
  if (!data.length) {
    el.innerHTML = `<p class="text-muted text-center py-4">${t('comms.none')}</p>`;
    return;
  }
  const statusLabel = { "Initial Contact": t('comms.initial_contact'), "Intermediate Contact": t('comms.intermediate_contact'), "Positive Response": t('comms.positive_response'), "Negative Response": t('comms.negative_response'), "No Response": t('comms.no_response') };

  // Group by org_title, preserve insertion order within groups
  const groups = new Map();
  for (const c of data) {
    const key = c.org_title || c.org_name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  // Sort each group newest-first
  for (const comms of groups.values()) {
    comms.sort((a, b) => b.contact_date.localeCompare(a.contact_date));
  }

  // Sort groups by their most recent communication
  const sorted = [...groups.entries()].sort(
    ([, a], [, b]) => b[0].contact_date.localeCompare(a[0].contact_date)
  );

  const rows = sorted.map(([orgTitle, comms]) => {
    const latest     = comms[0];
    const isExpanded = _expandedOrgs.has(orgTitle);
    const safeAttr   = orgTitle.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
    return `
      <tr class="comm-group-row" style="cursor:pointer" data-org="${safeAttr}" onclick="toggleOrgComms(this.dataset.org)">
        <td colspan="6">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-chevron-${isExpanded ? 'down' : 'right'} text-muted small"></i>
            <span class="fw-semibold">${esc(orgTitle)}</span>
            <span class="badge bg-secondary rounded-pill" style="font-size:.7rem">${comms.length} ${comms.length === 1 ? t('comms.entry') : t('comms.entries')}</span>
            <span class="badge ${STATUS_BADGE[latest.status] || 'bg-secondary'}" style="font-size:.7rem">${statusLabel[latest.status] || latest.status}</span>
            <span class="text-muted small ms-auto">${latest.contact_date}</span>
            <button class="btn btn-outline-primary btn-sm py-0 px-2 ms-2" data-org="${safeAttr}" data-orgcode="${esc(comms[0].org_name || '')}"
                    onclick="event.stopPropagation();openCommModal(null,this.dataset.org,this.dataset.orgcode)"
                    title="${t('comms.add_comm_for_org')}">
              <i class="bi bi-plus"></i>
            </button>
          </div>
        </td>
      </tr>
      ${comms.map(c => `
        <tr style="${isExpanded ? '' : 'display:none'}" class="comm-hist-row">
          <td class="text-muted small mono text-nowrap ps-4">${esc(c.contact_date)}</td>
          <td class="small">${esc(c.subject)} ${caseBadgeHtml(c)}${contactPersonHtml(c)}</td>
          <td><span class="badge ${STATUS_BADGE[c.status] || 'bg-secondary'}">${statusLabel[c.status] || c.status}</span></td>
          <td class="small text-muted">${c.medium ? `<i class="bi ${MEDIUM_ICON[c.medium] || 'bi-dash'} me-1"></i>${mediumLabel(c.medium)}` : ''}${autoEmailBadge(c)}</td>
          <td class="small text-muted text-truncate" style="max-width:0" title="${esc(c.notes || '')}">${esc(c.notes || '')}</td>
          <td class="text-end text-nowrap">
            <div class="d-flex gap-1 justify-content-end">
              ${c.case_id ? `<button class="btn btn-outline-primary btn-sm py-0 px-1" onclick="addFollowupForComm(${c.id})" title="${t('comms.case_add_followup')}"><i class="bi bi-plus-circle"></i></button>` : ''}
              <button class="btn btn-outline-secondary btn-sm py-0 px-1" onclick="openCommModal(${c.id})" title="${t('common.edit')}"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-outline-danger btn-sm py-0 px-1" onclick="deleteComm(${c.id})" title="${t('common.delete')}"><i class="bi bi-trash"></i></button>
            </div>
          </td>
        </tr>`).join('')}`;
  }).join('');

  el.innerHTML = `
    <table class="table table-hover table-sm align-middle mb-0">
      <colgroup><col style="width:110px"><col><col style="width:140px"><col style="width:120px"><col><col style="width:80px"></colgroup>
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

function renderCommsCases(data) {
  const el = show('commsTable');
  if (!data.length) {
    el.innerHTML = `<p class="text-muted text-center py-4">${t('comms.none')}</p>`;
    return;
  }
  const statusLabel = { "Initial Contact": t('comms.initial_contact'), "Intermediate Contact": t('comms.intermediate_contact'), "Positive Response": t('comms.positive_response'), "Negative Response": t('comms.negative_response'), "No Response": t('comms.no_response') };
  const casesById = new Map(_casesData.map(cs => [cs.id, cs]));

  // Group visible entries by case_id
  const groups = new Map();
  for (const c of data) {
    if (!c.case_id) continue;
    if (!groups.has(c.case_id)) groups.set(c.case_id, []);
    groups.get(c.case_id).push(c);
  }

  const sorted = [...groups.entries()].sort(([idA], [idB]) => {
    const a = casesById.get(idA), b = casesById.get(idB);
    return (b?.opened_at || '').localeCompare(a?.opened_at || '');
  });

  const rows = sorted.map(([caseId, comms]) => {
    const cs = casesById.get(caseId);
    if (!cs) return '';
    comms.sort((a, b) => b.contact_date.localeCompare(a.contact_date));
    const isExpanded = _expandedCases.has(caseId);
    const isClosed    = cs.status === 'Closed';
    return `
      <tr class="comm-group-row" style="cursor:pointer" onclick="toggleCaseExpand(${caseId})">
        <td colspan="6">
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <i class="bi bi-chevron-${isExpanded ? 'down' : 'right'} text-muted small"></i>
            <span class="text-muted small mono">#${caseId}</span>
            <span class="badge ${CASE_STATUS_BADGE[cs.status] || 'bg-secondary'}" style="font-size:.7rem">
              <i class="bi ${isClosed ? 'bi-folder-check' : 'bi-folder2-open'} me-1"></i>${caseStatusLabel(cs.status)}
            </span>
            ${cs.is_stale ? `<span class="badge bg-secondary" style="font-size:.7rem" title="${t('comms.case_stale_hint')}"><i class="bi bi-hourglass-split me-1"></i>${t('comms.case_stale')}</span>` : ''}
            <span class="fw-semibold">${esc(cs.org_title)}</span>
            <span class="text-muted small">— ${esc(cs.subject)}</span>
            <span class="badge bg-secondary rounded-pill" style="font-size:.7rem">${cs.entry_count} ${cs.entry_count === 1 ? t('comms.entry') : t('comms.entries')}</span>
            <span class="text-muted small ms-auto">${t('comms.case_opened')} ${(cs.opened_at || '').slice(0, 10)}${isClosed ? ` · ${t('comms.case_closed_on')} ${(cs.closed_at || '').slice(0, 10)}` : (cs.deadline ? ` · ${t('comm_modal.deadline')}: ${cs.deadline}` : '')}</span>
            <button class="btn btn-outline-primary btn-sm py-0 px-2" title="${t('comms.case_add_entry')}"
                    onclick="event.stopPropagation();openFollowupForCase(${caseId})">
              <i class="bi bi-plus"></i>
            </button>
            ${isClosed
              ? `<button class="btn btn-outline-success btn-sm py-0 px-2" title="${t('comms.case_reopen')}" onclick="event.stopPropagation();reopenCase(${caseId})"><i class="bi bi-arrow-counterclockwise"></i></button>`
              : `<button class="btn btn-outline-secondary btn-sm py-0 px-2" title="${t('comms.case_close')}" onclick="event.stopPropagation();closeCase(${caseId})"><i class="bi bi-check2-circle"></i></button>`}
          </div>
        </td>
      </tr>
      ${comms.map(c => `
        <tr style="${isExpanded ? '' : 'display:none'}" class="comm-hist-row">
          <td class="text-muted small mono text-nowrap ps-4">${esc(c.contact_date)}</td>
          <td class="small">${esc(c.subject)}${contactPersonHtml(c)}</td>
          <td><span class="badge ${STATUS_BADGE[c.status] || 'bg-secondary'}">${statusLabel[c.status] || c.status}</span></td>
          <td class="small text-muted">${c.medium ? `<i class="bi ${MEDIUM_ICON[c.medium] || 'bi-dash'} me-1"></i>${mediumLabel(c.medium)}` : ''}${autoEmailBadge(c)}</td>
          <td class="small text-muted text-truncate" style="max-width:0" title="${esc(c.notes || '')}">${esc(c.notes || '')}</td>
          <td class="text-end text-nowrap">
            <div class="d-flex gap-1 justify-content-end">
              ${c.case_id ? `<button class="btn btn-outline-primary btn-sm py-0 px-1" onclick="addFollowupForComm(${c.id})" title="${t('comms.case_add_followup')}"><i class="bi bi-plus-circle"></i></button>` : ''}
              <button class="btn btn-outline-secondary btn-sm py-0 px-1" onclick="openCommModal(${c.id})" title="${t('common.edit')}"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-outline-danger btn-sm py-0 px-1" onclick="deleteComm(${c.id})" title="${t('common.delete')}"><i class="bi bi-trash"></i></button>
            </div>
          </td>
        </tr>`).join('')}`;
  }).join('');

  el.innerHTML = `
    <table class="table table-hover table-sm align-middle mb-0">
      <colgroup><col style="width:110px"><col><col style="width:140px"><col style="width:120px"><col><col style="width:80px"></colgroup>
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

function toggleCaseExpand(caseId) {
  if (_expandedCases.has(caseId)) _expandedCases.delete(caseId);
  else _expandedCases.add(caseId);
  filterComms();
}

async function closeCase(caseId) {
  await fetch(`${API_BASE}api/cases/${caseId}/close`, { method: 'POST', cache: 'no-store' });
  await _reloadCasesAndComms();
}

async function reopenCase(caseId) {
  await fetch(`${API_BASE}api/cases/${caseId}/reopen`, { method: 'POST', cache: 'no-store' });
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

function renderCommsTimeline(rows) {
  const el = show('commsTable');
  if (!rows.length) {
    el.innerHTML = `<p class="text-muted text-center py-4">${t('comms.none')}</p>`;
    return;
  }
  const statusLabel = { "Initial Contact": t('comms.initial_contact'), "Intermediate Contact": t('comms.intermediate_contact'), "Positive Response": t('comms.positive_response'), "Negative Response": t('comms.negative_response'), "No Response": t('comms.no_response') };

  const sorted = [...rows].sort((a, b) => {
    if (a.contact_date !== b.contact_date) return b.contact_date.localeCompare(a.contact_date);
    return new Date(b.created_at) - new Date(a.created_at);
  });

  const todayIso = new Date().toISOString().slice(0, 10);
  const yesterdayIso = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const dayLabel = (iso) => {
    if (iso === todayIso) return t('comms.today');
    if (iso === yesterdayIso) return t('comms.yesterday');
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(_lang === 'el' ? 'el-GR' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  if (!_timelineDaysInitialized) {
    _expandedTimelineDays.add(todayIso);
    _timelineDaysInitialized = true;
  }

  // Group entries by day, preserving the newest-first order already established above
  const dayGroups = new Map();
  for (const c of sorted) {
    if (!dayGroups.has(c.contact_date)) dayGroups.set(c.contact_date, []);
    dayGroups.get(c.contact_date).push(c);
  }

  let html = '<div class="comm-timeline">';
  for (const [day, items] of dayGroups) {
    const isExpanded = _expandedTimelineDays.has(day);
    html += `
      <div class="comm-timeline-day" style="cursor:pointer" data-day="${day}" onclick="toggleTimelineDay(this.dataset.day)">
        <i class="bi bi-chevron-${isExpanded ? 'down' : 'right'} me-1" style="font-size:.75rem"></i>${dayLabel(day)}
        <span class="badge bg-secondary rounded-pill ms-1" style="font-size:.65rem">${items.length}</span>
      </div>`;
    if (!isExpanded) continue;
    for (const c of items) {
      html += `
        <div class="comm-timeline-item">
          <span class="comm-dot" style="background:${COMM_STATUS_DOT[c.status] || '#6c757d'}"></span>
          <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
            <div>
              <span class="fw-semibold small">${esc(c.org_title)}</span>
              <span class="badge ${STATUS_BADGE[c.status] || 'bg-secondary'} ms-2" style="font-size:.68rem">
                <i class="bi ${COMM_STATUS_ICON[c.status] || 'bi-circle'} me-1"></i>${statusLabel[c.status] || c.status}
              </span>
              ${caseBadgeHtml(c, 'ms-1')}
            </div>
            <div class="text-end text-nowrap">
              <div class="d-flex gap-1 justify-content-end">
                ${c.case_id ? `<button class="btn btn-outline-primary btn-sm py-0 px-1" onclick="addFollowupForComm(${c.id})" title="${t('comms.case_add_followup')}"><i class="bi bi-plus-circle"></i></button>` : ''}
                <button class="btn btn-outline-secondary btn-sm py-0 px-1" onclick="openCommModal(${c.id})" title="${t('common.edit')}"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-outline-danger btn-sm py-0 px-1" onclick="deleteComm(${c.id})" title="${t('common.delete')}"><i class="bi bi-trash"></i></button>
              </div>
            </div>
          </div>
          <div class="small mt-1">${esc(c.subject)}</div>
          ${c.contact_person ? `<div class="text-muted" style="font-size:.72rem"><i class="bi bi-person me-1"></i>${esc(c.contact_person)}</div>` : ''}
          ${c.medium ? `<div class="text-muted" style="font-size:.72rem"><i class="bi ${MEDIUM_ICON[c.medium] || 'bi-dash'} me-1"></i>${mediumLabel(c.medium)}${autoEmailBadge(c)}</div>` : ''}
          ${c.notes ? `<div class="text-muted small mt-1">${esc(c.notes)}</div>` : ''}
        </div>`;
    }
  }
  html += '</div>';
  el.innerHTML = html;
}

function toggleTimelineDay(day) {
  if (_expandedTimelineDays.has(day)) _expandedTimelineDays.delete(day);
  else _expandedTimelineDays.add(day);
  filterComms();
}

function toggleOrgComms(orgTitle) {
  if (_expandedOrgs.has(orgTitle)) _expandedOrgs.delete(orgTitle);
  else _expandedOrgs.add(orgTitle);
  filterComms();
}

function openCommModal(id, prefillOrg = null, prefillOrgCode = null, prefillCaseId = null, prefillSubject = null, prefillMedium = null, prefillContactPerson = null) {
  if (!_commModal) _commModal = new bootstrap.Modal(document.getElementById('commModal'));
  show('commError').classList.add('d-none');
  show('commSaveBtn').disabled = false;
  _commOrgReset();
  _resetCommContact();
  if (!_commContactsPrefetchStarted && _portalMembersCache === null) {
    _commContactsPrefetchStarted = true;
    loadContactsTab();  // warm the contacts cache so the org search can also match by contact name
  }

  if (id) {
    const c = _commsData.find(x => x.id === id);
    if (!c) return;
    show('commModalTitle').textContent = t('comm_modal.edit_title');
    show('commId').value      = c.id;
    show('commCaseId').value  = c.case_id || '';
    show('commDate').value    = c.contact_date;
    show('commDeadline').value = (_casesData.find(x => x.id === c.case_id) || {}).deadline || _plus14(c.contact_date);
    show('commSubject').value = c.subject;
    show('commStatus').value  = c.status;
    show('commStatus').disabled = c.status === 'Initial Contact';  // the entry that opened the case must stay Initial Contact
    show('commStatusInitialOption').hidden = false;
    show('commMedium').value  = c.medium || '';
    show('commNotes').value   = c.notes;
    _commOrgSet(c.org_name, c.org_title);
    _setOrgLocked(false);
    onCommOrgInput(c.contact_person || '');
    _renderCommCaseInfo(c.case_id, true);
  } else {
    show('commModalTitle').textContent = prefillOrg ? `${t('comm_modal.add_title')} — ${prefillOrg}` : t('comm_modal.add_title');
    show('commId').value      = '';
    show('commCaseId').value  = prefillCaseId || '';
    show('commDate').value    = new Date().toISOString().slice(0, 10);
    show('commDeadline').value = (prefillCaseId && (_casesData.find(x => x.id === prefillCaseId) || {}).deadline) || _plus14(show('commDate').value);
    show('commSubject').value = prefillSubject || '';
    show('commStatus').disabled = !prefillCaseId;  // a brand-new case always opens as Initial Contact
    show('commStatusInitialOption').hidden = !!prefillCaseId;  // reserved for the entry that opens a case
    show('commStatus').value  = prefillCaseId ? 'Intermediate Contact' : 'Initial Contact';
    show('commMedium').value  = prefillMedium || '';
    show('commNotes').value   = '';
    if (prefillOrg) { _commOrgSet(prefillOrgCode || prefillOrg, prefillOrg); onCommOrgInput(prefillContactPerson || ''); }
    _setOrgLocked(!!prefillCaseId);  // a follow-up stays tied to its case's organization
    _renderCommCaseInfo(prefillCaseId);
  }
  _onCommStatusChange();
  _commModal.show();
}

function _renderCommCaseInfo(caseId, isEdit = false) {
  const box = show('commCaseInfo');
  if (!caseId) { box.classList.add('d-none'); return; }
  const cs = _casesData.find(x => x.id === caseId);
  if (!cs) { box.classList.add('d-none'); return; }
  box.classList.remove('d-none');
  box.dataset.caseId = caseId;
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
  const cs = _casesData.find(x => x.id === caseId);
  const action = cs && cs.status === 'Closed' ? 'reopen' : 'close';
  await fetch(`${API_BASE}api/cases/${caseId}/${action}`, { method: 'POST', cache: 'no-store' });
  await _reloadCasesAndComms();
  _renderCommCaseInfo(caseId, show('commCaseInfo').dataset.isEdit === '1');
}

function _addFollowupFromModal() {
  const caseId = parseInt(show('commCaseInfo').dataset.caseId, 10);
  if (!caseId) return;
  openFollowupForCase(caseId);
}

function addFollowupForComm(commId) {
  const c = _commsData.find(x => x.id === commId);
  if (!c || !c.case_id) return;
  openFollowupForCase(c.case_id);
}

function openFollowupForCase(caseId) {
  const cs = _casesData.find(x => x.id === caseId);
  if (!cs) return;
  // entries oldest-first (same ordering as Case.to_dict on the backend)
  const entries = _commsData.filter(c => c.case_id === caseId).sort((a, b) =>
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

function _resetCommContact() {
  show('commContactSection').classList.add('d-none');
  show('commContact').innerHTML = `<option value="">${t('comm_modal.contact_ph')}</option>`;
  show('commContactInfo').classList.add('d-none');
  show('commContactInfo').innerHTML = '';
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
      contacts.push({ first_name: m.contact_first_name, last_name: m.contact_last_name,
                      position: m.contact_position, email: m.contact_email, tel: m.contact_tel });
    }
  }
  for (const c of (_pmUnmatched || [])) {
    if (seen.has(c.id)) continue;
    const primaryMatch = _orgCodeMatches(c.org_code || '', orgCode);
    const extraMatch   = (c.org_codes || []).some(o => _orgCodeMatches(o.code || '', orgCode));
    if (primaryMatch || extraMatch) {
      seen.add(c.id);
      contacts.push({ first_name: c.first_name, last_name: c.last_name,
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

function _fillCommContacts(contacts, preselectName) {
  const sel = show('commContact');
  const preselectBase = _commContactBaseName(preselectName);
  let exactMatch = null, baseMatch = null;
  contacts.forEach(c => {
    const label = [c.first_name, c.last_name].filter(Boolean).join(' ') +
                  (c.position ? ' (' + c.position + ')' : '');
    const o = document.createElement('option');
    o.value = label;
    o.textContent = label;
    o.dataset.email = c.email || '';
    o.dataset.tel   = c.tel   || '';
    sel.appendChild(o);
    if (preselectName) {
      if (label === preselectName) exactMatch = o;
      else if (!baseMatch && preselectBase && _commContactBaseName(label) === preselectBase) baseMatch = o;
    }
  });
  const chosen = exactMatch || baseMatch;
  if (chosen) chosen.selected = true;
  show('commContactSection').classList.remove('d-none');
  if (preselectName) onCommContactChange();
}

function _openAddContactForComm() {
  const orgCode  = show('commOrgCode').value;
  const orgLabel = show('commOrgLabel').value;
  if (!orgCode) return;
  openPmEditNewForUser('', '', orgCode, orgLabel);
}

function onCommOrgInput(preselectName) {
  _resetCommContact();
  const orgCode = show('commOrgCode').value;
  if (!orgCode) return;
  show('commContactSection').classList.remove('d-none');
  if (_portalMembersCache !== null) {
    _fillCommContacts(_getContactsForOrg(orgCode), preselectName);
  } else {
    fetch(API_BASE + 'api/contacts/' + encodeURIComponent(orgCode))
      .then(r => r.json())
      .then(contacts => _fillCommContacts(contacts, preselectName))
      .catch(() => {});
  }
}

function onCommContactChange() {
  const sel  = show('commContact');
  const info = show('commContactInfo');
  if (!sel.value) { info.classList.add('d-none'); info.innerHTML = ''; return; }
  const o = sel.options[sel.selectedIndex];
  const parts = [];
  if (o.dataset.email) parts.push('<i class="bi bi-envelope me-1"></i><a href="mailto:' + esc(o.dataset.email) + '">' + esc(o.dataset.email) + '</a>');
  if (o.dataset.tel)   parts.push('<i class="bi bi-telephone me-1"></i><a href="tel:'   + esc(o.dataset.tel)   + '">' + esc(o.dataset.tel)   + '</a>');
  if (parts.length) { info.innerHTML = parts.join(' &nbsp;'); info.classList.remove('d-none'); }
  else { info.classList.add('d-none'); }
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
    notes:        show('commNotes').value.trim(),
    case_id:      show('commCaseId').value || null,
    contact_person: (() => { const s = show('commContact'); return s.value ? s.options[s.selectedIndex].textContent : ''; })(),
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

    // Full reload (not a local patch) -- editing/adding one entry can change its
    // case's computed is_stale/entry_count, which every other entry in that case
    // carries a denormalized snapshot of, so a partial patch would leave siblings stale.
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
    try {
      const resp = await fetch(`${API_BASE}api/communications/${id}/delete`, { method: 'DELETE', cache: 'no-store' });
      // fetch() only rejects on a network failure, not an HTTP error status --
      // without this check a 500 (e.g. a save/delete conflict) silently left
      // the row in place with no feedback at all.
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
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

function _inboundAttachOrgSelect(code, label) {
  show('inboundAttachOrgCode').value  = code;
  show('inboundAttachOrgLabel').value = label;
  show('inboundAttachOrgSearch').value = label;
  document.getElementById('inboundAttachOrgDropdown').classList.add('d-none');
  _refreshInboundAttachCases();
}

function _refreshInboundAttachCases() {
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
  const openCases = _casesData.filter(c => c.status === 'Open' && _orgCodeMatches(c.org_name || '', orgCode));
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

function openInboundAttachModal(id) {
  const e = _inboundEmailsData.find(x => x.id === id);
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

  _refreshInboundAttachCases();

  if (!_inboundAttachModal) _inboundAttachModal = new bootstrap.Modal(document.getElementById('inboundAttachModal'));
  _inboundAttachModal.show();
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
  show('orgContactsTitle').textContent    = t('contacts.panel_title');
  show('orgContactsSubtitle').textContent = orgLabel;
  _contactsPanel.show();
  _renderOrgContactsPanel();
}

function _renderOrgContactsPanel() {
  const orgCode  = _panelOrgCode;
  const orgLabel = _panelOrgLabel;
  const ckanName = _panelCkanName;

  if (!_portalMembersCache) {
    show('orgContactsBody').innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
    const _wait = () => { if (_portalMembersCache) _renderOrgContactsPanel(); else setTimeout(_wait, 300); };
    loadContactsTab();
    _wait();
    return;
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

  const addBtn = `<button class="btn btn-primary btn-sm mb-3 w-100" onclick="openPmEditNewForOrg()">
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
              ? `<button class="btn btn-outline-secondary btn-sm py-0 px-1" onclick="openPmEditByUsername('${esc(m.username)}')" title="${t('common.edit')}"><i class="bi bi-pencil"></i></button>
                 <button class="btn btn-outline-danger btn-sm py-0 px-1" onclick="deletePmContactRecord(${m.contact_id},'${esc(m.username)}')" title="${t('common.delete')}"><i class="bi bi-trash"></i></button>`
              : `<button class="btn btn-outline-primary btn-sm py-0 px-1" onclick="openPmEditNewForUser('${esc(m.username)}','${esc(m.email)}','${esc(ckanName || orgCode)}','${esc(orgLabel)}','${esc(m.capacity||'')}')" title="${t('userPanel.add_contact_record')}"><i class="bi bi-person-plus me-1"></i>${t('common.add')}</button>`}
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
            <button class="btn btn-outline-secondary btn-sm py-0 px-1" onclick="openPmEditForUnmatched(${c.id})" title="${t('common.edit')}"><i class="bi bi-pencil"></i></button>
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

function openPmEditNewForOrg() {
  openPmEditNewForUser('', '', _panelCkanName || _panelOrgCode, _panelOrgLabel);
}

function openPmEditForUnmatched(id) {
  const c = (_pmUnmatched || []).find(c => c.id === id);
  if (!c) return;
  show('pmEditTitle').textContent   = (`${c.first_name || ''} ${c.last_name || ''}`).trim() || 'Edit Contact';
  show('pmEditIcon').className      = 'bi bi-pencil me-2';
  show('pmEditContactId').value     = c.id;
  show('pmEditUsername').value      = '';
  show('pmEditEmail').value         = c.email || '';
  _pmEditOrgs = (c.org_codes && c.org_codes.length)
    ? c.org_codes
    : (c.org_code ? [{code: c.org_code, label: c.org_label || c.org_code}] : []);
  _pmOrgRenderTags();
  show('pmEditFirstName').value     = c.first_name || '';
  show('pmEditLastName').value      = c.last_name  || '';
  show('pmEditPosition').value      = c.position   || '';
  _pmSetContactType(c.contact_type  || '');
  show('pmEditTel').value           = c.tel        || '';
  show('pmEditMobile').value        = c.mobile     || '';
  show('pmEditStatus').textContent  = '';
  document.getElementById('pmEditEmailHint').classList.add('d-none');
  _pmExistingMatch = null;
  show('pmEditOrgRow').classList.remove('d-none');
  if (!_pmEditModal) _pmEditModal = new bootstrap.Modal(document.getElementById('pmEditModal'));
  _pmEditModal.show();
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
// Detail offcanvases (org/dataset) can open one from within the other in either
// direction, and Bootstrap gives every offcanvas the same default z-index — ties
// fall back to DOM order, which doesn't track "which one was opened most
// recently". Explicitly bumping the just-opened panel above a running counter
// keeps whichever one the user navigated to on top, regardless of direction.
let _offcanvasZTop = 1045;
function _bringOffcanvasToFront(id) {
  document.getElementById(id).style.zIndex = ++_offcanvasZTop;
}

// ── Org detail panel ─────────────────────────────────────────────────────────
let _orgPanel = null;

function openOrgPanel(name) {
  if (!_orgPanel) _orgPanel = new bootstrap.Offcanvas(document.getElementById('orgDetailPanel'));
  _bringOffcanvasToFront('orgDetailPanel');
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
  _bringOffcanvasToFront('datasetDetailPanel');
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
    <div id="datasetStatsRow" class="d-flex gap-3 small text-muted mb-3 d-none">
      <span title="${esc(t('catalog.stats_views_tooltip'))}"><i class="bi bi-eye me-1"></i><span id="datasetStatsViews">—</span></span>
      <span title="${esc(t('catalog.stats_downloads_tooltip'))}"><i class="bi bi-download me-1"></i><span id="datasetStatsDownloads">—</span></span>
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
  _loadDatasetStats(d.name, d.resources || []);
}

async function _loadDatasetStats(name, resources) {
  try {
    const params = new URLSearchParams({ name, days: 30 });
    resources.forEach(r => { if (r.url) params.append('resource_url', r.url); });
    const data = await fetch(API_BASE + 'api/matomo/dataset-stats?' + params).then(r => r.json());
    const row = document.getElementById('datasetStatsRow');
    if (!row || data.error) return;  // Matomo not configured, or panel closed/replaced while fetching
    document.getElementById('datasetStatsViews').textContent = fmt(data.visits);
    document.getElementById('datasetStatsDownloads').textContent = fmt(data.downloads);
    row.classList.remove('d-none');
  } catch (e) { /* stats are a nice-to-have — fail silently */ }
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

function openUserPanel(username) {
  if (!username) return;
  if (!_userPanel) _userPanel = new bootstrap.Offcanvas(document.getElementById('userPanel'));
  _userDatasetsLoaded = null;
  _userActivityLoaded = null;
  document.getElementById('userPanelName').textContent = username;
  document.getElementById('userPanelUsername').textContent = '@' + username;
  document.getElementById('userPanelBody').innerHTML =
    '<div class="text-center py-5 text-muted"><div class="spinner-border text-primary"></div></div>';
  _userPanel.show();
  fetch(API_BASE + 'api/portal-user/' + encodeURIComponent(username))
    .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.error || r.status)))
    .then(data => renderUserPanel(data))
    .catch(err => {
      document.getElementById('userPanelBody').innerHTML =
        `<div class="alert alert-danger mb-0">${t('userPanel.failed_load_user').replace('{msg}', err)}</div>`;
    });
}

function renderUserPanel(u) {
  const fmt = s => {
    if (!s) return '—';
    const d = new Date(s);
    return isNaN(d) ? s : d.toLocaleDateString('el-GR', {year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  };
  const stateCls = u.state === 'active' ? 'success' : 'secondary';
  // Prefer the name on file over the portal account's own display name — the
  // CKAN profile is often a romanized username, the contact file has the real name.
  const _fileName = u.contact ? `${u.contact.first_name || ''} ${u.contact.last_name || ''}`.trim() : '';
  document.getElementById('userPanelName').textContent = _fileName || u.display_name || u.username;
  document.getElementById('userPanelUsername').innerHTML =
    `@${esc(u.username)}&ensp;<a href="https://data.gov.gr/user/${encodeURIComponent(u.username)}" target="_blank" rel="noopener" class="text-muted" title="${t('catalog.view_on_portal')}"><i class="bi bi-box-arrow-up-right"></i></a>`;

  const orgs = (_portalMembersCache || [])
    .filter(m => m.username === u.username && m.org_name)
    .map(m => `<a href="#" class="badge bg-light text-dark border text-decoration-none me-1 mb-1"
        onclick="event.stopPropagation();openOrgPanel('${esc(m.org_name)}');return false;">${esc(m.org_title || m.org_name)}</a>`);

  const orgHtml = orgs.length
    ? `<div>${orgs.join('')}</div>`
    : `<span class="text-muted small">${t('userPanel.no_organization')}</span>`;

  const c = u.contact;
  // find the org this user belongs to (first one) for pre-filling new contact
  const _uOrg = (_portalMembersCache || []).find(m => m.username === u.username && m.org_name);

  // Portal's own name, split from display_name (CKAN has no separate first/last fields)
  const _portalNameParts = (u.display_name || '').trim().split(/\s+/).filter(Boolean);
  const _portalFirst = _portalNameParts[0] || '';
  const _portalLast  = _portalNameParts.slice(1).join(' ');

  // Effective role: same highest-rank-wins logic as the Contacts table, so it
  // always matches what's shown there rather than just the first org found.
  const _bestRole = _dedupeContacts(_portalMembersCache || []).find(m => m.username === u.username);
  const _uPortalRoleLabel = u.sysadmin ? t('contacts.role_sysadmin') : _portalRoleLabel({ capacity: _bestRole?.capacity });
  const _portalRoleCls   = u.sysadmin ? ROLE_BADGE_CLS.sysadmin : (_bestRole ? (ROLE_BADGE_CLS[_bestRole.capacity] || 'bg-secondary') : 'bg-secondary');
  const contactHtml = `
    <div class="mt-3 pt-3 border-top">
      <div class="d-flex align-items-center justify-content-between mb-2">
        <div class="fw-semibold small text-uppercase text-muted">${t('userPanel.contact_file')}</div>
        <div class="d-flex gap-1">
          ${c ? `
          <button class="btn btn-outline-secondary btn-sm py-0 px-1" title="${t('common.edit')}"
            onclick="openPmEditByUsername('${esc(u.username)}')"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-outline-danger btn-sm py-0 px-1" title="${t('common.delete')}"
            onclick="deletePmContactRecord(${c.id},'${esc(u.username)}')"><i class="bi bi-trash"></i></button>
          ` : `
          <button class="btn btn-outline-primary btn-sm py-0 px-2" title="${t('userPanel.add_contact_record')}"
            onclick="openPmEditNewForUser('${esc(u.username)}','${esc(u.email)}','${esc(_uOrg ? _uOrg.org_name : '')}','${esc(_uOrg ? (_uOrg.org_title||_uOrg.org_name) : '')}','${esc(_uOrg ? (_uOrg.capacity||'') : '')}')">
            <i class="bi bi-person-plus me-1"></i>${t('common.add')}</button>
          `}
        </div>
      </div>
      ${c ? `<dl class="row g-1 small mb-0">
        <dt class="col-5 text-muted fw-normal mb-1">${t('contacts.first_name')}</dt><dd class="col-7 mb-1">${c.first_name ? esc(c.first_name) : '—'}</dd>
        <dt class="col-5 text-muted fw-normal mb-1">${t('contacts.last_name')}</dt><dd class="col-7 mb-1">${c.last_name ? esc(c.last_name) : '—'}</dd>
        ${(c.org_codes || []).length ? `<dt class="col-5 text-muted fw-normal mb-1">${t('userPanel.org_file')}</dt><dd class="col-7 mb-1">${esc((c.org_codes || []).map(o => o.label || o.code).join(', '))}</dd>` : ''}
        ${c.email ? `<dt class="col-5 text-muted fw-normal mb-1">${t('userPanel.email_file')}</dt><dd class="col-7 mb-1"><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd>` : ''}
        ${c.position ? `<dt class="col-5 text-muted fw-normal mb-1">${t('contacts.position')}</dt><dd class="col-7 mb-1">${esc(c.position)}</dd>` : ''}
        ${c.tel ? `<dt class="col-5 text-muted fw-normal mb-1">${t('contacts.tel')}</dt><dd class="col-7 mb-1"><a href="tel:${esc(c.tel)}" class="text-decoration-none">${esc(c.tel)}</a></dd>` : ''}
        ${c.mobile ? `<dt class="col-5 text-muted fw-normal mb-1">${t('contacts.mobile')}</dt><dd class="col-7 mb-1"><a href="tel:${esc(c.mobile)}" class="text-decoration-none">${esc(c.mobile)}</a></dd>` : ''}
        ${c.contact_type ? `<dt class="col-5 text-muted fw-normal mb-1">${t('contacts.col_role')}</dt><dd class="col-7 mb-1">${
          c.contact_type.split(',').map(s => s.trim()).filter(Boolean)
            .map(s => `<span class="badge me-1 mb-1 ${CONTACT_TYPE_CLS[s] || 'bg-secondary'}" style="font-size:.7rem">${esc(_CONTACT_TYPE_I18N_KEY[s] ? t(_CONTACT_TYPE_I18N_KEY[s]) : s)}</span>`).join('')
        }</dd>` : ''}
      </dl>` : `<p class="text-muted small mb-0">${t('userPanel.no_contact_record')}</p>`}
    </div>`;

  document.getElementById('userPanelBody').innerHTML = `
    <div class="d-flex align-items-center gap-2 mb-3">
      <span class="badge bg-${stateCls}">${esc(_contactStateLabel(u.state))}</span>
      ${u.sysadmin ? `<span class="badge bg-danger">${t('contacts.role_sysadmin')}</span>` : ''}
    </div>
    <dl class="row g-1 small mb-0">
      <dt class="col-5 text-muted fw-normal mb-1">${t('contacts.first_name')}</dt>
      <dd class="col-7 mb-1">${_portalFirst ? esc(_portalFirst) : '—'}</dd>
      <dt class="col-5 text-muted fw-normal mb-1">${t('contacts.last_name')}</dt>
      <dd class="col-7 mb-1">${_portalLast ? esc(_portalLast) : '—'}</dd>
      <dt class="col-5 text-muted fw-normal mb-1">${t('contacts.col_role')}</dt>
      <dd class="col-7 mb-1"><span class="badge ${_portalRoleCls}">${esc(_uPortalRoleLabel)}</span></dd>
      <dt class="col-5 text-muted fw-normal mb-1">${t('contacts.email')}</dt>
      <dd class="col-7 mb-1">${u.email ? `<a href="mailto:${esc(u.email)}">${esc(u.email)}</a>` : '—'}</dd>
      <dt class="col-5 text-muted fw-normal mb-1">${t('userPanel.registered')}</dt>
      <dd class="col-7 mb-1">${fmt(u.created)}</dd>
      <dt class="col-5 text-muted fw-normal mb-1">${t('userPanel.last_active')}</dt>
      <dd class="col-7 mb-1">${fmt(u.last_active)}</dd>
      <dt class="col-5 text-muted fw-normal mb-1">${t('userPanel.datasets')}</dt>
      <dd class="col-7 mb-1">
        ${u.num_packages > 0
          ? `<a href="#" class="fw-semibold text-decoration-none" onclick="loadUserDatasets('${esc(u.username)}');return false;">${u.num_packages} <i class="bi bi-chevron-down small"></i></a>`
          : '0'}
      </dd>
      <dt class="col-5 text-muted fw-normal mb-1">${t('userPanel.edits')}</dt>
      <dd class="col-7 mb-1">
        ${u.num_edits > 0
          ? `<a href="#" class="fw-semibold text-decoration-none" onclick="loadUserActivity('${esc(u.username)}');return false;">${u.num_edits} <i class="bi bi-chevron-down small"></i></a>`
          : '0'}
      </dd>
    </dl>
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
    <div class="mt-3 pt-3 border-top">
      <div class="fw-semibold small text-uppercase text-muted mb-2">${t('contacts.organizations')}</div>
      ${orgHtml}
    </div>
    ${contactHtml}
    ${u.about ? `<div class="mt-3 pt-3 border-top"><div class="fw-semibold small text-uppercase text-muted mb-2">${t('userPanel.about')}</div><p class="small text-muted mb-0">${esc(u.about)}</p></div>` : ''}
  `;
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

  const ROLE_BADGE  = { admin: 'bg-primary', editor: 'bg-success', member: 'bg-secondary' };
  const STATE_BADGE = { active: 'bg-success', deleted: 'bg-danger', pending: 'bg-warning text-dark' };
  const STATE_ICON  = { active: 'bi-check-circle-fill', deleted: 'bi-x-circle-fill', pending: 'bi-hourglass-split' };
  const members = (org.members || []).sort((a, b) => {
    const order = { admin: 0, editor: 1, member: 2 };
    return (order[a.capacity] ?? 3) - (order[b.capacity] ?? 3);
  });
  const COMM_STATUS_CLS = {
    'Initial Contact':      'bg-primary',
    'Intermediate Contact': 'bg-info text-dark',
    'Positive Response':    'bg-success',
    'Negative Response':    'bg-danger',
    'No Response':          'bg-secondary',
  };
  const PENDING_STATUSES = new Set(['Initial Contact', 'Intermediate Contact']);
  const cs = data.comms_summary || {};
  const byStatus = cs.by_status || {};
  const statusOrder = ['Initial Contact', 'Intermediate Contact', 'Positive Response', 'Negative Response', 'No Response'];
  const commsHtml = cs.total > 0
    ? `<h6 class="fw-semibold mt-4 mb-2"><i class="bi bi-envelope me-1 text-primary"></i>Communications</h6>
       <div class="d-flex flex-wrap gap-2 mb-1">
         ${statusOrder.filter(s => byStatus[s]).map(s => `
           <span class="badge ${COMM_STATUS_CLS[s]} d-flex align-items-center gap-1${PENDING_STATUSES.has(s) ? '' : ''}">
             ${PENDING_STATUSES.has(s) ? '<i class="bi bi-clock-history"></i>' : ''}
             ${s} <span class="ms-1 fw-bold">${byStatus[s]}</span>
           </span>`).join('')}
       </div>
       ${cs.latest_date ? `<div class="text-muted" style="font-size:.75rem">Last contact: ${cs.latest_date}</div>` : ''}`
    : `<h6 class="fw-semibold mt-4 mb-2"><i class="bi bi-envelope me-1 text-primary"></i>Communications</h6>
       <p class="text-muted small">No communications recorded.</p>`;

  const membersHtml = `
    <h6 class="fw-semibold mt-4 mb-2"><i class="bi bi-person-badge me-1 text-primary"></i>Portal Members</h6>
    ${members.length
      ? `<div class="list-group list-group-flush">
           ${members.map(m => {
             const state     = m.state || 'active';
             const stateCls  = STATE_BADGE[state]  || 'bg-secondary';
             const stateIcon = STATE_ICON[state]   || 'bi-circle';
             return `
             <div class="list-group-item px-0 py-2 d-flex justify-content-between align-items-center gap-2"
                  style="${state !== 'active' ? 'opacity:.7' : ''}">
               <div>
                 <div class="small fw-semibold">${m.display_name.replace(/</g,'&lt;')}</div>
                 <div class="text-muted" style="font-size:.72rem">@${m.name.replace(/</g,'&lt;')}</div>
               </div>
               <div class="d-flex gap-1 flex-wrap justify-content-end">
                 <span class="badge ${ROLE_BADGE[m.capacity] || 'bg-secondary'}">${m.capacity}</span>
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
  if (_portalMembersCache && !force) { renderContactsSummary(); filterContactsTab(); return; }

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
      if (_isTabActive('tab-contacts')) {
        renderContactsSummary();
        filterContactsTab();
        renderUnmatchedContacts();
      }
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
}

async function _pollPortalMembers(attempt, silent = false, force = false) {
  const cols = 8;
  const MAX = 40;   // give up after ~200 s
  const INTERVAL = 5000;

  if (attempt === 0 && !silent) {
    show('contactsReloadBtn').disabled = true;
    show('contactsTableBody').innerHTML =
      `<tr><td colspan="${cols}" class="text-center py-5">
         <div class="spinner-border text-primary mb-2"></div>
         <div class="text-muted small">${t('contacts.loading_portal')}</div>
       </td></tr>`;
  }

  try {
    // POST forces the server to bypass its own 2-hour cache and recompute
    // from CKAN — only needed on the first request of an explicit Reload.
    const resp = await fetch(API_BASE + 'api/portal-members', { method: (attempt === 0 && force) ? 'POST' : 'GET' });
    const data = await resp.json();

    if (resp.status === 202) {
      if (attempt < MAX) {
        _pmPollTimer = setTimeout(() => _pollPortalMembers(attempt + 1, silent, force), INTERVAL);
      } else if (!silent) {
        show('contactsTableBody').innerHTML =
          `<tr><td colspan="${cols}" class="text-center text-danger py-4">Timed out waiting for portal data.</td></tr>`;
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
    if (_isTabActive('tab-contacts')) {
      renderContactsSummary();
      filterContactsTab();
      renderUnmatchedContacts();
    }
    if (_orgsLoaded) loadContactSummary();
  } catch (e) {
    if (!silent) {
      show('contactsTableBody').innerHTML =
        `<tr><td colspan="${cols}" class="text-center text-danger py-4">${esc(e.message)}</td></tr>`;
      show('contactsReloadBtn').disabled = false;
    }
  }
}

// Prefers the name on file (entered manually / from the contacts Excel) over
// the portal account's own display name, since the CKAN profile is often a
// romanized username while the contact file has the person's real name.
function _pmDisplayName(m) {
  const fileName = `${m.contact_first_name || ''} ${m.contact_last_name || ''}`.trim();
  return fileName || m.display_name || m.username || '';
}

function sortContacts(col) {
  if (_contactsSortCol === col) _contactsSortDir = _contactsSortDir === 'asc' ? 'desc' : 'asc';
  else { _contactsSortCol = col; _contactsSortDir = 'asc'; }
  filterContactsTab();
}

function _contactsSortArrow(col) {
  if (_contactsSortCol !== col) return '<span style="opacity:.25;font-size:.8em"> ↕</span>';
  return _contactsSortDir === 'asc' ? ' ↑' : ' ↓';
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

// Role and State are independent, combinable facets (same reasoning as the
// Dataset Catalog's Type/HVD/Harvested tabs) — a contact can be filtered by
// role AND state at once, so each dimension gets its own filter value rather
// than the old single _contactsActiveFilter that could only hold one.
let _contactsRoleFilter  = null;   // e.g. 'admin', or null = every role
let _contactsStateFilter = null;   // e.g. 'active', or null = every state
let _contactsSummaryCards = [];

function _contactsFilterIsActive(f) {
  if (f.type === 'role')  return _contactsRoleFilter  === f.value;
  if (f.type === 'state') return _contactsStateFilter === f.value;
  return false;
}

// Renders a subset of _contactsSummaryCards (by original index, so
// setContactsFilter(idx) keeps working unmodified) into one tab's row, plus
// a dot on that tab's label if any card in it is the active filter — same
// pattern as the Dataset Catalog's filter-card tabs.
function _renderContactsFilterGroup(elId, indices, tabDotId) {
  const prepared = indices.map(idx => {
    const c = _contactsSummaryCards[idx];
    return { ...c, active: _contactsFilterIsActive(c.filter), onclick: `setContactsFilter(${idx})` };
  });
  const hasActive = indices.some(idx => {
    const f = _contactsSummaryCards[idx].filter;
    return f.value !== null && _contactsFilterIsActive(f);
  });
  _renderFilterCardsGrid(elId, prepared, tabDotId, hasActive ? {} : null);
}

function renderContactsSummary() {
  if (!_portalMembersCache) {
    document.getElementById('contactsRoleSummary').innerHTML = '';
    document.getElementById('contactsStateSummary').innerHTML = '';
    return;
  }
  const allRows = _dedupeContacts(_portalMembersCache);

  // Each dimension's counts are scoped to the OTHER dimension's current
  // selection (but not its own), same as the Dataset Catalog's Type/HVD/
  // Harvested tabs — so picking "Admin" updates what State's numbers mean
  // ("state breakdown among admins") instead of staying frozen at the
  // unfiltered total.
  const roleScopeRows = _contactsStateFilter
    ? allRows.filter(m => (m.state || 'active') === _contactsStateFilter)
    : allRows;
  const stateScopeRows = _contactsRoleFilter
    ? allRows.filter(m => _contactsRoleFilter === 'sysadmin' ? m.sysadmin : (!m.sysadmin && m.capacity === _contactsRoleFilter))
    : allRows;

  const roleCounts  = { admin: 0, editor: 0, member: 0, user: 0, sysadmin: 0 };
  for (const m of roleScopeRows) {
    if (m.sysadmin) roleCounts.sysadmin++;
    else if (m.capacity in roleCounts) roleCounts[m.capacity]++;
  }
  const stateCounts = { active: 0, deleted: 0, pending: 0 };
  for (const m of stateScopeRows) {
    const st = m.state || 'active';
    stateCounts[st] = (stateCounts[st] || 0) + 1;
  }

  // Each dimension keeps its own "Total/All" card (a separate filter object,
  // and now also its own count — the size of ITS OWN scope, i.e. everyone
  // matching the other dimension's filter) since clearing the Role filter
  // and clearing the State filter are two independent actions.
  _contactsSummaryCards = [
    { filter: { type: 'role', value: null },       label: t('contacts.total'), value: roleScopeRows.length, bg: "bg-secondary bg-opacity-10", text: "text-secondary", icon: "bi-people" },
    { filter: { type: 'role', value: 'admin' },    label: t('contacts.role_admin'),    value: roleCounts.admin,    bg: "bg-primary bg-opacity-10",   text: "text-primary",   icon: "bi-shield-check" },
    { filter: { type: 'role', value: 'editor' },   label: t('contacts.role_editor'),   value: roleCounts.editor,   bg: "bg-success bg-opacity-10",   text: "text-success",   icon: "bi-pencil-square" },
    { filter: { type: 'role', value: 'member' },   label: t('contacts.role_member'),   value: roleCounts.member,   bg: "bg-secondary bg-opacity-10", text: "text-secondary", icon: "bi-person" },
    { filter: { type: 'role', value: 'user' },     label: t('contacts.role_user'),     value: roleCounts.user,    bg: "bg-secondary bg-opacity-10", text: "text-secondary", icon: "bi-person-badge" },
    { filter: { type: 'role', value: 'sysadmin' }, label: t('contacts.role_sysadmin'), value: roleCounts.sysadmin, bg: "bg-danger bg-opacity-10",    text: "text-danger",    icon: "bi-shield-lock" },
    { filter: { type: 'state', value: null },      label: t('contacts.total'), value: stateScopeRows.length, bg: "bg-secondary bg-opacity-10", text: "text-secondary", icon: "bi-people" },
    { filter: { type: 'state', value: 'active' },  label: t('contacts.state_active'),  value: stateCounts.active,  bg: "bg-success bg-opacity-10",   text: "text-success",   icon: "bi-check-circle" },
    { filter: { type: 'state', value: 'pending' }, label: t('contacts.state_pending'), value: stateCounts.pending, bg: "bg-warning bg-opacity-10",   text: "text-warning",   icon: "bi-hourglass-split" },
    { filter: { type: 'state', value: 'deleted' }, label: t('contacts.state_deleted'), value: stateCounts.deleted, bg: "bg-danger bg-opacity-10",    text: "text-danger",    icon: "bi-x-circle" },
  ];

  _renderContactsFilterGroup('contactsRoleSummary',  [0, 1, 2, 3, 4, 5], 'contactsRoleTabDot');
  _renderContactsFilterGroup('contactsStateSummary', [6, 7, 8, 9],       'contactsStateTabDot');
}

function setContactsFilter(idx) {
  const card = _contactsSummaryCards[idx];
  if (!card) return;
  const f = card.filter;
  if (f.type === 'role') {
    _contactsRoleFilter = (_contactsRoleFilter === f.value) ? null : f.value;
  } else if (f.type === 'state') {
    _contactsStateFilter = (_contactsStateFilter === f.value) ? null : f.value;
  }
  renderContactsSummary();
  filterContactsTab();
}

function clearContactsFilters() {
  _contactsRoleFilter = null;
  _contactsStateFilter = null;
  renderContactsSummary();
  filterContactsTab();
}

function filterContactsTab() {
  if (_contactsScope === 'file') { filterFileContactsTab(); return; }
  if (!_portalMembersCache) return;

  const search = _ns(show('contactsSearch').value || '').trim();

  let rows = _portalMembersCache;
  if (search) rows = rows.filter(m =>
    _ns(m.org_title  || '').includes(search) ||
    _ns(m.display_name || '').includes(search) ||
    _ns(_pmDisplayName(m)).includes(search) ||
    _ns(m.username   || '').includes(search) ||
    _ns(m.email      || '').includes(search) ||
    _ns(m.contact_position || '').includes(search) ||
    _ns(m.about      || '').includes(search)
  );

  rows = _dedupeContacts(rows);

  if (_contactsRoleFilter) {
    rows = rows.filter(m => _contactsRoleFilter === 'sysadmin'
      ? m.sysadmin
      : (!m.sysadmin && m.capacity === _contactsRoleFilter));
  }
  if (_contactsStateFilter) {
    rows = rows.filter(m => (m.state || 'active') === _contactsStateFilter);
  }

  rows = [...rows].sort((a, b) => {
    let av, bv;
    switch (_contactsSortCol) {
      case 'name':  av = _ns(_pmDisplayName(a)); bv = _ns(_pmDisplayName(b)); break;
      case 'org':   av = _ns(a.org_title || a.org_name || ''); bv = _ns(b.org_title || b.org_name || ''); break;
      case 'type': { const r = { sysadmin: 0, admin: 1, editor: 2, member: 3 };
                     av = a.sysadmin ? 0 : (r[a.capacity] ?? 4); bv = b.sysadmin ? 0 : (r[b.capacity] ?? 4); break; }
      case 'state': av = (a.state || 'active'); bv = (b.state || 'active'); break;
      case 'email': av = (a.email || '').toLowerCase(); bv = (b.email || '').toLowerCase(); break;
      default:      av = _ns(_pmDisplayName(a)); bv = _ns(_pmDisplayName(b));
    }
    if (av < bv) return _contactsSortDir === 'asc' ? -1 : 1;
    if (av > bv) return _contactsSortDir === 'asc' ?  1 : -1;
    return 0;
  });

  const total = new Set(_portalMembersCache.map(m => m.username)).size;
  show('contactsCount').innerHTML = rows.length < total ? `${rows.length} / ${total}` : `${total}`;

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

  const flatDiv    = show('contactsFlatView');
  const groupedDiv = show('contactsGroupedView');
  if (_contactsViewMode === 'grouped') {
    flatDiv.classList.add('d-none');
    groupedDiv.classList.remove('d-none');
    renderContactsGrouped(rows);
    return;
  }
  flatDiv.classList.remove('d-none');
  groupedDiv.classList.add('d-none');

  if (!rows.length) {
    show('contactsTableBody').innerHTML =
      `<tr><td colspan="8" class="text-center text-muted py-4">${t('contacts.no_results')}</td></tr>`;
    return;
  }

  // Precompute username -> org-memberships once instead of scanning the full
  // portal-members cache per row (was O(rows * _portalMembersCache) below).
  const orgsByUsername = new Map();
  for (const x of (_portalMembersCache || [])) {
    if (!x.org_name) continue;
    if (!orgsByUsername.has(x.username)) orgsByUsername.set(x.username, []);
    orgsByUsername.get(x.username).push(x);
  }

  _pmRows = rows;
  show('contactsTableBody').innerHTML = rows.map((m, i) => {
    const state    = m.state || 'active';
    const roleCls   = _portalRoleClass(m);
    const roleLabel = _portalRoleLabel(m);
    const stateCls = STATE_BADGE_CLS[state]       || 'bg-secondary';
    const posLine = m.contact_position
      ? `<div class="text-muted small text-truncate" style="max-width:200px" title="${esc(m.contact_position)}">${esc(m.contact_position)}</div>` : '';
    const userOrgs = orgsByUsername.get(m.username) || [];
    const MAX_ORGS = 2;
    const orgsHtml = userOrgs.length === 0
      ? `<span class="text-muted small fst-italic">—</span>`
      : userOrgs.slice(0, MAX_ORGS).map(o =>
          `<span class="badge bg-light text-dark border me-1" style="font-size:.7rem;max-width:140px;overflow:hidden;text-overflow:ellipsis;display:inline-block;white-space:nowrap"
            title="${esc(o.org_title || o.org_name)}">${esc(o.org_title || o.org_name)}</span>`
        ).join('') +
        (userOrgs.length > MAX_ORGS ? `<span class="text-muted small">+${userOrgs.length - MAX_ORGS}</span>` : '');
    const presenceBadges =
      `<span class="badge rounded-pill me-1" style="font-size:.65rem;background:#e8f0fe;color:#1a56db" title="${esc(t('contacts.has_portal_account'))}"><i class="bi bi-globe2 me-1"></i>Portal</span>` +
      (m.contact_id ? `<span class="badge rounded-pill" style="font-size:.65rem;background:#e6f4ea;color:#188038" title="${esc(t('contacts.has_contact_file'))}"><i class="bi bi-file-earmark-person me-1"></i>File</span>` : '');
    return `<tr style="cursor:pointer;${state !== 'active' ? 'opacity:.6' : ''}" onclick="openUserPanel('${esc(m.username)}')">
      <td class="text-muted small">${i + 1}</td>
      <td style="max-width:200px">
        <span class="fw-semibold">${esc(_pmDisplayName(m))}</span> ${presenceBadges}
        ${posLine}
      </td>
      <td style="max-width:180px">${orgsHtml}</td>
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
          <button class="btn btn-outline-secondary btn-sm py-0 px-1" title="${esc(t('contacts.edit_contact_info'))}"
            onclick="openPmEdit(${i})"><i class="bi bi-pencil"></i></button>
          ${m.contact_id ? `<button class="btn btn-outline-danger btn-sm py-0 px-1" title="${esc(t('contacts.delete_contact_record'))}"
            onclick="deletePmContactRecord(${m.contact_id}, '${esc(m.username)}')"><i class="bi bi-trash"></i></button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
  requestAnimationFrame(_syncUnmatchedCols);
}

let _contactsViewMode = 'flat';

function setContactsView(mode) {
  _contactsViewMode = mode;
  show('contactsViewFlatBtn').className    = 'btn btn-sm ' + (mode === 'flat'    ? 'btn-primary' : 'btn-outline-primary');
  show('contactsViewGroupedBtn').className = 'btn btn-sm ' + (mode === 'grouped' ? 'btn-primary' : 'btn-outline-primary');
  show('contactsExpandAllBtn').classList.toggle('d-none', mode !== 'grouped');
  show('contactsCollapseAllBtn').classList.toggle('d-none', mode !== 'grouped');
  filterContactsTab();
}

// Unified = every portal account (enriched with any matched contact-file data) plus,
// below it, the file contacts that have no matching portal account. Portal Members =
// the same enriched portal-account table, minus that no-portal-account section (a pure
// "what does the portal say" view). File Contacts = every org_contacts row regardless
// of portal match, fetched separately via /api/contacts.
let _contactsScope = 'unified';   // 'unified' | 'portal' | 'file'

function setContactsScope(scope) {
  _contactsScope = scope;
  show('contactsScopeUnifiedBtn').className = 'btn btn-sm ' + (scope === 'unified' ? 'btn-primary' : 'btn-outline-primary');
  show('contactsScopePortalBtn').className  = 'btn btn-sm ' + (scope === 'portal'  ? 'btn-primary' : 'btn-outline-primary');
  show('contactsScopeFileBtn').className    = 'btn btn-sm ' + (scope === 'file'    ? 'btn-primary' : 'btn-outline-primary');

  const isFile = scope === 'file';
  show('contactsLayoutToggle').classList.toggle('d-none', isFile);
  show('contactsFilterSummaryPanel').classList.toggle('d-none', isFile);
  show('fileContactsView').classList.toggle('d-none', !isFile);
  show('contactsFlatView').classList.toggle('d-none', isFile || _contactsViewMode !== 'flat');
  show('contactsGroupedView').classList.toggle('d-none', isFile || _contactsViewMode !== 'grouped');

  if (isFile) {
    if (_fileContactsCache) filterFileContactsTab();
    else loadFileContactsTab();
    return;
  }
  renderUnmatchedContacts();
  filterContactsTab();
}

function reloadContactsTab() {
  if (_contactsScope === 'file') loadFileContactsTab(true);
  else loadContactsTab(true);
}

let _contactsExpandedOrgs = new Set();
let _contactsGroupSlugs   = [];  // slugs from the most recent renderContactsGrouped(), for Expand/Collapse All

function toggleContactsOrg(slug) {
  if (_contactsExpandedOrgs.has(slug)) _contactsExpandedOrgs.delete(slug);
  else _contactsExpandedOrgs.add(slug);
  filterContactsTab();
}

function expandAllContacts() {
  _contactsGroupSlugs.forEach(slug => _contactsExpandedOrgs.add(slug));
  filterContactsTab();
}

function collapseAllContacts() {
  _contactsExpandedOrgs.clear();
  filterContactsTab();
}

function renderContactsGrouped(rows) {
  const groups = new Map();
  rows.forEach(m => {
    const orgName  = m.org_name  || '__none__';
    const orgTitle = m.org_title || m.org_name || '(no organization)';
    if (!groups.has(orgName)) groups.set(orgName, { slug: orgName, label: orgTitle, items: [] });
    groups.get(orgName).items.push(m);
  });
  const sorted = [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, 'el'));
  _contactsGroupSlugs = sorted.map(g => g.slug);
  const el = show('contactsGroupedView');
  if (!sorted.length) {
    el.innerHTML = `<p class="text-muted text-center py-4">${t('contacts.no_results')}</p>`;
    return;
  }
  el.innerHTML = sorted.map(g => {
    const gId        = 'cg_' + g.slug.replace(/\W/g, '_');
    const isNone     = g.slug === '__none__';
    const isExpanded = _contactsExpandedOrgs.has(g.slug);
    return `
    <div class="border rounded mb-2" ${isNone ? 'style="border-color:#fd7e14!important"' : ''}>
      <div class="d-flex align-items-center justify-content-between px-3 py-2 ${isNone ? 'comm-group-row-warn' : 'comm-group-row'}"
           style="cursor:pointer" onclick="toggleContactsOrg('${esc(g.slug)}')">
        <div class="d-flex align-items-center gap-2">
          <i class="bi bi-chevron-${isExpanded ? 'down' : 'right'} text-muted small"></i>
          <i class="bi bi-${isNone ? 'person-slash text-warning' : 'building text-primary'}"></i>
          <span class="fw-semibold small ${isNone ? 'text-warning-emphasis' : ''}">${esc(g.label)}</span>
          <span class="badge ${isNone ? 'bg-warning text-dark' : 'bg-secondary'} rounded-pill">${g.items.length}</span>
        </div>
        ${g.slug !== '__none__' ? `<button class="btn btn-outline-primary btn-sm py-0 px-2" title="${esc(g.label)}"
          onclick="event.stopPropagation();openOrgPanel('${esc(g.slug)}')">
          <i class="bi bi-box-arrow-up-right"></i>
        </button>` : ''}
      </div>
      <div id="${gId}" class="${isExpanded ? '' : 'd-none'} px-3">
        <table class="table table-hover table-sm align-middle mb-0">
          <tbody>
            ${g.items.map((m, mi) => {
              const state     = m.state || 'active';
              const roleCls   = _portalRoleClass(m);
              const roleLabel = _portalRoleLabel(m);
              const stateCls  = STATE_BADGE_CLS[state] || 'bg-secondary';
              const posLine   = m.contact_position
                ? `<div class="text-muted small text-truncate" style="max-width:200px" title="${esc(m.contact_position)}">${esc(m.contact_position)}</div>` : '';
              const presenceBadges =
                `<span class="badge rounded-pill me-1" style="font-size:.65rem;background:#e8f0fe;color:#1a56db" title="${esc(t('contacts.has_portal_account'))}"><i class="bi bi-globe2 me-1"></i>Portal</span>` +
                (m.contact_id ? `<span class="badge rounded-pill" style="font-size:.65rem;background:#e6f4ea;color:#188038" title="${esc(t('contacts.has_contact_file'))}"><i class="bi bi-file-earmark-person me-1"></i>File</span>` : '');
              return `<tr style="cursor:pointer;${state !== 'active' ? 'opacity:.6' : ''}" onclick="openUserPanel('${esc(m.username)}')">
                <td style="max-width:200px">
                  <span class="fw-semibold">${esc(_pmDisplayName(m))}</span> ${presenceBadges}
                  ${posLine}
                </td>
                <td><span class="badge ${roleCls}">${esc(roleLabel)}</span></td>
                <td><span class="badge ${stateCls}">${esc(_contactStateLabel(state))}</span></td>
                <td class="small" style="max-width:150px;overflow:hidden" onclick="event.stopPropagation()">
                  ${m.email ? `<a class="d-block text-truncate" href="mailto:${esc(m.email)}" title="${esc(m.email)}">${esc(m.email)}</a>` : ''}
                  ${m.contact_email && m.contact_email !== m.email ? `<div class="text-muted text-truncate" style="font-size:.75em" title="${esc(m.contact_email)}"><i class="bi bi-file-earmark-person me-1"></i>${esc(m.contact_email)}</div>` : ''}
                </td>
                <td class="small text-nowrap" style="width:90px" onclick="event.stopPropagation()">
                  ${m.contact_tel ? `<a href="tel:${esc(m.contact_tel)}" class="text-decoration-none"><i class="bi bi-telephone me-1"></i>${esc(m.contact_tel)}</a>` : ''}
                </td>
                <td onclick="event.stopPropagation()">
                  <div class="d-flex gap-1">
                    <button class="btn btn-outline-secondary btn-sm py-0 px-1" title="${esc(t('common.edit'))}" onclick="openPmEditByUsername('${esc(m.username)}')"><i class="bi bi-pencil"></i></button>
                    ${m.contact_id ? `<button class="btn btn-outline-danger btn-sm py-0 px-1" title="${esc(t('common.delete'))}" onclick="deletePmContactRecord(${m.contact_id},'${esc(m.username)}')"><i class="bi bi-trash"></i></button>` : ''}
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }).join('');
}

let _pmRows = [];
let _pmUnmatched = [];
let _pmEditModal = null;
let _pmEditOrgs  = [];  // [{code, label}, ...] — orgs selected in the edit modal

function _syncUnmatchedCols() {
  const srcThs = document.querySelectorAll('#contactsTable thead th');
  const cols   = document.querySelectorAll('#pmUnmatchedColgroup col');
  if (!srcThs.length || !cols.length) return;
  srcThs.forEach((th, i) => { if (cols[i]) cols[i].style.width = th.offsetWidth + 'px'; });
}

function renderUnmatchedContacts() {
  const sec = show('pmUnmatchedSection');
  // Only the Unified view mixes portal accounts with contacts that have none —
  // Portal Members hides them (no portal account = out of scope) and File
  // Contacts shows them itself, deduped in with the matched ones.
  if (_contactsScope !== 'unified' || !_pmUnmatched.length) { sec.classList.add('d-none'); return; }
  sec.classList.remove('d-none');
  show('pmUnmatchedCount').textContent = _pmUnmatched.length;
  show('pmUnmatchedBody').innerHTML = _pmUnmatched.map((c, i) => {
    const name = [c.first_name, c.last_name].filter(Boolean).join(' ');
    const posLine = c.position
      ? `<div class="text-muted small text-truncate" style="max-width:200px" title="${esc(c.position)}">${esc(c.position)}</div>` : '';
    const typeBadges = (c.contact_type || '').split(',').map(s => s.trim()).filter(Boolean)
      .map(s => `<span class="badge me-1 ${CONTACT_TYPE_CLS[s] || 'bg-secondary'}" style="font-size:.7rem">${esc(s)}</span>`).join('');
    const orgBadge = (c.org_label || c.org_code)
      ? `<span class="badge bg-light text-dark border" style="font-size:.7rem;max-width:140px;overflow:hidden;text-overflow:ellipsis;display:inline-block;white-space:nowrap"
           title="${esc(c.org_label || c.org_code)}">${esc(c.org_label || c.org_code)}</span>` : '—';
    return `<tr>
      <td class="text-muted small">${i + 1}</td>
      <td style="max-width:200px">
        <span class="fw-semibold">${esc(name) || '<span class="text-muted fst-italic">—</span>'}</span> <span class="badge rounded-pill" style="font-size:.65rem;background:#e6f4ea;color:#188038" title="Has contact file entry"><i class="bi bi-file-earmark-person me-1"></i>File</span>
        ${posLine}
      </td>
      <td style="max-width:180px">${orgBadge}</td>
      <td>${typeBadges || '<span class="text-muted small">—</span>'}</td>
      <td></td>
      <td class="small" style="width:150px;max-width:150px;overflow:hidden" onclick="event.stopPropagation()">
        ${c.email ? `<a class="d-block text-truncate" href="mailto:${esc(c.email)}" title="${esc(c.email)}">${esc(c.email)}</a>` : ''}
      </td>
      <td class="small text-nowrap" style="width:90px" onclick="event.stopPropagation()">
        ${c.tel ? `<a href="tel:${esc(c.tel)}" class="text-decoration-none"><i class="bi bi-telephone me-1"></i>${esc(c.tel)}</a>`
                : c.mobile ? `<a href="tel:${esc(c.mobile)}" class="text-decoration-none"><i class="bi bi-phone me-1"></i>${esc(c.mobile)}</a>` : ''}
      </td>
      <td onclick="event.stopPropagation()">
        <div class="d-flex gap-1">
          <button class="btn btn-outline-secondary btn-sm py-0 px-1" title="Edit"
            onclick="openPmEditUnmatched(${i})"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-outline-danger btn-sm py-0 px-1" title="Delete"
            onclick="deletePmContactRecord(${c.id}, null)"><i class="bi bi-trash"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
  requestAnimationFrame(_syncUnmatchedCols);
}

// ── File Contacts view — every org_contacts row (Excel import / manual entry),
// matched or not, independent of whether it also has a portal account. Backs
// the "File Contacts" scope; fetched separately from the CKAN-driven
// _portalMembersCache since it's the same data source contacts_import etc. use.
let _fileContactsCache = null;

async function loadFileContactsTab(force = false) {
  if (_fileContactsCache && !force) { filterFileContactsTab(); return; }
  show('fileContactsTableBody').innerHTML =
    `<tr><td colspan="8" class="text-center py-5">
       <div class="spinner-border text-primary mb-2"></div>
     </td></tr>`;
  try {
    const resp = await fetch(API_BASE + 'api/contacts');
    const data = await resp.json();
    _fileContactsCache = Array.isArray(data) ? data : [];
    filterFileContactsTab();
  } catch (e) {
    show('fileContactsTableBody').innerHTML =
      `<tr><td colspan="8" class="text-center text-danger py-4">${esc(e.message)}</td></tr>`;
  }
}

function filterFileContactsTab() {
  if (_contactsScope !== 'file') return;
  if (!_fileContactsCache) { loadFileContactsTab(); return; }

  const search = _ns(show('contactsSearch').value || '').trim();
  let rows = _fileContactsCache;
  if (search) rows = rows.filter(c =>
    _ns(`${c.first_name || ''} ${c.last_name || ''}`).includes(search) ||
    _ns(c.org_label   || '').includes(search) ||
    _ns(c.position    || '').includes(search) ||
    _ns(c.email       || '').includes(search)
  );
  renderFileContactsTab(rows);
}

function renderFileContactsTab(rows) {
  show('contactsCount').innerHTML = rows.length < _fileContactsCache.length
    ? `${rows.length} / ${_fileContactsCache.length}` : `${_fileContactsCache.length}`;

  if (!rows.length) {
    show('fileContactsTableBody').innerHTML =
      `<tr><td colspan="8" class="text-center text-muted py-4">${t('contacts.no_results')}</td></tr>`;
    return;
  }

  // A file contact counts as portal-linked if some portal-member row carries
  // its id (set server-side by _do_fetch_portal_members's email match).
  const portalByContactId = new Map();
  for (const m of (_portalMembersCache || [])) {
    if (m.contact_id && !portalByContactId.has(m.contact_id)) portalByContactId.set(m.contact_id, m);
  }

  show('fileContactsTableBody').innerHTML = rows.map((c, i) => {
    const name = [c.first_name, c.last_name].filter(Boolean).join(' ');
    const posLine = c.position
      ? `<div class="text-muted small text-truncate" style="max-width:200px" title="${esc(c.position)}">${esc(c.position)}</div>` : '';
    const typeBadges = (c.contact_type || '').split(',').map(s => s.trim()).filter(Boolean)
      .map(s => `<span class="badge me-1 ${CONTACT_TYPE_CLS[s] || 'bg-secondary'}" style="font-size:.7rem">${esc(s)}</span>`).join('');
    const orgBadge = (c.org_label || c.org_code)
      ? `<span class="badge bg-light text-dark border" style="font-size:.7rem;max-width:140px;overflow:hidden;text-overflow:ellipsis;display:inline-block;white-space:nowrap"
           title="${esc(c.org_label || c.org_code)}">${esc(c.org_label || c.org_code)}</span>` : '—';
    const portalMatch = portalByContactId.get(c.id);
    const portalBadge = portalMatch
      ? `<span class="badge rounded-pill" style="font-size:.65rem;background:#e8f0fe;color:#1a56db;cursor:pointer" title="${esc(t('contacts.has_portal_account'))}"
           onclick="event.stopPropagation();openUserPanel('${esc(portalMatch.username)}')"><i class="bi bi-globe2 me-1"></i>${esc(portalMatch.username)}</span>`
      : `<span class="text-muted small">${esc(t('contacts.no_portal_account'))}</span>`;
    return `<tr>
      <td class="text-muted small">${i + 1}</td>
      <td style="max-width:200px">
        <span class="fw-semibold">${esc(name) || '<span class="text-muted fst-italic">—</span>'}</span>
        ${posLine}
      </td>
      <td style="max-width:180px">${orgBadge}</td>
      <td>${typeBadges || '<span class="text-muted small">—</span>'}</td>
      <td>${portalBadge}</td>
      <td class="small" style="width:150px;max-width:150px;overflow:hidden" onclick="event.stopPropagation()">
        ${c.email ? `<a class="d-block text-truncate" href="mailto:${esc(c.email)}" title="${esc(c.email)}">${esc(c.email)}</a>` : ''}
      </td>
      <td class="small text-nowrap" style="width:90px" onclick="event.stopPropagation()">
        ${c.tel ? `<a href="tel:${esc(c.tel)}" class="text-decoration-none"><i class="bi bi-telephone me-1"></i>${esc(c.tel)}</a>`
                : c.mobile ? `<a href="tel:${esc(c.mobile)}" class="text-decoration-none"><i class="bi bi-phone me-1"></i>${esc(c.mobile)}</a>` : ''}
      </td>
      <td onclick="event.stopPropagation()">
        <div class="d-flex gap-1">
          <button class="btn btn-outline-secondary btn-sm py-0 px-1" title="${esc(t('common.edit'))}"
            onclick="openPmEditFileContact(${c.id})"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-outline-danger btn-sm py-0 px-1" title="${esc(t('common.delete'))}"
            onclick="deletePmContactRecord(${c.id}, ${portalMatch ? `'${esc(portalMatch.username)}'` : 'null'})"><i class="bi bi-trash"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function openPmEditFileContact(id) {
  const c = (_fileContactsCache || []).find(c => c.id === id);
  if (!c) return;
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || '(no name)';
  show('pmEditTitle').textContent   = name + ' — ' + (c.org_label || c.org_code);
  show('pmEditIcon').className      = 'bi bi-pencil me-2';
  show('pmEditContactId').value     = c.id        || '';
  show('pmEditUsername').value      = '';
  show('pmEditEmail').value         = c.email     || '';
  _pmEditOrgs = (c.org_codes && c.org_codes.length)
    ? c.org_codes
    : (c.org_code ? [{code: c.org_code, label: c.org_label || c.org_code}] : []);
  _pmOrgRenderTags();
  show('pmEditFirstName').value     = c.first_name || '';
  show('pmEditLastName').value      = c.last_name  || '';
  show('pmEditPosition').value      = c.position   || '';
  _pmSetContactType(c.contact_type || '');
  show('pmEditTel').value           = c.tel    || '';
  show('pmEditMobile').value        = c.mobile || '';
  show('pmEditStatus').textContent  = '';
  show('pmEditOrgRow').classList.remove('d-none');
  if (!_pmEditModal) _pmEditModal = new bootstrap.Modal(document.getElementById('pmEditModal'));
  _pmEditModal.show();
}

function _pmSetContactType(val) {
  const sel = show('pmEditContactType');
  const active = new Set((val || '').split(',').map(s => s.trim()).filter(Boolean));
  for (const opt of sel.options) opt.selected = active.has(opt.value);
}

// Org search picker helpers
function _orgSearchDropdown(q, dropdownId, selectFn) {
  const dd = document.getElementById(dropdownId);
  const nq = _ns((q || '').trim());
  const ckanPool = _orgsData.length ? _orgsData : (() => {
    try { const c = JSON.parse(localStorage.getItem(_ORGS_CACHE_KEY) || 'null'); return (c && c.data) || []; } catch(_) { return []; }
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
function _pmOrgSearch(q) { _orgSearchDropdown(q, 'pmEditOrgDropdown', '_pmOrgSelect'); }

function _commAllContacts() {
  const contacts = [];
  const seen = new Set();
  for (const m of (_portalMembersCache || [])) {
    if (!m.contact_id || seen.has(m.contact_id)) continue;
    seen.add(m.contact_id);
    contacts.push({
      first_name: m.contact_first_name, last_name: m.contact_last_name,
      position: m.contact_position, email: m.contact_email, tel: m.contact_tel,
      org_code: m.org_name || '', org_label: m.org_title || m.org_name || '',
    });
  }
  for (const c of (_pmUnmatched || [])) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    contacts.push({
      first_name: c.first_name, last_name: c.last_name,
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
  onCommOrgInput(_commContactLabel(c));
}
function _pmOrgRenderTags() {
  const container = document.getElementById('pmEditOrgTags');
  if (!container) return;
  container.innerHTML = _pmEditOrgs.map(o =>
    `<span class="badge ${o.locked ? 'bg-primary' : 'bg-secondary'} d-inline-flex align-items-center gap-1" style="font-size:.8em">` +
    (o.locked ? `<i class="bi bi-lock-fill" style="font-size:.7em"></i>` : '') +
    `${esc(o.label || o.code)}` +
    (!o.locked
      ? `<button type="button" class="btn-close btn-close-white" style="font-size:.55em;margin-left:.25em"` +
        ` onclick="_pmOrgRemove('${esc(o.code)}')" title="${t('common.remove')}"></button>`
      : '') +
    `</span>`
  ).join('');
}
function _pmOrgRemove(code) {
  _pmEditOrgs = _pmEditOrgs.filter(o => o.code !== code || o.locked);
  _pmOrgRenderTags();
}
function _pmOrgSelect(code, label) {
  if (!code || _pmEditOrgs.some(o => o.code === code)) return;
  _pmEditOrgs.push({code, label: label || code});
  _pmOrgRenderTags();
  const s = document.getElementById('pmEditOrgSearch');
  if (s) s.value = '';
  document.getElementById('pmEditOrgDropdown').classList.add('d-none');
}
function _pmOrgClear() {
  _pmEditOrgs = [];
  _pmOrgRenderTags();
  const s = document.getElementById('pmEditOrgSearch');
  if (s) { s.value = ''; s.focus(); }
  document.getElementById('pmEditOrgDropdown').classList.add('d-none');
}
function _pmOrgSetFixed(code, label) {
  _pmEditOrgs = code ? [{code, label: label || code}] : [];
  _pmOrgRenderTags();
  const s = document.getElementById('pmEditOrgSearch');
  if (s) s.value = '';
  document.getElementById('pmEditOrgDropdown').classList.add('d-none');
}
function _pmOrgReset() {
  _pmEditOrgs = [];
  _pmOrgRenderTags();
  const s = document.getElementById('pmEditOrgSearch');
  if (s) s.value = '';
  document.getElementById('pmEditOrgDropdown').classList.add('d-none');
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

function deletePmContactRecord(contactId, username) {
  confirmDangerAction(t('contacts.delete_confirm'), async () => {
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
        renderUnmatchedContacts();
      }
      if (_fileContactsCache) _fileContactsCache = _fileContactsCache.filter(c => c.id !== contactId);
      _allContacts = null; _allUnified = null;
      filterContactsTab();
      if (document.getElementById('orgContactsPanel')?.classList.contains('show')) _renderOrgContactsPanel();
      loadContactSummary();
    } catch (e) {
      alert(t('contacts.delete_failed') + ' ' + e.message);
    }
  });
}

// Email duplicate check for new contacts
let _pmExistingMatch = null;
function _pmCheckEmailDuplicate() {
  // Only run for new contacts (no existing contact id)
  if (show('pmEditContactId').value) return;
  const email = show('pmEditEmail').value.trim().toLowerCase();
  const hint  = document.getElementById('pmEditEmailHint');
  if (!email) { hint.classList.add('d-none'); _pmExistingMatch = null; return; }

  // Search unmatched contacts and portal member contacts
  let found = null;
  for (const c of (_pmUnmatched || [])) {
    if ((c.email || '').toLowerCase() === email) { found = {
      first_name: c.first_name, last_name: c.last_name,
      position: c.position, contact_type: c.contact_type,
      tel: c.tel, mobile: c.mobile,
      org_code: c.org_code, org_label: c.org_label, org_codes: c.org_codes || [],
      _label: [c.first_name, c.last_name].filter(Boolean).join(' ') || email,
      _org: c.org_label || c.org_code || '',
    }; break; }
  }
  if (!found) {
    const _seenPortalEmail = new Set();
    for (const m of (_portalMembersCache || [])) {
      if ((m.email || '').toLowerCase() !== email) continue;
      if (_seenPortalEmail.has(m.username)) continue;
      _seenPortalEmail.add(m.username);
      const _dn = (m.display_name || '').trim();
      const _dnParts = (_dn && !_dn.includes('@') && _dn.toLowerCase() !== (m.username || '').toLowerCase())
        ? _dn.split(/\s+/) : [];
      found = {
        first_name: m.contact_first_name || (_dnParts.length ? (_dnParts.slice(0, -1).join(' ') || _dnParts[0]) : ''),
        last_name:  m.contact_last_name  || (_dnParts.length > 1 ? _dnParts[_dnParts.length - 1] : ''),
        position:   m.contact_position   || '',
        contact_type: m.contact_type || _capacityToType(m.capacity),
        tel: m.contact_tel || '', mobile: m.contact_mobile || '',
        org_code: m.org_name, org_label: m.org_title || m.org_name,
        username: m.username || '',
        contact_org_codes: m.contact_org_codes || [],
        _label: m.contact_name || m.display_name || email,
        _org: m.org_title || m.org_name || '',
      }; break;
    }
  }

  if (found) {
    _pmExistingMatch = found;
    const parts = [found._label, found._org].filter(Boolean);
    show('pmEditEmailHintMsg').textContent =
      `A contact with this email already exists: ${parts.join(' — ')}`;
    hint.classList.remove('d-none');
  } else {
    _pmExistingMatch = null;
    hint.classList.add('d-none');
  }
}
function _pmFillFromExisting() {
  if (!_pmExistingMatch) return;
  const f = _pmExistingMatch;
  show('pmEditFirstName').value = f.first_name || '';
  show('pmEditLastName').value  = f.last_name  || '';
  show('pmEditPosition').value  = f.position   || '';
  _pmSetContactType(f.contact_type || '');
  show('pmEditTel').value    = f.tel    || '';
  show('pmEditMobile').value = f.mobile || '';
  if (f.username) show('pmEditUsername').value = f.username;
  if (f.contact_org_codes && f.contact_org_codes.length) {
    _pmEditOrgs = f.contact_org_codes.map(o => ({...o}));
  } else if (f.org_codes && f.org_codes.length) {
    _pmEditOrgs = f.org_codes.map(o => ({...o}));
  } else if (f.org_code && !_pmEditOrgs.some(o => o.code === f.org_code)) {
    _pmEditOrgs.push({code: f.org_code, label: f.org_label || f.org_code});
  }
  if (f.username) _pmApplyPortalOrgLocks(f.username);
  _pmOrgRenderTags();
  const _s = document.getElementById('pmEditOrgSearch');
  if (_s) _s.value = '';
  document.getElementById('pmEditOrgDropdown').classList.add('d-none');
  document.getElementById('pmEditEmailHint').classList.add('d-none');
  _pmExistingMatch = null;
}

function openPmEditUnmatched(idx) {
  const c = _pmUnmatched[idx];
  if (!c) return;
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || '(no name)';
  show('pmEditTitle').textContent   = name + ' — ' + (c.org_label || c.org_code);
  show('pmEditIcon').className      = 'bi bi-pencil me-2';
  show('pmEditContactId').value     = c.id        || '';
  show('pmEditUsername').value      = '';
  show('pmEditEmail').value         = c.email     || '';
  _pmEditOrgs = (c.org_codes && c.org_codes.length)
    ? c.org_codes
    : (c.org_code ? [{code: c.org_code, label: c.org_label || c.org_code}] : []);
  _pmOrgRenderTags();
  show('pmEditFirstName').value     = c.first_name || '';
  show('pmEditLastName').value      = c.last_name  || '';
  show('pmEditPosition').value      = c.position   || '';
  _pmSetContactType(c.contact_type || '');
  show('pmEditTel').value           = c.tel    || '';
  show('pmEditMobile').value        = c.mobile || '';
  show('pmEditStatus').textContent  = '';
  if (!_pmEditModal) _pmEditModal = new bootstrap.Modal(document.getElementById('pmEditModal'));
  _pmEditModal.show();
}

function openPmEditNew() {
  show('pmEditTitle').textContent   = 'New Contact';
  show('pmEditIcon').className      = 'bi bi-person-plus me-2';
  show('pmEditContactId').value     = '';
  show('pmEditUsername').value      = '';
  show('pmEditEmail').value         = '';
  _pmOrgReset();
  show('pmEditFirstName').value     = '';
  show('pmEditLastName').value      = '';
  show('pmEditPosition').value      = '';
  _pmSetContactType('');
  show('pmEditTel').value           = '';
  show('pmEditMobile').value        = '';
  document.getElementById('pmEditEmailHint').classList.add('d-none');
  _pmExistingMatch = null;
  show('pmEditStatus').textContent  = '';
  show('pmEditOrgRow').classList.remove('d-none');
  if (!_pmEditModal) _pmEditModal = new bootstrap.Modal(document.getElementById('pmEditModal'));
  // Preload HRMS orgs in background so they appear in the picker
  if (!_publicOrgs.length) fetch(API_BASE + 'api/public-orgs').then(r => r.json()).then(d => { if (Array.isArray(d)) _publicOrgs = d; }).catch(() => {});
  _pmEditModal.show();
}

function openPmEditNewForUser(username, email, orgCode, orgLabel, capacity = '') {
  show('pmEditTitle').textContent   = 'New Contact';
  show('pmEditIcon').className      = 'bi bi-person-plus me-2';
  show('pmEditContactId').value     = '';
  show('pmEditUsername').value      = username || '';
  show('pmEditEmail').value         = email    || '';
  _pmEditOrgs = [];
  _pmApplyPortalOrgLocks(username);
  // Fallback when cache not yet loaded — use the org passed in
  if (!_pmEditOrgs.length && orgCode)
    _pmEditOrgs = [{code: orgCode, label: orgLabel || orgCode, locked: !!username}];
  _pmOrgRenderTags();
  // Pre-fill name from portal display_name when a portal member is known
  const m = username ? (_portalMembersCache || []).find(x => x.username === username) : null;
  const np = m ? _pmPortalNameParts(m) : {first: '', last: ''};
  show('pmEditFirstName').value     = np.first;
  show('pmEditLastName').value      = np.last;
  show('pmEditPosition').value      = '';
  const cap = capacity || (m && m.capacity) || '';
  _pmSetContactType(cap ? _capacityToType(cap) : '');
  show('pmEditTel').value           = '';
  show('pmEditMobile').value        = '';
  document.getElementById('pmEditEmailHint').classList.add('d-none');
  _pmExistingMatch = null;
  show('pmEditStatus').textContent  = '';
  show('pmEditOrgRow').classList.remove('d-none');
  if (!_pmEditModal) _pmEditModal = new bootstrap.Modal(document.getElementById('pmEditModal'));
  if (email && !username) _pmCheckEmailDuplicate();
  _pmEditModal.show();
}

function _pmApplyPortalOrgLocks(username) {
  if (!username) return;
  (_portalMembersCache || [])
    .filter(x => x.username === username && x.org_name)
    .forEach(x => _pmLockPortalOrg(x.org_name, x.org_title || x.org_name));
}

function _pmLockPortalOrg(portalOrgCode, portalOrgLabel) {
  if (!portalOrgCode) return;
  let found = false;
  _pmEditOrgs = _pmEditOrgs.map(o => {
    if (_orgCodeMatches(o.code, portalOrgCode) || o.code === portalOrgCode) {
      found = true;
      return {code: o.code, label: o.label, locked: true};
    }
    return o;
  });
  if (!found) _pmEditOrgs.unshift({code: portalOrgCode, label: portalOrgLabel || portalOrgCode, locked: true});
}

function _pmPortalNameParts(m) {
  const dn = (m.display_name || '').trim();
  const parts = (dn && !dn.includes('@') && dn.toLowerCase() !== (m.username || '').toLowerCase())
    ? dn.split(/\s+/) : [];
  return {
    first: parts.length ? (parts.slice(0, -1).join(' ') || parts[0]) : '',
    last:  parts.length > 1 ? parts[parts.length - 1] : '',
  };
}

function openPmEditByUsername(username) {
  // Find in _pmRows first (flat view), fall back to full cache
  const pool = (_pmRows && _pmRows.length ? _pmRows : null)
    || (_portalMembersCache || []);
  const idx = pool.findIndex(m => m.username === username);
  if (idx !== -1 && pool === _pmRows) { openPmEdit(idx); return; }
  // Use cache directly if not in current filtered rows
  const m = (_portalMembersCache || []).find(m => m.username === username);
  if (!m) return;
  show('pmEditTitle').textContent   = m.display_name + ' — ' + (m.org_title || m.org_name);
  show('pmEditIcon').className      = 'bi bi-pencil me-2';
  show('pmEditContactId').value     = m.contact_id   || '';
  show('pmEditUsername').value      = m.username     || '';
  show('pmEditEmail').value         = m.email        || '';
  _pmEditOrgs = (m.contact_org_codes && m.contact_org_codes.length)
    ? m.contact_org_codes.map(o => ({...o}))
    : [];
  _pmApplyPortalOrgLocks(m.username);
  _pmOrgRenderTags();
  { const np = _pmPortalNameParts(m);
    show('pmEditFirstName').value = m.contact_first_name || np.first;
    show('pmEditLastName').value  = m.contact_last_name  || np.last; }
  show('pmEditPosition').value      = m.contact_position   || '';
  _pmSetContactType(m.contact_type || _capacityToType(m.capacity));
  show('pmEditTel').value           = m.contact_tel        || '';
  show('pmEditMobile').value        = m.contact_mobile     || '';
  show('pmEditStatus').textContent  = '';
  document.getElementById('pmEditEmailHint').classList.add('d-none');
  show('pmEditOrgRow').classList.remove('d-none');
  if (!_pmEditModal) _pmEditModal = new bootstrap.Modal(document.getElementById('pmEditModal'));
  _pmEditModal.show();
}

function openPmEdit(idx) {
  const m = _pmRows[idx];
  if (!m) return;
  show('pmEditTitle').textContent   = m.display_name + ' — ' + (m.org_title || m.org_name);
  show('pmEditIcon').className      = 'bi bi-pencil me-2';
  show('pmEditContactId').value     = m.contact_id   || '';
  show('pmEditUsername').value      = m.username     || '';
  show('pmEditEmail').value         = m.email        || '';
  _pmEditOrgs = (m.contact_org_codes && m.contact_org_codes.length)
    ? m.contact_org_codes.map(o => ({...o}))
    : [];
  _pmApplyPortalOrgLocks(m.username);
  _pmOrgRenderTags();
  { const np = _pmPortalNameParts(m);
    show('pmEditFirstName').value = m.contact_first_name || np.first;
    show('pmEditLastName').value  = m.contact_last_name  || np.last; }
  show('pmEditPosition').value      = m.contact_position   || '';
  _pmSetContactType(m.contact_type || _capacityToType(m.capacity));
  show('pmEditTel').value           = m.contact_tel        || '';
  show('pmEditMobile').value        = m.contact_mobile     || '';
  show('pmEditStatus').textContent  = '';
  show('pmEditOrgRow').classList.remove('d-none');
  if (!_pmEditModal) _pmEditModal = new bootstrap.Modal(document.getElementById('pmEditModal'));
  _pmEditModal.show();
}

async function savePmContact() {
  const contactId = show('pmEditContactId').value;
  if (!_pmEditOrgs.length) {
    show('pmEditStatus').textContent = t('contacts.select_org_required');
    document.getElementById('pmEditOrgSearch').focus();
    return;
  }
  const payload = {
    id:           contactId || undefined,
    org_codes:    _pmEditOrgs.map(({code, label}) => ({code, label})),
    org_code:     _pmEditOrgs[0].code,
    org_label:    _pmEditOrgs[0].label,
    email:        show('pmEditEmail').value,
    first_name:   show('pmEditFirstName').value.trim(),
    last_name:    show('pmEditLastName').value.trim(),
    position:     show('pmEditPosition').value.trim(),
    contact_type: Array.from(show('pmEditContactType').selectedOptions).map(o => o.value).join(','),
    tel:          show('pmEditTel').value.trim(),
    mobile:       show('pmEditMobile').value.trim(),
  };
  show('pmEditStatus').textContent = t('common.saving');
  const resp = await fetch(API_BASE + 'api/contacts/save', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload),
  });
  const data = await resp.json();
  if (data.error) { show('pmEditStatus').textContent = data.error; return; }

  // Update the right cache depending on context
  const username   = show('pmEditUsername').value;
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
      renderUnmatchedContacts();
    }
  } else if (existingPortalMatches.length) {
    existingPortalMatches.forEach(applyToPortalRow);
    filterContactsTab();
  } else {
    // Editing an existing unmatched contact
    const idx = _pmUnmatched.findIndex(c => c.id === data.id);
    if (idx >= 0) _pmUnmatched[idx] = data;
    else _pmUnmatched.unshift(data);
    renderUnmatchedContacts();
  }
  if (_fileContactsCache) {
    const fIdx = _fileContactsCache.findIndex(c => c.id === data.id);
    if (fIdx >= 0) _fileContactsCache[fIdx] = data;
    else _fileContactsCache.unshift(data);
    if (_contactsScope === 'file') filterFileContactsTab();
  }
  _pmSaveCache(_portalMembersCache, _pmUnmatched);
  _pmEditModal.hide();
  if (document.getElementById('orgContactsPanel')?.classList.contains('show')) _renderOrgContactsPanel();
  loadContactSummary();
  // If opened from the comm modal, refresh its contact list and auto-select the new person
  if (document.getElementById('commModal')?.classList.contains('show')) {
    const newName = [data.first_name, data.last_name].filter(Boolean).join(' ');
    onCommOrgInput(newName || undefined);
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
    const key = v.id_visit ?? `${v.lat},${v.lon},${v.timestamp}`;
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
      radius: 6, color: '#dc3545', fillColor: '#dc3545', fillOpacity: 0.6, weight: 1, opacity: 1,
    }).bindTooltip(`${esc(v.city ? v.city + ', ' : '')}${esc(v.country || t('live.unknown'))}`);
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
    // Actual flag images (flag-icons lib) instead of Unicode flag emoji — regional-indicator
    // emoji don't render as flags on every OS/font (notably plain two-letter codes on Windows).
    const flagHtml = (cc) => (cc && /^[a-z]{2}$/.test(cc) && cc !== 'xx')
      ? `<span class="fi fi-${cc}" style="border-radius:2px"></span>`
      : `<i class="bi bi-globe2 text-muted"></i>`;
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
              <tr>
                <td class="text-nowrap small text-muted" style="width:80px">${esc(relTime(v.timestamp, v.time_pretty))}</td>
                <td style="width:32px" class="text-center fs-5" title="${esc(v.country || '')}">${flagHtml(v.country_code)}</td>
                <td class="small">
                  <span class="fw-semibold">${esc(v.country || t('live.unknown'))}</span>
                  ${v.city ? `<span class="text-muted"> — ${esc(v.city)}</span>` : ''}
                  <div class="text-muted text-truncate" style="max-width:320px" title="${esc(v.last_page || '')}">${esc(v.last_page || '')}</div>
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
  const _deepLinkAction = new URLSearchParams(location.search).get('action');
  if (_deepLinkAction) {
    history.replaceState(null, '', location.pathname);
    if (_deepLinkAction === 'edit-name') openEditNameModal();
    else if (_deepLinkAction === 'change-password') openChangePasswordModal();
    else if (_deepLinkAction === 'manage-passkeys') openManagePasskeysModal();
  }
  loadOverview();
  setInterval(loadOverview, 60_000);  // auto-refresh overview every 60 s
  loadLiveVisitors();
  setInterval(loadLiveVisitors, 20_000);  // faster cadence — this widget is meant to feel live
  setInterval(_fadeLiveMapMarkers, 2_000);  // smooth fade independent of the data-refresh cadence
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
