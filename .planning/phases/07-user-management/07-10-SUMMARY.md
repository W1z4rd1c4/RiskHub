# Summary 07-10: Dynamic Role Selection in User Forms

## Objective
Remove hard-coded role IDs from user create/edit flows by fetching roles dynamically from the API.

## Changes Made
- Added `GET /users/roles` backend endpoint to list assignable roles.
- Added frontend `Role` type + `getRoles()` helper.
- Updated user create/edit pages to populate role dropdowns from server data (no hard-coded IDs).

## Verification
- Verified roles render correctly in the UI across environments and role assignment updates persist.

---
*Completed: previously executed (summary backfilled 2026-02-02)*

