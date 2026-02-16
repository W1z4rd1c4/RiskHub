# Plan 500-08 Summary: Runbook + Deployment Docs Reconciliation

## Completed: 2026-02-16

### Scope Delivered

- Published an operator runbook for the Phase 500 install path (external PostgreSQL, Redis container, split env files).
- Updated deployment/security docs to clearly distinguish:
  - Docker Compose production (dockerized PostgreSQL), vs
  - Phase 500 install scripts (external PostgreSQL, no DB container).
- Documented bootstrap admin requirements for SSO safety and rollback posture (containers only; forward-fix DB strategy).

### Files Changed

| File | Change |
|------|--------|
| `docs/deployment/external-postgres-install-scripts.md` | NEW |
| `docs/deployment/installation-manual.md` | NEW |
| `docs/deployment/README.md` | MODIFY |
| `docs/deployment/docker-compose-prod.md` | MODIFY |
| `docs/deployment/security-checklist.md` | MODIFY |
| `.planning/ROADMAP.md` | MODIFY |
| `.planning/STATE.md` | MODIFY |

### Verification

- `rg -n "external PostgreSQL|install scripts" docs/deployment/*.md` → runbook and cross-links present
- `make verify-prod-install-scripts` → passed

### Outcome

RiskHub now has a decision-complete production deployment path for environments with externally managed PostgreSQL, with scripts + runbook + validation target aligned.
