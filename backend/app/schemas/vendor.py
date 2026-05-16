from __future__ import annotations

from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, Field, computed_field

from app.core.datetime_utils import UtcAwareDatetime
from app.schemas.collection import CollectionGroupRead


class VendorTypeEnum(str, Enum):
    ict = "ict"
    outsourcing = "outsourcing"
    professional_services = "professional_services"
    partner = "partner"
    other = "other"


class VendorReplaceabilityEnum(str, Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"


class VendorBase(BaseModel):
    name: str = Field(..., max_length=255)
    legal_name: str | None = Field(None, max_length=255)
    registration_id: str | None = Field(None, max_length=100)
    country: str | None = Field(None, max_length=2)
    website: str | None = Field(None, max_length=255)
    description: str | None = None

    process: str = Field(..., max_length=255)
    subprocess: str | None = Field(None, max_length=255)
    department_id: int | None = None

    outsourcing_owner_user_id: int

    vendor_type: VendorTypeEnum = VendorTypeEnum.other
    risk_score_1_5: int = Field(3, ge=1, le=5)
    supports_important_core_insurance_function: bool = False
    dora_relevant: bool = False
    is_significant_vendor: bool = False
    materiality_assessed_max_impact_pct_own_funds: Decimal | None = Field(None, ge=0)
    replaceability: VendorReplaceabilityEnum | None = None
    has_alternative_providers: bool = False


class VendorCreate(VendorBase):
    pass


class VendorUpdate(BaseModel):
    name: str | None = Field(None, max_length=255)
    legal_name: str | None = Field(None, max_length=255)
    registration_id: str | None = Field(None, max_length=100)
    country: str | None = Field(None, max_length=2)
    website: str | None = Field(None, max_length=255)
    description: str | None = None

    process: str | None = Field(None, max_length=255)
    subprocess: str | None = Field(None, max_length=255)
    department_id: int | None = None

    outsourcing_owner_user_id: int | None = None

    vendor_type: VendorTypeEnum | None = None
    risk_score_1_5: int | None = Field(None, ge=1, le=5)
    supports_important_core_insurance_function: bool | None = None
    dora_relevant: bool | None = None
    is_significant_vendor: bool | None = None
    materiality_assessed_max_impact_pct_own_funds: Decimal | None = Field(None, ge=0)
    replaceability: VendorReplaceabilityEnum | None = None
    has_alternative_providers: bool | None = None


class VendorLinkedRiskSummary(BaseModel):
    risk_id: int
    risk_id_code: str
    risk_name: str


class VendorCapabilities(BaseModel):
    can_read: bool
    can_update: bool
    can_archive: bool
    can_restore: bool
    can_create_linked_risk: bool
    can_create_linked_control: bool
    can_create_linked_kri: bool
    can_link_risk: bool
    can_link_control: bool
    can_link_kri: bool
    can_view_linked_risks: bool
    can_view_linked_controls: bool
    can_view_linked_kris: bool
    can_create_issue: bool


class VendorRead(VendorBase):
    id: int
    is_archived: bool = False
    archived_at: UtcAwareDatetime | None = None
    archived_by_id: int | None = None
    department_name: str | None = None
    outsourcing_owner_name: str | None = None
    linked_risks: list[VendorLinkedRiskSummary] = Field(default_factory=list)
    capabilities: VendorCapabilities | None = None
    created_at: UtcAwareDatetime
    updated_at: UtcAwareDatetime

    model_config = {"from_attributes": True}


class VendorListCapabilities(BaseModel):
    """Collection-level vendor list action capabilities."""

    can_export: bool
    can_create: bool
    can_view_risk_contexts: bool


class VendorListResponse(BaseModel):
    items: list[VendorRead]
    total: int
    offset: int
    limit: int
    groups: list[CollectionGroupRead] | None = None
    capabilities: VendorListCapabilities | None = None

    @computed_field
    def skip(self) -> int:
        return self.offset
