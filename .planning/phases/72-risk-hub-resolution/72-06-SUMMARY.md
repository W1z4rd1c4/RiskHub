# Phase 72-06 Summary: Granular Permissions

**Completed:** 2026-01-05

## Objective
Implement granular permissions for KRI submission (`kri:submit`) and control execution logging (`controls:execute`), independent from `risks:write` and `controls:write`.

## Changes Made

### Task 1: Permission Seed Updates
- **Modified** `backend/app/db/seed.py`:
  - Renamed `kri:record` to `kri:submit`
  - Added `controls:execute` permission
  - Updated role assignments per CRO requirements

### Task 2: KRI Endpoint Permission Check
- **Modified** `backend/app/api/v1/endpoints/kris.py`:
  - Changed `record_kri_value` to require `kri:submit` (or being the KRI `reporting_owner`), removing the `risks:write` fallback
  - Updated docstrings to reflect new permission

### Task 3: Executions Endpoint Permission Check
- **Modified** `backend/app/api/v1/endpoints/executions.py`:
  - Changed `create_execution` to require `controls:execute` instead of `controls:write`
  - Updated docstring accordingly

### Task 4: Migration Script
- **Created** `backend/scripts/add_granular_permissions.py`:
  - Renames existing `kri:record` to `kri:submit`
  - Creates `controls:execute` permission
  - Assigns permissions to Risk Manager, Internal Audit, Compliance
  - Removes `kri:submit` from Control Owner

## Files Modified
| File | Change |
|------|--------|
| `backend/app/db/seed.py` | New permissions and role assignments |
| `backend/app/api/v1/endpoints/kris.py` | `kri:submit` (or reporting owner) check; removed `risks:write` fallback |
| `backend/app/api/v1/endpoints/executions.py` | `controls:execute` check |
| `backend/scripts/add_granular_permissions.py` | NEW - Migration script |
| `frontend/src/hooks/usePermissions.ts` | `kri:submit` check, added `canExecuteControls` |
| `frontend/src/pages/ControlDetailPage.tsx` | Log Execution uses `controls:execute` |

## Verification
- ✅ pytest tests/test_executions.py - 6/6 passed
- ✅ pytest tests/test_kris_rbac.py - 8/8 passed
- ✅ Migration script executed successfully
- ✅ Frontend build passes

## Next Step
Phase 72-06 complete. Ready for 72-07 or next phase.
