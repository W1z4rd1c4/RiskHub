from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.core.security import check_permission, forbid
from app.models import User


@dataclass(frozen=True)
class Capabilities:
    """Backend-authoritative capability evaluator for a single actor."""

    user: User

    @classmethod
    def for_user(cls, user: User) -> "Capabilities":
        return cls(user=user)

    def can(self, action: str, resource: str, *, instance: Any | None = None) -> bool:
        # Instance-aware capability checks are added per resource as those
        # policies migrate. Resource/action permission remains the base rule.
        _ = instance
        return check_permission(self.user, resource, action)


def has_capability(user: User, resource: str, action: str) -> bool:
    return Capabilities.for_user(user).can(action, resource)


def require_capability(user: User, resource: str, action: str) -> None:
    if not has_capability(user, resource, action):
        forbid(f"Permission denied: {resource}:{action}")
