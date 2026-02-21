from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_duplicate_sensitive_query_param_rejected(client_employee):
    response = await client_employee.get("/api/v1/controls?department_id=1&department_id=2")
    assert response.status_code == 400
    assert response.json().get("code") == "duplicate_query_parameter"


@pytest.mark.asyncio
async def test_method_override_header_rejected(client_employee):
    response = await client_employee.get(
        "/api/v1/auth/me",
        headers={"X-HTTP-Method-Override": "DELETE"},
    )
    assert response.status_code == 400
    assert response.json().get("code") == "method_override_not_allowed"


@pytest.mark.asyncio
async def test_sensitive_json_prefix_rejects_non_json_content_type(auth_client):
    response = await auth_client.post(
        "/api/v1/approvals/999999/approve",
        content="not-json",
        headers={"Content-Type": "text/plain"},
    )
    assert response.status_code == 415
    assert response.json().get("code") == "unsupported_content_type"
