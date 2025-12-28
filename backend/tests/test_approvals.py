"""Tests for approval request endpoints."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_approvals_empty(auth_client: AsyncClient):
    """Test listing approval requests returns paginated response."""
    response = await auth_client.get("/api/v1/approvals")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "skip" in data
    assert "limit" in data


@pytest.mark.asyncio
async def test_list_approvals_with_status_filter(auth_client: AsyncClient):
    """Test filtering approval requests by status."""
    response = await auth_client.get("/api/v1/approvals?status=pending")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data


@pytest.mark.asyncio
async def test_get_pending_count(auth_client: AsyncClient):
    """Test getting pending approval count for badge."""
    response = await auth_client.get("/api/v1/approvals/pending/count")
    assert response.status_code == 200
    data = response.json()
    assert "count" in data
    assert isinstance(data["count"], int)


@pytest.mark.asyncio
async def test_create_approval_requires_reason(auth_client: AsyncClient, test_risk):
    """Test creating approval request requires mandatory reason."""
    # Missing reason should fail validation
    response = await auth_client.post(
        "/api/v1/approvals",
        json={"resource_type": "risk", "resource_id": test_risk.id}
    )
    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_create_approval_with_reason(auth_client: AsyncClient, test_risk):
    """Test creating approval request with reason succeeds."""
    response = await auth_client.post(
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
async def test_duplicate_pending_request_rejected(auth_client: AsyncClient, test_risk):
    """Test cannot create duplicate pending request for same resource."""
    # Create first request
    response = await auth_client.post(
        "/api/v1/approvals",
        json={
            "resource_type": "risk",
            "resource_id": test_risk.id,
            "reason": "First request"
        }
    )
    assert response.status_code == 201
    
    # Try to create second request - should fail
    response = await auth_client.post(
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
async def test_get_approval_by_id(auth_client: AsyncClient, test_risk):
    """Test getting single approval request by ID."""
    # Create request first
    create_response = await auth_client.post(
        "/api/v1/approvals",
        json={
            "resource_type": "risk",
            "resource_id": test_risk.id,
            "reason": "Test reason"
        }
    )
    approval_id = create_response.json()["id"]
    
    # Get by ID
    response = await auth_client.get(f"/api/v1/approvals/{approval_id}")
    assert response.status_code == 200
    assert response.json()["id"] == approval_id


@pytest.mark.asyncio
async def test_cancel_own_request(auth_client: AsyncClient, test_risk):
    """Test user can cancel their own pending request."""
    # Create request
    create_response = await auth_client.post(
        "/api/v1/approvals",
        json={
            "resource_type": "risk",
            "resource_id": test_risk.id,
            "reason": "Test reason"
        }
    )
    approval_id = create_response.json()["id"]
    
    # Cancel it
    response = await auth_client.post(f"/api/v1/approvals/{approval_id}/cancel")
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"


@pytest.mark.asyncio
async def test_cannot_cancel_already_resolved_request(auth_client: AsyncClient, test_risk):
    """Test cannot cancel an already-approved request."""
    # Create request
    create_response = await auth_client.post(
        "/api/v1/approvals",
        json={
            "resource_type": "risk",
            "resource_id": test_risk.id,
            "reason": "Test reason"
        }
    )
    approval_id = create_response.json()["id"]
    
    # Approve it (auth_client has admin role)
    await auth_client.post(
        f"/api/v1/approvals/{approval_id}/approve",
        json={"resolution_notes": "Approved"}
    )
    
    # Try to cancel - should fail
    response = await auth_client.post(f"/api/v1/approvals/{approval_id}/cancel")
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_cannot_approve_already_resolved_request(auth_client: AsyncClient, test_risk):
    """Test cannot approve an already-rejected request."""
    # Create request
    create_response = await auth_client.post(
        "/api/v1/approvals",
        json={
            "resource_type": "risk",
            "resource_id": test_risk.id,
            "reason": "Test reason"
        }
    )
    approval_id = create_response.json()["id"]
    
    # Reject it first
    await auth_client.post(
        f"/api/v1/approvals/{approval_id}/reject",
        json={"resolution_notes": "Rejected"}
    )
    
    # Try to approve - should fail
    response = await auth_client.post(
        f"/api/v1/approvals/{approval_id}/approve",
        json={"resolution_notes": "Try again"}
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_update_blocked_during_pending_delete(auth_client: AsyncClient, test_risk):
    """Test that PATCH is blocked when a delete approval is pending."""
    # Create a delete request
    await auth_client.post(
        "/api/v1/approvals",
        json={
            "resource_type": "risk",
            "resource_id": test_risk.id,
            "reason": "Pending delete"
        }
    )
    
    # Try to update the risk - should get 409 Conflict
    response = await auth_client.patch(
        f"/api/v1/risks/{test_risk.id}",
        json={"description": "Trying to edit while delete pending"}
    )
    assert response.status_code == 409
    assert "pending" in response.json()["detail"].lower()
