from __future__ import annotations

from collections.abc import Iterable

from fastapi import Depends, HTTPException

from app.api.deps import get_current_user
from app.models import User
from app.models.role import RoleType

RoleName = RoleType | str


def _role_name(role: RoleName) -> str:
    return role.value if isinstance(role, RoleType) else str(role)


def _allowed_role_names(allowed_roles: Iterable[RoleName]) -> frozenset[str]:
    return frozenset(_role_name(role) for role in allowed_roles)


def require_role(
    current_user: User,
    *,
    allowed_roles: Iterable[RoleName],
    detail: str,
) -> User:
    role = getattr(current_user, "role", None)
    role_name = getattr(role, "name", None)
    if role_name not in _allowed_role_names(allowed_roles):
        raise HTTPException(status_code=403, detail=detail)
    return current_user


def role_dependency(
    *,
    allowed_roles: Iterable[RoleName],
    detail: str,
):
    allowed = tuple(allowed_roles)

    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        return require_role(current_user, allowed_roles=allowed, detail=detail)

    setattr(role_checker, "required_roles", _allowed_role_names(allowed))
    return role_checker


def require_cro(current_user: User) -> User:
    return require_role(
        current_user,
        allowed_roles=RoleType.cro_only_roles(),
        detail="Risk Hub access requires CRO role",
    )


def ensure_platform_admin(current_user: User, *, detail: str = "Admin access required") -> User:
    return require_role(current_user, allowed_roles=(RoleType.ADMIN,), detail=detail)


require_platform_admin = role_dependency(allowed_roles=(RoleType.ADMIN,), detail="Admin access required")
get_cro_user = role_dependency(
    allowed_roles=RoleType.cro_only_roles(),
    detail="Risk Hub access requires CRO role",
)
