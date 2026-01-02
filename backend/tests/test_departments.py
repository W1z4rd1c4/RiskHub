"""Tests for department endpoints."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department, Risk, User
from app.models.risk import RiskStatus as RiskStatusEnum


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
    response = await auth_client.get(
        f"/api/v1/departments/{dept.id}/risks?min_net_score=10"
    )
    assert response.status_code == 200
    data = response.json()
    
    # Should only contain the high score risk
    assert len(data) == 1
    assert data[0]["risk_id_code"] == "RISK-HIGH-SCORE"
    assert data[0]["net_score"] >= 10


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
