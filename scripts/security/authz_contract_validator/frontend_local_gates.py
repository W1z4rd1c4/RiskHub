"""Frontend local authorization gate classification validation."""

from __future__ import annotations

import re
from collections.abc import Mapping
from pathlib import Path

from authz_contract_manifest import (  # type: ignore[import-not-found]
    FRONTEND_LOCAL_GATE_CLASSIFICATIONS,
    FrontendLocalGateClassification,
)

from .contract_manifest import FRONTEND_SOURCE_SUFFIXES
from .models import Finding

REPO_ROOT = Path(__file__).resolve().parents[3]
FRONTEND_LOCAL_GATE_PATTERN = re.compile(r"\b(PermissionGate|usePermissions|hasPermission)\b")


def frontend_local_gate_lines_from_diff(diff_text: str) -> list[str]:
    lines: list[str] = []
    for line in diff_text.splitlines():
        if line.startswith(("+++", "---")):
            continue
        if line.startswith("+") and FRONTEND_LOCAL_GATE_PATTERN.search(line[1:]):
            lines.append(line[1:].strip())
    return lines


def diff_has_frontend_local_gate_tokens(diff_text: str) -> bool:
    return bool(frontend_local_gate_lines_from_diff(diff_text))


def frontend_local_gate_lines_from_source(path: Path, repo_root: Path = REPO_ROOT) -> list[str]:
    return [
        line.strip()
        for line in (repo_root / path).read_text(encoding="utf-8", errors="replace").splitlines()
        if FRONTEND_LOCAL_GATE_PATTERN.search(line)
    ]


def line_matches_any_pattern(line: str, patterns: tuple[str, ...]) -> bool:
    return any(re.fullmatch(pattern, line) for pattern in patterns)


def validate_frontend_local_gate_classifications(
    changed_files: list[Path],
    diff_by_path: Mapping[Path, str] | None = None,
    classifications: Mapping[str, FrontendLocalGateClassification] | None = None,
    *,
    repo_root: Path = REPO_ROOT,
) -> list[Finding]:
    findings: list[Finding] = []
    classified = dict(FRONTEND_LOCAL_GATE_CLASSIFICATIONS if classifications is None else classifications)

    for path in changed_files:
        path_posix = path.as_posix()
        if not path_posix.startswith("frontend/src/") or path.suffix not in FRONTEND_SOURCE_SUFFIXES:
            continue

        local_gate_lines: list[str] = []
        if diff_by_path is not None:
            diff_text = diff_by_path.get(path, "")
            if diff_text:
                local_gate_lines = frontend_local_gate_lines_from_diff(diff_text)
            elif (repo_root / path).exists():
                local_gate_lines = frontend_local_gate_lines_from_source(path, repo_root)
        elif (repo_root / path).exists():
            local_gate_lines = frontend_local_gate_lines_from_source(path, repo_root)

        if not local_gate_lines:
            continue

        classification = classified.get(path_posix)
        if classification is None:
            findings.append(
                Finding(
                    "frontend_local_gate_not_classified",
                    f"{path_posix} changes local frontend authorization tokens "
                    "(hasPermission/usePermissions/PermissionGate) but is not classified as a "
                    "route, nav, read/session gate, or documented capability exception. Add a "
                    "backend-capability contract reference or classify the local gate with a reason.",
                )
            )
            continue

        allowed_patterns = classification["allowed_patterns"]
        disallowed_lines = [
            line for line in local_gate_lines if not line_matches_any_pattern(line, allowed_patterns)
        ]
        if disallowed_lines:
            findings.append(
                Finding(
                    "frontend_local_gate_not_allowed",
                    f"{path_posix} changes a local frontend authorization gate outside its "
                    f"classified allowance ({classification['reason']}): {disallowed_lines[0]!r}. "
                    "Use backend capability metadata for protected actions or add a narrower "
                    "documented local-gate pattern.",
                )
            )
    return findings


__all__ = [
    "Finding",
    "diff_has_frontend_local_gate_tokens",
    "frontend_local_gate_lines_from_diff",
    "frontend_local_gate_lines_from_source",
    "line_matches_any_pattern",
    "validate_frontend_local_gate_classifications",
]
