# Plan 09-05 Summary: Background Task Scheduler for KRI Deadlines

**Implemented APScheduler with daily KRI breach checking and manual trigger endpoint.**

## Decision Made

**Scheduler Approach**: APScheduler (in-process)
- Simple setup, good for single-instance MVP
- No external dependencies like Redis

## Accomplishments

- Created `KRIDeadlineService` with:
  - `check_kri_deadlines()` - Checks all KRIs for breach/near-breach
  - `_check_duplicate_notification()` - Prevents spam within 7-day lookback
  - `_get_risk_managers()` - Gets approvers for escalation
- Created `scheduler.py` with APScheduler:
  - Daily cron job at 8:00 AM
  - Proper startup/shutdown lifecycle
- Integrated scheduler into `main.py` via lifespan
- Added manual trigger endpoint: `POST /api/v1/notifications/trigger-kri-check`
- Created 5 tests, all passing

## Files Created/Modified

| File | Action |
|------|--------|
| `backend/app/services/kri_deadline_service.py` | Created |
| `backend/app/core/scheduler.py` | Created |
| `backend/app/main.py` | Modified - added lifespan |
| `backend/app/api/v1/endpoints/notifications.py` | Modified - added trigger endpoint |
| `backend/tests/test_kri_deadline_service.py` | Created - 5 tests |
| `backend/requirements.txt` | Modified - added APScheduler |

## Notification Types Generated

- **KRI_OVERDUE**: When value exceeds limits
- **KRI_NEAR_BREACH**: When value >= 80% towards upper limit

## Note on KRI Model

The current KRI model doesn't have a `reporting_deadline` field, so deadline-based notifications (due soon, due tomorrow) are not implemented. This focuses on breach detection. If deadlines are added to the model later, they can be easily added to the service.

---
*Completed: 2025-12-28*
