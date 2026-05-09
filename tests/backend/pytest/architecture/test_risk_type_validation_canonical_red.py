"""S1.4: validate_risk_type lives in service policy; endpoints delegate."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ENDPOINTS = REPO_ROOT / "backend/app/api/v1/endpoints/risks"
CANONICAL_IMPORT = "from app.services._entity_mutation_lifecycle.policy import validate_risk_type"


def test_no_local_validate_risk_type_in_endpoints() -> None:
    offenders: list[str] = []
    for path in ENDPOINTS.rglob("*.py"):
        try:
            tree = ast.parse(path.read_text())
        except SyntaxError:
            continue
        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if node.name == "validate_risk_type":
                    offenders.append(f"{path}:{node.lineno}")
    assert offenders == [], f"S1.4: must delegate to service policy: {offenders}"


def test_create_imports_canonical_path() -> None:
    create = (ENDPOINTS / "crud/create.py").read_text()
    assert CANONICAL_IMPORT in create
    assert "from ._shared import validate_risk_type" not in create
