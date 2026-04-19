from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.main import create_app

PRODUCTION_SETTINGS = dict(
    debug=False,
    secret_key="test-secret-for-production-mode-123456",
    mock_auth_enabled=False,
    auth_mode="microsoft_sso",
    entra_tenant_id="00000000-0000-0000-0000-000000000000",
    entra_client_id="11111111-1111-1111-1111-111111111111",
    entra_client_secret="production-entra-client-secret",
    directory_provider="graph",
    entra_jit_provisioning_enabled=False,
    auth_sso_allow_email_link=False,
    cors_origins=["http://testserver"],
    allowed_hosts=["testserver"],
    database_url="postgresql+asyncpg://riskhub:tests@prod-db:5432/riskhub",
)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "path", "headers", "expected_status"),
    [
        ("GET", "/api/v1/activity-log?limit=1&limit=2", {}, 400),
        ("POST", "/api/v1/auth/login", {"Content-Type": "text/plain", "Content-Length": "1"}, 415),
    ],
)
async def test_protocol_guard_short_circuits_keep_runtime_headers(
    method: str,
    path: str,
    headers: dict[str, str],
    expected_status: int,
):
    app = create_app(Settings(**PRODUCTION_SETTINGS))
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.request(
            method,
            path,
            headers={"Origin": "http://testserver", **headers},
            content=b"x" if method == "POST" else None,
        )

    assert response.status_code == expected_status
    assert response.headers["x-request-id"]
    assert response.headers["x-frame-options"] == "DENY"
    assert "content-security-policy" in response.headers
    assert response.headers["access-control-allow-credentials"] == "true"
