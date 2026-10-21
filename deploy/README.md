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

## Deploy pipeline (GitHub Actions, self-hosted runner)

`.github/workflows/deploy.yml` runs *on the VM itself* (a self-hosted
runner, not a GitHub-hosted one) on every push to `main`: `git pull`,
regenerate `build_date.txt`, `pip install -r requirements.txt`, then
`pkill` both the gunicorn and `background_worker.py` processes and let
systemd restart them, waiting 15s before checking `systemctl is-active`
on both services. If either isn't active, the job dumps the last 30
`journalctl` lines for that service and fails -- so a red run always means
a service failed to come back up with the new code, not a git/network
problem.

### Boot-loop from a half-committed change + systemd rate-limit lockout (2026-07-28)

**Symptom:** a push's deploy run failed at "Reload service" with gunicorn's
arbiter raising `HaltServer: 'Worker failed to boot.'` -- repeatedly, across
several consecutive deploy attempts, with systemd's own restart counter
climbing each time (`Scheduled restart job, restart counter is at 14`, then
`16`). The *actual* underlying exception wasn't visible in the log tail
GitHub Actions captured -- only gunicorn's own secondary
`HaltServer`/`sys.exit(run())` traceback, several lines below where the
real one would have been.

**Root cause, two layered problems:**
1. `app.py` was committed importing a new `ApiToken` model
   (`from models import ..., ApiToken`) for an in-progress, not-yet-finished
   feature -- but the matching `ApiToken` class in `models.py` never got
   added to that same commit. A blanket `git add app.py` staged whatever
   was in the working tree at commit time, including half-finished edits
   unrelated to the actual fix being committed. Result: `ImportError` at
   module load, on every single worker, every time.
2. Because the broken code kept getting deployed and immediately crashing
   across multiple consecutive `pkill` + restart cycles, systemd's own
   restart rate-limiting (`StartLimitBurst`/`StartLimitIntervalSec`, systemd
   service defaults) eventually tripped: `Start request repeated too
   quickly`. Once that fires, systemd refuses to even *attempt* starting
   the service again until manually cleared -- meaning later deploy runs
   kept failing identically even after the actual code was fixed, because
   the service was never actually given a chance to start with the fixed
   code.

**Fix:**
```bash
# 1. Push a commit with BOTH halves of the fix together (the missing
#    model, plus reverting any other half-finished config change that
#    had been swept in with it -- see commit c5c36de).
# 2. Clear the rate-limit lockout so the next start attempt is a real one:
sudo systemctl reset-failed monitor-data-gov-gr monitor-data-gov-gr-worker
sudo systemctl start monitor-data-gov-gr monitor-data-gov-gr-worker
sudo systemctl status monitor-data-gov-gr --no-pager
```

**Lesson for next time:**
- Before committing, check `git status`/`git diff` on every file about to
  be staged -- especially when more than one feature/fix is being worked
  on in the same session and might have edits sitting in the same file's
  working tree at once. `git add <file>` stages *everything* currently in
  that file, not just the change you meant to commit.
- If a deploy run fails with `HaltServer`/boot errors, the GH Actions log
  tail often only shows gunicorn's *secondary* exception (its own
  `sys.exit`/arbiter unwind), not the actual root-cause traceback. Get the
  real one directly: `sudo journalctl -u monitor-data-gov-gr -n 100
  --no-pager | grep -B2 -A25 Traceback`.
- If several consecutive deploy attempts all fail identically even after
  what looks like a real fix, check for `Start request repeated too
  quickly` in the log -- that means systemd stopped trying altogether, and
  `systemctl reset-failed` is needed before the next attempt means anything.

