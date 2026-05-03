from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional, cast

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.endpoints._monitoring_response import (
    MonitoringResponseContext,
    load_monitoring_response_context,
)
from app.core.datetime_utils import coerce_utc, utc_now
from app.core.permissions import (
    can_access_department_id,
    can_read_control_id,
    can_read_risk_id,
    check_department_access,
    control_visibility_clause,
    get_control_ids_where_owner,
    has_permission,
    is_control_owner,
    is_risk_control_owner,
    is_risk_kri_reporting_owner,
    visible_risk_ids,
)
from app.core.security import check_permission
from app.models import Control, ControlExecution, ControlRiskLink, Risk, User
from app.schemas.execution import ControlExecutionWriteBase, ExecutionResultEnum
from app.services._control_execution.workflow import (
    create_execution_record,
    linked_risk_names_for_visible_ids,
    load_execution_with_context,
    visible_linked_risk_names,
)


@dataclass(frozen=True)
class ControlExecutionProjection:
    execution: ControlExecution
    executed_by_name: str
    control_name: str
    control_owner_name: str
    linked_risks: list[str]


@dataclass(frozen=True)
class ControlExecutionListOutcome:
    projections: list[ControlExecutionProjection]
    total: int
    can_export_csv: bool


@dataclass(frozen=True)
class ControlRiskLinkOutcome:
    link: ControlRiskLink
    monitoring_context: MonitoringResponseContext


@dataclass(frozen=True)
class ControlRiskAccessDecision:
    allowed: bool
    status_code: int | None = None
    detail: str | None = None


def _apply_execution_scope_and_filters(
    query,
    *,
    visibility_clause,
    control_id: Optional[int],
    result: Optional[ExecutionResultEnum],
    from_date: Optional[datetime],
    to_date: Optional[datetime],
):
    from_date = coerce_utc(from_date)
    to_date = coerce_utc(to_date)
    if visibility_clause is not None:
        query = query.join(Control)
        query = query.where(visibility_clause)

    if control_id:
        query = query.where(ControlExecution.control_id == control_id)
    if result:
        query = query.where(ControlExecution.result == result)
    if from_date:
        query = query.where(ControlExecution.executed_at >= from_date)
    if to_date:
        query = query.where(ControlExecution.executed_at <= to_date)

    return query


def _linked_risk_candidate_ids(executions: list[ControlExecution]) -> set[int]:
    return {
        link.risk_id
        for execution in executions
        if execution.control is not None
        for link in execution.control.risk_links or []
        if link.risk_id is not None
    }


def _control_owner_name(control: Control | None) -> str:
    if control is None:
        return "Unknown"
    return control.control_owner.name if control.control_owner else "Unassigned"


def _projection_for_execution(
    execution: ControlExecution,
    *,
    linked_risks: list[str],
) -> ControlExecutionProjection:
    return ControlExecutionProjection(
        execution=execution,
        executed_by_name=execution.executed_by.name if execution.executed_by else "Unknown",
        control_name=execution.control.name if execution.control else "Unknown",
        control_owner_name=_control_owner_name(execution.control),
        linked_risks=linked_risks,
    )


async def list_control_execution_projections(
    db: AsyncSession,
    *,
    current_user: User,
    skip: int,
    limit: int,
    control_id: Optional[int],
    result: Optional[ExecutionResultEnum],
    from_date: Optional[datetime],
    to_date: Optional[datetime],
) -> ControlExecutionListOutcome:
    visibility_clause = control_visibility_clause(current_user)
    count_query = _apply_execution_scope_and_filters(
        select(func.count(func.distinct(ControlExecution.id))),
        visibility_clause=visibility_clause,
        control_id=control_id,
        result=result,
        from_date=from_date,
        to_date=to_date,
    )
    total = int(await db.scalar(count_query) or 0)

    list_query = _apply_execution_scope_and_filters(
        select(ControlExecution).options(
            selectinload(ControlExecution.executed_by),
            selectinload(ControlExecution.control).options(
                selectinload(Control.control_owner),
                selectinload(Control.department),
                selectinload(Control.risk_links).selectinload(ControlRiskLink.risk),
            ),
        ),
        visibility_clause=visibility_clause,
        control_id=control_id,
        result=result,
        from_date=from_date,
        to_date=to_date,
    )
    list_query = list_query.order_by(desc(ControlExecution.executed_at), desc(ControlExecution.id)).offset(skip).limit(limit)

    result_set = await db.execute(list_query)
    executions = list(result_set.scalars().all())
    readable_linked_risk_ids = await visible_risk_ids(db, current_user, _linked_risk_candidate_ids(executions))
    return ControlExecutionListOutcome(
        projections=[
            _projection_for_execution(
                execution,
                linked_risks=linked_risk_names_for_visible_ids(execution.control, readable_linked_risk_ids),
            )
            for execution in executions
        ],
        total=total,
        can_export_csv=has_permission(current_user, "reports", "read"),
    )


