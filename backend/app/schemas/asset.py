"""ICT Register Asset and Link relation schemas (issues #43, #48).

Write schemas carry the workbook's entered 04_Aktiva fields (and the entered
sheet 05/06 link columns) only and forbid unknown keys, so every derived
field (the ``derived`` block below and any of its member names) is rejected
at the API boundary. Derived values — CIAA value, the primary-process
lookups, business criticality, the weighted score, the h_rank MAX cascade
and resulting criticality, CIF, SPOF, external dependency, legacy, and the
count/list aggregates — ride the Read payloads as a typed ``derived`` block
computed on read by ``app.services._ict_register_lifecycle.derivation``,
never persisted, with an ``inputs`` explain object exposing what produced
them. Coded fields are validated against the workbook closed lists in
``app.services._ict_register_reference``.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated

from pydantic import BaseModel, Field, computed_field, field_validator, model_validator

from app.core.datetime_utils import UtcAwareDatetime
from app.services._ict_register_reference import ICT_SERVICE_TAXONOMY, is_closed_list_value

# Ratings and manual impacts are Skala15 integers (1-5); strict, so "5" is rejected.
RatingDimension = Annotated[int, Field(strict=True)]

_CLOSED_LIST_FIELDS: dict[str, str] = {
    "asset_type": "TypAktiva",
    "asset_level": "UrovenAktiva",
    "deployment_model": "ModelNasazeni",
    "owner_department": "VlastnickyUtvar",
    "gdpr_relevance": "AnoNeNeurceno",
    "ai_relevance": "AnoNeNeurceno",
    "data_classification": "KlasifikaceDat",
    "internet_exposed": "AnoNe",
    "preliminary_criticality": "TridyKrit",
    "lifecycle_state": "StavAktiva",
    "review_state": "StavRevize",
}

_RATING_FIELDS = (
    "confidentiality_rating",
    "integrity_rating",
    "availability_rating",
    "authenticity_rating",
    "impact_client",
    "impact_regulatory",
    "substitutability_rating",
    "vendor_dependency_rating",
)


class AssetWriteValidators(BaseModel):
    """Shared closed-list enforcement for Asset write payloads."""

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

    @field_validator(*_RATING_FIELDS, check_fields=False)
    @classmethod
    def _validate_rating_dimensions(cls, value: int | None, info) -> int | None:
        if value is None:
            return value
        if not is_closed_list_value("Skala15", value):
            raise ValueError("Ratings must be Skala15 integers (1-5)")
        return value


class AssetBase(AssetWriteValidators):
    # A·IDENTIFIKACE
    name: str = Field(..., min_length=1, max_length=255)
    asset_type: str | None = Field(None, max_length=50)
    asset_level: str | None = Field(None, max_length=50)
    description: str | None = None
    physical_location: str | None = Field(None, max_length=255)
    deployment_model: str | None = Field(None, max_length=50)
    alternative_names: str | None = Field(None, max_length=255)

    # B·VLASTNICTVÍ A REGULACE
    business_owner: str | None = Field(None, max_length=255)
    owner_department: str | None = Field(None, max_length=100)
    ict_owner: str | None = Field(None, max_length=255)
    gdpr_relevance: str | None = Field(None, max_length=20)
    ai_relevance: str | None = Field(None, max_length=20)
    data_classification: str | None = Field(None, max_length=100)

    # D·HODNOTA AKTIVA (CIAA)
    confidentiality_rating: RatingDimension | None = None
    integrity_rating: RatingDimension | None = None
    availability_rating: RatingDimension | None = None
    authenticity_rating: RatingDimension | None = None

    # E·BUSINESS DOPAD
    impact_client: RatingDimension | None = None
    impact_regulatory: RatingDimension | None = None

    # F·ZÁVISLOSTI
    substitutability_rating: RatingDimension | None = None
    vendor_dependency_rating: RatingDimension | None = None
    internet_exposed: str | None = Field(None, max_length=10)

    # G·KRITIČNOST
    preliminary_criticality: str | None = Field(None, max_length=50)

    # H·ŽIVOTNÍ CYKLUS
    lifecycle_state: str | None = Field(None, max_length=50)
    standard_support_end_date: date | None = None
    extended_support_end_date: date | None = None
    custom_support_end_date: date | None = None
    last_legacy_risk_assessment_date: date | None = None

    # I·VAZBY A KONTROLA
    review_state: str | None = Field(None, max_length=50)
    notes: str | None = None


class AssetCreate(AssetBase):
    pass


class AssetUpdate(AssetWriteValidators):
    name: str | None = Field(None, min_length=1, max_length=255)
    asset_type: str | None = Field(None, max_length=50)
    asset_level: str | None = Field(None, max_length=50)
    description: str | None = None
    physical_location: str | None = Field(None, max_length=255)
    deployment_model: str | None = Field(None, max_length=50)
    alternative_names: str | None = Field(None, max_length=255)

    business_owner: str | None = Field(None, max_length=255)
    owner_department: str | None = Field(None, max_length=100)
    ict_owner: str | None = Field(None, max_length=255)
    gdpr_relevance: str | None = Field(None, max_length=20)
    ai_relevance: str | None = Field(None, max_length=20)
    data_classification: str | None = Field(None, max_length=100)

    confidentiality_rating: RatingDimension | None = None
    integrity_rating: RatingDimension | None = None
    availability_rating: RatingDimension | None = None
    authenticity_rating: RatingDimension | None = None

    impact_client: RatingDimension | None = None
    impact_regulatory: RatingDimension | None = None

    substitutability_rating: RatingDimension | None = None
    vendor_dependency_rating: RatingDimension | None = None
    internet_exposed: str | None = Field(None, max_length=10)

    preliminary_criticality: str | None = Field(None, max_length=50)

    lifecycle_state: str | None = Field(None, max_length=50)
    standard_support_end_date: date | None = None
    extended_support_end_date: date | None = None
    custom_support_end_date: date | None = None
    last_legacy_risk_assessment_date: date | None = None

    review_state: str | None = Field(None, max_length=50)
    notes: str | None = None


class AssetCapabilities(BaseModel):
    can_read: bool
    can_update: bool
    can_archive: bool
    can_restore: bool


class AssetDerivedInputs(BaseModel):
    """The signals, ranks, and parameter values behind the derived block."""

    confidentiality_rating: int | None = None
    integrity_rating: int | None = None
    availability_rating: int | None = None
    authenticity_rating: int | None = None
    impact_client: int | None = None
    impact_regulatory: int | None = None
    substitutability_rating: int | None = None
    vendor_dependency_rating: int | None = None
    preliminary_criticality: str | None = None
    lifecycle_state: str | None = None
    standard_support_end_date: date | None = None
    reference_date: date
    threshold_low_score: int
    threshold_medium_score: int
    threshold_high_score: int
    primary_process_id: int | None = None
    rank_primary_process_criticality: int
    rank_score_criticality: int
    rank_preliminary_criticality: int
    rank_business_criticality: int
    rank_cif_floor: int
    # 04!hotovo ingredients (#49): the blank completeness cells, span order.
    missing_for_completeness: list[str] = []

    model_config = {"from_attributes": True}


class AssetDerived(BaseModel):
    """Engine-derived 04_Aktiva values (spec 1.2/2.2) — read-only, computed on read."""

    ciaa_value: int | None = None
    primary_process_name: str | None = None
    primary_process_criticality: str | None = None
    inherited_impact_operations: int | None = None
    inherited_impact_financial: int | None = None
    inherited_rto_hours: int | None = None
    business_criticality: str | None = None
    weighted_score: float | None = None
    score_criticality: str | None = None
    h_rank: int
    resulting_criticality: str | None = None
    article8_classification: str
    cif: str
    cif_process_count: int
    cif_process_names: list[str]
    spof: str
    external_dependency: str
    legacy: str
    linked_process_count: int
    linked_vendor_count: int
    linked_asset_names: list[str]
    vendor_names: list[str]
    ict_service_codes: list[str]
    contract_references: list[str]
    # 04!hotovo (#49): "✓" iff every completeness span is filled.
    is_complete: bool
    inputs: AssetDerivedInputs

    model_config = {"from_attributes": True}


class AssetRead(BaseModel):
    id: int

    name: str
    asset_type: str | None = None
    asset_level: str | None = None
    description: str | None = None
    physical_location: str | None = None
    deployment_model: str | None = None
    alternative_names: str | None = None

    business_owner: str | None = None
    owner_department: str | None = None
    ict_owner: str | None = None
    gdpr_relevance: str | None = None
    ai_relevance: str | None = None
    data_classification: str | None = None

    confidentiality_rating: int | None = None
    integrity_rating: int | None = None
    availability_rating: int | None = None
    authenticity_rating: int | None = None

    impact_client: int | None = None
    impact_regulatory: int | None = None

    substitutability_rating: int | None = None
    vendor_dependency_rating: int | None = None
    internet_exposed: str | None = None

    preliminary_criticality: str | None = None

    lifecycle_state: str | None = None
    standard_support_end_date: date | None = None
    extended_support_end_date: date | None = None
    custom_support_end_date: date | None = None
    last_legacy_risk_assessment_date: date | None = None

    review_state: str | None = None
    notes: str | None = None

    # The designated primary Process among this Asset's links (entered on the
    # Process<->Asset Link relation; projected here for the register UI).
    primary_process_id: int | None = None

    # Engine-derived block (ticket #48): populated by the projection on every
    # read surface, absent from the persistence model, rejected on write.
    derived: AssetDerived | None = None

    is_archived: bool = False
    archived_at: UtcAwareDatetime | None = None
    archived_by_id: int | None = None
    capabilities: AssetCapabilities | None = None
    created_at: UtcAwareDatetime
    updated_at: UtcAwareDatetime

    model_config = {"from_attributes": True}


class AssetListCapabilities(BaseModel):
    """Collection-level Asset list action capabilities."""

    can_create: bool


class AssetListResponse(BaseModel):
    items: list[AssetRead]
    total: int
    offset: int
    limit: int
    capabilities: AssetListCapabilities | None = None

    @computed_field
    def skip(self) -> int:
        return self.offset


class ProcessAssetLinkWriteValidators(BaseModel):
    """Shared closed-list enforcement for Process<->Asset link payloads."""

    model_config = {"extra": "forbid"}

    @field_validator("significance", check_fields=False)
    @classmethod
    def _validate_significance(cls, value: str | None) -> str | None:
        if value is not None and not is_closed_list_value("VyznamVazby", value):
            raise ValueError("Value must come from the workbook closed list VyznamVazby")
        return value

    @field_validator("spof", check_fields=False)
    @classmethod
    def _validate_spof(cls, value: str | None) -> str | None:
        if value is not None and not is_closed_list_value("AnoNe", value):
            raise ValueError("Value must come from the workbook closed list AnoNe")
        return value


class ProcessAssetLinkCreate(ProcessAssetLinkWriteValidators):
    process_id: int = Field(..., ge=1)
    significance: str | None = Field(None, max_length=50)
    spof: str | None = Field(None, max_length=10)
    is_primary: bool = False
    note: str | None = None


class ProcessAssetLinkUpdate(ProcessAssetLinkWriteValidators):
    significance: str | None = Field(None, max_length=50)
    spof: str | None = Field(None, max_length=10)
    is_primary: bool | None = None
    note: str | None = None


class ProcessAssetLinkRead(BaseModel):
    id: int
    process_id: int
    asset_id: int
    significance: str | None = None
    spof: str | None = None
    is_primary: bool = False
    note: str | None = None
    created_at: UtcAwareDatetime

    model_config = {"from_attributes": True}


class AssetAssetLinkCreate(BaseModel):
    """Directional Asset<->Asset link: the dependent Asset relies on the supporting one."""

    model_config = {"extra": "forbid"}

    dependent_asset_id: int = Field(..., ge=1)
    supporting_asset_id: int = Field(..., ge=1)
    dependency_type: str | None = Field(None, max_length=50)
    spof: str | None = Field(None, max_length=10)
    note: str | None = None

    @field_validator("dependency_type")
    @classmethod
    def _validate_dependency_type(cls, value: str | None) -> str | None:
        if value is not None and not is_closed_list_value("TypZavislostiAktiv", value):
            raise ValueError("Value must come from the workbook closed list TypZavislostiAktiv")
        return value

    @field_validator("spof")
    @classmethod
    def _validate_spof(cls, value: str | None) -> str | None:
        if value is not None and not is_closed_list_value("AnoNe", value):
            raise ValueError("Value must come from the workbook closed list AnoNe")
        return value

    @model_validator(mode="after")
    def _reject_self_link(self) -> "AssetAssetLinkCreate":
        if self.dependent_asset_id == self.supporting_asset_id:
            raise ValueError("An Asset cannot depend on itself")
        return self


class AssetAssetLinkRead(BaseModel):
    id: int
    dependent_asset_id: int
    supporting_asset_id: int
    dependency_type: str | None = None
    spof: str | None = None
    note: str | None = None
    created_at: UtcAwareDatetime

    model_config = {"from_attributes": True}


class AssetVendorLinkCreate(BaseModel):
    """Asset<->Vendor link (sheet 10_VAD): the entered columns, S-code required."""

    model_config = {"extra": "forbid"}

    vendor_id: int = Field(..., ge=1)
    vendor_role: str | None = Field(None, max_length=50)
    ict_service_code: str = Field(..., max_length=3)
    contract_reference: str | None = Field(None, max_length=100)
    reliance: str | None = Field(None, max_length=50)
    note: str | None = None

    @field_validator("ict_service_code")
    @classmethod
    def _validate_ict_service_code(cls, value: str) -> str:
        if value not in ICT_SERVICE_TAXONOMY:
            raise ValueError("Value must be an S01-S19 ICT service taxonomy code")
        return value

    @field_validator("vendor_role")
    @classmethod
    def _validate_vendor_role(cls, value: str | None) -> str | None:
        if value is not None and not is_closed_list_value("RoleDodavatele", value):
            raise ValueError("Value must come from the workbook closed list RoleDodavatele")
        return value

    @field_validator("reliance")
    @classmethod
    def _validate_reliance(cls, value: str | None) -> str | None:
        if value is not None and not is_closed_list_value("Reliance", value):
            raise ValueError("Value must come from the workbook closed list Reliance")
        return value


class AssetVendorLinkCapabilities(BaseModel):
    """Per-row link actions: mutations follow the REGISTER end (assets:write)."""

    can_delete: bool


class AssetVendorLinkRead(BaseModel):
    id: int
    asset_id: int
    vendor_id: int
    vendor_role: str | None = None
    ict_service_code: str
    contract_reference: str | None = None
    reliance: str | None = None
    note: str | None = None
    capabilities: AssetVendorLinkCapabilities | None = None
    created_at: UtcAwareDatetime

    model_config = {"from_attributes": True}
