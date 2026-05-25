from __future__ import annotations

from app.api.v1.endpoints._auth_dependencies import ensure_platform_admin
from app.core.permissions import is_platform_admin
from app.models import User


def can_administer_user_lifecycle(current_user: User) -> bool:
    return is_platform_admin(current_user)


def ensure_admin_user_lifecycle(current_user: User) -> None:
    """Require explicit platform-admin authority for user lifecycle/detail operations."""
    ensure_platform_admin(current_user, detail="Only Admin can manage user lifecycle")
