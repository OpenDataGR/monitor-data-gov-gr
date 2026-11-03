"""Mass email by audience: who it can reach (Contacts directory, portal member accounts, dashboard users), narrowed by
organization / role / organization category / data-quality status (ANDed), previewed, test-sent, and then sent in the
background with per-recipient results. A message cannot be recalled, so the resolver's edge cases are tested hard:
matching people to organizations, deduplication, what is left out and why."""
import json
from datetime import datetime, timedelta, timezone

import pytest

import app as appmod
from models import (Communication, MassEmailJob, MassEmailLog, MassEmailRecipient, OrgClassification, OrgContact,
                    OrgSnapshot, User, db)

NOW = datetime.now(timezone.utc).replace(tzinfo=None)


@pytest.fixture(autouse=True)
def world(app, monkeypatch):
    monkeypatch.setattr(appmod.limiter, "enabled", False)
    monkeypatch.setattr(appmod, "_email_configured", lambda: True)
    monkeypatch.setattr(appmod.csrf, "protect", lambda **kw: None)   # so the routes answer, not the CSRF check
    appmod._orgs_cache["data"] = [
        {"name": "org-a", "title": "Οργανισμός Α"}, {"name": "org-b", "title": "Org B"},
        {"name": "org-c", "title": "Org C"}, {"name": "org-d", "title": "Org D"}]
    appmod._pm_cache["data"] = {"members": [], "total": 0, "unmatched": []}
    appmod._pm_cache["loading"] = False
    yield
    appmod._pm_cache["data"] = None


def _contact(email, label, types="Org Administrator", first="Maria", last="K"):
    c = OrgContact(email=email, org_code="C-" + label, org_label=label, first_name=first, last_name=last, contact_type=types,
                   org_codes=json.dumps([{"code": "C-" + label, "label": label}]))
    db.session.add(c)
    db.session.commit()


def _member(email, org, capacity="admin", state="active", name="Some Member"):
    appmod._pm_cache["data"]["members"].append({"org_name": org, "org_title": org.upper(), "username": email.split("@")[0],
                                                "display_name": name, "capacity": capacity, "email": email, "state": state})


def _emails(resolved):
    return [r["email"] for r in resolved["recipients"]]


def _resolve(pools, **criteria):
    return appmod._resolve_mass_email_audience(pools, criteria)


# ── the pools ──────────────────────────────────────────────────────────────────

def test_contacts_are_matched_to_their_ckan_organization_by_normalised_title():
    _contact("a@x.gr", "ΟΡΓΑΝΙΣΜΟΣ Α")                 # HRMS label in capitals, CKAN title in title case with an accent difference
    _contact("nobody@x.gr", "Unknown Body")             # no CKAN organization with that title
    got = _resolve(["contacts"], orgs=["org-a"])
    assert _emails(got) == ["a@x.gr"]
    assert got["recipients"][0]["orgs"] == [("org-a", "Οργανισμός Α")]
    assert got["diagnostics"]["no_matching_org"] == 1   # never selected by an organization criterion, and counted


def test_a_contact_with_an_unmatched_organization_is_included_when_no_organization_criterion_is_set():
    _contact("nobody@x.gr", "Unknown Body")
    assert _emails(_resolve(["contacts"])) == ["nobody@x.gr"]


def test_contact_types_become_roles_and_a_contact_can_hold_several():
    _contact("admin@x.gr", "Org B", types="Org Administrator")
    _contact("dgo@x.gr", "Org B", types="Data Steward, Data Governance Officer")
    _contact("plain@x.gr", "Org B", types="")
    assert _emails(_resolve(["contacts"], roles=["org_admin"])) == ["admin@x.gr"]
    assert _emails(_resolve(["contacts"], roles=["data_governance_officer"])) == ["dgo@x.gr"]
    assert _emails(_resolve(["contacts"], roles=["data_steward", "org_admin"])) == ["admin@x.gr", "dgo@x.gr"]


