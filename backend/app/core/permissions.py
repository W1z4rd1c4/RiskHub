"""Permission checking utilities for role-based access control."""
from typing import Optional
from fastapi import HTTPException, status
from app.models import User
from app.models.role import RoleType


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
        return  # No department = anyone can access
    
    dept_ids = get_user_department_ids(current_user)
    if dept_ids is None:
        return  # Privileged user - full access
    
    if item_dept_id not in dept_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this department's resources"
        )


def is_privileged_user(user: User) -> bool:
    """Check if user has privileged role (full system access)."""
    if not user.role:
        return False  # Guard against null role
    return user.role.name in RoleType.privileged_roles()


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
    
    if user.department_id:
        return [user.department_id]
    
    return []  # Empty list means no access


def can_manage_users(user: User) -> bool:
    """Check if user can create/edit/delete users."""
    if not user.role:
        return False
    return user.role.name in {RoleType.ADMIN, RoleType.CRO}


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


def can_resolve_approvals(user: User) -> bool:
    """
    Check if user can approve/reject approval requests.
    
    Only Risk Manager, CRO, and Admin roles can approve or reject
    deletion requests.
    """
    if not user.role:
        return False
    return user.role.name in {RoleType.RISK_MANAGER, RoleType.CRO, RoleType.ADMIN}

