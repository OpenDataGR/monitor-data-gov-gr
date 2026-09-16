"""Phase 0 of the org-analytics feature: the org-category classifier
(app._classify_org / app._do_classify_orgs) and the org_slug backfill that
_do_run_check now performs on every dataset-cache row it touches, so
per-dataset quality-check rows carry a real org slug for org-level rollups.
"""
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import app as appmod
from models import db, OrgClassification, HvdDatasetCheckCache


class _FakePool:
    """Stands in for app.ProcessPoolExecutor in tests -- runs check_one on a
    plain thread pool in-process instead of spawning real subprocesses, so a
    test-local lambda/closure works as check_one without needing to be
    picklable/importable by a spawned child process."""

    def __init__(self, max_workers=None, mp_context=None):
        self._real = ThreadPoolExecutor(max_workers=max_workers)

    def submit(self, fn, *a, **kw):
        return self._real.submit(fn, *a, **kw)

    def shutdown(self, wait=True, cancel_futures=False):
        return self._real.shutdown(wait=wait, cancel_futures=cancel_futures)


class TestClassifyOrg:
    def test_ministry(self):
        assert appmod._classify_org("Υπουργείο Ψηφιακής Διακυβέρνησης") == "ministry"

    def test_municipality(self):
        assert appmod._classify_org("Δήμος Αθηναίων") == "municipality"

    def test_region(self):
        assert appmod._classify_org("Περιφέρεια Αττικής") == "region"

    def test_decentralized_admin_takes_priority_over_region(self):
        # A decentralized administration's own title can mention the
        # regions it covers -- it must classify as decentralized_admin,
        # not region, since that keyword is checked first.
        assert appmod._classify_org(
            "Αποκεντρωμένη Διοίκηση Αττικής"
        ) == "decentralized_admin"

    def test_university(self):
        assert appmod._classify_org("Εθνικό και Καποδιστριακό Πανεπιστήμιο Αθηνών") == "university"

    def test_unrecognized_title_falls_back_to_other(self):
        assert appmod._classify_org("Εθνικό Κέντρο Τεκμηρίωσης") == "other"

    def test_empty_title_falls_back_to_other(self):
        assert appmod._classify_org("") == "other"


class TestDoClassifyOrgs:
    def test_inserts_new_classification_rows(self, app):
        appmod._orgs_cache["data"] = [
            {"name": "ypeth", "title": "Υπουργείο Παιδείας", "package_count": 10},
            {"name": "athens", "title": "Δήμος Αθηναίων", "package_count": 5},
        ]
        appmod._do_classify_orgs()

        rows = {r.org_slug: r for r in OrgClassification.query.all()}
        assert rows["ypeth"].category == "ministry"
        assert rows["ypeth"].heuristic_category == "ministry"
        assert rows["ypeth"].is_override is False
        assert rows["athens"].category == "municipality"

    def test_override_preserves_effective_category_but_updates_heuristic(self, app):
        row = OrgClassification(
            org_slug="mystery-org", org_title="Old Title",
            category="ministry", heuristic_category="other",
            is_override=True, overridden_by_user_id=1,
            overridden_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )
        db.session.add(row)
        db.session.commit()

        appmod._orgs_cache["data"] = [
            {"name": "mystery-org", "title": "Δήμος Καινούριος", "package_count": 3},
        ]
        appmod._do_classify_orgs()

        db.session.refresh(row)
        assert row.category == "ministry"           # override untouched
        assert row.heuristic_category == "municipality"  # heuristic still kept fresh
        assert row.is_override is True
        assert row.org_title == "Δήμος Καινούριος"   # denormalized title still refreshed

    def test_non_overridden_row_tracks_heuristic_on_rename(self, app):
        row = OrgClassification(
            org_slug="renamed-org", org_title="Old Title",
            category="other", heuristic_category="other", is_override=False,
        )
        db.session.add(row)
        db.session.commit()

        appmod._orgs_cache["data"] = [
            {"name": "renamed-org", "title": "Υπουργείο Υγείας", "package_count": 7},
        ]
        appmod._do_classify_orgs()

        db.session.refresh(row)
        assert row.category == "ministry"
        assert row.heuristic_category == "ministry"

    def test_empty_orgs_cache_is_a_noop(self, app):
        appmod._orgs_cache["data"] = []
        appmod._do_classify_orgs()  # must not raise
        assert OrgClassification.query.count() == 0


class TestOrgSlugBackfill:
    def test_do_run_check_backfills_org_slug_on_cache_reused_row(self, app, monkeypatch):
        # Seed a cache row for a dataset that will be served from the
        # cache-hit path (matching metadata_modified + check version), with
        # a stale/missing org_slug -- simulating a pre-existing row written
        # before this column existed, or before an org transfer.
        cached_result = {
            "name": "ds1", "conforms": True, "violation_count": 0, "warning_count": 0,
            "legal_citation_issue": False, "no_api_access": False, "license_status": "open",
            "details": [], "publisher_name": "",
        }
        row = HvdDatasetCheckCache(
            name="ds1", metadata_modified="2026-01-01T00:00:00",
            result_json=json.dumps({"_cache_version": appmod._HVD_CHECK_VERSION, "result": cached_result}),
            org_slug="stale-org",
        )
        db.session.add(row)
        db.session.commit()

        monkeypatch.setitem(
            appmod._QUALITY_CHECKS["hvd"], "list_datasets",
            lambda: [{"name": "ds1", "metadata_modified": "2026-01-01T00:00:00",
                      "org_title": "Νέος Φορέας", "org_slug": "new-org"}],
        )

        appmod._do_run_check("hvd")

        db.session.refresh(row)
        assert row.org_slug == "new-org"

    def test_do_run_check_sets_org_slug_on_freshly_checked_dataset(self, app, monkeypatch):
        monkeypatch.setattr(appmod, "ProcessPoolExecutor", _FakePool)
        monkeypatch.setitem(
            appmod._QUALITY_CHECKS["hvd"], "list_datasets",
            lambda: [{"name": "ds2", "metadata_modified": "2026-02-01T00:00:00",
                      "org_title": "Ένας Δήμος", "org_slug": "a-municipality"}],
        )
        monkeypatch.setitem(
            appmod._QUALITY_CHECKS["hvd"], "check_one",
            lambda name: {
                "name": name, "title": name, "conforms": True, "violation_count": 0,
                "warning_count": 0, "legal_citation_issue": False, "no_api_access": False,
                "license_status": "open", "details": [], "publisher_name": "",
            },
        )

        appmod._do_run_check("hvd")

        row = HvdDatasetCheckCache.query.get("ds2")
        assert row is not None
        assert row.org_slug == "a-municipality"
