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
            # Fetch rotation settings
            size_result = await db.execute(
                select(GlobalConfig).where(GlobalConfig.key == "log_rotation_size_mb")
            )
            size_config = size_result.scalar_one_or_none()
            
            count_result = await db.execute(
                select(GlobalConfig).where(GlobalConfig.key == "log_retention_count")
            )
            count_config = count_result.scalar_one_or_none()
            
            rotation_size_mb = int(size_config.value) if size_config else None
            retention_count = int(count_config.value) if count_config else None
            
            if rotation_size_mb or retention_count:
                configure_logging(
                    rotation_size_mb=rotation_size_mb,
                    retention_count=retention_count
                )
                logger.info(
                    "log_config_applied",
                    message=f"Log rotation config applied from Risk Hub: {rotation_size_mb}MB x {retention_count} files"
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

