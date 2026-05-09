from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.db.session import get_db
from app.models import User
from app.schemas.admin import (
    ActiveSessionResponse,
    OutboxStatusResponse,
    SchedulerStatusResponse,
    SystemHealthResponse,
    SystemStatsResponse,
    TechnicalLogEntry,
)
from app.services._admin_telemetry.lifecycle import (
    build_outbox_status_snapshot,
    build_scheduler_status_snapshot,
    build_system_health_snapshot,
    build_system_stats_snapshot,
    revoke_admin_user_sessions,
)
from app.services._auth_session_workflow import (
    SessionWorkflowError,
    list_active_session_projections,
)
from app.services.transaction_boundary import commit_service_transaction

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


@router.get("/logs", response_model=list[TechnicalLogEntry])
async def get_technical_logs(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
    event_type: str | None = None,
    limit: int = 100,
) -> list[TechnicalLogEntry]:
    """
    Get technical/security logs from activity log.
    Admin only.
    """
    from sqlalchemy.orm import selectinload

    from app.models.activity_log import ActivityLog

    # Build query
    query = (
        select(ActivityLog)
        .options(selectinload(ActivityLog.actor))
        .order_by(ActivityLog.created_at.desc())
        .limit(min(limit, 500))
    )

    # Filter by event type if provided
    if event_type:
        query = query.where(ActivityLog.action == event_type)

    result = await db.execute(query)
    logs = result.scalars().all()

    return [
        TechnicalLogEntry(
            id=log.id,
            timestamp=log.created_at.isoformat(),
            level="INFO" if log.action not in ["failed_login", "error"] else "WARNING",
            event_type=log.action,
            user_name=log.actor.name if log.actor else None,
            user_email=log.actor.email if log.actor else None,
            entity_type=log.entity_type,
            description=log.description,
        )
        for log in logs
    ]


@router.get("/sessions", response_model=list[ActiveSessionResponse])
async def get_active_sessions(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
) -> list[ActiveSessionResponse]:
    """
    Get active refresh-token sessions (real server-side session view).
    Admin only.
    """
    return [
        ActiveSessionResponse(
            user_id=session.user_id,
            user_name=session.user_name,
            user_email=session.user_email,
            role=session.role,
            department=session.department,
            last_activity=session.last_activity.isoformat() if session.last_activity else "",
            is_active=True,
            last_login=session.last_login.isoformat() if session.last_login else None,
            active_sessions=session.active_sessions,
        )
        for session in await list_active_session_projections(db)
    ]


@router.post("/sessions/{user_id}/revoke")
async def revoke_user_session(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
) -> dict:
    """
    Force logout a user's active sessions.
    Admin only.
    """
    try:
        result = await revoke_admin_user_sessions(db, target_user_id=user_id, admin_user=admin_user)
    except SessionWorkflowError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    await commit_service_transaction(db)

    return {"status": "success", "message": f"Revoked {result.revoked_count} active sessions for {result.user_email}"}
