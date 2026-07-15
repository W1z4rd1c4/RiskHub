from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models._archivable import ArchivableMixin


class VendorSubOutsourcing(ArchivableMixin, Base):
    """ICT Register Sub-outsourcing — one link in a Vendor's fourth-party chain.

    One row = one link in a sub-outsourcing chain, scoped to a specific
    Contract (workbook sheet 09_Subdodávky, functional spec section 1.5):
    carries the entered columns only, with the sub-provider identity stored
    inline (name, TypKodu identifier type + value, ZemeList country). A NULL
    ``predecessor_id`` marks a direct sub-outsourcer of the Contract;
    non-NULL points at the deeper link's predecessor in the same chain.
    Derived columns (Rank recursion, contract/vendor/name lookups, the
    critical-service lookup, the duplicate/chain-error check, hidden helpers)
    are computed on read by the derivation engine (ticket #49) and never
    persisted. Write-time chain integrity (same Vendor + Contract, no
    self-references, no cycles) is enforced in ``sub_outsourcing_policy`` —
    the invariant the #49 Rank recursion relies on.
    """

    __tablename__ = "vendor_sub_outsourcing"

    id: Mapped[int] = mapped_column(primary_key=True)

    vendor_id: Mapped[int] = mapped_column(
        ForeignKey("vendors.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # B "Smlouva (ID)" — every chain hangs off a Contract.
    contract_id: Mapped[int] = mapped_column(
        ForeignKey("vendor_contracts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # E "Nadřazený poskytovatel (ID)" — NULL = direct sub-outsourcer of the Contract.
    predecessor_id: Mapped[int | None] = mapped_column(
        ForeignKey("vendor_sub_outsourcing.id"), index=True, nullable=True
    )

    # F/G "Subdodavatel" — sub-provider identity entered inline.
    sub_provider_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # TypOsoby determines which DORA identifier codes are legally valid.
    person_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Canonical TypKodu + entered value; deprecated IČO (CRN)/Jiný stay readable.
    identifier_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    identifier_value: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # ZemeList closed list (ISO country).
    country: Mapped[str | None] = mapped_column(String(2), nullable=True)
    # H "Služba (S-kód)" — S01-S19 ICT service taxonomy.
    ict_service_code: Mapped[str | None] = mapped_column(String(3), nullable=True)
    # L "Poznámka"
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
