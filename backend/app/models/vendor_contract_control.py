"""Vendor contract controls (clause checklist) for ICT outsourcing governance."""

from __future__ import annotations

from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class VendorContractControlStatus(str, PyEnum):
    met = "met"
    partial = "partial"
    missing = "missing"
    n_a = "n_a"


class VendorContractControl(Base):
    __tablename__ = "vendor_contract_controls"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vendor_id: Mapped[int] = mapped_column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True)

    control_key: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    status: Mapped[VendorContractControlStatus] = mapped_column(
        SAEnum(
            VendorContractControlStatus,
            name="vendor_contract_control_status",
            native_enum=False,
            validate_strings=True,
        ),
        nullable=False,
        default=VendorContractControlStatus.missing,
    )

    evidence_reference: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    vendor: Mapped["Vendor"] = relationship("Vendor", back_populates="contract_controls", lazy="selectin")
    reviewed_by_user: Mapped["User | None"] = relationship("User", foreign_keys=[reviewed_by_user_id], lazy="selectin")

    __table_args__ = (
        UniqueConstraint("vendor_id", "control_key", name="uq_vendor_contract_controls_vendor_key"),
        Index("ix_vendor_contract_controls_vendor_key", "vendor_id", "control_key"),
    )


from app.models.user import User
from app.models.vendor import Vendor
