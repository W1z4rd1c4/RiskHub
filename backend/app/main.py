from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.api.v1.router import api_router
from app.core.scheduler import start_scheduler, stop_scheduler

# Initialize structured logging BEFORE app creation
from app.core.logging import configure_logging, get_logger
configure_logging()
logger = get_logger("main")

settings = get_settings()

# Production security checks
INSECURE_SECRET = "your-secret-key-change-in-production-use-env-var"
if not settings.debug and settings.secret_key == INSECURE_SECRET:
    raise RuntimeError(
        "FATAL: SECRET_KEY must be set via environment variable in production mode. "
        "Set DEBUG=true for development or provide a secure SECRET_KEY."
    )
if settings.debug and settings.secret_key == INSECURE_SECRET:
    logger.warning("placeholder_secret_key", message="Using placeholder SECRET_KEY in debug mode - DO NOT USE IN PRODUCTION")

# Mock auth production guard
import os
if os.getenv("MOCK_AUTH_ENABLED", "false").lower() == "true":
    if not settings.debug:
        logger.critical(
            "mock_auth_production_error",
            message="FATAL: MOCK_AUTH_ENABLED=true with DEBUG=false is forbidden. "
                    "Disable mock auth for production deployment."
        )
        raise RuntimeError("MOCK_AUTH_ENABLED cannot be true in non-debug mode")
    else:
        logger.warning(
            "mock_auth_warning",
            message="MOCK_AUTH_ENABLED=true - Development mode only"
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle management."""
    # Startup
    logger.info("startup", message="RiskHub application starting")
    
    # Apply log rotation settings from Risk Hub config
    await _apply_log_rotation_config()
    
    start_scheduler()
    yield
    # Shutdown
    logger.info("shutdown", message="RiskHub application shutting down")
    stop_scheduler()


async def _apply_log_rotation_config():
    """Apply log rotation settings from Risk Hub config database."""
    try:
        from app.db.session import async_session_maker
        from app.models.global_config import GlobalConfig
        from sqlalchemy import select
        
        async with async_session_maker() as db:
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
                    audit_retention_count=audit_retention
                )
                logger.info(
                    "log_config_applied",
                    message=f"Log rotation config applied: App={app_rotation_size}MB x {app_retention}, Audit={audit_rotation_size}MB x {audit_retention}"
                )
    except Exception as e:
        logger.warning(
            "log_config_error",
            message=f"Could not apply log rotation config from database: {e}"
        )


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Enterprise Risk Management Platform for Insurance Companies",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logging context middleware (adds request_id, user_id, client_ip to logs)
from app.middleware.logging_context import LoggingContextMiddleware
app.add_middleware(LoggingContextMiddleware)

# Security headers middleware (CSP, HSTS, X-Frame-Options, etc.)
from app.middleware.security import SecurityHeadersMiddleware, RateLimitMiddleware
app.add_middleware(SecurityHeadersMiddleware, enable_hsts=not settings.debug)

# Rate limiting middleware (disabled in debug mode)
app.add_middleware(RateLimitMiddleware, enabled=not settings.debug)

# Language detection middleware (Accept-Language header support)
from app.middleware.language import LanguageMiddleware
app.add_middleware(LanguageMiddleware)

# Include API routes
app.include_router(api_router, prefix="/api/v1")


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs"
    }

