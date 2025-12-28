# Testing

## Backend

### Setup
- **Framework**: pytest with pytest-asyncio
- **Config**: `backend/pytest.ini`
- **Database**: In-memory SQLite with `StaticPool`
- **Client**: `AsyncClient` with `ASGITransport`

### Patterns
- Async tests hitting FastAPI routes
- Realistic JSON payloads
- Assert status + body
- Mock auth via `X-Mock-User-Id` header

### Fixtures (`backend/tests/conftest.py`)
- Department, role, users, risks creation
- Relationship setup
- Dependency overrides for isolation

### Test Files
- `test_risks.py` - Risk CRUD operations
- `test_controls.py` - Control CRUD operations
- `test_approvals.py` - Approval workflow
- `test_approval_workflow.py` - E2E approval flows

## Frontend

### Unit/Integration Tests
- **Framework**: Vitest with `jsdom`
- **Config**: `frontend/vitest.config.ts`
- **Library**: Testing Library (DOM assertions)

### Coverage
- Reporters: `text`, `json`, `html`
- Excludes: `src/test/`
- Script: `npm run test:coverage`

### Mocking
- **MSW** for API mocking
- Handlers: `frontend/src/test/mocks/handlers.ts`
- Server: `frontend/src/test/mocks/server.ts`
- Pattern: `beforeAll/afterEach/afterAll` hooks

### E2E Tests
- **Framework**: Playwright
- **File**: `frontend/tests/approval_workflow_ui.spec.ts`
- Real browser interactions and assertions

### Test Files
- `components/__tests__/RiskScoreMatrix.test.tsx`
- `components/__tests__/ExecutionHistory.test.tsx`
- `services/__tests__/api.test.ts`

## Gaps Identified
- ⚠️ No `pytest-cov` in backend dependencies
- ⚠️ No explicit Playwright config file
- ⚠️ Frontend test utils partially used

---
*Last updated: 2025-12-28*
