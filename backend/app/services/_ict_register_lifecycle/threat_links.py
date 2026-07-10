"""Threat<->Risk Link relations (issue #47).

The Link relation joining the Threat register to the existing Risk register
(workbook 13_Rizika ``id_hrozby``). Unlike the #43/#46 links it is manageable
from BOTH ends — the Threat page and the Risk detail — with each end's
mutations gated on THAT end's write permission (threats:write vs risks:write;
the #46 managing-end precedent applied per end). Reads require both ends'
read permissions (#43 dual-permission precedent); the Risk end additionally
follows Risk row visibility (department scope/ownership) with 404
anti-enumeration, mirroring the risk-end precedent in
``endpoints/risks/vendor_links.py``. Archived-end stance is STRICT per #43:
mutating from an archived end, or linking TO an archived target, conflicts
(409); unlinking an archived TARGET from an active managing end stays
possible.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import risk as audit_risk
from app.core.audit import threat as audit_threat
from app.core.exceptions import AuthorizationError, ConflictError, NotFoundError, ValidationError
from app.core.permissions import can_read_risk_id
from app.core.security import check_permission
from app.models import Risk, Threat, ThreatRiskLink, User
from app.schemas.threat import RiskThreatLinkCreate, ThreatRiskLinkCreate, ThreatRiskLinkRead
from app.services._authorization_capabilities import threat_risk_link_capabilities
from app.services.transaction_boundary import commit_service_boundary

from .threat_policy import load_threat


async def load_risk(db: AsyncSession, risk_id: int) -> Risk | None:
    result = await db.execute(select(Risk).where(Risk.id == risk_id))
    return result.scalar_one_or_none()


def _serialize_threat_risk_link(
    link: ThreatRiskLink, current_user: User, *, managed_from: str
) -> ThreatRiskLinkRead:
    base = ThreatRiskLinkRead.model_validate(link)
    return base.model_copy(
        update={
            "capabilities": threat_risk_link_capabilities(
                current_user, managed_from="threat" if managed_from == "threat" else "risk"
            )
        }
    )


async def _require_threat_end_access(
    db: AsyncSession,
    *,
    threat_id: int,
    current_user: User,
    require_write: bool,
) -> Threat:
    """Check both ends' read permissions, then Threat write access for mutations."""
    if not check_permission(current_user, "threats", "read"):
        raise AuthorizationError("Permission denied: threats:read")
    if not check_permission(current_user, "risks", "read"):
        raise AuthorizationError("Permission denied: risks:read")

    threat = await load_threat(db, threat_id)
    if not threat:
        raise NotFoundError("Threat not found")

    if require_write and not check_permission(current_user, "threats", "write"):
        raise AuthorizationError("Permission denied: threats:write")
    if require_write and threat.is_archived:
        raise ConflictError("Cannot mutate links for archived threat")

    return threat


async def require_risk_end_access(
    db: AsyncSession,
    *,
    risk_id: int,
    current_user: User,
    other_resource: str,
    require_write: bool,
) -> Risk:
    """Check both ends' read permissions, Risk row visibility, then risks:write.

    The Risk end carries row-level visibility (department scope/ownership),
    so an out-of-scope Risk 404s instead of leaking existence — the
    ``endpoints/risks/vendor_links.py`` anti-enumeration precedent.
    """
    if not check_permission(current_user, "risks", "read"):
        raise AuthorizationError("Permission denied: risks:read")
    if not check_permission(current_user, other_resource, "read"):
        raise AuthorizationError(f"Permission denied: {other_resource}:read")

    if not await can_read_risk_id(db, current_user, risk_id):
        raise NotFoundError("Risk not found")
    risk = await load_risk(db, risk_id)
    if not risk:
        raise NotFoundError("Risk not found")

    if require_write and not check_permission(current_user, "risks", "write"):
        raise AuthorizationError("Permission denied: risks:write")
    if require_write and risk.is_archived:
        raise ConflictError("Cannot mutate links for archived risk")

    return risk


async def _load_threat_risk_link_pair(
    db: AsyncSession, *, threat_id: int, risk_id: int
) -> ThreatRiskLink | None:
    result = await db.execute(
        select(ThreatRiskLink).where(
            ThreatRiskLink.threat_id == threat_id,
            ThreatRiskLink.risk_id == risk_id,
        )
    )
    return result.scalar_one_or_none()


async def _create_threat_risk_link_row(db: AsyncSession, *, threat_id: int, risk_id: int) -> ThreatRiskLink:
    if await _load_threat_risk_link_pair(db, threat_id=threat_id, risk_id=risk_id):
        raise ValidationError("Link already exists")
    link = ThreatRiskLink(threat_id=threat_id, risk_id=risk_id)
    db.add(link)
    await db.flush()
    return link


