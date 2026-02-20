# RiskHub Testing Guide

> **Version**: 1.1
> **Last Updated**: 2026-02-16
> **Audience**: Engineering, QA
> **Source of Truth**: `tests/backend/pytest/`, `backend/pytest.ini`, `frontend/package.json`, `tests/frontend/e2e/playwright.config.ts`

This guide defines the current testing matrix for backend, frontend unit tests, frontend E2E, and docs-related verification.

## Testing Matrix

| Surface | Command | Purpose |
|---|---|---|
| Backend targeted | `cd backend && venv/bin/pytest ../tests/backend/pytest/test_admin_docs.py -q` | Docs endpoint behavior and locale fallback |
| Backend broad | `make -f scripts/Makefile test` | Full backend regression |
| Backend Postgres marker | `cd backend && pytest -m postgres -v` | Postgres-sensitive behavior |
| Frontend unit | `cd frontend && npm run test:run` | Component and integration tests |
| Frontend docs UI | `cd frontend && npm run test:run -- src/components/settings/__tests__/DocumentationSettings.test.tsx` | Docs cards/filter/audience behavior |
| Frontend types | `cd frontend && npx tsc --noEmit` | Type safety gate |
| Frontend E2E | `cd frontend && npm run e2e` | Browser-level regression |
| Docs contract | `cd . && python3 scripts/check_docs_contract.py` | Header/parity/link/audience checks |

## Backend Testing Notes

- `backend/pytest.ini` defines discovery and default coverage settings.
- SQLite in-memory is used by default test path unless `TEST_DATABASE_URL` is set.
- Postgres-specific tests are marked with `@pytest.mark.postgres`.
- For docs endpoint behavior, keep role-scoped fixtures (`client_platform_admin`, `client_cro`, `client_employee`) green.

## Frontend Testing Notes

- Unit/integration tests run with Vitest.
- Docs UI behavior is covered in `DocumentationSettings.test.tsx`.
- Playwright runs live browser flows from `tests/frontend/e2e`.
- Role-sensitive behavior must be verified for admin/non-admin views when docs contracts change.

## Docs Change Verification (Required)

When editing documentation libraries (`docs/admin*`, `docs/user*`) or docs endpoint behavior:

```bash
cd "."
python3 scripts/check_docs_contract.py

cd backend
venv/bin/pytest ../tests/backend/pytest/test_admin_docs.py -q

cd ../frontend
npm run test:run -- src/components/settings/__tests__/DocumentationSettings.test.tsx
npx tsc --noEmit
```

## Troubleshooting

- If docs endpoint tests fail after locale edits, verify per-file fallback logic and file parity.
- If docs UI tests fail, inspect expected tags/audience labels in mocked payloads.
- If type-check fails, ensure docs API interfaces still include `audience` and `tags`.
