"""
Tests for Risk Hub dynamic risk types functionality.
Tests dynamic risk type validation and risk_count computation.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ApprovalScenario, Department, Risk, RiskTypeConfig, User
from app.services._riskhub_config.approval_scenario_roles import (
    APPROVER_ROLES,
    get_approval_scenario_roles,
    set_approval_scenario_roles,
)
from app.services.approval_scenario_policy import load_approval_scenario_policy


async def _upsert_approval_scenario(
    db_session: AsyncSession,
    *,
    key: str,
    roles: list[str],
    requires_approval: bool = True,
) -> ApprovalScenario:
    result = await db_session.execute(select(ApprovalScenario).where(ApprovalScenario.key == key))
    scenario = result.scalar_one_or_none()
    if scenario is None:
        scenario = ApprovalScenario(
            key=key,
            display_name=key.replace("_", " ").title(),
            description=f"Test scenario {key}",
            requires_approval=requires_approval,
        )
        db_session.add(scenario)
    scenario.requires_approval = requires_approval
    set_approval_scenario_roles(scenario, roles)
    await db_session.commit()
    await db_session.refresh(scenario)
    return scenario


@pytest.mark.asyncio
async def test_create_risk_with_valid_risk_type(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
):
    """Test creating a risk with a valid (configured) risk type succeeds."""
    # First create a risk type config
    risk_type = RiskTypeConfig(
        code="compliance",
        display_name="Compliance Risk",
        description="Regulatory compliance risk",
        color="#ef4444",
        is_active=True,
        is_system=False,
    )
    db_session.add(risk_type)
    await db_session.commit()

    # Create a risk using this type
    response = await client_cro.post(
        "/api/v1/risks",
        json={
            "risk_id_code": "COMP-R01",
            "name": "Compliance Risk Test",
            "process": "Compliance Check",
            "description": "Test compliance risk",
            "department_id": test_department.id,
            "owner_id": test_user_cro.id,
            "risk_type": "compliance",
            "gross_probability": 3,
            "gross_impact": 3,
            "net_probability": 2,
            "net_impact": 2,
            "status": "active",
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["risk_type"] == "compliance"


@pytest.mark.asyncio
async def test_create_risk_type_rolls_back_when_activity_log_fails(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    monkeypatch,
):
    async def fail_log_activity(*args, **kwargs):
        raise RuntimeError("simulated activity log failure")

    monkeypatch.setattr("app.api.v1.endpoints.riskhub.risk_types.log_activity", fail_log_activity)

    with pytest.raises(RuntimeError, match="simulated activity log failure"):
        await client_cro.post(
            "/api/v1/riskhub/risk-types",
            json={
                "code": "rollback_type",
                "display_name": "Rollback Type",
                "description": "Should not persist without audit log",
                "color": "#123456",
                "sort_order": 100,
            },
        )

    await db_session.rollback()
    persisted = (
        await db_session.execute(select(RiskTypeConfig).where(RiskTypeConfig.code == "rollback_type"))
    ).scalar_one_or_none()
    assert persisted is None


@pytest.mark.asyncio
async def test_create_risk_with_unknown_risk_type_returns_400(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
):
    """Test creating a risk with an unknown risk type returns 400 error."""
    # Don't create any risk type config - go straight to creating risk

    response = await client_cro.post(
        "/api/v1/risks",
        json={
            "risk_id_code": "UNKNOWN-R01",
            "name": "Unknown Type Test Risk",
            "process": "Unknown Type Test",
            "description": "Test with unknown risk type",
            "department_id": test_department.id,
            "owner_id": test_user_cro.id,
            "risk_type": "nonexistent_type",
            "gross_probability": 3,
            "gross_impact": 3,
            "net_probability": 2,
            "net_impact": 2,
            "status": "active",
        },
    )

    assert response.status_code == 400
    assert "Unknown risk type" in response.json()["detail"]
    assert "nonexistent_type" in response.json()["detail"]


@pytest.mark.asyncio
async def test_create_risk_with_default_operational_type(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
):
    """Test creating a risk with default 'operational' type requires it to be configured."""
    # Create the operational risk type config (system default)
    risk_type = RiskTypeConfig(
        code="operational",
        display_name="Operational Risk",
        description="Day-to-day operational risks",
        color="#3b82f6",
        is_active=True,
        is_system=True,
    )
    db_session.add(risk_type)
    await db_session.commit()

    # Create a risk without specifying risk_type (should default to "operational")
    response = await client_cro.post(
        "/api/v1/risks",
        json={
            "risk_id_code": "OPS-R01",
            "name": "Default Operational Risk",
            "process": "Operations Process",
            "description": "Default operational risk",
            "department_id": test_department.id,
            "owner_id": test_user_cro.id,
            # risk_type not specified - defaults to "operational"
            "gross_probability": 2,
            "gross_impact": 2,
            "net_probability": 1,
            "net_impact": 1,
            "status": "active",
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["risk_type"] == "operational"


@pytest.mark.asyncio
async def test_update_risk_with_unknown_risk_type_returns_400(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
):
    """Test updating a risk to an unknown risk type returns 400 error."""
    # Create a valid risk type
    risk_type = RiskTypeConfig(
        code="operational",
        display_name="Operational Risk",
        is_active=True,
        is_system=True,
    )
    db_session.add(risk_type)
    await db_session.commit()

    # Create a risk with valid type
    create_response = await client_cro.post(
        "/api/v1/risks",
        json={
            "risk_id_code": "UPD-R01",
            "name": "Update Test Risk",
            "process": "Update Test",
            "description": "Risk for update test",
            "department_id": test_department.id,
            "owner_id": test_user_cro.id,
            "risk_type": "operational",
            "gross_probability": 3,
            "gross_impact": 3,
            "net_probability": 2,
            "net_impact": 2,
            "status": "active",
        },
    )
    assert create_response.status_code == 201
    risk_id = create_response.json()["id"]

    # Try to update to invalid risk type
    response = await client_cro.patch(
        f"/api/v1/risks/{risk_id}",
        json={"risk_type": "invalid_type"},
    )

    assert response.status_code == 400
    assert "Unknown risk type" in response.json()["detail"]


@pytest.mark.asyncio
async def test_update_risk_with_valid_risk_type_succeeds(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
):
    """Test updating a risk to a valid risk type succeeds."""
    # Create two valid risk types
    operational = RiskTypeConfig(
        code="operational",
        display_name="Operational Risk",
        is_active=True,
        is_system=True,
    )
    strategic = RiskTypeConfig(
        code="strategic",
        display_name="Strategic Risk",
        is_active=True,
        is_system=True,
    )
    db_session.add_all([operational, strategic])
    await db_session.commit()

    # Create a risk with operational type
    create_response = await client_cro.post(
        "/api/v1/risks",
        json={
            "risk_id_code": "STRAT-R01",
            "name": "Strategic Update Test Risk",
            "process": "Strategic Update Test",
            "description": "Risk for strategic update",
            "department_id": test_department.id,
            "owner_id": test_user_cro.id,
            "risk_type": "operational",
            "gross_probability": 3,
            "gross_impact": 3,
            "net_probability": 2,
            "net_impact": 2,
            "status": "active",
        },
    )
    assert create_response.status_code == 201
    risk_id = create_response.json()["id"]

    # Update to strategic type
    response = await client_cro.patch(
        f"/api/v1/risks/{risk_id}",
        json={"risk_type": "strategic"},
    )

    assert response.status_code == 200
    assert response.json()["risk_type"] == "strategic"


@pytest.mark.asyncio
async def test_inactive_risk_type_rejected(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
):
    """Test that inactive (soft-deleted) risk types are rejected."""
    # Create an inactive risk type
    risk_type = RiskTypeConfig(
        code="deprecated",
        display_name="Deprecated Risk Type",
        is_active=False,  # Inactive!
        is_system=False,
    )
    db_session.add(risk_type)
    await db_session.commit()

    # Try to create a risk with the inactive type
    response = await client_cro.post(
        "/api/v1/risks",
        json={
            "risk_id_code": "DEP-R01",
            "name": "Deprecated Type Test Risk",
            "process": "Deprecated Type Test",
            "description": "Test with deprecated risk type",
            "department_id": test_department.id,
            "owner_id": test_user_cro.id,
            "risk_type": "deprecated",
            "gross_probability": 3,
            "gross_impact": 3,
            "net_probability": 2,
            "net_impact": 2,
            "status": "active",
        },
    )

    assert response.status_code == 400
    assert "Unknown risk type" in response.json()["detail"]


@pytest.mark.asyncio
async def test_riskhub_risk_type_list_shows_accurate_counts(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
):
    """Test that Risk Hub risk type list shows accurate risk_count values."""
    # Create risk types
    operational = RiskTypeConfig(
        code="operational",
        display_name="Operational Risk",
        is_active=True,
        is_system=True,
        risk_count=999,  # Stale denormalized value - should be ignored
    )
    strategic = RiskTypeConfig(
        code="strategic",
        display_name="Strategic Risk",
        is_active=True,
        is_system=True,
        risk_count=999,  # Stale denormalized value - should be ignored
    )
    db_session.add_all([operational, strategic])
    await db_session.commit()

    # Create 3 operational risks
    for i in range(3):
        risk = Risk(
            risk_id_code=f"OPS-TEST-{i:02d}",
            name=f"Operational Risk {i}",
            process=f"Ops Process {i}",
            description=f"Operational risk {i}",
            department_id=test_department.id,
            owner_id=test_user_cro.id,
            risk_type="operational",
            status="active",
        )
        db_session.add(risk)

    # Create 2 strategic risks
    for i in range(2):
        risk = Risk(
            risk_id_code=f"STRAT-TEST-{i:02d}",
            name=f"Strategic Risk {i}",
            process=f"Strategic Process {i}",
            description=f"Strategic risk {i}",
            department_id=test_department.id,
            owner_id=test_user_cro.id,
            risk_type="strategic",
            status="active",
        )
        db_session.add(risk)

    await db_session.commit()

    # Get risk types from Risk Hub API
    response = await client_cro.get("/api/v1/riskhub/risk-types")

    assert response.status_code == 200
    types_list = response.json()

    # Find counts for each type
    counts = {t["code"]: t["risk_count"] for t in types_list}

    assert counts["operational"] == 3
    assert counts["strategic"] == 2
    operational_type = next(t for t in types_list if t["code"] == "operational")
    assert operational_type["capabilities"] == {
        "can_create": True,
        "can_update": True,
        "can_delete": False,
        "can_restore": False,
    }


@pytest.mark.asyncio
async def test_riskhub_risk_count_excludes_archived_risks(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
):
    """Test that risk_count in Risk Hub excludes archived risks."""
    # Create risk type
    operational = RiskTypeConfig(
        code="operational",
        display_name="Operational Risk",
        is_active=True,
        is_system=True,
    )
    db_session.add(operational)
    await db_session.commit()

    # Create 2 active risks
    for i in range(2):
        risk = Risk(
            risk_id_code=f"ACTIVE-{i:02d}",
            name=f"Active Risk {i}",
            process=f"Active Process {i}",
            description=f"Active risk {i}",
            department_id=test_department.id,
            owner_id=test_user_cro.id,
            risk_type="operational",
            status="active",
        )
        db_session.add(risk)

    # Create 1 archived risk (should not be counted)
    archived_risk = Risk(
        risk_id_code="ARCHIVED-01",
        name="Archived Risk",
        process="Archived Process",
        description="Archived risk",
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_type="operational",
        status="active",

        is_archived=True,
    )
    db_session.add(archived_risk)
    await db_session.commit()

    # Get risk types from Risk Hub API
    response = await client_cro.get("/api/v1/riskhub/risk-types")

    assert response.status_code == 200
    types_list = response.json()

    # Find operational type
    operational_type = next(t for t in types_list if t["code"] == "operational")

    # Should only count 2 active risks, not the archived one
    assert operational_type["risk_count"] == 2


@pytest.mark.asyncio
async def test_update_inactive_risk_type_rejected(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    risk_type = RiskTypeConfig(
        code="inactive_update",
        display_name="Inactive Update",
        is_active=False,
        is_system=False,
    )
    db_session.add(risk_type)
    await db_session.commit()
    await db_session.refresh(risk_type)

    response = await client_cro.patch(
        f"/api/v1/riskhub/risk-types/{risk_type.id}",
        json={"display_name": "Should Not Update"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Cannot update inactive risk type"


@pytest.mark.asyncio
async def test_delete_risk_type_uses_dynamic_active_risk_count(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    risk_type = RiskTypeConfig(
        code="dynamic_count",
        display_name="Dynamic Count",
        is_active=True,
        is_system=False,
        risk_count=99,
    )
    db_session.add(risk_type)
    await db_session.commit()
    await db_session.refresh(risk_type)

    response = await client_cro.delete(f"/api/v1/riskhub/risk-types/{risk_type.id}")

    assert response.status_code == 200
    assert response.json()["affected_risks"] == 0


@pytest.mark.asyncio
async def test_update_tier_capable_approval_scenario_adds_privileged_finishers(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    await _upsert_approval_scenario(db_session, key="risk_delete", roles=["risk_owner"])

    response = await client_cro.patch(
        "/api/v1/riskhub/approval-scenarios/risk_delete",
        json={"approver_roles": ["risk_owner"], "requires_approval": True},
    )

    assert response.status_code == 200
    assert response.json()["approver_roles"] == list(APPROVER_ROLES)

    scenario = await db_session.scalar(select(ApprovalScenario).where(ApprovalScenario.key == "risk_delete"))
    assert scenario is not None
    assert get_approval_scenario_roles(scenario) == list(APPROVER_ROLES)


@pytest.mark.asyncio
async def test_update_disabled_tier_capable_custom_scenario_preserves_submitted_roles(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    await _upsert_approval_scenario(db_session, key="control_edit", roles=["risk_manager"])

    response = await client_cro.patch(
        "/api/v1/riskhub/approval-scenarios/control_edit",
        json={"approver_roles": ["risk_manager"], "requires_approval": False},
    )

    assert response.status_code == 200
    assert response.json()["requires_approval"] is False
    assert response.json()["approver_roles"] == ["risk_manager"]


@pytest.mark.asyncio
async def test_update_tier_capable_approval_scenario_preserves_existing_privileged_role(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    await _upsert_approval_scenario(db_session, key="kri_value_submit", roles=["risk_manager", "cro"])

    response = await client_cro.patch(
        "/api/v1/riskhub/approval-scenarios/kri_value_submit",
        json={"approver_roles": ["risk_manager", "cro"], "requires_approval": True},
    )

    assert response.status_code == 200
    assert response.json()["approver_roles"] == ["risk_manager", "cro"]


@pytest.mark.asyncio
async def test_update_non_tier_approval_scenario_preserves_submitted_roles_without_duplicates(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    await _upsert_approval_scenario(db_session, key="routine_review", roles=["risk_manager", "risk_manager"])

    response = await client_cro.patch(
        "/api/v1/riskhub/approval-scenarios/routine_review",
        json={"approver_roles": ["risk_manager", "risk_manager"], "requires_approval": True},
    )

    assert response.status_code == 200
    assert response.json()["approver_roles"] == ["risk_manager"]


@pytest.mark.asyncio
async def test_update_required_risk_owner_scenarios_add_privileged_finishers(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    for key in ("risk_edit_priority", "kri_delete", "kri_edit"):
        await _upsert_approval_scenario(db_session, key=key, roles=["risk_owner"])

        response = await client_cro.patch(
            f"/api/v1/riskhub/approval-scenarios/{key}",
            json={"approver_roles": ["risk_owner"], "requires_approval": True},
        )

        assert response.status_code == 200
        assert response.json()["approver_roles"] == list(APPROVER_ROLES)

        scenario = await db_session.scalar(select(ApprovalScenario).where(ApprovalScenario.key == key))
        assert scenario is not None
        assert get_approval_scenario_roles(scenario) == list(APPROVER_ROLES)


@pytest.mark.asyncio
async def test_update_tiered_edit_scenarios_add_privileged_finishers_for_non_privileged_roles(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    for key in ("risk_edit_priority", "kri_edit"):
        await _upsert_approval_scenario(db_session, key=key, roles=["risk_owner"])

        response = await client_cro.patch(
            f"/api/v1/riskhub/approval-scenarios/{key}",
            json={"approver_roles": ["risk_owner"], "requires_approval": True},
        )

        assert response.status_code == 200
        assert response.json()["approver_roles"] == list(APPROVER_ROLES)

        scenario = await db_session.scalar(select(ApprovalScenario).where(ApprovalScenario.key == key))
        assert scenario is not None
        assert get_approval_scenario_roles(scenario) == list(APPROVER_ROLES)


@pytest.mark.asyncio
async def test_update_disabled_risk_owner_scenario_preserves_submitted_roles(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    await _upsert_approval_scenario(db_session, key="risk_edit_priority", roles=["risk_owner"])

    response = await client_cro.patch(
        "/api/v1/riskhub/approval-scenarios/risk_edit_priority",
        json={"approver_roles": ["risk_owner"], "requires_approval": False},
    )

    assert response.status_code == 200
    assert response.json()["requires_approval"] is False
    assert response.json()["approver_roles"] == ["risk_owner"]


@pytest.mark.asyncio
async def test_update_required_non_tier_approval_scenario_empty_roles_uses_privileged_fallback(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    await _upsert_approval_scenario(db_session, key="risk_edit_priority", roles=["employee"])

    response = await client_cro.patch(
        "/api/v1/riskhub/approval-scenarios/risk_edit_priority",
        json={"approver_roles": [], "requires_approval": True},
    )

    assert response.status_code == 200
    assert response.json()["requires_approval"] is True
    assert response.json()["approver_roles"] == ["risk_manager", "cro"]

    scenario = await db_session.scalar(select(ApprovalScenario).where(ApprovalScenario.key == "risk_edit_priority"))
    assert scenario is not None
    assert get_approval_scenario_roles(scenario) == ["risk_manager", "cro"]


@pytest.mark.asyncio
async def test_update_disabled_approval_scenario_empty_roles_preserved(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    await _upsert_approval_scenario(db_session, key="risk_edit_priority", roles=["employee"])

    response = await client_cro.patch(
        "/api/v1/riskhub/approval-scenarios/risk_edit_priority",
        json={"approver_roles": [], "requires_approval": False},
    )

    assert response.status_code == 200
    assert response.json()["requires_approval"] is False
    assert response.json()["approver_roles"] == []

    scenario = await db_session.scalar(select(ApprovalScenario).where(ApprovalScenario.key == "risk_edit_priority"))
    assert scenario is not None
    assert get_approval_scenario_roles(scenario) == []


@pytest.mark.asyncio
async def test_update_reenabled_required_scenario_with_empty_roles_uses_privileged_fallback(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    await _upsert_approval_scenario(
        db_session,
        key="risk_edit_priority",
        roles=[],
        requires_approval=False,
    )

    response = await client_cro.patch(
        "/api/v1/riskhub/approval-scenarios/risk_edit_priority",
        json={"requires_approval": True},
    )

    assert response.status_code == 200
    assert response.json()["requires_approval"] is True
    assert response.json()["approver_roles"] == ["risk_manager", "cro"]

    scenario = await db_session.scalar(select(ApprovalScenario).where(ApprovalScenario.key == "risk_edit_priority"))
    assert scenario is not None
    assert get_approval_scenario_roles(scenario) == ["risk_manager", "cro"]


@pytest.mark.asyncio
async def test_load_required_empty_scenario_policy_uses_privileged_fallback(
    db_session: AsyncSession,
):
    await _upsert_approval_scenario(
        db_session,
        key="risk_edit_priority",
        roles=[],
        requires_approval=True,
    )

    policy = await load_approval_scenario_policy(db_session, "risk_edit_priority")

    assert policy.requires_approval is True
    assert policy.approver_roles == ["risk_manager", "cro"]


@pytest.mark.asyncio
async def test_load_required_risk_owner_scenario_policy_adds_privileged_finishers(
    db_session: AsyncSession,
):
    await _upsert_approval_scenario(
        db_session,
        key="risk_edit_priority",
        roles=["risk_owner"],
        requires_approval=True,
    )

    policy = await load_approval_scenario_policy(db_session, "risk_edit_priority")

    assert policy.requires_approval is True
    assert policy.approver_roles == list(APPROVER_ROLES)
