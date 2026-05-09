from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.datetime_utils import utc_now
from app.core.permissions import can_read_risk_id
from app.core.security import check_permission
from app.models import Control, ControlRiskLink, Risk, User
from app.services._control_execution.access import (
    ControlRiskAccessDecision,
    assert_control_readable_for_link,
    assert_control_writable_for_link,
    assert_risk_writable_for_link,
    load_control_for_link,
    load_risk_for_link,
)
from app.services._control_execution.link_policy import (
    create_control_risk_link_outcome,
    delete_control_risk_link_plan,
    load_link,
)
from app.services._control_execution.projection import (
    ControlExecutionListOutcome,
    ControlExecutionProjection,
    ControlRiskLinkOutcome,
    create_control_execution_projection,
    list_control_execution_projections,
    read_control_execution_projection,
    redact_links_for_visible_risks,
    visible_risk_control_links,
)
from app.services._monitoring_response import MonitoringResponseContext, load_monitoring_response_context


async def _ctx(db: AsyncSession) -> MonitoringResponseContext:
    now = utc_now()
    return await load_monitoring_response_context(db, now=now, today=now.date())


async def list_control_risk_links(
    db: AsyncSession,
    *,
    control_id: int,
    current_user: User,
) -> list[ControlRiskLinkOutcome]:
    control = await load_control_for_link(control_id, db)
    await assert_control_readable_for_link(db, current_user=current_user, control=control)

    links = list(
        (
            await db.execute(
                select(ControlRiskLink)
                .options(
                    selectinload(ControlRiskLink.risk),
                    selectinload(ControlRiskLink.control).selectinload(Control.executions),
                )
                .where(ControlRiskLink.control_id == control_id)
            )
        )
        .scalars()
        .all()
    )
    visible_links = await redact_links_for_visible_risks(db, current_user=current_user, links=links)
    context = await _ctx(db)
    return [ControlRiskLinkOutcome(link=link, monitoring_context=context) for link in visible_links]


async def create_control_risk_link(
    db: AsyncSession,
    *,
    control_id: int,
    risk_id: int,
    effectiveness: str,
    notes: str | None,
    current_user: User,
) -> ControlRiskLinkOutcome:
    control = await load_control_for_link(control_id, db)
    await assert_control_writable_for_link(db, current_user=current_user, control=control)

    risk = await load_risk_for_link(risk_id, db)
    await assert_risk_writable_for_link(db, current_user=current_user, risk=risk, allow_direct_owner=True)

    link = await create_control_risk_link_outcome(
        db,
        control_id=control_id,
        risk_id=risk_id,
        effectiveness=effectiveness,
        notes=notes,
        response_owner="control",
    )
    return ControlRiskLinkOutcome(
        link=link,
        monitoring_context=await _ctx(db),
    )


async def delete_control_risk_link(
    db: AsyncSession,
    *,
    control_id: int,
    risk_id: int,
    current_user: User,
) -> None:
    link = await load_link(db, control_id=control_id, risk_id=risk_id)

    control = (await db.execute(select(Control).where(Control.id == control_id))).scalar_one_or_none()
    if control is not None:
        await assert_control_writable_for_link(db, current_user=current_user, control=control)

    risk = (await db.execute(select(Risk).where(Risk.id == risk_id))).scalar_one_or_none()
    if risk is not None:
        await assert_risk_writable_for_link(db, current_user=current_user, risk=risk, allow_direct_owner=True)

    await delete_control_risk_link_plan(db, link)


async def list_risk_control_links(
    db: AsyncSession,
    *,
    risk_id: int,
    current_user: User,
) -> list[ControlRiskLinkOutcome]:
    if not check_permission(current_user, "controls", "read"):
        raise HTTPException(status_code=403, detail="Permission denied: controls:read")
    if not await can_read_risk_id(db, current_user, risk_id):
        raise HTTPException(status_code=404, detail="Risk not found")

    links = list(
        (
            await db.execute(
                select(ControlRiskLink)
                .options(
                    selectinload(ControlRiskLink.control).selectinload(Control.executions),
                    selectinload(ControlRiskLink.risk),
                )
                .where(ControlRiskLink.risk_id == risk_id)
            )
        )
        .scalars()
        .all()
    )
    visible_links = await visible_risk_control_links(db, current_user=current_user, links=links)
    context = await _ctx(db)
    return [ControlRiskLinkOutcome(link=link, monitoring_context=context) for link in visible_links]


async def create_risk_control_link(
    db: AsyncSession,
    *,
    risk_id: int,
    control_id: int,
    effectiveness: str,
    notes: str | None,
    current_user: User,
) -> ControlRiskLinkOutcome:
    risk = await load_risk_for_link(risk_id, db)
    await assert_risk_writable_for_link(db, current_user=current_user, risk=risk, allow_direct_owner=False)

    control = await load_control_for_link(control_id, db)
    await assert_control_writable_for_link(db, current_user=current_user, control=control)

    link = await create_control_risk_link_outcome(
        db,
        control_id=control_id,
        risk_id=risk_id,
        effectiveness=effectiveness,
        notes=notes,
        response_owner="risk",
    )
    return ControlRiskLinkOutcome(
        link=link,
        monitoring_context=await _ctx(db),
    )


async def delete_risk_control_link(
    db: AsyncSession,
    *,
    risk_id: int,
    control_id: int,
    current_user: User,
) -> None:
    link = await load_link(db, control_id=control_id, risk_id=risk_id)

    risk = (await db.execute(select(Risk).where(Risk.id == risk_id))).scalar_one_or_none()
    if risk is not None:
        await assert_risk_writable_for_link(db, current_user=current_user, risk=risk, allow_direct_owner=False)

    control = (await db.execute(select(Control).where(Control.id == control_id))).scalar_one_or_none()
    if control is not None:
        await assert_control_writable_for_link(db, current_user=current_user, control=control)

    await delete_control_risk_link_plan(db, link)


__all__ = [
    "ControlExecutionListOutcome",
    "ControlExecutionProjection",
    "ControlRiskAccessDecision",
    "ControlRiskLinkOutcome",
    "create_control_execution_projection",
    "create_control_risk_link",
    "create_risk_control_link",
    "delete_control_risk_link",
    "delete_risk_control_link",
    "list_control_execution_projections",
    "list_control_risk_links",
    "list_risk_control_links",
    "read_control_execution_projection",
]