**Follow-up, same day -- the worker stayed dead for 11 hours after the fix above:**
the code fix landed and the *web* service recovered fine, but
`monitor-data-gov-gr-worker` did not -- `systemctl status` showed
`Active: failed ... since <original incident time>; 11h ago`. Every deploy
in between kept reporting the same failure, which looked like a *recurring*
crash but was actually the opposite problem: systemd's rate-limit lockout
(see above) was never cleared for the worker specifically, so it silently
stopped attempting to start at all. Each subsequent deploy's `pkill` had
nothing to kill (the process was already dead) and its `journalctl -n 30`
dump just kept re-showing the *same* 11-hour-old log lines, since nothing
new had been logged -- easy to misread as "still failing the same way on
every new attempt" when the real story was "hasn't tried again since the
original incident." `sudo systemctl status <service> --no-pager -l` (not
just the journal tail) is what actually reveals this -- the `Active:
failed ... since <timestamp>; <duration> ago` line is the tell.

**Fixed for good:** `deploy.yml`'s "Reload service" step now runs `sudo
systemctl reset-failed monitor-data-gov-gr monitor-data-gov-gr-worker`
immediately before every restart attempt, so a lockout from an earlier
failed deploy can never silently persist into later ones -- every deploy
now gets a genuine fresh attempt regardless of what happened before it.

## Login with the data.gov.gr Keycloak

`keycloak_auth.py` (routes `/login/keycloak`, `/auth/callback` in `app.py`): OpenID Connect
authorization-code flow with PKCE, same design as loader.data.gov.gr's. It is **off until all of
`KEYCLOAK_ISSUER`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET` and `CKAN_SYSADMIN_API_TOKEN` are set**;
until then the login page shows no button and email/password + passkeys work as before.

**Who is let in.** Keycloak only says who the person is. CKAN decides: a CKAN sysadmin, or an
administrator of at least one organization (`organization_list_for_user`, `permission=admin`; the CKAN user
is `user_<Keycloak sub>`). It fails closed when CKAN can't be asked. A new sysadmin becomes a CRM
superadmin; a new org admin gets only the Overview tab until a superadmin grants more; an existing CRM user
with the same *verified* email is linked and keeps their roles.

**In Keycloak** (realm `data`, `https://auth.data.gov.gr`, admin console -> Clients -> Create client):
- OpenID Connect, client ID `monitor-data-gov-gr`, **Client authentication On** (confidential),
  **Standard flow only** (Direct access grants off).
- Valid redirect URI exactly `https://monitor.data.gov.gr/auth/callback`; valid post-logout redirect URI
  `https://monitor.data.gov.gr/*`; web origin `https://monitor.data.gov.gr`.
- Copy the secret from the Credentials tab. The `email` and `profile` scopes must be assigned (default);
  no roles/groups/mappers are needed. For linking existing users, Keycloak must send `email_verified: true`.

**CKAN token:** as a CKAN sysadmin on data.gov.gr, profile -> API Tokens -> create one (shown only once).

**On the VM**, add to `monitor-data-gov-gr/.env` and restart both services:

```
KEYCLOAK_ISSUER=https://auth.data.gov.gr/realms/data
KEYCLOAK_CLIENT_ID=monitor-data-gov-gr
KEYCLOAK_CLIENT_SECRET=<the client's secret>
CKAN_SYSADMIN_API_TOKEN=<the sysadmin's CKAN API token>
# optional: KEYCLOAK_REDIRECT_URI (default: PUBLIC_BASE_URL + /auth/callback)
```

`PUBLIC_BASE_URL` must be the public address (behind the gateway a request looks like plain `http`).

**Troubleshooting:** no button -> one of the four vars is unset. Errors are shown on the login page; more
detail in `journalctl -u monitor-data-gov-gr | grep "keycloak login"`. "Invalid redirect_uri" on Keycloak's
page -> the redirect URI doesn't match exactly. "You have no account in CKAN yet" -> that person never signed
in to data.gov.gr. "not an administrator of any organization" -> they are an editor/member.
Not yet exercised against the real Keycloak (tests use a faked one).

## nginx config changes are NOT part of the automated deploy

