from functools import lru_cache

from typing import Literal

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings


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
    # SECURITY: JIT provisioning creates local users on first SSO login. Disable if you require
    # pre-provisioning via admin or directory sync.
    entra_jit_provisioning_enabled: bool = True
    entra_allowed_email_domains: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("ENTRA_ALLOWED_EMAIL_DOMAINS", "ENTRA_ALLOWED_DOMAINS"),
    )
    entra_clock_skew_seconds: int = 60
    entra_oidc_discovery_url: str | None = None

    # CORS
    cors_origins: list[str] = Field(default_factory=list)

    # Trusted hosts (production hardening). If not provided, allowed hosts are derived from CORS origins.
    allowed_hosts: list[str] | None = None

    # Redis (required in production for multi-worker rate limiting and account lockout)
    redis_url: str | None = None

    # AD Emulator Integration
    ad_emulator_url: str = "http://ad-emulator:8001/api/v1"
    directory_webhook_enabled: bool = True
    webhook_secret: str = ""  # Required in production for webhook signature verification

    # Optional vendor external signals (Phase 18-10)
    vendor_signals_public_registry_base_url: str | None = None  # e.g., https://registry.example.com/api
    vendor_signals_min_interval_hours: int = 24

    model_config = {
        "env_file": ".env",
        "populate_by_name": True,
        "extra": "ignore"
    }


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
