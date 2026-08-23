#!/usr/bin/env python3
"""Validate the frontend container vulnerability gate in security.yml."""

from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_PATH = REPO_ROOT / ".github/workflows/security.yml"


def _step_by_name(steps: list[dict], name: str) -> tuple[int, dict]:
    for index, step in enumerate(steps):
        if step.get("name") == name:
            return index, step
    raise ValueError(f"missing workflow step: {name}")


def validate() -> list[str]:
    errors: list[str] = []

    try:
        workflow = yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))
        steps = workflow["jobs"]["container-security"]["steps"]
    except (OSError, KeyError, TypeError, yaml.YAMLError) as exc:
        return [f"unable to load container-security workflow: {exc}"]

    try:
        scan_index, scan = _step_by_name(steps, "Run Trivy on Frontend")
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
        return [str(exc)]

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

    if sarif_upload.get("if") != "always()":
        errors.append("frontend SARIF upload must run with if: always()")

    if artifact_upload.get("if") != "always()":
        errors.append("container report artifact upload must run with if: always()")
    artifact_paths = str(artifact_upload.get("with", {}).get("path", ""))
    if "trivy-frontend.sarif" not in artifact_paths:
        errors.append("container report artifact must retain trivy-frontend.sarif")

    if gate.get("if") != "always()":
        errors.append("frontend enforcement step must run with if: always()")
    env = gate.get("env", {})
    if env.get("FRONTEND_TRIVY_OUTCOME") != "${{ steps.trivy_frontend.outcome }}":
        errors.append("frontend enforcement step must consume the raw scan outcome")
    gate_script = str(gate.get("run", ""))
    if 'FRONTEND_TRIVY_OUTCOME" != "success' not in gate_script:
        errors.append("frontend enforcement step must fail on any non-success outcome")
    if "exit 1" not in gate_script:
        errors.append("frontend enforcement step must return a non-zero exit code")

    if not (scan_index < sarif_index < gate_index):
        errors.append("frontend SARIF must upload after the scan and before enforcement")
    if not (scan_index < artifact_index < gate_index):
        errors.append(
            "frontend machine-readable artifact must upload before enforcement"
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
