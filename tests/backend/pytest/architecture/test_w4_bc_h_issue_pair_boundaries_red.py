"""ADR-003 exception-taxonomy lock for the `_issue_register` <-> `_issue_workflow` pair.

ADR-003: "AST ban on `raise HTTPException` in migrated service packages and
reviewed core seams." The pair migrates together per ADR-007's workflow-pair
sweep rule; exception translation preserves the existing HTTP `detail` strings.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract


REPO_ROOT = Path(__file__).resolve().parents[4]
ISSUE_PAIR_ROOTS = (
    REPO_ROOT / "backend/app/services/_issue_register",
    REPO_ROOT / "backend/app/services/_issue_workflow",
)


def _python_files(root: Path) -> list[Path]:
    return sorted(path for path in root.rglob("*.py") if path.is_file())


def test_issue_pair_services_do_not_raise_fastapi_http_exceptions():
    offenders: list[str] = []
    for root in ISSUE_PAIR_ROOTS:
        for path in _python_files(root):
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            for node in ast.walk(tree):
                if not isinstance(node, ast.Raise) or node.exc is None:
                    continue
                call = node.exc
                if isinstance(call, ast.Call) and getattr(call.func, "id", None) == "HTTPException":
                    offenders.append(f"{path.relative_to(REPO_ROOT)}:{node.lineno}")

    assert offenders == []
