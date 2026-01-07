# Plan 17-00 Summary: Admin Console Robustness Fixes

## Completed: 2026-01-07

## What Was Done

Fixed the "Active Users (24h)" and "Active Sessions" metrics in Admin Console which always showed 0 due to timezone mismatches.

### Root Cause

The code in `backend/app/api/v1/endpoints/admin.py` was stripping timezone info from Python datetimes before comparing with PostgreSQL `TIMESTAMPTZ` columns:

```python
# BEFORE (broken)
yesterday = datetime.now(UTC).replace(tzinfo=None) - timedelta(hours=24)
```

This caused silent comparison failures in production.

### Fix Applied

Removed `.replace(tzinfo=None)` at two locations (lines 263 and 354):

```python
# AFTER (fixed)
yesterday = datetime.now(UTC) - timedelta(hours=24)
```

SQLAlchemy handles timezone-aware datetimes correctly for both PostgreSQL (production) and SQLite (tests).

## Files Modified

| File | Change |
|------|--------|
| `backend/app/api/v1/endpoints/admin.py` | Removed `.replace(tzinfo=None)` at lines 263, 354; updated comments |

## Verification

- ✅ 12 activity-related tests passed
- ✅ Docker containers rebuilt and healthy
- ✅ Pattern consistent with existing `activity_log.py` implementation

## Lessons Learned

1. SQLAlchemy handles timezone-aware datetimes for both PostgreSQL and SQLite
2. The "SQLite compatibility" comment was incorrect
3. `func.now() - timedelta()` does NOT work (TypeError) — use Python-side datetime instead
