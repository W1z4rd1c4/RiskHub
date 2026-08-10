from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.core.activity_logger import log_activity
from app.db.session import get_db
from app.models import ApprovalScenario, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.riskhub import ApprovalScenarioRead, ApprovalScenarioUpdate
from app.services._riskhub_config.approval_scenarios import (
    apply_approval_scenario_changes,
    approval_scenario_to_read,
    load_approval_scenario_for_update,
    validate_fixed_approval_scenario_update,
)
from app.services._riskhub_config.lifecycle import build_config_audit_plan, run_config_noop_update, run_config_update

from ._shared import get_cro_user

router = APIRouter()


@router.get("/approval-scenarios", response_model=list[ApprovalScenarioRead])
async def list_approval_scenarios(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ApprovalScenarioRead]:
    result = await db.execute(
        select(ApprovalScenario)
        .options(selectinload(ApprovalScenario.updated_by))
        .order_by(ApprovalScenario.display_name)
    )
    scenarios = result.scalars().all()

    return [approval_scenario_to_read(s, viewer=current_user) for s in scenarios]


@router.patch("/approval-scenarios/{key}", response_model=ApprovalScenarioRead)
async def update_approval_scenario(
    key: str,
    data: ApprovalScenarioUpdate,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
) -> ApprovalScenarioRead:
    scenario = await load_approval_scenario_for_update(db, key)
    validate_fixed_approval_scenario_update(scenario, key=key, data=data)

    changes = apply_approval_scenario_changes(scenario, key=key, data=data)

    scenario.updated_by_id = cro_user.id

    await db.flush()

    if changes.descriptions:
        audit_plan = build_config_audit_plan(
            action=ActivityAction.UPDATE,
            entity_type=ActivityEntityType.CONFIG,
            entity_id=scenario.id,
            entity_name=scenario.display_name,
            safe_entity_label=scenario.display_name,
            changes=changes.audit_changes or None,
            description=f"Approval scenario '{key}' updated: {', '.join(changes.descriptions)}",
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

    return approval_scenario_to_read(
        scenario,
        viewer=cro_user,
        updated_by_name=cro_user.name,
    )
