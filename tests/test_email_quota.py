"""The email provider caps the month (this SendGrid account: 1,000). A mass email that does not fit in what is left of the month
must be refused BEFORE anything is sent -- otherwise it half-sends and the rest fail. EMAIL_MONTHLY_LIMIT=0 (default) enforces nothing."""
from datetime import datetime, timedelta, timezone

import pytest

import app as appmod
import config
from models import MassEmailJob, MassEmailLog, MassEmailRecipient, User, db


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setattr(appmod.csrf, "protect", lambda **kw: None)
    monkeypatch.setattr(appmod.limiter, "enabled", False)
    monkeypatch.setattr(config, "SMTP_USERNAME", "u")
    monkeypatch.setattr(config, "SMTP_PASSWORD", "p")
    monkeypatch.setattr(config, "SENDGRID_FROM_EMAIL", "from@x.gr")
    monkeypatch.setattr(config, "EMAIL_MONTHLY_RESERVE", 0)


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _job(status="done"):
    j = MassEmailJob(subject="s", message_html="m", status=status, total=0)
    db.session.add(j)
    db.session.commit()
    return j


def _recipient(job, status, sent_at=None, n=[0]):
    n[0] += 1
    db.session.add(MassEmailRecipient(job_id=job.id, email=f"r{n[0]}@x.gr", status=status, sent_at=sent_at))


def _admin_client(app):
    u = User(email="boss@x.gr", is_admin=True, is_superadmin=True)
    db.session.add(u)
    db.session.commit()
    c = app.test_client()
    with c.session_transaction() as s:
        s.update(user_id=u.id, user_email=u.email, is_admin=True, is_superadmin=True, allowed_tabs=None, org_scope=None)
    return c


def test_no_limit_configured_means_no_quota(app, monkeypatch):
    monkeypatch.setattr(config, "EMAIL_MONTHLY_LIMIT", 0)
    assert appmod._email_quota() is None
    assert appmod._quota_refusal(10_000_000) is None


def test_the_quota_counts_this_months_sent_mass_emails_only(app, monkeypatch):
    monkeypatch.setattr(config, "EMAIL_MONTHLY_LIMIT", 1000)
    job = _job()
    last_month = _now().replace(day=1) - timedelta(days=3)
    for _ in range(5):
        _recipient(job, "sent", _now())
    _recipient(job, "sent", last_month)      # last month: not this month's
    _recipient(job, "failed", _now())        # failed: never left the building
    _recipient(job, "pending")
    db.session.add(MassEmailLog(subject="s", message_html="m", recipient_count=4, success_count=3, sent_at=_now()))
    db.session.add(MassEmailLog(subject="old", message_html="m", recipient_count=9, success_count=9, sent_at=last_month))
    db.session.commit()
    q = appmod._email_quota()
    assert q["used"] == 8 and q["remaining"] == 992 and q["limit"] == 1000
    assert q["resets_at"][8:10] == "01"      # the first of next month


def test_the_reserve_is_kept_for_the_apps_own_mail(app, monkeypatch):
    monkeypatch.setattr(config, "EMAIL_MONTHLY_LIMIT", 1000)
    monkeypatch.setattr(config, "EMAIL_MONTHLY_RESERVE", 100)
    assert appmod._email_quota()["remaining"] == 900


def test_a_send_that_does_not_fit_is_refused_and_nothing_is_created(app, monkeypatch):
    monkeypatch.setattr(config, "EMAIL_MONTHLY_LIMIT", 1000)
    job = _job()
    for _ in range(900):
        _recipient(job, "sent", _now())
    db.session.commit()
    people = [{"email": f"p{i}@x.gr", "name": "P", "first_name": "P", "orgs": [], "pools": ["members"], "roles": []} for i in range(150)]
    monkeypatch.setattr(appmod, "_resolve_mass_email_audience", lambda pools, criteria: {"recipients": people, "diagnostics": {}})
    started = []
    monkeypatch.setattr(appmod.threading, "Thread", lambda *a, **k: started.append(1))
    before = MassEmailJob.query.count()

    r = _admin_client(app).post("/api/admin/mass-email", json={"subject": "Hi", "message": "<p>x</p>", "audience": {"pools": ["members"], "criteria": {}}})

    assert r.status_code == 409
    assert "only 100 are left" in r.get_json()["error"] and r.get_json()["quota"]["remaining"] == 100
    assert MassEmailJob.query.count() == before and not started


def test_a_send_that_fits_passes_the_guard(app, monkeypatch):
    monkeypatch.setattr(config, "EMAIL_MONTHLY_LIMIT", 1000)
    assert appmod._quota_refusal(1000) is None
    assert appmod._quota_refusal(1001) is not None


def test_the_preview_reports_the_quota(app, monkeypatch):
    monkeypatch.setattr(config, "EMAIL_MONTHLY_LIMIT", 1000)
    monkeypatch.setattr(appmod, "_resolve_mass_email_audience",
                        lambda pools, criteria: {"recipients": [], "diagnostics": {"by_pool": {}}})
    data = _admin_client(app).post("/api/admin/mass-email/audience", json={"pools": ["members"], "criteria": {}}).get_json()
    assert data["quota"]["limit"] == 1000 and data["quota"]["remaining"] == 1000


def test_resuming_a_send_that_no_longer_fits_is_refused(app, monkeypatch):
    monkeypatch.setattr(config, "EMAIL_MONTHLY_LIMIT", 10)
    job = _job(status="cancelled")
    for _ in range(20):
        _recipient(job, "pending")
    db.session.commit()
    r = _admin_client(app).post(f"/api/admin/mass-email/jobs/{job.id}/resume")
    assert r.status_code == 409 and "left of this month's quota" in r.get_json()["error"]
    assert MassEmailJob.query.get(job.id).status == "cancelled"
