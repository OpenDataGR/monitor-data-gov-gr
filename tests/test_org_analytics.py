"""Phase 1 of the org-analytics feature: the daily snapshot builder
(app._do_build_org_snapshots / _rollup_check_by_org / _latest_org_snapshots)
and the /api/org-analytics/... routes built on top of it.
"""
import json
from datetime import datetime, timedelta, timezone

import app as appmod
from models import db, OrgClassification, OrgSnapshot, HvdDatasetCheckCache


def _superadmin_session():
    from flask import session
    session["user_id"] = 1
    session["is_admin"] = True
    session["is_superadmin"] = True


def _hvd_row(name, org_slug, conforms):
    return HvdDatasetCheckCache(
        name=name, metadata_modified="2026-01-01T00:00:00", org_slug=org_slug,
        result_json=json.dumps({
            "_cache_version": appmod._HVD_CHECK_VERSION,
            "result": {"name": name, "conforms": conforms},
        }),
    )


class TestDoBuildOrgSnapshots:
    def test_builds_one_snapshot_per_org_with_correct_pass_rates(self, app):
        appmod._orgs_cache["data"] = [
            {"name": "org-a", "title": "Org A", "package_count": 4},
            {"name": "org-b", "title": "Org B", "package_count": 2},
        ]
        db.session.add(OrgClassification(org_slug="org-a", org_title="Org A",
                                          category="ministry", heuristic_category="ministry"))
        db.session.add(OrgClassification(org_slug="org-b", org_title="Org B",
                                          category="municipality", heuristic_category="municipality"))
        db.session.add(_hvd_row("d1", "org-a", True))
        db.session.add(_hvd_row("d2", "org-a", False))
        db.session.add(_hvd_row("d3", "org-b", True))
        db.session.commit()

        appmod._do_build_org_snapshots()

        by_org = {s.org_slug: s for s in OrgSnapshot.query.all()}
        assert by_org["org-a"].hvd_checked == 2
        assert by_org["org-a"].hvd_conforms == 1
        assert by_org["org-a"].hvd_pass_rate == 0.5
        assert by_org["org-a"].org_category == "ministry"
        assert by_org["org-a"].dataset_count == 4

        assert by_org["org-b"].hvd_pass_rate == 1.0
        # org-b has no dcat rows checked at all -- pass_rate stays null, not 0.
        assert by_org["org-b"].dcat_checked == 0
        assert by_org["org-b"].dcat_pass_rate is None

    def test_skips_rows_with_no_org_slug_yet(self, app):
        appmod._orgs_cache["data"] = [{"name": "org-a", "title": "Org A", "package_count": 1}]
        db.session.add(_hvd_row("unbackfilled", None, True))
        db.session.commit()

        appmod._do_build_org_snapshots()

        snap = OrgSnapshot.query.filter_by(org_slug="org-a").first()
        assert snap.hvd_checked == 0
        assert snap.hvd_pass_rate is None

    def test_empty_orgs_cache_is_a_noop(self, app):
        appmod._orgs_cache["data"] = []
        appmod._do_build_org_snapshots()
        assert OrgSnapshot.query.count() == 0


class TestLatestOrgSnapshots:
    def test_only_returns_most_recent_batch(self, app):
        old_ts = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=1)
        new_ts = datetime.now(timezone.utc).replace(tzinfo=None)
        db.session.add(OrgSnapshot(computed_at=old_ts, org_slug="org-a", dataset_count=1))
        db.session.add(OrgSnapshot(computed_at=new_ts, org_slug="org-a", dataset_count=2))
        db.session.add(OrgSnapshot(computed_at=new_ts, org_slug="org-b", dataset_count=5))
        db.session.commit()

        latest = appmod._latest_org_snapshots()
        assert {s.org_slug: s.dataset_count for s in latest} == {"org-a": 2, "org-b": 5}

    def test_no_snapshots_returns_empty_list(self, app):
        assert appmod._latest_org_snapshots() == []


def _seed_two_ministries_one_municipality():
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    db.session.add(OrgSnapshot(computed_at=now, org_slug="min-a", org_title="Ministry A",
                                org_category="ministry", dataset_count=10,
                                hvd_checked=10, hvd_conforms=8, hvd_pass_rate=0.8))
    db.session.add(OrgSnapshot(computed_at=now, org_slug="min-b", org_title="Ministry B",
                                org_category="ministry", dataset_count=4,
                                hvd_checked=4, hvd_conforms=1, hvd_pass_rate=0.25))
    db.session.add(OrgSnapshot(computed_at=now, org_slug="muni-a", org_title="Municipality A",
                                org_category="municipality", dataset_count=2,
                                hvd_checked=0, hvd_pass_rate=None))
    db.session.commit()


