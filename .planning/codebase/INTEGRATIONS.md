# External Integrations

**Analysis Date:** 2026-02-02

## APIs & External Services

**Directory / Identity (Dev/Test):**
- AD Emulator — directory sync testing
  - Client: `httpx.AsyncClient` (`backend/app/integrations/ad_emulator_client.py`)
  - Config: `AD_EMULATOR_URL` (`backend/app/core/config.py`, `.env.example`)
  - Webhook verification: HMAC signature via `WEBHOOK_SECRET` (`backend/app/api/v1/endpoints/directory.py`)

**Vendor Signals (Optional):**
- Public Registry connector — fetches company profile by `registration_id`
  - Client: `httpx.AsyncClient` (`backend/app/integrations/vendor_signals/public_registry.py`)
  - Config: `VENDOR_SIGNALS_PUBLIC_REGISTRY_BASE_URL` / `vendor_signals_public_registry_base_url` (`backend/app/core/config.py`)

## Data Storage

**Databases:**
- PostgreSQL 16 — primary datastore
  - Connection: `DATABASE_URL` (async SQLAlchemy URL)
  - Driver: `asyncpg` at runtime; Alembic swaps to `psycopg2` in `backend/alembic/env.py`
  - Migrations: `backend/alembic/versions/`

**File Storage:**
- None (reports are generated on-demand and streamed/downloaded)

**Caching:**
- None (no Redis; caching is primarily at the frontend query layer)

## Authentication & Identity

**Auth Provider:**
- Custom JWT auth (HS256) issued by backend
  - Token stored in `localStorage` on frontend (`frontend/src/contexts/AuthContext.tsx`)
  - API auth header added in `frontend/src/services/apiClient.ts`

**Mock Auth (Dev-only):**
- `MOCK_AUTH_ENABLED=true` allows `X-Mock-User-Id` bypass (guarded to debug mode) (`backend/app/main.py`, `.env.example`)
- Demo login endpoint for UI testing: `POST /api/v1/auth/demo-login/{user_id}` (`backend/app/api/v1/endpoints/auth.py`, `frontend/src/pages/LoginPage.tsx`)

## Monitoring & Observability

**Logs:**
- Structured app logs and audit logs written to `backend/logs/` (rotated; configurable via Risk Hub settings)

**Error Tracking / Analytics:**
- No external vendor (Sentry/etc.) visible in repo; relies on logs and in-app audit trail.

## CI/CD & Deployment

**Hosting:**
- Docker Compose is the primary packaging target (`docker-compose.yml`, `docker-compose.prod.yml`)
  - Frontend served by nginx container
  - Backend served by uvicorn container
  - Postgres as separate container/volume

**CI Pipeline:**
- GitHub Actions directory exists (`.github/`) but mapping is repo-dependent; verify workflows there if needed.

## Environment Configuration

**Development:**
- Backend: `DEBUG=true`, `MOCK_AUTH_ENABLED=true`, `SECRET_KEY=dev-*`, `DATABASE_URL=postgresql+asyncpg://...` (`backend/.env.example`)
- Frontend: `VITE_API_URL=http://localhost:8000/api/v1` or `/api/v1` when using nginx proxy (`frontend/.env.example`)

**Production:**
- Enforce `DEBUG=false` and `MOCK_AUTH_ENABLED=false` (`.env.example`)
- Provide `WEBHOOK_SECRET` if directory webhooks are enabled

## Webhooks & Callbacks

**Incoming:**
- Directory webhook endpoint (signature verification) in `backend/app/api/v1/endpoints/directory.py`

**Outgoing:**
- None observed beyond AD emulator pulls and optional vendor signal fetches.

---

*Integration audit: 2026-02-02*
*Update when adding/removing external services*

