"""Vendor monitoring incidents (security/operational/regulatory/contract breaches)."""

from __future__ import annotations

from datetime import datetime
from enum import Enum as PyEnum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.vendor import Vendor
class VendorIncidentType(str, PyEnum):
    security = "security"
    operational = "operational"
    regulatory_breach = "regulatory_breach"
    contract_breach = "contract_breach"
    other = "other"


class VendorIncidentSeverity(str, PyEnum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class VendorIncident(Base):
    __tablename__ = "vendor_incidents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vendor_id: Mapped[int] = mapped_column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True)

    incident_type: Mapped[VendorIncidentType] = mapped_column(
        SAEnum(
            VendorIncidentType,
            name="vendor_incident_type",
            native_enum=False,
            validate_strings=True,
        ),
        nullable=False,
    )
    severity: Mapped[VendorIncidentSeverity] = mapped_column(
        SAEnum(
            VendorIncidentSeverity,
            name="vendor_incident_severity",
            native_enum=False,
            validate_strings=True,
        ),
        nullable=False,
        default=VendorIncidentSeverity.medium,
    )
    is_major: Mapped[bool] = mapped_column(Boolean, default=False)

    occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    detected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    summary: Mapped[str] = mapped_column(String(500), nullable=False)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    vendor: Mapped["Vendor"] = relationship("Vendor", back_populates="incidents", lazy="selectin")

    __table_args__ = (
        Index("ix_vendor_incidents_vendor_major", "vendor_id", "is_major"),
    )
