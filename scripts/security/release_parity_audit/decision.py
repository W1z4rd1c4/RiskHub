from __future__ import annotations

import json
import re
from collections.abc import Callable
from pathlib import Path
from typing import Any

from prod_readiness_audit.phases import build_prod_readiness_phases
from prod_readiness_audit.run_state import build_plan_state


_REQUIRED_PROD_DRY_RUN_PATHS = {
    "deploy_cli_prod_docker",
    "backend_db_runtime_prod",
    "backend_runtime_prod",
    "frontend_runtime_prod",
    "compose_to_prod_lifecycle_boundary",
    "compose_cleanup_final",
}
_REQUIRED_FULL_RUNTIME_PATHS = {"dev_sh_full", "compose_sh_up_full"}
_REQUIRED_COMPOSE_SOURCE_IDENTITY_CONTAINERS = {
    "riskhub-backend",
    "riskhub-backend-scheduler-dev",
}
_REQUIRED_COMPONENT_RUNTIME_PATHS = {
    "backend_runtime_dev",
    "backend_runtime_test",
    "frontend_runtime_dev",
    "frontend_runtime_test",
}
_PROD_READINESS_DOCKER_HOST_COMMAND_IDS = {
    "p2_verify_prod_install_scripts",
    "p3_start_postgres",
    "p3_start_registry",
    "meta_docker_version",
    "meta_docker_info",
}
_DOCKER_HOST_FAILURE_MARKERS = (
    "cannot connect to the docker daemon",
    "docker daemon is unavailable",
    "docker daemon not reachable",
    "docker is required",
    "is the docker daemon running",
)
_DEPENDENCY_DOCKER_COMMAND_IDS = {
    "backend_image_build": "deps_build_backend_image",
    "backend_image": "deps_backend_image_versions",
}
_PYTHON_HOST_FAILURE_MARKERS = {
    "python313_unavailable": "riskhub_python313_unavailable",
    "python_version_unsupported": "riskhub_python313_version_unsupported",
}


def _prod_readiness_environment_contract(
    command_id: object, failure_code: object
) -> tuple[set[str], tuple[str, ...]] | None:
    if (
        isinstance(command_id, str)
        and command_id in _PROD_READINESS_DOCKER_HOST_COMMAND_IDS
        and failure_code == "docker_daemon_unavailable"
    ):
        return _PROD_READINESS_DOCKER_HOST_COMMAND_IDS, _DOCKER_HOST_FAILURE_MARKERS
    if command_id == "meta_python_version" and isinstance(failure_code, str):
        marker = _PYTHON_HOST_FAILURE_MARKERS.get(failure_code)
        if marker is not None:
            return {"meta_python_version"}, (marker,)
    return None


def _docker_dependency_environment_log(
    evidence_name: str, status: dict[str, Any], artifact_root: Path
) -> Path | None:
    command_id = _DEPENDENCY_DOCKER_COMMAND_IDS.get(evidence_name)
    command_log = status.get("command_log")
    if command_id is None or status.get("command_id") != command_id:
        return None
    if not isinstance(command_log, str):
        return None
    expected_log = (artifact_root / "logs" / f"{command_id}.log").resolve()
    if Path(command_log).resolve() != expected_log or not expected_log.is_file():
        return None
    try:
        log_text = expected_log.read_text(encoding="utf-8", errors="replace").lower()
    except OSError:
        return None
    return (
        expected_log
        if any(marker in log_text for marker in _DOCKER_HOST_FAILURE_MARKERS)
        else None
    )


def _docker_host_failure_log(command_log: object) -> Path | None:
    if not isinstance(command_log, str):
        return None
    log_path = Path(command_log)
    try:
        log_text = log_path.read_text(encoding="utf-8", errors="replace").lower()
    except OSError:
        return None
    return (
        log_path
        if any(marker in log_text for marker in _DOCKER_HOST_FAILURE_MARKERS)
        else None
    )


def release_decision_exit_code(decision: dict[str, Any]) -> int:
    return 0 if decision.get("decision") == "GO" else 1


def _read_json_evidence(path: Path) -> tuple[object | None, str | None]:
    try:
        return json.loads(path.read_text(encoding="utf-8")), None
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        return None, str(exc)


def _canonical_prod_readiness_command_specs(
    run_id: str, inputs: object
) -> list[dict[str, object]] | None:
    if not isinstance(inputs, dict):
        return None
    path_fields = ("root_dir", "artifact_root", "report_path")
    paths = {name: inputs.get(name) for name in path_fields}
    if any(
        not isinstance(value, str) or not value or not Path(value).is_absolute()
        for value in paths.values()
    ):
        return None
    report_date = inputs.get("report_date")
    if not isinstance(report_date, str) or not report_date:
        return None
    ports = {
        name: inputs.get(name)
        for name in (
            "postgres_port",
            "frontend_host_port",
            "registry_port",
            "security_probe_port",
        )
    }
    if any(
        type(value) is not int or not 1 <= value <= 65535 for value in ports.values()
    ):
        return None
    try:
        state = build_plan_state(
            root_dir=Path(paths["root_dir"]),
            run_id=run_id,
            report_date=report_date,
            artifact_root=Path(paths["artifact_root"]),
            report_path=Path(paths["report_path"]),
            postgres_port=ports["postgres_port"],
            frontend_host_port=ports["frontend_host_port"],
            registry_port=ports["registry_port"],
            security_probe_port=ports["security_probe_port"],
        )
    except ValueError:
        return None
    return [
        {
            "id": command.command_id,
            "command": command.command,
            "cwd": str((command.cwd or state.root_dir).resolve()),
            "required": command.required,
            "timeout_sec": command.timeout_sec,
        }
        for phase in build_prod_readiness_phases(state)
        for command in phase.commands
    ]


