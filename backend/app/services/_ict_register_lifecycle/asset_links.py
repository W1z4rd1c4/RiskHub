"""Process<->Asset and Asset<->Asset Link relations (issue #43).

Links are managed from the Asset detail and readable from both ends. The
Process<->Asset link carries the entered sheet 05 columns (significance,
SPOF, note) plus the primary-Process designation: at most one primary link
per Asset, enforced here — designating a new primary atomically demotes the
previous one within the same service-owned transaction (ADR-002). The
Asset<->Asset link carries the entered sheet 06 columns; direction matters
(the dependent Asset relies on the supporting Asset), self-links are
rejected, and each pair is unique.
"""

from __future__ import annotations

from fastapi.responses import JSONResponse
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import asset as audit_asset
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.models import Asset, AssetAssetLink, Process, ProcessAssetLink, User
from app.schemas.asset import (
    AssetAssetLinkCreate,
    AssetAssetLinkRead,
    ProcessAssetLinkCreate,
    ProcessAssetLinkRead,
    ProcessAssetLinkUpdate,
)
from app.services._governed_mutations.process_mutations import (
    submit_process_relationship_mutation,
)
from app.services._governed_mutations.process_relationships import (
    lock_process_relationship_targets,
    process_impact_resource,
)
from app.services._governed_mutations.process_updates import (
    active_governed_process_mutation_ids,
    assert_no_pending_process_mutation,
)
from app.services.transaction_boundary import commit_service_boundary

from .asset_policy import (
    assert_asset_ordinary_mutation_allowed,
    assert_asset_readable,
    assert_asset_update_allowed,
    assert_locked_asset_ordinary_mutation_allowed,
    can_read_asset_record,
    load_asset,
)
from .derivation import process_display_name
from .policy import assert_process_readable, can_read_process_record, load_process


async def _process_names_by_id(db: AsyncSession, process_ids: set[int]) -> dict[int, str]:
    """Workbook display names (l1 [– l2]) for the Process ends of link rows."""
    if not process_ids:
        return {}
    rows = await db.execute(
        select(Process.id, Process.l1_process, Process.l2_subprocess).where(Process.id.in_(process_ids))
    )
    return {process_id: process_display_name(l1, l2) for process_id, l1, l2 in rows.all()}


def _serialize_process_asset_link(
    link: ProcessAssetLink,
    *,
    process_name: str | None = None,
    asset_name: str | None = None,
    process_business_edit_blocked: bool = False,
) -> ProcessAssetLinkRead:
    base = ProcessAssetLinkRead.model_validate(link)
    return base.model_copy(
        update={
            "process_name": process_name,
            "asset_name": asset_name,
            "process_business_edit_blocked": process_business_edit_blocked,
        }
    )


def _asset_link_snapshot(link: ProcessAssetLink) -> dict[str, object]:
    return {
        "significance": link.significance,
        "spof": link.spof,
        "is_primary": link.is_primary,
        "note": link.note,
    }


def _serialize_asset_asset_link(link: AssetAssetLink, asset_names: dict[int, str]) -> AssetAssetLinkRead:
    base = AssetAssetLinkRead.model_validate(link)
    return base.model_copy(
        update={
            "dependent_asset_name": asset_names.get(link.dependent_asset_id),
            "supporting_asset_name": asset_names.get(link.supporting_asset_id),
        }
    )


# Partial unique index on process_asset_links(asset_id) WHERE is_primary —
# the DB-level backstop for the at-most-one-primary invariant (see
# app/models/asset.py and the r5s6t7u8v9w0_add_assets.py migration).
_PRIMARY_DESIGNATION_INDEX = "uq_process_asset_links_primary_per_asset"


async def _flush_guarding_primary_designation(db: AsyncSession) -> None:
    """Flush link writes, mapping a lost primary-designation race to a 409.

    The service swap demotes before promoting, but a concurrent designation
    committed between our demote and this flush trips the partial unique
    index; translate that to the taxonomy's ConflictError (precedent:
    _entity_mutation_lifecycle/lifecycle.py) instead of surfacing a 500.
    """
    try:
        await db.flush()
    except IntegrityError as exc:
        if _PRIMARY_DESIGNATION_INDEX in str(getattr(exc, "orig", exc)):
            await db.rollback()
            raise ConflictError("The asset's primary Process designation changed concurrently; retry") from exc
        raise


