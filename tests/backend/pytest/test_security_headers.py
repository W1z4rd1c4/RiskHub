from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.main import create_app

PRODUCTION_SECRET = "test-secret-for-production-mode-123456"
PRODUCTION_DATABASE_URL = "postgresql+asyncpg://riskhub:tests@prod-db:5432/riskhub"
PRODUCTION_AUTH_MODE = "microsoft_sso"
PRODUCTION_ENTRA_TENANT_ID = "00000000-0000-0000-0000-000000000000"
PRODUCTION_ENTRA_CLIENT_ID = "11111111-1111-1111-1111-111111111111"
PRODUCTION_ENTRA_CLIENT_SECRET = "production-entra-client-secret"


def _csp_directives(csp: str) -> dict[str, str]:
    directives: dict[str, str] = {}
    for raw_directive in csp.split(";"):
        directive = raw_directive.strip()
        if not directive:
            continue
        name = directive.split(" ", 1)[0]
        directives[name] = directive
    return directives


def _required_headers_present(headers: dict[str, str]) -> None:
    assert headers["x-frame-options"] == "DENY"
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert headers["cross-origin-resource-policy"] == "same-origin"
    assert headers["permissions-policy"] == "geolocation=(), microphone=(), camera=(), payment=(), usb=()"
    assert "content-security-policy" in headers


@pytest.mark.asyncio
async def test_security_headers_in_debug_mode():
    app = create_app(
        Settings(
            debug=True,
            secret_key=PRODUCTION_SECRET,
            mock_auth_enabled=False,
            cors_origins=["http://testserver"],
        )
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/v1/health")

    assert response.status_code == 200
    _required_headers_present(dict(response.headers))
    assert "strict-transport-security" not in response.headers
    csp = _csp_directives(response.headers["content-security-policy"])
    assert csp["script-src"] == "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    assert csp["connect-src"] == "connect-src 'self' http://localhost:* https://*"


@pytest.mark.asyncio
async def test_security_headers_in_production_mode():
    app = create_app(
        Settings(
            debug=False,
            secret_key=PRODUCTION_SECRET,
            mock_auth_enabled=False,
            auth_mode=PRODUCTION_AUTH_MODE,
            entra_tenant_id=PRODUCTION_ENTRA_TENANT_ID,
            entra_client_id=PRODUCTION_ENTRA_CLIENT_ID,
            entra_client_secret=PRODUCTION_ENTRA_CLIENT_SECRET,
            directory_provider="graph",
            entra_jit_provisioning_enabled=False,
            auth_sso_allow_email_link=False,
            cors_origins=["http://testserver"],
            allowed_hosts=["testserver"],
            database_url=PRODUCTION_DATABASE_URL,
        )
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/v1/health")

    assert response.status_code == 200
    _required_headers_present(dict(response.headers))
    assert response.headers["strict-transport-security"] == "max-age=31536000; includeSubDomains; preload"
    assert "cross-origin-opener-policy" not in response.headers
    assert "cross-origin-embedder-policy" not in response.headers

    csp = _csp_directives(response.headers["content-security-policy"])
    assert csp["script-src"] == "script-src 'self'"
    assert csp["style-src"] == "style-src 'self' https://fonts.googleapis.com"
    assert "'unsafe-inline'" not in csp["style-src"]
    assert all("'unsafe-eval'" not in directive for directive in csp.values())
    assert "upgrade-insecure-requests" in csp
