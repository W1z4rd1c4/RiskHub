from __future__ import annotations

from enum import Enum
from datetime import datetime

from pydantic import BaseModel, Field


class VendorRelationshipTypeEnum(str, Enum):
    subcontractor = "subcontractor"
    reseller = "reseller"
    parent_company = "parent_company"
    other = "other"


class VendorRelationshipRead(BaseModel):
    id: int
    vendor_id: int
    related_vendor_id: int
    related_vendor_name: str | None = None
    relationship_type: VendorRelationshipTypeEnum
    created_at: datetime


class VendorRelationshipCreate(BaseModel):
    related_vendor_id: int
    relationship_type: VendorRelationshipTypeEnum = VendorRelationshipTypeEnum.subcontractor


class VendorDependencyRead(BaseModel):
    id: int
    vendor_service_id: int
    risk_id: int | None = None
    risk_name: str | None = None
    department_id: int | None = None
    department_name: str | None = None
    supported_function_name: str | None = None
    created_at: datetime


class VendorDependencyCreate(BaseModel):
    risk_id: int | None = None
    department_id: int | None = None
    supported_function_name: str | None = Field(None, max_length=255)


class VendorServiceRead(BaseModel):
    id: int
    vendor_id: int
    service_name: str
    notes: str | None = None
    dependencies: list[VendorDependencyRead]
    created_at: datetime
    updated_at: datetime


class VendorServiceCreate(BaseModel):
    service_name: str = Field(..., max_length=255)
    notes: str | None = None


class VendorServiceUpdate(BaseModel):
    service_name: str | None = Field(None, max_length=255)
    notes: str | None = None


class VendorDependencyGraphNode(BaseModel):
    vendor_id: int
    vendor_name: str
    relationship_type: VendorRelationshipTypeEnum | None = None
    children: list["VendorDependencyGraphNode"] = Field(default_factory=list)


VendorDependencyGraphNode.model_rebuild()


class VendorConcentrationFlag(BaseModel):
    key: str
    severity: str
    reason: str


class VendorConcentrationSummary(BaseModel):
    score: int
    flags: list[VendorConcentrationFlag]


class VendorDependenciesResponse(BaseModel):
    vendor_id: int
    relationships: list[VendorRelationshipRead]
    services: list[VendorServiceRead]
    relationship_tree: VendorDependencyGraphNode
    concentration: VendorConcentrationSummary
