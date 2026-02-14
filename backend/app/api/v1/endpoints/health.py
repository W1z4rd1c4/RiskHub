"""Health check endpoint for monitoring and Docker health checks."""

import time
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_db

router = APIRouter()

# Track application startup time
_startup_time = time.time()


class HealthResponse(BaseModel):
    """Health check response model."""
    status: str
    version: str
    service: str
    database: str
    uptime_seconds: float
    started_at: str


@router.get("/health", response_model=HealthResponse)
async def health_check(db: AsyncSession = Depends(get_db)):
    """
    Health check endpoint for Docker health checks and monitoring.

    Returns:
        - status: 'healthy' if all systems operational
        - version: Application version
        - service: Service name
        - database: Database connectivity status ('connected' or 'disconnected')
        - uptime_seconds: Time since application started
        - started_at: ISO timestamp of when the application started
    """
    settings = get_settings()

    # Calculate uptime
    uptime = time.time() - _startup_time
    started_at = datetime.fromtimestamp(_startup_time).isoformat()

    # Check database connectivity
    try:
        await db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception:
        db_status = "disconnected"

    # Overall status based on database connection
    status = "healthy" if db_status == "connected" else "degraded"

    return HealthResponse(
        status=status,
        version=settings.app_version,
        service=settings.app_name,
        database=db_status,
        uptime_seconds=round(uptime, 2),
        started_at=started_at
    )
