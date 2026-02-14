"""Vendor contingency/BCP plan for vendor outage risk."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.vendor_exit_plan import VendorPlanStatus

if TYPE_CHECKING:
    from app.models.vendor import Vendor
class VendorContingencyPlan(Base):
    __tablename__ = "vendor_contingency_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vendor_id: Mapped[int] = mapped_column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)

    max_tolerable_outage_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)

    impact_confidentiality: Mapped[bool] = mapped_column(Boolean, default=False)
    impact_integrity: Mapped[bool] = mapped_column(Boolean, default=False)
    impact_authenticity: Mapped[bool] = mapped_column(Boolean, default=False)
    impact_availability: Mapped[bool] = mapped_column(Boolean, default=False)

    status: Mapped[VendorPlanStatus] = mapped_column(
        SAEnum(
            VendorPlanStatus,
            name="vendor_contingency_plan_status",
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

    vendor: Mapped["Vendor"] = relationship("Vendor", back_populates="contingency_plan", lazy="selectin")

    __table_args__ = (UniqueConstraint("vendor_id", name="uq_vendor_contingency_plans_vendor_id"),)
