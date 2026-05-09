from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable, Iterable
from typing import Any, TypeVar

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import NotificationType
from app.services.notification_service import NotificationService

from .contracts import DeadlineNotificationPlan, VisibilityCheck
from .plans import has_recent_deadline_notification
from .results import increment_deadline_results

TItem = TypeVar("TItem")

DeadlineProcessor = Callable[[TItem], Awaitable[dict[str, int]]]
DeadlineItemId = Callable[[TItem], Any]


async def create_deadline_notification(
    db: AsyncSession,
    *,
    user_id: int,
    notification_type: NotificationType,
    title: str,
    message: str,
    resource_type: str,
    resource_id: int,
    created_at=None,
    visibility_check: VisibilityCheck | None = None,
) -> bool:
    if visibility_check is not None and not await visibility_check():
        return False

    created = await NotificationService.create_notification(
        db=db,
        user_id=user_id,
        notification_type=notification_type,
        title=title,
        message=message,
        resource_type=resource_type,
        resource_id=resource_id,
        created_at=created_at,
    )
    return created is not None


async def execute_deadline_notification_plan(
    db: AsyncSession,
    *,
    plan: DeadlineNotificationPlan,
    results: dict[str, int] | None = None,
) -> bool:
    if plan.lookback_days is not None and await has_recent_deadline_notification(
        db,
        resource_type=plan.resource_type,
        resource_id=plan.resource_id,
        notification_type=plan.notification_type,
        lookback_days=plan.lookback_days,
        now=plan.now,
        not_before=plan.not_before,
        message_contains=plan.message_contains,
    ):
        return False

    created = await create_deadline_notification(
        db,
        user_id=plan.user_id,
        notification_type=plan.notification_type,
        title=plan.title,
        message=plan.message,
        resource_type=plan.resource_type,
        resource_id=plan.resource_id,
        created_at=plan.now,
        visibility_check=plan.visibility_check,
    )
    if created and results is not None:
        result_keys: tuple[str, ...] = ("notifications_created",)
        if plan.result_bucket is not None:
            result_keys = (*result_keys, plan.result_bucket)
        increment_deadline_results(results, *result_keys)
    return created


async def run_deadline_items(
    db: Any,
    *,
    items: Iterable[TItem],
    results: dict[str, int],
    process_item: DeadlineProcessor[TItem],
    total_key: str | None = None,
    item_label: str = "deadline item",
    item_id: DeadlineItemId[TItem] | None = None,
    skip_result_keys: set[str] | None = None,
    logger: logging.Logger | None = None,
) -> dict[str, int]:
    item_list = list(items)
    if total_key is not None:
        results[total_key] = len(item_list)

    ignored_keys = skip_result_keys or set()
    for item in item_list:
        resolved_item_id = item_id(item) if item_id else getattr(item, "id", None)
        try:
            async with db.begin_nested():
                item_results = await process_item(item)
        except Exception as exc:
            if logger is not None:
                logger.error(
                    "%s deadline check failed for %s=%s: %s",
                    item_label,
                    item_label.replace(" ", "_"),
                    resolved_item_id,
                    exc,
                )
            continue

        for key, value in item_results.items():
            if key in ignored_keys or not value:
                continue
            increment_deadline_results(results, key, count=value)

    await db.commit()
    return results
