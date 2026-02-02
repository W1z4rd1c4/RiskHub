from __future__ import annotations

from enum import Enum
from datetime import datetime

from pydantic import BaseModel, Field


class VendorPlanStatusEnum(str, Enum):
    not_started = "not_started"
    in_progress = "in_progress"
    complete = "complete"


class VendorExitPlanRead(BaseModel):
    status: VendorPlanStatusEnum
    plan_reference: str | None = None
    notes: str | None = None
    last_reviewed_at: datetime | None = None
    last_tested_at: datetime | None = None


class VendorContingencyPlanRead(BaseModel):
    max_tolerable_outage_hours: int | None = None
    impact_confidentiality: bool = False
    impact_integrity: bool = False
    impact_authenticity: bool = False
    impact_availability: bool = False

    status: VendorPlanStatusEnum
    plan_reference: str | None = None
    notes: str | None = None
    last_reviewed_at: datetime | None = None
    last_tested_at: datetime | None = None


class VendorResilienceRead(BaseModel):
    vendor_id: int
    is_required: bool
    contingency_required: bool

    exit_plan: VendorExitPlanRead | None = None
    contingency_plan: VendorContingencyPlanRead | None = None

    missing_exit_plan: bool
    missing_contingency_plan: bool


class VendorExitPlanUpdate(BaseModel):
    status: VendorPlanStatusEnum
    plan_reference: str | None = Field(None, max_length=500)
    notes: str | None = None
    last_reviewed_at: datetime | None = None
    last_tested_at: datetime | None = None


class VendorContingencyPlanUpdate(BaseModel):
    max_tolerable_outage_hours: int | None = Field(None, ge=0)
    impact_confidentiality: bool = False
    impact_integrity: bool = False
    impact_authenticity: bool = False
    impact_availability: bool = False

    status: VendorPlanStatusEnum
    plan_reference: str | None = Field(None, max_length=500)
    notes: str | None = None
    last_reviewed_at: datetime | None = None
    last_tested_at: datetime | None = None


class VendorResilienceUpdate(BaseModel):
    exit_plan: VendorExitPlanUpdate | None = None
    contingency_plan: VendorContingencyPlanUpdate | None = None

