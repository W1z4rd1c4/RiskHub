"""Permission checking utilities for role-based access control.

This module provides:
1. Department scoping helpers - control access based on user department assignment
2. Permission evaluation - check user permissions against roles
3. Approval/committee access helpers - determine who can approve changes
4. Sensitive field detection - identify changes requiring approval
5. Cross-department ownership helpers - KRI reporting owners, control owners
"""

from ._permissions.entity_access import (
    can_read_control_id,
    can_read_kri_id,
    can_read_risk_id,
    can_read_vendor_id,
)
from ._permissions.evaluation import (
    can_manage_users,
    can_resolve_approvals,
    can_view_risk_committee,
    ensure_business_view_access,
    get_effective_permissions,
    has_any_role,
    has_permission,
    is_platform_admin,
    is_role,
)
from ._permissions.issues import (
    can_read_issue_id,
    can_write_issue_id,
    get_issue_scope_clause,
    is_issue_owner_assignable_to_department,
)
from ._permissions.ownership import (
    get_control_ids_where_owner,
    get_kri_ids_where_reporting_owner,
    get_risk_ids_where_control_owner,
    get_risk_ids_where_kri_reporting_owner,
    is_control_owner,
    is_kri_reporting_owner,
    is_risk_control_owner,
    is_risk_kri_reporting_owner,
)
from ._permissions.scoping import (
    can_access_department_id,
    can_read_vendor,
    can_see_all_departments,
    check_department_access,
    get_scope_label,
    get_user_department_ids,
    is_privileged_user,
    is_vendor_owner,
    redact_name_if_no_access,
)
from ._permissions.sensitive import (
    has_sensitive_field_changes,
    is_high_risk_for_approval,
    is_high_risk_for_approval_async,
)

__all__ = [
    "is_privileged_user",
    "can_see_all_departments",
    "get_user_department_ids",
    "check_department_access",
    "get_scope_label",
    "can_read_vendor",
    "is_vendor_owner",
    "has_permission",
    "can_access_department_id",
    "redact_name_if_no_access",
    "can_read_risk_id",
    "can_read_control_id",
    "can_read_vendor_id",
    "can_read_kri_id",
    "get_issue_scope_clause",
    "can_read_issue_id",
    "can_write_issue_id",
    "is_issue_owner_assignable_to_department",
    "get_effective_permissions",
    "can_manage_users",
    "ensure_business_view_access",
    "is_role",
    "is_platform_admin",
    "has_any_role",
    "can_resolve_approvals",
    "can_view_risk_committee",
    "is_high_risk_for_approval",
    "is_high_risk_for_approval_async",
    "has_sensitive_field_changes",
    "is_kri_reporting_owner",
    "is_risk_kri_reporting_owner",
    "get_kri_ids_where_reporting_owner",
    "get_risk_ids_where_kri_reporting_owner",
    "is_control_owner",
    "is_risk_control_owner",
    "get_control_ids_where_owner",
    "get_risk_ids_where_control_owner",
]
