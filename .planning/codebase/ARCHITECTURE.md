# Architecture

**Analysis Date:** 2026-04-05

## System Shape

RiskHub is a containerized full-stack application:
- Backend: FastAPI monolith with modular domain endpoints (many split into packages with subrouters) (`backend/app/api/v1/endpoints/`)
- Frontend: React SPA with route-based pages (`frontend/src/App.tsx`, `frontend/src/pages/`)
- Datastore: PostgreSQL, with Redis for production runtime controls (`docker-compose.yml`, `scripts/compose.sh`, `backend/app/bootstrap_runtime.py`, `scripts/deploy.sh`)
- Quantitative repository-size metrics are tracked in `.planning/codebase/STRUCTURE.md` as the count source of truth.

## Backend Layering

### App composition and lifecycle
- Canonical app composition is exported through `backend/app/bootstrap.py`, which now serves as a stable facade over `backend/app/bootstrap_app.py`, `backend/app/bootstrap_runtime.py`, and `backend/app/bootstrap_validation.py`
- `backend/app/main.py` is the thin entrypoint for logging bootstrap, `lifespan`, and `create_app`
- DB engine/sessionmaker initialized per-app and stored on `app.state` (`backend/app/db/session.py`, `backend/app/bootstrap_runtime.py`, `backend/app/main.py`)
- Lifespan shutdown disposes DB engine and closes Redis (`backend/app/main.py`)
- `backend/app/core/config.py` is now the import-stable facade over the physically segmented `backend/app/core/settings/` package, preserving the flat env contract while moving field groups by concern

### API Layer
- Router composition in `backend/app/api/v1/router.py`
- Endpoint modules/packages grouped by domain (risks, controls, approvals, vendors, admin, directory, etc.) (`backend/app/api/v1/endpoints/`)
- Authentication and user resolution via dependency injection (`backend/app/api/deps.py`)
- Route ordering is treated as a correctness constraint (static routes must not be shadowed by `{param}` routes) and is guarded by tests (`tests/backend/pytest/test_route_shadowing.py`, `tests/backend/pytest/api/v1/test_route_ordering_regressions.py`)

### Domain and Persistence
- SQLAlchemy models in `backend/app/models/`
- Pydantic request/response schemas in `backend/app/schemas/`
- Business workflows in `backend/app/services/`
- Transactional outbox responsibilities are split across store/dispatcher/registry/domain-handler modules (`backend/app/services/outbox/`)
- Async DB session boundary in `backend/app/db/session.py` (`get_db(request)` yields `AsyncSession`; no implicit commit)

### Cross-Cutting Runtime
- Middleware chain: CORS, trusted hosts, logging context, security headers, rate limiting, language (`backend/app/bootstrap_app.py`, `backend/app/middleware/`)
- Header, protocol-guard, and rate-limit middleware now import directly from their focused modules/packages (`backend/app/middleware/security_headers.py`, `backend/app/middleware/security_protocol.py`, `backend/app/middleware/rate_limit/`)
- Structured logging + audit logging (`backend/app/core/logging.py`, `backend/app/core/activity_logger.py`)
- Background jobs via APScheduler (`backend/app/core/scheduler.py`) with DB access via a configured `sessionmaker` (`backend/app/bootstrap_runtime.py`, `backend/app/core/scheduler.py`)

## Frontend Layering

- Bootstrapping: `frontend/src/main.tsx`
- Global providers: QueryClient, AuthProvider, ThemeProvider (`frontend/src/App.tsx`)
- Routing: `BrowserRouter` shell in `frontend/src/App.tsx` backed by centralized route metadata in `frontend/src/routing/`
- Domain views: page components in `frontend/src/pages/`, shared components in `frontend/src/components/`
- API access: central `apiClient` + domain service wrappers (`frontend/src/services/`)
- Auth/session coordination: `AuthProvider` now projects a canonical in-memory session snapshot from `sessionStore`, while `useAuthBootstrap`, `useAuthActions`, and `sessionManager` perform the allowed state transitions (`frontend/src/contexts/AuthContext.tsx`, `frontend/src/contexts/auth/`, `frontend/src/services/sessionStore.ts`, `frontend/src/services/sessionManager.ts`)
- Authorization UX: `PermissionGate`, `usePermissions`, `useAuthz` (`frontend/src/components/PermissionGate.tsx`, `frontend/src/hooks/usePermissions.ts`, `frontend/src/authz/useAuthz.ts`)
- Entra SSO support via MSAL (`frontend/src/services/entraAuth.ts`, `frontend/src/pages/SsoCallbackPage.tsx`)
- Preference hydration readiness now stays inside the auth provider/hook graph; the earlier module-level readiness singleton is gone (`frontend/src/contexts/auth/usePreferenceHydration.ts`, `frontend/src/contexts/AuthContext.tsx`)

