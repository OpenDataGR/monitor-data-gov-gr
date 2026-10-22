"""A whole quality-check run, with the failure it must not hide. _do_run_check swallows any
exception into the check's `error` status, so a test that only looks at a side effect can pass
while the run actually crashed (that is how "Instance <...CheckCache> is not bound to a
Session" reached production: the org_slug backfill committed, then the run blew up reusing the
now-expired cached rows after the backfill's app context had closed)."""
import json
import threading

import pytest

import app as appmod
from models import db, DcatApDatasetCheckCache

NAME = "ds1"
MTIME = "2026-01-01T00:00:00"


def _cached_row(org_slug):
    result = {"name": NAME, "title": "T", "conforms": False, "violation_count": 2, "warning_count": 0,
              "vocabulary_issue": True, "structural_issue": False, "details": []}
    return DcatApDatasetCheckCache(
        name=NAME, metadata_modified=MTIME, org_slug=org_slug,
        result_json=json.dumps({"_cache_version": appmod._DCAT_CHECK_VERSION, "result": result}))


@pytest.fixture
def seeded(app, monkeypatch):
    db.session.add(_cached_row("stale-org"))
    db.session.commit()
    monkeypatch.setitem(appmod._QUALITY_CHECKS["dcat"], "list_datasets", lambda: [
        {"name": NAME, "metadata_modified": MTIME, "org_title": "New Org", "org_slug": "new-org"}])


def _assert_run_succeeded():
    status = appmod._get_check_status("dcat")
    assert status["error"] is None, status["error"]
    result = appmod._load_check_result("dcat")
    assert result and result["datasets"][0]["name"] == NAME
    assert result["datasets"][0]["org_slug"] == "new-org"  # the cached row was reused AND re-attributed


def test_a_run_that_reuses_a_cached_row_completes(seeded):
    appmod._do_run_check("dcat")
    _assert_run_succeeded()


def test_the_same_run_in_a_plain_thread_like_production(seeded):
    """Production runs it in a daemon thread with no surrounding app context."""
    t = threading.Thread(target=appmod._do_run_check, args=("dcat",))
    t.start()
    t.join(60)
    _assert_run_succeeded()
