import json
from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class HealthCheck(db.Model):
    __tablename__ = "health_checks"

    id               = db.Column(db.Integer, primary_key=True)
    timestamp        = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None), index=True)
    endpoint_name    = db.Column(db.String(100), nullable=False)
    endpoint_url     = db.Column(db.String(300))
    response_time_ms = db.Column(db.Float)
    status_code      = db.Column(db.Integer)
    is_up            = db.Column(db.Boolean, nullable=False)
    error_message    = db.Column(db.String(500))

    def to_dict(self):
        return {
            "id":               self.id,
            "timestamp":        self.timestamp.isoformat(),
            "endpoint_name":    self.endpoint_name,
            "endpoint_url":     self.endpoint_url,
            "response_time_ms": self.response_time_ms,
            "status_code":      self.status_code,
            "is_up":            self.is_up,
            "error_message":    self.error_message,
        }


class PortalSnapshot(db.Model):
    __tablename__ = "portal_snapshots"

    id                  = db.Column(db.Integer, primary_key=True)
    timestamp           = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None), index=True)
    total_datasets      = db.Column(db.Integer)
    total_organizations = db.Column(db.Integer)
    total_resources     = db.Column(db.Integer)
    total_services      = db.Column(db.Integer)

    def to_dict(self):
        return {
            "timestamp":           self.timestamp.isoformat(),
            "total_datasets":      self.total_datasets,
            "total_organizations": self.total_organizations,
            "total_resources":     self.total_resources,
            "total_services":      self.total_services,
        }


class DatasetGrowthCache(db.Model):
    """Persists the last computed weekly dataset-growth series (see app._do_refresh_dataset_growth)
    so a fresh process/restart can serve it immediately instead of re-paginating CKAN from scratch."""
    __tablename__ = "dataset_growth_cache"

    id         = db.Column(db.Integer, primary_key=True)
    weeks_json = db.Column(db.Text, nullable=False)
    fetched_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    def weeks(self):
        return json.loads(self.weeks_json)


class OrgsCache(db.Model):
    """Persists the last computed organizations list (with last_updated dates, see
    app._do_refresh_orgs) so a fresh process/restart can serve it immediately instead
    of re-paginating CKAN's full package list from scratch."""
    __tablename__ = "orgs_cache"

    id         = db.Column(db.Integer, primary_key=True)
    data_json  = db.Column(db.Text, nullable=False)
    fetched_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    def data(self):
        return json.loads(self.data_json)


class GeoDatasetsCache(db.Model):
    """Persists the last computed per-organization geospatial-dataset locations
    (see app._do_refresh_geo_datasets) so a fresh process/restart can serve the
    map immediately instead of re-querying CKAN for every organization."""
    __tablename__ = "geo_datasets_cache"

    id         = db.Column(db.Integer, primary_key=True)
    data_json  = db.Column(db.Text, nullable=False)
    fetched_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    def data(self):
        return json.loads(self.data_json)


class HvdCheckCache(db.Model):
    """Persists the last completed HVD SHACL compliance check result (see
    app._do_run_hvd_check) so it survives a process restart and doesn't need
    re-running (~1,105 datasets, several minutes) just to view it again."""
    __tablename__ = "hvd_check_cache"

    id         = db.Column(db.Integer, primary_key=True)
    data_json  = db.Column(db.Text, nullable=False)
    fetched_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    def data(self):
        return json.loads(self.data_json)


class HvdCheckStatus(db.Model):
    """Singleton row (id=1) holding the *live* status of an HVD check run
    in progress -- running/total/completed/cancel_requested/error. Gunicorn
    runs multiple worker processes, each with its own memory, so an
    in-memory dict here would let different requests (and different browser
    refreshes) see different, inconsistent progress depending on which
    worker happened to handle them. This table is the single shared source
    of truth every worker reads and writes instead."""
    __tablename__ = "hvd_check_status"

    id               = db.Column(db.Integer, primary_key=True)
    running          = db.Column(db.Boolean, nullable=False, default=False)
    started_at       = db.Column(db.String(64))
    total            = db.Column(db.Integer, default=0)
    completed        = db.Column(db.Integer, default=0)
    cancel_requested = db.Column(db.Boolean, nullable=False, default=False)
    error            = db.Column(db.Text)
    updated_at       = db.Column(db.DateTime)  # heartbeat, bumped on every progress update while running


