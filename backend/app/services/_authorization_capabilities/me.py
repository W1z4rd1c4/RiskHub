from __future__ import annotations

from app.core.permissions import can_view_risk_committee
from app.models import User
from app.models.role import RoleType
from app.models.user import AccessScope
from app.schemas.user import MeCapabilities

from .perimeter import Capabilities

_RESOURCE_PERMISSION_CHECKS: tuple[tuple[str, str], ...] = (
    ("risks", "read"),
    ("controls", "read"),
    ("issues", "read"),
    ("vendors", "read"),
    ("departments", "read"),
    ("users", "read"),
    ("users", "write"),
    ("activity_log", "read"),
)


def _role_name(user: User) -> str | None:
    role = getattr(user, "role", None)
    value = getattr(role, "name", None)
    return str(value) if value is not None else None


def _has_global_scope(user: User) -> bool:
    return getattr(user, "access_scope", None) == AccessScope.GLOBAL


def build_me_capabilities(user: User) -> MeCapabilities:
    capabilities = Capabilities.for_user(user)
    role_name = _role_name(user)
    has_global_scope = _has_global_scope(user)
    is_platform_admin = role_name == RoleType.ADMIN.value
    is_department_head = role_name == RoleType.DEPARTMENT_HEAD.value

    resource_permissions = {
        f"{resource}:{action}": capabilities.can(action, resource)
        for resource, action in _RESOURCE_PERMISSION_CHECKS
    }

    can_view_user_directory = resource_permissions["users:read"]
    can_view_access_users = has_global_scope
    can_view_department_access_users = is_department_head
    can_view_users_route = can_view_access_users or can_view_department_access_users or can_view_user_directory
    can_view_department_access = can_view_department_access_users or can_view_access_users

    return MeCapabilities(
        can_view_user_directory=can_view_user_directory,
        can_view_access_users=can_view_access_users,
        can_view_department_access_users=can_view_department_access_users,
        can_view_users_route=can_view_users_route,
        can_manage_access=can_view_access_users,
        can_view_department_access=can_view_department_access,
        can_view_admin_console=is_platform_admin,
        can_view_riskhub=role_name == RoleType.CRO.value,
        can_view_governance=(
            not is_platform_admin and has_global_scope and resource_permissions["users:write"]
        ),
        can_view_activity_log=(
            not is_platform_admin and resource_permissions["activity_log:read"]
        ),
        can_view_committee=can_view_risk_committee(user),
        can_view_users_page=can_view_users_route,
        is_second_line=role_name in {RoleType.RISK_MANAGER.value, RoleType.COMPLIANCE.value},
        can_read_risks=resource_permissions["risks:read"],
        can_read_controls=resource_permissions["controls:read"],
        can_read_vendors=resource_permissions["vendors:read"],
        can_read_departments=resource_permissions["departments:read"],
        resource_permissions=resource_permissions,
    )
