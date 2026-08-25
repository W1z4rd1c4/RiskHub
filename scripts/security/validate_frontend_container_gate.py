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
    if "continue-on-error" in node and node.get("continue-on-error") is not False:
        errors.append(
            f"{subject} must remain blocking; continue-on-error expressions/true are forbidden"
        )


def _trigger_includes_branch(trigger: object, branch: str) -> bool:
    if trigger is None:
        return True
    if not isinstance(trigger, dict):
        return False

    branches = trigger.get("branches")
    if branches is not None:
        return isinstance(branches, list) and branch in branches

    ignored = trigger.get("branches-ignore")
    if ignored is None:
        return True
    return isinstance(ignored, list) and branch not in ignored


def _validate_production_triggers(workflow: dict) -> list[str]:
    errors: list[str] = []
    triggers = workflow.get("on", workflow.get(True))
    if not isinstance(triggers, dict):
        return ["production security workflow must define trigger mappings"]

    if "pull_request" not in triggers:
        errors.append("production security workflow must run on pull_request")
    elif not _trigger_includes_branch(triggers["pull_request"], "main"):
        errors.append("production pull_request trigger must include main")

    if "push" not in triggers:
        errors.append("production security workflow must run on push to main")
    elif not _trigger_includes_branch(triggers["push"], "main"):
        errors.append("production push trigger must include main")

    schedule = triggers.get("schedule")
    if not (
        isinstance(schedule, list)
        and schedule
        and all(
            isinstance(item, dict)
            and isinstance(item.get("cron"), str)
            and item["cron"].strip()
            for item in schedule
        )
    ):
        errors.append("production security workflow must define scheduled runs")
    return errors


def _reject_trivy_environment_overrides(
    errors: list[str],
    subject: str,
    node: dict,
) -> None:
    environment = node.get("env")
    if environment is None:
        return
    if not isinstance(environment, dict):
        errors.append(f"{subject} env must be a mapping without Trivy overrides")
        return
    for name in environment:
        if str(name).upper().startswith("TRIVY_"):
            errors.append(f"{subject} must not set Trivy override {name!r}")


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
        generated_index, generated = _step_by_name(
            steps,
            "Generate injected Trivy SARIF finding",
        )
        recorded_index, recorded = _step_by_name(
            steps,
            "Record injected frontend finding",
        )
        proof_index, proved = _step_by_name(steps, "Prove injected finding is blocked")
        validation_index, validated = _step_by_name(
            steps,
            "Validate production workflow contract",
        )
        upload_index, evidence_upload = _step_by_name(
            steps,
            "Upload injected-finding evidence",
        )
    except ValueError as exc:
        return [*errors, str(exc)]

    for step_name, step in (
        ("injected SARIF generator", generated),
        ("injected-finding recorder", recorded),
        ("injected-finding blocking proof", proved),
        ("production-contract validation", validated),
        ("injected evidence upload", evidence_upload),
    ):
        _reject_continue_on_error(errors, step_name, step)

    generate_script = str(generated.get("run", ""))
    for required_text in (
        f'"$schema": "{SARIF_SCHEMA_URI}"',
        '"name": "Trivy"',
        '"fullName": "Trivy Vulnerability Scanner"',
        '"informationUri": "https://github.com/aquasecurity/trivy"',
        '"id": "CVE-INJECTED-CONTRACT"',
        '"ruleId": "CVE-INJECTED-CONTRACT"',
        '"security-severity": "9.8"',
        '"CRITICAL"',
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
        "Injected CRITICAL frontend Trivy finding was rejected",
    ):
        if required_text not in proof_script:
            errors.append(
                f"injected-finding blocking proof is missing: {required_text}"
            )

    validate_script = str(validated.get("run", ""))
    if "validate_frontend_container_gate.py" not in validate_script:
        errors.append("injected-finding workflow must validate the production contract")

    upload_action = str(evidence_upload.get("uses", ""))
    if not re.fullmatch(r"actions/upload-artifact@[0-9a-f]{40}", upload_action):
        errors.append("injected evidence upload must use a commit-SHA-pinned action")
    if evidence_upload.get("if") != "always()":
        errors.append("injected evidence upload must run with if: always()")
    evidence_paths = str(evidence_upload.get("with", {}).get("path", ""))
    for required_path in (
        "trivy-frontend-injected.sarif",
        "trivy-frontend-injected-status.json",
    ):
        if required_path not in evidence_paths:
            errors.append(f"injected evidence artifact must retain {required_path}")
    if evidence_upload.get("with", {}).get("retention-days") != 30:
        errors.append("injected evidence artifact retention must remain 30 days")

    if not (
        generated_index
        < recorded_index
        < proof_index
        < validation_index
        < upload_index
    ):
        errors.append(
            "injected evidence must be generated, recorded, rejected, validated, and uploaded in order"
        )
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
            "KNOWN_SEVERITIES",
            "QUALIFYING_SEVERITIES",
            "REQUIRED_STATUS_FIELDS",
            "sarif_sha256",
            "_trivy_rules",
            "sarif_nonqualifying_result",
            "status evidence has unknown fields",
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

    errors.extend(_validate_production_triggers(workflow))
    _reject_continue_on_error(errors, "production container-security job", container_job)
    if "if" in container_job:
        errors.append("production container-security job must not be conditional")
    _reject_trivy_environment_overrides(errors, "production workflow", workflow)
    _reject_trivy_environment_overrides(
        errors,
        "production container-security job",
        container_job,
    )

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

    _reject_trivy_environment_overrides(errors, "frontend Trivy scan", scan)

    options = scan.get("with", {})
    if not isinstance(options, dict):
        errors.append("frontend Trivy inputs must be a mapping")
        options = {}
    expected_options = {
        "image-ref": "riskhub-frontend:scan",
        "format": "sarif",
        "output": "trivy-frontend.sarif",
        "scanners": "vuln",
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
    for key in sorted(set(options) - set(expected_options)):
        errors.append(f"frontend Trivy option {key!r} is not allowed")
    if "ignore-unfixed" in options:
        errors.append("frontend Trivy gate must not set ignore-unfixed")

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
    _reject_continue_on_error(errors, "container report artifact upload", artifact_upload)
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
