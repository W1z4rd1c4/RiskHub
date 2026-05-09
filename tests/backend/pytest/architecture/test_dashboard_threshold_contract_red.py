from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
DASHBOARD_SHARED = REPO_ROOT / "backend/app/api/v1/endpoints/dashboard/_shared.py"


def _dashboard_shared_tree() -> ast.Module:
    return ast.parse(DASHBOARD_SHARED.read_text())


def test_dashboard_shared_has_no_static_risk_level_ranges() -> None:
    tree = _dashboard_shared_tree()
    forbidden_assignments = {"RISK_LEVEL_RANGES"}
    assigned_names = {
        target.id
        for node in ast.walk(tree)
        if isinstance(node, (ast.Assign, ast.AnnAssign))
        for target in ([node.target] if isinstance(node, ast.AnnAssign) else node.targets)
        if isinstance(target, ast.Name)
    }

    assert forbidden_assignments.isdisjoint(assigned_names)


def test_dashboard_shared_has_no_default_threshold_imports() -> None:
    tree = _dashboard_shared_tree()
    imported_names = {
        alias.name
        for node in ast.walk(tree)
        if isinstance(node, ast.ImportFrom)
        for alias in node.names
    }

    assert "ConfigDefaults" not in imported_names
    assert "build_risk_level_ranges" not in imported_names


def test_dashboard_shared_has_no_default_threshold_predicate_builder() -> None:
    tree = _dashboard_shared_tree()
    function_names = {node.name for node in ast.walk(tree) if isinstance(node, ast.FunctionDef)}

    assert "build_risk_level_condition" not in function_names
