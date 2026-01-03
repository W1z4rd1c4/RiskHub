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


# ============== Critical Risk and Sensitive Field Detection ==============

from app.models.global_config import ConfigDefaults, get_config_int


def is_critical_risk(risk) -> bool:
    """
    Check if a risk is critical (requires approval for linked item edits).
    
    A risk is critical if:
    - is_priority = True, OR
    - net_score >= threshold from config (default: 15)
    
    Note: Uses ConfigDefaults for sync contexts. For dynamic config,
    use is_critical_risk_async() with a db session.
    """
    if risk.is_priority:
        return True
    threshold = ConfigDefaults.HIGH_RISK_MIN_NET_SCORE
    if risk.net_score >= threshold:
        return True
    return False


async def is_critical_risk_async(risk, db) -> bool:
    """
    Async version that fetches threshold from global_config.
    
    Use this in async contexts where you have a db session and
    want to respect CRO-configured thresholds.
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
    Check if any sensitive fields are being changed.
    
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
    
    for field in sensitive:
        old_val = old_data.get(field)
        new_val = new_data.get(field)
        
        # Only check if new value is explicitly provided and different
        if new_val is not None and old_val != new_val:
            # Special case: is_priority can only go false→true without approval
            # Changing true→false (downgrading) requires approval
            if field == "is_priority":
                if old_val is True and new_val is False:
                    changed[field] = {"old": old_val, "new": new_val}
                # false→true is allowed without approval
            else:
                changed[field] = {"old": old_val, "new": new_val}
    
    return bool(changed), changed

