#!/usr/bin/env python3
"""Validate the stable contributor façade and executable CI ownership map."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
FACADE = REPO_ROOT / "scripts/riskhub.sh"
INSTALLER = REPO_ROOT / "scripts/install.sh"
MAKEFILE = REPO_ROOT / "scripts/Makefile"
SCRIPT_README = REPO_ROOT / "scripts/README.md"
DEVELOPMENT_README = REPO_ROOT / "docs/development/README.md"
CONTRIBUTING = REPO_ROOT / "CONTRIBUTING.md"
CONTRACT_DOC = REPO_ROOT / "docs/development/CONTRIBUTOR_COMMANDS.md"
CI_CONTRACT = REPO_ROOT / "docs/development/ci-gate-contract.json"

EXPECTED_DELEGATES = {
    "setup": "exec ./scripts/install.sh doctor --mode dev --repair",
    "dev": 'exec ./scripts/install.sh dev "$@"',
    "lint": "exec make --no-print-directory -f scripts/Makefile lint lint-types",
    "test": "exec make --no-print-directory -f scripts/Makefile test",
    "e2e": "exec make --no-print-directory -f scripts/Makefile test-e2e",
    "release-check": (
        "exec make --no-print-directory -f scripts/Makefile release-parity-audit"
    ),
    "clean": "exec make --no-print-directory -f scripts/Makefile clean",
}

EXPECTED_MAKE_TARGETS = {
    "clean",
    "lint",
    "lint-types",
    "release-parity-audit",
    "test",
    "test-e2e",
}

EXPECTED_REQUIRED_CHECKS = {
    "Backend Quality",
    "Docker Onboarding Smoke",
    "Frontend + Repo Contracts",
    "PR Merge Result Build",
    "Playwright E2E Tests",
    "Public Repo Hygiene",
}

GOVERNED_WORKFLOWS = {
    ".github/workflows/backend-postgres.yml",
    ".github/workflows/e2e.yml",
    ".github/workflows/lint.yml",
    ".github/workflows/maintenance-governance.yml",
    ".github/workflows/release-parity-fast.yml",
    ".github/workflows/release-parity-pr.yml",
    ".github/workflows/security.yml",
    ".github/workflows/startup-smoke.yml",
}


def _declared_make_targets() -> set[str]:
    targets: set[str] = set()
    for raw_line in MAKEFILE.read_text(encoding="utf-8").splitlines():
        if raw_line.startswith((" ", "\t", ".")):
            continue
        match = re.match(r"^([A-Za-z0-9_-]+)\s*:", raw_line)
        if match:
            targets.add(match.group(1))
    return targets


def _load_json_object(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{path.relative_to(REPO_ROOT)} must contain an object")
    return payload


def _load_workflow(path: Path) -> dict[str, Any]:
    payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{path.relative_to(REPO_ROOT)} must contain an object")
    return payload


def _workflow_on(workflow: dict[str, Any]) -> Any:
    # PyYAML's YAML 1.1 resolver may deserialize the key `on` as boolean True.
    if "on" in workflow:
        return workflow["on"]
    return workflow.get(True)


def _trigger_map(workflow: dict[str, Any]) -> dict[str, Any]:
    value = _workflow_on(workflow)
    if isinstance(value, str):
        return {value: None}
    if isinstance(value, list):
        return {str(item): None for item in value}
    if isinstance(value, dict):
        return {str(key): item for key, item in value.items()}
    raise ValueError("workflow `on` must be a string, list, or mapping")


def _validate_facade() -> list[str]:
    errors: list[str] = []

    if not FACADE.is_file():
        return ["missing scripts/riskhub.sh"]
    if not os.access(FACADE, os.X_OK):
        errors.append("scripts/riskhub.sh must be executable")
    if not INSTALLER.is_file() or not os.access(INSTALLER, os.X_OK):
        errors.append(
            "canonical scripts/install.sh delegate must exist and be executable"
        )
    if not MAKEFILE.is_file():
        errors.append("canonical scripts/Makefile delegate must exist")

    script_text = FACADE.read_text(encoding="utf-8")
    for command, delegate in EXPECTED_DELEGATES.items():
        if f"    {command})" not in script_text:
            errors.append(f"missing command case: {command}")
        if delegate not in script_text:
            errors.append(f"command {command} does not use its canonical delegate")

    exec_lines = [
        line.strip()
        for line in script_text.splitlines()
        if line.strip().startswith("exec ")
    ]
    expected_exec_lines = list(EXPECTED_DELEGATES.values())
    if sorted(exec_lines) != sorted(expected_exec_lines):
        errors.append(
            "façade contains an undocumented, missing, or duplicated executable path"
        )
    if len(exec_lines) != len(set(exec_lines)):
        errors.append("façade must not reuse one executable delegate for multiple commands")

    if MAKEFILE.is_file():
        missing_targets = EXPECTED_MAKE_TARGETS - _declared_make_targets()
        if missing_targets:
            errors.append(
                "façade delegates to missing Make targets: "
                + ", ".join(sorted(missing_targets))
            )

    syntax = subprocess.run(
        ["bash", "-n", str(FACADE)],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if syntax.returncode != 0:
        errors.append(f"bash syntax validation failed: {syntax.stderr.strip()}")

    for required_help in (
        "Stop local dev/Compose, then run the full release-parity audit",
        "keep backend/venv",
    ):
        if required_help not in script_text:
            errors.append(f"façade help is missing side-effect disclosure: {required_help}")

    return errors


def _validate_ci_contract() -> list[str]:
    errors: list[str] = []
    if not CI_CONTRACT.is_file():
        return ["missing docs/development/ci-gate-contract.json"]

    try:
        contract = _load_json_object(CI_CONTRACT)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
        return [f"unable to load CI gate contract: {exc}"]

    if contract.get("schema_version") != 1:
        errors.append("CI gate contract schema_version must equal 1")

    required_checks = contract.get("required_on_protected_main")
    if (
        not isinstance(required_checks, list)
        or len(required_checks) != len(set(required_checks))
        or set(required_checks) != EXPECTED_REQUIRED_CHECKS
    ):
        errors.append(
            "CI gate contract required-check snapshot must match the protected-main contract"
        )

    checks = contract.get("checks")
    if not isinstance(checks, list) or not checks:
        return [*errors, "CI gate contract must contain a non-empty checks list"]

    seen_names: set[str] = set()
    seen_job_keys: set[tuple[str, str]] = set()
    workflow_cache: dict[Path, tuple[dict[str, Any], dict[str, Any]]] = {}

    for index, entry in enumerate(checks):
        label = f"CI gate contract checks[{index}]"
        if not isinstance(entry, dict):
            errors.append(f"{label} must be an object")
            continue

        job_name = entry.get("job_name")
        workflow_name = entry.get("workflow")
        job_id = entry.get("job_id")
        triggers = entry.get("triggers")
        owner = entry.get("owner")
        budget = entry.get("runtime_budget")
        required = entry.get("required_on_protected_main")

        if not isinstance(job_name, str) or not job_name:
            errors.append(f"{label}.job_name must be a non-empty string")
            continue
        if job_name in seen_names:
            errors.append(f"duplicate CI job display name: {job_name}")
        seen_names.add(job_name)

        if (
            not isinstance(workflow_name, str)
            or workflow_name not in GOVERNED_WORKFLOWS
        ):
            errors.append(f"{label}.workflow is not a governed workflow path")
            continue
        if not isinstance(job_id, str) or not job_id:
            errors.append(f"{label}.job_id must be a non-empty string")
            continue

        job_key = (workflow_name, job_id)
        if job_key in seen_job_keys:
            errors.append(f"duplicate CI workflow/job mapping: {workflow_name}:{job_id}")
        seen_job_keys.add(job_key)

        if not isinstance(triggers, list) or not triggers or not all(
            isinstance(trigger, str) and trigger for trigger in triggers
        ):
            errors.append(f"{label}.triggers must be a non-empty string list")
            continue
        if not isinstance(owner, str) or not owner:
            errors.append(f"{label}.owner must be a non-empty string")
        if (
            not isinstance(budget, str)
            or re.fullmatch(r"\d+[-–]\d+ min", budget) is None
        ):
            errors.append(f"{label}.runtime_budget must use `N-N min` format")
        if type(required) is not bool:
            errors.append(f"{label}.required_on_protected_main must be boolean")

        workflow_path = REPO_ROOT / workflow_name
        if workflow_path not in workflow_cache:
            try:
                workflow = _load_workflow(workflow_path)
                workflow_cache[workflow_path] = (workflow, _trigger_map(workflow))
            except (
                OSError,
                UnicodeDecodeError,
                ValueError,
                yaml.YAMLError,
            ) as exc:
                errors.append(f"unable to load {workflow_name}: {exc}")
                continue

        workflow, actual_triggers = workflow_cache[workflow_path]
        if set(triggers) != set(actual_triggers):
            errors.append(
                f"{job_name} trigger map {sorted(triggers)} does not match "
                f"{workflow_name} {sorted(actual_triggers)}"
            )

        jobs = workflow.get("jobs")
        if not isinstance(jobs, dict) or job_id not in jobs:
            errors.append(f"{workflow_name} does not contain job {job_id!r}")
            continue
        job = jobs[job_id]
        if not isinstance(job, dict):
            errors.append(f"{workflow_name}:{job_id} must be a job object")
            continue
        if job.get("name") != job_name:
            errors.append(
                f"{workflow_name}:{job_id} display name must be {job_name!r}"
            )

        expected_continue = entry.get("continue_on_error")
        if (
            expected_continue is not None
            and job.get("continue-on-error") is not expected_continue
        ):
            errors.append(
                f"{workflow_name}:{job_id} continue-on-error does not match contract"
            )

        job_if_contains = entry.get("job_if_contains")
        if job_if_contains is not None:
            if not isinstance(job_if_contains, str) or job_if_contains not in str(
                job.get("if", "")
            ):
                errors.append(
                    f"{workflow_name}:{job_id} job condition does not match contract"
                )

        if entry.get("pull_request_path_filtered") is True:
            pull_request_config = actual_triggers.get("pull_request")
            if not isinstance(pull_request_config, dict) or not pull_request_config.get(
                "paths"
            ):
                errors.append(
                    f"{workflow_name} must retain path-filtered pull_request execution"
                )

        if required is True:
            if job_name not in EXPECTED_REQUIRED_CHECKS:
                errors.append(f"unexpected protected-main required check: {job_name}")
            if "pull_request" not in actual_triggers:
                errors.append(
                    f"required check {job_name} cannot run because its workflow lacks pull_request"
                )

    for workflow_name in sorted(GOVERNED_WORKFLOWS):
        workflow_path = REPO_ROOT / workflow_name
        if workflow_path not in workflow_cache:
            try:
                workflow = _load_workflow(workflow_path)
                workflow_cache[workflow_path] = (workflow, _trigger_map(workflow))
            except (
                OSError,
                UnicodeDecodeError,
                ValueError,
                yaml.YAMLError,
            ) as exc:
                errors.append(f"unable to inventory {workflow_name}: {exc}")
                continue
        workflow, _ = workflow_cache[workflow_path]
        jobs = workflow.get("jobs")
        if not isinstance(jobs, dict):
            errors.append(f"{workflow_name} must contain a jobs mapping")
            continue
        actual_job_keys = {(workflow_name, str(job_id)) for job_id in jobs}
        mapped_job_keys = {
            job_key for job_key in seen_job_keys if job_key[0] == workflow_name
        }
        missing_jobs = actual_job_keys - mapped_job_keys
        extra_jobs = mapped_job_keys - actual_job_keys
        if missing_jobs:
            errors.append(
                f"CI gate contract omits jobs from {workflow_name}: "
                + ", ".join(sorted(job_id for _, job_id in missing_jobs))
            )
        if extra_jobs:
            errors.append(
                f"CI gate contract names unknown jobs in {workflow_name}: "
                + ", ".join(sorted(job_id for _, job_id in extra_jobs))
            )

    return errors


def _validate_documentation() -> list[str]:
    errors: list[str] = []
    documentation_checks = {
        SCRIPT_README: "docs/development/CONTRIBUTOR_COMMANDS.md",
        DEVELOPMENT_README: "CONTRIBUTOR_COMMANDS.md",
        CONTRIBUTING: "CONTRIBUTOR_COMMANDS.md",
    }
    for path, expected_link in documentation_checks.items():
        if not path.is_file():
            errors.append(f"missing documentation index: {path.relative_to(REPO_ROOT)}")
            continue
        if expected_link not in path.read_text(encoding="utf-8"):
            errors.append(
                f"{path.relative_to(REPO_ROOT)} does not link to the command contract"
            )

    if not CONTRACT_DOC.is_file():
        return [*errors, "missing contributor command contract document"]

    contract_text = CONTRACT_DOC.read_text(encoding="utf-8")
    for command in (*EXPECTED_DELEGATES, "help"):
        if f"`{command}" not in contract_text:
            errors.append(f"command contract does not document {command}")
    for required_section in (
        "## Stable Commands",
        "## Advanced Surface",
        "## CI Gate Map",
        "## Change Policy",
        "## Validation",
    ):
        if required_section not in contract_text:
            errors.append(f"command contract is missing {required_section}")
    for required_term in (
        "ci-gate-contract.json",
        "Backend SQLite Regression",
        "Production Profile Smoke",
        "Path-filtered PR",
        "Manual dispatch only",
        "stops local development processes",
        "intentionally keeps `backend/venv`",
        "not SLAs",
        "lint lint-types",
    ):
        if required_term not in contract_text:
            errors.append(
                f"command contract is missing CI/side-effect term: {required_term}"
            )

    return errors


def validate() -> list[str]:
    return [
        *_validate_facade(),
        *_validate_ci_contract(),
        *_validate_documentation(),
    ]


def main() -> int:
    errors = validate()
    if errors:
        for error in errors:
            print(f"contributor-command error: {error}", file=sys.stderr)
        return 1
    print("Contributor command and CI contract: valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
