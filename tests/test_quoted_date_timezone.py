"""Covers the Athens-local -> naive-UTC conversion applied to quoted-header
timestamps. A quoted "Sent:"/"Στάλθηκε:" line is written in the sender's own
(Athens) wall-clock time, but every other naive datetime in this app is
naive-UTC by convention (see _athens_local_to_naive_utc's docstring) --
storing the quoted local time unconverted made every such timestamp display
~2-3h fast once the frontend's own 'append Z, convert to local' logic ran on
top of it a second time.

Communication.contact_date is a plain calendar date with no timezone
concept (models.py) and must stay in LOCAL terms -- only the real timestamp
(sent_at / email_received_at) gets converted.
"""
from datetime import datetime

import app as appmod

# A trimmed real quoted chain (from a report against this exact bug):
# an English Outlook-style block ("Sent: Tuesday, August 4, 2026 12:12")
# and a Greek one ("Στάλθηκε: Τρίτη, 4 Αυγούστου 2026 12:07 μμ"), plus a
# late-night message whose UTC date rolls back to the previous day.
_REAL_THREAD_BODY = """\
________________________________
From: Bas <vpapath@m-t.gov.gr>
Sent: Tuesday, August 4, 2026 12:12
To: Kostas <k.sfikas@mindigital.gr>
Subject: Απ: Σφάλμα

Ευχαριστώ πολύ για την άμεση απάντηση.

________________________________
Από: Kostas <k.sfikas@mindigital.gr>
Στάλθηκε: Τρίτη, 4 Αυγούστου 2026 12:07 μμ
Προς: Bas <vpapath@m-t.gov.gr>
Θέμα: Re: Σφάλμα

Καλημέρα σας, έχουμε εντοπίσει το πρόβλημα.

________________________________
From: Kostas <k.sfikas@mindigital.gr>
Sent: Thursday, August 6, 2026 00:11
To: logger@parser.data.gov.gr <logger@parser.data.gov.gr>
Subject: Fw: Σφάλμα

Καλησπέρα σας, παρακαλώ στείλτε μας το αρχείο.
"""


def test_athens_local_to_naive_utc_summer_dst():
    # EEST (summer) = UTC+3
    local = datetime(2026, 8, 4, 12, 7)
    assert appmod._athens_local_to_naive_utc(local) == datetime(2026, 8, 4, 9, 7)


def test_athens_local_to_naive_utc_winter():
    # EET (winter) = UTC+2
    local = datetime(2026, 1, 15, 12, 0)
    assert appmod._athens_local_to_naive_utc(local) == datetime(2026, 1, 15, 10, 0)


def test_athens_local_to_naive_utc_rolls_back_a_calendar_day():
    # A quoted local time just after local midnight converts to the
    # PREVIOUS UTC calendar day -- exactly the case that must NOT leak into
    # Communication.contact_date (which stays in local terms, see below).
    local = datetime(2026, 8, 6, 0, 11)
    utc = appmod._athens_local_to_naive_utc(local)
    assert utc == datetime(2026, 8, 5, 21, 11)
    assert utc.date().isoformat() == "2026-08-05"


def test_extract_thread_messages_sent_at_is_utc_converted():
    msgs = appmod._extract_thread_messages(_REAL_THREAD_BODY)
    by_subject = {m["subject"]: m for m in msgs if m["subject"]}

    english_msg = next(m for m in msgs if m["from_email"] == "vpapath@m-t.gov.gr" and m["sent_at"] and m["sent_at"].day == 4)
    assert english_msg["sent_at"] == datetime(2026, 8, 4, 9, 12)  # 12:12 local -> 09:12 UTC
    assert english_msg["sent_date"] == "2026-08-04"  # stays the LOCAL calendar date

    greek_msg = next(m for m in msgs if m["from_email"] == "k.sfikas@mindigital.gr" and m["sent_at"] and m["sent_at"].hour == 9)
    assert greek_msg["sent_at"] == datetime(2026, 8, 4, 9, 7)  # 12:07μμ local -> 09:07 UTC
    assert greek_msg["sent_date"] == "2026-08-04"


def test_extract_thread_messages_contact_date_stays_local_across_midnight():
    msgs = appmod._extract_thread_messages(_REAL_THREAD_BODY)
    late_night = next(m for m in msgs if m["sent_at"] and m["sent_at"].hour == 21)
    # 00:11 local Aug 6 -> 21:11 UTC Aug 5 for the real timestamp...
    assert late_night["sent_at"] == datetime(2026, 8, 5, 21, 11)
    # ...but contact_date must NOT roll back a day -- it's a plain local
    # calendar date, unrelated to UTC.
    assert late_night["sent_date"] == "2026-08-06"
