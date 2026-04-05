from __future__ import annotations

from urllib.parse import urlparse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.v1.router import api_router
from app.core.client_ip import find_broad_trusted_proxy_entries
from app.core.config import Settings, get_settings
from app.core.datetime_utils import utc_now
from app.core.logging import configure_logging, get_logger
from app.core.scheduler import configure_scheduler, start_scheduler_async
from app.models.global_config import GlobalConfig

logger = get_logger("bootstrap")

DEFAULT_DATABASE_URL = "postgresql+asyncpg://riskhub:riskhub@db:5432/riskhub"
LOG_ROTATION_CONFIG_KEYS = (
    "app_log_rotation_size_mb",
    "app_log_retention_count",
    "audit_log_rotation_size_mb",
    "audit_log_retention_count",
)


def derive_allowed_hosts(cors_origins: list[str]) -> list[str]:
    hosts: set[str] = {"localhost", "127.0.0.1"}
    for origin in cors_origins:
        parsed = urlparse(origin)
        if parsed.hostname:
            hosts.add(parsed.hostname)
    return sorted(hosts)


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

    if len(settings.secret_key.strip()) < 32:
        raise RuntimeError("FATAL: SECRET_KEY must be at least 32 characters when DEBUG=false.")
    if settings.database_url == DEFAULT_DATABASE_URL:
        raise RuntimeError("FATAL: DATABASE_URL must be explicitly configured for production deployment.")
    if not settings.cors_origins:
        raise RuntimeError("FATAL: CORS_ORIGINS must be set to an explicit allowlist in production.")
    if "*" in settings.cors_origins:
        raise RuntimeError(
            "FATAL: CORS_ORIGINS cannot include '*' when allow_credentials=true. "
            "Set an explicit allowlist of origins."
        )
    if not settings.allowed_hosts:
        raise RuntimeError("FATAL: ALLOWED_HOSTS must be set to an explicit allowlist when DEBUG=false.")
    if settings.auth_mode != "microsoft_sso":
        raise RuntimeError("FATAL: AUTH_MODE must be 'microsoft_sso' when DEBUG=false.")
    if not settings.entra_tenant_id or not settings.entra_client_id:
        raise RuntimeError(
            "FATAL: ENTRA_TENANT_ID and ENTRA_CLIENT_ID are required when AUTH_MODE=microsoft_sso and DEBUG=false."
        )
    if settings.directory_provider != "graph":
        raise RuntimeError("FATAL: DIRECTORY_PROVIDER must be 'graph' when DEBUG=false.")
    if settings.ad_emulator_base_url:
        raise RuntimeError("FATAL: AD_EMULATOR_BASE_URL must be unset when DEBUG=false.")
    if settings.entra_confidential_credential is None:
        raise RuntimeError("FATAL: An Entra Graph confidential credential is required when DEBUG=false.")
    if settings.entra_jit_provisioning_enabled:
        raise RuntimeError("FATAL: ENTRA_JIT_PROVISIONING_ENABLED must be false when DEBUG=false.")
    if settings.auth_sso_allow_email_link:
        raise RuntimeError("FATAL: AUTH_SSO_ALLOW_EMAIL_LINK must be false when DEBUG=false.")

    broad_proxy_entries = find_broad_trusted_proxy_entries(settings.trusted_proxies)
    if broad_proxy_entries:
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


