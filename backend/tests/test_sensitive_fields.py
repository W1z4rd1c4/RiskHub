"""Tests for sensitive field detection and approval helpers."""

from app.core.permissions import has_sensitive_field_changes


class TestHasSensitiveFieldChanges:
    """Tests for has_sensitive_field_changes function."""

    def test_clearing_owner_requires_approval(self):
        """Clearing owner_id to None should require approval."""
        old = {"owner_id": 5, "department_id": 1, "category": "High", "is_priority": False}
        new = {"owner_id": None}
        has_changes, changes = has_sensitive_field_changes("risk", old, new)
        assert has_changes
        assert "owner_id" in changes
        assert changes["owner_id"] == {"old": 5, "new": None}

    def test_clearing_department_requires_approval(self):
        """Clearing department_id to None should require approval."""
        old = {"owner_id": 5, "department_id": 1, "category": "High", "is_priority": False}
        new = {"department_id": None}
        has_changes, changes = has_sensitive_field_changes("risk", old, new)
        assert has_changes
        assert "department_id" in changes

    def test_priority_upgrade_no_approval(self):
        """Upgrading is_priority from false to true should NOT require approval."""
        old = {"owner_id": None, "department_id": 1, "category": "High", "is_priority": False}
        new = {"is_priority": True}
        has_changes, _ = has_sensitive_field_changes("risk", old, new)
        assert not has_changes

    def test_priority_downgrade_requires_approval(self):
        """Downgrading is_priority from true to false should require approval."""
        old = {"owner_id": None, "department_id": 1, "category": "High", "is_priority": True}
        new = {"is_priority": False}
        has_changes, changes = has_sensitive_field_changes("risk", old, new)
        assert has_changes
        assert "is_priority" in changes

    def test_field_not_in_payload_no_change(self):
        """Fields not in the payload should not trigger approval."""
        old = {"owner_id": 5, "department_id": 1, "category": "High", "is_priority": False}
        new = {"category": "Low"}  # Only changing category, not owner_id
        has_changes, changes = has_sensitive_field_changes("risk", old, new)
        assert has_changes
        assert "category" in changes
        assert "owner_id" not in changes

    def test_no_change_same_value(self):
        """Setting same value should not trigger approval."""
        old = {"owner_id": 5, "department_id": 1, "category": "High", "is_priority": False}
        new = {"owner_id": 5}  # Same value
        has_changes, _ = has_sensitive_field_changes("risk", old, new)
        assert not has_changes

    def test_control_sensitive_fields(self):
        """Control-specific sensitive fields work correctly."""
        old = {"control_owner_id": 10, "department_id": 2}
        new = {"control_owner_id": None}
        has_changes, changes = has_sensitive_field_changes("control", old, new)
        assert has_changes
        assert "control_owner_id" in changes
