# External Integrations

**Analysis Date:** 2026-02-20

## Core External Services

### PostgreSQL
- Primary relational datastore (local dev stack via `docker-compose.yml`; production via external PostgreSQL contract)
- Async runtime access via SQLAlchemy + `asyncpg` (`backend/app/db/session.py`)
- Migration path via Alembic (`backend/alembic/`, `backend/alembic/env.py`)

### Redis
- Used for production rate limiting and account lockout (`backend/app/main.py`, `backend/app/middleware/security.py`, `backend/app/services/account_lockout_service.py`)
- Required when `DEBUG=false` (`backend/app/main.py`)

## Directory/Identity Integrations

### AD Emulator (development/test integration)
- Outbound client: `ADEmulatorClient` (`backend/app/integrations/ad_emulator_client.py`)
- Inbound webhooks: `/api/v1/directory/webhook` (`backend/app/api/v1/endpoints/directory.py`)
- Webhook signature verification via `WEBHOOK_SECRET` (required in production mode) (`backend/app/core/config.py`)

### Microsoft Entra ID (SSO)
- Backend auth modes include Entra SSO-only production mode (`backend/app/core/config.py`, `backend/app/main.py`)
- Token verification + OIDC discovery/JWKS refresh: `backend/app/services/sso_token_service.py`
- Exchange endpoint: `POST /api/v1/auth/sso/exchange` (`backend/app/api/v1/endpoints/auth/sso.py`)
- Frontend client flow via MSAL: `frontend/src/services/entraAuth.ts`
- Frontend callback route: `/auth/sso/callback` (`frontend/src/pages/SsoCallbackPage.tsx`)

### JWT Authentication
- Backend issues HS256 JWTs (`backend/app/core/security.py`, `backend/app/api/v1/endpoints/auth/password.py`, `backend/app/api/v1/endpoints/auth/sso.py`)
- Frontend stores token and attaches `Authorization: Bearer` (`frontend/src/contexts/AuthContext.tsx`, `frontend/src/services/apiClient.ts`)

## Vendor Signal Integrations

### Public registry connector (optional)
- Connector implementation: `PublicRegistryConnector` (`backend/app/integrations/vendor_signals/public_registry.py`)
- Activated when `vendor_signals_public_registry_base_url` is configured (`backend/app/core/config.py`)
- Scheduled refresh path exists in scheduler (`backend/app/core/scheduler.py`)

## Deployment/Runtime Integration Points

- Frontend nginx proxies `/api/` to `backend:8000` in container network (`frontend/nginx.conf`)
- Vite dev server proxies `/api` to local backend (`frontend/vite.config.ts`)
- Development Docker Compose defines local multi-service topology and healthchecks (`docker-compose.yml`)
- Supported production/admin deployment runs through `./scripts/deploy.sh --target docker|linux`, backed by retained `scripts/prod/*` helper scripts

## CI/Security Integrations

- E2E workflow runs Playwright against backend + Postgres service (`.github/workflows/e2e.yml`)
- Security workflow runs Bandit, pip-audit, npm audit, Trivy, Syft+Grype correlation, and gitleaks parse+scan (`.github/workflows/security.yml`)

## Observability and Logging

- Structured app and audit logs via custom logging setup (`backend/app/core/logging.py`)
- Log files written under `backend/logs/`
- Admin log/health endpoints exist under admin API (`backend/app/api/v1/endpoints/admin/`)

## Not Present in Repository

- No direct SaaS telemetry integration (no Sentry/DataDog/New Relic modules found)
- No SMTP/email provider SDK integration found; notifications are in-app/domain level

## Configuration-Sensitive Integrations

- `MOCK_AUTH_ENABLED` + demo login only intended for debug/dev (`backend/app/main.py`, `backend/app/api/v1/endpoints/auth/demo.py`)
- Webhook verification behavior varies by debug/production guardrails (`backend/app/api/v1/endpoints/directory.py`)
- Scheduler execution controlled by `ENABLE_SCHEDULER=true` on exactly one process (`backend/app/core/scheduler.py`)

---

*Integration audit refreshed on 2026-02-20*
