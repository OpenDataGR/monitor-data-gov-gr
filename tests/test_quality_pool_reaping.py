"""A finished quality-check run must not leave its spawn workers behind.

On the VM (2026-11-04) the worker unit held 15 idle `multiprocessing.spawn` children (0 CPU seconds, ~110 MB each,
the oldest 20 h old) whose runs had long ended: ~1.6 GB of anonymous memory, the unexplained ~1.5 GB/day growth.
The run only called shutdown(wait=False), which leaves the exit to the pool's own manager thread. These tests pin
that the run reaps the workers itself, even when the pool never gets them to exit."""
import time
from concurrent.futures import ThreadPoolExecutor

import app as appmod
from models import DcatApDatasetCheckCache


class FakeProc:
    """Stands in for a spawn worker that ignores the pool's shutdown: alive until terminate()/kill()."""

    def __init__(self, ignores_terminate=False):
        self.alive = True
        self.terminated = self.killed = False
        self.ignores_terminate = ignores_terminate

    def join(self, timeout=None):
        time.sleep(min(timeout or 0, 0.01))

    def is_alive(self):
        return self.alive

    def terminate(self):
        self.terminated = True
        self.alive = self.ignores_terminate

    def kill(self):
        self.killed = True
        self.alive = False


def _wait(pred, seconds=3.0):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if pred():
            return True
        time.sleep(0.01)
    return pred()


def test_a_worker_that_outlives_the_grace_period_is_terminated():
    stuck = FakeProc()
    t = appmod._reap_pool_processes([stuck], grace=0.05)
    t.join(5)
    assert stuck.terminated and not stuck.alive


def test_a_worker_that_ignores_terminate_is_killed():
    stubborn = FakeProc(ignores_terminate=True)
    t = appmod._reap_pool_processes([stubborn], grace=0.05)
    t.join(5)
    assert stubborn.terminated and stubborn.killed and not stubborn.alive


def test_nothing_to_reap_starts_nothing():
    assert appmod._reap_pool_processes([]) is None


def test_a_run_reaps_workers_its_pool_failed_to_stop(app, monkeypatch):
    stuck = [FakeProc(), FakeProc()]

    class StuckPool(ThreadPoolExecutor):
        """Runs the work inline, but -- like the VM's pools -- never gets its processes to exit on shutdown."""
        _processes = {i: p for i, p in enumerate(stuck)}

        def __init__(self, max_workers, mp_context):
            super().__init__(1)

    monkeypatch.setitem(appmod._QUALITY_CHECKS["dcat"], "list_datasets", lambda: [
        {"name": "ds1", "metadata_modified": "2026-01-01T00:00:00", "org_title": "Org", "org_slug": "org"}])
    monkeypatch.setitem(appmod._QUALITY_CHECKS["dcat"], "check_one", lambda name: {
        "name": name, "title": name, "conforms": True, "violation_count": 0, "warning_count": 0,
        "vocabulary_issue": False, "structural_issue": False, "details": []})
    monkeypatch.setattr(appmod, "ProcessPoolExecutor", StuckPool)
    monkeypatch.setattr(appmod, "_POOL_REAP_GRACE", 0.05)

    appmod._do_run_check("dcat")

    assert appmod._get_check_status("dcat")["error"] is None
    assert DcatApDatasetCheckCache.query.count() == 1
    assert _wait(lambda: all(p.terminated and not p.alive for p in stuck))


def test_a_small_run_does_not_spawn_a_full_pool():
    """40 changed datasets used to start 5 workers, each re-importing the whole app; one worker per 15 datasets is plenty."""
    assert appmod._pool_workers(5, 0) == 1
    assert appmod._pool_workers(5, 1) == 1
    assert appmod._pool_workers(5, 15) == 1
    assert appmod._pool_workers(5, 16) == 2
    assert appmod._pool_workers(5, 40) == 3
    assert appmod._pool_workers(5, 75) == 5
    assert appmod._pool_workers(5, 2186) == 5   # a big run keeps the configured concurrency


