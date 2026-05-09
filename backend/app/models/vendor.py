from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum as PyEnum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models._archivable import ArchivableMixin

if TYPE_CHECKING:
    from app.models.department import Department
    from app.models.user import User
    from app.models.vendor_control_link import VendorControlLink
    from app.models.vendor_kri_link import VendorKRILink
    from app.models.vendor_risk_link import VendorRiskLink


class VendorStatus(str, PyEnum):
    active = "active"


class VendorType(str, PyEnum):
    ict = "ict"
    outsourcing = "outsourcing"
    professional_services = "professional_services"
    partner = "partner"
    other = "other"


class VendorReplaceability(str, PyEnum):
    easy = "easy"
    medium = "medium"
    hard = "hard"


class Vendor(ArchivableMixin, Base):
    __tablename__ = "vendors"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Identity
    name: Mapped[str] = mapped_column(String(255), index=True)
    legal_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    registration_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    country: Mapped[str | None] = mapped_column(String(2), nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Structure (mirrors Risk semantics)
    process: Mapped[str] = mapped_column(String(255), index=True)
    subprocess: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True, index=True)
    department: Mapped["Department"] = relationship("Department", back_populates="vendors")

    # Ownership/governance
    outsourcing_owner_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    outsourcing_owner: Mapped["User"] = relationship(
        "User",
        foreign_keys=[outsourcing_owner_user_id],
        back_populates="owned_vendors",
    )

    # Classification
    vendor_type: Mapped[str] = mapped_column(String(50), default=VendorType.other.value, index=True)
    risk_score_1_5: Mapped[int] = mapped_column(Integer, default=3)
    supports_important_core_insurance_function: Mapped[bool] = mapped_column(Boolean, default=False)
    dora_relevant: Mapped[bool] = mapped_column(Boolean, default=False)
    is_significant_vendor: Mapped[bool] = mapped_column(Boolean, default=False)
    materiality_assessed_max_impact_pct_own_funds: Mapped[Decimal | None] = mapped_column(
        Numeric(6, 2),
        nullable=True,
        comment="Evidence input for materiality (percent of own funds, if assessed).",
    )
    replaceability: Mapped[str | None] = mapped_column(String(20), nullable=True)
    has_alternative_providers: Mapped[bool] = mapped_column(Boolean, default=False)

    # Lifecycle
    status: Mapped[str] = mapped_column(String(20), default=VendorStatus.active.value, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    risk_links: Mapped[list["VendorRiskLink"]] = relationship(
        "VendorRiskLink",
        back_populates="vendor",
        cascade="all, delete-orphan",
    )
    control_links: Mapped[list["VendorControlLink"]] = relationship(
        "VendorControlLink",
        back_populates="vendor",
        cascade="all, delete-orphan",
    )
    kri_links: Mapped[list["VendorKRILink"]] = relationship(
        "VendorKRILink",
        back_populates="vendor",
        cascade="all, delete-orphan",
    )
