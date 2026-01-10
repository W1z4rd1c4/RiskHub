# Summary 152-03: Fix KRI Period Semantics Bug

## Status: ✅ FIXED

## Problem (Confirmed Bug)
Non-privileged users could submit KRI values for the **current (future) period**, and when approved, this advanced `last_period_end` beyond closed periods, masking overdue reporting.

**Concrete example (quarterly KRI):**
- On Jan 10: `latest_closed_end=Dec 31`, `current_period_end=Mar 31`
- Non-privileged user submits → approval stores `period_end=Mar 31`
- Upon approval, `last_period_end` becomes Mar 31 (future)
- Logic checking "did we report for Dec 31?" incorrectly treats it as yes

## Root Cause
- `kris.py` used `period_bounds_for_date` (returns current/future period)
- Should use `latest_closed_period_for_date` (returns last closed period)
- `approvals.py` used `allow_open_period=True` enabling future periods

## Changes Made

### `backend/app/api/v1/endpoints/kris.py`
- **Lines 580-612**: Changed to use `latest_closed_period_for_date` (not `period_bounds_for_date`)
- **Lines 314-319**: Added validation to reject `current_value` in PUT (must use POST `/values`)
- **Lines 536-542**: Updated docstring to reflect `kri:submit` (not `kri:record`)
- **Lines 564-568**: Made `kri:submit` independent from `risks:write`

### `backend/app/api/v1/endpoints/approvals.py`
- **Lines 451-460**: Removed `allow_open_period=True` (no longer needed)

### `backend/app/db/seed.py`
- **Lines 46-62**: Aligned with `add_granular_permissions.py` policy:
  - `risk_manager`: now granted `kri:submit`
  - `control_owner`: removed `kri:submit` (must be reporting owner to submit)
  - Added policy comment explaining the alignment

### `backend/tests/test_kri_period_protection.py`
- Added async `test_future_period_rejected` that actually calls `record_value`
- Added `test_core_bug_fix_latest_closed_vs_current_period` proving the fix

## kri:submit Permission Policy

| Role | Has kri:submit? | Notes |
|------|-----------------|-------|
| CRO | ✅ (via `*:*`) | Privileged - applies immediately |
| Risk Manager | ✅ | Privileged - applies immediately |
| Department Head | ✅ | Non-privileged - creates approval |
| Control Owner | ❌ | Must be reporting owner to submit |

> **NOTE:** Existing databases should run `add_granular_permissions.py` to align with this policy.

## Verification

```bash
cd backend && python3 -m pytest tests/test_kri_period_protection.py -v
# 7 passed
```

- ✅ Non-privileged users now submit for CLOSED periods only
- ✅ `last_period_end` cannot advance beyond latest closed period
- ✅ `kri:submit` is now independent from `risks:write`
- ✅ PUT `/kris/{id}` rejects `current_value` updates
- ✅ seed.py aligned with add_granular_permissions.py
