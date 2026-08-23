#!/usr/bin/env python3
"""Validate the frontend container vulnerability gate in security.yml."""

from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_PATH = REPO_ROOT / ".github/workflows/security.yml"
STATUS_HELPER = REPO_ROOT / "scripts/security/frontend_trivy_status.py"


def _step_by_name(steps: list[dict], name: str) -> tuple[int, dict]:
    for index, step in enumerate(steps):
        if step.get("name") == name:
            return index, step
    raise ValueError(f"missing workflow step: {name}")


def validate() -> list[str]:
    errors: list[str] = []

    if not STATUS_HELPER.is_file():
        errors.append("missing frontend Trivy status recorder/enforcer")

    try:
        workflow = yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))
        steps = workflow["jobs"]["container-security"]["steps"]
    except (OSError, KeyError, TypeError, yaml.YAMLError) as exc:
        return [f"unable to load container-security workflow: {exc}"]

    try:
        scan_index, scan = _step_by_name(steps, "Run Trivy on Frontend")
        status_index, status_record = _step_by_name(
            steps,
            "Record Frontend Trivy Scan Status",
        )
        sarif_index, sarif_upload = _step_by_name(
            steps,
            "Upload Trivy Frontend Report",
        )
        artifact_index, artifact_upload = _step_by_name(
            steps,
            "Upload Container Security Reports",
        )
        gate_index, gate = _step_by_name(
            steps,
            "Enforce Frontend Trivy HIGH/CRITICAL Gate",
        )
    except ValueError as exc:
        return [*errors, str(exc)]

    if scan.get("id") != "trivy_frontend":
        errors.append("frontend Trivy scan must expose id=trivy_frontend")
    if scan.get("continue-on-error") is not True:
        errors.append(
            "frontend Trivy scan must continue temporarily so reports can upload"
        )

    action = str(scan.get("uses", ""))
    if not re.fullmatch(r"aquasecurity/trivy-action@[0-9a-f]{40}", action):
        errors.append("frontend Trivy action must remain pinned to a full commit SHA")

    options = scan.get("with", {})
    expected_options = {
        "image-ref": "riskhub-frontend:scan",
        "format": "sarif",
        "output": "trivy-frontend.sarif",
        "severity": "CRITICAL,HIGH",
        "exit-code": "1",
        "limit-severities-for-sarif": True,
    }
    for key, expected in expected_options.items():
        if options.get(key) != expected:
            errors.append(
                f"frontend Trivy option {key!r} must be {expected!r}, "
                f"got {options.get(key)!r}"
            )

    if status_record.get("if") != "always()":
        errors.append("frontend scan-status recorder must run with if: always()")
    status_env = status_record.get("env", {})
    if status_env.get("FRONTEND_TRIVY_OUTCOME") != "${{ steps.trivy_frontend.outcome }}":
        errors.append("frontend scan-status recorder must consume the raw scan outcome")
    status_script = str(status_record.get("run", ""))
    for required_text in (
        "frontend_trivy_status.py record",
        '"$FRONTEND_TRIVY_OUTCOME"',
        "--sarif trivy-frontend.sarif",
        "--output trivy-frontend-status.json",
    ):
        if required_text not in status_script:
            errors.append(
                f"frontend scan-status recorder is missing: {required_text}"
            )

    if sarif_upload.get("if") != "always()":
        errors.append("frontend SARIF upload must run with if: always()")

    if artifact_upload.get("if") != "always()":
        errors.append("container report artifact upload must run with if: always()")
    artifact_paths = str(artifact_upload.get("with", {}).get("path", ""))
    for required_path in (
        "trivy-frontend.sarif",
        "trivy-frontend-status.json",
    ):
        if required_path not in artifact_paths:
            errors.append(
                f"container report artifact must retain {required_path}"
            )

    if gate.get("if") != "always()":
        errors.append("frontend enforcement step must run with if: always()")
    gate_script = str(gate.get("run", ""))
    for required_text in (
        "frontend_trivy_status.py enforce",
        "--status-file trivy-frontend-status.json",
    ):
        if required_text not in gate_script:
            errors.append(f"frontend enforcement step is missing: {required_text}")

    if not (scan_index < status_index < sarif_index < gate_index):
        errors.append(
            "frontend status must be recorded after the scan and before SARIF upload/enforcement"
        )
    if not (scan_index < status_index < artifact_index < gate_index):
        errors.append(
            "frontend status artifact must be generated and uploaded before enforcement"
        )

    return errors


def main() -> int:
    errors = validate()
    if errors:
        for error in errors:
            print(f"frontend-container-gate error: {error}", file=sys.stderr)
        return 1
    print("Frontend container vulnerability gate: valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
