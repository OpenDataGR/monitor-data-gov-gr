"""background_worker.py is the __main__ of the worker unit, and the quality-check pools spawn their workers from it.

multiprocessing's "spawn" start method re-runs the parent's main script as `__mp_main__` in every child before the
child takes a task. The entrypoint used to end in a bare `while True: signal.pause()`, so every spawned validation
worker slept there forever: all the nightly checks hung and left their workers behind (15 idle children, ~1.6 GB,
on the VM on 2026-11-04). The loop must only run when the file is the main program."""
import ast
import pathlib
import subprocess
import sys
import textwrap

ROOT = pathlib.Path(__file__).resolve().parent.parent


def test_the_entrypoint_keeps_no_blocking_loop_at_module_level():
    tree = ast.parse((ROOT / "background_worker.py").read_text(encoding="utf-8"))
    loops = [n for n in tree.body if isinstance(n, (ast.While, ast.For))]
    assert not loops, "a module-level loop runs in every spawned pool worker too; put it under `if __name__ == '__main__':`"
    guarded = [n for n in tree.body if isinstance(n, ast.If) and "__main__" in ast.dump(n.test)]
    assert guarded and any(isinstance(c, ast.While) for g in guarded for c in g.body)


def test_a_spawned_worker_gets_past_a_guarded_main_script(tmp_path):
    """The mechanism itself: with the guard, a spawn pool started from a main script that ends in a forever loop
    still completes its task. (Without the guard the same script times out: reproduced by hand on 2026-11-04.)"""
    script = tmp_path / "entry.py"
    script.write_text(textwrap.dedent("""
        import multiprocessing, threading, time, os
        from concurrent.futures import ProcessPoolExecutor

        def work(x):
            return x * 2

        def run():
            pool = ProcessPoolExecutor(1, mp_context=multiprocessing.get_context("spawn"))
            try:
                print("RESULT", pool.submit(work, 21).result(timeout=40), flush=True)
            except Exception as e:
                print("HUNG", type(e).__name__, flush=True)
            for p in multiprocessing.active_children():
                p.kill()
            os._exit(0)

        if multiprocessing.current_process().name == "MainProcess":
            threading.Thread(target=run, daemon=True).start()

        if __name__ == "__main__":
            while True:
                time.sleep(1)
    """), encoding="utf-8")
    log = tmp_path / "out.txt"
    with open(log, "w") as f:   # a file, not a pipe: a worker that outlives the script must not be able to hold the test open
        subprocess.run([sys.executable, "-I", str(script)], stdout=f, stderr=subprocess.STDOUT, timeout=90)
    assert "RESULT 42" in log.read_text(), log.read_text()
