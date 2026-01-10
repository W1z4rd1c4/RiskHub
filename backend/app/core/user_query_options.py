"""
Shared query options for User model selectinload patterns.

Centralizes relationship-loading specifications used across user-related endpoints
to reduce duplication while preserving exact loading semantics.
"""
from sqlalchemy.orm import selectinload

from app.models import User, Role, RolePermission


def user_selectinload_options(*, include_permissions: bool = False) -> list:
    """
    Build SQLAlchemy selectinload options for User queries.

    Args:
        include_permissions: If True, include role->permissions->permission chain
                            (heavier, used by access management endpoints).
                            If False, only load role, department, manager.

    Returns:
        List of selectinload options to pass to .options().
    """
    if include_permissions:
        return [
            selectinload(User.role)
            .selectinload(Role.permissions)
            .selectinload(RolePermission.permission),
            selectinload(User.department),
            selectinload(User.manager),
        ]
    else:
        return [
            selectinload(User.role),
            selectinload(User.department),
            selectinload(User.manager),
        ]
