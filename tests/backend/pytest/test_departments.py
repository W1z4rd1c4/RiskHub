"""Tests for department endpoints."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Control, Department, KeyRiskIndicator, Risk, Role, User
from app.models.risk import RiskStatus as RiskStatusEnum
from app.models.user import AccessScope


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
