"""
Control execution endpoints with RBAC and department scoping.
"""
from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.core.permissions import (
    can_access_department_id,
    check_department_access,
    get_control_ids_where_owner,
    get_risk_ids_where_control_owner,
    get_risk_ids_where_kri_reporting_owner,
    get_user_department_ids,
    is_control_owner,
)
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import User
from app.models.control import Control as ControlModel
from app.models.control_execution import ControlExecution as ControlExecutionModel
from app.models.risk import ControlRiskLink
from app.schemas import execution as schemas

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


@router.get("", response_model=List[schemas.ControlExecution])
async def read_executions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("controls", "read")),
    skip: int = 0,
    limit: int = 100,
    control_id: Optional[int] = None,
    result: Optional[str] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
) -> Any:
    """
    Retrieve control executions. Scoped to user's accessible departments.
    """
    # Get user's department scope
    dept_ids = get_user_department_ids(current_user)
    
    query = select(ControlExecutionModel).options(
        selectinload(ControlExecutionModel.executed_by),
        selectinload(ControlExecutionModel.control).options(
            selectinload(ControlModel.control_owner),
            selectinload(ControlModel.department),
            selectinload(ControlModel.risk_links).selectinload(ControlRiskLink.risk)
        )
    )
    
    # Apply department scoping via join to Control, with control owner exception
    if dept_ids is not None:
        if not dept_ids:
            # User has no departments - check if they own any controls
            owned_control_ids = await get_control_ids_where_owner(db, current_user.id)
            if owned_control_ids:
                query = query.join(ControlModel).where(ControlModel.id.in_(owned_control_ids))
            else:
                return []  # User has no departments and owns no controls
        else:
            # User has department access - also include controls they own
            owned_control_ids = await get_control_ids_where_owner(db, current_user.id)
            if owned_control_ids:
                query = query.join(ControlModel).where(
                    or_(
                        ControlModel.department_id.in_(dept_ids),
                        ControlModel.id.in_(owned_control_ids)
                    )
                )
            else:
                query = query.join(ControlModel).where(ControlModel.department_id.in_(dept_ids))
    
    if control_id:
        query = query.where(ControlExecutionModel.control_id == control_id)
    if result:
        query = query.where(ControlExecutionModel.result == result)
    if from_date:
        query = query.where(ControlExecutionModel.executed_at >= from_date)
    if to_date:
        query = query.where(ControlExecutionModel.executed_at <= to_date)
        
    query = query.order_by(desc(ControlExecutionModel.executed_at)).offset(skip).limit(limit)
    
    result_set = await db.execute(query)
    executions = result_set.scalars().all()

    # Map relation data for the simplified schema
    can_read_risks = check_permission(current_user, "risks", "read")
    cross_dept_risk_ids: set[int] = set()
    if can_read_risks:
        reporting_owner_risk_ids = await get_risk_ids_where_kri_reporting_owner(db, current_user.id)
        control_owner_risk_ids = await get_risk_ids_where_control_owner(db, current_user.id)
        cross_dept_risk_ids = set(reporting_owner_risk_ids) | set(control_owner_risk_ids)

    items: list[schemas.ControlExecution] = []
    for exe in executions:
        executed_by_name = exe.executed_by.name if exe.executed_by else "Unknown"
        control_name = exe.control.name if exe.control else "Unknown"

        linked_risks: list[str] = []
        if exe.control:
            control_owner_name = exe.control.control_owner.name if exe.control.control_owner else "Unassigned"
            if can_read_risks and exe.control.risk_links:
                for link in exe.control.risk_links:
                    if not link.risk:
                        continue
                    if can_access_department_id(current_user, link.risk.department_id) or (link.risk.id in cross_dept_risk_ids):
                        linked_risks.append(link.risk.process)
        else:
            control_owner_name = "Unknown"

        items.append(
            _execution_to_schema(
                exe,
                executed_by_name=executed_by_name,
                control_name=control_name,
                control_owner_name=control_owner_name,
                linked_risks=linked_risks,
            )
        )

    return items


