"""Permission checking utilities for role-based access control.

This module provides:
1. Department scoping helpers - control access based on user department assignment
2. Permission evaluation - check user permissions against roles
3. Approval/committee access helpers - determine who can approve changes
4. Sensitive field detection - identify changes requiring approval
5. Cross-department ownership helpers - KRI reporting owners, control owners
"""
from typing import Optional

from fastapi import HTTPException, status

from app.models import User
from app.models.role import RoleType
from app.models.user import AccessScope

# ============================================================================
# Module-level Constants
# ============================================================================

# Sentinel for detecting "field not provided in payload" vs "explicitly set to None"
_NOT_PROVIDED = object()

# Sensitive fields that require approval when changed
SENSITIVE_FIELDS: dict[str, set[str]] = {
    "risk": {"owner_id", "department_id", "category", "is_priority"},
    "control": {"control_owner_id", "department_id"},
    "kri": {},  # KRIs inherit sensitivity from linked risk
}


# ============================================================================
# 1. Department Scoping Helpers
# ============================================================================

def is_privileged_user(user: User) -> bool:
    """Check if user has global access scope (full system access)."""
    return bool(getattr(user, "access_scope", None) == AccessScope.GLOBAL)


def can_see_all_departments(user: User) -> bool:
    """Check if user can see data from all departments."""
    return is_privileged_user(user)


def get_user_department_ids(user: User) -> Optional[list[int]]:
    """
    Get list of department IDs user can access.
    
    Returns:
        None: User is privileged (can see all departments)
        []: User has no department assigned (can see nothing)
        [1, 2, ...]: User can only see these specific departments
    
    Usage in endpoints:
        dept_ids = get_user_department_ids(current_user)
        if dept_ids is not None:  # None = privileged user
            if not dept_ids:
                return []  # No departments = no data
            query = query.filter(Model.department_id.in_(dept_ids))
    """
    if can_see_all_departments(user):
        return None  # None means "all departments" (privileged)

    scope = getattr(user, "access_scope", AccessScope.DEPARTMENT)
    if scope == AccessScope.MANAGER:
        if user.department_id:
            return [user.department_id]
        if user.manager and user.manager.department_id:
            return [user.manager.department_id]
        return []  # Empty list means no access

    if user.department_id:
        return [user.department_id]

    return []  # Empty list means no access


def check_department_access(
    item_dept_id: int | None,
    current_user: User,
) -> None:
    """
    Raise 403 if user cannot access this department's resources.
    
    Args:
        item_dept_id: Department ID of the resource being accessed
        current_user: The authenticated user
        
    Raises:
        HTTPException 403: If user doesn't have access to the department
    """
    if item_dept_id is None:
        # Null department = only privileged users can access unassigned items
        if not is_privileged_user(current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to unassigned items"
            )
        return  # Privileged user can access
    
    dept_ids = get_user_department_ids(current_user)
    if dept_ids is None:
        return  # Privileged user - full access
    
    if item_dept_id not in dept_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this department's resources"
        )


def get_scope_label(user: User) -> str:
    """Return derived scope label: all, dept, none."""
    dept_ids = get_user_department_ids(user)
    if dept_ids is None:
        return "all"
    if not dept_ids:
        return "none"
    return "dept"


def can_read_vendor(vendor, current_user: User) -> bool:
    """
    Vendor visibility rule (Phase 18):
    - Unassigned vendors (department_id is None): privileged users only
    - Privileged users: all vendors
    - Dept-scoped users: vendors in their department(s) OR where they are outsourcing owner
    """
    vendor_dept_id = getattr(vendor, "department_id", None)
    vendor_owner_id = getattr(vendor, "outsourcing_owner_user_id", None)

    if vendor_dept_id is None:
        return is_privileged_user(current_user)

    dept_ids = get_user_department_ids(current_user)
    if dept_ids is None:
        return True
    if vendor_dept_id in dept_ids:
        return True
    return bool(vendor_owner_id == current_user.id)


def is_vendor_owner(vendor, current_user: User) -> bool:
    return bool(getattr(vendor, "outsourcing_owner_user_id", None) == current_user.id)


