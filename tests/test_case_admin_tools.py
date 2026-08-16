"""Regression tests for the new superadmin-only case-correction tools:
editing a case's org list, reassigning a Communication to a different
case, and merging two cases together.
"""
import json

import app as appmod
from models import db, Case, Communication


def _superadmin_session():
    from flask import session
    session["user_id"] = 1
    session["is_admin"] = True
    session["is_superadmin"] = True


def mk_case(org_name="ORGA", org_title="Org A", subject="Test case", org_codes=None):
    case = Case(org_name=org_name, org_title=org_title, subject=subject, status="Open",
                org_codes=json.dumps(org_codes) if org_codes is not None else None)
    db.session.add(case)
    db.session.flush()
    return case


def mk_comm(case, status="Intermediate Contact", contact_date="2026-08-10"):
    comm = Communication(case_id=case.id, org_name=case.org_name, org_title=case.org_title,
                          subject=case.subject, status=status, contact_date=contact_date)
    db.session.add(comm)
    db.session.flush()
    return comm


class TestCaseUpdateOrgCodes:
    def test_org_codes_requires_superadmin(self, app):
        case = mk_case()
        body = json.dumps({"org_codes": [{"code": "ORGB", "label": "Org B"}]}).encode()
        with app.test_request_context(f"/api/cases/{case.id}", method="PATCH", data=body,
                                        content_type="application/json"):
            resp = appmod.case_update(case.id)
            status = resp[1] if isinstance(resp, tuple) else resp.status_code
            assert status == 403

    def test_subject_and_deadline_stay_open_to_regular_users(self, app):
        """Superadmin gate must be additive, scoped only to org fields --
        never take away what a regular user could already do."""
        case = mk_case()
        body = json.dumps({"subject": "Updated subject", "deadline": "2026-09-01"}).encode()
        with app.test_request_context(f"/api/cases/{case.id}", method="PATCH", data=body,
                                        content_type="application/json"):
            resp = appmod.case_update(case.id)
            assert (resp[1] if isinstance(resp, tuple) else resp.status_code) not in (403,)
        db.session.refresh(case)
        assert case.subject == "Updated subject"
        assert case.deadline == "2026-09-01"

    def test_org_codes_replaces_list_and_syncs_legacy_columns(self, app):
        case = mk_case(org_name="ORGA", org_title="Org A")
        body = json.dumps({"org_codes": [
            {"code": "ORGB", "label": "Org B"},
            {"code": "ORGC", "label": "Org C"},
        ]}).encode()
        with app.test_request_context(f"/api/cases/{case.id}", method="PATCH", data=body,
                                        content_type="application/json"):
            _superadmin_session()
            resp = appmod.case_update(case.id)
            data = resp.get_json()
        assert data["org_codes"] == [{"code": "ORGB", "label": "Org B"}, {"code": "ORGC", "label": "Org C"}]
        assert data["org_name"] == "ORGB"
        db.session.refresh(case)
        assert case.org_name == "ORGB"
        assert case.org_title == "Org B"

    def test_org_codes_rejects_empty_list(self, app):
        case = mk_case()
        body = json.dumps({"org_codes": []}).encode()
        with app.test_request_context(f"/api/cases/{case.id}", method="PATCH", data=body,
                                        content_type="application/json"):
            _superadmin_session()
            resp = appmod.case_update(case.id)
            status = resp[1] if isinstance(resp, tuple) else resp.status_code
        assert status == 400


