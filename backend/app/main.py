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
    start_scheduler()
    yield
    # Shutdown
    logger.info("shutdown", message="RiskHub application shutting down")
    stop_scheduler()


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

