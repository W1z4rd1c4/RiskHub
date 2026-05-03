from __future__ import annotations

import argparse
from datetime import UTC, datetime

from release_parity_audit.audit import ReleaseParityAudit


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run release parity audit")
    parser.add_argument(
        "--run-id",
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
    audit = ReleaseParityAudit(run_id=args.run_id, run_prod_readiness=not args.skip_prod_readiness)
    audit.run()
    print(str(audit.artifact_root))
    return 0