`deploy.yml`'s `git pull` updates everything Python/template/static, but
`nginx-monitor.conf` in this repo is just a *tracked copy* -- nothing
automatically copies it to `/etc/nginx/sites-enabled/monitor` or reloads
nginx. After editing the tracked file, the change has to be applied by
hand on the VM:

```bash
sudo nano /etc/nginx/sites-enabled/monitor   # make the same edit here
sudo nginx -t && sudo systemctl reload nginx  # test first, reload only if it passes
```

### Forwarded emails silently vanishing -- nginx 1MB body-size default (found 2026-08-05)

**Symptom:** re-forwarding an email thread to the Mail Parser webhook
produced *nothing* -- no new Parsed Emails row, no update to an existing
one, not even a `dismissed` row. `journalctl -u monitor-data-gov-gr` had
zero `[email-sync]` log lines anywhere near the forward's timestamp --
i.e. the request never reached the app at all, not an app-level bug.

**Root cause:** `nginx-monitor.conf` never set `client_max_body_size`, so
nginx fell back to its compile-time default of **1MB**. SendGrid's Inbound
Parse POSTs the *entire raw MIME email* as form data -- full headers, a
multipart HTML+plain body, and in this case an embedded signature image
(`[cid:image001.jpg@...]`) -- which crosses 1MB easily once a thread's
been forwarded/quoted a few times. nginx rejected the oversized POST with
a bare `413` before it ever reached gunicorn, which is exactly why nothing
showed up anywhere the app could log it.

Confirmed via nginx's own access log, not guesswork -- the fix that
actually located this only came after checking here, not from reasoning
about the app's dedup logic (which is what looked suspicious at first,
and did have a real, separate false-positive bug worth its own fix, but
wasn't the cause of *this* symptom):

```bash
sudo grep 'inbound-webhook' /var/log/nginx/access.log | tail -20
# ... 413 171 "-" "Sendlib/1.0"   <- SendGrid's own user-agent, request rejected before the app ever saw it
```

**Fix:** added `client_max_body_size 25m;` to the `server` block in
`nginx-monitor.conf` (comfortably under SendGrid's own ~30MB Inbound Parse
limit) -- applied by hand on the VM per the note at the top of this
section, since this file isn't part of the git-pull deploy pipeline.

**Lesson for next time:** when something upstream of the app (SendGrid,
in this case) reports success but nothing shows up in the app at all,
check nginx's *access* log (not the app's journalctl) before suspecting
application logic -- a request nginx itself rejects (413, and the same
logic applies to a WAF-level block, see the Application Gateway section
below) never generates a single line of app-level log, so "the app never
logged it" and "the app has a bug" are not the same thing.

## Redis (rate-limit storage + shared caches + sessions + comms-stream fanout)

Redis backs four independent things in production, all optional and all
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
- **Communications-tab SSE fanout** (`REDIS_URL`, same var again; app.py,
  `_stream_poller_loop`/`_stream_subscriber_relay_loop`): without Redis,
  every gunicorn worker independently polls the DB every 3s for new inbound
  emails/communications to push to open `/api/communications/stream`
  connections -- correct, but DB load scales with worker count (4x in
  production) for no benefit, since all 4 workers poll the exact same rows.
  With Redis, only `background_worker.py` polls the DB, publishing each
  event to the `comms_stream_events` Pub/Sub channel; the 4 web workers
  subscribe to that channel instead and relay messages straight into their
  own local SSE connections, cutting DB polling to 1x for the whole fleet.
  Falls back cleanly to per-worker polling if `REDIS_URL` is unset.

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

### Mail Parser webhook 413s -- three independent size caps, only the last one was the app's own (found/fixed 2026-08-05/06)

**Symptom:** forwarding an email to the Mail Parser webhook produced
nothing at all -- no new Parsed Emails row, no app-level log line.