# ============================================================================
# 2. Permission Evaluation
# ============================================================================

def has_permission(user: User, resource: str, action: str) -> bool:
    """
    Check if user has specific permission.
    
    Args:
        user: User to check permissions for
        resource: Resource name (e.g., 'risks', 'controls')
        action: Action name (e.g., 'read', 'write', 'delete')
        
    Returns:
        True if user has permission, False otherwise
    """
    if not user.role or not user.role.permissions:
        return False
    for rp in user.role.permissions:
        perm = rp.permission
        resource_match = perm.resource == "*" or perm.resource == resource
        action_match = perm.action == "*" or perm.action == action
        if resource_match and action_match:
            return True
    return False


def can_access_department_id(user: User, dept_id: int | None) -> bool:
    """
    Department visibility rule:
    - Privileged users (global scope): can access any department, including unassigned (None)
    - Department-scoped users: can access only their department(s); unassigned (None) is not accessible
    """
    dept_ids = get_user_department_ids(user)
    if dept_ids is None:
        return True
    if dept_id is None:
        return False
    return dept_id in dept_ids


def redact_name_if_no_access(name: str | None, allowed: bool) -> str | None:
    return name if allowed else None


async def can_read_risk_id(db, user: User, risk_id: int) -> bool:
    """
    Risk visibility rule:
    - Must have risks:read permission
    - Must be in-scope by department OR be a KRI reporting owner OR control owner on the risk
    """
    if not has_permission(user, "risks", "read"):
        return False

    if await is_risk_kri_reporting_owner(db, user.id, risk_id):
        return True
    if await is_risk_control_owner(db, user.id, risk_id):
        return True

    from sqlalchemy import select

    from app.models import Risk

    row = (await db.execute(select(Risk.id, Risk.department_id).where(Risk.id == risk_id))).one_or_none()
    if row is None:
        return False
    _, dept_id = row
    return can_access_department_id(user, dept_id)


async def can_read_control_id(db, user: User, control_id: int) -> bool:
    """
    Control visibility rule:
    - Must have controls:read permission
    - Must be in-scope by department OR be the control owner
    """
    if not has_permission(user, "controls", "read"):
        return False

    if await is_control_owner(db, user.id, control_id):
        return True

    from sqlalchemy import select

    from app.models import Control

    row = (await db.execute(select(Control.id, Control.department_id).where(Control.id == control_id))).one_or_none()
    if row is None:
        return False
    _, dept_id = row
    return can_access_department_id(user, dept_id)


async def can_read_vendor_id(db, user: User, vendor_id: int) -> bool:
    """
    Vendor visibility rule (Phase 18):
    - Must have vendors:read permission
    - Unassigned vendors (department_id is None): privileged users only
    - Privileged users: all vendors
    - Dept-scoped users: vendors in their department(s) OR where they are outsourcing owner
    """
    if not has_permission(user, "vendors", "read"):
        return False

    from sqlalchemy import select

    from app.models import Vendor

    row = (
        await db.execute(
            select(Vendor.id, Vendor.department_id, Vendor.outsourcing_owner_user_id).where(Vendor.id == vendor_id)
        )
    ).one_or_none()
    if row is None:
        return False

    _, dept_id, owner_id = row

    if dept_id is None:
        return is_privileged_user(user)

    dept_ids = get_user_department_ids(user)
    if dept_ids is None:
        return True
    if dept_id in dept_ids:
        return True
    return bool(owner_id == user.id)


async def can_read_kri_id(db, user: User, kri_id: int) -> bool:
    """
    KRI visibility rule:
    - KRIs inherit from risks (they are risk sub-entities)
    - Must have risks:read
    - Must be able to read the linked risk by department/ownership rules
    """
    if not has_permission(user, "risks", "read"):
        return False

    from sqlalchemy import select

    from app.models import KeyRiskIndicator

    risk_id = (await db.execute(select(KeyRiskIndicator.risk_id).where(KeyRiskIndicator.id == kri_id))).scalar_one_or_none()
    if risk_id is None:
        return False
    return await can_read_risk_id(db, user, risk_id)


