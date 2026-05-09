from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.db.session import get_db
from app.models import User
from app.schemas.admin import (
    OutboxStatusResponse,
    SchedulerStatusResponse,
    SystemHealthResponse,
    SystemStatsResponse,
)
from app.services._admin_telemetry.lifecycle import (
    build_outbox_status_snapshot,
    build_scheduler_status_snapshot,
    build_system_health_snapshot,
    build_system_stats_snapshot,
)

from ._deps import require_platform_admin

router = APIRouter()


@router.get("/health", response_model=SystemHealthResponse)
async def get_system_health(
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
) -> SystemHealthResponse:
    """
    Get system health status including database connectivity and latency.
    Admin only.
    """
    return (await build_system_health_snapshot(request, db)).response


@router.get("/jobs/status", response_model=SchedulerStatusResponse)
async def get_scheduler_status(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
) -> SchedulerStatusResponse:
    """Get scheduler ownership state and the latest recorded job runs."""
    return (await build_scheduler_status_snapshot(db)).response


@router.get("/outbox/status", response_model=OutboxStatusResponse)
async def get_outbox_status(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
) -> OutboxStatusResponse:
    """Get transactional outbox queue health and recent failure state."""
    return (await build_outbox_status_snapshot(db)).response


@router.get("/stats", response_model=SystemStatsResponse)
async def get_system_stats(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
) -> SystemStatsResponse:
    """
    Get platform statistics including user counts and entity totals.
    Admin only.
    """
    return (await build_system_stats_snapshot(db)).response
