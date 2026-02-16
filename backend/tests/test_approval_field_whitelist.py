"""Tests for approval field whitelist security.

Verifies that the EDITABLE_FIELDS whitelist prevents injection of
protected fields like id, created_at, created_by_id through pending_changes.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.approval_request import ApprovalResourceType
from app.services.approval_execution_service import (
    EDITABLE_FIELDS,
    _apply_edit_risk_control,
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
    async def test_risk_edit_rejects_protected_field(self):
        """Attempting to edit 'id' via pending_changes should be rejected."""
        # This test verifies the whitelist is checked, not just defined
        from app.models import Risk

        # Mock objects
        mock_db = AsyncMock()
        mock_risk = MagicMock(spec=Risk)
        mock_risk.id = 999
        mock_risk.gross_score = 10
        mock_risk.net_score = 5
        mock_risk.gross_probability = 2
        mock_risk.gross_impact = 5
        mock_risk.net_probability = 1
        mock_risk.net_impact = 5
        mock_risk.department_id = 1

        # Setup mock to return risk
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_risk
        mock_db.execute.return_value = mock_result

        # Create approval with injection attempt
        mock_approval = MagicMock()
        mock_approval.id = 1
        mock_approval.resource_type = ApprovalResourceType.RISK
        mock_approval.resource_id = 999
        mock_approval.pending_changes = {
            "id": {"old": 999, "new": 1},  # Injection attempt!
            "name": {"old": "Old", "new": "New"},  # Legitimate edit
        }

        mock_user = MagicMock()
        mock_user.id = 1

        # Execute
        with patch("app.core.activity_logger.log_activity"):
            await _apply_edit_risk_control(mock_db, mock_approval, mock_user)

        # Verify id was NOT changed (injection blocked)
        assert mock_risk.id == 999, "id should not have been modified"

        # Verify name WAS changed (legitimate edit)
        assert mock_risk.name == "New", "name should have been modified"
