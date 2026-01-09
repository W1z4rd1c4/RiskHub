"""Concurrency tests for Risk ID generation."""
import asyncio
import pytest
from httpx import AsyncClient

from app.models import Department, User


@pytest.mark.asyncio
@pytest.mark.skip(reason="SQLite in test mode doesn't support true concurrent writes; run with PostgreSQL")
async def test_concurrent_risk_creation_no_duplicates(
    auth_client: AsyncClient,
    test_user: User,
    test_department: Department,
    seed_risk_types,
):
    """
    Verify that 10 concurrent risk creations all succeed with unique IDs.
    
    This tests the atomic-retry pattern for Risk ID generation.
    """
    # Create 10 risks concurrently with same process
    async def create_risk(i: int):
        response = await auth_client.post(
            "/api/v1/risks",
            json={
                "name": f"Concurrent Risk {i}",
                "process": "CONCURRENCY",  # Same process = same prefix
                "risk_type": "operational",
                "description": f"Test risk {i} for concurrency",
                "department_id": test_department.id,
                "gross_probability": 3,
                "gross_impact": 3,
                "net_probability": 2,
                "net_impact": 2,
                "status": "active",
            },
        )
        return response
    
    # Fire all 10 requests concurrently
    results = await asyncio.gather(*[create_risk(i) for i in range(10)])
    
    # All should succeed (201 Created)
    for i, response in enumerate(results):
        assert response.status_code == 201, f"Request {i} failed: {response.json()}"
    
    # All IDs should be unique
    risk_ids = [r.json()["risk_id_code"] for r in results]
    assert len(set(risk_ids)) == 10, f"Duplicate IDs found: {risk_ids}"
    
    # All should follow pattern CONC-RNN
    for rid in risk_ids:
        assert rid.startswith("CONC-R"), f"Unexpected ID format: {rid}"


@pytest.mark.asyncio
async def test_user_provided_id_collision_returns_409(
    auth_client: AsyncClient,
    test_user: User,
    test_department: Department,
    seed_risk_types,
):
    """Verify that user-provided duplicate IDs return 409, not retry."""
    # Create first risk with explicit ID
    response1 = await auth_client.post(
        "/api/v1/risks",
        json={
            "name": "First Custom ID Risk",
            "process": "TEST",
            "risk_type": "operational",
            "risk_id_code": "CUSTOM-R01",  # User-provided ID
            "description": "First risk",
            "department_id": test_department.id,
            "gross_probability": 3,
            "gross_impact": 3,
            "net_probability": 2,
            "net_impact": 2,
            "status": "active",
        },
    )
    assert response1.status_code == 201
    
    # Try to create second risk with same ID
    response2 = await auth_client.post(
        "/api/v1/risks",
        json={
            "name": "Duplicate Custom ID Risk",
            "process": "TEST",
            "risk_type": "operational",
            "risk_id_code": "CUSTOM-R01",  # Same ID - should fail
            "description": "Duplicate risk",
            "department_id": test_department.id,
            "gross_probability": 2,
            "gross_impact": 2,
            "net_probability": 1,
            "net_impact": 1,
            "status": "active",
        },
    )
    assert response2.status_code == 409
    assert "already exists" in response2.json()["detail"]
