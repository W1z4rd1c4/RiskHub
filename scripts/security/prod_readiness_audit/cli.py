from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

from prod_readiness_audit.artifacts import write_incomplete_artifacts
from prod_readiness_audit.commands import (
    EnvironmentBlocked,
    run_command,
    write_command_matrix,
)
from prod_readiness_audit.phases import build_prod_readiness_phases
from prod_readiness_audit.run_state import build_run_state, validate_run_id
from prod_readiness_audit.scoring import write_final_artifacts


ROOT_DIR = Path(__file__).resolve().parents[3]


def _run_cleanup_phase(state, phases) -> None:
    resource_started = any(
        row.get("id") in {"p3_start_postgres", "p3_start_registry"}
        and row.get("rc") == 0
        for row in state.command_results
    )
    if not resource_started:
        return
    cleanup_phase = next((phase for phase in phases if phase.name == "cleanup"), None)
    if cleanup_phase is None:
        return
    for command in cleanup_phase.commands:
        run_command(state, command)


def _resolve_python_executable(python_bin: str | None) -> str:
    requested = python_bin or "python3.13"
    resolved = shutil.which(requested)
    return str(Path(resolved).resolve()) if resolved else requested


def run_prod_readiness_audit(
    *, run_id: str | None = None, python_bin: str | None = None
) -> int:
    state = build_run_state(root_dir=ROOT_DIR, run_id=run_id)
    state.python_executable = _resolve_python_executable(python_bin)
    state.ensure_directories()
    phases = []
    try:
        phases = build_prod_readiness_phases(state)
        state.planned_command_ids = [
            command.command_id for phase in phases for command in phase.commands
        ]
        for phase in phases:
            for command in phase.commands:
                run_command(state, command)
        write_command_matrix(state)
        return write_final_artifacts(state)
    except EnvironmentBlocked as exc:
        _run_cleanup_phase(state, phases)
        write_incomplete_artifacts(
            state,
            exit_code=1,
            status="partial",
            failure_classification="environment_contamination",
            failure_code=exc.failure_code,
            failure_command_id=exc.command_id,
        )
        return 1
    except BaseException:
        _run_cleanup_phase(state, phases)
        status = (
            "partial" if state.command_results or state.required_failures else "aborted"
        )
        write_incomplete_artifacts(
            state,
            exit_code=1,
            status=status,
            failure_classification="audit_harness",
            failure_code="incomplete_run",
        )
        raise


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run production-readiness audit")
    parser.add_argument("--run-id", default=None, type=validate_run_id)
    parser.add_argument("--python-bin", default=None)
    args = parser.parse_args(argv)
    return run_prod_readiness_audit(run_id=args.run_id, python_bin=args.python_bin)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
