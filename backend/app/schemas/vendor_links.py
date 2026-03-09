from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel

from app.schemas.control import ControlMonitoringBundle, ControlStatusEnum
from app.schemas.risk import RiskStatusEnum
from app.schemas.vendor_shared import LinkedVendorRead


class VendorRiskLinkCreate(BaseModel):
    risk_id: int


class VendorControlLinkCreate(BaseModel):
    control_id: int


class VendorKRILinkCreate(BaseModel):
    kri_id: int


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


class LinkedKRIRead(BaseModel):
    id: int
    risk_id: int
    metric_name: str
    description: str
    current_value: float
    lower_limit: float
    upper_limit: float
    unit: str
    frequency: str
    monitoring_status: str | None = None
    monitoring_status_reason: str | None = None
    is_submitted_for_required_period: bool | None = None
    required_period_end: date | None = None
    required_due_date: date | None = None
    days_overdue: int | None = None
    warning_upper_margin_ratio: float | None = None
    risk_name: str | None = None
    risk_process: str | None = None
    risk_department_name: str | None = None
    is_archived: bool = False

    model_config = {"from_attributes": True}


class LinkedVendorRiskFactorRead(BaseModel):
    id: int
    vendor_id: int
    category_key: str
    description: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
