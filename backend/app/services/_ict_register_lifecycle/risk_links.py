"""Risk<->Process and Risk<->Asset Link relations (issue #47).

The Link relations joining the existing Risk register to the ICT register
graph (workbook 13_Rizika subject references Proces/Aktivum). Managed from
the Risk detail — mutations require the Risk end's write permission
(risks:write) — and readable from the Process/Asset ends as a read-only
extension of their links endpoints. Reads require both ends' read
permissions (#43 dual-permission precedent); the Risk end follows Risk row
visibility with 404 anti-enumeration. Archived-end stance is STRICT per #43:
mutating from an archived Risk, or linking TO an archived target, conflicts
(409); unlinking an archived TARGET from an active Risk stays possible.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import risk as audit_risk
from app.core.exceptions import AuthorizationError, ConflictError, NotFoundError, ValidationError
from app.core.security import check_permission
from app.models import RiskAssetLink, RiskProcessLink, User
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

from .asset_policy import load_asset
from .policy import load_process
from .threat_links import require_risk_end_access


def _serialize_risk_process_link(link: RiskProcessLink, current_user: User) -> RiskProcessLinkRead:
    base = RiskProcessLinkRead.model_validate(link)
    return base.model_copy(update={"capabilities": risk_process_link_capabilities(current_user)})


def _serialize_risk_asset_link(link: RiskAssetLink, current_user: User) -> RiskAssetLinkRead:
    base = RiskAssetLinkRead.model_validate(link)
    return base.model_copy(update={"capabilities": risk_asset_link_capabilities(current_user)})


async def list_risk_process_links(
    db: AsyncSession,
    *,
    risk_id: int,
    current_user: User,
) -> list[RiskProcessLinkRead]:
    """The Risk-end read of the Risk<->Process Link relation."""
    await require_risk_end_access(
        db, risk_id=risk_id, current_user=current_user, other_resource="processes", require_write=False
    )
    result = await db.execute(
        select(RiskProcessLink).where(RiskProcessLink.risk_id == risk_id).order_by(RiskProcessLink.id)
    )
    return [_serialize_risk_process_link(link, current_user) for link in result.scalars().all()]


async def list_process_risk_links(
    db: AsyncSession,
    *,
    process_id: int,
    current_user: User,
) -> list[RiskProcessLinkRead]:
    """The Process-end read of the same Link relation (read-only extension)."""
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
    return [_serialize_risk_process_link(link, current_user) for link in result.scalars().all()]


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
    return _serialize_risk_process_link(link, current_user)


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
    await require_risk_end_access(
        db, risk_id=risk_id, current_user=current_user, other_resource="assets", require_write=False
    )
    result = await db.execute(
        select(RiskAssetLink).where(RiskAssetLink.risk_id == risk_id).order_by(RiskAssetLink.id)
    )
    return [_serialize_risk_asset_link(link, current_user) for link in result.scalars().all()]


async def list_asset_risk_links(
    db: AsyncSession,
    *,
    asset_id: int,
    current_user: User,
) -> list[RiskAssetLinkRead]:
    """The Asset-end read of the same Link relation (read-only extension)."""
    if not check_permission(current_user, "assets", "read"):
        raise AuthorizationError("Permission denied: assets:read")
    if not check_permission(current_user, "risks", "read"):
        raise AuthorizationError("Permission denied: risks:read")
    asset = await load_asset(db, asset_id)
    if not asset:
        raise NotFoundError("Asset not found")

    result = await db.execute(
        select(RiskAssetLink).where(RiskAssetLink.asset_id == asset_id).order_by(RiskAssetLink.id)
    )
    return [_serialize_risk_asset_link(link, current_user) for link in result.scalars().all()]


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

    asset = await load_asset(db, payload.asset_id)
    if not asset:
        raise NotFoundError("Asset not found")
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
    return _serialize_risk_asset_link(link, current_user)


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
