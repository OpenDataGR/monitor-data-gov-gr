"""A quality-check run that dies part-way must not lose the datasets it already validated.

A full DCAT-AP run is hours long over ~23k datasets and the worker can die under it (a deploy, a reboot, the
unit's MemoryMax). Results used to be written to the per-dataset cache only once, at the very end, so every such
death threw the whole run away -- even though the next run already skips any dataset whose cached result has the
current check version and an unchanged metadata_modified. These tests pin that results are persisted as the run
goes, and that the follow-up run only validates what is left."""
from concurrent.futures import ThreadPoolExecutor

import pytest

import app as appmod
from models import DcatApDatasetCheckCache

MTIME = "2026-01-01T00:00:00"
NAMES = [f"ds{i}" for i in range(1, 7)]


def _result(name):
    return {"name": name, "title": name, "conforms": False, "violation_count": 1, "warning_count": 0,
            "vocabulary_issue": False, "structural_issue": True, "details": []}


@pytest.fixture
def run_env(app, monkeypatch):
    """Datasets listed from a fake portal, validated inline on ONE thread (so completion order is the
    submission order) instead of in spawned processes; checkpoint after every 2 results."""
    calls = []
    behaviour = {"die_on": None}

    def check_one(name):
        calls.append(name)
        if name == behaviour["die_on"]:
            raise KeyboardInterrupt("worker killed")  # BaseException: not swallowed per-dataset, ends the run
        return _result(name)

    monkeypatch.setitem(appmod._QUALITY_CHECKS["dcat"], "list_datasets", lambda: [
        {"name": n, "metadata_modified": MTIME, "org_title": "Org", "org_slug": "org"} for n in NAMES])
    monkeypatch.setitem(appmod._QUALITY_CHECKS["dcat"], "check_one", check_one)
    monkeypatch.setattr(appmod, "ProcessPoolExecutor", lambda max_workers, mp_context: ThreadPoolExecutor(1))
    monkeypatch.setattr(appmod, "_CHECK_CHECKPOINT_EVERY", 2)
    return calls, behaviour


def _cached_names():
    return sorted(r.name for r in DcatApDatasetCheckCache.query.all())


def test_a_run_killed_part_way_keeps_the_datasets_it_already_checked(run_env):
    calls, behaviour = run_env
    behaviour["die_on"] = "ds6"

    with pytest.raises(KeyboardInterrupt):
        appmod._do_run_check("dcat")

    assert calls == NAMES
    # ds1..ds4 were flushed in two checkpoints of 2; ds5 was still waiting for the next one when ds6 killed the run.
    assert _cached_names() == ["ds1", "ds2", "ds3", "ds4"]


def test_the_next_run_only_validates_what_the_killed_run_did_not_finish(run_env):
    calls, behaviour = run_env
    behaviour["die_on"] = "ds6"
    with pytest.raises(KeyboardInterrupt):
        appmod._do_run_check("dcat")

    calls.clear()
    behaviour["die_on"] = None
    appmod._do_run_check("dcat")

    assert sorted(calls) == ["ds5", "ds6"]  # ds1..ds4 came back from the cache
    status = appmod._get_check_status("dcat")
    assert status["error"] is None, status["error"]
    result = appmod._load_check_result("dcat")
    assert result["summary"]["checked"] == 6 and result["summary"]["reused_from_cache"] == 4
    assert _cached_names() == NAMES


def test_an_uninterrupted_run_still_caches_everything_including_the_remainder(run_env):
    """6 results with a checkpoint every 2 would leave nothing over; 5 leaves one for the end-of-run flush."""
    calls, _ = run_env
    appmod._QUALITY_CHECKS["dcat"]["list_datasets"] = lambda: [
        {"name": n, "metadata_modified": MTIME, "org_title": "Org", "org_slug": "org"} for n in NAMES[:5]]

    appmod._do_run_check("dcat")

    assert _cached_names() == NAMES[:5]
    assert appmod._get_check_status("dcat")["error"] is None
