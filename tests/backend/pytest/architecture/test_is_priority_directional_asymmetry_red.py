"""BL §6.4: is_priority approval gating is intentionally downgrade-only."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
PERMISSIONS_DIR = REPO_ROOT / "backend/app/core/_permissions"
SENSITIVE_PATH = PERMISSIONS_DIR / "sensitive.py"


def _functions(path: Path) -> list[ast.FunctionDef | ast.AsyncFunctionDef]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    return [node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)]


def _function(path: Path, name: str) -> ast.FunctionDef | ast.AsyncFunctionDef | None:
    return next((node for node in _functions(path) if node.name == name), None)


def test_is_priority_directional_asymmetry_red() -> None:
    downgrade = _function(SENSITIVE_PATH, "_is_priority_downgrade")
    assert downgrade is not None, "sensitive.py must define _is_priority_downgrade"
    assert len(downgrade.args.args) >= 2
    old_param = downgrade.args.args[0].arg
    new_param = downgrade.args.args[1].arg

    return_sources = [ast.unparse(node.value) for node in ast.walk(downgrade) if isinstance(node, ast.Return)]
    assert any(
        f"{old_param} is True" in source and f"{new_param} is False" in source and " and " in source
        for source in return_sources
    ), "_is_priority_downgrade must structurally gate old=True and new=False only"

    upgrade_helpers = [
        path.relative_to(REPO_ROOT).as_posix()
        for path in PERMISSIONS_DIR.rglob("*.py")
        for node in _functions(path)
        if node.name == "_is_priority_upgrade"
    ]
    assert upgrade_helpers == [], (
        "unexpected symmetric upgrade helper _is_priority_upgrade detected — "
        "policy is downgrade-gated only (sensitive.py:91-96)"
    )
