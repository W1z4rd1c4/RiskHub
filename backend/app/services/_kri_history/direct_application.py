import logging
from collections.abc import Awaitable, Callable
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core.audit.kri import kri_value_created, kri_value_mutation_updated
from app.core.datetime_utils import utc_now
from app.core.permissions import can_read_vendor
from app.core.security import check_permission
from app.models import KeyRiskIndicator, Risk, User, VendorKRILink
from app.schemas.kri import KRIRecordValue, KRIResponse
from app.schemas.vendor_shared import LinkedVendorRead
from app.services.authorization_capabilities import kri_capabilities

from .governance import (
    build_kri_value_mutation_changes,
    capture_kri_value_mutation_snapshot,
    describe_kri_limit_breach,
)
from .projection import serialize_kri_history_response

logger = logging.getLogger(__name__)

MAX_KRI_BREACH_NOTIFICATION_WARNING_LENGTH = 500


def visible_linked_vendors(current_user: User, vendor_links) -> list[LinkedVendorRead]:
    can_read_vendors = check_permission(current_user, "vendors", "read")
    return [
        LinkedVendorRead(
            id=link.vendor.id,
            name=link.vendor.name,
            status=link.vendor.status,
            is_archived=link.vendor.is_archived,
        )
        for link in vendor_links or []
        if getattr(link, "vendor", None) is not None
        and can_read_vendors
        and can_read_vendor(link.vendor, current_user)
    ]


async def run_best_effort_notification(
    *,
    warning_message: str,
    operation: Callable[[], Awaitable[None]],
    on_error: Callable[[], Awaitable[None]] | None = None,
    db: AsyncSession | None = None,
    commit_on_success: bool = False,
) -> None:
    try:
        await operation()
        if commit_on_success and db is not None:
            await db.commit()
    except Exception as exc:
        if db is not None:
            await db.rollback()
        if on_error is not None:
            await on_error()
        logger.warning("%s: %s", warning_message, exc)


async def run_best_effort_notification_batch(
    *,
    warning_message: str,
    operations: list[Callable[[], Awaitable[None]]],
    db: AsyncSession,
) -> None:
    if not operations:
        return
    try:
        for operation in operations:
            await operation()
        await db.commit()
    except Exception as exc:
        await db.rollback()
        logger.warning("%s: %s", warning_message, exc)


def format_kri_breach_notification_warning(warning_messages: list[str]) -> str:
    message = "Failed to create KRI breach notifications"
    if warning_messages:
        message = f"{message}: {'; '.join(warning_messages)}"
    if len(message) <= MAX_KRI_BREACH_NOTIFICATION_WARNING_LENGTH:
        return message
    return f"{message[: MAX_KRI_BREACH_NOTIFICATION_WARNING_LENGTH - 3]}..."


async def apply_kri_value_directly(
    db: AsyncSession,
    *,
    kri: KeyRiskIndicator,
    data: KRIRecordValue,
    current_user: User,
    is_privileged_submission: bool,
) -> KRIResponse:
    from app.models.notification import NotificationType
    from app.services.kri_history_service import KRIHistoryService
    from app.services.notification_service import NotificationService

    notification_payloads: list[tuple[str, dict[str, Any]]] = []
    try:
        mutation_snapshot = capture_kri_value_mutation_snapshot(kri)
        history_entry = await KRIHistoryService.record_value(
            db=db,
            kri=kri,
            value=data.value,
            recorded_by_id=current_user.id,
            recorded_at=data.recorded_at,
            period_end=data.period_end,
            is_privileged=is_privileged_submission,
        )
        await kri_value_created(
            db,
            actor=current_user,
            kri=kri,
            history_entry=history_entry,
            value=data.value,
        )
        kri_changes = build_kri_value_mutation_changes(kri, mutation_snapshot)
        if kri_changes:
            await kri_value_mutation_updated(
                db,
                actor=current_user,
                kri=kri,
                changes=kri_changes,
                description="Updated via direct value submission",
            )

        breach_msg = describe_kri_limit_breach(
            value=data.value,
            lower_limit=kri.lower_limit,
            upper_limit=kri.upper_limit,
        )
        if breach_msg is not None:
            if kri.reporting_owner_id:
                reporting_owner_id = kri.reporting_owner_id
                notification_payloads.append(
                    (
                        "Failed to notify KRI reporting owner about breach",
                        {
                            "user_id": reporting_owner_id,
                            "notification_type": NotificationType.KRI_BREACH_DETECTED,
                            "title": "KRI Breach Detected",
                            "message": f"KRI '{kri.metric_name}' breached limits! {breach_msg}",
                            "resource_type": "kri",
                            "resource_id": kri.id,
                        },
                    )
                )

            if kri.risk and kri.risk.owner_id and kri.risk.owner_id != kri.reporting_owner_id:
                risk_owner_id = kri.risk.owner_id
                notification_payloads.append(
                    (
                        "Failed to notify Risk owner about KRI breach",
                        {
                            "user_id": risk_owner_id,
                            "notification_type": NotificationType.KRI_BREACH_DETECTED,
                            "title": "Risk KRI Breach",
                            "message": f"KRI for your risk '{kri.risk.risk_id_code}' breached limits! {breach_msg}",
                            "resource_type": "kri",
                            "resource_id": kri.id,
                        },
                    )
                )

        await db.commit()
    except ValueError:
        raise
    except Exception:
        await db.rollback()
        raise

    await db.refresh(kri)

    now = utc_now()
    result = await db.execute(
        select(KeyRiskIndicator)
        .join(Risk)
        .where(KeyRiskIndicator.id == kri.id)
        .options(
            joinedload(KeyRiskIndicator.risk).joinedload(Risk.owner),
            joinedload(KeyRiskIndicator.risk).joinedload(Risk.department),
            selectinload(KeyRiskIndicator.reporting_owner),
            selectinload(KeyRiskIndicator.vendor_links).selectinload(VendorKRILink.vendor),
        )
    )
    reloaded_kri = result.scalar_one()
    capabilities = await kri_capabilities(db, current_user=current_user, kri=reloaded_kri)
    response = await serialize_kri_history_response(
        db,
        kri=reloaded_kri,
        now=now,
        linked_vendors=visible_linked_vendors(current_user, getattr(reloaded_kri, "vendor_links", [])),
        capabilities=capabilities,
    )

    notification_operations: list[Callable[[], Awaitable[None]]] = []
    warning_messages: list[str] = []
    for warning_message, payload in notification_payloads:
        warning_messages.append(warning_message)

        async def create_notification(notification_payload: dict[str, Any] = payload) -> None:
            await NotificationService.create_notification(db=db, **notification_payload)

        notification_operations.append(create_notification)

    await run_best_effort_notification_batch(
        warning_message=format_kri_breach_notification_warning(warning_messages),
        operations=notification_operations,
        db=db,
    )

    return response
