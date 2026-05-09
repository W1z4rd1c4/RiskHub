from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional, cast

from fastapi import HTTPException
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.datetime_utils import coerce_utc
from app.core.permissions import (
    can_access_department_id,
    can_read_control_id,
    control_visibility_clause,
    get_control_ids_where_owner,
    has_permission,
    visible_risk_ids,
)
from app.models import Control, ControlExecution, ControlRiskLink, User
from app.schemas.execution import ControlExecutionWriteBase, ExecutionResultEnum
from app.services._control_execution.workflow import (
    create_execution_record,
    linked_risk_names_for_visible_ids,
    load_execution_with_context,
    visible_linked_risk_names,
)
from app.services._monitoring_response import MonitoringResponseContext


@dataclass(frozen=True)
class ControlExecutionProjection:
    execution: ControlExecution
    executed_by_name: str
    control_name: str
    control_owner_name: str
    linked_risks: list[str]


@dataclass(frozen=True)
class ControlRiskLinkOutcome:
    link: ControlRiskLink
    monitoring_context: MonitoringResponseContext


@dataclass(frozen=True)
class ControlExecutionListOutcome:
    projections: list[ControlExecutionProjection]
    total: int
    can_export_csv: bool


def apply_execution_scope_and_filters(
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


def linked_risk_candidate_ids(executions: list[ControlExecution]) -> set[int]:
    return {
        link.risk_id
        for execution in executions
        if execution.control is not None
        for link in execution.control.risk_links or []
        if link.risk_id is not None
    }


def control_owner_name(control: Control | None) -> str:
    if control is None:
        return "Unknown"
    return control.control_owner.name if control.control_owner else "Unassigned"


def projection_for_execution(
    execution: ControlExecution,
    *,
    linked_risks: list[str],
) -> ControlExecutionProjection:
    return ControlExecutionProjection(
        execution=execution,
        executed_by_name=execution.executed_by.name if execution.executed_by else "Unknown",
        control_name=execution.control.name if execution.control else "Unknown",
        control_owner_name=control_owner_name(execution.control),
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
    count_query = apply_execution_scope_and_filters(
        select(func.count(func.distinct(ControlExecution.id))),
        visibility_clause=visibility_clause,
        control_id=control_id,
        result=result,
        from_date=from_date,
        to_date=to_date,
    )
    total = int(await db.scalar(count_query) or 0)

    list_query = apply_execution_scope_and_filters(
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
    list_query = (
        list_query.order_by(desc(ControlExecution.executed_at), desc(ControlExecution.id))
        .offset(skip)
        .limit(limit)
    )

    executions = list((await db.execute(list_query)).scalars().all())
    readable_linked_risk_ids = await visible_risk_ids(db, current_user, linked_risk_candidate_ids(executions))
    return ControlExecutionListOutcome(
        projections=[
            projection_for_execution(
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
    return projection_for_execution(
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
    return projection_for_execution(
        execution,
        linked_risks=await visible_linked_risk_names(db, current_user=current_user, control=execution.control),
    )


async def redact_links_for_visible_risks(
    db: AsyncSession,
    *,
    current_user: User,
    links: list[ControlRiskLink],
) -> list[ControlRiskLink]:
    readable_risk_ids = await visible_risk_ids(
        db,
        current_user,
        [link.risk_id for link in links if link.risk_id is not None],
    )
    for link in links:
        if link.risk and link.risk.id not in readable_risk_ids:
            cast(Any, link).risk = None
    return links


async def visible_risk_control_links(
    db: AsyncSession,
    *,
    current_user: User,
    links: list[ControlRiskLink],
) -> list[ControlRiskLink]:
    owned_control_ids = set(await get_control_ids_where_owner(db, current_user.id))
    visible_links: list[ControlRiskLink] = []
    for link in links:
        if not link.control:
            continue
        if can_access_department_id(current_user, link.control.department_id) or link.control.id in owned_control_ids:
            visible_links.append(link)
    return visible_links
