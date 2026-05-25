from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.datetime_utils import utc_now
from app.core.permission_cache import build_permission_sensitive_cache_key
from app.core.permissions import has_permission
from app.core.ttl_cache import TTLCache
from app.db.session import get_db
from app.models import ApprovalRequest, ApprovalStatus, OrphanedItem, User
from app.schemas.user import UserShellSummary
from app.services.approval_queue_visibility import count_visible_pending_approvals_for_user
from app.services.approval_scenario_policy import approval_privilege_tier
from app.services.authorization_capabilities import build_me_capabilities
from app.services.notification_visibility import count_visible_unread_notifications

router = APIRouter()
logger = logging.getLogger(__name__)

SHELL_SUMMARY_CACHE = TTLCache[dict](ttl_seconds=15, max_entries=500)
QUESTIONNAIRE_INBOX_DEGRADABLE_ERRORS = (SQLAlchemyError, ValueError, KeyError, TypeError)


async def _count_pending_approvals(db: AsyncSession, current_user: User) -> int:
    if approval_privilege_tier(current_user).is_privileged:
        result = await db.execute(
            select(func.count())
            .select_from(ApprovalRequest)
            .where(ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]))
        )
        return result.scalar() or 0

    return await count_visible_pending_approvals_for_user(db, current_user=current_user)


async def _count_questionnaire_inbox(db: AsyncSession, current_user: User) -> int:
    from app.services.risk_questionnaire_service import count_questionnaire_inbox

    if not has_permission(current_user, "risks", "read"):
        return 0
    return await count_questionnaire_inbox(db, current_user)


async def _build_shell_summary(db: AsyncSession, current_user: User) -> dict:
    can_view_governance = build_me_capabilities(current_user).can_view_governance

    unread_notifications_count = await count_visible_unread_notifications(db, current_user)

    pending_approvals_count = await _count_pending_approvals(db, current_user)
    questionnaire_inbox_count = 0
    try:
        questionnaire_inbox_count = await _count_questionnaire_inbox(db, current_user)
    except QUESTIONNAIRE_INBOX_DEGRADABLE_ERRORS:
        logger.warning(
            "Shell summary questionnaire inbox count degraded for user %s",
            current_user.id,
            exc_info=True,
        )
        questionnaire_inbox_count = 0

    orphan_total_count = 0
    if can_view_governance:
        orphan_total_count = (
            await db.execute(select(func.count()).select_from(OrphanedItem).where(OrphanedItem.status == "pending"))
        ).scalar() or 0

    return {
        "unread_notifications_count": unread_notifications_count,
        "pending_approvals_count": pending_approvals_count,
        "questionnaire_inbox_count": questionnaire_inbox_count,
        "orphan_total_count": orphan_total_count,
        "can_view_governance": can_view_governance,
        "generated_at": utc_now().isoformat(),
    }


@router.get("/me/shell-summary", response_model=UserShellSummary)
async def get_shell_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> UserShellSummary:
    cache_key = build_permission_sensitive_cache_key(current_user)
    cached = SHELL_SUMMARY_CACHE.get(cache_key)
    if cached is not None:
        return UserShellSummary(**cached)

    payload = await _build_shell_summary(db, current_user)
    return UserShellSummary(**SHELL_SUMMARY_CACHE.set(cache_key, payload))