def test_portal_members_use_their_org_role_and_only_active_accounts_with_an_address_count():
    _member("admin@p.gr", "org-b", "admin")
    _member("editor@p.gr", "org-b", "editor")
    _member("gone@p.gr", "org-b", "admin", state="deleted")
    _member("", "org-b", "admin")
    got = _resolve(["members"], roles=["org_admin"])
    assert _emails(got) == ["admin@p.gr"] and got["diagnostics"]["no_valid_email"] == 1
    assert _emails(_resolve(["members"], orgs=["org-b"])) == ["admin@p.gr", "editor@p.gr"]


def test_dashboard_users_roles_and_their_organizations():
    db.session.add_all([
        User(email="super@d.gr", name="Super Admin", is_admin=True, is_superadmin=True),
        User(email="adm@d.gr", name="Plain Admin", is_admin=True),
        User(email="orgadmin@d.gr", name="Org Admin", org_scoped=True, ckan_orgs=json.dumps(["org-c"])),
        User(email="other@d.gr", name="Other", org_scoped=True, ckan_orgs=json.dumps(["org-d"]))])
    db.session.commit()
    assert _emails(_resolve(["users"], roles=["dashboard_superadmin"])) == ["super@d.gr"]
    assert _emails(_resolve(["users"], roles=["dashboard_admin"])) == ["adm@d.gr", "super@d.gr"]
    assert _emails(_resolve(["users"], roles=["org_admin"], orgs=["org-c"])) == ["orgadmin@d.gr"]


def test_pools_are_combined_and_a_person_in_several_is_addressed_once():
    _contact("same@x.gr", "Org B", first="Eleni", last="Long Surname")
    _member("SAME@x.gr", "org-b", "admin", name="Eleni L")      # the same address, different case and a shorter name
    db.session.add(User(email="same@x.gr", name="E", is_admin=True))
    db.session.commit()
    got = _resolve(["contacts", "members", "users"])
    assert _emails(got) == ["same@x.gr"]
    r = got["recipients"][0]
    assert r["name"] == "Eleni Long Surname" and sorted(r["pools"]) == ["contacts", "members", "users"]


def test_invalid_addresses_are_left_out_and_counted():
    _contact("not-an-address", "Org B")
    _contact("ok@x.gr", "Org B")
    got = _resolve(["contacts"])
    assert _emails(got) == ["ok@x.gr"] and got["diagnostics"]["no_valid_email"] == 1


def test_at_least_one_pool_is_required_and_unloaded_portal_accounts_say_so(monkeypatch):
    with pytest.raises(appmod.MassEmailAudienceError):
        appmod._resolve_mass_email_audience([], {})
    started = []
    monkeypatch.setattr(appmod, "_do_fetch_portal_members", lambda: started.append(1))
    appmod._pm_cache["data"] = None
    with pytest.raises(appmod.MassEmailAudienceError) as e:
        _resolve(["members"])
    assert e.value.status == 409 and "loading" in str(e.value)


# ── the criteria, ANDed ────────────────────────────────────────────────────────

def _snapshot(slug, hvd_checked=0, hvd_conforms=0, dcat_checked=0, dcat_conforms=0):
    db.session.add(OrgSnapshot(computed_at=NOW, org_slug=slug, hvd_checked=hvd_checked, hvd_conforms=hvd_conforms,
                               hvd_pass_rate=(hvd_conforms / hvd_checked) if hvd_checked else None,
                               dcat_checked=dcat_checked, dcat_conforms=dcat_conforms,
                               dcat_pass_rate=(dcat_conforms / dcat_checked) if dcat_checked else None))
    db.session.commit()


def _populate_orgs():
    for slug in ("org-a", "org-b", "org-c", "org-d"):
        _member(f"{slug}@p.gr", slug, "admin")
    db.session.add_all([OrgClassification(org_slug="org-a", category="ministry"), OrgClassification(org_slug="org-b", category="municipality"),
                        OrgClassification(org_slug="org-c", category="municipality"), OrgClassification(org_slug="org-d", category="region")])
    db.session.commit()
    _snapshot("org-a", hvd_checked=10, hvd_conforms=4, dcat_checked=10, dcat_conforms=1)    # HVD issues
    _snapshot("org-b", hvd_checked=5, hvd_conforms=5, dcat_checked=5, dcat_conforms=4)      # all HVD compliant
    _snapshot("org-c", hvd_checked=0, dcat_checked=8, dcat_conforms=6)                      # nothing HVD-checked
    # org-d has no snapshot at all


