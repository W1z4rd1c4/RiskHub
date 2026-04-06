from __future__ import annotations

from contextlib import asynccontextmanager
from types import SimpleNamespace

import httpx
import pytest

from app.core.config import Settings
from app.services.graph_directory_auth import GraphAccessTokenProvider, reset_graph_token_cache_for_tests
from app.services.graph_directory_errors import (
    GraphDependencyError,
    GraphProviderUnavailableError,
    GraphTokenAcquisitionError,
    GraphUserNotFoundError,
)
from app.services.graph_directory_transport import GraphApiTransport


def _base_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "secret_key": "abcdefghijklmnopqrstuvwxyz1234567890",
        "database_url": "postgresql+asyncpg://riskhub:secret@postgres.example.com:5432/riskhub",
        "auth_mode": "microsoft_sso",
        "entra_tenant_id": "00000000-0000-0000-0000-000000000000",
        "entra_client_id": "11111111-1111-1111-1111-111111111111",
        "entra_client_secret": "entra-client-secret",
        "cors_origins": ["https://riskhub.example.com"],
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


@pytest.fixture(autouse=True)
def _reset_graph_token_cache() -> None:
    reset_graph_token_cache_for_tests()


@pytest.mark.asyncio
async def test_graph_access_token_provider_reuses_cached_token(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, int] = {"calls": 0}

    async def _allow_token_url(*args, **kwargs) -> None:  # noqa: ANN002, ANN003
        return None

    class FakeConfidentialClientApplication:
        def __init__(self, *, client_id: str, authority: str, client_credential: object):
            del client_id, authority, client_credential

        def acquire_token_for_client(self, *, scopes: list[str]) -> dict[str, object]:
            captured["calls"] += 1
            assert scopes == ["https://graph.microsoft.com/.default"]
            return {"access_token": "cached-token", "expires_in": 900}

    monkeypatch.setattr("app.services.graph_directory_auth.guard_resolved_outbound_url", _allow_token_url)
    monkeypatch.setattr(
        "app.services.graph_directory_auth.importlib.import_module",
        lambda name: SimpleNamespace(ConfidentialClientApplication=FakeConfidentialClientApplication),
    )

    provider = GraphAccessTokenProvider(_base_settings())

    first = await provider.get_access_token()
    second = await provider.get_access_token()

    assert first == "cached-token"
    assert second == "cached-token"
    assert captured["calls"] == 1


def test_graph_access_token_cache_key_uses_explicit_fingerprint_not_secret_bytes() -> None:
    provider = GraphAccessTokenProvider(_base_settings(entra_client_secret="secret-a"))
    secret_a = provider.build_token_cache_key(
        tenant_id="tenant",
        client_id="client",
        credential=provider._settings.entra_confidential_credential,  # type: ignore[arg-type]
        credential_fingerprint="version-1",
    )
    secret_b = provider.build_token_cache_key(
        tenant_id="tenant",
        client_id="client",
        credential=provider._settings.model_copy(update={"entra_client_secret": "secret-b"}).entra_confidential_credential,  # type: ignore[arg-type]
        credential_fingerprint="version-1",
    )
    secret_c = provider.build_token_cache_key(
        tenant_id="tenant",
        client_id="client",
        credential=provider._settings.entra_confidential_credential,  # type: ignore[arg-type]
        credential_fingerprint="version-2",
    )

    assert secret_a == secret_b
    assert secret_a != secret_c


def test_graph_access_token_cache_key_for_certificate_depends_on_thumbprint_not_private_key() -> None:
    provider = GraphAccessTokenProvider(
        _base_settings(
            entra_client_certificate_thumbprint="ABCDEF1234567890ABCDEF1234567890ABCDEF12",
            entra_client_certificate_private_key="PRIVATE-KEY-A",
        )
    )
    cache_key_a = provider.build_token_cache_key(
        tenant_id="tenant",
        client_id="client",
        credential=provider._settings.entra_confidential_credential,  # type: ignore[arg-type]
    )
    cache_key_b = provider.build_token_cache_key(
        tenant_id="tenant",
        client_id="client",
        credential=provider._settings.model_copy(
            update={"entra_client_certificate_private_key": "PRIVATE-KEY-B"}
        ).entra_confidential_credential,  # type: ignore[arg-type]
    )

    assert cache_key_a == cache_key_b


