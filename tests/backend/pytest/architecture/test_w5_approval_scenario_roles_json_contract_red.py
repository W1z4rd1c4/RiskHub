from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
MODEL_PATH = REPO_ROOT / "backend" / "app" / "models" / "approval_scenario.py"
HELPER_PATH = REPO_ROOT / "backend" / "app" / "services" / "_riskhub_config" / "approval_scenario_roles.py"
MIGRATION_PATH = REPO_ROOT / "backend" / "alembic" / "versions" / "i4j5k6l7m8n9_approver_roles_to_jsonb.py"


def test_approval_scenario_approver_roles_uses_json_variant() -> None:
    source = MODEL_PATH.read_text()

    assert "JSON().with_variant(JSONB(), \"postgresql\")" in source
    assert "approver_roles: Mapped[list[str]]" in source


def test_approval_scenario_roles_helper_does_not_double_encode_json() -> None:
    tree = ast.parse(HELPER_PATH.read_text(), filename=str(HELPER_PATH))

    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            assert not (
                isinstance(node.func.value, ast.Name)
                and node.func.value.id == "json"
                and node.func.attr == "dumps"
            )


def test_approval_scenario_roles_migration_is_forward_only() -> None:
    source = MIGRATION_PATH.read_text()

    assert "JSON().with_variant(postgresql.JSONB(), \"postgresql\")" in source
    assert "raise NotImplementedError" in source
    assert "ADR-010" in source
