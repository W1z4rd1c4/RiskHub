from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings

from app.core.client_ip import DEFAULT_TRUSTED_PROXIES


def _lookup_raw_value(data: dict[str, Any], *keys: str) -> tuple[bool, Any]:
    for key in keys:
        if key in data:
            return True, data[key]
    return False, None


def _read_secret_value(file_env_name: str, raw_path: Any) -> str:
    path = Path(str(raw_path)).expanduser()
    try:
        value = path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise ValueError(f"{file_env_name} points to a missing file: {path}") from exc
    except PermissionError as exc:
        raise ValueError(f"{file_env_name} is not readable: {path}") from exc
    except OSError as exc:
        raise ValueError(f"{file_env_name} could not be read: {path} ({exc})") from exc

    if value.endswith("\n"):
        value = value[:-1]
        if value.endswith("\r"):
            value = value[:-1]
    if value == "":
        raise ValueError(f"{file_env_name} must not point to an empty file: {path}")
    return value


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    app_name: str = "RiskHub"
    app_version: str = "1.0.0"
    debug: bool = False  # Set to True in .env for development

    # Database
    database_url: str = "postgresql+asyncpg://riskhub:riskhub@db:5432/riskhub"
    database_url_file: str | None = Field(
        default=None,
        validation_alias=AliasChoices("DATABASE_URL_FILE", "database_url_file"),
        exclude=True,
        repr=False,
    )

    # Authentication
    secret_key: str
    secret_key_file: str | None = Field(
        default=None,
        validation_alias=AliasChoices("SECRET_KEY_FILE", "secret_key_file"),
        exclude=True,
        repr=False,
    )
    # SECURITY: Never enable in production - allows X-Mock-User-Id header bypass
    mock_auth_enabled: bool = False  # Set to True in .env for development/demo
    access_token_expire_minutes: int = 60

    # Auth mode (password vs SSO)
    # - password: internal username/password login
    # - microsoft_sso: Entra ID SSO only (production default)
    # - hybrid_dev: dev/demo mode (demo login + optional SSO)
    auth_mode: Literal["password", "microsoft_sso", "hybrid_dev"] = "password"

    # Microsoft Entra ID (SSO)
    entra_tenant_id: str | None = None
    entra_client_id: str | None = None
    entra_client_secret: str | None = None
    entra_client_secret_file: str | None = Field(
        default=None,
        validation_alias=AliasChoices("ENTRA_CLIENT_SECRET_FILE", "entra_client_secret_file"),
        exclude=True,
        repr=False,
    )
    # SECURITY: JIT provisioning creates local users on first SSO login. Disable if you require
    # pre-provisioning via admin.
    entra_jit_provisioning_enabled: bool = True
    entra_allowed_email_domains: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("ENTRA_ALLOWED_EMAIL_DOMAINS", "ENTRA_ALLOWED_DOMAINS"),
    )
    entra_clock_skew_seconds: int = 60
    entra_oidc_discovery_url: str | None = None
    directory_provider: Literal["auto", "graph", "ad_emulator"] = "auto"
    ad_emulator_base_url: str | None = None
    ad_emulator_api_key: str | None = None
    ad_emulator_api_key_header: str = "X-API-Key"
    graph_timeout_seconds: float = 10.0

    # CORS
    cors_origins: list[str] = Field(default_factory=list)

    # Trusted hosts (production hardening). If not provided, allowed hosts are derived from CORS origins.
    allowed_hosts: list[str] | None = None

    # Trusted reverse proxies (IP/CIDR) for safe client IP extraction from X-Forwarded-For.
    trusted_proxies: list[str] = Field(default_factory=lambda: list(DEFAULT_TRUSTED_PROXIES))

    # Redis (required in production for multi-worker rate limiting and account lockout)
    redis_url: str | None = None
    redis_url_file: str | None = Field(
        default=None,
        validation_alias=AliasChoices("REDIS_URL_FILE", "redis_url_file"),
        exclude=True,
        repr=False,
    )
    # Fail-closed route prefixes when Redis-backed controls are unavailable.
    rate_limit_fail_closed_prefixes: list[str] = Field(
        default_factory=lambda: ["/api/v1/auth", "/api/v1/admin", "/api/v1/approvals"]
    )
    lockout_fail_closed_on_backend_error: bool = True

    # Request protocol hardening
    protocol_guard_enabled: bool = True
    protocol_guard_block_method_override: bool = True
    protocol_guard_sensitive_query_keys: list[str] = Field(
        default_factory=lambda: ["department_id", "skip", "limit", "format", "user_id", "role_id"]
    )
    protocol_guard_json_prefixes: list[str] = Field(
        default_factory=lambda: ["/api/v1/auth", "/api/v1/admin", "/api/v1/approvals"]
    )

    # Outbound call hardening
    outbound_allow_private_destinations: bool = False
    outbound_allowed_hosts: list[str] = Field(default_factory=list)
    outbound_block_redirects: bool = True

    # Session/refresh-token behavior
    refresh_token_expire_days: int = 7
    refresh_cookie_name: str = "riskhub_refresh_token"
    refresh_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    refresh_cookie_domain: str | None = None

    # Optional vendor external signals (Phase 18-10)
    vendor_signals_public_registry_base_url: str | None = None  # e.g., https://registry.example.com/api
    vendor_signals_min_interval_hours: int = 24

    # AD deprovision scheduler
    ad_deprovision_check_hour: int = 2
    ad_deprovision_check_minute: int = 0

    @model_validator(mode="before")
    @classmethod
    def _resolve_file_backed_settings(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data

        resolved = dict(data)
        mappings = (
            ("database_url", "DATABASE_URL", "database_url_file", "DATABASE_URL_FILE"),
            ("secret_key", "SECRET_KEY", "secret_key_file", "SECRET_KEY_FILE"),
            (
                "entra_client_secret",
                "ENTRA_CLIENT_SECRET",
                "entra_client_secret_file",
                "ENTRA_CLIENT_SECRET_FILE",
            ),
            ("redis_url", "REDIS_URL", "redis_url_file", "REDIS_URL_FILE"),
        )

        for field_name, env_name, file_field_name, file_env_name in mappings:
            value_found, _ = _lookup_raw_value(resolved, field_name, env_name)
            file_found, file_path = _lookup_raw_value(resolved, file_field_name, file_env_name)
            if value_found and file_found:
                raise ValueError(f"{env_name} and {file_env_name} cannot both be set")
            if not file_found:
                continue
            resolved[field_name] = _read_secret_value(file_env_name, file_path)
            resolved[file_field_name] = str(file_path)

        return resolved

    model_config = {
        "env_file": ".env",
        "populate_by_name": True,
        "extra": "ignore"
    }


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
