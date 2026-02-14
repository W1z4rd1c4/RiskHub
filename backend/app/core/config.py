from functools import lru_cache

from pydantic import Field
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
        "extra": "ignore"
    }


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
