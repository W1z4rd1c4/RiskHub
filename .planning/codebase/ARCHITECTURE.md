# Architecture

**Analysis Date:** 2026-05-25

## System Shape

RiskHub is a containerized full-stack application:
- Backend: FastAPI monolith with modular domain endpoints (many split into packages with subrouters) (`backend/app/api/v1/endpoints/`)
- Frontend: React SPA with route-based pages (`frontend/src/App.tsx`, `frontend/src/pages/`)
- Datastore: PostgreSQL, with Redis for production runtime controls (`docker-compose.yml`, `scripts/compose.sh`, `backend/app/main.py`, `backend/app/middleware/rate_limit/`, `scripts/deploy.sh`)
- Quantitative repository-size metrics are tracked in `.planning/codebase/STRUCTURE.md` as the count source of truth.

## Backend Layering

### App composition and lifecycle
- Canonical app composition now lives in `backend/app/main.py`: settings validation, logging bootstrap, middleware composition, lifespan, scheduler wiring, and `create_app`
- DB engine/sessionmaker initialized per-app and stored on `app.state` (`backend/app/db/session.py`, `backend/app/main.py`)
- Lifespan shutdown disposes DB engine and closes Redis (`backend/app/main.py`)
- `backend/app/core/config.py` is now the import-stable facade over the physically segmented `backend/app/core/settings/` package, preserving the flat env contract while moving field groups by concern

### API Layer
- Router composition is manually registered in `backend/app/api/v1/router.py`; `backend/app/api/v1/_router_registry.toml` is the registry/lock metadata source, not the production include loop
- Endpoint modules/packages grouped by domain (risks, controls, approvals, vendors, admin, directory, etc.) (`backend/app/api/v1/endpoints/`)
- Authentication and user resolution via dependency injection (`backend/app/api/deps.py`)
- Route ordering is treated as a correctness constraint (static routes must not be shadowed by `{param}` routes) and is guarded by tests (`tests/backend/pytest/test_route_shadowing.py`, `tests/backend/pytest/api/v1/test_route_ordering_regressions.py`)

### Domain and Persistence
- SQLAlchemy models in `backend/app/models/`
- Pydantic request/response schemas in `backend/app/schemas/`
- Business workflows in `backend/app/services/`
- Internal workflow packages hold shared invariants for high-risk domains:
  - approval execution locking/staleness (`backend/app/services/_approval_execution/`)
  - issue remediation transitions (`backend/app/services/_issue_workflow/`)
  - issue register grouping/linked-context SQL helpers (`backend/app/services/_issue_register/`)
  - KRI history/value/correction policy (`backend/app/services/_kri_history/`)
  - KRI value intake decision/orchestration (`backend/app/services/_kri_history/intake.py`)
  - risk questionnaire lifecycle/capabilities (`backend/app/services/risk_questionnaire_service.py`, `backend/app/services/_risk_questionnaires/`)
  - access workflow policy/capabilities (`backend/app/services/_access_workflow/`)
  - vendor link list/create/delete workflow (`backend/app/services/_vendor_links/`)
  - orphan resolution planning (`backend/app/services/_orphaned_items/resolution_plan.py`)
  - admin operations telemetry projections (`backend/app/services/_admin_telemetry/`)
  - quarterly comparison period/snapshot/change helpers (`backend/app/services/_quarterly_comparison/`)
  - authorization capability builders and catalog-aligned shapes (`backend/app/services/authorization_capabilities.py`, `backend/app/services/_authorization_capabilities/`, `docs/security/capability-catalog.json`)
- Unified report export endpoints are HTTP adapters (`backend/app/api/v1/endpoints/reports/unified_exports/routes.py`); export assembly lives under service-owned fetch/replay/filter/render helpers (`backend/app/services/_reporting/exports/`)
- Transactional outbox responsibilities are split across store/dispatcher/registry/domain-handler modules (`backend/app/services/outbox/`)
- Async DB session boundary in `backend/app/db/session.py` (`get_db(request)` yields `AsyncSession`; no implicit commit)

### Cross-Cutting Runtime
- Middleware chain: CORS, trusted hosts, logging context, security headers, rate limiting, language (`backend/app/main.py`, `backend/app/middleware/`)
- Header, protocol-guard, and rate-limit middleware now import directly from their focused modules/packages (`backend/app/middleware/security_headers.py`, `backend/app/middleware/security_protocol.py`, `backend/app/middleware/rate_limit/`)
- Structured logging + audit logging (`backend/app/core/logging.py`, `backend/app/core/activity_logger.py`)
- Background jobs via APScheduler facade plus split lock/runtime/tracking helpers, with DB access via a configured `sessionmaker` (`backend/app/main.py`, `backend/app/core/scheduler.py`, `backend/app/core/scheduler_locks.py`, `backend/app/core/scheduler_runtime.py`, `backend/app/core/scheduler_tracking.py`)

## Frontend Layering

