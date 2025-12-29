# Phase 90-13 Summary: Empty Department Cleanup

## Completed

### Task 1: Implement Cleanup Logic
- Implemented `DirectorySyncService.cleanup_empty_departments(db)` method.
- Logic: Identify non-system departments with 0 active users. Move all Risks and Controls to "Uncategorised" (ID 999).
- Integration: Added cleanup hook to `_run_sync` (full sync) and `sync_single_user` (incremental sync).

### Task 2: API Filtering
- Updated `list_departments` endpoint in `backend/app/api/v1/endpoints/departments.py`.
- Filter Logic: Only show departments that are System Reserved OR have > 0 active users.

## Verification

### Manual Cleanup Trigger
Ran a one-off script to trigger cleanup immediately (since servers were reloading and might have missed the immediate sync cycle).

**Result:**
- 11 "zombie" departments identified and cleaned.
- MOMS department (ID 15) items moved to Uncategorised (ID 999).
- Confirmed by script output: `UPDATE risks SET department_id=999 ... WHERE department_id = 15`.

## Files Modified

- `backend/app/services/directory_sync_service.py` - Added cleanup logic and hooks.
- `backend/app/api/v1/endpoints/departments.py` - Added API filtering.

## Next Steps

- Proceed to Phase 99 (Data Migration) or other Roadmap items.
