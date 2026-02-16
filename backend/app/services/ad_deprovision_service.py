from __future__ import annotations

from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import log_activity
from app.core.config import Settings
from app.core.datetime_utils import utc_now
from app.models import RefreshToken, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.services.directory_provider_service import (
    DirectoryProviderError,
    DirectoryProviderService,
    DirectoryProviderUnavailableError,
    DirectoryUserNotFoundError,
)
from app.services.orphaned_item_service import OrphanedItemService


class ADDeprovisionService:
    """Directory deprovision checks and automatic local-account remediation."""

    DEPROVISION_REASON = "ad_deprovision"

    @classmethod
    async def check_user_by_id(
        cls,
        db: AsyncSession,
        *,
        user_id: int,
        settings: Settings,
        actor: User | None = None,
        trigger: str = "manual_check_user",
    ) -> dict[str, Any]:
        user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        if user is None:
            raise ValueError("User not found")

        provider = DirectoryProviderService(settings)
        result = await cls._check_user(db, user=user, provider=provider, actor=actor, trigger=trigger)
        await db.commit()
        return result

    @classmethod
    async def check_all_users(
        cls,
        db: AsyncSession,
        *,
        settings: Settings,
        actor: User | None = None,
        trigger: str = "manual_check_all",
    ) -> dict[str, Any]:
        provider = DirectoryProviderService(settings)
        users = (
            await db.execute(select(User).where(User.external_id.is_not(None)).order_by(User.id.asc()))
        ).scalars().all()

        results: list[dict[str, Any]] = []
        for user in users:
            outcome = await cls._check_user(db, user=user, provider=provider, actor=actor, trigger=trigger)
            results.append(outcome)

        await db.commit()
        return {
            "checked": len(results),
            "deprovisioned": sum(1 for item in results if item["status"] == "deprovisioned"),
            "active": sum(1 for item in results if item["status"] == "active"),
            "errors": sum(1 for item in results if item["status"] == "error"),
            "skipped": sum(1 for item in results if item["status"] == "skipped"),
            "results": results,
        }

    @classmethod
    async def _check_user(
        cls,
        db: AsyncSession,
        *,
        user: User,
        provider: DirectoryProviderService,
        actor: User | None,
        trigger: str,
    ) -> dict[str, Any]:
        now = utc_now()
        user.directory_last_checked_at = now
        db.add(user)

        if not user.external_id:
            user.directory_sync_status = "skipped"
            return {
                "user_id": user.id,
                "email": user.email,
                "status": "skipped",
                "reason": "missing_external_id",
                "revoked_sessions": 0,
                "orphaned_items_flagged": 0,
            }

        try:
            remote_user = await provider.get_user(user.external_id)
        except DirectoryUserNotFoundError:
            return await cls._deprovision_missing_user(db, user=user, actor=actor, trigger=trigger)
        except DirectoryProviderUnavailableError as exc:
            user.directory_sync_status = "provider_unavailable"
            db.add(user)
            return {
                "user_id": user.id,
                "email": user.email,
                "status": "error",
                "reason": f"provider_unavailable:{exc}",
                "revoked_sessions": 0,
                "orphaned_items_flagged": 0,
            }
        except DirectoryProviderError as exc:
            user.directory_sync_status = "provider_error"
            db.add(user)
            return {
                "user_id": user.id,
                "email": user.email,
                "status": "error",
                "reason": f"provider_error:{exc}",
                "revoked_sessions": 0,
                "orphaned_items_flagged": 0,
            }

        user.directory_last_seen_at = now
        user.directory_sync_status = "active" if remote_user.account_enabled else "directory_disabled"
        if remote_user.account_enabled and user.deprovision_reason == cls.DEPROVISION_REASON:
            user.deprovisioned_at = None
            user.deprovision_reason = None
        db.add(user)
        return {
            "user_id": user.id,
            "email": user.email,
            "status": "active",
            "reason": None,
            "revoked_sessions": 0,
            "orphaned_items_flagged": 0,
        }

    @classmethod
    async def _deprovision_missing_user(
        cls,
        db: AsyncSession,
        *,
        user: User,
        actor: User | None,
        trigger: str,
    ) -> dict[str, Any]:
        now = utc_now()
        user.directory_sync_status = "missing"
        user.deprovisioned_at = user.deprovisioned_at or now
        user.deprovision_reason = cls.DEPROVISION_REASON

        if user.is_active:
            user.is_active = False
            user.token_version += 1
        db.add(user)

        revoked_rows = await db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user.id)
            .where(RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now, revoked_reason=f"{cls.DEPROVISION_REASON}:{trigger}")
        )
        revoked_sessions = int(revoked_rows.rowcount or 0)

        orphaned_items = await OrphanedItemService.flag_orphaned_items(db, user.id)
        orphan_count = len(orphaned_items)

        await log_activity(
            db=db,
            actor=actor,
            action=ActivityAction.UPDATE,
            entity_type=ActivityEntityType.USER,
            entity_id=user.id,
            entity_name=user.name,
            description=(
                f"User auto-deactivated due to directory deprovision "
                f"(reason={cls.DEPROVISION_REASON}, trigger={trigger}, revoked_sessions={revoked_sessions})"
            ),
        )
        return {
            "user_id": user.id,
            "email": user.email,
            "status": "deprovisioned",
            "reason": cls.DEPROVISION_REASON,
            "revoked_sessions": revoked_sessions,
            "orphaned_items_flagged": orphan_count,
        }
