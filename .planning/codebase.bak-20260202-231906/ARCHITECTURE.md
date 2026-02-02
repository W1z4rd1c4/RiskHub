# System Architecture

## High-Level Design

RiskHub is an enterprise risk management platform: React SPA → FastAPI REST API → PostgreSQL. A separate AD Emulator service simulates Azure AD for directory sync testing.

```
┌─────────────────┐      ┌─────────────────┐      ┌────────────────┐
│  React SPA      │─────→│  FastAPI API    │─────→│  PostgreSQL    │
│  (Vite, :5173)  │ JWT  │  (:8000)        │ SQL  │  (:5432)       │
└─────────────────┘      └────────┬────────┘      └────────────────┘
                                  │ HTTP
                         ┌────────▼────────┐      ┌────────────────┐
                         │  AD Emulator    │─────→│  Postgres      │
                         │  API (:8001)    │      │  (ad_emulator) │
                         └─────────────────┘      └────────────────┘
```

## Backend Architecture

### Entry Point

- `backend/app/main.py` (157 lines)
- Lifespan manager for startup/shutdown
- Middleware stack: CORS → LoggingContext → Security → RateLimit → Language

### Layered Architecture

```
endpoints/   →   services/   →   models/
(21 routers)     (10 services)   (19 models)
     ↓               ↓               ↓
  schemas/       core/          db/
  (18 modules)   (permissions,  (session,
                  security,      base)
                  activity_logger)
```

### API Routers (21 modules, ~350KB total)

| Router | Path | Lines | Key Endpoints |
|--------|------|-------|---------------|
| health | `/health` | 1.8KB | Liveness/readiness checks |
| auth | `/auth` | 8.9KB | Login, JWT, demo auth |
| users | `/users` | 13KB | User CRUD, access scope |
| preferences | `/preferences` | 2.1KB | Theme, language settings |
| access | `/access` | 10KB | Permission matrix |
| controls | `/controls` | 35KB | 13-point CRUD, executions, linking |
| risks | `/risks` | 33KB | Risk register CRUD, linking |
| kris | `/kris` | 37KB | KRI values, history, breaches |
| dashboard | `/dashboard` | 32KB | Stats, charts, metrics |
| departments | `/departments` | 19KB | Org structure, nested resources |
| reports | `/reports` | 15KB | PDF/Excel exports |
| executions | `/executions` | 8.8KB | Control execution logs |
| approvals | `/approvals` | 23KB | Workflow management |
| notifications | `/notifications` | 6.9KB | Alerts, mark as read |
| admin | `/admin` | 26KB | System health, logs, SIEM |
| directory | `/directory` | 5.8KB | AD sync webhook |
| orphaned-items | `/orphaned-items` | 4KB | Governance orphans |
| lookups | `/lookups` | 1.7KB | Scoped user pickers |
| activity-log | `/activity-log` | 4.5KB | Audit trail queries |
| riskhub | `/riskhub` | 42KB | Config, risk types, thresholds |

### Business Services (10 modules, ~160KB total)

| Service | Lines | Purpose |
|---------|-------|---------|
| approval_execution_service | 25KB | Centralized approval workflow execution |
| directory_sync_service | 26KB | AD Emulator user synchronization |
| report_service | 24KB | PDF/Excel generation with streaming |
| orphaned_item_service | 23KB | Governance orphan detection/resolution |
| kri_history_service | 18KB | KRI value historization |
| kri_deadline_service | 15KB | KRI deadline notifications |
| quarterly_comparison_service | 12KB | QoQ metrics calculation |
| notification_service | 9KB | In-app notification generation |
| report_translations | 7.7KB | Locale-aware report text |

### Data Models (19 SQLAlchemy models)

| Model | Table | Key Fields |
|-------|-------|------------|
| Risk | risks | risk_id_code, gross/net_score, is_priority, status |
| Control | controls | 13-point structure, control_owner_id, frequency |
| KeyRiskIndicator | key_risk_indicators | risk_id (FK), lower/upper_limit, breach_status |
| User | users | email, role_id, department_id, access_scope |
| Role | roles | name (RoleType enum), permissions |
| Permission | permissions | resource, action |
| RolePermission | role_permissions | M2M junction |
| Department | departments | code, manager_id, is_system |
| ApprovalRequest | approval_requests | tiered fields, pending_changes JSON |
| ActivityLog | activity_logs | immutable audit trail |
| Notification | notifications | type, is_read, resource link |
| ControlRiskLink | control_risk_links | M2M with effectiveness |
| ControlExecution | control_executions | executed_at, notes |
| KRIValueHistory | kri_value_history | period-based snapshots |
| GlobalConfig | global_config | typed key-value settings |
| RiskType | risk_types | configurable risk categories |
| QuarterlyMetricSnapshot | quarterly_metric_snapshots | historical metrics |
| DirectoryUser | directory_users | AD sync staging |
| DirectorySyncLog | directory_sync_logs | sync history |
| OrphanedItem | orphaned_items | governance tracking |

