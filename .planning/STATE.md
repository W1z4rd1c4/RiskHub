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
**Phase:** 17 Production Deployment (In Progress - 1/15 plans)
**Current Plan:** 17-00 Admin Console Robustness (Completed)
**Next Plan:** 17-01 Docker Scaffolding

## Progress Summary

| Phase | Status | Completed |
|-------|--------|-----------|
| 1-6.1 | ✅ Complete | 2025-12-26 |
| 7 User Management | ✅ Complete (8/8) | 2025-12-29 |
| 8 Permission Filtering | ✅ Complete (8/8) | 2025-12-28 |
| 9 Notification System | ✅ Complete (5/5) | 2025-12-28 |
| 10 Historization | ⏳ In progress (4/5) | 2025-12-31 |
| 11 Historical Visualization | ✅ Complete (5/5) | 2025-12-31 |
| 12 Compliance Governance | ✅ Complete (6/6) | 2026-01-04 |
| 13 Issue & Remediation | ⏳ Planned | - |
| 14 Risk Assessments | ⏳ Planned | - |
| 15 Security Hardening | ⏳ Planned | - |
| 16 Enterprise Testing | ⏳ Planned | - |
| 17 Production Deployment | ⏳ In progress (5/14) | - |
| 85 Workflow & Users | ✅ Complete (6/6) | 2026-01-01 |
| 90 AD Emulator (Integrated) | ✅ Complete (10/10) | 2025-12-29 |
| 99 Data Migration & Standalone AD | ✅ Complete (8/8) | 2026-01-04 |
| 100 Marketing Presentation | ✅ Complete (3/3) | 2025-12-29 |
| 151 Audit Resolution | ⏳ In progress (11/18) | - |
| 152 Audit Resolution 2 | ✅ Complete (8/8) | 2026-01-10 |
| 70 Risk Hub Fixes | ✅ Complete (70-07) | 2026-01-03 |
| 71 Risk Hub Review | ✅ Complete (3/3) | 2026-01-03 |
| 72 Risk Hub Resolution | ⏳ In progress (4/5) | - |
| 200 Entity Naming Enforcement | ✅ Complete (10/10) | 2026-01-05 |
| 250 Spaghetti Simplification | ✅ Complete (10/10) | 2026-01-10 |
| 251 Spaghetti Simplification 2 | ✅ Complete (11/11) | 2026-01-10 |
| 25 User-Specific Settings | ✅ Complete (5/5) | 2026-01-11 |
| 179 E2E Test Data | ✅ Complete (6/6) | 2026-01-13 |


## Session Context

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
- ✅ **11-04**: Dashboard widgets (RiskTrendChart, KRIBreachHistoryChart)
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
- Completed Plan 154-01: Workflow Bug Sweep Discovery. Created DISCOVERY.md with 6 confirmed workflow bugs (cross-department access on control-side endpoints, KRI history, 202 response handling). Decision: `mirror-risk-side` access pattern chosen.

### Next Step
- Execute Plan 154-02: Add `is_control_owner()` bypass to control-side linking endpoints.



---
*Updated: 2026-01-13*


