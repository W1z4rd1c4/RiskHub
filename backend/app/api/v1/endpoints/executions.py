from typing import Any, List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.control_execution import ControlExecution as ControlExecutionModel
from app.models.control import Control as ControlModel
from app.models.user import User as UserModel
from app.schemas import execution as schemas
from app.api import deps
from app.models import User

router = APIRouter()


@router.get("", response_model=List[schemas.ControlExecution])
async def read_executions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    skip: int = 0,
    limit: int = 100,
    control_id: Optional[int] = None,
    result: Optional[str] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
) -> Any:
    """
    Retrieve control executions.
    """
    query = select(ControlExecutionModel).options(
        selectinload(ControlExecutionModel.executed_by),
        selectinload(ControlExecutionModel.control)
    )
    
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
    for exe in executions:
        exe.executed_by_name = exe.executed_by.name if exe.executed_by else "Unknown"
        exe.control_name = exe.control.name if exe.control else "Unknown"
        
    return executions


@router.post("", response_model=schemas.ControlExecution, status_code=status.HTTP_201_CREATED)
async def create_execution(
    *,
    db: AsyncSession = Depends(get_db),
    execution_in: schemas.ControlExecutionCreate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Log a new control execution.
    """
    # Verify control exists
    control_result = await db.execute(select(ControlModel).where(ControlModel.id == execution_in.control_id))
    control = control_result.scalar_one_or_none()
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")
        
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
        selectinload(ControlExecutionModel.control)
    ).where(ControlExecutionModel.id == db_obj.id)
    
    res = await db.execute(query)
    db_obj = res.scalar_one()
    db_obj.executed_by_name = db_obj.executed_by.name if db_obj.executed_by else "Unknown"
    db_obj.control_name = db_obj.control.name if db_obj.control else "Unknown"
    
    return db_obj


@router.get("/{id}", response_model=schemas.ControlExecution)
async def read_execution(
    *,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    id: int,
) -> Any:
    """
    Get control execution by ID.
    """
    query = select(ControlExecutionModel).options(
        selectinload(ControlExecutionModel.executed_by),
        selectinload(ControlExecutionModel.control)
    ).where(ControlExecutionModel.id == id)
    
    result = await db.execute(query)
    db_obj = result.scalar_one_or_none()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Execution not found")
        
    db_obj.executed_by_name = db_obj.executed_by.name if db_obj.executed_by else "Unknown"
    db_obj.control_name = db_obj.control.name if db_obj.control else "Unknown"
    
    return db_obj
