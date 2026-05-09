from __future__ import annotations

import re
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
BACKEND_EVALUATION = REPO_ROOT / "backend/app/core/_permissions/evaluation.py"
FRONTEND_POLICY = REPO_ROOT / "frontend/src/authz/policy.ts"


def _function_body(source: str, function_name: str) -> str:
    pattern = rf"def {function_name}\(.*?^def "
    match = re.search(pattern, source, flags=re.DOTALL | re.MULTILINE)
    if match:
        return match.group(0).removesuffix("def ")
    marker = f"def {function_name}("
    start = source.index(marker)
    return source[start:]


def test_can_view_committee_legacy_frontend_matches_backend_permission_rule() -> None:
    backend_source = BACKEND_EVALUATION.read_text(encoding="utf-8")
    frontend_source = FRONTEND_POLICY.read_text(encoding="utf-8")

    backend_body = _function_body(backend_source, "can_view_risk_committee")

    assert "if is_platform_admin(user):\n        return False" in backend_body
    assert "if is_privileged_user(user):\n        return True" in backend_body
    assert "return role_name == RoleType.DEPARTMENT_HEAD" in backend_body
    assert "canViewCommittee: (hasGlobalScope && !isPlatformAdmin) || isDepartmentHead" in frontend_source
