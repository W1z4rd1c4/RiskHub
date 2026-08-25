#!/usr/bin/env python3
"""Validate the frontend container vulnerability gate and its workflow proof."""

from __future__ import annotations

import hashlib
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
DEFAULT_TRIVY_PATHS = (".trivyignore", "trivy.yaml")
APPROVED_PRODUCTION_TRIGGERS = {
    "push": {"branches": ["main", "develop"]},
    "pull_request": {"branches": ["main", "develop"]},
    "schedule": [
        {"cron": "0 2 * * *"},
        {"cron": "0 0 * * 0"},
    ],
}
EXPECTED_STATUS_RECORD_COMMAND = (
    'python3 scripts/security/frontend_trivy_status.py record '
    '--outcome "$FRONTEND_TRIVY_OUTCOME" '
    "--sarif trivy-frontend.sarif "
    "--output trivy-frontend-status.json"
)
EXPECTED_ENFORCEMENT_COMMAND = (
    "python3 scripts/security/frontend_trivy_status.py enforce "
    "--status-file trivy-frontend-status.json"
)
UPLOAD_ARTIFACT_ACTION = (
    "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a"
)
EXPECTED_PRODUCTION_ARTIFACT_PATHS = frozenset(
    {
        "trivy-backend.sarif",
        "trivy-frontend.sarif",
        "trivy-frontend-status.json",
        "sbom-backend.json",
        "grype-backend.json",
    }
)
EXPECTED_INJECTED_ARTIFACT_PATHS = frozenset(
    {
        "trivy-frontend-injected.sarif",
        "trivy-frontend-injected-status.json",
    }
)
EXPECTED_INJECTED_GENERATOR_SHA256 = (
    "3272083d6bcad943bcf4a2635b68e9c46e69859875bc2557652208b5d5323d43"
)
EXPECTED_INJECTED_PROOF_SHA256 = (
    "8fba6415b4b235b2db594283ac2f21accbf481a48c2235b218ee82b6e8ece8be"
)
EXPECTED_INJECTED_RECORD_COMMAND = (
    "python3 scripts/security/frontend_trivy_status.py record "
    "--outcome success "
    "--sarif trivy-frontend-injected.sarif "
    "--output trivy-frontend-injected-status.json"
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


def _reject_run_defaults(errors: list[str], subject: str, node: dict) -> None:
    if "defaults" in node:
        errors.append(f"{subject} must not define defaults affecting run steps")


def _require_exact_keys(
    errors: list[str],
    subject: str,
    node: dict,
    expected: set[str],
) -> None:
    if set(node) != expected:
        errors.append(
            f"{subject} keys must be exactly {', '.join(sorted(expected))}"
        )


def _normalize_run_command(command: object) -> str:
    if not isinstance(command, str):
        return ""
    return " ".join(command.replace("\\\n", " ").split())


def _script_sha256(script: object) -> str:
    if not isinstance(script, str):
        return ""
    return hashlib.sha256(script.encode("utf-8")).hexdigest()


def _artifact_paths(value: object) -> tuple[str, ...]:
    if not isinstance(value, str):
        return ()
    return tuple(line.strip() for line in value.splitlines() if line.strip())


def _validate_artifact_upload(
    errors: list[str],
    subject: str,
    step: dict,
    *,
    expected_name: str,
    expected_paths: frozenset[str],
) -> None:
    _require_exact_keys(errors, subject, step, {"name", "if", "uses", "with"})
    if step.get("if") != "always()":
        errors.append(f"{subject} must run with if: always()")
    if step.get("uses") != UPLOAD_ARTIFACT_ACTION:
        errors.append(f"{subject} must use the approved upload-artifact action")

    options = step.get("with")
    if not isinstance(options, dict):
        errors.append(f"{subject} artifact inputs must be a mapping")
        return
    expected_keys = {"name", "path", "retention-days", "if-no-files-found"}
    if set(options) != expected_keys:
        errors.append(f"{subject} artifact input keys must match exactly")
    if options.get("name") != expected_name:
        errors.append(f"{subject} artifact name must be {expected_name!r}")
    paths = _artifact_paths(options.get("path"))
    if len(paths) != len(expected_paths) or frozenset(paths) != expected_paths:
        errors.append(f"{subject} artifact paths must match exactly")
    if options.get("retention-days") != 30:
        errors.append(f"{subject} artifact retention must remain 30 days")
    if options.get("if-no-files-found") != "error":
        errors.append(f"{subject} artifact must fail when files are missing")


def _validate_pre_scan_steps(
    errors: list[str],
    steps: list[dict],
    scan_index: int,
) -> None:
    expected = [
        {
            "uses": "actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd",
            "with": {"ref": "${{ github.event.pull_request.head.sha || github.sha }}"},
        },
        {
            "name": "Build Backend Image",
            "run": "docker build -t riskhub-backend:scan -f backend/Dockerfile backend/",
        },
        {
            "name": "Build Frontend Image",
            "run": "docker build -t riskhub-frontend:scan -f frontend/Dockerfile frontend/",
        },
        {
            "name": "Run Trivy on Backend",
            "uses": "aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25",
            "with": {
                "image-ref": "riskhub-backend:scan",
                "format": "sarif",
                "output": "trivy-backend.sarif",
                "severity": "CRITICAL,HIGH",
            },
        },
    ]
    actual = steps[:scan_index]
    if len(actual) != len(expected):
        errors.append("production pre-scan step sequence must match exactly")
        return
    for index, (step, approved) in enumerate(zip(actual, expected, strict=True)):
        normalized = dict(step)
        if "run" in normalized:
            normalized["run"] = _normalize_run_command(normalized["run"])
        if normalized != approved:
            errors.append(
                f"production pre-scan step {index + 1} must match exactly; "
                "TRIVY_ and GITHUB_ENV injection is forbidden"
            )


def _validate_production_triggers(workflow: dict) -> list[str]:
    errors: list[str] = []
    triggers = workflow.get("on", workflow.get(True))
    if not isinstance(triggers, dict):
        return ["production security workflow must define trigger mappings"]

    for name, approved in APPROVED_PRODUCTION_TRIGGERS.items():
        if name not in triggers:
            errors.append(f"production security workflow must define {name} trigger")
        elif triggers[name] != approved:
            requirement = " including main" if name == "push" else ""
            errors.append(
                f"production {name} trigger must match the approved configuration"
                f"{requirement}"
            )

    unexpected = set(triggers) - set(APPROVED_PRODUCTION_TRIGGERS)
    if unexpected:
        errors.append(
            "production security workflow has unapproved triggers: "
            + ", ".join(sorted(str(name) for name in unexpected))
        )
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

    _reject_run_defaults(errors, "injected-finding workflow", workflow)
    _reject_run_defaults(errors, "injected-finding contract job", job)
    if job.get("name") != "Frontend Container Injected Finding Contract":
        errors.append("injected-finding workflow must expose the named contract job")
    _reject_continue_on_error(errors, "injected-finding contract job", job)
    if "if" in job:
        errors.append("injected-finding contract job must not be conditional")
    if "needs" in job:
        errors.append("injected-finding contract job must not declare needs")

    expected_step_names = [
        None,
        "Set up Python",
        "Install pinned workflow parser",
        "Generate injected Trivy SARIF finding",
        "Record injected frontend finding",
        "Prove injected finding is blocked",
        "Validate production workflow contract",
        "Upload injected-finding evidence",
    ]
    if [step.get("name") for step in steps] != expected_step_names:
        errors.append("injected-finding step sequence must match exactly")

    expected_checkout = {
        "uses": "actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd",
        "with": {"ref": "${{ github.event.pull_request.head.sha || github.sha }}"},
    }
    if not steps or steps[0] != expected_checkout:
        errors.append("injected-finding checkout step must match exactly")
    expected_setup = {
        "name": "Set up Python",
        "uses": "actions/setup-python@a309ff8b426b58ec0e2a45f0f869d46889d02405",
        "with": {"python-version": "3.13"},
    }
    if len(steps) < 2 or steps[1] != expected_setup:
        errors.append("injected-finding Python setup step must match exactly")
    if len(steps) < 3:
        errors.append("injected-finding parser install step is missing")
    else:
        parser_install = steps[2]
        _require_exact_keys(
            errors,
            "injected-finding parser install step",
            parser_install,
            {"name", "run"},
        )
        if _normalize_run_command(parser_install.get("run")) != (
            "python3 -m pip install PyYAML==6.0.3"
        ):
            errors.append("injected-finding parser install command must match exactly")

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

    for subject, step in (
        ("injected SARIF generator", generated),
        ("injected-finding recorder", recorded),
        ("injected-finding blocking proof", proved),
        ("production-contract validation", validated),
    ):
        _require_exact_keys(errors, subject, step, {"name", "run"})

    if _script_sha256(generated.get("run")) != EXPECTED_INJECTED_GENERATOR_SHA256:
        errors.append("injected SARIF generator script must match exactly")
    if _normalize_run_command(recorded.get("run")) != EXPECTED_INJECTED_RECORD_COMMAND:
        errors.append("injected-finding recorder command must match exactly")
    if _script_sha256(proved.get("run")) != EXPECTED_INJECTED_PROOF_SHA256:
        errors.append("injected-finding blocking proof script must match exactly")
    if _normalize_run_command(validated.get("run")) != (
        "python3 scripts/security/validate_frontend_container_gate.py"
    ):
        errors.append("production-contract validation command must match exactly")

    _validate_artifact_upload(
        errors,
        "injected evidence artifact",
        evidence_upload,
        expected_name="frontend-container-injected-finding-evidence",
        expected_paths=EXPECTED_INJECTED_ARTIFACT_PATHS,
    )

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

    for relative_path in DEFAULT_TRIVY_PATHS:
        if (REPO_ROOT / relative_path).is_file():
            errors.append(
                f"default Trivy configuration path {relative_path} is forbidden"
            )

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
    _reject_run_defaults(errors, "production security workflow", workflow)
    _reject_run_defaults(errors, "production container-security job", container_job)
    _reject_continue_on_error(errors, "production container-security job", container_job)
    if "if" in container_job:
        errors.append("production container-security job must not be conditional")
    if "needs" in container_job:
        errors.append("production container-security job must not declare needs")
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

    _validate_pre_scan_steps(errors, steps, scan_index)
    _require_exact_keys(
        errors,
        "frontend Trivy scan step",
        scan,
        {"name", "id", "continue-on-error", "uses", "with"},
    )
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

    _require_exact_keys(
        errors,
        "frontend scan-status recorder step",
        status_record,
        {"name", "if", "env", "run"},
    )
    if status_record.get("if") != "always()":
        errors.append("frontend scan-status recorder must run with if: always()")
    _reject_continue_on_error(errors, "frontend scan-status recorder", status_record)
    status_env = status_record.get("env", {})
    expected_status_env = {
        "FRONTEND_TRIVY_OUTCOME": "${{ steps.trivy_frontend.outcome }}"
    }
    if status_env != expected_status_env:
        errors.append("frontend scan-status recorder must consume the raw scan outcome")
    status_script = _normalize_run_command(status_record.get("run"))
    if status_script != EXPECTED_STATUS_RECORD_COMMAND:
        errors.append("frontend scan-status recorder command must match exactly")

    if sarif_upload.get("if") != "always()":
        errors.append("frontend SARIF upload must run with if: always()")

    _validate_artifact_upload(
        errors,
        "container report artifact",
        artifact_upload,
        expected_name="container-security-reports",
        expected_paths=EXPECTED_PRODUCTION_ARTIFACT_PATHS,
    )

    _require_exact_keys(
        errors,
        "frontend enforcement step",
        gate,
        {"name", "if", "run"},
    )
    if gate.get("if") != "always()":
        errors.append("frontend enforcement step must run with if: always()")
    _reject_continue_on_error(errors, "frontend enforcement step", gate)
    gate_script = _normalize_run_command(gate.get("run"))
    if gate_script != EXPECTED_ENFORCEMENT_COMMAND:
        errors.append("frontend enforcement command must match exactly")

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
