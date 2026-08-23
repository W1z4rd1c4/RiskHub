#!/usr/bin/env python3
"""Validate the canonical backend development dependency lock."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import sys

from packaging.requirements import Requirement
from packaging.utils import canonicalize_name

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPO_ROOT / "backend"
ENTRYPOINT = BACKEND_ROOT / "requirements-dev.txt"
INPUT = BACKEND_ROOT / "requirements-dev.in"
LOCK = BACKEND_ROOT / "requirements-dev-constraints.txt"
AUDIT_CONSTRAINTS = BACKEND_ROOT / "requirements-prod-readiness-audit-constraints.txt"


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


def validate() -> list[str]:
    errors: list[str] = []

    entrypoint_lines = _logical_lines(ENTRYPOINT)
    expected_entrypoint = [
        "-c requirements-dev-constraints.txt",
        "-r requirements-dev.in",
    ]
    if entrypoint_lines != expected_entrypoint:
        errors.append(
            "requirements-dev.txt must contain only the canonical constraint "
            "and input includes, in that order"
        )

    audit_lines = _logical_lines(AUDIT_CONSTRAINTS)
    expected_audit = [
        "-c requirements-dev-constraints.txt",
        "pip-audit==2.10.0",
    ]
    if audit_lines != expected_audit:
        errors.append(
            "requirements-prod-readiness-audit-constraints.txt must compose "
            "the canonical lock and pin pip-audit==2.10.0"
        )

    try:
        requested = _load_requested_requirements(INPUT)
        locked = _load_lock(LOCK)
    except (OSError, ValueError) as exc:
        errors.append(str(exc))
        return errors

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
