from __future__ import annotations

import inspect

import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.schemas.directory import DirectoryUserRead
from app.services._graph_directory.service import GraphDirectoryProviderError, GraphDirectoryService
from app.services.directory_provider_service import DirectoryProviderError, _ADEmulatorDirectoryService

_MISSING = object()


def _settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "secret_key": "0123456789abcdef0123456789abcdef",
        "database_url": "postgresql+asyncpg://riskhub:secret@postgres.example.com:5432/riskhub",
        "cors_origins": ["https://riskhub.example.com"],
        "entra_tenant_id": "00000000-0000-0000-0000-000000000000",
        "entra_client_id": "11111111-1111-1111-1111-111111111111",
        "entra_business_role_attribute_name": "riskhubBusinessRole",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def _shared_directory_fields(record) -> dict[str, object]:
    payload = record.model_dump()
    return {
        key: payload[key]
        for key in (
            "external_id",
            "display_name",
            "email",
            "user_principal_name",
            "department",
            "job_title",
            "account_enabled",
        )
    }


@pytest.mark.parametrize(
    ("provider", "payload", "expected", "expected_business_role", "source"),
    [
        (
            _ADEmulatorDirectoryService(_settings(ad_emulator_base_url="https://ad.example.test")),
            {
                "external_id": " ad-123 ",
                "display_name": " Ada Lovelace ",
                "email": " ADA@example.COM ",
                "user_principal_name": " ADA@EXAMPLE.COM ",
                "department": " Risk ",
                "job_title": " Risk Owner ",
                "business_role": "  Business Owner  ",
                "account_enabled": False,
            },
            {
                "external_id": "ad-123",
                "display_name": "Ada Lovelace",
                "email": "ada@example.com",
                "user_principal_name": "ada@example.com",
                "department": "Risk",
                "job_title": "Risk Owner",
                "account_enabled": False,
            },
            "Business Owner",
            "ad_emulator",
        ),
        (
            GraphDirectoryService(_settings(entra_client_secret="secret")),
            {
                "id": " graph-123 ",
                "displayName": " Grace Hopper ",
                "mail": " GRACE@example.COM ",
                "userPrincipalName": " GRACE@EXAMPLE.COM ",
                "department": " Technology ",
                "jobTitle": " Engineer ",
                "extension_11111111111111111111111111111111_riskhubBusinessRole": "  Engineer  ",
                "accountEnabled": False,
            },
            {
                "external_id": "graph-123",
                "display_name": "Grace Hopper",
                "email": "grace@example.com",
                "user_principal_name": "grace@example.com",
                "department": "Technology",
                "job_title": "Engineer",
                "account_enabled": False,
            },
            "Engineer",
            "graph",
        ),
    ],
)
def test_directory_user_adapters_share_normalized_directory_fields(
    provider,
    payload,
    expected,
    expected_business_role,
    source,
) -> None:
    record = provider._to_directory_user(payload)

    assert _shared_directory_fields(record) == expected
    assert record.business_role == expected_business_role
    assert record.source == source


@pytest.mark.parametrize(
    ("provider", "id_field", "eligibility_field", "error_type"),
    [
        (
            _ADEmulatorDirectoryService(_settings(ad_emulator_base_url="https://ad.example.test")),
            "external_id",
            "account_enabled",
            DirectoryProviderError,
        ),
        (
            GraphDirectoryService(_settings(entra_client_secret="secret")),
            "id",
            "accountEnabled",
            GraphDirectoryProviderError,
        ),
    ],
)
@pytest.mark.parametrize(
    "invalid_eligibility",
    [
        pytest.param(_MISSING, id="missing"),
        pytest.param(None, id="null"),
        pytest.param("true", id="string"),
        pytest.param(1, id="number"),
    ],
)
def test_directory_user_adapters_reject_unknown_account_eligibility(
    provider,
    id_field,
    eligibility_field,
    error_type,
    invalid_eligibility,
) -> None:
    payload: dict[str, object] = {id_field: "user-123"}
    if invalid_eligibility is not _MISSING:
        payload[eligibility_field] = invalid_eligibility

    with pytest.raises(error_type, match="account eligibility must be an explicit boolean"):
        provider._to_directory_user(payload)


@pytest.mark.parametrize(
    ("provider", "payload"),
    [
        (
            _ADEmulatorDirectoryService(_settings(ad_emulator_base_url="https://ad.example.test")),
            {"external_id": "ad-123", "account_enabled": True},
        ),
        (
            GraphDirectoryService(_settings(entra_client_secret="secret")),
            {"id": "graph-123", "accountEnabled": True},
        ),
    ],
)
@pytest.mark.parametrize("account_enabled", [True, False])
def test_directory_user_adapters_preserve_explicit_account_eligibility(
    provider,
    payload,
    account_enabled,
) -> None:
    eligibility_field = "accountEnabled" if provider.source_name == "graph" else "account_enabled"
    normalized_payload = {**payload, eligibility_field: account_enabled}

    assert provider._to_directory_user(normalized_payload).account_enabled is account_enabled


def test_directory_user_schema_requires_explicit_boolean_account_eligibility() -> None:
    payload = {"external_id": "user-123", "display_name": "User", "source": "graph"}

    with pytest.raises(ValidationError):
        DirectoryUserRead(**payload)

    for invalid_eligibility in (None, "true", 1):
        with pytest.raises(ValidationError):
            DirectoryUserRead(**payload, account_enabled=invalid_eligibility)


def test_directory_user_adapters_use_shared_normalizer() -> None:
    from app.services._directory_identity import normalize_directory_user_read

    assert callable(normalize_directory_user_read)
    for adapter in (_ADEmulatorDirectoryService._to_directory_user, GraphDirectoryService._to_directory_user):
        source = inspect.getsource(adapter)
        assert "normalize_directory_user_read(" in source
        assert "DirectoryUserRead(" not in source
