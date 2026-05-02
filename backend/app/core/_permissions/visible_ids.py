from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Control, KeyRiskIndicator, Risk, User, Vendor

from .entity_scope_clauses import (
    control_visibility_clause,
    kri_visibility_clause,
    risk_visibility_clause,
    vendor_visibility_clause,
)


def _candidate_id_set(candidate_ids: Iterable[int]) -> set[int]:
    return {candidate_id for candidate_id in candidate_ids if candidate_id is not None}


async def visible_risk_ids(db: AsyncSession, user: User, candidate_ids: Iterable[int]) -> set[int]:
    ids = _candidate_id_set(candidate_ids)
    if not ids:
        return set()

    query = select(Risk.id).where(Risk.id.in_(ids))
    visibility_clause = await risk_visibility_clause(db, user)
    if visibility_clause is not None:
        query = query.where(visibility_clause)
    return set((await db.execute(query)).scalars().all())


async def visible_control_ids(db: AsyncSession, user: User, candidate_ids: Iterable[int]) -> set[int]:
    ids = _candidate_id_set(candidate_ids)
    if not ids:
        return set()

    query = select(Control.id).where(Control.id.in_(ids))
    visibility_clause = control_visibility_clause(user)
    if visibility_clause is not None:
        query = query.where(visibility_clause)
    return set((await db.execute(query)).scalars().all())


async def visible_kri_ids(db: AsyncSession, user: User, candidate_ids: Iterable[int]) -> set[int]:
    ids = _candidate_id_set(candidate_ids)
    if not ids:
        return set()

    query = (
        select(KeyRiskIndicator.id)
        .join(Risk, Risk.id == KeyRiskIndicator.risk_id)
        .where(KeyRiskIndicator.id.in_(ids))
    )
    visibility_clause = await kri_visibility_clause(db, user)
    if visibility_clause is not None:
        query = query.where(visibility_clause)
    return set((await db.execute(query)).scalars().all())


async def visible_vendor_ids(db: AsyncSession, user: User, candidate_ids: Iterable[int]) -> set[int]:
    ids = _candidate_id_set(candidate_ids)
    if not ids:
        return set()

    query = select(Vendor.id).where(Vendor.id.in_(ids))
    visibility_clause = vendor_visibility_clause(user)
    if visibility_clause is not None:
        query = query.where(visibility_clause)
    return set((await db.execute(query)).scalars().all())
