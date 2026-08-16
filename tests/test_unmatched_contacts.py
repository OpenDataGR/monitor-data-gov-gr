"""Regression tests for the Contacts-to-Review backend: the flat
cross-email list route, and both resolution paths (approve-as-new via
/create, merge-into-existing via /resolve) correctly triggering an
automatic rematch of the parent email -- the piece that makes contact
resolution the sole human step in ingestion (everything downstream of a
resolved contact, i.e. case matching/creation/logging, is now automatic).
"""
import json

from flask import session

import app as appmod
from models import db, InboundEmail, UnmatchedEmailContact, OrgContact, Case, Communication


def _superadmin_session():
    session["user_id"] = 1
    session["is_admin"] = True
    session["is_superadmin"] = True


def mk_pending_no_contact_match_email(sender_email="new@unknownorg.gr", sender_name="New Sender", subject="Data request"):
    inbound = InboundEmail(
        from_email=sender_email, from_name=sender_name, to_email="logger@parser.data.gov.gr",
        subject=subject, body_text="Hello, please send me the data.",
        status="pending_review", reason="no_contact_match",
    )
    db.session.add(inbound)
    db.session.flush()
    u_row = UnmatchedEmailContact(inbound_email_id=inbound.id, name=sender_name, email=sender_email,
                                   org_code="UNKNOWNORG", org_label="Unknown Org", status="pending")
    db.session.add(u_row)
    db.session.commit()
    return inbound, u_row


class TestUnmatchedContactsList:
    def test_requires_superadmin(self, app):
        with app.test_request_context("/api/unmatched-contacts"):
            resp = appmod.unmatched_contacts_list()
            status = resp[1] if isinstance(resp, tuple) else resp.status_code
            assert status == 403

    def test_lists_pending_with_parent_email_context(self, app):
        inbound, u_row = mk_pending_no_contact_match_email()
        with app.test_request_context("/api/unmatched-contacts"):
            _superadmin_session()
            resp = appmod.unmatched_contacts_list()
            data = resp.get_json()
        assert len(data) == 1
        assert data[0]["id"] == u_row.id
        assert data[0]["status"] == "pending"
        assert data[0]["inbound_email"]["id"] == inbound.id
        assert data[0]["inbound_email"]["subject"] == "Data request"

    def test_status_filter(self, app):
        inbound, u_row = mk_pending_no_contact_match_email()
        u_row.status = "dropped"
        db.session.commit()
        with app.test_request_context("/api/unmatched-contacts?status=pending"):
            _superadmin_session()
            data = appmod.unmatched_contacts_list().get_json()
        assert data == []
        with app.test_request_context("/api/unmatched-contacts?status=dropped"):
            _superadmin_session()
            data = appmod.unmatched_contacts_list().get_json()
        assert len(data) == 1


class TestApproveAsNew:
    def test_create_resolves_case_automatically(self, app):
        """Approving a no_contact_match participant as a brand-new contact
        must automatically attach/open a case for them -- no separate human
        step for the case side."""
        inbound, u_row = mk_pending_no_contact_match_email()
        body = json.dumps({
            "org_code": "UNKNOWNORG", "org_label": "Unknown Org",
            "first_name": "New", "last_name": "Sender", "email": "new@unknownorg.gr",
        }).encode()
        with app.test_request_context(f"/api/unmatched-contacts/{u_row.id}/create", method="POST", data=body,
                                        content_type="application/json"):
            _superadmin_session()
            resp = appmod.unmatched_contact_create(u_row.id)
            assert (resp[1] if isinstance(resp, tuple) else resp.status_code) in (200, 201)

        db.session.refresh(u_row)
        db.session.refresh(inbound)
        assert u_row.status == "created"
        assert u_row.resolved_contact_id is not None
        assert inbound.status == "attached"
        comms = Communication.query.all()
        assert len(comms) == 1
        assert comms[0].status == "Initial Contact"


