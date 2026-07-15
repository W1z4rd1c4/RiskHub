from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import threat as audit_threat
from app.models import Threat, User
from app.models._archivable import archived_clause
from app.schemas.threat import ThreatCreate, ThreatListResponse, ThreatRead, ThreatUpdate
from app.services.transaction_boundary import commit_service_boundary

from .lifecycle_adapters import (
    apply_archive_lifecycle,
    apply_update_lifecycle,
    extract_updates,
    load_register_page,
)
from .threat_policy import (
    assert_threat_archive_allowed,
    assert_threat_create_allowed,
    assert_threat_readable,
    assert_threat_restore_allowed,
    assert_threat_update_allowed,
)
from .threat_projection import serialize_threat_detail, serialize_threat_list

_SORT_COLUMNS = {
    "name": Threat.name,
    "category": Threat.category,
    "relevant_subject": Threat.relevant_subject,
    "created_at": Threat.created_at,
}


async def create_threat_detail(
    *,
    db: AsyncSession,
    payload: ThreatCreate,
    current_user: User,
) -> ThreatRead:
    await assert_threat_create_allowed(current_user=current_user)

    threat = Threat(**payload.model_dump())
    db.add(threat)
    await db.flush()

    await audit_threat.threat_created(db, actor=current_user, threat=threat)
    await commit_service_boundary(db, boundary="ict_register_threat_create")
    await db.refresh(threat)
    return serialize_threat_detail(threat, current_user=current_user)


async def read_threat_detail(
    *,
    db: AsyncSession,
    threat_id: int,
    current_user: User,
) -> ThreatRead:
    threat = await assert_threat_readable(db, threat_id=threat_id, current_user=current_user)
    return serialize_threat_detail(threat, current_user=current_user)


async def update_threat_detail(
    *,
    db: AsyncSession,
    threat_id: int,
    payload: ThreatUpdate,
    current_user: User,
) -> ThreatRead:
    threat = await assert_threat_update_allowed(db, threat_id=threat_id, current_user=current_user)
    updates = extract_updates(payload, non_nullable_fields=("name",))
    if not updates:
        return serialize_threat_detail(threat, current_user=current_user)

    await apply_update_lifecycle(
        db=db,
        entity=threat,
        updates=updates,
        changes_factory=audit_threat.threat_update_changes,
        audit=lambda changes: audit_threat.threat_updated(
            db, actor=current_user, threat=threat, changes=changes
        ),
        boundary="ict_register_threat_update",
    )
    return serialize_threat_detail(threat, current_user=current_user)


async def archive_threat_detail(
    *,
    db: AsyncSession,
    threat_id: int,
    current_user: User,
) -> None:
    threat = await assert_threat_archive_allowed(db, threat_id=threat_id, current_user=current_user)
    await apply_archive_lifecycle(
        db=db,
        entity=threat,
        current_user=current_user,
        changes_factory=audit_threat.threat_archive_changes,
        audit=lambda changes: audit_threat.threat_archived(
            db, actor=current_user, threat=threat, changes=changes
        ),
        boundary="ict_register_threat_archive",
    )


async def restore_threat_detail(
    *,
    db: AsyncSession,
    threat_id: int,
    current_user: User,
) -> ThreatRead:
    threat = await assert_threat_restore_allowed(db, threat_id=threat_id, current_user=current_user)
    await apply_archive_lifecycle(
        db=db,
        entity=threat,
        current_user=current_user,
        changes_factory=audit_threat.threat_restore_changes,
        audit=lambda changes: audit_threat.threat_restored(
            db, actor=current_user, threat=threat, changes=changes
        ),
        boundary="ict_register_threat_restore",
        restore=True,
        refresh=True,
    )
    return serialize_threat_detail(threat, current_user=current_user)


async def list_threat_register(
    *,
    db: AsyncSession,
    current_user: User,
    offset: int,
    limit: int,
    search: str | None,
    include_archived: bool,
    sort_by: str | None,
    sort_order: str | None,
) -> ThreatListResponse:
    query = select(Threat)
    if not include_archived:
        query = query.where(archived_clause(Threat, archived=False))
    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(
                Threat.name.ilike(pattern),
                Threat.category.ilike(pattern),
                Threat.relevant_subject.ilike(pattern),
            )
        )

    rows, total = await load_register_page(
        db=db,
        query=query,
        model=Threat,
        offset=offset,
        limit=limit,
        sort_by=sort_by,
        sort_order=sort_order,
        sort_columns=_SORT_COLUMNS,
    )
    return serialize_threat_list(
        list(rows),
        current_user=current_user,
        total=total,
        offset=offset,
        limit=limit,
    )
