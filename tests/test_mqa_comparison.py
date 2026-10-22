"""data.europa.eu's DCAT-AP violation list (~160k rows) next to our own DCAT-AP check, grouped by
property. The EU side is pulled in the background and boiled down to counts."""
import json

import pytest

import app as appmod
from models import DcatApCheckCache, MqaCache, MqaViolationSummary, User, db

FORMAT = "http://purl.org/dc/terms/format"
BYTESIZE = "http://www.w3.org/ns/dcat#byteSize"


def _row(path, ref, msg="NodeKind[BlankNodeOrIRI] : Expected BlankNodeOrIRI for \"XLS\"", sev="Violation"):
    return {"resultPath": path, "reference": f"http://data.europa.eu/88u/dataset/{ref}", "resultMessage": msg,
            "resultSeverity": f"http://www.w3.org/ns/shacl#{sev}", "title": "t"}


class _Resp:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


@pytest.fixture(autouse=True)
def _reset_status():
    appmod._mqa_viol_status["status"] = {"running": False, "started_at": None, "fetched": 0, "total": 0, "error": None}
    yield


def _admin_client(app, is_admin=True):
    u = User(email=("admin" if is_admin else "plain") + "@example.gr", is_admin=is_admin, is_superadmin=is_admin)
    db.session.add(u)
    db.session.commit()
    c = app.test_client()
    with c.session_transaction() as s:
        s.update({"user_id": u.id, "is_admin": is_admin, "is_superadmin": is_admin, "allowed_tabs": None, "org_scope": None})
    return c


# ── aggregating their rows ─────────────────────────────────────────────────────

def test_rows_are_folded_into_per_property_counts():
    agg = {"properties": {}, "per_dataset": {}}
    appmod._aggregate_eu_violations([
        _row(FORMAT, "d1"), _row(FORMAT, "d1"), _row(FORMAT, "d2"),
        _row(BYTESIZE, "d1", "DatatypeConstraint[xsd:decimal]: Expected xsd:decimal"),
        _row(BYTESIZE, "d3", "DatatypeConstraint[xsd:decimal]: Expected xsd:decimal", sev="Warning"),
    ], agg)
    out = appmod._finish_eu_violation_summary(agg, 5)
    by = {p["path"]: p for p in out["properties"]}
    assert (by[FORMAT]["violations"], by[FORMAT]["datasets"]) == (3, 2)
    assert by[FORMAT]["constraints"] == {"NodeKind[BlankNodeOrIRI]": 3}
    assert by[BYTESIZE]["severities"] == {"Violation": 1, "Warning": 1}
    assert out["properties"][0]["path"] == FORMAT  # biggest first
    assert out["datasets_with_violations"] == 3 and out["per_dataset"] == {"d1": 3, "d2": 1, "d3": 1}


# ── fetching it (paged, in the background) ─────────────────────────────────────

def test_fetch_pages_through_the_whole_list_and_stores_a_summary(app, monkeypatch):
    monkeypatch.setattr(appmod, "_MQA_VIOLATIONS_PAGE", 2)
    pages = {0: [_row(FORMAT, "d1"), _row(FORMAT, "d2")], 2: [_row(BYTESIZE, "d3")]}
    seen = []

    def fake_get(url, params=None, **kw):
        seen.append((params["limit"], params["offset"]))
        assert url.endswith("/catalogues/data-gov-gr/violations")
        if params["limit"] == 1:  # the cheap up-front request that learns the total
            return _Resp({"success": True, "result": {"count": 3, "results": pages[0][:1]}})
        return _Resp({"success": True, "result": {"count": 3, "results": pages[params["offset"]]}})

    monkeypatch.setattr(appmod.requests, "get", fake_get)
    assert appmod._fetch_mqa_violation_summary() is True
    assert seen == [(1, 0), (2, 0), (2, 2)]
    row = MqaViolationSummary.query.one()
    assert row.total_violations == 3 and row.data()["datasets_with_violations"] == 3
    st = appmod._mqa_viol_get()
    assert st["running"] is False and st["error"] is None and st["fetched"] == 3 and st["total"] == 3