async def read_control_execution_projection(
    db: AsyncSession,
    *,
    current_user: User,
    execution_id: int,
) -> ControlExecutionProjection:
    execution = await load_execution_with_context(db, execution_id)
    if execution.control and not await can_read_control_id(db, current_user, execution.control.id):
        raise HTTPException(status_code=404, detail="Execution not found")
    return _projection_for_execution(
        execution,
        linked_risks=await visible_linked_risk_names(db, current_user=current_user, control=execution.control),
    )


async def create_control_execution_projection(
    db: AsyncSession,
    *,
    current_user: User,
    control_id: int,
    payload: ControlExecutionWriteBase,
) -> ControlExecutionProjection:
    execution = await create_execution_record(db, current_user=current_user, control_id=control_id, payload=payload)
    return _projection_for_execution(
        execution,
        linked_risks=await visible_linked_risk_names(db, current_user=current_user, control=execution.control),
    )


async def _monitoring_context(db: AsyncSession) -> MonitoringResponseContext:
    now = utc_now()
    return await load_monitoring_response_context(db, now=now, today=now.date())


async def _load_control(control_id: int, db: AsyncSession) -> Control:
    result = await db.execute(select(Control).where(Control.id == control_id))
    control = result.scalar_one_or_none()
    if control is None:
        raise HTTPException(status_code=404, detail="Control not found")
    return control


async def _load_risk(risk_id: int, db: AsyncSession) -> Risk:
    result = await db.execute(select(Risk).where(Risk.id == risk_id))
    risk = result.scalar_one_or_none()
    if risk is None:
        raise HTTPException(status_code=404, detail="Risk not found")
    return risk


async def _assert_control_readable_for_link(db: AsyncSession, *, current_user: User, control: Control) -> None:
    if await is_control_owner(db, current_user.id, control.id):
        return
    try:
        check_department_access(control.department_id, current_user)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_403_FORBIDDEN:
            raise HTTPException(status_code=404, detail="Control not found") from exc
        raise


async def _assert_control_writable_for_link(db: AsyncSession, *, current_user: User, control: Control) -> None:
    if not await is_control_owner(db, current_user.id, control.id):
        check_department_access(control.department_id, current_user)


async def _risk_link_access_decision(
    db: AsyncSession,
    *,
    current_user: User,
    risk: Risk,
    allow_direct_owner: bool,
) -> ControlRiskAccessDecision:
    if await is_risk_kri_reporting_owner(db, current_user.id, risk.id):
        return ControlRiskAccessDecision(allowed=True)
    if await is_risk_control_owner(db, current_user.id, risk.id):
        return ControlRiskAccessDecision(allowed=True)
    if allow_direct_owner and risk.owner_id == current_user.id:
        return ControlRiskAccessDecision(allowed=True)
    try:
        check_department_access(risk.department_id, current_user)
        return ControlRiskAccessDecision(allowed=True)
    except HTTPException:
        return ControlRiskAccessDecision(allowed=False, status_code=403, detail="Access denied to risk")


async def _assert_risk_writable_for_link(
    db: AsyncSession,
    *,
    current_user: User,
    risk: Risk,
    allow_direct_owner: bool,
) -> None:
    decision = await _risk_link_access_decision(
        db,
        current_user=current_user,
        risk=risk,
        allow_direct_owner=allow_direct_owner,
    )
    if not decision.allowed:
        raise HTTPException(status_code=decision.status_code or 403, detail=decision.detail or "Access denied to risk")


async def _load_link_for_control(db: AsyncSession, *, control_id: int, risk_id: int) -> ControlRiskLink:
    result = await db.execute(
        select(ControlRiskLink)
        .where(ControlRiskLink.control_id == control_id)
        .where(ControlRiskLink.risk_id == risk_id)
    )
    link = result.scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=404, detail="Link not found")
    return link


async def _load_link_for_risk(db: AsyncSession, *, risk_id: int, control_id: int) -> ControlRiskLink:
    result = await db.execute(
        select(ControlRiskLink)
        .where(ControlRiskLink.risk_id == risk_id)
        .where(ControlRiskLink.control_id == control_id)
    )
    link = result.scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=404, detail="Link not found")
    return link


async def _reload_link_for_control_response(db: AsyncSession, link_id: int) -> ControlRiskLink:
    result = await db.execute(
        select(ControlRiskLink)
        .options(
            selectinload(ControlRiskLink.risk),
            selectinload(ControlRiskLink.control).selectinload(Control.executions),
        )
        .where(ControlRiskLink.id == link_id)
    )
    return result.scalar_one()


async def _reload_link_for_risk_response(db: AsyncSession, link_id: int) -> ControlRiskLink:
    result = await db.execute(
        select(ControlRiskLink)
        .options(
            selectinload(ControlRiskLink.control).selectinload(Control.executions),
            selectinload(ControlRiskLink.risk),
        )
        .where(ControlRiskLink.id == link_id)
    )
    return result.scalar_one()


