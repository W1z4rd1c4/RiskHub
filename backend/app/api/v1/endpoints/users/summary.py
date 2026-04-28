from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.datetime_utils import utc_now
from app.core.permissions import can_manage_users, ensure_business_view_access, has_permission
from app.core.ttl_cache import TTLCache
from app.db.session import get_db
from app.models import ApprovalRequest, ApprovalStatus, Notification, OrphanedItem, User
from app.schemas.user import UserShellSummary
from app.services.approval_queue_visibility import count_visible_pending_approvals_for_user

router = APIRouter()

SHELL_SUMMARY_CACHE = TTLCache[dict](ttl_seconds=15, max_entries=500)


async def _count_pending_approvals(db: AsyncSession, current_user: User) -> int:
    from app.core.permissions import can_resolve_approvals

    if can_resolve_approvals(current_user):
        result = await db.execute(
            select(func.count())
            .select_from(ApprovalRequest)
            .where(ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]))
        )
        return result.scalar() or 0

    return await count_visible_pending_approvals_for_user(db, current_user=current_user)


async def _count_questionnaire_inbox(db: AsyncSession, current_user: User) -> int:
    from app.api.v1.endpoints.risk_questionnaires.inbox import get_questionnaire_inbox

    if not has_permission(current_user, "risks", "read"):
        return 0
    items = await get_questionnaire_inbox(db=db, current_user=current_user)
    return len(items)


def _can_view_governance(current_user: User) -> bool:
    try:
        ensure_business_view_access(current_user, detail="Platform admins cannot access Governance business data")
    except Exception:
        return False
    return can_manage_users(current_user)


async def _build_shell_summary(db: AsyncSession, current_user: User) -> dict:
    can_view_governance = _can_view_governance(current_user)

    unread_notifications_count = (
        await db.execute(
            select(func.count()).where(
                Notification.user_id == current_user.id,
                Notification.is_read.is_(False),
            )
        )
    ).scalar() or 0

    pending_approvals_count = await _count_pending_approvals(db, current_user)
    questionnaire_inbox_count = 0
    try:
        questionnaire_inbox_count = await _count_questionnaire_inbox(db, current_user)
    except Exception:
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
    cache_key = (
        current_user.id,
        getattr(current_user.access_scope, "value", str(current_user.access_scope)),
        current_user.department_id,
        getattr(getattr(current_user, "role", None), "name", None),
    )
    cached = SHELL_SUMMARY_CACHE.get(cache_key)
    if cached is not None:
        return UserShellSummary(**cached)

    payload = await _build_shell_summary(db, current_user)
    return UserShellSummary(**SHELL_SUMMARY_CACHE.set(cache_key, payload))
