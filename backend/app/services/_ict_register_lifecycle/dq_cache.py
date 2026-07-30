"""Short-lived, revision-aware cache for the register-global DQ evaluation."""

from __future__ import annotations

import asyncio
import hashlib
import time
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ActivityEntityType, ActivityLog
from app.services._ict_register_reference.parameters import (
    IctWorkbookParameterSet,
    load_ict_workbook_parameter_set,
)

from .derivation_inputs import load_ict_register_dq_graph
from .dq import (
    DQ_CHECK_CATALOG,
    PRODUCTION_INERT_REASONS,
    IctRegisterDqResult,
    derive_ict_register_dq,
)

DQ_CACHE_TTL_SECONDS = 15.0
_MAX_CACHE_REVISIONS = 8
_MAX_REVISION_LOCKS = 32
_RELEVANT_ACTIVITY_TYPES = (
    ActivityEntityType.PROCESS,
    ActivityEntityType.PROCESS_LINK,
    ActivityEntityType.ASSET,
    ActivityEntityType.ASSET_LINK,
    ActivityEntityType.VENDOR,
    ActivityEntityType.VENDOR_LINK,
    ActivityEntityType.VENDOR_CONTRACT,
    ActivityEntityType.VENDOR_SUB_OUTSOURCING,
    ActivityEntityType.RISK,
    ActivityEntityType.RISK_LINK,
    ActivityEntityType.CONFIG,
)
DQ_CATALOG_VERSION = hashlib.sha256(
    repr((DQ_CHECK_CATALOG, tuple(PRODUCTION_INERT_REASONS.items()))).encode("utf-8")
).hexdigest()


@dataclass(frozen=True)
class _CacheEntry:
    expires_at: float
    result: IctRegisterDqResult


_cache: dict[tuple[int, int, str, str], _CacheEntry] = {}
_revision_locks: dict[tuple[int, int, str, str], asyncio.Lock] = {}


async def _revision_key(
    db: AsyncSession,
) -> tuple[tuple[int, int, str, str], IctWorkbookParameterSet]:
    parameter_set = await load_ict_workbook_parameter_set(db)
    maximum_activity_id = await db.scalar(
        select(func.max(ActivityLog.id)).where(
            ActivityLog.entity_type.in_(_RELEVANT_ACTIVITY_TYPES)
        )
    )
    bind = db.get_bind()
    return (
        (
            id(bind),
            int(maximum_activity_id or 0),
            parameter_set.version,
            DQ_CATALOG_VERSION,
        ),
        parameter_set,
    )


def _prune(now: float) -> None:
    for key, entry in tuple(_cache.items()):
        if entry.expires_at <= now:
            _cache.pop(key, None)
    while len(_cache) > _MAX_CACHE_REVISIONS:
        oldest_key = min(_cache, key=lambda key: _cache[key].expires_at)
        _cache.pop(oldest_key, None)
    if len(_revision_locks) > _MAX_REVISION_LOCKS:
        for key, lock in tuple(_revision_locks.items()):
            if len(_revision_locks) <= _MAX_REVISION_LOCKS:
                break
            if key not in _cache and not lock.locked():
                _revision_locks.pop(key, None)


async def get_cached_global_dq_result(db: AsyncSession) -> IctRegisterDqResult:
    """Return one immutable global result per activity/catalog revision."""
    key, parameter_set = await _revision_key(db)
    now = time.monotonic()
    _prune(now)
    cached = _cache.get(key)
    if cached is not None:
        return cached.result

    lock = _revision_locks.setdefault(key, asyncio.Lock())
    async with lock:
        now = time.monotonic()
        cached = _cache.get(key)
        if cached is not None and cached.expires_at > now:
            return cached.result

        graph = await load_ict_register_dq_graph(db)
        result = derive_ict_register_dq(graph, parameter_set)
        completed_at = time.monotonic()
        _cache[key] = _CacheEntry(
            expires_at=completed_at + DQ_CACHE_TTL_SECONDS,
            result=result,
        )
        _prune(completed_at)
        return result
