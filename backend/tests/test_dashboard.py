"""
Tests for Dashboard API endpoints.
"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_dashboard_summary(auth_client: AsyncClient):
    """Test the dashboard summary endpoint."""
    response = await auth_client.get("/api/v1/dashboard/summary")
    
    assert response.status_code == 200
    data = response.json()
    assert "total_controls" in data
    assert "total_risks" in data


@pytest.mark.asyncio
async def test_risk_distribution(auth_client: AsyncClient):
    """Test the risk distribution endpoint."""
    response = await auth_client.get("/api/v1/dashboard/risk-distribution")
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_departments(auth_client: AsyncClient):
    """Test the departments endpoint."""
    response = await auth_client.get("/api/v1/dashboard/departments")
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
