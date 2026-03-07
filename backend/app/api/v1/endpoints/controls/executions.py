from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.datetime_utils import utc_now
from app.core.permissions import check_department_access
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Control, ControlExecution, User
from app.schemas.control import (
    ControlFrequencyEnum,
    normalize_control_frequency,
)
from app.schemas.execution import (
    ControlExecutionCreate,
    ControlExecutionRead,
)

router = APIRouter()


# ============== Control Execution Endpoints ==============

def calculate_next_scheduled(frequency: str, executed_at: datetime) -> datetime:
    """Calculate next scheduled execution based on frequency."""
    try:
        normalized_frequency = normalize_control_frequency(frequency).value
    except ValueError:
        normalized_frequency = ControlFrequencyEnum.monthly.value

    frequency_deltas = {
        "daily": timedelta(days=1),
        "weekly": timedelta(weeks=1),
        "monthly": timedelta(days=30),
        "quarterly": timedelta(days=90),
        "semi-annually": timedelta(days=182),
        "annually": timedelta(days=365),
        "ad_hoc": timedelta(days=30),  # Default to monthly for ad-hoc
    }
    return executed_at + frequency_deltas.get(normalized_frequency, timedelta(days=30))


@router.post("/{control_id}/executions", response_model=ControlExecutionRead, status_code=status.HTTP_201_CREATED)
async def log_execution(
    control_id: int,
    execution_data: ControlExecutionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("controls", "execute")),
):
    """Log a control execution. Requires controls:execute and (department access OR control ownership)."""
    from app.core.permissions import is_control_owner

    # Verify control exists
    result = await db.execute(
        select(Control).where(Control.id == control_id)
    )
    control = result.scalar_one_or_none()

    if not control:
        raise HTTPException(status_code=404, detail="Control not found")

    # Verify access: department OR control owner
    is_owner = await is_control_owner(db, current_user.id, control_id)
    if not is_owner:
        check_department_access(control.department_id, current_user)

    executed_at = utc_now()
    next_scheduled = execution_data.next_scheduled or calculate_next_scheduled(control.frequency, executed_at)

    execution = ControlExecution(
        control_id=control_id,
        executed_by_id=current_user.id,
        executed_at=executed_at,
        result=execution_data.result.value,
        findings=execution_data.findings,
        evidence_reference=execution_data.evidence_reference,
        notes=execution_data.notes,
        next_scheduled=next_scheduled,
    )

    db.add(execution)
    await db.commit()
    await db.refresh(execution)

    # Reload with relationships
    result = await db.execute(
        select(ControlExecution)
        .options(selectinload(ControlExecution.executed_by))
        .where(ControlExecution.id == execution.id)
    )
    return result.scalar_one()


@router.get("/{control_id}/executions", response_model=list[ControlExecutionRead])
async def list_executions(
    control_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("controls", "read")),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    """List execution history for a control."""
    from app.core.permissions import is_control_owner

    # Verify control exists
    result = await db.execute(
        select(Control).where(Control.id == control_id)
    )
    control = result.scalar_one_or_none()
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")

    # Verify access: department OR control owner
    is_owner = await is_control_owner(db, current_user.id, control_id)
    if not is_owner:
        try:
            check_department_access(control.department_id, current_user)
        except HTTPException:
            raise HTTPException(status_code=404, detail="Control not found")

    result = await db.execute(
        select(ControlExecution)
        .options(selectinload(ControlExecution.executed_by))
        .where(ControlExecution.control_id == control_id)
        .order_by(ControlExecution.executed_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()
