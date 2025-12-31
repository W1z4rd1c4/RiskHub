# Phase 151 Plan 04: Script and Timestamp Hygiene Summary

**Normalized orphaned timestamps to consistent UTC strategy and hardened audit scripts with safety flags and pagination support.**

## Accomplishments

- **Orphaned timestamps standardized**: Replaced mixed `datetime.now(UTC).replace(tzinfo=None)` and `datetime.utcnow()` calls with consistent `datetime.utcnow()` throughout `orphaned_item_service.py`
- **seed_kris destructive behavior guarded**: Added `--force` flag requirement for deletes, `--report` option for unmatched KRIs, removed unsafe global round-robin fallback
- **verify_data_consistency pagination fixed**: Implemented proper page iteration, handles list vs paginated responses, added auth token support via `--token` or `AUTH_TOKEN` env var

## Files Modified

- [orphaned_item_service.py](../../../backend/app/services/orphaned_item_service.py) - Standardized all timestamp usage to `datetime.utcnow()`
- [seed_kris.py](../../../backend/scripts/seed_kris.py) - Added argparse, `--force`/`--report` flags, removed global fallback
- [verify_data_consistency.py](../../../backend/scripts/verify_data_consistency.py) - Added pagination iteration, auth header support

## Key Changes

### orphaned_item_service.py

```diff
-from datetime import datetime, UTC
+from datetime import datetime

-orphaned_at=datetime.now(UTC).replace(tzinfo=None)
+orphaned_at=datetime.utcnow()
```

### seed_kris.py

- Default mode is now **dry-run** (no destructive changes)
- `--force` required to actually delete existing KRIs
- Unmatched KRIs are logged and skipped instead of assigned to random risks
- `--report <file>` writes unmatched KRIs for manual review

### verify_data_consistency.py

- `fetch_all_paginated()` helper iterates through all API pages
- Handles both list responses and paginated `{items, total}` responses
- `--token` or `AUTH_TOKEN` env var for authenticated endpoints
- Added Test 6: Pagination accuracy verification

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Timestamp strategy | Naive UTC (`datetime.utcnow()`) | Simpler, consistent with existing column definitions |
| Seed script default | Dry-run mode | Prevents accidental data loss |
| Unmatched KRI handling | Skip and report | Better than assigning to wrong risks |

## Issues Encountered

None

## Verification

- [x] `python3 scripts/seed_kris.py --help` shows flags and dry-run mode
- [x] `python3 scripts/verify_data_consistency.py --help` shows auth options

## Next Step

Ready for 151-05-PLAN.md
