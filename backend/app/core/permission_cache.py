from __future__ import annotations

from app.core.permissions import get_effective_permissions
from app.models import User


def build_permission_sensitive_cache_key(current_user: User, *parts: object) -> tuple[object, ...]:
    """Return a stable cache key for payloads derived from current user permissions."""
    return (
        current_user.id,
        getattr(current_user.access_scope, "value", str(current_user.access_scope)),
        current_user.department_id,
        current_user.role_id,
        getattr(getattr(current_user, "role", None), "name", None),
        tuple(get_effective_permissions(current_user)),
        *parts,
    )
