"""Regression tests for the mail-ingestion matching engine
(_resolve_case_for_contacts / _match_inbound_email / _apply_inbound_match
in app.py) -- the highest-risk, most-recently-rewritten logic in the
ingestion pipeline: it decides which case (if any) an inbound email
attaches to, and now resolves that once per email/thread across every org
involved rather than once per org.
"""
import json
from datetime import datetime

import app as appmod
from models import db, Case, Communication, CommunicationContact, OrgContact, InboundEmail


def mk_contact(email, org_code, first="A", last="B"):
    c = OrgContact(org_code=org_code, org_label=org_code + " Label", first_name=first, last_name=last, email=email)
    db.session.add(c)
    db.session.flush()
    return c


def mk_case(org_code, org_title, subject, status="Open", org_codes=None):
    c = Case(org_name=org_code, org_title=org_title, subject=subject, status=status,
             org_codes=json.dumps(org_codes) if org_codes else None)
    db.session.add(c)
    db.session.flush()
    return c


def mk_comm(case, org_code, org_title, subject, status, contact_date, contact=None):
    comm = Communication(case_id=case.id, org_name=org_code, org_title=org_title,
                          subject=subject, status=status, contact_date=contact_date)
    db.session.add(comm)
    db.session.flush()
    if contact:
        db.session.add(CommunicationContact(communication_id=comm.id, org_contact_id=contact.id))
    return comm


class TestResolveCaseForContacts:
    def test_substring_containment_subject_match(self, app):
        contact = mk_contact("a@raaey.gr", "RAAEY")
        case = mk_case("RAAEY", "RAAEY", "Aithma Dedomenon")
        result = appmod._resolve_case_for_contacts([contact], "Aithma Dedomenon - epeigon")
        assert result["case"].id == case.id
        assert result["created"] is False

    def test_no_subject_match_always_opens_new_case_even_with_history(self, app):
        """The sender-history tie-breaker was removed -- history alone must
        never attach to an existing case when nothing matches by subject."""
        contact = mk_contact("b@minhealth.gr", "MINHEALTH")
        old_case = mk_case("MINHEALTH", "Ministry of Health", "Some older unrelated matter")
        mk_comm(old_case, "MINHEALTH", "Ministry of Health", "Some older unrelated matter",
                "Initial Contact", "2026-01-01", contact=contact)

        result = appmod._resolve_case_for_contacts([contact], "Completely different new topic")
        assert result["created"] is True
        assert result["case"].id != old_case.id

    def test_multiple_open_cases_prefers_history_match(self, app):
        contact = mk_contact("c@minagric.gr", "MINAGRIC")
        with_history = mk_case("MINAGRIC", "Ministry of Agriculture", "HVD Data Request")
        without_history = mk_case("MINAGRIC", "Ministry of Agriculture", "HVD Data Request")
        mk_comm(with_history, "MINAGRIC", "Ministry of Agriculture", "HVD Data Request",
                "Initial Contact", "2026-01-01", contact=contact)

        result = appmod._resolve_case_for_contacts([contact], "HVD Data Request")
        assert result["case"].id == with_history.id
        assert without_history.id != result["case"].id

    def test_multiple_open_cases_falls_back_to_most_recently_active(self, app):
        contact = mk_contact("d@mineduc.gr", "MINEDUC")
        other_contact = mk_contact("other@mineduc.gr", "MINEDUC")
        older = mk_case("MINEDUC", "Ministry of Education", "Dataset licensing question")
        newer = mk_case("MINEDUC", "Ministry of Education", "Dataset licensing question")
        # neither has history with `contact` -- both get unrelated activity, `newer` more recent
        mk_comm(older, "MINEDUC", "Ministry of Education", "Dataset licensing question", "Initial Contact", "2026-01-01")
        mk_comm(newer, "MINEDUC", "Ministry of Education", "Dataset licensing question", "Initial Contact", "2026-06-01")

        result = appmod._resolve_case_for_contacts([contact], "Dataset licensing question")
        assert result["case"].id == newer.id

    def test_new_case_org_codes_covers_every_contact(self, app):
        c1 = mk_contact("e1@orga.gr", "ORGA")
        c2 = mk_contact("e2@orgb.gr", "ORGB")
        result = appmod._resolve_case_for_contacts([c1, c2], "Brand new joint matter")
        assert result["created"] is True
        codes = {o["code"] for o in appmod._case_org_list(result["case"])}
        assert codes == {"ORGA", "ORGB"}


