# Project State: RiskHub

## Project Summary

**Building:** Enterprise risk management platform for insurance companies with control catalogs, dashboards, and AD integration.

**Core requirements:**

- Control catalog with 13-point data structure
- Role-based access via Active Directory/Entra ID
- Real-time dashboards for executives and departments

**Constraints:**

- React + Python FastAPI stack
- On-premise deployment (Docker/K8s)
- English default with Czech language option

## Current Position

**Milestone:** v1.0 MVP
**Active Phases:** Multiple in progress (see Progress Summary)
**Documentation Status:** Reconciled with phase folders (2026-01-24)

## Progress Summary

| Phase | Status | Completed |
|-------|--------|-----------|
| 1-5 Foundation/Catalog/Dashboards | ✅ Complete | 2025-12-25 |
| 6-6.1 Risk Appetite & KRI | ✅ Complete (3/3) | - |
| 7 User Management | ✅ Complete (17/17) | - |
| 8 Permission Filtering | ✅ Complete (8/8) | 2025-12-28 |
| 9 Notification System | ✅ Complete (7/7) | 2025-12-28 |
| 10 Historization | ⏳ In progress (4/5) | - |
| 11 Historical Visualization | ⏳ In progress (4/5) | - |
| 12 Compliance Governance | ✅ Complete (7/7) | 2026-01-04 |
| 12.1 Compliance Review | ✅ Complete (10/10) | 2026-01-04 |
| 14 Risk Assessments | ✅ Complete (7/7) | 2026-01-24 |
| 15 Settings Page | ✅ Complete (5/5) | 2026-01-07 |
| 16 Risk Assessment Polish | ✅ Complete (3/3) | 2026-01-24 |
| 17 Production Deploy | ⏳ In progress (8/15) | - |
| 18 Vendor Risk Management | ✅ Complete (12/12) | 2026-01-26 |
| 20 Czech Localization | ✅ Complete (16/12) | - |
| 25 User Settings | ✅ Complete (5/5) | 2026-01-11 |
| 70 Risk Hub | ⏳ In progress (8/12) | - |
| 71 Risk Hub Review | ✅ Complete (3/3) | 2026-01-03 |
| 72 Risk Hub Resolution | ✅ Complete (12/12) | 2026-01-05 |
| 85 Workflow & Users | ✅ Complete (6/6) | 2026-01-01 |
| 90 AD Emulator | ⏳ In progress (2/3) | - |
| 90 AD Integration | ⏳ In progress (11/12) | - |
| 99 Data Migration | ✅ Complete (8/8) | 2026-01-04 |
| 100 Marketing | ✅ Complete (3/3) | 2025-12-29 |
| 150 Audit | ⏳ In progress (8/11) | - |
| 151 Audit Resolution | ✅ Complete (19/19) | 2026-01-10 |
| 152 Audit Resolution 2 | ✅ Complete (8/8) | 2026-01-10 |
| 153 Audit Resolution 3 | ✅ Complete (12/12) | 2026-01-10 |
| 154 Workflow Bug Sweep | ✅ Complete (5/5) | 2026-01-14 |
| 156 Audit | ⏳ In progress (1/8) | - |
| 157 Business Logic Compliance | ✅ Complete (6/6) | 2026-01-22 |
| 158 Audit | ✅ Complete (10/10) | 2026-01-19 |
| 159 Audit Fixes | ✅ Complete (10/10) | 2026-01-23 |
| 179 E2E Test Data | ⏳ In progress (16/17) | - |
| 180 E2E Business Logic | ⏳ In progress (14/15) | - |
| 200 Entity Naming | ⏳ In progress (9/10) | - |
| 201 Archived Visibility + Restore | ⏳ In progress (4/5) | - |
| 250 Spaghetti Simplification | ✅ Complete (10/10) | 2026-01-10 |
| 251 Spaghetti Simplification 2 | ✅ Complete (11/11) | 2026-01-10 |

## Session Context

### Planning Hygiene (2026-02-02)

- Backfilled missing summaries for executed plans: `02-03`, `2.2`, `03.1-01`, `06-02`, `07-07`, `07-10`, `07-11`, `07-12`.
- Reconciled `.planning/ROADMAP.md` and `.planning/STATE.md` to reflect these as complete.

### Phase 17 Progress