## Core Data Flows

### Authenticated API request
1. User logs in via password (`POST /api/v1/auth/login`) or SSO exchange (`POST /api/v1/auth/sso/exchange`) (`backend/app/api/v1/endpoints/auth/password.py`, `backend/app/api/v1/endpoints/auth/sso.py`)
2. Frontend applies authenticated/bootstrap session state through `sessionManager`, which updates the canonical `sessionStore`; `bootstrapSessionCache` remains the only compatibility adapter over that same snapshot (`frontend/src/services/sessionManager.ts`, `frontend/src/services/sessionStore.ts`, `frontend/src/services/bootstrapSessionCache.ts`)
3. `apiClient` injects bearer token (`frontend/src/services/apiClient.ts`)
4. Backend resolves user/permissions in dependency layer (`backend/app/api/deps.py`)
5. Endpoint/service executes and may write audit events (`backend/app/core/activity_logger.py`)

### Approval workflow
1. Change request enters approvals flow (`backend/app/api/v1/endpoints/approvals/`)
2. Approval side effects are executed in service layer (`backend/app/services/approval_execution_service.py`, internal modules in `backend/app/services/_approval_execution/`)
3. Related domain entities and activity logs are updated transactionally

### Scheduled jobs
1. App starts and conditionally starts scheduler based on `ENABLE_SCHEDULER` (`backend/app/core/scheduler.py`)
2. Non-Postgres runtimes are treated as single-worker only for outbox dispatch; production multi-worker scheduler ownership requires PostgreSQL (`backend/app/core/scheduler.py`, `backend/app/services/outbox/store.py`)
3. Daily jobs process KRIs, questionnaires, vendor reassessment/SLA, and optional vendor signal refresh

## Deployment Topology

- Public local/demo first-run flow is wrapper-first through `./scripts/install.sh demo` and `./scripts/install.sh dev`, with day-2 local lifecycle checks through `./scripts/install.sh status|logs|doctor --mode demo|dev`
- Public production install flow is wrapper-first through `./scripts/install.sh production --target docker|linux`, with day-2 production lifecycle through `./scripts/install.sh upgrade --target docker|linux` and `./scripts/install.sh status|logs|doctor|verify --mode production --target docker|linux`
- `scripts/install.sh` remains the public shell surface while `scripts/install_cli.py` and `scripts/install_lib/` now carry the lifecycle orchestration on top of `scripts/compose.sh`, `scripts/dev.sh`, and `scripts/deploy.sh`
- Production lifecycle metadata is persisted at `/etc/riskhub/runtime/install-state.json` and consumed by `scripts/install.sh` status/logs/doctor/upgrade flows
- Production runtime enforces explicit `ALLOWED_HOSTS`; managed install flows render the setting from the configured public hostname, but runtime host enforcement is not derived from `CORS_ORIGINS`
- Docker onboarding flow still bootstraps migrations + base seed through the compose-managed `bootstrap` service before backend readiness
- Component-scoped runtime entrypoints under `frontend/scripts/runtime/`, `backend/scripts/runtime/`, and `backend/scripts/runtime/db/` are internal implementation assets rather than supported deployment interfaces
- Frontend served by nginx, proxying backend API requests (`frontend/nginx.conf`)
- Deployment runbooks live in `docs/deployment/`

## Architectural Characteristics

- Strong modularity by business domain, but still a single deployable backend service
- Authorization is backend-authoritative; frontend mirrors with UI gating
- Approval and audit concerns are deeply integrated into domain write paths
- Previously-large endpoint modules have been progressively split into packages with subrouters to improve reviewability (e.g., `backend/app/api/v1/endpoints/{approvals,admin,users,vendors,issues,...}/`)

---

*Architecture analysis refreshed on 2026-04-05*
