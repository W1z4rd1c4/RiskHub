"""ICT Register Process schemas (issues #42, #48).

Write schemas carry the workbook's entered 03_Procesy fields only and forbid
unknown keys, so every derived field (the ``derived`` block below and any of
its member names) and the server-assigned F-code are rejected at the API
boundary. Derived values ride the Read payloads as a typed ``derived`` block
computed on read by ``app.services._ict_register_lifecycle.derivation`` —
never persisted, never writable — with an ``inputs`` explain object exposing
what produced them. Coded fields are validated against the workbook closed
lists in ``app.services._ict_register_reference`` instead of redefining them.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated

from pydantic import BaseModel, Field, computed_field, field_validator

from app.core.datetime_utils import UtcAwareDatetime
from app.services._ict_register_reference import is_closed_list_value

# Impact dimensions are Skala15 integers (1-5); strict, so "5" is rejected.
ImpactDimension = Annotated[int, Field(strict=True)]

_CLOSED_LIST_FIELDS: dict[str, str] = {
    "owner_department": "VlastnickyUtvar",
    "preliminary_criticality": "TridyKrit",
    "cif_override": "AnoNe",
    "licensed_activity": "LicCinnost",
    "bcm_link": "BcmVazba",
    "dr_test_result": "VysledekDR",
    "interruption_impact": "DopadPreruseni",
}

_IMPACT_FIELDS = (
    "impact_client",
    "impact_market_operations",
    "impact_regulatory",
    "impact_financial",
    "impact_reputational",
)


class ProcessWriteValidators(BaseModel):
    """Shared closed-list enforcement for Process write payloads."""

    model_config = {"extra": "forbid"}

    @field_validator(*_CLOSED_LIST_FIELDS, check_fields=False)
    @classmethod
    def _validate_closed_list_fields(cls, value: str | None, info) -> str | None:
        if value is None:
            return value
        list_name = _CLOSED_LIST_FIELDS[info.field_name]
        if not is_closed_list_value(list_name, value):
            raise ValueError(f"Value must come from the workbook closed list {list_name}")
        return value

    @field_validator(*_IMPACT_FIELDS, check_fields=False)
    @classmethod
    def _validate_impact_dimensions(cls, value: int | None, info) -> int | None:
        if value is None:
            return value
        if not is_closed_list_value("Skala15", value):
            raise ValueError("Impact dimensions must be Skala15 integers (1-5)")
        return value


class ProcessBase(ProcessWriteValidators):
    # A·IDENTIFIKACE
    l0_area: str = Field(..., min_length=1, max_length=255)
    l1_process: str = Field(..., min_length=1, max_length=255)
    l2_subprocess: str | None = Field(None, max_length=255)

    # B·VLASTNICTVÍ
    owner: str | None = Field(None, max_length=255)
    owner_department: str | None = Field(None, max_length=100)

    # C·DOPADY (1-5)
    impact_client: ImpactDimension | None = None
    impact_market_operations: ImpactDimension | None = None
    impact_regulatory: ImpactDimension | None = None
    impact_financial: ImpactDimension | None = None
    impact_reputational: ImpactDimension | None = None
    mtpd_hours: int | None = Field(None, ge=0)

    # D·KRITIČNOST A CIF
    preliminary_criticality: str | None = Field(None, max_length=50)
    cif_override: str | None = Field(None, max_length=10)

    # E·ROI/REGULACE
    licensed_activity: str | None = Field(None, max_length=100)

    # F·KONTINUITA (BCM/DR)
    rto_hours: int | None = Field(None, ge=0)
    rpo_hours: int | None = Field(None, ge=0)
    bcm_link: str | None = Field(None, max_length=50)
    last_dr_test_date: date | None = None
    dr_test_result: str | None = Field(None, max_length=50)

    # G·POSOUZENÍ A STAV
    interruption_impact: str | None = Field(None, max_length=50)
    assessment_date: date | None = None
    notes: str | None = None


class ProcessCreate(ProcessBase):
    pass


class ProcessUpdate(ProcessWriteValidators):
    l0_area: str | None = Field(None, min_length=1, max_length=255)
    l1_process: str | None = Field(None, min_length=1, max_length=255)
    l2_subprocess: str | None = Field(None, max_length=255)

    owner: str | None = Field(None, max_length=255)
    owner_department: str | None = Field(None, max_length=100)

    impact_client: ImpactDimension | None = None
    impact_market_operations: ImpactDimension | None = None
    impact_regulatory: ImpactDimension | None = None
    impact_financial: ImpactDimension | None = None
    impact_reputational: ImpactDimension | None = None
    mtpd_hours: int | None = Field(None, ge=0)

    preliminary_criticality: str | None = Field(None, max_length=50)
    cif_override: str | None = Field(None, max_length=10)

    licensed_activity: str | None = Field(None, max_length=100)

    rto_hours: int | None = Field(None, ge=0)
    rpo_hours: int | None = Field(None, ge=0)
    bcm_link: str | None = Field(None, max_length=50)
    last_dr_test_date: date | None = None
    dr_test_result: str | None = Field(None, max_length=50)

    interruption_impact: str | None = Field(None, max_length=50)
    assessment_date: date | None = None
    notes: str | None = None


class ProcessCapabilities(BaseModel):
    can_read: bool
    can_update: bool
    can_archive: bool
    can_restore: bool


class ProcessDerivedInputs(BaseModel):
    """The inputs (and parameter values) that produced the derived block."""

    impact_client: int | None = None
    impact_market_operations: int | None = None
    impact_regulatory: int | None = None
    impact_financial: int | None = None
    mtpd_hours: int | None = None
    mtpd_bonus: int | None = None
    threshold_critical_score: int
    threshold_high_score: int
    threshold_medium_score: int
    mtpd_critical_hours: int
    mtpd_medium_hours: int
    preliminary_criticality: str | None = None
    criticality_class_source: str
    cif_override: str | None = None
    cif_class_critical: bool
    cif_mtpd_within_critical: bool
    cif_any_impact_maximal: bool
    rto_hours: int | None = None
    bcm_link: str | None = None
    assessment_date: date | None = None
    missing_for_completeness: list[str]
    # dod_n breakdown (#49): manual §1 pairs + derived §2 triples.
    manual_vendor_link_count: int = 0
    transitive_vendor_pair_count: int = 0

    model_config = {"from_attributes": True}


class ProcessTransitiveVendorLink(BaseModel):
    """One derived 11 §2 row: a (Process, Vendor) pair implied via an Asset.

    Derived on read, browsable, never persisted (#49; spec 1.8 §2).
    """

    process_id: int
    process_name: str
    process_cif: str | None = None
    process_criticality: str | None = None
    vendor_id: int
    vendor_name: str
    via_asset_id: int
    via_asset_name: str

    model_config = {"from_attributes": True}


class ProcessDerived(BaseModel):
    """Engine-derived 03_Procesy values (spec 1.1/2.1) — read-only, computed on read."""

    criticality_score: int | None = None
    criticality_class: str | None = None
    cif: str
    # Blank when RTO or MTPD is missing (the workbook formula's blank guard).
    rto_mtpd_check: str | None = None
    bcm_check: str
    next_review_date: date | None = None
    linked_asset_count: int
    # dod_n = §1 manual pairs + the derived §2 triples (#49, spec 1.1 ~137).
    linked_vendor_count: int
    is_complete: bool
    is_duplicate: bool
    inputs: ProcessDerivedInputs
    transitive_vendor_links: list[ProcessTransitiveVendorLink] = []

    model_config = {"from_attributes": True}


class ProcessRead(BaseModel):
    id: int
    f_code: str

    l0_area: str
    l1_process: str
    l2_subprocess: str | None = None

    owner: str | None = None
    owner_department: str | None = None

    impact_client: int | None = None
    impact_market_operations: int | None = None
    impact_regulatory: int | None = None
    impact_financial: int | None = None
    impact_reputational: int | None = None
    mtpd_hours: int | None = None

    preliminary_criticality: str | None = None
    cif_override: str | None = None

    licensed_activity: str | None = None

    rto_hours: int | None = None
    rpo_hours: int | None = None
    bcm_link: str | None = None
    last_dr_test_date: date | None = None
    dr_test_result: str | None = None

    interruption_impact: str | None = None
    assessment_date: date | None = None
    notes: str | None = None

    # Engine-derived block (ticket #48): populated by the projection on every
    # read surface, absent from the persistence model, rejected on write.
    derived: ProcessDerived | None = None

    is_archived: bool = False
    archived_at: UtcAwareDatetime | None = None
    archived_by_id: int | None = None
    capabilities: ProcessCapabilities | None = None
    created_at: UtcAwareDatetime
    updated_at: UtcAwareDatetime

    model_config = {"from_attributes": True}


class ProcessListCapabilities(BaseModel):
    """Collection-level Process list action capabilities."""

    can_create: bool


class ProcessListResponse(BaseModel):
    items: list[ProcessRead]
    total: int
    offset: int
    limit: int
    capabilities: ProcessListCapabilities | None = None

    @computed_field
    def skip(self) -> int:
        return self.offset


class ProcessVendorLinkCreate(BaseModel):
    """Process<->Vendor link (sheet 11 §1): the entered manual columns only."""

    model_config = {"extra": "forbid"}

    vendor_id: int = Field(..., ge=1)
    direct_service_description: str | None = None
    note: str | None = None


class ProcessVendorLinkCapabilities(BaseModel):
    """Per-row link actions: mutations follow the REGISTER end (processes:write)."""

    can_delete: bool


class ProcessVendorLinkRead(BaseModel):
    id: int
    process_id: int
    vendor_id: int
    # Display names for both ends, embedded by the list/create services so the
    # UI never falls back to raw ids (docs/agent/FRONTEND_DISPLAY_GUARDRAILS.md).
    process_name: str | None = None
    vendor_name: str | None = None
    direct_service_description: str | None = None
    note: str | None = None
    capabilities: ProcessVendorLinkCapabilities | None = None
    created_at: UtcAwareDatetime

    model_config = {"from_attributes": True}
