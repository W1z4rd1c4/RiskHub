from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models._vendor_link_mixin import AbstractVendorLink

if TYPE_CHECKING:
    from app.models.control import Control
    from app.models.vendor import Vendor


class VendorControlLink(AbstractVendorLink, Base):
    __tablename__ = "vendor_control_links"
    __table_args__ = (UniqueConstraint("vendor_id", "control_id", name="uq_vendor_control_link"),)

    control_id: Mapped[int] = mapped_column(ForeignKey("controls.id", ondelete="CASCADE"), index=True, nullable=False)

    vendor: Mapped["Vendor"] = relationship("Vendor", back_populates="control_links")
    control: Mapped["Control"] = relationship("Control", back_populates="vendor_links")
