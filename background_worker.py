"""Entrypoint for the dedicated background-worker process (see
deploy/monitor-data-gov-gr-worker.service). Never serves HTTP or binds a
port -- importing app triggers _background_loop's startup via the
BACKGROUND_WORKER env var gate (config.py / app.py), and that's the only
thing this process does. Split out from the gunicorn workers so the
hours-long, CPU-bound HVD/DCAT-AP/GeoDCAT crawls never compete for a
request-serving worker's GIL.
"""
import signal
import app  # noqa: F401  (import side effects start the background loop thread)

while True:
    signal.pause()
