"""External vendor monitoring signals stored over time (Phase 18-10)."""

from __future__ import annotations

from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class VendorExternalSignalStatus(str, PyEnum):
    ok = "ok"
    error = "error"


class VendorExternalSignal(Base):
    __tablename__ = "vendor_external_signals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vendor_id: Mapped[int] = mapped_column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True)

    provider_key: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    signal_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)

    payload_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[VendorExternalSignalStatus] = mapped_column(
        SAEnum(
            VendorExternalSignalStatus,
            name="vendor_external_signal_status",
            native_enum=False,
            validate_strings=True,
        ),
        nullable=False,
        default=VendorExternalSignalStatus.ok,
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    vendor: Mapped["Vendor"] = relationship("Vendor", lazy="selectin")

    __table_args__ = (
        Index("ix_vendor_external_signals_vendor_provider_fetched", "vendor_id", "provider_key", "fetched_at"),
    )


from app.models.vendor import Vendor

