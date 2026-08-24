#!/usr/bin/env python3
"""Validate the frontend container vulnerability gate and its workflow proof."""

from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_PATH = REPO_ROOT / ".github/workflows/security.yml"
CONTRACT_WORKFLOW_PATH = (
    REPO_ROOT / ".github/workflows/frontend-container-gate-contract.yml"
)
STATUS_HELPER = REPO_ROOT / "scripts/security/frontend_trivy_status.py"
SARIF_SCHEMA_URI = (
    "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/"
    "sarif-2.1/schema/sarif-schema-2.1.0.json"
)


def _step_by_name(steps: list[dict], name: str) -> tuple[int, dict]:
    for index, step in enumerate(steps):
        if step.get("name") == name:
            return index, step
    raise ValueError(f"missing workflow step: {name}")


def _load_yaml(path: Path) -> dict:
    payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{path.name} must contain a workflow object")
    return payload


def _reject_continue_on_error(errors: list[str], subject: str, node: dict) -> None:
    if node.get("continue-on-error") is True:
        errors.append(f"{subject} must remain blocking; continue-on-error is forbidden")


def _validate_injected_finding_workflow() -> list[str]:
    errors: list[str] = []
    if not CONTRACT_WORKFLOW_PATH.is_file():
        return ["missing injected-finding workflow proof"]

    raw_text = CONTRACT_WORKFLOW_PATH.read_text(encoding="utf-8")
    for trigger in ("pull_request:", "push:", "workflow_dispatch:"):
        if trigger not in raw_text:
            errors.append(
                f"injected-finding workflow is missing trigger: {trigger}"
            )

    try:
        workflow = _load_yaml(CONTRACT_WORKFLOW_PATH)
        job = workflow["jobs"]["injected-finding-contract"]
        steps = job["steps"]
    except (OSError, KeyError, TypeError, ValueError, yaml.YAMLError) as exc:
        return [*errors, f"unable to load injected-finding workflow: {exc}"]

    if job.get("name") != "Frontend Container Injected Finding Contract":
        errors.append("injected-finding workflow must expose the named contract job")
    _reject_continue_on_error(errors, "injected-finding contract job", job)

    try:
        _, generated = _step_by_name(steps, "Generate injected Trivy SARIF finding")
        _, recorded = _step_by_name(steps, "Record injected frontend finding")
        _, proved = _step_by_name(steps, "Prove injected finding is blocked")
        _, validated = _step_by_name(steps, "Validate production workflow contract")
    except ValueError as exc:
        return [*errors, str(exc)]

    for step_name, step in (
        ("injected SARIF generator", generated),
        ("injected-finding recorder", recorded),
        ("injected-finding blocking proof", proved),
        ("production-contract validation", validated),
    ):
        _reject_continue_on_error(errors, step_name, step)

    generate_script = str(generated.get("run", ""))
    for required_text in (
        f'"$schema": "{SARIF_SCHEMA_URI}"',
        '"name": "Trivy"',
        '"fullName": "Trivy Vulnerability Scanner"',
        '"informationUri": "https://github.com/aquasecurity/trivy"',
        '"ruleId": "CVE-INJECTED-CONTRACT"',
        '"message": {',
        '"text": "Injected qualifying frontend container finding"',
    ):
        if required_text not in generate_script:
            errors.append(
                f"injected SARIF generator is missing: {required_text}"
            )

    record_script = str(recorded.get("run", ""))
    for required_text in (
        "frontend_trivy_status.py record",
        "--outcome success",
        "--sarif trivy-frontend-injected.sarif",
        "--output trivy-frontend-injected-status.json",
    ):
        if required_text not in record_script:
            errors.append(
                f"injected-finding recorder is missing: {required_text}"
            )

    proof_script = str(proved.get("run", ""))
    for required_text in (
        "if python3 scripts/security/frontend_trivy_status.py enforce",
        "--status-file trivy-frontend-injected-status.json",
        'payload["status"] == "findings"',
        'payload["finding_count"] == 1',
    ):
        if required_text not in proof_script:
            errors.append(
                f"injected-finding blocking proof is missing: {required_text}"
            )

    validate_script = str(validated.get("run", ""))
    if "validate_frontend_container_gate.py" not in validate_script:
        errors.append("injected-finding workflow must validate the production contract")

    return errors


def validate() -> list[str]:
    errors = _validate_injected_finding_workflow()

    if not STATUS_HELPER.is_file():
        errors.append("missing frontend Trivy status recorder/enforcer")
    else:
        helper_text = STATUS_HELPER.read_text(encoding="utf-8")
        for required_text in (
            "SARIF_SCHEMA_URI",
            "TRIVY_DRIVER_FULL_NAME",
            "TRIVY_INFORMATION_URI",
            "REQUIRED_STATUS_FIELDS",
            "sarif_sha256",
            "_valid_result_message",
            "_status_errors",
        ):
            if required_text not in helper_text:
                errors.append(
                    f"frontend Trivy status helper is missing: {required_text}"
                )

    try:
        workflow = _load_yaml(WORKFLOW_PATH)
        container_job = workflow["jobs"]["container-security"]
        steps = container_job["steps"]
    except (OSError, KeyError, TypeError, ValueError, yaml.YAMLError) as exc:
        return [*errors, f"unable to load container-security workflow: {exc}"]

    _reject_continue_on_error(errors, "production container-security job", container_job)

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
    _reject_continue_on_error(errors, "frontend scan-status recorder", status_record)
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
    _reject_continue_on_error(errors, "frontend enforcement step", gate)
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