async def get_issue_scope_clause(db, user: User):
    """
    Build a SQLAlchemy visibility clause for issue queries.

    Returns:
        None: user has global scope (no additional filtering required)
        SQL expression: apply as `.where(clause)` to scope issues
    """
    from sqlalchemy import or_, select

    from app.models import Control, ControlExecution, Issue, IssueLink

    dept_ids = get_user_department_ids(user)
    if dept_ids is None:
        return None

    scope_conditions = [Issue.owner_user_id == user.id]
    if dept_ids:
        scope_conditions.append(Issue.department_id.in_(dept_ids))

    risk_owner_ids = set(await get_risk_ids_where_kri_reporting_owner(db, user.id))
    risk_owner_ids.update(await get_risk_ids_where_control_owner(db, user.id))
    control_owner_ids = set(await get_control_ids_where_owner(db, user.id))

    if risk_owner_ids:
        scope_conditions.append(
            Issue.id.in_(select(IssueLink.issue_id).where(IssueLink.risk_id.in_(risk_owner_ids)))
        )
    if control_owner_ids:
        scope_conditions.append(
            Issue.id.in_(select(IssueLink.issue_id).where(IssueLink.control_id.in_(control_owner_ids)))
        )
        scope_conditions.append(
            Issue.id.in_(
                select(IssueLink.issue_id)
                .join(ControlExecution, IssueLink.execution_id == ControlExecution.id)
                .join(Control, ControlExecution.control_id == Control.id)
                .where(Control.control_owner_id == user.id)
            )
        )

    return or_(*scope_conditions)


async def can_read_issue_id(db, user: User, issue_id: int) -> bool:
    """
    Issue visibility rule:
    - Must have issues:read
    - In-scope by department OR issue owner OR linked ownership exception paths
      (risk/control/KRI/control-execution visibility).
    """
    if not has_permission(user, "issues", "read"):
        return False

    from sqlalchemy import select

    from app.models import Issue

    scope_clause = await get_issue_scope_clause(db, user)
    query = select(Issue.id).where(Issue.id == issue_id)
    if scope_clause is not None:
        query = query.where(scope_clause)
    return (await db.execute(query)).scalar_one_or_none() is not None


async def can_write_issue_id(db, user: User, issue_id: int) -> bool:
    """
    Issue mutation rule:
    - Must have issues:write
    - Must pass issue visibility checks.
    """
    if not has_permission(user, "issues", "write"):
        return False
    return await can_read_issue_id(db, user, issue_id)


async def is_issue_owner_assignable_to_department(
    db,
    *,
    owner_user_id: int | None,
    issue_department_id: int,
) -> bool:
    """
    Owner assignment guard for issues.

    Rules:
    - `None` owner is always allowed (unassigned issue).
    - Owner must exist and be active.
    - Global-scope owners are always assignable.
    - Non-global owners must belong to the issue department.
    """
    if owner_user_id is None:
        return True

    from sqlalchemy import select

    from app.models import Role, User

    row = (
        await db.execute(
            select(
                User.id,
                User.is_active,
                User.access_scope,
                User.department_id,
                Role.name,
            )
            .join(Role, User.role_id == Role.id)
            .where(User.id == owner_user_id)
        )
    ).one_or_none()
    if row is None:
        return False

    _, is_active, access_scope, department_id, role_name = row
    if not bool(is_active):
        return False

    if role_name == RoleType.ADMIN:
        return False

    if access_scope == AccessScope.GLOBAL:
        return True
    return department_id == issue_department_id


def get_effective_permissions(user: User) -> list[str]:
    """Return sorted list of effective permissions (resource:action)."""
    if not user.role or not user.role.permissions:
        return []
    perms = {f"{rp.permission.resource}:{rp.permission.action}" for rp in user.role.permissions}
    return sorted(perms)


def can_manage_users(user: User) -> bool:
    """Check if user can create/edit/delete users."""
    return is_privileged_user(user) and has_permission(user, "users", "write")

def is_role(user: User, role: RoleType) -> bool:
    return bool(getattr(getattr(user, "role", None), "name", None) == role)


def has_any_role(user: User, roles: set[RoleType]) -> bool:
    role_name = getattr(getattr(user, "role", None), "name", None)
    return bool(role_name in roles)


