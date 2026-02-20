# Testing

**Analysis Date:** 2026-02-16

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
- Security workflow runs Bandit, pip-audit, npm audit, Trivy, gitleaks (`.github/workflows/security.yml`)

## Canonical Commands

- Backend tests: `make -f scripts/Makefile test` or `cd backend && pytest -v`
- Backend lint: `make -f scripts/Makefile lint-backend`
- Backend Postgres-sensitive tests: `cd backend && pytest -m postgres -v`
- Frontend unit tests: `cd frontend && npm run test:run`
- Frontend type checks: `cd frontend && npx tsc --noEmit`
- E2E: `make -f scripts/Makefile test-e2e` or `cd frontend && npm run e2e`

## Practical Gaps to Watch

- SQLite-default tests may not catch all Postgres-specific datetime/enum behavior
- Authorization changes should be validated in both backend API tests and frontend gating tests
- Approval-execution changes should include high-confidence regression tests around side effects
- Route refactors must preserve static-route reachability (guarded by `tests/backend/pytest/test_route_shadowing.py`)
- Time policy regressions are guarded by `tests/backend/pytest/test_timezone_policy.py` + `tests/backend/pytest/test_no_datetime_utcnow.py`

---

*Testing audit refreshed on 2026-02-16*
