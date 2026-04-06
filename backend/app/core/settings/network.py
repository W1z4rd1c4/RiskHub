from pydantic import Field

from app.core.client_ip import DEFAULT_TRUSTED_PROXIES


class NetworkSettingsMixin:
    # CORS
    cors_origins: list[str] = Field(default_factory=list)

    # Trusted hosts (production hardening). Explicit allowlist is required when DEBUG=false.
    allowed_hosts: list[str] = Field(default_factory=list)

    # Trusted reverse proxies (IP/CIDR) for safe client IP extraction from X-Forwarded-For.
    trusted_proxies: list[str] = Field(default_factory=lambda: list(DEFAULT_TRUSTED_PROXIES))
    allow_broad_trusted_proxies_in_production: bool = False
