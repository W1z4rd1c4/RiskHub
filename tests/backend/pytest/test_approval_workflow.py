import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalScenario,
    Department,
    GlobalConfig,
    KeyRiskIndicator,
    Risk,
    User,
)
from app.models.approval_request import ApprovalStatus
from app.models.global_config import clear_config_cache
from app.models.kri_history import KRIValueHistory
from app.models.notification import Notification, NotificationType
from app.models.risk import RiskStatus
from app.models.user import AccessScope
from app.services import _notification_approval_helpers as notification_approval_helpers
from app.services._riskhub_config.approval_scenario_roles import APPROVER_ROLES, set_approval_scenario_roles
from app.services.approval_execution_service import approve_request_workflow
from app.services.approval_scenario_policy import can_view_approval_resource
from app.services.outbox import dispatch_pending_outbox_events
from tests.backend.pytest.factories import create_test_control, create_test_kri, create_test_risk


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


async def _upsert_approval_scenario(
    db_session: AsyncSession,
    *,
    key: str,
    requires_approval: bool,
    approver_roles: list[str],
) -> ApprovalScenario:
    result = await db_session.execute(select(ApprovalScenario).where(ApprovalScenario.key == key))
    scenario = result.scalar_one_or_none()
    if scenario is None:
        scenario = ApprovalScenario(
            key=key,
            display_name=key.replace("_", " ").title(),
            description=f"Test scenario {key}",
            requires_approval=requires_approval,
        )
        db_session.add(scenario)
    scenario.requires_approval = requires_approval
    set_approval_scenario_roles(scenario, approver_roles)
    await db_session.commit()
    await db_session.refresh(scenario)
    return scenario


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
        risk_id = test_risk.id
        db_session.expire_all()
        response = await client_risk_manager.get(f"/api/v1/risks/{risk_id}")
        data = response.json()
        assert data["status"] == "active"
        assert data["is_archived"] is True

    async def test_kri_value_submission_approval_applies_structured_pending_changes(
        self,
        client_approval_requester: AsyncClient,
        client_risk_manager: AsyncClient,
        db_session: AsyncSession,
        test_department,
        test_user_approval_requester: User,
        test_user_risk_manager: User,
        monkeypatch: pytest.MonkeyPatch,
    ):
        """KRI submission approval round-trips old/new pending changes into a history write."""
        from datetime import UTC, datetime

        import app.services._kri_history.clock as kri_clock

        monkeypatch.setattr(kri_clock, "today", lambda: kri_clock.date(2026, 4, 10))
        monkeypatch.setattr(
            "app.services._kri_history.approval_intake.utc_now",
            lambda: datetime(2026, 4, 10, 12, 0, tzinfo=UTC),
        )
        await _upsert_approval_scenario(
            db_session,
            key="kri_value_submit",
            requires_approval=True,
            approver_roles=["risk_manager", "cro"],
        )
        risk = await create_test_risk(
            db_session,
            department_id=test_department.id,
            owner_id=test_user_risk_manager.id,
            risk_id_code="R-KRI-SUBMIT-APPROVAL",
            name="KRI Submit Approval Risk",
        )
        kri = await create_test_kri(
            db_session,
            risk_id=risk.id,
            metric_name="KRI Submit Approval",
            overrides={"frequency": "quarterly", "reporting_owner_id": test_user_approval_requester.id},
        )
        kri_id = kri.id

        submit_response = await client_approval_requester.post(f"/api/v1/kris/{kri.id}/values", json={"value": 64.0})
        assert submit_response.status_code == 202
        approval_id = submit_response.json()["approval_id"]
        pending_changes = submit_response.json()["pending_changes"]
        assert pending_changes["current_value"] == {"old": 50.0, "new": 64.0}
        assert pending_changes["period_end"]["new"] == "2026-03-31"
        assert pending_changes["recorded_at"]["new"]

        approve_response = await client_risk_manager.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Apply submitted KRI value"},
        )
        assert approve_response.status_code == 200
        assert approve_response.json()["status"] == "approved"

        db_session.expire_all()
        persisted_kri = await db_session.get(KeyRiskIndicator, kri_id)
        assert persisted_kri is not None
        assert persisted_kri.current_value == 64.0
        assert persisted_kri.last_period_end == kri_clock.date(2026, 3, 31)

        history_entry = (
            await db_session.execute(
                select(KRIValueHistory).where(
                    KRIValueHistory.kri_id == kri_id,
                    KRIValueHistory.period_end == kri_clock.date(2026, 3, 31),
                )
            )
        ).scalar_one()
        assert history_entry.value == 64.0

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
        assert persisted_risk.is_archived is True

    async def test_primary_approval_escalation_rolls_back_on_commit_failure(
        self,
        db_session: AsyncSession,
        test_department,
        test_user_employee: User,
        test_user_risk_manager: User,
        monkeypatch: pytest.MonkeyPatch,
    ):
        """Escalation failures should rollback the approval transition and keep the session usable."""
        risk = await _create_risk_for_delete_workflow(
            db_session,
            risk_id_code="R-DEL-ROLLBACK-001",
            name="Escalation Rollback Risk",
            department_id=test_department.id,
            owner_id=test_user_employee.id,
            net_score=10,
        )
        risk_id = risk.id

        approval = ApprovalRequest(
            resource_type=ApprovalResourceType.RISK,
            resource_id=risk.id,
            resource_name=risk.name,
            action_type=ApprovalActionType.DELETE,
            requested_by_id=test_user_risk_manager.id,
            primary_approver_id=test_user_employee.id,
            reason="Rollback regression test",
            status=ApprovalStatus.PENDING,
            requires_privileged_approval=True,
        )
        db_session.add(approval)
        await db_session.commit()
        await db_session.refresh(approval)
        approval_id = approval.id

        async def failing_commit():
            raise RuntimeError("commit failed")

        monkeypatch.setattr(db_session, "commit", failing_commit)

        with pytest.raises(RuntimeError, match="commit failed"):
            await approve_request_workflow(
                db_session,
                approval_id,
                test_user_employee,
                "Owner approval before privileged review",
            )

        db_session.expire_all()
        refreshed_approval = await _load_approval(db_session, approval_id)
        assert refreshed_approval.status == ApprovalStatus.PENDING
        assert refreshed_approval.primary_approved_at is None
        assert refreshed_approval.resolved_by_id is None

        persisted_risk = await _load_risk(db_session, risk_id)
        assert persisted_risk.status == RiskStatus.active.value

    async def test_low_risk_delete_finalizes_after_primary_approval(
        self,
        client_approval_requester: AsyncClient,
        client_employee: AsyncClient,
        client_risk_manager: AsyncClient,
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
        assert persisted_risk.is_archived is True

    async def test_disabled_risk_delete_scenario_applies_directly(
        self,
        client_approval_requester: AsyncClient,
        db_session: AsyncSession,
        test_department,
        test_user_employee: User,
    ):
        """A disabled approval scenario makes the authorized delete mutation apply directly."""
        await _upsert_approval_scenario(
            db_session,
            key="risk_delete",
            requires_approval=False,
            approver_roles=list(APPROVER_ROLES),
        )
        risk = await _create_risk_for_delete_workflow(
            db_session,
            risk_id_code="R-DEL-SCENARIO-OFF",
            name="Scenario Disabled Delete",
            department_id=test_department.id,
            owner_id=test_user_employee.id,
            net_score=3,
        )

        response = await client_approval_requester.delete(
            f"/api/v1/risks/{risk.id}?reason=Scenario disabled delete"
        )

        assert response.status_code == 204
        persisted_risk = await _load_risk(db_session, risk.id)
        assert persisted_risk.is_archived is True
        approvals = (
            await db_session.execute(
                select(ApprovalRequest).where(
                    ApprovalRequest.resource_type == ApprovalResourceType.RISK,
                    ApprovalRequest.resource_id == risk.id,
                )
            )
        ).scalars().all()
        assert approvals == []

    async def test_scenario_approver_roles_restrict_resolution(
        self,
        client_approval_requester: AsyncClient,
        client_risk_manager: AsyncClient,
        client_cro: AsyncClient,
        db_session: AsyncSession,
        test_department,
        test_user_employee: User,
    ):
        """Scenario approver roles restrict who can approve a newly created request."""
        await _upsert_approval_scenario(
            db_session,
            key="risk_delete",
            requires_approval=True,
            approver_roles=["cro"],
        )
        risk = await _create_risk_for_delete_workflow(
            db_session,
            risk_id_code="R-DEL-CRO-ONLY",
            name="CRO Only Delete",
            department_id=test_department.id,
            owner_id=test_user_employee.id,
            net_score=3,
        )

        delete_response = await client_approval_requester.delete(
            f"/api/v1/risks/{risk.id}?reason=CRO only scenario"
        )
        assert delete_response.status_code == 202
        approval_id = delete_response.json()["approval_id"]

        approval = await _load_approval(db_session, approval_id)
        assert approval.scenario_key == "risk_delete"
        assert approval.scenario_approver_roles == ["cro"]

        blocked_response = await client_risk_manager.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Risk manager should not approve"},
        )
        assert blocked_response.status_code == 403

        approved_response = await client_cro.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "CRO allowed"},
        )
        assert approved_response.status_code == 200
        assert approved_response.json()["status"] == "approved"

    async def test_scenario_requester_cannot_reject_own_request(
        self,
        client_approval_requester: AsyncClient,
        db_session: AsyncSession,
        test_department,
        test_user_employee: User,
    ):
        """Scenario role matches must not let requesters reject their own approval requests."""
        await _upsert_approval_scenario(
            db_session,
            key="risk_delete",
            requires_approval=True,
            approver_roles=["approval_requester"],
        )
        risk = await _create_risk_for_delete_workflow(
            db_session,
            risk_id_code="R-DEL-REQUESTER-REJECT",
            name="Requester Reject Scenario",
            department_id=test_department.id,
            owner_id=test_user_employee.id,
            net_score=3,
        )

        delete_response = await client_approval_requester.delete(
            f"/api/v1/risks/{risk.id}?reason=Requester reject regression"
        )
        assert delete_response.status_code == 202
        approval_id = delete_response.json()["approval_id"]

        approval = await _load_approval(db_session, approval_id)
        assert approval.scenario_key == "risk_delete"
        assert approval.scenario_approver_roles == ["approval_requester", "risk_manager", "cro"]

        detail_response = await client_approval_requester.get(f"/api/v1/approvals/{approval_id}")
        assert detail_response.status_code == 200
        detail = detail_response.json()
        assert detail["can_approve"] is False
        assert detail["can_reject"] is False
        assert detail["capabilities"]["can_approve"] is False
        assert detail["capabilities"]["can_reject"] is False
        assert detail["capabilities"]["can_cancel_as_requester"] is True

        reject_response = await client_approval_requester.post(
            f"/api/v1/approvals/{approval_id}/reject",
            json={"resolution_notes": "Requester should cancel instead"},
        )
        assert reject_response.status_code == 403

        cancel_response = await client_approval_requester.post(f"/api/v1/approvals/{approval_id}/cancel")
        assert cancel_response.status_code == 200
        assert cancel_response.json()["status"] == "cancelled"

    async def test_cross_department_scenario_approver_without_resource_visibility_is_denied(
        self,
        client_approval_requester: AsyncClient,
        client: AsyncClient,
        db_session: AsyncSession,
        test_department,
        test_role_employee,
        test_user_risk_manager: User,
    ):
        """Scenario role matches do not grant cross-department approval access by themselves."""
        await _upsert_approval_scenario(
            db_session,
            key="risk_delete",
            requires_approval=True,
            approver_roles=["employee", "risk_manager", "cro"],
        )
        other_department = Department(
            name="Scenario Other Department",
            code="SCENARIO-OTHER",
            is_active=True,
        )
        db_session.add(other_department)
        await db_session.commit()
        await db_session.refresh(other_department)

        cross_department_employee = User(
            name="Cross Department Scenario Employee",
            email="cross.department.scenario.employee@test.com",
            department_id=other_department.id,
            role_id=test_role_employee.id,
            is_active=True,
            access_scope=AccessScope.DEPARTMENT,
        )
        db_session.add(cross_department_employee)
        await db_session.commit()
        await db_session.refresh(cross_department_employee)

        risk = await _create_risk_for_delete_workflow(
            db_session,
            risk_id_code="R-DEL-SCENARIO-SCOPE",
            name="Scenario Scope Risk",
            department_id=test_department.id,
            owner_id=test_user_risk_manager.id,
            net_score=3,
        )

        delete_response = await client_approval_requester.delete(
            f"/api/v1/risks/{risk.id}?reason=Scenario scope regression"
        )
        assert delete_response.status_code == 202
        approval_id = delete_response.json()["approval_id"]
        headers = {"X-Mock-User-Id": str(cross_department_employee.id)}

        detail_response = await client.get(f"/api/v1/approvals/{approval_id}", headers=headers)
        assert detail_response.status_code == 403

        approve_response = await client.post(
            f"/api/v1/approvals/{approval_id}/approve",
            headers=headers,
            json={"resolution_notes": "Should not approve invisible resource"},
        )
        assert approve_response.status_code == 403

        reject_response = await client.post(
            f"/api/v1/approvals/{approval_id}/reject",
            headers=headers,
            json={"resolution_notes": "Should not reject invisible resource"},
        )
        assert reject_response.status_code == 403

        approval = await _load_approval(db_session, approval_id)
        assert approval.status == ApprovalStatus.PENDING
        persisted_risk = await _load_risk(db_session, risk.id)
        assert persisted_risk.status == RiskStatus.active.value

    async def test_approval_resource_visibility_helper_checks_risk_control_and_kri(
        self,
        db_session: AsyncSession,
        test_department,
        test_user_employee: User,
    ):
        """Scenario approval scoping uses canonical read checks for every approval resource type."""
        risk = await _create_risk_for_delete_workflow(
            db_session,
            risk_id_code="R-APPROVAL-VISIBILITY",
            name="Approval Visibility Risk",
            department_id=test_department.id,
            owner_id=test_user_employee.id,
            net_score=3,
        )
        control = await create_test_control(
            db_session,
            department_id=test_department.id,
            owner_id=test_user_employee.id,
            name="Approval Visibility Control",
        )
        kri = await create_test_kri(
            db_session,
            risk_id=risk.id,
            metric_name="Approval Visibility KRI",
        )

        for resource_type, resource_id in (
            (ApprovalResourceType.RISK, risk.id),
            (ApprovalResourceType.CONTROL, control.id),
            (ApprovalResourceType.KRI, kri.id),
        ):
            approval = ApprovalRequest(
                resource_type=resource_type,
                resource_id=resource_id,
                resource_name=f"{resource_type.value} visibility check",
                action_type=ApprovalActionType.EDIT,
                requested_by_id=test_user_employee.id,
                primary_approver_id=test_user_employee.id,
                status=ApprovalStatus.PENDING,
            )

            assert await can_view_approval_resource(db_session, test_user_employee, approval) is True

    @pytest.mark.parametrize(
        "resource_type",
        [ApprovalResourceType.RISK, ApprovalResourceType.CONTROL, ApprovalResourceType.KRI],
    )
    async def test_notification_recipients_skip_hidden_approval_resource(
        self,
        db_session: AsyncSession,
        test_user_employee: User,
        resource_type: ApprovalResourceType,
        monkeypatch: pytest.MonkeyPatch,
    ):
        other_department = Department(name=f"Hidden Approval {resource_type.value}", code=f"HID-{resource_type.value}")
        db_session.add(other_department)
        await db_session.commit()
        await db_session.refresh(other_department)

        risk = await create_test_risk(
            db_session,
            department_id=other_department.id,
            owner_id=None,
            risk_id_code=f"R-HIDDEN-{resource_type.value}",
            name=f"Hidden {resource_type.value} Risk",
        )
        resource_id = risk.id
        if resource_type == ApprovalResourceType.CONTROL:
            control = await create_test_control(
                db_session,
                department_id=other_department.id,
                owner_id=None,
                name=f"Hidden {resource_type.value} Control",
            )
            resource_id = control.id
        elif resource_type == ApprovalResourceType.KRI:
            kri = await create_test_kri(
                db_session,
                risk_id=risk.id,
                metric_name=f"Hidden {resource_type.value} KRI",
            )
            resource_id = kri.id

        async def _candidates(_db: AsyncSession, _approval: ApprovalRequest) -> list[User]:
            return [test_user_employee]

        monkeypatch.setattr(
            notification_approval_helpers,
            "load_scenario_approval_notification_candidates",
            _candidates,
        )
        approval = ApprovalRequest(
            resource_type=resource_type,
            resource_id=resource_id,
            resource_name=f"{resource_type.value} hidden notification check",
            action_type=ApprovalActionType.EDIT,
            requested_by_id=test_user_employee.id,
            status=ApprovalStatus.PENDING,
        )

        recipients, skipped = await notification_approval_helpers.eligible_approval_notification_recipients(
            db_session,
            approval,
        )

        assert recipients == []
        assert skipped["hidden_resource"] == 1

    async def test_non_privileged_scenario_approver_finalizes_non_tiered_request(
        self,
        client_approval_requester: AsyncClient,
        client_employee: AsyncClient,
        client_risk_manager: AsyncClient,
        db_session: AsyncSession,
        test_department,
        test_user_risk_manager: User,
    ):
        """A matched scenario approver can finalize a non-tiered approval without being primary approver."""
        await _upsert_approval_scenario(
            db_session,
            key="risk_delete",
            requires_approval=True,
            approver_roles=["employee", "risk_manager", "cro"],
        )
        risk = await _create_risk_for_delete_workflow(
            db_session,
            risk_id_code="R-DEL-SCENARIO-EMPLOYEE",
            name="Employee Scenario Approval",
            department_id=test_department.id,
            owner_id=test_user_risk_manager.id,
            net_score=3,
        )

        delete_response = await client_approval_requester.delete(
            f"/api/v1/risks/{risk.id}?reason=Employee scenario approver"
        )
        assert delete_response.status_code == 202
        approval_id = delete_response.json()["approval_id"]

        detail_response = await client_employee.get(f"/api/v1/approvals/{approval_id}")
        assert detail_response.status_code == 200
        capabilities = detail_response.json()["capabilities"]
        assert capabilities["can_approve"] is True
        assert capabilities["is_primary_approver"] is False
        assert capabilities["would_apply_side_effects_on_approve"] is True

        approve_response = await client_employee.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Employee scenario approval"},
        )
        assert approve_response.status_code == 200
        assert approve_response.json()["status"] == "approved"

        approval = await _load_approval(db_session, approval_id)
        assert approval.status == ApprovalStatus.APPROVED
        persisted_risk = await _load_risk(db_session, risk.id)
        assert persisted_risk.is_archived is True

    async def test_non_privileged_scenario_approver_escalates_tiered_request(
        self,
        client_approval_requester: AsyncClient,
        client_employee: AsyncClient,
        client_risk_manager: AsyncClient,
        db_session: AsyncSession,
        test_department,
        test_user_risk_manager: User,
    ):
        """A matched non-privileged scenario approver performs only first-stage approval on tiered requests."""
        await _upsert_approval_scenario(
            db_session,
            key="risk_delete",
            requires_approval=True,
            approver_roles=["employee", "risk_manager", "cro"],
        )
        risk = await _create_risk_for_delete_workflow(
            db_session,
            risk_id_code="R-DEL-SCENARIO-TIER",
            name="Employee Scenario Tiered Approval",
            department_id=test_department.id,
            owner_id=test_user_risk_manager.id,
            net_score=10,
        )

        delete_response = await client_approval_requester.delete(
            f"/api/v1/risks/{risk.id}?reason=Employee scenario tiered approver"
        )
        assert delete_response.status_code == 202
        approval_id = delete_response.json()["approval_id"]

        detail_response = await client_employee.get(f"/api/v1/approvals/{approval_id}")
        assert detail_response.status_code == 200
        capabilities = detail_response.json()["capabilities"]
        assert capabilities["can_approve"] is True
        assert capabilities["is_primary_approver"] is False
        assert capabilities["requires_privileged_resolution"] is True
        assert capabilities["would_apply_side_effects_on_approve"] is False

        first_stage_response = await client_employee.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Employee scenario first-stage approval"},
        )
        assert first_stage_response.status_code == 200
        assert first_stage_response.json()["status"] == "pending_privileged"

        approval = await _load_approval(db_session, approval_id)
        assert approval.status == ApprovalStatus.PENDING_PRIVILEGED
        assert approval.primary_approved_at is not None
        persisted_risk = await _load_risk(db_session, risk.id)
        assert persisted_risk.status == RiskStatus.active.value

        final_response = await client_risk_manager.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Risk manager final approval"},
        )
        assert final_response.status_code == 200
        assert final_response.json()["status"] == "approved"

        approval = await _load_approval(db_session, approval_id)
        assert approval.status == ApprovalStatus.APPROVED
        persisted_risk = await _load_risk(db_session, risk.id)
        assert persisted_risk.is_archived is True

    async def test_live_scenario_save_prevents_tiered_request_deadlock(
        self,
        client_approval_requester: AsyncClient,
        client_employee: AsyncClient,
        client_risk_manager: AsyncClient,
        client_cro: AsyncClient,
        db_session: AsyncSession,
        test_department,
        test_user_employee: User,
        test_user_risk_manager: User,
    ):
        """Saving only non-privileged roles still snapshots privileged finishers for tiered approvals."""
        await _upsert_approval_scenario(
            db_session,
            key="risk_delete",
            requires_approval=True,
            approver_roles=["risk_manager", "cro"],
        )
        save_response = await client_cro.patch(
            "/api/v1/riskhub/approval-scenarios/risk_delete",
            json={"approver_roles": ["risk_owner"], "requires_approval": True},
        )
        assert save_response.status_code == 200
        assert save_response.json()["approver_roles"] == list(APPROVER_ROLES)

        risk = await _create_risk_for_delete_workflow(
            db_session,
            risk_id_code="R-DEL-LIVE-SCENARIO-TIER",
            name="Live Scenario Tiered Approval",
            department_id=test_department.id,
            owner_id=test_user_employee.id,
            net_score=10,
        )

        delete_response = await client_approval_requester.delete(
            f"/api/v1/risks/{risk.id}?reason=Live scenario tiered approver"
        )
        assert delete_response.status_code == 202
        approval_id = delete_response.json()["approval_id"]

        approval = await _load_approval(db_session, approval_id)
        assert approval.scenario_approver_roles == list(APPROVER_ROLES)

        first_stage_response = await client_employee.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Risk owner scenario first-stage approval"},
        )
        assert first_stage_response.status_code == 200
        assert first_stage_response.json()["status"] == "pending_privileged"

        final_response = await client_risk_manager.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Risk manager final approval"},
        )
        assert final_response.status_code == 200
        assert final_response.json()["status"] == "approved"

        approval = await _load_approval(db_session, approval_id)
        assert approval.status == ApprovalStatus.APPROVED

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
        """Test approval resolvers can edit/delete immediately without approval."""
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

    async def test_priority_risk_edit_risk_owner_scenario_routes_to_owner_and_applies(
        self,
        client_approval_requester: AsyncClient,
        client_employee: AsyncClient,
        client_risk_manager: AsyncClient,
        db_session: AsyncSession,
        test_department,
        test_user_employee: User,
        seed_risk_types,
    ):
        """A risk_owner priority-edit scenario snapshots the non-requester owner before role matching."""
        await _upsert_approval_scenario(
            db_session,
            key="risk_edit_priority",
            requires_approval=True,
            approver_roles=["risk_owner"],
        )
        priority_risk = Risk(
            risk_id_code="PRIO-RISK-OWNER-EDIT",
            name="Priority Risk Owner Edit",
            process="Priority Process",
            description="Original priority risk description",
            department_id=test_department.id,
            owner_id=test_user_employee.id,
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

        response = await client_approval_requester.patch(
            f"/api/v1/risks/{priority_risk.id}",
            json={"description": "Risk owner scenario description"},
        )

        assert response.status_code == 202
        approval_id = response.json()["approval_id"]
        approval = await _load_approval(db_session, approval_id)
        assert approval.primary_approver_id == test_user_employee.id
        assert approval.scenario_approver_roles == list(APPROVER_ROLES)

        pending_response = await client_employee.get("/api/v1/approvals?status=pending")
        assert pending_response.status_code == 200
        pending_ids = {item["id"] for item in pending_response.json()["items"]}
        assert approval_id in pending_ids

        approve_response = await client_employee.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Owner approves priority edit"},
        )
        assert approve_response.status_code == 200
        assert approve_response.json()["status"] == "pending_privileged"

        final_response = await client_risk_manager.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Privileged approval for priority edit"},
        )
        assert final_response.status_code == 200
        assert final_response.json()["status"] == "approved"

        persisted_risk = await _load_risk(db_session, priority_risk.id)
        assert persisted_risk.description == "Risk owner scenario description"

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
