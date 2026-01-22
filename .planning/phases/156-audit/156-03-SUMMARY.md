# 156-03 Summary: RiskHub ActivityLog Commit Fix

## What Changed

**File:** `backend/app/api/v1/endpoints/riskhub.py`

Fixed 4 endpoints where `log_activity()` was called after `db.commit()` without a follow-up commit, causing activity logs to not be persisted:

- `create_risk_type` (POST /risk-types)
- `update_risk_type` (PATCH /risk-types/{id})
- `delete_risk_type` (DELETE /risk-types/{id})
- `restore_risk_type` (POST /risk-types/{id}/restore)

Added `await db.commit()` after each `log_activity()` call.

## Verification

```bash
cd backend && pytest -q tests/test_riskhub_risk_types.py
# Result: 8 tests PASSED
```

## Commit

`fix(156-03): add db.commit() after log_activity() in RiskHub endpoints`
