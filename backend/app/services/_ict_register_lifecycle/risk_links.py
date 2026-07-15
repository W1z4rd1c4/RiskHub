"""Risk<->Process and Risk<->Asset Link relations (issue #47).

The Link relations joining the existing Risk register to the ICT register
graph (workbook 13_Rizika subject references Proces/Aktivum). Managed from
the Risk detail — mutations require the Risk end's write permission
(risks:write) — and readable from the Process/Asset ends as a read-only
extension of their links endpoints. Reads require both ends' read
permissions (#43 dual-permission precedent); the Risk end follows Risk row
visibility with 404 anti-enumeration, and the Process/Asset far-end lists
filter link rows to the caller's visible Risks (same canonical predicate),
so a register-page user never learns an out-of-scope Risk's id or name.
Archived-end stance is STRICT per #43:
mutating from an archived Risk, or linking TO an archived target, conflicts
(409); unlinking an archived TARGET from an active Risk stays possible.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import risk as audit_risk
from app.core.exceptions import AuthorizationError, ConflictError, NotFoundError, ValidationError
from app.core.permissions import visible_risk_ids
from app.core.security import check_permission
from app.models import Asset, Process, Risk, RiskAssetLink, RiskProcessLink, User
from app.schemas.risk import (
    RiskAssetLinkCreate,
    RiskAssetLinkRead,
    RiskProcessLinkCreate,
    RiskProcessLinkRead,
)
from app.services._authorization_capabilities import (
    risk_asset_link_capabilities,
    risk_process_link_capabilities,
)
from app.services.transaction_boundary import commit_service_boundary

from .asset_policy import assert_asset_readable, can_read_asset_record, load_asset
from .derivation import process_display_name
from .policy import load_process
from .threat_links import require_risk_end_access


def _serialize_risk_process_link(
    link: RiskProcessLink,
    current_user: User,
    *,
    process_name: str | None = None,
    risk_id_code: str | None = None,
    risk_name: str | None = None,
) -> RiskProcessLinkRead:
    base = RiskProcessLinkRead.model_validate(link)
    return base.model_copy(
        update={
            "capabilities": risk_process_link_capabilities(current_user),
            "process_name": process_name,
            "risk_id_code": risk_id_code,
            "risk_name": risk_name,
        }
    )


def _serialize_risk_asset_link(
    link: RiskAssetLink,
    current_user: User,
    *,
    asset_name: str | None = None,
    risk_id_code: str | None = None,
    risk_name: str | None = None,
) -> RiskAssetLinkRead:
    base = RiskAssetLinkRead.model_validate(link)
    return base.model_copy(
        update={
            "capabilities": risk_asset_link_capabilities(current_user),
            "asset_name": asset_name,
            "risk_id_code": risk_id_code,
            "risk_name": risk_name,
        }
    )


async def _process_names_by_id(db: AsyncSession, process_ids: set[int]) -> dict[int, str]:
    """Workbook display names (l1 [– l2]) for the Process end of link rows."""
    if not process_ids:
        return {}
    rows = await db.execute(
        select(Process.id, Process.l1_process, Process.l2_subprocess).where(Process.id.in_(process_ids))
    )
    return {process_id: process_display_name(l1, l2) for process_id, l1, l2 in rows.all()}


async def _asset_names_by_id(db: AsyncSession, asset_ids: set[int]) -> dict[int, str]:
    if not asset_ids:
        return {}
    rows = await db.execute(select(Asset.id, Asset.name).where(Asset.id.in_(asset_ids)))
    return {asset_id: name for asset_id, name in rows.all()}


async def _visible_risk_labels(
    db: AsyncSession, current_user: User, risk_ids: set[int]
) -> dict[int, tuple[str, str]]:
    """The caller-visible slice of the referenced Risks, with display fields.

    One helper for both far-end lists: the id set is filtered through the
    canonical Risk visibility predicate, and the surviving rows carry the
    display fields (guardrail: names, not ids).
    """
    readable_ids = await visible_risk_ids(db, current_user, risk_ids)
    if not readable_ids:
        return {}
    rows = await db.execute(
        select(Risk.id, Risk.risk_id_code, Risk.name).where(Risk.id.in_(readable_ids))
    )
    return {risk_id: (code, name) for risk_id, code, name in rows.all()}


async def list_risk_process_links(
    db: AsyncSession,
    *,
    risk_id: int,
    current_user: User,
) -> list[RiskProcessLinkRead]:
    """The Risk-end read of the Risk<->Process Link relation."""
    risk = await require_risk_end_access(
        db, risk_id=risk_id, current_user=current_user, other_resource="processes", require_write=False
    )
    result = await db.execute(
        select(RiskProcessLink).where(RiskProcessLink.risk_id == risk_id).order_by(RiskProcessLink.id)
    )
    links = list(result.scalars().all())
    process_names = await _process_names_by_id(db, {link.process_id for link in links})
    return [
        _serialize_risk_process_link(
            link,
            current_user,
            process_name=process_names.get(link.process_id),
            risk_id_code=risk.risk_id_code,
            risk_name=risk.name,
        )
        for link in links
    ]


async def list_process_risk_links(
    db: AsyncSession,
    *,
    process_id: int,
    current_user: User,
) -> list[RiskProcessLinkRead]:
    """The Process-end read of the same Link relation (read-only extension).

    Rows are filtered to the caller's visible Risks (canonical predicate):
    a dept-scoped user sees only the linked Risks the Risk register itself
    would show them.
    """
    if not check_permission(current_user, "processes", "read"):
        raise AuthorizationError("Permission denied: processes:read")
    if not check_permission(current_user, "risks", "read"):
        raise AuthorizationError("Permission denied: risks:read")
    process = await load_process(db, process_id)
    if not process:
        raise NotFoundError("Process not found")

    result = await db.execute(
        select(RiskProcessLink).where(RiskProcessLink.process_id == process_id).order_by(RiskProcessLink.id)
    )
    links = list(result.scalars().all())
    risk_labels = await _visible_risk_labels(db, current_user, {link.risk_id for link in links})
    process_name = process_display_name(process.l1_process, process.l2_subprocess)
    return [
        _serialize_risk_process_link(
            link,
            current_user,
            process_name=process_name,
            risk_id_code=risk_labels[link.risk_id][0],
            risk_name=risk_labels[link.risk_id][1],
        )
        for link in links
        if link.risk_id in risk_labels
    ]


async def add_risk_process_link(
    db: AsyncSession,
    *,
    risk_id: int,
    payload: RiskProcessLinkCreate,
    current_user: User,
) -> RiskProcessLinkRead:
    risk = await require_risk_end_access(
        db, risk_id=risk_id, current_user=current_user, other_resource="processes", require_write=True
    )

    process = await load_process(db, payload.process_id)
    if not process:
        raise NotFoundError("Process not found")
    if process.is_archived:
        raise ConflictError("Cannot link archived process")

    existing = await db.execute(
        select(RiskProcessLink).where(
            RiskProcessLink.risk_id == risk_id,
            RiskProcessLink.process_id == payload.process_id,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError("Link already exists")

    link = RiskProcessLink(risk_id=risk_id, process_id=payload.process_id)
    db.add(link)
    await db.flush()

    await audit_risk.risk_link_created(
        db, actor=current_user, risk=risk, link_kind="process", target_id=payload.process_id
    )
    await commit_service_boundary(db, boundary="ict_register_risk_link_create")
    await db.refresh(link)
    return _serialize_risk_process_link(
        link,
        current_user,
        process_name=process_display_name(process.l1_process, process.l2_subprocess),
        risk_id_code=risk.risk_id_code,
        risk_name=risk.name,
    )


async def remove_risk_process_link(
    db: AsyncSession,
    *,
    risk_id: int,
    link_id: int,
    current_user: User,
) -> None:
    risk = await require_risk_end_access(
        db, risk_id=risk_id, current_user=current_user, other_resource="processes", require_write=True
    )

    result = await db.execute(select(RiskProcessLink).where(RiskProcessLink.id == link_id))
    link = result.scalar_one_or_none()
    if not link or link.risk_id != risk_id:
        raise NotFoundError("Link not found")

    process_id = link.process_id
    await db.delete(link)
    await db.flush()

    await audit_risk.risk_link_deleted(
        db, actor=current_user, risk=risk, link_kind="process", target_id=process_id
    )
    await commit_service_boundary(db, boundary="ict_register_risk_link_delete")


async def list_risk_asset_links(
    db: AsyncSession,
    *,
    risk_id: int,
    current_user: User,
) -> list[RiskAssetLinkRead]:
    """The Risk-end read of the Risk<->Asset Link relation."""
    risk = await require_risk_end_access(
        db, risk_id=risk_id, current_user=current_user, other_resource="assets", require_write=False
    )
    result = await db.execute(
        select(RiskAssetLink).where(RiskAssetLink.risk_id == risk_id).order_by(RiskAssetLink.id)
    )
    links = list(result.scalars().all())
    readable_assets = [
        asset
        for link in links
        if (asset := await load_asset(db, link.asset_id)) is not None
        and can_read_asset_record(current_user, asset)
    ]
    readable_asset_ids = {asset.id for asset in readable_assets}
    asset_names = {asset.id: asset.name for asset in readable_assets}
    return [
        _serialize_risk_asset_link(
            link,
            current_user,
            asset_name=asset_names.get(link.asset_id),
            risk_id_code=risk.risk_id_code,
            risk_name=risk.name,
        )
        for link in links
        if link.asset_id in readable_asset_ids
    ]


async def list_asset_risk_links(
    db: AsyncSession,
    *,
    asset_id: int,
    current_user: User,
) -> list[RiskAssetLinkRead]:
    """The Asset-end read of the same Link relation (read-only extension).

    Rows are filtered to the caller's visible Risks (canonical predicate):
    a dept-scoped user sees only the linked Risks the Risk register itself
    would show them.
    """
    if not check_permission(current_user, "risks", "read"):
        raise AuthorizationError("Permission denied: risks:read")
    asset = await assert_asset_readable(
        db,
        asset_id=asset_id,
        current_user=current_user,
    )

    result = await db.execute(
        select(RiskAssetLink).where(RiskAssetLink.asset_id == asset_id).order_by(RiskAssetLink.id)
    )
    links = list(result.scalars().all())
    risk_labels = await _visible_risk_labels(db, current_user, {link.risk_id for link in links})
    return [
        _serialize_risk_asset_link(
            link,
            current_user,
            asset_name=asset.name,
            risk_id_code=risk_labels[link.risk_id][0],
            risk_name=risk_labels[link.risk_id][1],
        )
        for link in links
        if link.risk_id in risk_labels
    ]


async def add_risk_asset_link(
    db: AsyncSession,
    *,
    risk_id: int,
    payload: RiskAssetLinkCreate,
    current_user: User,
) -> RiskAssetLinkRead:
    risk = await require_risk_end_access(
        db, risk_id=risk_id, current_user=current_user, other_resource="assets", require_write=True
    )

    asset = await assert_asset_readable(
        db,
        asset_id=payload.asset_id,
        current_user=current_user,
    )
    if asset.is_archived:
        raise ConflictError("Cannot link archived asset")

    existing = await db.execute(
        select(RiskAssetLink).where(
            RiskAssetLink.risk_id == risk_id,
            RiskAssetLink.asset_id == payload.asset_id,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError("Link already exists")

    link = RiskAssetLink(risk_id=risk_id, asset_id=payload.asset_id)
    db.add(link)
    await db.flush()

    await audit_risk.risk_link_created(
        db, actor=current_user, risk=risk, link_kind="asset", target_id=payload.asset_id
    )
    await commit_service_boundary(db, boundary="ict_register_risk_link_create")
    await db.refresh(link)
    return _serialize_risk_asset_link(
        link,
        current_user,
        asset_name=asset.name,
        risk_id_code=risk.risk_id_code,
        risk_name=risk.name,
    )


async def remove_risk_asset_link(
    db: AsyncSession,
    *,
    risk_id: int,
    link_id: int,
    current_user: User,
) -> None:
    risk = await require_risk_end_access(
        db, risk_id=risk_id, current_user=current_user, other_resource="assets", require_write=True
    )

    result = await db.execute(select(RiskAssetLink).where(RiskAssetLink.id == link_id))
    link = result.scalar_one_or_none()
    if not link or link.risk_id != risk_id:
        raise NotFoundError("Link not found")

    asset_id = link.asset_id
    await db.delete(link)
    await db.flush()

    await audit_risk.risk_link_deleted(
        db, actor=current_user, risk=risk, link_kind="asset", target_id=asset_id
    )
    await commit_service_boundary(db, boundary="ict_register_risk_link_delete")
