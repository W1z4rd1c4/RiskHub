from typing import Literal, cast

from fastapi import APIRouter, Depends, Request, Response, status
from redis.exceptions import RedisError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.scheduler import get_scheduler_runtime_state
from app.db.session import get_db
from app.schemas.health import HealthResponse, LivenessResponse, ReadinessResponse

router = APIRouter()


async def _get_database_status(db: AsyncSession) -> Literal["connected", "disconnected"]:
    try:
        await db.execute(text("SELECT 1"))
        return "connected"
    except (SQLAlchemyError, OSError):
        return "disconnected"


async def _get_redis_status(request: Request) -> Literal["connected", "disconnected", "disabled"]:
    redis_client = getattr(request.app.state, "redis", None)
    if redis_client is None:
        return "disabled"

    try:
        await redis_client.ping()
        return "connected"
    except (RedisError, OSError, RuntimeError):
        return "disconnected"


async def _build_readiness_response(
    request: Request,
    db: AsyncSession,
) -> ReadinessResponse:
    database = await _get_database_status(db)
    redis = await _get_redis_status(request)
    scheduler_runtime = get_scheduler_runtime_state()

    ready = database == "connected" and scheduler_runtime["scheduler_status"] != "error"
    scheduler_role = cast(Literal["disabled", "leader", "follower"], scheduler_runtime["scheduler_role"])
    scheduler_status = cast(
        Literal["disabled", "leader_running", "follower_ready", "error"],
        scheduler_runtime["scheduler_status"],
    )
    return ReadinessResponse(
        ready=ready,
        database=database,
        redis=redis,
        scheduler_role=scheduler_role,
        scheduler_status=scheduler_status,
    )


@router.get("/livez", response_model=LivenessResponse)
async def liveness_check() -> LivenessResponse:
    """Process liveness endpoint for machine probes."""

    return LivenessResponse(status="alive")


@router.get("/readyz", response_model=ReadinessResponse)
async def readiness_check(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> ReadinessResponse:
    """Request-serving readiness endpoint for machine probes."""

    readiness = await _build_readiness_response(request, db)
    response.status_code = status.HTTP_200_OK if readiness.ready else status.HTTP_503_SERVICE_UNAVAILABLE
    return readiness


@router.get("/health", response_model=HealthResponse)
async def health_check(request: Request, db: AsyncSession = Depends(get_db)) -> HealthResponse:
    """Diagnostic health endpoint for humans and dashboards."""

    readiness = await _build_readiness_response(request, db)
    health_status: Literal["healthy", "degraded"] = (
        "healthy" if readiness.ready and readiness.redis != "disconnected" else "degraded"
    )

    return HealthResponse(
        status=health_status,
        **readiness.model_dump(),
    )
