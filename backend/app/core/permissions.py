"""Permission checking utilities for role-based access control."""
from app.models import User
from app.models.role import RoleType


def is_privileged_user(user: User) -> bool:
    """Check if user has privileged role (full system access)."""
    return user.role.name in RoleType.privileged_roles()


def can_see_all_departments(user: User) -> bool:
    """Check if user can see data from all departments."""
    return is_privileged_user(user)


def get_user_department_ids(user: User) -> list[int]:
    """
    Get list of department IDs user can access.
    
    Returns:
        Empty list means "all departments" (privileged users)
        List with IDs means limited to those departments
    """
    if can_see_all_departments(user):
        return []  # Empty list means "all departments"
    
    if user.department_id:
        return [user.department_id]
    
    return []


def can_manage_users(user: User) -> bool:
    """Check if user can create/edit/delete users."""
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
    for rp in user.role.permissions:
        perm = rp.permission
        resource_match = perm.resource == "*" or perm.resource == resource
        action_match = perm.action == "*" or perm.action == action
        if resource_match and action_match:
            return True
    return False