- Bootstrapping: `frontend/src/main.tsx`
- Global providers: QueryClient, AuthProvider, ThemeProvider (`frontend/src/App.tsx`)
- Routing: `BrowserRouter` shell in `frontend/src/App.tsx` backed by centralized route metadata in `frontend/src/routing/`
- Domain views: page components in `frontend/src/pages/`, shared components in `frontend/src/components/`
- API access: central `apiClient` + domain service wrappers (`frontend/src/services/`)
- Runtime API validation schemas are split by entity/domain under `frontend/src/services/api/schemas/entities/`; aggregate exports remain stable through the public schema index
- Detail-page primitives and shared form lookup hooks reduce duplicated route-page logic (`frontend/src/pages/detail/`, `frontend/src/components/risk-form/useRiskLookups.ts`)
- Large route components have been decomposed into workflow hooks plus focused sections for users, remediation plans, admin console ops/audit panels, risk questionnaires, KRI modal, roles, orphan resolution, and link management (`frontend/src/pages/users/`, `frontend/src/components/issues/remediation/`, `frontend/src/pages/admin-console/sections/{ops,audit}/`, `frontend/src/components/risks/risk-questionnaire-detail/`, `frontend/src/components/linking/`)
- Shared register pages use `frontend/src/pages/shared/collectionPageState.ts` for collection data state, stale-row clearing, request guards, group selection, and export dialog state.
- Auth/session coordination: `AuthProvider` composes focused providers while the canonical session package owns the in-memory snapshot, storage hints, bootstrap hydration, silent refresh, and logout transitions (`frontend/src/contexts/AuthContext.tsx`, `frontend/src/contexts/auth/`, `frontend/src/services/session/`)
- Authorization UX: `useAuthz` route/read projections use backend `me_capabilities` when strict capabilities are enabled, with legacy permission fallback only when capability metadata is absent (`frontend/src/authz/useAuthz.ts`, `frontend/src/authz/policy.ts`, `frontend/src/services/capabilityFlags.ts`, `frontend/src/lib/capabilities.ts`)
- Workflow UIs prefer backend-provided capability metadata when available; protected actions hide when metadata is missing.
- Entra SSO support via MSAL (`frontend/src/services/entraAuth.ts`, `frontend/src/pages/SsoCallbackPage.tsx`)
- Preference hydration readiness now stays inside the auth provider/hook graph; the earlier module-level readiness singleton is gone (`frontend/src/contexts/auth/usePreferenceHydration.ts`, `frontend/src/contexts/AuthContext.tsx`)
- In-app user documentation is a manual-style product surface; admin runbooks retain operator metadata, while user manuals hide maintainer references in the reader (`docs/user/`, `docs/user-cs/`, `frontend/src/components/documentation/documentationPresentation.ts`)

## Core Data Flows

### Authenticated API request
1. User logs in via password (`POST /api/v1/auth/login`) or SSO exchange (`POST /api/v1/auth/sso/exchange`) (`backend/app/api/v1/endpoints/auth/password.py`, `backend/app/api/v1/endpoints/auth/sso.py`)
2. Frontend applies authenticated/bootstrap session state through the session package coordinator/store (`frontend/src/services/session/coordinator.ts`, `frontend/src/services/session/store.ts`, `frontend/src/services/session/sessionStorage.ts`)
3. `apiClient` injects bearer token from the session snapshot, includes credentials, validates responses through runtime schemas, and retries eligible `401` responses through the refresh policy (`frontend/src/services/apiClient.ts`, `frontend/src/services/api/apiRequestBuilder.ts`, `frontend/src/services/api/ApiClientCore.ts`, `frontend/src/services/api/sessionRefreshPolicy.ts`)
4. Backend resolves user/permissions in dependency layer (`backend/app/api/deps.py`)
5. Endpoint/service executes and may write audit events (`backend/app/core/activity_logger.py`)

### Approval workflow
1. Change request enters approvals flow (`backend/app/api/v1/endpoints/approvals/`)
2. Approval rows are locked for resolution, side effects are preflighted for apply-time staleness, and domain mutations execute through `backend/app/services/approval_execution_service.py` plus `backend/app/services/_approval_execution/`
3. Related domain entities and activity logs are updated transactionally; stale edit/value approvals auto-reject without applying target-resource mutations

### Scheduled jobs
1. App starts and conditionally starts scheduler based on `ENABLE_SCHEDULER` (`backend/app/core/scheduler.py`)
2. Non-Postgres runtimes are treated as single-worker only for outbox dispatch; production multi-worker scheduler ownership requires PostgreSQL (`backend/app/core/scheduler.py`, `backend/app/services/outbox/store.py`)
3. Daily jobs process KRIs, questionnaire due/overdue reminders, vendor reassessment/SLA, issue exception expiry, and optional vendor signal refresh

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
- Authorization is backend-authoritative; frontend mirrors with UI gating and uses additive backend capability metadata for workflow actions
- Approval and audit concerns are deeply integrated into domain write paths
- Previously-large endpoint modules have been progressively split into packages with subrouters to improve reviewability (e.g., `backend/app/api/v1/endpoints/{approvals,admin,users,vendors,issues,...}/`)
- Audit-sensitive exports and dashboards treat post-transform scope as authoritative: report rows are filtered after as-of replay, and committee snapshot deltas expose missing snapshot metadata rather than fabricating values

---

*Architecture analysis refreshed on 2026-05-25*