class TestScorecardRoute:
    def test_404_when_no_snapshot_exists(self, app):
        with app.test_request_context("/api/org-analytics/nope/scorecard"):
            resp = appmod.org_analytics_scorecard("nope")
        assert resp[1] == 404

    def test_scorecard_reports_portal_avg_and_percentile(self, app):
        _seed_two_ministries_one_municipality()
        with app.test_request_context("/api/org-analytics/min-a/scorecard"):
            data = appmod.org_analytics_scorecard("min-a").get_json()

        assert data["snapshot"]["org_slug"] == "min-a"
        # portal avg over 2 orgs with a non-null hvd_pass_rate: (0.8+0.25)/2
        assert data["portal_avg"]["hvd_pass_rate"] == 0.525
        # min-a's 0.8 is the highest of the two non-null rates -> 100th percentile
        assert data["percentile"]["hvd_pass_rate"] == 100.0


class TestPeerComparisonRoute:
    def test_peer_avg_excludes_self_and_other_categories(self, app):
        _seed_two_ministries_one_municipality()
        with app.test_request_context("/api/org-analytics/min-a/peer-comparison"):
            data = appmod.org_analytics_peer_comparison("min-a").get_json()

        assert data["category"] == "ministry"
        assert data["peer_count"] == 1
        assert data["peer_avg"]["hvd_pass_rate"] == 0.25  # only min-b, not muni-a or itself


class TestTrendRoute:
    def test_trend_returns_full_history_in_order(self, app):
        t1 = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2)
        t2 = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=1)
        db.session.add(OrgSnapshot(computed_at=t2, org_slug="org-a", dataset_count=5))
        db.session.add(OrgSnapshot(computed_at=t1, org_slug="org-a", dataset_count=3))
        db.session.commit()

        with app.test_request_context("/api/org-analytics/org-a/trend"):
            data = appmod.org_analytics_trend("org-a").get_json()

        assert [row["dataset_count"] for row in data["trend"]] == [3, 5]


class TestCategoriesRoute:
    def test_categories_grouped_with_averages(self, app):
        _seed_two_ministries_one_municipality()
        with app.test_request_context("/api/org-analytics/categories"):
            data = appmod.org_analytics_categories().get_json()

        by_cat = {c["category"]: c for c in data["categories"]}
        assert by_cat["ministry"]["org_count"] == 2
        assert by_cat["ministry"]["hvd_pass_rate_avg"] == 0.525
        assert by_cat["municipality"]["org_count"] == 1
        assert by_cat["municipality"]["hvd_pass_rate_avg"] is None


class TestClassificationOverrideRoutes:
    def test_list_requires_superadmin(self, app):
        with app.test_request_context("/api/org-analytics/classifications"):
            resp = appmod.org_analytics_classifications()
        assert resp[1] == 403

    def test_set_override_requires_superadmin(self, app):
        db.session.add(OrgClassification(org_slug="org-a", org_title="Org A",
                                          category="other", heuristic_category="other"))
        db.session.commit()
        body = json.dumps({"category": "ministry"}).encode()
        with app.test_request_context("/api/org-analytics/classifications/org-a/override",
                                       method="POST", data=body, content_type="application/json"):
            resp = appmod.org_analytics_set_override("org-a")
        assert resp[1] == 403

    def test_set_override_updates_category_and_flags_override(self, app):
        db.session.add(OrgClassification(org_slug="org-a", org_title="Org A",
                                          category="other", heuristic_category="other"))
        db.session.commit()
        body = json.dumps({"category": "ministry"}).encode()
        with app.test_request_context("/api/org-analytics/classifications/org-a/override",
                                       method="POST", data=body, content_type="application/json"):
            _superadmin_session()
            data = appmod.org_analytics_set_override("org-a").get_json()

        assert data["category"] == "ministry"
        assert data["is_override"] is True
        row = OrgClassification.query.get("org-a")
        assert row.category == "ministry"
        assert row.heuristic_category == "other"  # heuristic value itself untouched
        assert row.overridden_by_user_id == 1

    def test_set_override_rejects_unknown_category(self, app):
        db.session.add(OrgClassification(org_slug="org-a", org_title="Org A",
                                          category="other", heuristic_category="other"))
        db.session.commit()
        body = json.dumps({"category": "not-a-real-category"}).encode()
        with app.test_request_context("/api/org-analytics/classifications/org-a/override",
                                       method="POST", data=body, content_type="application/json"):
            _superadmin_session()
            resp = appmod.org_analytics_set_override("org-a")
        assert resp[1] == 400

    def test_clear_override_reverts_to_heuristic_category(self, app):
        db.session.add(OrgClassification(org_slug="org-a", org_title="Org A",
                                          category="ministry", heuristic_category="municipality",
                                          is_override=True, overridden_by_user_id=1))
        db.session.commit()
        with app.test_request_context("/api/org-analytics/classifications/org-a/override",
                                       method="DELETE"):
            _superadmin_session()
            data = appmod.org_analytics_clear_override("org-a").get_json()

        assert data["category"] == "municipality"
        assert data["is_override"] is False
        row = OrgClassification.query.get("org-a")
        assert row.overridden_by_user_id is None
