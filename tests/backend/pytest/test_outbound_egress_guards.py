from __future__ import annotations

import ipaddress

import pytest

from app.core.config import Settings
from app.core.outbound_guard import (
    OutboundRequestError,
    guard_outbound_url,
    guard_resolved_outbound_url,
    guarded_get,
)
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


@pytest.mark.asyncio
async def test_outbound_guard_blocks_public_hostname_resolving_to_private_ip(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(debug=False, secret_key="test-secret-key-32-chars-minimum-value")

    async def _fake_resolve(host: str) -> set[ipaddress._BaseAddress]:
        assert host == "graph.microsoft.com"
        return {ipaddress.ip_address("10.0.0.5")}

    monkeypatch.setattr("app.core.outbound_guard.resolve_outbound_ips", _fake_resolve)

    with pytest.raises(OutboundRequestError, match="resolves to blocked IP"):
        await guard_resolved_outbound_url(
            url="https://graph.microsoft.com/v1.0/users",
            settings=settings,
            allowed_hosts=["graph.microsoft.com"],
        )


@pytest.mark.asyncio
async def test_guarded_get_validates_redirect_targets(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(
        debug=False,
        secret_key="test-secret-key-32-chars-minimum-value",
        outbound_block_redirects=False,
    )

    async def _fake_resolve(host: str) -> set[ipaddress._BaseAddress]:
        if host == "graph.microsoft.com":
            return {ipaddress.ip_address("198.51.100.10")}
        if host == "169.254.169.254":
            return {ipaddress.ip_address("169.254.169.254")}
        raise AssertionError(f"Unexpected host: {host}")

    monkeypatch.setattr("app.core.outbound_guard.resolve_outbound_ips", _fake_resolve)

    class _FakeResponse:
        def __init__(self, status_code: int, location: str | None = None):
            self.status_code = status_code
            self.headers = {"location": location} if location else {}

    class _FakeClient:
        async def get(self, url: str, params=None, headers=None, follow_redirects=False):  # noqa: ANN001
            assert follow_redirects is False
            if url == "https://graph.microsoft.com/v1.0/users":
                return _FakeResponse(302, "http://169.254.169.254/latest/meta-data")
            raise AssertionError(f"Unexpected URL: {url}")

    with pytest.raises(OutboundRequestError, match="resolves to blocked IP"):
        await guarded_get(
            _FakeClient(),
            url="https://graph.microsoft.com/v1.0/users",
            settings=settings,
            allowed_hosts=["graph.microsoft.com", "169.254.169.254"],
        )
