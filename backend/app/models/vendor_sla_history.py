"""Historized Vendor SLA values (KRI-like time series)."""

from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.vendor_sla import VendorSLA
class VendorSLAValueHistory(Base):
    __tablename__ = "vendor_sla_value_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sla_id: Mapped[int] = mapped_column(Integer, ForeignKey("vendor_slas.id", ondelete="CASCADE"), nullable=False, index=True)

    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)

    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    recorded_by_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)

    value: Mapped[float] = mapped_column(Float, nullable=False)
    lower_limit: Mapped[float] = mapped_column(Float, nullable=False)
    upper_limit: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(50), nullable=False)
    breach_status: Mapped[str] = mapped_column(String(20), nullable=False)

    sla: Mapped["VendorSLA"] = relationship("VendorSLA", back_populates="history_entries", lazy="selectin")
