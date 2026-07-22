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

## Redis (rate-limit storage + shared caches)

Redis backs two independent things in production, both optional and both
falling back to a per-process/in-memory equivalent if unset -- neither
needs Redis for local dev:

- **Flask-Limiter** (`RATELIMIT_STORAGE_URI`): rate limits (login attempts,
  password reset requests, etc.) are shared across all 4 gunicorn worker
  processes instead of counted independently per process -- see the
  `RATELIMIT_STORAGE_URI` comment in `config.py`.
- **`_SharedCache`** (`REDIS_URL`, app.py): backs `_orgs_cache`,
  `_dataset_growth_cache`, `_geo_datasets_cache`, and `_HRMS_CACHE`. These
  used to be plain per-process dicts, warmed from the DB once at each
  process's own startup -- fine for the one process that actually refreshes
  a given cache, stale forever for the other 3 that don't. Backing them with
  Redis means all 4 web workers (and background_worker.py) read and write
  the same shared value, so a refresh from any one process is immediately
  visible to the others instead of only to itself.

Not captured in a repo file since it's just a package install + env vars,
not a config file to copy:

```bash
sudo apt install redis-server
sudo systemctl enable --now redis-server
redis-cli ping   # expect PONG
```

Then add to `.env`:

```
RATELIMIT_STORAGE_URI=redis://localhost:6379
REDIS_URL=redis://localhost:6379
```

(Same Redis instance, two env vars -- `RATELIMIT_STORAGE_URI` has to be in
the specific URI form flask-limiter/the `limits` library expect;
`_SharedCache` just needs a plain connection string. Not worth merging into
one variable for the sake of it.)

Bound to localhost only by default (Ubuntu's redis-server package ships this
way) — fine here since the app connects over loopback and nothing else on
the box needs Redis. If that ever changes, it needs a `requirepass` and a
non-default bind address before being reachable from anywhere else.

Omitting either env var falls back cleanly: Flask-Limiter to its own
in-memory store, `_SharedCache` to a plain per-process dict -- both are what
local dev uses, no Redis required there.

One known tradeoff worth knowing: each cache's `enriching` flag (used to
avoid kicking off a duplicate refresh while one's already in flight) is now
shared too. If a process crashes mid-refresh without clearing it, the flag
stays stuck `True` in Redis across restarts -- unlike the old per-process
version, which self-healed on that process's next restart. Low-severity
(worst case: refreshes just stop happening until someone flips it back),
but not nothing. `redis-cli hset cache:<name> enriching false` clears it by
hand if it's ever suspected to be stuck.
