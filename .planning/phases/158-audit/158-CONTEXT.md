---
phase: 158-audit
type: context
---

# Phase 158: Audit — Context

This phase converts the latest full-app audit findings into 10 independent, developer-executable plans.

## Scope

- Frontend (`frontend/`), backend (`backend/`), database migrations (`backend/alembic/`), and deployment/config (`docker-compose*.yml`, `frontend/nginx.conf`).
- Focus: bugs, logical errors, inconsistencies, and security/operational issues.
- Output: `158-01-PLAN.md` … `158-10-PLAN.md` (each safe to execute independently).

## Key Findings (condensed)

**Critical correctness / stability**
- `UTC` referenced before import in `ApprovalRequest` model → can crash `import app.models` and Alembic env import.
- DB enforcement for “one pending approval per resource/action” is broken: an upgrade migration drops `ux_approval_pending` and doesn’t recreate it.
- Risk ID code auto-generation breaks past 99 due to lexicographic sorting + fixed limit scan.
- Approval-applied edits don’t recompute derived fields (Risk scores) and don’t set audit fields (Control updated_by_id).
- Frontend report downloads break when `VITE_API_URL` is unset (`undefined/...` fetch URLs).

**High severity drift / security**
- Risk thresholds are inconsistent across backend endpoints, reports, seeded config, and frontend filters.
- Control frequency `continuous` exists in schema/UI but not in backend enum used by dashboards → silent omissions.
- Webhook signature verification is skipped if secret is empty; production compose allows empty secret.
- Rate limiting trusts `X-Forwarded-For` blindly and stores unbounded in-memory state.
- Scheduler starts in every worker process → duplicate scheduled jobs.
- CSP too permissive (`unsafe-eval`, wide `connect-src`).

**Medium severity UX / maintainability**
- Users page “fallback” path fabricates timestamps/access_scope and may surface actions that will always 403.
- Tailwind dynamic class interpolation in LoginPage likely purged in production builds.
- Frontend networking conventions drift (`authApi` and `reportApi` bypass shared `apiClient` behavior).

## Diff → Risk Map (issue to fix-plan mapping)

Each item maps to exactly one plan (or one primary plan if the fix touches multiple sub-areas).

| Issue | Severity | Primary location(s) | Fix plan |
|------|----------|----------------------|----------|
| `UTC` referenced before import in ApprovalRequest model (import crash) | Critical | `backend/app/models/approval_request.py` | `158-01-PLAN.md` |
| Alembic migrations fragile due to importing `app.models` (amplifies import crash impact) | Critical | `backend/alembic/env.py`, `backend/app/models/__init__.py` | `158-01-PLAN.md` |
| DB pending-approval uniqueness missing (index dropped in upgrade) | Critical | `backend/alembic/versions/6df2bb0adaa3_add_user_preferences_columns.py` | `158-03-PLAN.md` |
| approval_status enum drift (`pending_privileged` vs `PENDING_PRIVILEGED`) + partial index predicate mismatch | High/Critical | `backend/alembic/versions/a9b8c7...`, `backend/alembic/versions/j4k5...`, `backend/alembic/versions/h2i3j4...` | `158-03-PLAN.md` |
| Risk ID generator duplicates past 99 | Critical | `backend/app/api/v1/endpoints/risks.py` | `158-04-PLAN.md` |
| Approval-applied EDIT doesn’t recompute Risk scores / set Control audit fields | Critical | `backend/app/services/approval_execution_service.py` | `158-02-PLAN.md` |
| Report downloads break when `VITE_API_URL` is unset | Critical | `frontend/src/services/reportApi.ts` | `158-07-PLAN.md` |
| Risk thresholds inconsistent across backend + frontend + seed values | High | `backend/app/api/v1/endpoints/dashboard.py`, `backend/app/api/v1/endpoints/departments.py`, `backend/app/api/v1/endpoints/reports.py`, `backend/app/models/global_config.py`, `frontend/src/pages/RisksPage.tsx` | `158-05-PLAN.md` |
| ControlFrequency mismatch: `continuous` missing from backend enum | High | `backend/app/models/control.py`, `backend/app/schemas/control.py` | `158-06-PLAN.md` |
| Webhook signature verification skips when secret is empty (prod can be insecure) | High | `backend/app/api/v1/endpoints/directory.py`, `docker-compose.prod.yml` | `158-10-PLAN.md` |
| Rate limiting: spoofable IP + unbounded memory growth | High | `backend/app/middleware/security.py` | `158-10-PLAN.md` |
| Scheduler runs in every worker (duplicate jobs) | High | `backend/app/core/scheduler.py`, `backend/app/main.py` | `158-10-PLAN.md` |
| CSP too permissive | High | `backend/app/middleware/security.py`, `frontend/nginx.conf` | `158-10-PLAN.md` |
| UsersPage fallback fabricates data / exposes broken actions | Medium | `frontend/src/pages/UsersPage.tsx` | `158-08-PLAN.md` |
| Tailwind dynamic classes likely purged in prod build | Medium | `frontend/src/pages/LoginPage.tsx`, `frontend/tailwind.config.js` | `158-09-PLAN.md` |
| Frontend networking conventions drift (authApi/reportApi not aligned with apiClient) | Medium | `frontend/src/services/authApi.ts`, `frontend/src/services/reportApi.ts`, `frontend/src/services/apiClient.ts` | `158-07-PLAN.md` |

## Notes on independence

- Each plan includes its own preflight checks and avoids relying on other plans having run.
- Where fixes are “shared prerequisites” (e.g., Alembic import health), the relevant plan includes its own guardrail (or repeats the minimal fix instructions).
