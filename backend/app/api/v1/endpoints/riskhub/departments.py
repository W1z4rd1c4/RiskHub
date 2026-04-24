from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.activity_logger import log_activity
from app.db.session import get_db
from app.models import User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.riskhub import DepartmentHubCreate, DepartmentHubRead, DepartmentHubUpdate
from app.services._riskhub_config import (
    department_to_read,
    get_department_dependency_counts,
    load_department_for_update,
    validate_department_manager,
)

from ._shared import get_cro_user

router = APIRouter()


@router.get("/departments", response_model=list[DepartmentHubRead])
async def list_departments_hub(
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
    include_inactive: bool = Query(False, description="Include soft-deleted departments"),
) -> list[DepartmentHubRead]:
    """List all departments with stats. CRO only."""
    from app.models.department import Department

    query = select(Department).options(selectinload(Department.manager)).order_by(Department.name)

    if not include_inactive:
        query = query.where(Department.is_active.is_(True))

    result = await db.execute(query)
    departments = result.scalars().all()

    return [department_to_read(dept, await get_department_dependency_counts(db, dept.id)) for dept in departments]


@router.post("/departments", response_model=DepartmentHubRead, status_code=201)
async def create_department(
    data: DepartmentHubCreate,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
) -> DepartmentHubRead:
    """Create a new department. CRO only."""
    from app.models.department import Department

    await validate_department_manager(db, data.manager_id)

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

    return department_to_read(dept, await get_department_dependency_counts(db, dept.id))


@router.patch("/departments/{id}", response_model=DepartmentHubRead)
async def update_department(
    id: int,
    data: DepartmentHubUpdate,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
) -> DepartmentHubRead:
    """Update a department. CRO only."""
    from app.models.department import Department

    dept = await load_department_for_update(db, id)

    if data.name is not None:
        # Check for duplicate name (excluding current)
        existing = await db.execute(select(Department).where(Department.name == data.name, Department.id != dept.id))
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
    if "manager_id" in data.model_fields_set:
        await validate_department_manager(db, data.manager_id)
        dept.manager_id = data.manager_id

    await db.commit()

    # Reload
    result = await db.execute(
        select(Department)
        .options(selectinload(Department.manager), selectinload(Department.users))
        .where(Department.id == dept.id)
    )
    dept = result.scalar_one()

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

    return department_to_read(dept, await get_department_dependency_counts(db, dept.id))


@router.delete("/departments/{id}")
async def delete_department(
    id: int,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
) -> dict:
    """Soft-delete a department. CRO only. Cannot delete departments with users/risks/controls."""
    dept = await load_department_for_update(db, id)

    # System departments cannot be deleted
    if hasattr(dept, "is_system") and dept.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete system departments")

    if not dept.is_active:
        raise HTTPException(status_code=400, detail="Department is already deleted")

    counts = await get_department_dependency_counts(db, dept.id)
    if counts.users:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete department with {counts.users} active users",
        )
    if counts.risks:
        raise HTTPException(status_code=400, detail=f"Cannot delete department with {counts.risks} risks")
    if counts.controls:
        raise HTTPException(status_code=400, detail=f"Cannot delete department with {counts.controls} controls")
    if counts.kris:
        raise HTTPException(status_code=400, detail=f"Cannot delete department with {counts.kris} KRIs")
    if counts.vendors:
        raise HTTPException(status_code=400, detail=f"Cannot delete department with {counts.vendors} vendors")
    if counts.pending_orphans:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete department with {counts.pending_orphans} pending orphans",
        )

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
    dept = await load_department_for_update(db, id)

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

    return department_to_read(dept, await get_department_dependency_counts(db, dept.id))
