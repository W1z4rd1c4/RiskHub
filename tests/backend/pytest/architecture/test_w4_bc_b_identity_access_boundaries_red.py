from __future__ import annotations

import ast
import tomllib
from collections import Counter
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract


REPO_ROOT = Path(__file__).resolve().parents[4]
SERVICES_ROOT = REPO_ROOT / "backend/app/services"
ACCESS_WORKFLOW_ROOT = SERVICES_ROOT / "_access_workflow"
USER_ENDPOINT_ROOT = REPO_ROOT / "backend/app/api/v1/endpoints/users"
HTTP_FRAMEWORK_ROOTS = {"fastapi", "starlette"}
HTTP_BASELINE = Path(__file__).with_name("_service_http_framework_allowlist.toml")


def _python_files(root: Path) -> list[Path]:
    return sorted(path for path in root.rglob("*.py") if path.is_file())


def _root_module(module_name: str) -> str:
    return module_name.split(".", maxsplit=1)[0]


def _raised_callable_name(node: ast.Raise) -> str | None:
    if not isinstance(node.exc, ast.Call):
        return None
    if isinstance(node.exc.func, ast.Name):
        return node.exc.func.id
    if isinstance(node.exc.func, ast.Attribute):
        return node.exc.func.attr
    return None


def _framework_import_counts(root: Path) -> Counter[str]:
    counts: Counter[str] = Counter()
    for path in _python_files(root):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        relative_path = path.relative_to(REPO_ROOT)
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                module = node.module or ""
                if _root_module(module) in HTTP_FRAMEWORK_ROOTS:
                    counts[f"{relative_path}::{module}"] += 1
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    if _root_module(alias.name) in HTTP_FRAMEWORK_ROOTS:
                        counts[f"{relative_path}::{alias.name}"] += 1
    return counts


def _http_exception_raise_counts(root: Path) -> Counter[str]:
    counts: Counter[str] = Counter()
    for path in _python_files(root):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Raise)
                and _raised_callable_name(node) == "HTTPException"
            ):
                counts[str(path.relative_to(REPO_ROOT))] += 1
    return counts


def _baseline(section: str) -> Counter[str]:
    payload = tomllib.loads(HTTP_BASELINE.read_text(encoding="utf-8"))
    values = payload.get(section)
    assert isinstance(values, dict), f"missing baseline section: {section}"
    assert all(type(value) is int and value > 0 for value in values.values())
    return Counter({str(key): int(value) for key, value in values.items()})


def _assert_exact_ratchet(
    *,
    actual: Counter[str],
    expected: Counter[str],
    label: str,
) -> None:
    introduced = actual - expected
    stale = expected - actual
    assert not introduced, f"new {label} violations: {dict(introduced)}"
    assert not stale, (
        f"{label} baseline contains removed violations; shrink the allowlist: "
        f"{dict(stale)}"
    )


def test_service_http_framework_imports_match_ratcheted_legacy_baseline():
    expected = _baseline("framework_imports")
    assert not any("/_access_workflow/" in key for key in expected)
    _assert_exact_ratchet(
        actual=_framework_import_counts(SERVICES_ROOT),
        expected=expected,
        label="service HTTP-framework import",
    )


def test_service_http_exception_raises_match_ratcheted_legacy_baseline():
    expected = _baseline("http_exception_raises")
    assert not any("/_access_workflow/" in key for key in expected)
    _assert_exact_ratchet(
        actual=_http_exception_raise_counts(SERVICES_ROOT),
        expected=expected,
        label="service HTTPException raise",
    )


def test_access_workflow_services_remain_transport_neutral():
    assert _framework_import_counts(ACCESS_WORKFLOW_ROOT) == Counter()
    assert _http_exception_raise_counts(ACCESS_WORKFLOW_ROOT) == Counter()


def test_user_endpoints_do_not_own_raw_database_commits():
    offenders: list[str] = []
    for path in _python_files(USER_ENDPOINT_ROOT):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Await):
                continue
            call = node.value
            if (
                isinstance(call, ast.Call)
                and isinstance(call.func, ast.Attribute)
                and call.func.attr == "commit"
            ):
                offenders.append(f"{path.relative_to(REPO_ROOT)}:{node.lineno}")

    assert offenders == []
