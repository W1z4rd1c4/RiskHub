# Integrations

## Databases

### RiskHub Database

| Property | Value |
|----------|-------|
| Type | PostgreSQL 16 |
| Database | `riskhub` |
| Driver (async) | asyncpg ≥0.29 |
| Driver (sync) | psycopg2-binary (migrations only) |
| Connection Pool | async_sessionmaker, expire_on_commit=False |
| Migrations | Alembic in `backend/alembic/` (39 versions) |

### AD Emulator Database

| Property | Value |
|----------|-------|
| Type | PostgreSQL 16 |
| Database | `ad_emulator_db` |
| Purpose | Directory user storage for sync testing |
| Isolation | Separate from RiskHub, shared PostgreSQL container |

## Internal Services

### AD Emulator API Integration

| Property | Value |
|----------|-------|
| Module | `backend/app/integrations/ad_emulator.py` |
| Client | `ADEmulatorClient` (httpx) |
| Endpoint | `http://ad_emulator_backend:8001` |
| Webhook | `/api/v1/directory/webhook` (push updates) |
| Sync | `/api/v1/directory/sync` (pull full directory) |

### Report Export Service

| Component | Details |
|-----------|---------|
| Module | `backend/app/services/report_service.py` (24KB) |
| Translations | `report_translations.py` (7.7KB) |
| PDF Library | reportlab |
| Excel Library | openpyxl |
| Exports | Controls, Risks, Audit Trail, Activity Log |
| Helpers | `_stream_pdf()`, `_stream_excel()` |

### Notification Service

| Component | Details |
|-----------|---------|
| Module | `backend/app/services/notification_service.py` (9KB) |
| Scheduler | APScheduler 3.11 (in-process) |
| Types | 8 notification types |
| Persistence | `notifications` table |

### Notification Types

| Type | Trigger |
|------|---------|
| `APPROVAL_PENDING` | New approval request created |
| `APPROVAL_RESOLVED` | Approval approved/rejected |
| `APPROVAL_CANCELLED` | Approval cancelled |
| `KRI_DUE_SOON` | 7 days before period end |
| `KRI_DUE_TOMORROW` | 1 day before period end |
| `KRI_OVERDUE` | After reporting grace period |
| `KRI_NEAR_BREACH` | Value at 80% of limit |
| `KRI_BREACH_DETECTED` | Value exceeds limit |

### Approval Execution Service

| Component | Details |
|-----------|---------|
| Module | `backend/app/services/approval_execution_service.py` (25KB) |
| Purpose | Centralized approval workflow execution |
| Helper | `create_approval_request_with_audit()` in `approval_helpers.py` |
| Flow | PENDING → (primary) → PENDING_PRIVILEGED → (privileged) → APPROVED |

### KRI Services

| Module | Size | Purpose |
|--------|------|---------|
| `kri_history_service.py` | 18KB | Value historization, period management |
| `kri_deadline_service.py` | 15KB | Deadline notifications, overdue tracking |

### Quarterly Comparison Service

| Component | Details |
|-----------|---------|
| Module | `backend/app/services/quarterly_comparison_service.py` (12KB) |
| Purpose | Period-based metrics calculation |
| Output | QoQ comparisons for dashboards |

### Orphaned Item Service

| Component | Details |
|-----------|---------|
| Module | `backend/app/services/orphaned_item_service.py` (23KB) |
| Purpose | Governance tracking for entities missing owners/departments |
| Resolution | Manual assignment via governance page |

### Directory Sync Service

| Component | Details |
|-----------|---------|
| Module | `backend/app/services/directory_sync_service.py` (26KB) |
| Purpose | Synchronize AD Emulator users to RiskHub |
| Mode | Push (webhook) or Pull (manual sync) |

## Auth & Identity

### JWT Authentication

| Property | Value |
|----------|-------|
| Library | python-jose (HS256) |
| Flow | Login → JWT → Bearer header |
| Expiry | Configurable (default 24h) |
| Storage | localStorage (frontend) |
| Refresh | Not implemented (re-login required) |

### Mock Auth (Development Only)

