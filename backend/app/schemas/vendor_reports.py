from __future__ import annotations

from datetime import datetime
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


class VendorAnnualReportProcessEvaluation(BaseModel):
    year: int
    total_active_vendors: int
    high_risk_vendors_count: int
    dora_relevant_count: int
    significant_vendors_count: int


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

    replaceability: Optional[str] = None
    has_alternative_providers: bool = False
