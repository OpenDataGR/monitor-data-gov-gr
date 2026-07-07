"""Run once on the server to bootstrap the first admin account (there's no other
   way in once the shared password is gone — every other account is created via
   the in-app "Manage Users" invite flow, which requires an existing admin).

   python create_admin.py someone@example.gov.gr "Full Name"
"""
import sys
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from app import app, _send_password_link
from models import db, User

if len(sys.argv) < 2:
    print(f"Usage: python {sys.argv[0]} <email> [name]")
    sys.exit(1)

email = sys.argv[1].strip().lower()
name = sys.argv[2].strip() if len(sys.argv) > 2 else None

with app.app_context():
    user = User.query.filter_by(email=email).first()
    if user:
        print(f"User {email} already exists (admin={user.is_admin}) — sending a fresh set-password link.")
        user.is_admin = True
    else:
        user = User(email=email, name=name, is_admin=True)
        db.session.add(user)
        db.session.commit()
        print(f"Created admin user {email}.")

    link = _send_password_link(user, kind="invite")
    print(f"Set-password link (valid 24h): {link}")
    print("Use this link even if the email doesn't arrive — SendGrid may not be configured yet.")
