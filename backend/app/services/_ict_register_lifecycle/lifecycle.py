from __future__ import annotations

from uuid import uuid4

from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import process as audit_process
from app.core.exceptions import ValidationError
from app.models import Process, User
from app.models._archivable import archived_clause
from app.schemas.process import ProcessCreate, ProcessListResponse, ProcessRead, ProcessUpdate
from app.services.transaction_boundary import commit_service_boundary

from .policy import (
    assert_process_archive_allowed,
    assert_process_create_allowed,
    assert_process_readable,
    assert_process_restore_allowed,
    assert_process_update_allowed,
)
from .projection import serialize_process_detail, serialize_process_list

_SORT_COLUMNS = {
    "f_code": Process.id,  # F-codes are "F{id}"; numeric order, not lexicographic
    "l0_area": Process.l0_area,
    "l1_process": Process.l1_process,
    "owner": Process.owner,
    "created_at": Process.created_at,
}


async def create_process_detail(
    *,
    db: AsyncSession,
    payload: ProcessCreate,
    current_user: User,
) -> ProcessRead:
    await assert_process_create_allowed(current_user=current_user)

    # Insert with a transaction-unique placeholder; the id is unknown until
    # the flush assigns it, and the column is NOT NULL.
    process = Process(**payload.model_dump(), f_code=f"pending-{uuid4().hex[:12]}")
    db.add(process)
    await db.flush()
    # Stable RoI F-code, assigned once at creation and never reassigned.
    # Keyed to the row id so archived rows keep their code forever and the
    # sequence never reuses a freed number.
    process.f_code = f"F{process.id}"

    await audit_process.process_created(db, actor=current_user, process=process)
    await commit_service_boundary(db, boundary="ict_register_process_create")
    await db.refresh(process)
    return serialize_process_detail(process, current_user=current_user)


async def read_process_detail(
    *,
    db: AsyncSession,
    process_id: int,
    current_user: User,
) -> ProcessRead:
    process = await assert_process_readable(db, process_id=process_id, current_user=current_user)
    return serialize_process_detail(process, current_user=current_user)


async def update_process_detail(
    *,
    db: AsyncSession,
    process_id: int,
    payload: ProcessUpdate,
    current_user: User,
) -> ProcessRead:
    process = await assert_process_update_allowed(db, process_id=process_id, current_user=current_user)
    updates = {field: getattr(payload, field) for field in payload.model_fields_set}
    for field in ("l0_area", "l1_process"):
        if field in updates and updates[field] is None:
            raise ValidationError(f"{field} cannot be null")
    if not updates:
        return serialize_process_detail(process, current_user=current_user)

    changes = audit_process.process_update_changes(process, updates)
    for field, value in updates.items():
        setattr(process, field, value)

    await audit_process.process_updated(db, actor=current_user, process=process, changes=changes)
    await commit_service_boundary(db, boundary="ict_register_process_update")
    await db.refresh(process)
    return serialize_process_detail(process, current_user=current_user)


async def archive_process_detail(
    *,
    db: AsyncSession,
    process_id: int,
    current_user: User,
) -> None:
    process = await assert_process_archive_allowed(db, process_id=process_id, current_user=current_user)
    changes = audit_process.process_archive_changes(process)
    process.mark_archived(current_user)

    await audit_process.process_archived(db, actor=current_user, process=process, changes=changes)
    await commit_service_boundary(db, boundary="ict_register_process_archive")


async def restore_process_detail(
    *,
    db: AsyncSession,
    process_id: int,
    current_user: User,
) -> ProcessRead:
    process = await assert_process_restore_allowed(db, process_id=process_id, current_user=current_user)
    changes = audit_process.process_restore_changes(process)
    process.mark_restored(current_user)

    await audit_process.process_restored(db, actor=current_user, process=process, changes=changes)
    await commit_service_boundary(db, boundary="ict_register_process_restore")
    await db.refresh(process)
    return serialize_process_detail(process, current_user=current_user)


async def list_process_register(
    *,
    db: AsyncSession,
    current_user: User,
    offset: int,
    limit: int,
    search: str | None,
    include_archived: bool,
    sort_by: str | None,
    sort_order: str | None,
) -> ProcessListResponse:
    query = select(Process)
    if not include_archived:
        query = query.where(archived_clause(Process, archived=False))
    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(
                Process.f_code.ilike(pattern),
                Process.l0_area.ilike(pattern),
                Process.l1_process.ilike(pattern),
                Process.l2_subprocess.ilike(pattern),
                Process.owner.ilike(pattern),
            )
        )

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0

    if sort_by is not None and sort_by not in _SORT_COLUMNS:
        raise ValidationError("Invalid sort_by value")
    order_column = _SORT_COLUMNS[sort_by] if sort_by else Process.id
    query = query.order_by(desc(order_column) if sort_order == "desc" else asc(order_column))

    rows = (await db.execute(query.offset(offset).limit(limit))).scalars().all()
    return serialize_process_list(
        list(rows),
        current_user=current_user,
        total=total,
        offset=offset,
        limit=limit,
    )