def test_organization_category_criterion():
    _populate_orgs()
    assert _emails(_resolve(["members"], categories=["municipality"])) == ["org-b@p.gr", "org-c@p.gr"]
    assert _emails(_resolve(["members"], categories=["ministry", "region"])) == ["org-a@p.gr", "org-d@p.gr"]


def test_data_quality_status_criteria():
    _populate_orgs()
    q = lambda status, **kw: _emails(_resolve(["members"], quality={"status": status, **kw}))
    assert q("hvd_issues") == ["org-a@p.gr"]
    assert q("hvd_all_compliant") == ["org-b@p.gr"]
    assert q("no_hvd_checked") == ["org-c@p.gr", "org-d@p.gr"]          # a snapshot with none checked, and an org with no snapshot
    assert q("dcat_pass_below", threshold=50) == ["org-a@p.gr"]         # 10% only
    assert q("dcat_pass_below", threshold=78) == ["org-a@p.gr", "org-c@p.gr"]   # 10% and 75%, not org-b's 80%
    assert q("dcat_pass_below", threshold=90) == ["org-a@p.gr", "org-b@p.gr", "org-c@p.gr"]
    assert q("dcat_pass_below", threshold=5) == []


def test_all_criteria_are_anded():
    _populate_orgs()
    _member("editor-b@p.gr", "org-b", "editor")
    got = _resolve(["members"], categories=["municipality"], roles=["org_editor"], orgs=["org-b", "org-c"])
    assert _emails(got) == ["editor-b@p.gr"]
    none = _resolve(["members"], categories=["municipality"], quality={"status": "hvd_issues"})
    assert _emails(none) == []                                           # municipalities, but none with HVD issues


def test_the_diagnostics_say_what_was_left_out_and_why():
    _populate_orgs()
    _member("editor@p.gr", "org-a", "editor")
    d = _resolve(["members"], orgs=["org-a"], roles=["org_admin"])["diagnostics"]
    assert d["total"] == 1 and d["role_filtered"] == 1 and d["org_filtered"] == 3


# ── merge fields ───────────────────────────────────────────────────────────────

def test_merge_fields_fallbacks_and_escaping():
    values = {"name": "Maria <b>K</b>", "first_name": "", "organization": "Org B"}
    assert appmod._render_mass_email("Dear {{ name }},", values) == "Dear Maria &lt;b&gt;K&lt;/b&gt;,"
    assert appmod._render_mass_email("Dear {{first_name|colleague}}, {{organization}}", values) == "Dear colleague, Org B"
    assert appmod._render_mass_email("Dear {{first_name}},", values) == "Dear ,"
    assert appmod._render_mass_email("{{nope}} stays", values) == "{{nope}} stays"
    assert appmod._render_mass_email("{{name}}", {"name": "A & B"}, escape=False) == "A & B"
    assert appmod._unknown_merge_fields("Hi {{name}} {{Typo}} {{organisation}}") == ["organisation", "typo"]


# ── the routes ─────────────────────────────────────────────────────────────────

def _login(client, **kw):
    u = User(email=kw.pop("email", "boss@d.gr"), name="The Boss", **kw)
    db.session.add(u)
    db.session.commit()
    with client.session_transaction() as s:
        s.update(user_id=u.id, user_email=u.email, is_admin=u.is_admin, is_superadmin=u.is_superadmin,
                 allowed_tabs=u.allowed_tabs, org_scope=appmod._user_org_scope(u))
    return u


@pytest.fixture
def mail(monkeypatch):
    sent = []

    def fake(to, subject, html, text=None):
        if "fail" in to:
            raise RuntimeError("mailbox full")
        sent.append((to, subject, html))

    monkeypatch.setattr(appmod, "send_email", fake)
    return sent


