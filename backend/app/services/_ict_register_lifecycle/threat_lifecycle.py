from __future__ import annotations

from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import threat as audit_threat
from app.core.exceptions import ValidationError
from app.models import Threat, User
from app.models._archivable import archived_clause
from app.schemas.threat import ThreatCreate, ThreatListResponse, ThreatRead, ThreatUpdate
from app.services.transaction_boundary import commit_service_boundary

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
    updates = {field: getattr(payload, field) for field in payload.model_fields_set}
    if "name" in updates and updates["name"] is None:
        raise ValidationError("name cannot be null")
    if not updates:
        return serialize_threat_detail(threat, current_user=current_user)

    changes = audit_threat.threat_update_changes(threat, updates)
    for field, value in updates.items():
        setattr(threat, field, value)

    await audit_threat.threat_updated(db, actor=current_user, threat=threat, changes=changes)
    await commit_service_boundary(db, boundary="ict_register_threat_update")
    await db.refresh(threat)
    return serialize_threat_detail(threat, current_user=current_user)


async def archive_threat_detail(
    *,
    db: AsyncSession,
    threat_id: int,
    current_user: User,
) -> None:
    threat = await assert_threat_archive_allowed(db, threat_id=threat_id, current_user=current_user)
    changes = audit_threat.threat_archive_changes(threat)
    threat.mark_archived(current_user)

    await audit_threat.threat_archived(db, actor=current_user, threat=threat, changes=changes)
    await commit_service_boundary(db, boundary="ict_register_threat_archive")


async def restore_threat_detail(
    *,
    db: AsyncSession,
    threat_id: int,
    current_user: User,
) -> ThreatRead:
    threat = await assert_threat_restore_allowed(db, threat_id=threat_id, current_user=current_user)
    changes = audit_threat.threat_restore_changes(threat)
    threat.mark_restored(current_user)

    await audit_threat.threat_restored(db, actor=current_user, threat=threat, changes=changes)
    await commit_service_boundary(db, boundary="ict_register_threat_restore")
    await db.refresh(threat)
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

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0

    if sort_by is not None and sort_by not in _SORT_COLUMNS:
        raise ValidationError("Invalid sort_by value")
    order_column = _SORT_COLUMNS[sort_by] if sort_by else Threat.id
    query = query.order_by(desc(order_column) if sort_order == "desc" else asc(order_column))

    rows = (await db.execute(query.offset(offset).limit(limit))).scalars().all()
    return serialize_threat_list(
        list(rows),
        current_user=current_user,
        total=total,
        offset=offset,
        limit=limit,
    )
