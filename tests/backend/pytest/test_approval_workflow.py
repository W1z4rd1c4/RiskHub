import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.models.notification import Notification, NotificationType
from app.services.outbox import dispatch_pending_outbox_events


def _sessionmaker(async_engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.mark.asyncio
class TestApprovalWorkflow:
    """End-to-end approval workflow tests."""

    async def test_deletion_approval_flow(
        self, client_approval_requester: AsyncClient, client_risk_manager: AsyncClient, test_risk
    ):
        """Test DELETE flow: request → approve → auto-archive."""
        # 1. Employee requests deletion
        response = await client_approval_requester.delete(f"/api/v1/risks/{test_risk.id}?reason=Testing deletion")
        assert response.status_code == 202
        approval_id = response.json()["approval_id"]

        # 2. Risk Manager approves
        response = await client_risk_manager.post(
            f"/api/v1/approvals/{approval_id}/approve", json={"resolution_notes": "Approved for archiving"}
        )
        assert response.status_code == 200
        assert response.json()["status"] == "approved"

        # 3. Verify risk is archived (auto-executed)
        response = await client_risk_manager.get(f"/api/v1/risks/{test_risk.id}")
        assert response.json()["status"] == "archived"

    async def test_edit_approval_flow_sensitive_field(
        self, client_approval_requester: AsyncClient, client_risk_manager: AsyncClient, test_risk
    ):
        """Test EDIT flow for sensitive field: request → approve → auto-apply."""
        # Change category (sensitive)
        new_data = {"category": "New Category"}
        response = await client_approval_requester.patch(f"/api/v1/risks/{test_risk.id}", json=new_data)
        assert response.status_code == 202
        approval_id = response.json()["approval_id"]

        # Verify pending changes
        approval = response.json()
        assert "category" in approval["pending_changes"]
        assert approval["action_type"] == "edit"

        # Approve
        await client_risk_manager.post(
            f"/api/v1/approvals/{approval_id}/approve", json={"resolution_notes": "Change looks valid"}
        )

        # Verify change applied
        response = await client_risk_manager.get(f"/api/v1/risks/{test_risk.id}")
        assert response.json()["category"] == "New Category"

    async def test_rejection_preserves_resource(
        self, client_approval_requester: AsyncClient, client_risk_manager: AsyncClient, test_risk
    ):
        """Test rejection preserves current state."""
        # Request deletion
        response = await client_approval_requester.delete(f"/api/v1/risks/{test_risk.id}?reason=Testing rejection")
        approval_id = response.json()["approval_id"]

        # Reject
        await client_risk_manager.post(
            f"/api/v1/approvals/{approval_id}/reject", json={"resolution_notes": "Risk still needed"}
        )

        # Verify risk unchanged
        response = await client_risk_manager.get(f"/api/v1/risks/{test_risk.id}")
        assert response.json()["status"] != "archived"

    async def test_privileged_immediate_bypass(self, client_cro: AsyncClient, test_risk):
        """Test CRO/Admin can edit/delete immediately without approval."""
        response = await client_cro.patch(f"/api/v1/risks/{test_risk.id}", json={"category": "VIP Edit"})
        assert response.status_code == 200
        assert response.json()["category"] == "VIP Edit"

    async def test_requester_notified_on_approval(
        self,
        client_approval_requester: AsyncClient,
        client_risk_manager: AsyncClient,
        db_session,
        async_engine: AsyncEngine,
        test_risk,
        test_user_approval_requester,
    ):
        """Requester receives APPROVAL_RESOLVED notification after approval."""
        response = await client_approval_requester.delete(f"/api/v1/risks/{test_risk.id}?reason=Testing deletion")
        assert response.status_code == 202
        approval_id = response.json()["approval_id"]

        approve_response = await client_risk_manager.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Approved for notification test"},
        )
        assert approve_response.status_code == 200

        result = await db_session.execute(
            select(Notification).where(
                Notification.user_id == test_user_approval_requester.id,
                Notification.type == NotificationType.APPROVAL_RESOLVED,
                Notification.resource_id == approval_id,
            )
        )
        notification = result.scalar_one_or_none()
        assert notification is None

        processed = await dispatch_pending_outbox_events(_sessionmaker(async_engine))
        assert processed >= 1

        result = await db_session.execute(
            select(Notification).where(
                Notification.user_id == test_user_approval_requester.id,
                Notification.type == NotificationType.APPROVAL_RESOLVED,
                Notification.resource_id == approval_id,
            )
        )
        notification = result.scalar_one_or_none()
        assert notification is not None
        assert notification.title == "Request approved"

    async def test_requester_notified_on_rejection(
        self,
        client_approval_requester: AsyncClient,
        client_risk_manager: AsyncClient,
        db_session,
        async_engine: AsyncEngine,
        test_risk,
        test_user_approval_requester,
    ):
        """Requester receives APPROVAL_RESOLVED notification after rejection."""
        response = await client_approval_requester.delete(f"/api/v1/risks/{test_risk.id}?reason=Testing rejection")
        assert response.status_code == 202
        approval_id = response.json()["approval_id"]

        reject_response = await client_risk_manager.post(
            f"/api/v1/approvals/{approval_id}/reject",
            json={"resolution_notes": "Rejected for notification test"},
        )
        assert reject_response.status_code == 200

        result = await db_session.execute(
            select(Notification).where(
                Notification.user_id == test_user_approval_requester.id,
                Notification.type == NotificationType.APPROVAL_RESOLVED,
                Notification.resource_id == approval_id,
            )
        )
        notification = result.scalar_one_or_none()
        assert notification is None

        processed = await dispatch_pending_outbox_events(_sessionmaker(async_engine))
        assert processed >= 1

        result = await db_session.execute(
            select(Notification).where(
                Notification.user_id == test_user_approval_requester.id,
                Notification.type == NotificationType.APPROVAL_RESOLVED,
                Notification.resource_id == approval_id,
            )
        )
        notification = result.scalar_one_or_none()
        assert notification is not None
        assert notification.title == "Request rejected"

    async def test_priority_risk_edit_requires_approval_from_non_privileged(
        self,
        client_approval_requester: AsyncClient,
        client_risk_manager: AsyncClient,
        db_session,
        test_department,
        test_user,
        seed_risk_types,
    ):
        """
        TIERED APPROVAL TEST: Non-privileged user editing a priority risk
        should trigger an approval request (202), not immediate update.
        """
        from app.models import Risk
        from app.models.risk import RiskStatus

        # Create a priority risk
        priority_risk = Risk(
            risk_id_code="PRIO-R01",
            name="Priority Test Risk",
            process="Priority Process",
            description="A priority risk for tiered approval test",
            department_id=test_department.id,
            owner_id=test_user.id,
            risk_type="operational",
            category="High Impact",
            is_priority=True,  # Priority risk!
            gross_probability=4,
            gross_impact=5,
            gross_score=20,
            net_probability=3,
            net_impact=4,
            net_score=12,
            status=RiskStatus.active.value,
        )
        db_session.add(priority_risk)
        await db_session.commit()
        await db_session.refresh(priority_risk)

        # Non-privileged employee tries to edit ANY field on priority risk
        response = await client_approval_requester.patch(
            f"/api/v1/risks/{priority_risk.id}", json={"description": "Updated description"}
        )

        # Should return 202 with approval request (NOT 200 immediate)
        assert response.status_code == 202
        data = response.json()
        assert "approval_id" in data
        assert data["action_type"] == "edit"
        assert "priority risk" in data.get("message", "").lower() or "approval" in data.get("message", "").lower()

    async def test_privileged_user_can_edit_priority_risk_immediately(
        self,
        client_cro: AsyncClient,
        db_session,
        test_department,
        test_user,
        seed_risk_types,
    ):
        """
        TIERED APPROVAL TEST: Privileged user (CRO) can edit priority risk
        immediately without approval (200).
        """
        from app.models import Risk
        from app.models.risk import RiskStatus

        # Create a priority risk
        priority_risk = Risk(
            risk_id_code="PRIO-R02",
            name="Priority Test Risk 2",
            process="Priority Process 2",
            description="A priority risk for privileged edit test",
            department_id=test_department.id,
            owner_id=test_user.id,
            risk_type="operational",
            category="High Impact",
            is_priority=True,
            gross_probability=4,
            gross_impact=5,
            gross_score=20,
            net_probability=3,
            net_impact=4,
            net_score=12,
            status=RiskStatus.active.value,
        )
        db_session.add(priority_risk)
        await db_session.commit()
        await db_session.refresh(priority_risk)

        # CRO edits priority risk - should be immediate
        response = await client_cro.patch(
            f"/api/v1/risks/{priority_risk.id}", json={"description": "CRO updated this priority risk"}
        )

        # Should return 200 (immediate, no approval needed for privileged)
        assert response.status_code == 200
        data = response.json()
        assert data["description"] == "CRO updated this priority risk"
