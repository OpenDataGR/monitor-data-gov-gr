"""Run once on the server to insert sample communication records.
   python seed_comms.py
"""
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from app import app
from models import db, Communication

SAMPLES = [
    dict(contact_date="2026-01-14", org_name="ministry-of-finance",        org_title="Υπουργείο Οικονομικών",                   subject="Δεδομένα εκτέλεσης προϋπολογισμού 2025",          status="Uploaded",     medium="Email",      notes="Ζητήθηκαν μηνιαία αρχεία CSV. Ανέβηκαν εγκαίρως."),
    dict(contact_date="2026-02-03", org_name="elstat",                      org_title="Ελληνική Στατιστική Αρχή (ΕΛΣΤΑΤ)",        subject="Αναλυτικά αποτελέσματα απογραφής 2021",            status="Uploaded",     medium="Email",      notes="Παρεδόθησαν σε μορφή XLSX και JSON."),
    dict(contact_date="2026-02-20", org_name="ministry-of-health",          org_title="Υπουργείο Υγείας",                         subject="Νοσηλείες ανά νοσοκομείο Α' τρίμηνο 2026",         status="Responded",    medium="Telephone",  notes="Επιβεβαίωσαν ότι τα δεδομένα είναι υπό επεξεργασία. Αναμένεται Ιούλιος."),
    dict(contact_date="2026-03-05", org_name="ministry-of-environment",     org_title="Υπουργείο Περιβάλλοντος & Ενέργειας",     subject="Μετρήσεις ποιότητας αέρα 2025",                    status="No Response",  medium="Email",      notes="Δεύτερη υπενθύμιση στις 2026-04-10. Αναμένουμε απάντηση."),
    dict(contact_date="2026-03-18", org_name="ministry-of-education",       org_title="Υπουργείο Παιδείας",                       subject="Εγγραφές μαθητών ανά βαθμίδα 2025-26",             status="Uploaded",     medium="Email",      notes=""),
    dict(contact_date="2026-04-02", org_name="aade",                        org_title="ΑΑΔΕ",                                     subject="Φορολογικά έσοδα Δ' τριμήνου 2025",                status="Responded",    medium="Email",      notes="Ζητήθηκε διευκρίνιση για τη μορφή δεδομένων. Εστάλη template."),
    dict(contact_date="2026-04-15", org_name="city-of-athens",              org_title="Δήμος Αθηναίων",                           subject="Άδειες δόμησης 2024",                               status="No Response",  medium="Telephone",  notes=""),
    dict(contact_date="2026-04-28", org_name="hellenic-police",             org_title="Ελληνική Αστυνομία",                       subject="Στατιστικά τροχαίων ατυχημάτων 2025",              status="Contacted",    medium="In Person",  notes="Επικοινωνία με Δ/νση Πληροφορικής."),
    dict(contact_date="2026-05-06", org_name="dypa",                        org_title="ΔΥΠΑ",                                     subject="Ανεργία ανά περιφέρεια και ηλικιακή ομάδα",        status="Responded",    medium="Telephone",  notes="Θα παράσχουν τριμηνιαία δεδομένα από Ιούλιο."),
    dict(contact_date="2026-05-19", org_name="ministry-of-infrastructure",  org_title="Υπουργείο Υποδομών & Μεταφορών",          subject="Κυκλοφοριακός φόρτος εθνικού οδικού δικτύου",      status="Contacted",    medium="Email",      notes=""),
    dict(contact_date="2026-06-02", org_name="eody",                        org_title="ΕΟΔΥ",                                     subject="Εβδομαδιαία επιδημιολογικά δεδομένα 2026",         status="Uploaded",     medium="Email",      notes="Συμφωνήθηκε αυτόματη τροφοδοσία μέσω API."),
    dict(contact_date="2026-06-10", org_name="ministry-of-digital-gov",     org_title="Υπουργείο Ψηφιακής Διακυβέρνησης",        subject="Δείκτες ψηφιακής διακυβέρνησης 2025",              status="Contacted",    medium="In Person",  notes="Εσωτερικό αίτημα προς Δ/νση Ηλεκτρονικής Διακυβέρνησης."),
]

with app.app_context():
    existing = Communication.query.count()
    if existing:
        print(f"Already have {existing} records — skipping seed to avoid duplicates.")
    else:
        for s in SAMPLES:
            db.session.add(Communication(**s))
        db.session.commit()
        print(f"Inserted {len(SAMPLES)} sample communication records.")
