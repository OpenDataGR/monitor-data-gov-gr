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

## Redis (rate-limit storage + shared caches + sessions)

Redis backs three independent things in production, all optional and all
falling back to a per-process/in-memory equivalent if unset -- none of them
need Redis for local dev:

- **Flask-Limiter** (`RATELIMIT_STORAGE_URI`): rate limits (login attempts,
  password reset requests, etc.) are shared across all 4 gunicorn worker
  processes instead of counted independently per process -- see the
  `RATELIMIT_STORAGE_URI` comment in `config.py`.
- **`_SharedCache`** (`REDIS_URL`, app.py): backs `_orgs_cache`,
  `_dataset_growth_cache`, `_geo_datasets_cache`, `_HRMS_CACHE`, and
  `_pm_cache` (the Contacts tab's Portal Members data, CKAN-derived). These
  used to be plain per-process dicts, warmed from the DB/CKAN once at each
  process's own startup -- fine for the one process that actually refreshes
  a given cache, stale (or independently, differently stale) forever for the
  other 3 that don't. Backing them with Redis means all 4 web workers (and
  background_worker.py) read and write the same shared value, so a refresh
  from any one process is immediately visible to the others instead of only
  to itself. See "`REDIS_URL` was never actually set" below for what it
  looks like when this env var is missing.
- **Flask-Session** (`REDIS_URL`, same var as `_SharedCache` above): server-
  side session storage -- see "403-until-cookie-clear" further down for why
  this exists. Only activates when `REDIS_URL` is set; falls back to
  Flask's default signed-cookie session otherwise (fine for local dev, not
  for production -- see that section).

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

### `REDIS_URL` was never actually set (found 2026-07-27)

**Symptom:** while building server-paginated infinite scroll for the
Contacts tab's Portal Members view (search/filter/sort/group-by all moved
from "fetch once per session, filter client-side" to "hit the server on
every change"), the numbers shown became wildly inconsistent between
requests that should have been identical: an org's member count in the
grouped view would read differently a few requests apart with no filter
change in between (777, then 657, then 459 for the same "no organization"
bucket), and a group's aggregate count would disagree with what its own
expand-fetch returned (count said 1, expanded rows showed 0, or in another
case, the "no organization" group's expand showed the *entire* member
list). None of this reproduced with a single-process Flask test client --
only in production.

**Root cause:** `.env` had `RATELIMIT_STORAGE_URI=redis://localhost:6379`
(so Flask-Limiter correctly shared rate-limit state across workers) but
**no `REDIS_URL` line at all**. `_SharedCache` (see above) silently falls
back to a plain per-process dict when `REDIS_URL` is unset -- no error, no
log line, it just quietly works "fine" as long as nothing depends on cross-
process consistency. That held for the caches it originally backed
(`_orgs_cache` etc., each refreshed by one process and read occasionally),
but `_pm_cache` (Portal Members) started being *read on every keystroke* in
this same round of work -- and each of the 4 gunicorn workers had spent
however long since its own last restart running an independent
`_do_fetch_portal_members()` against CKAN, each with its own chance of a
handful of `organization_show` calls timing out (see the retry-with-
backoff note in `_fetch_org_members`, app.py). Round-robin request routing
meant two requests seconds apart from the same browser session could land
on two different workers, each confidently returning its own, differently-
incomplete snapshot -- explaining both the flip-flopping counts and the
count-vs-rows disagreements, without any of it being a logic bug in the
pagination/dedup code itself.

**Fix:** add the missing line and restart both services so they pick it up:

```bash
echo "REDIS_URL=redis://localhost:6379" >> monitor-data-gov-gr/.env
sudo systemctl restart monitor-data-gov-gr.service monitor-data-gov-gr-worker.service
```

Verify with `redis-cli KEYS "cache:*"` -- `cache:orgs`/`cache:dataset_growth`/
`cache:geo_datasets` should appear within seconds of the restart, and
`cache:portal_members` within a couple of minutes (once
`_do_fetch_portal_members()` completes its first post-restart run).

