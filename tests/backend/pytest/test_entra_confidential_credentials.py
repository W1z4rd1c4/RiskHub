from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.core.config import Settings
from app.services.directory_provider_service import (
    DirectoryProviderService,
    DirectoryProviderUnavailableError,
)
from app.services.graph_directory_service import (
    GraphDirectoryService,
    GraphProviderUnavailableError,
)


def _base_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "secret_key": "0123456789abcdef0123456789abcdef",
        "database_url": "postgresql+asyncpg://riskhub:secret@postgres.example.com:5432/riskhub",
        "auth_mode": "microsoft_sso",
        "entra_tenant_id": "00000000-0000-0000-0000-000000000000",
        "entra_client_id": "11111111-1111-1111-1111-111111111111",
        "cors_origins": ["https://riskhub.example.com"],
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


@pytest.mark.asyncio
async def test_graph_directory_service_acquires_token_with_client_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class FakeConfidentialClientApplication:
        def __init__(self, *, client_id: str, authority: str, client_credential: object):
            captured["client_id"] = client_id
            captured["authority"] = authority
            captured["client_credential"] = client_credential

        def acquire_token_for_client(self, *, scopes: list[str]) -> dict[str, object]:
            captured["scopes"] = scopes
            return {"access_token": "secret-token", "expires_in": 900}

    monkeypatch.setattr(
        "app.services.graph_directory_service.importlib.import_module",
        lambda name: SimpleNamespace(ConfidentialClientApplication=FakeConfidentialClientApplication),
    )

    service = GraphDirectoryService(_base_settings(entra_client_secret="entra-client-secret"))

    token = await service._get_access_token()

    assert token == "secret-token"
    assert captured["client_credential"] == "entra-client-secret"
    assert captured["scopes"] == ["https://graph.microsoft.com/.default"]


@pytest.mark.asyncio
async def test_graph_directory_service_prefers_certificate_credential(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class FakeConfidentialClientApplication:
        def __init__(self, *, client_id: str, authority: str, client_credential: object):
            captured["client_credential"] = client_credential

        def acquire_token_for_client(self, *, scopes: list[str]) -> dict[str, object]:
            return {"access_token": "certificate-token", "expires_in": 900}

    monkeypatch.setattr(
        "app.services.graph_directory_service.importlib.import_module",
        lambda name: SimpleNamespace(ConfidentialClientApplication=FakeConfidentialClientApplication),
    )

    service = GraphDirectoryService(
        _base_settings(
            entra_client_secret="legacy-secret",
            entra_client_certificate_thumbprint="ABCDEF1234567890ABCDEF1234567890ABCDEF12",
            entra_client_certificate_private_key="-----BEGIN PRIVATE KEY-----\nTESTKEY\n-----END PRIVATE KEY-----",
        )
    )

    token = await service._get_access_token()

    assert token == "certificate-token"
    assert captured["client_credential"] == {
        "private_key": "-----BEGIN PRIVATE KEY-----\nTESTKEY\n-----END PRIVATE KEY-----",
        "thumbprint": "ABCDEF1234567890ABCDEF1234567890ABCDEF12",
    }


@pytest.mark.asyncio
async def test_graph_directory_service_fails_cleanly_when_token_acquisition_returns_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeConfidentialClientApplication:
        def __init__(self, *, client_id: str, authority: str, client_credential: object):
            pass

        def acquire_token_for_client(self, *, scopes: list[str]) -> dict[str, object]:
            return {"error": "invalid_client", "error_description": "bad credential"}

    monkeypatch.setattr(
        "app.services.graph_directory_service.importlib.import_module",
        lambda name: SimpleNamespace(ConfidentialClientApplication=FakeConfidentialClientApplication),
    )

    service = GraphDirectoryService(_base_settings(entra_client_secret="entra-client-secret"))

    with pytest.raises(GraphProviderUnavailableError, match="bad credential"):
        await service._get_access_token()


@pytest.mark.asyncio
async def test_graph_directory_service_fails_cleanly_when_msal_is_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _raise_module_not_found(name: str) -> object:
        raise ModuleNotFoundError(name)

    monkeypatch.setattr("app.services.graph_directory_service.importlib.import_module", _raise_module_not_found)

    service = GraphDirectoryService(_base_settings(entra_client_secret="entra-client-secret"))

    with pytest.raises(GraphProviderUnavailableError, match="MSAL Python is not installed; cannot acquire Graph token."):
        await service._get_access_token()


@pytest.mark.asyncio
async def test_graph_directory_service_rejects_non_dict_token_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeConfidentialClientApplication:
        def __init__(self, *, client_id: str, authority: str, client_credential: object):
            pass

        def acquire_token_for_client(self, *, scopes: list[str]) -> list[str]:
            return ["not-a-dict"]

    monkeypatch.setattr(
        "app.services.graph_directory_service.importlib.import_module",
        lambda name: SimpleNamespace(ConfidentialClientApplication=FakeConfidentialClientApplication),
    )

    service = GraphDirectoryService(_base_settings(entra_client_secret="entra-client-secret"))

    with pytest.raises(GraphProviderUnavailableError, match="Graph token response is invalid"):
        await service._get_access_token()


def test_directory_provider_auto_uses_graph_when_secret_is_configured() -> None:
    service = DirectoryProviderService(_base_settings(entra_client_secret="entra-client-secret"))
    assert service.provider_name == "graph"


def test_directory_provider_auto_uses_graph_when_certificate_is_configured() -> None:
    service = DirectoryProviderService(
        _base_settings(
            entra_client_certificate_thumbprint="ABCDEF1234567890ABCDEF1234567890ABCDEF12",
            entra_client_certificate_private_key="-----BEGIN PRIVATE KEY-----\nTESTKEY\n-----END PRIVATE KEY-----",
        )
    )
    assert service.provider_name == "graph"


def test_directory_provider_auto_falls_back_to_ad_emulator_when_graph_is_not_configured() -> None:
    service = DirectoryProviderService(
        _base_settings(
            entra_tenant_id=None,
            entra_client_id=None,
            ad_emulator_base_url="https://ad-emulator.example.com",
        )
    )
    assert service.provider_name == "ad_emulator"


def test_directory_provider_rejects_incomplete_certificate_configuration() -> None:
    with pytest.raises(DirectoryProviderUnavailableError, match="Incomplete Entra certificate credential configuration"):
        DirectoryProviderService(
            _base_settings(
                entra_client_certificate_thumbprint="ABCDEF1234567890ABCDEF1234567890ABCDEF12",
            )
        )


def test_directory_provider_rejects_incomplete_certificate_configuration_even_with_ad_emulator() -> None:
    with pytest.raises(DirectoryProviderUnavailableError, match="Incomplete Entra certificate credential configuration"):
        DirectoryProviderService(
            _base_settings(
                entra_client_certificate_thumbprint="ABCDEF1234567890ABCDEF1234567890ABCDEF12",
                ad_emulator_base_url="https://ad-emulator.example.com",
            )
        )


def test_directory_provider_reports_generalized_missing_credential_message() -> None:
    with pytest.raises(DirectoryProviderUnavailableError, match="Set an Entra Graph credential or AD_EMULATOR_BASE_URL"):
        DirectoryProviderService(
            _base_settings(
                entra_tenant_id=None,
                entra_client_id=None,
            )
        )
