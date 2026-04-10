"""Schemas for orphaned items management."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict


class OrphanedItemRead(BaseModel):
    """Schema for reading orphaned item records."""

    id: int
    item_type: str  # "risk" | "control"
    item_id: int
    previous_owner_id: int
    previous_owner_name: Optional[str] = None
    previous_owner_email: Optional[str] = None
    orphaned_at: datetime
    resolved_at: Optional[datetime] = None
    resolved_by_id: Optional[int] = None
    new_owner_id: Optional[int] = None
    status: str  # "pending" | "resolved"

    model_config = ConfigDict(from_attributes=True)


class OrphanedItemDetail(BaseModel):
    """Enhanced schema with item details for display."""

    id: int
    item_type: str
    item_id: int
    item_name: str  # Risk name, Control name, or KRI name
    item_description: Optional[str] = None  # Brief description of the item
    item_identifier: Optional[str] = None  # risk_id_code, control ID, or KRI ID
    department_name: Optional[str] = None
    previous_owner_name: str
    previous_owner_email: str
    orphaned_at: datetime
    status: str

    model_config = ConfigDict(from_attributes=True)


class OrphanedItemResolve(BaseModel):
    """Schema for resolving an orphaned item."""

    new_owner_id: Optional[int] = None
    department_id: Optional[int] = None  # Optional explicit department override
    target_risk_id: Optional[int] = None  # For linking controls/kris to a specific risk


class OrphanedItemStats(BaseModel):
    """Statistics about orphaned items for the 4-bar layout."""

    risk_count: int
    control_count: int
    kri_count: int
    total_count: int


class OrphanScanResponse(BaseModel):
    """Response for orphan scan endpoint."""

    flagged: int


class OrphanedItemsOverview(BaseModel):
    """Combined governance overview payload for polling surfaces."""

    stats: OrphanedItemStats
    items: list[OrphanedItemDetail]
    last_scan_at: Optional[datetime] = None
    scan_status: Optional[str] = None


class OrphanedItemCreateInternal(BaseModel):
    """Internal schema for creating orphaned item records."""

    item_type: Literal["risk", "control"]
    item_id: int
    previous_owner_id: int
