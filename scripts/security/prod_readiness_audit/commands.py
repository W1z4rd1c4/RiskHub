from __future__ import annotations

import json
import os
import subprocess
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from prod_readiness_audit.run_state import ProdReadinessRunState


_DOCKER_HOST_PREREQUISITE_COMMAND_IDS = {
    "p2_verify_prod_install_scripts",
    "p3_start_postgres",
    "p3_start_registry",
}
_DOCKER_HOST_FAILURE_MARKERS = (
    "cannot connect to the docker daemon",
    "docker daemon is unavailable",
    "docker daemon not reachable",
    "is the docker daemon running",
)
_PYTHON_HOST_FAILURES = {
    "riskhub_python313_unavailable": "python313_unavailable",
    "riskhub_python313_version_unsupported": "python_version_unsupported",
}


class EnvironmentBlocked(RuntimeError):
    def __init__(self, command_id: str, failure_code: str) -> None:
        self.command_id = command_id
        self.failure_code = failure_code
        super().__init__(f"Host prerequisite failed: {command_id}")


@dataclass(frozen=True)
class ProdReadinessCommand:
    command_id: str
    command: str
    required: bool = True
    timeout_sec: int = 120
    cwd: Path | None = None


def _command_output(value: str | bytes | None) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


def run_command(
    state: ProdReadinessRunState, spec: ProdReadinessCommand
) -> dict[str, object]:
    cwd = spec.cwd or state.root_dir
    log_path = state.log_dir / f"{spec.command_id}.log"
    start = datetime.now(UTC)
    start_epoch = time.time()
    timed_out = False
    try:
        completed = subprocess.run(
            ["bash", "-lc", spec.command],
            cwd=cwd,
            env={
                **os.environ,
                "RISKHUB_AUDIT_PYTHON": state.python_executable,
            },
            text=True,
            capture_output=True,
            timeout=spec.timeout_sec,
            check=False,
        )
        return_code = completed.returncode
        output = f"{completed.stdout or ''}{completed.stderr or ''}"
    except subprocess.TimeoutExpired as exc:
        timed_out = True
        return_code = 124
        output = (
            f"{_command_output(exc.output)}{_command_output(exc.stderr)}"
            f"\n[command timed out after {spec.timeout_sec} seconds]\n"
        )
    end = datetime.now(UTC)
    duration = round(time.time() - start_epoch, 3)
    log_path.write_text(f"$ {spec.command}\n\n{output}", encoding="utf-8")
    result_path = state.log_dir / f"{spec.command_id}.result.json"
    result = {
        "id": spec.command_id,
        "command": spec.command,
        "rc": return_code,
        "timed_out": timed_out,
    }
    result_path.write_text(
        json.dumps(result, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )
    row = {
        "id": spec.command_id,
        "command": spec.command,
        "cwd": str(cwd),
        "start_utc": start.isoformat(),
        "end_utc": end.isoformat(),
        "duration_sec": duration,
        "rc": result["rc"],
        "log": str(log_path),
        "result": str(result_path),
        "required": spec.required,
        "timeout_sec": spec.timeout_sec,
        "timed_out": timed_out,
    }
    state.command_results.append(row)
    if spec.required and result["rc"] != 0:
        state.required_failures += 1
    with state.matrix_ndjson.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(row, ensure_ascii=True) + "\n")
    output_text = output.lower()
    if (
        spec.command_id in _DOCKER_HOST_PREREQUISITE_COMMAND_IDS
        and result["rc"] != 0
        and any(marker in output_text for marker in _DOCKER_HOST_FAILURE_MARKERS)
    ):
        raise EnvironmentBlocked(spec.command_id, "docker_daemon_unavailable")
    if spec.command_id == "meta_python_version" and result["rc"] != 0:
        failure_code = next(
            (
                code
                for marker, code in _PYTHON_HOST_FAILURES.items()
                if marker in output_text
            ),
            None,
        )
        if failure_code:
            raise EnvironmentBlocked(spec.command_id, failure_code)
    return row


def write_command_matrix(state: ProdReadinessRunState) -> None:
    state.matrix_json.write_text(
        json.dumps(state.command_results, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )
