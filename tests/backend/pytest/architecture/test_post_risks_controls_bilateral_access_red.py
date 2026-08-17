"""BL §7.3: Risk-Control mutations keep ordered bilateral service checks."""

from __future__ import annotations

import ast
import tomllib
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
BASELINE = Path(__file__).parent / "_risk_control_link_governance_baseline.toml"


def _call_name(node: ast.AST) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def _function(path: Path, name: str) -> ast.FunctionDef | ast.AsyncFunctionDef:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef) and node.name == name:
            return node
    raise AssertionError(f"{BASELINE}::function_name target {name} not found")


def _first_call_line(fn: ast.FunctionDef | ast.AsyncFunctionDef, call_name: str) -> int:
    lines = [
        call.lineno
        for call in ast.walk(fn)
        if isinstance(call, ast.Call) and _call_name(call.func) == call_name
    ]
    assert lines, f"{fn.name} must call {call_name}"
    return min(lines)


def test_post_risks_controls_bilateral_access_red() -> None:
    baseline = tomllib.loads(BASELINE.read_text(encoding="utf-8"))
    fn = _function(REPO_ROOT / str(baseline["module_path"]), str(baseline["function_name"]))

    calls = [node for node in ast.walk(fn) if isinstance(node, ast.Call)]
    called_names = {_call_name(call.func) for call in calls}
    required_calls = set(baseline["required_calls"])
    missing = required_calls - called_names
    assert missing == set(), f"{BASELINE}::required_calls missing from {fn.name}: {sorted(missing)}"

    risk_guard_calls = [call for call in calls if _call_name(call.func) == "assert_risk_writable_for_link"]
    assert risk_guard_calls, "create_risk_control_link must call assert_risk_writable_for_link"
    allow_direct_owner_values = {
        keyword.value.value
        for call in risk_guard_calls
        for keyword in call.keywords
        if keyword.arg == "allow_direct_owner" and isinstance(keyword.value, ast.Constant)
    }
    assert True not in allow_direct_owner_values, (
        f"{BASELINE}::forbidden_kwargs forbids allow_direct_owner=True in {fn.name}"
    )
    assert False in allow_direct_owner_values, "risk-side writable guard must keep allow_direct_owner=False"


@pytest.mark.parametrize(
    ("function_name", "ordered_calls"),
    [
        (
            "create_control_risk_link",
            (
                "load_control_for_link",
                "assert_control_writable_for_link",
                "can_read_risk_id",
                "load_risk_for_link",
                "assert_risk_writable_for_link",
                "create_control_risk_link_outcome",
            ),
        ),
        (
            "delete_control_risk_link",
            (
                "load_control_for_link",
                "assert_control_writable_for_link",
                "can_read_risk_id",
                "load_risk_for_link",
                "assert_risk_writable_for_link",
                "load_link",
                "delete_control_risk_link_plan",
            ),
        ),
        (
            "create_risk_control_link",
            (
                "load_risk_for_link",
                "assert_risk_writable_for_link",
                "can_read_control_id",
                "load_control_for_link",
                "assert_control_writable_for_link",
                "create_control_risk_link_outcome",
            ),
        ),
        (
            "delete_risk_control_link",
            (
                "load_risk_for_link",
                "assert_risk_writable_for_link",
                "can_read_control_id",
                "load_control_for_link",
                "assert_control_writable_for_link",
                "load_link",
                "delete_control_risk_link_plan",
            ),
        ),
    ],
)
def test_risk_control_link_mutations_authorize_before_link_lookup(
    function_name: str,
    ordered_calls: tuple[str, ...],
) -> None:
    baseline = tomllib.loads(BASELINE.read_text(encoding="utf-8"))
    fn = _function(REPO_ROOT / str(baseline["module_path"]), function_name)

    call_lines = [_first_call_line(fn, call_name) for call_name in ordered_calls]

    assert call_lines == sorted(call_lines), f"{function_name} call order must be {ordered_calls}"
