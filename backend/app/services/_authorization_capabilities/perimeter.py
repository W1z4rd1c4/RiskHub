from __future__ import annotations

from app.core.security import check_permission, forbid
from app.models import User


def has_capability(user: User, resource: str, action: str) -> bool:
    return check_permission(user, resource, action)


def require_capability(user: User, resource: str, action: str) -> None:
    if not has_capability(user, resource, action):
        forbid(f"Permission denied: {resource}:{action}")
