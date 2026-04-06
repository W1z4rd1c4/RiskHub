from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.activity_logger import log_activity
from app.db.session import get_db
from app.models import User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.riskhub import DepartmentHubCreate, DepartmentHubRead, DepartmentHubUpdate

from ._shared import get_cro_user

router = APIRouter()


@router.get("/departments", response_model=list[DepartmentHubRead])
async def list_departments_hub(
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
    include_inactive: bool = Query(False, description="Include soft-deleted departments"),
) -> list[DepartmentHubRead]:
    """List all departments with stats. CRO only."""
    from app.models import Control, Risk, User
    from app.models.department import Department

    query = select(Department).options(selectinload(Department.manager)).order_by(Department.name)

    if not include_inactive:
        query = query.where(Department.is_active.is_(True))

    result = await db.execute(query)
    departments = result.scalars().all()

    dept_ids = [d.id for d in departments]
    if not dept_ids:
        return []

    risk_counts = {
        row[0]: row[1]
        for row in (
            await db.execute(
                select(Risk.department_id, func.count(Risk.id))
                .where(Risk.department_id.in_(dept_ids))
                .group_by(Risk.department_id)
            )
        ).all()
    }
    control_counts = {
        row[0]: row[1]
        for row in (
            await db.execute(
                select(Control.department_id, func.count(Control.id))
                .where(Control.department_id.in_(dept_ids))
                .group_by(Control.department_id)
            )
        ).all()
    }
    user_counts = {
        row[0]: row[1]
        for row in (
            await db.execute(
                select(User.department_id, func.count(User.id))
                .where(User.department_id.in_(dept_ids))
                .where(User.is_active.is_(True))
                .group_by(User.department_id)
            )
        ).all()
    }

    return [
        DepartmentHubRead(
            id=dept.id,
            name=dept.name,
            code=dept.code if hasattr(dept, "code") else None,
            manager_id=dept.manager_id,
            manager_name=dept.manager.name if dept.manager else None,
            is_active=dept.is_active,
            user_count=user_counts.get(dept.id, 0),
            risk_count=risk_counts.get(dept.id, 0),
            control_count=control_counts.get(dept.id, 0),
        )
        for dept in departments
    ]


