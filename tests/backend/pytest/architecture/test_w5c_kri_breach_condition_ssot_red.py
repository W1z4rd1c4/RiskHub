"""Ratchet lock: the KRI breach predicate has ONE canonical SQLAlchemy home.

The breach predicate

    or_(
        KeyRiskIndicator.current_value < KeyRiskIndicator.lower_limit,
        KeyRiskIndicator.current_value > KeyRiskIndicator.upper_limit,
    )

was duplicated verbatim across five read paths (snapshot metrics, dashboard
department metrics, register-listing KRIs and risks, and monitoring status).
Phase #1 consolidates it into ``kri_breach_condition`` on the KRI model module,
which both ``app.core`` and ``app.services`` may import safely.

This lock asserts the raw ``or_(current_value < lower_limit, ... > upper_limit)``
clause no longer appears as inline source in the five consumers, and that each
consumer instead references the canonical helper. Behavior preservation is pinned
separately by ``tests/backend/pytest/test_char_kri_breach.py``.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]

HELPER_NAME = "kri_breach_condition"
HELPER_MODULE = REPO_ROOT / "backend/app/models/key_risk_indicator.py"

CONSUMERS = [
    REPO_ROOT / "backend/app/core/_snapshot_metrics/kri.py",
    REPO_ROOT / "backend/app/services/_dashboard_metrics/departments.py",
    REPO_ROOT / "backend/app/services/_register_listings/kris.py",
    REPO_ROOT / "backend/app/services/_register_listings/risks.py",
    REPO_ROOT / "backend/app/services/_monitoring_status/queries.py",
]


def _is_limit_comparison(node: ast.expr, op: type[ast.cmpop], limit_attr: str) -> bool:
    """True for ``KeyRiskIndicator.current_value <op> KeyRiskIndicator.<limit_attr>``."""
    if not isinstance(node, ast.Compare) or len(node.ops) != 1 or len(node.comparators) != 1:
        return False
    if not isinstance(node.ops[0], op):
        return False
    return _is_kri_attr(node.left, "current_value") and _is_kri_attr(node.comparators[0], limit_attr)


def _is_kri_attr(node: ast.expr, attr: str) -> bool:
    return (
        isinstance(node, ast.Attribute)
        and node.attr == attr
        and isinstance(node.value, ast.Name)
        and node.value.id == "KeyRiskIndicator"
    )


def _has_raw_breach_or(tree: ast.Module) -> bool:
    """True if the tree contains a raw ``or_(current_value < lower, current_value > upper)``."""
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        is_or_call = (isinstance(func, ast.Name) and func.id == "or_") or (
            isinstance(func, ast.Attribute) and func.attr == "or_"
        )
        if not is_or_call or len(node.args) != 2:
            continue
        below = _is_limit_comparison(node.args[0], ast.Lt, "lower_limit")
        above = _is_limit_comparison(node.args[1], ast.Gt, "upper_limit")
        if below and above:
            return True
    return False


def test_breach_condition_helper_is_defined_once() -> None:
    tree = ast.parse(HELPER_MODULE.read_text())
    defined = {
        node.name
        for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef) and node.name == HELPER_NAME
    }
    assert HELPER_NAME in defined, f"{HELPER_NAME} must be defined in {HELPER_MODULE}"


def test_consumers_do_not_inline_the_breach_or_clause() -> None:
    offenders = [str(path) for path in CONSUMERS if _has_raw_breach_or(ast.parse(path.read_text()))]
    assert offenders == [], f"raw or_(...) breach clause still inlined in: {offenders}"


def test_consumers_reference_the_canonical_helper() -> None:
    missing = [str(path) for path in CONSUMERS if HELPER_NAME not in path.read_text()]
    assert missing == [], f"consumers must call {HELPER_NAME}: {missing}"
