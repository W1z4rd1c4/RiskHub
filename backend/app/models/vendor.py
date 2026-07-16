from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import Enum as PyEnum
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models._archivable import ArchivableMixin

if TYPE_CHECKING:
    from app.models.department import Department
    from app.models.user import User
    from app.models.vendor_control_link import VendorControlLink
    from app.models.vendor_kri_link import VendorKRILink
    from app.models.vendor_risk_link import VendorRiskLink


class VendorType(str, PyEnum):
    ict = "ict"
    outsourcing = "outsourcing"
    professional_services = "professional_services"
    partner = "partner"
    other = "other"


class VendorReplaceability(str, PyEnum):
    """Locale-independent Vendor substitutability codes."""

    not_substitutable = "not_substitutable"
    highly_complex = "highly_complex"
    medium_complexity = "medium_complexity"
    easily_substitutable = "easily_substitutable"


class Vendor(ArchivableMixin, Base):
    __tablename__ = "vendors"

    def __init__(self, **kwargs: Any) -> None:
        kwargs.pop("status", None)
        super().__init__(**kwargs)

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
    # Canonical ICT Register Substitutability input. Workbook labels and
    # retired aliases are translated only at import/migration boundaries.
    replaceability: Mapped[str | None] = mapped_column(String(50), nullable=True)
    has_alternative_providers: Mapped[bool] = mapped_column(Boolean, default=False)

    # ICT Register extension (issue #44) — the entered 07_Dodavatelé columns
    # the base Vendor lacked (functional spec section 1.3). Derived vendor
    # values (CIF support, link counts, max criticality, tier, chain level,
    # sub-outsourcing aggregates, significance outcome, completeness, country
    # category) are computed on read by the derivation engine (#48/#49) and
    # never persisted.

    # A·IDENTIFIKACE
    latin_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    person_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # LEI/EUID identifier: type from the TypKodu closed list + entered value.
    identifier_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    identifier_value: Mapped[str | None] = mapped_column(String(100), nullable=True)
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_person: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ultimate_parent_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ultimate_parent_lei: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # C·DATA A LOKACE
    data_storage: Mapped[str | None] = mapped_column(String(255), nullable=True)
    service_country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    data_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    processing_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    data_sensitivity: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # D·SUBSTITUCE A EXIT
    substitutability_reason: Mapped[str | None] = mapped_column(String(50), nullable=True)
    last_audit_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    exit_plan_state: Mapped[str | None] = mapped_column(String(50), nullable=True)
    reintegration: Mapped[str | None] = mapped_column(String(20), nullable=True)
    service_disruption_impact: Mapped[str | None] = mapped_column(String(20), nullable=True)
    alternative_providers: Mapped[str | None] = mapped_column(String(20), nullable=True)
    alternative_providers_names: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # F·POSOUZENÍ RIZIKA A VÝZNAMNOSTI
    ctpp_designation: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ex_ante_operational: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ex_ante_legal: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ex_ante_ict: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ex_ante_reputational: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ex_ante_data_confidentiality: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ex_ante_data_availability: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ex_ante_data_location: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ex_ante_provider_location: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ex_ante_ict_concentration: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ex_ante_assessment_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    assessment_phase: Mapped[str | None] = mapped_column(String(20), nullable=True)
    due_diligence_state: Mapped[str | None] = mapped_column(String(50), nullable=True)
    last_monitoring_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    significance_authorization_conditions: Mapped[str | None] = mapped_column(String(20), nullable=True)
    significance_regulatory_requirements: Mapped[str | None] = mapped_column(String(20), nullable=True)
    significance_service_quality: Mapped[str | None] = mapped_column(String(20), nullable=True)
    significance_financial_impact: Mapped[str | None] = mapped_column(String(20), nullable=True)
    significance_reputation_continuity: Mapped[str | None] = mapped_column(String(20), nullable=True)
    significance_cumulative_impact: Mapped[str | None] = mapped_column(String(20), nullable=True)
    significance_justification: Mapped[str | None] = mapped_column(Text, nullable=True)

    # G·STAV A POZNÁMKY (the workbook's static import-reference counts included)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reference_occurrence_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reference_process_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

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