async def apply_log_rotation_config(app: FastAPI) -> None:
    settings: Settings = app.state.settings
    sessionmaker = getattr(app.state, "db_sessionmaker", None)
    if sessionmaker is None:
        return

    try:
        async with sessionmaker() as db:
            result = await db.execute(
                select(GlobalConfig.key, GlobalConfig.value).where(GlobalConfig.key.in_(LOG_ROTATION_CONFIG_KEYS))
            )
            raw_values = {key: value for key, value in result.all()}
    except (SQLAlchemyError, RuntimeError, ValueError) as exc:
        logger.warning("log_config_load_error", message=f"Could not load log rotation config from database: {exc}")
        return

    try:
        parsed_values = parse_log_rotation_config(raw_values)
    except ValueError as exc:
        if settings.debug:
            logger.warning("log_config_invalid", message=str(exc))
            return
        raise RuntimeError(f"Invalid log rotation config: {exc}") from exc

    if not any(value is not None for value in parsed_values.values()):
        return

    configure_logging(
        app_rotation_size_mb=parsed_values["app_log_rotation_size_mb"],
        app_retention_count=parsed_values["app_log_retention_count"],
        audit_rotation_size_mb=parsed_values["audit_log_rotation_size_mb"],
        audit_retention_count=parsed_values["audit_log_retention_count"],
    )
    logger.info(
        "log_config_applied",
        message=(
            "Log rotation config applied: "
            f"App={parsed_values['app_log_rotation_size_mb']}MB x {parsed_values['app_log_retention_count']}, "
            f"Audit={parsed_values['audit_log_rotation_size_mb']}MB x {parsed_values['audit_log_retention_count']}"
        ),
    )


async def bootstrap_runtime_services(app: FastAPI) -> None:
    settings: Settings = app.state.settings
    await apply_log_rotation_config(app)

    if not settings.debug:
        if not settings.redis_url:
            raise RuntimeError("FATAL: REDIS_URL is required in production mode (DEBUG=false).")
        from redis.asyncio import Redis

        redis = Redis.from_url(settings.redis_url, decode_responses=True)
        try:
            await redis.ping()
        except BaseException:
            await redis.aclose()
            raise
        app.state.redis = redis
    else:
        app.state.redis = None

    from app.services.account_lockout_service import (
        AccountLockoutService,
        InMemoryAccountLockoutBackend,
        RedisAccountLockoutBackend,
    )
    from app.services.sso_challenge_store import InMemorySsoChallengeStore, RedisSsoChallengeStore

    if app.state.redis is not None:
        app.state.account_lockout = AccountLockoutService(RedisAccountLockoutBackend(app.state.redis))
        app.state.sso_challenge_store = RedisSsoChallengeStore(app.state.redis)
    else:
        app.state.account_lockout = AccountLockoutService(InMemoryAccountLockoutBackend())
        app.state.sso_challenge_store = InMemorySsoChallengeStore()

    await start_scheduler_async()


def configure_default_runtime_state(app: FastAPI, settings: Settings) -> None:
    app.state.settings = settings
    app.state.redis = None

    from app.services.account_lockout_service import AccountLockoutService, InMemoryAccountLockoutBackend
    from app.services.sso_challenge_store import InMemorySsoChallengeStore

    app.state.account_lockout = AccountLockoutService(InMemoryAccountLockoutBackend())
    app.state.sso_challenge_store = InMemorySsoChallengeStore()
    app.state.process_started_at = utc_now()


def register_middleware(app: FastAPI, settings: Settings) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    if not settings.debug:
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)

    from app.middleware.logging_context import LoggingContextMiddleware
    from app.middleware.language import LanguageMiddleware
    from app.middleware.security import ProtocolGuardMiddleware, RateLimitMiddleware, SecurityHeadersMiddleware

    app.add_middleware(LoggingContextMiddleware, trusted_proxies=settings.trusted_proxies)
    app.add_middleware(SecurityHeadersMiddleware, enable_hsts=not settings.debug)
    app.add_middleware(ProtocolGuardMiddleware)
    app.add_middleware(
        RateLimitMiddleware,
        enabled=not settings.debug,
        trusted_proxies=settings.trusted_proxies,
    )
    app.add_middleware(LanguageMiddleware)


def register_routes(app: FastAPI, settings: Settings) -> None:
    app.include_router(api_router, prefix="/api/v1")

    @app.get("/")
    async def root():
        base = {"name": settings.app_name, "version": settings.app_version}
        if settings.debug:
            base["docs"] = "/docs"
        return base


def configure_app_dependencies(app: FastAPI, settings: Settings) -> None:
    def _app_settings_override() -> Settings:
        return settings

    app.dependency_overrides[get_settings] = _app_settings_override


def configure_database_and_scheduler(app: FastAPI, settings: Settings) -> None:
    from app.db.session import init_app_db

    init_app_db(app, settings)
    configure_scheduler(app.state.db_sessionmaker, app.state.db_engine)
