from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field

VENDOR_RISK_TAXONOMY_KEYS: tuple[str, ...] = (
    "regulatory_legal",
    "info_security_data",
    "cyber_supply_chain",
    "operational_continuity",
    "service_quality",
    "financial",
    "strategic_reputational",
    "governance_oversight",
    "technology_lockin",
    "human_factor",
    "concentration",
)


class VendorRiskCategoryKey(str, Enum):
    regulatory_legal = "regulatory_legal"
    info_security_data = "info_security_data"
    cyber_supply_chain = "cyber_supply_chain"
    operational_continuity = "operational_continuity"
    service_quality = "service_quality"
    financial = "financial"
    strategic_reputational = "strategic_reputational"
    governance_oversight = "governance_oversight"
    technology_lockin = "technology_lockin"
    human_factor = "human_factor"
    concentration = "concentration"


class VendorRiskFactorBase(BaseModel):
    category_key: VendorRiskCategoryKey
    description: str = Field(..., max_length=2000)


class VendorRiskFactorCreate(VendorRiskFactorBase):
    pass


class VendorRiskFactorUpdate(BaseModel):
    category_key: VendorRiskCategoryKey | None = None
    description: str | None = Field(None, max_length=2000)


class VendorRiskFactorRead(VendorRiskFactorBase):
    id: int
    vendor_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

