"""Vendor-to-vendor relationships (e.g., subcontractors / fourth parties)."""

from __future__ import annotations

from datetime import datetime
from enum import Enum as PyEnum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, Integer, UniqueConstraint, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.vendor import Vendor


class VendorRelationshipType(str, PyEnum):
    subcontractor = "subcontractor"
    reseller = "reseller"
    parent_company = "parent_company"
    other = "other"


class VendorRelationship(Base):
    __tablename__ = "vendor_relationships"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vendor_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    related_vendor_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    relationship_type: Mapped[VendorRelationshipType] = mapped_column(
        SAEnum(
            VendorRelationshipType,
            name="vendor_relationship_type",
            native_enum=False,
            validate_strings=True,
        ),
        nullable=False,
        default=VendorRelationshipType.subcontractor,
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    vendor: Mapped["Vendor"] = relationship("Vendor", foreign_keys=[vendor_id], lazy="selectin")
    related_vendor: Mapped["Vendor"] = relationship("Vendor", foreign_keys=[related_vendor_id], lazy="selectin")

    __table_args__ = (
        UniqueConstraint("vendor_id", "related_vendor_id", name="uq_vendor_relationships_edge"),
        Index("ix_vendor_relationships_vendor_related", "vendor_id", "related_vendor_id"),
    )
