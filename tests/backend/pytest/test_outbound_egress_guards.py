from __future__ import annotations

import ipaddress

import httpx
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
async def test_guarded_get_revalidates_dns_on_same_origin_redirect(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(
        debug=False,
        secret_key="test-secret-key-32-chars-minimum-value",
        outbound_block_redirects=False,
    )

    resolutions = 0

    async def _fake_resolve(host: str) -> set[ipaddress.IPv4Address]:
        nonlocal resolutions
        assert host == "graph.microsoft.com"
        resolutions += 1
        return {ipaddress.IPv4Address("8.8.8.8" if resolutions == 1 else "10.0.0.5")}

    monkeypatch.setattr("app.core.outbound_guard.resolve_outbound_ips", _fake_resolve)

    class _FakeResponse:
        def __init__(self, status_code: int, location: str | None = None):
            self.status_code = status_code
            self.headers = {"location": location} if location else {}

    class _FakeClient:
        async def get(self, url: str, params=None, headers=None, follow_redirects=False):  # noqa: ANN001
            assert follow_redirects is False
            if url == "https://graph.microsoft.com/v1.0/users":
                return _FakeResponse(302, "/redirected-users")
            raise AssertionError(f"Unexpected URL: {url}")

    with pytest.raises(OutboundRequestError, match="resolves to blocked IP"):
        await guarded_get(
            _FakeClient(),
            url="https://graph.microsoft.com/v1.0/users",
            settings=settings,
            allowed_hosts=["graph.microsoft.com"],
        )
    assert resolutions == 2


@pytest.mark.parametrize(
    "target",
    [
        "https://other.example/users",
        "https://sub.graph.microsoft.com/users",
        "http://graph.microsoft.com/users",
        "https://graph.microsoft.com:8443/users",
    ],
)
@pytest.mark.asyncio
async def test_authenticated_redirect_cannot_forward_credentials_to_another_origin(
    monkeypatch: pytest.MonkeyPatch, target: str
) -> None:
    settings = Settings(
        debug=False,
        secret_key="test-secret-key-32-chars-minimum-value",
        outbound_block_redirects=False,
    )

    async def resolve(host: str) -> set[ipaddress.IPv4Address]:
        return {ipaddress.IPv4Address("8.8.8.8")}

    monkeypatch.setattr("app.core.outbound_guard.resolve_outbound_ips", resolve)
    requests: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(302, headers={"location": target}) if len(requests) == 1 else httpx.Response(200)

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        with pytest.raises(OutboundRequestError, match="origin"):
            await guarded_get(
                client,
                url="https://graph.microsoft.com/v1.0/users",
                settings=settings,
                allowed_hosts=["graph.microsoft.com", "other.example"],
                headers={"Authorization": "Bearer test-token", "X-API-Key": "test-api-key"},
            )
    assert len(requests) == 1


@pytest.mark.parametrize(
    ("target", "headers"),
    [
        ("https://graph.microsoft.com:443/next", {"Authorization": "Bearer test-token"}),
        ("/next", None),
    ],
)
@pytest.mark.asyncio
async def test_redirect_preserves_same_origin_requests(
    monkeypatch: pytest.MonkeyPatch, target: str, headers: dict[str, str] | None
) -> None:
    settings = Settings(
        debug=False,
        secret_key="test-secret-key-32-chars-minimum-value",
        outbound_block_redirects=False,
    )

    async def resolve(host: str) -> set[ipaddress.IPv4Address]:
        return {ipaddress.IPv4Address("8.8.8.8")}

    monkeypatch.setattr("app.core.outbound_guard.resolve_outbound_ips", resolve)
    requests: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(302, headers={"location": target}) if len(requests) == 1 else httpx.Response(200)

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        response = await guarded_get(
            client,
            url="https://graph.microsoft.com/v1.0/users",
            settings=settings,
            allowed_hosts=["graph.microsoft.com", "other.example"],
            headers=headers,
            params={"search": "initial"},
        )
    assert response.status_code == 200
    assert len(requests) == 2
    assert str(requests[1].url) == str(httpx.URL("https://graph.microsoft.com/next"))
    assert requests[1].headers.get("authorization") == (headers or {}).get("Authorization")


@pytest.mark.parametrize("credentials", ["default_headers", "client_auth", "none"])
@pytest.mark.asyncio
async def test_redirect_origin_boundary_also_applies_without_explicit_headers(
    monkeypatch: pytest.MonkeyPatch, credentials: str
) -> None:
    settings = Settings(
        debug=False,
        secret_key="test-secret-key-32-chars-minimum-value",
        outbound_block_redirects=False,
    )

    async def resolve(host: str) -> set[ipaddress.IPv4Address]:
        return {ipaddress.IPv4Address("8.8.8.8")}

    monkeypatch.setattr("app.core.outbound_guard.resolve_outbound_ips", resolve)
    requests: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(302, headers={"location": "https://other.example/next"})

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(respond),
        headers={"X-API-Key": "test-api-key"} if credentials == "default_headers" else None,
        auth=("test-user", "test-password") if credentials == "client_auth" else None,
    ) as client:
        with pytest.raises(OutboundRequestError, match="origin"):
            await guarded_get(
                client,
                url="https://graph.microsoft.com/v1.0/users",
                settings=settings,
                allowed_hosts=["graph.microsoft.com", "other.example"],
            )
    assert len(requests) == 1


@pytest.mark.parametrize("target", ["https://graph.microsoft.com:invalid/next", "http://[invalid/"])
@pytest.mark.asyncio
async def test_invalid_redirect_is_rejected_before_another_request(
    monkeypatch: pytest.MonkeyPatch, target: str
) -> None:
    settings = Settings(
        debug=False,
        secret_key="test-secret-key-32-chars-minimum-value",
        outbound_block_redirects=False,
    )

    async def resolve(host: str) -> set[ipaddress.IPv4Address]:
        return {ipaddress.IPv4Address("8.8.8.8")}

    monkeypatch.setattr("app.core.outbound_guard.resolve_outbound_ips", resolve)
    requests: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(302, headers={"location": target})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        with pytest.raises((OutboundRequestError, httpx.RemoteProtocolError)):
            await guarded_get(client, url="https://graph.microsoft.com/v1.0/users", settings=settings)
    assert len(requests) == 1
