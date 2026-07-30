from __future__ import annotations

from fastapi.encoders import jsonable_encoder
from sqlalchemy import asc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import vendor_contract as audit_vendor_contract
from app.models import User, VendorContract
from app.models._archivable import archived_clause
from app.schemas.vendor_contract import VendorContractCreate, VendorContractRead, VendorContractUpdate
from app.services.transaction_boundary import commit_service_boundary

from .contract_policy import (
    assert_contract_archive_allowed,
    assert_contract_mutation_vendor,
    assert_contract_restore_allowed,
    assert_contract_update_allowed,
    assert_contract_vendor_readable,
)
from .contract_projection import (
    serialize_contract_collection,
    serialize_contract_detail_with_derived,
)


async def create_vendor_contract_detail(
    *,
    db: AsyncSession,
    vendor_id: int,
    payload: VendorContractCreate,
    current_user: User,
) -> VendorContractRead:
    vendor = await assert_contract_mutation_vendor(db, vendor_id=vendor_id, current_user=current_user)
    from app.services._governed_mutations.vendor_mutations import (
        submit_vendor_child_mutation_if_required,
    )

    values = payload.model_dump(exclude={"request_reason"})
    proposed = jsonable_encoder(values)
    queued = await submit_vendor_child_mutation_if_required(
        db=db,
        vendor=vendor,
        mutation_kind="vendor.contract.create",
        child_id=None,
        before=None,
        after=proposed,
        current_user=current_user,
        request_reason=payload.request_reason,
    )
    if queued is not None:
        return queued

    contract = VendorContract(vendor_id=vendor.id, **values)
    db.add(contract)
    await db.flush()
    vendor.governance_version += 1

    await audit_vendor_contract.vendor_contract_created(db, actor=current_user, contract=contract)
    await commit_service_boundary(db, boundary="vendor_contract_create")
    await db.refresh(contract)
    return await serialize_contract_detail_with_derived(
        db, contract, current_user=current_user, vendor=vendor
    )


async def list_vendor_contract_collection(
    *,
    db: AsyncSession,
    vendor_id: int,
    current_user: User,
    include_archived: bool,
) -> list[VendorContractRead]:
    vendor = await assert_contract_vendor_readable(db, vendor_id=vendor_id, current_user=current_user)

    query = select(VendorContract).where(VendorContract.vendor_id == vendor.id)
    if not include_archived:
        query = query.where(archived_clause(VendorContract, archived=False))
    rows = (await db.execute(query.order_by(asc(VendorContract.id)))).scalars().all()
    return await serialize_contract_collection(db, list(rows), current_user=current_user, vendor=vendor)


async def update_vendor_contract_detail(
    *,
    db: AsyncSession,
    vendor_id: int,
    contract_id: int,
    payload: VendorContractUpdate,
    current_user: User,
) -> VendorContractRead:
    contract = await assert_contract_update_allowed(
        db, vendor_id=vendor_id, contract_id=contract_id, current_user=current_user
    )
    vendor = await assert_contract_vendor_readable(db, vendor_id=vendor_id, current_user=current_user)
    updates = {field: getattr(payload, field) for field in payload.model_fields_set}
    updates.pop("request_reason", None)
    if not updates:
        return await serialize_contract_detail_with_derived(
            db, contract, current_user=current_user, vendor=vendor
        )
    from app.services._governed_mutations.vendor_mutations import (
        submit_vendor_child_mutation_if_required,
    )

    before = {field: jsonable_encoder(getattr(contract, field)) for field in updates}
    after = jsonable_encoder(updates)
    queued = await submit_vendor_child_mutation_if_required(
        db=db,
        vendor=vendor,
        mutation_kind="vendor.contract.edit",
        child_id=contract.id,
        before=before,
        after=after,
        current_user=current_user,
        request_reason=payload.request_reason,
    )
    if queued is not None:
        return queued

    changes = audit_vendor_contract.vendor_contract_update_changes(contract, updates)
    for field, value in updates.items():
        setattr(contract, field, value)
    vendor.governance_version += 1

    await audit_vendor_contract.vendor_contract_updated(
        db, actor=current_user, contract=contract, changes=changes
    )
    await commit_service_boundary(db, boundary="vendor_contract_update")
    await db.refresh(contract)
    return await serialize_contract_detail_with_derived(
        db, contract, current_user=current_user, vendor=vendor
    )


async def archive_vendor_contract_detail(
    *,
    db: AsyncSession,
    vendor_id: int,
    contract_id: int,
    current_user: User,
    request_reason: str | None = None,
) -> object | None:
    contract = await assert_contract_archive_allowed(
        db, vendor_id=vendor_id, contract_id=contract_id, current_user=current_user
    )
    vendor = await assert_contract_vendor_readable(
        db, vendor_id=vendor_id, current_user=current_user
    )
    from app.services._governed_mutations.vendor_mutations import (
        submit_vendor_child_mutation_if_required,
    )

    queued = await submit_vendor_child_mutation_if_required(
        db=db,
        vendor=vendor,
        mutation_kind="vendor.contract.archive",
        child_id=contract.id,
        before={"is_archived": False},
        after={"is_archived": True},
        current_user=current_user,
        request_reason=request_reason,
    )
    if queued is not None:
        return queued
    changes = audit_vendor_contract.vendor_contract_archive_changes(contract)
    contract.mark_archived(current_user)
    vendor.governance_version += 1

    await audit_vendor_contract.vendor_contract_archived(
        db, actor=current_user, contract=contract, changes=changes
    )
    await commit_service_boundary(db, boundary="vendor_contract_archive")


async def restore_vendor_contract_detail(
    *,
    db: AsyncSession,
    vendor_id: int,
    contract_id: int,
    current_user: User,
) -> VendorContractRead:
    contract = await assert_contract_restore_allowed(
        db, vendor_id=vendor_id, contract_id=contract_id, current_user=current_user
    )
    vendor = await assert_contract_vendor_readable(db, vendor_id=vendor_id, current_user=current_user)
    changes = audit_vendor_contract.vendor_contract_restore_changes(contract)
    contract.mark_restored(current_user)
    vendor.governance_version += 1

    await audit_vendor_contract.vendor_contract_restored(
        db, actor=current_user, contract=contract, changes=changes
    )
    await commit_service_boundary(db, boundary="vendor_contract_restore")
    await db.refresh(contract)
    return await serialize_contract_detail_with_derived(
        db, contract, current_user=current_user, vendor=vendor
    )
