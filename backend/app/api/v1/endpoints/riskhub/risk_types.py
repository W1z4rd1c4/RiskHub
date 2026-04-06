from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import build_change_set, log_activity
from app.db.session import get_db
from app.models import Risk, RiskTypeConfig, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.riskhub import RiskTypeCreate, RiskTypeRead, RiskTypeUpdate

from ._shared import get_cro_user

router = APIRouter()


@router.get("/risk-types", response_model=list[RiskTypeRead])
async def list_risk_types(
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
    include_inactive: bool = Query(False, description="Include soft-deleted types"),
) -> list[RiskTypeRead]:
    """
    List all risk types with dynamically computed risk counts.
    CRO only.
    """

    query = select(RiskTypeConfig).order_by(RiskTypeConfig.sort_order, RiskTypeConfig.display_name)

    if not include_inactive:
        query = query.where(RiskTypeConfig.is_active.is_(True))

    result = await db.execute(query)
    types = result.scalars().all()

    # Compute risk counts dynamically from the risks table
    count_result = await db.execute(
        select(Risk.risk_type, func.count(Risk.id)).where(Risk.status != "archived").group_by(Risk.risk_type)
    )
    risk_counts = {row[0]: row[1] for row in count_result.all()}

    return [
        RiskTypeRead(
            id=t.id,
            code=t.code,
            display_name=t.display_name,
            description=t.description,
            color=t.color,
            icon=t.icon,
            sort_order=t.sort_order,
            is_active=t.is_active,
            is_system=t.is_system,
            risk_count=risk_counts.get(t.code, 0),
            created_at=t.created_at.isoformat(),
            updated_at=t.updated_at.isoformat(),
        )
        for t in types
    ]


@router.post("/risk-types", response_model=RiskTypeRead, status_code=201)
async def create_risk_type(
    data: RiskTypeCreate,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
) -> RiskTypeRead:
    """
    Create a new risk type.
    CRO only.
    """

    # Check for duplicate code
    existing = await db.execute(select(RiskTypeConfig).where(RiskTypeConfig.code == data.code))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Risk type code '{data.code}' already exists")

    risk_type = RiskTypeConfig(
        code=data.code,
        display_name=data.display_name,
        description=data.description,
        color=data.color,
        icon=data.icon,
        sort_order=data.sort_order,
        is_active=True,
        is_system=False,
        risk_count=0,
    )

    db.add(risk_type)
    await db.commit()
    await db.refresh(risk_type)

    await log_activity(
        db=db,
        actor=cro_user,
        action=ActivityAction.CREATE,
        entity_type=ActivityEntityType.CONFIG,
        entity_id=risk_type.id,
        entity_name=risk_type.display_name,
        safe_entity_label=risk_type.display_name,
        description=f"Created risk type: {risk_type.display_name}",
    )
    await db.commit()  # Persist activity log

    return RiskTypeRead(
        id=risk_type.id,
        code=risk_type.code,
        display_name=risk_type.display_name,
        description=risk_type.description,
        color=risk_type.color,
        icon=risk_type.icon,
        sort_order=risk_type.sort_order,
        is_active=risk_type.is_active,
        is_system=risk_type.is_system,
        risk_count=risk_type.risk_count,
        created_at=risk_type.created_at.isoformat(),
        updated_at=risk_type.updated_at.isoformat(),
    )


