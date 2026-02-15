"""Vendor remediation actions for monitoring/incident follow-up."""

from __future__ import annotations

from datetime import datetime
from enum import Enum as PyEnum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.vendor import Vendor
    from app.models.vendor_incident import VendorIncident


class VendorRemediationStatus(str, PyEnum):
    open = "open"
    in_progress = "in_progress"
    done = "done"


class VendorRemediationAction(Base):
    __tablename__ = "vendor_remediation_actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vendor_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    incident_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("vendor_incidents.id", ondelete="SET NULL"), nullable=True, index=True
    )

    owner_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    status: Mapped[VendorRemediationStatus] = mapped_column(
        SAEnum(
            VendorRemediationStatus,
            name="vendor_remediation_status",
            native_enum=False,
            validate_strings=True,
        ),
        nullable=False,
        default=VendorRemediationStatus.open,
    )
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    vendor: Mapped["Vendor"] = relationship("Vendor", back_populates="remediation_actions", lazy="selectin")
    incident: Mapped["VendorIncident | None"] = relationship("VendorIncident", lazy="selectin")
    owner: Mapped["User | None"] = relationship("User", foreign_keys=[owner_user_id], lazy="selectin")
