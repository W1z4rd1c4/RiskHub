# Phase 14-03 Summary — Notifications + reminders + activity logging

## Notification types

Added `NotificationType` values:
- `questionnaire_sent`
- `questionnaire_due_soon`
- `questionnaire_overdue`
- `questionnaire_submitted`

DB enum migration:
- `backend/alembic/versions/b14c1d2e3f4a_add_questionnaire_notification_types.py`

## Localization (EN/CS)

Added backend i18n keys (per-recipient locale via `user.preferred_language`):
- `notifications.questionnaire_sent_{title,message}`
- `notifications.questionnaire_due_soon_{title,message}`
- `notifications.questionnaire_overdue_{title,message}`
- `notifications.questionnaire_submitted_{title,message}`

## Notification wiring

Implemented:
- On send (`POST /risks/{risk_id}/questionnaires/send`): notify assignee (`questionnaire_sent`)
- On submit (`POST /questionnaires/{id}/submit`): notify RM/CRO recipients (`questionnaire_submitted`)
- Daily scheduler reminders: `QuestionnaireDeadlineService` sends `due_soon` (7 days before) and `overdue` (weekly max) notifications

Scheduler job:
- `backend/app/core/scheduler.py` schedules `run_questionnaire_check` daily at 08:05.

## Activity log

Added `ActivityEntityType.RISK_QUESTIONNAIRE` and logs:
- send → `ActivityAction.CREATE`
- submit → `ActivityAction.STATUS_CHANGE`

## UI preferences

Added questionnaire notification toggles:
- `frontend/src/components/settings/NotificationSettings.tsx`
- `frontend/src/i18n/locales/{en,cs}/settings.json`
- `frontend/src/components/notifications/NotificationBell.tsx` icon mapping

