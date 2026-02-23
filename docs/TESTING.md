# RiskHub Testing Guide

> **Version**: 1.4
> **Last Updated**: 2026-02-22
> **Audience**: Engineering, QA
> **Source of Truth**: `tests/backend/pytest/`, `backend/pytest.ini`, `frontend/package.json`, `tests/frontend/e2e/playwright.config.ts`

This guide defines the current testing matrix for backend, frontend unit tests, frontend E2E, and docs-related verification.

## Testing Matrix

| Surface | Command | Purpose |
|---|---|---|
| Backend targeted | `cd backend && venv/bin/pytest ../tests/backend/pytest/test_admin_docs.py -q` | Docs endpoint behavior and locale fallback |
| Backend broad | `make -f scripts/Makefile test` | Full backend regression |
| Backend lint + suppression budget | `make -f scripts/Makefile lint-backend` | Ruff hard gate plus backend/app suppression budget enforcement |
| Backend Postgres marker | `cd backend && pytest -m postgres -v` | Postgres-sensitive behavior |
| Backend Redis integration marker | `cd backend && pytest -m redis_integration -q` | Redis fault-injection resilience checks (Docker-backed) |
| Frontend unit | `cd frontend && npm run test:run` | Component and integration tests |
| Frontend docs UI | `cd frontend && npm run test:run -- src/components/settings/__tests__/DocumentationSettings.test.tsx` | Docs cards/filter/audience behavior |
| Frontend types | `cd frontend && npx tsc --noEmit` | Type safety gate |
| Frontend quality chain | `cd frontend && npm run lint && npx tsc --noEmit && npm run quality:debt -- --report-json && npm run cleanup:deadcode && npm run build` | Full frontend production quality gate |
| Frontend E2E | `cd frontend && npm run e2e` | Browser-level regression |
| Docs topology consistency | `cd . && make -f scripts/Makefile docs-topology-consistency` | README coverage, docs tree audit scope, and structure metrics consistency |
| Suppression budget only | `cd . && make -f scripts/Makefile quality-suppression-budget` | Enforce backend suppression allowlist max budget/no-expired entries |
| Docs contract | `cd . && python3 scripts/check_docs_contract.py` | Header/parity/link/audience checks |
| Release parity (fast) | `python3 scripts/security/run_release_parity_audit.py --run-id <utc-ts> --skip-prod-readiness` | Fast rerun loop for startup/dependency/UI parity checks |
| Release parity (full) | `python3 scripts/security/run_release_parity_audit.py --run-id <utc-ts>` | Final pre-release parity gate including prod-readiness execution/ingestion |

## Backend Testing Notes

- `backend/pytest.ini` defines discovery and default coverage settings.
- SQLite in-memory is used by default test path unless `TEST_DATABASE_URL` is set.
- Postgres-specific tests are marked with `@pytest.mark.postgres`.
- Redis integration tests are marked with `@pytest.mark.redis_integration` and require Docker-backed test dependencies.
- For docs endpoint behavior, keep role-scoped fixtures (`client_platform_admin`, `client_cro`, `client_employee`) green.

## Frontend Testing Notes

- Unit/integration tests run with Vitest.
- Docs UI behavior is covered in `DocumentationSettings.test.tsx`.
- Playwright runs live browser flows from `tests/frontend/e2e`.
- Role-sensitive behavior must be verified for admin/non-admin views when docs contracts change.

## Release Gate (Parity)

- For release candidates, parity artifacts are emitted under `tests/results/release-parity-audit-<run-id>/`.
- Evaluate `decision.json` at that path.
- Release candidate is blocked unless parity `decision` is `GO`.

## Quality Gate Contract (Blocking)

- Frontend dead-code non-regression is enforced by `npm run cleanup:deadcode` in local Make targets and CI lint workflow.
- Frontend debt budget non-regression is enforced by `npm run quality:debt -- --report-json`.
- Backend suppression non-regression is enforced by `scripts/tools/suppression_budget.py` against:
  - `scripts/quality/backend-suppression-allowlist.json`
- Docs topology consistency is enforced by `make -f scripts/Makefile docs-topology-consistency`.

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