- ✅ **17-04**: E2E Regression Suite (Playwright, full coverage)
- ✅ **17-05**: Performance & Load Testing
  - Verified system performance for 30 users (5 concurrent sessions)
  - All API endpoints meet targets (<500ms dashboard, <200ms CRUD)
  - No slow queries (>100ms) detected under load
  - Created `docs/PERFORMANCE_BASELINE.md`

### Phase 11 Progress

- ✅ **11-01**: History components (HistoryTimeline, HistoryTrendChart, HistoryChangeCard)
- ✅ **11-02**: KRI detail page integration with history visualization
- ✅ **11-03**: HistoryComparisonPanel for side-by-side KRI value comparison
- ⏳ **11-04**: Dashboard widgets (RiskTrendChart, KRIBreachHistoryChart)
- ✅ **11-05**: Audit trail PDF/Excel exports with RBAC + filters

### Recent Enhancements (2025-12-31)

- **Linked Risk Card Redesign**: Expanded KRI detail page risk card to full-width with process, description, department, and owner details
- **Department Breaching KRI Badge**: Added amber "BREACHED" count badge to department cards for KRIs outside limits
- **Audit Trail Exports**: PDF/Excel downloads from Audit Trail page with result filtering

### Phase 85 Progress

- ✅ **85-01**: User access map (roles x tabs, backend + frontend gating)
- ✅ **85-02**: Backend access management model + APIs (access scope, access endpoints)
- ✅ **85-03**: Frontend access management UI (types, API client, PermissionMatrix, AccessEditModal, UsersPage upgrade)
- ✅ **85-04**: KRI workflow improvements (weekly reminders, CRO due-soon visibility, all-edit approvals)
- ✅ **85-05**: Owner-based KRI permissions (tiered approval with Risk Owner)
- ✅ **85-06**: Control owner edit permissions (Control Owner edits → Risk Owner approval)

### Phase 12 Progress

- ✅ **12-01**: Activity Log Backend (model, API, tampering protection)
- ✅ **12-02**: Activity Log Frontend (new tab with filters and search)
- ✅ **12-03**: Dashboard Risk Committee (executive summary, meeting mode)
- ✅ **12-05**: Backend Structured Logging
  - Configured structlog with JSON rendering for SIEM compatibility
  - Created LoggingContextMiddleware for request_id/user_id/client_ip injection
  - Added audit event emission to ActivityLog for double-write pattern
  - Implemented /admin/logs/recent endpoint for Admin Console
- ✅ **12-06**: Audit Log Separation & Rotation
  - Implemented dual file handlers (app vs audit) with strict filtering
  - Added admin-configurable log rotation settings (size/count) via Risk Hub
  - Created /admin/logs/audit and /admin/logs/config endpoints

### Phase 12.1 Progress

- ✅ **12.1-06**: Risk Committee access control remediation (dept head access scoped; admin console-only)
- ✅ **12.1-07**: Activity Log backend remediation (schema contract, diffs, governance logging, integrity, tests)
- ✅ **12.1-08**: Activity Log frontend remediation (permission gating, admin-console-only, view modes, diff rendering, tests)
- ✅ **12.1-09**: Risk Committee metrics remediation (quarter boundaries, historical snapshots, frontend hardening)
- ✅ **12.1-10**: SIEM & Logging remediation (admin endpoints, middleware fix, rotation config, verification tooling)

### Phase 72 Progress

- ✅ **72-01**: Backend risk type integration + risk count accuracy
- ✅ **72-02**: Global config thresholds + notification settings integration
- ✅ **72-03**: Cross-department Owner Access + Notification Fan-out
- ✅ **72-04**: Risk Hub CRUD hardening + public-config gating
- ✅ **72-05**: Frontend alignment with Risk Hub config (risk types, thresholds, approvals)
- ✅ **72-06**: Granular permissions for KRI submission + execution logging (`kri:submit`, `controls:execute`)
- ⏳ **72-07**: Full-modality permission independence + documentation reconciliation
- ⏳ **72-08**: Full-modality cleanup (RBAC enforcement, migration convergence, repo hygiene)
- ✅ **72-09**: Backend threshold propagation cleanup (reports + approvals)
- ✅ **72-10**: Public endpoints for thresholds + risk types (non-CRO)
- ✅ **72-11**: Frontend public-config consumption + dynamic type display
- ✅ **72-12**: Naming cleanup for approval threshold helpers (`is_critical_risk_*` semantics)

