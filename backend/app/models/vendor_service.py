"""Services provided by a vendor and their business dependencies."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.department import Department
    from app.models.risk import Risk
    from app.models.vendor import Vendor
class VendorService(Base):
    __tablename__ = "vendor_services"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vendor_id: Mapped[int] = mapped_column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True)
    service_name: Mapped[str] = mapped_column(String(255), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    vendor: Mapped["Vendor"] = relationship("Vendor", back_populates="services", lazy="selectin")
    dependencies: Mapped[list["VendorDependency"]] = relationship(
        "VendorDependency",
        back_populates="vendor_service",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class VendorDependency(Base):
    __tablename__ = "vendor_dependencies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vendor_service_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("vendor_services.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    risk_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("risks.id"), nullable=True, index=True)
    department_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("departments.id"), nullable=True, index=True)
    supported_function_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    vendor_service: Mapped["VendorService"] = relationship("VendorService", back_populates="dependencies", lazy="selectin")
    risk: Mapped["Risk | None"] = relationship("Risk", lazy="selectin")
    department: Mapped["Department | None"] = relationship("Department", lazy="selectin")
