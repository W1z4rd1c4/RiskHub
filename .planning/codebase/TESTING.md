# Testing Strategy

## Backend
- Framework: pytest with pytest-asyncio (`backend/pytest.ini`).
- Tests live in `backend/tests` with fixtures in `backend/tests/conftest.py`.
- Coverage via pytest-cov with HTML output in `backend/coverage_html`.
- Integration tests use `httpx.AsyncClient`.

## Frontend
- Unit/component tests: Vitest (jsdom) + Testing Library.
- Test files in `frontend/src/**/__tests__` and `frontend/src/**/*.{test,spec}.{ts,tsx}`.
- E2E tests: Playwright in `frontend/tests` with HTML reports.

## Common Commands
- Backend: `pytest`
- Frontend: `npm run test`, `npm run test:coverage`, `npm run test:e2e`
