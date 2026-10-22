"""The organization detail view is a wide two-column modal (it was a 440px slide-over). The markup
and the script must agree on the component type: constructing an Offcanvas on a .modal element (or
the reverse) fails quietly, so guard it here since there is no browser test."""
import os

from models import User, db

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _login(app):
    u = User(email="a@example.gr", is_admin=True, is_superadmin=True)
    db.session.add(u)
    db.session.commit()
    c = app.test_client()
    with c.session_transaction() as s:
        s.update({"user_id": u.id, "is_admin": True, "is_superadmin": True, "allowed_tabs": None, "org_scope": None})
    return c


def test_markup_is_a_modal_with_the_ids_the_script_fills(app):
    html = _login(app).get("/").get_data(as_text=True)
    assert 'class="modal fade" tabindex="-1" id="orgDetailPanel"' in html
    assert 'class="offcanvas offcanvas-end" tabindex="-1" id="orgDetailPanel"' not in html
    for el_id in ("orgDetailTitle", "orgDetailIdLink", "orgDetailBody"):
        assert f'id="{el_id}"' in html
    assert "modal-xl" in html.split('id="orgDetailPanel"')[1].split("</div>")[0]


def test_script_opens_it_as_a_modal_not_an_offcanvas():
    js = open(os.path.join(ROOT, "static", "app.js"), encoding="utf-8").read()
    assert "new bootstrap.Modal(document.getElementById('orgDetailPanel'))" in js
    assert "new bootstrap.Offcanvas(document.getElementById('orgDetailPanel'))" not in js
