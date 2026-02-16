# Phase 500 Context: Production Installation Scripts

## Why This Phase Exists

The requested deployment target is a split-container production installation where:

1. Backend runs in its own Docker container.
2. Frontend runs in its own Docker container.
3. PostgreSQL is external and not managed as a Docker service by RiskHub install scripts.

Current production guidance is Docker Compose-centered and still documents starting a `db` container as part of deployment. Phase 500 provides a script-driven installation path aligned with externally managed PostgreSQL.

## Locked Decisions

- Interpret the request as: backend container + frontend container (the repeated "backend" in the request is treated as backend + frontend intent).
- PostgreSQL is always external for this phase execution path.
- Redis remains required by backend production guards; it may be external or separately containerized, but this phase does not permit a bundled PostgreSQL container.
- Scripts target Linux hosts with Docker Engine and Bash.
- Deployment flow is idempotent and supports upgrade/rollback operations.

## Acceptance Criteria

- Production install scripts exist for backend and frontend as independent container lifecycles.
- Migration execution is scripted against external PostgreSQL using `DATABASE_URL`.
- No deployment script in this phase starts or depends on a local PostgreSQL container.
- Preflight checks fail fast on invalid production configuration (`DEBUG=true`, weak `SECRET_KEY`, missing Redis/SSO vars, placeholder DB URL).
- Runbook documentation covers install, upgrade, rollback, health checks, and troubleshooting.

## Non-Goals

- No Kubernetes manifest authoring in this phase.
- No replacement of existing development Docker Compose workflows.
- No changes to application business logic unrelated to deployment/install automation.

## Primary Evidence Pointers

- Compose baseline includes a `db` service and backend default points to `db:5432`:
  - `/Users/stefanlesnak/Antigravity/Risk App 2/docker-compose.yml`
- Production Compose guide still instructs `up -d db redis` first:
  - `/Users/stefanlesnak/Antigravity/Risk App 2/docs/deployment/docker-compose-prod.md`
- Production hardening requires explicit `DATABASE_URL`, Redis reachability, SSO mode, and secret constraints:
  - `/Users/stefanlesnak/Antigravity/Risk App 2/backend/app/main.py`
  - `/Users/stefanlesnak/Antigravity/Risk App 2/docs/deployment/security-checklist.md`
- Frontend nginx currently proxies `/api` to `backend:8000`:
  - `/Users/stefanlesnak/Antigravity/Risk App 2/frontend/nginx.conf`
