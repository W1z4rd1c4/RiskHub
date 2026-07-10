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

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import asset as audit_asset
from app.core.exceptions import AuthorizationError, ConflictError, NotFoundError, ValidationError
from app.core.security import check_permission
from app.models import Asset, AssetAssetLink, Process, ProcessAssetLink, User
from app.schemas.asset import (
    AssetAssetLinkCreate,
    AssetAssetLinkRead,
    ProcessAssetLinkCreate,
    ProcessAssetLinkRead,
    ProcessAssetLinkUpdate,
)
from app.services.transaction_boundary import commit_service_boundary

from .asset_policy import load_asset
from .derivation import process_display_name
from .policy import load_process


async def _asset_names_by_id(db: AsyncSession, asset_ids: set[int]) -> dict[int, str]:
    """Display names for the Asset ends of link rows (guardrail: names, not ids)."""
    if not asset_ids:
        return {}
    rows = await db.execute(select(Asset.id, Asset.name).where(Asset.id.in_(asset_ids)))
    return {asset_id: name for asset_id, name in rows.all()}


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
) -> ProcessAssetLinkRead:
    base = ProcessAssetLinkRead.model_validate(link)
    return base.model_copy(update={"process_name": process_name, "asset_name": asset_name})


def _serialize_asset_asset_link(
    link: AssetAssetLink, asset_names: dict[int, str]
) -> AssetAssetLinkRead:
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
            raise ConflictError(
                "The asset's primary Process designation changed concurrently; retry"
            ) from exc
        raise


async def _require_asset_link_access(
    db: AsyncSession,
    *,
    asset_id: int,
    current_user: User,
    require_write: bool,
    require_process_read: bool,
) -> Asset:
    """Check Asset read access, optional Asset write access, and Process read access."""
    if not check_permission(current_user, "assets", "read"):
        raise AuthorizationError("Permission denied: assets:read")
    if require_process_read and not check_permission(current_user, "processes", "read"):
        raise AuthorizationError("Permission denied: processes:read")

    asset = await load_asset(db, asset_id)
    if not asset:
        raise NotFoundError("Asset not found")

    if require_write and not check_permission(current_user, "assets", "write"):
        raise AuthorizationError("Permission denied: assets:write")
    if require_write and asset.is_archived:
        raise ConflictError("Cannot mutate links for archived asset")

    return asset


async def _load_process_asset_link(
    db: AsyncSession, *, asset_id: int, process_id: int
) -> ProcessAssetLink | None:
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
    asset = await _require_asset_link_access(
        db, asset_id=asset_id, current_user=current_user, require_write=False, require_process_read=True
    )
    result = await db.execute(
        select(ProcessAssetLink).where(ProcessAssetLink.asset_id == asset_id).order_by(ProcessAssetLink.id)
    )
    links = list(result.scalars().all())
    process_names = await _process_names_by_id(db, {link.process_id for link in links})
    return [
        _serialize_process_asset_link(
            link, process_name=process_names.get(link.process_id), asset_name=asset.name
        )
        for link in links
    ]


async def list_process_asset_links(
    db: AsyncSession,
    *,
    process_id: int,
    current_user: User,
) -> list[ProcessAssetLinkRead]:
    """The Process-end read of the same Link relation."""
    if not check_permission(current_user, "processes", "read"):
        raise AuthorizationError("Permission denied: processes:read")
    if not check_permission(current_user, "assets", "read"):
        raise AuthorizationError("Permission denied: assets:read")
    process = await load_process(db, process_id)
    if not process:
        raise NotFoundError("Process not found")

    result = await db.execute(
        select(ProcessAssetLink)
        .where(ProcessAssetLink.process_id == process_id)
        .order_by(ProcessAssetLink.id)
    )
    links = list(result.scalars().all())
    asset_names = await _asset_names_by_id(db, {link.asset_id for link in links})
    process_name = process_display_name(process.l1_process, process.l2_subprocess)
    return [
        _serialize_process_asset_link(
            link, process_name=process_name, asset_name=asset_names.get(link.asset_id)
        )
        for link in links
    ]


async def add_asset_process_link(
    db: AsyncSession,
    *,
    asset_id: int,
    payload: ProcessAssetLinkCreate,
    current_user: User,
) -> ProcessAssetLinkRead:
    asset = await _require_asset_link_access(
        db, asset_id=asset_id, current_user=current_user, require_write=True, require_process_read=True
    )

    process = await load_process(db, payload.process_id)
    if not process:
        raise NotFoundError("Process not found")
    if process.is_archived:
        raise ConflictError("Cannot link archived process")

    if await _load_process_asset_link(db, asset_id=asset_id, process_id=payload.process_id):
        raise ValidationError("Link already exists")

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

    await audit_asset.asset_link_created(
        db, actor=current_user, asset=asset, link_kind="process", target_id=payload.process_id
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
) -> ProcessAssetLinkRead:
    asset = await _require_asset_link_access(
        db, asset_id=asset_id, current_user=current_user, require_write=True, require_process_read=True
    )

    link = await _load_process_asset_link(db, asset_id=asset_id, process_id=process_id)
    if not link:
        raise NotFoundError("Link not found")
    process_names = await _process_names_by_id(db, {process_id})

    updates = {field: getattr(payload, field) for field in payload.model_fields_set}
    if updates.get("is_primary") is None:
        updates.pop("is_primary", None)

    changes: dict[str, dict[str, object]] = {
        field: {"old": getattr(link, field), "new": value}
        for field, value in updates.items()
        if getattr(link, field) != value
    }
    if not changes:
        return _serialize_process_asset_link(
            link, process_name=process_names.get(process_id), asset_name=asset.name
        )

    # Designating a new primary atomically demotes the previous one — one
    # call, one transaction, never a client-side two-step.
    if changes.get("is_primary", {}).get("new") is True:
        await _demote_current_primary(db, asset_id=asset_id)

    for field, change in changes.items():
        setattr(link, field, change["new"])
    await _flush_guarding_primary_designation(db)

    await audit_asset.asset_link_updated(
        db,
        actor=current_user,
        asset=asset,
        link_kind="process",
        target_id=process_id,
        changes=changes,
    )
    await commit_service_boundary(db, boundary="ict_register_asset_link_update")
    await db.refresh(link)
    return _serialize_process_asset_link(
        link, process_name=process_names.get(process_id), asset_name=asset.name
    )


