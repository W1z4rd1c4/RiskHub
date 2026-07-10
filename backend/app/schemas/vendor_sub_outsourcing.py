"""ICT Register Sub-outsourcing schemas (issue #45).

Write schemas carry the workbook's entered 09_Subdodávky columns only and
forbid unknown keys, so derived columns (Rank, contract/vendor/name lookups,
the critical-service lookup, the duplicate/chain-error check, hidden helpers
— ticket #49) are rejected at the API boundary. Coded columns are validated
against the workbook closed lists (TypKodu, ZemeList) and the S01-S19 ICT
service taxonomy in ``app.services._ict_register_reference``. Chain
integrity (Contract belongs to the Vendor; predecessor in the same Vendor +
Contract; no self-references or cycles) is a service-policy rule, not a
schema rule.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from app.core.datetime_utils import UtcAwareDatetime
from app.services._ict_register_reference import ICT_SERVICE_TAXONOMY, is_closed_list_value

_CLOSED_LIST_FIELDS: dict[str, str] = {
    "identifier_type": "TypKodu",
    "country": "ZemeList",
}


class VendorSubOutsourcingWriteValidators(BaseModel):
    """Shared closed-list and taxonomy enforcement for Sub-outsourcing writes."""

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

    @field_validator("ict_service_code", check_fields=False)
    @classmethod
    def _validate_ict_service_code(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if value not in ICT_SERVICE_TAXONOMY:
            raise ValueError("Value must be an S01-S19 ICT service taxonomy code")
        return value


class VendorSubOutsourcingBase(VendorSubOutsourcingWriteValidators):
    predecessor_id: int | None = None
    sub_provider_name: str | None = Field(None, max_length=255)
    identifier_type: str | None = Field(None, max_length=20)
    identifier_value: str | None = Field(None, max_length=100)
    country: str | None = Field(None, max_length=2)
    ict_service_code: str | None = Field(None, max_length=3)
    note: str | None = None


class VendorSubOutsourcingCreate(VendorSubOutsourcingBase):
    contract_id: int


class VendorSubOutsourcingUpdate(VendorSubOutsourcingBase):
    contract_id: int | None = None

    @field_validator("contract_id")
    @classmethod
    def _contract_stays_required(cls, value: int | None) -> int:
        # Runs only for explicitly provided values (validate_default is off):
        # every chain hangs off a Contract, so null can never be written.
        if value is None:
            raise ValueError("Sub-outsourcing entries always hang off a Contract")
        return value


class VendorSubOutsourcingCapabilities(BaseModel):
    can_read: bool
    can_update: bool
    can_archive: bool
    can_restore: bool


class VendorSubOutsourcingRead(BaseModel):
    id: int
    vendor_id: int
    contract_id: int
    predecessor_id: int | None = None

    sub_provider_name: str | None = None
    identifier_type: str | None = None
    identifier_value: str | None = None
    country: str | None = None
    ict_service_code: str | None = None
    note: str | None = None

    is_archived: bool = False
    archived_at: UtcAwareDatetime | None = None
    archived_by_id: int | None = None
    capabilities: VendorSubOutsourcingCapabilities | None = None
    created_at: UtcAwareDatetime
    updated_at: UtcAwareDatetime

    model_config = {"from_attributes": True}
