from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.schemas.control import ControlMonitoringBundle, ControlStatusEnum
from app.schemas.risk import RiskStatusEnum


class VendorRiskLinkCreate(BaseModel):
    risk_id: int


class VendorControlLinkCreate(BaseModel):
    control_id: int


class LinkedRiskRead(BaseModel):
    id: int
    risk_id_code: str
    name: str
    process: str
    risk_type: str | None = None
    category: str | None = None
    gross_score: int | None = None
    net_score: int | None = None
    is_priority: bool = False
    department_id: int | None = None
    department_name: str | None = None
    status: RiskStatusEnum | None = None

    model_config = {"from_attributes": True}


class LinkedControlRead(ControlMonitoringBundle):
    id: int
    name: str
    frequency: str
    risk_level: int
    department_id: int | None = None
    department_name: str | None = None
    status: ControlStatusEnum | None = None

    model_config = {"from_attributes": True}


class LinkedVendorRiskFactorRead(BaseModel):
    id: int
    vendor_id: int
    category_key: str
    description: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
