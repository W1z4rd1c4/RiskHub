from __future__ import annotations

import pytest
from httpx import AsyncClient


def _response_codes(openapi_schema: dict, path: str, method: str) -> set[str]:
    return set(openapi_schema["paths"][path][method]["responses"].keys())


def _assert_response_codes(openapi_schema: dict, path: str, method: str, expected_codes: set[str]) -> None:
    codes = _response_codes(openapi_schema, path, method)
    for code in expected_codes:
        assert code in codes, f"Missing documented response {code} for {method.upper()} {path}. Got: {sorted(codes)}"


@pytest.mark.asyncio
async def test_openapi_contract_parity_for_targeted_security_paths(client: AsyncClient) -> None:
    response = await client.get("/openapi.json")
    assert response.status_code == 200
    schema = response.json()

    _assert_response_codes(schema, "/api/v1/auth/sso/exchange", "post", {"422", "503"})

    for export_path in (
        "/api/v1/reports/summary/export",
        "/api/v1/reports/audit-trail/export",
        "/api/v1/reports/risks/export",
        "/api/v1/reports/controls/export",
        "/api/v1/reports/kris/export",
        "/api/v1/reports/vendors/export",
        "/api/v1/reports/issues/export",
    ):
        _assert_response_codes(schema, export_path, "get", {"410"})

    for approval_path, method in (
        ("/api/v1/approvals/{approval_id}/approve", "post"),
        ("/api/v1/approvals/{approval_id}/reject", "post"),
        ("/api/v1/approvals/{approval_id}/cancel", "post"),
        ("/api/v1/approvals/{approval_id}", "get"),
    ):
        _assert_response_codes(schema, approval_path, method, {"401", "403", "404"})

    _assert_response_codes(schema, "/api/v1/approvals/my-approvals", "get", {"401"})
