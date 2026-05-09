from __future__ import annotations

from app.models import User
from app.models.role import RoleType
from app.schemas.admin import AdminConsoleCapabilities


def _is_platform_admin(user: User) -> bool:
    role = getattr(user, "role", None)
    return getattr(role, "name", None) == RoleType.ADMIN.value


def build_admin_capabilities(user: User) -> AdminConsoleCapabilities:
    is_admin = _is_platform_admin(user)
    return AdminConsoleCapabilities(
        can_revoke_sessions=is_admin,
        can_run_directory_check_all=is_admin,
        can_update_log_config=is_admin,
        can_export_loaded_audit_logs=is_admin,
    )
