"""Does a spawn ProcessPoolExecutor leave workers behind after shutdown(wait=False, cancel_futures=True) on THIS machine?

The quality-check runs shut their pool down that way, and on the VM 1-3 of a pool's 5 workers were still alive a minute
after the run ("outlived their run" in the worker's journal, every day since 2026-11-04) while the same pattern left none
on the dev machine. This reproduces the pattern with trivial tasks and no network, no database, no app import -- it only
starts and stops local processes -- so it is safe to run anywhere:

    venv/bin/python tools/pool_probe.py

For each scenario it prints how many workers are still alive 0, 5, 10, 20 and 40 s after the run. All zeros = the
pattern is fine on this Python and the stragglers come from something the real tasks do; stragglers here = a Python /
platform behaviour, and the run should wait for its pool instead of trusting shutdown(wait=False)."""
import multiprocessing
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed

BOOT_SECONDS = 4   # stands in for a spawned worker re-importing the app


if multiprocessing.current_process().name != "MainProcess":
    time.sleep(BOOT_SECONDS)


def work(i):
    time.sleep(0.05)
    return i


def scenario(name, ntasks, workers, cancel_after=None, wait=False):
    pool = ProcessPoolExecutor(max_workers=workers, mp_context=multiprocessing.get_context("spawn"))
    try:
        futures = [pool.submit(work, i) for i in range(ntasks)]
        for n, fut in enumerate(as_completed(futures), 1):
            fut.result()
            if cancel_after and n >= cancel_after:
                break
    finally:
        pool.shutdown(wait=wait, cancel_futures=True)
    del pool
    t0 = time.time()
    seen = []
    for mark in (0, 5, 10, 20, 40):
        time.sleep(max(0, mark - (time.time() - t0)))
        seen.append(f"+{mark}s: {len(multiprocessing.active_children())}")
    print(f"{name:34s} " + "   ".join(seen), flush=True)
    for p in multiprocessing.active_children():
        p.kill()


if __name__ == "__main__":
    print(f"python {sys.version.split()[0]} on {sys.platform}; workers alive after the run:")
    scenario("40 tasks, 5 workers", 40, 5)
    scenario("3000 tasks, cancelled after 10", 3000, 5, cancel_after=10)
    scenario("40 tasks, 5 workers, wait=True", 40, 5, wait=True)
