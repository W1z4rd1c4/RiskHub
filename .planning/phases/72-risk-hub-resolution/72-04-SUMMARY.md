# Phase 72 Plan 04: Risk Hub Resolution Summary

**Hardened Risk Hub CRUD endpoints with validation guards and restricted public-config access to prevent information leakage.**

## Accomplishments

- Fixed department update response to correctly return `is_active` instead of non-existent `is_hidden` attribute
- Added guard preventing deletion of system departments (parallel to role protection)
- Implemented permission ID validation on role create/update with 400 error for unknown IDs
- Enforced department code uniqueness on both create and update operations
- Restricted public-config endpoint to an allowlist of safe keys; non-CRO users cannot access non-allowlisted config

## Files Created/Modified

- `backend/app/api/v1/endpoints/riskhub.py` - Added PUBLIC_CONFIG_ALLOWLIST, permission ID validation, system department guard, code uniqueness checks, fixed is_hidden bug
- `backend/tests/test_riskhub_roles.py` - Added tests for invalid/valid permission IDs on create/update
- `backend/tests/test_riskhub_departments.py` - Added tests for system department deletion guard and code uniqueness
- `backend/tests/test_riskhub_public_config.py` - New test file for public-config allowlist behavior

## Test Results

```
16 passed in 1.77s
```

All new guards validated:
- Role permission ID validation (create + update)
- System department deletion protection
- Department code uniqueness (create + update)
- Public-config allowlist enforcement

## Decisions Made

| Decision | Choice |
|----------|--------|
| Public config allowlist | Limited to `kri_reminder_days_before`, `kri_overdue_grace_days`, `session_timeout_minutes`, `password_expiry_days` |
| CRO config access | CRO can bypass allowlist and access any config key |

## Issues Encountered

None

## Next Step

Ready for `72-05-PLAN.md`.
