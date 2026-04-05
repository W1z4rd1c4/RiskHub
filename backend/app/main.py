from contextlib import asynccontextmanager
from fastapi import FastAPI

from app.api.v1.router import api_router
from app.core.config import Settings, get_settings
from app.core.logging import configure_logging, get_logger
from app.core.scheduler import stop_scheduler_async
from app.core.schema_guard import enforce_schema_head
from app.bootstrap import (
    DEFAULT_DATABASE_URL,
    apply_log_rotation_config,
    bootstrap_runtime_services,
    configure_app_dependencies,
    configure_database_and_scheduler,
    configure_default_runtime_state,
    parse_log_rotation_config,
    register_middleware,
    register_routes,
    validate_settings_for_runtime,
)

configure_logging()
logger = get_logger("main")

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

    await bootstrap_runtime_services(app)
    yield
    # Shutdown
    logger.info("shutdown", message="RiskHub application shutting down")
    await stop_scheduler_async()

    db_engine = getattr(app.state, "db_engine", None)
    if db_engine is not None:
        try:
            await db_engine.dispose()
        except Exception as exc:
            # Best-effort shutdown cleanup; startup/runtime failures should never be masked here.
            logger.warning("shutdown_db_dispose_error", message=f"Failed to dispose DB engine: {exc}")

    redis = getattr(app.state, "redis", None)
    if redis is not None:
        try:
            await redis.aclose()
        except Exception as exc:
            # Best-effort shutdown cleanup; startup/runtime failures should never be masked here.
            logger.warning("shutdown_redis_close_error", message=f"Failed to close Redis client: {exc}")

def create_app(settings: Settings) -> FastAPI:
    validate_settings_for_runtime(settings)

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Enterprise Risk Management Platform for Insurance Companies",
        docs_url="/docs" if settings.debug else None,
        redoc_url="/redoc" if settings.debug else None,
        openapi_url="/openapi.json" if settings.debug else None,
        lifespan=lifespan,
    )
    configure_default_runtime_state(app, settings)
    configure_app_dependencies(app, settings)
    configure_database_and_scheduler(app, settings)
    register_middleware(app, settings)
    register_routes(app, settings)
    return app

def _validate_production_settings(settings: Settings) -> None:
    validate_settings_for_runtime(settings)


async def _apply_log_rotation_config(app: FastAPI):
    await apply_log_rotation_config(app)


def _parse_log_rotation_config(raw_values: dict[str, str | None]) -> dict[str, int | None]:
    return parse_log_rotation_config(raw_values)


app = create_app(get_settings())