async def _require_asset_link_access(
    db: AsyncSession,
    *,
    asset_id: int,
    current_user: User,
    require_write: bool,
) -> Asset:
    """Check Asset read access, optional Asset write access, and Process read access."""
    if require_write:
        return await assert_asset_ordinary_mutation_allowed(
            db,
            asset_id=asset_id,
            current_user=current_user,
        )
    return await assert_asset_readable(
        db,
        asset_id=asset_id,
        current_user=current_user,
    )


async def _lock_asset_link_targets(
    db: AsyncSession,
    *,
    asset_ids: set[int],
) -> dict[int, Asset]:
    """Acquire the complete Asset-link row set in one canonical order."""
    ordered_ids = sorted(asset_ids)
    locked = list(
        (
            await db.execute(
                select(Asset)
                .where(Asset.id.in_(ordered_ids))
                .order_by(Asset.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalars()
    )
    if [asset.id for asset in locked] != ordered_ids:
        raise ConflictError("An Asset link target changed concurrently; retry")
    return {asset.id: asset for asset in locked}


async def _load_process_asset_link(db: AsyncSession, *, asset_id: int, process_id: int) -> ProcessAssetLink | None:
    result = await db.execute(
        select(ProcessAssetLink).where(
            ProcessAssetLink.asset_id == asset_id,
            ProcessAssetLink.process_id == process_id,
        )
    )
    return result.scalar_one_or_none()


async def _demote_current_primary(db: AsyncSession, *, asset_id: int) -> None:
    """Clear the Asset's current primary designation (at most one exists)."""
    await db.execute(
        update(ProcessAssetLink)
        .where(ProcessAssetLink.asset_id == asset_id, ProcessAssetLink.is_primary.is_(True))
        .values(is_primary=False)
    )


async def list_asset_process_links(
    db: AsyncSession,
    *,
    asset_id: int,
    current_user: User,
) -> list[ProcessAssetLinkRead]:
    asset = await _require_asset_link_access(db, asset_id=asset_id, current_user=current_user, require_write=False)
    result = await db.execute(
        select(ProcessAssetLink).where(ProcessAssetLink.asset_id == asset_id).order_by(ProcessAssetLink.id)
    )
    links = list(result.scalars().all())
    processes = [
        process
        for link in links
        if (process := await load_process(db, link.process_id)) is not None
        and can_read_process_record(current_user, process)
    ]
    readable_process_ids = {process.id for process in processes}
    process_names = {
        process.id: process_display_name(process.l1_process, process.l2_subprocess) for process in processes
    }
    blocked_process_ids = await active_governed_process_mutation_ids(db, process_ids=readable_process_ids)
    return [
        _serialize_process_asset_link(
            link,
            process_name=process_names.get(link.process_id),
            asset_name=asset.name,
            process_business_edit_blocked=link.process_id in blocked_process_ids,
        )
        for link in links
        if link.process_id in readable_process_ids
    ]


async def list_process_asset_links(
    db: AsyncSession,
    *,
    process_id: int,
    current_user: User,
) -> list[ProcessAssetLinkRead]:
    """The Process-end read of the same Link relation."""
    process = await assert_process_readable(
        db,
        process_id=process_id,
        current_user=current_user,
    )

    result = await db.execute(
        select(ProcessAssetLink).where(ProcessAssetLink.process_id == process_id).order_by(ProcessAssetLink.id)
    )
    links = list(result.scalars().all())
    assets = [
        asset
        for link in links
        if (asset := await load_asset(db, link.asset_id)) is not None and can_read_asset_record(current_user, asset)
    ]
    readable_asset_ids = {asset.id for asset in assets}
    asset_names = {asset.id: asset.name for asset in assets}
    process_name = process_display_name(process.l1_process, process.l2_subprocess)
    blocked_process_ids = await active_governed_process_mutation_ids(db, process_ids={process.id} if links else set())
    return [
        _serialize_process_asset_link(
            link,
            process_name=process_name,
            asset_name=asset_names.get(link.asset_id),
            process_business_edit_blocked=process.id in blocked_process_ids,
        )
        for link in links
        if link.asset_id in readable_asset_ids
    ]


async def add_asset_process_link(
    db: AsyncSession,
    *,
    asset_id: int,
    payload: ProcessAssetLinkCreate,
    current_user: User,
) -> ProcessAssetLinkRead | JSONResponse:
    asset = await assert_asset_update_allowed(db, asset_id=asset_id, current_user=current_user)
    process = await assert_process_readable(
        db,
        process_id=payload.process_id,
        current_user=current_user,
    )
    current_primary = (
        await db.execute(
            select(ProcessAssetLink).where(
                ProcessAssetLink.asset_id == asset_id,
                ProcessAssetLink.is_primary.is_(True),
            )
        )
    ).scalar_one_or_none()
    demoted_process_id = (
        current_primary.process_id
        if payload.is_primary and current_primary is not None and current_primary.process_id != process.id
        else None
    )
    impacted_ids = {process.id}
    if demoted_process_id is not None:
        impacted_ids.add(demoted_process_id)
    impacted = await lock_process_relationship_targets(
        db,
        process_ids=impacted_ids,
        current_user=current_user,
        readable_process_id=process.id,
    )
    process = impacted[process.id]
    asset = await assert_asset_ordinary_mutation_allowed(db, asset_id=asset_id, current_user=current_user)
    locked_primary = (
        await db.execute(
            select(ProcessAssetLink)
            .where(
                ProcessAssetLink.asset_id == asset_id,
                ProcessAssetLink.is_primary.is_(True),
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    locked_demoted_id = (
        locked_primary.process_id
        if payload.is_primary and locked_primary is not None and locked_primary.process_id != process.id
        else None
    )
    if locked_demoted_id != demoted_process_id:
        raise ConflictError("Asset primary Process changed concurrently; retry")
    for impacted_process_id in sorted(impacted):
        await assert_no_pending_process_mutation(db, process_id=impacted_process_id)

    if await _load_process_asset_link(db, asset_id=asset_id, process_id=payload.process_id):
        raise ValidationError("Link already exists")

    after = payload.model_dump(exclude={"process_id", "request_reason"})
    operation = {
        "kind": "process.link.asset.add",
        "relationship_type": "asset",
        "action": "add",
        "process_id": process.id,
        "related_resource_id": asset.id,
        "related_resource_name": asset.name,
        "before": {},
        "after": after,
    }
    if demoted_process_id is not None:
        operation["demoted_process_id"] = demoted_process_id
    queued = await submit_process_relationship_mutation(
        db=db,
        process=process,
        mutation_kind="process.link.asset.add",
        operation=operation,
        request_reason=payload.request_reason,
        current_user=current_user,
        impacted_resources=[
            process_impact_resource(
                impacted[row_id],
                can_view_identity=can_read_process_record(
                    current_user,
                    impacted[row_id],
                ),
            )
            for row_id in sorted(impacted)
        ],
    )
    if queued is not None:
        return queued

    if payload.is_primary:
        await _demote_current_primary(db, asset_id=asset_id)

    link = ProcessAssetLink(
        asset_id=asset_id,
        process_id=payload.process_id,
        significance=payload.significance,
        spof=payload.spof,
        is_primary=payload.is_primary,
        note=payload.note,
    )
    db.add(link)
    await _flush_guarding_primary_designation(db)
    for impacted_process in impacted.values():
        impacted_process.governance_version += 1
    asset.governance_version += 1

    await audit_asset.asset_link_created(
        db,
        actor=current_user,
        asset=asset,
        link_kind="process",
        target_id=payload.process_id,
        target_label=process_display_name(process.l1_process, process.l2_subprocess),
    )
    await commit_service_boundary(db, boundary="ict_register_asset_link_create")
    await db.refresh(link)
    return _serialize_process_asset_link(
        link,
        process_name=process_display_name(process.l1_process, process.l2_subprocess),
        asset_name=asset.name,
    )


async def update_asset_process_link(
    db: AsyncSession,
    *,
    asset_id: int,
    process_id: int,
    payload: ProcessAssetLinkUpdate,
    current_user: User,
) -> ProcessAssetLinkRead | JSONResponse:
    asset = await assert_asset_update_allowed(db, asset_id=asset_id, current_user=current_user)

    link = await _load_process_asset_link(db, asset_id=asset_id, process_id=process_id)
    if not link:
        raise NotFoundError("Link not found")
    optimistic_before = _asset_link_snapshot(link)
    process = await assert_process_readable(
        db,
        process_id=process_id,
        current_user=current_user,
    )
    process_names = await _process_names_by_id(db, {process_id})

    updates = {field: getattr(payload, field) for field in payload.model_fields_set if field != "request_reason"}
    if updates.get("is_primary") is None:
        updates.pop("is_primary", None)

    changes: dict[str, dict[str, object]] = {
        field: {"old": getattr(link, field), "new": value}
        for field, value in updates.items()
        if getattr(link, field) != value
    }
    if not changes:
        return _serialize_process_asset_link(link, process_name=process_names.get(process_id), asset_name=asset.name)

    current_primary = (
        await db.execute(
            select(ProcessAssetLink).where(
                ProcessAssetLink.asset_id == asset_id,
                ProcessAssetLink.is_primary.is_(True),
            )
        )
    ).scalar_one_or_none()
    demoted_process_id = (
        current_primary.process_id
        if changes.get("is_primary", {}).get("new") is True
        and current_primary is not None
        and current_primary.process_id != process_id
        else None
    )
    impacted_ids = {process_id}
    if demoted_process_id is not None:
        impacted_ids.add(demoted_process_id)
    impacted = await lock_process_relationship_targets(
        db,
        process_ids=impacted_ids,
        current_user=current_user,
        readable_process_id=process_id,
    )
    process = impacted[process_id]
    asset = await assert_asset_ordinary_mutation_allowed(db, asset_id=asset_id, current_user=current_user)
    link = await _load_process_asset_link(db, asset_id=asset_id, process_id=process_id)
    if link is None:
        raise ConflictError("Process-Asset link changed concurrently; retry")
    if _asset_link_snapshot(link) != optimistic_before:
        raise ConflictError("Process-Asset link changed concurrently; retry")
    locked_primary = (
        await db.execute(
            select(ProcessAssetLink)
            .where(
                ProcessAssetLink.asset_id == asset_id,
                ProcessAssetLink.is_primary.is_(True),
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    locked_demoted_id = (
        locked_primary.process_id
        if changes.get("is_primary", {}).get("new") is True
        and locked_primary is not None
        and locked_primary.process_id != process_id
        else None
    )
    if locked_demoted_id != demoted_process_id:
        raise ConflictError("Asset primary Process changed concurrently; retry")
    for impacted_process_id in sorted(impacted):
        await assert_no_pending_process_mutation(db, process_id=impacted_process_id)
    before = _asset_link_snapshot(link)
    after = dict(before)
    after.update({field: change["new"] for field, change in changes.items()})
    operation = {
        "kind": "process.link.asset.update",
        "relationship_type": "asset",
        "action": "update",
        "process_id": process.id,
        "related_resource_id": asset.id,
        "related_resource_name": asset.name,
        "link_id": link.id,
        "before": before,
        "after": after,
    }
    if demoted_process_id is not None:
        operation["demoted_process_id"] = demoted_process_id
    queued = await submit_process_relationship_mutation(
        db=db,
        process=process,
        mutation_kind="process.link.asset.update",
        operation=operation,
        request_reason=payload.request_reason,
        current_user=current_user,
        impacted_resources=[
            process_impact_resource(
                impacted[row_id],
                can_view_identity=can_read_process_record(
                    current_user,
                    impacted[row_id],
                ),
            )
            for row_id in sorted(impacted)
        ],
    )
    if queued is not None:
        return queued

    # Designating a new primary atomically demotes the previous one — one
    # call, one transaction, never a client-side two-step.
    if changes.get("is_primary", {}).get("new") is True:
        await _demote_current_primary(db, asset_id=asset_id)

    for field, change in changes.items():
        setattr(link, field, change["new"])
    await _flush_guarding_primary_designation(db)
    for impacted_process in impacted.values():
        impacted_process.governance_version += 1
    asset.governance_version += 1

    await audit_asset.asset_link_updated(
        db,
        actor=current_user,
        asset=asset,
        link_kind="process",
        target_id=process_id,
        changes=changes,
        target_label=process_names.get(process_id) or "Unknown process",
    )
    await commit_service_boundary(db, boundary="ict_register_asset_link_update")
    await db.refresh(link)
    return _serialize_process_asset_link(link, process_name=process_names.get(process_id), asset_name=asset.name)


async def remove_asset_process_link(
    db: AsyncSession,
    *,
    asset_id: int,
    process_id: int,
    request_reason: str | None = None,
    current_user: User,
) -> JSONResponse | None:
    asset = await assert_asset_update_allowed(db, asset_id=asset_id, current_user=current_user)

    link = await _load_process_asset_link(db, asset_id=asset_id, process_id=process_id)
    if not link:
        raise NotFoundError("Link not found")
    process = await assert_process_readable(
        db,
        process_id=process_id,
        current_user=current_user,
    )
    impacted = await lock_process_relationship_targets(
        db,
        process_ids={process.id},
        current_user=current_user,
        readable_process_id=process.id,
        allow_archived=True,
    )
    process = impacted[process.id]
    asset = await assert_asset_ordinary_mutation_allowed(db, asset_id=asset_id, current_user=current_user)
    await assert_no_pending_process_mutation(db, process_id=process.id)
    link = await _load_process_asset_link(db, asset_id=asset_id, process_id=process_id)
    if link is None:
        raise ConflictError("Process-Asset link changed concurrently; retry")
    before = _asset_link_snapshot(link)
    operation = {
        "kind": "process.link.asset.remove",
        "relationship_type": "asset",
        "action": "remove",
        "process_id": process.id,
        "related_resource_id": asset.id,
        "related_resource_name": asset.name,
        "link_id": link.id,
        "before": before,
        "after": {},
    }
    queued = await submit_process_relationship_mutation(
        db=db,
        process=process,
        mutation_kind="process.link.asset.remove",
        operation=operation,
        request_reason=request_reason,
        current_user=current_user,
        impacted_resources=[process_impact_resource(process)],
    )
    if queued is not None:
        return queued

    # Removing the primary link simply leaves the Asset with no primary.
    await db.delete(link)
    await db.flush()
    process.governance_version += 1
    asset.governance_version += 1

    await audit_asset.asset_link_deleted(
        db,
        actor=current_user,
        asset=asset,
        link_kind="process",
        target_id=process_id,
        target_label=process_display_name(process.l1_process, process.l2_subprocess),
    )
    await commit_service_boundary(db, boundary="ict_register_asset_link_delete")
    return None


async def list_asset_asset_links(
    db: AsyncSession,
    *,
    asset_id: int,
    current_user: User,
) -> list[AssetAssetLinkRead]:
    """Both directions: links where this Asset is the dependent or the supporting end."""
    await _require_asset_link_access(db, asset_id=asset_id, current_user=current_user, require_write=False)
    result = await db.execute(
        select(AssetAssetLink)
        .where((AssetAssetLink.dependent_asset_id == asset_id) | (AssetAssetLink.supporting_asset_id == asset_id))
        .order_by(AssetAssetLink.id)
    )
    links = list(result.scalars().all())
    candidate_ids = {link.dependent_asset_id for link in links} | {link.supporting_asset_id for link in links}
    candidates = [asset for candidate_id in candidate_ids if (asset := await load_asset(db, candidate_id)) is not None]
    readable_ids = {
        candidate.id
        for candidate in candidates
        if candidate.id == asset_id or can_read_asset_record(current_user, candidate)
    }
    visible_links = [
        link for link in links if link.dependent_asset_id in readable_ids and link.supporting_asset_id in readable_ids
    ]
    asset_names = {candidate.id: candidate.name for candidate in candidates if candidate.id in readable_ids}
    return [_serialize_asset_asset_link(link, asset_names) for link in visible_links]


async def add_asset_asset_link(
    db: AsyncSession,
    *,
    asset_id: int,
    payload: AssetAssetLinkCreate,
    current_user: User,
) -> AssetAssetLinkRead:
    asset = await assert_asset_readable(
        db,
        asset_id=asset_id,
        current_user=current_user,
    )

    if asset_id not in (payload.dependent_asset_id, payload.supporting_asset_id):
        raise ValidationError("The link must involve this asset")

    other_id = payload.supporting_asset_id if payload.dependent_asset_id == asset_id else payload.dependent_asset_id
    other = await assert_asset_readable(
        db,
        asset_id=other_id,
        current_user=current_user,
    )
    if other.is_archived:
        raise ConflictError("Cannot link archived asset")

    locked_assets = await _lock_asset_link_targets(
        db,
        asset_ids={asset.id, other.id},
    )
    asset = locked_assets[asset.id]
    other = locked_assets[other.id]
    await assert_locked_asset_ordinary_mutation_allowed(
        db,
        asset=asset,
        current_user=current_user,
    )
    if asset.is_archived or other.is_archived:
        raise ConflictError("Cannot link archived asset")

    existing = await db.execute(
        select(AssetAssetLink).where(
            AssetAssetLink.dependent_asset_id == payload.dependent_asset_id,
            AssetAssetLink.supporting_asset_id == payload.supporting_asset_id,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError("Link already exists")

    from app.services._governed_mutations.asset_mutations import (
        submit_asset_link_mutation_if_required,
    )

    link_values = payload.model_dump(exclude={"request_reason"})
    queued = await submit_asset_link_mutation_if_required(
        db=db,
        asset=asset,
        impacted_assets=[asset, other],
        operation={
            "relationship_type": "asset",
            "action": "add",
            "before": None,
            "after": link_values,
        },
        current_user=current_user,
        request_reason=payload.request_reason,
    )
    if queued is not None:
        return queued

    asset.governance_version += 1
    other.governance_version += 1
    link = AssetAssetLink(**link_values)
    db.add(link)
    await db.flush()

    await audit_asset.asset_link_created(
        db,
        actor=current_user,
        asset=asset,
        link_kind="asset",
        target_id=other_id,
        target_label=other.name,
    )
    await commit_service_boundary(db, boundary="ict_register_asset_link_create")
    await db.refresh(link)
    return _serialize_asset_asset_link(link, {asset.id: asset.name, other.id: other.name})


async def remove_asset_asset_link(
    db: AsyncSession,
    *,
    asset_id: int,
    link_id: int,
    request_reason: str | None,
    current_user: User,
) -> None:
    asset = await assert_asset_readable(
        db,
        asset_id=asset_id,
        current_user=current_user,
    )

    result = await db.execute(select(AssetAssetLink).where(AssetAssetLink.id == link_id))
    link = result.scalar_one_or_none()
    if not link or asset_id not in (link.dependent_asset_id, link.supporting_asset_id):
        raise NotFoundError("Link not found")

    other_id = link.supporting_asset_id if link.dependent_asset_id == asset_id else link.dependent_asset_id
    locked_assets = await _lock_asset_link_targets(
        db,
        asset_ids={asset.id, other_id},
    )
    asset = locked_assets[asset.id]
    other = locked_assets[other_id]
    await assert_locked_asset_ordinary_mutation_allowed(
        db,
        asset=asset,
        current_user=current_user,
    )
    link = (
        await db.execute(select(AssetAssetLink).where(AssetAssetLink.id == link_id).with_for_update())
    ).scalar_one_or_none()
    if not link or asset_id not in (link.dependent_asset_id, link.supporting_asset_id):
        raise ConflictError("Asset link changed concurrently; retry")
    target_label = other.name if other is not None and can_read_asset_record(current_user, other) else "Unknown asset"
    if other is not None:
        from app.services._governed_mutations.asset_mutations import (
            submit_asset_link_mutation_if_required,
        )

        before = {
            "id": link.id,
            "dependent_asset_id": link.dependent_asset_id,
            "supporting_asset_id": link.supporting_asset_id,
            "dependency_type": link.dependency_type,
            "spof": link.spof,
            "note": link.note,
        }
        queued = await submit_asset_link_mutation_if_required(
            db=db,
            asset=asset,
            impacted_assets=[asset, other],
            operation={"relationship_type": "asset", "action": "remove", "before": before, "after": None},
            current_user=current_user,
            request_reason=request_reason,
        )
        if queued is not None:
            return queued
        asset.governance_version += 1
        other.governance_version += 1
    await db.delete(link)
    await db.flush()

    await audit_asset.asset_link_deleted(
        db,
        actor=current_user,
        asset=asset,
        link_kind="asset",
        target_id=other_id,
        target_label=target_label,
    )
    await commit_service_boundary(db, boundary="ict_register_asset_link_delete")