class TestMergeIntoExisting:
    def test_resolve_sets_merged_status_and_resolves_case(self, app):
        existing = OrgContact(org_code="UNKNOWNORG", org_label="Unknown Org",
                               first_name="Existing", last_name="Person", email="existing@unknownorg.gr")
        db.session.add(existing)
        db.session.flush()
        inbound, u_row = mk_pending_no_contact_match_email()

        body = json.dumps({"contact_id": existing.id}).encode()
        with app.test_request_context(f"/api/unmatched-contacts/{u_row.id}/resolve", method="POST", data=body,
                                        content_type="application/json"):
            _superadmin_session()
            resp = appmod.unmatched_contact_resolve(u_row.id)
            assert (resp[1] if isinstance(resp, tuple) else resp.status_code) not in (400, 403, 404)

        db.session.refresh(u_row)
        db.session.refresh(inbound)
        assert u_row.status == "merged"
        assert u_row.resolved_contact_id == existing.id
        assert inbound.status == "attached"

    def test_resolving_a_second_person_on_an_already_attached_email_credits_not_duplicates(self, app):
        """Two people from the same org on one email: one already
        registered (produces a normal Communication right away), one
        flagged unmatched. Resolving the unmatched one later must credit
        them onto that SAME existing Communication, not create a second,
        duplicate one for the same org."""
        known = OrgContact(org_code="SHAREDORG", org_label="Shared Org", email="known@sharedorg.gr")
        db.session.add(known)
        db.session.flush()

        match = appmod._match_inbound_email(
            from_field="Known Person <known@sharedorg.gr>", to_field="logger@parser.data.gov.gr",
            cc_field="Unknown Person <unknown@sharedorg.gr>", subject="Shared org matter", body_text="Body.",
        )
        inbound = InboundEmail(from_email="known@sharedorg.gr", to_email="logger@parser.data.gov.gr",
                                subject="Shared org matter", body_text="Body.")
        db.session.add(inbound)
        db.session.flush()
        appmod._apply_inbound_match(inbound, match)
        db.session.commit()

        assert Communication.query.count() == 1
        u_row = UnmatchedEmailContact.query.filter_by(email="unknown@sharedorg.gr").one()

        existing = OrgContact(org_code="SHAREDORG", org_label="Shared Org", email="realaddress@elsewhere.gr",
                               first_name="Unknown", last_name="Person")
        db.session.add(existing)
        db.session.flush()
        body = json.dumps({"contact_id": existing.id}).encode()
        with app.test_request_context(f"/api/unmatched-contacts/{u_row.id}/resolve", method="POST", data=body,
                                        content_type="application/json"):
            _superadmin_session()
            appmod.unmatched_contact_resolve(u_row.id)

        assert Communication.query.count() == 1, "must credit the existing entry, not create a duplicate"
        comm = Communication.query.first()
        credited_ids = {cc.org_contact_id for cc in comm.contact_links}
        assert existing.id in credited_ids
        assert known.id in credited_ids

    def test_deleting_resolved_contact_reverts_row_to_pending(self, app):
        """Already covered for /remove and /id/<id>/delete elsewhere, but
        confirm it works regardless of whether the row's status is
        "created" or the newer "merged"."""
        existing = OrgContact(org_code="UNKNOWNORG", org_label="Unknown Org", email="existing2@unknownorg.gr")
        db.session.add(existing)
        db.session.flush()
        inbound, u_row = mk_pending_no_contact_match_email(sender_email="x@unknownorg.gr")
        u_row.status = "merged"
        u_row.resolved_contact_id = existing.id
        db.session.commit()

        body = json.dumps({"id": existing.id}).encode()
        with app.test_request_context("/api/contacts/remove", method="POST", data=body, content_type="application/json"):
            _superadmin_session()
            appmod.contacts_remove()

        db.session.refresh(u_row)
        assert u_row.status == "pending"
        assert u_row.resolved_contact_id is None
