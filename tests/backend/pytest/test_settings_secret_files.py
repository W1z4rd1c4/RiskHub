from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import Settings


def _write_secret(path: Path, value: str) -> Path:
    path.write_text(value, encoding="utf-8")
    return path


def test_settings_load_secret_values_from_supported_file_env_vars(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    database_url_file = _write_secret(
        tmp_path / "database_url",
        "postgresql+asyncpg://riskhub:secret@postgres.example.com:5432/riskhub\n",
    )
    secret_key_file = _write_secret(tmp_path / "secret_key", "0123456789abcdef0123456789abcdef\n")
    entra_client_secret_file = _write_secret(tmp_path / "entra_client_secret", "entra-client-secret\n")
    redis_url_file = _write_secret(tmp_path / "redis_url", "redis://:redis-secret@127.0.0.1:6379/0\n")

    for key in (
        "DATABASE_URL",
        "SECRET_KEY",
        "ENTRA_CLIENT_SECRET",
        "ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY",
        "REDIS_URL",
    ):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("DATABASE_URL_FILE", str(database_url_file))
    monkeypatch.setenv("SECRET_KEY_FILE", str(secret_key_file))
    monkeypatch.setenv("ENTRA_CLIENT_SECRET_FILE", str(entra_client_secret_file))
    monkeypatch.setenv("REDIS_URL_FILE", str(redis_url_file))
    monkeypatch.setenv("AUTH_MODE", "microsoft_sso")
    monkeypatch.setenv("ENTRA_TENANT_ID", "00000000-0000-0000-0000-000000000000")
    monkeypatch.setenv("ENTRA_CLIENT_ID", "11111111-1111-1111-1111-111111111111")
    monkeypatch.setenv("CORS_ORIGINS", '["https://riskhub.example.com"]')

    settings = Settings(_env_file=None)

    assert settings.database_url == "postgresql+asyncpg://riskhub:secret@postgres.example.com:5432/riskhub"
    assert settings.secret_key == "0123456789abcdef0123456789abcdef"
    assert settings.entra_client_secret == "entra-client-secret"
    assert settings.redis_url == "redis://:redis-secret@127.0.0.1:6379/0"
    assert settings.entra_tenant_id == "00000000-0000-0000-0000-000000000000"
    assert settings.entra_client_id == "11111111-1111-1111-1111-111111111111"
    assert settings.entra_confidential_credential is not None
    assert settings.entra_confidential_credential.mode == "secret"


@pytest.mark.parametrize(
    ("field_name", "env_name", "file_field_name", "file_env_name", "value", "filename"),
    [
        (
            "database_url",
            "DATABASE_URL",
            "database_url_file",
            "DATABASE_URL_FILE",
            "postgresql+asyncpg://riskhub:secret@postgres.example.com:5432/riskhub",
            "database_url",
        ),
        (
            "secret_key",
            "SECRET_KEY",
            "secret_key_file",
            "SECRET_KEY_FILE",
            "0123456789abcdef0123456789abcdef",
            "secret_key",
        ),
        (
            "entra_client_secret",
            "ENTRA_CLIENT_SECRET",
            "entra_client_secret_file",
            "ENTRA_CLIENT_SECRET_FILE",
            "entra-client-secret",
            "entra_client_secret",
        ),
        (
            "entra_client_certificate_private_key",
            "ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY",
            "entra_client_certificate_private_key_file",
            "ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE",
            "-----BEGIN PRIVATE KEY-----\nTESTKEY\n-----END PRIVATE KEY-----",
            "entra_client_certificate_private_key",
        ),
        (
            "redis_url",
            "REDIS_URL",
            "redis_url_file",
            "REDIS_URL_FILE",
            "redis://:redis-secret@127.0.0.1:6379/0",
            "redis_url",
        ),
    ],
)
def test_settings_reject_dual_source_secret_values(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    field_name: str,
    env_name: str,
    file_field_name: str,
    file_env_name: str,
    value: str,
    filename: str,
) -> None:
    for key in (
        "DATABASE_URL",
        "SECRET_KEY",
        "ENTRA_CLIENT_SECRET",
        "ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY",
        "REDIS_URL",
    ):
        monkeypatch.delenv(key, raising=False)
    secret_file = _write_secret(tmp_path / filename, f"{value}\n")

    kwargs = {
        "secret_key": "0123456789abcdef0123456789abcdef",
        "database_url": "postgresql+asyncpg://riskhub:secret@postgres.example.com:5432/riskhub",
        field_name: value,
        file_field_name: str(secret_file),
    }

    with pytest.raises(ValidationError, match=rf"{env_name} and {file_env_name} cannot both be set"):
        Settings(_env_file=None, **kwargs)


def test_settings_support_certificate_credential_and_prefer_it_over_secret(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    certificate_key_file = _write_secret(
        tmp_path / "entra_client_certificate_private_key",
        "-----BEGIN PRIVATE KEY-----\nTESTKEY\n-----END PRIVATE KEY-----\n",
    )

    for key in (
        "DATABASE_URL",
        "SECRET_KEY",
        "ENTRA_CLIENT_SECRET",
        "ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY",
        "REDIS_URL",
    ):
        monkeypatch.delenv(key, raising=False)

    settings = Settings(
        _env_file=None,
        secret_key="0123456789abcdef0123456789abcdef",
        database_url="postgresql+asyncpg://riskhub:secret@postgres.example.com:5432/riskhub",
        entra_client_secret="legacy-secret",
        entra_client_certificate_thumbprint="ABCDEF1234567890ABCDEF1234567890ABCDEF12",
        entra_client_certificate_private_key_file=str(certificate_key_file),
    )

    assert settings.entra_confidential_credential is not None
    assert settings.entra_confidential_credential.mode == "certificate"
    assert settings.entra_confidential_credential.client_secret is None
    assert (
        settings.entra_confidential_credential.client_certificate_thumbprint
        == "ABCDEF1234567890ABCDEF1234567890ABCDEF12"
    )
    assert settings.entra_confidential_credential.client_certificate_private_key is not None


def test_settings_report_incomplete_certificate_credential_configuration() -> None:
    settings = Settings(
        _env_file=None,
        secret_key="0123456789abcdef0123456789abcdef",
        database_url="postgresql+asyncpg://riskhub:secret@postgres.example.com:5432/riskhub",
        entra_client_certificate_thumbprint="ABCDEF1234567890ABCDEF1234567890ABCDEF12",
    )

    assert settings.entra_certificate_credential_error is not None
    assert "Incomplete Entra certificate credential configuration" in settings.entra_certificate_credential_error
    assert settings.entra_confidential_credential is None


def test_settings_reject_unknown_explicit_values() -> None:
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        Settings(
            _env_file=None,
            secret_key="0123456789abcdef0123456789abcdef",
            database_url="postgresql+asyncpg://riskhub:secret@postgres.example.com:5432/riskhub",
            unexpected_field="value",
        )


def test_settings_grouped_views_expose_current_values() -> None:
    settings = Settings(
        _env_file=None,
        secret_key="0123456789abcdef0123456789abcdef",
        database_url="postgresql+asyncpg://riskhub:secret@postgres.example.com:5432/riskhub",
        auth_mode="hybrid_dev",
        outbound_allowed_hosts=["graph.microsoft.com"],
        refresh_cookie_name="custom-refresh",
        rate_limit_fail_closed_prefixes=["/api/v1/auth"],
    )

    assert settings.auth_settings.mode == "hybrid_dev"
    assert settings.outbound_settings.allowed_hosts == ("graph.microsoft.com",)
    assert settings.session_settings.refresh_cookie_name == "custom-refresh"
    assert settings.redis_settings.rate_limit_fail_closed_prefixes == ("/api/v1/auth",)
    assert settings.protocol_guard_settings.enabled is True


def test_settings_defaults_are_prod_safe_and_dev_scripts_opt_in_to_relaxed_modes() -> None:
    settings = Settings(
        _env_file=None,
        secret_key="0123456789abcdef0123456789abcdef",
        database_url="postgresql+asyncpg://riskhub:secret@postgres.example.com:5432/riskhub",
    )

    assert settings.directory_provider == "graph"
    assert settings.entra_jit_provisioning_enabled is False
    assert settings.auth_sso_allow_email_link is False


def test_settings_derive_entra_business_role_claim_and_graph_field() -> None:
    settings = Settings(
        _env_file=None,
        secret_key="0123456789abcdef0123456789abcdef",
        database_url="postgresql+asyncpg://riskhub:secret@postgres.example.com:5432/riskhub",
        entra_client_id="11111111-1111-1111-1111-111111111111",
        entra_business_role_attribute_name="riskhubBusinessRole",
    )

    assert settings.entra_business_role_graph_field == (
        "extension_11111111111111111111111111111111_riskhubBusinessRole"
    )
    assert settings.entra_business_role_token_claim == "extn.riskhubBusinessRole"
    assert settings.entra_business_role_enabled is True
    assert settings.auth_settings.entra_business_role_attribute_name == "riskhubBusinessRole"


def test_settings_disable_entra_business_role_helpers_when_attribute_name_missing() -> None:
    settings = Settings(
        _env_file=None,
        secret_key="0123456789abcdef0123456789abcdef",
        database_url="postgresql+asyncpg://riskhub:secret@postgres.example.com:5432/riskhub",
        entra_client_id="11111111-1111-1111-1111-111111111111",
    )

    assert settings.entra_business_role_enabled is False
    assert settings.entra_business_role_graph_field is None
    assert settings.entra_business_role_token_claim is None


@pytest.mark.parametrize(
    ("filename", "content", "error"),
    [
        ("missing", None, "DATABASE_URL_FILE points to a missing file"),
        ("empty", "", "DATABASE_URL_FILE must not point to an empty file"),
    ],
)
def test_settings_reject_missing_or_empty_secret_files(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    filename: str,
    content: str | None,
    error: str,
) -> None:
    for key in (
        "DATABASE_URL",
        "SECRET_KEY",
        "ENTRA_CLIENT_SECRET",
        "ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY",
        "REDIS_URL",
    ):
        monkeypatch.delenv(key, raising=False)
    secret_path = tmp_path / filename
    if content is not None:
        secret_path.write_text(content, encoding="utf-8")

    with pytest.raises(ValidationError, match=error):
        Settings(
            _env_file=None,
            database_url_file=str(secret_path),
            secret_key="0123456789abcdef0123456789abcdef",
        )