@router.post("", response_model=schemas.ControlExecution, status_code=status.HTTP_201_CREATED)
async def create_execution(
    *,
    db: AsyncSession = Depends(get_db),
    execution_in: schemas.ControlExecutionCreate,
    current_user: User = Depends(require_permission("controls", "execute")),
) -> Any:
    """
    Log a new control execution. Requires controls:execute permission and department access.
    """
    # Verify control exists and load department
    control_result = await db.execute(
        select(ControlModel)
        .options(selectinload(ControlModel.department))
        .where(ControlModel.id == execution_in.control_id)
    )
    control = control_result.scalar_one_or_none()
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")
    
    # Check access: department OR control owner
    is_owner = await is_control_owner(db, current_user.id, control.id)
    if not is_owner:
        check_department_access(control.department_id, current_user)
        
    db_obj = ControlExecutionModel(
        control_id=execution_in.control_id,
        executed_by_id=current_user.id,
        result=execution_in.result,
        findings=execution_in.findings,
        evidence_reference=execution_in.evidence_reference,
        notes=execution_in.notes,
        next_scheduled=execution_in.next_scheduled
    )
    
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)
    
    # Reload with relations for the response
    query = select(ControlExecutionModel).options(
        selectinload(ControlExecutionModel.executed_by),
        selectinload(ControlExecutionModel.control).options(
            selectinload(ControlModel.control_owner),
            selectinload(ControlModel.risk_links).selectinload(ControlRiskLink.risk)
        )
    ).where(ControlExecutionModel.id == db_obj.id)
    
    res = await db.execute(query)
    db_obj = res.scalar_one()
    executed_by_name = db_obj.executed_by.name if db_obj.executed_by else "Unknown"
    control_name = db_obj.control.name if db_obj.control else "Unknown"

    linked_risks: list[str] = []
    if db_obj.control:
        control_owner_name = db_obj.control.control_owner.name if db_obj.control.control_owner else "Unassigned"
        if db_obj.control.risk_links:
            linked_risks = [link.risk.process for link in db_obj.control.risk_links if link.risk]
    else:
        control_owner_name = "Unknown"

    return _execution_to_schema(
        db_obj,
        executed_by_name=executed_by_name,
        control_name=control_name,
        control_owner_name=control_owner_name,
        linked_risks=linked_risks,
    )


@router.get("/{id}", response_model=schemas.ControlExecution)
async def read_execution(
    *,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    id: int,
) -> Any:
    """
    Get control execution by ID. Validates department access.
    """
    query = select(ControlExecutionModel).options(
        selectinload(ControlExecutionModel.executed_by),
        selectinload(ControlExecutionModel.control).options(
            selectinload(ControlModel.control_owner),
            selectinload(ControlModel.department),
            selectinload(ControlModel.risk_links).selectinload(ControlRiskLink.risk)
        )
    ).where(ControlExecutionModel.id == id)
    
    result = await db.execute(query)
    db_obj = result.scalar_one_or_none()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Execution not found")
    
    # Check access: department OR control owner
    if db_obj.control:
        is_owner = await is_control_owner(db, current_user.id, db_obj.control.id)
        if not is_owner:
            check_department_access(db_obj.control.department_id, current_user)
        
    executed_by_name = db_obj.executed_by.name if db_obj.executed_by else "Unknown"
    control_name = db_obj.control.name if db_obj.control else "Unknown"

    linked_risks: list[str] = []
    if db_obj.control:
        control_owner_name = db_obj.control.control_owner.name if db_obj.control.control_owner else "Unassigned"
        if db_obj.control.risk_links:
            linked_risks = [link.risk.process for link in db_obj.control.risk_links if link.risk]
    else:
        control_owner_name = "Unknown"

    return _execution_to_schema(
        db_obj,
        executed_by_name=executed_by_name,
        control_name=control_name,
        control_owner_name=control_owner_name,
        linked_risks=linked_risks,
    )
