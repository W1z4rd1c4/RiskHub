from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.datetime_utils import utc_now
from app.core.permissions import check_department_access, is_control_owner, visible_risk_ids
from app.models import Control, ControlExecution, User
from app.models.control import ControlStatus
from app.models.risk import ControlRiskLink
from app.schemas.control import ControlFrequencyEnum, normalize_control_frequency
from app.schemas.execution import ControlExecutionWriteBase


def calculate_next_scheduled(frequency: str, executed_at: datetime) -> datetime:
    try:
        normalized_frequency = normalize_control_frequency(frequency).value
    except ValueError:
        normalized_frequency = ControlFrequencyEnum.monthly.value

    frequency_deltas = {
        ControlFrequencyEnum.daily.value: timedelta(days=1),
        ControlFrequencyEnum.weekly.value: timedelta(weeks=1),
        ControlFrequencyEnum.monthly.value: timedelta(days=30),
        ControlFrequencyEnum.quarterly.value: timedelta(days=90),
        ControlFrequencyEnum.semi_annually.value: timedelta(days=182),
        ControlFrequencyEnum.annually.value: timedelta(days=365),
        ControlFrequencyEnum.ad_hoc.value: timedelta(days=30),
        ControlFrequencyEnum.continuous.value: timedelta(days=1),
    }
    return executed_at + frequency_deltas.get(normalized_frequency, timedelta(days=30))


def control_is_executable(control: Control) -> bool:
    return not control.is_archived and control.status in {ControlStatus.active.value, ControlStatus.draft.value}


async def load_control_for_execution(
    db: AsyncSession,
    *,
    control_id: int,
    current_user: User,
    for_update: bool = False,
) -> Control:
    stmt = (
        select(Control)
        .options(
            selectinload(Control.department),
            selectinload(Control.control_owner),
            selectinload(Control.risk_links).selectinload(ControlRiskLink.risk),
        )
        .where(Control.id == control_id)
    )
    if for_update:
        stmt = stmt.with_for_update()

    result = await db.execute(stmt)
    control = result.scalar_one_or_none()
    if control is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Control not found")

    is_owner = await is_control_owner(db, current_user.id, control.id)
    if not is_owner:
        check_department_access(control.department_id, current_user)

    return control


async def create_execution_record(
    db: AsyncSession,
    *,
    current_user: User,
    control_id: int,
    payload: ControlExecutionWriteBase,
) -> ControlExecution:
    control = await load_control_for_execution(
        db,
        control_id=control_id,
        current_user=current_user,
        for_update=True,
    )
    if not control_is_executable(control):
        detail = "Cannot execute an archived control" if control.is_archived else "Cannot execute an inactive control"
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)

    executed_at = utc_now()
    next_scheduled = payload.next_scheduled or calculate_next_scheduled(control.frequency, executed_at)
    execution = ControlExecution(
        control_id=control.id,
        executed_by_id=current_user.id,
        executed_at=executed_at,
        result=payload.result.value,
        findings=payload.findings,
        evidence_reference=payload.evidence_reference,
        notes=payload.notes,
        next_scheduled=next_scheduled,
    )
    db.add(execution)
    await db.commit()
    await db.refresh(execution)
    return await load_execution_with_context(db, execution.id)


async def load_execution_with_context(db: AsyncSession, execution_id: int) -> ControlExecution:
    result = await db.execute(
        select(ControlExecution)
        .options(
            selectinload(ControlExecution.executed_by),
            selectinload(ControlExecution.control).options(
                selectinload(Control.control_owner),
                selectinload(Control.department),
                selectinload(Control.risk_links).selectinload(ControlRiskLink.risk),
            ),
        )
        .where(ControlExecution.id == execution_id)
    )
    execution = result.scalar_one_or_none()
    if execution is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Execution not found")
    return execution


async def visible_linked_risk_names(
    db: AsyncSession,
    *,
    current_user: User,
    control: Control | None,
) -> list[str]:
    if control is None:
        return []

    candidate_risk_ids = [
        link.risk.id
        for link in control.risk_links or []
        if getattr(link, "risk", None) is not None
    ]
    readable_risk_ids = await visible_risk_ids(db, current_user, candidate_risk_ids)
    return linked_risk_names_for_visible_ids(control, readable_risk_ids)


def linked_risk_names_for_visible_ids(control: Control | None, readable_risk_ids: set[int]) -> list[str]:
    if control is None:
        return []

    names: list[str] = []
    for link in control.risk_links or []:
        risk = link.risk
        if risk is None:
            continue
        if risk.id in readable_risk_ids:
            names.append(risk.name)
    return names