## Frontend Architecture

### Entry Point Flow

`main.tsx` → `App.tsx` (routes + layout) → Pages → Components

### Context Providers

- **AuthContext**: JWT storage, user state, permissions
- **DashboardFilterContext**: Cross-component filter state
- **ThemeContext**: Dark/light mode, chart colors

### Page Components (28 pages, ~400KB total)

| Page | Size | Key Features |
|------|------|--------------|
| RiskForm | 53KB | Full risk editor with scoring matrix |
| ControlForm | 48KB | 13-point control editor |
| KRIForm | 30KB | KRI editor with limit validation |
| AdminConsolePage | 31KB | 6-tab admin UI |
| DepartmentDetailPage | 29KB | Nested risks/controls/users tables |
| RisksPage | 28KB | List + grouped views |
| ControlDetailPage | 28KB | Tabs: overview, executions, links |
| ApprovalsPage | 22KB | Tiered approval queue |
| ControlsPage | 20KB | List + category grouping |
| DashboardPage | 20KB | 13 dashboard widgets |

### Component Categories (18 directories, 90+ components)

| Category | Count | Examples |
|----------|-------|----------|
| dashboard/ | 13 | StatCard, RiskHeatmap, KRIBreachPanel |
| ui/ | 9 | Button, Card, Input, Modal, Tabs |
| tables/ | 7 | DataTable, Pagination, SortableHeader |
| riskhub/ | 6 | RiskTypeEditor, ThresholdConfig |
| settings/ | 6 | ThemeTab, LanguageTab, NotificationPrefs |
| history/ | 5 | HistoryChart, HistoryTable, Timeline |
| governance/ | 4 | OrphanedItemsList, GovernanceStats |
| access/ | 4 | PermissionMatrix, RoleSelector |
| kri/ | 4 | KRICard, KRIBreachBadge, KRIValueForm |

### Custom Hooks (8 hooks)

| Hook | Purpose |
|------|---------|
| useActivityLogPageState | Activity log data fetching, filters, pagination |
| useChartTheme | Theme-aware chart colors and styles |
| useDebouncedValue | Generic debounce for search inputs |
| useDepartmentDetail | Department page multi-endpoint loading |
| usePendingApprovalIds | Fetch pending approval IDs for list highlighting |
| usePermissions | Permission checking with caching |
| useRiskHubConfig | Risk Hub configuration data |
| useUsersPageFilters | Users page filter state + URL sync |

### API Services (20 modules)

All services use shared `apiClient` with:

- Bearer token injection
- Error response parsing
- 202 approval detection via `parseUpdateResult()`

## Data Flow

1. User interacts with SPA → `apiClient` sends HTTP + JWT
2. FastAPI validates via Pydantic schemas + `Depends` auth
3. Permission check via `require_permission()` or `check_permission()`
4. Service layer executes business logic + DB writes (async)
5. Activity log writes in same transaction for audit
6. JSON response → SPA updates React Query cache
7. Scheduler jobs run for KRI deadline alerts

## Design Patterns

### Backend Patterns

- **Dependency Injection**: FastAPI `Depends` for auth, DB, permissions
- **Layered Architecture**: endpoints → services → models
- **Sentinel Pattern**: `_NOT_PROVIDED = object()` for None vs unset
- **Helper Extraction**: `_helper()` functions for repeated logic
- **Atomic Operations**: `db.begin_nested()` for retries
- **Streaming Responses**: `_stream_pdf()`, `_stream_excel()`

### Frontend Patterns

- **React Contexts**: Global auth + filter + theme state
- **Data-fetching Hooks**: Encapsulate multi-endpoint loading
- **Page Orchestrator**: Main component owns state, subcomponents present
- **Permission Gating**: `<PermissionGate>` component
- **Approval UX Helper**: `handleApprovalResponse()` for async 202 detection
- **Theme-aware Charting**: `useChartTheme()` hook

---
*Updated: 2026-01-17*
