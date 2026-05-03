from __future__ import annotations

from collections.abc import Awaitable, Callable, Iterable
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Issue, User

from .entity_access import can_read_control_id, can_read_kri_id, can_read_risk_id, can_read_vendor_id
from .entity_scope_clauses import (
    control_visibility_clause,
    kri_visibility_clause,
    risk_visibility_clause,
    vendor_visibility_clause,
)
from .issues import can_read_issue_id, get_issue_scope_clause
from .visible_ids import visible_control_ids, visible_kri_ids, visible_risk_ids, visible_vendor_ids

VisibilityClauseLoader = Callable[[AsyncSession, User], Awaitable[Any]]
VisibleIdsLoader = Callable[[AsyncSession, User, Iterable[int]], Awaitable[set[int]]]
CanReadIdLoader = Callable[[AsyncSession, User, int], Awaitable[bool]]


@dataclass(frozen=True)
class EntityVisibilityProjection:
    name: str
    visibility_clause: VisibilityClauseLoader
    visible_ids: VisibleIdsLoader
    can_read_id: CanReadIdLoader


async def _control_visibility_clause(db: AsyncSession, user: User) -> Any:
    return control_visibility_clause(user)


async def _vendor_visibility_clause(db: AsyncSession, user: User) -> Any:
    return vendor_visibility_clause(user)


async def _visible_issue_ids(db: AsyncSession, user: User, candidate_ids: Iterable[int]) -> set[int]:
    ids = {candidate_id for candidate_id in candidate_ids if candidate_id is not None}
    if not ids:
        return set()

    query = select(Issue.id).where(Issue.id.in_(ids))
    visibility_clause = await get_issue_scope_clause(db, user)
    if visibility_clause is not None:
        query = query.where(visibility_clause)
    return set((await db.execute(query)).scalars().all())


ENTITY_VISIBILITY_PROJECTIONS: dict[str, EntityVisibilityProjection] = {
    "risk": EntityVisibilityProjection(
        name="risk",
        visibility_clause=risk_visibility_clause,
        visible_ids=visible_risk_ids,
        can_read_id=can_read_risk_id,
    ),
    "control": EntityVisibilityProjection(
        name="control",
        visibility_clause=_control_visibility_clause,
        visible_ids=visible_control_ids,
        can_read_id=can_read_control_id,
    ),
    "kri": EntityVisibilityProjection(
        name="kri",
        visibility_clause=kri_visibility_clause,
        visible_ids=visible_kri_ids,
        can_read_id=can_read_kri_id,
    ),
    "vendor": EntityVisibilityProjection(
        name="vendor",
        visibility_clause=_vendor_visibility_clause,
        visible_ids=visible_vendor_ids,
        can_read_id=can_read_vendor_id,
    ),
    "issue": EntityVisibilityProjection(
        name="issue",
        visibility_clause=get_issue_scope_clause,
        visible_ids=_visible_issue_ids,
        can_read_id=can_read_issue_id,
    ),
}
