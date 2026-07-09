from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models._archivable import ArchivableMixin


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

    # B·VLASTNICTVÍ
    owner: Mapped[str | None] = mapped_column(String(255), nullable=True)
    owner_department: Mapped[str | None] = mapped_column(String(100), nullable=True)

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

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
