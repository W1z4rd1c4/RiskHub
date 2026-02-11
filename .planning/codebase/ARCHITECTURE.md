# Architecture

**Analysis Date:** 2026-02-11

## System Shape

RiskHub is a containerized full-stack application:
- Backend: FastAPI monolith with modular domain endpoints (`backend/app/api/v1/endpoints/`)
- Frontend: React SPA with route-based pages (`frontend/src/App.tsx`, `frontend/src/pages/`)
- Datastore: PostgreSQL, with Redis for production runtime controls (`docker-compose.yml`)

## Backend Layering

### API Layer
- Router composition in `backend/app/api/v1/router.py`
- Endpoint modules grouped by domain (risks, controls, approvals, vendors, admin, directory, etc.)
- Authentication and user resolution via dependency injection (`backend/app/api/deps.py`)

### Domain and Persistence
- SQLAlchemy models in `backend/app/models/`
- Pydantic request/response schemas in `backend/app/schemas/`
- Business workflows in `backend/app/services/`
- Async DB session boundary in `backend/app/db/session.py`

### Cross-Cutting Runtime
- Middleware chain: CORS, trusted hosts, logging context, security headers, rate limiting, language (`backend/app/main.py`, `backend/app/middleware/`)
- Structured logging + audit logging (`backend/app/core/logging.py`, `backend/app/core/activity_logger.py`)
- Background jobs via APScheduler (`backend/app/core/scheduler.py`)

## Frontend Layering

- Bootstrapping: `frontend/src/main.tsx`
- Global providers: QueryClient, AuthProvider, ThemeProvider (`frontend/src/App.tsx`)
- Routing: `BrowserRouter` route tree in `frontend/src/App.tsx`
- Domain views: page components in `frontend/src/pages/`, shared components in `frontend/src/components/`
- API access: central `apiClient` + domain service wrappers (`frontend/src/services/`)
- Authorization UX: `PermissionGate`, `usePermissions`, `useAuthz` (`frontend/src/components/PermissionGate.tsx`, `frontend/src/hooks/usePermissions.ts`, `frontend/src/authz/useAuthz.ts`)

## Core Data Flows

### Authenticated API request
1. User logs in (`/api/v1/auth/login`) and receives JWT (`backend/app/api/v1/endpoints/auth.py`)
2. Frontend stores token in localStorage (`frontend/src/contexts/AuthContext.tsx`)
3. `apiClient` injects bearer token (`frontend/src/services/apiClient.ts`)
4. Backend resolves user/permissions in dependency layer (`backend/app/api/deps.py`)
5. Endpoint/service executes and may write audit events (`backend/app/core/activity_logger.py`)

### Approval workflow
1. Change request enters approvals flow (`backend/app/api/v1/endpoints/approvals.py`)
2. Approval side effects are executed in service layer (`backend/app/services/approval_execution_service.py`)
3. Related domain entities and activity logs are updated transactionally

### Scheduled jobs
1. App starts and conditionally starts scheduler based on `ENABLE_SCHEDULER` (`backend/app/core/scheduler.py`)
2. Daily jobs process KRIs, questionnaires, vendor reassessment/SLA, and optional vendor signal refresh

## Deployment Topology

- Dev/local hybrid flow orchestrated by `scripts/dev.sh` and `Makefile`
- Dockerized production flow in `docker-compose.yml` + `docker-compose.prod.yml`
- Frontend served by nginx, proxying backend API requests (`frontend/nginx.conf`)

## Architectural Characteristics

- Strong modularity by business domain, but still a single deployable backend service
- Authorization is backend-authoritative; frontend mirrors with UI gating
- Approval and audit concerns are deeply integrated into domain write paths
- Large endpoint modules exist in high-traffic domains (RiskHub/Reports/Dashboard/Controls/KRIs)

---

*Architecture analysis refreshed on 2026-02-11*
