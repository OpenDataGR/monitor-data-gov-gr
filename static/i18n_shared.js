// Translation keys used by BOTH the main dashboard (app.js) and the
// standalone admin panel (admin_users.html's inline script) -- mainly the
// shared header partial (_header_controls.html) and the tab-access
// checklist in the admin panel, which reuses the dashboard's own tab
// names. Each page's own t() falls back to this dict after its own
// TRANSLATIONS, so wording only needs to change in one place.
const I18N_SHARED = {
  en: {
    'nav.manual': 'Manual',
    'nav.api': 'API',
    'nav.menu': 'Menu',
    'nav.sign_out': 'Sign out',
    'nav.edit_name': 'Edit name',
    'nav.change_password': 'Change Password',
    'nav.manage_passkeys': 'Manage Passkeys',
    'nav.toggle_theme': 'Toggle dark mode',
    'common.back_to_top': 'Back to top',
    'tab.communications': 'Communications',
    'tab.contacts': 'Contacts',
    'tab.organizations': 'Organizations',
    'tab.health': 'Health',
    'tab.traffic': 'Traffic',
    'tab.datasets': 'Dataset Totals',
    'tab.insights': 'Insights',
    'tab.geo_insights': 'Geospatial Insights',
    'tab.temporal_insights': 'Temporal Insights',
    'tab.quality': 'Quality',
  },
  el: {
    'nav.manual': 'Οδηγός',
    'nav.api': 'API',
    'nav.menu': 'Μενού',
    'nav.sign_out': 'Αποσύνδεση',
    'nav.edit_name': 'Επεξεργασία ονόματος',
    'nav.change_password': 'Αλλαγή Κωδικού',
    'nav.manage_passkeys': 'Διαχείριση Passkeys',
    'nav.toggle_theme': 'Εναλλαγή σκοτεινού θέματος',
    'common.back_to_top': 'Επιστροφή στην κορυφή',
    'tab.communications': 'Επικοινωνίες',
    'tab.contacts': 'Επαφές',
    'tab.organizations': 'Οργανισμοί',
    'tab.health': 'Κατάσταση',
    'tab.traffic': 'Επισκεψιμότητα',
    'tab.datasets': 'Σύνολα Δεδομένων',
    'tab.insights': 'Αναλύσεις',
    'tab.geo_insights': 'Γεωχωρικές Αναλύσεις',
    'tab.temporal_insights': 'Χρονικές Αναλύσεις',
    'tab.quality': 'Ποιότητα',
  },
};
