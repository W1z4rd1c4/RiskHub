from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
GOVERNANCE = REPO_ROOT / "backend/app/services/_orphaned_items/governance.py"
RESOLUTION_PLAN = REPO_ROOT / "backend/app/services/_orphaned_items/resolution_plan.py"


def _class_names(path: Path) -> set[str]:
    tree = ast.parse(path.read_text())
    return {node.name for node in ast.walk(tree) if isinstance(node, ast.ClassDef)}


def test_orphan_resolution_plan_has_one_canonical_execution_symbol() -> None:
    classes_by_file = {
        "governance.py": _class_names(GOVERNANCE),
        "resolution_plan.py": _class_names(RESOLUTION_PLAN),
    }

    assert "OrphanResolutionPlan" not in classes_by_file["governance.py"]
    assert "OrphanResolutionPlan" in classes_by_file["resolution_plan.py"]
    assert "OrphanResolutionRequirements" in classes_by_file["governance.py"]
