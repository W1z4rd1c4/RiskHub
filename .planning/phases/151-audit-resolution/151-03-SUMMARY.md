# Phase 151 Plan 03: Lookup and Default Role Safety Summary

**Hardened lookup access, enforced safe default roles, and seeded approvals permissions.**

## Accomplishments

- Lookups endpoint (`/risk-filters`) is now authenticated and department-scoped
  - Non-privileged users only see risk metadata from their departments
  - Archived risks are excluded from metadata
- Directory sync `_resolve_default_role` now fails fast if no safe role exists
  - Removed fallback to first database role (preventing accidental admin assignment)
  - Only `employee`, `control_owner`, or `viewer` are considered safe defaults
- Seeded `approvals:write` permission in `seed.py`
  - Enables correct RBAC seeding for approval workflows
- Updated `tests/test_directory_sync.py` to properly mock external AD client calls

## Files Modified

- `backend/app/api/v1/endpoints/lookups.py`: Added auth dependencies and department scoping logic
- `backend/app/services/directory_sync_service.py`: Updated default role resolution logic
- `backend/app/db/seed.py`: Added `approvals:write` permission
- `backend/tests/test_directory_sync.py`: Updated tests with AsyncMock and proper fixtures

## Decisions Made

- Raised `ValueError` instead of falling back to unsafe roles in directory sync to strictly enforce security.
- Archived risks are excluded from filter lookups to keep metadata clean and relevant.

## Issues Encountered

- Directory sync tests failed initially due to real network calls; fixed by patching `ADEmulatorClient` with `AsyncMock`.
- Tests failed due to missing default role seeds; fixed by ensuring `test_role_employee` fixture is used.

## Next Step

Ready for 151-04-PLAN.md
