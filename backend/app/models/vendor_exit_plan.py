"""Vendor exit plan (exit strategy artifact) for critical/important vendors."""

from __future__ import annotations

from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class VendorPlanStatus(str, PyEnum):
    not_started = "not_started"
    in_progress = "in_progress"
    complete = "complete"


class VendorExitPlan(Base):
    __tablename__ = "vendor_exit_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vendor_id: Mapped[int] = mapped_column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)

    status: Mapped[VendorPlanStatus] = mapped_column(
        SAEnum(
            VendorPlanStatus,
            name="vendor_exit_plan_status",
            native_enum=False,
            validate_strings=True,
        ),
        nullable=False,
        default=VendorPlanStatus.not_started,
    )

    plan_reference: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_tested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    vendor: Mapped["Vendor"] = relationship("Vendor", back_populates="exit_plan", lazy="selectin")

    __table_args__ = (UniqueConstraint("vendor_id", name="uq_vendor_exit_plans_vendor_id"),)


from app.models.vendor import Vendor