@pytest.fixture
def admin_client(app):
    c = app.test_client()
    _login(c, is_admin=True)
    return c


def test_the_routes_need_an_admin(app):
    c = app.test_client()
    _login(c)                                        # a signed-in user who is not an admin
    for method, path in (("get", "/api/admin/mass-email/options"), ("post", "/api/admin/mass-email/audience"),
                         ("post", "/api/admin/mass-email/test"), ("get", "/api/admin/mass-email/jobs/1")):
        assert getattr(c, method)(path).status_code == 403


def test_options_list_what_the_ui_needs(admin_client):
    data = admin_client.get("/api/admin/mass-email/options").get_json()
    assert data["pools"] == ["contacts", "members", "users"] and "org_admin" in data["roles"]
    assert {"slug": "org-b", "title": "Org B"} in data["orgs"] and "municipality" in data["categories"]
    assert data["max_recipients"] == appmod._MASS_EMAIL_MAX_RECIPIENTS


def test_the_preview_reports_the_count_a_sample_and_the_leftovers(admin_client):
    _contact("a@x.gr", "Org B")
    _contact("bad", "Org B")
    data = admin_client.post("/api/admin/mass-email/audience", json={"pools": ["contacts"], "criteria": {"orgs": ["org-b"]}}).get_json()
    assert data["total"] == 1 and data["sample"][0]["email"] == "a@x.gr" and data["sample"][0]["organization"] == "Org B"
    assert data["diagnostics"]["no_valid_email"] == 1
    assert admin_client.post("/api/admin/mass-email/audience", json={"pools": []}).status_code == 400


def test_the_test_send_goes_only_to_the_admin_with_merge_fields_filled_from_the_first_recipient(admin_client, mail):
    _contact("a@x.gr", "Org B", first="Eleni", last="P")
    r = admin_client.post("/api/admin/mass-email/test", json={
        "subject": "Hello {{first_name}}", "message": "<p>Dear {{name}} of {{organization}}</p>",
        "audience": {"pools": ["contacts"], "criteria": {}}})
    assert r.status_code == 200 and r.get_json()["sent_to"] == "boss@d.gr"
    assert mail == [("boss@d.gr", "[TEST] Hello Eleni", "<p>Dear Eleni P of Org B</p>")]       # never to the recipient
    bad = admin_client.post("/api/admin/mass-email/test", json={"subject": "s", "message": "<p>{{typo}}</p>"})
    assert bad.status_code == 400 and "typo" in bad.get_json()["error"]


def test_sending_by_audience_makes_a_job_with_the_recipients_snapshotted(admin_client, mail, monkeypatch):
    monkeypatch.setattr(appmod, "_run_mass_email_job", lambda job_id: None)          # the runner is tested separately
    _contact("a@x.gr", "Org B")
    _contact("b@x.gr", "Org B")
    r = admin_client.post("/api/admin/mass-email", json={"subject": "S", "message": "<p>Hi {{name|there}}</p>",
                                                         "audience": {"pools": ["contacts"], "criteria": {"orgs": ["org-b"]}}, "log_comms": True})
    data = r.get_json()
    assert r.status_code == 200 and data["total"] == 2
    job = MassEmailJob.query.get(data["job_id"])
    assert job.status == "running" and job.log_comms and job.total == 2
    assert sorted(x.email for x in job.recipients) == ["a@x.gr", "b@x.gr"] and {x.status for x in job.recipients} == {"pending"}
    assert mail == []                                                                 # nothing is sent inline


def test_a_second_send_is_refused_while_one_is_running_but_not_if_it_was_killed(admin_client, mail, monkeypatch):
    monkeypatch.setattr(appmod, "_run_mass_email_job", lambda job_id: None)
    _contact("a@x.gr", "Org B")
    payload = {"subject": "S", "message": "<p>x</p>", "audience": {"pools": ["contacts"]}}
    assert admin_client.post("/api/admin/mass-email", json=payload).status_code == 200
    assert admin_client.post("/api/admin/mass-email", json=payload).status_code == 409
    MassEmailJob.query.update({"heartbeat_at": NOW - timedelta(minutes=10)})         # that send's worker was killed
    db.session.commit()
    assert admin_client.post("/api/admin/mass-email", json=payload).status_code == 200


