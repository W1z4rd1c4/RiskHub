"""
Control execution endpoints with RBAC and department scoping.
"""

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.datetime_utils import coerce_utc
from app.core.permissions import check_department_access, get_control_ids_where_owner, get_user_department_ids
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
    dept_ids: Optional[list[int]],
    owned_control_ids: list[int],
    control_id: Optional[int],
    result: Optional[ExecutionResultEnum],
    from_date: Optional[datetime],
    to_date: Optional[datetime],
):
    from_date = coerce_utc(from_date)
    to_date = coerce_utc(to_date)
    if dept_ids is not None:
        if not dept_ids and not owned_control_ids:
            return None

        query = query.join(ControlModel)
        if dept_ids and owned_control_ids:
            query = query.where(or_(ControlModel.department_id.in_(dept_ids), ControlModel.id.in_(owned_control_ids)))
        elif dept_ids:
            query = query.where(ControlModel.department_id.in_(dept_ids))
        else:
            query = query.where(ControlModel.id.in_(owned_control_ids))

    if control_id:
        query = query.where(ControlExecutionModel.control_id == control_id)
    if result:
        query = query.where(ControlExecutionModel.result == result)
    if from_date:
        query = query.where(ControlExecutionModel.executed_at >= from_date)
    if to_date:
        query = query.where(ControlExecutionModel.executed_at <= to_date)

    return query


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
    dept_ids = get_user_department_ids(current_user)
    owned_control_ids = await get_control_ids_where_owner(db, current_user.id) if dept_ids is not None else []

    count_query = _apply_execution_scope_and_filters(
        select(func.count(func.distinct(ControlExecutionModel.id))),
        dept_ids=dept_ids,
        owned_control_ids=owned_control_ids,
        control_id=control_id,
        result=result,
        from_date=from_date,
        to_date=to_date,
    )
    if count_query is None:
        return schemas.ControlExecutionListResponse(items=[], total=0, skip=skip, limit=limit)

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
        dept_ids=dept_ids,
        owned_control_ids=owned_control_ids,
        control_id=control_id,
        result=result,
        from_date=from_date,
        to_date=to_date,
    )
    assert list_query is not None
    list_query = list_query.order_by(desc(ControlExecutionModel.executed_at)).offset(skip).limit(limit)

    result_set = await db.execute(list_query)
    executions = result_set.scalars().all()

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
                linked_risks=await visible_linked_risk_names(db, current_user=current_user, control=exe.control),
            )
        )

    return schemas.ControlExecutionListResponse(items=items, total=total, skip=skip, limit=limit)


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

    # Check access: department OR control owner
    if db_obj.control:
        try:
            check_department_access(db_obj.control.department_id, current_user)
        except HTTPException:
            owned_control_ids = await get_control_ids_where_owner(db, current_user.id)
            if db_obj.control.id not in owned_control_ids:
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
