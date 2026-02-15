"""Questionnaire deadline checking service for generating notifications."""
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.i18n import t
from app.models import RiskQuestionnaire
from app.models.global_config import ConfigDefaults, get_config_int
from app.models.notification import Notification, NotificationType
from app.models.risk_questionnaire import RiskQuestionnaireStatus
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)


class QuestionnaireDeadlineService:
    """Service for checking questionnaire deadlines and generating notifications."""

    DUPLICATE_LOOKBACK_DAYS = 7

    @staticmethod
    async def check_questionnaire_deadlines(db: AsyncSession, *, now: datetime | None = None) -> dict[str, int]:
        results = {
            "due_soon": 0,
            "overdue": 0,
            "total_checked": 0,
            "notifications_created": 0,
        }

        now = now or datetime.now(UTC)
        today = now.date()

        pre_due_days = await get_config_int(
            db,
            "questionnaire_pre_due_reminder_days",
            ConfigDefaults.QUESTIONNAIRE_PRE_DUE_REMINDER_DAYS,
        )
        overdue_weekday = await get_config_int(
            db,
            "questionnaire_overdue_reminder_weekday",
            ConfigDefaults.QUESTIONNAIRE_OVERDUE_REMINDER_WEEKDAY,
        )
        target_due_date = today + timedelta(days=pre_due_days)

        stmt = (
            select(RiskQuestionnaire)
            .where(RiskQuestionnaire.status.in_([RiskQuestionnaireStatus.sent, RiskQuestionnaireStatus.in_progress]))
            .options(
                selectinload(RiskQuestionnaire.risk),
                selectinload(RiskQuestionnaire.assigned_to_user),
            )
        )
        result = await db.execute(stmt)
        questionnaires = result.scalars().all()
        results["total_checked"] = len(questionnaires)

        for q in questionnaires:
            try:
                assignee = q.assigned_to_user
                if not assignee:
                    continue

                locale = (assignee.preferred_language or "en") if hasattr(assignee, "preferred_language") else "en"
                due_date_str = q.due_at.date().isoformat()
                risk_name = q.risk.name if q.risk else "Risk"

                # Pre-due reminder: due date is N days from today
                if q.due_at.date() == target_due_date:
                    if not await QuestionnaireDeadlineService._check_duplicate_notification(
                        db,
                        resource_type="risk",
                        resource_id=q.risk_id,
                        notification_type=NotificationType.QUESTIONNAIRE_DUE_SOON,
                        lookback_days=QuestionnaireDeadlineService.DUPLICATE_LOOKBACK_DAYS,
                        now=now,
                    ):
                        created = await NotificationService.create_notification(
                            db=db,
                            user_id=assignee.id,
                            notification_type=NotificationType.QUESTIONNAIRE_DUE_SOON,
                            title=t("notifications.questionnaire_due_soon_title", locale=locale),
                            message=t(
                                "notifications.questionnaire_due_soon_message",
                                locale=locale,
                                risk_name=risk_name,
                                due_date=due_date_str,
                            ),
                            resource_type="risk",
                            resource_id=q.risk_id,
                            created_at=now,
                        )
                        if created:
                            results["notifications_created"] += 1
                            results["due_soon"] += 1

                # Overdue: due date passed; send on configured weekday (default Monday), deduped weekly.
                if q.due_at < now and today.weekday() == overdue_weekday:
                    if not await QuestionnaireDeadlineService._check_duplicate_notification(
                        db,
                        resource_type="risk",
                        resource_id=q.risk_id,
                        notification_type=NotificationType.QUESTIONNAIRE_OVERDUE,
                        lookback_days=7,
                        now=now,
                    ):
                        created = await NotificationService.create_notification(
                            db=db,
                            user_id=assignee.id,
                            notification_type=NotificationType.QUESTIONNAIRE_OVERDUE,
                            title=t("notifications.questionnaire_overdue_title", locale=locale),
                            message=t(
                                "notifications.questionnaire_overdue_message",
                                locale=locale,
                                risk_name=risk_name,
                                due_date=due_date_str,
                            ),
                            resource_type="risk",
                            resource_id=q.risk_id,
                            created_at=now,
                        )
                        if created:
                            results["notifications_created"] += 1
                            results["overdue"] += 1

            except Exception as e:
                logger.error(f"Error checking questionnaire {getattr(q, 'id', None)}: {e}")
                continue

        await db.commit()
        return results

    @staticmethod
    async def _check_duplicate_notification(
        db: AsyncSession,
        *,
        resource_type: str,
        resource_id: int,
        notification_type: NotificationType,
        lookback_days: int,
        now: datetime,
    ) -> bool:
        cutoff_date = now - timedelta(days=lookback_days)
        stmt = (
            select(Notification)
            .where(
                and_(
                    Notification.resource_type == resource_type,
                    Notification.resource_id == resource_id,
                    Notification.type == notification_type,
                    Notification.created_at >= cutoff_date,
                )
            )
            .limit(1)
        )
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()
        return existing is not None
