from __future__ import annotations

from datetime import timedelta
from typing import cast

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.core.datetime_utils import coerce_utc, utc_now
from app.db.session import get_db
from app.models import Control, KeyRiskIndicator, OutboxEvent, Risk, User
from app.models.scheduler_job_run import SchedulerJobRun
from app.schemas.admin import (
    ActiveSessionResponse,
    OutboxEventFailureSummary,
    OutboxStatusResponse,
    SchedulerStatusResponse,
    SystemHealthResponse,
    SystemStatsResponse,
    TechnicalLogEntry,
)
from app.services._auth_session_workflow import (
    SessionWorkflowError,
    list_active_session_projections,
    revoke_user_sessions,
)
from app.services._admin_telemetry import serialize_scheduler_run

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
    import time

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

    now = utc_now()
    process_started_at = coerce_utc(getattr(request.app.state, "process_started_at", None)) or now
    uptime_seconds = max(0, int((now - process_started_at).total_seconds()))

    return SystemHealthResponse(
        database_status=db_status,
        database_latency_ms=round(latency_ms, 2),
        uptime_seconds=uptime_seconds,
        memory_usage_mb=round(memory_mb, 2),
        last_check=now.isoformat(),
    )


@router.get("/jobs/status", response_model=SchedulerStatusResponse)
async def get_scheduler_status(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
) -> SchedulerStatusResponse:
    """Get scheduler ownership state and the latest recorded job runs."""
    from app.core.scheduler import SCHEDULER_RUNTIME_JOB_NAME, get_scheduler_runtime_state

    runtime_state = get_scheduler_runtime_state()
    recent_runs = (
        (await db.execute(select(SchedulerJobRun).order_by(SchedulerJobRun.started_at.desc()).limit(200)))
        .scalars()
        .all()
    )

    latest_by_job: dict[str, SchedulerJobRunSummary] = {}
    running_jobs: list[SchedulerJobRunSummary] = []
    current_owner_instance_id: str | None = None

    for job_run in recent_runs:
        serialized = serialize_scheduler_run(job_run)
        if (
            job_run.job_name == SCHEDULER_RUNTIME_JOB_NAME
            and current_owner_instance_id is None
            and job_run.status == "running"
        ):
            current_owner_instance_id = job_run.instance_id
            continue
        if job_run.job_name == SCHEDULER_RUNTIME_JOB_NAME:
            continue
        if job_run.status == "running":
            running_jobs.append(serialized)
        if job_run.job_name not in latest_by_job:
            latest_by_job[job_run.job_name] = serialized

    if runtime_state["lock_acquired"]:
        current_owner_instance_id = str(runtime_state["instance_id"])

    return SchedulerStatusResponse(
        process_role=str(runtime_state["process_role"]),
        instance_id=str(runtime_state["instance_id"]),
        process_started_at=str(runtime_state["process_started_at"]),
        scheduler_enabled=bool(runtime_state["scheduler_enabled"]),
        scheduler_running=bool(runtime_state["scheduler_running"]),
        lock_provider=(str(runtime_state["lock_provider"]) if runtime_state["lock_provider"] else None),
        lock_acquired=bool(runtime_state["lock_acquired"]),
        current_owner_instance_id=current_owner_instance_id,
        latest_runs=list(latest_by_job.values()),
        running_jobs=running_jobs,
    )


@router.get("/outbox/status", response_model=OutboxStatusResponse)
async def get_outbox_status(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
) -> OutboxStatusResponse:
    """Get transactional outbox queue health and recent failure state."""
    from app.core.scheduler import get_outbox_dispatch_runtime_state

    pending_count = (
        await db.execute(select(func.count()).select_from(OutboxEvent).where(OutboxEvent.status == "pending"))
    ).scalar() or 0
    processing_count = (
        await db.execute(select(func.count()).select_from(OutboxEvent).where(OutboxEvent.status == "processing"))
    ).scalar() or 0
    dead_letter_count = (
        await db.execute(select(func.count()).select_from(OutboxEvent).where(OutboxEvent.status == "dead_letter"))
    ).scalar() or 0

    oldest_pending_created_at = (
        await db.execute(
            select(func.min(OutboxEvent.created_at)).where(OutboxEvent.status.in_(["pending", "processing"]))
        )
    ).scalar_one_or_none()
    oldest_pending_age_seconds = None
    if oldest_pending_created_at is not None:
        oldest_pending_age_seconds = max(
            0,
            int((utc_now() - (coerce_utc(oldest_pending_created_at) or oldest_pending_created_at)).total_seconds()),
        )

    recent_failures = (
        (
            await db.execute(
                select(OutboxEvent)
                .where((OutboxEvent.status == "dead_letter") | OutboxEvent.last_error.isnot(None))
                .order_by(OutboxEvent.created_at.desc())
                .limit(5)
            )
        )
        .scalars()
        .all()
    )

    dispatch_state = get_outbox_dispatch_runtime_state()
    return OutboxStatusResponse(
        pending_count=pending_count,
        processing_count=processing_count,
        dead_letter_count=dead_letter_count,
        oldest_pending_age_seconds=oldest_pending_age_seconds,
        last_dispatch_started_at=cast(str | None, dispatch_state["last_started_at"]),
        last_dispatch_finished_at=cast(str | None, dispatch_state["last_finished_at"]),
        last_dispatch_status=cast(str | None, dispatch_state["last_status"]),
        last_dispatch_processed=cast(int | None, dispatch_state["last_processed"]),
        last_dispatch_error=cast(str | None, dispatch_state["last_error"]),
        recent_failures=[
            OutboxEventFailureSummary(
                id=event.id,
                event_type=event.event_type,
                status=event.status,
                attempt_count=event.attempt_count,
                available_at=event.available_at.isoformat(),
                created_at=event.created_at.isoformat(),
                locked_by=event.locked_by,
                last_error=event.last_error,
            )
            for event in recent_failures
        ],
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
    from app.models import ApprovalRequest

    # Total users
    total_users = (
        await db.execute(select(func.count()).select_from(User).where(User.is_active.is_(True)))
    ).scalar() or 0

    # Active users in last 24h (approximation based on activity logs)
    from app.models.activity_log import ActivityLog

    # Timezone-aware datetime works for both PostgreSQL and SQLite via SQLAlchemy
    yesterday = utc_now() - timedelta(hours=24)
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
        result = await revoke_user_sessions(db, target_user_id=user_id, admin_user=admin_user)
    except SessionWorkflowError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    await db.commit()

    return {"status": "success", "message": f"Revoked {result.revoked_count} active sessions for {result.user.email}"}
