from __future__ import annotations

import json
import os
import re
import shlex
import shutil
import signal
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from prod_readiness_audit.phases import build_prod_readiness_phases
from prod_readiness_audit.run_state import build_plan_state

_SAFE_COMMAND_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]*")
_ENVIRONMENT_PREREQUISITE_FAILURE_CODES = {
    "p2_verify_prod_install_scripts": {"docker_daemon_unavailable"},
    "p3_start_postgres": {"docker_daemon_unavailable"},
    "p3_start_registry": {"docker_daemon_unavailable"},
    "meta_docker_version": {"docker_daemon_unavailable"},
    "meta_docker_info": {"docker_daemon_unavailable"},
    "meta_python_version": {
        "python313_unavailable",
        "python_version_unsupported",
    },
}


@dataclass(frozen=True)
class RuntimeFingerprint:
    data: dict[str, Any]


def build_runtime_fingerprint(data: dict[str, Any]) -> RuntimeFingerprint:
    return RuntimeFingerprint(data=dict(data))


def _read_prod_readiness_summary(
    artifact_dir: Path,
) -> tuple[dict[str, Any] | None, str | None]:
    summary_path = artifact_dir / "SUMMARY.json"
    if not summary_path.exists():
        return None, f"Missing production-readiness summary: {summary_path}"
    try:
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        return None, f"Invalid production-readiness summary: {exc}"
    if not isinstance(summary, dict):
        return None, "Invalid production-readiness summary: expected a JSON object"
    return summary, None


