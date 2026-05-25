from __future__ import annotations

import ast
import inspect
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.params import Depends as DependsParam

from app.api.deps import get_current_user
from app.models.role import RoleType

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ENDPOINTS_ROOT = REPO_ROOT / "backend/app/api/v1/endpoints"
SHARED_AUTH_MODULE = REPO_ROOT / "backend/app/api/v1/endpoints/_auth_dependencies.py"


def _local_require_function_defs() -> dict[str, list[str]]:
    offenders: dict[str, list[str]] = {}
    for path in sorted(ENDPOINTS_ROOT.rglob("*.py")):
        if path == SHARED_AUTH_MODULE or "__pycache__" in path.parts:
            continue
        tree = ast.parse(path.read_text())
        names = [
            node.name
            for node in ast.walk(tree)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith("require_")
        ]
        if names:
            offenders[path.relative_to(REPO_ROOT).as_posix()] = sorted(names)
    return offenders


def _user_with_role(role: RoleType | None):
    role_obj = None if role is None else SimpleNamespace(name=role)
    return SimpleNamespace(role=role_obj)


def test_endpoint_packages_do_not_define_local_require_factories() -> None:
    assert _local_require_function_defs() == {}


def test_shared_role_dependencies_preserve_platform_admin_policy() -> None:
    from app.api.v1.endpoints._auth_dependencies import require_platform_admin

    admin = _user_with_role(RoleType.ADMIN)
    assert require_platform_admin(admin) is admin

    with pytest.raises(HTTPException) as exc_info:
        require_platform_admin(_user_with_role(RoleType.CRO))

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Admin access required"


def test_shared_role_dependencies_preserve_riskhub_cro_policy() -> None:
    from app.api.v1.endpoints._auth_dependencies import get_cro_user, require_cro

    cro = _user_with_role(RoleType.CRO)
    assert require_cro(cro) is cro
    assert get_cro_user(cro) is cro

    with pytest.raises(HTTPException) as exc_info:
        require_cro(_user_with_role(RoleType.RISK_MANAGER))

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Risk Hub access requires CRO role"


@pytest.mark.parametrize("dependency_name", ["require_platform_admin", "get_cro_user"])
def test_shared_role_dependencies_keep_fastapi_current_user_dependency(dependency_name: str) -> None:
    from app.api.v1.endpoints import _auth_dependencies

    dependency = getattr(_auth_dependencies, dependency_name)
    signature = inspect.signature(dependency)
    current_user = signature.parameters["current_user"]

    assert isinstance(current_user.default, DependsParam)
    assert current_user.default.dependency is get_current_user
