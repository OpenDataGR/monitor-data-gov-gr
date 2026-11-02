"""One-off: rewrite the stored DCAT-AP / GeoDCAT-AP whole-run results without per-dataset violation details.

    venv/bin/python tools/slim_check_blobs.py --dry-run     # show what would change
    venv/bin/python tools/slim_check_blobs.py               # do it

Before 2026-11-02 the stored DCAT-AP result carried every dataset's violation `details` (141 MB as one JSON,
parsed in full by a web worker on every view of the tab). New runs store slim rows (see app._slim_row) and keep the
details only in the per-dataset cache rows; this brings the CURRENT stored results to the same shape without
waiting for the next full run. It reads the old blob once (peak well under 2 GB, in this short-lived process),
precomputes the per-property violation totals the EU comparison needs, and rewrites the row. The result is derived
data: a normal run regenerates it, and the per-dataset cache rows are not touched."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import app as appmod  # noqa: E402
from models import db  # noqa: E402


def slim_stored_results(dry_run=False, kinds=("dcat", "geodcat")):
    """Returns [(kind, bytes_before, bytes_after)] -- bytes_after == bytes_before when nothing needed changing."""
    report = []
    with appmod.app.app_context():
        for kind in kinds:
            cfg = appmod._QUALITY_CHECKS[kind]
            row = cfg["cache_model"].query.get(1)
            if not row or not row.data_json:
                continue
            before = len(row.data_json)
            result = json.loads(row.data_json)
            datasets = result.get("datasets") or []
            needs_slim = any("details" in d for d in datasets)
            needs_props = bool(cfg.get("aggregate_violations")) and "violation_properties" not in result
            if not (needs_slim or needs_props):
                report.append((kind, before, before))
                continue
            if cfg.get("aggregate_violations"):
                agg = appmod._new_violation_agg()
                for d in datasets:
                    appmod._accumulate_violation_props(agg, d.get("details"))
                result["violation_properties"] = agg["props"]
                result["datasets_with_violations"] = agg["datasets_with"]
            result["datasets"] = [appmod._slim_row(d) if "details" in d else d for d in datasets]
            new = json.dumps(result)
            if not dry_run:
                row.data_json = new
                db.session.commit()
            report.append((kind, before, len(new)))
    return report


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    for kind, before, after in slim_stored_results(dry_run=dry):
        note = "unchanged" if before == after else ("would become" if dry else "now")
        print(f"{kind}: {before / 1e6:.1f} MB -> {note} {after / 1e6:.1f} MB")