| Property | Value |
|----------|-------|
| Header | `X-Mock-User-Id` |
| Config | `MOCK_AUTH_ENABLED=true` |
| Blocked | In production (`DEBUG=false`) |

### RBAC Permissions

| Category | Details |
|----------|---------|
| Implementation | `backend/app/core/permissions.py` (446 lines) |
| Permission Count | 11+ granular (resource:action) |
| Access Scopes | GLOBAL, DEPARTMENT, MANAGER |
| Tables | `roles`, `permissions`, `role_permissions` |

### Permission Matrix

| Resource | Actions |
|----------|---------|
| risks | read, write, delete |
| controls | read, write, delete, execute |
| kri | read, write, submit, delete |
| users | read, write |
| approvals | read, write |
| activity_log | read |
| reports | read |
| departments | read, write |
| riskhub | read, write (CRO only) |

## Frontend-to-Backend

### API Client

| Property | Value |
|----------|-------|
| Location | `frontend/src/services/apiClient.ts` |
| Library | Axios 1.13 |
| Auth | Bearer token from localStorage |
| Error Handling | Centralized parsing + 202 detection |

### 202 Approval Detection

```typescript
// frontend/src/lib/approvalUi.ts
interface ApprovalCreatedResponse {
  approval_created: true;
  approval_id: number;
  message: string;
}

export function parseUpdateResult(result, t): ParseResult {
  if (result.approval_created) {
    return { approvalCreated: true, toast: result.message };
  }
  return { approvalCreated: false, entity: result };
}
```

### API Services (20 modules)

| Service | Endpoints | Size |
|---------|-----------|------|
| authApi | Login, demo, logout | 1.6KB |
| riskApi | CRUD, linking | 2.0KB |
| controlApi | CRUD, executions, linking | 2.3KB |
| kriApi | CRUD, history, values | 2.4KB |
| dashboardApi | Stats, charts, metrics | 3.4KB |
| userApi | User management | 1.6KB |
| accessApi | Permission matrix | 1.9KB |
| adminApi | Health, logs, system | 3.4KB |
| approvalsApi | Workflow queue | 1.0KB |
| departmentApi | Org structure | 2.8KB |
| reportApi | PDF/Excel downloads | 4.5KB |
| riskHubApi | Config, risk types | 6.1KB |
| activityLogApi | Audit queries | 0.9KB |
| lookupApi | Scoped pickers | 0.9KB |
| preferencesApi | User settings | 0.6KB |
| executionApi | Control executions | 1.6KB |
| notificationsApi | Alerts | 1.4KB |
| orphanedItemsApi | Governance | 0.7KB |
| directoryApi | AD sync | 0.5KB |

## Internationalization (i18n)

### Configuration

| Property | Value |
|----------|-------|
| Location | `frontend/src/i18n/` |
| Library | i18next 25.7 + react-i18next 16.5 |
| Detection | i18next-browser-languagedetector |
| Fallback | English (en) |
| Namespaces | 10 per locale |

### Locales

| Locale | Files | Coverage |
|--------|-------|----------|
| English (en) | 10 JSON files (~25KB) | 100% |
| Czech (cs) | 10 JSON files (~30KB) | 100% |

### Namespace Files

| Namespace | Content |
|-----------|---------|
| admin | Admin console, system logs |
| approvals | Approval workflow |
| auth | Login, authentication |
| common | Shared strings, errors |
| controls | Control management |
| dashboard | Dashboard widgets |
| kris | KRI management |
| navigation | Menu, sidebar |
| risks | Risk register |
| settings | User preferences |

## Logging & Monitoring

### Structured Logging

| Property | Value |
|----------|-------|
| Library | structlog + python-json-logger |
| Format | JSON (SIEM-ready) |
| Context | request_id, user_id, client_ip, path |
| Rotation | Size-based (configurable) |

### Activity Audit Trail

| Property | Value |
|----------|-------|
| Table | `activity_logs` |
| Integrity | SHA-256 hash chain (optional) |
| Immutability | SQLAlchemy event blocks UPDATE/DELETE |
| Admin Access | `/admin/logs/audit` |

---
*Updated: 2026-01-17*
