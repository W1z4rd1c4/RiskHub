---
phase: 159-audit-fixes
plan: 01
completed: 2026-01-23
---

# Summary: Dialect-Aware Approval Uniqueness Tests

## Changes Made

Made `test_approval_uniqueness.py` PostgreSQL-aware to fix SQLite test failures:

| Test | Change |
|------|--------|
| `test_duplicate_pending_approval_blocked_at_db_level` | Added `@pytest.mark.postgres` + dialect skip |
| `test_pending_privileged_also_blocked` | Added `@pytest.mark.postgres` + dialect skip |
| `test_resolved_approval_allows_new_pending` | Added `@pytest.mark.postgres` + dialect skip + fixed fixture |
| `test_index_exists_in_database` | Added `@pytest.mark.postgres` + dialect skip |
| `test_different_action_types_allowed` | No change (doesn't rely on partial unique index) |

## Root Cause

Tests expected `IntegrityError` from the `ux_approval_pending` partial unique index, but:

1. Partial unique indexes are created by Alembic migrations
2. Test harness uses `Base.metadata.create_all()` which doesn't run migrations
3. SQLite also doesn't support `pg_indexes` system table

## Documentation Added

Module-level docstring explaining:

- Why some tests require PostgreSQL
- How to run full test suite with PostgreSQL

## Additional Fixes

- Fixed `privileged_user` → `test_user_cro` fixture reference

## Verification

```
pytest tests/test_approval_uniqueness.py -v
# 1 passed, 4 skipped (PostgreSQL-only tests)
```

## Commit

`0c4d65f` - fix(159-01): make approval uniqueness tests dialect-aware
