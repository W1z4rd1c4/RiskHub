"""Health check endpoint for monitoring and Docker health checks."""

from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from redis.exceptions import RedisError

from app.db.session import get_db
from app.core.scheduler import get_scheduler_runtime_state

router = APIRouter()

class HealthResponse(BaseModel):
    """Health check response model."""
    status: Literal["healthy", "degraded"]
    database: Literal["connected", "disconnected"]
    redis: Literal["connected", "disconnected", "disabled"]
    scheduler: Literal["running", "stopped", "disabled"]


@router.get("/health", response_model=HealthResponse)
async def health_check(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Health check endpoint for Docker health checks and monitoring.
    """
    try:
        await db.execute(text("SELECT 1"))
        db_status = "connected"
    except (SQLAlchemyError, OSError):
        db_status = "disconnected"

    redis_client = getattr(request.app.state, "redis", None)
    if redis_client is None:
        redis_status = "disabled"
    else:
        try:
            await redis_client.ping()
            redis_status = "connected"
        except (RedisError, OSError, RuntimeError):
            redis_status = "disconnected"

    scheduler_runtime = get_scheduler_runtime_state()
    if not scheduler_runtime["scheduler_enabled"]:
        scheduler_status = "disabled"
    elif scheduler_runtime["scheduler_running"] and scheduler_runtime["lock_acquired"]:
        scheduler_status = "running"
    else:
        scheduler_status = "stopped"

    status = "healthy"
    if db_status != "connected" or redis_status == "disconnected" or scheduler_status == "stopped":
        status = "degraded"

    return HealthResponse(
        status=status,
        database=db_status,
        redis=redis_status,
        scheduler=scheduler_status,
    )