class TestMatchInboundEmail:
    def test_single_email_multiple_orgs_share_one_case(self, app):
        mk_contact("f1@orgx.gr", "ORGX")
        mk_contact("f2@orgy.gr", "ORGY")
        match = appmod._match_inbound_email(
            from_field="Sender One <f1@orgx.gr>",
            to_field="logger@parser.data.gov.gr",
            cc_field="Sender Two <f2@orgy.gr>",
            subject="Joint request",
            body_text="Hello, this is the body.",
        )
        case_ids = {g["case"].id for g in match["match_groups"]}
        assert len(case_ids) == 1
        assert len(match["match_groups"]) == 2
        assert sum(g["created"] for g in match["match_groups"]) == 1

        case = db.session.get(Case, next(iter(case_ids)))
        orgs = {o["code"] for o in appmod._case_org_list(case)}
        assert orgs == {"ORGX", "ORGY"}

    def test_each_communication_keeps_its_own_org_not_the_shared_case_primary_org(self, app):
        """Regression: _create_email_communication used to stamp every
        Communication with the CASE's primary org (case.org_name), which
        was harmless back when a case only ever had one org -- now that a
        case can span several, that mislabeled every Communication crediting
        a non-primary org with the wrong one."""
        mk_contact("i1@orgx.gr", "ORGX")
        mk_contact("i2@orgy.gr", "ORGY")
        inbound = InboundEmail(from_email="i1@orgx.gr", to_email="logger@parser.data.gov.gr",
                                subject="Joint request 2", body_text="Body.")
        db.session.add(inbound)
        db.session.flush()
        match = appmod._match_inbound_email(
            from_field="Sender One <i1@orgx.gr>", to_field="logger@parser.data.gov.gr",
            cc_field="Sender Two <i2@orgy.gr>", subject="Joint request 2", body_text="Body.",
        )
        created = appmod._apply_inbound_match(inbound, match)
        db.session.commit()
        org_names = {c.org_name for c in created}
        assert org_names == {"ORGX", "ORGY"}, org_names

    def test_multi_message_thread_across_orgs_shares_one_case(self, app, monkeypatch):
        mk_contact("g1@orgp.gr", "ORGP")
        mk_contact("g2@orgq.gr", "ORGQ")
        monkeypatch.setattr(appmod, "_extract_thread_messages", lambda body_text: [
            {"from_name": "G One", "from_email": "g1@orgp.gr", "subject": "Backlog thread",
             "sent_date": "2026-01-10", "body": "First historical message with real content here.",
             "addrs": {"g1@orgp.gr"}},
            {"from_name": "G Two", "from_email": "g2@orgq.gr", "subject": "RE: Backlog thread",
             "sent_date": "2026-01-12", "body": "Second historical message with real content here too.",
             "addrs": {"g2@orgq.gr"}},
        ])

        match = appmod._match_inbound_email(
            from_field="Forwarder <staff@internal.gr>",
            to_field="logger@parser.data.gov.gr",
            cc_field="",
            subject="Fwd: Backlog thread",
            body_text="whatever, thread extraction is monkeypatched",
        )
        case_ids = {g["case"].id for g in match["match_groups"]}
        assert len(case_ids) == 1
        assert len(match["match_groups"]) == 2
        assert sum(g["created"] for g in match["match_groups"]) == 1

        case = db.session.get(Case, next(iter(case_ids)))
        orgs = {o["code"] for o in appmod._case_org_list(case)}
        assert orgs == {"ORGP", "ORGQ"}
        subjects = {g["subject"] for g in match["match_groups"]}
        assert subjects == {"Backlog thread", "RE: Backlog thread"}

    def test_no_contact_match_reason(self, app):
        match = appmod._match_inbound_email(
            from_field="Nobody <nobody@unknown.gr>",
            to_field="logger@parser.data.gov.gr",
            cc_field="",
            subject="Random subject",
            body_text="No registered contact anywhere in this.",
        )
        assert match["reason"] == "no_contact_match"
        assert match["match_groups"] == []


