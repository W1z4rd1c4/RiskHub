from __future__ import annotations

import pytest

pytestmark = pytest.mark.contract


def test_issue_shared_barrel_no_underscored_reexports() -> None:
    from app.api.v1.endpoints.issues import _shared as barrel

    underscored = sorted(name for name in barrel.__all__ if name.startswith("_"))
    assert underscored == [], f"barrel must not re-export underscored names: {underscored}"


def test_issue_shared_barrel_explicit_guards() -> None:
    from app.api.v1.endpoints.issues import _shared as barrel

    for forbidden in (
        "_active_exception",
        "_ensure_owner_assignable",
        "_get_active_user_with_permissions",
        "_get_issue_with_relations",
        "_get_readable_issue_or_404",
        "_get_writable_issue_or_404",
        "_issue_link_department_ids",
        "_issue_source_link",
        "_label_or_fallback",
        "_link_display",
        "_link_matches_issue_source",
        "_notify_exception_approved",
        "_notify_exception_requested",
        "_notify_issue_assigned",
        "_resolve_user_name",
        "_resolve_vendor_department_and_access",
        "_serialize_exception",
        "_serialize_exception_with_user_names",
        "_serialize_issue_link",
        "_serialize_issue_read",
        "_serialize_issue_summary",
        "_serialize_remediation",
        "_validate_user_exists",
    ):
        assert forbidden not in barrel.__all__, f"{forbidden!r} re-introduced in barrel"
