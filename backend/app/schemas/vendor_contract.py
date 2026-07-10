"""ICT Register Contract schemas (issue #44).

Write schemas carry the workbook's entered 08_Smlouvy columns only and forbid
unknown keys, so derived columns (vendor-name lookup, sub-outsourcing chain
display, duplicate check, hidden helpers — tickets #48/#49) are rejected at
the API boundary. Coded columns are validated against the workbook closed
lists in ``app.services._ict_register_reference``. The main-contract flag is
stored as entered: exactly-one-per-vendor is a DQ finding (#50), never a
write constraint.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.core.datetime_utils import UtcAwareDatetime
from app.services._ict_register_reference import is_closed_list_value

_CLOSED_LIST_FIELDS: dict[str, str] = {
    "records_system": "SystemEvidence",
    "arrangement_type": "TypUjednani",
    "main_contract": "AnoNe",
    "roi_scope": "AnoNe",
    "currency": "MenaList",
}


class VendorContractWriteValidators(BaseModel):
    """Shared closed-list enforcement for Contract write payloads."""

    model_config = {"extra": "forbid"}

    @field_validator(*_CLOSED_LIST_FIELDS, check_fields=False)
    @classmethod
    def _validate_closed_list_fields(cls, value: str | None, info) -> str | None:
        if value is None:
            return value
        list_name = _CLOSED_LIST_FIELDS[info.field_name]
        if not is_closed_list_value(list_name, value):
            raise ValueError(f"Value must come from the workbook closed list {list_name}")
        return value


class VendorContractBase(VendorContractWriteValidators):
    contract_reference: str | None = Field(None, max_length=100)
    internal_contract_number: str | None = Field(None, max_length=100)
    records_system: str | None = Field(None, max_length=20)
    arrangement_type: str | None = Field(None, max_length=50)
    main_contract: str | None = Field(None, max_length=10)
    overarching_arrangement_reference: str | None = Field(None, max_length=100)
    description: str | None = None
    roi_scope: str | None = Field(None, max_length=10)
    start_date: date | None = None
    end_date: date | None = None
    notice_period_entity_days: int | None = Field(None, ge=0)
    notice_period_provider_days: int | None = Field(None, ge=0)
    governing_law_country: str | None = Field(None, max_length=2)
    annual_cost: Decimal | None = Field(None, ge=0)
    currency: str | None = Field(None, max_length=3)
    note: str | None = None


class VendorContractCreate(VendorContractBase):
    pass


class VendorContractUpdate(VendorContractBase):
    pass


class VendorContractCapabilities(BaseModel):
    can_read: bool
    can_update: bool
    can_archive: bool
    can_restore: bool


class VendorContractRead(BaseModel):
    id: int
    vendor_id: int

    contract_reference: str | None = None
    internal_contract_number: str | None = None
    records_system: str | None = None
    arrangement_type: str | None = None
    main_contract: str | None = None
    overarching_arrangement_reference: str | None = None
    description: str | None = None
    roi_scope: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    notice_period_entity_days: int | None = None
    notice_period_provider_days: int | None = None
    governing_law_country: str | None = None
    annual_cost: Decimal | None = None
    currency: str | None = None
    note: str | None = None

    is_archived: bool = False
    archived_at: UtcAwareDatetime | None = None
    archived_by_id: int | None = None
    capabilities: VendorContractCapabilities | None = None
    created_at: UtcAwareDatetime
    updated_at: UtcAwareDatetime

    model_config = {"from_attributes": True}