class TestApplyInboundMatch:
    def test_multi_org_email_end_to_end(self, app):
        mk_contact("h1@orgm.gr", "ORGM")
        mk_contact("h2@orgn.gr", "ORGN")
        inbound = InboundEmail(from_email="h1@orgm.gr", from_name="H One", to_email="logger@parser.data.gov.gr",
                                subject="Multi org webhook test", body_text="Body text here.")
        db.session.add(inbound)
        db.session.flush()

        match = appmod._match_inbound_email(
            from_field="H One <h1@orgm.gr>", to_field="logger@parser.data.gov.gr",
            cc_field="H Two <h2@orgn.gr>", subject="Multi org webhook test", body_text="Body text here.",
        )
        created = appmod._apply_inbound_match(inbound, match)
        db.session.commit()

        assert inbound.status == "attached"
        assert inbound.reason is None
        assert len(created) == 2
        assert len({c.case_id for c in created}) == 1
        assert sorted(c.status for c in created) == ["Initial Contact", "Intermediate Contact"]

    def test_communication_gets_email_received_at_from_inbound(self, app):
        """email_received_at (the row's own display time under its date, see
        _commsEntryTimeHtml in app.js) must come from the actual email's
        InboundEmail.received_at, not just default to created_at (when the
        row happened to be inserted -- close, but not the same moment)."""
        mk_contact("k1@orgp.gr", "ORGP")
        inbound = InboundEmail(from_email="k1@orgp.gr", from_name="K One", to_email="logger@parser.data.gov.gr",
                                subject="Timestamp test", body_text="Body text here.")
        db.session.add(inbound)
        db.session.flush()

        match = appmod._match_inbound_email(
            from_field="K One <k1@orgp.gr>", to_field="logger@parser.data.gov.gr",
            cc_field="", subject="Timestamp test", body_text="Body text here.",
        )
        created = appmod._apply_inbound_match(inbound, match)
        db.session.commit()

        assert len(created) == 1
        assert created[0].email_received_at == inbound.received_at

    def test_split_thread_messages_each_get_their_own_email_received_at(self, app, monkeypatch):
        """A backlog thread split into several per-message Communications
        (_extract_thread_messages) must NOT all share the one webhook-
        arrival timestamp -- each message's own parsed "Sent:" time (sent_at)
        becomes that specific Communication's email_received_at."""
        mk_contact("m1@orgr.gr", "ORGR")
        mk_contact("m2@orgr.gr", "ORGR")
        first_sent_at = datetime(2026, 1, 10, 9, 30)
        second_sent_at = datetime(2026, 1, 12, 14, 45)
        monkeypatch.setattr(appmod, "_extract_thread_messages", lambda body_text: [
            {"from_name": "M One", "from_email": "m1@orgr.gr", "subject": "Backlog thread",
             "sent_date": first_sent_at.date().isoformat(), "sent_at": first_sent_at,
             "body": "First historical message with real content here.", "addrs": {"m1@orgr.gr"}},
            {"from_name": "M Two", "from_email": "m2@orgr.gr", "subject": "RE: Backlog thread",
             "sent_date": second_sent_at.date().isoformat(), "sent_at": second_sent_at,
             "body": "Second historical message with real content here too.", "addrs": {"m2@orgr.gr"}},
        ])
        inbound = InboundEmail(from_email="staff@internal.gr", to_email="logger@parser.data.gov.gr",
                                subject="Fwd: Backlog thread", body_text="whatever, monkeypatched")
        db.session.add(inbound)
        db.session.flush()

        match = appmod._match_inbound_email(
            from_field="Forwarder <staff@internal.gr>", to_field="logger@parser.data.gov.gr",
            cc_field="", subject="Fwd: Backlog thread", body_text="whatever, monkeypatched",
        )
        created = appmod._apply_inbound_match(inbound, match)
        db.session.commit()

        assert len(created) == 2
        by_subject = {c.subject: c.email_received_at for c in created}
        assert by_subject["Backlog thread"] == first_sent_at
        assert by_subject["RE: Backlog thread"] == second_sent_at
        assert first_sent_at != second_sent_at != inbound.received_at

    def test_initial_contact_is_the_chronologically_oldest_message(self, app, monkeypatch):
        """_extract_thread_messages returns messages newest-quoted-first
        (an email client pastes the most recent message at the TOP of the
        body) -- Initial Contact must go to whoever actually reached out
        FIRST, not to whichever message happens to be processed first."""
        mk_contact("m1@orgr.gr", "ORGR")
        older = datetime(2026, 1, 5, 9, 0)
        newer = datetime(2026, 1, 10, 9, 0)
        # Deliberately newest-first, matching real _extract_thread_messages
        # ordering -- this is the exact shape that reproduced the bug.
        monkeypatch.setattr(appmod, "_extract_thread_messages", lambda body_text: [
            {"from_name": "M One", "from_email": "m1@orgr.gr", "subject": "RE: Backlog thread",
             "sent_date": newer.date().isoformat(), "sent_at": newer,
             "body": "Newer reply, quoted at the top of the body.", "addrs": {"m1@orgr.gr"}},
            {"from_name": "M One", "from_email": "m1@orgr.gr", "subject": "Backlog thread",
             "sent_date": older.date().isoformat(), "sent_at": older,
             "body": "Original older message, quoted further down.", "addrs": {"m1@orgr.gr"}},
        ])
        inbound = InboundEmail(from_email="staff@internal.gr", to_email="logger@parser.data.gov.gr",
                                subject="Fwd: Backlog thread", body_text="whatever, monkeypatched")
        db.session.add(inbound)
        db.session.flush()

        match = appmod._match_inbound_email(
            from_field="Forwarder <staff@internal.gr>", to_field="logger@parser.data.gov.gr",
            cc_field="", subject="Fwd: Backlog thread", body_text="whatever, monkeypatched",
        )
        created = appmod._apply_inbound_match(inbound, match)
        db.session.commit()

        assert len(created) == 2
        by_subject = {c.subject: c.status for c in created}
        assert by_subject["Backlog thread"] == "Initial Contact"          # the OLDER message
        assert by_subject["RE: Backlog thread"] == "Intermediate Contact"  # the NEWER one


