"""Notification policy helpers for vendor SLA deadline evaluation."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.i18n import t
from app.models import User
from app.models.notification import NotificationType
from app.models.vendor_sla import VendorSLA
from app.services.notification_service import NotificationService
from app.services.vendor_sla_deadline_support import (
    VendorSLADeadlineContext,
    check_duplicate_vendor_notification,
)


async def _create_localized_vendor_notification(
    db: AsyncSession,
    *,
    user: User,
    context: VendorSLADeadlineContext,
    notification_type: NotificationType,
    title_key: str,
    message_key: str,
    message_kwargs: dict[str, str],
    lookback_days: int,
    now: datetime,
    visibility_cache: dict[tuple[int, int], bool],
) -> bool:
    if await check_duplicate_vendor_notification(
        db,
        vendor_id=context.vendor_id,
        notification_type=notification_type,
        lookback_days=lookback_days,
        now=now,
    ):
        return False

    locale = getattr(user, "preferred_language", None) or "en"
    return await NotificationService.create_vendor_notification_if_visible(
        db=db,
        user=user,
        vendor_id=context.vendor_id,
        notification_type=notification_type,
        title=t(title_key, locale=locale),
        message=t(
            message_key,
            locale=locale,
            vendor_name=context.vendor_name,
            sla_name=message_kwargs.get("sla_name", ""),
            due_date=message_kwargs.get("due_date", ""),
        ),
        created_at=now,
        visibility_cache=visibility_cache,
    )


def _increment_result(results: dict[str, int], key: str, *, created: bool) -> None:
    if not created:
        return
    results[key] += 1
    results["notifications_created"] += 1


def _build_breach_recipients(
    *,
    reporting_owner: User,
    governance_recipients: list[User],
    owners_by_id: dict[int, User],
    outsourcing_owner_id: int | None,
) -> list[User]:
    recipients: list[User] = [reporting_owner]
    if outsourcing_owner_id and outsourcing_owner_id != reporting_owner.id:
        owner = owners_by_id.get(outsourcing_owner_id)
        if owner:
            recipients.append(owner)

    skip_ids = {reporting_owner.id, outsourcing_owner_id}
    recipients.extend(recipient for recipient in governance_recipients if recipient.id not in skip_ids)
    return recipients


async def process_due_notifications(
    db: AsyncSession,
    *,
    sla: VendorSLA,
    context: VendorSLADeadlineContext,
    today: date,
    config: dict[str, float | int],
    now: datetime,
    visibility_cache: dict[tuple[int, int], bool],
    results: dict[str, int],
) -> None:
    duplicate_lookback_days = int(config["duplicate_lookback_days"])
    due = context.due

    if due == today + timedelta(days=1):
        created = await _create_localized_vendor_notification(
            db,
            user=context.reporting_owner,
            context=context,
            notification_type=NotificationType.VENDOR_SLA_DUE_TOMORROW,
            title_key="notifications.vendor_sla_due_tomorrow_title",
            message_key="notifications.vendor_sla_due_tomorrow_message",
            message_kwargs={"sla_name": sla.metric_name, "due_date": context.due_str},
            lookback_days=duplicate_lookback_days,
            now=now,
            visibility_cache=visibility_cache,
        )
        _increment_result(results, "due_tomorrow", created=created)

    if today <= due <= (today + timedelta(days=7)):
        created = await _create_localized_vendor_notification(
            db,
            user=context.reporting_owner,
            context=context,
            notification_type=NotificationType.VENDOR_SLA_DUE_SOON,
            title_key="notifications.vendor_sla_due_soon_title",
            message_key="notifications.vendor_sla_due_soon_message",
            message_kwargs={"sla_name": sla.metric_name, "due_date": context.due_str},
            lookback_days=duplicate_lookback_days,
            now=now,
            visibility_cache=visibility_cache,
        )
        _increment_result(results, "due_soon", created=created)

    if due < today:
        created = await _create_localized_vendor_notification(
            db,
            user=context.reporting_owner,
            context=context,
            notification_type=NotificationType.VENDOR_SLA_OVERDUE,
            title_key="notifications.vendor_sla_overdue_title",
            message_key="notifications.vendor_sla_overdue_message",
            message_kwargs={"sla_name": sla.metric_name, "due_date": context.due_str},
            lookback_days=duplicate_lookback_days,
            now=now,
            visibility_cache=visibility_cache,
        )
        _increment_result(results, "overdue", created=created)


async def process_breach_notifications(
    db: AsyncSession,
    *,
    sla: VendorSLA,
    context: VendorSLADeadlineContext,
    governance_recipients: list[User],
    owners_by_id: dict[int, User],
    config: dict[str, float | int],
    now: datetime,
    visibility_cache: dict[tuple[int, int], bool],
    results: dict[str, int],
) -> None:
    duplicate_lookback_days = int(config["duplicate_lookback_days"])
    breach_status = sla.breach_status

    if breach_status in ("above", "below"):
        if await check_duplicate_vendor_notification(
            db,
            vendor_id=context.vendor_id,
            notification_type=NotificationType.VENDOR_SLA_BREACH_DETECTED,
            lookback_days=duplicate_lookback_days,
            now=now,
        ):
            return

        recipients = _build_breach_recipients(
            reporting_owner=context.reporting_owner,
            governance_recipients=governance_recipients,
            owners_by_id=owners_by_id,
            outsourcing_owner_id=context.outsourcing_owner_id,
        )

        for recipient in recipients:
            locale = getattr(recipient, "preferred_language", None) or "en"
            await NotificationService.create_vendor_notification_if_visible(
                db=db,
                user=recipient,
                vendor_id=context.vendor_id,
                notification_type=NotificationType.VENDOR_SLA_BREACH_DETECTED,
                title=t("notifications.vendor_sla_breach_detected_title", locale=locale),
                message=t(
                    "notifications.vendor_sla_breach_detected_message",
                    locale=locale,
                    vendor_name=context.vendor_name,
                    sla_name=sla.metric_name,
                ),
                created_at=now,
                visibility_cache=visibility_cache,
            )

        results["breached"] += 1
        return

    range_size = sla.upper_limit - sla.lower_limit
    if range_size <= 0:
        return

    threshold_value = sla.lower_limit + (range_size * float(config["near_breach_threshold"]))
    if sla.current_value < threshold_value:
        return

    created = await _create_localized_vendor_notification(
        db,
        user=context.reporting_owner,
        context=context,
        notification_type=NotificationType.VENDOR_SLA_NEAR_BREACH,
        title_key="notifications.vendor_sla_near_breach_title",
        message_key="notifications.vendor_sla_near_breach_message",
        message_kwargs={"sla_name": sla.metric_name},
        lookback_days=duplicate_lookback_days,
        now=now,
        visibility_cache=visibility_cache,
    )
    _increment_result(results, "near_breach", created=created)
