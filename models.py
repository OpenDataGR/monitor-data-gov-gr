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
