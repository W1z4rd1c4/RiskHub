"""
Tests for Dashboard API endpoints.
"""

from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select

from app.models import (
    Control,
    ControlExecution,
    Department,
    GlobalConfig,
    KeyRiskIndicator,
    KRIValueHistory,
    Permission,
    Risk,
    Role,
    RolePermission,
    User,
    Vendor,
)
from app.models.global_config import clear_config_cache
from app.models.user import AccessScope


def _quarter_start(dt: datetime) -> datetime:
    return datetime(dt.year, ((dt.month - 1) // 3) * 3 + 1, 1, tzinfo=UTC)


def _shift_quarter(start: datetime, offset: int) -> datetime:
    quarter_index = start.year * 4 + ((start.month - 1) // 3) + offset
    year = quarter_index // 4
    quarter = quarter_index % 4
    return datetime(year, quarter * 3 + 1, 1, tzinfo=UTC)


def _quarter_label(start: datetime) -> str:
    return f"{start.year}-Q{((start.month - 1) // 3) + 1}"


async def _create_department_metric_records(
    db_session,
    *,
    department_id: int,
    user_id: int,
    suffix: str,
) -> None:
    control = Control(
        name=f"Dashboard Authz Control {suffix}",
        description="Live active control for dashboard authz aggregate coverage",
        department_id=department_id,
        control_owner_id=user_id,
        status="active",
        is_archived=False,
    )
    risk = Risk(
        risk_id_code=f"DASH-AUTHZ-RISK-{suffix}",
        name=f"Dashboard Authz Risk {suffix}",
        process="Dashboard authz",
        description="Risk metric that remains visible on mixed dashboard surfaces",
        category="Test",
        department_id=department_id,
        owner_id=user_id,
        status="active",
    )
    db_session.add_all([control, risk])
    await db_session.flush()
    db_session.add_all(
        [
            ControlExecution(
                control_id=control.id,
                executed_by_id=user_id,
                result="passed",
                executed_at=datetime(2026, 5, 20, 12, 0, tzinfo=UTC),
            ),
            KeyRiskIndicator(
                risk_id=risk.id,
                metric_name=f"Dashboard Authz KRI {suffix}",
                description="KRI metric that remains visible on mixed dashboard surfaces",
                unit="%",
                current_value=120.0,
                lower_limit=0.0,
                upper_limit=100.0,
                frequency="quarterly",
                is_archived=False,
            ),
        ]
    )
    await db_session.commit()


@pytest.mark.asyncio
async def test_dashboard_summary(auth_client: AsyncClient):
    """Test the dashboard summary endpoint."""
    response = await auth_client.get("/api/v1/dashboard/summary")

    assert response.status_code == 200
    data = response.json()
    assert "total_controls" in data
    assert "total_risks" in data


@pytest.mark.asyncio
async def test_dashboard_summary_active_control_status_excludes_archived_normalized_controls(
    auth_client: AsyncClient,
    db_session,
    test_department: Department,
    test_user: User,
):
    before_response = await auth_client.get("/api/v1/dashboard/summary?control_status=active")
    assert before_response.status_code == 200
    before_total = before_response.json()["total_controls"]

    live_control = Control(
        name="Dashboard Active Live Control",
        description="Live active control counted in active dashboard filter",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        status="active",
        is_archived=False,
    )
    archived_control = Control(
        name="Dashboard Archived Normalized Active Control",
        description="Archived control normalized to active lifecycle status",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        status="active",
        is_archived=True,
    )
    db_session.add_all([live_control, archived_control])
    await db_session.commit()

    response = await auth_client.get("/api/v1/dashboard/summary?control_status=active")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_controls"] == before_total + 1


@pytest.mark.asyncio
async def test_dashboard_summary_risk_level_and_critical_count_use_configured_thresholds(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    seed_risk_types,
):
    config = GlobalConfig(
        key="critical_risk_min_net_score",
        value="20",
        value_type="int",
        category="risk_thresholds",
        display_name="Critical Risk Threshold",
    )
    dept = Department(name="Dashboard Summary Critical Threshold Dept", code="DASH-SUM-CRIT", is_system=True)
    db_session.add_all([config, dept])
    await db_session.commit()
    await db_session.refresh(dept)
    clear_config_cache()

    default_critical_only = Risk(
        risk_id_code="DASH-SUM-RISK-DEFAULT-CRIT",
        name="Dashboard Summary Default Critical Only",
        process="Dashboard configured threshold",
        description="Critical under defaults but not configured threshold",
        category="Test",
        department_id=dept.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=4,
        gross_impact=4,
        gross_score=16,
        net_probability=4,
        net_impact=4,
        net_score=16,
        status="active",
    )
    configured_critical = Risk(
        risk_id_code="DASH-SUM-RISK-CONFIG-CRIT",
        name="Dashboard Summary Configured Critical",
        process="Dashboard configured threshold",
        description="Critical at configured threshold",
        category="Test",
        department_id=dept.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=4,
        gross_impact=5,
        gross_score=20,
        net_probability=4,
        net_impact=5,
        net_score=20,
        status="active",
    )
    db_session.add_all([default_critical_only, configured_critical])
    await db_session.commit()

    try:
        response = await auth_client.get(f"/api/v1/dashboard/summary?department_id={dept.id}&risk_level=critical")

        assert response.status_code == 200
        payload = response.json()
        assert payload["total_risks"] == 1
        assert payload["critical_risks_count"] == 1
    finally:
        clear_config_cache()


@pytest.mark.asyncio
async def test_dashboard_overview_returns_backend_capabilities(client_cro: AsyncClient):
    """Overview capabilities mirror backend dashboard/report access decisions."""
    response = await client_cro.get("/api/v1/dashboard/overview")

    assert response.status_code == 200
    capabilities = response.json()["capabilities"]
    assert capabilities["can_read"] is True
    assert capabilities["can_view_issue_metrics"] is True
    assert capabilities["can_view_committee"] is True
    assert capabilities["can_use_department_filter"] is True
    assert capabilities["can_export_or_report"] is True


@pytest.mark.asyncio
async def test_dashboard_overview_cache_key_tracks_permission_changes(
    client: AsyncClient,
    db_session,
    test_user_employee: User,
    test_role_employee: Role,
):
    issues_read = Permission(resource="issues", action="read", description="Read issues")
    db_session.add(issues_read)
    await db_session.commit()
    await db_session.refresh(issues_read)
    db_session.add(RolePermission(role_id=test_role_employee.id, permission_id=issues_read.id))
    await db_session.commit()
    db_session.expire(test_role_employee, ["permissions"])

    headers = {"X-Mock-User-Id": str(test_user_employee.id)}
    first_response = await client.get("/api/v1/dashboard/overview", headers=headers)

    assert first_response.status_code == 200
    first_payload = first_response.json()
    assert first_payload["capabilities"]["can_view_issue_metrics"] is True
    assert first_payload["capabilities"]["can_export_or_report"] is True

    report_permission_id = (
        await db_session.execute(
            select(Permission.id).where(Permission.resource == "reports", Permission.action == "read")
        )
    ).scalar_one()
    await db_session.execute(
        delete(RolePermission).where(
            RolePermission.role_id == test_role_employee.id,
            RolePermission.permission_id.in_([issues_read.id, report_permission_id]),
        )
    )
    await db_session.commit()
    db_session.expire(test_role_employee, ["permissions"])

    second_response = await client.get("/api/v1/dashboard/overview", headers=headers)

    assert second_response.status_code == 200
    second_payload = second_response.json()
    assert second_payload["capabilities"]["can_view_issue_metrics"] is False
    assert second_payload["capabilities"]["can_export_or_report"] is False
    assert second_payload["issue_summary"] is None
    assert second_payload["issue_aging"] is None
    assert second_payload["issue_severity"] is None


@pytest.mark.asyncio
async def test_risk_distribution(auth_client: AsyncClient):
    """Test the risk distribution endpoint."""
    response = await auth_client.get("/api/v1/dashboard/risk-distribution")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_risk_distribution_risk_level_filter_uses_configured_thresholds(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    seed_risk_types,
):
    config = GlobalConfig(
        key="critical_risk_min_net_score",
        value="12",
        value_type="int",
        category="risk_thresholds",
        display_name="Critical Risk Threshold",
    )
    dept = Department(name="Dashboard Matrix Critical Threshold Dept", code="DASH-MATRIX-CRIT", is_system=True)
    db_session.add_all([config, dept])
    await db_session.commit()
    await db_session.refresh(dept)
    clear_config_cache()

    configured_critical = Risk(
        risk_id_code="DASH-MATRIX-RISK-CONFIG-CRIT",
        name="Dashboard Matrix Configured Critical",
        process="Dashboard configured threshold",
        description="Critical under configured threshold",
        category="Test",
        department_id=dept.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=4,
        gross_score=12,
        net_probability=3,
        net_impact=4,
        net_score=12,
        status="active",
    )
    configured_high = Risk(
        risk_id_code="DASH-MATRIX-RISK-CONFIG-HIGH",
        name="Dashboard Matrix Configured High",
        process="Dashboard configured threshold",
        description="Below configured critical threshold",
        category="Test",
        department_id=dept.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=5,
        gross_score=10,
        net_probability=2,
        net_impact=5,
        net_score=10,
        status="active",
    )
    db_session.add_all([configured_critical, configured_high])
    await db_session.commit()

    try:
        response = await auth_client.get(
            f"/api/v1/dashboard/risk-distribution?department_id={dept.id}&risk_level=critical"
        )

        assert response.status_code == 200
        distribution = response.json()["distribution"]
        assert sum(item["count"] for item in distribution) == 1
        assert distribution[0]["probability"] == 3
        assert distribution[0]["impact"] == 4
    finally:
        clear_config_cache()


@pytest.mark.asyncio
async def test_departments(auth_client: AsyncClient):
    """Test the departments endpoint."""
    response = await auth_client.get("/api/v1/dashboard/departments")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_dashboard_departments_high_risk_count_uses_config_threshold(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    seed_risk_types,
):
    config = GlobalConfig(
        key="high_risk_min_net_score",
        value="12",
        value_type="int",
        category="risk_thresholds",
        display_name="High Risk Threshold",
    )
    dept = Department(name="Dashboard Configured High Risk Dept", code="DASH-HIGH-CFG", is_system=True)
    db_session.add_all([config, dept])
    await db_session.commit()
    await db_session.refresh(dept)
    clear_config_cache()

    below_configured_high = Risk(
        risk_id_code="DASH-RISK-CONFIG-BELOW-HIGH",
        name="Dashboard Below Configured High Risk",
        process="Dashboard configured threshold",
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
        status="active",
    )
    configured_high = Risk(
        risk_id_code="DASH-RISK-CONFIG-HIGH",
        name="Dashboard Configured High Risk",
        process="Dashboard configured threshold",
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
        status="active",
    )
    db_session.add_all([below_configured_high, configured_high])
    await db_session.commit()

    try:
        response = await auth_client.get(f"/api/v1/dashboard/departments?department_id={dept.id}")

        assert response.status_code == 200
        payload = response.json()
        assert len(payload) == 1
        assert payload[0]["department_id"] == dept.id
        assert payload[0]["high_risk_count"] == 1
    finally:
        clear_config_cache()


@pytest.mark.asyncio
async def test_control_trends_empty_dept_ids_returns_empty(
    client: AsyncClient,
    db_session,
    test_role_employee,
    monkeypatch,
):
    """
    Users with empty department scope (dept_ids=[]) should get empty control-trends.
    This tests the fix for the security issue where empty list was truthy-bypassed.
    """
    from app.models import Department, User

    # Create a department first (required for FK)
    dept = Department(name="Test Dept for Empty Scope", code="TEST-EMPTY")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)

    # Create a user with NO department (will get dept_ids=[])
    user_no_dept = User(
        name="No Department User",
        email="nodept@example.com",
        role_id=test_role_employee.id,
        department_id=None,  # No department assigned
        is_active=True,
    )
    db_session.add(user_no_dept)
    await db_session.commit()
    await db_session.refresh(user_no_dept)

    # Make request as this user (mock auth)
    response = await client.get("/api/v1/dashboard/control-trends", headers={"X-Mock-User-Id": str(user_no_dept.id)})

    assert response.status_code == 200
    data = response.json()
    # Should be empty list, not all data
    assert data == []


@pytest.mark.asyncio
async def test_departments_filtering_inactive(
    client: AsyncClient,
    db_session,
    test_role: Role,
):
    """Test that departments with no active users (and not system) are filtered out."""
    from app.models import Department, User

    # 1. Create a system department (should STAY visible)
    system_dept = Department(name="System Dept", code="SYS-1", is_system=True)

    # 2. Create a department with an active user (should STAY visible)
    active_dept = Department(name="Active Dept", code="ACT-1", is_system=False)

    # 3. Create a department with NO users (should be HIDDEN)
    inactive_dept = Department(name="Inactive Dept", code="INA-1", is_system=False)

    db_session.add_all([system_dept, active_dept, inactive_dept])
    await db_session.commit()
    await db_session.refresh(system_dept)
    await db_session.refresh(active_dept)

    # Add active user to active_dept
    active_user = User(
        name="Active User",
        email="active.user.dept@example.com",
        role_id=test_role.id,
        department_id=active_dept.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    db_session.add(active_user)

    # Add an ADMIN user for the request (global scope)
    admin_user = User(
        name="Global Admin",
        email="global.admin@example.com",
        role_id=test_role.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    db_session.add(admin_user)
    await db_session.commit()

    # Request dashboard departments as admin
    response = await client.get("/api/v1/dashboard/departments", headers={"X-Mock-User-Id": str(admin_user.id)})

    assert response.status_code == 200
    data = response.json()

    dept_names = [d["department_name"] for d in data]

    assert "System Dept" in dept_names
    assert "Active Dept" in dept_names
    assert "Inactive Dept" not in dept_names


@pytest.mark.asyncio
async def test_risk_trends(auth_client: AsyncClient):
    """Test the risk trends endpoint returns 200 and valid structure."""
    response = await auth_client.get("/api/v1/dashboard/risk-trends")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    # Each item should have period, total_new, critical_new
    for item in data:
        assert "period" in item
        assert "total_new" in item
        assert "critical_new" in item


@pytest.mark.asyncio
async def test_kri_breach_trends(auth_client: AsyncClient):
    """Test the KRI breach trends endpoint returns 200 and valid structure."""
    response = await auth_client.get("/api/v1/dashboard/kri-breach-trends")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    # Each item should have period, total_entries, breached_entries
    for item in data:
        assert "period" in item
        assert "total_entries" in item
        assert "breached_entries" in item


@pytest.mark.asyncio
async def test_control_trends(auth_client: AsyncClient):
    """Test the control trends endpoint returns 200 and valid structure."""
    response = await auth_client.get("/api/v1/dashboard/control-trends")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    # Each item should have period and execution_count
    for item in data:
        assert "period" in item
        assert "execution_count" in item


@pytest.mark.asyncio
async def test_control_trends_active_status_excludes_archived_normalized_controls(
    auth_client: AsyncClient,
    db_session,
    test_department: Department,
    test_user: User,
):
    live_control = Control(
        name="Dashboard Trend Live Active Control",
        description="Live active control with execution history",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        status="active",
        is_archived=False,
    )
    archived_control = Control(
        name="Dashboard Trend Archived Active Control",
        description="Archived control normalized to active lifecycle status",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        status="active",
        is_archived=True,
    )
    db_session.add_all([live_control, archived_control])
    await db_session.flush()
    db_session.add_all(
        [
            ControlExecution(
                control_id=live_control.id,
                executed_by_id=test_user.id,
                result="passed",
                executed_at=datetime(2026, 4, 20, 12, 0, tzinfo=UTC),
            ),
            ControlExecution(
                control_id=archived_control.id,
                executed_by_id=test_user.id,
                result="passed",
                executed_at=datetime(2026, 4, 20, 13, 0, tzinfo=UTC),
            ),
        ]
    )
    await db_session.commit()

    response = await auth_client.get(
        f"/api/v1/dashboard/control-trends?department_id={test_department.id}&control_status=active"
    )

    assert response.status_code == 200
    assert sum(item["execution_count"] for item in response.json()) == 1


@pytest.mark.asyncio
async def test_control_trends_sqlite_week_label_has_unquoted_week_marker(
    auth_client: AsyncClient,
    db_session,
    test_department: Department,
    test_user: User,
):
    control = Control(
        name="Week Label Control",
        description="Control with deterministic execution week",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        status="active",
    )
    db_session.add(control)
    await db_session.flush()
    db_session.add(
        ControlExecution(
            control_id=control.id,
            executed_by_id=test_user.id,
            result="passed",
            executed_at=datetime(2026, 4, 20, 12, 0, tzinfo=UTC),
        )
    )
    await db_session.commit()

    response = await auth_client.get("/api/v1/dashboard/control-trends")

    assert response.status_code == 200
    periods = {item["period"] for item in response.json()}
    assert "2026-W16" in periods
    assert all('"' not in period for period in periods)


@pytest.mark.asyncio
async def test_dashboard_actor_visible_metrics_include_cross_department_exceptions(
    client_employee: AsyncClient,
    db_session,
    test_user_employee: User,
):
    second_department = Department(name="Dashboard Finance", code="DASH-FIN")
    db_session.add(second_department)
    await db_session.commit()
    await db_session.refresh(second_department)

    summary_before_response = await client_employee.get("/api/v1/dashboard/summary")

    assert summary_before_response.status_code == 200
    summary_before = summary_before_response.json()

    risk = Risk(
        risk_id_code="DASH-VISIBLE-R-001",
        name="Dashboard Visible Cross Dept Risk",
        process="Finance",
        description="Visible through direct ownership",
        category="Operational",
        department_id=second_department.id,
        owner_id=test_user_employee.id,
        risk_type="operational",
        gross_probability=5,
        gross_impact=5,
        net_probability=5,
        net_impact=5,
        status="active",
    )
    control = Control(
        name="Dashboard Visible Cross Dept Control",
        description="Visible through control ownership",
        department_id=second_department.id,
        control_owner_id=test_user_employee.id,
        status="active",
    )
    vendor = Vendor(
        name="Dashboard Visible Cross Dept Vendor",
        process="IT",
        department_id=second_department.id,
        outsourcing_owner_user_id=test_user_employee.id,
        vendor_type="ict",
        risk_score_1_5=4,
        status="active",
    )
    db_session.add_all([risk, control, vendor])
    await db_session.flush()
    kri = KeyRiskIndicator(
        risk_id=risk.id,
        metric_name="Dashboard Visible Cross Dept KRI",
        description="Visible through parent risk ownership",
        unit="%",
        current_value=120.0,
        lower_limit=0.0,
        upper_limit=100.0,
        frequency="quarterly",
        is_archived=False,
    )
    db_session.add_all(
        [
            kri,
            ControlExecution(
                control_id=control.id,
                executed_by_id=test_user_employee.id,
                result="passed",
                executed_at=datetime.now(UTC),
            ),
        ]
    )
    await db_session.flush()
    db_session.add(
        KRIValueHistory(
            kri_id=kri.id,
            value=120.0,
            lower_limit=0.0,
            upper_limit=100.0,
            unit="%",
            breach_status="above",
            period_start=date(2026, 1, 1),
            period_end=datetime.now(UTC).date(),
            recorded_at=datetime.now(UTC),
        )
    )
    await db_session.commit()

    summary_response = await client_employee.get("/api/v1/dashboard/summary")
    risk_distribution_response = await client_employee.get(
        "/api/v1/dashboard/risk-distribution?probability=5&impact=5"
    )
    risk_drilldown_response = await client_employee.get("/api/v1/dashboard/risks-by-cell?probability=5&impact=5")
    kri_trends_response = await client_employee.get("/api/v1/dashboard/kri-breach-trends")

    assert summary_response.status_code == 200
    summary = summary_response.json()
    assert summary["total_risks"] == summary_before["total_risks"] + 1
    assert summary["total_controls"] == summary_before["total_controls"] + 1
    assert summary["total_vendors"] == summary_before["total_vendors"] + 1

    assert risk_distribution_response.status_code == 200
    assert any(item["count"] >= 1 for item in risk_distribution_response.json()["distribution"])

    assert risk_drilldown_response.status_code == 200
    assert "Dashboard Visible Cross Dept Risk" in {item["name"] for item in risk_drilldown_response.json()}

    assert kri_trends_response.status_code == 200
    assert any(item["breached_entries"] >= 1 for item in kri_trends_response.json())


@pytest.mark.asyncio
async def test_dashboard_explicit_department_filter_excludes_cross_department_owner_exception(
    client_employee: AsyncClient,
    db_session,
    test_department: Department,
    test_user_employee: User,
):
    second_department = Department(name="Dashboard Strict Finance", code="DASH-STRICT-FIN")
    db_session.add(second_department)
    await db_session.commit()
    await db_session.refresh(second_department)

    risk = Risk(
        risk_id_code="DASH-STRICT-FILTER-R-001",
        name="Dashboard Strict Filter Cross Dept Risk",
        process="Finance",
        description="Owned but outside requested department",
        category="Operational",
        department_id=second_department.id,
        owner_id=test_user_employee.id,
        risk_type="operational",
        gross_probability=5,
        gross_impact=5,
        net_probability=5,
        net_impact=5,
        status="active",
    )
    db_session.add(risk)
    await db_session.commit()

    response = await client_employee.get(
        f"/api/v1/dashboard/risks-by-cell?probability=5&impact=5&department_id={test_department.id}"
    )

    assert response.status_code == 200
    assert "Dashboard Strict Filter Cross Dept Risk" not in {item["name"] for item in response.json()}


@pytest.mark.asyncio
async def test_committee_endpoints_denied_for_employee(client_employee: AsyncClient):
    """Employees must not access Risk Committee endpoints."""
    resp_summary = await client_employee.get("/api/v1/dashboard/committee-summary")
    assert resp_summary.status_code == 403

    resp_quarterly = await client_employee.get("/api/v1/dashboard/quarterly-comparison")
    assert resp_quarterly.status_code == 403


@pytest.mark.asyncio
async def test_committee_endpoints_denied_for_admin(auth_client: AsyncClient):
    """Admin is console-only and must not access Risk Committee endpoints."""
    resp_summary = await auth_client.get("/api/v1/dashboard/committee-summary")
    assert resp_summary.status_code == 403

    resp_quarterly = await auth_client.get("/api/v1/dashboard/quarterly-comparison")
    assert resp_quarterly.status_code == 403


@pytest.mark.asyncio
async def test_committee_summary_scoped_for_department_head(client: AsyncClient, db_session):
    """Department Heads can access committee summary, but only for their department."""
    from app.models import ActivityLog, Risk, User
    from app.models.risk import RiskStatus

    dept_a = Department(name="Dept A", code="D-A")
    dept_b = Department(name="Dept B", code="D-B")
    db_session.add_all([dept_a, dept_b])
    await db_session.commit()
    await db_session.refresh(dept_a)
    await db_session.refresh(dept_b)

    role = Role(name="department_head", display_name="Department Head", description="Dept head")
    db_session.add(role)
    await db_session.commit()
    await db_session.refresh(role)

    perm = Permission(resource="risks", action="read", description="Read risks")
    db_session.add(perm)
    await db_session.commit()
    await db_session.refresh(perm)
    db_session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    await db_session.commit()
    db_session.expire(role, ["permissions"])

    dept_head = User(
        name="Dept Head",
        email="dept.head@example.com",
        role_id=role.id,
        department_id=dept_a.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(dept_head)
    await db_session.commit()
    await db_session.refresh(dept_head)

    risk_a = Risk(
        risk_id_code="A-001",
        name="Risk A",
        process="Proc",
        category="Cat",
        description="Desc",
        department_id=dept_a.id,
        risk_type="operational",
        gross_probability=1,
        gross_impact=1,
        net_probability=1,
        net_impact=1,
        status=RiskStatus.active.value,
        created_at=datetime.now(UTC) - timedelta(days=1),
    )
    risk_b = Risk(
        risk_id_code="B-001",
        name="Risk B",
        process="Proc",
        category="Cat",
        description="Desc",
        department_id=dept_b.id,
        risk_type="operational",
        gross_probability=1,
        gross_impact=1,
        net_probability=1,
        net_impact=1,
        status=RiskStatus.active.value,
        created_at=datetime.now(UTC) - timedelta(days=1),
    )
    db_session.add_all([risk_a, risk_b])
    await db_session.commit()

    # Activity logs in both departments; dept head should only see Dept A logs.
    log_a = ActivityLog(
        entity_type="risk",
        entity_id=1,
        entity_name="Risk A",
        action="create",
        actor_id=dept_head.id,
        actor_name=dept_head.name,
        department_id=dept_a.id,
        changes=None,
        description="Created risk A",
        created_at=datetime.now(UTC) - timedelta(days=2),
    )
    log_b = ActivityLog(
        entity_type="risk",
        entity_id=2,
        entity_name="Risk B",
        action="create",
        actor_id=dept_head.id,
        actor_name=dept_head.name,
        department_id=dept_b.id,
        changes=None,
        description="Created risk B",
        created_at=datetime.now(UTC) - timedelta(days=2),
    )
    db_session.add_all([log_a, log_b])
    await db_session.commit()

    response = await client.get(
        "/api/v1/dashboard/committee-summary",
        headers={"X-Mock-User-Id": str(dept_head.id)},
    )
    assert response.status_code == 200
    payload = response.json()

    assert payload["department_exposure"]
    assert all(d["id"] == dept_a.id for d in payload["department_exposure"])

    assert payload["critical_risks"]
    assert all(r["department_name"] == dept_a.name for r in payload["critical_risks"])

    assert payload["recent_activity"]
    assert all(a["description"] == "Created risk A" for a in payload["recent_activity"])


@pytest.mark.asyncio
async def test_committee_core_excludes_archived_normalized_active_risks(
    db_session,
    test_department: Department,
):
    """Committee risk rollups must not count archived risks normalized to active status."""
    from app.models.risk import RiskStatus
    from app.services._dashboard_metrics.committee_projection import fetch_committee_core

    live_risk = Risk(
        risk_id_code="DASH-LIVE-001",
        name="Dashboard Live Risk",
        process="Dashboard",
        category="Operational",
        description="Live risk should remain in committee rollups.",
        department_id=test_department.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=2,
        gross_score=4,
        net_probability=2,
        net_impact=2,
        net_score=4,
        status=RiskStatus.active.value,
        is_archived=False,
    )
    archived_risk = Risk(
        risk_id_code="DASH-ARCH-001",
        name="Dashboard Archived Risk",
        process="Dashboard",
        category="Operational",
        description="Archived risk should stay out of active committee rollups.",
        department_id=test_department.id,
        risk_type="operational",
        gross_probability=5,
        gross_impact=5,
        gross_score=25,
        net_probability=5,
        net_impact=5,
        net_score=25,
        status=RiskStatus.active.value,
        is_archived=True,
    )
    db_session.add_all([live_risk, archived_risk])
    await db_session.commit()

    critical_risks, _recent_activity, department_exposure = await fetch_committee_core(
        db_session,
        dept_ids=[test_department.id],
    )

    critical_ids = {risk.id for risk in critical_risks}
    assert live_risk.id in critical_ids
    assert archived_risk.id not in critical_ids

    exposure = next(row for row in department_exposure if row.id == test_department.id)
    assert exposure.risk_count == 1
    assert exposure.total_exposure == live_risk.net_score


@pytest.mark.asyncio
async def test_committee_critical_vendors_excludes_archived_normalized_active_vendors(
    db_session,
    test_department: Department,
    test_user: User,
):
    """Committee vendor rollups must use archive truth, not lifecycle status alone."""
    from app.models.vendor import VendorType
    from app.services._dashboard_metrics.committee_projection import fetch_vendor_sections

    live_vendor = Vendor(
        name="Committee Live Critical Vendor",
        process="Dashboard",
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user.id,
        vendor_type=VendorType.ict.value,
        risk_score_1_5=4,
        is_archived=False,
    )
    archived_vendor = Vendor(
        name="Committee Archived Critical Vendor",
        process="Dashboard",
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user.id,
        vendor_type=VendorType.ict.value,
        risk_score_1_5=5,
        is_archived=True,
    )
    db_session.add_all([live_vendor, archived_vendor])
    await db_session.commit()

    sections = await fetch_vendor_sections(db_session, current_user=test_user, can_read_vendors=True)

    critical_vendor_ids = {vendor.id for vendor in sections["critical_vendors"]}
    assert live_vendor.id in critical_vendor_ids
    assert archived_vendor.id not in critical_vendor_ids


@pytest.mark.asyncio
async def test_department_active_control_count_excludes_archived_normalized_controls(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
):
    """Department compliance rate must not treat archived controls as active controls."""
    live_control = Control(
        name="Dashboard Live Control",
        description="Live control for department active count",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status="active",
        is_archived=False,
    )
    archived_control = Control(
        name="Dashboard Archived Control",
        description="Archived control normalized to active lifecycle status",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status="active",
        is_archived=True,
    )
    db_session.add_all([live_control, archived_control])
    await db_session.commit()

    response = await auth_client.get(f"/api/v1/dashboard/departments?department_id={test_department.id}")

    assert response.status_code == 200
    metrics = next(item for item in response.json() if item["department_id"] == test_department.id)
    assert metrics["control_count"] == 1
    assert metrics["compliance_rate"] == 1.0


@pytest.mark.asyncio
async def test_department_dashboard_metrics_zero_control_aggregates_without_controls_read(
    client_department_head: AsyncClient,
    client_factory,
    db_session,
    test_department: Department,
    test_user: User,
    test_user_department_head: User,
):
    await _create_department_metric_records(
        db_session,
        department_id=test_department.id,
        user_id=test_user_department_head.id,
        suffix="DEPT",
    )

    response = await client_department_head.get(
        f"/api/v1/dashboard/departments?department_id={test_department.id}"
    )

    assert response.status_code == 200
    metrics = next(item for item in response.json() if item["department_id"] == test_department.id)
    assert metrics["risk_count"] == 1
    assert metrics["total_kri_count"] == 1
    assert metrics["breaching_kri_count"] == 1
    assert metrics["control_count"] == 0
    assert metrics["audited_control_count"] == 0
    assert metrics["compliance_rate"] == 0.0

    async with client_factory(current_user=test_user) as controls_readable_client:
        controls_readable_response = await controls_readable_client.get(
            f"/api/v1/dashboard/departments?department_id={test_department.id}"
        )

    assert controls_readable_response.status_code == 200
    controls_readable_metrics = next(
        item for item in controls_readable_response.json() if item["department_id"] == test_department.id
    )
    assert controls_readable_metrics["control_count"] == 1
    assert controls_readable_metrics["audited_control_count"] == 1
    assert controls_readable_metrics["compliance_rate"] == 1.0


@pytest.mark.asyncio
async def test_overview_department_metrics_zero_control_aggregates_without_controls_read(
    client_department_head: AsyncClient,
    db_session,
    test_department: Department,
    test_user_department_head: User,
):
    from app.api.v1.endpoints.dashboard.overview import DASHBOARD_OVERVIEW_CACHE

    DASHBOARD_OVERVIEW_CACHE.clear()
    await _create_department_metric_records(
        db_session,
        department_id=test_department.id,
        user_id=test_user_department_head.id,
        suffix="OVERVIEW",
    )

    try:
        response = await client_department_head.get(
            f"/api/v1/dashboard/overview?department_id={test_department.id}"
        )

        assert response.status_code == 200
        metrics = next(
            item for item in response.json()["department_metrics"] if item["department_id"] == test_department.id
        )
        assert metrics["risk_count"] == 1
        assert metrics["total_kri_count"] == 1
        assert metrics["breaching_kri_count"] == 1
        assert metrics["control_count"] == 0
        assert metrics["audited_control_count"] == 0
        assert metrics["compliance_rate"] == 0.0
    finally:
        DASHBOARD_OVERVIEW_CACHE.clear()


@pytest.mark.asyncio
async def test_quarterly_unaudited_controls_excludes_archived_normalized_controls(
    db_session,
    test_user: User,
    test_department: Department,
):
    """Quarterly unaudited-control metric must ignore archived active-status controls."""
    from app.services._quarterly_comparison.period_metrics import get_quarter_period_metrics

    archived_control = Control(
        name="Quarterly Archived Control",
        description="Archived control normalized to active lifecycle status",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status="active",
        is_archived=True,
    )
    db_session.add(archived_control)
    await db_session.commit()

    metrics = await get_quarter_period_metrics(
        db_session,
        datetime(2026, 4, 1, tzinfo=UTC),
        datetime(2026, 7, 1, tzinfo=UTC),
        [test_department.id],
    )

    assert metrics["unaudited_controls"] == 0


@pytest.mark.asyncio
async def test_snapshot_risks_without_kri_excludes_archived_normalized_risks(
    db_session,
    test_user: User,
    test_department: Department,
):
    """Snapshot KRI gaps must count only live active risks."""
    from app.core._snapshot_metrics.kri import count_risks_without_kri

    live_risk = Risk(
        risk_id_code="R-SNAP-LIVE-NO-KRI",
        name="Snapshot live no KRI",
        process="Snapshot metrics",
        description="Live active risk without KRI",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        category="Operations",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
        is_archived=False,
    )
    archived_risk = Risk(
        risk_id_code="R-SNAP-ARCH-NO-KRI",
        name="Snapshot archived no KRI",
        process="Snapshot metrics",
        description="Archived normalized active risk without KRI",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        category="Operations",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status="active",
        is_archived=True,
    )
    db_session.add_all([live_risk, archived_risk])
    await db_session.commit()

    count = await count_risks_without_kri(db_session, [test_department.id])

    assert count == 1


@pytest.mark.asyncio
async def test_risk_trends_critical_new_uses_configured_thresholds(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    seed_risk_types,
):
    config = GlobalConfig(
        key="critical_risk_min_net_score",
        value="20",
        value_type="int",
        category="risk_thresholds",
        display_name="Critical Risk Threshold",
    )
    dept = Department(name="Dashboard Trend Critical Threshold Dept", code="DASH-TREND-CRIT", is_system=True)
    db_session.add_all([config, dept])
    await db_session.commit()
    await db_session.refresh(dept)
    clear_config_cache()

    default_critical_only = Risk(
        risk_id_code="DASH-TREND-RISK-DEFAULT-CRIT",
        name="Dashboard Trend Default Critical Only",
        process="Dashboard configured threshold",
        description="Critical under defaults but not configured threshold",
        category="Test",
        department_id=dept.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=4,
        gross_impact=4,
        gross_score=16,
        net_probability=4,
        net_impact=4,
        net_score=16,
        status="active",
        created_at=datetime(2026, 4, 20, 12, 0, tzinfo=UTC),
    )
    configured_critical = Risk(
        risk_id_code="DASH-TREND-RISK-CONFIG-CRIT",
        name="Dashboard Trend Configured Critical",
        process="Dashboard configured threshold",
        description="Critical at configured threshold",
        category="Test",
        department_id=dept.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=4,
        gross_impact=5,
        gross_score=20,
        net_probability=4,
        net_impact=5,
        net_score=20,
        status="active",
        created_at=datetime(2026, 4, 21, 12, 0, tzinfo=UTC),
    )
    db_session.add_all([default_critical_only, configured_critical])
    await db_session.commit()

    try:
        response = await auth_client.get(f"/api/v1/dashboard/risk-trends?department_id={dept.id}")

        assert response.status_code == 200
        payload = response.json()
        assert sum(point["total_new"] for point in payload) == 2
        assert sum(point["critical_new"] for point in payload) == 1
    finally:
        clear_config_cache()


@pytest.mark.asyncio
async def test_quarterly_comparison_scoped_for_department_head(client: AsyncClient, db_session):
    """Department Heads can access quarterly metrics, scoped to their department."""
    from app.models import Risk, User
    from app.models.risk import RiskStatus

    dept_a = Department(name="Dept A2", code="D-A2")
    dept_b = Department(name="Dept B2", code="D-B2")
    db_session.add_all([dept_a, dept_b])
    await db_session.commit()
    await db_session.refresh(dept_a)
    await db_session.refresh(dept_b)

    role = Role(name="department_head", display_name="Department Head", description="Dept head")
    db_session.add(role)
    await db_session.commit()
    await db_session.refresh(role)

    perm = Permission(resource="risks", action="read", description="Read risks")
    db_session.add(perm)
    await db_session.commit()
    await db_session.refresh(perm)
    db_session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    await db_session.commit()
    db_session.expire(role, ["permissions"])

    dept_head = User(
        name="Dept Head 2",
        email="dept.head2@example.com",
        role_id=role.id,
        department_id=dept_a.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(dept_head)
    await db_session.commit()
    await db_session.refresh(dept_head)

    risk_a = Risk(
        risk_id_code="A2-001",
        name="Risk A2",
        process="Proc",
        category="Cat",
        description="Desc",
        department_id=dept_a.id,
        risk_type="operational",
        gross_probability=1,
        gross_impact=1,
        net_probability=1,
        net_impact=1,
        status=RiskStatus.active.value,
        created_at=datetime.now(UTC) - timedelta(days=1),
    )
    risk_b = Risk(
        risk_id_code="B2-001",
        name="Risk B2",
        process="Proc",
        category="Cat",
        description="Desc",
        department_id=dept_b.id,
        risk_type="operational",
        gross_probability=1,
        gross_impact=1,
        net_probability=1,
        net_impact=1,
        status=RiskStatus.active.value,
        created_at=datetime.now(UTC) - timedelta(days=1),
    )
    db_session.add_all([risk_a, risk_b])
    await db_session.commit()

    response = await client.get(
        "/api/v1/dashboard/quarterly-comparison",
        headers={"X-Mock-User-Id": str(dept_head.id)},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["this_quarter"]["new_risks"] == 1


@pytest.mark.asyncio
async def test_quarterly_comparison_empty_department_scope_marks_live_snapshot_missing(
    client: AsyncClient,
    db_session,
    test_role_department_head: Role,
):
    """Department-scoped committee users without a department have no valid snapshot source."""
    from app.models import User

    user_no_dept = User(
        name="Committee User Without Department",
        email="committee.nodept@example.com",
        role_id=test_role_department_head.id,
        department_id=None,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(user_no_dept)
    await db_session.commit()
    await db_session.refresh(user_no_dept)

    response = await client.get(
        "/api/v1/dashboard/quarterly-comparison",
        headers={"X-Mock-User-Id": str(user_no_dept.id)},
    )

    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload["this_quarter"]["new_risks"], int)
    assert payload["snapshot_info"]["current_quarter_snapshot_available"] is False
    assert payload["snapshot_info"]["last_quarter_snapshot_available"] is False
    assert payload["snapshot_info"]["snapshot_sources"] == {"current": "missing", "compare": "missing"}
    assert "priority_risks" not in payload["this_quarter"]
    assert "priority_risks" not in payload["last_quarter"]
    assert "priority_risks" in payload["snapshot_info"]["missing_snapshot_metrics"]["current"]
    assert "priority_risks" in payload["snapshot_info"]["missing_snapshot_metrics"]["compare"]
    assert payload["changes"]["priority_risks"]["direction"] == "unknown"


@pytest.mark.asyncio
async def test_quarterly_comparison_historical_current_uses_stored_snapshot(client_cro: AsyncClient, db_session):
    """Historical selected current quarters must use stored snapshots, not live metrics."""
    from app.core.snapshot_service import save_quarter_snapshot

    actual_start = _quarter_start(datetime.now(UTC))
    selected_start = _shift_quarter(actual_start, -1)
    compare_start = _shift_quarter(actual_start, -2)
    selected_label = _quarter_label(selected_start)
    compare_label = _quarter_label(compare_start)

    await save_quarter_snapshot(
        db_session,
        selected_label,
        selected_start.year,
        ((selected_start.month - 1) // 3) + 1,
        {"priority_risks": 7},
    )
    await save_quarter_snapshot(
        db_session,
        compare_label,
        compare_start.year,
        ((compare_start.month - 1) // 3) + 1,
        {"priority_risks": 3},
    )
    await db_session.commit()

    response = await client_cro.get(
        "/api/v1/dashboard/quarterly-comparison",
        params={"current_quarter": selected_label, "compare_quarter": compare_label},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["this_quarter"]["priority_risks"] == 7
    assert payload["last_quarter"]["priority_risks"] == 3
    assert payload["changes"]["priority_risks"]["absolute"] == 4
    assert payload["snapshot_info"]["snapshot_sources"] == {"current": "stored", "compare": "stored"}


@pytest.mark.asyncio
async def test_quarterly_comparison_department_head_uses_scoped_snapshots(
    client_department_head: AsyncClient,
    db_session,
    test_department: Department,
):
    """Department heads must not use global snapshots for historical comparisons."""
    from app.core.snapshot_service import save_quarter_snapshot

    actual_start = _quarter_start(datetime.now(UTC))
    selected_start = _shift_quarter(actual_start, -1)
    compare_start = _shift_quarter(actual_start, -2)
    selected_label = _quarter_label(selected_start)
    compare_label = _quarter_label(compare_start)

    await save_quarter_snapshot(
        db_session,
        selected_label,
        selected_start.year,
        ((selected_start.month - 1) // 3) + 1,
        {"priority_risks": 99},
    )
    await save_quarter_snapshot(
        db_session,
        compare_label,
        compare_start.year,
        ((compare_start.month - 1) // 3) + 1,
        {"priority_risks": 88},
    )
    await save_quarter_snapshot(
        db_session,
        selected_label,
        selected_start.year,
        ((selected_start.month - 1) // 3) + 1,
        {"priority_risks": 2},
        department_id=test_department.id,
    )
    await save_quarter_snapshot(
        db_session,
        compare_label,
        compare_start.year,
        ((compare_start.month - 1) // 3) + 1,
        {"priority_risks": 1},
        department_id=test_department.id,
    )
    await db_session.commit()

    response = await client_department_head.get(
        "/api/v1/dashboard/quarterly-comparison",
        params={"current_quarter": selected_label, "compare_quarter": compare_label},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["this_quarter"]["priority_risks"] == 2
    assert payload["last_quarter"]["priority_risks"] == 1
    assert payload["changes"]["priority_risks"]["absolute"] == 1


@pytest.mark.asyncio
async def test_quarterly_comparison_partial_snapshot_metric_remains_unavailable(
    client_cro: AsyncClient,
    db_session,
):
    """Missing metric keys inside an existing snapshot must not be reported as zero values."""
    from app.core.snapshot_service import save_quarter_snapshot

    actual_start = _quarter_start(datetime.now(UTC))
    selected_start = _shift_quarter(actual_start, -1)
    compare_start = _shift_quarter(actual_start, -2)
    selected_label = _quarter_label(selected_start)
    compare_label = _quarter_label(compare_start)

    await save_quarter_snapshot(
        db_session,
        selected_label,
        selected_start.year,
        ((selected_start.month - 1) // 3) + 1,
        {"priority_risks": 7, "active_vendors": 5},
    )
    await save_quarter_snapshot(
        db_session,
        compare_label,
        compare_start.year,
        ((compare_start.month - 1) // 3) + 1,
        {"priority_risks": 3},
    )
    await db_session.commit()

    response = await client_cro.get(
        "/api/v1/dashboard/quarterly-comparison",
        params={"current_quarter": selected_label, "compare_quarter": compare_label},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["this_quarter"]["active_vendors"] == 5
    assert "active_vendors" not in payload["last_quarter"]
    assert payload["changes"]["active_vendors"]["direction"] == "unknown"
    assert "active_vendors" not in payload["snapshot_info"]["missing_snapshot_metrics"]["current"]
    assert "active_vendors" in payload["snapshot_info"]["missing_snapshot_metrics"]["compare"]


@pytest.mark.asyncio
async def test_quarterly_comparison_missing_scoped_snapshots_are_unknown(
    client_department_head: AsyncClient,
    db_session,
):
    """Missing scoped snapshots must not fall back to global aggregate values."""
    from app.core.snapshot_service import save_quarter_snapshot

    actual_start = _quarter_start(datetime.now(UTC))
    selected_start = _shift_quarter(actual_start, -1)
    compare_start = _shift_quarter(actual_start, -2)
    selected_label = _quarter_label(selected_start)
    compare_label = _quarter_label(compare_start)

    await save_quarter_snapshot(
        db_session,
        selected_label,
        selected_start.year,
        ((selected_start.month - 1) // 3) + 1,
        {"priority_risks": 99},
    )
    await save_quarter_snapshot(
        db_session,
        compare_label,
        compare_start.year,
        ((compare_start.month - 1) // 3) + 1,
        {"priority_risks": 88},
    )
    await db_session.commit()

    response = await client_department_head.get(
        "/api/v1/dashboard/quarterly-comparison",
        params={"current_quarter": selected_label, "compare_quarter": compare_label},
    )
    assert response.status_code == 200
    payload = response.json()
    assert "priority_risks" not in payload["this_quarter"]
    assert "priority_risks" not in payload["last_quarter"]
    assert payload["changes"]["priority_risks"]["direction"] == "unknown"
    assert selected_label in payload["snapshot_info"]["missing_snapshot_quarters"]
    assert compare_label in payload["snapshot_info"]["missing_snapshot_quarters"]


@pytest.mark.asyncio
async def test_quarterly_comparison_rejects_future_and_invalid_order(client_cro: AsyncClient):
    actual_start = _quarter_start(datetime.now(UTC))
    future_label = _quarter_label(_shift_quarter(actual_start, 1))
    current_label = _quarter_label(actual_start)

    future_response = await client_cro.get(
        "/api/v1/dashboard/quarterly-comparison",
        params={"current_quarter": future_label},
    )
    assert future_response.status_code == 400

    invalid_order_response = await client_cro.get(
        "/api/v1/dashboard/quarterly-comparison",
        params={"current_quarter": current_label, "compare_quarter": current_label},
    )
    assert invalid_order_response.status_code == 400


@pytest.mark.asyncio
async def test_available_periods_scoped_for_department_head(
    client_department_head: AsyncClient,
    db_session,
    test_department: Department,
):
    """Department heads should not receive period years from other departments."""
    from app.core.snapshot_service import save_quarter_snapshot
    from app.models import Risk
    from app.models.risk import RiskStatus

    other_department = Department(name="Other Period Dept", code="OPD")
    db_session.add(other_department)
    await db_session.commit()
    await db_session.refresh(other_department)

    now = datetime.now(UTC)
    scoped_year = now.year - 4
    other_year = now.year - 5
    scoped_start = datetime(scoped_year, 1, 1, tzinfo=UTC)
    other_start = datetime(other_year, 1, 1, tzinfo=UTC)

    db_session.add_all([
        Risk(
            risk_id_code="PER-SCOPED",
            name="Scoped Period Risk",
            process="Proc",
            category="Cat",
            description="Desc",
            department_id=test_department.id,
            risk_type="operational",
            gross_probability=1,
            gross_impact=1,
            net_probability=1,
            net_impact=1,
            status=RiskStatus.active.value,
            created_at=scoped_start,
        ),
        Risk(
            risk_id_code="PER-OTHER",
            name="Other Period Risk",
            process="Proc",
            category="Cat",
            description="Desc",
            department_id=other_department.id,
            risk_type="operational",
            gross_probability=1,
            gross_impact=1,
            net_probability=1,
            net_impact=1,
            status=RiskStatus.active.value,
            created_at=other_start,
        ),
    ])
    await save_quarter_snapshot(
        db_session,
        f"{scoped_year}-Q1",
        scoped_year,
        1,
        {"priority_risks": 1},
        department_id=test_department.id,
    )
    await save_quarter_snapshot(
        db_session,
        f"{other_year}-Q1",
        other_year,
        1,
        {"priority_risks": 1},
        department_id=other_department.id,
    )
    await db_session.commit()

    response = await client_department_head.get("/api/v1/dashboard/available-periods")
    assert response.status_code == 200
    years = response.json()["years"]
    assert scoped_year in years
    assert other_year not in years
