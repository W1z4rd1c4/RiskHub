from __future__ import annotations

from datetime import datetime
from typing import Protocol

from app.schemas.admin import SchedulerJobRunSummary


class SchedulerRunProjection(Protocol):
    job_name: str
    run_id: str
    status: str
    trigger_type: str
    instance_id: str
    scheduled_for: datetime | None
    started_at: datetime
    finished_at: datetime | None
    duration_ms: int | None
    result_json: dict | None
    error_message: str | None


def serialize_scheduler_run(job_run: SchedulerRunProjection) -> SchedulerJobRunSummary:
    return SchedulerJobRunSummary(
        job_name=job_run.job_name,
        run_id=job_run.run_id,
        status=job_run.status,
        trigger_type=job_run.trigger_type,
        instance_id=job_run.instance_id,
        scheduled_for=job_run.scheduled_for.isoformat() if job_run.scheduled_for else None,
        started_at=job_run.started_at.isoformat(),
        finished_at=job_run.finished_at.isoformat() if job_run.finished_at else None,
        duration_ms=job_run.duration_ms,
        result_json=job_run.result_json,
        error_message=job_run.error_message,
    )
