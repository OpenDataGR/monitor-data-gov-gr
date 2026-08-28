"""Regression test for _repair_split_thread_communications (app.py) -- the
every-deploy repair that re-derives a split thread's Communication.
contact_date/email_received_at from a fresh _extract_thread_messages call.

The bug this covers: an earlier version zipped existing InboundEmailCommunication
links against a fresh, UNFILTERED _extract_thread_messages call by POSITION,
trusting equal counts to mean equal alignment. Once a thread grows new
replies after its Communications were already created, the raw block count
can coincidentally equal the (unrelated) existing link count again while no
longer being the same messages in the same order -- silently stamping a real
Communication with a date/time from a completely different, unrelated
message (in the reported case, an empty "Fwd:" header's own timestamp).
"""
from datetime import datetime

import app as appmod
from models import db, Case, Communication, InboundEmail, InboundEmailCommunication

# Simulates the thread having grown an extra empty "Fwd:" header (no body)
# on top since these two Communications were first created -- the exact
# shape that broke the old position-based zip.
_GROWN_BODY = """\
________________________________
From: Kostas <k.sfikas@mindigital.gr>
Sent: Thursday, August 6, 2026 00:11
To: logger@parser.data.gov.gr <logger@parser.data.gov.gr>
Subject: Fw: Sfalma



________________________________
From: Bas <vpapath@m-t.gov.gr>
Sent: Tuesday, August 4, 2026 12:12
To: Kostas <k.sfikas@mindigital.gr>
Subject: Ap: Sfalma

Efxaristo poly gia tin amesi apantisi.

________________________________
Από: Kostas <k.sfikas@mindigital.gr>
Στάλθηκε: Τρίτη, 4 Αυγούστου 2026 12:07 μμ
Προς: Bas <vpapath@m-t.gov.gr>
Θέμα: Re: Sfalma

Kalimera sas, exoume entopisei to provlima.
"""


def _seed_grown_thread(app_ctx):
    case = Case(org_name="ORGX", org_title="Org X", subject="Sfalma", status="Open")
    db.session.add(case)
    db.session.flush()

    # Two Communications created BEFORE the thread grew the extra empty
    # block above -- deliberately stamped with a WRONG contact_date/
    # email_received_at (simulating the pre-fix fallback-to-webhook-time
    # bug), notes set to exactly the message body each one came from.
    # notes matches _extract_thread_messages' own body slice exactly (it
    # includes the trailing "____" separator line up to the next quoted
    # block's own "From:" line) -- _norm_for_repair_match's whitespace
    # collapsing tolerates reformatting, not missing/extra real content.
    comm_a = Communication(
        case_id=case.id, org_name="ORGX", org_title="Org X", subject="Ap: Sfalma",
        status="Initial Contact", contact_date="2026-01-01",
        notes="Efxaristo poly gia tin amesi apantisi.\n\n________________________________",
        email_received_at=datetime(2026, 1, 1, 0, 0),
    )
    comm_b = Communication(
        case_id=case.id, org_name="ORGX", org_title="Org X", subject="Re: Sfalma",
        status="Intermediate Contact", contact_date="2026-01-01",
        notes="Kalimera sas, exoume entopisei to provlima.",
        email_received_at=datetime(2026, 1, 1, 0, 0),
    )
    db.session.add_all([comm_a, comm_b])
    db.session.flush()

    inbound = InboundEmail(from_email="k.sfikas@mindigital.gr", to_email="logger@parser.data.gov.gr",
                            subject="Fw: Sfalma", body_text=_GROWN_BODY, status="attached")
    db.session.add(inbound)
    db.session.flush()

    db.session.add(InboundEmailCommunication(inbound_email_id=inbound.id, communication_id=comm_a.id))
    db.session.add(InboundEmailCommunication(inbound_email_id=inbound.id, communication_id=comm_b.id))
    db.session.commit()
    return comm_a, comm_b


def test_repair_matches_by_content_not_position(app):
    comm_a, comm_b = _seed_grown_thread(app)

    appmod._repair_split_thread_communications()
    db.session.refresh(comm_a)
    db.session.refresh(comm_b)

    # comm_a is Bas's "Ap: Sfalma" reply -> Aug 4, 12:12 local -> 09:12 UTC.
    assert comm_a.contact_date == "2026-08-04"
    assert comm_a.email_received_at == datetime(2026, 8, 4, 9, 12)

    # comm_b is Kostas's Greek "Re: Sfalma" reply -> Aug 4, 12:07mm local -> 09:07 UTC.
    assert comm_b.contact_date == "2026-08-04"
    assert comm_b.email_received_at == datetime(2026, 8, 4, 9, 7)

    # Neither Communication picked up the extra empty "Fwd:" block's own
    # Aug 6 00:11 timestamp -- the exact cross-contamination the old
    # position-based zip was vulnerable to.
    assert comm_a.contact_date != "2026-08-06"
    assert comm_b.contact_date != "2026-08-06"
