# Plan 153-12 Summary: KRI Permission and Picker Fixes

**Phase:** 153-audit-resolution-3
**Completed:** 2026-01-11

## Objective
Fix KRI permission mismatch and Activity Log picker truncation.

## Changes Made

### Task 1: Fix KRI Permission Check ✅

**Issue:** Frontend `canRecordKRI` checked for `kri:record` permission, but backend uses `kri:submit`.

**Fix:** Updated `frontend/src/hooks/usePermissions.ts`:
```diff
- canRecordKRI: hasPermission('kri', 'record') || ...
+ canRecordKRI: hasPermission('kri', 'submit') || ...
```

**Verified against:** BUSINESS_LOGIC.md §4.1 (`kri:submit` - Submit KRI values)

### Task 2: Fix Activity Log Risk Picker Limit ✅

**Issue:** Frontend requested 200 risks for picker, but backend caps at 100.

**Fix:** Updated `frontend/src/hooks/useActivityLogPageState.ts`:
```diff
- riskApi.getRisks({ limit: 200 })
+ riskApi.getRisks({ limit: 100 })
```

### Task 3: Frontend Build ✅

Build completed successfully with no errors.

## Verification

| Check | Result |
|-------|--------|
| `kri:submit` used | ✅ |
| Risk picker limit ≤ 100 | ✅ |
| Frontend build passes | ✅ |