### Phase 99 Progress

- ✅ **99-01**: Migrated 83 risks from placeholder-risk-register.xlsx
- ✅ **99-02**: Migrated 21 controls with 62 risk links
- ✅ **99-03**: Migrated 67 KRIs with risk matching
- ✅ **99-04**: AD Emulator standalone backend (Done)
- ✅ **99-05**: AD Emulator standalone frontend (Done)
- ✅ **99-06**: RiskHub integration with external AD Emulator (Done)
- ✅ **99-08**: Risk naming improvement from descriptions (Done)

### Key Decisions

| Decision | Choice | Date |
|----------|--------|------|
| Tech Stack | React + FastAPI + PostgreSQL | 2025-12-25 |
| Auth | JWT tokens (Azure AD deferred) | 2025-12-26 |
| UI Style | Glassmorphism + Mesh Gradients | 2025-12-25 |
| Approval Workflow | Delete + Edit approvals for non-privileged | 2025-12-27 |
| Scheduler | APScheduler (in-process) | 2025-12-28 |
| AD Emulator | Standalone app (port 8001/5174) | 2025-12-28 |
| Privileged Model | Access scope enum (global/department/manager) | 2025-12-31 |
| KRI Reporting Periods | Calendar-aligned periods (daily/weekly/monthly/quarterly/annual) | 2025-12-31 |
| Activity Log Search | Default-window ILIKE with changes search (90-day default) | 2026-01-04 |
| Activity Log Logging | Write in same transaction as business change (fail if logging fails) | 2026-01-04 |
| Admin Activity Log Access | Admin console-only (explicitly blocked from activity_log:read) | 2026-01-04 |
| Activity Log View Modes | Implemented (Chronological, By Person, By Department, By Risk) | 2026-01-04 |
| Quarterly Metric Semantics | Historical snapshots (Option C) for truthful QoQ comparisons | 2026-01-04 |

## Open Concerns

| Concern | Severity | Location |
|---------|----------|----------|
| JWT secret hardcoded | Critical | `config.py` |
| No token refresh | Medium | Auth system |
| No rate limiting | Medium | Login endpoint |

## Accumulated Context

### Roadmap Evolution

- Phase 90 (Integrated AD) superseded by Phase 99
- AD Emulator will be standalone app communicating with RiskHub via HTTP
- RiskHub will fetch directory users from AD Emulator, not store internally

### AD Emulator Architecture

- **AD Emulator Backend**: Port 8001, FastAPI, separate PostgreSQL database
- **AD Emulator Frontend**: Port 5174, React/Vite, purple/violet branding
- **RiskHub Integration**: HTTP client to fetch from AD Emulator, sync to local users

## Continuity

### Last Action

- Executed Phase 179 extension plans 179-12..179-16: hardened prerequisites, added deterministic vendor/vendor-SLA/archive matrix seeding, and validated end-to-end seeding via `venv/bin/python -m scripts.seed_e2e_all` (2026-02-07).
- Executed Phase 180 extension plans 180-10..180-14 and implemented 180-15 setup/docs reconciliation: introduced deterministic fixture constants, refactored skip-heavy suites to deterministic selectors, added vendor/vendor-SLA archive coverage, and integrated global setup preflight checks for seeded fixture availability (2026-02-07).
- Executed 180-16 stabilization follow-up for `kri-owner-access`: refactored to deterministic fixture-driven navigation/assertions and removed brittle shell-content checks. Focused and stress runs passed (`6/6`, `30/30`), while broader/full verification exposed additional unrelated parallel flakes in other specs (2026-02-09).
- Executed next blocker fix (item 1) for `cross-department/control-owner-access`: patched `ControlsPage` search locator for localized UI (`Hledat`) and added visible-wait before fill; target spec now passes (`4/4`) and the prior timeout is removed from blockers (2026-02-09).

### Next Step

- Stabilize remaining non-`kri-owner-access` parallel flakes in `controls.spec.ts`, `permissions/kris-crud.spec.ts`, and `risks.spec.ts`; rerun `make test-e2e` and close 180-15 once full-suite verification is clean.

---

*Updated: 2026-02-09*
