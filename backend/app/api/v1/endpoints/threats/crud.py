from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.threat import ThreatCreate, ThreatListResponse, ThreatRead, ThreatUpdate
from app.services._ict_register_lifecycle.threat_lifecycle import (
    create_threat_detail,
    list_threat_register,
    read_threat_detail,
    update_threat_detail,
)

router = APIRouter()


@router.get("", response_model=ThreatListResponse)
async def list_threats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("threats", "read")),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    search: Optional[str] = None,
    include_archived: bool = Query(False, description="Include archived threats"),
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = Query("asc"),
):
    return await list_threat_register(
        db=db,
        current_user=current_user,
        offset=offset,
        limit=limit,
        search=search,
        include_archived=include_archived,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.post("", response_model=ThreatRead, status_code=status.HTTP_201_CREATED)
async def create_threat(
    payload: ThreatCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("threats", "write")),
):
    return await create_threat_detail(db=db, payload=payload, current_user=current_user)


@router.get("/{threat_id}", response_model=ThreatRead)
async def get_threat(
    threat_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("threats", "read")),
):
    return await read_threat_detail(db=db, threat_id=threat_id, current_user=current_user)


@router.patch("/{threat_id}", response_model=ThreatRead)
async def update_threat(
    threat_id: int,
    payload: ThreatUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("threats", "write")),
):
    return await update_threat_detail(db=db, threat_id=threat_id, payload=payload, current_user=current_user)
