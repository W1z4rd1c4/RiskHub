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

from typing import Literal

from pydantic import BaseModel, Field, computed_field, field_validator

from app.core.datetime_utils import UtcAwareDatetime
from app.schemas.collection import CollectionGroupRead
from app.services._ict_register_reference import THREAT_CATEGORY_CODES


class ThreatWriteValidators(BaseModel):
    """Shared closed-list enforcement for Threat write payloads."""

    model_config = {"extra": "forbid"}

    @field_validator("category", check_fields=False)
    @classmethod
    def _validate_category(cls, value: str | None) -> str | None:
        if value is not None and value not in THREAT_CATEGORY_CODES:
            raise ValueError("Value must be a canonical Threat category code")
        return value


class ThreatBase(ThreatWriteValidators):
    name: str = Field(..., min_length=1, max_length=255)
    threat_steward_user_id: int = Field(..., ge=1)
    category: str | None = Field(None, max_length=50)
    description: str | None = None
    typical_weaknesses: str | None = None
    relevant_subject: str | None = Field(None, max_length=255)
    notes: str | None = None


class ThreatCreate(ThreatBase):
    pass


class ThreatUpdate(ThreatWriteValidators):
    name: str | None = Field(None, min_length=1, max_length=255)
    threat_steward_user_id: int | None = Field(None, ge=1)
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


class ThreatStewardRead(BaseModel):
    """Safe display projection; intentionally excludes the database user id."""

    name: str
    email: str
    role_name: str
    department_name: str | None = None


class ThreatRead(BaseModel):
    id: int
    threat_steward_user_id: int | None = None
    threat_steward: ThreatStewardRead | None = None
    steward_orphaned: bool = False
    stewardship_status: Literal[
        "assigned",
        "legacy_unassigned",
        "pending_governance",
        "invalid_assignment",
    ] = "assigned"

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
    can_export: bool = False


class ThreatFacetOption(BaseModel):
    """One permission-scoped Threat facet option."""

    value: str
    label: str
    count: int
    disabled: bool = False
    selected: bool = False


class ThreatLookupOption(BaseModel):
    """Safe remote Threat-filter lookup; hidden Risk context is excluded."""

    id: int
    label: str
    secondary_label: str | None = None
    disabled: bool = False
    count: int | None = None


class ThreatListItem(ThreatRead):
    """Threat list projection with permission-scoped linked-Risk metadata."""

    # Hidden Risk links never contribute to this projection.
    visible_linked_risk_count: int = 0


class ThreatListResponse(BaseModel):
    items: list[ThreatListItem]
    total: int
    offset: int
    limit: int
    capabilities: ThreatListCapabilities | None = None
    groups: list[CollectionGroupRead] = Field(default_factory=list)
    facets: dict[str, list[ThreatFacetOption]] = Field(default_factory=dict)

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
