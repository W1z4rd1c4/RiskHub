# Phase 156-01 Summary: RBAC Fix for KRI Endpoints

## What Changed

### `backend/app/api/v1/endpoints/kris.py`

Fixed RBAC bypass in `/kris/overdue` and `/kris/due-soon` endpoints that allowed department-scoped users to see cross-department data via the `department_id` query parameter.

**The Bug**: The `department_id` filter was applied **before** checking user's department scope, bypassing RBAC.

**The Fix**: Now computes `dept_ids = get_user_department_ids(current_user)` **first**, then validates the `department_id` parameter:

- If privileged (dept_ids=None): allow any department filter
- If scoped and department_id is in user's departments: allow
- If scoped and department_id is NOT in user's departments: return `[]` (safe filter pattern)

## Tests Added

Added 4 regression tests in `backend/tests/test_kris_history_api.py`:

1. `test_overdue_department_id_filter_rbac_scoped_user` - User A filtering by Dept B returns []
2. `test_overdue_department_id_filter_own_department` - User filtering by own dept works
3. `test_due_soon_department_id_filter_rbac_scoped_user` - Same for /due-soon endpoint
4. `test_overdue_privileged_user_can_filter_any_department` - CRO can filter any dept

## Commands Run

```bash
cd backend && python -m pytest -q tests/test_kris_history_api.py -k "overdue or due_soon"
```

**Result**: 8 passed (4 new + 4 existing)

## Behavior Changes

None beyond blocking the bypass. Normal usage is unchanged:

- Department-scoped users see only their department's data (with or without explicit filter)
- Privileged users can filter any department
- Cross-department KRI owners still receive notifications based on ownership
