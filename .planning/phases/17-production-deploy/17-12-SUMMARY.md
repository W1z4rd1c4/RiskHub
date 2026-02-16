# Summary: Plan 17-12 AD User Directory Lookup + Import

## Completed: 2026-02-16

## Objective Achievement

Implemented directory search/detail/import surfaces backed by provider abstraction (`graph|ad_emulator|auto`) and integrated admin import UX in the users page.

## Backend Delivery

- Added directory provider configuration in `backend/app/core/config.py`:
  - `directory_provider`, `entra_client_secret`, emulator fallback fields, Graph timeout.
- Added directory services:
  - `backend/app/services/graph_directory_service.py`
  - `backend/app/services/directory_provider_service.py`
- Added directory schemas:
  - `backend/app/schemas/directory.py`
- Added directory endpoints:
  - `GET /api/v1/directory/users/search`
  - `GET /api/v1/directory/users/{oid}`
  - `POST /api/v1/directory/users/{oid}/import`
  in `backend/app/api/v1/endpoints/directory.py`.
- Registered directory router in `backend/app/api/v1/router.py`.
- Extended user model + migration for directory metadata:
  - `job_title`, sync/deprovision observability fields in `backend/app/models/user.py`.
  - Alembic migration `backend/alembic/versions/p1q2r3s4t5u6_add_refresh_tokens_and_directory_user_fields.py`.
- Added backend tests:
  - `backend/tests/test_directory_lookup.py`
  - `backend/tests/test_directory_import.py`

## Frontend Delivery

- Added directory types/service:
  - `frontend/src/types/directory.ts`
  - `frontend/src/services/directoryApi.ts`
- Added AD picker UI:
  - `frontend/src/components/users/ADUserPicker.tsx`
- Integrated "Add from AD" import flow on users page:
  - `frontend/src/pages/UsersPage.tsx`
- Added localization keys:
  - `frontend/src/i18n/locales/en/admin.json`
  - `frontend/src/i18n/locales/cs/admin.json`

## Verification

- `cd backend && ./venv/bin/python -m ruff check app tests scripts` → passed.
- `cd backend && ./venv/bin/pytest -q` → `562 passed, 7 skipped` (includes new directory tests).
- `cd frontend && npm run lint -- --max-warnings=0` → passed.
- `cd frontend && npx tsc --noEmit` → passed.
- `cd frontend && npm run test:run` → `43 files, 157 tests passed`.
- `cd frontend && npm run build` → passed.

## Outcome

Plan `17-12` is complete with production-usable directory lookup/import surfaces and verified regression safety.
