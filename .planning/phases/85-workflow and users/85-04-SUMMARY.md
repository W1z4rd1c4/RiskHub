# Phase 85-04: KRI Workflow Improvements Summary

**Enhanced KRI reporting workflow with weekly reminders, CRO visibility, and expanded approvals.**

## Accomplishments

- Changed overdue reminder interval from 7 weeks to **weekly** (1 week)
- Added new `/kris/due-soon` endpoint for CRO visibility of upcoming KRI deadlines
- Expanded approval workflow: **ALL KRI edits** by non-privileged users now require CRO approval (not just critical-risk KRIs)
- Created `KRIStatusWidget` dashboard component with tabbed Upcoming/Overdue views
- Added comprehensive tests for new approval behavior and due-soon endpoint

## Files Created/Modified

### Backend
- `backend/app/services/kri_deadline_service.py` - `OVERDUE_REMINDER_WEEKS: 7 → 1`, lookback `49 → 7` days
- `backend/app/services/kri_history_service.py` - Added `get_due_soon_kris()` method
- `backend/app/api/v1/endpoints/kris.py` - Added `/due-soon` endpoint, removed `is_critical_risk()` check from `update_kri`
- `backend/tests/test_kri_deadline_service.py` - Updated constant test
- `backend/tests/test_kris_rbac.py` - Added approval workflow tests
- `backend/tests/test_kris_history_api.py` - Added due-soon endpoint tests

### Frontend
- `frontend/src/types/kri.ts` - Added `DueSoonKRI` interface
- `frontend/src/services/kriApi.ts` - Added `getDueSoon()` method
- `frontend/src/components/dashboard/KRIStatusWidget.tsx` - **[NEW]** Combined widget with tabs
- `frontend/src/pages/DashboardPage.tsx` - Replaced `KRIOverdueWidget` with `KRIStatusWidget`
- `frontend/src/pages/RiskDetailPage.tsx` - Fixed unused imports

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Weekly overdue reminders | More frequent nudges improve compliance |
| All KRI edits require approval | First value can be entered freely; all subsequent edits need CRO review |
| Combined tabbed widget | Better UX than separate widgets for upcoming vs overdue |

## Verification

- ✅ `test_deadline_service_constants` passes with `OVERDUE_REMINDER_WEEKS == 1`
- ✅ `test_get_due_soon_returns_list` passes
- ✅ Frontend builds without TypeScript errors
- ✅ All implementation complete

## Next Phase Readiness

Ready for Phase 151-09: KRI overdue visibility + history correction UI
