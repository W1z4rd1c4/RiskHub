from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import cast

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.core.datetime_utils import coerce_utc, utc_now
from app.models import Control, KeyRiskIndicator, OutboxEvent, Risk, User
from app.models.scheduler_job_run import SchedulerJobRun
from app.schemas.admin import (
    OutboxEventFailureSummary,
    OutboxStatusResponse,
    SchedulerJobRunSummary,
    SchedulerStatusResponse,
    SystemHealthResponse,
    SystemStatsResponse,
)
from app.services._admin_telemetry.projections import serialize_scheduler_run
from app.services._auth_session_workflow import revoke_user_sessions


@dataclass(frozen=True)
class SystemHealthSnapshot:
    response: SystemHealthResponse


@dataclass(frozen=True)
class SchedulerStatusSnapshot:
    response: SchedulerStatusResponse


@dataclass(frozen=True)
class OutboxStatusSnapshot:
    response: OutboxStatusResponse


@dataclass(frozen=True)
class SystemStatsSnapshot:
    response: SystemStatsResponse


@dataclass(frozen=True)
class AdminOperationOutcome:
    revoked_count: int
    user_email: str


async def build_system_health_snapshot(request: Request, db: AsyncSession) -> SystemHealthSnapshot:
    import time

    import psutil

    start = time.perf_counter()
    try:
        await db.execute(select(func.count()).select_from(User))
        db_status = "connected"
    except Exception:
        db_status = "error"
    latency_ms = (time.perf_counter() - start) * 1000

    process = psutil.Process()
    memory_mb = process.memory_info().rss / 1024 / 1024

    now = utc_now()
    process_started_at = coerce_utc(getattr(request.app.state, "process_started_at", None)) or now
    uptime_seconds = max(0, int((now - process_started_at).total_seconds()))

    return SystemHealthSnapshot(
        response=SystemHealthResponse(
            database_status=db_status,
            database_latency_ms=round(latency_ms, 2),
            uptime_seconds=uptime_seconds,
            memory_usage_mb=round(memory_mb, 2),
            last_check=now.isoformat(),
        )
    )


async def build_scheduler_status_snapshot(db: AsyncSession) -> SchedulerStatusSnapshot:
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

    return SchedulerStatusSnapshot(
        response=SchedulerStatusResponse(
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
    )


async def build_outbox_status_snapshot(db: AsyncSession) -> OutboxStatusSnapshot:
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
    return OutboxStatusSnapshot(
        response=OutboxStatusResponse(
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
    )


async def build_system_stats_snapshot(db: AsyncSession) -> SystemStatsSnapshot:
    from app.models import ApprovalRequest
    from app.models.activity_log import ActivityLog
    from app.models.approval_request import ApprovalStatus

    total_users = (
        await db.execute(select(func.count()).select_from(User).where(User.is_active.is_(True)))
    ).scalar() or 0

    yesterday = utc_now() - timedelta(hours=24)
    active_users_result = await db.execute(
        select(func.count(func.distinct(ActivityLog.actor_id))).where(ActivityLog.created_at >= yesterday)
    )
    active_users_24h = active_users_result.scalar() or 0

    total_risks = (await db.execute(select(func.count()).select_from(Risk))).scalar() or 0
    total_controls = (await db.execute(select(func.count()).select_from(Control))).scalar() or 0
    total_kris = (await db.execute(select(func.count()).select_from(KeyRiskIndicator))).scalar() or 0

    pending_count = (
        await db.execute(
            select(func.count())
            .select_from(ApprovalRequest)
            .where(ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]))
        )
    ).scalar() or 0

    return SystemStatsSnapshot(
        response=SystemStatsResponse(
            total_users=total_users,
            active_users_24h=active_users_24h,
            total_risks=total_risks,
            total_controls=total_controls,
            total_kris=total_kris,
            pending_approvals=pending_count,
        )
    )


async def revoke_admin_user_sessions(
    db: AsyncSession,
    *,
    target_user_id: int,
    admin_user: User,
) -> AdminOperationOutcome:
    result = await revoke_user_sessions(db, target_user_id=target_user_id, admin_user=admin_user)
    return AdminOperationOutcome(revoked_count=result.revoked_count, user_email=result.user.email)
