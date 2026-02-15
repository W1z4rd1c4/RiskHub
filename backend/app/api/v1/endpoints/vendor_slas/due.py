from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.mappers.vendor_sla import sla_to_read
from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.models.vendor_sla import VendorSLA
from app.schemas.vendor_sla import VendorSLARead
from app.services.kri_history_service import KRIHistoryService
from app.services.vendor_sla_history_service import VendorSLAHistoryService

from ._shared import _can_read_sla, _is_due_soon

router = APIRouter()


@router.get("/vendor-slas/due-soon", response_model=list[VendorSLARead])
async def vendor_slas_due_soon(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors", "read")),
    vendor_id: int | None = None,
):
    stmt = select(VendorSLA).where(VendorSLA.is_archived.is_(False)).options(selectinload(VendorSLA.vendor))
    if vendor_id is not None:
        stmt = stmt.where(VendorSLA.vendor_id == vendor_id)
    slas = (await db.execute(stmt)).scalars().all()
    today = date.today()
    due_soon = []
    for sla in slas:
        if not _can_read_sla(sla, current_user):
            continue
        _, current_period_end = KRIHistoryService.period_bounds_for_date(today, sla.frequency)
        _, latest_closed_end = KRIHistoryService.latest_closed_period_for_date(today, sla.frequency)
        period_end = (
            current_period_end
            if (sla.last_period_end and sla.last_period_end >= latest_closed_end)
            else latest_closed_end
        )
        due = VendorSLAHistoryService.due_date(period_end)
        if _is_due_soon(due=due, today=today):
            due_soon.append(sla_to_read(sla))
    return due_soon


@router.get("/vendor-slas/overdue", response_model=list[VendorSLARead])
async def vendor_slas_overdue(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors", "read")),
    vendor_id: int | None = None,
):
    stmt = select(VendorSLA).where(VendorSLA.is_archived.is_(False)).options(selectinload(VendorSLA.vendor))
    if vendor_id is not None:
        stmt = stmt.where(VendorSLA.vendor_id == vendor_id)
    slas = (await db.execute(stmt)).scalars().all()
    today = date.today()
    overdue = []
    for sla in slas:
        if not _can_read_sla(sla, current_user):
            continue
        _, current_period_end = KRIHistoryService.period_bounds_for_date(today, sla.frequency)
        _, latest_closed_end = KRIHistoryService.latest_closed_period_for_date(today, sla.frequency)
        period_end = (
            current_period_end
            if (sla.last_period_end and sla.last_period_end >= latest_closed_end)
            else latest_closed_end
        )
        due = VendorSLAHistoryService.due_date(period_end)
        if due < today:
            overdue.append(sla_to_read(sla))
    return overdue
