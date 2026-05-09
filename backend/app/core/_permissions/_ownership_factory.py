"""Factory helpers for cross-department ownership resolvers."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

BoolResolver = Callable[[AsyncSession, int, int], Awaitable[bool]]
IdsResolver = Callable[[AsyncSession, int], Awaitable[list[int]]]
BridgeSpec = tuple[Any, str, str]


@dataclass(frozen=True)
class OwnershipResolvers:
    """Callable resolver set for direct and target-scoped ownership checks."""

    is_owner: BoolResolver
    is_target_owner: BoolResolver
    ids_where_owner: IdsResolver
    target_ids_where_owner: IdsResolver
    archived_filter_methods: frozenset[str]


def make_ownership_resolvers(
    *,
    model: Any,
    owner_column: str,
    archived_column: str | None = None,
    bridge: BridgeSpec | None = None,
) -> OwnershipResolvers:
    """Build the four ownership resolvers used by permission scoping."""

    owner_col = getattr(model, owner_column)
    archived_col = getattr(model, archived_column) if archived_column is not None else None
    archived_filter_methods = (
        frozenset({"is_target_owner", "target_ids_where_owner"}) if archived_col is not None else frozenset()
    )
    bridge_model = bridge_local_col = bridge_target_col = None
    if bridge is not None:
        bridge_model, bridge_local_fk, bridge_target_fk = bridge
        bridge_local_col = getattr(bridge_model, bridge_local_fk)
        bridge_target_col = getattr(bridge_model, bridge_target_fk)

    def _apply_archive_filter(stmt: Any, method_name: str) -> Any:
        if archived_col is not None and method_name in archived_filter_methods:
            return stmt.where(archived_col.is_(False))
        return stmt

    async def is_owner(db: AsyncSession, user_id: int, entity_id: int) -> bool:
        result = await db.execute(select(owner_col).where(model.id == entity_id))
        owner_id = result.scalar_one_or_none()
        return owner_id == user_id

    async def is_target_owner(db: AsyncSession, user_id: int, target_id: int) -> bool:
        if bridge_model is not None:
            assert bridge_local_col is not None
            assert bridge_target_col is not None
            stmt = (
                select(model.id)
                .select_from(model)
                .join(bridge_model, model.id == bridge_local_col)
                .where(bridge_target_col == target_id, owner_col == user_id)
                .limit(1)
            )
        else:
            target_col = getattr(model, "risk_id")
            stmt = select(model.id).where(target_col == target_id, owner_col == user_id).limit(1)
        result = await db.execute(_apply_archive_filter(stmt, "is_target_owner"))
        return result.scalar_one_or_none() is not None

    async def ids_where_owner(db: AsyncSession, user_id: int) -> list[int]:
        result = await db.execute(select(model.id).where(owner_col == user_id))
        return [row[0] for row in result.all()]

    async def target_ids_where_owner(db: AsyncSession, user_id: int) -> list[int]:
        if bridge_model is not None:
            assert bridge_local_col is not None
            assert bridge_target_col is not None
            stmt = (
                select(bridge_target_col)
                .select_from(bridge_model)
                .join(model, model.id == bridge_local_col)
                .where(owner_col == user_id)
                .distinct()
            )
        else:
            target_col = getattr(model, "risk_id")
            stmt = select(target_col).where(owner_col == user_id).distinct()
        result = await db.execute(_apply_archive_filter(stmt, "target_ids_where_owner"))
        return [row[0] for row in result.all()]

    return OwnershipResolvers(
        is_owner=is_owner,
        is_target_owner=is_target_owner,
        ids_where_owner=ids_where_owner,
        target_ids_where_owner=target_ids_where_owner,
        archived_filter_methods=archived_filter_methods,
    )
