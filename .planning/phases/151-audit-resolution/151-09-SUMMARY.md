# Phase 151 Plan 09: KRI Overdue + Correction UI Summary

**Added overdue KRI visibility and history correction workflow to the frontend.**

## Accomplishments

- Created `KRIOverdueWidget` dashboard widget showing overdue KRIs with days overdue
- Updated `kriApi.getOverdue()` to support department filtering
- Added `isOverdue`/`daysOverdue` props to `KRIGaugeCard` with amber badge
- Created `KRIHistoryEditModal` for requesting history corrections
- Added "Request Correction" action buttons to `HistoryTimeline` component
- Wired correction modal in `KRIDetailPage` via timeline actions
- `RiskDetailPage` now fetches overdue KRIs and passes props to KRI cards

## Files Created/Modified

- `frontend/src/components/dashboard/KRIOverdueWidget.tsx` - [NEW] Dashboard widget
- `frontend/src/components/kri/KRIHistoryEditModal.tsx` - [NEW] Correction modal
- `frontend/src/components/kri/KRIGaugeCard.tsx` - Added overdue badge props
- `frontend/src/components/history/HistoryTimeline.tsx` - Added action callback
- `frontend/src/pages/DashboardPage.tsx` - Widget integration
- `frontend/src/pages/KRIDetailPage.tsx` - Modal integration + action wiring
- `frontend/src/pages/RiskDetailPage.tsx` - Overdue mapping for KRI cards
- `frontend/src/services/kriApi.ts` - Department filter for getOverdue

## Decisions Made

- Correction modal handles both 200 (immediate) and 202 (approval required) responses
- Timeline action buttons render on every entry for consistency

## Issues Encountered

None.

## Next Step

Ready for Phase 151 Plan 10 (access management guardrails + scoped user lookup)
