from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]

CANONICAL_FUNCTIONS = {
    "period_bounds_for_date",
    "latest_closed_period_for_date",
    "is_period_end_boundary",
    "due_date",
    "is_within_reporting_window",
}


def test_canonical_period_helpers_defined_only_in_periods_py() -> None:
    """ADR-012: period algebra has exactly one home (_kri_history/periods.py)."""
    offenders: list[str] = []
    for path in (REPO_ROOT / "backend/app").rglob("*.py"):
        rel = str(path.relative_to(REPO_ROOT))
        if rel == "backend/app/services/_kri_history/periods.py":
            continue
        try:
            tree = ast.parse(path.read_text())
        except SyntaxError:
            continue
        for node in tree.body:
            if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef) and node.name in CANONICAL_FUNCTIONS:
                offenders.append(f"{rel}:{node.lineno}::{node.name}")
    assert offenders == [], f"ADR-012 forbids duplicate definitions: {offenders}"


def test_reporting_grace_days_has_one_canonical_definition() -> None:
    """ADR-012: REPORTING_GRACE_DAYS = 15 lives only in _kri_history/constants.py."""
    offenders: list[str] = []
    for path in (REPO_ROOT / "backend/app").rglob("*.py"):
        rel = str(path.relative_to(REPO_ROOT))
        if rel == "backend/app/services/_kri_history/constants.py":
            continue
        text = path.read_text()
        if "REPORTING_GRACE_DAYS" in text and "= 15" in text:
            offenders.append(rel)
    assert offenders == [], f"ADR-012 forbids duplicate REPORTING_GRACE_DAYS: {offenders}"
