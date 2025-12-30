---
phase: 10-historization
plan: 03
completed: 2025-12-31
---

# Summary: KRI Frontend Historization

## Objective
Exposed KRI reporting ownership, frequency inputs, value recording, and history views in the frontend.

## Changes Made

### Task 1: KRI Types & API Client

**Files Modified:**
- `frontend/src/types/kri.ts`
- `frontend/src/services/kriApi.ts`

**Features:**
- Added `KRIFrequency` type and `KRIFrequencies` constant
- Extended `KeyRiskIndicator` with frequency, reporting_owner_id/name, last_period_end, last_reported_at
- Added `KRIHistoryEntry`, `KRIHistoryListResponse`, `KRIRecordValue`, `KRIHistoryEdit`, `OverdueKRI` types
- Added API methods: `recordValue`, `getHistory`, `requestHistoryEdit`, `getOverdue`

### Task 2: Forms Updated

**Files Modified:**
- `frontend/src/components/KRIForm.tsx`
- `frontend/src/components/kri/KRIModal.tsx`

**Features:**
- Frequency dropdown (daily/weekly/monthly/quarterly/annually)
- Reporting owner selector with user list
- Default to quarterly, fall back to Risk owner

### Task 3: Record-Value & History UI

**Files Created:**
- `frontend/src/components/kri/KRIValueModal.tsx` (NEW)

**Files Modified:**
- `frontend/src/pages/KRIDetailPage.tsx`

**Features:**
- "Record Value" button for users with risks:write permission
- KRIValueModal with optional backdating for privileged users
- Reporting info card (frequency, owner, period end, due date)
- Value history table with period end, value, status, recorded_at, recorded_by
- Overdue badge when past due date

## Verification Results

| Check | Status |
|-------|--------|
| TypeScript compilation | ✅ Pass |
| Human checkpoint | ✅ Approved |

## Files Modified

1. `frontend/src/types/kri.ts`
2. `frontend/src/services/kriApi.ts`
3. `frontend/src/components/KRIForm.tsx`
4. `frontend/src/components/kri/KRIModal.tsx`
5. `frontend/src/components/kri/KRIValueModal.tsx` (NEW)
6. `frontend/src/pages/KRIDetailPage.tsx`

## Next Steps
- Plan 10-04: History API endpoints for change history queries
- Plan 10-05: KRI value recording endpoint refinements
