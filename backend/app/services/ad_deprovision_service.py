from __future__ import annotations

from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import log_activity
from app.core.config import Settings
from app.core.datetime_utils import utc_now
from app.models import RefreshToken, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.services.directory_identity_service import DirectoryIdentityConflictError, apply_directory_profile
from app.services.directory_provider_service import (
    DirectoryProviderError,
    DirectoryProviderService,
    DirectoryProviderUnavailableError,
    DirectoryUserNotFoundError,
)
from app.services.orphaned_item_service import OrphanedItemService


class ADDeprovisionService:
    """Directory deprovision checks and automatic local-account remediation."""

    DEPROVISION_REASON = "ad_deprovision"  # legacy marker kept for backwards compatibility
    DEPROVISION_REASON_MISSING = "missing"
    DEPROVISION_REASON_DIRECTORY_DISABLED = "directory_disabled"
    AUTO_DEPROVISION_REASONS = frozenset(
        {
            DEPROVISION_REASON,
            DEPROVISION_REASON_MISSING,
            DEPROVISION_REASON_DIRECTORY_DISABLED,
        }
    )

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
    async def deprovision_user(
        cls,
        db: AsyncSession,
        *,
        user: User,
        actor: User | None,
        trigger: str,
        sync_status: str,
        deprovision_reason: str,
    ) -> dict[str, Any]:
        return await cls._deprovision_user(
            db,
            user=user,
            actor=actor,
            trigger=trigger,
            sync_status=sync_status,
            deprovision_reason=deprovision_reason,
        )

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
            return await cls._deprovision_user(
                db,
                user=user,
                actor=actor,
                trigger=trigger,
                sync_status="missing",
                deprovision_reason=cls.DEPROVISION_REASON_MISSING,
            )
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
        if not remote_user.account_enabled:
            try:
                await apply_directory_profile(db, user=user, directory_user=remote_user)
            except DirectoryIdentityConflictError:
                user.directory_sync_status = "directory_disabled"
                db.add(user)
            if user.has_active_break_glass(now=now):
                user.deprovisioned_at = user.deprovisioned_at or now
                user.deprovision_reason = cls.DEPROVISION_REASON_DIRECTORY_DISABLED
                db.add(user)
                return {
                    "user_id": user.id,
                    "email": user.email,
                    "status": "active",
                    "reason": "break_glass_override",
                    "revoked_sessions": 0,
                    "orphaned_items_flagged": 0,
                }
            return await cls._deprovision_user(
                db,
                user=user,
                actor=actor,
                trigger=trigger,
                sync_status="directory_disabled",
                deprovision_reason=cls.DEPROVISION_REASON_DIRECTORY_DISABLED,
            )

        try:
            await apply_directory_profile(db, user=user, directory_user=remote_user)
        except DirectoryIdentityConflictError as exc:
            user.directory_sync_status = "identity_conflict"
            db.add(user)
            return {
                "user_id": user.id,
                "email": user.email,
                "status": "error",
                "reason": f"identity_conflict:{exc}",
                "revoked_sessions": 0,
                "orphaned_items_flagged": 0,
            }
        if user.deprovision_reason in cls.AUTO_DEPROVISION_REASONS:
            user.is_active = True
            user.deprovisioned_at = None
            user.deprovision_reason = None
        user.break_glass_expires_at = None
        user.break_glass_reason = None
        user.break_glass_granted_by_user_id = None
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
    async def _deprovision_user(
        cls,
        db: AsyncSession,
        *,
        user: User,
        actor: User | None,
        trigger: str,
        sync_status: str,
        deprovision_reason: str,
    ) -> dict[str, Any]:
        now = utc_now()
        user.directory_sync_status = sync_status
        user.deprovisioned_at = user.deprovisioned_at or now
        user.deprovision_reason = deprovision_reason

        if user.is_active:
            user.is_active = False
            user.token_version += 1
        db.add(user)

        revoked_rows = await db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user.id)
            .where(RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now, revoked_reason=f"{deprovision_reason}:{trigger}")
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
                f"(reason={deprovision_reason}, trigger={trigger}, revoked_sessions={revoked_sessions})"
            ),
        )
        return {
            "user_id": user.id,
            "email": user.email,
            "status": "deprovisioned",
            "reason": deprovision_reason,
            "revoked_sessions": revoked_sessions,
            "orphaned_items_flagged": orphan_count,
        }
