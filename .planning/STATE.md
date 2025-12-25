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
**Phase:** 2.1 Risk Register (In Progress)
**Plan:** 02.1-01 complete, ready for 02.1-02

## Session Context

### Current Objectives
1. ~~Execute Phase 1 plans~~ ✅
2. ~~Premium UI Redesign~~ ✅
3. ~~Plan Phase 2: Control Catalog~~ ✅
4. ~~Execute Phase 2 plans (02-01 → 02-02 → 02-03)~~ ✅
5. Execute Phase 2.1: Risk Register UI

### Recent Progress
- Phase 1 Foundation complete (4 plans)
- **02-01 Complete**: Control, Risk, ControlExecution, ControlRiskLink models
- **02-02 Complete**: Controls & Risks API endpoints with RBAC
- **02-03 Complete**: Control Catalog UI (List, Detail, Forms)
- **02.1-01 Complete**: Risk Register UI (List, Detail, RiskScoreMatrix)

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
- Executed 02.1-01-PLAN.md: Risk Register UI with list, detail, and risk matrices

### Next Step
- Execute 02.1-02-PLAN.md: Control-Risk linking UI and Risk forms

---
*Updated: 2025-12-25*

