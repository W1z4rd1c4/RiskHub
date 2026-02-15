from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.control import Control
    from app.models.vendor import Vendor
class VendorControlLink(Base):
    __tablename__ = "vendor_control_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id"), index=True, nullable=False)
    control_id: Mapped[int] = mapped_column(ForeignKey("controls.id"), index=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    vendor: Mapped["Vendor"] = relationship("Vendor", back_populates="control_links")
    control: Mapped["Control"] = relationship("Control")

    __table_args__ = (
        UniqueConstraint("vendor_id", "control_id", name="uq_vendor_control_link"),
    )
