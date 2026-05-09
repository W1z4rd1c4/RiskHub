from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models._vendor_link_mixin import AbstractVendorLink

if TYPE_CHECKING:
    from app.models.key_risk_indicator import KeyRiskIndicator
    from app.models.vendor import Vendor


class VendorKRILink(AbstractVendorLink, Base):
    __tablename__ = "vendor_kri_links"
    __table_args__ = (UniqueConstraint("vendor_id", "kri_id", name="uq_vendor_kri_link"),)

    kri_id: Mapped[int] = mapped_column(ForeignKey("key_risk_indicators.id", ondelete="CASCADE"), index=True)

    vendor: Mapped["Vendor"] = relationship("Vendor", back_populates="kri_links")
    kri: Mapped["KeyRiskIndicator"] = relationship("KeyRiskIndicator", back_populates="vendor_links")
