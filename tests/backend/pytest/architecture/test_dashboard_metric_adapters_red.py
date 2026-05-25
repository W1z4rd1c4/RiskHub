from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
DASHBOARD_ADAPTERS = [
    REPO_ROOT / "backend/app/api/v1/endpoints/dashboard/risks.py",
    REPO_ROOT / "backend/app/api/v1/endpoints/dashboard/kris.py",
    REPO_ROOT / "backend/app/api/v1/endpoints/dashboard/controls.py",
    REPO_ROOT / "backend/app/api/v1/endpoints/dashboard/departments.py",
]
FORBIDDEN_SQLALCHEMY_IMPORTS = {"and_", "case", "desc", "func", "or_", "select"}


def _imported_names(tree: ast.Module, *, module_prefix: str) -> set[str]:
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module and node.module.startswith(module_prefix):
            names.update(alias.name for alias in node.names)
    return names


def test_dashboard_metric_adapters_do_not_import_orm_models_or_query_builders() -> None:
    offenders: dict[str, list[str]] = {}
    for path in DASHBOARD_ADAPTERS:
        tree = ast.parse(path.read_text())
        imported_models = _imported_names(tree, module_prefix="app.models")
        imported_sqlalchemy = _imported_names(tree, module_prefix="sqlalchemy")
        violations = sorted(imported_models | (imported_sqlalchemy & FORBIDDEN_SQLALCHEMY_IMPORTS))
        if violations:
            offenders[str(path.relative_to(REPO_ROOT))] = violations

    assert offenders == {}


def test_dashboard_overview_does_not_call_sibling_route_handlers() -> None:
    path = REPO_ROOT / "backend/app/api/v1/endpoints/dashboard/overview.py"
    tree = ast.parse(path.read_text())
    sibling_route_imports = {
        node.module
        for node in ast.walk(tree)
        if isinstance(node, ast.ImportFrom)
        and node.module in {"controls", "departments", "kris", "risks", "summary"}
    }

    assert sibling_route_imports == set()
