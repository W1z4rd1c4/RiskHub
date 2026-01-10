# Summary: Plan 251-02 - Simplify Departments Endpoint

## Objective
Simplified `backend/app/api/v1/endpoints/departments.py` (~518 → ~570 lines, net cleaner) by extracting repeated query patterns into focused helpers.

## Changes Made

### 1. Scoping & Pagination Helpers
- `_get_scoped_department_ids(current_user)` – wraps `get_user_department_ids` for clarity
- `_assert_department_in_scope(department_id, db, current_user)` – loads department and verifies access (404/403)
- `_clamp_pagination(skip, limit)` – enforces MAX_PAGE_SIZE bounds

### 2. Stats Builder Functions (7 total)
| Helper | Purpose |
|--------|---------|
| `_count_active_users_by_dept` | Active user count per department |
| `_count_risks_by_dept` | Non-archived risk count |
| `_count_high_risks_by_dept` | Risks with net_score ≥ 16 |
| `_count_controls_by_dept` | Non-archived control count |
| `_count_kris_by_dept` | KRIs linked to non-archived risks |
| `_count_breaching_kris_by_dept` | KRIs outside limits |
| `_sum_net_scores_by_dept` | Total net_score per department |

### 3. Endpoint Refactoring
- `list_departments()` → 3-phase orchestration (load → compute → build)
- All 4 detail endpoints now use `_assert_department_in_scope`
- Added comprehensive docstrings documenting access, exclusions, pagination

### 4. Bug Fix
- Fixed `get_department()` user count to filter only active users (matching `list_departments` behavior)

## Verification
- ✅ `pytest tests/test_departments.py` – 4/4 passed
- ✅ All existing functionality preserved

## Files Modified
- `backend/app/api/v1/endpoints/departments.py`
