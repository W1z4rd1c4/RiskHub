from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings

from app.core.client_ip import DEFAULT_TRUSTED_PROXIES


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    app_name: str = "RiskHub"
    app_version: str = "1.0.0"
    debug: bool = False  # Set to True in .env for development

    # Database
    database_url: str = "postgresql+asyncpg://riskhub:riskhub@db:5432/riskhub"

    # Authentication
    secret_key: str
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

    model_config = {
        "env_file": ".env",
        "populate_by_name": True,
        "extra": "ignore"
    }


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
