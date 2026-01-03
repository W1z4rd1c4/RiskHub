# System Architecture

## High-Level Design
RiskHub is a React SPA that talks to a FastAPI REST API backed by PostgreSQL. A separate AD Emulator service (FastAPI + React) simulates an external directory for sync testing.

### RiskHub Frontend
- Single-page app with React Router routes in `frontend/src/App.tsx`.
- Auth state and permission checks via React contexts.
- API access through a shared `apiClient` wrapper that attaches Bearer tokens.

### RiskHub Backend
- FastAPI app with versioned routers under `backend/app/api/v1`.
- Async SQLAlchemy for DB access; models/schemas/services separated by layer.
- Background scheduler (APScheduler) for periodic KRI deadline checks.
- Report export service generates PDF/Excel for controls, risks, audit trail.

### AD Emulator
- Standalone FastAPI API with its own Postgres database.
- Simple React UI for directory browsing/testing.
- RiskHub integrates via HTTP client to sync directory users.

## Data Flow
1. User interacts with SPA -> `apiClient` sends HTTP requests with JWT.
2. FastAPI validates via Pydantic schemas and `Depends` auth/permission checks.
3. Service layer performs business logic and DB writes via async sessions.
4. Responses serialized to JSON for the SPA.
5. Scheduler jobs run in-process to create notifications.
6. Directory sync calls AD Emulator API and applies diffs to local users/departments.

## Design Patterns
- FastAPI dependency injection (`Depends`) for auth, permissions, and DB sessions.
- Layered organization: endpoints -> services -> models/schemas.
- React contexts for auth + dashboard filter state.
- Domain-oriented component folders for dashboard, controls, risks, governance, history.
