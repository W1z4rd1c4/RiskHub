from __future__ import annotations

import argparse
import sys
from pathlib import Path

from prod_readiness_audit.artifacts import write_incomplete_artifacts
from prod_readiness_audit.commands import run_command, write_command_matrix
from prod_readiness_audit.phases import build_prod_readiness_phases
from prod_readiness_audit.run_state import build_run_state
from prod_readiness_audit.scoring import write_final_artifacts


ROOT_DIR = Path(__file__).resolve().parents[3]


def run_prod_readiness_audit(*, run_id: str | None = None) -> int:
    state = build_run_state(root_dir=ROOT_DIR, run_id=run_id)
    state.ensure_directories()
    try:
        for phase in build_prod_readiness_phases(state):
            for command in phase.commands:
                run_command(state, command)
        write_command_matrix(state)
        return write_final_artifacts(state)
    except BaseException:
        status = "partial" if state.command_results or state.required_failures else "aborted"
        write_incomplete_artifacts(state, exit_code=1, status=status)
        raise


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run production-readiness audit")
    parser.add_argument("--run-id", default=None)
    args = parser.parse_args(argv)
    return run_prod_readiness_audit(run_id=args.run_id)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
