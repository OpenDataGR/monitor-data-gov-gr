"""Every detail view (organization, organization contacts, dataset, dataset analytics, and the existing
user panel) is a modal -- they used to be 440px slide-overs. The markup and the script must agree on the
component type: constructing an Offcanvas on a .modal element (or the reverse) fails quietly, and there
is no browser test, so guard it here."""
import os

import pytest

from models import User, db

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# panel element id -> the ids the script fills in
PANELS = {
    "orgDetailPanel": ("orgDetailTitle", "orgDetailIdLink", "orgDetailBody"),
    "orgContactsPanel": ("orgContactsTitle", "orgContactsSubtitle", "orgContactsBody"),
    "datasetDetailPanel": ("datasetDetailTitle", "datasetDetailIdLink", "datasetDetailBody"),
    "datasetAnalyticsPanel": ("datasetAnalyticsSubtitle", "datasetAnalyticsBody"),
}


def _index_html(app):
    u = User(email="a@example.gr", is_admin=True, is_superadmin=True)
    db.session.add(u)
    db.session.commit()
    c = app.test_client()
    with c.session_transaction() as s:
        s.update({"user_id": u.id, "is_admin": True, "is_superadmin": True, "allowed_tabs": None, "org_scope": None})
    return c.get("/").get_data(as_text=True)


@pytest.mark.parametrize("panel", sorted(PANELS))
def test_markup_is_a_modal_with_the_ids_the_script_fills(app, panel):
    html = _index_html(app)
    assert f'class="modal fade" tabindex="-1" id="{panel}"' in html
    assert f'class="offcanvas offcanvas-end" tabindex="-1" id="{panel}"' not in html
    for el_id in PANELS[panel]:
        assert f'id="{el_id}"' in html
    # a wide, scrollable dialog -- the point of the change
    dialog = html.split(f'id="{panel}"')[1].split("</div>")[0]
    assert "modal-dialog-scrollable" in dialog and ("modal-xl" in dialog or "modal-lg" in dialog)


def test_script_opens_each_as_a_modal():
    js = open(os.path.join(ROOT, "static", "app.js"), encoding="utf-8").read()
    for panel in PANELS:
        assert f"new bootstrap.Modal(document.getElementById('{panel}'))" in js
    assert "bootstrap.Offcanvas" not in js  # no detail view is a slide-over any more


def test_no_slide_over_is_left_in_the_dashboard(app):
    assert 'class="offcanvas' not in _index_html(app)
