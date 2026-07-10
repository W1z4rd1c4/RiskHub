from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, Vendor, VendorContract
from app.schemas.vendor_contract import VendorContractDerived, VendorContractRead
from app.services._authorization_capabilities import vendor_contract_capabilities

from .projection import compute_vendor_register_derivation


async def load_contract_derived_blocks(
    db: AsyncSession, vendor: Vendor, contracts: list[VendorContract]
) -> dict[int, VendorContractDerived]:
    """Compute the engine-derived 08_Smlouvy block per Contract (#49).

    The owning Vendor is the graph target — the loader pulls the whole
    Contract/Sub-outsourcing registers for the register-wide duplicate check
    and the chain display, so every contract of this Vendor is authoritative.
    """
    if not contracts:
        return {}
    derivation = await compute_vendor_register_derivation(db, [vendor])
    return {
        contract.id: VendorContractDerived.model_validate(derivation.contracts[contract.id])
        for contract in contracts
    }


def serialize_contract_detail(
    contract: VendorContract,
    *,
    current_user: User,
    vendor: Vendor,
    derived: VendorContractDerived | None = None,
) -> VendorContractRead:
    base = VendorContractRead.model_validate(contract)
    return base.model_copy(
        update={
            "capabilities": vendor_contract_capabilities(
                current_user, contract, vendor_archived=bool(vendor.is_archived)
            ),
            "derived": derived,
        }
    )


async def serialize_contract_detail_with_derived(
    db: AsyncSession,
    contract: VendorContract,
    *,
    current_user: User,
    vendor: Vendor,
) -> VendorContractRead:
    blocks = await load_contract_derived_blocks(db, vendor, [contract])
    return serialize_contract_detail(
        contract, current_user=current_user, vendor=vendor, derived=blocks.get(contract.id)
    )


async def serialize_contract_collection(
    db: AsyncSession,
    contracts: list[VendorContract],
    *,
    current_user: User,
    vendor: Vendor,
) -> list[VendorContractRead]:
    blocks = await load_contract_derived_blocks(db, vendor, contracts)
    return [
        serialize_contract_detail(
            contract, current_user=current_user, vendor=vendor, derived=blocks.get(contract.id)
        )
        for contract in contracts
    ]
