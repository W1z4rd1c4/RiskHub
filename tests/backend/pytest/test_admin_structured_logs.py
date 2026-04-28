from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_admin_audit_logs_endpoint_requires_platform_admin(
    client_employee: AsyncClient,
    client_platform_admin: AsyncClient,
):
    denied_resp = await client_employee.get("/api/v1/admin/logs/audit")

    assert denied_resp.status_code == 403
    assert denied_resp.json()["detail"] == "Admin access required"

    allowed_resp = await client_platform_admin.get("/api/v1/admin/logs/audit")

    assert allowed_resp.status_code == 200
    payload = allowed_resp.json()
    assert "entries" in payload
    assert "total_lines" in payload
    assert "file_path" in payload
