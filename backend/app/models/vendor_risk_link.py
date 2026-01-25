from __future__ import annotations

from datetime import datetime

from sqlalchemy import Integer, ForeignKey, DateTime, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class VendorRiskLink(Base):
    __tablename__ = "vendor_risk_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id"), index=True, nullable=False)
    risk_id: Mapped[int] = mapped_column(ForeignKey("risks.id"), index=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    vendor: Mapped["Vendor"] = relationship("Vendor", back_populates="risk_links")
    risk: Mapped["Risk"] = relationship("Risk")

    __table_args__ = (
        UniqueConstraint("vendor_id", "risk_id", name="uq_vendor_risk_link"),
    )


from app.models.vendor import Vendor
from app.models.risk import Risk

