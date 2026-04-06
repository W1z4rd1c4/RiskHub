import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.models import ApprovalRequest, GlobalConfig, Risk, User
from app.models.approval_request import ApprovalStatus
from app.models.global_config import clear_config_cache
from app.models.risk import RiskStatus
from app.models.notification import Notification, NotificationType
from app.services.outbox import dispatch_pending_outbox_events


def _sessionmaker(async_engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)


async def _create_risk_for_delete_workflow(
    db_session: AsyncSession,
    *,
    risk_id_code: str,
    name: str,
    department_id: int,
    owner_id: int,
    net_score: int,
    is_priority: bool = False,
) -> Risk:
    risk = Risk(
        risk_id_code=risk_id_code,
        name=name,
        process="Approval Workflow Test",
        description=f"{name} description",
        department_id=department_id,
        owner_id=owner_id,
        risk_type="operational",
        category="Workflow",
        is_priority=is_priority,
        gross_probability=4,
        gross_impact=4,
        gross_score=16,
        net_probability=3,
        net_impact=4,
        net_score=net_score,
        status=RiskStatus.active.value,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)
    return risk


async def _load_approval(db_session: AsyncSession, approval_id: int) -> ApprovalRequest:
    result = await db_session.execute(select(ApprovalRequest).where(ApprovalRequest.id == approval_id))
    approval = result.scalar_one_or_none()
    assert approval is not None
    return approval


async def _load_risk(db_session: AsyncSession, risk_id: int) -> Risk:
    result = await db_session.execute(select(Risk).where(Risk.id == risk_id))
    risk = result.scalar_one_or_none()
    assert risk is not None
    return risk


