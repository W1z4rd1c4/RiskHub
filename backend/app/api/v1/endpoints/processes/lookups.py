from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.db.session import get_db
from app.models import User
from app.schemas.process import ProcessLookupOption
from app.services._register_listings.processes import process_filter_lookups

router = APIRouter()


@router.get("/lookups/{kind}", response_model=list[ProcessLookupOption])
async def list_process_filter_lookups(
    kind: str,
    search: str | None = None,
    selected_ids: list[int] | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> list[ProcessLookupOption]:
    return await process_filter_lookups(
        db,
        current_user=current_user,
        kind=kind,
        search=search,
        selected_ids=tuple(selected_ids or ()),
        limit=limit,
    )
