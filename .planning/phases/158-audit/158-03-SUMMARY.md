---
phase: 158-audit
plan: "03"
status: complete
date: 2026-01-18
---

# 158-03 Summary: Restore Approval DB Uniqueness + Enum Drift

## Objective

Restore and harden DB-level enforcement for "one pending approval per resource/action" and eliminate approval_status drift.

## What Was Built

### New Migrations

1. **`n8o9p0q1r2s3_restore_ux_approval_pending.py`**
   - Drops any existing `ux_approval_pending` index (cleanup)
   - Recreates partial unique index with correct predicate
   - Covers all pending-queue statuses: `'PENDING', 'PENDING_PRIVILEGED', 'pending_privileged'`

2. **`o9p0q1r2s3t4_normalize_approval_status_values.py`**  
   - Normalizes lowercase `pending_privileged` → uppercase `PENDING_PRIVILEGED`
   - Cleans up any duplicate pending approvals (keeps earliest, cancels rest)

### Regression Test

**`backend/tests/test_approval_uniqueness.py`**

- Tests DB-level blocking of duplicate pending approvals
- Verifies PENDING_PRIVILEGED is also covered
- Confirms different action types are allowed for same resource
- Verifies resolved approvals allow new pending ones
- Validates index existence in database

## Root Cause

1. Migration `6df2bb0adaa3_add_user_preferences_columns.py` dropped `ux_approval_pending` on upgrade (line 24) but never recreated it
2. Original migration `h2i3j4k5l6m7` used lowercase `pending_privileged` in predicate but model enum uses uppercase `PENDING_PRIVILEGED`

## Before/After

| Metric | Before | After |
|--------|--------|-------|
| `ux_approval_pending` exists | ❌ No | ✅ Yes |
| Predicate covers uppercase | ❌ No | ✅ Yes |
| Predicate covers lowercase | ⚠️ Yes (but wrong) | ✅ Yes (for safety) |
| Duplicate prevention | ❌ Broken | ✅ Working |

## Commits

- `84c77fb` - fix(158-03): restore ux_approval_pending index + normalize approval status values

## Files Changed

- `backend/alembic/versions/n8o9p0q1r2s3_restore_ux_approval_pending.py` (NEW)
- `backend/alembic/versions/o9p0q1r2s3t4_normalize_approval_status_values.py` (NEW)
- `backend/tests/test_approval_uniqueness.py` (NEW)