class HvdDatasetCheckCache(db.Model):
    """Per-dataset cache for the HVD SHACL check, keyed by CKAN's own
    metadata_modified timestamp. A run only re-fetches and re-validates a
    dataset's RDF when it's new, previously failed, or its metadata_modified
    has actually changed since the last successful check -- everything else
    is served from here instead of hitting data.gov.gr again."""
    __tablename__ = "hvd_dataset_check_cache"

    name              = db.Column(db.String(300), primary_key=True)
    metadata_modified = db.Column(db.String(64))
    result_json       = db.Column(db.Text)  # last successful _hvd_check_one() result; None if never succeeded
    checked_at        = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    def result(self):
        return json.loads(self.result_json) if self.result_json else None


class DcatApCheckCache(db.Model):
    """Persists the last completed DCAT-AP + MDR-vocabulary SHACL compliance
    check result (see app._do_run_dcat_check) -- same purpose as
    HvdCheckCache, for the check that covers every dataset on the portal
    rather than just the HVD-tagged subset."""
    __tablename__ = "dcat_ap_check_cache"

    id         = db.Column(db.Integer, primary_key=True)
    data_json  = db.Column(db.Text, nullable=False)
    fetched_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    def data(self):
        return json.loads(self.data_json)


class DcatApCheckStatus(db.Model):
    """Singleton row (id=1) holding the live status of a DCAT-AP check run --
    same DB-backed-status reasoning as HvdCheckStatus (shared across gunicorn
    worker processes)."""
    __tablename__ = "dcat_ap_check_status"

    id               = db.Column(db.Integer, primary_key=True)
    running          = db.Column(db.Boolean, nullable=False, default=False)
    started_at       = db.Column(db.String(64))
    total            = db.Column(db.Integer, default=0)
    completed        = db.Column(db.Integer, default=0)
    cancel_requested = db.Column(db.Boolean, nullable=False, default=False)
    error            = db.Column(db.Text)
    updated_at       = db.Column(db.DateTime)


class DcatApDatasetCheckCache(db.Model):
    """Per-dataset cache for the DCAT-AP check, keyed by CKAN's own
    metadata_modified timestamp -- same incremental-recheck reasoning as
    HvdDatasetCheckCache, just covering every dataset instead of only the
    HVD-tagged ones (~22,000+ rows rather than ~1,100)."""
    __tablename__ = "dcat_ap_dataset_check_cache"

    name              = db.Column(db.String(300), primary_key=True)
    metadata_modified = db.Column(db.String(64))
    result_json       = db.Column(db.Text)
    checked_at        = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    def result(self):
        return json.loads(self.result_json) if self.result_json else None


class GeoDcatCheckCache(db.Model):
    """Persists the last completed GeoDCAT-AP SHACL compliance check result
    (see app._do_run_geodcat_check) -- same purpose as DcatApCheckCache, for
    the check scoped to geospatial-tagged datasets only."""
    __tablename__ = "geodcat_check_cache"

    id         = db.Column(db.Integer, primary_key=True)
    data_json  = db.Column(db.Text, nullable=False)
    fetched_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    def data(self):
        return json.loads(self.data_json)


class GeoDcatCheckStatus(db.Model):
    """Singleton row (id=1) holding the live status of a GeoDCAT-AP check
    run -- same DB-backed-status reasoning as HvdCheckStatus."""
    __tablename__ = "geodcat_check_status"

    id               = db.Column(db.Integer, primary_key=True)
    running          = db.Column(db.Boolean, nullable=False, default=False)
    started_at       = db.Column(db.String(64))
    total            = db.Column(db.Integer, default=0)
    completed        = db.Column(db.Integer, default=0)
    cancel_requested = db.Column(db.Boolean, nullable=False, default=False)
    error            = db.Column(db.Text)
    updated_at       = db.Column(db.DateTime)


