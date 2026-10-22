"""data.europa.eu's MQA API (metricsVersion 2.x) dropped the per-dimension scores the
page used to render -- the page showed "NaN / 0". _normalize_mqa reshapes the v2
response (overall score + per-metric coverage) into what the page can show."""
import json

import app as appmod
from models import MqaCache, db

V2 = {
    "info": {"id": "data-gov-gr"},
    "score": {"date": "2026-10-18", "max": 7.5, "value": 5.85},
    "counts": {"date": "2026-10-18", "value": {"datasets": 10, "distributions": 20, "dataServices": 2}},
    "coverage": {"date": "2026-10-18", "value": {
        "dataset": [
            {"metric": "a", "dimension": "findability", "weight": 1.0, "evaluated": 10, "coverage": 100.0},
            {"metric": "b", "dimension": "findability", "weight": 0.5, "evaluated": 10, "coverage": 0.0},
            {"metric": "c", "dimension": "reusability", "weight": 0.5, "evaluated": 10, "coverage": 50.0},
        ],
        "distribution": [
            {"metric": "d", "dimension": "findability", "weight": 0.5, "evaluated": 20, "coverage": 100.0},
            {"metric": "e", "dimension": "accessibility", "weight": 1.0, "evaluated": 0, "coverage": None},  # nothing evaluated
        ],
        "dataService": [],
    }},
}


def test_v2_is_reshaped_into_overall_score_and_weighted_dimension_coverage():
    out = appmod._normalize_mqa(V2)
    assert out["score"] == 5.85 and out["max_score"] == 7.5 and out["date"] == "2026-10-18"
    assert out["counts"] == {"datasets": 10, "distributions": 20, "dataServices": 2}
    f = out["dimensions"]["findability"]
    assert (f["points"], f["max"], f["metrics"]) == (1.5, 2.0, 3) and f["percentage"] == 75
    assert out["dimensions"]["reusability"]["percentage"] == 50
    assert "accessibility" not in out["dimensions"]  # a metric with nothing evaluated says nothing


def test_normalizing_twice_changes_nothing():
    once = appmod._normalize_mqa(V2)
    assert appmod._normalize_mqa(once) == once


def test_a_raw_v2_row_already_in_the_cache_is_repaired_on_read(app):
    db.session.add(MqaCache(id=1, data_json=json.dumps({"data": V2, "fetched_at": "2026-10-22T08:39:00+00:00"})))
    db.session.commit()
    cached = appmod._load_mqa_cache()
    assert cached["data"]["dimensions"]["findability"]["percentage"] == 75


# ── history ────────────────────────────────────────────────────────────────────

def _admin_client(app):
    from models import User
    u = User(email="a@example.gr", is_admin=True, is_superadmin=True)
    db.session.add(u)
    db.session.commit()
    c = app.test_client()
    with c.session_transaction() as s:
        s.update({"user_id": u.id, "is_admin": True, "is_superadmin": True, "allowed_tabs": None, "org_scope": None})
    return c


def test_a_snapshot_is_recorded_once_per_distinct_published_score(app):
    from models import MqaSnapshot
    data = appmod._normalize_mqa(V2)
    appmod._record_mqa_snapshot(data)
    appmod._record_mqa_snapshot(data)  # the daily re-fetch of the same published score
    assert MqaSnapshot.query.count() == 1
    newer = dict(data, score=5.7, date="2026-10-25")
    appmod._record_mqa_snapshot(newer)
    rows = MqaSnapshot.query.order_by(MqaSnapshot.id).all()
    assert [r.score_date for r in rows] == ["2026-10-18", "2026-10-25"]
    assert rows[1].to_dict()["percentage"] == 76.0 and rows[1].to_dict()["counts"]["datasets"] == 10


def test_history_route_seeds_itself_from_the_cached_score(app):
    db.session.add(MqaCache(id=1, data_json=json.dumps({"data": V2, "fetched_at": "2026-10-22T08:39:00+00:00"})))
    db.session.commit()
    c = _admin_client(app)
    hist = c.get("/api/quality/mqa/history").get_json()["history"]
    assert len(hist) == 1 and hist[0]["score"] == 5.85 and hist[0]["dimensions"]["findability"]["percentage"] == 75
    assert len(c.get("/api/quality/mqa/history").get_json()["history"]) == 1  # asking again doesn't add a row


def test_history_is_empty_when_nothing_was_ever_fetched(app):
    assert _admin_client(app).get("/api/quality/mqa/history").get_json() == {"history": []}
