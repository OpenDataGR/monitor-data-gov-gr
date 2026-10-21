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

# One DB file per pytest-xdist worker ("gw0", "gw1", ...; "main" without xdist) so
# parallel workers (`pytest -n 2`, as CI runs) never share or wipe each other's data.
_WORKER = os.environ.get("PYTEST_XDIST_WORKER", "main")
_TEST_DB_PATH = os.path.join(tempfile.gettempdir(), f"monitor_pytest_{_WORKER}.db")
if os.path.exists(_TEST_DB_PATH):
    os.remove(_TEST_DB_PATH)
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB_PATH}"
os.environ.setdefault("FLASK_SECRET_KEY", "test-secret-key-not-for-production")

import sqlite3  # noqa: E402

import pytest  # noqa: E402
from sqlalchemy import event  # noqa: E402
from sqlalchemy.engine import Engine  # noqa: E402

import app as appmod  # noqa: E402
from models import db  # noqa: E402


@event.listens_for(Engine, "connect")
def _throwaway_databases_do_not_wait_for_the_disk(dbapi_connection, _record):
    """The test DB is recreated for every test and never read back after a crash,
    so it needn't wait for the disk to confirm each write (borrowed from
    loader.data.gov.gr's conftest). Only this test process is affected."""
    if isinstance(dbapi_connection, sqlite3.Connection):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA synchronous=OFF")
        cursor.execute("PRAGMA journal_mode=MEMORY")
        cursor.close()


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
