from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.activity_logger import log_activity
from app.db.session import get_db
from app.models import ApprovalScenario, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.riskhub import ApprovalScenarioRead, ApprovalScenarioUpdate

from ._shared import get_cro_user

router = APIRouter()


@router.get("/approval-scenarios", response_model=list[ApprovalScenarioRead])
async def list_approval_scenarios(
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
) -> list[ApprovalScenarioRead]:
    """
    List all approval scenarios.
    CRO only.
    """

    result = await db.execute(
        select(ApprovalScenario)
        .options(selectinload(ApprovalScenario.updated_by))
        .order_by(ApprovalScenario.display_name)
    )
    scenarios = result.scalars().all()

    return [
        ApprovalScenarioRead(
            id=s.id,
            key=s.key,
            display_name=s.display_name,
            description=s.description,
            requires_approval=s.requires_approval,
            approver_roles=s.get_approver_roles(),
            updated_at=s.updated_at.isoformat(),
            updated_by_name=s.updated_by.name if s.updated_by else None,
        )
        for s in scenarios
    ]


@router.patch("/approval-scenarios/{key}", response_model=ApprovalScenarioRead)
async def update_approval_scenario(
    key: str,
    data: ApprovalScenarioUpdate,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
) -> ApprovalScenarioRead:
    """
    Update an approval scenario.
    CRO only. Cannot create new scenarios.
    """

    result = await db.execute(
        select(ApprovalScenario).options(selectinload(ApprovalScenario.updated_by)).where(ApprovalScenario.key == key)
    )
    scenario = result.scalar_one_or_none()

    if not scenario:
        raise HTTPException(status_code=404, detail=f"Approval scenario '{key}' not found")

    changes: list[str] = []
    activity_changes: dict[str, dict[str, object]] = {}

    if data.requires_approval is not None:
        old_val = scenario.requires_approval
        scenario.requires_approval = data.requires_approval
        if old_val != data.requires_approval:
            changes.append(f"requires_approval: {old_val} → {data.requires_approval}")
            activity_changes["requires_approval"] = {"old": old_val, "new": data.requires_approval}

    if data.approver_roles is not None:
        old_roles = scenario.get_approver_roles()
        scenario.set_approver_roles(data.approver_roles)
        if old_roles != data.approver_roles:
            changes.append(f"approver_roles: {old_roles} → {data.approver_roles}")
            activity_changes["approver_roles"] = {"old": old_roles, "new": data.approver_roles}

    scenario.updated_by_id = cro_user.id

    await db.commit()
    await db.refresh(scenario)

    if changes:
        await log_activity(
            db=db,
            actor=cro_user,
            action=ActivityAction.UPDATE,
            entity_type=ActivityEntityType.CONFIG,
            entity_id=scenario.id,
            entity_name=scenario.display_name,
            safe_entity_label=scenario.display_name,
            changes=activity_changes or None,
            description=f"Approval scenario '{key}' updated: {', '.join(changes)}",
        )
        await db.commit()

    return ApprovalScenarioRead(
        id=scenario.id,
        key=scenario.key,
        display_name=scenario.display_name,
        description=scenario.description,
        requires_approval=scenario.requires_approval,
        approver_roles=scenario.get_approver_roles(),
        updated_at=scenario.updated_at.isoformat(),
        updated_by_name=cro_user.name,
    )
