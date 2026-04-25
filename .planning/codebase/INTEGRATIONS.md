# External Integrations

**Analysis Date:** 2026-04-25

## Core External Services

### PostgreSQL
- Primary relational datastore (dev stack via `docker-compose.yml` and `scripts/compose.sh`; production via external PostgreSQL contract)
- Async runtime access via SQLAlchemy + `asyncpg` (`backend/app/db/session.py`)
- Migration path via Alembic (`backend/alembic/`, `backend/alembic/env.py`)

### Redis
- Used for production rate limiting and account lockout (`backend/app/main.py`, `backend/app/middleware/rate_limit/`, `backend/app/services/account_lockout_service.py`)
- Required when `DEBUG=false` (`backend/app/main.py`)

## Directory/Identity Integrations

### AD Emulator (development/test integration)
- Outbound client: `ADEmulatorClient` (`backend/app/integrations/ad_emulator_client.py`)
- Inbound webhooks: `/api/v1/directory/webhook` (`backend/app/api/v1/endpoints/directory.py`)
- Webhook signature verification via `WEBHOOK_SECRET` (required in production mode) (`backend/app/core/config.py`)
- Directory search/import/deprovision flows now preserve RiskHub-local access fields after initial import; break-glass enablement remains an admin-only recovery path for eligible auto-deprovisioned external users (`backend/app/services/directory_identity_service.py`, `backend/app/services/ad_deprovision_service.py`, `frontend/src/pages/users/BreakGlassEnableDialog.tsx`)

### Microsoft Entra ID (SSO)
- Backend auth modes include Entra SSO-only production mode (`backend/app/core/config.py`, `backend/app/main.py`)
- Token verification + OIDC discovery/JWKS refresh: `backend/app/services/sso_token_service.py`
- Graph directory lookup is exposed through `graph_directory_service.py` and internally split across token/auth transport helpers (`backend/app/services/graph_directory_service.py`, `backend/app/services/graph_directory_auth.py`, `backend/app/services/graph_directory_transport.py`)
- Graph token-cache identity now depends on tenant/client/mode plus thumbprint or explicit `ENTRA_CREDENTIAL_FINGERPRINT`, not raw secret/private-key bytes (`backend/app/services/graph_directory_auth.py`)
- Exchange endpoint: `POST /api/v1/auth/sso/exchange` (`backend/app/api/v1/endpoints/auth/sso.py`)
- Frontend client flow via MSAL: `frontend/src/services/entraAuth.ts`
- Frontend callback route: `/auth/sso/callback` (`frontend/src/pages/SsoCallbackPage.tsx`)

### JWT Authentication
- Backend issues HS256 JWTs (`backend/app/core/security.py`, `backend/app/api/v1/endpoints/auth/password.py`, `backend/app/api/v1/endpoints/auth/sso.py`)
- Frontend session state is now canonicalized in `sessionStore`; `sessionManager` owns state transitions, `bootstrapSessionCache` is the remaining compatibility projection, and `apiClient` attaches `Authorization: Bearer` from that single snapshot (`frontend/src/services/sessionStore.ts`, `frontend/src/services/sessionManager.ts`, `frontend/src/services/bootstrapSessionCache.ts`, `frontend/src/services/apiClient.ts`)

## Vendor Signal Integrations

### Public registry connector (optional)
- Connector implementation: `PublicRegistryConnector` (`backend/app/integrations/vendor_signals/public_registry.py`)
- Activated when `vendor_signals_public_registry_base_url` is configured (`backend/app/core/config.py`)
- Scheduled refresh path exists in the scheduler facade and runtime helpers (`backend/app/core/scheduler.py`, `backend/app/core/scheduler_runtime.py`)

## Deployment/Runtime Integration Points

- Frontend nginx proxies `/api/` to `backend:8000` in container network (`frontend/nginx.conf`)
- Vite dev server proxies `/api` to local backend (`frontend/vite.config.ts`)
- Public local/demo install flow is wrapper-first through `./scripts/install.sh demo` and `./scripts/install.sh dev`; the public wrapper now delegates to `scripts/install_cli.py` and `scripts/install_lib/`, with lifecycle checks and recovery still surfaced through `./scripts/install.sh status|logs|doctor --mode demo|dev`
- Development Docker Compose defines the local multi-service topology, healthchecks, and bootstrap flow underneath `./scripts/install.sh demo` (`docker-compose.yml`, `scripts/compose.sh`)
- `./scripts/install.sh demo --reset test` now completes end to end on the Docker stack, using the backend `dbtasks` target for migrations and seed commands
- Docker-origin Playwright runs still require `FRONTEND_URL=http://localhost`, and the shared login helper is origin-aware across both the Vite and Docker nginx surfaces
- Supported production install/admin runs are wrapper-first through `./scripts/install.sh production --target docker|linux`, `./scripts/install.sh upgrade --target docker|linux`, and `./scripts/install.sh status|logs|doctor|verify --mode production --target docker|linux`, backed internally by `scripts/install_cli.py`, `scripts/install_lib/`, `./scripts/deploy.sh --target docker|linux`, and retained `scripts/prod/*` helper scripts
- Production lifecycle metadata is stored at `/etc/riskhub/runtime/install-state.json`; `scripts/install.sh` status/logs/doctor/upgrade consume that state to report release source, managed resources, and latest successful deploy/smoke information
- Production runtime treats `ALLOWED_HOSTS` as an explicit allowlist invariant; managed install flows render it from the configured public hostname, but runtime enforcement does not derive it from `CORS_ORIGINS` (`backend/app/main.py`, `docs/deployment/reference.md`)

## CI/Security Integrations

- E2E workflow runs a fast hybrid-dev Playwright lane plus a separate production-profile startup/auth/header/docs-disabled smoke lane (`.github/workflows/e2e.yml`)
- Security workflow runs Bandit, pip-audit, npm audit, Trivy, Syft+Grype correlation, and gitleaks parse+scan (`.github/workflows/security.yml`)
- Lint/docs CI now also enforces production contract doc parity through `scripts/security/validate_production_contract_docs.py` (`.github/workflows/lint.yml`)

## Observability and Logging

- Structured app and audit logs via custom logging setup (`backend/app/core/logging.py`)
- Log files written under `backend/logs/`
- Admin log/health endpoints exist under admin API (`backend/app/api/v1/endpoints/admin/`)
- In-app documentation is served from `docs/admin*` and `docs/user*` through `/api/v1/admin/docs`; frontend readers intentionally hide maintainer metadata for user manuals while preserving admin runbook references (`backend/app/api/v1/endpoints/admin/docs.py`, `frontend/src/components/documentation/documentationPresentation.ts`)

## Not Present in Repository

- No direct SaaS telemetry integration (no Sentry/DataDog/New Relic modules found)
- No SMTP/email provider SDK integration found; notifications are in-app/domain level

## Configuration-Sensitive Integrations

- `MOCK_AUTH_ENABLED` + demo login only intended for debug/dev (`backend/app/main.py`, `backend/app/api/v1/endpoints/auth/demo.py`)
- Webhook verification behavior varies by debug/production guardrails (`backend/app/api/v1/endpoints/directory.py`)
- Scheduler execution controlled by `ENABLE_SCHEDULER=true` on exactly one process (`backend/app/core/scheduler.py`)
- Broad `TRUSTED_PROXIES` ranges are production-fatal unless `ALLOW_BROAD_TRUSTED_PROXIES_IN_PRODUCTION=true` is set explicitly (`backend/app/main.py`)

---

*Integration audit refreshed on 2026-04-25*
