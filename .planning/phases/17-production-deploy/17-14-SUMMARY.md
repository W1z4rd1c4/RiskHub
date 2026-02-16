# Summary: Plan 17-14 AD Deprovision Check + Manual Sync + Scheduler Path

## Completed: 2026-02-16

## Objective Achievement

Implemented AD/Entra deprovision validation with automatic local deactivation and session revocation, plus manual admin sync endpoints and scheduler integration path.

## Backend Delivery

- Added deprovision service:
  - `backend/app/services/ad_deprovision_service.py`
  - behavior: directory existence check by `external_id`, `is_active=false`, refresh-token revocation, `token_version` bump, orphan flagging, sync status fields update.
- Added admin directory sync endpoints:
  - `POST /api/v1/admin/directory/check-user/{user_id}`
  - `POST /api/v1/admin/directory/check-all`
  in `backend/app/api/v1/endpoints/admin/directory_sync.py`.
- Included endpoint router in:
  - `backend/app/api/v1/endpoints/admin/__init__.py`.
- Added scheduler job wiring for periodic checks:
  - `backend/app/core/scheduler.py` (config-driven hour/minute).
- Added backend tests:
  - `backend/tests/test_ad_deprovision_service.py`
  - `backend/tests/test_admin_directory_sync.py`
- Added user sync/deprovision metadata exposure:
  - schema and endpoint mapping in `backend/app/schemas/access.py` and `backend/app/api/v1/endpoints/access.py`.

## Frontend Delivery

- Added admin manual directory-check flows:
  - `frontend/src/services/adminApi.ts` (check single/check all APIs)
  - `frontend/src/pages/AdminConsolePage.tsx`
  - `frontend/src/pages/UsersPage.tsx`
- Surfaced directory sync/deprovision status in users table:
  - `frontend/src/components/access/UsersTable.tsx`
  - `frontend/src/types/access.ts`.
- Added related i18n keys in:
  - `frontend/src/i18n/locales/en/admin.json`
  - `frontend/src/i18n/locales/cs/admin.json`

## Verification

- `cd backend && ./venv/bin/python -m ruff check app tests scripts` → passed.
- `cd backend && ./venv/bin/pytest -q` → `562 passed, 7 skipped` (includes deprovision/sync tests).
- `cd backend && ./venv/bin/bandit --ini .bandit -r app -f txt --severity-level high` → no high findings.
- `cd frontend && npm run lint -- --max-warnings=0` → passed.
- `cd frontend && npx tsc --noEmit` → passed.
- `cd frontend && npm run test:run` → `43 files, 157 tests passed`.
- `cd frontend && npm run build` → passed.

## Outcome

Plan `17-14` is complete with enforced deprovision remediation flow and operational manual/scheduled sync surfaces.
