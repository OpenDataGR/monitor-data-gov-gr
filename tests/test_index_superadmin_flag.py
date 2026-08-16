"""Regression test for window.__IS_SUPERADMIN__ -- the new Section 6 case
tools (edit orgs / merge / reassign) hide themselves in the main dashboard's
own JS based on this flag, so the index route must actually pass the
session's is_superadmin value through to the template, not just is_admin.
"""
import app as appmod


def test_index_passes_is_superadmin_flag_to_template(app):
    with app.test_request_context("/"):
        from flask import session
        session["is_superadmin"] = True
        html = appmod.index()
    assert "window.__IS_SUPERADMIN__ = true;" in html

    with app.test_request_context("/"):
        html = appmod.index()
    assert "window.__IS_SUPERADMIN__ = false;" in html
