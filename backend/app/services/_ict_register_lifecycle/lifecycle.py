from __future__ import annotations

from uuid import uuid4

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import process as audit_process
from app.models import Process, User
from app.models._archivable import archived_clause
from app.schemas.process import ProcessCreate, ProcessListResponse, ProcessRead, ProcessUpdate
from app.services._ict_register_reference.parameters import load_ict_workbook_parameter_set
from app.services.transaction_boundary import commit_service_boundary

from .derivation import ANO, derive_ict_register
from .derivation_inputs import load_ict_register_graph
from .lifecycle_adapters import (
    apply_archive_lifecycle,
    apply_update_lifecycle,
    extract_updates,
    load_register_page,
)
from .policy import (
    assert_process_archive_allowed,
    assert_process_create_allowed,
    assert_process_readable,
    assert_process_restore_allowed,
    assert_process_update_allowed,
)
from .projection import serialize_process_detail_with_derived, serialize_process_list

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
    return await serialize_process_detail_with_derived(db, process, current_user=current_user)


async def read_process_detail(
    *,
    db: AsyncSession,
    process_id: int,
    current_user: User,
) -> ProcessRead:
    process = await assert_process_readable(db, process_id=process_id, current_user=current_user)
    return await serialize_process_detail_with_derived(db, process, current_user=current_user)


async def update_process_detail(
    *,
    db: AsyncSession,
    process_id: int,
    payload: ProcessUpdate,
    current_user: User,
) -> ProcessRead:
    process = await assert_process_update_allowed(db, process_id=process_id, current_user=current_user)
    updates = extract_updates(payload, non_nullable_fields=("l0_area", "l1_process"))
    if not updates:
        return await serialize_process_detail_with_derived(db, process, current_user=current_user)

    await apply_update_lifecycle(
        db=db,
        entity=process,
        updates=updates,
        changes_factory=audit_process.process_update_changes,
        audit=lambda changes: audit_process.process_updated(
            db, actor=current_user, process=process, changes=changes
        ),
        boundary="ict_register_process_update",
    )
    return await serialize_process_detail_with_derived(db, process, current_user=current_user)


async def archive_process_detail(
    *,
    db: AsyncSession,
    process_id: int,
    current_user: User,
) -> None:
    process = await assert_process_archive_allowed(db, process_id=process_id, current_user=current_user)
    await apply_archive_lifecycle(
        db=db,
        entity=process,
        current_user=current_user,
        changes_factory=audit_process.process_archive_changes,
        audit=lambda changes: audit_process.process_archived(
            db, actor=current_user, process=process, changes=changes
        ),
        boundary="ict_register_process_archive",
    )


async def restore_process_detail(
    *,
    db: AsyncSession,
    process_id: int,
    current_user: User,
) -> ProcessRead:
    process = await assert_process_restore_allowed(db, process_id=process_id, current_user=current_user)
    await apply_archive_lifecycle(
        db=db,
        entity=process,
        current_user=current_user,
        changes_factory=audit_process.process_restore_changes,
        audit=lambda changes: audit_process.process_restored(
            db, actor=current_user, process=process, changes=changes
        ),
        boundary="ict_register_process_restore",
        restore=True,
        refresh=True,
    )
    return await serialize_process_detail_with_derived(db, process, current_user=current_user)


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
    cif: bool | None = None,
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

    if cif is not None:
        candidates = list((await db.execute(query.order_by(Process.id))).scalars().all())
        parameters = await load_ict_workbook_parameter_set(db)
        graph = await load_ict_register_graph(db, processes=candidates)
        derivation = derive_ict_register(graph, parameters)
        eligible_ids = [
            process.id
            for process in candidates
            if (derivation.processes[process.id].cif == ANO) is cif
        ]
        query = query.where(Process.id.in_(eligible_ids))

    rows, total = await load_register_page(
        db=db,
        query=query,
        model=Process,
        offset=offset,
        limit=limit,
        sort_by=sort_by,
        sort_order=sort_order,
        sort_columns=_SORT_COLUMNS,
    )
    return await serialize_process_list(
        db,
        list(rows),
        current_user=current_user,
        total=total,
        offset=offset,
        limit=limit,
    )
