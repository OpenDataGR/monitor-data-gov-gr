#!/usr/bin/env python3
"""One-time migration: copy all data from dashboard.db (SQLite) to PostgreSQL.

Steps:
  1. Set DATABASE_URL=postgresql://user:pass@host:5432/dbname in .env
  2. Run:  python migrate_sqlite_to_postgres.py
  3. Verify, then restart the app — it will use PostgreSQL automatically.
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

PG_URL = os.environ.get("DATABASE_URL", "").strip()
if not PG_URL:
    sys.exit("ERROR: DATABASE_URL is not set. Add it to .env first.")
if PG_URL.startswith("postgres://"):
    PG_URL = PG_URL.replace("postgres://", "postgresql://", 1)
if "sqlite" in PG_URL:
    sys.exit("ERROR: DATABASE_URL must point to PostgreSQL, not SQLite.")

SQLITE_PATH = Path(__file__).parent / "instance" / "dashboard.db"
if not SQLITE_PATH.exists():
    sys.exit(f"ERROR: SQLite database not found at {SQLITE_PATH}")

from sqlalchemy import create_engine, text
from app import app
from models import db

masked = PG_URL[:PG_URL.index("@") + 1] + "***" if "@" in PG_URL else PG_URL
print(f"Source : sqlite:///{SQLITE_PATH}")
print(f"Target : {masked}\n")

sqlite_engine = create_engine(f"sqlite:///{SQLITE_PATH}")
pg_engine     = create_engine(PG_URL)

# Create all tables in PostgreSQL
with app.app_context():
    db.create_all()
    print("Tables ensured in PostgreSQL.\n")

TABLES = [
    ("health_checks",     ["id", "timestamp", "endpoint_name", "endpoint_url",
                            "response_time_ms", "status_code", "is_up", "error_message"]),
    ("portal_snapshots",  ["id", "timestamp", "total_datasets", "total_organizations",
                            "total_resources", "total_services"]),
    ("communications",    ["id", "created_at", "contact_date", "org_name", "org_title",
                            "subject", "status", "notes"]),
]

BOOL_FIELDS = {"is_up"}

with sqlite_engine.connect() as src, pg_engine.begin() as dst:
    for table, cols in TABLES:
        col_str = ", ".join(cols)
        rows = src.execute(text(f"SELECT {col_str} FROM {table}")).mappings().fetchall()
        if not rows:
            print(f"  {table}: 0 rows (skipped)")
            continue
        # SQLite stores booleans as 0/1; PostgreSQL needs True/False
        data = []
        for r in rows:
            row = dict(r)
            for f in BOOL_FIELDS:
                if f in row and row[f] is not None:
                    row[f] = bool(row[f])
            data.append(row)
        placeholders = ", ".join(f":{c}" for c in cols)
        dst.execute(
            text(f"INSERT INTO {table} ({col_str}) VALUES ({placeholders}) ON CONFLICT (id) DO NOTHING"),
            data,
        )
        print(f"  {table}: {len(rows)} rows migrated")

# Reset PostgreSQL sequences so new rows don't collide with inserted IDs
with pg_engine.begin() as conn:
    for table, _ in TABLES:
        conn.execute(text(
            f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
            f"COALESCE((SELECT MAX(id) FROM {table}), 0) + 1, false)"
        ))
print("\nSequences reset.")
print("\nMigration complete. Restart the app — it will use PostgreSQL going forward.")
