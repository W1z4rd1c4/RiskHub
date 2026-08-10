from __future__ import annotations

import argparse
from datetime import UTC, datetime

from release_parity_audit.audit import ReleaseParityAudit
from release_parity_audit.decision import release_decision_exit_code
from release_parity_audit.run_state import validate_run_id


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run release parity audit")
    parser.add_argument(
        "--run-id",
        type=validate_run_id,
        default=datetime.now(UTC).strftime("%Y%m%d-%H%M%S"),
        help="Run identifier suffix (default: UTC timestamp)",
    )
    parser.add_argument(
        "--skip-prod-readiness",
        action="store_true",
        help=(
            "Skip executing run_prod_readiness_audit_local.sh in isolated worktree and ingest latest existing "
            "artifact instead."
        ),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    audit = ReleaseParityAudit(
        run_id=args.run_id, run_prod_readiness=not args.skip_prod_readiness
    )
    audit.run()
    print(str(audit.artifact_root))
    return release_decision_exit_code(audit.decision)
