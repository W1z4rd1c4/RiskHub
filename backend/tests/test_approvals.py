"""Tests for approval request endpoints."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_approvals_empty(client: AsyncClient):
    """Test listing approval requests returns paginated response."""
    response = await client.get("/api/v1/approvals")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "skip" in data
    assert "limit" in data


@pytest.mark.asyncio
async def test_list_approvals_with_status_filter(client: AsyncClient):
    """Test filtering approval requests by status."""
    response = await client.get("/api/v1/approvals?status=pending")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data


@pytest.mark.asyncio
async def test_get_pending_count(client: AsyncClient):
    """Test getting pending approval count for badge."""
    response = await client.get("/api/v1/approvals/pending/count")
    assert response.status_code == 200
    data = response.json()
    assert "count" in data
    assert isinstance(data["count"], int)


@pytest.mark.asyncio
async def test_create_approval_requires_reason(client: AsyncClient, test_risk):
    """Test creating approval request requires mandatory reason."""
    # Missing reason should fail validation
    response = await client.post(
        "/api/v1/approvals",
        json={"resource_type": "risk", "resource_id": test_risk.id}
    )
    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_create_approval_with_reason(client: AsyncClient, test_risk):
    """Test creating approval request with reason succeeds."""
    response = await client.post(
        "/api/v1/approvals",
        json={
            "resource_type": "risk",
            "resource_id": test_risk.id,
            "reason": "No longer applicable to business"
        }
    )
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "pending"
    assert data["resource_type"] == "risk"
    assert data["reason"] == "No longer applicable to business"


@pytest.mark.asyncio
async def test_duplicate_pending_request_rejected(client: AsyncClient, test_risk):
    """Test cannot create duplicate pending request for same resource."""
    # Create first request
    response = await client.post(
        "/api/v1/approvals",
        json={
            "resource_type": "risk",
            "resource_id": test_risk.id,
            "reason": "First request"
        }
    )
    assert response.status_code == 201
    
    # Try to create second request - should fail
    response = await client.post(
        "/api/v1/approvals",
        json={
            "resource_type": "risk",
            "resource_id": test_risk.id,
            "reason": "Second request"
        }
    )
    assert response.status_code == 400
    assert "already pending" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_approval_by_id(client: AsyncClient, test_risk):
    """Test getting single approval request by ID."""
    # Create request first
    create_response = await client.post(
        "/api/v1/approvals",
        json={
            "resource_type": "risk",
            "resource_id": test_risk.id,
            "reason": "Test reason"
        }
    )
    approval_id = create_response.json()["id"]
    
    # Get by ID
    response = await client.get(f"/api/v1/approvals/{approval_id}")
    assert response.status_code == 200
    assert response.json()["id"] == approval_id


@pytest.mark.asyncio
async def test_cancel_own_request(client: AsyncClient, test_risk):
    """Test user can cancel their own pending request."""
    # Create request
    create_response = await client.post(
        "/api/v1/approvals",
        json={
            "resource_type": "risk",
            "resource_id": test_risk.id,
            "reason": "Test reason"
        }
    )
    approval_id = create_response.json()["id"]
    
    # Cancel it
    response = await client.post(f"/api/v1/approvals/{approval_id}/cancel")
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
