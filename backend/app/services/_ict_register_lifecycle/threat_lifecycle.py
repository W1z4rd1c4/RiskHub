from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.audit import threat as audit_threat
from app.core.exceptions import ConflictError
from app.models import OrphanedItem, Threat, User
from app.models._archivable import archived_clause
from app.schemas.threat import ThreatCreate, ThreatListResponse, ThreatRead, ThreatUpdate
from app.services._threat_stewardship_lock import acquire_threat_steward_identity_locks
from app.services.transaction_boundary import commit_service_boundary

from .lifecycle_adapters import (
    apply_archive_lifecycle,
    extract_updates,
    load_register_page,
)
from .threat_policy import (
    assert_active_ciso_steward,
    assert_threat_archive_allowed,
    assert_threat_create_allowed,
    assert_threat_readable,
    assert_threat_restore_allowed,
    assert_threat_update_allowed,
)
from .threat_projection import (
    load_pending_threat_changes,
    serialize_threat_detail,
    serialize_threat_list,
)

_SORT_COLUMNS = {
    "name": Threat.name,
    "category": Threat.category,
    "relevant_subject": Threat.relevant_subject,
    "created_at": Threat.created_at,
}


async def _pending_stewardship_orphan_ids(
    db: AsyncSession,
    *,
    threat_ids: list[int],
) -> set[int]:
    if not threat_ids:
        return set()
    return set(
        (
            await db.execute(
                select(OrphanedItem.item_id).where(
                    OrphanedItem.item_type == "threat",
                    OrphanedItem.item_id.in_(threat_ids),
                    OrphanedItem.status == "pending",
                )
            )
        )
        .scalars()
        .all()
    )


async def _assert_no_pending_stewardship_orphan(
    db: AsyncSession,
    *,
    threat: Threat,
) -> None:
    if await _pending_stewardship_orphan_ids(db, threat_ids=[threat.id]):
        raise ConflictError(
            "Orphaned Threat stewardship must be reassigned through the governance workflow"
        )


async def create_threat_detail(
    *,
    db: AsyncSession,
    payload: ThreatCreate,
    current_user: User,
) -> ThreatRead:
    await assert_threat_create_allowed(current_user=current_user)
    steward = await assert_active_ciso_steward(db, user_id=payload.threat_steward_user_id)

    threat = Threat(**payload.model_dump())
    threat.threat_steward = steward
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
    pending_ids = await _pending_stewardship_orphan_ids(db, threat_ids=[threat.id])
    pending_changes = await load_pending_threat_changes(
        db,
        threat_ids=[threat.id],
        current_user=current_user,
    )
    return serialize_threat_detail(
        threat,
        current_user=current_user,
        stewardship_pending=threat.id in pending_ids,
        pending_change=pending_changes.get(threat.id),
    )


async def update_threat_detail(
    *,
    db: AsyncSession,
    threat_id: int,
    payload: ThreatUpdate,
    current_user: User,
) -> object:
    # Use a savepoint for lock/authority preflight. A handled domain error does
    # not always reach a dependency override's rollback branch, while rolling
    # back the whole shared session would expire unrelated identity objects.
    # The savepoint releases locks and restores only this request's state.
    threat: Threat | None = None
    new_steward: User | None = None
    try:
        async with db.begin_nested():
            # Establish the current steward under a row lock before selecting
            # any identity advisory locks. Overlapping A->B / A->C
            # reassignments therefore cannot acquire incompatible subsets in
            # opposite order.
            threat = await assert_threat_update_allowed(
                db,
                threat_id=threat_id,
                current_user=current_user,
                for_update=True,
            )
            updates = extract_updates(
                payload,
                non_nullable_fields=("name", "threat_steward_user_id"),
            )
            updates.pop("request_reason", None)
            updates = {
                field: value
                for field, value in updates.items()
                if getattr(threat, field) != value
            }
            if "threat_steward_user_id" in updates:
                new_steward_id = int(updates["threat_steward_user_id"])
                await acquire_threat_steward_identity_locks(
                    db,
                    user_ids=(threat.threat_steward_user_id, new_steward_id),
                )

            # Pending Governance is authoritative even if the former steward
            # later becomes eligible again. Every ordinary PATCH remains
            # blocked until the explicit resolution workflow closes the
            # orphan record.
            await _assert_no_pending_stewardship_orphan(db, threat=threat)
            if "threat_steward_user_id" in updates:
                new_steward = await assert_active_ciso_steward(
                    db,
                    user_id=new_steward_id,
                    acquire_identity_lock=False,
                )
    except Exception:
        if threat is not None:
            await db.refresh(threat)
        raise

    assert threat is not None
    if not updates:
        return serialize_threat_detail(threat, current_user=current_user)

    from app.services._governed_mutations.threat_mutations import (
        assert_no_pending_threat_mutation,
    )

    await assert_no_pending_threat_mutation(db, threat_id=threat.id)
    if new_steward is not None:
        from app.services._governed_mutations.threat_mutations import (
            submit_threat_steward_edit_if_required,
        )

        queued = await submit_threat_steward_edit_if_required(
            db=db,
            threat=threat,
            current_user=current_user,
            new_steward=new_steward,
            request_reason=payload.request_reason,
        )
        if queued is not None:
            return queued

    changes = audit_threat.threat_update_changes(threat, updates)
    for field, value in updates.items():
        setattr(threat, field, value)
    if new_steward is not None:
        threat.threat_steward = new_steward
    threat.governance_version += 1
    await audit_threat.threat_updated(
        db,
        actor=current_user,
        threat=threat,
        changes=changes,
    )
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
    from app.services._governed_mutations.threat_mutations import (
        assert_no_pending_threat_mutation,
    )

    await assert_no_pending_threat_mutation(db, threat_id=threat.id)
    threat.governance_version += 1
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
    from app.services._governed_mutations.threat_mutations import (
        assert_no_pending_threat_mutation,
    )

    await assert_no_pending_threat_mutation(db, threat_id=threat.id)
    threat.governance_version += 1
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
    query = select(Threat).options(
        selectinload(Threat.threat_steward).selectinload(User.role),
        selectinload(Threat.threat_steward).selectinload(User.department),
    )
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
    threats = list(rows)
    pending_ids = await _pending_stewardship_orphan_ids(
        db,
        threat_ids=[threat.id for threat in threats],
    )
    pending_changes = await load_pending_threat_changes(
        db,
        threat_ids=[threat.id for threat in threats],
        current_user=current_user,
    )
    return serialize_threat_list(
        threats,
        current_user=current_user,
        total=total,
        offset=offset,
        limit=limit,
        pending_stewardship_orphan_ids=pending_ids,
        pending_changes=pending_changes,
    )
