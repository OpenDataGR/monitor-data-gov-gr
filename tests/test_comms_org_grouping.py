"""Regression test for /api/communications?group_by=org's has_open_case
field -- drives the By-Org list's status dot in app.js
(_renderCommsOrgGroups): amber if any case touching this org is still
Open, green only once every case touching it is Closed. This needs each
communication's own linked Case, not just the group's latest entry, so
it's computed as an OR across the whole group server-side rather than
read off a single row.
"""
import app as appmod
from models import db, Case, Communication


def _make_case(org_title, subject, status):
    case = Case(org_name=org_title, org_title=org_title, subject=subject, status=status)
    db.session.add(case)
    db.session.flush()
    return case


def test_has_open_case_true_when_any_case_open():
    open_case = _make_case("Org A", "Open thread", "Open")
    closed_case = _make_case("Org A", "Closed thread", "Closed")
    db.session.add_all([
        Communication(case_id=open_case.id, org_name="Org A", org_title="Org A", subject="Open thread",
                      status="Initial Contact", contact_date="2026-08-01"),
        Communication(case_id=closed_case.id, org_name="Org A", org_title="Org A", subject="Closed thread",
                      status="Positive Response", contact_date="2026-08-02"),
    ])
    db.session.commit()

    with appmod.app.test_request_context("/api/communications?group_by=org"):
        data = appmod.communications_list().get_json()
    group = next(g for g in data["groups"] if g["org_title"] == "Org A")
    assert group["has_open_case"] is True
    assert group["count"] == 2


def test_has_open_case_false_when_every_case_closed():
    closed_case = _make_case("Org B", "Closed thread", "Closed")
    db.session.add(Communication(case_id=closed_case.id, org_name="Org B", org_title="Org B",
                                  subject="Closed thread", status="Positive Response", contact_date="2026-08-01"))
    db.session.commit()

    with appmod.app.test_request_context("/api/communications?group_by=org"):
        data = appmod.communications_list().get_json()
    group = next(g for g in data["groups"] if g["org_title"] == "Org B")
    assert group["has_open_case"] is False


def test_has_open_case_false_when_entry_has_no_case():
    db.session.add(Communication(case_id=None, org_name="Org C", org_title="Org C",
                                  subject="No case", status="Initial Contact", contact_date="2026-08-01"))
    db.session.commit()

    with appmod.app.test_request_context("/api/communications?group_by=org"):
        data = appmod.communications_list().get_json()
    group = next(g for g in data["groups"] if g["org_title"] == "Org C")
    assert group["has_open_case"] is False
