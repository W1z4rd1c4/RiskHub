from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import require_permission
from app.db.session import get_db
from app.models import ControlExecution, User
from app.schemas.execution import (
    ControlExecutionCreate,
    ControlExecutionRead,
)
from app.services._control_execution import create_execution_record, load_control_for_execution

router = APIRouter()


@router.post("/{control_id}/executions", response_model=ControlExecutionRead, status_code=status.HTTP_201_CREATED)
async def log_execution(
    control_id: int,
    execution_data: ControlExecutionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("controls", "execute")),
):
    """Log a control execution. Requires controls:execute and (department access OR control ownership)."""
    return await create_execution_record(
        db,
        current_user=current_user,
        control_id=control_id,
        payload=execution_data,
    )


@router.get("/{control_id}/executions", response_model=list[ControlExecutionRead])
async def list_executions(
    control_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("controls", "read")),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    """List execution history for a control."""
    try:
        await load_control_for_execution(db, control_id=control_id, current_user=current_user)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_403_FORBIDDEN:
            raise HTTPException(status_code=404, detail="Control not found")
        raise

    result = await db.execute(
        select(ControlExecution)
        .options(selectinload(ControlExecution.executed_by))
        .where(ControlExecution.control_id == control_id)
        .order_by(ControlExecution.executed_at.desc(), ControlExecution.id.desc())
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()
