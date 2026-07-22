# data.gov.gr Monitor

An internal dashboard for monitoring and managing the Greek open data portal ([data.gov.gr](https://data.gov.gr)) — uptime/health checks, dataset and organization statistics, traffic analytics, stakeholder communications tracking, and automated HVD (EU High-Value Dataset) compliance checking.

Live at `https://monitor.data.gov.gr/`.

## Features

- **Health monitoring** — periodic checks against key portal endpoints (homepage, CKAN API, dataset listing, organizations), with response-time history.
- **Dataset & organization statistics** — dataset counts over time, per-organization breakdowns, geospatial and temporal insights.
- **Traffic analytics** — pulled from a Matomo instance (top pages, top API calls, top downloads).
- **HVD compliance checking** — validates every dataset tagged as an EU High-Value Dataset against the official DCAT-AP-HVD SHACL shapes (Regulation (EU) 2023/138), not just its `hvd_category` tag. Runs incrementally (only re-checks datasets that actually changed), reports human-readable findings, and exports to Excel.
- **Communications tracking** — a CRM-style log of outreach to data-providing organizations, with case/follow-up tracking and Excel export.
- **Contacts directory** — a live view of registered portal accounts, exportable and searchable.
- **User management** — admin-invited accounts, per-user tab restrictions, password reset via email.

## Tech stack

- **Backend**: Flask 3, SQLAlchemy (SQLite for local dev, PostgreSQL in production), gunicorn
- **Frontend**: server-rendered Jinja2 templates + vanilla JS (no build step, no framework)
- **RDF/SHACL validation**: `rdflib` + `pyshacl`, against the vendored [DCAT-AP-HVD shapes](https://github.com/SEMICeu/DCAT-AP) (`shacl/dcat-ap-hvd.shapes.ttl`)
- **Email**: SendGrid (via SMTP)
- **Excel export**: `openpyxl`
- **Rate limiting**: Flask-Limiter, backed by Redis in production (`RATELIMIT_STORAGE_URI`) so limits are shared across gunicorn worker processes instead of counted per-process; falls back to in-memory if unset, which is fine for local dev

## Project layout

```
app.py                          Main Flask application (routes, background jobs, business logic)
config.py                       Environment-based configuration
models.py                       SQLAlchemy models
create_admin.py                 CLI script to bootstrap the first admin user
migrate_sqlite_to_postgres.py   One-off SQLite -> PostgreSQL migration script
seed_comms.py                   Seeds demo data for the Communications tab
requirements.txt
shacl/dcat-ap-hvd.shapes.ttl     Official DCAT-AP-HVD SHACL shapes, used for HVD compliance checks
static/                         CSS/JS assets (no bundler)
templates/                      Jinja2 templates
instance/                       Local SQLite DB (gitignored, created automatically)
.github/workflows/deploy.yml    CI/CD to the production VM
```

## Getting started (local development)

### Prerequisites

- Python 3.11+

### Setup

```bash
git clone https://github.com/OpenDataGR/monitor-data-gov-gr.git
cd monitor-data-gov-gr

python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

pip install -r requirements.txt
```

Create a `.env` file in the project root (see [Configuration](#configuration--environment-variables) below for what to put in it — everything is optional for a basic local run).

Run the app:

```bash
python app.py
```

This starts the Flask dev server on `http://127.0.0.1:5000`. A local SQLite database is created automatically at `instance/dashboard.db` on first run.

### Creating the first admin user

There's no sign-up flow — every account after the first is created by an existing admin, from inside the app's "Manage Users" panel. To bootstrap the very first admin:

```bash
python create_admin.py you@example.gov.gr "Your Name"
```

This prints a one-time set-password link (valid 24h) — open it even if the email doesn't send (e.g. SendGrid isn't configured yet).

## Configuration / environment variables

All configuration is read from environment variables (loaded from a `.env` file in the project root via `python-dotenv`, or from the real environment in production). Nothing here is committed to the repo — `.env` is gitignored.

Everything below is **optional** unless marked otherwise — sensible defaults exist for local development, but **`FLASK_SECRET_KEY` must be set to a real secret before deploying anywhere reachable**, since the app falls back to an insecure hardcoded key otherwise.

| Variable | Purpose | Default if unset |
|---|---|---|
| `FLASK_SECRET_KEY` | Signs session cookies. **Required in production** — generate one with `python -c "import secrets; print(secrets.token_hex(32))"`. | `insecure-dev-secret-key-change-me` (⚠️ not safe outside local dev) |
| `DATABASE_URL` | Database connection string. Accepts a `postgresql://...` URL for production, or leave unset for local SQLite. | Local SQLite at `instance/dashboard.db` |
| `DATAGOVGR_TOKEN` | API token for authenticated calls to the data.gov.gr CKAN API. Most read endpoints work fine without one. | `""` (unauthenticated) |
| `MATOMO_TOKEN` | Auth token for the Matomo analytics API that powers the Traffic tab. Without it, the Traffic tab has no data. | `""` |
| `PUBLIC_BASE_URL` | Base URL used to build absolute links (invite/password-reset emails) in contexts with no incoming HTTP request, e.g. `create_admin.py`. | `https://monitor.data.gov.gr` |
| `SMTP_SERVER` | SMTP host used to send invite/password-reset emails. | `smtp.sendgrid.net` |
| `SMTP_PORT` | SMTP port. | `587` |
| `SMTP_USERNAME` | SMTP auth username. For SendGrid, this is literally the string `apikey`. | `""` (email sending disabled) |
| `SMTP_PASSWORD` | SMTP auth password / **your SendGrid API key**. | `""` (email sending disabled) |
| `SENDGRID_FROM_EMAIL` | "From" address on outgoing emails. Must be a verified sender in SendGrid. | `""` |
| `SENDGRID_FROM_NAME` | "From" display name on outgoing emails. | `data.gov.gr Monitor` |
| `EMAIL_INBOUND_SECRET` | Secret path segment gating the SendGrid Inbound Parse webhook (`/api/email-sync/inbound-webhook/<secret>`). SendGrid can't sign these POSTs itself, so this is the only auth on that endpoint — generate one the same way as `FLASK_SECRET_KEY` and set SendGrid's Inbound Parse destination URL to include it. | `""` (endpoint unreachable) |

### Getting the API keys

- **`DATAGOVGR_TOKEN`** — generate from your account on [data.gov.gr](https://data.gov.gr) (Settings → API Tokens). Only needed for calls that require authentication; most of this dashboard's reads work without one.
- **`MATOMO_TOKEN`** — an API token from the Matomo instance the Traffic tab reads from (`matomo.open1.eu`, site ID `3`, configured in `config.py`). Ask whoever administers that Matomo instance for one, under *Administration → Personal → Security → Auth tokens*.
- **`SMTP_PASSWORD` (SendGrid)** — create an API key in the [SendGrid dashboard](https://app.sendgrid.com/settings/api_keys) with "Mail Send" permission. Use `apikey` (literally) as `SMTP_USERNAME` and the generated key as `SMTP_PASSWORD`. You'll also need a sender identity verified in SendGrid for `SENDGRID_FROM_EMAIL`.

Without `MATOMO_TOKEN` or the SendGrid variables, the app still runs — the Traffic tab just stays empty and emails silently aren't sent (the invite/reset link is still printed to the console / returned in the API response as a fallback).

### Example `.env`

```dotenv
FLASK_SECRET_KEY=replace-with-a-real-random-secret
DATABASE_URL=

DATAGOVGR_TOKEN=
MATOMO_TOKEN=

SMTP_SERVER=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USERNAME=apikey
SMTP_PASSWORD=
SENDGRID_FROM_EMAIL=
SENDGRID_FROM_NAME=data.gov.gr Monitor

PUBLIC_BASE_URL=http://127.0.0.1:5000
```

## Database migrations

The app auto-creates tables on startup (`db.create_all()`) and applies a small number of inline `ALTER TABLE` migrations for columns added after a table already existed — no separate migration tool (e.g. Alembic) is used.

To move from local SQLite to a production PostgreSQL database, run:

```bash
DATABASE_URL=postgresql://user:pass@host/dbname python migrate_sqlite_to_postgres.py
```

## Deployment

Deployment is automated via GitHub Actions (`.github/workflows/deploy.yml`) on every push to `main`:

1. A self-hosted runner on the production VM pulls the latest code and reinstalls dependencies.
2. Both the `gunicorn` process and the background-worker process are sent `SIGTERM` and given a few seconds to exit.
3. systemd (units: `monitor-data-gov-gr` and `monitor-data-gov-gr-worker`) restarts them; the workflow fails the deploy if either service isn't active afterwards.

In production, gunicorn runs threaded worker processes behind an nginx reverse proxy, and a separate `background_worker.py` process (own systemd unit, no HTTP) runs the health-check/HVD/DCAT-AP/GeoDCAT background loop instead of a gunicorn worker doing it — see [deploy/README.md](deploy/README.md) for why that's split out. The systemd units ([deploy/monitor-data-gov-gr.service](deploy/monitor-data-gov-gr.service), [deploy/monitor-data-gov-gr-worker.service](deploy/monitor-data-gov-gr-worker.service)) and nginx site config ([deploy/nginx-monitor.conf](deploy/nginx-monitor.conf)) are the actual files installed on the VM — kept here so a server rebuild doesn't have to reverse-engineer them, and so changes made directly on the VM get backfilled into version control instead of silently drifting from what's documented. Anything that needs to stay consistent across requests regardless of which worker handles them (e.g. the HVD check's live progress) is backed by the database rather than in-process memory.

## License

No license has been set for this repository yet — treat it as all-rights-reserved internal software unless/until one is added.
