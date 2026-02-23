# Testing

**Analysis Date:** 2026-02-22

## Test Stack Overview

- Backend: `pytest`, `pytest-asyncio`, `httpx`, `pytest-cov` (`backend/pytest.ini`)
- Frontend unit/integration: `Vitest` + Testing Library + MSW (`tests/frontend/unit/vitest.config.ts`, `tests/frontend/unit/src/test/mocks/`)
- Frontend/browser E2E: `Playwright` (`tests/frontend/e2e/playwright.config.ts`, `tests/frontend/e2e/`)

## Backend Testing Patterns

### Configuration
- `backend/pytest.ini` sets discovery and coverage defaults
- Markers include:
  - `postgres` for PostgreSQL-required behavior
  - `slow` for longer-running suites
  - `redis_integration` for Docker-backed Redis fault-injection resilience checks

### Fixture strategy
- Default backend tests use fast SQLite in-memory (`TEST_DATABASE_URL=sqlite+aiosqlite:///:memory:`) (`tests/backend/pytest/conftest.py`)
- Postgres-mode is opt-in via `TEST_DATABASE_URL` and applies Alembic migrations once per session, then truncates tables per test (`tests/backend/pytest/conftest.py`)
- Role/user fixtures include wildcard and platform-admin variants (`tests/backend/pytest/conftest.py`)
- Dependency override and header-based auth patterns are both used in test clients
- Session-scoped engine disposal prevents pytest interpreter-exit hangs caused by leaked `aiosqlite` worker threads (`tests/backend/pytest/conftest.py`)

### Scale snapshot
- Backend tests: 234 files (82 Python)
- API-focused backend tests: 18 files under `tests/backend/pytest/api/`

## Frontend Unit/Integration Patterns

- Vitest configured with jsdom and setup file (`tests/frontend/unit/vitest.config.ts`, `frontend/vitest.setup.ts`)
- Includes `src/**/*.{test,spec}.{ts,tsx}`
- MSW handlers provide deterministic API contracts during tests (`tests/frontend/unit/src/test/mocks/handlers.ts`)
- React Query/Auth providers are wrapped in reusable test utilities (`tests/frontend/unit/src/test/utils.tsx`)

## Frontend E2E Patterns

- Playwright projects: Chromium, Firefox, WebKit, plus CI profile (`tests/frontend/e2e/playwright.config.ts`)
- Global setup performs health/preflight checks (`tests/frontend/e2e/setup/global-setup.ts`)
- Global setup also verifies deterministic seed fixtures for stable selectors and assertions (`tests/frontend/e2e/setup/global-setup.ts`)
- Domain-oriented E2E suites cover permissions, approvals, sensitive fields, cross-department access, and activity logging (`tests/frontend/e2e/`)
- “polish-audit” is intentionally heavier and is lightweight-by-default; set `POLISH_AUDIT_DEEP=1` when you want full-page/deep audit mode (`tests/frontend/e2e/polish-audit.spec.ts`)

## CI Test/Security Execution

- E2E workflow provisions Postgres service, runs backend + Playwright chromium suite (`.github/workflows/e2e.yml`)
- Lint workflow enforces frontend dead-code/debt gates, backend Ruff hard gate, backend suppression budget, and docs topology consistency (`.github/workflows/lint.yml`)
- Security workflow runs Bandit, pip-audit, npm audit, Trivy, Syft+Grype correlation, and gitleaks parse+scan (`.github/workflows/security.yml`)
- Security workflow also runs nightly non-blocking Redis resilience integration checks (`redis_integration`) (`.github/workflows/security.yml`)

## Canonical Commands

- Backend tests: `make -f scripts/Makefile test` or `cd backend && pytest -v`
- Backend lint + suppression budget: `make -f scripts/Makefile lint-backend`
- Backend suppression budget only: `make -f scripts/Makefile quality-suppression-budget`
- Backend Postgres-sensitive tests: `cd backend && pytest -m postgres -v`
- Backend Redis integration marker: `cd backend && pytest -m redis_integration -q`
- Frontend unit tests: `cd frontend && npm run test:run`
- Frontend type checks: `cd frontend && npx tsc --noEmit`
- Frontend quality gate chain: `cd frontend && npm run lint && npx tsc --noEmit && npm run quality:debt -- --report-json && npm run cleanup:deadcode && npm run build`
- E2E: `make -f scripts/Makefile test-e2e` or `cd frontend && npm run e2e`
- Docs topology consistency: `make -f scripts/Makefile docs-topology-consistency`
- Release parity (fast loop): `python3 scripts/security/run_release_parity_audit.py --run-id <utc-ts> --skip-prod-readiness`
- Release parity (full gate): `python3 scripts/security/run_release_parity_audit.py --run-id <utc-ts>`

## Release Gate Note

- For production release cuts, parity is a gate and `tests/results/release-parity-audit-<run-id>/decision.json` must report `GO`.

## Practical Gaps to Watch

- SQLite-default tests may not catch all Postgres-specific datetime/enum behavior
- Authorization changes should be validated in both backend API tests and frontend gating tests
- Approval-execution changes should include high-confidence regression tests around side effects
- Route refactors must preserve static-route reachability (guarded by `tests/backend/pytest/test_route_shadowing.py`)
- Time policy regressions are guarded by `tests/backend/pytest/test_timezone_policy.py` + `tests/backend/pytest/test_no_datetime_utcnow.py`

---

*Testing audit refreshed on 2026-02-22*
