from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.vendor_contract import (
    VendorContractCreate,
    VendorContractRead,
    VendorContractUpdate,
)
from app.services._vendor_governance.contract_lifecycle import (
    archive_vendor_contract_detail,
    create_vendor_contract_detail,
    list_vendor_contract_collection,
    restore_vendor_contract_detail,
    update_vendor_contract_detail,
)

router = APIRouter()


@router.get("/vendors/{vendor_id}/contracts", response_model=list[VendorContractRead])
async def list_vendor_contracts(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendor_contracts", "read")),
    include_archived: bool = Query(False, description="Include archived contracts"),
):
    return await list_vendor_contract_collection(
        db=db, vendor_id=vendor_id, current_user=current_user, include_archived=include_archived
    )


@router.post(
    "/vendors/{vendor_id}/contracts",
    response_model=VendorContractRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_vendor_contract(
    vendor_id: int,
    payload: VendorContractCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendor_contracts", "write")),
):
    return await create_vendor_contract_detail(
        db=db, vendor_id=vendor_id, payload=payload, current_user=current_user
    )


@router.patch("/vendors/{vendor_id}/contracts/{contract_id}", response_model=VendorContractRead)
async def update_vendor_contract(
    vendor_id: int,
    contract_id: int,
    payload: VendorContractUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendor_contracts", "write")),
):
    return await update_vendor_contract_detail(
        db=db, vendor_id=vendor_id, contract_id=contract_id, payload=payload, current_user=current_user
    )


@router.delete("/vendors/{vendor_id}/contracts/{contract_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_vendor_contract(
    vendor_id: int,
    contract_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendor_contracts", "write")),
):
    await archive_vendor_contract_detail(
        db=db, vendor_id=vendor_id, contract_id=contract_id, current_user=current_user
    )
    return None


@router.post(
    "/vendors/{vendor_id}/contracts/{contract_id}/restore", response_model=VendorContractRead
)
async def restore_vendor_contract(
    vendor_id: int,
    contract_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendor_contracts", "write")),
):
    return await restore_vendor_contract_detail(
        db=db, vendor_id=vendor_id, contract_id=contract_id, current_user=current_user
    )