def _prod_readiness_evidence_error(
    fingerprint: dict[str, Any], summary: dict[str, Any], baseline_git_sha: object
) -> str | None:
    if (
        "source_worktree_removed" in fingerprint
        and fingerprint.get("source_worktree_removed") is not True
    ):
        return "production-readiness source worktree cleanup failed"
    child_git_sha = fingerprint.get("prod_readiness_git_sha")
    child_git_sha_error = fingerprint.get("prod_readiness_git_sha_error")
    if child_git_sha_error:
        return str(child_git_sha_error)
    if (
        not isinstance(baseline_git_sha, str)
        or re.fullmatch(r"[0-9a-f]{40}", baseline_git_sha) is None
    ):
        return "selected release baseline does not contain one full 40-hex commit SHA"
    if (
        not isinstance(child_git_sha, str)
        or re.fullmatch(r"[0-9a-f]{40}", child_git_sha) is None
    ):
        return "production-readiness evidence is missing its full 40-hex commit SHA"
    if child_git_sha != baseline_git_sha:
        return "production-readiness evidence commit does not match the selected release baseline"

    copied_to = fingerprint.get("copied_to")
    if not isinstance(copied_to, str):
        return "missing copied production-readiness artifact path"
    artifact_root = Path(copied_to).resolve()
    if not artifact_root.is_dir() or summary.get("artifact_root") != str(artifact_root):
        return "production-readiness artifact root is missing or inconsistent"
    git_status_error = _prod_readiness_git_status_error(fingerprint, artifact_root)
    if git_status_error is not None:
        return git_status_error

    evidence_paths: dict[str, Path] = {}
    for key, relative_path in {
        "matrix": Path("reports/command-matrix.json"),
        "findings": Path("reports/findings.json"),
        "scorecard": Path("reports/scorecard.json"),
        "report": Path("reports/report.md"),
        "run_status": Path("reports/run_status.json"),
    }.items():
        value = summary.get(key)
        expected_path = (artifact_root / relative_path).resolve()
        if not isinstance(value, str) or Path(value).resolve() != expected_path:
            return f"production-readiness {key} pointer is outside the copied artifact"
        if (
            not expected_path.is_relative_to(artifact_root)
            or not expected_path.is_file()
        ):
            return f"production-readiness {key} evidence is missing"
        evidence_paths[key] = expected_path

    run_status, run_status_error = _read_json_evidence(evidence_paths["run_status"])
    if run_status_error or not isinstance(run_status, dict):
        return "production-readiness run status is not a JSON object"
    run_id = summary.get("run_id")
    run_rc = fingerprint.get("run_rc")
    if not isinstance(run_id, str) or not run_id or run_status.get("run_id") != run_id:
        return "production-readiness run identity is missing or inconsistent"
    if summary.get("status") != "complete" or run_status.get("status") != "complete":
        return "production-readiness run status is not complete"
    if run_status.get("planned_run_complete") is not True:
        return "production-readiness planned run is incomplete"
    if type(run_rc) is not int or type(run_status.get("exit_code")) is not int:
        return "production-readiness run exit code is invalid"
    if run_status["exit_code"] != run_rc:
        return "production-readiness run status disagrees with the observed exit code"
    if run_rc != 0:
        return "production-readiness run status did not pass"
    if run_status.get("artifact_root") != str(artifact_root):
        return "production-readiness run status artifact root is inconsistent"
    for key, expected_path in {
        "matrix": evidence_paths["matrix"],
        "report": evidence_paths["report"],
        "report_artifact": evidence_paths["report"],
    }.items():
        value = run_status.get(key)
        if not isinstance(value, str) or Path(value).resolve() != expected_path:
            return f"production-readiness run status {key} pointer is outside the copied artifact"

    matrix, matrix_error = _read_json_evidence(evidence_paths["matrix"])
    if matrix_error or not isinstance(matrix, list) or not matrix:
        return "production-readiness command matrix is not a JSON array"
    canonical_specs = _canonical_prod_readiness_command_specs(
        run_id, run_status.get("plan_inputs")
    )
    if canonical_specs is None or len(matrix) != len(canonical_specs):
        return "production-readiness command matrix is incomplete or disagrees with the canonical command plan"
    matrix_ids: list[str] = []
    plan_inputs = run_status.get("plan_inputs")
    if not isinstance(plan_inputs, dict):
        return "production-readiness command plan inputs are invalid"
    source_artifact_root = Path(str(plan_inputs["artifact_root"]))
    for row, expected in zip(matrix, canonical_specs, strict=True):
        if (
            not isinstance(row, dict)
            or not isinstance(row.get("id"), str)
            or not row["id"]
            or not isinstance(row.get("command"), str)
            or not isinstance(row.get("cwd"), str)
            or type(row.get("required")) is not bool
            or type(row.get("timeout_sec")) is not int
            or type(row.get("rc")) is not int
            or not isinstance(row.get("log"), str)
            or not isinstance(row.get("result"), str)
            or type(row.get("timed_out")) is not bool
        ):
            return "production-readiness command matrix contains an invalid result"
        actual = {
            "id": row["id"],
            "command": row["command"],
            "cwd": str(Path(row["cwd"]).resolve()),
            "required": row["required"],
            "timeout_sec": row["timeout_sec"],
        }
        if actual != expected:
            return "production-readiness command matrix disagrees with the canonical command plan"
        expected_source_log = (
            source_artifact_root / "logs" / f"{row['id']}.log"
        ).resolve()
        if Path(row["log"]).resolve() != expected_source_log:
            return "production-readiness command matrix contains invalid log evidence"
        copied_log = (artifact_root / "logs" / f"{row['id']}.log").resolve()
        if not copied_log.is_relative_to(artifact_root) or not copied_log.is_file():
            return "production-readiness command matrix contains invalid log evidence"
        try:
            with copied_log.open(encoding="utf-8") as handle:
                first_log_line = handle.readline().rstrip("\n")
        except (OSError, UnicodeError):
            return "production-readiness command matrix contains invalid log evidence"
        if first_log_line != f"$ {row['command']}":
            return "production-readiness command matrix contains invalid log evidence"
        copied_result = (artifact_root / "logs" / f"{row['id']}.result.json").resolve()
        if (
            Path(row["result"]).resolve() != copied_result
            or not copied_result.is_relative_to(artifact_root)
            or not copied_result.is_file()
        ):
            return (
                "production-readiness command matrix contains invalid result evidence"
            )
        result, result_error = _read_json_evidence(copied_result)
        if (
            result_error
            or not isinstance(result, dict)
            or result.get("id") != row["id"]
            or result.get("command") != row["command"]
            or type(result.get("rc")) is not int
            or result["rc"] != row["rc"]
            or type(result.get("timed_out")) is not bool
            or result["timed_out"] != row["timed_out"]
        ):
            return (
                "production-readiness command matrix contains invalid result evidence"
            )
        matrix_ids.append(row["id"])
    if len(matrix_ids) != len(set(matrix_ids)):
        return "production-readiness command matrix contains duplicate command IDs"
    planned_ids = run_status.get("planned_command_ids")
    planned_count = run_status.get("planned_command_count")
    completed_count = run_status.get("completed_command_count")
    canonical_ids = [str(spec["id"]) for spec in canonical_specs]
    if (
        not isinstance(planned_ids, list)
        or not planned_ids
        or any(
            not isinstance(command_id, str) or not command_id
            for command_id in planned_ids
        )
        or len(planned_ids) != len(set(planned_ids))
        or len(canonical_ids) != len(set(canonical_ids))
        or type(planned_count) is not int
        or type(completed_count) is not int
        or planned_count != len(planned_ids)
        or completed_count != len(matrix)
        or planned_ids != matrix_ids
        or planned_ids != canonical_ids
    ):
        return "production-readiness command matrix is incomplete or disagrees with the planned command inventory"
    matrix_failures = sum(1 for row in matrix if row["required"] and row["rc"] != 0)
    status_required_failures = run_status.get("required_failures")
    if (
        type(status_required_failures) is not int
        or matrix_failures != summary["required_failures"]
        or status_required_failures != summary["required_failures"]
    ):
        return "production-readiness command matrix disagrees with the summary"

    findings, findings_error = _read_json_evidence(evidence_paths["findings"])
    if findings_error or not isinstance(findings, dict):
        return "production-readiness findings are not a JSON object"
    finding_items = findings.get("findings")
    finding_count = findings.get("open_high_critical_count")
    if (
        not isinstance(finding_items, list)
        or type(finding_count) is not int
        or findings.get("run_id") != run_id
        or finding_count != len(finding_items)
        or finding_count != summary["open_high_critical_count"]
    ):
        return "production-readiness findings disagree with the summary"

    scorecard, scorecard_error = _read_json_evidence(evidence_paths["scorecard"])
    expected_scorecard_status = "pass" if finding_count == 0 else "needs-attention"
    if scorecard_error or not isinstance(scorecard, list) or len(scorecard) != 1:
        return "production-readiness scorecard is not a single-item JSON array"
    score = scorecard[0]
    if (
        not isinstance(score, dict)
        or score.get("domain") != "production readiness"
        or score.get("status") != expected_scorecard_status
        or type(score.get("score_0_to_5")) is not int
        or not 0 <= score["score_0_to_5"] <= 5
        or (finding_count == 0 and score["score_0_to_5"] != 5)
    ):
        return "production-readiness scorecard disagrees with the summary"

    try:
        report = evidence_paths["report"].read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return "production-readiness report is unreadable"
    if not report.strip():
        return "production-readiness report is empty"
    return None


