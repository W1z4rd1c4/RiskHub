"""Permission checking utilities for role-based access control."""
from typing import Optional
from fastapi import HTTPException, status
from app.models import User
from app.models.user import AccessScope


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


def can_manage_users(user: User) -> bool:
    """Check if user can create/edit/delete users."""
    return is_privileged_user(user) and has_permission(user, "users", "write")


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


def get_effective_permissions(user: User) -> list[str]:
    """Return sorted list of effective permissions (resource:action)."""
    if not user.role or not user.role.permissions:
        return []
    perms = {f"{rp.permission.resource}:{rp.permission.action}" for rp in user.role.permissions}
    return sorted(perms)


def get_scope_label(user: User) -> str:
    """Return derived scope label: all, dept, none."""
    dept_ids = get_user_department_ids(user)
    if dept_ids is None:
        return "all"
    if not dept_ids:
        return "none"
    return "dept"


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
    if role_name == "admin":
        return False
    if is_privileged_user(user):
        return True
    return role_name == "department_head"


# ============== Critical Risk and Sensitive Field Detection ==============

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
    if risk.net_score >= threshold:
        return True
    return False


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
    if risk.net_score >= threshold:
        return True
    return False


SENSITIVE_FIELDS = {
    "risk": {"owner_id", "department_id", "category", "is_priority"},
    "control": {"control_owner_id", "department_id"},
    "kri": {},  # KRIs inherit sensitivity from linked risk
}


def has_sensitive_field_changes(
    resource_type: str, 
    old_data: dict, 
    new_data: dict
) -> tuple[bool, dict]:
    """
    Check if any sensitive fields are being changed, including clearing to None.
    
    Args:
        resource_type: "risk", "control", or "kri"
        old_data: Current field values
        new_data: Proposed new field values (from update request)
    
    Returns:
        Tuple of (has_sensitive_changes, changed_fields_dict)
        changed_fields_dict format: {"field_name": {"old": value, "new": value}}
    """
    sensitive = SENSITIVE_FIELDS.get(resource_type, set())
    changed = {}
    NOT_PROVIDED = object()  # Sentinel to detect "not in payload"
    
    for field in sensitive:
        new_val = new_data.get(field, NOT_PROVIDED)
        if new_val is NOT_PROVIDED:  # Field not in update payload - no change
            continue
        
        old_val = old_data.get(field)
        if old_val == new_val:  # No actual change
            continue
        
        # is_priority: only true→false requires approval (downgrade)
        if field == "is_priority":
            if old_val is True and new_val is False:
                changed[field] = {"old": old_val, "new": new_val}
            # false→true or any other transition is allowed without approval
            continue
        
        # All other sensitive fields: ANY change requires approval
        # Including owner_id: 5→None (clearing owner)
        changed[field] = {"old": old_val, "new": new_val}
    
    return bool(changed), changed


# ============== KRI Reporting Owner Access ==============

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


# ============== Control Owner Access ==============

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
