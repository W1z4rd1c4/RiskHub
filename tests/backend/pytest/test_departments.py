"""Tests for department endpoints."""

import json
from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.models import (
    Asset,
    Control,
    ControlExecution,
    Department,
    GlobalConfig,
    Issue,
    KeyRiskIndicator,
    Process,
    Permission,
    Risk,
    Role,
    RolePermission,
    User,
    Vendor,
)
from app.models.global_config import clear_config_cache
from app.models.issue import IssueStatus
from app.models.risk import RiskStatus as RiskStatusEnum
from app.models.role import RoleType
from app.models.user import AccessScope


@pytest.mark.asyncio
async def test_unassigned_global_cro_explicit_department_roster_matches_overview_count(
    client: AsyncClient,
    db_session: AsyncSession,
):
    department_read = Permission(resource="departments", action="read")
    users_read = Permission(resource="users", action="read")
    cro_role = Role(name=RoleType.CRO, display_name="CRO")
    employee_role = Role(name=RoleType.EMPLOYEE, display_name="Employee")
    admin_role = Role(name=RoleType.ADMIN, display_name="Platform Admin")
    department = Department(name="Explicit Roster Target", code="EXPLICIT-ROSTER")
    db_session.add_all(
        [
            department_read,
            users_read,
            cro_role,
            employee_role,
            admin_role,
            department,
        ]
    )
    await db_session.flush()
    db_session.add_all(
        [
            RolePermission(role_id=cro_role.id, permission_id=department_read.id),
            RolePermission(role_id=cro_role.id, permission_id=users_read.id),
        ]
    )
    caller = User(
        name="Unassigned Global CRO",
        email="unassigned-global-cro@test.com",
        department_id=None,
        role_id=cro_role.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    active_employee = User(
        name="Explicit Target Employee",
        email="explicit-target-employee@test.com",
        department_id=department.id,
        role_id=employee_role.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    inactive_employee = User(
        name="Inactive Explicit Target Employee",
        email="inactive-explicit-target-employee@test.com",
        department_id=department.id,
        role_id=employee_role.id,
        is_active=False,
        access_scope=AccessScope.DEPARTMENT,
    )
    target_admin = User(
        name="Explicit Target Admin",
        email="explicit-target-admin@test.com",
        department_id=department.id,
        role_id=admin_role.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    db_session.add_all(
        [caller, active_employee, inactive_employee, target_admin]
    )
    await db_session.commit()
    headers = {"X-Mock-User-Id": str(caller.id)}

    roster_response = await client.get(
        "/api/v1/access/users/my-department",
        params={"department_id": department.id},
        headers=headers,
    )
    detail_response = await client.get(
        f"/api/v1/departments/{department.id}",
        headers=headers,
    )

    assert roster_response.status_code == 200
    assert detail_response.status_code == 200
    roster_ids = {row["id"] for row in roster_response.json()}
    assert roster_ids == {active_employee.id}
    assert inactive_employee.id not in roster_ids
    assert target_admin.id not in roster_ids
    assert detail_response.json()["user_count"] == len(roster_ids)


@pytest.mark.asyncio
async def test_department_overview_user_count_matches_department_head_access_roster(
    client: AsyncClient,
    db_session: AsyncSession,
):
    department_read = Permission(resource="departments", action="read")
    users_read = Permission(resource="users", action="read")
    department_head_role = Role(
        name=RoleType.DEPARTMENT_HEAD,
        display_name="Department Head",
    )
    employee_role = Role(name=RoleType.EMPLOYEE, display_name="Employee")
    admin_role = Role(name=RoleType.ADMIN, display_name="Platform Admin")
    cro_role = Role(name=RoleType.CRO, display_name="CRO")
    department = Department(name="Roster Overview", code="ROSTER-OVERVIEW")
    cro_department = Department(name="CRO Department", code="CRO-ROSTER")
    db_session.add_all(
        [
            department_read,
            users_read,
            department_head_role,
            employee_role,
            admin_role,
            cro_role,
            department,
            cro_department,
        ]
    )
    await db_session.flush()
    db_session.add_all(
        [
            RolePermission(
                role_id=department_head_role.id,
                permission_id=department_read.id,
            ),
            RolePermission(role_id=admin_role.id, permission_id=department_read.id),
            RolePermission(role_id=admin_role.id, permission_id=users_read.id),
            RolePermission(role_id=cro_role.id, permission_id=department_read.id),
            RolePermission(role_id=cro_role.id, permission_id=users_read.id),
        ]
    )
    await db_session.flush()

    caller = User(
        name="Roster Department Head",
        email="roster-department-head@test.com",
        department_id=department.id,
        role_id=department_head_role.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    active_employee = User(
        name="Active Roster Employee",
        email="active-roster-employee@test.com",
        department_id=department.id,
        role_id=employee_role.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    inactive_employee = User(
        name="Inactive Roster Employee",
        email="inactive-roster-employee@test.com",
        department_id=department.id,
        role_id=employee_role.id,
        is_active=False,
        access_scope=AccessScope.DEPARTMENT,
    )
    platform_admin = User(
        name="Department Platform Admin",
        email="department-platform-admin@test.com",
        department_id=department.id,
        role_id=admin_role.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    cro = User(
        name="Roster CRO",
        email="roster-cro@test.com",
        department_id=cro_department.id,
        role_id=cro_role.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    db_session.add_all(
        [caller, active_employee, inactive_employee, platform_admin, cro]
    )
    await db_session.commit()
    headers = {"X-Mock-User-Id": str(caller.id)}

    roster_response = await client.get(
        "/api/v1/access/users/my-department",
        headers=headers,
    )
    detail_response = await client.get(
        f"/api/v1/departments/{department.id}",
        headers=headers,
    )

    assert roster_response.status_code == 200
    assert detail_response.status_code == 200
    roster_ids = {row["id"] for row in roster_response.json()}
    assert roster_ids == {caller.id, active_employee.id}
    assert inactive_employee.id not in roster_ids
    assert platform_admin.id not in roster_ids
    assert detail_response.json()["user_count"] == len(roster_ids)

    for privileged_caller, expected_ids in (
        (cro, {caller.id, active_employee.id}),
        (platform_admin, {caller.id, active_employee.id, platform_admin.id}),
    ):
        privileged_headers = {"X-Mock-User-Id": str(privileged_caller.id)}
        privileged_roster = await client.get(
            "/api/v1/access/users/my-department",
            params={"department_id": department.id},
            headers=privileged_headers,
        )
        privileged_detail = await client.get(
            f"/api/v1/departments/{department.id}",
            headers=privileged_headers,
        )
        assert privileged_roster.status_code == 200
        assert privileged_detail.status_code == 200
        assert {row["id"] for row in privileged_roster.json()} == expected_ids
        assert privileged_detail.json()["user_count"] == len(expected_ids)


@pytest.mark.asyncio
async def test_department_overview_does_not_publish_domain_counts_to_departments_read_only_user(
    client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
):
    department_read = Permission(
        resource="departments",
        action="read",
        description="Read Departments only",
    )
    role = Role(
        name="department_overview_without_domain_reads",
        display_name="Department Overview without domain reads",
    )
    db_session.add_all([department_read, role])
    await db_session.flush()
    db_session.add(RolePermission(role_id=role.id, permission_id=department_read.id))
    await db_session.flush()
    caller = User(
        name="Department Overview Reader",
        email="department-overview-reader@test.com",
        department_id=test_department.id,
        role_id=role.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(caller)
    await db_session.flush()
    hidden_risk = Risk(
        risk_id_code="RISK-HIDDEN-OVERVIEW",
        name="Hidden Overview Risk",
        process="Restricted",
        description="Must not leak through Department derived metrics",
        category="Operational",
        department_id=test_department.id,
        owner_id=caller.id,
        risk_type="operational",
        gross_probability=5,
        gross_impact=5,
        gross_score=25,
        net_probability=5,
        net_impact=5,
        net_score=25,
        status=RiskStatusEnum.active.value,
    )
    hidden_control = Control(
        name="Hidden Overview Control",
        description="Must not leak through recent executions",
        department_id=test_department.id,
        control_owner_id=caller.id,
        control_form="manual",
        frequency="monthly",
        risk_level=5,
        status="active",
    )
    db_session.add_all([hidden_risk, hidden_control])
    await db_session.flush()
    db_session.add(
        ControlExecution(
            control_id=hidden_control.id,
            executed_by_id=caller.id,
            result="failed",
        )
    )
    await db_session.commit()

    response = await client.get(
        f"/api/v1/departments/{test_department.id}",
        headers={"X-Mock-User-Id": str(caller.id)},
    )

    assert response.status_code == 200
    payload = response.json()
    assert {
        "risks": (payload["risk_count"], payload["high_risk_count"]),
        "controls": (payload["control_count"], payload["control_stats"]),
        "kris": (payload["kri_count"], payload["kri_monitoring_counts"]),
        "issues": (payload["issue_count"], payload["overdue_issue_count"]),
        "processes": (
            payload["process_count"],
            payload["process_accountability_gap_count"],
        ),
        "assets": (
            payload["asset_count"],
            payload["asset_accountability_gap_count"],
        ),
        "vendors": (payload["vendor_count"], payload["significant_vendor_count"]),
        "users": (payload["user_count"], None),
    } == {
        domain: (None, None)
        for domain in (
            "risks",
            "controls",
            "kris",
            "issues",
            "processes",
            "assets",
            "vendors",
            "users",
        )
    }
    assert payload["risk_distribution"] is None
    assert payload["risk_by_status"] is None
    assert payload["recent_executions"] is None


@pytest.mark.asyncio
async def test_department_overview_control_reader_keeps_factual_empty_recent_executions(
    client_cro: AsyncClient,
    test_department: Department,
):
    response = await client_cro.get(f"/api/v1/departments/{test_department.id}")

    assert response.status_code == 200
    assert response.json()["recent_executions"] == []


@pytest.mark.asyncio
async def test_department_overview_partial_permissions_count_only_canonical_visible_rows(
    client: AsyncClient,
    db_session: AsyncSession,
):
    department_read = Permission(resource="departments", action="read")
    asset_read = Permission(resource="assets", action="read")
    role = Role(
        name=RoleType.DEPARTMENT_HEAD,
        display_name="Department Head",
    )
    department = Department(
        name="Inactive Department",
        code="INACTIVE-COUNT-SCOPE",
        is_active=False,
    )
    db_session.add_all([department_read, asset_read, role, department])
    await db_session.flush()
    db_session.add_all(
        [
            RolePermission(role_id=role.id, permission_id=department_read.id),
            RolePermission(role_id=role.id, permission_id=asset_read.id),
        ]
    )
    caller = User(
        name="Inactive Department Head",
        email="inactive-department-head@test.com",
        department_id=department.id,
        role_id=role.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(caller)
    await db_session.flush()
    db_session.add(
        Asset(
            name="Invisible inactive-department asset",
            owning_department_id=department.id,
            business_owner_user_id=None,
            ict_owner_user_id=None,
        )
    )
    await db_session.commit()

    response = await client.get(
        f"/api/v1/departments/{department.id}",
        headers={"X-Mock-User-Id": str(caller.id)},
    )

    assert response.status_code == 200
    payload = response.json()
    assert {
        "risks": (payload["risk_count"], payload["high_risk_count"]),
        "controls": (payload["control_count"], payload["control_stats"]),
        "kris": (payload["kri_count"], payload["kri_monitoring_counts"]),
        "issues": (payload["issue_count"], payload["overdue_issue_count"]),
        "processes": (
            payload["process_count"],
            payload["process_accountability_gap_count"],
        ),
        "assets": (
            payload["asset_count"],
            payload["asset_accountability_gap_count"],
        ),
        "vendors": (payload["vendor_count"], payload["significant_vendor_count"]),
        "users": (payload["user_count"], None),
    } == {
        "risks": (None, None),
        "controls": (None, None),
        "kris": (None, None),
        "issues": (None, None),
        "processes": (None, None),
        # The canonical Asset register excludes unowned records in an inactive
        # Department from a Department Head's row-visible universe.
        "assets": (0, 0),
        "vendors": (None, None),
        # Department Heads are eligible for their active Department roster
        # independently of users:read; this fixture contains only the caller.
        "users": (1, None),
    }


@pytest.mark.asyncio
async def test_department_detail_scopes_operational_register_counts_by_canonical_department(
    client_factory,
    db_session: AsyncSession,
    test_user_employee: User,
    test_user_cro: User,
):
    scoped_department = Department(name="Operational Overview", code="OPS-OVERVIEW")
    owner_department = Department(name="Accountable Owner Department", code="OWNER-DEPT")
    db_session.add_all([scoped_department, owner_department])
    await db_session.flush()

    # Accountability intentionally crosses Departments; membership remains on
    # each register's canonical owning Department field.
    test_user_employee.department_id = owner_department.id
    scoped_user = User(
        name="Scoped Department User",
        email="scoped-department-user@test.com",
        department_id=scoped_department.id,
        role_id=test_user_employee.role_id,
        is_active=True,
    )
    scoped_risk = Risk(
        risk_id_code="RISK-OVERVIEW-SCOPE",
        name="Scoped high risk",
        process="Operations",
        description="Scoped Department Overview risk",
        category="Operational",
        department_id=scoped_department.id,
        owner_id=test_user_employee.id,
        risk_type="operational",
        gross_probability=4,
        gross_impact=4,
        gross_score=16,
        net_probability=4,
        net_impact=4,
        net_score=16,
        status=RiskStatusEnum.active.value,
    )
    scoped_control = Control(
        name="Scoped inactive control",
        description="Scoped Department Overview control",
        department_id=scoped_department.id,
        control_owner_id=test_user_employee.id,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status="inactive",
    )
    db_session.add_all([scoped_user, scoped_risk, scoped_control])
    await db_session.flush()
    now = utc_now()
    db_session.add_all(
        [
            KeyRiskIndicator(
                risk_id=scoped_risk.id,
                metric_name="Scoped breached KRI",
                description="Scoped Department Overview KRI",
                current_value=101,
                lower_limit=0,
                upper_limit=100,
                unit="%",
                frequency="monthly",
                reporting_owner_id=test_user_employee.id,
                last_period_end=now.date(),
            ),
            Issue(
                title="Scoped overdue issue",
                severity="high",
                status=IssueStatus.open,
                source_type="manual",
                department_id=scoped_department.id,
                owner_user_id=test_user_employee.id,
                due_at=now - timedelta(days=1),
            ),
            Issue(
                title="Other Department issue",
                severity="high",
                status=IssueStatus.open,
                source_type="manual",
                department_id=owner_department.id,
                owner_user_id=test_user_employee.id,
                due_at=now - timedelta(days=1),
            ),
            Process(
                f_code="F8901",
                l0_area="Operations",
                l1_process="Scoped process",
                process_owner_user_id=None,
                owning_department_id=scoped_department.id,
            ),
            Process(
                f_code="F8902",
                l0_area="Operations",
                l1_process="Other process",
                process_owner_user_id=test_user_employee.id,
                owning_department_id=owner_department.id,
            ),
            Asset(
                name="Scoped asset",
                owning_department_id=scoped_department.id,
                business_owner_user_id=test_user_employee.id,
                ict_owner_user_id=None,
            ),
            Asset(
                name="Other asset",
                owning_department_id=owner_department.id,
                business_owner_user_id=test_user_employee.id,
                ict_owner_user_id=test_user_employee.id,
            ),
            Vendor(
                name="Scoped significant vendor",
                process="Operations",
                department_id=scoped_department.id,
                outsourcing_owner_user_id=test_user_employee.id,
                vendor_type="ict",
                is_significant_vendor=True,
            ),
            Vendor(
                name="Other significant vendor",
                process="Operations",
                department_id=owner_department.id,
                outsourcing_owner_user_id=test_user_employee.id,
                vendor_type="ict",
                is_significant_vendor=True,
            ),
        ]
    )
    await db_session.commit()

    async with client_factory(current_user=test_user_cro) as auth_client:
        response = await auth_client.get(f"/api/v1/departments/{scoped_department.id}")

        assert response.status_code == 200
        payload = response.json()
        assert payload["issue_count"] == 1
        assert payload["overdue_issue_count"] == 1
        assert payload["process_count"] == 1
        assert payload["process_accountability_gap_count"] == 1
        assert payload["asset_count"] == 1
        assert payload["asset_accountability_gap_count"] == 1
        assert payload["vendor_count"] == 1
        assert payload["significant_vendor_count"] == 1

        canonical_totals = {}
        for domain, path, params in (
            ("risks", "/api/v1/risks", {"department_id": scoped_department.id}),
            ("controls", "/api/v1/controls", {"department_id": scoped_department.id}),
            ("kris", "/api/v1/kris", {"department_id": scoped_department.id}),
                (
                    "issues",
                    "/api/v1/issues",
                {"filters": json.dumps({"department_id": scoped_department.id})},
            ),
            (
                "processes",
                "/api/v1/processes",
                {"department_ids": scoped_department.id},
            ),
            ("assets", "/api/v1/assets", {"department_ids": scoped_department.id}),
            ("vendors", "/api/v1/vendors", {"department_id": scoped_department.id}),
            (
                "users",
                "/api/v1/users/directory",
                {"department_id": scoped_department.id},
            ),
        ):
            canonical_response = await auth_client.get(path, params=params)
            assert canonical_response.status_code == 200, domain
            canonical_totals[domain] = canonical_response.json()["total"]

    assert canonical_totals == {
        "risks": payload["risk_count"],
        "controls": payload["control_count"],
        "kris": payload["kri_count"],
        "issues": payload["issue_count"],
        "processes": payload["process_count"],
        "assets": payload["asset_count"],
        "vendors": payload["vendor_count"],
        "users": payload["user_count"],
    }


@pytest.mark.asyncio
async def test_list_department_risks_with_min_net_score(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    """Test that min_net_score filter returns only risks at or above the threshold."""
    # Create a test department
    dept = Department(name="Score Filter Dept", code="SCORE-FILTER")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)

    # Create two risks with different net_scores
    # Note: net_score is a stored column, not calculated from probability × impact
    risk_low = Risk(
        risk_id_code="RISK-LOW-SCORE",
        name="Low Score Risk Name",
        process="Low Score Risk",
        description="Risk with low net score",
        category="Test",
        department_id=dept.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=3,
        gross_score=6,
        net_probability=3,
        net_impact=3,
        net_score=9,  # Explicitly set < 10
        status=RiskStatusEnum.active.value,
    )
    risk_high = Risk(
        risk_id_code="RISK-HIGH-SCORE",
        name="High Score Risk Name",
        process="High Score Risk",
        description="Risk with high net score",
        category="Test",
        department_id=dept.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=4,
        gross_impact=4,
        gross_score=16,
        net_probability=3,
        net_impact=4,
        net_score=12,  # Explicitly set >= 10
        status=RiskStatusEnum.active.value,
    )
    db_session.add_all([risk_low, risk_high])
    await db_session.commit()
    await db_session.refresh(risk_low)
    await db_session.refresh(risk_high)

    # Request with min_net_score=10 → should only return high score risk
    response = await auth_client.get(f"/api/v1/departments/{dept.id}/risks?min_net_score=10")
    assert response.status_code == 200
    data = response.json()

    # Should only contain the high score risk
    assert len(data) == 1
    assert data[0]["risk_id_code"] == "RISK-HIGH-SCORE"
    assert data[0]["net_score"] >= 10


@pytest.mark.asyncio
async def test_department_detail_high_risk_count_uses_config_threshold(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    config = GlobalConfig(
        key="high_risk_min_net_score",
        value="12",
        value_type="int",
        category="risk_thresholds",
        display_name="High Risk Threshold",
    )
    dept = Department(name="Configured High Risk Dept", code="CFG-HIGH")
    db_session.add_all([config, dept])
    await db_session.commit()
    await db_session.refresh(dept)
    clear_config_cache()

    below_configured_high = Risk(
        risk_id_code="RISK-CONFIG-BELOW-HIGH",
        name="Below Configured High Risk",
        process="Configured threshold",
        description="Default-high but below configured-high",
        category="Test",
        department_id=dept.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=4,
        gross_impact=4,
        gross_score=16,
        net_probability=1,
        net_impact=11,
        net_score=11,
        status=RiskStatusEnum.active.value,
    )
    configured_high = Risk(
        risk_id_code="RISK-CONFIG-HIGH",
        name="Configured High Risk",
        process="Configured threshold",
        description="At configured high threshold",
        category="Test",
        department_id=dept.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=4,
        gross_impact=4,
        gross_score=16,
        net_probability=3,
        net_impact=4,
        net_score=12,
        status=RiskStatusEnum.active.value,
    )
    db_session.add_all([below_configured_high, configured_high])
    await db_session.commit()

    response = await auth_client.get(f"/api/v1/departments/{dept.id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["high_risk_count"] == 1
    assert payload["risk_distribution"]["high"] == 2


@pytest.mark.asyncio
async def test_departments_requires_departments_read_permission(
    client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
):
    role = Role(name="no_dept_read", display_name="No Dept Read", description="No departments:read")
    db_session.add(role)
    await db_session.commit()
    await db_session.refresh(role)

    user = User(
        name="No Dept Read User",
        email="nodeptread@test.com",
        department_id=test_department.id,
        role_id=role.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    resp = await client.get("/api/v1/departments", headers={"X-Mock-User-Id": str(user.id)})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_list_department_risks_without_min_net_score(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    """Test that without min_net_score, all active risks are returned."""
    # Create a test department
    dept = Department(name="No Filter Dept", code="NO-FILTER")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)

    # Create risks with various scores
    for i, score in enumerate([5, 10, 15]):
        risk = Risk(
            risk_id_code=f"RISK-SCORE-{score}",
            name=f"Risk Score {score} Name",
            process=f"Risk with score {score}",
            description=f"Test risk {i}",
            category="Test",
            department_id=dept.id,
            owner_id=test_user.id,
            risk_type="operational",
            gross_probability=3,
            gross_impact=3,
            net_probability=score // 5,
            net_impact=5,  # net_score = score
            status=RiskStatusEnum.active.value,
        )
        db_session.add(risk)
    await db_session.commit()

    # Request without min_net_score → should return all
    response = await auth_client.get(f"/api/v1/departments/{dept.id}/risks")
    assert response.status_code == 200
    data = response.json()

    # Should contain all 3 risks
    assert len(data) == 3


@pytest.mark.asyncio
async def test_list_department_risks_eager_loads_owner(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    """Regression: the endpoint must eager-load Risk.owner.

    risk_to_summary reads risk.owner.name. When the owner is a different user
    than the authenticated caller (so it is not already cached in the request
    session's identity map), an un-eager-loaded owner triggers a lazy load on
    the async session -> MissingGreenlet (HTTP 500), which the UI renders as
    "No risks found". The expunge() drops only the owner and risk so the
    endpoint must satisfy them from its own query (the production path), while
    the authenticated user stays cached so auth still resolves.
    """
    dept = Department(name="Owned Risk Dept", code="OWNED-RISK")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)

    owner = User(
        name="Risk Owner User",
        email="risk-owner-dept@test.example.com",
        department_id=dept.id,
        role_id=test_user.role_id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(owner)
    await db_session.commit()
    await db_session.refresh(owner)

    risk = Risk(
        risk_id_code="RISK-OWNED-001",
        name="Owned Risk Name",
        process="Owned Risk Process",
        description="Risk owned by a non-caller user",
        category="Test",
        department_id=dept.id,
        owner_id=owner.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=3,
        net_impact=3,
        status=RiskStatusEnum.active.value,
    )
    db_session.add(risk)
    await db_session.commit()
    db_session.expunge(owner)
    db_session.expunge(risk)

    response = await auth_client.get(f"/api/v1/departments/{dept.id}/risks")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["owner_name"] == "Risk Owner User"


@pytest.mark.asyncio
async def test_list_department_risks_pagination(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    """Test that pagination works correctly for department risks."""
    # Create a test department
    dept = Department(name="Pagination Dept", code="PAGINATE")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)

    # Create 5 risks
    for i in range(5):
        risk = Risk(
            risk_id_code=f"RISK-PAGE-{i:02d}",
            name=f"Page Test Risk {i} Name",
            process=f"Page Test Risk {i}",
            description=f"Risk for pagination test {i}",
            category="Test",
            department_id=dept.id,
            owner_id=test_user.id,
            risk_type="operational",
            gross_probability=2,
            gross_impact=2,
            net_probability=2,
            net_impact=2,
            status=RiskStatusEnum.active.value,
        )
        db_session.add(risk)
    await db_session.commit()

    # Request first page
    resp1 = await auth_client.get(f"/api/v1/departments/{dept.id}/risks?skip=0&limit=2")
    assert resp1.status_code == 200
    page1 = resp1.json()
    assert len(page1) == 2

    # Request second page
    resp2 = await auth_client.get(f"/api/v1/departments/{dept.id}/risks?skip=2&limit=2")
    assert resp2.status_code == 200
    page2 = resp2.json()
    assert len(page2) == 2

    # Ensure no overlap
    ids1 = {r["id"] for r in page1}
    ids2 = {r["id"] for r in page2}
    assert ids1.isdisjoint(ids2)


@pytest.mark.asyncio
async def test_list_department_risks_ignores_archived_kris_in_summary(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    dept = Department(name="Archived KRI Dept", code="ARCH-KRI-DEPT")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)

    risk = Risk(
        risk_id_code="R-DEPT-ARCH-KRI",
        name="Department Archived KRI Risk",
        process="Department Archived KRI",
        description="Department risk summary should ignore archived KRIs",
        category="Test",
        department_id=dept.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=2,
        net_probability=2,
        net_impact=2,
        status=RiskStatusEnum.active.value,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    db_session.add_all(
        [
            KeyRiskIndicator(
                risk_id=risk.id,
                metric_name="Department Active KRI",
                description="Active KRI",
                unit="%",
                current_value=10.0,
                lower_limit=0.0,
                upper_limit=20.0,
            ),
            KeyRiskIndicator(
                risk_id=risk.id,
                metric_name="Department Archived Breach",
                description="Archived KRI should not affect summary",
                unit="%",
                current_value=30.0,
                lower_limit=0.0,
                upper_limit=20.0,
                is_archived=True,
            ),
        ]
    )
    await db_session.commit()

    response = await auth_client.get(f"/api/v1/departments/{dept.id}/risks")
    assert response.status_code == 200
    payload = response.json()
    summary = next(item for item in payload if item["risk_id_code"] == "R-DEPT-ARCH-KRI")
    assert summary["kri_count"] == 1
    assert summary["has_breach"] is False


@pytest.mark.asyncio
async def test_list_department_kris_pagination_deterministic_no_overlap(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    """Department KRI pagination is deterministic and pages do not overlap."""
    dept = Department(name="KRI Pagination Dept", code="KRI-PAGINATE")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)

    risks: list[Risk] = []
    for i in range(4):
        risk = Risk(
            risk_id_code=f"KRI-PAGE-RISK-{i:02d}",
            name=f"KRI Page Risk {i} Name",
            process=f"KRI Page Risk {i}",
            description=f"KRI pagination risk {i}",
            category="Test",
            department_id=dept.id,
            owner_id=test_user.id,
            risk_type="operational",
            gross_probability=2,
            gross_impact=2,
            net_probability=2,
            net_impact=2,
            status=RiskStatusEnum.active.value,
        )
        db_session.add(risk)
        risks.append(risk)
    await db_session.commit()
    for risk in risks:
        await db_session.refresh(risk)

    for i, risk in enumerate(risks):
        db_session.add(
            KeyRiskIndicator(
                risk_id=risk.id,
                metric_name=f"KRI Page Metric {i}",
                description=f"KRI pagination metric {i}",
                current_value=float(i + 10),
                lower_limit=0.0,
                upper_limit=100.0,
                unit="%",
                frequency="monthly",
                reporting_owner_id=test_user.id,
            )
        )
    await db_session.commit()

    response = await auth_client.get(f"/api/v1/departments/{dept.id}/kris?skip=0&limit=2")
    assert response.status_code == 200
    page1 = response.json()
    assert page1["total"] == 4
    assert len(page1["items"]) == 2

    response = await auth_client.get(f"/api/v1/departments/{dept.id}/kris?skip=2&limit=2")
    assert response.status_code == 200
    page2 = response.json()
    assert page2["total"] == 4
    assert len(page2["items"]) == 2

    page1_ids = [item["id"] for item in page1["items"]]
    page2_ids = [item["id"] for item in page2["items"]]

    assert set(page1_ids).isdisjoint(set(page2_ids))
    assert page1_ids == sorted(page1_ids)
    assert page2_ids == sorted(page2_ids)
    assert max(page1_ids) < min(page2_ids)


@pytest.mark.asyncio
async def test_get_department_active_user_count(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    """Test that get_department returns only active user count."""
    # Create a test department
    dept = Department(name="User Count Dept", code="USER-COUNT")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)

    # Create 2 active users and 1 inactive user in that department
    users = [
        User(
            email="active1@test.local",
            name="Active 1",
            is_active=True,
            department_id=dept.id,
            role_id=test_user.role_id,
        ),
        User(
            email="active2@test.local",
            name="Active 2",
            is_active=True,
            department_id=dept.id,
            role_id=test_user.role_id,
        ),
        User(
            email="inactive1@test.local",
            name="Inactive 1",
            is_active=False,
            department_id=dept.id,
            role_id=test_user.role_id,
        ),
    ]
    db_session.add_all(users)
    await db_session.commit()

    # Request department details
    response = await auth_client.get(f"/api/v1/departments/{dept.id}")
    assert response.status_code == 200
    data = response.json()

    # user_count should only be 2 (active ones)
    assert data["user_count"] == 2


@pytest.mark.asyncio
async def test_department_detail_control_stats_exclude_archived_normalized_controls(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    dept = Department(name="Control Stats Archive Dept", code="CTRL-STATS-ARCH")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)

    live_control = Control(
        name="Department Live Active Control",
        description="Live active control included in department stats",
        department_id=dept.id,
        control_owner_id=test_user.id,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status="active",
        is_archived=False,
    )
    archived_control = Control(
        name="Department Archived Normalized Active Control",
        description="Archived control normalized to active lifecycle status",
        department_id=dept.id,
        control_owner_id=test_user.id,
        control_form="automatic",
        frequency="daily",
        risk_level=3,
        status="active",
        is_archived=True,
    )
    db_session.add_all([live_control, archived_control])
    await db_session.commit()

    response = await auth_client.get(f"/api/v1/departments/{dept.id}")

    assert response.status_code == 200
    data = response.json()
    assert data["control_count"] == 1
    assert data["control_stats"]["total"] == 1
    assert data["control_stats"]["active"] == 1
    assert data["control_stats"]["by_form"] == {"manual": 1}
    assert data["control_stats"]["by_frequency"] == {"monthly": 1}


@pytest.mark.asyncio
async def test_list_department_controls_normalizes_legacy_semi_annual_frequency(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
):
    """Department controls endpoint should normalize legacy semi-annual frequency aliases."""
    control = Control(
        name="Department Legacy Frequency Control",
        description="Control with legacy frequency alias",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        control_form="manual",
        frequency="semi-annual",
        risk_level=3,
        status="active",
    )
    db_session.add(control)
    await db_session.commit()
    await db_session.refresh(control)

    response = await auth_client.get(f"/api/v1/departments/{test_department.id}/controls")
    assert response.status_code == 200
    data = response.json()

    item = next((entry for entry in data if entry["id"] == control.id), None)
    assert item is not None
    assert item["frequency"] == "semi-annually"
