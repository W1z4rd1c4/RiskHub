from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models._vendor_link_mixin import AbstractVendorLink

if TYPE_CHECKING:
    from app.models.risk import Risk
    from app.models.vendor import Vendor


class VendorRiskLink(AbstractVendorLink, Base):
    __tablename__ = "vendor_risk_links"
    __table_args__ = (UniqueConstraint("vendor_id", "risk_id", name="uq_vendor_risk_link"),)

    risk_id: Mapped[int] = mapped_column(ForeignKey("risks.id", ondelete="CASCADE"), index=True, nullable=False)

    vendor: Mapped["Vendor"] = relationship("Vendor", back_populates="risk_links")
    risk: Mapped["Risk"] = relationship("Risk", back_populates="vendor_links")
