# Summary 152-04: KRI Archive Instead of Delete

## Status: ✅ COMPLETED

## Goal
Make KRI "deletion" behave like Risk/Control deletion: **archive/soft-delete** so:
- KRI records remain for auditability
- `KRIValueHistory` is preserved (no cascade data loss)
- KRI no longer appears in normal operational views/metrics

## Changes Made

### Model + Migration

#### `backend/app/models/key_risk_indicator.py`
- Added `is_archived: bool` (default `False`, indexed)
- Added `archived_at: datetime` (nullable)
- Added `archived_by_id: int` (FK to `users.id`, nullable)
- Added `archived_by: relationship` with explicit `foreign_keys` to disambiguate from `reporting_owner`

#### `backend/alembic/versions/i3j4k5l6m7n8_add_kri_archive_fields.py`
- New migration: adds 3 columns + index + FK constraint

### Delete Semantics Changed

#### `backend/app/api/v1/endpoints/approvals.py`
- **Lines 385-392**: KRI DELETE approval now archives instead of `db.delete()`
- Sets `is_archived=True`, `archived_at`, `archived_by_id`

#### `backend/app/api/v1/endpoints/kris.py`
- **Lines 465-483**: Privileged DELETE now archives (not hard-delete)
- **Lines 27-47**: List endpoint filters `is_archived == False` by default
- **Lines 221-245**: GET single KRI returns 404 for archived unless `include_archived=true` (privileged)
- **Lines 322-325**: PUT rejects updates on archived KRIs (409)
- **Lines 575-578**: POST `/values` rejects submissions on archived KRIs (409)
- Activity log action changed from `DELETE` to `ARCHIVE`

### Archived KRIs Excluded from Queries

#### `backend/app/services/kri_deadline_service.py`
- **Line 96**: Excluded archived KRIs from deadline notifications

#### `backend/app/services/kri_history_service.py`
- **Lines 295-305, 350-360**: Excluded from `get_overdue_kris` and `get_due_soon_kris`

#### `backend/app/api/v1/endpoints/dashboard.py`
- **Lines 257-265**: Breaching KRI count excludes archived
- **Lines 269-273**: Total KRI count excludes archived
- **Lines 563-567**: KRI breach trends exclude archived
- **Lines 737-742**: KRI breach query for quarterly comparison excludes archived
- **Lines 866-881**: KRI health % excludes archived
- **Lines 883-887**: Overdue KRIs count excludes archived

### Test Fix

#### `backend/tests/test_approvals.py`
- **Lines 369-373**: Fixed `test_approve_kri_value_submission_with_period_end` to use `latest_closed_period_for_date` (after 152-03 change, open/future periods are rejected)

## Verification

```bash
cd backend
python3 -m pytest tests/test_approvals.py -v --tb=short
# 15 passed

python3 -m pytest tests/test_kri*.py -v --tb=short
# 72 passed
```

## Success Criteria
- ✅ KRI archive fields exist + migration created
- ✅ Approval-driven KRI deletion archives (no hard delete)
- ✅ Direct KRI deletion archives (no hard delete)
- ✅ Archived KRIs excluded from all operational endpoints and dashboard metrics by default
  - ✅ GET /kris (list)
  - ✅ GET /kris/breaches (was missing, fixed)
  - ✅ Dashboard metrics
  - ✅ Deadline/overdue services
- ✅ Archived KRIs cannot receive new values/edits (409 Conflict)
- ✅ History rows preserved after archival
- ✅ Tests added/updated and passing:
  - `test_kri_delete_archives_not_hard_deletes` - verifies is_archived=True
  - `test_kri_history_preserved_after_archive` - verifies history rows remain
  - `test_archived_kri_excluded_from_list` - verifies list exclusion
