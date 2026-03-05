from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Permission, Role, RolePermission, User
from app.models.user import AccessScope


async def _grant(db: AsyncSession, role: Role, resource: str, action: str, description: str = "") -> None:
    role_id = role.id
    perm = (
        await db.execute(select(Permission).where(Permission.resource == resource, Permission.action == action))
    ).scalar_one_or_none()
    if perm is None:
        perm = Permission(resource=resource, action=action, description=description or f"{resource}:{action}")
        db.add(perm)
        await db.flush()

    existing = (
        await db.execute(
            select(RolePermission).where(RolePermission.role_id == role_id, RolePermission.permission_id == perm.id)
        )
    ).scalar_one_or_none()
    if existing is None:
        db.add(RolePermission(role_id=role_id, permission_id=perm.id))
        await db.flush()

    await db.commit()
    db.expire_all()


async def _create_department_scoped_user(
    db: AsyncSession,
    *,
    email: str,
    name: str,
    department_id: int,
    role_id: int,
) -> User:
    user = User(
        email=email,
        name=name,
        role_id=role_id,
        department_id=department_id,
        access_scope=AccessScope.DEPARTMENT,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def _create_global_user(
    db: AsyncSession,
    *,
    email: str,
    name: str,
    department_id: int | None,
    role_id: int,
) -> User:
    user = User(
        email=email,
        name=name,
        role_id=role_id,
        department_id=department_id,
        access_scope=AccessScope.GLOBAL,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user
