from __future__ import annotations

import json
import os
import shlex
import shutil
import signal
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class RuntimeFingerprint:
    data: dict[str, Any]


def build_runtime_fingerprint(data: dict[str, Any]) -> RuntimeFingerprint:
    return RuntimeFingerprint(data=dict(data))


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
    fp["sso_enabled"] = auth_payload.get("sso", {}).get("enabled") if isinstance(auth_payload, dict) else None
    fp["git_sha_observed"] = baseline.get("git_sha")
    return fp


def start_background_service(
    *,
    context_id: str,
    command: str,
    logs_dir: Path,
    root_dir: Path,
    baseline: dict[str, Any],
    readiness_url: str,
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
                "git_sha_observed": baseline.get("git_sha"),
            }
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
    target = prod_ingest_dir / latest.name
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(latest, target)
    runtime_fingerprints.append(
        {
            "context_id": "prod_readiness_ingest",
            "startup_path_id": "prod_readiness",
            "source": str(latest),
            "copied_to": str(target),
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
    fallback_ingest,
) -> None:
    worktree_dir = Path(tempfile.mkdtemp(prefix="riskhub-parity-worktree-"))
    added = run_command(
        "prod_readiness_worktree_add",
        f"git worktree add --detach {shlex.quote(str(worktree_dir))} HEAD",
        required=False,
        timeout_sec=300,
    )
    if added.rc != 0:
        fallback_ingest()
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
            (worktree_dir / "tests" / "results" / "prod").glob("prod-readiness-audit-*"),
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
        target = prod_ingest_dir / latest.name
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(latest, target)
        summary_path = target / "SUMMARY.json"
        summary = json.loads(summary_path.read_text(encoding="utf-8")) if summary_path.exists() else None
        runtime_fingerprints.append(
            {
                "context_id": "prod_readiness_ingest",
                "startup_path_id": "prod_readiness",
                "source_worktree": str(latest),
                "copied_to": str(target),
                "run_rc": run_res.rc,
                "summary": summary,
                "captured_at_utc": captured_at_utc(),
            }
        )
    finally:
        run_command(
            "prod_readiness_worktree_remove",
            f"git worktree remove --force {shlex.quote(str(worktree_dir))}",
            required=False,
            timeout_sec=300,
        )
        shutil.rmtree(worktree_dir, ignore_errors=True)
