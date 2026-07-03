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


class Communication(db.Model):
    __tablename__ = "communications"

    id           = db.Column(db.Integer, primary_key=True)
    created_at   = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None), index=True)
    contact_date = db.Column(db.String(10), nullable=False)   # ISO date YYYY-MM-DD
    org_name     = db.Column(db.String(200), nullable=False)  # slug or free text
    org_title    = db.Column(db.String(200))
    subject      = db.Column(db.String(500), nullable=False)
    status       = db.Column(db.String(50), nullable=False, default="Contacted")
    notes          = db.Column(db.Text)
    contact_person = db.Column(db.String(200))

    def to_dict(self):
        return {
            "id":           self.id,
            "created_at":   self.created_at.isoformat(),
            "contact_date": self.contact_date,
            "org_name":     self.org_name,
            "org_title":    self.org_title or self.org_name,
            "subject":      self.subject,
            "status":       self.status,
            "notes":           self.notes or "",
            "contact_person":  self.contact_person or "",
        }

class OrgContact(db.Model):
    __tablename__ = "org_contacts"

    id         = db.Column(db.Integer, primary_key=True)
    org_code   = db.Column(db.String(200), nullable=False, index=True)  # HRMS code
    org_label  = db.Column(db.String(300))
    first_name   = db.Column(db.String(100))
    last_name    = db.Column(db.String(100))
    position     = db.Column(db.Text)
    contact_type = db.Column(db.String(200))  # comma-separated: Portal Administrator | Portal Editor | Portal User | Data Officer | Data Steward
    email        = db.Column(db.String(200))
    tel          = db.Column(db.String(50))
    mobile       = db.Column(db.String(50))
    org_codes    = db.Column(db.Text)  # JSON: [{code, label}, ...]

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
        }
