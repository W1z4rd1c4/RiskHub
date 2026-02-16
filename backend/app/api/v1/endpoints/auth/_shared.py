import hashlib

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_effective_permissions, get_scope_label
from app.core.security import create_access_token
from app.models import Role, User
from app.schemas.auth import TokenResponse


def _sha256_trunc(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def _build_token_response(user: User) -> TokenResponse:
    effective_permissions = get_effective_permissions(user)
    scope_label = get_scope_label(user)
    user_data = {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role.name,
        "role_display_name": user.role.display_name,
        "department_id": user.department_id,
        "department_name": user.department.name if user.department else None,
        "permissions": effective_permissions,
        "effective_permissions": effective_permissions,
        "access_scope": user.access_scope,
        "scope_label": scope_label,
    }
    access_token = create_access_token(data={"sub": user.email, "user_id": user.id})
    return TokenResponse(access_token=access_token, user=user_data)


async def _resolve_safe_default_role(db: AsyncSession) -> Role:
    from app.core.policy import SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES

    for name in SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES:
        result = await db.execute(select(Role).where(Role.name == name))
        role = result.scalar_one_or_none()
        if role:
            return role

    candidates = ", ".join(str(name) for name in SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES)
    raise HTTPException(status_code=500, detail=f"No safe default role found ({candidates}). Seed roles first.")

