"""Tests for the public risk types endpoint."""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.risk_type import RiskTypeConfig


@pytest.mark.asyncio
async def test_public_risk_types_accessible_to_non_cro(
    client_employee: AsyncClient,
    db_session: AsyncSession,
):
    """Test that non-CRO users can access public risk types endpoint."""
    # Create test risk types (one active, one inactive)
    active_type = RiskTypeConfig(
        code="test_active_type",
        display_name="Active Test Type",
        description="Test description",
        color="#ff0000",
        icon="shield",
        sort_order=1,
        is_active=True,
        is_system=False,
        risk_count=0,
    )
    inactive_type = RiskTypeConfig(
        code="test_inactive_type",
        display_name="Inactive Test Type",
        description="Test description",
        color="#00ff00",
        icon="warning",
        sort_order=2,
        is_active=False,
        is_system=False,
        risk_count=0,
    )

    db_session.add(active_type)
    db_session.add(inactive_type)
    await db_session.commit()

    # Non-CRO user should be able to access endpoint
    response = await client_employee.get("/api/v1/riskhub/public-risk-types")
    assert response.status_code == 200

    data = response.json()
    assert isinstance(data, list)

    # Find our test type in results
    codes = [item["code"] for item in data]
    assert "test_active_type" in codes
    assert "test_inactive_type" not in codes  # Inactive should be excluded


@pytest.mark.asyncio
async def test_public_risk_types_returns_only_active(
    client_employee: AsyncClient,
    db_session: AsyncSession,
):
    """Test that only active risk types are returned."""
    # Cleanup any existing test types
    await db_session.execute(select(RiskTypeConfig).where(RiskTypeConfig.code.like("filter_test_%")))

    # Create mixed active/inactive types
    for i in range(3):
        db_session.add(
            RiskTypeConfig(
                code=f"filter_test_active_{i}",
                display_name=f"Active Filter Test {i}",
                color="#aabbcc",
                sort_order=i,
                is_active=True,
                is_system=False,
                risk_count=0,
            )
        )
    for i in range(2):
        db_session.add(
            RiskTypeConfig(
                code=f"filter_test_inactive_{i}",
                display_name=f"Inactive Filter Test {i}",
                color="#ddeeff",
                sort_order=10 + i,
                is_active=False,
                is_system=False,
                risk_count=0,
            )
        )
    await db_session.commit()

    response = await client_employee.get("/api/v1/riskhub/public-risk-types")
    assert response.status_code == 200

    data = response.json()
    codes = [item["code"] for item in data]

    # All active should be present
    for i in range(3):
        assert f"filter_test_active_{i}" in codes

    # No inactive should be present
    for i in range(2):
        assert f"filter_test_inactive_{i}" not in codes


@pytest.mark.asyncio
async def test_public_risk_types_minimal_fields(
    client_employee: AsyncClient,
    db_session: AsyncSession,
):
    """Test that response only includes expected fields (no admin metadata)."""
    # Create a risk type with all fields populated
    db_session.add(
        RiskTypeConfig(
            code="field_test_type",
            display_name="Field Test Type",
            description="Should not appear in response",
            color="#112233",
            icon="star",
            sort_order=99,
            is_active=True,
            is_system=True,  # Admin field - should not appear
            risk_count=5,  # Admin field - should not appear
        )
    )
    await db_session.commit()

    response = await client_employee.get("/api/v1/riskhub/public-risk-types")
    assert response.status_code == 200

    data = response.json()

    # Find our test type
    test_type = next((t for t in data if t["code"] == "field_test_type"), None)
    assert test_type is not None

    # Verify only expected fields are present
    expected_fields = {"code", "display_name", "color", "icon", "sort_order"}
    assert set(test_type.keys()) == expected_fields

    # Verify correct values
    assert test_type["code"] == "field_test_type"
    assert test_type["display_name"] == "Field Test Type"
    assert test_type["color"] == "#112233"
    assert test_type["icon"] == "star"
    assert test_type["sort_order"] == 99

    # Admin-only fields should NOT be in response
    assert "description" not in test_type
    assert "is_active" not in test_type
    assert "is_system" not in test_type
    assert "risk_count" not in test_type
    assert "created_at" not in test_type
    assert "updated_at" not in test_type
    assert "id" not in test_type


@pytest.mark.asyncio
async def test_public_risk_types_unauthenticated_blocked(
    client: AsyncClient,
):
    """Test that unauthenticated requests are blocked."""
    response = await client.get("/api/v1/riskhub/public-risk-types")
    # Should return 401 for unauthenticated
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_public_risk_types_ordered_correctly(
    client_employee: AsyncClient,
    db_session: AsyncSession,
):
    """Test that results are ordered by sort_order, then display_name."""
    # Create types with specific sort orders
    for code, name, order in [
        ("order_test_c", "Charlie", 1),
        ("order_test_a", "Alpha", 1),  # Same order, should sort by name
        ("order_test_b", "Beta", 0),  # Lower order, should come first
    ]:
        db_session.add(
            RiskTypeConfig(
                code=code,
                display_name=name,
                color="#000000",
                sort_order=order,
                is_active=True,
                is_system=False,
                risk_count=0,
            )
        )
    await db_session.commit()

    response = await client_employee.get("/api/v1/riskhub/public-risk-types")
    assert response.status_code == 200

    data = response.json()
    order_test_types = [t for t in data if t["code"].startswith("order_test_")]

    # Should be: Beta (order 0), Alpha (order 1), Charlie (order 1)
    assert len(order_test_types) == 3
    assert order_test_types[0]["code"] == "order_test_b"  # Beta, order 0
    assert order_test_types[1]["code"] == "order_test_a"  # Alpha, order 1
    assert order_test_types[2]["code"] == "order_test_c"  # Charlie, order 1
