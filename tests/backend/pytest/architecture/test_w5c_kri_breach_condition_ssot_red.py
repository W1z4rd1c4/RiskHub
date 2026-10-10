"""ARCH-12: only the population module composes raw KRI breach SQL.

Scan every application module, rather than a hand-listed consumer allowlist.
The injected-source test proves a newly introduced caller cannot escape the lock.
"""

from __future__ import annotations

import ast
import inspect
from pathlib import Path

import pytest

from app.services.kri_populations import kri_breach_condition

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]

HELPER_NAME = "kri_breach_condition"
# Follow the public population function to its implementation, allowing an
# internal move/re-export without changing the single-owner decision.
HELPER_MODULE = Path(inspect.getfile(kri_breach_condition)).resolve()


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
    definitions = [
        path.resolve()
        for path in (REPO_ROOT / "backend/app").rglob("*.py")
        for node in ast.walk(ast.parse(path.read_text()))
        if isinstance(node, ast.FunctionDef) and node.name == HELPER_NAME
    ]
    assert definitions == [HELPER_MODULE], f"Expected one canonical breach function, found {definitions}"


def _offenders(sources: dict[str, str]) -> list[str]:
    return [name for name, source in sources.items() if _has_raw_breach_or(ast.parse(source))]


def test_only_population_module_composes_breach_predicate() -> None:
    sources = {
        str(path): path.read_text() for path in (REPO_ROOT / "backend/app").rglob("*.py") if path != HELPER_MODULE
    }
    assert _offenders(sources) == []


def test_lock_catches_seeded_new_consumer_violation() -> None:
    seeded = {
        "new_unlisted_consumer.py": (
            "predicate = or_(KeyRiskIndicator.current_value < KeyRiskIndicator.lower_limit, "
            "KeyRiskIndicator.current_value > KeyRiskIndicator.upper_limit)"
        )
    }
    assert _offenders(seeded) == ["new_unlisted_consumer.py"]


def test_lock_allows_canonical_internal_move_but_still_catches_new_consumer() -> None:
    original = {"population_impl.py": HELPER_MODULE.read_text(), "caller.py": "condition = kri_breach_condition()"}
    moved = {"internal/population_rules.py": original["population_impl.py"], "caller.py": original["caller.py"]}
    for sources, owner in [(original, "population_impl.py"), (moved, "internal/population_rules.py")]:
        assert _offenders({name: source for name, source in sources.items() if name != owner}) == []
        sources["new_consumer.py"] = sources[owner]
        assert _offenders({name: source for name, source in sources.items() if name != owner}) == ["new_consumer.py"]
