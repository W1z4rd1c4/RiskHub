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
**Phase:** 10 Historization (Not started)
**Plan:** Ready for Phase 10 planning

## Progress Summary

| Phase | Status | Completed |
|-------|--------|-----------|
| 1-6.1 | ✅ Complete | 2025-12-26 |
| 7 User Management | ✅ Complete (7/7) | 2025-12-27 |
| 8 Permission Filtering | ✅ Complete (8/8) | 2025-12-28 |
| 9 Notification System | ✅ Complete (5/5) | 2025-12-28 |
| 10 Historization | ⏳ Not started | - |
| 11 Historical Visualization | ⏳ Not started | - |
| 12-15 Deferred | ⏸ Deferred | - |

## Session Context

### Phase 9 Accomplishments (Just Completed)
- ✅ **09-01**: Notification model with 6 types + Alembic migration
- ✅ **09-02**: NotificationService with approval event integration
- ✅ **09-03**: 4 API endpoints (list, unread count, mark read)
- ✅ **09-04**: Frontend NotificationBell + NotificationsPage
- ✅ **09-05**: APScheduler with daily KRI breach checking

### Key Decisions

| Decision | Choice | Date |
|----------|--------|------|
| Tech Stack | React + FastAPI + PostgreSQL | 2025-12-25 |
| Auth | JWT tokens (Azure AD deferred) | 2025-12-26 |
| UI Style | Glassmorphism + Mesh Gradients | 2025-12-25 |
| Approval Workflow | Delete + Edit approvals for non-privileged | 2025-12-27 |
| Scheduler | APScheduler (in-process) | 2025-12-28 |

## Open Concerns

| Concern | Severity | Location |
|---------|----------|----------|
| JWT secret hardcoded | Critical | `config.py` |
| No token refresh | Medium | Auth system |
| No rate limiting | Medium | Login endpoint |

## Continuity

### Last Action
- Completed Phase 09 Notification System (5/5 plans)

### Next Step
- Plan Phase 10: Historization Schema & API

---
*Updated: 2025-12-28*
