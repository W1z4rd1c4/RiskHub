import logging
from typing import Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.api.v1.endpoints._monitoring_response import load_monitoring_response_context, serialize_kri_response
from app.core.datetime_utils import utc_now
from app.core.permissions import can_read_vendor
from app.core.security import check_permission
from app.models import KeyRiskIndicator, Risk, User, VendorKRILink
from app.schemas.kri import KRIRecordValue, KRIResponse
from app.schemas.vendor_shared import LinkedVendorRead
from app.services.authorization_capabilities import kri_capabilities

from .governance import describe_kri_limit_breach

logger = logging.getLogger(__name__)


def visible_linked_vendors(current_user: User, vendor_links) -> list[LinkedVendorRead]:
    can_read_vendors = check_permission(current_user, "vendors", "read")
    return [
        LinkedVendorRead(id=link.vendor.id, name=link.vendor.name)
        for link in vendor_links or []
        if getattr(link, "vendor", None) is not None
        and can_read_vendors
        and can_read_vendor(link.vendor, current_user)
    ]


async def _run_best_effort_notification(
    *,
    warning_message: str,
    operation: Callable[[], Awaitable[None]],
    on_error: Callable[[], Awaitable[None]] | None = None,
) -> None:
    try:
        await operation()
    except Exception as exc:
        if on_error is not None:
            await on_error()
        logger.warning("%s: %s", warning_message, exc)


async def _apply_kri_value_directly(
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

    await KRIHistoryService.record_value(
        db=db,
        kri=kri,
        value=data.value,
        recorded_by_id=current_user.id,
        recorded_at=data.recorded_at,
        period_end=data.period_end,
        is_privileged=is_privileged_submission,
    )
    await db.commit()
    await db.refresh(kri)

    breach_msg = describe_kri_limit_breach(
        value=data.value,
        lower_limit=kri.lower_limit,
        upper_limit=kri.upper_limit,
    )
    if breach_msg is not None:
        if kri.reporting_owner_id:
            reporting_owner_id = kri.reporting_owner_id

            async def _notify_reporting_owner() -> None:
                await NotificationService.create_notification(
                    db=db,
                    user_id=reporting_owner_id,
                    notification_type=NotificationType.KRI_BREACH_DETECTED,
                    title="KRI Breach Detected",
                    message=f"KRI '{kri.metric_name}' breached limits! {breach_msg}",
                    resource_type="kri",
                    resource_id=kri.id,
                )

            await _run_best_effort_notification(
                warning_message="Failed to notify KRI reporting owner about breach",
                operation=_notify_reporting_owner,
            )

        if kri.risk and kri.risk.owner_id and kri.risk.owner_id != kri.reporting_owner_id:
            risk_owner_id = kri.risk.owner_id

            async def _notify_risk_owner() -> None:
                await NotificationService.create_notification(
                    db=db,
                    user_id=risk_owner_id,
                    notification_type=NotificationType.KRI_BREACH_DETECTED,
                    title="Risk KRI Breach",
                    message=f"KRI for your risk '{kri.risk.risk_id_code}' breached limits! {breach_msg}",
                    resource_type="kri",
                    resource_id=kri.id,
                )

            await _run_best_effort_notification(
                warning_message="Failed to notify Risk owner about KRI breach",
                operation=_notify_risk_owner,
            )

        await db.commit()

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
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())
    capabilities = await kri_capabilities(db, current_user=current_user, kri=reloaded_kri)
    return serialize_kri_response(
        reloaded_kri,
        monitoring_context,
        linked_vendors=visible_linked_vendors(current_user, getattr(reloaded_kri, "vendor_links", [])),
        capabilities=capabilities,
    )
