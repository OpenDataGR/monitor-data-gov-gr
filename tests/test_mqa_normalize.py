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
