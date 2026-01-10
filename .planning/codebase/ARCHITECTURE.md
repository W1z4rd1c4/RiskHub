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

## RiskHub Frontend
- **Entry**: `frontend/src/main.tsx` → `App.tsx` (React Router routes)
- **Contexts**: `AuthContext` (JWT + user), `DashboardFilterContext` (filters)
- **API Layer**: `frontend/src/services/*.ts` using shared `apiClient` with Bearer tokens
- **Pages**: 28 route-level pages in `frontend/src/pages`
- **Components**: 73+ UI/domain components in categorized folders

## RiskHub Backend
- **Entry**: `backend/app/main.py` with CORS + middleware
- **Routers**: 19 versioned routers under `backend/app/api/v1/endpoints`
- **Layers**: endpoints → services → models/schemas (separation of concerns)
- **Auth**: JWT validation via `Depends` + RBAC permission checks (`permissions.py`)
- **Scheduler**: APScheduler for KRI deadline notifications (in-process)
- **Logging**: structlog middleware with request_id/user_id/client_ip injection

## API Routers
| Router | Prefix | Responsibility |
|--------|--------|----------------|
| health | / | Liveness/readiness |
| auth | /auth | Login, JWT, demo auth |
| users | /users | User CRUD, access |
| access | /access | Permission matrix |
| controls | /controls | Control catalog CRUD |
| risks | /risks | Risk register CRUD |
| kris | /kris + /risks/*/kris | KRI values + history |
| dashboard | /dashboard | Stats, charts, metrics |
| departments | /departments | Org structure |
| reports | /reports | PDF/Excel exports |
| executions | /executions | Control execution logs |
| approvals | /approvals | Workflow approvals |
| notifications | /notifications | Alerts and reminders |
| admin | /admin | System health, logs, SIEM |
| directory | /directory | AD sync webhook |
| orphaned-items | /orphaned-items | Governance orphans |
| lookups | /lookups | Scoped user pickers |
| activity-log | /activity-log | Audit trail |
| riskhub | /riskhub | Config, risk types, thresholds |

## Data Flow
1. User interacts with SPA → `apiClient` sends HTTP + JWT
2. FastAPI validates via Pydantic schemas + `Depends` auth
3. Service layer executes business logic + DB writes (async)
4. Activity log writes in same transaction for audit
5. JSON response → SPA updates React Query cache
6. Scheduler jobs run nightly for KRI deadline alerts

## Design Patterns
- **Dependency Injection**: FastAPI `Depends` for auth, DB sessions, permissions
- **Layered Architecture**: endpoints → services → models/schemas
- **React Contexts**: Global auth + dashboard filter state
- **RBAC**: 11+ granular permissions with access scope (global/department/manager)
- **Approval Workflow**: Tiered approvals for sensitive field changes
- **Historization**: KRI history + quarterly metric snapshots

*Updated: 2026-01-10*
