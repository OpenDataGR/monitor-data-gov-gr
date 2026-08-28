"""Covers _parse_quoted_sent_date's Greek-language quoted-header fallback
(_parse_greek_quoted_sent_date) -- strptime's %A/%B/%p are locale-dependent
(English-only in this app's runtime locale), so a Greek mail client's
"Στάλθηκε: Τρίτη, 4 Αυγούστου 2026 12:07 μμ" needs a separate hand-rolled
parse instead of a strptime format string.
"""
import app as appmod


def test_greek_quoted_date_real_sample():
    dt = appmod._parse_quoted_sent_date("Τρίτη, 4 Αυγούστου 2026 12:07 μμ")
    assert (dt.year, dt.month, dt.day, dt.hour, dt.minute) == (2026, 8, 4, 12, 7)


def test_greek_quoted_date_pm_with_dots():
    dt = appmod._parse_quoted_sent_date("Τρίτη, 4 Αυγούστου 2026 2:56 μ.μ.")
    assert (dt.hour, dt.minute) == (14, 56)


def test_greek_quoted_date_am():
    dt = appmod._parse_quoted_sent_date("Δευτέρα, 3 Αυγούστου 2026 9:15 πμ")
    assert (dt.hour, dt.minute) == (9, 15)


def test_greek_quoted_date_midnight_am_rolls_to_zero():
    dt = appmod._parse_quoted_sent_date("Τετάρτη, 5 Αυγούστου 2026 12:00 πμ")
    assert dt.hour == 0


def test_greek_quoted_date_noon_pm_stays_twelve():
    dt = appmod._parse_quoted_sent_date("Τετάρτη, 5 Αυγούστου 2026 12:00 μμ")
    assert dt.hour == 12


def test_english_quoted_date_still_parses():
    dt = appmod._parse_quoted_sent_date("August 4, 2026 14:56")
    assert (dt.year, dt.month, dt.day, dt.hour, dt.minute) == (2026, 8, 4, 14, 56)


def test_unparseable_quoted_date_returns_none():
    assert appmod._parse_quoted_sent_date("not a date at all") is None
    assert appmod._parse_quoted_sent_date("") is None
