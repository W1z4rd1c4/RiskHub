"""Stress tests for concurrency fixes.

Note: These tests require PostgreSQL to properly test concurrency.
SQLite in test mode doesn't support true concurrent writes.
"""
import asyncio
import pytest
from httpx import AsyncClient

from app.models import Department, User


@pytest.mark.asyncio
@pytest.mark.skip(reason="SQLite in test mode doesn't support true concurrent writes; run with PostgreSQL")
async def test_50_concurrent_risk_creations(
    auth_client: AsyncClient, 
    test_user: User, 
    test_department: Department,
    seed_risk_types,
):
    """50 simultaneous risk creations should all succeed with unique IDs."""
    async def create_risk(i: int):
        return await auth_client.post(
            "/api/v1/risks",
            json={
                "name": f"Stress Risk {i}",
                "process": "STRESS",
                "risk_type": "operational",
                "description": f"Stress test {i}",
                "department_id": test_department.id,
                "gross_probability": 3,
                "gross_impact": 3,
                "net_probability": 2,
                "net_impact": 2,
                "status": "active",
            },
        )
    
    results = await asyncio.gather(*[create_risk(i) for i in range(50)])
    
    successes = [r for r in results if r.status_code == 201]
    assert len(successes) == 50, f"Only {len(successes)}/50 succeeded"
    
    ids = [r.json()["risk_id_code"] for r in successes]
    assert len(set(ids)) == 50, f"Duplicate IDs found: {ids}"


@pytest.mark.asyncio
@pytest.mark.skip(reason="SQLite in test mode doesn't support true concurrent writes; run with PostgreSQL")
async def test_20_concurrent_approval_requests(
    auth_client: AsyncClient,
    test_user: User,
    test_department: Department,
    seed_risk_types,
):
    """20 concurrent delete requests should result in only 1 pending approval."""
    # First create a risk to delete
    create_response = await auth_client.post(
        "/api/v1/risks",
        json={
            "name": "Risk for concurrent delete",
            "process": "CONCURRENT_DELETE",
            "risk_type": "operational",
            "description": "Test",
            "department_id": test_department.id,
            "gross_probability": 3,
            "gross_impact": 3,
            "net_probability": 2,
            "net_impact": 2,
            "status": "active",
        },
    )
    assert create_response.status_code == 201
    risk_id = create_response.json()["id"]
    
    async def delete_risk():
        return await auth_client.delete(
            f"/api/v1/risks/{risk_id}",
            params={"reason": "Concurrent test"},
        )
    
    results = await asyncio.gather(*[delete_risk() for _ in range(20)])
    
    successes = [r for r in results if r.status_code == 202]
    conflicts = [r for r in results if r.status_code in [400, 409]]
    
    # One should succeed and create the approval
    # The rest should get 400 (already pending) or 409 (race condition)
    assert len(successes) == 1, f"Expected 1 success, got {len(successes)}"
    assert len(conflicts) == 19, f"Expected 19 conflicts/already-pending, got {len(conflicts)}"


class TestProductionGuards:
    """Test production security guardrails."""
    
    def test_production_detection_with_env_production(self, monkeypatch):
        """ENV=production should be detected as production."""
        monkeypatch.setenv("ENV", "production")
        monkeypatch.setenv("DEBUG", "true")  # Even with DEBUG=true
        
        from app.core.security import _is_production_environment
        assert _is_production_environment() is True
    
    def test_production_detection_with_debug_false(self, monkeypatch):
        """DEBUG=false should be detected as production."""
        monkeypatch.setenv("ENV", "development")
        monkeypatch.setenv("DEBUG", "false")
        
        from app.core.security import _is_production_environment
        assert _is_production_environment() is True
    
    def test_development_detection(self, monkeypatch):
        """DEBUG=true without ENV=production should NOT be production."""
        monkeypatch.setenv("ENV", "development")
        monkeypatch.setenv("DEBUG", "true")
        
        from app.core.security import _is_production_environment
        assert _is_production_environment() is False
