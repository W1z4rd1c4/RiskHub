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

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPO_ROOT / "backend"
TOOLCHAIN = REPO_ROOT / ".tool-versions"
ENTRYPOINT = BACKEND_ROOT / "requirements-dev.txt"
INPUT = BACKEND_ROOT / "requirements-dev.in"
LOCK = BACKEND_ROOT / "requirements-dev-constraints.txt"
AUDIT_CONSTRAINTS = BACKEND_ROOT / "requirements-prod-readiness-audit-constraints.txt"
REFRESH_SCRIPT = REPO_ROOT / "scripts/tools/refresh_python_dependency_lock.py"
REFRESH_WORKFLOW = REPO_ROOT / ".github/workflows/python-dev-lock-refresh.yml"
DIGEST_RE = re.compile(r"^# (input|lock)-sha256: ([0-9a-f]{64})$")


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

    requested_by_name = {
        canonicalize_name(requirement.name): requirement for requirement in requested
    }
    pip_audit_requirement = requested_by_name.get("pip-audit")
    if pip_audit_requirement is None or str(pip_audit_requirement.specifier) != "==2.10.0":
        errors.append("requirements-dev.in must request pip-audit==2.10.0 exactly")

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
        if requirement.specifier and locked_requirement.version not in requirement.specifier:
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
    if not REFRESH_WORKFLOW.is_file():
        errors.append("missing scheduled Python dependency lock refresh workflow")
    else:
        workflow_text = REFRESH_WORKFLOW.read_text(encoding="utf-8")
        for required_text in (
            "schedule:",
            "workflow_dispatch:",
            "refresh_python_dependency_lock.py",
            "gh pr create",
            "python-version: '3.13'",
        ):
            if required_text not in workflow_text:
                errors.append(
                    f"Python dependency refresh workflow is missing: {required_text}"
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