def _prod_readiness_git_status_error(
    fingerprint: dict[str, Any], artifact_root: Path
) -> str | None:
    recorded_error = fingerprint.get("prod_readiness_git_status_short_error")
    if recorded_error:
        return str(recorded_error)
    recorded_status = fingerprint.get("prod_readiness_git_status_short")
    if not isinstance(recorded_status, str):
        return "production-readiness evidence is missing its git status"
    git_status_path = artifact_root / "meta" / "git_status_short.txt"
    try:
        resolved_path = git_status_path.resolve(strict=True)
        copied_status = git_status_path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        return f"Invalid production-readiness git status: {exc}"
    if not resolved_path.is_relative_to(artifact_root) or not resolved_path.is_file():
        return "Invalid production-readiness git status: path is outside the artifact"
    if copied_status != recorded_status:
        return "production-readiness git status evidence is inconsistent"
    if recorded_status.strip():
        return "production-readiness evidence was captured from a dirty worktree"
    return None


def _prod_readiness_environment_error(
    fingerprint: dict[str, Any], summary: dict[str, Any], baseline_git_sha: object
) -> str | None:
    if (
        "source_worktree_removed" in fingerprint
        and fingerprint.get("source_worktree_removed") is not True
    ):
        return "production-readiness source worktree cleanup failed"
    child_git_sha = fingerprint.get("prod_readiness_git_sha")
    if fingerprint.get("prod_readiness_git_sha_error"):
        return "production-readiness environment evidence has invalid commit metadata"
    if (
        not isinstance(baseline_git_sha, str)
        or re.fullmatch(r"[0-9a-f]{40}", baseline_git_sha) is None
        or child_git_sha != baseline_git_sha
    ):
        return "production-readiness environment evidence does not match the release baseline"

    copied_to = fingerprint.get("copied_to")
    if not isinstance(copied_to, str):
        return "production-readiness environment evidence has no copied artifact"
    artifact_root = Path(copied_to).resolve()
    if not artifact_root.is_dir() or summary.get("artifact_root") != str(artifact_root):
        return "production-readiness environment artifact root is inconsistent"
    git_status_error = _prod_readiness_git_status_error(fingerprint, artifact_root)
    if git_status_error is not None:
        return git_status_error

    evidence_paths: dict[str, Path] = {}
    for key, relative_path in {
        "matrix": Path("reports/command-matrix.json"),
        "findings": Path("reports/findings.json"),
        "scorecard": Path("reports/scorecard.json"),
        "report": Path("reports/report.md"),
        "run_status": Path("reports/run_status.json"),
    }.items():
        expected_path = (artifact_root / relative_path).resolve()
        value = summary.get(key)
        if (
            not isinstance(value, str)
            or Path(value).resolve() != expected_path
            or not expected_path.is_relative_to(artifact_root)
            or not expected_path.is_file()
        ):
            return f"production-readiness environment {key} evidence is invalid"
        evidence_paths[key] = expected_path

    run_status, run_status_error = _read_json_evidence(evidence_paths["run_status"])
    if run_status_error or not isinstance(run_status, dict):
        return "production-readiness environment run status is invalid"
    run_id = summary.get("run_id")
    run_rc = fingerprint.get("run_rc")
    failure_command_id = summary.get("failure_command_id")
    failure_code = summary.get("failure_code")
    environment_contract = _prod_readiness_environment_contract(
        failure_command_id, failure_code
    )
    if (
        not isinstance(run_id, str)
        or not run_id
        or summary.get("status") != "partial"
        or summary.get("failure_classification") != "environment_contamination"
        or environment_contract is None
        or type(run_rc) is not int
        or run_rc == 0
        or type(run_status.get("exit_code")) is not int
        or run_status.get("run_id") != run_id
        or run_status.get("status") != "partial"
        or run_status.get("planned_run_complete") is not False
        or run_status.get("exit_code") != run_rc
        or run_status.get("failure_classification") != summary["failure_classification"]
        or run_status.get("failure_code") != summary["failure_code"]
        or run_status.get("failure_command_id") != failure_command_id
        or run_status.get("artifact_root") != str(artifact_root)
    ):
        return "production-readiness environment status is inconsistent"
    allowed_required_ids, failure_markers = environment_contract
    for key, expected_path in {
        "matrix": evidence_paths["matrix"],
        "report": evidence_paths["report"],
        "report_artifact": evidence_paths["report"],
    }.items():
        value = run_status.get(key)
        if not isinstance(value, str) or Path(value).resolve() != expected_path:
            return "production-readiness environment run-status pointers are invalid"

    matrix, matrix_error = _read_json_evidence(evidence_paths["matrix"])
    canonical_specs = _canonical_prod_readiness_command_specs(
        run_id, run_status.get("plan_inputs")
    )
    if (
        matrix_error
        or not isinstance(matrix, list)
        or not matrix
        or canonical_specs is None
        or len(matrix) >= len(canonical_specs)
    ):
        return "production-readiness environment command matrix is invalid"
    canonical_ids = [str(spec["id"]) for spec in canonical_specs]
    planned_ids = run_status.get("planned_command_ids")
    if (
        planned_ids != canonical_ids
        or run_status.get("planned_command_count") != len(canonical_ids)
        or run_status.get("completed_command_count") != len(matrix)
    ):
        return "production-readiness environment command plan is inconsistent"

    try:
        failure_index = canonical_ids.index(str(failure_command_id))
    except ValueError:
        return "production-readiness environment failure command is not canonical"
    expected_specs = canonical_specs[: failure_index + 1]
    cleanup_specs = [
        spec
        for spec in canonical_specs
        if str(spec["id"]).startswith("cleanup_final_")
    ]
    resource_started = any(
        isinstance(row, dict)
        and row.get("id") in {"p3_start_postgres", "p3_start_registry"}
        and row.get("rc") == 0
        for row in matrix[:failure_index]
    )
    if resource_started:
        expected_specs = [*expected_specs, *cleanup_specs]
    if len(matrix) != len(expected_specs):
        return "production-readiness environment command matrix is invalid"

    failed_row: dict[str, Any] | None = None
    for row, expected in zip(matrix, expected_specs, strict=True):
        if not isinstance(row, dict):
            return "production-readiness environment command result is invalid"
        actual = {
            "id": row.get("id"),
            "command": row.get("command"),
            "cwd": str(Path(str(row.get("cwd"))).resolve()),
            "required": row.get("required"),
            "timeout_sec": row.get("timeout_sec"),
        }
        if (
            not isinstance(row.get("id"), str)
            or not isinstance(row.get("command"), str)
            or not isinstance(row.get("cwd"), str)
            or type(row.get("required")) is not bool
            or type(row.get("timeout_sec")) is not int
            or actual != expected
            or type(row.get("rc")) is not int
            or type(row.get("timed_out")) is not bool
        ):
            return "production-readiness environment command result is invalid"
        log_path = (artifact_root / "logs" / f"{row['id']}.log").resolve()
        result_path = (artifact_root / "logs" / f"{row['id']}.result.json").resolve()
        if (
            Path(str(row.get("log"))).resolve() != log_path
            or Path(str(row.get("result"))).resolve() != result_path
            or not log_path.is_relative_to(artifact_root)
            or not result_path.is_relative_to(artifact_root)
            or not log_path.is_file()
            or not result_path.is_file()
        ):
            return "production-readiness environment command evidence is invalid"
        try:
            with log_path.open(encoding="utf-8") as handle:
                first_log_line = handle.readline().rstrip("\n")
        except (OSError, UnicodeError):
            return "production-readiness environment command evidence is invalid"
        if first_log_line != f"$ {row['command']}":
            return "production-readiness environment command evidence is invalid"
        result, result_error = _read_json_evidence(result_path)
        if (
            result_error
            or not isinstance(result, dict)
            or result.get("id") != row["id"]
            or result.get("command") != row["command"]
            or type(result.get("rc")) is not int
            or result.get("rc") != row["rc"]
            or type(result.get("timed_out")) is not bool
            or result.get("timed_out") != row["timed_out"]
        ):
            return "production-readiness environment result evidence is invalid"
        if row["id"] == failure_command_id:
            failed_row = row

    if failed_row is None or failed_row["rc"] == 0:
        return "production-readiness environment failure command did not fail"
    try:
        failure_log = Path(str(failed_row["log"])).read_text(
            encoding="utf-8", errors="replace"
        )
    except OSError:
        return "production-readiness environment failure log is unreadable"
    if not any(marker in failure_log.lower() for marker in failure_markers):
        return (
            "production-readiness environment failure is not supported by host evidence"
        )

    required_failed_rows = [
        row for row in matrix if row.get("required") is True and row.get("rc") != 0
    ]
    for row in required_failed_rows:
        if row["id"] not in allowed_required_ids:
            return "production-readiness environment evidence includes an unrelated required failure"
        try:
            required_failure_log = Path(str(row["log"])).read_text(
                encoding="utf-8", errors="replace"
            )
        except OSError:
            return "production-readiness environment required-failure log is unreadable"
        if not any(
            marker in required_failure_log.lower() for marker in failure_markers
        ):
            return (
                "production-readiness environment required failure lacks host evidence"
            )
    required_failure_count = len(required_failed_rows)
    if (
        type(summary.get("required_failures")) is not int
        or summary["required_failures"] != required_failure_count
        or run_status.get("required_failures") != required_failure_count
        or type(summary.get("open_high_critical_count")) is not int
        or summary.get("open_high_critical_count") != 1
    ):
        return "production-readiness environment failure counts are inconsistent"

    findings, findings_error = _read_json_evidence(evidence_paths["findings"])
    finding_items = findings.get("findings") if isinstance(findings, dict) else None
    if (
        findings_error
        or not isinstance(findings, dict)
        or findings.get("run_id") != run_id
        or findings.get("open_high_critical_count") != 1
        or not isinstance(finding_items, list)
        or len(finding_items) != 1
        or not isinstance(finding_items[0], dict)
        or finding_items[0].get("id") != "prod-readiness-audit-incomplete"
        or finding_items[0].get("classification") != "environment-only issue"
        or finding_items[0].get("failure_classification") != "environment_contamination"
        or finding_items[0].get("failure_code") != failure_code
        or finding_items[0].get("failure_command_id") != failure_command_id
    ):
        return "production-readiness environment findings are inconsistent"

    scorecard, scorecard_error = _read_json_evidence(evidence_paths["scorecard"])
    if (
        scorecard_error
        or not isinstance(scorecard, list)
        or len(scorecard) != 1
        or not isinstance(scorecard[0], dict)
        or scorecard[0].get("domain") != "audit completion"
        or scorecard[0].get("status") != "failed"
    ):
        return "production-readiness environment scorecard is inconsistent"
    try:
        report = evidence_paths["report"].read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return "production-readiness environment report is unreadable"
    if not report.strip():
        return "production-readiness environment report is empty"
    return None