class GeoDcatDatasetCheckCache(db.Model):
    """Per-dataset cache for the GeoDCAT-AP check, keyed by CKAN's own
    metadata_modified timestamp -- same incremental-recheck reasoning as
    HvdDatasetCheckCache, scoped to geospatial-tagged datasets."""
    __tablename__ = "geodcat_dataset_check_cache"

    name              = db.Column(db.String(300), primary_key=True)
    metadata_modified = db.Column(db.String(64))
    result_json       = db.Column(db.Text)
    checked_at        = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    def result(self):
        return json.loads(self.result_json) if self.result_json else None


class MqaCache(db.Model):
    """Persists the last fetched data.europa.eu Metadata Quality Assessment
    (MQA) score for data.gov.gr's catalogue -- a periodic external API pull
    (see app._do_refresh_mqa), not something computed locally like the SHACL
    checks above."""
    __tablename__ = "mqa_cache"

    id         = db.Column(db.Integer, primary_key=True)
    data_json  = db.Column(db.Text, nullable=False)
    fetched_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    def data(self):
        return json.loads(self.data_json)


class User(db.Model):
    __tablename__ = "users"

    id            = db.Column(db.Integer, primary_key=True)
    email         = db.Column(db.String(255), unique=True, nullable=False, index=True)
    name          = db.Column(db.String(255))
    password_hash = db.Column(db.String(255))  # null until the invite/reset link is used
    is_admin      = db.Column(db.Boolean, nullable=False, default=False)
    created_at    = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    last_login_at = db.Column(db.DateTime)
    last_active_at = db.Column(db.DateTime)  # updated (throttled) on any authenticated request
    allowed_tabs  = db.Column(db.Text)  # comma-separated tab keys; NULL/empty = unrestricted (all tabs)

    reset_tokens = db.relationship(
        "PasswordResetToken", backref="user", cascade="all, delete-orphan",
    )

    def to_dict(self):
        return {
            "id":            self.id,
            "email":         self.email,
            "name":          self.name or self.email,
            "is_admin":      self.is_admin,
            "has_password":  bool(self.password_hash),
            "created_at":    self.created_at.isoformat() if self.created_at else None,
            "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None,
            "last_active_at": self.last_active_at.isoformat() if self.last_active_at else None,
            "allowed_tabs":  self.allowed_tabs.split(",") if self.allowed_tabs else None,
        }


class PasswordResetToken(db.Model):
    """Single-use, time-limited token backing both the invite and forgot-password flows."""
    __tablename__ = "password_reset_tokens"

    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    token      = db.Column(db.String(64), unique=True, nullable=False, index=True)
    expires_at = db.Column(db.DateTime, nullable=False)
    used_at    = db.Column(db.DateTime)


STALE_CASE_DAYS = 14  # an open case idle this many days is flagged as stale (treated as "No Response")


