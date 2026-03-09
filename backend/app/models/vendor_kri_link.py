from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.key_risk_indicator import KeyRiskIndicator
    from app.models.vendor import Vendor


class VendorKRILink(Base):
    __tablename__ = "vendor_kri_links"
    __table_args__ = (UniqueConstraint("vendor_id", "kri_id", name="uq_vendor_kri_link"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id", ondelete="CASCADE"), index=True)
    kri_id: Mapped[int] = mapped_column(ForeignKey("key_risk_indicators.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    vendor: Mapped["Vendor"] = relationship("Vendor", back_populates="kri_links")
    kri: Mapped["KeyRiskIndicator"] = relationship("KeyRiskIndicator", back_populates="vendor_links")
