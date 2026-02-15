"""Vendor SLA monitoring (KRI-like thresholds and reporting cadence)."""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum as PyEnum
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.vendor import Vendor
    from app.models.vendor_sla_history import VendorSLAValueHistory


class VendorSLAFrequency(str, PyEnum):
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"
    quarterly = "quarterly"
    annually = "annually"


class VendorSLA(Base):
    __tablename__ = "vendor_slas"

    id: Mapped[int] = mapped_column(primary_key=True)

    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id"), index=True)

    metric_name: Mapped[str] = mapped_column(String(500))
    description: Mapped[str] = mapped_column(Text)
    current_value: Mapped[float] = mapped_column(Float)
    lower_limit: Mapped[float] = mapped_column(Float)
    upper_limit: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(50), default="%")
    frequency: Mapped[str] = mapped_column(String(20), default=VendorSLAFrequency.monthly.value)

    reporting_owner_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)

    last_period_end: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    last_reported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", index=True)
    archived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    vendor: Mapped["Vendor"] = relationship("Vendor", back_populates="slas", lazy="selectin")
    reporting_owner: Mapped[Optional["User"]] = relationship("User", foreign_keys=[reporting_owner_id], lazy="selectin")
    archived_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[archived_by_id], lazy="selectin")
    history_entries: Mapped[list["VendorSLAValueHistory"]] = relationship(
        "VendorSLAValueHistory",
        back_populates="sla",
        cascade="all, delete-orphan",
        order_by="desc(VendorSLAValueHistory.recorded_at)",
    )

    @property
    def breach_status(self) -> str:
        if self.current_value < self.lower_limit:
            return "below"
        if self.current_value > self.upper_limit:
            return "above"
        return "within"
