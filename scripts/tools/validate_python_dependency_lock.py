#!/usr/bin/env python3
"""Validate the canonical backend development dependency lock."""

from __future__ import annotations

import hashlib
import re
import sys
from dataclasses import dataclass
from pathlib import Path

from packaging.requirements import Requirement
from packaging.utils import canonicalize_name
from packaging.version import Version

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPO_ROOT / "backend"
TOOLCHAIN = REPO_ROOT / ".tool-versions"
ENTRYPOINT = BACKEND_ROOT / "requirements-dev.txt"
INPUT = BACKEND_ROOT / "requirements-dev.in"
LOCK = BACKEND_ROOT / "requirements-dev-constraints.txt"
AUDIT_CONSTRAINTS = BACKEND_ROOT / "requirements-prod-readiness-audit-constraints.txt"
REFRESH_SCRIPT = REPO_ROOT / "scripts/tools/refresh_python_dependency_lock.py"
PERMISSION_HELPER = REPO_ROOT / "scripts/tools/check_github_pr_automation_permissions.py"
REFRESH_WORKFLOW = REPO_ROOT / ".github/workflows/python-dev-lock-refresh.yml"
DIGEST_RE = re.compile(r"^# (input|lock)-sha256: ([0-9a-f]{64})$")
AUTOMATION_SECRET = "RISKHUB_AUTOMATION_PR_TOKEN"


@dataclass(frozen=True)
class LockedRequirement:
    requirement: Requirement
    version: str


def _logical_lines(path: Path) -> list[str]:
    lines: list[str] = []
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if " #" in line:
            line = line.split(" #", maxsplit=1)[0].rstrip()
        lines.append(line)
    return lines


def _load_requested_requirements(
    path: Path,
    *,
    visited: set[Path] | None = None,
) -> list[Requirement]:
    resolved_path = path.resolve()
    seen = visited if visited is not None else set()
    if resolved_path in seen:
        raise ValueError(f"recursive requirements include: {resolved_path}")
    seen.add(resolved_path)

    requirements: list[Requirement] = []
    for line in _logical_lines(resolved_path):
        if line.startswith(("-r ", "--requirement ")):
            include = line.split(maxsplit=1)[1]
            requirements.extend(
                _load_requested_requirements(
                    resolved_path.parent / include,
                    visited=seen,
                )
            )
            continue
        if line.startswith(("-c ", "--constraint ")):
            continue
        requirements.append(Requirement(line))
    seen.remove(resolved_path)
    return requirements


def _load_lock(path: Path) -> dict[str, LockedRequirement]:
    locked: dict[str, LockedRequirement] = {}
    for line in _logical_lines(path):
        if line.startswith(("-r ", "--requirement ", "-c ", "--constraint ")):
            raise ValueError(f"{path.name} must contain pins only: {line}")
        requirement = Requirement(line)
        if requirement.url is not None or requirement.marker is not None:
            raise ValueError(f"{path.name} must contain index pins only: {line}")
        specifiers = list(requirement.specifier)
        if len(specifiers) != 1:
            raise ValueError(f"{path.name} must use one exact pin: {line}")
        specifier = specifiers[0]
        if specifier.operator != "==" or "*" in specifier.version:
            raise ValueError(f"{path.name} must use a non-wildcard == pin: {line}")
        name = canonicalize_name(requirement.name)
        if name in locked:
            raise ValueError(f"duplicate lock entry for {requirement.name}")
        locked[name] = LockedRequirement(requirement, specifier.version)
    return locked


def _entrypoint_digests() -> dict[str, str]:
    digests: dict[str, str] = {}
    for raw_line in ENTRYPOINT.read_text(encoding="utf-8").splitlines():
        match = DIGEST_RE.fullmatch(raw_line.strip())
        if match:
            digests[match.group(1)] = match.group(2)
    return digests


