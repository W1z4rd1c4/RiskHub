# External Integrations

**Analysis Date:** 2026-05-25

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
- Directory provider and reconciliation flows are service-layer integrations (`backend/app/services/directory_provider_service.py`, `backend/app/services/_directory_identity/`, `backend/app/services/_identity_access_lifecycle/`)
- Inbound webhooks: `/api/v1/directory/webhook` (`backend/app/api/v1/endpoints/directory.py`)
- Webhook signature verification via `WEBHOOK_SECRET` (required in production mode) (`backend/app/core/config.py`)
- Directory search/import/deprovision flows now preserve RiskHub-local access fields after initial import; break-glass enablement remains an admin-only recovery path for eligible auto-deprovisioned external users (`backend/app/services/_directory_identity/`, `backend/app/services/_identity_access_lifecycle/`, `backend/app/services/ad_deprovision_service.py`, `frontend/src/pages/users/BreakGlassEnableDialog.tsx`)

### Microsoft Entra ID (SSO)
- Backend auth modes include Entra SSO-only production mode (`backend/app/core/config.py`, `backend/app/main.py`)
- Token verification + OIDC discovery/JWKS refresh: `backend/app/services/sso_token_service.py`
- Graph directory lookup is exposed through `DirectoryProviderService` and internally split across Microsoft Graph adapter helpers (`backend/app/services/directory_provider_service.py`, `backend/app/services/_graph_directory/service.py`, `backend/app/services/_graph_directory/auth.py`, `backend/app/services/_graph_directory/transport.py`)
- Graph token-cache identity now depends on tenant/client/mode plus thumbprint or explicit `ENTRA_CREDENTIAL_FINGERPRINT`, not raw secret/private-key bytes (`backend/app/services/_graph_directory/auth.py`)
- Exchange endpoint: `POST /api/v1/auth/sso/exchange` (`backend/app/api/v1/endpoints/auth/sso.py`)
- Frontend client flow via MSAL: `frontend/src/services/entraAuth.ts`
- Frontend callback route: `/auth/sso/callback` (`frontend/src/pages/SsoCallbackPage.tsx`)

### JWT Authentication
- Backend issues HS256 JWTs (`backend/app/core/security.py`, `backend/app/api/v1/endpoints/auth/password.py`, `backend/app/api/v1/endpoints/auth/sso.py`)
- `/api/v1/auth/config` exposes auth-mode features including `strict_capabilities`; frontend config hydration stores that switch in `frontend/src/services/capabilityFlags.ts` (`backend/app/api/v1/endpoints/auth/config.py`, `frontend/src/services/authConfig.ts`)
- Frontend session state is canonicalized in `frontend/src/services/session/`; `apiClient` attaches `Authorization: Bearer` from that session snapshot and uses the API refresh policy for eligible `401` retries (`frontend/src/services/session/store.ts`, `frontend/src/services/session/coordinator.ts`, `frontend/src/services/apiClient.ts`, `frontend/src/services/api/sessionRefreshPolicy.ts`)

## Vendor Signal Integrations

### Public registry connector (optional)
- `backend/app/integrations/vendor_signals/` is currently reserved for future vendor signal connectors; no concrete public-registry connector module is tracked in the current codebase.
- Scheduler/runtime integration should only be documented here when a concrete connector module and configuration surface are reintroduced.

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
- Admin log/health endpoints exist under admin API (`backend/app/api/v1/endpoints/admin/`); reusable admin operations projections live under `backend/app/services/_admin_telemetry/`.
- In-app documentation is served from `docs/admin*` and `docs/user*` through `/api/v1/admin/docs`; frontend readers intentionally hide maintainer metadata for user manuals while preserving admin runbook references (`backend/app/api/v1/endpoints/admin/docs.py`, `frontend/src/components/documentation/documentationPresentation.ts`)
- Prometheus scraping is opt-in via `METRICS_ENABLED=true`, which exposes `/metrics` on the API runtime (`backend/app/main.py`, `backend/app/core/settings/metrics.py`, `docs/deployment/README.md`)
- OpenTelemetry OTLP HTTP trace export is disabled by default and enabled by `OTEL_EXPORTER_OTLP_ENDPOINT` plus optional `OTEL_SERVICE_NAME` (`backend/app/core/otel.py`, `backend/app/core/settings/metrics.py`, `docs/deployment/reference.md`)

## Not Present in Repository

- No direct SaaS telemetry integration (no Sentry/DataDog/New Relic modules found)
- No SMTP/email provider SDK integration found; notifications are in-app/domain level

## Configuration-Sensitive Integrations

- `MOCK_AUTH_ENABLED` + demo login only intended for debug/dev (`backend/app/main.py`, `backend/app/api/v1/endpoints/auth/demo.py`)
- Webhook verification behavior varies by debug/production guardrails (`backend/app/api/v1/endpoints/directory.py`)
- Scheduler execution controlled by `ENABLE_SCHEDULER=true` on exactly one process (`backend/app/core/scheduler.py`)
- Broad `TRUSTED_PROXIES` ranges are production-fatal unless `ALLOW_BROAD_TRUSTED_PROXIES_IN_PRODUCTION=true` is set explicitly (`backend/app/main.py`)

---

*Integration audit refreshed on 2026-05-25*
