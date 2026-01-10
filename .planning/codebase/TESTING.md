# Testing Strategy

## Backend

### Framework
- **pytest** with `pytest-asyncio` for async tests
- Config: `backend/pytest.ini`
- Fixtures: `backend/tests/conftest.py` (15KB of setup)

### Test Types
| Type | Location | Count |
|------|----------|-------|
| Unit/Integration | `backend/tests/test_*.py` | 40 files |
| API Benchmarks | `test_api_benchmarks.py` | Performance |
| Concurrency | `test_concurrency_stress.py`, `test_risks_concurrency.py` | Race conditions |
| RBAC | `test_*_rbac.py` | Permission testing |

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
- **Location**: `frontend/tests/*.spec.ts` (3 specs)
- **Reports**: HTML in `test-results/`

### Specs
| Spec | Purpose |
|------|---------|
| approval_workflow_ui.spec.ts | Approval workflow flows |
| marketing_screenshots.spec.ts | Visual regression/docs |
| riskhub_public_config_consumption.spec.ts | Config integration |

### Commands
```bash
# Unit tests
cd frontend && npm run test

# Coverage
npm run test:coverage

# E2E
npm run test:e2e

# E2E with UI
npx playwright test --ui
```

## CI/CD Integration
- Pre-commit hooks: gitleaks, bandit, pip-audit
- GitHub Actions in `.github/workflows/`

*Updated: 2026-01-10*
