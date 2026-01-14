# Testing Strategy

## Backend

### Framework

- **pytest** with `pytest-asyncio` for async tests
- Config: `backend/pytest.ini`
- Fixtures: `backend/tests/conftest.py` (15KB of setup)

### Test Types

| Type | Location | Count |
|------|----------|-------|
| Unit/Integration | `backend/tests/test_*.py` | 41 files |
| API Benchmarks | `test_api_benchmarks.py` | Performance |
| Concurrency | `test_concurrency_stress.py`, `test_risks_concurrency.py` | Race conditions |
| RBAC | `test_*_rbac.py` | Permission testing |
| Cross-Department | `test_cross_department_access.py` | Access control |
| Activity Log | `test_activity_log.py` | Audit trail |
| Workflow | `test_approval_workflow.py`, `test_approvals.py` | Approval flows |

### Coverage

- Tool: `pytest-cov`
- Output: `backend/coverage_html/`
- Target: Comprehensive API coverage

### Commands

```bash
# Run all tests
cd backend && pytest

# With coverage
pytest --cov=app --cov-report=html

# Specific test file
pytest tests/test_risks.py -v

# Benchmarks
pytest tests/test_api_benchmarks.py --benchmark-only
```

## Frontend

### Unit/Component Tests

- **Framework**: Vitest 4 (jsdom) + Testing Library
- **Location**: `frontend/src/**/__tests__/*.test.tsx`
- **Mocks**: MSW in `frontend/src/test/`

### E2E Tests

- **Framework**: Playwright 1.57
- **Primary Location**: `frontend/e2e/` (organized by category)
- **Legacy Location**: `frontend/tests/` (3 specs)
- **Reports**: HTML in `test-results/`

### E2E Coverage (31 Specs)

| Category | Tests | Coverage |
|----------|-------|----------|
| Root-level | 10 | Auth, admin, controls, risks, kris, dashboard, settings-isolation |
| activity-logging/ | 3 | Approval, change-tracking, entity logging |
| approval-workflows/ | 3 | Self-approval, status-flow, tiered approval |
| cross-department/ | 4 | Control/KRI/Risk owner access, link management |
| entity-ownership/ | 3 | Control, KRI, Risk ownership |
| permissions/ | 4 | Approvals, CRUD operations |
| sensitive-fields/ | 4 | Control/Risk sensitive, null-clearing, priority edit |

### Commands

```bash
# Unit tests
cd frontend && npm run test

# Coverage
npm run test:coverage

# All E2E
npm run test:e2e

# E2E with UI
npx playwright test --ui

# Business logic E2E (Phase 180)
npm run e2e:business-logic

# Build verification (catches TypeScript errors)
npm run build
```

## CI/CD Integration

- Pre-commit hooks: gitleaks, bandit, pip-audit
- GitHub Actions in `.github/workflows/`

## Verification Standards

- All refactoring plans include `npm run build` verification
- Existing test suites run after structural changes
- Manual smoke tests for UI-affecting changes
- E2E regression runs for business logic changes

*Updated: 2026-01-14*
