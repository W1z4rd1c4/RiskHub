from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.security import check_permission
from app.db.session import get_db
from app.models import User
from app.models.vendor_relationship import VendorRelationship, VendorRelationshipType
from app.schemas.vendor_dependency import VendorRelationshipCreate, VendorRelationshipRead

from ._shared import _get_vendor_or_404, _require_vendor_write

router = APIRouter()


@router.post(
    "/vendors/{vendor_id}/relationships", response_model=VendorRelationshipRead, status_code=status.HTTP_201_CREATED
)
async def create_vendor_relationship(
    vendor_id: int,
    payload: VendorRelationshipCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    vendor = await _get_vendor_or_404(db, vendor_id, current_user)
    _require_vendor_write(vendor, current_user)

    if payload.related_vendor_id == vendor_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vendor cannot relate to itself")

    related = await _get_vendor_or_404(db, payload.related_vendor_id, current_user)
    rel = VendorRelationship(
        vendor_id=vendor_id,
        related_vendor_id=payload.related_vendor_id,
        relationship_type=VendorRelationshipType(payload.relationship_type.value),
    )
    db.add(rel)
    await db.commit()
    await db.refresh(rel)
    return VendorRelationshipRead(
        id=rel.id,
        vendor_id=rel.vendor_id,
        related_vendor_id=rel.related_vendor_id,
        related_vendor_name=related.name,
        relationship_type=rel.relationship_type.value,
        created_at=rel.created_at,
    )


@router.delete("/vendor-relationships/{relationship_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vendor_relationship(
    relationship_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")

    rel_stmt = select(VendorRelationship).where(VendorRelationship.id == relationship_id)
    rel = (await db.execute(rel_stmt)).scalar_one_or_none()
    if not rel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Relationship not found")

    vendor = await _get_vendor_or_404(db, rel.vendor_id, current_user)
    _require_vendor_write(vendor, current_user)
    await db.delete(rel)
    await db.commit()
    return None
