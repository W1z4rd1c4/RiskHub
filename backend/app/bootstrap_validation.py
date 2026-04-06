from __future__ import annotations

from app.core.client_ip import find_broad_trusted_proxy_entries
from app.core.config import Settings
from app.core.logging import get_logger
from app.core.production_contract import PRODUCTION_INVARIANTS

logger = get_logger("bootstrap")

DEFAULT_DATABASE_URL = "postgresql+asyncpg://riskhub:riskhub@db:5432/riskhub"
LOG_ROTATION_CONFIG_KEYS = (
    "app_log_rotation_size_mb",
    "app_log_retention_count",
    "audit_log_rotation_size_mb",
    "audit_log_retention_count",
)


def validate_settings_for_runtime(settings: Settings) -> None:
    if settings.mock_auth_enabled and not settings.debug:
        logger.critical(
            "mock_auth_production_error",
            message=(
                "FATAL: MOCK_AUTH_ENABLED=true with DEBUG=false is forbidden. "
                "Disable mock auth for production deployment."
            ),
        )
        raise RuntimeError("MOCK_AUTH_ENABLED cannot be true in non-debug mode")
    if settings.mock_auth_enabled and settings.debug:
        logger.warning("mock_auth_warning", message="MOCK_AUTH_ENABLED=true - Development mode only")

    if settings.debug:
        return

    invariant_map = {item.key: item for item in PRODUCTION_INVARIANTS}

    if len(settings.secret_key.strip()) < 32:
        raise RuntimeError("FATAL: SECRET_KEY must be at least 32 characters when DEBUG=false.")
    if settings.database_url == DEFAULT_DATABASE_URL:
        raise RuntimeError("FATAL: DATABASE_URL must be explicitly configured for production deployment.")
    if not settings.cors_origins:
        raise RuntimeError(
            f"FATAL: {invariant_map['CORS_ORIGINS'].key} must be set to an explicit allowlist in production."
        )
    if "*" in settings.cors_origins:
        raise RuntimeError(
            "FATAL: CORS_ORIGINS cannot include '*' when allow_credentials=true. "
            "Set an explicit allowlist of origins."
        )
    if not settings.allowed_hosts:
        raise RuntimeError(
            f"FATAL: {invariant_map['ALLOWED_HOSTS'].key} must be set to an explicit allowlist when DEBUG=false."
        )
    if settings.auth_mode != invariant_map["AUTH_MODE"].required_value:
        raise RuntimeError(
            f"FATAL: AUTH_MODE must be '{invariant_map['AUTH_MODE'].required_value}' when DEBUG=false."
        )
    if not settings.entra_tenant_id or not settings.entra_client_id:
        raise RuntimeError(
            "FATAL: ENTRA_TENANT_ID and ENTRA_CLIENT_ID are required when AUTH_MODE=microsoft_sso and DEBUG=false."
        )
    if settings.directory_provider != invariant_map["DIRECTORY_PROVIDER"].required_value:
        raise RuntimeError(
            f"FATAL: DIRECTORY_PROVIDER must be '{invariant_map['DIRECTORY_PROVIDER'].required_value}' when DEBUG=false."
        )
    if settings.ad_emulator_base_url:
        raise RuntimeError("FATAL: AD_EMULATOR_BASE_URL must be unset when DEBUG=false.")
    if settings.entra_confidential_credential is None:
        raise RuntimeError("FATAL: An Entra Graph confidential credential is required when DEBUG=false.")
    if settings.entra_jit_provisioning_enabled:
        raise RuntimeError(
            f"FATAL: ENTRA_JIT_PROVISIONING_ENABLED must be {invariant_map['ENTRA_JIT_PROVISIONING_ENABLED'].required_value} when DEBUG=false."
        )
    if settings.auth_sso_allow_email_link:
        raise RuntimeError(
            f"FATAL: AUTH_SSO_ALLOW_EMAIL_LINK must be {invariant_map['AUTH_SSO_ALLOW_EMAIL_LINK'].required_value} when DEBUG=false."
        )

    broad_proxy_entries = find_broad_trusted_proxy_entries(settings.trusted_proxies)
    if broad_proxy_entries:
        if not settings.allow_broad_trusted_proxies_in_production:
            raise RuntimeError(
                "FATAL: TRUSTED_PROXIES contains broad network ranges. "
                "Use exact proxy hops in production or set "
                "ALLOW_BROAD_TRUSTED_PROXIES_IN_PRODUCTION=true if this trust boundary is intentional."
            )
        logger.warning(
            "trusted_proxy_broad_network_warning",
            message=(
                "TRUSTED_PROXIES contains broad network ranges. "
                "X-Forwarded-For handling, rate limiting, refresh-session IP attribution, and request logs "
                "will trust peers inside these ranges."
            ),
            trusted_proxies=broad_proxy_entries,
        )


def parse_log_rotation_config(raw_values: dict[str, str | None]) -> dict[str, int | None]:
    parsed: dict[str, int | None] = {}
    for key in LOG_ROTATION_CONFIG_KEYS:
        raw_value = raw_values.get(key)
        if raw_value is None:
            parsed[key] = None
            continue
        try:
            parsed_value = int(str(raw_value))
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{key} must be a positive integer, got {raw_value!r}") from exc
        if parsed_value < 1:
            raise ValueError(f"{key} must be >= 1, got {parsed_value}")
        parsed[key] = parsed_value
    return parsed
