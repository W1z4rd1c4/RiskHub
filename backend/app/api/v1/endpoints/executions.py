"""
Control execution endpoints with RBAC and department scoping.
"""

from typing import Any, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import UtcAwareDatetime
from app.core.security import require_business_permission, require_permission
from app.db.session import get_db
from app.models import User
from app.models.control_execution import ControlExecution as ControlExecutionModel
from app.schemas import execution as schemas
from app.schemas.execution import ExecutionResultEnum
from app.services._control_execution import (
    ControlExecutionProjection,
    create_control_execution_projection,
    list_control_execution_projections,
    read_control_execution_projection,
)

router = APIRouter()


def _execution_to_schema(projection: ControlExecutionProjection) -> schemas.ControlExecution:
    exe: ControlExecutionModel = projection.execution
    base = schemas.ControlExecution.model_validate(exe)
    return base.model_copy(
        update={
            "executed_by_name": projection.executed_by_name,
            "control_name": projection.control_name,
            "control_owner_name": projection.control_owner_name,
            "linked_risks": projection.linked_risks,
        }
    )


@router.get("", response_model=schemas.ControlExecutionListResponse)
async def read_executions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_business_permission("controls", "read")),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    control_id: Optional[int] = Query(None),
    result: Optional[ExecutionResultEnum] = Query(None),
    from_date: UtcAwareDatetime | None = Query(None),
    to_date: UtcAwareDatetime | None = Query(None),
) -> Any:
    """
    Retrieve control executions. Scoped to user's accessible departments.
    """
    outcome = await list_control_execution_projections(
        db,
        current_user=current_user,
        skip=skip,
        limit=limit,
        control_id=control_id,
        result=result,
        from_date=from_date,
        to_date=to_date,
    )

    return schemas.ControlExecutionListResponse(
        items=[_execution_to_schema(projection) for projection in outcome.projections],
        total=outcome.total,
        skip=skip,
        limit=limit,
        capabilities=schemas.ControlExecutionListCapabilities(can_export_csv=outcome.can_export_csv),
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
    projection = await create_control_execution_projection(
        db,
        current_user=current_user,
        control_id=execution_in.control_id,
        payload=execution_in,
    )
    return _execution_to_schema(projection)


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
    projection = await read_control_execution_projection(db, current_user=current_user, execution_id=id)
    return _execution_to_schema(projection)
