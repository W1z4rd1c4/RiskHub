"""
KRI Value History model for tracking historical KRI values over periods.

Stores snapshots of KRI measurements with period boundaries for
time-series analysis and historical reporting.
"""
from datetime import date, datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Date, DateTime, Float, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.key_risk_indicator import KeyRiskIndicator
    from app.models.user import User
class KRIValueHistory(Base):
    """
    Historical record of KRI value measurements.

    Each entry captures a KRI value snapshot for a specific reporting period,
    along with the limits and breach status at the time of recording.
    """
    __tablename__ = "kri_value_history"

    id: Mapped[int] = mapped_column(primary_key=True)

    # FK to the parent KRI
    kri_id: Mapped[int] = mapped_column(ForeignKey("key_risk_indicators.id", ondelete="CASCADE"), index=True)

    # Period boundaries
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)

    # When this value was recorded
    recorded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Who recorded this value (nullable for system-generated or backfilled entries)
    recorded_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)

    # Value snapshot at time of recording
    value: Mapped[float] = mapped_column(Float)
    lower_limit: Mapped[float] = mapped_column(Float)
    upper_limit: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(50), default="%")

    # Breach status at time of recording (above, below, within)
    breach_status: Mapped[str] = mapped_column(String(10))

    # Relationships
    kri: Mapped["KeyRiskIndicator"] = relationship("KeyRiskIndicator", back_populates="history_entries")
    recorded_by: Mapped[Optional["User"]] = relationship("User")

    # Indexes for efficient time-series queries
    __table_args__ = (
        Index("ix_kri_value_history_kri_period_end", "kri_id", "period_end"),
        Index("ix_kri_value_history_kri_recorded_at", "kri_id", "recorded_at"),
    )
