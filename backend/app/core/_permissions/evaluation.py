from fastapi import HTTPException, status

from app.models import User
from app.models.role import RoleType

from .scoping import is_privileged_user


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


def can_manage_users(user: User) -> bool:
    """Check if user can create/edit/delete users."""
    return is_privileged_user(user) and has_permission(user, "users", "write")


def is_platform_admin(user: User) -> bool:
    """Return True when the user is a platform-only admin."""
    return is_role(user, RoleType.ADMIN)


def ensure_business_view_access(user: User, detail: str = "Platform admins cannot access business data") -> None:
    """Raise 403 when a platform admin attempts to access business surfaces."""
    if is_platform_admin(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def is_role(user: User, role: RoleType) -> bool:
    return bool(getattr(getattr(user, "role", None), "name", None) == role)


def has_any_role(user: User, roles: set[RoleType]) -> bool:
    role_name = getattr(getattr(user, "role", None), "name", None)
    return bool(role_name in roles)


def can_resolve_approvals(user: User) -> bool:
    """
    Check if user can approve/reject approval requests.

    Only global-scope users with approvals:write can approve or reject
    approval requests.
    """
    return is_privileged_user(user) and has_permission(user, "approvals", "write")


def can_view_risk_committee(user: User) -> bool:
    """
    Risk Committee dashboard visibility.

    - Privileged users (global scope) can view the committee dashboard with global data.
    - Department Heads can view the committee dashboard, scoped to their department(s).
    """
    role_name = getattr(getattr(user, "role", None), "name", None)
    if is_platform_admin(user):
        return False
    if is_privileged_user(user):
        return True
    return role_name == RoleType.DEPARTMENT_HEAD
