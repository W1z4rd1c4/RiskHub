from __future__ import annotations

from fastapi.encoders import jsonable_encoder
from sqlalchemy import asc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import vendor_sub_outsourcing as audit_vendor_sub_outsourcing
from app.models import User, VendorSubOutsourcing
from app.models._archivable import archived_clause
from app.schemas.vendor_sub_outsourcing import (
    VendorSubOutsourcingCreate,
    VendorSubOutsourcingRead,
    VendorSubOutsourcingUpdate,
)
from app.services.transaction_boundary import commit_service_boundary

from .sub_outsourcing_policy import (
    acquire_sub_outsourcing_chain_lock,
    assert_chain_contract,
    assert_chain_predecessor,
    assert_sub_outsourcing_archive_allowed,
    assert_sub_outsourcing_mutation_vendor,
    assert_sub_outsourcing_restore_allowed,
    assert_sub_outsourcing_update_allowed,
    assert_sub_outsourcing_vendor_readable,
)
from .sub_outsourcing_projection import (
    serialize_sub_outsourcing_collection,
    serialize_sub_outsourcing_detail_with_derived,
)


async def create_vendor_sub_outsourcing_detail(
    *,
    db: AsyncSession,
    vendor_id: int,
    payload: VendorSubOutsourcingCreate,
    current_user: User,
) -> VendorSubOutsourcingRead:
    await acquire_sub_outsourcing_chain_lock(db, vendor_id=vendor_id)
    vendor = await assert_sub_outsourcing_mutation_vendor(
        db, vendor_id=vendor_id, current_user=current_user
    )
    await assert_chain_contract(db, vendor_id=vendor.id, contract_id=payload.contract_id)
    if payload.predecessor_id is not None:
        await assert_chain_predecessor(
            db,
            vendor_id=vendor.id,
            contract_id=payload.contract_id,
            predecessor_id=payload.predecessor_id,
        )
    from app.services._governed_mutations.vendor_mutations import (
        submit_vendor_child_mutation_if_required,
    )

    values = payload.model_dump(exclude={"request_reason"})
    proposed = jsonable_encoder(values)
    queued = await submit_vendor_child_mutation_if_required(
        db=db,
        vendor=vendor,
        mutation_kind="vendor.sub_outsourcing.create",
        child_id=None,
        before=None,
        after=proposed,
        current_user=current_user,
        request_reason=payload.request_reason,
    )
    if queued is not None:
        return queued

    entry = VendorSubOutsourcing(vendor_id=vendor.id, **values)
    db.add(entry)
    await db.flush()
    vendor.governance_version += 1

    await audit_vendor_sub_outsourcing.vendor_sub_outsourcing_created(db, actor=current_user, entry=entry)
    await commit_service_boundary(db, boundary="vendor_sub_outsourcing_create")
    await db.refresh(entry)
    return await serialize_sub_outsourcing_detail_with_derived(
        db, entry, current_user=current_user, vendor=vendor
    )


async def list_vendor_sub_outsourcing_collection(
    *,
    db: AsyncSession,
    vendor_id: int,
    current_user: User,
    include_archived: bool,
) -> list[VendorSubOutsourcingRead]:
    vendor = await assert_sub_outsourcing_vendor_readable(
        db, vendor_id=vendor_id, current_user=current_user
    )

    query = select(VendorSubOutsourcing).where(VendorSubOutsourcing.vendor_id == vendor.id)
    if not include_archived:
        query = query.where(archived_clause(VendorSubOutsourcing, archived=False))
    rows = (await db.execute(query.order_by(asc(VendorSubOutsourcing.id)))).scalars().all()
    return await serialize_sub_outsourcing_collection(db, list(rows), current_user=current_user, vendor=vendor)


