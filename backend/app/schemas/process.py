"""ICT Register Process schemas (issue #42).

Write schemas carry the workbook's entered 03_Procesy fields only and forbid
unknown keys, so derived fields (score, class, CIF, gap checks, next review,
counts, completeness — ticket #48) and the server-assigned F-code are rejected
at the API boundary. Coded fields are validated against the workbook closed
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
