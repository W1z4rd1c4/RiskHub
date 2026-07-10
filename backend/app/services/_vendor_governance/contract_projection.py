from __future__ import annotations

from app.models import User, Vendor, VendorContract
from app.schemas.vendor_contract import VendorContractRead
from app.services._authorization_capabilities import vendor_contract_capabilities


def serialize_contract_detail(
    contract: VendorContract, *, current_user: User, vendor: Vendor
) -> VendorContractRead:
    base = VendorContractRead.model_validate(contract)
    return base.model_copy(
        update={
            "capabilities": vendor_contract_capabilities(
                current_user, contract, vendor_archived=bool(vendor.is_archived)
            )
        }
    )


def serialize_contract_collection(
    contracts: list[VendorContract], *, current_user: User, vendor: Vendor
) -> list[VendorContractRead]:
    return [
        serialize_contract_detail(contract, current_user=current_user, vendor=vendor)
        for contract in contracts
    ]
