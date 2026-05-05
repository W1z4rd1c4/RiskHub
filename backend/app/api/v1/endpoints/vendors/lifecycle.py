from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.db.session import get_db
from app.models import User
from app.schemas.vendor import VendorRead
from app.services._vendor_governance.lifecycle import archive_vendor_detail, restore_vendor_detail

router = APIRouter()


@router.delete("/{vendor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_vendor(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    await archive_vendor_detail(db=db, vendor_id=vendor_id, current_user=current_user)
    return None


@router.post("/{vendor_id}/restore", response_model=VendorRead)
async def restore_vendor(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    return await restore_vendor_detail(db=db, vendor_id=vendor_id, current_user=current_user)
