from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models import Control, KeyRiskIndicator, RefreshToken, Risk, User
from app.schemas.admin import ActiveSessionResponse, SystemHealthResponse, SystemStatsResponse, TechnicalLogEntry

from ._deps import require_platform_admin

router = APIRouter()


@router.get("/health", response_model=SystemHealthResponse)
async def get_system_health(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
) -> SystemHealthResponse:
    """
    Get system health status including database connectivity and latency.
    Admin only.
    """
    import time
    from datetime import UTC, datetime

    import psutil

    # Measure database latency
    start = time.perf_counter()
    try:
        await db.execute(select(func.count()).select_from(User))
        db_status = "connected"
    except Exception:
        db_status = "error"
    latency_ms = (time.perf_counter() - start) * 1000

    # Get memory usage
    process = psutil.Process()
    memory_mb = process.memory_info().rss / 1024 / 1024

    # Calculate uptime (approximation - time since first user login today)
    uptime_seconds = int(time.time() % 86400)  # Simplified - seconds since midnight

    return SystemHealthResponse(
        database_status=db_status,
        database_latency_ms=round(latency_ms, 2),
        uptime_seconds=uptime_seconds,
        memory_usage_mb=round(memory_mb, 2),
        last_check=datetime.now(UTC).isoformat(),
    )


@router.get("/stats", response_model=SystemStatsResponse)
async def get_system_stats(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
) -> SystemStatsResponse:
    """
    Get platform statistics including user counts and entity totals.
    Admin only.
    """
    from datetime import UTC, datetime, timedelta

    from app.models import ApprovalRequest

    # Total users
    total_users = (
        await db.execute(select(func.count()).select_from(User).where(User.is_active.is_(True)))
    ).scalar() or 0

    # Active users in last 24h (approximation based on activity logs)
    from app.models.activity_log import ActivityLog

    # Timezone-aware datetime works for both PostgreSQL and SQLite via SQLAlchemy
    yesterday = datetime.now(UTC) - timedelta(hours=24)
    active_users_result = await db.execute(
        select(func.count(func.distinct(ActivityLog.actor_id))).where(ActivityLog.created_at >= yesterday)
    )
    active_users_24h = active_users_result.scalar() or 0

    # Entity totals
    total_risks = (await db.execute(select(func.count()).select_from(Risk))).scalar() or 0
    total_controls = (await db.execute(select(func.count()).select_from(Control))).scalar() or 0
    total_kris = (await db.execute(select(func.count()).select_from(KeyRiskIndicator))).scalar() or 0

    # Pending approvals - use enum values, not string literals
    from app.models.approval_request import ApprovalStatus

    pending_count = (
        await db.execute(
            select(func.count())
            .select_from(ApprovalRequest)
            .where(ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]))
        )
    ).scalar() or 0

    return SystemStatsResponse(
        total_users=total_users,
        active_users_24h=active_users_24h,
        total_risks=total_risks,
        total_controls=total_controls,
        total_kris=total_kris,
        pending_approvals=pending_count,
    )


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
    from app.core.datetime_utils import utc_now

    now = utc_now()
    session_subquery = (
        select(
            RefreshToken.user_id.label("user_id"),
            func.count(RefreshToken.id).label("active_sessions"),
            func.max(func.coalesce(RefreshToken.last_used_at, RefreshToken.issued_at)).label("last_activity"),
            func.max(RefreshToken.issued_at).label("last_login"),
        )
        .where(RefreshToken.revoked_at.is_(None))
        .where(RefreshToken.expires_at > now)
        .group_by(RefreshToken.user_id)
        .subquery()
    )

    query = (
        select(
            User,
            session_subquery.c.active_sessions,
            session_subquery.c.last_activity,
            session_subquery.c.last_login,
        )
        .join(session_subquery, User.id == session_subquery.c.user_id)
        .options(selectinload(User.role), selectinload(User.department))
        .order_by(session_subquery.c.last_activity.desc())
    )

    result = await db.execute(query)
    rows = result.all()

    return [
        ActiveSessionResponse(
            user_id=user.id,
            user_name=user.name,
            user_email=user.email,
            role=user.role.display_name if user.role else "Unknown",
            department=user.department.name if user.department else None,
            last_activity=last_activity.isoformat() if last_activity else "",
            is_active=bool(user.is_active and active_sessions),
            last_login=last_login.isoformat() if last_login else None,
            active_sessions=int(active_sessions or 0),
        )
        for user, active_sessions, last_activity, last_login in rows
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
    if user_id == admin_user.id:
        raise HTTPException(status_code=400, detail="Cannot revoke your own session")

    # Get user
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Revoke all active refresh sessions and bump token version for immediate JWT invalidation.
    now = datetime.now(UTC)
    revoked_rows = await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id)
        .where(RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now, revoked_reason=f"admin_revoke:{admin_user.id}")
    )
    revoked_count = int(revoked_rows.rowcount or 0)
    user.token_version += 1
    db.add(user)

    from app.core.activity_logger import log_activity
    from app.models.activity_log import ActivityAction, ActivityEntityType

    await log_activity(
        db=db,
        actor=admin_user,
        action=ActivityAction.UPDATE,
        entity_type=ActivityEntityType.USER,
        entity_id=user_id,
        entity_name=user.name,
        description=f"Sessions revoked for user {user.email} by admin (count={revoked_count})",
    )
    await db.commit()

    return {"status": "success", "message": f"Revoked {revoked_count} active sessions for {user.email}"}
