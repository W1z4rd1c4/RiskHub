from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class VendorAnnualReportVendorRow(BaseModel):
    vendor_id: int
    name: str
    legal_name: Optional[str] = None
    vendor_type: str
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    outsourcing_owner_user_id: Optional[int] = None
    outsourcing_owner_name: Optional[str] = None

    process: str
    subprocess: Optional[str] = None

    supports_important_core_insurance_function: bool = False
    dora_relevant: bool = False
    is_significant_vendor: bool = False
    risk_score_1_5: int = 3

    last_decided_at: Optional[datetime] = None
    next_reassessment_due_at: Optional[datetime] = None
    reassessment_cadence_months: int = 36

    major_breaches_count: int = 0
    major_incidents_count: int = 0
    major_items_preview: list[str] = Field(default_factory=list)


class VendorAnnualReportProcessEvaluation(BaseModel):
    year: int
    total_active_vendors: int
    overdue_reassessments_count: int
    missing_exit_plans_count: int
    missing_contingency_plans_count: int
    major_breaches_count: int
    major_incidents_count: int


class VendorAnnualReportData(BaseModel):
    year: int
    generated_at: datetime
    vendors: list[VendorAnnualReportVendorRow]
    process_evaluation: VendorAnnualReportProcessEvaluation


class VendorDoraRegisterRow(BaseModel):
    vendor_id: int
    name: str
    legal_name: Optional[str] = None
    registration_id: Optional[str] = None

    vendor_type: str
    dora_relevant: bool = False
    is_significant_vendor: bool = False
    supports_important_core_insurance_function: bool = False
    risk_score_1_5: int = 3

    outsourcing_owner_user_id: Optional[int] = None
    outsourcing_owner_name: Optional[str] = None
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    process: str
    subprocess: Optional[str] = None

    last_decided_at: Optional[datetime] = None
    next_reassessment_due_at: Optional[datetime] = None
    reassessment_cadence_months: int = 36

    replaceability: Optional[str] = None
    has_alternative_providers: bool = False

