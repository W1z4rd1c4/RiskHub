from __future__ import annotations

from fastapi import Depends, HTTPException

from app.api.deps import get_current_user
from app.models import User
from app.models.role import RoleType


def require_platform_admin(current_user: User = Depends(get_current_user)) -> User:
    """
    FastAPI dependency that validates the current user is a platform admin.

    Raises HTTPException 403 if the user is not an admin.
    Returns the validated admin user for use in endpoints.
    """
    if not current_user.role or current_user.role.name != RoleType.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

