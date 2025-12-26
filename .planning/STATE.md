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
**Phase:** 7 User Management & RBAC (Complete!)
**Plan:** All 5 plans complete, Ready for Phase 8

## Session Context

### Current Objectives
1. ~~Execute Phase 1-5~~ ✅
2. ~~Execute Phase 6: Risk Appetite~~ ✅
3. ~~Execute Phase 6.1: KRI Management Tab~~ ✅
4. ~~Execute AUDIT.md fixes~~ ✅ (14/16 resolved)
5. ~~Reorganize roadmap for User Management & Workflow~~ ✅
6. Plan and Execute Phase 7: User Management & RBAC

### Recent Progress (2025-12-26)
- **Phase 7 Complete!**
- **Plan 07-05 Complete:**
  - Created seed script for roles and permissions (13 roles, 12 permissions)
  - Created seed script for 120 test users with realistic structure
  - Implemented 3 demo accounts (CRO, COO, Employee)
  - Established hierarchical relationships (CEO → Dept Heads → Employees)
  - Master seed script to run all seeds in order
- **Plan 07-04 Core Complete:**
  - Updated risks endpoint with permission filtering using get_user_department_ids()
  - Updated controls endpoint with same permission filtering pattern
  - Established reference implementation for all remaining endpoints
  - Backend permission filtering working for risks and controls
- **Plan 07-03 Complete:**
  - Created auth API service for JWT-based authentication
  - Updated AuthContext to use JWT tokens instead of mock user ID
  - Created login page with glassmorphism design
  - Added protected routes with authentication checks
  - Updated Header with user info and logout button
- **Plan 07-02 Complete:**
  - Created permission checking utilities (privileged users, department access)
  - Implemented JWT dependency injection for token validation
  - Created authentication endpoints (login, logout, /me)
  - Implemented user management CRUD APIs with permission checks
  - Registered auth router at /auth prefix
- **Plan 07-01 Complete:**
  - Added hashed_password and manager_id to User model
  - Created RoleType enum with insurance company roles
  - Implemented password hashing (bcrypt) and JWT tokens
  - Created Pydantic schemas for user CRUD and authentication
  - Created Alembic migration for auth fields
  - Added python-jose and passlib dependencies
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
- Completed Plan 07-05: Test Data Generation (120 Users)
- Created seed scripts for roles, permissions, and users
- Phase 7: User Management & RBAC is now COMPLETE!

### Next Step
- Begin Phase 8: Permission-Based Data Filtering
- Or run seed scripts and test authentication flow

---
*Updated: 2025-12-26*

