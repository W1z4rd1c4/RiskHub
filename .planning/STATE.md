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
**Phase:** 2. Control Catalog (In Progress)
**Plan:** 02-01 complete, 02-02 next

## Session Context

### Current Objectives
1. ~~Execute Phase 1 plans~~ ✅
2. ~~Premium UI Redesign~~ ✅
3. ~~Plan Phase 2: Control Catalog~~ ✅
4. Execute Phase 2 plans (02-01 → 02-02 → 02-03)

### Recent Progress
- Phase 1 Foundation complete (4 plans)
- **02-01 Complete**: Control (13 fields), Risk (OS 18), ControlExecution, ControlRiskLink models
- Migration applied: 4 new tables with indexes

## Key Decisions

| Decision | Choice | Date |
|----------|--------|------|
| Tech Stack | React + FastAPI + PostgreSQL | 2025-12-25 |
| Auth | Azure AD via MSAL (mocked for now) | 2025-12-25 |
| Language | English first, Czech option | 2025-12-25 |
| Roles | SII compliant (9 roles) | 2025-12-25 |
| UI Style | Glassmorphism + Mesh Gradients | 2025-12-25 |

## Continuity

### Last Action
- Executed 02-01-PLAN.md: Created Control, Risk, ControlExecution, ControlRiskLink models + schemas + migration

### Next Step
- Execute 02-02-PLAN.md: API endpoints for controls and risks

---
*Updated: 2025-12-25*
