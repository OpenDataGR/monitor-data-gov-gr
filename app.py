from flask import Flask, render_template, request, redirect
from models import db, User

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///myapp.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)

with app.app_context():
    db.create_all()  # creates tables on first run

@app.route("/")
def index():
    users = User.query.all()
    return render_template("index.html", users=users)

@app.route("/add", methods=["POST"])
def add_user():
    name = request.form["name"]
    email = request.form["email"]
    user = User(name=name, email=email)
    db.session.add(user)
    db.session.commit()
    return redirect("/")

if __name__ == "__main__":
    app.run(debug=True)