def evaluate_findings_and_decision(
    *,
    run_id: str,
    baseline: dict[str, Any],
    runtime_fingerprints: list[dict[str, Any]],
    static_resolution: dict[str, Any],
    toolchain_fingerprint: dict[str, Any],
    dep_diffs: dict[str, Any],
    ui_parity: dict[str, Any],
    required_failures: int,
    artifact_root: Path,
    deps_dir: Path,
    fingerprints_dir: Path,
    ui_dir: Path,
    iso_now: Callable[[], str],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    findings: list[dict[str, Any]] = []

    if baseline.get("is_clean") is False:
        findings.append(
            {
                "id": "P1-dirty-release-baseline",
                "severity": "P1",
                "classification": "unexpected",
                "summary": "The release baseline contains uncommitted changes and cannot be tied to the selected commit.",
                "evidence": [str(artifact_root / "meta" / "baseline.json")],
            }
        )

    baseline_sha = baseline.get("git_sha")
    for fp in runtime_fingerprints:
        observed = fp.get("git_sha_observed")
        context_id = fp.get("context_id")
        if (
            observed is not None
            and baseline_sha is not None
            and observed != baseline_sha
        ):
            findings.append(
                {
                    "id": f"P0-git-sha-mismatch-{context_id}",
                    "severity": "P0",
                    "classification": "unexpected",
                    "summary": "Runtime git SHA differs from selected baseline main HEAD.",
                    "context_id": context_id,
                    "expected": baseline_sha,
                    "observed": observed,
                }
            )

        docker_state = fp.get("docker_state")
        if not isinstance(docker_state, dict):
            continue
        for container_name, container in docker_state.items():
            compose_runtime_ready = (
                fp.get("startup_path_id") == "compose_sh_up_full"
                and fp.get("backend_ready") is True
                and fp.get("frontend_ready") is True
            )
            if not isinstance(container, dict) or container.get("exists") is not True:
                if compose_runtime_ready:
                    findings.append(
                        {
                            "id": f"P1-container-image-evidence-invalid-{container_name}",
                            "severity": "P1",
                            "classification": "unexpected",
                            "summary": "An executed container did not provide complete image identity evidence.",
                            "context_id": context_id,
                            "container": container_name,
                            "identity_error": (
                                container.get(
                                    "image_identity_error",
                                    "Required container was not found.",
                                )
                                if isinstance(container, dict)
                                else "Container identity entry was malformed."
                            ),
                        }
                    )
                continue
            running_image_id = container.get("running_image_id")
            expected_image_id = container.get("expected_image_id")
            if compose_runtime_ready and (
                not isinstance(container.get("container_id"), str)
                or not isinstance(container.get("image_ref"), str)
                or not isinstance(running_image_id, str)
                or not isinstance(expected_image_id, str)
            ):
                findings.append(
                    {
                        "id": f"P1-container-image-evidence-invalid-{container_name}",
                        "severity": "P1",
                        "classification": "unexpected",
                        "summary": "An executed container did not provide complete image identity evidence.",
                        "context_id": context_id,
                        "container": container_name,
                        "identity_error": container.get(
                            "image_identity_error",
                            "Container or local image identity was not recorded.",
                        ),
                    }
                )
            if (
                isinstance(running_image_id, str)
                and isinstance(expected_image_id, str)
                and running_image_id != expected_image_id
            ):
                findings.append(
                    {
                        "id": f"P0-container-image-mismatch-{container_name}",
                        "severity": "P0",
                        "classification": "unexpected",
                        "summary": "Running container image identity differs from the image currently resolved by its configured reference.",
                        "context_id": context_id,
                        "container": container_name,
                        "image_ref": container.get("image_ref"),
                        "expected": expected_image_id,
                        "observed": running_image_id,
                    }
                )
            source_mount = container.get("source_mount")
            if not isinstance(source_mount, dict):
                continue
            source_sha = source_mount.get("git_sha_observed")
            if (
                isinstance(source_sha, str)
                and isinstance(baseline_sha, str)
                and observed is None
                and source_sha != baseline_sha
            ):
                findings.append(
                    {
                        "id": f"P0-container-source-sha-mismatch-{container_name}",
                        "severity": "P0",
                        "classification": "unexpected",
                        "summary": "Source mounted into a running container differs from the selected baseline HEAD.",
                        "context_id": context_id,
                        "container": container_name,
                        "source": source_mount.get("source"),
                        "expected": baseline_sha,
                        "observed": source_sha,
                    }
                )

    for fp in runtime_fingerprints:
        if not fp.get("launch_failed"):
            continue
        startup_path_id = fp.get("startup_path_id", "unknown")
        failure = fp.get("launch_failure", {})
        if failure.get("classification") == "environment_contamination":
            findings.append(
                {
                    "id": f"ENV-startup-path-{startup_path_id}-{failure.get('code', 'unknown')}",
                    "severity": "ENV",
                    "classification": "environment_contamination",
                    "summary": failure.get(
                        "summary",
                        "The audit host was not valid evidence for this startup path.",
                    ),
                    "startup_path_id": startup_path_id,
                    "context_id": fp.get("context_id"),
                    "launch_rc": fp.get("launch_rc"),
                    "launch_log": fp.get("launch_log"),
                }
            )
        else:
            findings.append(
                {
                    "id": f"P1-startup-path-failed-{startup_path_id}",
                    "severity": "P1",
                    "classification": "unexpected",
                    "summary": failure.get(
                        "summary",
                        "Startup command failed for this path before parity fingerprints could be captured.",
                    ),
                    "startup_path_id": startup_path_id,
                    "context_id": fp.get("context_id"),
                    "launch_rc": fp.get("launch_rc"),
                    "launch_log": fp.get("launch_log"),
                }
            )

    for fp in runtime_fingerprints:
        startup_path_id = fp.get("startup_path_id")
        if fp.get("launch_failed") is True:
            continue
        if startup_path_id in _REQUIRED_FULL_RUNTIME_PATHS:
            ready = fp.get("backend_ready") is True and fp.get("frontend_ready") is True
        elif startup_path_id in _REQUIRED_COMPONENT_RUNTIME_PATHS:
            ready = fp.get("started") is True
        else:
            continue
        if ready:
            continue
        findings.append(
            {
                "id": f"P1-startup-path-not-ready-{startup_path_id}",
                "severity": "P1",
                "classification": "unexpected",
                "summary": "A required runtime startup path did not reach its readiness contract.",
                "startup_path_id": startup_path_id,
                "context_id": fp.get("context_id"),
                "evidence": [str(fingerprints_dir / "runtime.json")],
            }
        )

    for fp in runtime_fingerprints:
        startup_path_id = fp.get("startup_path_id")
        executed = (
            startup_path_id in _REQUIRED_FULL_RUNTIME_PATHS
            and fp.get("backend_ready") is True
            and fp.get("frontend_ready") is True
        ) or (
            startup_path_id in _REQUIRED_COMPONENT_RUNTIME_PATHS
            and fp.get("started") is True
        )
        identity_error = fp.get(
            "git_sha_observed_unavailable_reason",
            "Runtime source identity was not recorded.",
        )
        identity_invalid = fp.get("git_sha_observed") is None
        if startup_path_id == "compose_sh_up_full" and executed:
            docker_state = fp.get("docker_state")
            required_source_shas: dict[str, str] = {}
            required_container_errors: list[str] = []
            for container_name in sorted(_REQUIRED_COMPOSE_SOURCE_IDENTITY_CONTAINERS):
                container = (
                    docker_state.get(container_name)
                    if isinstance(docker_state, dict)
                    else None
                )
                if (
                    not isinstance(container, dict)
                    or container.get("status") != "running"
                ):
                    status = (
                        container.get("status") if isinstance(container, dict) else None
                    )
                    required_container_errors.append(
                        f"{container_name}: required container status was {status!r}; expected 'running'"
                    )
                source_mount = (
                    container.get("source_mount")
                    if isinstance(container, dict)
                    else None
                )
                source_sha = (
                    source_mount.get("git_sha_observed")
                    if isinstance(source_mount, dict)
                    else None
                )
                if isinstance(source_sha, str) and source_sha:
                    required_source_shas[container_name] = source_sha
                    continue
                unavailable_reason = (
                    source_mount.get("git_sha_observed_unavailable_reason")
                    if isinstance(source_mount, dict)
                    else None
                )
                required_container_errors.append(
                    f"{container_name}: "
                    f"{unavailable_reason or 'required source mount identity was not recorded'}"
                )
            unique_source_shas = set(required_source_shas.values())
            aggregate_sha = fp.get("git_sha_observed")
            if (
                required_container_errors
                or len(unique_source_shas) != 1
                or aggregate_sha not in unique_source_shas
            ):
                identity_invalid = True
                identity_error = (
                    "; ".join(required_container_errors)
                    if required_container_errors
                    else "Required source-mounted container Git identities were inconsistent."
                )
        if executed and identity_invalid:
            findings.append(
                {
                    "id": f"P1-runtime-identity-evidence-invalid-{startup_path_id}",
                    "severity": "P1",
                    "classification": "unexpected",
                    "summary": "An executed runtime did not provide independently observed source identity evidence.",
                    "startup_path_id": startup_path_id,
                    "context_id": fp.get("context_id"),
                    "identity_error": identity_error,
                    "evidence": [str(fingerprints_dir / "runtime.json")],
                }
            )
        if startup_path_id != "compose_sh_up_full" or not executed:
            continue
        docker_state = fp.get("docker_state")
        if isinstance(docker_state, dict) and docker_state:
            continue
        findings.append(
            {
                "id": "P1-container-image-evidence-invalid-compose_sh_up_full",
                "severity": "P1",
                "classification": "unexpected",
                "summary": "The executed Compose runtime did not provide container image identity evidence.",
                "startup_path_id": startup_path_id,
                "context_id": fp.get("context_id"),
                "identity_error": "Docker container state was not recorded.",
                "evidence": [str(fingerprints_dir / "runtime.json")],
            }
        )

    for fp in runtime_fingerprints:
        startup_path_id = fp.get("startup_path_id")
        command_rc = fp.get("command_rc")
        if (
            startup_path_id not in _REQUIRED_PROD_DRY_RUN_PATHS
            or type(command_rc) is not int
            or command_rc == 0
        ):
            continue
        context_id = fp.get("context_id", startup_path_id)
        matching_environment_finding = next(
            (
                finding
                for finding in findings
                if finding.get("classification") == "environment_contamination"
                and (
                    finding.get("startup_path_id") == startup_path_id
                    or finding.get("context_id") == context_id
                )
            ),
            None,
        )
        command_log = fp.get("command_log")
        boundary_environment_log = (
            _docker_host_failure_log(command_log)
            if startup_path_id
            in {"compose_to_prod_lifecycle_boundary", "compose_cleanup_final"}
            else None
        )
        is_environment_failure = (
            matching_environment_finding is not None
            or boundary_environment_log is not None
        )
        findings.append(
            {
                "id": (
                    f"ENV-required-command-failed-{context_id}"
                    if is_environment_failure
                    else f"P1-required-command-failed-{context_id}"
                ),
                "severity": "ENV" if is_environment_failure else "P1",
                "classification": "environment_contamination"
                if is_environment_failure
                else "unexpected",
                "summary": (
                    "A required production dry-run failed because its own environment was invalid."
                    if is_environment_failure
                    else "A required production dry-run command failed."
                ),
                "startup_path_id": startup_path_id,
                "context_id": context_id,
                "command_rc": command_rc,
                "command_log": command_log,
                "evidence": [
                    command_log
                    if isinstance(command_log, str)
                    else str(fingerprints_dir / "runtime.json")
                ],
            }
        )

    prod_readiness = [
        fingerprint
        for fingerprint in runtime_fingerprints
        if fingerprint.get("startup_path_id") == "prod_readiness"
    ]
    if not prod_readiness:
        findings.append(
            {
                "id": "P1-prod-readiness-evidence-invalid",
                "severity": "P1",
                "classification": "unexpected",
                "summary": "Production-readiness evidence is missing from the release-parity audit.",
                "evidence": [str(fingerprints_dir / "runtime.json")],
            }
        )
    for fingerprint in prod_readiness:
        summary = fingerprint.get("summary")
        run_rc = fingerprint.get("run_rc")
        valid_run_rc = type(run_rc) is int
        environment_summary = (
            isinstance(summary, dict)
            and summary.get("status") == "partial"
            and summary.get("failure_classification") == "environment_contamination"
        )
        environment_error = (
            _prod_readiness_environment_error(fingerprint, summary, baseline_sha)
            if environment_summary
            else None
        )
        if valid_run_rc and environment_summary and not environment_error:
            findings.append(
                {
                    "id": "ENV-prod-readiness-host",
                    "severity": "ENV",
                    "classification": "environment_contamination",
                    "summary": "The nested production-readiness audit could not complete because a required host prerequisite was unavailable.",
                    "run_rc": run_rc,
                    "failure_code": summary["failure_code"],
                    "failure_command_id": summary["failure_command_id"],
                    "evidence": [str(fingerprints_dir / "runtime.json")],
                }
            )
            continue
        valid_summary = (
            isinstance(summary, dict)
            and summary.get("status") == "complete"
            and type(summary.get("required_failures")) is int
            and summary["required_failures"] >= 0
            and type(summary.get("open_high_critical_count")) is int
            and summary["open_high_critical_count"] >= 0
        )
        evidence_error = (
            _prod_readiness_evidence_error(fingerprint, summary, baseline_sha)
            if valid_summary
            else environment_error
        )
        if not valid_run_rc or not valid_summary or evidence_error:
            findings.append(
                {
                    "id": "P1-prod-readiness-evidence-invalid",
                    "severity": "P1",
                    "classification": "unexpected",
                    "summary": "Production-readiness evidence is missing or invalid.",
                    "run_rc": run_rc,
                    "child_summary": summary,
                    "evidence_error": evidence_error,
                    "evidence": [str(fingerprints_dir / "runtime.json")],
                }
            )
            continue
        if (
            run_rc != 0
            or summary["required_failures"] > 0
            or summary["open_high_critical_count"] > 0
        ):
            findings.append(
                {
                    "id": "P1-prod-readiness-gate-failed",
                    "severity": "P1",
                    "classification": "unexpected",
                    "summary": "The nested production-readiness audit did not pass.",
                    "run_rc": run_rc,
                    "required_failures": summary["required_failures"],
                    "open_high_critical_count": summary["open_high_critical_count"],
                    "evidence": [str(fingerprints_dir / "runtime.json")],
                }
            )

    required_dependency_evidence = (
        "backend_image_build",
        "backend_local",
        "backend_image",
        "frontend_installed",
        "frontend_lock",
    )
    docker_environment_context_ids = {
        str(fingerprint.get("context_id") or fingerprint.get("startup_path_id"))
        for fingerprint in runtime_fingerprints
        if fingerprint.get("startup_path_id") in _REQUIRED_FULL_RUNTIME_PATHS
        and fingerprint.get("launch_failed") is True
        and isinstance(fingerprint.get("launch_failure"), dict)
        and fingerprint["launch_failure"].get("classification")
        == "environment_contamination"
        and fingerprint["launch_failure"].get("code") == "docker_daemon_unavailable"
    }
    evidence_status = dep_diffs.get("evidence_status")
    if not isinstance(evidence_status, dict) or not evidence_status:
        findings.append(
            {
                "id": "P1-dependency-evidence-status-missing",
                "severity": "P1",
                "classification": "unexpected",
                "summary": "Dependency evidence availability was not recorded.",
                "evidence": [str(deps_dir / "diffs.json")],
            }
        )
    else:
        for evidence_name in required_dependency_evidence:
            status = evidence_status.get(evidence_name)
            if (
                not isinstance(status, dict)
                or status.get("available") is not True
                or status.get("error") is not None
            ):
                environment_log = (
                    _docker_dependency_environment_log(
                        evidence_name, status, artifact_root
                    )
                    if isinstance(status, dict) and docker_environment_context_ids
                    else None
                )
                is_environment_failure = environment_log is not None
                finding = {
                    "id": (
                        f"ENV-dependency-evidence-{evidence_name}"
                        if is_environment_failure
                        else f"P1-dependency-evidence-{evidence_name}"
                    ),
                    "severity": "ENV" if is_environment_failure else "P1",
                    "classification": (
                        "environment_contamination"
                        if is_environment_failure
                        else "unexpected"
                    ),
                    "summary": (
                        "Required backend image dependency evidence was unavailable because Docker was unavailable on the audit host."
                        if is_environment_failure
                        else "Required dependency evidence is unavailable or invalid."
                    ),
                    "evidence_name": evidence_name,
                    "error": status.get("error")
                    if isinstance(status, dict)
                    else "invalid evidence status",
                    "evidence": [str(deps_dir / "diffs.json")],
                }
                if is_environment_failure:
                    finding.update(
                        {
                            "context_id": status["command_id"],
                            "linked_environment_context_ids": sorted(
                                docker_environment_context_ids
                            ),
                            "evidence": [
                                str(deps_dir / "diffs.json"),
                                str(environment_log),
                            ],
                        }
                    )
                findings.append(finding)

    for diff in dep_diffs.get("backend_drift", []):
        findings.append(
            {
                "id": f"P1-backend-dep-drift-{diff['package']}",
                "severity": "P1",
                "classification": "unexpected",
                "summary": "Critical backend dependency differs between local venv and backend image.",
                "package": diff["package"],
                "local": diff["local"],
                "image": diff["image"],
                "evidence": [
                    str(deps_dir / "backend-local.txt"),
                    str(deps_dir / "backend-image.txt"),
                ],
            }
        )

    if ui_parity.get("mismatches_same_auth_mode_same_commit"):
        findings.append(
            {
                "id": "P1-ui-parity-mismatch",
                "severity": "P1",
                "classification": "unexpected",
                "summary": "UI screenshots differ across contexts with same auth mode, app version, and git SHA.",
                "groups": ui_parity.get("mismatches_same_auth_mode_same_commit"),
                "evidence": [str(ui_dir / "parity.json")],
            }
        )

    expected_node_major = None
    node_versions = static_resolution.get("ci_runtime_policy", {}).get(
        "node_versions", []
    )
    if node_versions:
        expected_node_major = int(str(node_versions[0]).split(".")[0])

    effective_node = toolchain_fingerprint.get("dev_sh_effective_node", {})
    effective_node_major = effective_node.get("major")
    if (
        expected_node_major
        and effective_node_major
        and effective_node_major != expected_node_major
    ):
        findings.append(
            {
                "id": "P2-node-major-mismatch",
                "severity": "P2",
                "classification": "unexpected",
                "summary": "Effective Node runtime for scripts/dev.sh differs from the CI/Docker baseline.",
                "expected_node_major": expected_node_major,
                "observed_node_major": effective_node_major,
                "evidence": [
                    str(fingerprints_dir / "toolchain.json"),
                    str(artifact_root / "static-resolution.json"),
                ],
            }
        )
    elif expected_node_major and not effective_node.get("selected"):
        findings.append(
            {
                "id": "ENV-dev-sh-node-runtime-unavailable",
                "severity": "ENV",
                "classification": "environment_contamination",
                "summary": (
                    "scripts/dev.sh could not resolve a Node runtime matching the CI/Docker baseline on this host."
                ),
                "expected_node_major": expected_node_major,
                "observed_node_major": effective_node_major,
                "evidence": [
                    str(fingerprints_dir / "toolchain.json"),
                    str(fingerprints_dir / "startup-preflight.json"),
                ],
            }
        )

    dev_startup = static_resolution.get("dev_startup", {})
    if dev_startup.get("frontend_has_npm_install_fallback") and not dev_startup.get(
        "frontend_prefers_npm_ci_with_lockfile"
    ):
        findings.append(
            {
                "id": "P2-dev-frontend-nonreproducible-install",
                "severity": "P2",
                "classification": "unexpected",
                "summary": "scripts/dev.sh uses npm install (not npm ci), which is non-lockfile-reproducible.",
                "evidence": ["scripts/dev.sh:231", "scripts/dev.sh:233"],
            }
        )

    for diff in dep_diffs.get("frontend_drift", []):
        findings.append(
            {
                "id": f"P2-frontend-lock-drift-{diff['package']}",
                "severity": "P2",
                "classification": "unexpected",
                "summary": "Installed frontend dependency differs from lockfile resolution.",
                "package": diff["package"],
                "installed": diff["installed"],
                "lock": diff["lock"],
                "evidence": [
                    str(deps_dir / "frontend-installed.json"),
                    str(deps_dir / "frontend-lock.json"),
                ],
            }
        )

    environment_failure_contexts = {
        str(item.get("context_id") or item.get("startup_path_id"))
        for item in findings
        if item["classification"] == "environment_contamination"
        and (item.get("context_id") or item.get("startup_path_id"))
        and (
            str(item.get("id", "")).startswith("ENV-startup-path-")
            or str(item.get("id", "")).startswith("ENV-required-command-failed-")
            or str(item.get("id", "")).startswith("ENV-dependency-evidence-")
        )
    }
    product_launch_failures = any(
        str(item["id"]).startswith("P1-startup-path-failed-") for item in findings
    )
    product_command_failures = any(
        str(item["id"]).startswith("P1-required-command-failed-") for item in findings
    )
    all_required_failures_are_environmental = (
        required_failures > 0 and len(environment_failure_contexts) >= required_failures
    )
    if (
        required_failures > 0
        and not product_launch_failures
        and not product_command_failures
    ):
        findings.append(
            {
                "id": (
                    "ENV-required-command-failures"
                    if all_required_failures_are_environmental
                    else "P1-required-command-failures"
                ),
                "severity": "ENV" if all_required_failures_are_environmental else "P1",
                "classification": (
                    "environment_contamination"
                    if all_required_failures_are_environmental
                    else "unexpected"
                ),
                "summary": (
                    "One or more required audit commands failed because the host environment was not valid "
                    "release evidence."
                    if all_required_failures_are_environmental
                    else "One or more required audit commands failed."
                ),
                "required_failures": required_failures,
                "evidence": [str(artifact_root / "matrix.json")],
            }
        )

    has_p0_p1 = any(item["severity"] in {"P0", "P1"} for item in findings)
    has_p2 = any(item["severity"] == "P2" for item in findings)
    has_environment_contamination = any(
        item["classification"] == "environment_contamination" for item in findings
    )

    if has_p0_p1:
        release_decision = "NO-GO"
    elif has_environment_contamination:
        release_decision = "INVALID_ENVIRONMENT"
    elif has_p2:
        release_decision = "CONDITIONAL"
    else:
        release_decision = "GO"

    decision = {
        "run_id": run_id,
        "generated_at_utc": iso_now(),
        "decision": release_decision,
        "required_failures": required_failures,
        "finding_counts": {
            "P0": sum(1 for item in findings if item["severity"] == "P0"),
            "P1": sum(1 for item in findings if item["severity"] == "P1"),
            "P2": sum(1 for item in findings if item["severity"] == "P2"),
            "ENV": sum(1 for item in findings if item["severity"] == "ENV"),
        },
        "go_criteria": "No unresolved P0/P1 findings",
    }
    return findings, decision
