# Phase 90 Plan 03: Directory Identity Lifecycle Validation Summary

Validated and hardened the current provider-backed directory lifecycle without restoring deleted sync preview/apply flows.

## Accomplishments

- Updated directory profile reconciliation so provider data only owns directory profile fields, while RiskHub-local access fields remain authoritative.
- Kept initial provider department seeding for brand-new directory imports only.
- Added backend access capabilities for active-status changes and break-glass eligibility while preserving `can_deactivate`.
- Added frontend capability-first activate/deactivate behavior, visible backend error messages, and a break-glass confirmation modal using the existing admin endpoint.
- Rewrote `90-03-PLAN.md` around current provider search/import, admin checks, deprovision, break-glass, Graph/AD-emulator provider selection, and `/users` Add from AD / Check AD flows.

## Coverage Added

- Directory reimport preserves local department for existing linked users.
- Email-matched directory import preserves the existing local department.
- Admin directory check preserves local department, role, access scope, and manager assignment.
- New directory import still seeds an initial department from the provider.
- Access user responses expose `can_change_active_status` and `can_break_glass_enable`.
- Break-glass endpoint response and platform-admin authorization are covered.
- Users page tests cover capability-first active-status actions, local fallback when metadata is absent, backend rejection messages, and break-glass submit/refresh/success behavior.

## Verification

- Passed: `cd backend && ./venv/bin/pytest -q ../tests/backend/pytest/test_directory_import.py ../tests/backend/pytest/test_ad_deprovision_service.py ../tests/backend/pytest/test_admin_directory_sync.py ../tests/backend/pytest/test_access_management.py ../tests/backend/pytest/test_users.py`
- Passed: `cd frontend && npm run test:run -- ../tests/frontend/unit/src/pages/__tests__/UsersPage.sso-cta.test.tsx ../tests/frontend/unit/src/components/access/AccessEditModal.test.tsx ../tests/frontend/unit/src/pages/__tests__/UsersPage.modes.test.tsx ../tests/frontend/unit/src/components/users/__tests__/DirectoryUserImportPanel.test.tsx`
- Passed: `cd frontend && npx tsc --noEmit`

## Manual Verification

Not run in this session. The plan's manual checklist remains the next checkpoint for validating the lifecycle against a running provider-backed local environment.

## Notes

- No `directory_users`, `directory_sync_logs`, `DirectoryEmulatorPage`, `/directory/sync/preview`, or `/directory/sync/apply` implementation was restored.
