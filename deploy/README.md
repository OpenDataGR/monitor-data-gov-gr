# Production VM setup notes

Files here are copies of what's actually installed on the production VM —
kept in the repo so a rebuild doesn't have to reverse-engineer them, and so
changes made directly on the VM get backfilled here instead of silently
drifting from what's documented.

- `monitor-data-gov-gr.service` -> `/etc/systemd/system/monitor-data-gov-gr.service`
- `nginx-monitor.conf` -> `/etc/nginx/sites-enabled/monitor`

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