class Case(db.Model):
    __tablename__ = "cases"

    id         = db.Column(db.Integer, primary_key=True)
    org_name   = db.Column(db.String(200), nullable=False)
    org_title  = db.Column(db.String(200))
    subject    = db.Column(db.String(500), nullable=False)
    status     = db.Column(db.String(20), nullable=False, default="Open")  # Open | Closed
    deadline   = db.Column(db.String(10))  # ISO date; past this with no follow-up -> treated as No Response
    opened_at  = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    closed_at  = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None), index=True)

    communications = db.relationship(
        "Communication", backref="case", order_by="Communication.contact_date",
        cascade="all, delete-orphan",
    )

    @property
    def is_stale(self):
        entries = sorted(self.communications, key=lambda c: (c.contact_date, c.created_at))
        last_entry = entries[-1] if entries else None
        last_update = last_entry.contact_date if last_entry else None
        if self.status != "Open" or not last_entry:
            return False
        if last_entry.status == "No Response":
            return True  # the latest logged attempt itself went unanswered
        if self.deadline:
            try:
                return datetime.now(timezone.utc).date() > datetime.strptime(self.deadline, "%Y-%m-%d").date()
            except ValueError:
                return False
        # legacy case with no deadline set - fall back to the old idle-time rule
        try:
            idle_days = (datetime.now(timezone.utc).date() - datetime.strptime(last_update, "%Y-%m-%d").date()).days
            return idle_days >= STALE_CASE_DAYS
        except ValueError:
            return False

    def to_dict(self, include_communications=False):
        entries = sorted(self.communications, key=lambda c: (c.contact_date, c.created_at))
        last_entry = entries[-1] if entries else None
        d = {
            "id":          self.id,
            "org_name":    self.org_name,
            "org_title":   self.org_title or self.org_name,
            "subject":     self.subject,
            "status":      self.status,
            "deadline":    self.deadline,
            "opened_at":   self.opened_at.isoformat() if self.opened_at else None,
            "closed_at":   self.closed_at.isoformat() if self.closed_at else None,
            "entry_count": len(entries),
            "last_update": last_entry.contact_date if last_entry else None,
            "is_stale":    self.is_stale,
        }
        if include_communications:
            d["communications"] = [c.to_dict() for c in entries]
        return d


class Communication(db.Model):
    __tablename__ = "communications"

    id           = db.Column(db.Integer, primary_key=True)
    case_id      = db.Column(db.Integer, db.ForeignKey("cases.id"), index=True)
    created_at   = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None), index=True)
    contact_date = db.Column(db.String(10), nullable=False)   # ISO date YYYY-MM-DD
    org_name     = db.Column(db.String(200), nullable=False)  # slug or free text
    org_title    = db.Column(db.String(200))
    subject      = db.Column(db.String(500), nullable=False)
    status       = db.Column(db.String(50), nullable=False, default="Initial Contact")
    notes          = db.Column(db.Text)
    contact_person = db.Column(db.String(200))
    medium         = db.Column(db.String(50))

    def to_dict(self):
        return {
            "id":           self.id,
            "case_id":      self.case_id,
            "case_status":  self.case.status if self.case else None,
            "case_is_stale": self.case.is_stale if self.case else False,
            "created_at":   self.created_at.isoformat(),
            "contact_date": self.contact_date,
            "org_name":     self.org_name,
            "org_title":    self.org_title or self.org_name,
            "subject":      self.subject,
            "status":       self.status,
            "notes":           self.notes or "",
            "contact_person":  self.contact_person or "",
            "medium":          self.medium or "",
        }

class OrgContact(db.Model):
    __tablename__ = "org_contacts"

    id         = db.Column(db.Integer, primary_key=True)
    org_code   = db.Column(db.String(200), nullable=False, index=True)  # HRMS code
    org_label  = db.Column(db.String(300))
    first_name   = db.Column(db.String(100))
    last_name    = db.Column(db.String(100))
    position     = db.Column(db.Text)
    contact_type = db.Column(db.String(200))  # comma-separated: Org Administrator | Org Editor | Org Member | Data Governance Officer | Data Steward
    email        = db.Column(db.String(200))
    tel          = db.Column(db.String(50))
    mobile       = db.Column(db.String(50))
    org_codes    = db.Column(db.Text)  # JSON: [{code, label}, ...]
    created_at   = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    def to_dict(self):
        orgs = []
        if self.org_codes:
            try:
                orgs = json.loads(self.org_codes)
            except Exception:
                pass
        if not orgs and self.org_code:
            orgs = [{"code": self.org_code, "label": self.org_label or self.org_code}]
        return {
            "id":           self.id,
            "org_code":     self.org_code,
            "org_label":    self.org_label or "",
            "org_codes":    orgs,
            "first_name":   self.first_name or "",
            "last_name":    self.last_name or "",
            "position":     self.position or "",
            "contact_type": self.contact_type or "",
            "email":        self.email or "",
            "tel":          self.tel or "",
            "mobile":       self.mobile or "",
            "created_at":   self.created_at.isoformat() if self.created_at else None,
        }