@pytest.mark.asyncio
async def test_graph_access_token_provider_classifies_missing_msal_dependency(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.services.graph_directory_auth.importlib.import_module", lambda name: (_ for _ in ()).throw(ModuleNotFoundError(name)))

    provider = GraphAccessTokenProvider(_base_settings())

    with pytest.raises(GraphDependencyError, match="MSAL Python is not installed"):
        await provider.get_access_token()


@pytest.mark.asyncio
async def test_graph_access_token_provider_classifies_token_response_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeConfidentialClientApplication:
        def __init__(self, *, client_id: str, authority: str, client_credential: object):
            del client_id, authority, client_credential

        def acquire_token_for_client(self, *, scopes: list[str]) -> dict[str, object]:
            del scopes
            return {"error": "invalid_client", "error_description": "bad credential"}

    async def _allow_token_url(*args, **kwargs) -> None:  # noqa: ANN002, ANN003
        return None

    monkeypatch.setattr("app.services.graph_directory_auth.guard_resolved_outbound_url", _allow_token_url)
    monkeypatch.setattr(
        "app.services.graph_directory_auth.importlib.import_module",
        lambda name: SimpleNamespace(ConfidentialClientApplication=FakeConfidentialClientApplication),
    )

    provider = GraphAccessTokenProvider(_base_settings())

    with pytest.raises(GraphTokenAcquisitionError, match="bad credential"):
        await provider.get_access_token()


@pytest.mark.asyncio
async def test_graph_api_transport_maps_access_denied_to_provider_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    @asynccontextmanager
    async def _fake_client_context():
        yield object()

    async def _guarded_get(*args, **kwargs):  # noqa: ANN002, ANN003
        request = httpx.Request("GET", "https://graph.microsoft.com/v1.0/users")
        return httpx.Response(403, request=request, text="denied")

    monkeypatch.setattr("app.services.graph_directory_transport.guard_outbound_url", lambda **kwargs: None)
    monkeypatch.setattr(
        "app.services.graph_directory_transport.build_outbound_client",
        lambda **kwargs: _fake_client_context(),
    )
    monkeypatch.setattr("app.services.graph_directory_transport.guarded_get", _guarded_get)

    transport = GraphApiTransport(
        _base_settings(),
        token_provider=SimpleNamespace(get_access_token=lambda: None),
    )
    transport._token_provider.get_access_token = lambda: _resolved_token()  # type: ignore[method-assign]

    with pytest.raises(GraphProviderUnavailableError, match="Graph access denied"):
        await transport.get("/users")


@pytest.mark.asyncio
async def test_graph_api_transport_maps_not_found_for_direct_user_lookup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    @asynccontextmanager
    async def _fake_client_context():
        yield object()

    async def _guarded_get(*args, **kwargs):  # noqa: ANN002, ANN003
        request = httpx.Request("GET", "https://graph.microsoft.com/v1.0/users/oid-123")
        return httpx.Response(404, request=request, text="missing")

    monkeypatch.setattr("app.services.graph_directory_transport.guard_outbound_url", lambda **kwargs: None)
    monkeypatch.setattr(
        "app.services.graph_directory_transport.build_outbound_client",
        lambda **kwargs: _fake_client_context(),
    )
    monkeypatch.setattr("app.services.graph_directory_transport.guarded_get", _guarded_get)

    transport = GraphApiTransport(
        _base_settings(),
        token_provider=SimpleNamespace(get_access_token=lambda: None),
    )
    transport._token_provider.get_access_token = lambda: _resolved_token()  # type: ignore[method-assign]

    with pytest.raises(GraphUserNotFoundError, match="Directory user not found"):
        await transport.get("/users/oid-123", not_found_is_error=True)


async def _resolved_token() -> str:
    return "transport-token"
