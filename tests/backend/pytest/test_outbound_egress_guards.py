from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.core.config import Settings, get_settings
from app.core.outbound_guard import OutboundRequestError, guard_outbound_url
from app.integrations.vendor_signals.public_registry import PublicRegistryConnector
from app.services.sso_token_service import EntraTokenVerifier, SsoProviderUnavailableError


def test_outbound_guard_blocks_private_destinations_by_default():
    settings = Settings(debug=False, secret_key="test-secret-key-32-chars-minimum-value")

    with pytest.raises(OutboundRequestError, match="Private/local outbound destination is blocked"):
        guard_outbound_url(url="http://169.254.169.254/latest/meta-data", settings=settings)


def test_outbound_guard_enforces_allowlist_when_configured():
    settings = Settings(
        debug=False,
        secret_key="test-secret-key-32-chars-minimum-value",
        outbound_allowed_hosts=["graph.microsoft.com"],
    )

    guard_outbound_url(url="https://graph.microsoft.com/v1.0/users", settings=settings)
    with pytest.raises(OutboundRequestError, match="Outbound host is not allowlisted"):
        guard_outbound_url(url="https://example.com/api", settings=settings)


@pytest.mark.asyncio
async def test_public_registry_connector_blocks_local_ssrf_target(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("VENDOR_SIGNALS_PUBLIC_REGISTRY_BASE_URL", "http://127.0.0.1:8999")
    get_settings.cache_clear()
    try:
        connector = PublicRegistryConnector()
        vendor = SimpleNamespace(registration_id="REG-123")
        with pytest.raises(RuntimeError, match="Private/local outbound destination is blocked"):
            await connector.fetch(vendor)
    finally:
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_sso_fetch_json_blocks_private_destination():
    settings = Settings(
        debug=False,
        secret_key="test-secret-key-32-chars-minimum-value",
        auth_mode="microsoft_sso",
        entra_tenant_id="00000000-0000-0000-0000-000000000000",
        entra_client_id="11111111-1111-1111-1111-111111111111",
        entra_oidc_discovery_url="http://127.0.0.1:8080/.well-known/openid-configuration",
    )
    verifier = EntraTokenVerifier(settings=settings)

    with pytest.raises(SsoProviderUnavailableError, match="Private/local outbound destination is blocked"):
        await verifier._fetch_json("http://127.0.0.1:8080/.well-known/openid-configuration")