def test_the_send_refuses_an_empty_audience_too_many_recipients_and_unknown_fields(admin_client, monkeypatch):
    monkeypatch.setattr(appmod, "_run_mass_email_job", lambda job_id: None)
    _contact("a@x.gr", "Org B")
    _contact("b@x.gr", "Org B")
    post = lambda **kw: admin_client.post("/api/admin/mass-email", json={"subject": "S", "message": "<p>x</p>", **kw})
    assert post(audience={"pools": ["contacts"], "criteria": {"orgs": ["org-a"]}}).status_code == 400       # no one matches
    monkeypatch.setattr(appmod, "_MASS_EMAIL_MAX_RECIPIENTS", 1)
    assert "limit" in post(audience={"pools": ["contacts"]}).get_json()["error"]
    monkeypatch.setattr(appmod, "_MASS_EMAIL_MAX_RECIPIENTS", 100)
    assert post(audience={"pools": ["contacts"]}, message="<p>{{typo}}</p>").status_code == 400


def test_the_original_pick_users_send_still_works(admin_client, mail):
    u = User(email="picked@d.gr", name="Picked")
    db.session.add(u)
    db.session.commit()
    r = admin_client.post("/api/admin/mass-email", json={"subject": "S", "message": "<p>Hello</p>", "user_ids": [u.id]})
    assert r.get_json()["sent"] == 1 and mail[0][0] == "picked@d.gr" and MassEmailLog.query.count() == 1


# ── the background runner ──────────────────────────────────────────────────────

def _job(recipients, log_comms=False, status="running"):
    job = MassEmailJob(subject="Update for {{organization}}", message_html="<p>Dear {{first_name|colleague}}</p>", status=status,
                       total=len(recipients), log_comms=log_comms, heartbeat_at=NOW, created_by_name="Boss")
    db.session.add(job)
    db.session.flush()
    for email, first, org, slug in recipients:
        db.session.add(MassEmailRecipient(job_id=job.id, email=email, name=first, first_name=first, org_title=org,
                                          orgs_json=json.dumps([[slug, org]] if org else [])))
    db.session.commit()
    return job



def _run(job_id):
    """The runner uses its own app context (its own session); expire ours so we see what it saved."""
    appmod._run_mass_email_job(job_id)
    db.session.expire_all()


def test_the_runner_sends_each_recipient_a_personalised_copy_and_records_every_result(app, mail):
    job = _job([("a@x.gr", "Maria", "Org B", "org-b"), ("fail@x.gr", "", "Org C", "org-c"), ("c@x.gr", "", "", "")])
    _run(job.id)

    assert mail == [("a@x.gr", "Update for Org B", "<p>Dear Maria</p>"), ("c@x.gr", "Update for ", "<p>Dear colleague</p>")]
    job = MassEmailJob.query.get(job.id)
    d = appmod._mass_email_job_dict(job, with_failures=True)
    assert job.status == "done" and d["sent"] == 2 and d["failed"] == 1 and d["pending"] == 0
    assert d["failures"] == [{"email": "fail@x.gr", "error": "mailbox full"}]
    log = MassEmailLog.query.one()
    assert (log.recipient_count, log.success_count, log.failed_emails) == (3, 2, "fail@x.gr")


def test_a_cancelled_send_stops_and_a_resume_sends_only_what_is_left(app, mail):
    job = _job([("a@x.gr", "A", "Org B", "org-b"), ("b@x.gr", "B", "Org B", "org-b")], status="cancelling")
    _run(job.id)
    assert MassEmailJob.query.get(job.id).status == "cancelled" and mail == []

    MassEmailRecipient.query.filter_by(email="a@x.gr").update({"status": "sent"})      # as if one had gone out before
    db.session.commit()
    job = MassEmailJob.query.get(job.id)
    job.status = "running"
    db.session.commit()
    _run(job.id)
    assert [m[0] for m in mail] == ["b@x.gr"] and MassEmailJob.query.get(job.id).status == "done"


