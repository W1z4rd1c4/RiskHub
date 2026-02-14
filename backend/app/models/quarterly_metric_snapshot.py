"""
Quarterly Metric Snapshot model for storing historical quarter-end snapshots.

This enables accurate quarter-over-quarter comparisons for metrics that
represent point-in-time state rather than period-based events.
"""
import enum

from sqlalchemy import JSON, Column, DateTime, Index, Integer, String
from sqlalchemy import Enum as SQLAEnum
from sqlalchemy.sql import func

from app.db.base import Base


class SnapshotType(str, enum.Enum):
    """Type of metric snapshot."""
    QUARTER_END = "quarter_end"
    MANUAL = "manual"


class QuarterlyMetricSnapshot(Base):
    """
    Stores quarterly metric snapshots for accurate historical comparisons.

    These snapshots capture the state of various metrics at quarter boundaries,
    enabling truthful quarter-over-quarter comparisons for the Risk Committee.
    """
    __tablename__ = "quarterly_metric_snapshots"

    id = Column(Integer, primary_key=True, index=True)

    # Quarter identifier (e.g., "2026-Q1")
    quarter = Column(String(10), nullable=False, index=True)

    # Year and quarter number for easier queries
    year = Column(Integer, nullable=False)
    quarter_number = Column(Integer, nullable=False)  # 1-4

    # Snapshot type (quarter_end or manual)
    snapshot_type = Column(SQLAEnum(SnapshotType), default=SnapshotType.QUARTER_END, nullable=False)

    # Timestamp when snapshot was captured
    captured_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Department scope (null = global, otherwise specific department)
    department_id = Column(Integer, nullable=True, index=True)

    # All metric values as JSON for flexibility
    # Structure: { "metric_name": value, ... }
    metrics = Column(JSON, nullable=False)

    # Additional metadata
    captured_by_user_id = Column(Integer, nullable=True)  # User who triggered manual capture
    notes = Column(String(500), nullable=True)  # Optional notes for manual snapshots

    __table_args__ = (
        # Unique constraint: one snapshot per quarter per department (or global)
        Index('ix_quarterly_snapshot_unique', 'quarter', 'department_id', unique=True),
        # Composite index for efficient quarter lookups
        Index('ix_quarterly_snapshot_year_quarter', 'year', 'quarter_number'),
    )

    def __repr__(self):
        dept = f" (dept={self.department_id})" if self.department_id else " (global)"
        return f"<QuarterlyMetricSnapshot {self.quarter}{dept}>"
