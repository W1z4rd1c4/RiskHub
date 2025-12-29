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
**Milestone:** v1.0 MVP
**Phase:** 100. Marketing Presentation
**Current Plan:** 100-01 (Completed)
**Next Plan:** None (Presentation Ready)

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
| 90 AD Emulator (Integrated) | ✅ Complete (10/10) | 2025-12-29 |
| 99 Data Migration & Standalone AD | ✅ Complete (7/7) | 2025-12-28 |
| 100 Marketing Presentation | ✅ Complete (1/1) | 2025-12-29 |

## Session Context

### Phase 99 Progress
- ✅ **99-01**: Migrated 83 risks from Registr_Rizik_2022.xlsx
- ✅ **99-02**: Migrated 21 controls with 62 risk links
- ✅ **99-03**: Migrated 67 KRIs with risk matching
- ⏳ **99-04**: AD Emulator standalone backend (PLANNED)
- ⏳ **99-05**: AD Emulator standalone frontend (PLANNED)
- ⏳ **99-06**: RiskHub integration with external AD Emulator (PLANNED)

### Key Decisions

| Decision | Choice | Date |
|----------|--------|------|
| Tech Stack | React + FastAPI + PostgreSQL | 2025-12-25 |
| Auth | JWT tokens (Azure AD deferred) | 2025-12-26 |
| UI Style | Glassmorphism + Mesh Gradients | 2025-12-25 |
| Approval Workflow | Delete + Edit approvals for non-privileged | 2025-12-27 |
| Scheduler | APScheduler (in-process) | 2025-12-28 |
| AD Emulator | Standalone app (port 8001/5174) | 2025-12-28 |

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
- Created phase plans 99-04, 99-05, 99-06 for AD Emulator standalone separation

### Next Step
- Execute Phase 99-04: Create AD Emulator standalone backend

---
*Updated: 2025-12-28*

