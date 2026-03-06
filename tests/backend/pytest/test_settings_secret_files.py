from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import Settings


def _write_secret(path: Path, value: str) -> Path:
    path.write_text(value, encoding="utf-8")
    return path


def test_settings_load_secret_values_from_supported_file_env_vars(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    database_url_file = _write_secret(
        tmp_path / "database_url",
        "postgresql+asyncpg://riskhub:secret@postgres.example.com:5432/riskhub\n",
    )
    secret_key_file = _write_secret(tmp_path / "secret_key", "0123456789abcdef0123456789abcdef\n")
    entra_client_secret_file = _write_secret(tmp_path / "entra_client_secret", "entra-client-secret\n")
    redis_url_file = _write_secret(tmp_path / "redis_url", "redis://:redis-secret@127.0.0.1:6379/0\n")

    for key in ("DATABASE_URL", "SECRET_KEY", "ENTRA_CLIENT_SECRET", "REDIS_URL"):
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


def test_settings_reject_dual_source_secret_values(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    for key in ("DATABASE_URL", "SECRET_KEY", "ENTRA_CLIENT_SECRET", "REDIS_URL"):
        monkeypatch.delenv(key, raising=False)
    secret_key_file = _write_secret(tmp_path / "secret_key", "0123456789abcdef0123456789abcdef\n")

    with pytest.raises(ValidationError, match="SECRET_KEY and SECRET_KEY_FILE cannot both be set"):
        Settings(
            _env_file=None,
            secret_key="0123456789abcdef0123456789abcdef",
            secret_key_file=str(secret_key_file),
        )


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
    for key in ("DATABASE_URL", "SECRET_KEY", "ENTRA_CLIENT_SECRET", "REDIS_URL"):
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
