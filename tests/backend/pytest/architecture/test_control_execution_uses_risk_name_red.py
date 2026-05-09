"""S2.7: control execution must reference Risk.name, not Risk.process."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
TARGET = REPO_ROOT / "backend/app/services/_control_execution"


def test_no_risk_process_attribute_access_in_control_execution() -> None:
    offenders: list[str] = []
    for path in TARGET.rglob("*.py"):
        try:
            tree = ast.parse(path.read_text())
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Attribute) and node.attr == "process":
                if isinstance(node.value, ast.Name) and node.value.id == "risk":
                    offenders.append(f"{path}:{node.lineno}")
    assert offenders == [], f"S2.7: must use risk.name not risk.process: {offenders}"
