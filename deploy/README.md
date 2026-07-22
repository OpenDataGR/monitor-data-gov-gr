# Production VM setup notes

Files here are copies of what's actually installed on the production VM —
kept in the repo so a rebuild doesn't have to reverse-engineer them, and so
changes made directly on the VM get backfilled here instead of silently
drifting from what's documented.

- `monitor-data-gov-gr.service` -> `/etc/systemd/system/monitor-data-gov-gr.service` (gunicorn, serves HTTP)
- `monitor-data-gov-gr-worker.service` -> `/etc/systemd/system/monitor-data-gov-gr-worker.service` (background_worker.py, no HTTP)
- `nginx-monitor.conf` -> `/etc/nginx/sites-enabled/monitor`

## Two processes, not one

`app.py` is shared by both services, but only one of them actually runs the
health-check/HVD/DCAT-AP/GeoDCAT background loop: whichever has
`BACKGROUND_WORKER=1` set (`config.BACKGROUND_WORKER` in the code). This is
deliberate -- those crawls do real CPU-bound RDF/SHACL work and a full
DCAT-AP run can take hours, so running them inside one of the 4 gunicorn
workers would have them compete for that worker's GIL with whatever live
requests happen to land on it. `monitor-data-gov-gr-worker.service` runs
`background_worker.py` instead, a process that imports `app.py` for its
models/config/background-loop code but never binds a port or serves HTTP.

Practical effect: if you're checking why a scheduled check hasn't run, look
at `journalctl -u monitor-data-gov-gr-worker`, not the main web service's log
-- the web service's 4 workers no longer run that loop at all.

To confirm the split is actually holding (only the worker process owns the
loop, no gunicorn worker is also racing for it), check who holds the file
lock behind it:

```bash
sudo lslocks | grep background_loop
```

Should show exactly one entry, `FLOCK WRITE`, held by `background_worker.py`'s
PID -- never one of gunicorn's.

## Redis (rate-limit storage)

Flask-Limiter is backed by Redis in production so rate limits (login
attempts, password reset requests, etc.) are shared across all 4 gunicorn
worker processes instead of counted independently per process — see the
`RATELIMIT_STORAGE_URI` comment in `config.py`. Not captured in a repo file
since it's just a package install + one env var, not a config file to copy:

```bash
sudo apt install redis-server
sudo systemctl enable --now redis-server
redis-cli ping   # expect PONG
```

Then add to `.env`:

```
RATELIMIT_STORAGE_URI=redis://localhost:6379
```

Bound to localhost only by default (Ubuntu's redis-server package ships this
way) — fine here since the app connects over loopback and nothing else on
the box needs Redis. If that ever changes, it needs a `requirepass` and a
non-default bind address before being reachable from anywhere else.

Omitting `RATELIMIT_STORAGE_URI` falls back to Flask-Limiter's in-memory
store, which is what local dev uses and requires no Redis at all.