# ============================================================================
# 3. Approval and Committee Access Helpers
# ============================================================================

def can_resolve_approvals(user: User) -> bool:
    """
    Check if user can approve/reject approval requests.
    
    Only privileged users with approvals:write can approve or reject
    deletion requests.
    """
    return is_privileged_user(user) and has_permission(user, "approvals", "write")


def can_view_risk_committee(user: User) -> bool:
    """
    Risk Committee dashboard visibility.

    - Privileged users (global scope) can view the committee dashboard with global data.
    - Department Heads can view the committee dashboard, scoped to their department(s).
    """
    role_name = getattr(getattr(user, "role", None), "name", None)
    if role_name == RoleType.ADMIN:
        return False
    if is_privileged_user(user):
        return True
    return role_name == RoleType.DEPARTMENT_HEAD


# ============================================================================
# 4. Sensitive Field Detection
# ============================================================================

from app.models.global_config import ConfigDefaults, get_config_int


def is_high_risk_for_approval(risk) -> bool:
    """
    Check if a risk meets the approval gating threshold.
    
    A risk requires approval for linked item edits if:
    - is_priority = True, OR
    - net_score >= high_risk_min_net_score threshold (default: 10)
    
    Note: Uses ConfigDefaults for sync contexts. For dynamic config,
    use is_high_risk_for_approval_async() with a db session.
    
    This is the correct name for the threshold check - it uses
    HIGH_RISK_MIN_NET_SCORE, not CRITICAL_RISK_MIN_NET_SCORE.
    """
    if risk.is_priority:
        return True
    threshold = ConfigDefaults.HIGH_RISK_MIN_NET_SCORE
    return risk.net_score >= threshold


async def is_high_risk_for_approval_async(risk, db) -> bool:
    """
    Async version that fetches threshold from global_config.
    
    Use this in async contexts where you have a db session and
    want to respect CRO-configured thresholds.
    
    This is the correct name for the threshold check - it uses
    high_risk_min_net_score from config, not critical_risk_min_net_score.
    """
    if risk.is_priority:
        return True
    threshold = await get_config_int(
        db, 
        "high_risk_min_net_score", 
        ConfigDefaults.HIGH_RISK_MIN_NET_SCORE
    )
    return risk.net_score >= threshold


def _is_priority_downgrade(old_val: object, new_val: object) -> bool:
    """
    Check if is_priority is being downgraded (True → False).
    
    Only true→false requires approval because it's a risk downgrade.
    Upgrades (false→true) are allowed without approval.
    """
    return old_val is True and new_val is False


def has_sensitive_field_changes(
    resource_type: str, 
    old_data: dict[str, object], 
    new_data: dict[str, object]
) -> tuple[bool, dict[str, dict[str, object]]]:
    """
    Check if any sensitive fields are being changed, including clearing to None.
    
    Args:
        resource_type: "risk", "control", or "kri"
        old_data: Current field values
        new_data: Proposed new field values (from update request)
    
    Returns:
        Tuple of (has_sensitive_changes, changed_fields_dict)
        changed_fields_dict format: {"field_name": {"old": value, "new": value}}
    
    Note:
        Uses _NOT_PROVIDED sentinel to distinguish between:
        - Field not in payload → no change
        - Field explicitly set to None → counts as a change (clearing)
    """
    sensitive = SENSITIVE_FIELDS.get(resource_type, set())
    changed: dict[str, dict[str, object]] = {}
    
    for field in sensitive:
        new_val = new_data.get(field, _NOT_PROVIDED)
        if new_val is _NOT_PROVIDED:  # Field not in update payload - no change
            continue
        
        old_val = old_data.get(field)
        if old_val == new_val:  # No actual change
            continue
        
        # is_priority: only true→false requires approval (downgrade)
        if field == "is_priority":
            if _is_priority_downgrade(old_val, new_val):
                changed[field] = {"old": old_val, "new": new_val}
            # false→true or any other transition is allowed without approval
            continue
        
        # All other sensitive fields: ANY change requires approval
        # Including owner_id: 5→None (clearing owner)
        changed[field] = {"old": old_val, "new": new_val}
    
    return bool(changed), changed


