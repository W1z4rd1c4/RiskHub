from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.collection import SortDirection
from app.schemas.process import ProcessCreate, ProcessListResponse, ProcessRead, ProcessUpdate
from app.services._ict_register_lifecycle.lifecycle import (
    create_process_detail,
    list_process_register,
    read_process_detail,
    update_process_detail,
)

router = APIRouter()


@router.get("", response_model=ProcessListResponse)
async def list_processes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("processes", "read")),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    search: Optional[str] = None,
    include_archived: bool = Query(False, description="Include archived processes"),
    sort_by: Optional[str] = None,
    sort_order: SortDirection = Query("asc"),
    cif: bool | None = Query(None, description="Filter by derived critical/important function status"),
):
    return await list_process_register(
        db=db,
        current_user=current_user,
        offset=offset,
        limit=limit,
        search=search,
        include_archived=include_archived,
        sort_by=sort_by,
        sort_order=sort_order,
        cif=cif,
    )


@router.post("", response_model=ProcessRead, status_code=status.HTTP_201_CREATED)
async def create_process(
    payload: ProcessCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("processes", "write")),
):
    return await create_process_detail(db=db, payload=payload, current_user=current_user)


@router.get("/{process_id}", response_model=ProcessRead)
async def get_process(
    process_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("processes", "read")),
):
    return await read_process_detail(db=db, process_id=process_id, current_user=current_user)


@router.patch("/{process_id}", response_model=ProcessRead)
async def update_process(
    process_id: int,
    payload: ProcessUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("processes", "write")),
):
    return await update_process_detail(db=db, process_id=process_id, payload=payload, current_user=current_user)
