import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ApprovalScenario, GlobalConfig


@pytest.mark.asyncio
async def test_approval_scenario_update_rolls_back_when_activity_log_fails(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    monkeypatch,
):
    scenario = ApprovalScenario(
        key="rollback_scenario",
        display_name="Rollback Scenario",
        description="Scenario should rollback when logging fails",
        requires_approval=True,
    )
    scenario.set_approver_roles(["risk_owner"])
    db_session.add(scenario)
    await db_session.commit()

    async def fail_log_activity(*args, **kwargs):
        raise RuntimeError("simulated activity log failure")

    monkeypatch.setattr("app.api.v1.endpoints.riskhub.approval_scenarios.log_activity", fail_log_activity)

    with pytest.raises(RuntimeError, match="simulated activity log failure"):
        await client_cro.patch(
            "/api/v1/riskhub/approval-scenarios/rollback_scenario",
            json={"requires_approval": False, "approver_roles": []},
        )

    await db_session.rollback()
    persisted = (
        await db_session.execute(select(ApprovalScenario).where(ApprovalScenario.key == "rollback_scenario"))
    ).scalar_one()
    assert persisted.requires_approval is True
    assert persisted.get_approver_roles() == ["risk_owner"]


@pytest.mark.asyncio
async def test_global_config_update_rolls_back_when_activity_log_fails(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    monkeypatch,
):
    config = GlobalConfig(
        key="rollback_config",
        value="3",
        value_type="int",
        category="test",
        display_name="Rollback Config",
        is_editable=True,
        min_value=1,
        max_value=10,
    )
    db_session.add(config)
    await db_session.commit()

    async def fail_log_activity(*args, **kwargs):
        raise RuntimeError("simulated activity log failure")

    monkeypatch.setattr("app.api.v1.endpoints.riskhub.global_config.log_activity", fail_log_activity)

    with pytest.raises(RuntimeError, match="simulated activity log failure"):
        await client_cro.patch("/api/v1/riskhub/config/rollback_config", json={"value": "7"})

    await db_session.rollback()
    persisted = (
        await db_session.execute(select(GlobalConfig).where(GlobalConfig.key == "rollback_config"))
    ).scalar_one()
    assert persisted.value == "3"