async def list_control_risk_links(
    db: AsyncSession,
    *,
    control_id: int,
    current_user: User,
) -> list[ControlRiskLinkOutcome]:
    control = await _load_control(control_id, db)
    await _assert_control_readable_for_link(db, current_user=current_user, control=control)

    result = await db.execute(
        select(ControlRiskLink)
        .options(
            selectinload(ControlRiskLink.risk),
            selectinload(ControlRiskLink.control).selectinload(Control.executions),
        )
        .where(ControlRiskLink.control_id == control_id)
    )
    links = list(result.scalars().all())
    readable_risk_ids = await visible_risk_ids(db, current_user, [link.risk_id for link in links if link.risk_id is not None])
    for link in links:
        if link.risk and link.risk.id not in readable_risk_ids:
            cast(Any, link).risk = None

    context = await _monitoring_context(db)
    return [ControlRiskLinkOutcome(link=link, monitoring_context=context) for link in links]


async def create_control_risk_link(
    db: AsyncSession,
    *,
    control_id: int,
    risk_id: int,
    effectiveness: str,
    notes: str | None,
    current_user: User,
) -> ControlRiskLinkOutcome:
    control = await _load_control(control_id, db)
    await _assert_control_writable_for_link(db, current_user=current_user, control=control)

    risk = await _load_risk(risk_id, db)
    await _assert_risk_writable_for_link(db, current_user=current_user, risk=risk, allow_direct_owner=True)

    existing = await db.execute(
        select(ControlRiskLink).where(ControlRiskLink.control_id == control_id).where(ControlRiskLink.risk_id == risk_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Link already exists")

    link = ControlRiskLink(control_id=control_id, risk_id=risk_id, effectiveness=effectiveness, notes=notes)
    db.add(link)
    await db.commit()
    await db.refresh(link)

    return ControlRiskLinkOutcome(
        link=await _reload_link_for_control_response(db, link.id),
        monitoring_context=await _monitoring_context(db),
    )


async def delete_control_risk_link(
    db: AsyncSession,
    *,
    control_id: int,
    risk_id: int,
    current_user: User,
) -> None:
    link = await _load_link_for_control(db, control_id=control_id, risk_id=risk_id)

    control_result = await db.execute(select(Control).where(Control.id == control_id))
    control = control_result.scalar_one_or_none()
    if control is not None:
        await _assert_control_writable_for_link(db, current_user=current_user, control=control)

    risk_result = await db.execute(select(Risk).where(Risk.id == risk_id))
    risk = risk_result.scalar_one_or_none()
    if risk is not None:
        await _assert_risk_writable_for_link(db, current_user=current_user, risk=risk, allow_direct_owner=True)

    await db.delete(link)
    await db.commit()


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

    owned_control_ids = set(await get_control_ids_where_owner(db, current_user.id))
    result = await db.execute(
        select(ControlRiskLink)
        .options(
            selectinload(ControlRiskLink.control).selectinload(Control.executions),
            selectinload(ControlRiskLink.risk),
        )
        .where(ControlRiskLink.risk_id == risk_id)
    )
    visible_links: list[ControlRiskLink] = []
    for link in result.scalars().all():
        if not link.control:
            continue
        if can_access_department_id(current_user, link.control.department_id) or link.control.id in owned_control_ids:
            visible_links.append(link)

    context = await _monitoring_context(db)
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
    risk = await _load_risk(risk_id, db)
    await _assert_risk_writable_for_link(db, current_user=current_user, risk=risk, allow_direct_owner=False)

    control = await _load_control(control_id, db)
    await _assert_control_writable_for_link(db, current_user=current_user, control=control)

    existing = await db.execute(
        select(ControlRiskLink).where(ControlRiskLink.risk_id == risk_id).where(ControlRiskLink.control_id == control_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Link already exists")

    link = ControlRiskLink(control_id=control_id, risk_id=risk_id, effectiveness=effectiveness, notes=notes)
    db.add(link)
    await db.commit()
    await db.refresh(link)

    return ControlRiskLinkOutcome(
        link=await _reload_link_for_risk_response(db, link.id),
        monitoring_context=await _monitoring_context(db),
    )


async def delete_risk_control_link(
    db: AsyncSession,
    *,
    risk_id: int,
    control_id: int,
    current_user: User,
) -> None:
    link = await _load_link_for_risk(db, risk_id=risk_id, control_id=control_id)

    risk_result = await db.execute(select(Risk).where(Risk.id == risk_id))
    risk = risk_result.scalar_one_or_none()
    if risk is not None:
        await _assert_risk_writable_for_link(db, current_user=current_user, risk=risk, allow_direct_owner=False)

    control_result = await db.execute(select(Control).where(Control.id == control_id))
    control = control_result.scalar_one_or_none()
    if control is not None:
        await _assert_control_writable_for_link(db, current_user=current_user, control=control)

    await db.delete(link)
    await db.commit()
