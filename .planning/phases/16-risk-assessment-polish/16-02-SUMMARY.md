# 16-02 — Reminder controls (2 days before + weekly overdue Mondays)

## GlobalConfig keys (seeded defaults)

- `questionnaire_pre_due_reminder_days`
  - type: int
  - default: `2`
  - min/max: `0`–`30`
- `questionnaire_overdue_reminder_weekday`
  - type: int
  - default: `0` (Monday; Python weekday `0..6`)
  - min/max: `0`–`6`

## Reminder logic (timezone-safe)

`QuestionnaireDeadlineService.check_questionnaire_deadlines(db, now=...)`:

- Uses `now = now or datetime.now(UTC)` and `today = now.date()`.
- Pre-due reminder:
  - If `q.due_at.date() == today + timedelta(days=questionnaire_pre_due_reminder_days)` → send **once**.
- Overdue reminder:
  - If `q.due_at < now` **and** `today.weekday() == questionnaire_overdue_reminder_weekday` → send (default Mondays).
  - Dedupe: at most one per week via 7-day lookback.
- Recipient: questionnaire assignee (Risk Owner) only.

## Deterministic tests

- Added optional `now` param to `check_questionnaire_deadlines(...)` to make weekday/date logic testable.
- `NotificationService.create_notification(...)` accepts optional `created_at` so reminder notifications use the injected `now` (stable dedupe).
- Tests clear the GlobalConfig cache and pass fixed `now` values (Monday vs Tuesday) to assert Monday-only behavior.
