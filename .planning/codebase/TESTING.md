# Testing

**Analysis Date:** 2026-02-11

## Test Stack Overview

- Backend: `pytest`, `pytest-asyncio`, `httpx`, `pytest-cov` (`backend/pytest.ini`)
- Frontend unit/integration: `Vitest` + Testing Library + MSW (`frontend/vitest.config.ts`, `frontend/src/test/mocks/`)
- Frontend/browser E2E: `Playwright` (`frontend/playwright.config.ts`, `frontend/e2e/`)

## Backend Testing Patterns

### Configuration
- `backend/pytest.ini` sets discovery and coverage defaults
- Markers include:
  - `postgres` for PostgreSQL-required behavior
  - `slow` for longer-running suites

### Fixture strategy
- Default backend tests use in-memory SQLite (`backend/tests/conftest.py`)
- Role/user fixtures include wildcard and platform-admin variants (`backend/tests/conftest.py`)
- Dependency override and header-based auth patterns are both used in test clients

### Scale snapshot
- Backend tests: 206 files
- API-focused backend tests: 18 files under `backend/tests/api/`

## Frontend Unit/Integration Patterns

- Vitest configured with jsdom and setup file (`frontend/vitest.config.ts`, `frontend/vitest.setup.ts`)
- Includes `src/**/*.{test,spec}.{ts,tsx}`
- MSW handlers provide deterministic API contracts during tests (`frontend/src/test/mocks/handlers.ts`)
- React Query/Auth providers are wrapped in reusable test utilities (`frontend/src/test/utils.tsx`)

## Frontend E2E Patterns

- Playwright projects: Chromium, Firefox, WebKit, plus CI profile (`frontend/playwright.config.ts`)
- Global setup performs health/preflight checks (`frontend/e2e/setup/global-setup.ts`)
- Domain-oriented E2E suites cover permissions, approvals, sensitive fields, cross-department access, and activity logging (`frontend/e2e/`)

## CI Test/Security Execution

- E2E workflow provisions Postgres service, runs backend + Playwright chromium suite (`.github/workflows/e2e.yml`)
- Security workflow runs Bandit, pip-audit, npm audit, Trivy, gitleaks (`.github/workflows/security.yml`)

## Canonical Commands

- Backend tests: `make test` or `cd backend && pytest -v`
- Backend Postgres-sensitive tests: `cd backend && pytest -m postgres -v`
- Frontend unit tests: `cd frontend && npm run test:run`
- Frontend type checks: `cd frontend && npx tsc --noEmit`
- E2E: `make test-e2e` or `cd frontend && npx playwright test`

## Practical Gaps to Watch

- SQLite-default tests may not catch all Postgres-specific datetime/enum behavior
- Authorization changes should be validated in both backend API tests and frontend gating tests
- Approval-execution changes should include high-confidence regression tests around side effects

---

*Testing audit refreshed on 2026-02-11*
