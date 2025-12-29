"""Directory sync log model for tracking emulator sync runs."""
from enum import Enum as PyEnum
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, Enum as SQLEnum, func, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DirectorySyncStatus(str, PyEnum):
    """Status of a directory sync run."""
    success = "success"
    partial = "partial"
    failed = "failed"


class DirectorySyncLog(Base):
    """Tracks each sync execution with counts and errors."""
    __tablename__ = "directory_sync_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[DirectorySyncStatus] = mapped_column(
        SQLEnum(DirectorySyncStatus, name="directory_sync_status", create_constraint=True),
        default=DirectorySyncStatus.success,
        nullable=False,
    )

    created_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    updated_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    deactivated_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    errors: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