# ============================================================================
# 5. Cross-Department Ownership Helpers
# ============================================================================

# ----------------- KRI Reporting Owner Access -----------------

async def is_kri_reporting_owner(db, user_id: int, kri_id: int) -> bool:
    """
    Check if user is the reporting owner of a specific KRI.
    
    Used for granting cross-department access to assigned reporting owners.
    """
    from sqlalchemy import select

    from app.models import KeyRiskIndicator
    
    result = await db.execute(
        select(KeyRiskIndicator.reporting_owner_id)
        .where(KeyRiskIndicator.id == kri_id)
    )
    reporting_owner_id = result.scalar_one_or_none()
    return reporting_owner_id == user_id


async def is_risk_kri_reporting_owner(db, user_id: int, risk_id: int) -> bool:
    """
    Check if user is the reporting owner of any KRI linked to a specific Risk.
    
    Used for granting cross-department READ access to risks via KRI ownership.
    """
    from sqlalchemy import select

    from app.models import KeyRiskIndicator
    
    result = await db.execute(
        select(KeyRiskIndicator.id)
        .where(
            KeyRiskIndicator.risk_id == risk_id,
            KeyRiskIndicator.reporting_owner_id == user_id
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def get_kri_ids_where_reporting_owner(db, user_id: int) -> list[int]:
    """
    Get list of KRI IDs where user is the reporting owner.
    
    Used for including cross-department KRIs in list queries.
    """
    from sqlalchemy import select

    from app.models import KeyRiskIndicator
    
    result = await db.execute(
        select(KeyRiskIndicator.id)
        .where(KeyRiskIndicator.reporting_owner_id == user_id)
    )
    return [row[0] for row in result.all()]


async def get_risk_ids_where_kri_reporting_owner(db, user_id: int) -> list[int]:
    """
    Get list of Risk IDs where user is reporting owner of any linked KRI.
    
    Used for including cross-department risks in list queries.
    """
    from sqlalchemy import select

    from app.models import KeyRiskIndicator
    
    result = await db.execute(
        select(KeyRiskIndicator.risk_id)
        .where(KeyRiskIndicator.reporting_owner_id == user_id)
        .distinct()
    )
    return [row[0] for row in result.all()]


# ----------------- Control Owner Access -----------------

async def is_control_owner(db, user_id: int, control_id: int) -> bool:
    """
    Check if user is the owner of a specific Control.
    
    Used for granting cross-department access to assigned control owners.
    """
    from sqlalchemy import select

    from app.models import Control
    
    result = await db.execute(
        select(Control.control_owner_id)
        .where(Control.id == control_id)
    )
    control_owner_id = result.scalar_one_or_none()
    return control_owner_id == user_id


async def is_risk_control_owner(db, user_id: int, risk_id: int) -> bool:
    """
    Check if user is the owner of any Control linked to a specific Risk.
    
    Used for granting cross-department READ access to risks via control ownership.
    """
    from sqlalchemy import select

    from app.models import Control, ControlRiskLink
    
    result = await db.execute(
        select(Control.id)
        .join(ControlRiskLink, Control.id == ControlRiskLink.control_id)
        .where(
            ControlRiskLink.risk_id == risk_id,
            Control.control_owner_id == user_id
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def get_control_ids_where_owner(db, user_id: int) -> list[int]:
    """
    Get list of Control IDs where user is the control owner.
    
    Used for including cross-department controls in list queries.
    """
    from sqlalchemy import select

    from app.models import Control
    
    result = await db.execute(
        select(Control.id)
        .where(Control.control_owner_id == user_id)
    )
    return [row[0] for row in result.all()]


async def get_risk_ids_where_control_owner(db, user_id: int) -> list[int]:
    """
    Get list of Risk IDs where user is owner of any linked Control.
    
    Used for including cross-department risks in list queries.
    """
    from sqlalchemy import select

    from app.models import Control, ControlRiskLink
    
    result = await db.execute(
        select(ControlRiskLink.risk_id)
        .join(Control, Control.id == ControlRiskLink.control_id)
        .where(Control.control_owner_id == user_id)
        .distinct()
    )
    return [row[0] for row in result.all()]
