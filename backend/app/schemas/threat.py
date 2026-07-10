"""ICT Register Threat and Threat<->Risk Link relation schemas (issue #47).

Write schemas carry the workbook's entered 12_Hrozby columns only and forbid
unknown keys. The category is validated against the workbook closed list
``KategorieHrozeb`` from ``app.services._ict_register_reference``. Threats
carry no derived block — they sit outside the criticality cascade — so the
Read schema is the entered columns plus the archive state and per-row
capabilities (ADR-001).

The Threat<->Risk Link relation is manageable from BOTH ends: the Threat page
mutates under ``threats:write`` and the Risk detail mutates under
``risks:write`` (the #46 managing-end precedent applied to each end), so the
link row's ``can_delete`` capability is computed per serialization surface.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, computed_field, field_validator

from app.core.datetime_utils import UtcAwareDatetime
from app.services._ict_register_reference import is_closed_list_value


class ThreatWriteValidators(BaseModel):
    """Shared closed-list enforcement for Threat write payloads."""

    model_config = {"extra": "forbid"}

    @field_validator("category", check_fields=False)
    @classmethod
    def _validate_category(cls, value: str | None) -> str | None:
        if value is not None and not is_closed_list_value("KategorieHrozeb", value):
            raise ValueError("Value must come from the workbook closed list KategorieHrozeb")
        return value


class ThreatBase(ThreatWriteValidators):
    name: str = Field(..., min_length=1, max_length=255)
    category: str | None = Field(None, max_length=50)
    description: str | None = None
    typical_weaknesses: str | None = None
    relevant_subject: str | None = Field(None, max_length=255)
    notes: str | None = None


class ThreatCreate(ThreatBase):
    pass


class ThreatUpdate(ThreatWriteValidators):
    name: str | None = Field(None, min_length=1, max_length=255)
    category: str | None = Field(None, max_length=50)
    description: str | None = None
    typical_weaknesses: str | None = None
    relevant_subject: str | None = Field(None, max_length=255)
    notes: str | None = None


class ThreatCapabilities(BaseModel):
    can_read: bool
    can_update: bool
    can_archive: bool
    can_restore: bool


class ThreatRead(BaseModel):
    id: int

    name: str
    category: str | None = None
    description: str | None = None
    typical_weaknesses: str | None = None
    relevant_subject: str | None = None
    notes: str | None = None

    is_archived: bool = False
    archived_at: UtcAwareDatetime | None = None
    archived_by_id: int | None = None
    capabilities: ThreatCapabilities | None = None
    created_at: UtcAwareDatetime
    updated_at: UtcAwareDatetime

    model_config = {"from_attributes": True}


class ThreatListCapabilities(BaseModel):
    """Collection-level Threat list action capabilities."""

    can_create: bool


class ThreatListResponse(BaseModel):
    items: list[ThreatRead]
    total: int
    offset: int
    limit: int
    capabilities: ThreatListCapabilities | None = None

    @computed_field
    def skip(self) -> int:
        return self.offset


class ThreatRiskLinkCreate(BaseModel):
    """Threat-end create payload: link this Threat to a Risk."""

    model_config = {"extra": "forbid"}

    risk_id: int = Field(..., ge=1)


class RiskThreatLinkCreate(BaseModel):
    """Risk-end create payload: link this Risk to a Threat."""

    model_config = {"extra": "forbid"}

    threat_id: int = Field(..., ge=1)


class ThreatRiskLinkCapabilities(BaseModel):
    """Per-row link actions: mutations follow the MANAGING end's write permission."""

    can_delete: bool


class ThreatRiskLinkRead(BaseModel):
    id: int
    threat_id: int
    risk_id: int
    # Display names for both ends, embedded by the list/create services so the
    # UI never falls back to raw ids (docs/agent/FRONTEND_DISPLAY_GUARDRAILS.md).
    threat_name: str | None = None
    risk_id_code: str | None = None
    risk_name: str | None = None
    capabilities: ThreatRiskLinkCapabilities | None = None
    created_at: UtcAwareDatetime

    model_config = {"from_attributes": True}
