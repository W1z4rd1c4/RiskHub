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
**Phase:** 7 User Management & RBAC (Ready to Start)
**Plan:** Ready for 07-01: Backend schema and user models

## Session Context

### Current Objectives
1. ~~Execute Phase 1-5~~ ✅
2. ~~Execute Phase 6: Risk Appetite~~ ✅
3. ~~Execute Phase 6.1: KRI Management Tab~~ ✅
4. ~~Execute AUDIT.md fixes~~ ✅ (14/16 resolved)
5. ~~Reorganize roadmap for User Management & Workflow~~ ✅
6. Plan and Execute Phase 7: User Management & RBAC

### Recent Progress (2025-12-26)
- **Roadmap Reorganization Complete:**
  - Designed 5 new phases (7-11) for Users, Workflow, Historization
  - Moved old phases 7-10 to 12-15 (deferred)
  - Each new phase has 5 detailed implementation steps
  - User approved implementation plan
- **AUDIT.md Fixes Complete:**
  - Fixed 14/16 issues (all Critical and High severity)
  - API response format standardized ({items, total, skip, limit})
  - KRI filters for archived risks added
  - Breach filter applied before pagination
  - Migration user check moved before destructive deletes
  - Verified by 4 parallel Codex agents
- **Codebase Documentation Refreshed:**
  - Spawned 4 parallel agents to analyze codebase
  - Updated all 7 docs in .planning/codebase/
- **KRI Metadata Added:**
  - Department risks endpoint now includes kri_count and has_breach

### Roadmap Evolution
- Inserted Phase 6: Risk Appetite ✅
- Inserted Phase 6.1: KRI Management Tab ✅
- Completed ad-hoc AUDIT fixes ✅
- **Reorganized roadmap with 5 new phases (7-11)** ✅
- Next: Phase 7 User Management & RBAC

## Key Decisions

| Decision | Choice | Date |
|----------|--------|------|
| Tech Stack | React + FastAPI + PostgreSQL | 2025-12-25 |
| Auth | Azure AD via MSAL (mocked for now) | 2025-12-25 |
| UI Style | Glassmorphism + Mesh Gradients | 2025-12-25 |
| Chart Library | Recharts | 2025-12-25 |
| API Format | Paginated {items, total, skip, limit} | 2025-12-26 |

## Continuity

### Last Action
- Reorganized roadmap with 5 new phases for User Management, Workflow, and Historization
- Moved phases 7-10 to 12-15 (deferred)
- Updated ROADMAP.md and STATE.md

### Next Step
- Plan Phase 7: User Management & RBAC (07-01: Backend schema and user models)

---
*Updated: 2025-12-26*