**Lesson for next time:** `_SharedCache`'s silent per-process fallback is
the right default (a missing env var shouldn't crash the app), but it also
means a misconfigured `REDIS_URL` produces *no signal at all* short of the
symptom above -- worth spot-checking `redis-cli KEYS "cache:*"` after any
`.env` change or migration to a new VM, rather than assuming it's wired up
correctly just because Redis itself responds to `PING`.

## Azure Application Gateway (TLS termination + WAF) sits in front of nginx

The `listen 80` block in `nginx-monitor.conf` is only half the picture --
production traffic actually arrives over HTTPS/HTTP2, terminated by an
**Azure Application Gateway v2** before it ever reaches this VM's nginx.
That TLS/listener config isn't captured anywhere in this repo (unlike the
systemd units and nginx config above) -- worth exporting and backfilling
here if anyone gets a chance, since right now it's portal-only knowledge.
What's confirmed so far (discovered while chasing the 403 below):

- Resource group `MIN01-RG96` (subscription `MIN01`), tagged as hosting
  `data.gov.gr`, `opengov.gr`, and other projects on the same Application
  Gateway/WAF policy.
- Application Gateway resource: `MIN01-RG96-AppGW`.
- WAF policy: `WAFPolicyOTS` (Prevention mode), associated with 21+
  sites/listeners -- **any WAF policy change here affects every one of
  them, not just this dashboard.** If it's ever worth isolating this app's
  WAF config entirely, Application Gateway supports per-listener WAF policy
  overrides -- see whether `monitor.data.gov.gr`'s listener already has one
  before assuming everything rides on the shared policy.
- Diagnostic logs already flow to Log Analytics workspace
  `mindigital-sentinel-law-01` (Sentinel), via the App Gateway's own
  Diagnostic settings (`MinDigital-setByPolicy-sentinel-ws`) -- no setup
  needed to query firewall logs, see below.

### 403-until-cookie-clear (fixed 2026-07-24)

**Symptom:** users would intermittently get a bare `403 Forbidden` (empty
body, `server: Microsoft-Azure-Application-Gateway/v2` in the response
headers) loading the dashboard, fixed only by clearing cookies (or working
fine in an incognito window). Almost every user hit this eventually.

**Root cause:** not `app.py`, not nginx -- confirmed via the App Gateway's
own response headers (empty-body 403, no app-level JSON) and an incognito
test (worked fine with no cookies). Azure App Gateway's WAF (OWASP CRS on
`WAFPolicyOTS`) was blocking the request. Flask's session cookie is a
compressed, signed, high-entropy blob (`itsdangerous`), and CRS rule
**942450** ("SQL Hex Encoding Identified", pattern `\b0x[a-f\d]{3,}`)
occasionally matches a substring inside it purely by chance -- pushing the
per-request anomaly score over the blocking threshold enforced by rule
**949110** ("Inbound Anomaly Score Exceeded"). Since each login generates a
different, effectively-random token, this is a matter of chance per
session rather than a deterministic bug -- explaining why it hit almost
everyone eventually rather than a fixed set of accounts.

Confirmed by querying `MIN01-RG96-AppGW`'s Logs blade (Log Analytics):

```kql
AzureDiagnostics
| where ResourceProvider == "MICROSOFT.NETWORK" and Category == "ApplicationGatewayFirewallLog"
| where hostname_s == "monitor.data.gov.gr"
| order by TimeGenerated desc
| project TimeGenerated, action_s, ruleSetType_s, ruleSetVersion_s, ruleId_s, details_message_s, details_data_s, clientIp_s
```

**Fix, two parts:**

1. **`app.py`** (commit `ea1ca01`): renamed the session cookie off Flask's
   default name (`session`) to `monitor_session`, and added an
   `after_request` hook to actively expire the old `session` cookie so it
   stops accumulating in every user's `Cookie` header alongside the new
   one. Renaming was necessary *before* adding a WAF exclusion -- `session`
   is Flask's default cookie name, and since `WAFPolicyOTS` is shared
   across 21+ sites, an exclusion scoped to "a cookie named `session`"
   would have silently weakened SQLi inspection for every other Flask app
   on the same policy, not just this one.
2. **Azure WAF exclusion** (manual, not tracked in this repo):
   `WAFPolicyOTS` -> Managed rules -> rule **942450** -> add an exclusion
   row:
   - Match variable: `Request Cookie Names`
   - Operator: `Equals`
   - Selector: `monitor_session`

   A precedent for this exact pattern already existed on the same rule,
   scoped to CKAN's own `ckan` cookie -- this just adds a second row to
   that existing exclusion entry rather than creating a new one.

**Note:** deploying the `app.py` rename logs out every currently-active
session once, since the old `session` cookie stops being recognized the
moment it ships -- expected, not a regression. The WAF exclusion should be
added *after* that deploy is live, once real traffic is actually carrying
the `monitor_session` cookie name.
