from __future__ import annotations

from fastapi import HTTPException, status

from app.core.permissions import is_platform_admin
from app.models import User


def can_administer_user_lifecycle(current_user: User) -> bool:
    return is_platform_admin(current_user)


def require_admin_user_lifecycle(current_user: User) -> None:
    """Require explicit platform-admin authority for user lifecycle/detail operations."""
    if not can_administer_user_lifecycle(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admin can manage user lifecycle",
        )