@pytest.mark.asyncio
class TestApprovalWorkflow:
    """End-to-end approval workflow tests."""

    async def test_deletion_approval_flow(
        self,
        client_approval_requester: AsyncClient,
        client_risk_manager: AsyncClient,
        db_session: AsyncSession,
        test_risk,
    ):
        """Test DELETE flow: request → approve → auto-archive."""
        # 1. Employee requests deletion
        response = await client_approval_requester.delete(f"/api/v1/risks/{test_risk.id}?reason=Testing deletion")
        assert response.status_code == 202
        approval_id = response.json()["approval_id"]
        approval = await _load_approval(db_session, approval_id)
        assert approval.requires_privileged_approval is False

        # 2. Risk Manager approves
        response = await client_risk_manager.post(
            f"/api/v1/approvals/{approval_id}/approve", json={"resolution_notes": "Approved for archiving"}
        )
        assert response.status_code == 200
        assert response.json()["status"] == "approved"

        # 3. Verify risk is archived (auto-executed)
        response = await client_risk_manager.get(f"/api/v1/risks/{test_risk.id}")
        assert response.json()["status"] == "archived"

    async def test_high_net_score_risk_delete_requires_privileged_follow_up(
        self,
        client_approval_requester: AsyncClient,
        client_employee: AsyncClient,
        client_risk_manager: AsyncClient,
        db_session: AsyncSession,
        test_department,
        test_user_employee: User,
    ):
        """Non-priority risks at the high-risk threshold must escalate after primary approval."""
        risk = await _create_risk_for_delete_workflow(
            db_session,
            risk_id_code="R-DEL-HIGH-001",
            name="Threshold Delete Risk",
            department_id=test_department.id,
            owner_id=test_user_employee.id,
            net_score=10,
        )

        delete_response = await client_approval_requester.delete(
            f"/api/v1/risks/{risk.id}?reason=Threshold delete regression"
        )
        assert delete_response.status_code == 202
        approval_id = delete_response.json()["approval_id"]

        approval = await _load_approval(db_session, approval_id)
        assert approval.primary_approver_id == test_user_employee.id
        assert approval.requires_privileged_approval is True
        assert approval.status == ApprovalStatus.PENDING

        primary_response = await client_employee.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Owner approval before privileged review"},
        )
        assert primary_response.status_code == 200
        assert primary_response.json()["status"] == "pending_privileged"

        approval = await _load_approval(db_session, approval_id)
        assert approval.status == ApprovalStatus.PENDING_PRIVILEGED
        assert approval.primary_approved_at is not None
        assert approval.resolved_by_id is None

        persisted_risk = await _load_risk(db_session, risk.id)
        assert persisted_risk.status == RiskStatus.active.value

        privileged_response = await client_risk_manager.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Risk manager final approval"},
        )
        assert privileged_response.status_code == 200
        assert privileged_response.json()["status"] == "approved"

        approval = await _load_approval(db_session, approval_id)
        assert approval.status == ApprovalStatus.APPROVED
        assert approval.privileged_approver_id is not None

        persisted_risk = await _load_risk(db_session, risk.id)
        assert persisted_risk.status == RiskStatus.archived.value

    async def test_low_risk_delete_finalizes_after_primary_approval(
        self,
        client_approval_requester: AsyncClient,
        client_employee: AsyncClient,
        db_session: AsyncSession,
        test_department,
        test_user_employee: User,
    ):
        """Non-priority risks below the threshold should not escalate to privileged approval."""
        risk = await _create_risk_for_delete_workflow(
            db_session,
            risk_id_code="R-DEL-LOW-001",
            name="Low Risk Delete",
            department_id=test_department.id,
            owner_id=test_user_employee.id,
            net_score=9,
        )

        delete_response = await client_approval_requester.delete(
            f"/api/v1/risks/{risk.id}?reason=Low risk delete regression"
        )
        assert delete_response.status_code == 202
        approval_id = delete_response.json()["approval_id"]

        approval = await _load_approval(db_session, approval_id)
        assert approval.primary_approver_id == test_user_employee.id
        assert approval.requires_privileged_approval is False
        assert approval.status == ApprovalStatus.PENDING

        primary_response = await client_employee.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Owner approval for low-risk delete"},
        )
        assert primary_response.status_code == 200
        assert primary_response.json()["status"] == "approved"

        approval = await _load_approval(db_session, approval_id)
        assert approval.status == ApprovalStatus.APPROVED
        assert approval.privileged_approver_id is None

        persisted_risk = await _load_risk(db_session, risk.id)
        assert persisted_risk.status == RiskStatus.archived.value

    async def test_delete_privileged_escalation_uses_configured_high_risk_threshold(
        self,
        client_approval_requester: AsyncClient,
        db_session: AsyncSession,
        test_department,
        test_user_employee: User,
    ):
        """Delete approvals should follow the dynamic high-risk threshold config."""
        clear_config_cache()
        db_session.add(
            GlobalConfig(
                key="high_risk_min_net_score",
                value="14",
                value_type="int",
                category="risk_thresholds",
                display_name="High Risk Minimum Net Score",
            )
        )
        await db_session.commit()
        clear_config_cache()

        below_threshold_risk = await _create_risk_for_delete_workflow(
            db_session,
            risk_id_code="R-DEL-CONF-LOW-001",
            name="Configured Threshold Low",
            department_id=test_department.id,
            owner_id=test_user_employee.id,
            net_score=13,
        )
        at_threshold_risk = await _create_risk_for_delete_workflow(
            db_session,
            risk_id_code="R-DEL-CONF-HIGH-001",
            name="Configured Threshold High",
            department_id=test_department.id,
            owner_id=test_user_employee.id,
            net_score=14,
        )

        below_response = await client_approval_requester.delete(
            f"/api/v1/risks/{below_threshold_risk.id}?reason=Configured threshold below"
        )
        assert below_response.status_code == 202
        below_approval = await _load_approval(db_session, below_response.json()["approval_id"])
        assert below_approval.requires_privileged_approval is False

        at_response = await client_approval_requester.delete(
            f"/api/v1/risks/{at_threshold_risk.id}?reason=Configured threshold at boundary"
        )
        assert at_response.status_code == 202
        at_approval = await _load_approval(db_session, at_response.json()["approval_id"])
        assert at_approval.requires_privileged_approval is True

        clear_config_cache()

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
