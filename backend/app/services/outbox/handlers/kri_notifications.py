"""KRI-related outbox notification handlers."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Notification, NotificationType
from app.services.notification_service import NotificationService
from app.services.outbox.handlers.common import run_notification_operation
from app.services.outbox.payloads import KriBreachDetectedPayload


async def _create_kri_breach_notification_once(
    db: AsyncSession,
    payload: KriBreachDetectedPayload,
) -> Notification | None:
    existing = (
        (
            await db.execute(
                select(Notification)
                .where(
                    Notification.user_id == payload.recipient_user_id,
                    Notification.type == NotificationType.KRI_BREACH_DETECTED,
                    Notification.resource_type == "kri",
                    Notification.resource_id == payload.kri_id,
                    Notification.title == payload.title,
                    Notification.message == payload.message,
                )
                .limit(1)
            )
        )
        .scalars()
        .first()
    )
    if existing is not None:
        return existing

    return await NotificationService.create_notification(
        db=db,
        user_id=payload.recipient_user_id,
        notification_type=NotificationType.KRI_BREACH_DETECTED,
        title=payload.title,
        message=payload.message,
        resource_type="kri",
        resource_id=payload.kri_id,
    )


async def handle_kri_breach_detected(db: AsyncSession, payload: KriBreachDetectedPayload) -> None:
    await run_notification_operation(
        _create_kri_breach_notification_once(
            db=db,
            payload=payload,
        )
    )
