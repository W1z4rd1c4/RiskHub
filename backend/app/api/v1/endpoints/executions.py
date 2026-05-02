"""
Control execution endpoints with RBAC and department scoping.
"""

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.datetime_utils import coerce_utc
from app.core.permissions import can_read_control_id, control_visibility_clause, has_permission, visible_risk_ids
from app.core.security import require_business_permission, require_permission
from app.db.session import get_db
from app.models import User
from app.models.control import Control as ControlModel
from app.models.control_execution import ControlExecution as ControlExecutionModel
from app.models.risk import ControlRiskLink
from app.schemas import execution as schemas
from app.schemas.execution import ExecutionResultEnum
from app.services._control_execution import (
    create_execution_record,
    linked_risk_names_for_visible_ids,
    load_execution_with_context,
    visible_linked_risk_names,
)

router = APIRouter()


def _execution_to_schema(
    exe: ControlExecutionModel,
    *,
    executed_by_name: str,
    control_name: str,
    control_owner_name: str,
    linked_risks: list[str],
) -> schemas.ControlExecution:
    base = schemas.ControlExecution.model_validate(exe)
    return base.model_copy(
        update={
            "executed_by_name": executed_by_name,
            "control_name": control_name,
            "control_owner_name": control_owner_name,
            "linked_risks": linked_risks,
        }
    )


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
        query = query.join(ControlModel)
        query = query.where(visibility_clause)

    if control_id:
        query = query.where(ControlExecutionModel.control_id == control_id)
    if result:
        query = query.where(ControlExecutionModel.result == result)
    if from_date:
        query = query.where(ControlExecutionModel.executed_at >= from_date)
    if to_date:
        query = query.where(ControlExecutionModel.executed_at <= to_date)

    return query


def _linked_risk_candidate_ids(executions: list[ControlExecutionModel]) -> set[int]:
    return {
        link.risk_id
        for exe in executions
        if exe.control is not None
        for link in exe.control.risk_links or []
        if link.risk_id is not None
    }


@router.get("", response_model=schemas.ControlExecutionListResponse)
async def read_executions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_business_permission("controls", "read")),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    control_id: Optional[int] = Query(None),
    result: Optional[ExecutionResultEnum] = Query(None),
    from_date: Optional[datetime] = Query(None),
    to_date: Optional[datetime] = Query(None),
) -> Any:
    """
    Retrieve control executions. Scoped to user's accessible departments.
    """
    visibility_clause = control_visibility_clause(current_user)

    count_query = _apply_execution_scope_and_filters(
        select(func.count(func.distinct(ControlExecutionModel.id))),
        visibility_clause=visibility_clause,
        control_id=control_id,
        result=result,
        from_date=from_date,
        to_date=to_date,
    )
    total = int(await db.scalar(count_query) or 0)

    list_query = _apply_execution_scope_and_filters(
        select(ControlExecutionModel).options(
            selectinload(ControlExecutionModel.executed_by),
            selectinload(ControlExecutionModel.control).options(
                selectinload(ControlModel.control_owner),
                selectinload(ControlModel.department),
                selectinload(ControlModel.risk_links).selectinload(ControlRiskLink.risk),
            ),
        ),
        visibility_clause=visibility_clause,
        control_id=control_id,
        result=result,
        from_date=from_date,
        to_date=to_date,
    )
    list_query = (
        list_query.order_by(desc(ControlExecutionModel.executed_at), desc(ControlExecutionModel.id))
        .offset(skip)
        .limit(limit)
    )

    result_set = await db.execute(list_query)
    executions = result_set.scalars().all()
    readable_linked_risk_ids = await visible_risk_ids(db, current_user, _linked_risk_candidate_ids(executions))

    items: list[schemas.ControlExecution] = []
    for exe in executions:
        executed_by_name = exe.executed_by.name if exe.executed_by else "Unknown"
        control_name = exe.control.name if exe.control else "Unknown"

        if exe.control:
            control_owner_name = exe.control.control_owner.name if exe.control.control_owner else "Unassigned"
        else:
            control_owner_name = "Unknown"

        items.append(
            _execution_to_schema(
                exe,
                executed_by_name=executed_by_name,
                control_name=control_name,
                control_owner_name=control_owner_name,
                linked_risks=linked_risk_names_for_visible_ids(exe.control, readable_linked_risk_ids),
            )
        )

    return schemas.ControlExecutionListResponse(
        items=items,
        total=total,
        skip=skip,
        limit=limit,
        capabilities=schemas.ControlExecutionListCapabilities(
            can_export_csv=has_permission(current_user, "reports", "read")
        ),
    )


@router.post("", response_model=schemas.ControlExecution, status_code=status.HTTP_201_CREATED)
async def create_execution(
    *,
    db: AsyncSession = Depends(get_db),
    execution_in: schemas.ControlExecutionCreateRequest,
    current_user: User = Depends(require_permission("controls", "execute")),
) -> Any:
    """
    Log a new control execution. Requires controls:execute permission and department access.
    """
    db_obj = await create_execution_record(
        db,
        current_user=current_user,
        control_id=execution_in.control_id,
        payload=execution_in,
    )
    executed_by_name = db_obj.executed_by.name if db_obj.executed_by else "Unknown"
    control_name = db_obj.control.name if db_obj.control else "Unknown"

    if db_obj.control:
        control_owner_name = db_obj.control.control_owner.name if db_obj.control.control_owner else "Unassigned"
    else:
        control_owner_name = "Unknown"

    return _execution_to_schema(
        db_obj,
        executed_by_name=executed_by_name,
        control_name=control_name,
        control_owner_name=control_owner_name,
        linked_risks=await visible_linked_risk_names(db, current_user=current_user, control=db_obj.control),
    )


@router.get("/{id}", response_model=schemas.ControlExecution)
async def read_execution(
    *,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_business_permission("controls", "read")),
    id: int,
) -> Any:
    """
    Get control execution by ID. Validates department access.
    """
    db_obj = await load_execution_with_context(db, id)

    if db_obj.control and not await can_read_control_id(db, current_user, db_obj.control.id):
        raise HTTPException(status_code=404, detail="Execution not found")

    executed_by_name = db_obj.executed_by.name if db_obj.executed_by else "Unknown"
    control_name = db_obj.control.name if db_obj.control else "Unknown"

    if db_obj.control:
        control_owner_name = db_obj.control.control_owner.name if db_obj.control.control_owner else "Unassigned"
    else:
        control_owner_name = "Unknown"

    return _execution_to_schema(
        db_obj,
        executed_by_name=executed_by_name,
        control_name=control_name,
        control_owner_name=control_owner_name,
        linked_risks=await visible_linked_risk_names(db, current_user=current_user, control=db_obj.control),
    )
