from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models._archivable import ArchivableMixin

if TYPE_CHECKING:
    from app.models.department import Department
    from app.models.user import User


class Process(ArchivableMixin, Base):
    """ICT Register Process — a business function in the L0/L1/L2 hierarchy.

    Carries the workbook's entered 03_Procesy fields only (functional spec
    section 1.1). Derived values (score, Criticality class, CIF, gap checks,
    next review, counts, completeness) are computed on read by the derivation
    engine (ticket #48) and never persisted.
    """

    __tablename__ = "processes"

    id: Mapped[int] = mapped_column(primary_key=True)

    # RoI function identifier (B_06.01): server-assigned at creation, stable,
    # never reassigned. The archive sequence never frees a code.
    f_code: Mapped[str] = mapped_column(String(20), unique=True, index=True)

    # A·IDENTIFIKACE — the L0/L1/L2 hierarchy carried as fields (no tree).
    l0_area: Mapped[str] = mapped_column(String(255), index=True)
    l1_process: Mapped[str] = mapped_column(String(255), index=True)
    l2_subprocess: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # B·VLASTNICTVÍ. Nullable at rest for migrated historical gaps; the
    # application boundary requires both relationships for every new active
    # Process. The former free-text values are intentionally not preserved.
    process_owner_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    owning_department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    process_owner: Mapped["User | None"] = relationship(
        "User", foreign_keys=[process_owner_user_id], back_populates="owned_processes"
    )
    owning_department: Mapped["Department | None"] = relationship(
        "Department", foreign_keys=[owning_department_id], back_populates="processes"
    )

    # C·DOPADY (1-5) — Skala15 integers; reputational is entered but
    # deliberately outside the score (spec section 2.1).
    impact_client: Mapped[int | None] = mapped_column(Integer, nullable=True)
    impact_market_operations: Mapped[int | None] = mapped_column(Integer, nullable=True)
    impact_regulatory: Mapped[int | None] = mapped_column(Integer, nullable=True)
    impact_financial: Mapped[int | None] = mapped_column(Integer, nullable=True)
    impact_reputational: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mtpd_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # D·KRITIČNOST A CIF — entered inputs only; class/CIF are derived later.
    preliminary_criticality: Mapped[str | None] = mapped_column(String(50), nullable=True)
    cif_override: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # E·ROI/REGULACE
    licensed_activity: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # F·KONTINUITA (BCM/DR)
    rto_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rpo_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bcm_link: Mapped[str | None] = mapped_column(String(50), nullable=True)
    last_dr_test_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    dr_test_result: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # G·POSOUZENÍ A STAV
    interruption_impact: Mapped[str | None] = mapped_column(String(50), nullable=True)
    assessment_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Monotonic token for governed business-state mutation revalidation.
    governance_version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default=text("1"),
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ProcessVendorLink(Base):
    """Process<->Vendor Link relation (workbook sheet 11 §1, the manual set).

    One row = one entered direct Process->Vendor dependency. Carries the
    entered §1 columns only — the direct-service description and note
    (functional spec section 1.8); name/CIF lookups and the revision helper
    derive on read. The pair is unique (§1 has no service column). The §2
    transitive expansion — every (process, asset, vendor) triple implied by
    sheets 05 + 10 — stays derived-only and is never persisted here.
    """

    __tablename__ = "process_vendor_links"
    __table_args__ = (UniqueConstraint("process_id", "vendor_id", name="uq_process_vendor_link"),)

    id: Mapped[int] = mapped_column(primary_key=True)

    process_id: Mapped[int] = mapped_column(
        ForeignKey("processes.id", ondelete="CASCADE"), index=True, nullable=False
    )
    vendor_id: Mapped[int] = mapped_column(
        ForeignKey("vendors.id", ondelete="CASCADE"), index=True, nullable=False
    )

    # "Popis přímé služby"
    direct_service_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
