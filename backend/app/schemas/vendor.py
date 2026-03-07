from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, Field


class VendorStatusEnum(str, Enum):
    active = "active"
    inactive = "inactive"


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

    status: VendorStatusEnum = VendorStatusEnum.active


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

    status: VendorStatusEnum | None = None

    # Reassessment scheduling (privileged updates only; enforced in endpoint)
    reassessment_cadence_months: int | None = Field(None, ge=1, le=120)
    next_reassessment_due_at: datetime | None = None


class VendorLinkedRiskSummary(BaseModel):
    risk_id: int
    risk_id_code: str
    risk_name: str


class VendorRead(VendorBase):
    id: int
    department_name: str | None = None
    outsourcing_owner_name: str | None = None
    linked_risks: list[VendorLinkedRiskSummary] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    reassessment_cadence_months: int
    next_reassessment_due_at: datetime | None = None
    last_assessed_at: datetime | None = None
    last_decided_at: datetime | None = None
    last_reassessment_reminded_at: datetime | None = None
    reassessment_triggered_reason: str | None = None
    reassessment_triggered_at: datetime | None = None

    model_config = {"from_attributes": True}


class VendorListResponse(BaseModel):
    items: list[VendorRead]
    total: int
    skip: int
    limit: int