def test_the_resume_and_cancel_routes(admin_client, mail, monkeypatch):
    runs = []
    monkeypatch.setattr(appmod, "_run_mass_email_job", lambda job_id: runs.append(job_id))
    job = _job([("a@x.gr", "A", "Org B", "org-b")])
    assert admin_client.post(f"/api/admin/mass-email/jobs/{job.id}/resume").status_code == 409        # still alive, not killed
    MassEmailJob.query.update({"heartbeat_at": NOW - timedelta(minutes=10)})
    db.session.commit()
    got = admin_client.get(f"/api/admin/mass-email/jobs/{job.id}").get_json()
    assert got["interrupted"] is True and got["pending"] == 1
    assert admin_client.post(f"/api/admin/mass-email/jobs/{job.id}/resume").status_code == 200 and runs == [job.id]
    assert admin_client.post(f"/api/admin/mass-email/jobs/{job.id}/cancel").get_json()["status"] == "cancelling"
    MassEmailRecipient.query.update({"status": "sent"})
    db.session.commit()
    assert admin_client.post(f"/api/admin/mass-email/jobs/{job.id}/resume").status_code == 400         # nothing left


# ── logging in Communications ──────────────────────────────────────────────────

def test_the_send_is_logged_as_one_communication_per_organization_when_asked(app, mail):
    job = _job([("a@x.gr", "A", "Org B", "org-b"), ("b@x.gr", "B", "Org B", "org-b"), ("c@x.gr", "C", "Org C", "org-c"),
                ("d@x.gr", "D", "", ""), ("fail@x.gr", "F", "Org D", "org-d")], log_comms=True)
    _run(job.id)

    rows = {c.org_name: c for c in Communication.query.all()}
    assert set(rows) == {"org-b", "org-c"}                    # not org-d (its only recipient failed) and not the person with no organization
    assert "2 recipient" in rows["org-b"].notes and "1 recipient" in rows["org-c"].notes
    c = rows["org-b"]
    assert (c.direction, c.medium, c.source, c.case_id) == ("Outbound", "Email", "mass-email", None) and c.subject.startswith("Mass email:")


def test_nothing_is_logged_when_not_asked_and_the_communications_list_copes_with_these_entries(app, mail, admin_client):
    _run(_job([("a@x.gr", "A", "Org B", "org-b")], log_comms=False).id)
    assert Communication.query.count() == 0
    _run(_job([("b@x.gr", "B", "Org B", "org-b")], log_comms=True).id)
    r = admin_client.get("/api/communications")
    assert r.status_code == 200 and "Mass email" in r.get_data(as_text=True)


def test_the_latest_job_is_available_for_the_panel_after_a_reload(admin_client):
    assert admin_client.get("/api/admin/mass-email/jobs/latest").get_json() is None
    _job([("a@x.gr", "A", "Org B", "org-b")])
    second = _job([("b@x.gr", "B", "Org B", "org-b")])
    got = admin_client.get("/api/admin/mass-email/jobs/latest").get_json()
    assert got["id"] == second.id and got["pending"] == 1 and got["total"] == 1


def test_the_admin_page_renders_with_the_merge_field_hint_intact_in_both_languages(admin_client):
    """admin_users.html is a Jinja template: an unescaped {{name}} in the hint would silently render as nothing."""
    r = admin_client.get("/admin/users")
    assert r.status_code == 200
    page = r.get_data(as_text=True)
    assert "click a field to insert it" in page and "Αν ο παραλήπτης δεν έχει όνομα" in page
    for hook in ("meCriteriaPanel", "previewMassEmailAudience", "sendMassEmailTest", "meJobCard", "_loadMassEmailOptions"):
        assert hook in page