def _read_prod_readiness_run_status(
    artifact_dir: Path,
) -> tuple[dict[str, Any] | None, str | None]:
    run_status_path = artifact_dir / "reports" / "run_status.json"
    try:
        run_status = json.loads(run_status_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        return None, f"Invalid production-readiness run status: {exc}"
    if not isinstance(run_status, dict):
        return None, "Invalid production-readiness run status: expected a JSON object"
    return run_status, None


def _read_recorded_prod_readiness_rc(
    artifact_dir: Path,
) -> tuple[int | None, str | None]:
    run_status, error = _read_prod_readiness_run_status(artifact_dir)
    if run_status is None:
        return None, error
    run_rc = run_status.get("exit_code")
    if type(run_rc) is not int:
        return (
            None,
            "Invalid production-readiness run status: expected integer exit_code",
        )
    return run_rc, None


def _read_prod_readiness_git_sha(artifact_dir: Path) -> tuple[str | None, str | None]:
    artifact_root = artifact_dir.resolve()
    git_head_path = artifact_root / "meta" / "git_head.txt"
    try:
        resolved_path = git_head_path.resolve(strict=True)
    except OSError as exc:
        return None, f"Invalid production-readiness git HEAD: {exc}"
    if not resolved_path.is_relative_to(artifact_root) or not resolved_path.is_file():
        return (
            None,
            "Invalid production-readiness git HEAD: path is outside the artifact",
        )
    try:
        git_sha = git_head_path.read_text(encoding="utf-8").strip()
    except (OSError, UnicodeError) as exc:
        return None, f"Invalid production-readiness git HEAD: {exc}"
    if re.fullmatch(r"[0-9a-f]{40}", git_sha) is None:
        return (
            None,
            "Invalid production-readiness git HEAD: expected one full 40-hex commit SHA",
        )
    return git_sha, None


def _read_prod_readiness_git_status_short(
    artifact_dir: Path,
) -> tuple[str | None, str | None]:
    artifact_root = artifact_dir.resolve()
    git_status_path = artifact_root / "meta" / "git_status_short.txt"
    try:
        resolved_path = git_status_path.resolve(strict=True)
    except OSError as exc:
        return None, f"Invalid production-readiness git status: {exc}"
    if not resolved_path.is_relative_to(artifact_root) or not resolved_path.is_file():
        return (
            None,
            "Invalid production-readiness git status: path is outside the artifact",
        )
    try:
        git_status_short = git_status_path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        return None, f"Invalid production-readiness git status: {exc}"
    return git_status_short, None


def _rebase_paths(value: Any, replacements: tuple[tuple[str, str], ...]) -> Any:
    if isinstance(value, str):
        for source, target in replacements:
            value = value.replace(source, target)
        return value
    if isinstance(value, list):
        return [_rebase_paths(item, replacements) for item in value]
    if isinstance(value, dict):
        return {key: _rebase_paths(item, replacements) for key, item in value.items()}
    return value


def _formal_evidence_references(payload: object) -> tuple[list[str], str | None]:
    references: list[str] = []

    def collect(value: object) -> str | None:
        if isinstance(value, str):
            references.append(value)
            return None
        if isinstance(value, list):
            for item in value:
                error = collect(item)
                if error is not None:
                    return error
            return None
        return "Invalid production-readiness evidence reference"

    def visit(value: object) -> str | None:
        if isinstance(value, list):
            for item in value:
                error = visit(item)
                if error is not None:
                    return error
        elif isinstance(value, dict):
            for key, item in value.items():
                if key in {"evidence", "log"}:
                    error = collect(item)
                else:
                    error = visit(item)
                if error is not None:
                    return error
        return None

    return references, visit(payload)


def _prepare_external_evidence(
    *,
    artifact_dir: Path,
    source_artifact_dir: Path,
    source_root_dir: Path,
    findings: object,
    scorecard: object,
    report: str,
) -> tuple[dict[str, Path] | None, str | None]:
    references: list[str] = []
    for payload in (findings, scorecard):
        payload_references, error = _formal_evidence_references(payload)
        if error is not None:
            return None, error
        references.extend(payload_references)

    source_results_dir = (source_root_dir / "tests" / "results").resolve()
    copies: dict[str, Path] = {}
    destinations: dict[Path, Path] = {}
    declared_sources: set[Path] = set()
    for reference in references:
        source_path = Path(reference)
        if not source_path.is_absolute():
            return None, "Invalid production-readiness evidence reference"
        try:
            resolved_source = source_path.resolve(strict=True)
        except OSError as exc:
            return None, f"Missing production-readiness evidence reference: {exc}"
        if not resolved_source.is_file():
            return None, "Invalid production-readiness evidence reference"
        declared_sources.add(resolved_source)
        if resolved_source.is_relative_to(source_artifact_dir):
            relative_path = resolved_source.relative_to(source_artifact_dir)
            copied_path = (artifact_dir / relative_path).resolve()
            if (
                not copied_path.is_relative_to(artifact_dir)
                or not copied_path.is_file()
            ):
                return None, "Missing copied production-readiness evidence"
            continue
        if not resolved_source.is_relative_to(source_results_dir):
            return (
                None,
                "Production-readiness evidence reference is outside allowed results",
            )
        relative_path = resolved_source.relative_to(source_results_dir)
        copied_path = (artifact_dir / "external_evidence" / relative_path).resolve()
        if not copied_path.is_relative_to(artifact_dir):
            return None, "Invalid production-readiness external evidence destination"
        previous_source = destinations.get(copied_path)
        if previous_source is not None and previous_source != resolved_source:
            return None, "Conflicting production-readiness external evidence paths"
        destinations[copied_path] = resolved_source
        copies[reference] = copied_path

    for referenced_text in re.findall(r"`([^`\r\n]+)`", report):
        referenced_path = Path(referenced_text)
        if not referenced_path.is_absolute():
            continue
        try:
            resolved_reference = referenced_path.resolve(strict=True)
        except OSError as exc:
            return None, f"Missing production-readiness report evidence: {exc}"
        if resolved_reference.is_relative_to(source_artifact_dir):
            continue
        if resolved_reference not in declared_sources:
            return None, "Production-readiness report contains unlisted evidence"

    for copied_path, resolved_source in destinations.items():
        if copied_path.exists():
            return None, "Conflicting production-readiness external evidence path"
        copied_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(resolved_source, copied_path)
    return copies, None


def _canonical_command_ids(run_status: object) -> tuple[list[str] | None, str | None]:
    if not isinstance(run_status, dict):
        return None, "Invalid production-readiness run status"
    run_id = run_status.get("run_id")
    inputs = run_status.get("plan_inputs")
    if not isinstance(run_id, str) or not run_id or not isinstance(inputs, dict):
        return None, "Invalid production-readiness command plan"
    path_values = {
        name: inputs.get(name) for name in ("root_dir", "artifact_root", "report_path")
    }
    if any(
        not isinstance(value, str) or not value or not Path(value).is_absolute()
        for value in path_values.values()
    ):
        return None, "Invalid production-readiness command plan"
    report_date = inputs.get("report_date")
    ports = {
        name: inputs.get(name)
        for name in (
            "postgres_port",
            "frontend_host_port",
            "registry_port",
            "security_probe_port",
        )
    }
    if (
        not isinstance(report_date, str)
        or not report_date
        or any(
            type(value) is not int or not 1 <= value <= 65535
            for value in ports.values()
        )
    ):
        return None, "Invalid production-readiness command plan"
    try:
        state = build_plan_state(
            root_dir=Path(path_values["root_dir"]),
            run_id=run_id,
            report_date=report_date,
            artifact_root=Path(path_values["artifact_root"]),
            report_path=Path(path_values["report_path"]),
            postgres_port=ports["postgres_port"],
            frontend_host_port=ports["frontend_host_port"],
            registry_port=ports["registry_port"],
            security_probe_port=ports["security_probe_port"],
        )
    except ValueError:
        return None, "Invalid production-readiness command plan"
    return (
        [
            command.command_id
            for phase in build_prod_readiness_phases(state)
            for command in phase.commands
        ],
        None,
    )


def _is_partial_environment_inventory(
    *,
    summary: object,
    run_status: object,
    matrix: list[object],
    canonical_ids: list[str],
) -> bool:
    if not isinstance(summary, dict) or not isinstance(run_status, dict):
        return False
    matrix_ids = [row.get("id") if isinstance(row, dict) else None for row in matrix]
    if any(not isinstance(command_id, str) for command_id in matrix_ids):
        return False
    failure_command_id = summary.get("failure_command_id")
    failure_code = summary.get("failure_code")
    required_failures = summary.get("required_failures")
    allowed_failure_codes = (
        _ENVIRONMENT_PREREQUISITE_FAILURE_CODES.get(failure_command_id)
        if isinstance(failure_command_id, str)
        else None
    )
    try:
        failure_index = canonical_ids.index(str(failure_command_id))
    except ValueError:
        return False
    prefix_ids = canonical_ids[: failure_index + 1]
    cleanup_ids = [
        command_id
        for command_id in canonical_ids
        if command_id.startswith("cleanup_final_")
    ]
    resource_started = any(
        isinstance(row, dict)
        and row.get("id") in {"p3_start_postgres", "p3_start_registry"}
        and row.get("rc") == 0
        for row in matrix[:failure_index]
    )
    allowed_inventory = (not resource_started and matrix_ids == prefix_ids) or (
        resource_started and matrix_ids == [*prefix_ids, *cleanup_ids]
    )
    return (
        summary.get("status") == "partial"
        and summary.get("failure_classification") == "environment_contamination"
        and isinstance(failure_command_id, str)
        and isinstance(failure_code, str)
        and allowed_failure_codes is not None
        and failure_code in allowed_failure_codes
        and type(required_failures) is int
        and required_failures > 0
        and summary.get("open_high_critical_count") == 1
        and run_status.get("run_id") == summary.get("run_id")
        and run_status.get("status") == "partial"
        and run_status.get("planned_run_complete") is False
        and type(run_status.get("exit_code")) is int
        and run_status["exit_code"] != 0
        and run_status.get("failure_classification") == "environment_contamination"
        and run_status.get("failure_code") == failure_code
        and run_status.get("failure_command_id") == failure_command_id
        and run_status.get("required_failures") == required_failures
        and run_status.get("planned_command_ids") == canonical_ids
        and run_status.get("planned_command_count") == len(canonical_ids)
        and run_status.get("completed_command_count") == len(matrix_ids)
        and 0 < len(matrix_ids) < len(canonical_ids)
        and allowed_inventory
    )


def _rebase_prod_readiness_summary(
    artifact_dir: Path,
    *,
    source_artifact_dir: Path,
    source_root_dir: Path,
    durable_root_dir: Path,
) -> tuple[dict[str, Any] | None, str | None]:
    summary, error = _read_prod_readiness_summary(artifact_dir)
    if summary is None:
        return None, error
    run_status, error = _read_prod_readiness_run_status(artifact_dir)
    if run_status is None:
        return None, error
    artifact_dir = artifact_dir.resolve()
    source_artifact_dir = source_artifact_dir.resolve()
    source_root_dir = source_root_dir.resolve()
    durable_root_dir = durable_root_dir.resolve()
    base_replacements = tuple(
        (str(source), str(target))
        for source, target in (
            (source_artifact_dir, artifact_dir),
            (source_root_dir, durable_root_dir),
        )
        if source != target
    )

    formal_json_paths = {
        "matrix": artifact_dir / "reports" / "command-matrix.json",
        "findings": artifact_dir / "reports" / "findings.json",
        "scorecard": artifact_dir / "reports" / "scorecard.json",
        "run_status": artifact_dir / "reports" / "run_status.json",
        "summary": artifact_dir / "SUMMARY.json",
    }
    report_path = artifact_dir / "reports" / "report.md"
    payloads: dict[str, Any] = {}
    for name, path in formal_json_paths.items():
        try:
            payloads[name] = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            return None, f"Invalid production-readiness {name} evidence: {exc}"
    try:
        report = report_path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        return None, f"Invalid production-readiness report evidence: {exc}"

    summary = payloads["summary"]
    run_status = payloads["run_status"]
    matrix = payloads["matrix"]
    if not isinstance(summary, dict) or not isinstance(run_status, dict):
        return None, "Invalid production-readiness summary or run status"
    if not isinstance(matrix, list):
        return None, "Invalid production-readiness command matrix"

    matrix_ids: list[str] = []
    for row in matrix:
        if (
            not isinstance(row, dict)
            or not isinstance(row.get("id"), str)
            or _SAFE_COMMAND_ID.fullmatch(row["id"]) is None
        ):
            return None, "Invalid production-readiness command ID"
        matrix_ids.append(row["id"])
    canonical_ids, canonical_error = _canonical_command_ids(run_status)
    if canonical_ids is None:
        return None, canonical_error
    if matrix_ids != canonical_ids and not _is_partial_environment_inventory(
        summary=summary,
        run_status=run_status,
        matrix=matrix,
        canonical_ids=canonical_ids,
    ):
        return None, "Invalid production-readiness canonical command inventory"

    external_copies, external_error = _prepare_external_evidence(
        artifact_dir=artifact_dir,
        source_artifact_dir=source_artifact_dir,
        source_root_dir=source_root_dir,
        findings=payloads["findings"],
        scorecard=payloads["scorecard"],
        report=report,
    )
    if external_copies is None:
        return None, external_error
    replacements = (
        tuple(
            sorted(
                ((source, str(target)) for source, target in external_copies.items()),
                key=lambda item: len(item[0]),
                reverse=True,
            )
        )
        + base_replacements
    )
    payloads = {
        name: _rebase_paths(payload, replacements) for name, payload in payloads.items()
    }
    summary = payloads["summary"]
    run_status = payloads["run_status"]
    matrix = payloads["matrix"]

    summary["artifact_root"] = str(artifact_dir)
    for key, relative_path in {
        "matrix": Path("reports/command-matrix.json"),
        "findings": Path("reports/findings.json"),
        "scorecard": Path("reports/scorecard.json"),
        "report": Path("reports/report.md"),
        "run_status": Path("reports/run_status.json"),
    }.items():
        summary[key] = str(artifact_dir / relative_path)
    run_status.update(
        {
            "artifact_root": str(artifact_dir),
            "report": str(artifact_dir / "reports" / "report.md"),
            "report_artifact": str(artifact_dir / "reports" / "report.md"),
            "matrix": str(artifact_dir / "reports" / "command-matrix.json"),
        }
    )
    plan_inputs = run_status.get("plan_inputs")
    if isinstance(plan_inputs, dict):
        plan_inputs.update(
            {
                "artifact_root": str(artifact_dir),
                "report_path": str(artifact_dir / "reports" / "report.md"),
            }
        )
        if source_root_dir != durable_root_dir:
            plan_inputs["root_dir"] = str(durable_root_dir)

    retained_paths = list(formal_json_paths.values())
    for row in matrix:
        if not isinstance(row, dict) or not isinstance(row.get("id"), str):
            return None, "Invalid production-readiness command matrix result"
        command_id = row["id"]
        log_path = artifact_dir / "logs" / f"{command_id}.log"
        result_path = artifact_dir / "logs" / f"{command_id}.result.json"
        row["log"] = str(log_path)
        row["result"] = str(result_path)
        try:
            log_text = log_path.read_text(encoding="utf-8")
            result = json.loads(result_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            return None, f"Invalid production-readiness command evidence: {exc}"
        log_path.write_text(_rebase_paths(log_text, replacements), encoding="utf-8")
        result_path.write_text(
            json.dumps(_rebase_paths(result, replacements), indent=2, ensure_ascii=True)
            + "\n",
            encoding="utf-8",
        )
        retained_paths.extend((log_path, result_path))

    payloads["summary"] = summary
    payloads["run_status"] = run_status
    payloads["matrix"] = matrix
    for name, path in formal_json_paths.items():
        path.write_text(
            json.dumps(payloads[name], indent=2, ensure_ascii=True) + "\n",
            encoding="utf-8",
        )

    report_path.write_text(_rebase_paths(report, replacements), encoding="utf-8")
    retained_paths.append(report_path)

    stale_roots = {source for source, _target in base_replacements}
    for path in retained_paths:
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as exc:
            return None, f"Invalid copied production-readiness evidence: {exc}"
        if any(stale_root in text for stale_root in stale_roots):
            return (
                None,
                "Copied production-readiness evidence retains stale source paths",
            )
    return summary, None


def capture_backend_fingerprint(
    *,
    context_id: str,
    base_url: str,
    baseline: dict[str, Any],
    captured_at_utc: str,
    http_json,
) -> dict[str, Any]:
    fp: dict[str, Any] = {
        "context_id": context_id,
        "base_url": base_url,
        "captured_at_utc": captured_at_utc,
        "git_sha_expected": baseline.get("git_sha"),
    }
    endpoints: dict[str, Any] = {}
    for name, endpoint in {
        "health": "/api/v1/health",
        "auth_config": "/api/v1/auth/config",
        "root": "/",
    }.items():
        url = f"{base_url}{endpoint}"
        try:
            status, payload = http_json(url, timeout=8.0)
            endpoints[name] = {"status": status, "payload": payload}
        except Exception as exc:  # noqa: BLE001
            endpoints[name] = {"error": str(exc)}
    fp["endpoints"] = endpoints

    health_payload = endpoints.get("health", {}).get("payload", {})
    auth_payload = endpoints.get("auth_config", {}).get("payload", {})
    fp["app_version"] = health_payload.get("version")
    fp["service_name"] = health_payload.get("service")
    fp["auth_mode"] = auth_payload.get("auth_mode")
    fp["demo_login_enabled"] = auth_payload.get("demo_login_enabled")
    fp["sso_enabled"] = (
        auth_payload.get("sso", {}).get("enabled")
        if isinstance(auth_payload, dict)
        else None
    )
    fp["git_sha_observed_unavailable_reason"] = (
        "Application endpoints do not expose a verified source identity."
    )
    return fp


def resolve_source_identity(source_path: Path) -> dict[str, Any]:
    try:
        git_root = subprocess.run(
            ["git", "-C", str(source_path), "rev-parse", "--show-toplevel"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        git_sha = subprocess.run(
            ["git", "-C", git_root, "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError) as exc:
        return {
            "git_sha_observed_unavailable_reason": (
                f"Git identity unavailable for {source_path}: {exc}"
            )
        }
    return {
        "source_git_root": git_root,
        "git_sha_observed": git_sha,
    }


def resolve_listener_source_identity(port: int) -> dict[str, Any]:
    try:
        pid_output = subprocess.run(
            [
                "lsof",
                "-nP",
                f"-iTCP:{port}",
                "-sTCP:LISTEN",
                "-t",
            ],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
        pid = int(next(line for line in pid_output.splitlines() if line.strip()))
        cwd_output = subprocess.run(
            ["lsof", "-a", "-p", str(pid), "-d", "cwd", "-Fn"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
        cwd = next(
            line[1:]
            for line in cwd_output.splitlines()
            if line.startswith("n") and len(line) > 1
        )
    except (OSError, StopIteration, ValueError, subprocess.CalledProcessError) as exc:
        return {
            "git_sha_observed_unavailable_reason": (
                f"Listener process identity unavailable on port {port}: {exc}"
            )
        }
    return {
        "runtime_pid": pid,
        "runtime_cwd": cwd,
        **resolve_source_identity(Path(cwd)),
    }


def _listener_is_in_process_lineage(listener_pid: int, launch_pid: int) -> bool:
    current_pid = listener_pid
    visited: set[int] = set()
    while current_pid > 1 and current_pid not in visited:
        if current_pid == launch_pid:
            return True
        visited.add(current_pid)
        try:
            parent_output = subprocess.run(
                ["ps", "-o", "ppid=", "-p", str(current_pid)],
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()
            current_pid = int(parent_output)
        except (OSError, ValueError, subprocess.CalledProcessError):
            return False
    return False


def docker_container_identity(names: list[str], *, run_command) -> dict[str, Any]:
    state: dict[str, Any] = {}
    for name in names:
        command = (
            "docker inspect --format "
            "'{{json .Id}}\t{{json .Image}}\t{{json .Name}}\t"
            "{{json .Config.Image}}\t{{json .State.Status}}\t"
            "{{json .State.Health}}\t{{json .Mounts}}' "
            f"{shlex.quote(name)}"
        )
        result = run_command(
            f"docker_inspect_{name}", command, required=False, timeout_sec=60
        )
        parsed: dict[str, Any] = {"exists": result.rc == 0}
        if result.rc != 0:
            state[name] = parsed
            continue
        text = Path(result.log_path).read_text(encoding="utf-8", errors="replace")
        lines = [
            line.strip()
            for line in text.splitlines()
            if line.strip() and not line.startswith("$ ")
        ]
        parts = lines[-1].split("\t", 6) if lines else []
        if len(parts) != 7:
            parsed["image_identity_error"] = (
                "Docker container identity output was malformed."
            )
            state[name] = parsed
            continue
        try:
            (
                container_id,
                running_image_id,
                container_name,
                image_ref,
                status,
                health,
                mounts,
            ) = (json.loads(part) for part in parts)
        except (json.JSONDecodeError, TypeError):
            parsed["image_identity_error"] = (
                "Docker container identity output was malformed."
            )
            state[name] = parsed
            continue
        if not isinstance(mounts, list) or not (
            health is None or isinstance(health, dict)
        ):
            parsed["image_identity_error"] = (
                "Docker container identity output was malformed."
            )
            state[name] = parsed
            continue
        parsed.update(
            {
                "container_id": container_id,
                "name": container_name,
                "image": image_ref,
                "image_ref": image_ref,
                "running_image_id": running_image_id,
                "status": status,
                "health": health.get("Status") if health else None,
            }
        )
        if isinstance(image_ref, str) and image_ref:
            image_command = (
                "docker image inspect --format '{{json .Id}}' "
                f"{shlex.quote(image_ref)}"
            )
            image_result = run_command(
                f"docker_image_inspect_{name}",
                image_command,
                required=False,
                timeout_sec=60,
            )
            if image_result.rc == 0:
                image_text = Path(image_result.log_path).read_text(
                    encoding="utf-8", errors="replace"
                )
                image_lines = [
                    line.strip()
                    for line in image_text.splitlines()
                    if line.strip() and not line.startswith("$ ")
                ]
                if image_lines:
                    try:
                        parsed["expected_image_id"] = json.loads(image_lines[-1])
                    except (json.JSONDecodeError, TypeError):
                        pass
            if "expected_image_id" not in parsed:
                parsed["image_identity_error"] = (
                    f"Local image identity unavailable for {image_ref}."
                )
        app_mount = next(
            (
                mount
                for mount in mounts
                if mount.get("Destination") == "/app"
                and isinstance(mount.get("Source"), str)
            ),
            None,
        )
        if app_mount is not None:
            parsed["source_mount"] = {
                "destination": "/app",
                "source": app_mount["Source"],
                **resolve_source_identity(Path(app_mount["Source"])),
            }
        state[name] = parsed
    return state


def start_background_service(
    *,
    context_id: str,
    command: str,
    logs_dir: Path,
    root_dir: Path,
    baseline: dict[str, Any],
    readiness_url: str,
    listener_port: int,
    wait_http,
    http_json,
    capture_screenshot,
    captured_at_utc,
    endpoint_base_url: str | None = None,
    screenshot_url: str | None = None,
    screenshot_file: Path | None = None,
    max_wait_sec: int = 90,
) -> dict[str, Any]:
    log_path = logs_dir / f"{context_id}.log"
    with log_path.open("w", encoding="utf-8") as handle:
        handle.write(f"$ {command}\n\n")
        handle.flush()
        proc = subprocess.Popen(  # noqa: S603
            ["bash", "-c", command],
            cwd=str(root_dir),
            stdout=handle,
            stderr=subprocess.STDOUT,
            preexec_fn=os.setsid,
            text=True,
        )
        started = False
        start_epoch = time.time()
        try:
            while time.time() - start_epoch < max_wait_sec:
                if proc.poll() is not None:
                    break
                if wait_http(readiness_url, timeout_sec=2):
                    started = True
                    break
            fingerprint: dict[str, Any] = {
                "context_id": context_id,
                "command": command,
                "started": started,
                "log": str(log_path),
                "git_sha_expected": baseline.get("git_sha"),
                "launch_pid": proc.pid,
                "launch_cwd": str(root_dir),
            }
            if not started:
                fingerprint["git_sha_observed_unavailable_reason"] = (
                    "Runtime did not reach readiness; source identity was not observed."
                )
            if started and endpoint_base_url:
                fingerprint.update(
                    capture_backend_fingerprint(
                        context_id=context_id,
                        base_url=endpoint_base_url,
                        baseline=baseline,
                        captured_at_utc=captured_at_utc(),
                        http_json=http_json,
                    )
                )
            if started and screenshot_url and screenshot_file:
                ok, shot_hash, ui_state = capture_screenshot(
                    f"{context_id}_screenshot",
                    screenshot_url,
                    screenshot_file,
                )
                fingerprint["screenshot"] = str(screenshot_file) if ok else None
                fingerprint["screenshot_sha256"] = shot_hash
                fingerprint["ui_state"] = ui_state
            if started:
                listener_identity = resolve_listener_source_identity(listener_port)
                listener_pid = listener_identity.get("runtime_pid")
                if isinstance(listener_pid, int) and _listener_is_in_process_lineage(
                    listener_pid, proc.pid
                ):
                    fingerprint.update(listener_identity)
                    if fingerprint.get("git_sha_observed") is not None:
                        fingerprint.pop("git_sha_observed_unavailable_reason", None)
                elif isinstance(listener_pid, int):
                    fingerprint.update(
                        {
                            "runtime_pid": listener_pid,
                            "runtime_cwd": listener_identity.get("runtime_cwd"),
                            "git_sha_observed_unavailable_reason": (
                                f"Listener process {listener_pid} on port "
                                f"{listener_port} is outside launched process lineage "
                                f"rooted at PID {proc.pid}."
                            ),
                        }
                    )
                else:
                    fingerprint.update(listener_identity)
            return fingerprint
        finally:
            if proc.poll() is None:
                os.killpg(proc.pid, signal.SIGTERM)
                try:
                    proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(proc.pid, signal.SIGKILL)
                    proc.wait(timeout=5)


def ingest_latest_existing_prod_readiness(
    *,
    root_dir: Path,
    prod_ingest_dir: Path,
    runtime_fingerprints: list[dict[str, Any]],
    captured_at_utc: str,
) -> None:
    candidates = sorted(
        (root_dir / "tests" / "results" / "prod").glob("prod-readiness-audit-*"),
        key=lambda p: p.stat().st_mtime,
    )
    if not candidates:
        runtime_fingerprints.append(
            {
                "context_id": "prod_readiness_ingest",
                "startup_path_id": "prod_readiness",
                "error": "No existing prod-readiness artifacts found",
            }
        )
        return
    latest = candidates[-1]
    prod_readiness_git_sha, prod_readiness_git_sha_error = _read_prod_readiness_git_sha(
        latest
    )
    prod_readiness_git_status_short, prod_readiness_git_status_short_error = (
        _read_prod_readiness_git_status_short(latest)
    )
    target = prod_ingest_dir / latest.name
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(latest, target)
    summary, summary_error = _rebase_prod_readiness_summary(
        target,
        source_artifact_dir=latest,
        source_root_dir=root_dir,
        durable_root_dir=root_dir,
    )
    run_rc, run_rc_error = _read_recorded_prod_readiness_rc(target)
    runtime_fingerprints.append(
        {
            "context_id": "prod_readiness_ingest",
            "startup_path_id": "prod_readiness",
            "source": str(latest),
            "copied_to": str(target),
            "run_rc": run_rc,
            "run_rc_error": run_rc_error,
            "prod_readiness_git_sha": prod_readiness_git_sha,
            "prod_readiness_git_sha_error": prod_readiness_git_sha_error,
            "prod_readiness_git_status_short": prod_readiness_git_status_short,
            "prod_readiness_git_status_short_error": prod_readiness_git_status_short_error,
            "summary": summary,
            "summary_error": summary_error,
            "captured_at_utc": captured_at_utc,
        }
    )


def ingest_prod_readiness_by_running_worktree(
    *,
    root_dir: Path,
    prod_ingest_dir: Path,
    runtime_fingerprints: list[dict[str, Any]],
    run_command,
    captured_at_utc,
) -> None:
    worktree_dir = Path(tempfile.mkdtemp(prefix="riskhub-parity-worktree-"))
    ingest_fingerprint: dict[str, Any] | None = None
    added = run_command(
        "prod_readiness_worktree_add",
        f"git worktree add --detach {shlex.quote(str(worktree_dir))} HEAD",
        required=False,
        timeout_sec=300,
    )
    if added.rc != 0:
        runtime_fingerprints.append(
            {
                "context_id": "prod_readiness_ingest",
                "startup_path_id": "prod_readiness",
                "error": "Could not create isolated worktree for production-readiness audit",
                "run_rc": added.rc,
                "summary": None,
            }
        )
        shutil.rmtree(worktree_dir, ignore_errors=True)
        return
    try:
        run_res = run_command(
            "prod_readiness_run",
            "bash scripts/security/run_prod_readiness_audit_local.sh",
            cwd=worktree_dir,
            required=False,
            timeout_sec=10800,
        )
        candidates = sorted(
            (worktree_dir / "tests" / "results" / "prod").glob(
                "prod-readiness-audit-*"
            ),
            key=lambda p: p.stat().st_mtime,
        )
        if not candidates:
            runtime_fingerprints.append(
                {
                    "context_id": "prod_readiness_ingest",
                    "startup_path_id": "prod_readiness",
                    "error": "No artifact generated by run_prod_readiness_audit_local.sh",
                    "run_rc": run_res.rc,
                }
            )
            return
        latest = candidates[-1]
        prod_readiness_git_sha, prod_readiness_git_sha_error = (
            _read_prod_readiness_git_sha(latest)
        )
        prod_readiness_git_status_short, prod_readiness_git_status_short_error = (
            _read_prod_readiness_git_status_short(latest)
        )
        target = prod_ingest_dir / latest.name
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(latest, target)
        summary, summary_error = _rebase_prod_readiness_summary(
            target,
            source_artifact_dir=latest,
            source_root_dir=worktree_dir,
            durable_root_dir=root_dir,
        )
        ingest_fingerprint = {
            "context_id": "prod_readiness_ingest",
            "startup_path_id": "prod_readiness",
            "source_worktree_removed": False,
            "copied_to": str(target),
            "run_rc": run_res.rc,
            "prod_readiness_git_sha": prod_readiness_git_sha,
            "prod_readiness_git_sha_error": prod_readiness_git_sha_error,
            "prod_readiness_git_status_short": prod_readiness_git_status_short,
            "prod_readiness_git_status_short_error": prod_readiness_git_status_short_error,
            "summary": summary,
            "summary_error": summary_error,
            "captured_at_utc": captured_at_utc(),
        }
        runtime_fingerprints.append(ingest_fingerprint)
    finally:
        removal = run_command(
            "prod_readiness_worktree_remove",
            f"git worktree remove --force {shlex.quote(str(worktree_dir))}",
            required=True,
            timeout_sec=300,
        )
        if ingest_fingerprint is not None:
            ingest_fingerprint.update(
                {
                    "source_worktree_removed": removal.rc == 0,
                    "source_worktree_remove_rc": removal.rc,
                    "source_worktree_remove_log": getattr(removal, "log_path", None),
                }
            )
        if removal.rc == 0:
            shutil.rmtree(worktree_dir, ignore_errors=True)
