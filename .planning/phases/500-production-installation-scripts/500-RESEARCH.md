# Phase 500 Research: Split Containers + External PostgreSQL

## Scope Map

### Deployment Artifacts

- `docker-compose.yml`
- `docker-compose.prod.yml`
- `backend/Dockerfile`
- `frontend/Dockerfile`
- `frontend/nginx.conf`

### Production Documentation

- `docs/deployment/README.md`
- `docs/deployment/docker-compose-prod.md`
- `docs/deployment/security-checklist.md`
- `.env.example`

### Runtime Guardrails

- `backend/app/main.py`
- `backend/tests/test_production_hardening.py`

## Findings Summary

1. Current production path is compose-first and still includes an in-stack `db` service.
2. Application runtime already supports external PostgreSQL through `DATABASE_URL`; no code-level hard dependency on local DB container was found.
3. Production guardrails are strict and must be preserved by install scripts:
   - `DEBUG=false`
   - `AUTH_MODE=microsoft_sso`
   - `MOCK_AUTH_ENABLED=false`
   - `SECRET_KEY` minimum length
   - explicit non-placeholder `DATABASE_URL`
   - reachable `REDIS_URL`
4. Frontend proxy currently assumes backend DNS name `backend:8000`; split install scripts need a stable upstream contract (container name/network alias or templated upstream).
5. Existing docs are not yet explicit about a script-driven split-container path where PostgreSQL is external.

## Risks and Mitigations

- Risk: Scripts drift from production guardrails enforced by backend startup.
  - Mitigation: Preflight validation mirrors guard conditions from `backend/app/main.py`.
- Risk: Frontend cannot reach backend due to rigid proxy target.
  - Mitigation: Template backend upstream and validate with smoke checks.
- Risk: Operational gaps (no rollback/status/log commands) make incidents harder.
  - Mitigation: Add lifecycle scripts with deterministic container naming/tagging.

## Recommended Plan Decomposition

- Wave 1: define environment/deployment contract for split containers with external PostgreSQL.
- Wave 2: build shared script framework and host preflight checks.
- Wave 3: implement backend + frontend install scripts.
- Wave 4: add lifecycle orchestration and security hardening.
- Wave 5: add verification automation and regression checks.
- Wave 6: reconcile deployment/security docs and finalize runbook.

## Open Decisions (to confirm during execution)

- Whether Redis is external-only or may be installed as a separate optional container script.
- Preferred backend upstream strategy for frontend proxy:
  - fixed Docker network alias (`backend`), or
  - configurable runtime value (`BACKEND_UPSTREAM`).
