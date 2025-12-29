# Phase 7.08 Summary: Report Endpoint Department Scoping

## Objective ✅
Added department scoping and permission checks to all report export endpoints, preventing cross-department data leakage.

## Changes Made

### [reports.py](../../../backend/app/api/v1/endpoints/reports.py)
- Added `require_permission("reports", "read")` to all 5 endpoints
- Added `get_user_department_ids` department scoping
- Added `validate_department_access` helper function
- Users without departments get empty reports instead of errors
- Cross-department requests return 403

### [report_service.py](../../../backend/app/services/report_service.py)
- Fixed `Risk.name` → `Risk.process` field references
- Fixed Excel column indices for risks export
- Removed non-existent `treatment_strategy` field

### [directory_sync_log.py](../../../backend/app/models/directory_sync_log.py)
- Changed `JSONB` → `JSON` for SQLite test compatibility

### [directory_user.py](../../../backend/app/models/directory_user.py)
- Changed `JSONB` → `JSON` for SQLite test compatibility

### [conftest.py](../../../backend/tests/conftest.py)
- Added `reports:read` permission to employee fixture

### [NEW] [test_reports_rbac.py](../../../backend/tests/test_reports_rbac.py)
- 11 test cases covering admin access, employee scoping, cross-department blocking

## Verification

```
pytest tests/test_reports_rbac.py -v
============================== 11 passed in 0.98s ==============================
```

| Test | Status |
|------|--------|
| Admin can export all controls PDF | ✅ |
| Admin can export all risks PDF | ✅ |
| Admin can export summary PDF | ✅ |
| Employee cannot export cross-department | ✅ |
| Employee can export own dept controls | ✅ |
| Employee can export own dept risks | ✅ |
| Employee cross-department risks blocked | ✅ |
| Employee summary scoped to own dept | ✅ |
| Admin can export controls Excel | ✅ |
| Admin can export risks Excel | ✅ |
| Employee cannot export cross-dept Excel | ✅ |

## Deviations

- **Auto-fixed**: JSONB→JSON in 2 models for SQLite test compatibility
- **Auto-fixed**: `Risk.name`→`Risk.process` in report_service.py (Risk model doesn't have `name` field)

---
*Completed: 2025-12-29*
