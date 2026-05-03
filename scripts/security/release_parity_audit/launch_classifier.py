from __future__ import annotations

from typing import Any


def classify_launch_failure(startup_path_id: str, log_text: str, launch_rc: int) -> dict[str, Any]:
    log_lower = log_text.lower()

    def result(
        classification: str,
        code: str,
        summary: str,
    ) -> dict[str, Any]:
        return {
            "classification": classification,
            "code": code,
            "summary": summary,
            "launch_rc": launch_rc,
        }

    if "dev_port_conflict_unexpected_process" in log_lower:
        return result(
            "environment_contamination",
            "unexpected_port_owner",
            "A required local port was owned by an unexpected process on the audit host.",
        )
    if "docker daemon is unavailable" in log_lower or "cannot connect to the docker daemon" in log_lower:
        return result(
            "environment_contamination",
            "docker_daemon_unavailable",
            "Docker was unavailable on the audit host for a Docker-backed startup path.",
        )
    if "docker is required" in log_lower or "docker daemon not reachable" in log_lower:
        return result(
            "environment_contamination",
            "docker_tooling_missing",
            "Docker tooling was unavailable for a Docker-backed startup path.",
        )
    if (
        "unsupported node.js major" in log_lower
        or "node.js is required but was not found" in log_lower
        or "npm is required but was not found" in log_lower
    ):
        return result(
            "environment_contamination",
            "toolchain_mismatch",
            "Node/npm on the audit host could not satisfy the startup script requirements.",
        )
    packaging_markers = (
        "backend/venv/bin/python",
        "./venv/bin/python",
        "package-lock.json",
        "requirements.txt",
        "requirements-runtime.txt",
        "requirements-db.txt",
        "no such file or directory",
        "missing required file",
        "missing required directory",
    )
    if any(marker in log_lower for marker in packaging_markers):
        return result(
            "environment_contamination",
            "parity_artifact_incomplete",
            "The parity workspace or generated artifacts were incomplete for this startup path.",
        )
    return result(
        "product_failure",
        "startup_path_failed",
        f"Startup path {startup_path_id} failed before parity fingerprints could be captured.",
    )