def test_a_send_is_refused_up_front_when_email_is_not_configured(admin_client, monkeypatch):
    monkeypatch.setattr(appmod, "_email_configured", lambda: False)
    _contact("a@x.gr", "Org B")
    r = admin_client.post("/api/admin/mass-email", json={"subject": "S", "message": "<p>x</p>", "audience": {"pools": ["contacts"]}})
    assert r.status_code == 503 and "not configured" in r.get_json()["error"] and MassEmailJob.query.count() == 0


def test_the_full_list_is_only_returned_on_request_and_carries_roles(admin_client):
    _contact("a@x.gr", "Org B")
    _contact("c@x.gr", "Org B")
    body = {"pools": ["contacts"], "criteria": {"orgs": ["org-b"]}}
    assert "recipients" not in admin_client.post("/api/admin/mass-email/audience", json=body).get_json()
    data = admin_client.post("/api/admin/mass-email/audience", json={**body, "full": True}).get_json()
    assert [r["email"] for r in data["recipients"]] == ["a@x.gr", "c@x.gr"] == [r["email"] for r in data["sample"]]
    assert data["recipients"][0]["organizations"] == ["Org B"] and isinstance(data["recipients"][0]["roles"], list)


def test_the_panel_has_insert_buttons_and_configurable_fallbacks(admin_client):
    html = admin_client.get("/admin/users").get_data(as_text=True)
    assert "_meInsertField('first_name')" in html and 'id="meFallbackPerson"' in html and "{{name|" not in html


def test_last_name_is_what_follows_the_first_name():
    v = appmod._merge_values_for({"name": "Eleni Papadopoulou Kyriakou", "first_name": "Eleni", "orgs": []})
    assert v["first_name"] == "Eleni" and v["last_name"] == "Papadopoulou Kyriakou"
    assert appmod._merge_values_for({"name": "Eleni", "first_name": "Eleni", "orgs": []})["last_name"] == ""
    assert appmod._render_mass_email("{{first_name}} {{last_name|-}}", {"first_name": "A", "last_name": ""}) == "A -"


def test_a_capacity_ckan_added_later_becomes_a_selectable_role(admin_client):
    assert appmod._capacity_role("dgo") == appmod._capacity_role("DGO") == "data_governance_officer"
    assert appmod._capacity_role("central_admin") == "org_central_admin" and appmod._capacity_role("admin") == "org_admin"
    assert appmod._capacity_role("org_admin") == "org_org_admin"          # an unknown spelling is its own role, never merged with admin
    assert appmod._capacity_role("editor") == "org_editor" and appmod._capacity_role("user") is None
    assert appmod._capacity_role("Data Steward") == "data_steward" and appmod._capacity_role("Auditor") == "org_auditor"
    appmod._pm_cache["data"] = {"members": [
        {"email": "s@x.gr", "username": "s", "capacity": "auditor", "org_name": "org-b", "org_title": "Org B", "state": "active"},
        {"email": "e@x.gr", "username": "e", "capacity": "editor", "org_name": "org-b", "org_title": "Org B", "state": "active"}]}
    opts = admin_client.get("/api/admin/mass-email/options").get_json()
    assert "org_auditor" in opts["roles"] and opts["role_labels"] == {"org_auditor": "auditor"}
    data = admin_client.post("/api/admin/mass-email/audience",
                             json={"pools": ["members"], "criteria": {"roles": ["org_auditor"]}, "full": True}).get_json()
    assert [r["email"] for r in data["recipients"]] == ["s@x.gr"]


def test_the_members_tab_counts_a_capacity_it_has_never_heard_of():
    import inspect
    src = inspect.getsource(appmod)
    assert '"other": dict(sorted(other.items()))' in src


def test_the_options_say_which_registry_each_role_belongs_to(admin_client):
    g = admin_client.get("/api/admin/mass-email/options").get_json()["role_groups"]
    assert "data_steward" in g["contacts"] and "data_steward" not in g["members"]
    assert {"org_central_admin", "org_admin", "org_editor", "org_member", "data_governance_officer"} <= set(g["members"])
    assert g["users"] == ["org_admin", "dashboard_admin", "dashboard_superadmin"]
