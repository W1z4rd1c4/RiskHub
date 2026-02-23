import logging
from datetime import date
from typing import Awaitable, Callable

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.permissions import check_department_access
from app.models import KeyRiskIndicator, Risk, User
from app.schemas.kri import KRIRecordValue, KRIResponse

logger = logging.getLogger(__name__)


async def _run_best_effort_notification(
    *,
    warning_message: str,
    operation: Callable[[], Awaitable[None]],
    on_error: Callable[[], Awaitable[None]] | None = None,
) -> None:
    try:
        await operation()
    except Exception as exc:  # noqa: BLE001 - notification side-effects are intentionally best-effort
        if on_error is not None:
            await on_error()
        logger.warning("%s: %s", warning_message, exc)


async def _load_kri_with_risk_or_404(db: AsyncSession, kri_id: int) -> KeyRiskIndicator:
    result = await db.execute(
        select(KeyRiskIndicator)
        .join(Risk)
        .where(KeyRiskIndicator.id == kri_id)
        .options(joinedload(KeyRiskIndicator.risk))
    )
    kri = result.scalar_one_or_none()
    if not kri:
        raise HTTPException(status_code=404, detail="KRI not found")
    return kri


async def _assert_kri_submit_access(
    db: AsyncSession,
    *,
    kri: KeyRiskIndicator,
    kri_id: int,
    current_user: User,
) -> None:
    from app.core.permissions import has_permission, is_kri_reporting_owner

    is_reporting_owner = await is_kri_reporting_owner(db, current_user.id, kri_id)
    if not (is_reporting_owner or has_permission(current_user, "kri", "submit")):
        raise HTTPException(
            status_code=403,
            detail="Permission denied: requires kri:submit permission or be reporting owner",
        )
    if not is_reporting_owner:
        check_department_access(kri.risk.department_id, current_user)


async def _create_kri_submission_approval(
    db: AsyncSession,
    *,
    kri: KeyRiskIndicator,
    data: KRIRecordValue,
    current_user: User,
):
    from datetime import UTC, datetime

    from fastapi.responses import JSONResponse

    from app.core.approval_helpers import create_approval_request_with_audit
    from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, ApprovalStatus
    from app.models.notification import NotificationType
    from app.services.kri_history_service import KRIHistoryService
    from app.services.notification_service import NotificationService

    today = date.today()
    _, latest_closed_end = KRIHistoryService.latest_closed_period_for_date(today, kri.frequency)

    if data.period_end and data.period_end != latest_closed_end:
        raise HTTPException(status_code=400, detail="Non-privileged users cannot specify custom period_end")

    existing = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == ApprovalResourceType.KRI,
            ApprovalRequest.resource_id == kri.id,
            ApprovalRequest.action_type == ApprovalActionType.EDIT,
            ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="A value submission request is already pending for this KRI")

    primary_approver_id = kri.risk.owner_id if kri.risk else None
    requires_privileged = bool(kri.risk and kri.risk.is_priority)
    recorded_at = datetime.now(UTC).isoformat()
    pending_changes = {
        "current_value": {"old": kri.current_value, "new": data.value},
        "period_end": latest_closed_end.isoformat(),
        "recorded_at": recorded_at,
    }

    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.KRI,
        resource_id=kri.id,
        resource_name=f"{kri.metric_name[:30]} (value submission)",
        requested_by_id=current_user.id,
        reason=f"KRI value submission: {data.value}",
        action_type=ApprovalActionType.EDIT,
        pending_changes=pending_changes,
        status=ApprovalStatus.PENDING,
        primary_approver_id=primary_approver_id,
        requires_privileged_approval=requires_privileged,
    )
    await create_approval_request_with_audit(
        db,
        approval=approval,
        actor=current_user,
        department_id=kri.risk.department_id,
        on_duplicate_detail="A value submission request is already pending for this KRI.",
    )

    if primary_approver_id:
        async def _notify_primary_approver() -> None:
            await NotificationService.create_notification(
                db=db,
                user_id=primary_approver_id,
                notification_type=NotificationType.APPROVAL_PENDING,
                title="KRI Value Submission",
                message=f"KRI '{kri.metric_name}' value submitted for your approval",
                resource_type="approval",
                resource_id=approval.id,
            )
            await db.commit()

        await _run_best_effort_notification(
            warning_message=f"Failed to notify Risk Owner for KRI value submission approval #{approval.id}",
            operation=_notify_primary_approver,
            on_error=db.rollback,
        )

    return JSONResponse(
        status_code=202,
        content={
            "message": "Value submission requires approval"
            + (" (priority risk - privileged approval also required)" if requires_privileged else ""),
            "approval_id": approval.id,
            "action_type": "edit",
            "primary_approver_id": primary_approver_id,
            "requires_privileged_approval": requires_privileged,
            "pending_changes": pending_changes,
        },
    )


async def _apply_kri_value_directly(
    db: AsyncSession,
    *,
    kri: KeyRiskIndicator,
    data: KRIRecordValue,
    current_user: User,
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
        is_privileged=True,
    )
    await db.commit()
    await db.refresh(kri)

    breach_detected = False
    breach_msg = ""
    if data.value < kri.lower_limit:
        breach_detected = True
        breach_msg = f"Value {data.value} is below lower limit {kri.lower_limit}"
    elif data.value > kri.upper_limit:
        breach_detected = True
        breach_msg = f"Value {data.value} exceeds upper limit {kri.upper_limit}"

    if breach_detected:
        if kri.reporting_owner_id:
            async def _notify_reporting_owner() -> None:
                await NotificationService.create_notification(
                    db=db,
                    user_id=kri.reporting_owner_id,
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
            async def _notify_risk_owner() -> None:
                await NotificationService.create_notification(
                    db=db,
                    user_id=kri.risk.owner_id,
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

    return KRIResponse.model_validate(kri)
