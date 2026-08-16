"""Regression test: a case's own expanded thread (the Cases view's
_fetchCommsCaseRows fast path in app.js, ?case_id=<id>&dir=asc) must
list entries oldest-first (Initial Contact first, most recent last) --
like reading a real conversation top-to-bottom. The flat/grouped comms
views elsewhere default to newest-first, which is a different, correct
default for that context; this endpoint's own default (no `dir` given)
stays newest-first too -- only the Cases view's own fetch opts into `asc`.
"""
import app as appmod
from models import db, Case, Communication


def test_case_id_pin_respects_dir_asc(app):
    case = Case(org_name="ORGZ", org_title="Org Z", subject="Thread order test", status="Open")
    db.session.add(case)
    db.session.flush()
    oldest = Communication(case_id=case.id, org_name="ORGZ", org_title="Org Z", subject="Thread order test",
                            status="Initial Contact", contact_date="2026-08-04")
    middle = Communication(case_id=case.id, org_name="ORGZ", org_title="Org Z", subject="Thread order test",
                            status="Intermediate Contact", contact_date="2026-08-05")
    newest = Communication(case_id=case.id, org_name="ORGZ", org_title="Org Z", subject="Thread order test",
                            status="Intermediate Contact", contact_date="2026-08-06")
    db.session.add_all([newest, oldest, middle])  # inserted out of order on purpose
    db.session.commit()

    with app.test_request_context(f"/api/communications?case_id={case.id}&dir=asc"):
        data = appmod.communications_list().get_json()
    ids_in_order = [c["id"] for c in data["rows"]]
    assert ids_in_order == [oldest.id, middle.id, newest.id]
    assert data["rows"][0]["status"] == "Initial Contact"

    # Default (no dir given) stays newest-first, unchanged for every other
    # caller of this same fast path.
    with app.test_request_context(f"/api/communications?case_id={case.id}"):
        data_default = appmod.communications_list().get_json()
    assert [c["id"] for c in data_default["rows"]] == [newest.id, middle.id, oldest.id]
