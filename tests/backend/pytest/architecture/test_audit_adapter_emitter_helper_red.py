from __future__ import annotations

import ast
import inspect
import tomllib
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
AUDIT_ROOT = REPO_ROOT / "backend" / "app" / "core" / "audit"
MATRIX_PATH = AUDIT_ROOT / "_audit_matrix.toml"
EMIT_PATH = AUDIT_ROOT / "_emit.py"
BASELINE_PATH = Path(__file__).parent / "_audit_adapter_emitter_helper_baseline.toml"
EXPECTED_ROW_COUNT_KEY = "expected_row_count"


def _baseline_int(key: str) -> int:
    data = tomllib.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    value = data[key]
    assert isinstance(value, int), f"{BASELINE_PATH}::{key} must be an integer"
    return value


EXPECTED_ROW_COUNT = _baseline_int(EXPECTED_ROW_COUNT_KEY)


def _load_matrix() -> list[dict[str, str]]:
    with MATRIX_PATH.open("rb") as handle:
        return tomllib.load(handle)["adapter"]


def _module_function_source(module_name: str, function_name: str) -> str | None:
    module_path = AUDIT_ROOT / f"{module_name}.py"
    if not module_path.exists():
        return None
    tree = ast.parse(module_path.read_text())
    for node in tree.body:
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef) and node.name == function_name:
            return ast.unparse(node)
    return None


def test_emit_helper_module_exists_with_expected_signature() -> None:
    assert EMIT_PATH.exists(), "_emit.py must be created"
    from app.core.audit import _emit

    sig = inspect.signature(_emit.emit_adapter)
    expected = {
        "db",
        "entity_type",
        "entity_id",
        "entity_name",
        "safe_entity_label",
        "action",
        "actor",
        "department_id",
        "changes",
        "description",
        "log_activity_func",
    }
    assert expected <= set(sig.parameters)


def test_each_adapter_row_invokes_emit_helper() -> None:
    rows = _load_matrix()
    assert len(rows) == EXPECTED_ROW_COUNT, (
        f"expected {EXPECTED_ROW_COUNT} audit-adapter rows per "
        f"{BASELINE_PATH}::{EXPECTED_ROW_COUNT_KEY}, found {len(rows)}"
    )
    missing = []
    for entry in rows:
        source = _module_function_source(entry["module"], entry["function"])
        if source is None:
            missing.append(f"{entry['module']}.{entry['function']} (function not found)")
            continue
        if "emit_adapter(" not in source:
            missing.append(f"{entry['module']}.{entry['function']} (no emit_adapter call)")
    assert missing == [], f"functions not yet using helper: {missing}"


def test_emit_adapter_calls_carry_safe_entity_label_kwarg() -> None:
    """Phase 6 critical: AST-parse each emit_adapter call; assert safe_entity_label kw is present."""

    offenders: list[str] = []
    for entry in _load_matrix():
        module_path = AUDIT_ROOT / f"{entry['module']}.py"
        if not module_path.exists():
            continue
        tree = ast.parse(module_path.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "emit_adapter":
                kw_names = {kw.arg for kw in (node.keywords or []) if kw.arg}
                if "safe_entity_label" not in kw_names:
                    offenders.append(f"{entry['module']}:{node.lineno} (missing safe_entity_label kw)")
    assert offenders == [], f"emit_adapter call without safe_entity_label: {offenders}"
