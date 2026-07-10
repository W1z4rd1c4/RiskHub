from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models._archivable import ArchivableMixin


class Asset(ArchivableMixin, Base):
    """ICT Register Asset — an ICT asset supporting one or more Processes.

    Carries the workbook's entered 04_Aktiva fields only (functional spec
    section 1.2). Derived values (CIAA value, weighted score, resulting
    criticality, CIF support, SPOF rollup, legacy flag, external dependency,
    TEXTJOIN aggregates, counts, completeness) are computed on read by the
    derivation engine (ticket #48) and never persisted.
    """

    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(primary_key=True)

    # A·IDENTIFIKACE
    name: Mapped[str] = mapped_column(String(255), index=True)
    asset_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    asset_level: Mapped[str | None] = mapped_column(String(50), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    physical_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    deployment_model: Mapped[str | None] = mapped_column(String(50), nullable=True)
    alternative_names: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # B·VLASTNICTVÍ A REGULACE
    business_owner: Mapped[str | None] = mapped_column(String(255), nullable=True)
    owner_department: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ict_owner: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gdpr_relevance: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ai_relevance: Mapped[str | None] = mapped_column(String(20), nullable=True)
    data_classification: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # D·HODNOTA AKTIVA (CIAA) — Skala15 integers; the MAX value is derived.
    confidentiality_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    integrity_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    availability_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    authenticity_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # E·BUSINESS DOPAD — the two manual impacts; the two inherited ones are derived.
    impact_client: Mapped[int | None] = mapped_column(Integer, nullable=True)
    impact_regulatory: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # F·ZÁVISLOSTI — entered ratings; external dependency and SPOF are derived.
    substitutability_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    vendor_dependency_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    internet_exposed: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # G·KRITIČNOST — the manual/BIA-seeded input; the resulting class is derived.
    preliminary_criticality: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # H·ŽIVOTNÍ CYKLUS — the legacy flag is derived from state + dates.
    lifecycle_state: Mapped[str | None] = mapped_column(String(50), nullable=True)
    standard_support_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    extended_support_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    custom_support_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_legacy_risk_assessment_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # I·VAZBY A KONTROLA
    review_state: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ProcessAssetLink(Base):
    """Process<->Asset Link relation (workbook sheet 05).

    Carries the entered link columns — significance, SPOF, note — plus the
    primary-Process designation (at most one primary link per Asset: the
    service layer owns the atomic swap and the partial unique index below is
    the DB-level backstop). Lookup/name columns are derived on read later.
    """

    __tablename__ = "process_asset_links"
    __table_args__ = (
        UniqueConstraint("process_id", "asset_id", name="uq_process_asset_link"),
        # DB-level backstop for the at-most-one-primary invariant: two
        # concurrent designations could each miss the other's not-yet-committed
        # promote, so the database rejects the second one. Declared for both
        # dialects (test DB is SQLite, prod is Postgres) and kept in exact
        # sync with the r5s6t7u8v9w0_add_assets.py migration DDL.
        Index(
            "uq_process_asset_links_primary_per_asset",
            "asset_id",
            unique=True,
            sqlite_where=text("is_primary"),
            postgresql_where=text("is_primary"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    process_id: Mapped[int] = mapped_column(
        ForeignKey("processes.id", ondelete="CASCADE"), index=True, nullable=False
    )
    asset_id: Mapped[int] = mapped_column(
        ForeignKey("assets.id", ondelete="CASCADE"), index=True, nullable=False
    )

    # "Význam vazby pro proces" — closed list VyznamVazby.
    significance: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # "SPOF" — closed list AnoNe.
    spof: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # The Asset's designated primary Process (spec: live, user-controlled).
    is_primary: Mapped[bool] = mapped_column(Boolean, server_default="false", default=False, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AssetAssetLink(Base):
    """Asset<->Asset Link relation (workbook sheet 06).

    Directional: the dependent Asset relies on the supporting Asset. Carries
    the entered columns — dependency type, SPOF, note. Self-links are
    rejected and the ordered pair is unique.
    """

    __tablename__ = "asset_asset_links"
    __table_args__ = (
        UniqueConstraint("dependent_asset_id", "supporting_asset_id", name="uq_asset_asset_link"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    dependent_asset_id: Mapped[int] = mapped_column(
        ForeignKey("assets.id", ondelete="CASCADE"), index=True, nullable=False
    )
    supporting_asset_id: Mapped[int] = mapped_column(
        ForeignKey("assets.id", ondelete="CASCADE"), index=True, nullable=False
    )

    # "Typ závislosti" — closed list TypZavislostiAktiv.
    dependency_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # "SPOF" — closed list AnoNe.
    spof: Mapped[str | None] = mapped_column(String(10), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AssetVendorLink(Base):
    """Asset<->Vendor Link relation (workbook sheet 10_Vazby_aktivum_dodavatel).

    One row = the Asset depends on the Vendor for one typed ICT service.
    Carries the entered 10_VAD columns only — vendor role, the S-code, the
    contract reference, reliance, note (functional spec section 1.8). Lookup
    and helper columns (names, the ICT-service label, resulting criticality,
    CIF, duplicate check, hidden helpers) derive on read. The identity tuple
    is (asset, vendor, S-code): one Vendor can serve one Asset with several
    typed services.
    """

    __tablename__ = "asset_vendor_links"
    __table_args__ = (
        UniqueConstraint("asset_id", "vendor_id", "ict_service_code", name="uq_asset_vendor_link"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    asset_id: Mapped[int] = mapped_column(
        ForeignKey("assets.id", ondelete="CASCADE"), index=True, nullable=False
    )
    vendor_id: Mapped[int] = mapped_column(
        ForeignKey("vendors.id", ondelete="CASCADE"), index=True, nullable=False
    )

    # "Role dodavatele" — closed list RoleDodavatele.
    vendor_role: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # "Typ ICT služby (S-kód)" — S01-S19 taxonomy; part of the link identity.
    ict_service_code: Mapped[str] = mapped_column(String(3), nullable=False)
    # "Ref. smlouvy" — entered contract reference (workbook list SmlouvyRef).
    contract_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # "Míra závislosti (u CIF)" — closed list Reliance.
    reliance: Mapped[str | None] = mapped_column(String(50), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