def test_a_failed_request_is_retried_then_the_error_is_reported(app, monkeypatch):
    monkeypatch.setattr(appmod.time, "sleep", lambda s: None)
    calls = {"n": 0}

    def flaky(url, params=None, **kw):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("timeout")
        return _Resp({"success": True, "result": {"count": 1, "results": [_row(FORMAT, "d1")]}})

    monkeypatch.setattr(appmod.requests, "get", flaky)
    assert appmod._fetch_mqa_violation_summary() is True and calls["n"] == 3  # preflight (retried once) + the page

    def down(url, params=None, **kw):
        raise RuntimeError("data.europa.eu down")

    monkeypatch.setattr(appmod.requests, "get", down)
    assert appmod._fetch_mqa_violation_summary() is False
    st = appmod._mqa_viol_get()
    assert st["running"] is False and "down" in st["error"]
    assert MqaViolationSummary.query.count() == 1  # the failure didn't add or remove a summary


def test_only_one_fetch_runs_at_a_time_and_a_dead_one_does_not_block_forever(app, monkeypatch):
    monkeypatch.setattr(appmod.requests, "get", lambda *a, **k: pytest.fail("must not fetch while one is running"))
    appmod._mqa_viol_set(running=True, started_at=appmod.time.time())
    assert appmod._fetch_mqa_violation_summary() is False
    # A fetch killed mid-pull (e.g. a deploy restarted the process) leaves running=True behind; its
    # heartbeat stops, so it is treated as dead soon after instead of blocking the button for half an hour.
    st = appmod._mqa_viol_get()
    st["heartbeat"] = appmod.time.time() - appmod._MQA_VIOLATIONS_HEARTBEAT_STALE - 1
    appmod._mqa_viol_status["status"] = st
    assert appmod._mqa_viol_running() is False


def test_only_the_latest_few_summaries_are_kept(app, monkeypatch):
    monkeypatch.setattr(appmod.requests, "get", lambda *a, **k: _Resp(
        {"success": True, "result": {"count": 1, "results": [_row(FORMAT, "d1")]}}))
    for _ in range(8):
        appmod._fetch_mqa_violation_summary()
    assert MqaViolationSummary.query.count() == 5


# ── when it runs by itself ─────────────────────────────────────────────────────

class _SyncThread:
    def __init__(self, target=None, args=(), daemon=None):
        self._target, self._args = target, args

    def start(self):
        self._target(*self._args)


def test_a_newly_published_score_triggers_a_fetch_but_the_same_score_does_not(app, monkeypatch):
    v2 = {"info": {}, "score": {"date": "2026-10-18", "max": 7.5, "value": 5.85},
          "counts": {"value": {"datasets": 1}}, "coverage": {"value": {}}}
    monkeypatch.setattr(appmod.requests, "get", lambda *a, **k: _Resp({"result": {"results": [v2]}}))
    started = []
    monkeypatch.setattr(appmod, "_fetch_mqa_violation_summary", lambda: started.append(1))
    monkeypatch.setattr(appmod.threading, "Thread", _SyncThread)
    appmod._do_refresh_mqa()
    appmod._do_refresh_mqa()  # same published score: nothing new
    assert started == [1]
    v2["score"]["date"] = "2026-10-25"
    appmod._do_refresh_mqa()
    assert started == [1, 1]


# ── the comparison ─────────────────────────────────────────────────────────────