class SentinelProc(FakeProc):
    """A worker with a real sentinel. `exited` closes its write end, which is exactly what makes a real process's sentinel readable."""

    def __init__(self, exited, lies_alive=False):
        super().__init__()
        import multiprocessing
        self._r, self._w = multiprocessing.Pipe(duplex=False)
        self.sentinel = self._r
        self.lies_alive = lies_alive
        if exited:
            self._w.close()

    def is_alive(self):
        return True if self.lies_alive else self.alive

    def terminate(self):
        super().terminate()
        self._w.close()   # a terminated process's sentinel becomes readable

    def kill(self):
        super().kill()
        if not self._w.closed:
            self._w.close()


def test_a_worker_that_exited_is_not_a_straggler_even_when_is_alive_says_it_is(caplog):
    """The VM, 2026-11-13: workers that had EXITED CLEANLY were reported as 'outlived their run' on every run, because join()/is_alive()
    poll waitpid while the pool's manager thread blocks in waitpid on the same child -- one wins, the other gets ECHILD and
    multiprocessing reads that as 'still running' (`alive=True exitcode=0` in one log line). The sentinel does not race."""
    gone = SentinelProc(exited=True, lies_alive=True)
    with caplog.at_level("WARNING"):
        t = appmod._reap_pool_processes([gone], grace=0.2)
        t.join(5)
    assert not gone.terminated and not gone.killed
    assert "outlived" not in caplog.text and "straggler" not in caplog.text


def test_a_worker_whose_sentinel_never_fires_is_still_terminated(caplog):
    stuck = SentinelProc(exited=False)
    with caplog.at_level("WARNING"):
        t = appmod._reap_pool_processes([stuck], grace=0.1)
        t.join(10)
    assert stuck.terminated
    assert "outlived their run" in caplog.text


def test_worker_exited_works_on_real_spawned_processes():
    """The fakes above stand in for a process; this is the real thing (a spawn process, as the quality-check pools use)."""
    import multiprocessing
    import time as _time
    ctx = multiprocessing.get_context("spawn")
    quick, slow = ctx.Process(target=_time.sleep, args=(0.2,)), ctx.Process(target=_time.sleep, args=(60,))
    quick.start()
    slow.start()
    try:
        assert appmod._worker_exited(quick, 20) is True       # exits by itself: seen at once, not after the timeout
        assert appmod._worker_exited(slow, 0.3) is False      # still running: a genuine straggler
        slow.terminate()
        assert appmod._worker_exited(slow, 20) is True        # once terminated, its sentinel fires
    finally:
        for p in (quick, slow):
            if p.is_alive():
                p.kill()
            p.join(5)


def test_a_straggler_is_always_logged_even_when_it_cannot_be_inspected(caplog):
    """2026-11-12: the diagnostic was deployed and the reaper killed two workers, yet the journal had NOT ONE straggler line --
    it swallowed its errors, so a stuck worker could not be told from one that exited a moment earlier."""
    class Gone(FakeProc):
        pid = 2_000_000_000   # no such process (and not Linux's /proc on a dev machine)

    stuck = Gone()
    with caplog.at_level("WARNING"):
        t = appmod._reap_pool_processes([stuck], grace=0.05)
        t.join(5)
    text = caplog.text
    assert "straggler pid 2000000000 alive=" in text           # what we know about it
    assert "/proc not readable" in text or "state=" in text    # why there is no OS state, or the state itself
    assert "exitcode after terminate" in text                  # how it ended (0 = left by itself just late)
    assert "outlived their run" in text


def test_asking_a_vanished_or_unreachable_worker_where_it_is_never_raises():
    class Gone(FakeProc):
        pid = 2_000_000_000   # no such process (and not Linux's /proc on a dev machine)

    stuck = Gone()
    appmod._ask_worker_where_it_is(stuck)
    t = appmod._reap_pool_processes([stuck], grace=0.05)
    t.join(5)
    assert stuck.terminated and not stuck.alive
