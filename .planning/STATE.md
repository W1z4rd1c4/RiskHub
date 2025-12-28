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
**Phase:** 7 User Management & RBAC (In Progress)
**Plan:** 07-07 Phase 7 Audit Remediation (Not Started)

## Progress Summary

| Phase | Status | Completed |
|-------|--------|-----------|
| 1-6.1 | ✅ Complete | 2025-12-26 |
| 7 User Management | 🟡 6/7 plans | - |
| 8 Permission Filtering | ⏳ Not started | - |
| 9 Notification System | ⏳ Not started | - |
| 10 Historization | ⏳ Not started | - |
| 11 Historical Visualization | ⏳ Not started | - |
| 12-15 Deferred | ⏸ Deferred | - |

## Session Context

### Completed Plans (Phase 7)
- ✅ **07-01**: User models, password hashing, JWT tokens
- ✅ **07-02**: Auth API endpoints, permission checking
- ✅ **07-03**: Frontend auth (login page, protected routes)
- ✅ **07-04**: Permission filtering for all endpoints
- ✅ **07-05**: Seed scripts (120 users, 13 roles)
- ✅ **07-06**: Security hardening & fixes
- ⏳ **07-07**: Audit remediation (pending)

### Recent Updates (2025-12-27)
- Refreshed codebase documentation with 4 parallel agents
- Fixed phase folder numbering (12-15 for deferred phases)
- Permission filtering complete for ALL endpoints
- Frontend `usePermissions` hook implemented

### Key Decisions

| Decision | Choice | Date |
|----------|--------|------|
| Tech Stack | React + FastAPI + PostgreSQL | 2025-12-25 |
| Auth | JWT tokens (Azure AD deferred) | 2025-12-26 |
| UI Style | Glassmorphism + Mesh Gradients | 2025-12-25 |
| Chart Library | Recharts | 2025-12-25 |
| API Format | Paginated {items, total, skip, limit} | 2025-12-26 |
| Phase Order | 8→9→10→11 (filtering→notif→history→viz) | 2025-12-27 |

## Open Concerns

| Concern | Severity | Location |
|---------|----------|----------|
| JWT secret hardcoded | Critical | `config.py` |
| No token refresh | Medium | Auth system |
| No rate limiting | Medium | Login endpoint |
| N+1 queries | Low | Department aggregations |

## Continuity

### Last Action
- Fixed phase folder numbering (renamed 07→12, 08→13, 09→14, 10→15)
- Refreshed all 7 codebase documents

### Next Step
- Execute Plan 07-07: Audit Remediation (fix API methods, password updates, auth race conditions)
- Then begin Phase 8: Permission-Based Data Filtering

---
*Updated: 2025-12-27*
