from __future__ import annotations

import inspect

import pytest

from app.core.config import Settings
from app.services._graph_directory.service import GraphDirectoryService
from app.services.directory_provider_service import _ADEmulatorDirectoryService


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


def test_directory_user_adapters_use_shared_normalizer() -> None:
    from app.services._directory_identity import normalize_directory_user_read

    assert callable(normalize_directory_user_read)
    for adapter in (_ADEmulatorDirectoryService._to_directory_user, GraphDirectoryService._to_directory_user):
        source = inspect.getsource(adapter)
        assert "normalize_directory_user_read(" in source
        assert "DirectoryUserRead(" not in source
