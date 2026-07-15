"""Shared mechanics for ICT register entity lifecycle endpoints."""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping
from typing import Any

from sqlalchemy import asc, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.models import User
from app.services.transaction_boundary import commit_service_boundary


def extract_updates(payload: Any, *, non_nullable_fields: tuple[str, ...]) -> dict[str, Any]:
    updates = {field: getattr(payload, field) for field in payload.model_fields_set}
    for field in non_nullable_fields:
        if field in updates and updates[field] is None:
            raise ValidationError(f"{field} cannot be null")
    return updates


async def apply_update_lifecycle(
    *,
    db: AsyncSession,
    entity: Any,
    updates: Mapping[str, Any],
    changes_factory: Callable[[Any, Mapping[str, Any]], Mapping[str, Any]],
    audit: Callable[[Mapping[str, Any]], Awaitable[None]],
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
    entity: Any,
    current_user: User,
    changes_factory: Callable[[Any], Mapping[str, Any]],
    audit: Callable[[Mapping[str, Any]], Awaitable[None]],
    boundary: str,
    restore: bool = False,
    refresh: bool = False,
) -> None:
    changes = changes_factory(entity)
    if restore:
        entity.mark_restored(current_user)
    else:
        entity.mark_archived(current_user)
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