@router.patch("/risk-types/{id}", response_model=RiskTypeRead)
async def update_risk_type(
    id: int,
    data: RiskTypeUpdate,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
) -> RiskTypeRead:
    """
    Update a risk type.
    CRO only. Cannot change code of system types.
    """

    result = await db.execute(select(RiskTypeConfig).where(RiskTypeConfig.id == id))
    risk_type = result.scalar_one_or_none()

    if not risk_type:
        raise HTTPException(status_code=404, detail="Risk type not found")

    updates: dict[str, object] = {}

    if data.display_name is not None:
        updates["display_name"] = data.display_name
    if data.description is not None:
        updates["description"] = data.description
    if data.color is not None:
        updates["color"] = data.color
    if data.icon is not None:
        updates["icon"] = data.icon
    if data.sort_order is not None:
        updates["sort_order"] = data.sort_order

    changes = build_change_set(risk_type, updates)

    # Apply updates
    if data.display_name is not None:
        risk_type.display_name = data.display_name
    if data.description is not None:
        risk_type.description = data.description
    if data.color is not None:
        risk_type.color = data.color
    if data.icon is not None:
        risk_type.icon = data.icon
    if data.sort_order is not None:
        risk_type.sort_order = data.sort_order

    await db.commit()
    await db.refresh(risk_type)

    await log_activity(
        db=db,
        actor=cro_user,
        action=ActivityAction.UPDATE,
        entity_type=ActivityEntityType.CONFIG,
        entity_id=risk_type.id,
        entity_name=risk_type.display_name,
        safe_entity_label=risk_type.display_name,
        changes=changes,
        description=f"Updated risk type: {risk_type.display_name}",
    )
    await db.commit()  # Persist activity log

    return RiskTypeRead(
        id=risk_type.id,
        code=risk_type.code,
        display_name=risk_type.display_name,
        description=risk_type.description,
        color=risk_type.color,
        icon=risk_type.icon,
        sort_order=risk_type.sort_order,
        is_active=risk_type.is_active,
        is_system=risk_type.is_system,
        risk_count=risk_type.risk_count,
        created_at=risk_type.created_at.isoformat(),
        updated_at=risk_type.updated_at.isoformat(),
    )


@router.delete("/risk-types/{id}")
async def delete_risk_type(
    id: int,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
) -> dict:
    """
    Soft-delete a risk type.
    CRO only. Cannot delete system types.
    If risks use this type, they become orphaned.
    """

    result = await db.execute(select(RiskTypeConfig).where(RiskTypeConfig.id == id))
    risk_type = result.scalar_one_or_none()

    if not risk_type:
        raise HTTPException(status_code=404, detail="Risk type not found")

    if risk_type.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete system risk types")

    if not risk_type.is_active:
        raise HTTPException(status_code=400, detail="Risk type is already deleted")

    # Orphaned-item creation is intentionally deferred until Risk includes a
    # persisted risk_type FK; current behavior remains metadata-only soft delete.

    changes = build_change_set(risk_type, {"is_active": False})
    risk_type.is_active = False
    await db.commit()

    await log_activity(
        db=db,
        actor=cro_user,
        action=ActivityAction.DELETE,
        entity_type=ActivityEntityType.CONFIG,
        entity_id=risk_type.id,
        entity_name=risk_type.display_name,
        safe_entity_label=risk_type.display_name,
        changes=changes,
        description=f"Deleted risk type: {risk_type.display_name} (affecting {risk_type.risk_count} risks)",
    )
    await db.commit()  # Persist activity log

    return {"status": "deleted", "id": id, "affected_risks": risk_type.risk_count}


@router.post("/risk-types/{id}/restore", response_model=RiskTypeRead)
async def restore_risk_type(
    id: int,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
) -> RiskTypeRead:
    """
    Restore a soft-deleted risk type.
    CRO only.
    """

    result = await db.execute(select(RiskTypeConfig).where(RiskTypeConfig.id == id))
    risk_type = result.scalar_one_or_none()

    if not risk_type:
        raise HTTPException(status_code=404, detail="Risk type not found")

    if risk_type.is_active:
        raise HTTPException(status_code=400, detail="Risk type is not deleted")

    changes = build_change_set(risk_type, {"is_active": True})
    risk_type.is_active = True
    await db.commit()
    await db.refresh(risk_type)

    await log_activity(
        db=db,
        actor=cro_user,
        action=ActivityAction.UPDATE,
        entity_type=ActivityEntityType.CONFIG,
        entity_id=risk_type.id,
        entity_name=risk_type.display_name,
        safe_entity_label=risk_type.display_name,
        safe_description="Restored risk type",
        safe_description_siem="Restored risk type",
        changes=changes,
        description=f"Restored risk type: {risk_type.display_name}",
    )
    await db.commit()  # Persist activity log

    return RiskTypeRead(
        id=risk_type.id,
        code=risk_type.code,
        display_name=risk_type.display_name,
        description=risk_type.description,
        color=risk_type.color,
        icon=risk_type.icon,
        sort_order=risk_type.sort_order,
        is_active=risk_type.is_active,
        is_system=risk_type.is_system,
        risk_count=risk_type.risk_count,
        created_at=risk_type.created_at.isoformat(),
        updated_at=risk_type.updated_at.isoformat(),
    )
