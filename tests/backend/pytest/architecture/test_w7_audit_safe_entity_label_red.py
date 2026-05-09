from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
AUDIT_ROOT = REPO_ROOT / "backend" / "app" / "core" / "audit"


def _called_name(node: ast.AST) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def test_audit_activity_calls_pass_safe_entity_label() -> None:
    offenders: list[str] = []
    for module_path in sorted(AUDIT_ROOT.glob("*.py")):
        if module_path.name.startswith("_") or module_path.name == "__init__.py":
            continue
        tree = ast.parse(module_path.read_text(), filename=str(module_path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            called_name = _called_name(node.func)
            if called_name not in {"log_activity", "log_activity_func"}:
                continue
            if not any(keyword.arg == "safe_entity_label" for keyword in node.keywords):
                offenders.append(f"{module_path.relative_to(REPO_ROOT)}:{node.lineno}")

    assert offenders == []