async def remove_asset_process_link(
    db: AsyncSession,
    *,
    asset_id: int,
    process_id: int,
    current_user: User,
) -> None:
    asset = await _require_asset_link_access(
        db, asset_id=asset_id, current_user=current_user, require_write=True, require_process_read=True
    )

    link = await _load_process_asset_link(db, asset_id=asset_id, process_id=process_id)
    if not link:
        raise NotFoundError("Link not found")

    # Removing the primary link simply leaves the Asset with no primary.
    await db.delete(link)
    await db.flush()

    await audit_asset.asset_link_deleted(
        db, actor=current_user, asset=asset, link_kind="process", target_id=process_id
    )
    await commit_service_boundary(db, boundary="ict_register_asset_link_delete")


async def list_asset_asset_links(
    db: AsyncSession,
    *,
    asset_id: int,
    current_user: User,
) -> list[AssetAssetLinkRead]:
    """Both directions: links where this Asset is the dependent or the supporting end."""
    await _require_asset_link_access(
        db, asset_id=asset_id, current_user=current_user, require_write=False, require_process_read=False
    )
    result = await db.execute(
        select(AssetAssetLink)
        .where(
            (AssetAssetLink.dependent_asset_id == asset_id)
            | (AssetAssetLink.supporting_asset_id == asset_id)
        )
        .order_by(AssetAssetLink.id)
    )
    links = list(result.scalars().all())
    asset_names = await _asset_names_by_id(
        db,
        {link.dependent_asset_id for link in links} | {link.supporting_asset_id for link in links},
    )
    return [_serialize_asset_asset_link(link, asset_names) for link in links]


async def add_asset_asset_link(
    db: AsyncSession,
    *,
    asset_id: int,
    payload: AssetAssetLinkCreate,
    current_user: User,
) -> AssetAssetLinkRead:
    asset = await _require_asset_link_access(
        db, asset_id=asset_id, current_user=current_user, require_write=True, require_process_read=False
    )

    if asset_id not in (payload.dependent_asset_id, payload.supporting_asset_id):
        raise ValidationError("The link must involve this asset")

    other_id = (
        payload.supporting_asset_id
        if payload.dependent_asset_id == asset_id
        else payload.dependent_asset_id
    )
    other = await load_asset(db, other_id)
    if not other:
        raise NotFoundError("Asset not found")
    if other.is_archived:
        raise ConflictError("Cannot link archived asset")

    existing = await db.execute(
        select(AssetAssetLink).where(
            AssetAssetLink.dependent_asset_id == payload.dependent_asset_id,
            AssetAssetLink.supporting_asset_id == payload.supporting_asset_id,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError("Link already exists")

    link = AssetAssetLink(
        dependent_asset_id=payload.dependent_asset_id,
        supporting_asset_id=payload.supporting_asset_id,
        dependency_type=payload.dependency_type,
        spof=payload.spof,
        note=payload.note,
    )
    db.add(link)
    await db.flush()

    await audit_asset.asset_link_created(
        db, actor=current_user, asset=asset, link_kind="asset", target_id=other_id
    )
    await commit_service_boundary(db, boundary="ict_register_asset_link_create")
    await db.refresh(link)
    return _serialize_asset_asset_link(link, {asset.id: asset.name, other.id: other.name})


async def remove_asset_asset_link(
    db: AsyncSession,
    *,
    asset_id: int,
    link_id: int,
    current_user: User,
) -> None:
    asset = await _require_asset_link_access(
        db, asset_id=asset_id, current_user=current_user, require_write=True, require_process_read=False
    )

    result = await db.execute(select(AssetAssetLink).where(AssetAssetLink.id == link_id))
    link = result.scalar_one_or_none()
    if not link or asset_id not in (link.dependent_asset_id, link.supporting_asset_id):
        raise NotFoundError("Link not found")

    other_id = (
        link.supporting_asset_id if link.dependent_asset_id == asset_id else link.dependent_asset_id
    )
    await db.delete(link)
    await db.flush()

    await audit_asset.asset_link_deleted(
        db, actor=current_user, asset=asset, link_kind="asset", target_id=other_id
    )
    await commit_service_boundary(db, boundary="ict_register_asset_link_delete")
