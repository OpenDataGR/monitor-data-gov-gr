"""Regression test for communications_update (app.py) -- editing one
Communication's org used to overwrite the case's own org AND every sibling
Communication on that case to match, which is exactly backwards once a case
can span more than one org across its own entries (the multi-org case
redesign). The frontend always sends org_name/org_title on every save (not
just when the org actually changed), so this fired on every single edit of
any entry in a multi-org case, silently collapsing every other entry onto
whichever one was just saved.
"""
import json

import app as appmod
from models import db, Case, Communication


def mk_case(org_name="ORGA", org_title="Org A", subject="Test case"):
    case = Case(org_name=org_name, org_title=org_title, subject=subject, status="Open")
    db.session.add(case)
    db.session.flush()
    return case


def mk_comm(case, org_name, org_title, status, subject="Test case"):
    comm = Communication(case_id=case.id, org_name=org_name, org_title=org_title,
                          subject=subject, status=status, contact_date="2026-08-10")
    db.session.add(comm)
    db.session.flush()
    return comm


def _patch(comm_id, body):
    payload = json.dumps(body).encode()
    with appmod.app.test_request_context(f"/api/communications/{comm_id}", method="PATCH",
                                          data=payload, content_type="application/json"):
        return appmod.communications_update(comm_id)


class TestCommOrgEditDoesNotBleedToSiblings:
    def test_editing_a_non_initial_entry_does_not_touch_siblings_or_case(self, app):
        case = mk_case(org_name="ORGA", org_title="Org A")
        initial = mk_comm(case, "ORGA", "Org A", "Initial Contact")
        other = mk_comm(case, "ORGB", "Org B", "Intermediate Contact")

        resp = _patch(other.id, {"org_name": "ORGC", "org_title": "Org C"})
        status = resp[1] if isinstance(resp, tuple) else resp.status_code
        assert status not in (400, 403, 404)

        db.session.refresh(initial)
        db.session.refresh(case)
        assert other.org_name == "ORGC"          # the edited entry itself changed
        assert initial.org_name == "ORGA"        # sibling untouched
        assert case.org_name == "ORGA"           # case's own org untouched

    def test_editing_the_initial_contact_entry_updates_the_case_but_not_siblings(self, app):
        case = mk_case(org_name="ORGA", org_title="Org A")
        initial = mk_comm(case, "ORGA", "Org A", "Initial Contact")
        other = mk_comm(case, "ORGB", "Org B", "Intermediate Contact")

        resp = _patch(initial.id, {"org_name": "ORGD", "org_title": "Org D"})
        status = resp[1] if isinstance(resp, tuple) else resp.status_code
        assert status not in (400, 403, 404)

        db.session.refresh(other)
        db.session.refresh(case)
        assert case.org_name == "ORGD"    # case's back-compat org tracks its Initial Contact entry
        assert other.org_name == "ORGB"   # the OTHER org on this multi-org case survives untouched
