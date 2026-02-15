from typing import Optional

from fastapi import HTTPException, status

from app.models import User
from app.models.user import AccessScope


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
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to unassigned items")
        return  # Privileged user can access

    dept_ids = get_user_department_ids(current_user)
    if dept_ids is None:
        return  # Privileged user - full access

    if item_dept_id not in dept_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this department's resources",
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
