# Architecture

**Analysis Date:** 2026-02-02

## Pattern Overview

**Overall:** Docker-deployable full-stack web app (FastAPI monolith + React SPA)

**Key Characteristics:**
- Single backend service exposing a versioned REST API (`/api/v1/*`)
- Frontend SPA consumes API via relative proxy (`/api/v1`) for LAN/Docker friendliness
- RBAC + access scoping enforced in backend and mirrored as UI gating
- “Delete” operations are typically soft-delete / archival for auditability

## Layers

**Backend API Boundary (FastAPI):**
- Purpose: HTTP routing, auth dependency injection, request validation
- Contains: routers/endpoints in `backend/app/api/v1/endpoints/`
- Depends on: services/models/schemas/db
- Used by: frontend and E2E tests

**Schemas (Pydantic):**
- Purpose: request/response contracts
- Location: `backend/app/schemas/`

**Domain Models (SQLAlchemy):**
- Purpose: persistence models + relationships
- Location: `backend/app/models/`

**Services (Business Logic):**
- Purpose: encapsulate multi-step workflows (approvals execution, notifications, historization, vendor workflows)
- Location: `backend/app/services/`

**Integrations:**
- Purpose: outbound clients to other services (AD emulator, vendor signals connectors)
- Location: `backend/app/integrations/`

**Cross-Cutting Middleware:**
- Purpose: logging context, security headers, rate limiting, language detection
- Location: `backend/app/middleware/`

**Frontend UI (React SPA):**
- Purpose: pages, components, local UI state, data fetching
- Location: `frontend/src/`
- Patterns: route-based pages (`frontend/src/pages/`) + component library (`frontend/src/components/`)

## Data Flow

**HTTP Request (typical API call):**
1. Client calls `/api/v1/...` (frontend via `frontend/src/services/apiClient.ts`)
2. Middleware enriches context (request_id/user_id/client_ip), enforces headers/rate limits (`backend/app/main.py`)
3. Endpoint validates input via Pydantic schemas (`backend/app/api/v1/endpoints/*`)
4. Endpoint loads data via `AsyncSession` (dependency `get_db`) and service functions
5. Activity logging is written as part of the transaction for auditable actions (`backend/app/core/activity_logger.py`)
6. Transaction commits; response serialized back to client

**Approval Workflow (governed changes):**
1. Non-privileged action returns 202 and creates `ApprovalRequest`
2. Approver resolves via `/api/v1/approvals/{id}/approve|reject`
3. Side effects applied by `backend/app/services/approval_execution_service.py`
4. Notifications emitted to requester/approvers via `backend/app/services/notification_service.py`

## Key Abstractions

**RBAC + Scope:**
- Permissions modeled as `resource:action` pairs and computed as effective permissions on login (`backend/app/core/permissions.py`, `backend/app/api/v1/endpoints/auth.py`)
- Frontend uses `PermissionGate` and `usePermissions` as a single source of truth for UI gating (`frontend/src/components/PermissionGate.tsx`, `frontend/src/hooks/usePermissions.ts`)

**Activity Log:**
- Append-only audit model with enforced immutability (`backend/app/models/activity_log.py`)
- Emitted via helper `log_activity()` (`backend/app/core/activity_logger.py`)

## Entry Points

**Backend:**
- `backend/app/main.py` (FastAPI app + middleware + router mount)
- `backend/app/api/v1/router.py` (registers all endpoint routers)

**Frontend:**
- `frontend/src/main.tsx` (bootstraps React app)
- `frontend/src/App.tsx` (routes + layout)

**Infrastructure:**
- `docker-compose.yml` for local multi-service
- `Makefile` for common flows (dev, tests, migrate)

## Error Handling

**Backend Strategy:**
- Raise `HTTPException` for controlled failures; rely on FastAPI error responses
- Some endpoints/services log and rethrow for 500s in unexpected cases

**Frontend Strategy:**
- Central `apiClient` surfaces server `detail` when available, otherwise status-based fallback (`frontend/src/services/apiClient.ts`)

## Cross-Cutting Concerns

**Logging:**
- Structured JSON logs with request correlation (`backend/app/core/logging.py`, `backend/app/middleware/logging_context.py`)

**Validation:**
- Pydantic schemas for API boundary; TypeScript types for UI boundary

**Authentication:**
- JWT auth + dev-only mock auth (guarded in debug mode)

---

*Architecture analysis: 2026-02-02*
*Update when major patterns change*