async def update_vendor_sub_outsourcing_detail(
    *,
    db: AsyncSession,
    vendor_id: int,
    entry_id: int,
    payload: VendorSubOutsourcingUpdate,
    current_user: User,
) -> VendorSubOutsourcingRead:
    await acquire_sub_outsourcing_chain_lock(db, vendor_id=vendor_id)
    entry = await assert_sub_outsourcing_update_allowed(
        db, vendor_id=vendor_id, entry_id=entry_id, current_user=current_user
    )
    vendor = await assert_sub_outsourcing_vendor_readable(
        db, vendor_id=vendor_id, current_user=current_user
    )
    updates = {field: getattr(payload, field) for field in payload.model_fields_set}
    updates.pop("request_reason", None)
    if not updates:
        return await serialize_sub_outsourcing_detail_with_derived(
            db, entry, current_user=current_user, vendor=vendor
        )

    # Chain integrity holds for the entry's POST-mutation state.
    new_contract_id = updates.get("contract_id", entry.contract_id)
    new_predecessor_id = updates.get("predecessor_id", entry.predecessor_id)
    if "contract_id" in updates:
        await assert_chain_contract(db, vendor_id=vendor.id, contract_id=new_contract_id)
    if new_predecessor_id is not None and ("contract_id" in updates or "predecessor_id" in updates):
        await assert_chain_predecessor(
            db,
            vendor_id=vendor.id,
            contract_id=new_contract_id,
            predecessor_id=new_predecessor_id,
            entry_id=entry.id,
        )
    from app.services._governed_mutations.vendor_mutations import (
        submit_vendor_child_mutation_if_required,
    )

    before = {field: jsonable_encoder(getattr(entry, field)) for field in updates}
    after = jsonable_encoder(updates)
    queued = await submit_vendor_child_mutation_if_required(
        db=db,
        vendor=vendor,
        mutation_kind="vendor.sub_outsourcing.edit",
        child_id=entry.id,
        before=before,
        after=after,
        current_user=current_user,
        request_reason=payload.request_reason,
    )
    if queued is not None:
        return queued

    changes = audit_vendor_sub_outsourcing.vendor_sub_outsourcing_update_changes(entry, updates)
    for field, value in updates.items():
        setattr(entry, field, value)
    vendor.governance_version += 1

    await audit_vendor_sub_outsourcing.vendor_sub_outsourcing_updated(
        db, actor=current_user, entry=entry, changes=changes
    )
    await commit_service_boundary(db, boundary="vendor_sub_outsourcing_update")
    await db.refresh(entry)
    return await serialize_sub_outsourcing_detail_with_derived(
        db, entry, current_user=current_user, vendor=vendor
    )


async def archive_vendor_sub_outsourcing_detail(
    *,
    db: AsyncSession,
    vendor_id: int,
    entry_id: int,
    current_user: User,
    request_reason: str | None = None,
) -> object | None:
    await acquire_sub_outsourcing_chain_lock(db, vendor_id=vendor_id)
    entry = await assert_sub_outsourcing_archive_allowed(
        db, vendor_id=vendor_id, entry_id=entry_id, current_user=current_user
    )
    vendor = await assert_sub_outsourcing_vendor_readable(
        db, vendor_id=vendor_id, current_user=current_user
    )
    from app.services._governed_mutations.vendor_mutations import (
        submit_vendor_child_mutation_if_required,
    )

    queued = await submit_vendor_child_mutation_if_required(
        db=db,
        vendor=vendor,
        mutation_kind="vendor.sub_outsourcing.archive",
        child_id=entry.id,
        before={"is_archived": False},
        after={"is_archived": True},
        current_user=current_user,
        request_reason=request_reason,
    )
    if queued is not None:
        return queued
    changes = audit_vendor_sub_outsourcing.vendor_sub_outsourcing_archive_changes(entry)
    entry.mark_archived(current_user)
    vendor.governance_version += 1

    await audit_vendor_sub_outsourcing.vendor_sub_outsourcing_archived(
        db, actor=current_user, entry=entry, changes=changes
    )
    await commit_service_boundary(db, boundary="vendor_sub_outsourcing_archive")


async def restore_vendor_sub_outsourcing_detail(
    *,
    db: AsyncSession,
    vendor_id: int,
    entry_id: int,
    current_user: User,
) -> VendorSubOutsourcingRead:
    await acquire_sub_outsourcing_chain_lock(db, vendor_id=vendor_id)
    entry = await assert_sub_outsourcing_restore_allowed(
        db, vendor_id=vendor_id, entry_id=entry_id, current_user=current_user
    )
    vendor = await assert_sub_outsourcing_vendor_readable(
        db, vendor_id=vendor_id, current_user=current_user
    )
    changes = audit_vendor_sub_outsourcing.vendor_sub_outsourcing_restore_changes(entry)
    entry.mark_restored(current_user)
    vendor.governance_version += 1

    await audit_vendor_sub_outsourcing.vendor_sub_outsourcing_restored(
        db, actor=current_user, entry=entry, changes=changes
    )
    await commit_service_boundary(db, boundary="vendor_sub_outsourcing_restore")
    await db.refresh(entry)
    return await serialize_sub_outsourcing_detail_with_derived(
        db, entry, current_user=current_user, vendor=vendor
    )