**Layer 1 -- nginx.** nginx's own access log showed `413` responses to
`/api/email-sync/inbound-webhook/...` at exactly the forward's
timestamps, caused by `client_max_body_size` sitting at its 1MB
compile-time default. Fixed by adding `client_max_body_size 25m;` to
`nginx-monitor.conf` (see "nginx config changes" section above). Real
fix, but **did not resolve the symptom** -- a different, smaller (~530KB)
email still came back 413 afterward.

**Layer 2 -- Application Gateway WAF.** Confirmed via the Gateway's own
Access log (not the Firewall log, which showed the same request
`Allowed` by an unrelated custom rule -- a red herring):

```kql
AzureDiagnostics
| where ResourceProvider == "MICROSOFT.NETWORK" and Category == "ApplicationGatewayAccessLog"
| where userAgent_s has "Sendlib"
| order by TimeGenerated desc
```

showed `httpStatus_d: 413`, `receivedBytes_d: 543474` (~530KB), and
`error_info_s: ERRORINFO_NO_ERROR` (a deliberate reject, not a backend
error) -- `WAFPolicyOTS`'s own `maxRequestBodySizeInKb` was rejecting
SendGrid's raw-email multipart field (no `filename=`, so it doesn't
qualify for the WAF's much larger file-upload limit). The Portal's actual
range for that setting is 8-2000 KB (**not** a hard 128KB ceiling -- that
number belongs to a separate "maximum request body *inspection* limit"
field that governs SQLi/XSS pattern-depth, not outright rejection; this
report previously conflated the two). Raised to 2000 (the Portal max) --
also real hardening, but **still did not resolve the symptom**.

**Layer 3 -- the actual root cause: Werkzeug's own form-field cap.**
Werkzeug 2.3+ (this app pins `Werkzeug==3.1.8`) enforces
`MAX_FORM_MEMORY_SIZE`, a 500,000-byte default cap on any individual
*non-file* multipart form field, added as a CVE-2023-46136 mitigation.
`email_inbound_webhook()` in `app.py` reads `freq.form.get("from"/"to"/
"subject"/...)`, which parses the whole multipart body through Werkzeug's
form parser. SendGrid's Inbound Parse posts the entire raw MIME email as
a plain field named `email` with no `filename=`, so it doesn't count as a
file part and lands under the 500KB cap -- the same ~530KB test email
that cleared both nginx's 25MB and the WAF's 2000KB limits still tripped
this one. **This 413 is generated by Flask/Werkzeug itself, after nginx
and the Gateway already accepted and forwarded the full request** -- it
shows up in nginx's *access* log (proxied through normally) but never in
nginx's *error* log (no "client intended to send too large body" line),
which is the tell that it isn't an nginx-level rejection at all.

**Fix:** `app.config["MAX_FORM_MEMORY_SIZE"] = 20 * 1024 * 1024` in
`app.py`, matching nginx's own headroom.

**Azure WAF changes reverted (2026-08-06):** once the Werkzeug fix landed,
`WAFPolicyOTS`'s "Maximum request body size (KB)" was set back to its
original 128, and the `AllowMailParserWebhook` custom rule (added to test
whether an Allow rule could bypass the size cap -- it couldn't) was
deleted. A fresh forward with both reverted still landed correctly,
confirming the WAF was never actually the binding constraint and the fix
is entirely app-side; nothing on the shared policy needed to change.

**Lesson for next time:** a request can be rejected by *more than one*
layer independently, and the layers aren't only infrastructure --
`client_max_body_size` (nginx), `maxRequestBodySizeInKb` (Gateway WAF),
and `MAX_FORM_MEMORY_SIZE`/`MAX_CONTENT_LENGTH` (Werkzeug, inside the app
itself) are three unrelated settings that all have to be big enough.
Fixing the first two and confirming each is real doesn't mean the job's
done. The tell for "this 413 is coming from Flask, not nginx" is that it
appears in nginx's *access* log but has no matching entry in nginx's
*error* log -- nginx only writes to its error log when *it* is the one
rejecting the request.
