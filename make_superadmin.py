"""Run once (locally or on the server) to grant superadmin to an existing --
   or brand new -- user. Superadmin implies admin, and additionally allows
   promoting/demoting other admins and deleting user accounts.

   python make_superadmin.py someone@example.gov.gr [name]
"""
import sys
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from app import app, _send_password_link
from models import db, User
import config

if len(sys.argv) < 2:
    print(f"Usage: python {sys.argv[0]} <email> [name]")
    sys.exit(1)

email = sys.argv[1].strip().lower()
name = sys.argv[2].strip() if len(sys.argv) > 2 else None

# A plain app_context() has no request to infer the host from, so
# _send_password_link's url_for(..., _external=True) would fail. A test
# request context anchored at the deployed URL gives it one.
with app.test_request_context(base_url=config.PUBLIC_BASE_URL):
    user = User.query.filter_by(email=email).first()
    if user:
        user.is_admin = True
        user.is_superadmin = True
        db.session.commit()
        if user.password_hash:
            print(f"{email} is now a superadmin. Account already has a password -- no invite link needed.")
        else:
            link = _send_password_link(user, kind="invite")
            print(f"{email} is now a superadmin. Set-password link (valid 24h): {link}")
    else:
        user = User(email=email, name=name, is_admin=True, is_superadmin=True)
        db.session.add(user)
        db.session.commit()
        link = _send_password_link(user, kind="invite")
        print(f"Created superadmin user {email}.")
        print(f"Set-password link (valid 24h): {link}")
        print("Use this link even if the email doesn't arrive -- SendGrid may not be configured yet.")
