# RiskHub E2E Testing Guide

> **Last Updated**: 2026-01-11  
> **Test Framework**: Playwright 1.57+  
> **Coverage**: All BUSINESS_LOGIC.md sections (§1-§9)

---

## Quick Start

```bash
# Run all E2E tests
cd frontend && npm run e2e

# Run business logic tests only
npm run e2e:business-logic

# Run with UI (interactive mode)
npm run e2e:ui

# Run headed (see the browser)
npm run e2e:headed

# View test report
npm run e2e:report
```

---

## Prerequisites

Before running E2E tests:

1. **Backend running** on `http://localhost:8000`
   ```bash
   cd backend && python -m uvicorn app.main:app --reload
   ```

2. **Frontend running** on `http://localhost:5173`
   ```bash
   cd frontend && npm run dev
   ```

3. **Demo data populated** - the demo login endpoints must be functional

---

## Test Structure

```
frontend/e2e/
├── index.ts                     # Barrel exports for shared code
├── fixtures/
│   └── auth.fixture.ts          # Authentication fixtures
├── helpers/
│   ├── login.ts                 # Demo account helpers
│   └── wait.ts                  # Waiting utilities
├── pages/                       # Page Object Models
│   ├── ActivityLogPage.ts
│   ├── ApprovalsPage.ts
│   ├── ControlsPage.ts
│   ├── DashboardPage.ts
│   ├── KRIsPage.ts
│   ├── LoginPage.ts
│   └── RisksPage.ts
├── setup/
│   ├── global-setup.ts          # Pre-test health checks
│   └── test-data.ts             # API-based test data helpers
├── roles-access.spec.ts         # §1 Roles & Access Scopes
├── access-scope.spec.ts         # §1 Access Scopes
├── entity-ownership/            # §2 Entity Ownership
├── department-access.spec.ts    # §3 Department Relationships
├── permissions/                 # §4 Permission Matrix
├── approval-workflows/          # §5 Approval Workflows
├── sensitive-fields/            # §6 Sensitive Field Rules
├── cross-department/            # §7 Cross-Department Access
└── activity-logging/            # §9 Activity Logging
```

---

## Business Logic Coverage

| BUSINESS_LOGIC.md Section | Test Files | Tests |
|--------------------------|------------|-------|
| **§1 Roles & Access Scopes** | `roles-access.spec.ts`, `access-scope.spec.ts` | Role definitions, scope visibility |
| **§2 Entity Ownership** | `entity-ownership/*.spec.ts` | Risk, Control, KRI ownership rules |
| **§3 Department Relationships** | `department-access.spec.ts` | Department-entity mapping, access rules |
| **§4 Permission Matrix** | `permissions/*.spec.ts` | CRUD permissions, wizard access |
| **§5 Approval Workflows** | `approval-workflows/*.spec.ts` | Status flow, tiered approval, self-approval |
| **§6 Sensitive Fields** | `sensitive-fields/*.spec.ts` | Field change triggers, priority rules |
| **§7 Cross-Department Access** | `cross-department/*.spec.ts` | Owner access, linking permissions |
| **§8 Quick Reference** | (covered by other sections) | - |
| **§9 Activity Logging** | `activity-logging/*.spec.ts` | Entity logging, change tracking |

---

## CI/CD Integration

### GitHub Actions

```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      
      - name: Install dependencies
        run: cd frontend && npm ci
      
      - name: Install Playwright
        run: cd frontend && npx playwright install --with-deps
      
      - name: Start backend
        run: |
          cd backend
          pip install -r requirements.txt
          python -m uvicorn app.main:app &
          sleep 10
      
      - name: Run E2E tests
        run: cd frontend && npm run e2e -- --project=ci
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: frontend/playwright-report/
```

### Playwright Configuration

The `playwright.config.ts` includes:

- **Projects**: chromium, firefox, webkit, ci
- **Retries**: 2 in CI, 0 locally
- **Timeout**: 60 seconds per test
- **Artifacts**: Screenshots on failure, video/trace on first retry
- **Reporters**: HTML (local), JUnit XML (CI)

---

## Running Specific Tests

```bash
# Single spec file
npx playwright test roles-access.spec.ts

# Specific test by title
npx playwright test -g "CRO can access Risk Hub settings"

# Directory of tests
npx playwright test approval-workflows/

# With specific project
npx playwright test --project=chromium
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Backend not available | Start backend server: `cd backend && python -m uvicorn app.main:app --reload` |
| Frontend not loading | Start frontend: `cd frontend && npm run dev` |
| Demo login fails | Check demo-login endpoint returns 200 |
| Timeouts | Increase timeout in test or config (default 60s) |
| Element not found | Check if selector changed, update POM |

### Debug Mode

```bash
# Run with debug UI
npx playwright test --debug

# Pause on failure
PWDEBUG=1 npx playwright test

# Generate trace for analysis
npx playwright test --trace on
```

### Viewing Traces

After a failed test with traces:

```bash
npx playwright show-trace test-results/*/placeholder-zip-017.zip
```

---

## Adding New Tests

### 1. Create Test File

```typescript
import { test, expect } from '../fixtures/auth.fixture';
import { RisksPage } from '../pages/RisksPage';

test.describe('My Feature', () => {
    test('should do something', async ({ croPage }) => {
        const risksPage = new RisksPage(croPage);
        await risksPage.goto();
        
        // Test assertions
        await expect(risksPage.someElement).toBeVisible();
    });
});
```

### 2. Use Auth Fixtures

Available fixtures in `auth.fixture.ts`:

- `adminPage` - Logged in as Admin
- `croPage` - Logged in as CRO
- `riskManagerPage` - Logged in as Risk Manager
- `deptHeadPage` - Logged in as Department Head
- `employeePage` - Logged in as Employee

### 3. Create/Update Page Objects

If testing new UI, add methods to existing POMs or create new ones:

```typescript
// frontend/e2e/pages/MyPage.ts
export class MyPage {
    constructor(private page: Page) {}
    
    readonly myButton = this.page.getByRole('button', { name: 'Click Me' });
    
    async goto() {
        await this.page.goto('/my-page');
    }
}
```

### 4. Use Test Data Helpers

For tests needing specific data:

```typescript
import { createTestRisk, cleanupTestData } from '../setup/test-data';

test('test with data', async ({ croPage }) => {
    const risk = await createTestRisk({ name: 'Test Risk' });
    
    try {
        // Test logic
    } finally {
        await cleanupTestData({ risks: [risk.id!] });
    }
});
```

---

## Test Conventions

1. **Describe blocks** map to BUSINESS_LOGIC.md sections
2. **Test names** describe expected behavior
3. **Use POMs** for all page interactions
4. **Skip data-dependent tests** with `test.skip()` when data unavailable
5. **Clean up** any test data created during tests

---

*See [BUSINESS_LOGIC.md](./BUSINESS_LOGIC.md) for complete rule definitions.*
