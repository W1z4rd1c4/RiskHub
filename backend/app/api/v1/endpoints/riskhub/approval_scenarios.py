from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.activity_logger import log_activity
from app.db.session import get_db
from app.models import ApprovalScenario, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.riskhub import ApprovalScenarioRead, ApprovalScenarioUpdate
from app.services._authorization_capabilities import approval_scenario_capabilities
from app.services._riskhub_config import approval_scenario_roles
from app.services._riskhub_config.lifecycle import build_config_audit_plan, run_config_noop_update, run_config_update
from app.services.approval_scenario_policy import normalize_approval_scenario_roles

from ._shared import get_cro_user

router = APIRouter()


def _approval_scenario_read(scenario: ApprovalScenario, *, updated_by_name: str | None = None) -> ApprovalScenarioRead:
    resolved_updated_by_name = (
        updated_by_name if updated_by_name is not None else (scenario.updated_by.name if scenario.updated_by else None)
    )
    return ApprovalScenarioRead(
        id=scenario.id,
        key=scenario.key,
        display_name=scenario.display_name,
        description=scenario.description,
        requires_approval=scenario.requires_approval,
        approver_roles=approval_scenario_roles.get_approval_scenario_roles(scenario),
        updated_at=scenario.updated_at.isoformat(),
        updated_by_name=resolved_updated_by_name,
        capabilities=approval_scenario_capabilities(),
    )


@router.get("/approval-scenarios", response_model=list[ApprovalScenarioRead])
async def list_approval_scenarios(
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
) -> list[ApprovalScenarioRead]:
    result = await db.execute(
        select(ApprovalScenario)
        .options(selectinload(ApprovalScenario.updated_by))
        .order_by(ApprovalScenario.display_name)
    )
    scenarios = result.scalars().all()

    return [_approval_scenario_read(s) for s in scenarios]


@router.patch("/approval-scenarios/{key}", response_model=ApprovalScenarioRead)
async def update_approval_scenario(
    key: str,
    data: ApprovalScenarioUpdate,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
) -> ApprovalScenarioRead:
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

    if data.approver_roles is not None or data.requires_approval is not None:
        old_roles = approval_scenario_roles.get_approval_scenario_roles(scenario)
        normalized_roles = normalize_approval_scenario_roles(
            key,
            data.approver_roles if data.approver_roles is not None else old_roles,
            requires_approval=scenario.requires_approval,
        )
        approval_scenario_roles.set_approval_scenario_roles(scenario, normalized_roles)
        if old_roles != normalized_roles:
            changes.append(f"approver_roles: {old_roles} → {normalized_roles}")
            activity_changes["approver_roles"] = {"old": old_roles, "new": normalized_roles}

    scenario.updated_by_id = cro_user.id

    await db.flush()

    if changes:
        audit_plan = build_config_audit_plan(
            action=ActivityAction.UPDATE,
            entity_type=ActivityEntityType.CONFIG,
            entity_id=scenario.id,
            entity_name=scenario.display_name,
            safe_entity_label=scenario.display_name,
            changes=activity_changes or None,
            description=f"Approval scenario '{key}' updated: {', '.join(changes)}",
        )
        await run_config_update(
            db=db,
            actor=cro_user,
            audit_plan=audit_plan,
            entity=scenario,
            refresh_entity=True,
            log_activity_func=log_activity,
        )
    else:
        await run_config_noop_update(db=db, entity=scenario, refresh_entity=True)

    return _approval_scenario_read(scenario, updated_by_name=cro_user.name)
