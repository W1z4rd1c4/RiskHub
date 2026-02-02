# Testing

**Analysis Date:** 2026-02-02

## Backend Testing (pytest)

**Frameworks:**
- pytest + pytest-asyncio (`backend/pytest.ini`, `backend/tests/`)
- httpx `AsyncClient` with ASGI transport (FastAPI app in-process)

**Key patterns:**
- In-memory SQLite by default for fast tests (`backend/tests/conftest.py`)
- Fixtures for roles/users/departments and commonly used entities
- Markers:
  - `postgres`: requires PostgreSQL
  - `slow`: longer-running suites

**How to run:**
- `make test`
- `cd backend && pytest -v`

## Frontend Unit/Integration (Vitest)

**Frameworks:**
- Vitest + jsdom (`frontend/vitest.config.ts`)
- Testing Library (`@testing-library/react`, `@testing-library/user-event`)
- MSW for API mocking (`frontend/src/test/mocks/`)

**How to run:**
- `cd frontend && npm test`
- `cd frontend && npm run test:run`

## Frontend E2E (Playwright)

**Frameworks:**
- Playwright test runner (`frontend/playwright.config.ts`)
- Uses `baseURL: http://localhost:5173` and starts dev server automatically

**How to run:**
- `make test-e2e`
- `cd frontend && npx playwright test`

**Notes:**
- Repo includes dedicated RBAC/permission E2E suites (`frontend/e2e/roles-access.spec.ts`, `frontend/e2e/permissions/*`)
- E2E data is often driven by seed scripts in `backend/scripts/`

---

*Testing audit: 2026-02-02*
*Update when test strategy changes*