def _seed(eu=True, ours=True):
    if eu:
        agg = {"properties": {}, "per_dataset": {}}
        appmod._aggregate_eu_violations([_row(FORMAT, f"d{i}") for i in range(6)] + [_row(BYTESIZE, "d1")], agg)
        db.session.add(MqaViolationSummary(score_date="2026-10-18", total_violations=7,
                                           data_json=json.dumps(appmod._finish_eu_violation_summary(agg, 7))))
    if ours:
        def entry(path, count, sev="violation"):
            return {"severity": sev, "path": path, "message": "m", "raw_message": "r", "count": count}
        blob = {"summary": {"total": 100, "checked": 99}, "finished_at": "2026-10-22T09:00:00+00:00", "partial": False,
                "datasets": [
                    {"name": "a", "details": [entry(FORMAT, 4), entry(BYTESIZE, 1), entry(FORMAT, 1, "warning")]},
                    {"name": "b", "details": [entry(FORMAT, 2)]},
                    {"name": "c", "details": [entry("http://example.org/onlyOurs", 3)]},
                    {"name": "d", "details": [entry(FORMAT, 9, "warning")]},   # warnings only: not a violation
                ]}
        db.session.add(DcatApCheckCache(id=1, data_json=json.dumps(blob)))
    db.session.add(MqaCache(id=1, data_json=json.dumps({"data": {"counts": {"datasets": 5391}}, "fetched_at": "x"})))
    db.session.commit()


def test_comparison_lines_the_two_sides_up_by_property(app):
    _seed()
    d = _admin_client(app).get("/api/quality/mqa/comparison").get_json()
    assert d["eu"]["violations"] == 7 and d["eu"]["datasets_with_violations"] == 6 and d["eu"]["datasets_assessed"] == 5391
    assert d["ours"]["violations"] == 10 and d["ours"]["datasets_with_violations"] == 3 and d["ours"]["checked"] == 99
    rows = {r["path"]: r for r in d["rows"]}
    f = rows[FORMAT]
    assert (f["eu_violations"], f["eu_datasets"], f["our_violations"], f["our_datasets"]) == (6, 6, 6, 2)
    assert rows[BYTESIZE]["our_violations"] == 1 and rows[BYTESIZE]["eu_violations"] == 1
    only_ours = rows["http://example.org/onlyOurs"]
    assert (only_ours["eu_violations"], only_ours["our_violations"]) == (0, 3)
    assert [r["path"] for r in d["rows"]][0] == FORMAT  # biggest first
    assert d["can_refresh"] is True


def test_comparison_before_either_side_has_run(app):
    d = _admin_client(app).get("/api/quality/mqa/comparison").get_json()
    assert d["eu"] is None and d["ours"] is None and d["rows"] == [] and d["status"]["running"] is False


def test_comparison_with_only_the_eu_side(app):
    _seed(ours=False)
    d = _admin_client(app).get("/api/quality/mqa/comparison").get_json()
    assert d["ours"] is None and d["eu"]["violations"] == 7
    assert all(r["our_violations"] == 0 for r in d["rows"])


def test_refresh_is_admin_only_and_starts_a_background_fetch(app, monkeypatch):
    monkeypatch.setattr(appmod.csrf, "protect", lambda **kw: None)
    monkeypatch.setattr(appmod.limiter, "enabled", False)
    started = []
    monkeypatch.setattr(appmod, "_fetch_mqa_violation_summary", lambda: started.append(1))
    monkeypatch.setattr(appmod.threading, "Thread", _SyncThread)
    plain = _admin_client(app, is_admin=False)
    assert plain.post("/api/quality/mqa/violations/refresh").status_code == 403 and not started
    assert plain.get("/api/quality/mqa/comparison").get_json()["can_refresh"] is False
    admin = _admin_client(app)
    assert admin.post("/api/quality/mqa/violations/refresh").get_json() == {"started": True}
    assert started == [1]
    appmod._mqa_viol_set(running=True, started_at=appmod.time.time())
    assert admin.post("/api/quality/mqa/violations/refresh").get_json() == {"started": False, "already_running": True}


# ── a slow/failing page must not throw away everything already fetched ─────────

