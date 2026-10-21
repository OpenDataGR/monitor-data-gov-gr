"""/health is the deploy smoke test's target: unauthenticated, and it must
really touch the DB (systemd's is-active alone proves nothing about that)."""


def test_health_is_public_and_ok(app):
    r = app.test_client().get("/health")
    assert r.status_code == 200 and r.get_json() == {"status": "ok"}
