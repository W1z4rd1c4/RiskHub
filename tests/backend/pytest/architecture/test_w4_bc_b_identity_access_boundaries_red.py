from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract


REPO_ROOT = Path(__file__).resolve().parents[4]
IDENTITY_SERVICE_ROOT = REPO_ROOT / "backend/app/services/_identity_access_lifecycle"
ACCESS_WORKFLOW_ROOT = REPO_ROOT / "backend/app/services/_access_workflow"
USER_ENDPOINT_ROOT = REPO_ROOT / "backend/app/api/v1/endpoints/users"
HTTP_FRAMEWORK_ROOTS = {"fastapi", "starlette"}


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


def test_identity_access_lifecycle_services_do_not_raise_fastapi_http_exceptions():
    offenders: list[str] = []
    for path in _python_files(IDENTITY_SERVICE_ROOT):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Raise) and _raised_callable_name(node) == "HTTPException":
                offenders.append(f"{path.relative_to(REPO_ROOT)}:{node.lineno}")

    assert offenders == []


def test_access_workflow_services_do_not_depend_on_http_frameworks():
    offenders: list[str] = []
    for path in _python_files(ACCESS_WORKFLOW_ROOT):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        relative_path = path.relative_to(REPO_ROOT)
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                module = node.module or ""
                if _root_module(module) in HTTP_FRAMEWORK_ROOTS:
                    offenders.append(f"{relative_path}:{node.lineno}:import:{module}")
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    if _root_module(alias.name) in HTTP_FRAMEWORK_ROOTS:
                        offenders.append(
                            f"{relative_path}:{node.lineno}:import:{alias.name}"
                        )
            elif (
                isinstance(node, ast.Raise)
                and _raised_callable_name(node) == "HTTPException"
            ):
                offenders.append(
                    f"{relative_path}:{node.lineno}:raise:HTTPException"
                )

    assert offenders == []


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
