"""Shared pytest fixtures.

app.py binds its real SQLAlchemy engine at IMPORT time (a startup
migration block runs immediately inside `if _is_main_process(): with
app.app_context(): db.create_all() ...`), so DATABASE_URL must be pointed
at an isolated, throwaway file *before* `import app` ever runs -- setting
app.config['SQLALCHEMY_DATABASE_URI'] afterward has no effect, and doing
nothing means every test run silently reads/writes the real local
instance/dashboard.db.
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_TEST_DB_PATH = os.path.join(tempfile.gettempdir(), "monitor_pytest.db")
if os.path.exists(_TEST_DB_PATH):
    os.remove(_TEST_DB_PATH)
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB_PATH}"
os.environ.setdefault("FLASK_SECRET_KEY", "test-secret-key-not-for-production")

import pytest  # noqa: E402

import app as appmod  # noqa: E402
from models import db  # noqa: E402


@pytest.fixture(autouse=True)
def _isolated_db():
    """Wipes and recreates every table before each test, so tests never see
    each other's data despite sharing one on-disk test database file (a
    real file, not :memory:, since SQLite's :memory: databases don't
    reliably share state across the connections Flask-SQLAlchemy's pool
    may open)."""
    with appmod.app.app_context():
        db.drop_all()
        db.create_all()
        yield
        db.session.remove()


@pytest.fixture
def app():
    """The Flask app, with an active application context for the test."""
    with appmod.app.app_context():
        yield appmod.app
