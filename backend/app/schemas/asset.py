"""ICT Register Asset and Link relation schemas (issue #43).

Write schemas carry the workbook's entered 04_Aktiva fields (and the entered
sheet 05/06 link columns) only and forbid unknown keys, so derived fields
(CIAA value, weighted score, resulting criticality, CIF, SPOF rollup, legacy,
external dependency, TEXTJOIN aggregates, counts, completeness — ticket #48)
are rejected at the API boundary. Coded fields are validated against the
workbook closed lists in ``app.services._ict_register_reference``.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated

from pydantic import BaseModel, Field, computed_field, field_validator, model_validator

from app.core.datetime_utils import UtcAwareDatetime
from app.services._ict_register_reference import is_closed_list_value

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
