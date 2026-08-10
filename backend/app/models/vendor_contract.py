from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models._archivable import ArchivableMixin


class VendorContract(ArchivableMixin, Base):
    """ICT Register Contract — a contractual arrangement with a Vendor.

    The sole contract truth (workbook sheet 08_Smlouvy, functional spec
    section 1.4): carries the entered columns only. Derived columns
    (vendor-name lookup, sub-outsourcing chain display, duplicate check,
    hidden main/CIF/duplicity/vendor-exists helpers) are computed on read by
    the derivation engine (tickets #48/#49) and never persisted. The
    workbook's exactly-one-main-per-vendor rule is a DQ finding (#50), not a
    write constraint — the main-contract flag is stored as entered.
    """

    __tablename__ = "vendor_contracts"

    id: Mapped[int] = mapped_column(primary_key=True)

    vendor_id: Mapped[int] = mapped_column(
        ForeignKey("vendors.id", ondelete="CASCADE"), index=True, nullable=False
    )

    # B "Ref. smlouvy (RoI)"
    contract_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # C "Interní číslo smlouvy (TAS/SAP)"
    internal_contract_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # D "Systém evidence" — closed list SystemEvidence.
    records_system: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # G "Typ ujednání" — closed list TypUjednani.
    arrangement_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # H "Hlavní smlouva" — closed list AnoNe, stored as entered (DQ-39 owns uniqueness).
    main_contract: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # I "Nadřazená smlouva (ref.)" — a reference to another Contract's ref.
    overarching_arrangement_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # J "Předmět / popis"
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # K "Služba IKT v rozsahu RoI" — closed list AnoNe; gates RoI feeds later (#52).
    roi_scope: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # L/M "Zahájení / Ukončení" (the workbook's 9999-12-31 open-ended sentinel included).
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # N/O "Výpovědní doba entita/poskytovatel (dny)"
    notice_period_entity_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notice_period_provider_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # P "Rozhodné právo (ISO)"
    governing_law_country: Mapped[str | None] = mapped_column(String(2), nullable=True)
    # Q/R "Roční náklad" + "Měna (ISO 4217)" — closed list MenaList.
    annual_cost: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    # T "Poznámka"
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
