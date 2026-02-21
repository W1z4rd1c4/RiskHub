from contextlib import asynccontextmanager
from urllib.parse import urlparse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.v1.router import api_router
from app.core.config import Settings, get_settings

# Initialize structured logging BEFORE app creation
from app.core.logging import configure_logging, get_logger
from app.core.scheduler import configure_scheduler, start_scheduler, stop_scheduler
from app.core.schema_guard import enforce_schema_head

configure_logging()
logger = get_logger("main")

DEFAULT_DATABASE_URL = "postgresql+asyncpg://riskhub:riskhub@db:5432/riskhub"


def _derive_allowed_hosts(cors_origins: list[str]) -> list[str]:
    hosts: set[str] = {"localhost", "127.0.0.1"}
    for origin in cors_origins:
        parsed = urlparse(origin)
        if parsed.hostname:
            hosts.add(parsed.hostname)
    return sorted(hosts)


def _validate_production_settings(settings: Settings) -> None:
    # Mock auth production guard
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

    # Production hardening guardrails
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

    # Auth mode guardrails (SSO-only in production)
    if settings.auth_mode != "microsoft_sso":
        raise RuntimeError("FATAL: AUTH_MODE must be 'microsoft_sso' when DEBUG=false.")
    if not settings.entra_tenant_id or not settings.entra_client_id:
        raise RuntimeError(
            "FATAL: ENTRA_TENANT_ID and ENTRA_CLIENT_ID are required when AUTH_MODE=microsoft_sso and DEBUG=false."
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle management."""
    # Startup
    logger.info("startup", message="RiskHub application starting")
    settings: Settings = app.state.settings

    db_engine = getattr(app.state, "db_engine", None)
    if db_engine is None:
        raise RuntimeError("Database not initialized; call init_app_db() during app creation.")
    await enforce_schema_head(engine=db_engine, database_url=settings.database_url)

    # Apply log rotation settings from global configuration
    await _apply_log_rotation_config(app)

    # Redis is required in production for multi-worker rate limiting & lockout.
    if not settings.debug:
        if not settings.redis_url:
            raise RuntimeError("FATAL: REDIS_URL is required in production mode (DEBUG=false).")
        try:
            from redis.asyncio import Redis

            redis = Redis.from_url(settings.redis_url, decode_responses=True)
            await redis.ping()
        except Exception as e:
            raise RuntimeError(f"FATAL: Redis is required in production but is unreachable: {e}") from e
        app.state.redis = redis
    else:
        app.state.redis = None

    # Account lockout backend
    from app.services.account_lockout_service import (
        AccountLockoutService,
        InMemoryAccountLockoutBackend,
        RedisAccountLockoutBackend,
    )

    if app.state.redis is not None:
        app.state.account_lockout = AccountLockoutService(RedisAccountLockoutBackend(app.state.redis))
    else:
        app.state.account_lockout = AccountLockoutService(InMemoryAccountLockoutBackend())

    start_scheduler()
    yield
    # Shutdown
    logger.info("shutdown", message="RiskHub application shutting down")
    stop_scheduler()

    db_engine = getattr(app.state, "db_engine", None)
    if db_engine is not None:
        try:
            await db_engine.dispose()
        except Exception as exc:
            logger.warning("shutdown_db_dispose_error", message=f"Failed to dispose DB engine: {exc}")

    redis = getattr(app.state, "redis", None)
    if redis is not None:
        try:
            await redis.aclose()
        except Exception as exc:
            logger.warning("shutdown_redis_close_error", message=f"Failed to close Redis client: {exc}")


async def _apply_log_rotation_config(app: FastAPI):
    """Apply log rotation settings from global configuration database."""
    try:
        from sqlalchemy import select

        from app.models.global_config import GlobalConfig

        sessionmaker = getattr(app.state, "db_sessionmaker", None)
        if sessionmaker is None:
            return

        async with sessionmaker() as db:
            # Fetch app log settings
            app_size_result = await db.execute(
                select(GlobalConfig).where(GlobalConfig.key == "app_log_rotation_size_mb")
            )
            app_size_config = app_size_result.scalar_one_or_none()

            app_count_result = await db.execute(
                select(GlobalConfig).where(GlobalConfig.key == "app_log_retention_count")
            )
            app_count_config = app_count_result.scalar_one_or_none()

            # Fetch audit log settings
            audit_size_result = await db.execute(
                select(GlobalConfig).where(GlobalConfig.key == "audit_log_rotation_size_mb")
            )
            audit_size_config = audit_size_result.scalar_one_or_none()

            audit_count_result = await db.execute(
                select(GlobalConfig).where(GlobalConfig.key == "audit_log_retention_count")
            )
            audit_count_config = audit_count_result.scalar_one_or_none()

            app_rotation_size = int(app_size_config.value) if app_size_config else None
            app_retention = int(app_count_config.value) if app_count_config else None
            audit_rotation_size = int(audit_size_config.value) if audit_size_config else None
            audit_retention = int(audit_count_config.value) if audit_count_config else None

            if any([app_rotation_size, app_retention, audit_rotation_size, audit_retention]):
                configure_logging(
                    app_rotation_size_mb=app_rotation_size,
                    app_retention_count=app_retention,
                    audit_rotation_size_mb=audit_rotation_size,
                    audit_retention_count=audit_retention,
                )
                logger.info(
                    "log_config_applied",
                    message=(
                        "Log rotation config applied: "
                        f"App={app_rotation_size}MB x {app_retention}, "
                        f"Audit={audit_rotation_size}MB x {audit_retention}"
                    ),
                )
    except Exception as e:
        logger.warning("log_config_error", message=f"Could not apply log rotation config from database: {e}")


def create_app(settings: Settings) -> FastAPI:
    _validate_production_settings(settings)

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Enterprise Risk Management Platform for Insurance Companies",
        docs_url="/docs" if settings.debug else None,
        redoc_url="/redoc" if settings.debug else None,
        openapi_url="/openapi.json" if settings.debug else None,
        lifespan=lifespan,
    )
    app.state.settings = settings

    # Bind Settings dependency resolution to this app instance.
    def _app_settings_override() -> Settings:
        return settings

    app.dependency_overrides[get_settings] = _app_settings_override

    # Defaults for transports/tests that don't run lifespan.
    app.state.redis = None
    from app.services.account_lockout_service import AccountLockoutService, InMemoryAccountLockoutBackend

    app.state.account_lockout = AccountLockoutService(InMemoryAccountLockoutBackend())

    from app.db.session import init_app_db

    init_app_db(app, settings)
    configure_scheduler(app.state.db_sessionmaker)

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Trusted host protection (production only)
    if not settings.debug:
        allowed_hosts = settings.allowed_hosts or _derive_allowed_hosts(settings.cors_origins)
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)

    # Logging context middleware (adds request_id, user_id, client_ip to logs)
    from app.middleware.logging_context import LoggingContextMiddleware

    app.add_middleware(LoggingContextMiddleware, trusted_proxies=settings.trusted_proxies)

    # Security headers middleware (CSP, HSTS, X-Frame-Options, etc.)
    from app.middleware.security import ProtocolGuardMiddleware, RateLimitMiddleware, SecurityHeadersMiddleware

    app.add_middleware(SecurityHeadersMiddleware, enable_hsts=not settings.debug)
    app.add_middleware(ProtocolGuardMiddleware)

    # Rate limiting middleware (disabled in debug mode)
    app.add_middleware(
        RateLimitMiddleware,
        enabled=not settings.debug,
        trusted_proxies=settings.trusted_proxies,
    )

    # Language detection middleware (Accept-Language header support)
    from app.middleware.language import LanguageMiddleware

    app.add_middleware(LanguageMiddleware)

    # Include API routes
    app.include_router(api_router, prefix="/api/v1")

    @app.get("/")
    async def root():
        """Root endpoint."""
        base = {"name": settings.app_name, "version": settings.app_version}
        if settings.debug:
            base["docs"] = "/docs"
        return base

    return app


app = create_app(get_settings())
