"""Shared mechanics for ICT register entity lifecycle endpoints."""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import Any, Generic, Protocol, TypeVar, cast

from sqlalchemy import asc, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthorizationError, ConflictError, NotFoundError, ValidationError
from app.core.security import check_permission
from app.models import User
from app.services.transaction_boundary import commit_service_boundary


class RegisterLifecycleEntity(Protocol):
    """Minimal entity surface required by register lifecycle policy checks."""

    id: int
    is_archived: bool


EntityT = TypeVar("EntityT", bound=RegisterLifecycleEntity)
LifecycleEntityT = TypeVar("LifecycleEntityT")
LifecycleChangesT = TypeVar("LifecycleChangesT")


@dataclass(frozen=True, slots=True)
class RegisterLifecyclePolicy(Generic[EntityT]):
    """Shared authorization and archive-state policy for register entities."""

    model: Any
    resource: str
    entity_label: str

    @property
    def archived_label(self) -> str:
        return self.entity_label.lower()

    async def load(self, db: AsyncSession, entity_id: int) -> EntityT | None:
        result = await db.execute(select(self.model).where(self.model.id == entity_id))
        return cast(EntityT | None, result.scalar_one_or_none())

    def assert_create_allowed(self, *, current_user: User) -> None:
        self._assert_permission(current_user, "write")

    async def assert_readable(
        self,
        db: AsyncSession,
        *,
        entity_id: int,
        current_user: User,
    ) -> EntityT:
        self._assert_permission(current_user, "read")
        return await self._load_required(db, entity_id)

    async def assert_update_allowed(
        self,
        db: AsyncSession,
        *,
        entity_id: int,
        current_user: User,
    ) -> EntityT:
        self._assert_permission(current_user, "write")
        entity = await self._load_required(db, entity_id)
        if entity.is_archived:
            raise ConflictError(f"Cannot update archived {self.archived_label}")
        return entity

    async def assert_archive_allowed(
        self,
        db: AsyncSession,
        *,
        entity_id: int,
        current_user: User,
    ) -> EntityT:
        entity = await self._assert_delete_allowed(db, entity_id=entity_id, current_user=current_user)
        if entity.is_archived:
            raise ValidationError(f"{self.entity_label} is already archived")
        return entity

    async def assert_restore_allowed(
        self,
        db: AsyncSession,
        *,
        entity_id: int,
        current_user: User,
    ) -> EntityT:
        entity = await self._assert_delete_allowed(db, entity_id=entity_id, current_user=current_user)
        if not entity.is_archived:
            raise ValidationError(f"{self.entity_label} is not archived")
        return entity

    def _assert_permission(self, current_user: User, action: str) -> None:
        if not check_permission(current_user, self.resource, action):
            raise AuthorizationError(f"Permission denied: {self.resource}:{action}")

    async def _load_required(self, db: AsyncSession, entity_id: int) -> EntityT:
        entity = await self.load(db, entity_id)
        if entity is None:
            raise NotFoundError(f"{self.entity_label} not found")
        return entity

    async def _assert_delete_allowed(
        self,
        db: AsyncSession,
        *,
        entity_id: int,
        current_user: User,
    ) -> EntityT:
        self._assert_permission(current_user, "delete")
        return await self._load_required(db, entity_id)


def extract_updates(payload: Any, *, non_nullable_fields: tuple[str, ...]) -> dict[str, Any]:
    updates = {field: getattr(payload, field) for field in payload.model_fields_set}
    for field in non_nullable_fields:
        if field in updates and updates[field] is None:
            raise ValidationError(f"{field} cannot be null")
    return updates


async def apply_update_lifecycle(
    *,
    db: AsyncSession,
    entity: LifecycleEntityT,
    updates: dict[str, object],
    changes_factory: Callable[[LifecycleEntityT, dict[str, object]], LifecycleChangesT],
    audit: Callable[[LifecycleChangesT], Awaitable[None]],
    boundary: str,
) -> None:
    changes = changes_factory(entity, updates)
    for field, value in updates.items():
        setattr(entity, field, value)
    await audit(changes)
    await commit_service_boundary(db, boundary=boundary)
    await db.refresh(entity)


async def apply_archive_lifecycle(
    *,
    db: AsyncSession,
    entity: LifecycleEntityT,
    current_user: User,
    changes_factory: Callable[[LifecycleEntityT], LifecycleChangesT],
    audit: Callable[[LifecycleChangesT], Awaitable[None]],
    boundary: str,
    restore: bool = False,
    refresh: bool = False,
) -> None:
    changes = changes_factory(entity)
    mutable_entity = cast(Any, entity)
    if restore:
        mutable_entity.mark_restored(current_user)
    else:
        mutable_entity.mark_archived(current_user)
    await audit(changes)
    await commit_service_boundary(db, boundary=boundary)
    if refresh:
        await db.refresh(entity)


async def load_register_page(
    *,
    db: AsyncSession,
    query: Any,
    model: Any,
    offset: int,
    limit: int,
    sort_by: str | None,
    sort_order: str | None,
    sort_columns: Mapping[str, Any],
) -> tuple[list[Any], int]:
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0
    if sort_by is not None and sort_by not in sort_columns:
        raise ValidationError("Invalid sort_by value")
    order_column = sort_columns[sort_by] if sort_by else model.id
    direction = desc if sort_order == "desc" else asc
    query = query.order_by(direction(order_column), direction(model.id))
    rows = list((await db.execute(query.offset(offset).limit(limit))).scalars().all())
    return rows, total