def test_a_page_that_never_arrives_is_skipped_and_the_result_is_marked_partial(app, monkeypatch):
    """Found against the real API: deep pages are slow and one timed out after 140k of 158k rows were
    already fetched -- the whole pull was discarded."""
    monkeypatch.setattr(appmod, "_MQA_VIOLATIONS_PAGE", 2)
    monkeypatch.setattr(appmod.time, "sleep", lambda s: None)
    pages = {0: [_row(FORMAT, "d1"), _row(FORMAT, "d2")], 4: [_row(BYTESIZE, "d3")]}
    tried = []

    def fake_get(url, params=None, **kw):
        tried.append(params["offset"])
        if params["offset"] == 2:
            raise RuntimeError("read timed out")
        return _Resp({"success": True, "result": {"count": 5, "results": pages[params["offset"]]}})

    monkeypatch.setattr(appmod.requests, "get", fake_get)
    assert appmod._fetch_mqa_violation_summary() is True
    assert tried.count(2) == appmod._MQA_VIOLATIONS_ATTEMPTS and 4 in tried
    data = MqaViolationSummary.query.one().data()
    assert (data["rows_seen"], data["total"], data["complete"], data["skipped_pages"]) == (3, 5, False, 1)
    assert appmod._mqa_viol_get()["error"] is None
    eu = _admin_client(app).get("/api/quality/mqa/comparison").get_json()["eu"]
    assert eu["complete"] is False and eu["rows_seen"] == 3


def test_a_complete_pull_is_marked_complete(app, monkeypatch):
    monkeypatch.setattr(appmod.requests, "get", lambda *a, **k: _Resp(
        {"success": True, "result": {"count": 1, "results": [_row(FORMAT, "d1")]}}))
    appmod._fetch_mqa_violation_summary()
    data = MqaViolationSummary.query.one().data()
    assert data["complete"] is True and data["rows_seen"] == 1 and data["skipped_pages"] == 0


# ── progress the page can show ────────────────────────────────────────────────────

def test_the_total_is_known_before_the_first_big_page_arrives(app, monkeypatch):
    """The page used to say "0 / 0" until the first 5000-row page landed, which looked like a hang."""
    monkeypatch.setattr(appmod, "_MQA_VIOLATIONS_PAGE", 2)
    seen_totals = []

    def fake_get(url, params=None, **kw):
        if params["limit"] != 1:
            seen_totals.append(appmod._mqa_viol_get()["total"])  # what the page would show while this page loads
        return _Resp({"success": True, "result": {"count": 3, "results": [_row(FORMAT, "d1")]}})

    monkeypatch.setattr(appmod.requests, "get", fake_get)
    appmod._fetch_mqa_violation_summary()
    assert seen_totals and set(seen_totals) == {3}


def test_a_slow_or_failing_request_shows_up_in_the_status_while_it_is_retried(app, monkeypatch):
    monkeypatch.setattr(appmod, "_MQA_VIOLATIONS_PAGE", 2)
    monkeypatch.setattr(appmod.time, "sleep", lambda s: None)
    snapshots, state = [], {"page_tries": 0}

    def fake_get(url, params=None, **kw):
        if params["limit"] == 1:
            return _Resp({"success": True, "result": {"count": 1, "results": [_row(FORMAT, "d1")]}})
        state["page_tries"] += 1
        if state["page_tries"] == 1:
            raise RuntimeError("Read timed out")
        snapshots.append(appmod._mqa_viol_get())  # during the successful retry
        return _Resp({"success": True, "result": {"count": 1, "results": [_row(FORMAT, "d1")]}})

    monkeypatch.setattr(appmod.requests, "get", fake_get)
    appmod._fetch_mqa_violation_summary()
    assert snapshots[0]["attempt"] == 2  # the page shows which attempt this is
    assert appmod._mqa_viol_get()["retrying"] is None  # and the warning is gone once it works


def test_the_status_the_page_polls_carries_elapsed_time(app):
    appmod._mqa_viol_set(running=True, started_at=appmod.time.time() - 125, fetched=5000, total=158700)
    st = _admin_client(app).get("/api/quality/mqa/comparison").get_json()["status"]
    assert st["running"] is True and 124 <= st["elapsed"] <= 130 and st["total"] == 158700
    appmod._mqa_viol_set(running=False)
    assert _admin_client(app, is_admin=False).get("/api/quality/mqa/comparison").get_json()["status"]["elapsed"] == 0
