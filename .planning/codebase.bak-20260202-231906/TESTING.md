# Testing Strategy

## Backend Testing

### Framework Stack

- **pytest** ≥8.0.0
- **pytest-asyncio** ≥0.23.0 (async test support)
- **httpx** ≥0.27.0 (async HTTP client)
- **pytest-cov** ≥4.1.0 (coverage)

### Configuration

- Config: `backend/pytest.ini`
- Fixtures: `backend/tests/conftest.py` (15KB)

### Test File Inventory (43 files)

| Category | Files | Coverage |
|----------|-------|----------|
| Core API | 12 | risks, controls, kris, users, departments |
| RBAC | 5 | *_rbac.py permission tests |
| Approvals | 4 | workflow, execution, tiered |
| Cross-Department | 3 | access, ownership, linking |
| Activity Log | 2 | entity logging, change tracking |
| Concurrency | 2 | stress, race conditions |
| Performance | 1 | API benchmarks |
| Integration | 6 | directory sync, reports |
| Services | 8 | all 10 services |

### Key Test Files

| File | Lines | Purpose |
|------|-------|---------|
| `test_risks.py` | ~800 | Risk CRUD, scoring, linking |
| `test_controls.py` | ~700 | Control CRUD, executions |
| `test_approval_workflow.py` | ~600 | Tiered approval flow |
| `test_cross_department_access.py` | ~400 | Cross-dept ownership |
| `test_activity_log.py` | ~300 | Audit trail verification |
| `test_concurrency_stress.py` | ~300 | Race condition prevention |
| `test_api_benchmarks.py` | ~200 | Performance baselines |

### Commands

```bash
# All tests
cd backend && pytest

# With coverage report
pytest --cov=app --cov-report=html

# Specific file
pytest tests/test_risks.py -v

# Benchmarks only
pytest tests/test_api_benchmarks.py --benchmark-only

# Parallel execution
pytest -n auto
```

## Frontend Unit Testing

### Framework Stack

- **Vitest** 4 (test runner)
- **Testing Library** (React 16, jest-dom 6, user-event 14)
- **MSW** 2.12 (API mocking)
- **jsdom** (DOM emulation)

### Configuration

- Config: `frontend/vitest.config.ts`
- Setup: `frontend/src/test/setup.ts`
- Mocks: `frontend/src/test/mocks/`

### Test Location

- Pattern: `frontend/src/**/__tests__/*.test.tsx`
- Co-located with source files

### Commands

```bash
# Unit tests
cd frontend && npm run test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

## E2E Testing

### Framework Stack

- **Playwright** 1.57
- Config: `frontend/playwright.config.ts`
- Reports: HTML in `test-results/`

### Test Organization (44 files)

| Category | Specs | Focus |
|----------|-------|-------|
| Root-level | 11 | Core flows: auth, admin, CRUD |
| activity-logging/ | 3 | Approval, change, entity logging |
| approval-workflows/ | 3 | Self-approval, status-flow, tiered |
| cross-department/ | 4 | Control/KRI/Risk owner, link access |
| entity-ownership/ | 3 | Control, KRI, Risk ownership |
| permissions/ | 4 | Approvals, CRUD operations |
| sensitive-fields/ | 4 | Control/Risk sensitive, null-clearing, priority |
| fixtures/ | 1 | Shared test data |
| helpers/ | 2 | Test utilities |
| pages/ | 7 | Page object models |

### Root-Level Specs

| Spec | Purpose |
|------|---------|
| auth.spec.ts | Login, logout, session |
| admin.spec.ts | Admin console access |
| controls.spec.ts | Control CRUD |
| risks.spec.ts | Risk CRUD |
| kris.spec.ts | KRI CRUD |
| dashboard.spec.ts | Dashboard widgets |
| access-scope.spec.ts | Data scoping |
| department-access.spec.ts | Department filtering |
| roles-access.spec.ts | Role-based access |
| settings-isolation.spec.ts | Per-user settings |

### Page Object Models

| POM | Methods |
|-----|---------|
| LoginPage | `login()`, `assertLoggedIn()` |
| RisksPage | `create()`, `edit()`, `delete()`, `assertRowVisible()` |
| ControlsPage | `create()`, `edit()`, `delete()` |
| KRIsPage | `create()`, `recordValue()` |
| ApprovalsPage | `approve()`, `reject()`, `cancel()` |
| AdminPage | `viewLogs()`, `checkHealth()` |
| DashboardPage | `filterByDepartment()`, `assertWidget()` |

### Commands

```bash
# All E2E tests
npm run test:e2e

# With UI
npx playwright test --ui

# Specific category
npx playwright test e2e/approval-workflows/

# Business logic suite
npm run e2e:business-logic

# Debug mode
npx playwright test --debug
```

## CI/CD Integration

### GitHub Actions Workflows

| Workflow | Trigger | Jobs |
|----------|---------|------|
| `ci.yml` | Push, PR | Lint, type-check, test |
| `security.yml` | Push, PR | Bandit, pip-audit, npm audit |
| `e2e.yml` | PR to main | Full E2E suite |

### Pre-commit Hooks

| Hook | Tool | Purpose |
|------|------|---------|
| Secrets | gitleaks | Detect leaked credentials |
| Python SAST | bandit | Security vulnerabilities |
| Dependencies | pip-audit | Known CVEs |

## Verification Standards

### Before Merge

1. All unit tests pass (`npm run test`)
2. TypeScript builds without errors (`npm run build`)
3. E2E tests pass for affected flows
4. Coverage maintained or improved

### After Major Changes

1. Full E2E regression (`npm run test:e2e`)
2. Manual smoke tests for UI changes
3. Performance baselines check
4. Security scan review

### Test Data

- **Unit Tests**: MSW mocks + factory functions
- **E2E Tests**: Seeded via `backend/scripts/seed_*.py`
- **Cross-Department**: Deterministic ownership scenarios
- **Fixtures**: `frontend/e2e/fixtures/` + `setup/`

---
*Updated: 2026-01-17*