class TestAutoCapturedNotesHasNoBoilerplatePrefix:
    """_auto_captured_notes used to prepend "Auto-captured from inbound
    email." to every row's notes, redundant with the row's own Auto badge
    in the UI -- removed, but the two dedup functions below used to split
    on the blank line after that prefix to compare just the real body, so
    they need covering now that they compare notes as-is."""

    def test_no_prefix(self):
        assert appmod._auto_captured_notes("Real email body here.") == "Real email body here."
        assert appmod._auto_captured_notes("") == ""

    def test_thread_already_logged_still_detects_duplicate(self, app):
        case = mk_case("ORGS", "Org S", "Dup test")
        existing = mk_comm(case, "ORGS", "Org S", "Dup test", "Initial Contact", "2026-01-01")
        existing.source = "email"
        existing.notes = appmod._auto_captured_notes("A" * 200)
        db.session.commit()
        assert appmod._thread_already_logged([existing], "Dup test", "A" * 200 + " plus more forwarded noise on top")

    def test_thread_message_already_logged_still_detects_duplicate(self, app):
        case = mk_case("ORGT", "Org T", "Dup msg test")
        existing = mk_comm(case, "ORGT", "Org T", "Dup msg test", "Initial Contact", "2026-01-01")
        existing.source = "email"
        existing.notes = appmod._auto_captured_notes("Short reply body.")
        db.session.commit()
        assert appmod._thread_message_already_logged([existing], "Dup msg test", "Short reply body.")