@router.post("/departments", response_model=DepartmentHubRead, status_code=201)
async def create_department(
    data: DepartmentHubCreate,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
) -> DepartmentHubRead:
    """Create a new department. CRO only."""
    from app.models.department import Department

    # Check for duplicate name
    existing = await db.execute(select(Department).where(Department.name == data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Department name '{data.name}' already exists")

    # Check for duplicate code
    effective_code = data.code if data.code else data.name.lower().replace(" ", "_")[:20]
    existing_code = await db.execute(select(Department).where(Department.code == effective_code))
    if existing_code.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Department code '{effective_code}' already exists")

    dept = Department(
        name=data.name,
        code=data.code if data.code else data.name.lower().replace(" ", "_")[:20],
        manager_id=data.manager_id,
        is_active=True,
    )
    db.add(dept)
    await db.commit()
    await db.refresh(dept)

    # Reload with manager
    result = await db.execute(
        select(Department).options(selectinload(Department.manager)).where(Department.id == dept.id)
    )
    dept = result.scalar_one()

    await log_activity(
        db=db,
        actor=cro_user,
        action=ActivityAction.CREATE,
        entity_type=ActivityEntityType.DEPARTMENT,
        entity_id=dept.id,
        entity_name=dept.name,
        safe_entity_label=dept.code or dept.name,
        description=f"Created department: {dept.name}",
    )
    await db.commit()

    return DepartmentHubRead(
        id=dept.id,
        name=dept.name,
        code=dept.code if hasattr(dept, "code") else None,
        manager_id=dept.manager_id,
        manager_name=dept.manager.name if dept.manager else None,
        is_active=dept.is_active,
        user_count=0,
        risk_count=0,
        control_count=0,
    )


@router.patch("/departments/{id}", response_model=DepartmentHubRead)
async def update_department(
    id: int,
    data: DepartmentHubUpdate,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
) -> DepartmentHubRead:
    """Update a department. CRO only."""
    from app.models import Control, Risk
    from app.models.department import Department

    result = await db.execute(
        select(Department)
        .options(selectinload(Department.manager), selectinload(Department.users))
        .where(Department.id == id)
    )
    dept = result.scalar_one_or_none()

    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    if data.name is not None:
        # Check for duplicate name (excluding current)
        existing = await db.execute(
            select(Department).where(Department.name == data.name, Department.id != dept.id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"Department name '{data.name}' already exists")
        dept.name = data.name
    if data.code is not None:
        # Check for duplicate code (excluding current)
        existing_code = await db.execute(
            select(Department).where(Department.code == data.code, Department.id != dept.id)
        )
        if existing_code.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"Department code '{data.code}' already exists")
        dept.code = data.code
    if data.manager_id is not None:
        dept.manager_id = data.manager_id

    await db.commit()

    # Reload
    result = await db.execute(
        select(Department)
        .options(selectinload(Department.manager), selectinload(Department.users))
        .where(Department.id == dept.id)
    )
    dept = result.scalar_one()

    # Get counts
    risk_count_result = await db.execute(select(func.count(Risk.id)).where(Risk.department_id == dept.id))
    risk_count = risk_count_result.scalar() or 0

    control_count_result = await db.execute(
        select(func.count(Control.id)).where(Control.department_id == dept.id)
    )
    control_count = control_count_result.scalar() or 0

    await log_activity(
        db=db,
        actor=cro_user,
        action=ActivityAction.UPDATE,
        entity_type=ActivityEntityType.DEPARTMENT,
        entity_id=dept.id,
        entity_name=dept.name,
        safe_entity_label=dept.code or dept.name,
        description=f"Updated department: {dept.name}",
    )
    await db.commit()

    return DepartmentHubRead(
        id=dept.id,
        name=dept.name,
        code=dept.code if hasattr(dept, "code") else None,
        manager_id=dept.manager_id,
        manager_name=dept.manager.name if dept.manager else None,
        is_active=dept.is_active,
        user_count=len([u for u in dept.users if u.is_active]),
        risk_count=risk_count,
        control_count=control_count,
    )


@router.delete("/departments/{id}")
async def delete_department(
    id: int,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
) -> dict:
    """Soft-delete a department. CRO only. Cannot delete departments with users/risks/controls."""
    from app.models import Control, Risk
    from app.models.department import Department

    result = await db.execute(select(Department).options(selectinload(Department.users)).where(Department.id == id))
    dept = result.scalar_one_or_none()

    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    # System departments cannot be deleted
    if hasattr(dept, "is_system") and dept.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete system departments")

    if not dept.is_active:
        raise HTTPException(status_code=400, detail="Department is already deleted")

    active_users = [u for u in dept.users if u.is_active]
    if active_users:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete department with {len(active_users)} active users",
        )

    # Check for risks
    risk_count_result = await db.execute(select(func.count(Risk.id)).where(Risk.department_id == dept.id))
    risk_count = risk_count_result.scalar() or 0
    if risk_count > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete department with {risk_count} risks")

    # Check for controls
    control_count_result = await db.execute(
        select(func.count(Control.id)).where(Control.department_id == dept.id)
    )
    control_count = control_count_result.scalar() or 0
    if control_count > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete department with {control_count} controls")

    dept.is_active = False
    await db.commit()

    await log_activity(
        db=db,
        actor=cro_user,
        action=ActivityAction.DELETE,
        entity_type=ActivityEntityType.DEPARTMENT,
        entity_id=dept.id,
        entity_name=dept.name,
        safe_entity_label=dept.code or dept.name,
        description=f"Deleted department: {dept.name}",
    )
    await db.commit()

    return {"status": "deleted", "id": id}


@router.post("/departments/{id}/restore", response_model=DepartmentHubRead)
async def restore_department(
    id: int,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
) -> DepartmentHubRead:
    """Restore a soft-deleted department. CRO only."""
    from app.models.department import Department

    result = await db.execute(
        select(Department).options(selectinload(Department.manager)).where(Department.id == id)
    )
    dept = result.scalar_one_or_none()

    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    if dept.is_active:
        raise HTTPException(status_code=400, detail="Department is not deleted")

    dept.is_active = True
    await db.commit()
    await db.refresh(dept)

    await log_activity(
        db=db,
        actor=cro_user,
        action=ActivityAction.UPDATE,
        entity_type=ActivityEntityType.DEPARTMENT,
        entity_id=dept.id,
        entity_name=dept.name,
        safe_entity_label=dept.code or dept.name,
        safe_description="Restored department",
        safe_description_siem="Restored department",
        description=f"Restored department: {dept.name}",
    )
    await db.commit()

    return DepartmentHubRead(
        id=dept.id,
        name=dept.name,
        code=dept.code if hasattr(dept, "code") else None,
        manager_id=dept.manager_id,
        manager_name=dept.manager.name if dept.manager else None,
        is_active=dept.is_active,
        user_count=0,
        risk_count=0,
        control_count=0,
    )