async def list_threat_risk_links(
    db: AsyncSession,
    *,
    threat_id: int,
    current_user: User,
) -> list[ThreatRiskLinkRead]:
    """The Threat-end read of the Link relation."""
    await _require_threat_end_access(
        db, threat_id=threat_id, current_user=current_user, require_write=False
    )
    result = await db.execute(
        select(ThreatRiskLink).where(ThreatRiskLink.threat_id == threat_id).order_by(ThreatRiskLink.id)
    )
    return [
        _serialize_threat_risk_link(link, current_user, managed_from="threat")
        for link in result.scalars().all()
    ]


async def list_risk_threat_links(
    db: AsyncSession,
    *,
    risk_id: int,
    current_user: User,
) -> list[ThreatRiskLinkRead]:
    """The Risk-end read of the same Link relation."""
    await require_risk_end_access(
        db, risk_id=risk_id, current_user=current_user, other_resource="threats", require_write=False
    )
    result = await db.execute(
        select(ThreatRiskLink).where(ThreatRiskLink.risk_id == risk_id).order_by(ThreatRiskLink.id)
    )
    return [
        _serialize_threat_risk_link(link, current_user, managed_from="risk")
        for link in result.scalars().all()
    ]


async def add_threat_risk_link(
    db: AsyncSession,
    *,
    threat_id: int,
    payload: ThreatRiskLinkCreate,
    current_user: User,
) -> ThreatRiskLinkRead:
    """Create the link from the Threat page (threats:write)."""
    threat = await _require_threat_end_access(
        db, threat_id=threat_id, current_user=current_user, require_write=True
    )

    risk = await load_risk(db, payload.risk_id)
    if not risk:
        raise NotFoundError("Risk not found")
    if risk.is_archived:
        raise ConflictError("Cannot link archived risk")

    link = await _create_threat_risk_link_row(db, threat_id=threat_id, risk_id=payload.risk_id)

    await audit_threat.threat_link_created(
        db, actor=current_user, threat=threat, link_kind="risk", target_id=payload.risk_id
    )
    await commit_service_boundary(db, boundary="ict_register_threat_link_create")
    await db.refresh(link)
    return _serialize_threat_risk_link(link, current_user, managed_from="threat")


async def remove_threat_risk_link(
    db: AsyncSession,
    *,
    threat_id: int,
    link_id: int,
    current_user: User,
) -> None:
    """Remove the link from the Threat page (threats:write)."""
    threat = await _require_threat_end_access(
        db, threat_id=threat_id, current_user=current_user, require_write=True
    )

    result = await db.execute(select(ThreatRiskLink).where(ThreatRiskLink.id == link_id))
    link = result.scalar_one_or_none()
    if not link or link.threat_id != threat_id:
        raise NotFoundError("Link not found")

    risk_id = link.risk_id
    await db.delete(link)
    await db.flush()

    await audit_threat.threat_link_deleted(
        db, actor=current_user, threat=threat, link_kind="risk", target_id=risk_id
    )
    await commit_service_boundary(db, boundary="ict_register_threat_link_delete")


async def add_risk_threat_link(
    db: AsyncSession,
    *,
    risk_id: int,
    payload: RiskThreatLinkCreate,
    current_user: User,
) -> ThreatRiskLinkRead:
    """Create the link from the Risk detail (risks:write)."""
    risk = await require_risk_end_access(
        db, risk_id=risk_id, current_user=current_user, other_resource="threats", require_write=True
    )

    threat = await load_threat(db, payload.threat_id)
    if not threat:
        raise NotFoundError("Threat not found")
    if threat.is_archived:
        raise ConflictError("Cannot link archived threat")

    link = await _create_threat_risk_link_row(db, threat_id=payload.threat_id, risk_id=risk_id)

    await audit_risk.risk_link_created(
        db, actor=current_user, risk=risk, link_kind="threat", target_id=payload.threat_id
    )
    await commit_service_boundary(db, boundary="ict_register_risk_link_create")
    await db.refresh(link)
    return _serialize_threat_risk_link(link, current_user, managed_from="risk")


async def remove_risk_threat_link(
    db: AsyncSession,
    *,
    risk_id: int,
    link_id: int,
    current_user: User,
) -> None:
    """Remove the link from the Risk detail (risks:write)."""
    risk = await require_risk_end_access(
        db, risk_id=risk_id, current_user=current_user, other_resource="threats", require_write=True
    )

    result = await db.execute(select(ThreatRiskLink).where(ThreatRiskLink.id == link_id))
    link = result.scalar_one_or_none()
    if not link or link.risk_id != risk_id:
        raise NotFoundError("Link not found")

    threat_id = link.threat_id
    await db.delete(link)
    await db.flush()

    await audit_risk.risk_link_deleted(
        db, actor=current_user, risk=risk, link_kind="threat", target_id=threat_id
    )
    await commit_service_boundary(db, boundary="ict_register_risk_link_delete")
