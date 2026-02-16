from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.directory_sync import DirectorySyncPreview

from .orphans import cleanup_empty_departments as _cleanup_empty_departments
from .orphans import detect_orphans as _detect_orphans
from .single_user import sync_single_user as _sync_single_user
from .sync import run_sync as _run_sync


class DirectorySyncService:
    """Service for previewing and applying directory sync from external AD Emulator."""

    @staticmethod
    async def preview_sync(db: AsyncSession) -> DirectorySyncPreview:
        return await DirectorySyncService._run_sync(db, apply_changes=False)

    @staticmethod
    async def apply_sync(db: AsyncSession) -> DirectorySyncPreview:
        return await DirectorySyncService._run_sync(db, apply_changes=True)

    @staticmethod
    async def _run_sync(db: AsyncSession, apply_changes: bool) -> DirectorySyncPreview:
        return await _run_sync(db, apply_changes=apply_changes)

    @staticmethod
    async def detect_orphans(db: AsyncSession, user_id: int) -> dict:
        return await _detect_orphans(db, user_id)

    @staticmethod
    async def sync_single_user(
        db: AsyncSession,
        user_data: dict,
        event_type: str,
    ) -> dict:
        return await _sync_single_user(db=db, user_data=user_data, event_type=event_type)

    @staticmethod
    async def cleanup_empty_departments(db: AsyncSession) -> int:
        return await _cleanup_empty_departments(db)

