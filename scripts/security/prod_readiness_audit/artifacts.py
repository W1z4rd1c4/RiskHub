from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from prod_readiness_audit.run_state import ProdReadinessRunState, plan_inputs


@dataclass(frozen=True)
class ProdReadinessArtifactPayload:
    data: dict[str, Any]


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8"
    )


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def build_run_status(
    state: ProdReadinessRunState, *, status: str, exit_code: int
) -> dict[str, object]:
    return {
        "run_id": state.run_id,
        "status": status,
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "artifact_root": str(state.artifact_root),
        "report": str(state.report_path),
        "report_artifact": str(state.report_artifact_path),
        "matrix": str(state.matrix_json),
        "exit_code": exit_code,
        "required_failures": state.required_failures,
        "completed_command_count": len(state.command_results),
        "planned_command_count": len(state.planned_command_ids),
        "planned_command_ids": state.planned_command_ids,
        "plan_inputs": plan_inputs(state),
        "planned_run_complete": state.planned_run_complete,
    }


def _last_failed_required_command_id(
    state: ProdReadinessRunState,
) -> str | None:
    return next(
        (
            str(row["id"])
            for row in reversed(state.command_results)
            if bool(row.get("required"))
            and type(row.get("rc")) is int
            and row["rc"] != 0
        ),
        None,
    )


def write_incomplete_artifacts(
    state: ProdReadinessRunState,
    *,
    exit_code: int,
    status: str,
    failure_classification: str = "audit_harness",
    failure_code: str = "incomplete_run",
    failure_command_id: str | None = None,
) -> None:
    write_json(state.matrix_json, state.command_results)
    failure = {
        "failure_classification": failure_classification,
        "failure_code": failure_code,
        "failure_command_id": (
            failure_command_id or _last_failed_required_command_id(state)
        ),
    }
    finding = {
        "id": "prod-readiness-audit-incomplete",
        "severity": "High",
        "surface": (
            "host"
            if failure["failure_classification"] == "environment_contamination"
            else "prod-readiness"
        ),
        "classification": (
            "environment-only issue"
            if failure["failure_classification"] == "environment_contamination"
            else "audit-harness issue"
        ),
        "summary": "The local production-readiness audit did not reach planned completion, but partial evidence was preserved.",
        "artifact_root": str(state.artifact_root),
        "run_status": str(state.run_status_json),
        "exit_code": exit_code,
        "required_failures": state.required_failures,
        **failure,
    }
    write_json(
        state.reports_dir / "findings.json",
        {
            "run_id": state.run_id,
            "generated_at_utc": datetime.now(UTC).isoformat(),
            "open_high_critical_count": 1,
            "findings": [finding],
        },
    )
    write_json(
        state.reports_dir / "scorecard.json",
        [
            {
                "domain": "audit completion",
                "status": "failed",
                "score_0_to_5": 0 if status == "aborted" else 1,
                "evidence": [str(state.matrix_json)],
            }
        ],
    )
    run_status = build_run_status(state, status=status, exit_code=exit_code)
    run_status.update(failure)
    write_json(state.run_status_json, run_status)
    write_json(
        state.artifact_root / "SUMMARY.json",
        {
            "run_id": state.run_id,
            "status": status,
            "artifact_root": str(state.artifact_root),
            "required_failures": state.required_failures,
            "open_high_critical_count": 1,
            "matrix": str(state.matrix_json),
            "findings": str(state.reports_dir / "findings.json"),
            "scorecard": str(state.reports_dir / "scorecard.json"),
            "report": str(state.report_artifact_path),
            "run_status": str(state.run_status_json),
            **failure,
        },
    )
    write_text(
        state.report_artifact_path,
        "\n".join(
            [
                f"# Production Readiness Audit ({state.run_id})",
                "",
                f"- Status: **{status}**",
                f"- Failure classification: **{failure['failure_classification']}**",
                f"- Failure command: `{failure['failure_command_id']}`",
                f"- Required failures: `{state.required_failures}`",
                f"- Command matrix: `{state.matrix_json}`",
                f"- Run status: `{state.run_status_json}`",
                f"- Findings: `{state.reports_dir / 'findings.json'}`",
                f"- Scorecard: `{state.reports_dir / 'scorecard.json'}`",
                "",
            ]
        ),
    )
