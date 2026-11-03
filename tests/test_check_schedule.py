"""The nightly HVD / DCAT-AP / GeoDCAT-AP checks must be due 24 h after they last FINISHED, not 24 h after the worker process
started: counting from process start meant every deploy pushed them back another day (on 2026-11-02 there were a dozen
deploys), so with a deploy a day they would never run. These tests pin where the loop's clocks start."""
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

import app as appmod
from models import DcatApCheckCache, HvdCheckCache, db


def _utc_naive(hours_ago):
    return (datetime.now(timezone.utc) - timedelta(hours=hours_ago)).replace(tzinfo=None)


def test_a_check_that_never_finished_is_due_immediately(app):
    assert appmod._check_last_finished_epoch("dcat") == 0.0
    assert time.time() - appmod._check_last_finished_epoch("dcat") >= appmod._DCAT_CHECK_REFRESH_INTERVAL


def test_the_clock_starts_from_when_the_stored_result_was_written(app):
    db.session.add(DcatApCheckCache(id=1, data_json="{}", fetched_at=_utc_naive(3)))
    db.session.commit()
    epoch = appmod._check_last_finished_epoch("dcat")
    assert abs((time.time() - epoch) - 3 * 3600) < 10
    assert time.time() - epoch < appmod._DCAT_CHECK_REFRESH_INTERVAL        # finished 3 h ago: not due after a restart


def test_a_check_that_finished_over_a_day_ago_is_due_straight_after_a_restart(app):
    db.session.add(HvdCheckCache(id=1, data_json="{}", fetched_at=_utc_naive(30)))
    db.session.commit()
    assert time.time() - appmod._check_last_finished_epoch("hvd") >= appmod._HVD_CHECK_REFRESH_INTERVAL


def test_each_check_has_its_own_clock(app):
    db.session.add(DcatApCheckCache(id=1, data_json="{}", fetched_at=_utc_naive(1)))
    db.session.commit()
    assert appmod._check_last_finished_epoch("dcat") > appmod._check_last_finished_epoch("geodcat")


def test_the_background_loop_starts_the_three_clocks_from_the_stored_results():
    """The loop is an endless thread, so this guards the source: no clock for these checks starts at process start."""
    src = (Path(__file__).parent.parent / "app.py").read_text(encoding="utf-8")
    loop = src[src.index("def _background_loop():"):src.index("def _background_loop():") + 6000]
    for kind in ("hvd", "dcat", "geodcat"):
        assert f'last_{kind}_check_refresh' in loop and f'_check_last_finished_epoch("{kind}")' in loop
    assert "last_dcat_check_refresh     = time.time()" not in loop
    assert "last_hvd_check_refresh      = time.time()" not in loop
    assert "last_geodcat_check_refresh  = time.time()" not in loop
