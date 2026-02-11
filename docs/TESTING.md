# RiskHub Testing Guide

> **Last Updated**: 2026-02-11  
> **Purpose**: Comprehensive reference for testing infrastructure, patterns, and execution.

---

## Table of Contents

1. [Testing Overview](#1-testing-overview)
2. [Backend Testing (pytest)](#2-backend-testing-pytest)
3. [Frontend Testing (Vitest + Playwright)](#3-frontend-testing-vitest--playwright)
4. [Test Fixtures & Patterns](#4-test-fixtures--patterns)
5. [Running Tests](#5-running-tests)
6. [Test Categories Reference](#6-test-categories-reference)
7. [Writing New Tests](#7-writing-new-tests)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Testing Overview

### 1.1 Testing Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Backend Unit/Integration** | pytest + pytest-asyncio | API endpoints, services, models |
| **Backend Coverage** | pytest-cov | Code coverage reporting |
| **Backend Benchmarks** | pytest-benchmark | API performance testing |
| **Frontend Unit** | Vitest + React Testing Library | Component testing |
| **Frontend E2E** | Playwright | Full browser automation |

### 1.2 Test Locations

```
RiskHub/
├── backend/
│   ├── tests/
│   │   ├── conftest.py           # Shared fixtures
│   │   ├── test_*.py             # 38 test files
│   │   └── api/                  # API-specific tests
│   └── pytest.ini                # Configuration
│
└── frontend/
    ├── tests/
    │   ├── *.spec.ts             # Integration tests
    │   └── vitest.setup.ts       # Test setup
    ├── e2e/
    │   └── *.spec.ts             # 6 E2E test suites
    ├── vitest.config.ts          # Vitest config
    └── playwright.config.ts      # Playwright config
```

---

## 2. Backend Testing (pytest)

### 2.1 Configuration

**`pytest.ini`:**
```ini
[pytest]
asyncio_mode = auto
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts = --cov=app --cov-report=term-missing --cov-report=html:coverage_html
```

### 2.2 Database Strategy

- **SQLite In-Memory**: Each test uses fresh SQLite database (`sqlite+aiosqlite:///:memory:`)
- **Complete Isolation**: Tables are created before and dropped after each test
- **No State Leakage**: Tests cannot affect each other

```python
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest_asyncio.fixture(scope="function")
async def async_engine():
    engine = create_async_engine(TEST_DATABASE_URL, ...)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    # Tables dropped automatically after test
```

### 2.3 Test File Inventory (38 files)

| Category | Files | Description |
|----------|-------|-------------|
| **RBAC & Permissions** | `test_kris_rbac.py`, `test_reports_rbac.py` | Role-based access control |
| **Approval Workflow** | `test_approvals.py`, `test_approval_workflow.py` | Tiered approval flows |
| **API Endpoints** | `test_risks.py`, `test_controls.py`, `test_users.py`, `test_departments.py` | CRUD operations |
| **Dashboard** | `test_dashboard.py` | Dashboard aggregation |
| **Issue Management** | `test_issues_api.py`, `test_issue_workflow.py`, `test_issue_deadline_service.py`, `test_dashboard_issue_metrics.py`, `test_reports_issues.py` | Issue lifecycle, reminders, dashboard metrics, reporting export |
| **KRI System** | `test_kri_*.py` (5 files) | KRI values, history, deadlines |
| **Activity Logging** | `test_activity_log.py`, `test_siem_logging.py` | Audit trail |
| **Risk Hub Config** | `test_riskhub_*.py` (5 files) | Risk Hub admin features |
| **Performance** | `test_api_benchmarks.py`, `test_concurrency_stress.py` | Load testing |
| **Data Integrity** | `test_data_consistency.py`, `test_sensitive_fields.py` | Business logic |

---

## 3. Frontend Testing (Vitest + Playwright)

### 3.1 Vitest (Unit Tests)

**Configuration** (`vitest.config.ts`):
```typescript
export default defineConfig({
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./vitest.setup.ts'],
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
        coverage: {
            reporter: ['text', 'json', 'html'],
        },
    },
});
```

### 3.2 Playwright (E2E Tests)

**Configuration** (`playwright.config.ts`):
```typescript
export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    timeout: 30000,
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ],
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:5173',
    },
});
```

### 3.3 E2E Test Suites

| Suite | File | Coverage |
|-------|------|----------|
| **Authentication** | `auth.spec.ts` | Login, logout, session persistence |
| **Dashboard** | `dashboard.spec.ts` | Widget loading, navigation |
| **Risks** | `risks.spec.ts` | Risk CRUD, filtering, approval |
| **Controls** | `controls.spec.ts` | Control CRUD, linking to risks |
| **KRIs** | `kris.spec.ts` | KRI values, breach alerts |
| **Issues Workflow** | `issues-workflow.spec.ts` | Issue lifecycle path and dashboard visibility checks |
| **Admin** | `admin.spec.ts` | Admin console, logs, health |

### 3.4 Deterministic E2E Seed Workflow (Phase 179/180)

E2E runs now assume deterministic fixture entities are present in the backend.

Required flow for a fresh database:

```bash
cd backend
venv/bin/python -m app.db.seed
venv/bin/python -m scripts.seed_e2e_all
```

Key rules:

- E2E seed scripts must not create users or departments.
- Deterministic entities are the source of truth for E2E selectors (see `frontend/e2e/fixtures/e2e-data.ts`).
- Global Playwright setup performs a preflight check and fails fast if required fixtures are missing.

Preflight checks validate presence of deterministic entities across:

- Risks (including archived pair)
- Controls (including archived pair)
- KRIs (including archived pair)
- Vendors (including inactive archive semantics)
- Vendor SLAs (including archived rows)

---

## 4. Test Fixtures & Patterns

### 4.1 Core Fixtures (conftest.py)

| Fixture | Scope | Description |
|---------|-------|-------------|
| `db_session` | function | Fresh async database session |
| `test_department` | function | Pre-created department |
| `test_role` | function | Legacy wildcard superuser role (`admin` + `*:*`) for broad auth tests |
| `test_user` | function | Legacy wildcard superuser user (GLOBAL scope) |
| `test_role_superuser_wildcard` | function | Explicit alias for wildcard superuser role |
| `test_user_superuser_wildcard` | function | Explicit alias for wildcard superuser user |
| `test_role_platform_admin` | function | Canonical platform-admin role (users/activity-log/departments only) |
| `test_user_platform_admin` | function | Canonical platform-admin user (GLOBAL scope) |
| `test_role_employee` | function | Employee role (limited perms) |
| `test_user_employee` | function | Employee user (DEPARTMENT scope) |
| `test_role_cro` | function | CRO role |
| `test_user_cro` | function | CRO user |
| `test_role_risk_manager` | function | Risk Manager role |
| `test_user_risk_manager` | function | Risk Manager user |
| `test_risk` | function | Pre-created test risk |
| `seed_risk_types` | function | Seed operational/strategic risk types |

### 4.2 Client Fixtures

| Fixture | User | Auth Method |
|---------|------|-------------|
| `client` | None (unauthenticated) | Mock auth enabled |
| `auth_client` | `test_user` (legacy wildcard superuser) | Dependency override |
| `auth_client_superuser` | `test_user_superuser_wildcard` | Dependency override |
| `client_platform_admin` | `test_user_platform_admin` | X-Mock-User-Id header |
| `client_employee` | test_user_employee | X-Mock-User-Id header |
| `client_risk_manager` | test_user_risk_manager | X-Mock-User-Id header |
| `client_cro` | test_user_cro | X-Mock-User-Id header |

### 4.3 Authentication Pattern

**Header-Based Mock Auth:**
```python
# For role-specific testing, use X-Mock-User-Id header
async with AsyncClient(..., headers={"X-Mock-User-Id": str(user.id)}) as ac:
    yield ac
```

**Dependency Override (most common):**
```python
async def override_get_current_user():
    return test_user

app.dependency_overrides[security.get_current_user] = override_get_current_user
```

---

## 5. Running Tests

### 5.1 Backend Tests

```bash
cd backend

# Run all tests with coverage
python3 -m pytest

# Run specific test file
python3 -m pytest tests/test_approvals.py -v

# Run single test
python3 -m pytest tests/test_approvals.py::test_cancel_own_request -v

# Run with verbose output
python3 -m pytest -v --tb=short

# Exclude slow tests
python3 -m pytest --ignore=tests/test_concurrency_stress.py

# Run only failing tests from last run
python3 -m pytest --lf

# Run benchmarks
python3 -m pytest tests/test_api_benchmarks.py --benchmark-only
```

### 5.2 Frontend Tests

```bash
cd frontend

# Run Vitest unit tests
npm run test

# Run with coverage
npm run test -- --coverage

# Run Playwright E2E tests (requires backend + frontend running)
npx playwright test

# Run specific E2E suite
npx playwright test e2e/dashboard.spec.ts

# Run issues workflow e2e gate
npx playwright test -g "issues workflow"

# Run with UI mode
npx playwright test --ui

# View last report
npx playwright show-report
```

### 5.3 Full Test Suite

```bash
# Backend (from backend/)
python3 -m pytest --ignore=tests/test_concurrency_stress.py -x

# Frontend E2E (requires running app)
cd frontend && npx playwright test --workers=5
```

---

## 6. Test Categories Reference

### 6.1 RBAC Tests

**What We Test:**
- Department-scoped access (users can only see their department's data)
- Cross-department access via ownership
- Privileged user bypass
- Permission checks for each action

**Example:**
```python
@pytest.mark.asyncio
async def test_employee_cannot_see_other_department_risks(
    client_employee: AsyncClient,
    db_session: AsyncSession,
    other_department_risk: Risk,
):
    response = await client_employee.get(f"/api/v1/risks/{other_department_risk.id}")
    assert response.status_code == 403
```

### 6.2 Approval Workflow Tests

**What We Test:**
- Non-privileged users must submit approval requests for deletions
- Tiered approval flow (PENDING → PENDING_PRIVILEGED → APPROVED)
- Self-approval prevention
- Activity logging on approval/rejection
- Cancel for both PENDING and PENDING_PRIVILEGED states

**Key Files:**
- `test_approvals.py`: 15 tests covering approval lifecycle
- `test_approval_workflow.py`: 6 end-to-end workflow tests

### 6.3 KRI Tests

**What We Test:**
- KRI value submission with period tracking
- History correction with approval workflow
- Deadline notifications and overdue detection
- Breach status calculation
- Historization on period rollover

**Key Files:**
- `test_kri_history.py`: 22 tests for history service
- `test_kris_history_api.py`: API-level KRI tests
- `test_kri_deadline_service.py`: Deadline/reminder tests
- `test_kris_rbac.py`: KRI permission tests

### 6.4 Activity Log Tests

**What We Test:**
- Immutability (cannot update/delete log entries)
- Automatic logging on CRUD operations
- Change tracking with before/after values
- Filtering by entity type, date, actor

### 6.5 Concurrency & Performance Tests

**What We Test:**
- Race condition resistance (parallel approvals)
- Unique constraint enforcement under load
- API response time benchmarks

**Key Files:**
- `test_concurrency_stress.py`: Parallel request testing
- `test_risks_concurrency.py`: Risk ID generation under load
- `test_api_benchmarks.py`: Response time measurements

---

## 7. Writing New Tests

### 7.1 Test File Template

```python
"""Tests for [feature] endpoints."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, Risk


@pytest.mark.asyncio
async def test_[action]_[scenario](
    auth_client: AsyncClient,  # or client_employee, client_cro
    db_session: AsyncSession,
    test_risk: Risk,  # use fixtures for setup
):
    """[What the test verifies]."""
    # Arrange
    # ... setup specific to this test
    
    # Act
    response = await auth_client.get("/api/v1/endpoint")
    
    # Assert
    assert response.status_code == 200
    data = response.json()
    assert "expected_field" in data
```

### 7.2 Testing Different Roles

```python
# Test privileged access
async def test_cro_can_delete_risk(client_cro: AsyncClient, test_risk):
    response = await client_cro.delete(f"/api/v1/risks/{test_risk.id}")
    assert response.status_code == 204

# Test non-privileged creates approval request
async def test_employee_delete_creates_approval(client_employee: AsyncClient, test_risk):
    response = await client_employee.delete(
        f"/api/v1/risks/{test_risk.id}",
        params={"reason": "No longer needed"}
    )
    assert response.status_code == 202  # Accepted, pending approval
```

### 7.3 Testing Cross-Department Access

```python
@pytest.mark.asyncio
async def test_control_owner_can_access_cross_department(
    client: AsyncClient,
    db_session: AsyncSession,
    test_role_employee: Role,
):
    # Create user in Dept A
    dept_a = Department(name="Dept A", code="A")
    dept_b = Department(name="Dept B", code="B")
    db_session.add_all([dept_a, dept_b])
    await db_session.commit()
    
    user_in_a = User(department_id=dept_a.id, role_id=test_role_employee.id, ...)
    db_session.add(user_in_a)
    
    # Create control in Dept B, owned by user in Dept A
    control_in_b = Control(department_id=dept_b.id, control_owner_id=user_in_a.id, ...)
    db_session.add(control_in_b)
    await db_session.commit()
    
    # Verify cross-dept access
    response = await client.get(
        f"/api/v1/controls/{control_in_b.id}",
        headers={"X-Mock-User-Id": str(user_in_a.id)}
    )
    assert response.status_code == 200  # Owner can access despite different dept
```

---

## 8. Troubleshooting

### 8.1 Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `fixture 'test_user' not found` | Missing conftest import | Ensure `conftest.py` is in tests dir |
| `IntegrityError: NOT NULL constraint` | Missing required field | Check model for required fields (e.g., `name`) |
| `asyncio.run() cannot be called from running event loop` | Wrong asyncio mode | Ensure `asyncio_mode = auto` in pytest.ini |
| `401 Unauthorized` | Auth not configured | Use `auth_client` or set `X-Mock-User-Id` header |
| `403 Forbidden` | Wrong user role | Use appropriate client fixture for needed permissions |

### 8.2 Debugging Tests

```bash
# Run with print output visible
python3 -m pytest -s tests/test_file.py

# Run with full traceback
python3 -m pytest --tb=long

# Stop on first failure
python3 -m pytest -x

# Run only failed tests from last run
python3 -m pytest --lf

# Debug with breakpoints (add `import pdb; pdb.set_trace()` in test)
python3 -m pytest -s --pdb
```

### 8.3 Database Debugging

```python
# In test, print raw SQL
from sqlalchemy import event

@event.listens_for(async_engine.sync_engine, "before_cursor_execute")
def log_sql(conn, cursor, statement, parameters, context, executemany):
    print(f"SQL: {statement}")
    print(f"PARAMS: {parameters}")
```

---

## Appendix A: Performance Baseline

From `docs/PERFORMANCE_BASELINE.md`:

| Metric | Target | Verified |
|--------|--------|----------|
| Dashboard Summary | < 500ms | ✅ < 450ms |
| Risk List | < 300ms | ✅ < 250ms |
| Control List | < 300ms | ✅ < 250ms |
| CRUD Operations | < 200ms | ✅ < 150ms |
| Concurrent Workers | 5 | ✅ Passed |

---

## Appendix B: Coverage Goals

| Module | Target | Current |
|--------|--------|---------|
| `app/api/v1/endpoints/` | 80% | See `coverage_html/` |
| `app/core/` | 90% | Permissions critical |
| `app/services/` | 85% | Business logic |

Run coverage report:
```bash
python3 -m pytest --cov=app --cov-report=html:coverage_html
open coverage_html/index.html
```

---

*Document generated from codebase analysis. See `backend/tests/conftest.py` for authoritative fixture definitions.*
