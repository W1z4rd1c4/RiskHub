from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class VendorContractControlStatusEnum(str, Enum):
    met = "met"
    partial = "partial"
    missing = "missing"
    n_a = "n_a"


class VendorContractControlItem(BaseModel):
    template_key: str
    control_key: str
    title_key: str
    description_key: str | None = None

    applies: bool
    status: VendorContractControlStatusEnum

    evidence_reference: str | None = None
    notes: str | None = None
    last_reviewed_at: datetime | None = None
    reviewed_by_user_id: int | None = None


class VendorContractControlTemplate(BaseModel):
    template_key: str
    items: list[VendorContractControlItem]


class VendorContractControlsResponse(BaseModel):
    vendor_id: int
    templates: list[VendorContractControlTemplate]


class VendorContractControlUpdate(BaseModel):
    control_key: str = Field(..., max_length=100)
    status: VendorContractControlStatusEnum
    evidence_reference: str | None = Field(None, max_length=500)
    notes: str | None = None


class VendorContractControlsBulkUpdate(BaseModel):
    updates: list[VendorContractControlUpdate]

