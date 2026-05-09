"""PrivilegeContext + get_privilege_context dependency."""

from __future__ import annotations

import inspect

import pytest

pytestmark = pytest.mark.contract


def test_privilege_context_dataclass_exists() -> None:
    from app.services._approval_execution.privilege_context import PrivilegeContext

    fields = {field.name for field in PrivilegeContext.__dataclass_fields__.values()}

    assert "user" in fields
    assert "tier" in fields


def test_get_privilege_context_dependency_signature() -> None:
    from app.services._approval_execution.privilege_context import get_privilege_context

    sig = inspect.signature(get_privilege_context)

    assert any(parameter.name == "current_user" for parameter in sig.parameters.values())
    assert any(parameter.name == "db" for parameter in sig.parameters.values())


@pytest.mark.asyncio
async def test_privilege_context_endpoint_uses_dependency(client_factory, test_user_risk_manager) -> None:
    """Hit one approvals endpoint that should consume Depends(get_privilege_context)."""
    async with client_factory(current_user=test_user_risk_manager) as ac:
        resp = await ac.get("/api/v1/approvals")

    assert resp.status_code in (200, 204)
