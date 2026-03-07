"""Persistence model for scheduler runtime and job execution visibility."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import JSON, DateTime, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.datetime_utils import utc_now
from app.db.base import Base


class SchedulerJobRun(Base):
    """Tracks scheduler runtime ownership and individual scheduled job executions."""

    __tablename__ = "scheduler_job_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    job_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    run_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    trigger_type: Mapped[str] = mapped_column(String(20), nullable=False, default="scheduled")
    instance_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    result_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_scheduler_job_runs_job_started", "job_name", "started_at"),
        Index("ix_scheduler_job_runs_status_started", "status", "started_at"),
    )
