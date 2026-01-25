from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class VendorRiskLinkCreate(BaseModel):
    risk_id: int


class VendorControlLinkCreate(BaseModel):
    control_id: int


class LinkedRiskRead(BaseModel):
    id: int
    risk_id_code: str
    name: str
    process: str
    category: str | None = None
    department_id: int | None = None
    department_name: str | None = None

    model_config = {"from_attributes": True}


class LinkedControlRead(BaseModel):
    id: int
    name: str
    department_id: int | None = None
    department_name: str | None = None
    status: str | None = None

    model_config = {"from_attributes": True}


class LinkedVendorRiskFactorRead(BaseModel):
    id: int
    vendor_id: int
    category_key: str
    description: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