class TestCommunicationReassignCase:
    def test_requires_superadmin(self, app):
        case = mk_case()
        comm = mk_comm(case)
        body = json.dumps({"case_id": case.id}).encode()
        with app.test_request_context(f"/api/communications/{comm.id}/reassign-case", method="POST",
                                        data=body, content_type="application/json"):
            resp = appmod.communication_reassign_case(comm.id)
            status = resp[1] if isinstance(resp, tuple) else resp.status_code
            assert status == 403

    def test_rejects_reassigning_initial_contact(self, app):
        case = mk_case()
        comm = mk_comm(case, status="Initial Contact")
        other = mk_case(org_name="ORGB", subject="Other case")
        body = json.dumps({"case_id": other.id}).encode()
        with app.test_request_context(f"/api/communications/{comm.id}/reassign-case", method="POST",
                                        data=body, content_type="application/json"):
            _superadmin_session()
            resp = appmod.communication_reassign_case(comm.id)
            status = resp[1] if isinstance(resp, tuple) else resp.status_code
        assert status == 400

    def test_moves_comm_and_deletes_now_empty_old_case(self, app):
        old_case = mk_case(subject="Old case")
        comm = mk_comm(old_case, status="Intermediate Contact")
        new_case = mk_case(org_name="ORGB", subject="New case")
        body = json.dumps({"case_id": new_case.id}).encode()
        with app.test_request_context(f"/api/communications/{comm.id}/reassign-case", method="POST",
                                        data=body, content_type="application/json"):
            _superadmin_session()
            resp = appmod.communication_reassign_case(comm.id)
            data = resp.get_json()
        assert data["case_id"] == new_case.id
        assert Case.query.get(old_case.id) is None

    def test_keeps_old_case_if_other_comms_remain(self, app):
        old_case = mk_case(subject="Old case")
        initial = mk_comm(old_case, status="Initial Contact")
        followup = mk_comm(old_case, status="Intermediate Contact")
        new_case = mk_case(org_name="ORGB", subject="New case")
        body = json.dumps({"case_id": new_case.id}).encode()
        with app.test_request_context(f"/api/communications/{followup.id}/reassign-case", method="POST",
                                        data=body, content_type="application/json"):
            _superadmin_session()
            appmod.communication_reassign_case(followup.id)
        assert Case.query.get(old_case.id) is not None


class TestCaseMerge:
    def test_requires_superadmin(self, app):
        source = mk_case(subject="Source")
        target = mk_case(org_name="ORGB", subject="Target")
        body = json.dumps({"into_case_id": target.id}).encode()
        with app.test_request_context(f"/api/cases/{source.id}/merge", method="POST",
                                        data=body, content_type="application/json"):
            resp = appmod.case_merge(source.id)
            status = resp[1] if isinstance(resp, tuple) else resp.status_code
            assert status == 403

    def test_merges_comms_demotes_initial_contact_and_combines_orgs(self, app):
        source = mk_case(org_name="ORGA", org_title="Org A", subject="Source",
                          org_codes=[{"code": "ORGA", "label": "Org A"}])
        source_initial = mk_comm(source, status="Initial Contact")
        source_followup = mk_comm(source, status="Intermediate Contact")
        target = mk_case(org_name="ORGB", org_title="Org B", subject="Target",
                          org_codes=[{"code": "ORGB", "label": "Org B"}])
        target_initial = mk_comm(target, status="Initial Contact")

        body = json.dumps({"into_case_id": target.id}).encode()
        with app.test_request_context(f"/api/cases/{source.id}/merge", method="POST",
                                        data=body, content_type="application/json"):
            _superadmin_session()
            resp = appmod.case_merge(source.id)
            data = resp.get_json()

        assert Case.query.get(source.id) is None
        db.session.refresh(source_initial)
        db.session.refresh(source_followup)
        db.session.refresh(target_initial)
        assert source_initial.case_id == target.id
        assert source_initial.status == "Intermediate Contact"
        assert source_followup.case_id == target.id
        assert target_initial.status == "Initial Contact"
        assert {o["code"] for o in data["org_codes"]} == {"ORGA", "ORGB"}

    def test_rejects_merging_into_itself(self, app):
        case = mk_case()
        body = json.dumps({"into_case_id": case.id}).encode()
        with app.test_request_context(f"/api/cases/{case.id}/merge", method="POST",
                                        data=body, content_type="application/json"):
            _superadmin_session()
            resp = appmod.case_merge(case.id)
            status = resp[1] if isinstance(resp, tuple) else resp.status_code
        assert status == 400
