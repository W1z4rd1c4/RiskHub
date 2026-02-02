# Phase 18 — Verification (2026-01-26)

## Automated

- [x] Backend: `cd backend && pytest -q`
- [x] Frontend: `cd frontend && npx tsc --noEmit`
- [x] Alembic chain: `cd backend && alembic heads` → single head (`18c1d2e3f4b4`)

## Manual (recommended)

- [ ] Create a vendor → verify tabs render (Assessments / Schedule / Contract Controls / Resilience / Dependencies / Incidents / Remediation / SLA / Signals).
- [ ] Create a major incident → verify reassessment due date is set “now” and notifications deep-link to Schedule tab.
- [ ] Create an SLA + record a breached value → verify SLA badge + notifications deep-link to SLA tab.
- [ ] Open Dashboard → verify vendor card and Risk Committee vendor sections render and are department-scoped.

