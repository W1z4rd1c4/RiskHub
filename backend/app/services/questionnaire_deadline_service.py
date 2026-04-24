"""Questionnaire deadline checking service for generating notifications."""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.i18n import t
from app.models import RiskQuestionnaire
from app.models.global_config import ConfigDefaults, get_config_int
from app.models.notification import NotificationType
from app.models.risk_questionnaire import RiskQuestionnaireStatus
from app.services.deadline_notifications import (
    create_deadline_notification,
    has_recent_deadline_notification,
    increment_deadline_results,
)

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
                        created = await create_deadline_notification(
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
                            increment_deadline_results(results, "notifications_created", "due_soon")

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
                        created = await create_deadline_notification(
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
                            increment_deadline_results(results, "notifications_created", "overdue")

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
        return await has_recent_deadline_notification(
            db,
            resource_type=resource_type,
            resource_id=resource_id,
            notification_type=notification_type,
            lookback_days=lookback_days,
            now=now,
        )
