"""Tests for approval field whitelist security.

Verifies that the EDITABLE_FIELDS whitelist prevents injection of
protected fields like id, created_at, created_by_id through pending_changes.
"""

import pytest

from app.models import ApprovalActionType, ApprovalRequest, ApprovalStatus, Risk
from app.services.approval_execution_service import (
    EDITABLE_FIELDS,
    approve_request_workflow,
)


class TestFieldWhitelists:
    """Verify EDITABLE_FIELDS constants are properly defined."""

    def test_risk_whitelist_excludes_protected_fields(self):
        """Risk whitelist should NOT include protected fields."""
        protected = {"id", "created_at", "created_by_id", "updated_at"}
        risk_fields = EDITABLE_FIELDS.get("risk", set())

        for field in protected:
            assert field not in risk_fields, f"{field} should not be editable"

    def test_control_whitelist_excludes_protected_fields(self):
        """Control whitelist should NOT include protected fields."""
        protected = {"id", "created_at", "created_by_id", "updated_at", "updated_by_id"}
        control_fields = EDITABLE_FIELDS.get("control", set())

        for field in protected:
            assert field not in control_fields, f"{field} should not be editable"

    def test_kri_whitelist_excludes_protected_fields(self):
        """KRI whitelist should NOT include protected fields."""
        protected = {"id", "created_at", "risk_id", "is_archived", "archived_at", "archived_by_id"}
        kri_fields = EDITABLE_FIELDS.get("kri", set())

        for field in protected:
            assert field not in kri_fields, f"{field} should not be editable"

    def test_risk_whitelist_includes_business_fields(self):
        """Risk whitelist should include expected business fields."""
        expected = {"name", "description", "gross_probability", "gross_impact"}
        risk_fields = EDITABLE_FIELDS.get("risk", set())

        for field in expected:
            assert field in risk_fields, f"{field} should be editable"

    def test_kri_whitelist_includes_business_fields(self):
        """KRI whitelist should include expected business fields."""
        expected = {"metric_name", "description", "upper_limit", "lower_limit"}
        kri_fields = EDITABLE_FIELDS.get("kri", set())

        for field in expected:
            assert field in kri_fields, f"{field} should be editable"


class TestWhitelistEnforcement:
    """Verify whitelist is actually applied during edit execution."""

    @pytest.mark.asyncio
    async def test_risk_edit_rejects_protected_field(
        self,
        db_session,
        test_department,
        test_user_cro,
        test_user_employee,
    ):
        """Attempting to edit 'id' via pending_changes should be rejected."""
        risk = Risk(
            name="Original",
            risk_id_code="WHITELIST-001",
            process="Whitelist Test",
            risk_type="operational",
            description="Risk for whitelist enforcement",
            department_id=test_department.id,
            owner_id=test_user_employee.id,
            gross_probability=2,
            gross_impact=5,
            gross_score=10,
            net_probability=1,
            net_impact=5,
            net_score=5,
            status="active",
        )
        db_session.add(risk)
        await db_session.commit()
        await db_session.refresh(risk)
        original_risk_id = risk.id

        approval = ApprovalRequest(
            resource_type="risk",
            resource_id=risk.id,
            resource_name=risk.name,
            action_type=ApprovalActionType.EDIT,
            requested_by_id=test_user_employee.id,
            reason="Whitelist enforcement",
            status=ApprovalStatus.PENDING,
            pending_changes={
            "id": {"old": 999, "new": 1},  # Injection attempt!
            "name": {"old": "Old", "new": "New"},  # Legitimate edit
        }
        )
        db_session.add(approval)
        await db_session.commit()
        await db_session.refresh(approval)

        await approve_request_workflow(db_session, approval.id, test_user_cro, "Approved in test")
        await db_session.refresh(risk)

        assert risk.id == original_risk_id, "id should not have been modified"
        assert risk.name == "New", "name should have been modified"
