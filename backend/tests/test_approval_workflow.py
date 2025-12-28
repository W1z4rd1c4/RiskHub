import pytest
from httpx import AsyncClient
from app.models.approval_request import ApprovalActionType

@pytest.mark.asyncio
class TestApprovalWorkflow:
    """End-to-end approval workflow tests."""
    
    async def test_deletion_approval_flow(
        self, 
        client_employee: AsyncClient,
        client_risk_manager: AsyncClient,
        test_risk
    ):
        """Test DELETE flow: request → approve → auto-archive."""
        # 1. Employee requests deletion
        response = await client_employee.delete(f"/api/v1/risks/{test_risk.id}?reason=Testing deletion")
        assert response.status_code == 202
        approval_id = response.json()["approval_id"]
        
        # 2. Risk Manager approves
        response = await client_risk_manager.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Approved for archiving"}
        )
        assert response.status_code == 200
        assert response.json()["status"] == "approved"
        
        # 3. Verify risk is archived (auto-executed)
        response = await client_risk_manager.get(f"/api/v1/risks/{test_risk.id}")
        assert response.json()["status"] == "archived"

    async def test_edit_approval_flow_sensitive_field(
        self,
        client_employee: AsyncClient,
        client_risk_manager: AsyncClient,
        test_risk
    ):
        """Test EDIT flow for sensitive field: request → approve → auto-apply."""
        # Change category (sensitive)
        new_data = {"category": "New Category"}
        response = await client_employee.patch(f"/api/v1/risks/{test_risk.id}", json=new_data)
        assert response.status_code == 202
        approval_id = response.json()["approval_id"]
        
        # Verify pending changes
        approval = response.json()
        assert "category" in approval["pending_changes"]
        assert approval["action_type"] == "edit"
        
        # Approve
        await client_risk_manager.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Change looks valid"}
        )
        
        # Verify change applied
        response = await client_risk_manager.get(f"/api/v1/risks/{test_risk.id}")
        assert response.json()["category"] == "New Category"

    async def test_rejection_preserves_resource(
        self,
        client_employee: AsyncClient,
        client_risk_manager: AsyncClient,
        test_risk
    ):
        """Test rejection preserves current state."""
        # Request deletion
        response = await client_employee.delete(f"/api/v1/risks/{test_risk.id}?reason=Testing rejection")
        approval_id = response.json()["approval_id"]
        
        # Reject
        await client_risk_manager.post(
            f"/api/v1/approvals/{approval_id}/reject",
            json={"resolution_notes": "Risk still needed"}
        )
        
        # Verify risk unchanged
        response = await client_risk_manager.get(f"/api/v1/risks/{test_risk.id}")
        assert response.json()["status"] != "archived"
    
    async def test_privileged_immediate_bypass(
        self,
        client_cro: AsyncClient,
        test_risk
    ):
        """Test CRO/Admin can edit/delete immediately without approval."""
        response = await client_cro.patch(f"/api/v1/risks/{test_risk.id}", json={"category": "VIP Edit"})
        assert response.status_code == 200
        assert response.json()["category"] == "VIP Edit"
