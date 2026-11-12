"""Organization analytics report data services on their own. An organization's dataset pass rate must not move because it has
a few services (127 on the whole portal, all exported as plain datasets so far), and the services' own figure is kept so the
history starts accumulating the day services become checkable as services."""
import json

import pytest

import app as appmod
from models import (DcatApDatasetCheckCache, GeoDcatDatasetCheckCache, HvdDatasetCheckCache, OrgSnapshot, User, db)


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setattr(appmod.csrf, "protect", lambda **kw: None)
    monkeypatch.setattr(appmod.limiter, "enabled", False)


def _row(model, name, pkg_type, conforms, org="org-a"):
    db.session.add(model(name=name, org_slug=org, pkg_type=pkg_type, metadata_modified="m",
                         result_json=json.dumps({"_cache_version": 1, "result": {"conforms": conforms}})))


def test_the_rollup_splits_by_package_type(app):
    _row(DcatApDatasetCheckCache, "d1", "dataset", True)
    _row(DcatApDatasetCheckCache, "d2", "dataset", False)
    _row(DcatApDatasetCheckCache, "s1", "data-service", True)
    _row(DcatApDatasetCheckCache, "s2", "data-service", False)
    _row(DcatApDatasetCheckCache, "s3", "data-service", False)
    _row(DcatApDatasetCheckCache, "x1", "unlisted", True)
    db.session.commit()
    assert appmod._rollup_check_by_org(DcatApDatasetCheckCache) == {"org-a": {"checked": 2, "conforms": 1}}
    assert appmod._rollup_check_by_org(DcatApDatasetCheckCache, "data-service") == {"org-a": {"checked": 3, "conforms": 1}}


def _snapshot(monkeypatch):
    monkeypatch.setitem(appmod._orgs_cache, "data", [{"name": "org-a", "title": "Org A", "package_count": 4}])
    for model in (HvdDatasetCheckCache, DcatApDatasetCheckCache, GeoDcatDatasetCheckCache):
        _row(model, f"{model.__tablename__}-d1", "dataset", True)
        _row(model, f"{model.__tablename__}-s1", "data-service", False)
        _row(model, f"{model.__tablename__}-s2", "data-service", True)
    db.session.commit()
    appmod._do_build_org_snapshots()
    return OrgSnapshot.query.filter_by(org_slug="org-a").one()


def test_the_daily_snapshot_keeps_services_apart_from_the_dataset_rates(app, monkeypatch):
    snap = _snapshot(monkeypatch)
    for k in ("hvd", "dcat", "geodcat"):
        assert getattr(snap, f"{k}_checked") == 1 and getattr(snap, f"{k}_pass_rate") == 1.0   # services did not move it
        assert getattr(snap, f"{k}_services_checked") == 2 and getattr(snap, f"{k}_services_conforms") == 1


def test_the_snapshot_dict_carries_a_services_block(app, monkeypatch):
    d = _snapshot(monkeypatch).to_dict()
    assert d["services"] == {k: {"checked": 2, "conforms": 1} for k in ("hvd", "dcat", "geodcat")}
    assert d["dcat"]["checked"] == 1


def test_the_scorecard_returns_the_services_block(app, monkeypatch):
    _snapshot(monkeypatch)
    boss = User(email="boss@x.gr", is_admin=True, is_superadmin=True)
    db.session.add(boss)
    db.session.commit()
    c = app.test_client()
    with c.session_transaction() as s:
        s.update(user_id=boss.id, user_email=boss.email, is_admin=True, is_superadmin=True, allowed_tabs=None, org_scope=None)
    data = c.get("/api/org-analytics/org-a/scorecard").get_json()
    assert data["snapshot"]["services"]["dcat"] == {"checked": 2, "conforms": 1}
    assert data["snapshot"]["dcat"]["pass_rate"] == 1.0