def _expected_entrypoint() -> str:
    input_digest = hashlib.sha256(INPUT.read_bytes()).hexdigest()
    lock_digest = hashlib.sha256(LOCK.read_bytes()).hexdigest()
    return (
        "# Canonical backend development/test install entrypoint.\n"
        "# Human-edited intent lives in requirements-dev.in; exact resolution is installed\n"
        "# from requirements-dev-constraints.txt for both local setup and CI.\n"
        f"# input-sha256: {input_digest}\n"
        f"# lock-sha256: {lock_digest}\n"
        "-r requirements-dev.in\n"
        "-r requirements-dev-constraints.txt\n"
    )


def validate() -> list[str]:
    errors: list[str] = []

    expected_entrypoint = [
        "-r requirements-dev.in",
        "-r requirements-dev-constraints.txt",
    ]
    if _logical_lines(ENTRYPOINT) != expected_entrypoint:
        errors.append(
            "requirements-dev.txt must contain only the canonical input and exact "
            "lock requirement includes, in that order"
        )

    try:
        entrypoint_text = ENTRYPOINT.read_text(encoding="utf-8")
    except OSError as exc:
        errors.append(str(exc))
        return errors
    if entrypoint_text != _expected_entrypoint():
        errors.append(
            "requirements-dev.txt must be byte-identical to refresher output, "
            "including its terminal newline"
        )

    entrypoint_digests = _entrypoint_digests()
    expected_input_digest = hashlib.sha256(INPUT.read_bytes()).hexdigest()
    expected_lock_digest = hashlib.sha256(LOCK.read_bytes()).hexdigest()
    if entrypoint_digests.get("input") != expected_input_digest:
        errors.append(
            "requirements-dev.txt input-sha256 must match requirements-dev.in"
        )
    if entrypoint_digests.get("lock") != expected_lock_digest:
        errors.append(
            "requirements-dev.txt lock-sha256 must match requirements-dev-constraints.txt"
        )

    try:
        requested = _load_requested_requirements(INPUT)
        entrypoint_requirements = _load_requested_requirements(ENTRYPOINT)
        locked = _load_lock(LOCK)
        audit_locked = _load_lock(AUDIT_CONSTRAINTS)
    except (OSError, ValueError) as exc:
        errors.append(str(exc))
        return errors

    locked_versions = {name: item.version for name, item in locked.items()}
    audit_versions = {name: item.version for name, item in audit_locked.items()}
    if locked_versions != audit_versions:
        errors.append(
            "development and production-readiness audit locks must be exact mirrors"
        )
    if locked_versions.get("pip-audit") != "2.10.0":
        errors.append("combined resolver lock must pin pip-audit==2.10.0")
    pip_version = locked_versions.get("pip")
    if pip_version is None:
        errors.append("unsafe pip lock: pip must be pinned at or above 26.1.2")
    elif Version(pip_version) < Version("26.1.2"):
        errors.append(
            f"unsafe pip lock: pip=={pip_version} is below fixed version 26.1.2"
        )
    pytest_version = locked_versions.get("pytest")
    if pytest_version is not None and Version(pytest_version) < Version("9.0.3"):
        errors.append(
            f"unsafe pytest lock: pytest=={pytest_version} is below fixed version 9.0.3"
        )

    requested_by_name = {
        canonicalize_name(requirement.name): requirement for requirement in requested
    }
    pytest_requirement = requested_by_name.get("pytest")
    if (
        pytest_requirement is None
        or str(pytest_requirement.specifier) != "<10,>=9.0.3"
    ):
        errors.append(
            "requirements-dev.in must request pytest>=9.0.3,<10 exactly"
        )
    pip_audit_requirement = requested_by_name.get("pip-audit")
    if (
        pip_audit_requirement is None
        or str(pip_audit_requirement.specifier) != "==2.10.0"
    ):
        errors.append("requirements-dev.in must request pip-audit==2.10.0 exactly")
    syrupy_requirement = requested_by_name.get("syrupy")
    if (
        syrupy_requirement is None
        or str(syrupy_requirement.specifier) != "==5.0.*"
    ):
        errors.append("requirements-dev.in must request syrupy==5.0.* exactly")

    entrypoint_names = {
        canonicalize_name(requirement.name) for requirement in entrypoint_requirements
    }
    if not set(locked_versions) <= entrypoint_names:
        errors.append("requirements-dev.txt must install every package in the exact lock")

    for requirement in requested:
        name = canonicalize_name(requirement.name)
        locked_requirement = locked.get(name)
        if locked_requirement is None:
            errors.append(f"direct requirement is absent from lock: {requirement}")
            continue
        if (
            requirement.specifier
            and locked_requirement.version not in requirement.specifier
        ):
            errors.append(
                f"locked {requirement.name}=={locked_requirement.version} "
                f"does not satisfy {requirement.specifier}"
            )

    expected_toolchain = ["python 3.13", "nodejs 24"]
    toolchain_lines = [
        line.strip()
        for line in TOOLCHAIN.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    if toolchain_lines != expected_toolchain:
        errors.append(".tool-versions must canonically declare Python 3.13 and Node 24")

    if not REFRESH_SCRIPT.is_file():
        errors.append("missing one-command Python dependency lock refresher")
    elif 'PIP_VERSION = "26.2.1"' not in REFRESH_SCRIPT.read_text(encoding="utf-8"):
        errors.append("dependency lock refresher must install pip==26.2.1")
    if not PERMISSION_HELPER.is_file():
        errors.append("missing executable GitHub automation permission preflight")
    else:
        helper_text = PERMISSION_HELPER.read_text(encoding="utf-8")
        for required_text in (
            'permissions.get("push") is not True',
            '"gh", "auth", "setup-git"',
            '"--dry-run"',
            'payload={}',
            'status == 422',
            'status in {401, 403, 404}',
        ):
            if required_text not in helper_text:
                errors.append(
                    f"GitHub automation permission helper is missing: {required_text}"
                )

    if not REFRESH_WORKFLOW.is_file():
        errors.append("missing scheduled Python dependency lock refresh workflow")
    else:
        workflow_text = REFRESH_WORKFLOW.read_text(encoding="utf-8")
        permission_command = "python3 scripts/tools/check_github_pr_automation_permissions.py"
        refresh_command = "python3 scripts/tools/refresh_python_dependency_lock.py"
        for required_text in (
            "schedule:",
            "workflow_dispatch:",
            "if: github.ref == 'refs/heads/main'",
            permission_command,
            refresh_command,
            "gh pr create",
            "gh auth setup-git",
            "persist-credentials: false",
            "python-version: '3.13'",
            "Validate automation credential and mutation permissions",
            AUTOMATION_SECRET,
        ):
            if required_text not in workflow_text:
                errors.append(
                    f"Python dependency refresh workflow is missing: {required_text}"
                )
        if (
            permission_command in workflow_text
            and refresh_command in workflow_text
            and workflow_text.index(permission_command)
            > workflow_text.index(refresh_command)
        ):
            errors.append(
                "automation permission preflight must run before dependency resolution"
            )
        for forbidden_text in (
            "expect_validation_error",
            "repos/${GITHUB_REPOSITORY}/git/refs",
            "__riskhub_permission_probe_missing__",
            "0000000000000000000000000000000000000000",
        ):
            if forbidden_text in workflow_text:
                errors.append(
                    "Python dependency refresh workflow duplicates permission logic: "
                    f"{forbidden_text}"
                )
        if "secrets.GITHUB_TOKEN" in workflow_text:
            errors.append(
                "Python dependency refresh workflow must not use GITHUB_TOKEN for PR creation"
            )
        if "contents: write" in workflow_text or "pull-requests: write" in workflow_text:
            errors.append(
                "workflow-scoped GITHUB_TOKEN permissions must remain read-only; "
                "the approved automation token owns branch and PR writes"
            )

    return errors


def main() -> int:
    errors = validate()
    if errors:
        for error in errors:
            print(f"dependency-lock error: {error}", file=sys.stderr)
        return 1
    print("Backend development dependency lock: valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
