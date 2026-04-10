from __future__ import annotations

from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orphaned_item import OrphanedItem
from app.models.user import User

from .flagging import flag_orphaned_items as _flag_orphaned_items
from .flagging import scan_uncategorised_items as _scan_uncategorised_items
from .reads import get_orphan_detail as _get_orphan_detail
from .reads import get_pending_orphans as _get_pending_orphans
from .reads import get_pending_orphans_with_details as _get_pending_orphans_with_details
from .resolution import _get_fallback_owner_id as _get_fallback_owner_id
from .resolution import resolve_orphan as _resolve_orphan
from .stats import get_orphan_stats as _get_orphan_stats


class OrphanedItemService:
    """Service for flagging, querying, and resolving orphaned items."""

    @staticmethod
    async def flag_orphaned_items(db: AsyncSession, user_id: int) -> list[OrphanedItem]:
        return await _flag_orphaned_items(db, user_id)

    @staticmethod
    async def _get_fallback_owner_id(db: AsyncSession) -> int | None:
        return await _get_fallback_owner_id(db)

    @staticmethod
    async def scan_uncategorised_items(db: AsyncSession) -> int:
        return await _scan_uncategorised_items(db)

    @staticmethod
    async def get_pending_orphans(
        db: AsyncSession,
        item_type: Optional[str] = None,
    ) -> list[OrphanedItem]:
        return await _get_pending_orphans(db, item_type=item_type)

    @staticmethod
    async def get_orphan_stats(db: AsyncSession, current_user: User) -> dict:
        return await _get_orphan_stats(db, current_user=current_user)

    @staticmethod
    async def resolve_orphan(
        db: AsyncSession,
        orphan_id: int,
        resolved_by_id: int,
        new_owner_id: int | None = None,
        department_id: int | None = None,
        target_risk_id: int | None = None,
    ) -> OrphanedItem:
        return await _resolve_orphan(
            db=db,
            orphan_id=orphan_id,
            resolved_by_id=resolved_by_id,
            new_owner_id=new_owner_id,
            department_id=department_id,
            target_risk_id=target_risk_id,
        )

    @staticmethod
    async def get_pending_orphans_with_details(
        db: AsyncSession,
        item_type: Optional[str] = None,
        status: str = "pending",
    ) -> list[dict]:
        return await _get_pending_orphans_with_details(
            db=db,
            item_type=item_type,
            status=status,
        )

    @staticmethod
    async def get_orphan_detail(db: AsyncSession, orphan_id: int) -> dict | None:
        return await _get_orphan_detail(db, orphan_id)
