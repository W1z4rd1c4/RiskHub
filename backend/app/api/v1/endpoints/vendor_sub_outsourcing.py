from __future__ import annotations

from fastapi import APIRouter, Body, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.approval_request import ApprovalQueuedResponse
from app.schemas.vendor_sub_outsourcing import (
    VendorSubOutsourcingArchiveRequest,
    VendorSubOutsourcingCreate,
    VendorSubOutsourcingRead,
    VendorSubOutsourcingUpdate,
)
from app.services._vendor_governance.sub_outsourcing_lifecycle import (
    archive_vendor_sub_outsourcing_detail,
    create_vendor_sub_outsourcing_detail,
    list_vendor_sub_outsourcing_collection,
    restore_vendor_sub_outsourcing_detail,
    update_vendor_sub_outsourcing_detail,
)

router = APIRouter()


@router.get("/vendors/{vendor_id}/sub-outsourcing", response_model=list[VendorSubOutsourcingRead])
async def list_vendor_sub_outsourcing(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendor_contracts", "read")),
    include_archived: bool = Query(False, description="Include archived sub-outsourcing entries"),
):
    return await list_vendor_sub_outsourcing_collection(
        db=db, vendor_id=vendor_id, current_user=current_user, include_archived=include_archived
    )


@router.post(
    "/vendors/{vendor_id}/sub-outsourcing",
    response_model=VendorSubOutsourcingRead,
    status_code=status.HTTP_201_CREATED,
    responses={status.HTTP_202_ACCEPTED: {"model": ApprovalQueuedResponse}},
)
async def create_vendor_sub_outsourcing(
    vendor_id: int,
    payload: VendorSubOutsourcingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendor_contracts", "write")),
):
    return await create_vendor_sub_outsourcing_detail(
        db=db, vendor_id=vendor_id, payload=payload, current_user=current_user
    )


@router.patch(
    "/vendors/{vendor_id}/sub-outsourcing/{entry_id}",
    response_model=VendorSubOutsourcingRead,
    responses={status.HTTP_202_ACCEPTED: {"model": ApprovalQueuedResponse}},
)
async def update_vendor_sub_outsourcing(
    vendor_id: int,
    entry_id: int,
    payload: VendorSubOutsourcingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendor_contracts", "write")),
):
    return await update_vendor_sub_outsourcing_detail(
        db=db, vendor_id=vendor_id, entry_id=entry_id, payload=payload, current_user=current_user
    )


@router.delete(
    "/vendors/{vendor_id}/sub-outsourcing/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={status.HTTP_202_ACCEPTED: {"model": ApprovalQueuedResponse}},
)
async def archive_vendor_sub_outsourcing(
    vendor_id: int,
    entry_id: int,
    payload: VendorSubOutsourcingArchiveRequest | None = Body(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendor_contracts", "write")),
):
    return await archive_vendor_sub_outsourcing_detail(
        db=db,
        vendor_id=vendor_id,
        entry_id=entry_id,
        current_user=current_user,
        request_reason=payload.request_reason if payload is not None else None,
    )


@router.post(
    "/vendors/{vendor_id}/sub-outsourcing/{entry_id}/restore",
    response_model=VendorSubOutsourcingRead,
)
async def restore_vendor_sub_outsourcing(
    vendor_id: int,
    entry_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendor_contracts", "write")),
):
    return await restore_vendor_sub_outsourcing_detail(
        db=db, vendor_id=vendor_id, entry_id=entry_id, current_user=current_user
    )
