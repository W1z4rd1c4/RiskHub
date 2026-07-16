from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.db.session import get_db
from app.models import User
from app.schemas.vendor import VendorLookupOption
from app.services._register_listings.vendors import vendor_filter_lookups
from app.services._vendor_governance.policy import assert_vendor_list_allowed

router = APIRouter()


@router.get("/lookups/{kind}", response_model=list[VendorLookupOption])
async def list_vendor_filter_lookups(
    kind: str,
    search: str | None = None,
    selected_ids: list[int] | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> list[VendorLookupOption]:
    await assert_vendor_list_allowed(db, current_user=current_user)
    return await vendor_filter_lookups(
        db,
        current_user=current_user,
        kind=kind,
        search=search,
        selected_ids=tuple(selected_ids or ()),
        limit=limit,
    )
