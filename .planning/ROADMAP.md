# Roadmap: RiskHub

## Overview

Building an enterprise risk management platform for insurance companies, starting with core infrastructure and authentication, then building the control catalog system, followed by dashboards and reporting, and finally polishing for production deployment.

## Domain Expertise

- Risk Management / GRC (Governance, Risk, Compliance)
- Enterprise Software / SaaS

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions

- [x] **Phase 1: Foundation** — Project scaffolding, auth, and database setup
- [x] **Phase 2: Control Catalog** — 13-point control structure and CRUD operations
- [x] **Phase 3: Dashboards** — Executive and department-level dashboards
- [x] **Phase 4: Reporting** — PDF/Excel exports and audit trails
- [x] **Phase 5: Automated Testing** — Backend and frontend test coverage
- [x] **Phase 6: Risk Appetite** — Key Risk Indicators with limit monitoring
- [ ] **Phase 7: User Management & RBAC** — Role-based access and department hierarchy (6/7 plans done)
- [ ] **Phase 8: Permission-Based Filtering** — Data filtering and approval workflows
- [ ] **Phase 9: Notification System** — KRI deadlines and approval notifications
- [ ] **Phase 10: Historization** — Historical tracking and audit trails
- [ ] **Phase 11: Historical Visualization** — Charts and trend analysis
- [ ] **Phase 12: Compliance Governance** — Risk Committee dashboard (deferred)
- [ ] **Phase 13: Vendor Risk Management** — Third-party risk assessments (deferred)
- [ ] **Phase 14: Advanced Audit Workflows** — Audit automation (deferred)
- [ ] **Phase 15: Polish & Deploy** — i18n, Docker, and documentation (deferred)
- [ ] **Phase 90: AD Emulator** — Active Directory emulator server + user sync + change management UI
- [x] **Phase 100: Marketing Presentation** — Single HTML presentation for the board (Czech)
- [ ] **Phase 150: Audit (RiskHub-only)** — Systematic code and logic audit for RiskHub (exclude AD Emulator)
- [ ] **Phase 151: Audit Resolution** — Remediate Phase 150 audit findings across backend and frontend

## Phase Details

### Phase 1: Foundation
**Goal**: Set up project infrastructure with role-based access (auth mocked)
**Depends on**: Nothing (first phase)
**Research**: Unlikely (established patterns)
**Plans**: 4 plans

Plans:
- [x] 01-01: React + Vite frontend scaffolding with Tailwind/shadcn
- [x] 01-02: FastAPI backend with SQLAlchemy and PostgreSQL
- [x] 01-03: Role-based access structure (SII roles, auth mocked for now)
- [x] 01-04: Premium Frontend Redesign (Hero page, glassmorphism)

### Phase 2: Control Catalog
**Goal**: Implement the 13-point control data structure with full CRUD and Risk-Control linkage
**Depends on**: Phase 1
**Research**: Unlikely (domain requirements clear from DEFINICIA KONTROL + OS 18)
**Plans**: 3 plans

Plans:
- [x] 02-01: Database schema for controls, risks, and control-risk linkage
- [x] 02-02: API endpoints for control and risk management
- [x] 02-03: Control catalog UI with forms and validation

### Phase 2.1: Risk Register
**Goal**: Build Risk Register UI with gross/net risk visualization and Control-Risk navigation
**Depends on**: Phase 2
**Research**: Unlikely (OS 18 Řízení rizik provides clear structure)
**Plans**: 2 plans

Plans:
- [x] 02.1-01: Risk Register list/detail views with risk matrix visualization
- [x] 02.1-02: Control-Risk linking UI (from control → see risks, from risk → see controls)

### Phase 3: Dashboards
**Goal**: Build executive and department-level dashboards
**Depends on**: Phase 2
**Research**: Likely (charting libraries, data aggregation patterns)
**Research topics**: React charting libraries (Recharts vs Chart.js), dashboard layout patterns
**Plans**: 2 plans

Plans:
- [x] 03-01: Dashboard backend (aggregations, metrics endpoints)
- [x] 03-02: Dashboard UI components and layouts

### Phase 3.1: Interactive Dashboards
**Goal**: Add full interactivity with filters, drill-downs, and multi-view exploration
**Depends on**: Phase 3
**Research**: Unlikely (building on existing components)
**Plans**: 1 plan

Plans:
- [x] 03.1-01: Interactive filters, clickable risk matrix, department views, category charts

### Phase 3.2: List View Enhancements
**Goal**: Improve Risks/Controls list pages with grouped views, sorting, and better pagination
**Depends on**: Phase 3.1
**Research**: Unlikely
**Plans**: 1 plan

Plans:
- [x] 03.2-01: Grouped views, column sorting, pagination with page numbers

### Phase 3.3: Department Page
**Goal**: Create dedicated department detail pages with comprehensive risk/control analytics
**Depends on**: Phase 3.2
**Research**: Unlikely (building on existing patterns)
**Plans**: 1 plan

Plans:
- [x] 03.3-01: Department list with stats, detail page with metrics and drill-downs

### Phase 4: Reporting
**Goal**: PDF/Excel exports and audit trail functionality
**Depends on**: Phase 3
**Research**: Likely (PDF generation in Python)
**Research topics**: ReportLab vs WeasyPrint, Excel generation with openpyxl
**Plans**: 2 plans

Plans:
- [x] 04-01: Report generation backend (PDF, Excel)
- [x] 04-02: Audit trail and control execution logging

### Phase 5: Automated Testing (INSERTED)
**Goal**: Establish comprehensive test coverage for backend and frontend
**Depends on**: Phase 4
**Research**: Likely (pytest-asyncio patterns, Vitest/RTL setup)
**Plans**: 2 plans

Plans:
- [x] 05-01: Backend API testing with pytest
- [x] 05-02: Frontend component/integration testing with Vitest

### Phase 6: Risk Appetite (COMPLETE)
**Goal**: Implement Key Risk Indicators (KRIs) linked to Risks with limit monitoring
**Depends on**: Phase 5
**Source**: OS 18 Gap Analysis + Register rizik - limity - Q3.xlsx
**Plans**: 3 plans
**Completed**: 2025-12-26

Plans:
- [x] 06-01: Backend (KRI schema, API, seed script)
- [x] 06-02: Frontend (KRI UI, gauges, dashboard widget)
- [x] 06-03: Data Migration (Import Registr_Rizik_2022 + Link KRIs)

### Phase 6.1: KRI Management Tab (COMPLETE)
**Goal**: Create dedicated KRI management page with full CRUD like Risks and Controls
**Depends on**: Phase 6
**Plans**: 2 plans
**Completed**: 2025-12-26

Plans:
- [x] 06.1-01: KRI list page, detail page, create/edit forms, navigation
- [x] 06.1-02: Department view integration (KRI tab and counts)

### Phase 7: User Management & RBAC (COMPLETE)
**Goal**: Implement comprehensive user management with role-based access control and department hierarchy
**Depends on**: Phase 6.1
**Research**: Unlikely (standard RBAC patterns)
**Plans**: 7 plans
**Completed**: 2025-12-27

Plans:
- [x] 07-01: Backend schema and user models (users, roles, department hierarchy)
- [x] 07-02: Backend API endpoints for user CRUD and permission checking
- [x] 07-03: Frontend user management UI (list, forms, hierarchy tree)
- [x] 07-04: Permission filtering for all endpoints (risks, controls, KRIs, dashboard)
- [x] 07-05: Seed script for sample users with different roles
- [x] 07-06: Security Fixes & Permission Hardening (Deep Check Results)
- [x] 07-07: Phase 7 Audit Remediation (API methods, password updates, auth fixes)

### Phase 8: Permission-Based Data Filtering (COMPLETE)
**Goal**: Implement data filtering based on user roles and approval workflows for sensitive operations
**Depends on**: Phase 7
**Research**: Unlikely (building on Phase 7 foundation)
**Plans**: 8 plans (expanded from original 5)
**Completed**: 2025-12-28

Plans:
- [x] 08-01: ApprovalRequest model & migration
- [x] 08-02: Approval API endpoints (create, approve, reject, cancel, count)
- [x] 08-03: Delete endpoint integration (Risk, Control, KRI)
- [x] 08-03.1: Edit approval for critical risks & sensitive fields
- [x] 08-04: Frontend Workflow UI (Approvals page, badges, pending indicators)
- [x] 08-05: Integration testing & verification
- [x] 08-06: Refinement & optimization (Pydantic V2, timezone, JSON)
- [x] 08-07: Bug fixes & edge cases

### Phase 9: Notification System (COMPLETE)
**Goal**: Implement notification system for KRI reporting deadlines and approval workflows
**Depends on**: Phase 8
**Research**: Unlikely (used APScheduler)
**Plans**: 5 plans
**Completed**: 2025-12-28

Plans:
- [x] 09-01: Notification schema and models
- [x] 09-02: Notification generation logic (approval events)
- [x] 09-03: Notification API endpoints (list, mark read, unread count)
- [x] 09-04: Frontend notification UI (bell icon, dropdown panel, page)
- [x] 09-05: Background task scheduler for KRI breach checking

### Phase 10: Historization Schema & API
**Goal**: Implement historical tracking for all changes to risks, controls, and KRIs
**Depends on**: Phase 9
**Research**: Unlikely (standard audit trail patterns)
**Plans**: 5 plans

Plans:
- [x] 10-01: KRI historization backend (KRIValueHistory model, fields, migration)
- [x] 10-02: KRI history service and API endpoints
- [x] 10-03: KRI frontend historization (types, forms, value recording, history UI)
- [x] 10-04: History tests and human verification
- [ ] 10-05: KRI value recording endpoint with breach detection

### Phase 11: Historical Visualization & Charts
**Goal**: Build UI for viewing historical data, trends, and audit trails
**Depends on**: Phase 10
**Research**: Unlikely (using existing Recharts library)
**Plans**: 5 plans

Plans:
- [ ] 11-01: Frontend history components (timeline, change cards, trend charts)
- [ ] 11-02: Add history tabs to detail pages (risks, controls, KRIs)
- [ ] 11-03: Historical comparison view (side-by-side diff between dates)
- [ ] 11-04: Dashboard historical widgets (risk trends, breach history)
- [ ] 11-05: Audit report generation (PDF/Excel export of audit trail)

### Phase 12: Compliance Governance (DEFERRED)
**Goal**: Implement Risk Committee dashboard for quarterly reviews
**Depends on**: Phase 11
**Source**: OS 18 Gap Analysis
**Status**: Deferred for future release
**Plans**: 1 plan

Plans:
- [ ] 12-01: Risk Committee Dashboard & Quarterly Review Interface

### Phase 13: Vendor Risk Management (DEFERRED)
**Goal**: Third-party risk assessments, scoring, and supply chain visualization
**Depends on**: Phase 12
**Status**: Deferred for future release
**Plans**: 2 plans

Plans:
- [ ] 13-01: Vendor database and hierarchical tiering system
- [ ] 13-02: Assessment workflows and remediation tracking

### Phase 14: Advanced Audit Workflows (DEFERRED)
**Goal**: Streamline internal audit with sampling and automated evidence collection
**Depends on**: Phase 13
**Status**: Deferred for future release
**Plans**: 2 plans

Plans:
- [ ] 14-01: Audit planning wizard and automated sampling engine
- [ ] 14-02: Evidence collection pipeline and exception triage

### Phase 15: Polish & Deploy (DEFERRED)
**Goal**: Internationalization, containerization, and documentation
**Depends on**: Phase 14
**Status**: Deferred for future release
**Plans**: 6 plans

Plans:
- [ ] 15-01: i18n Infrastructure (React & FastAPI setup)
- [ ] 15-02: UI Localization (Full EN/CZ translation & switcher)
- [ ] 15-03: Docker Scaffolding (Multi-stage builds & Compose)
- [ ] 15-04: Production Hardening (CORS, Security, Logging)
- [ ] 15-05: System Documentation (Admin & User Guides)
- [ ] 15-06: Verification & Deployment Checklist

### Phase 90: AD Integration (Real-Time Sync & Governance)
**Goal**: Implement real-time sync from AD Emulator to RiskHub via webhooks, with Governance UI for managing orphaned risks/controls
**Depends on**: Phase 99 (Data Migration & Standalone AD Emulator)
**Research**: None (building on existing webhook patterns)
**Status**: In Progress
**Plans**: 9 plans

Plans:
- [x] 90-04: Webhook Infrastructure (AD Emulator → RiskHub push notifications)
- [x] 90-05: Automatic Sync on Webhook (process webhooks, sync single users)
- [x] 90-06: Orphan Flagging Model (database model for tracking orphaned items)
- [x] 90-07: Orphaned Items API (REST endpoints for governance)
- [x] 90-08: Governance Page UI (navigation, stats cards, page layout)
- [x] 90-09: Orphan List & Resolution UI (table, filters, resolve modal)
- [x] 90-10: Testing & Polish (E2E tests, error handling, verification)
- [x] 90-11: Uncategorised Department Fallback (default dept for orphans without dept)
- [x] 90-12: AD Emulator Role Awareness (Dept Head vs Employee)
- [x] 90-13: Empty Department Cleanup (hide empty depts & move legacy items)
- [x] 90-14: Uncategorised Items Governance (auto-flag uncat items as orphans)

### Phase 99: Data Migration & AD Emulator Standalone
**Goal**: Migrate real data and separate AD Emulator into standalone application that communicates with RiskHub via HTTP API
**Depends on**: Phase 90 (AD Emulator), Phase 7 (User Management)
**Research**: None (building on existing work)
**Plans**: 6 plans

Plans:
- [x] 99-01: Risks migration from Registr_Rizik_2022.xlsx
- [x] 99-02: Controls migration from Katalog kontrol Provoz_06 2025.xlsx
- [x] 99-03: KRIs migration from Register rizik - limity - Q3.xlsx
- [x] 99-04: AD Emulator standalone backend (separate FastAPI app in /AD Emulator)
- [x] 99-05: AD Emulator standalone frontend (separate React app with premium design)
- [x] 99-06: RiskHub integration with external AD Emulator (HTTP sync)

### Phase 100: Marketing Presentation
**Goal**: Create a stunning single-file HTML presentation in Czech for the board to implement the application.
**Depends on**: All previous phases (content)
**Research**: None
**Plans**: 3 plans

Plans:
- [x] 100-01: Single-file HTML slide deck presentation (Czech)
- [x] 100-02: Enhance presentation with screenshots, architecture, and roadmap (Czech)
- [x] 100-03: PDF optimization and content expansion (Czech)


### Phase 150: Audit (RiskHub-only)
**Goal**: Systematically review RiskHub backend and frontend for bugs and logic issues (exclude AD Emulator).
**Depends on**: None
**Research**: None
**Plans**: 3 plans

Plans:
- [ ] 150-01: Backend auth/permissions audit
- [x] 150-02: Backend domain/services audit
- [x] 150-03: Frontend audit + consolidation


### Phase 151: Audit Resolution
**Goal**: Resolve Phase 150 audit findings across RiskHub backend and frontend.
**Depends on**: Phase 150
**Research**: None
**Plans**: 7 plans

Plans:
- [x] 151-01: Backend department/KRI list consistency
- [x] 151-02: Dashboard metrics archived filtering + control trend errors
- [ ] 151-03: Lookup auth + default role safety + approvals permission seed
- [ ] 151-04: Script/timestamp hygiene fixes
- [ ] 151-05: Frontend user/approvals permission gating + role defaults
- [ ] 151-06: Execution enum alignment + risk list fixes
- [ ] 151-07: Frontend pagination and grouped view completeness

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → ... → 6.1 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 90

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 4/4 | Complete | 2025-12-25 |
| 2. Control Catalog | 3/3 | Complete | 2025-12-25 |
| 2.1 Risk Register | 2/2 | Complete | 2025-12-25 |
| 3. Dashboards | 2/2 | Complete | 2025-12-25 |
| 3.1 Interactive Dashboards | 1/1 | Complete | 2025-12-25 |
| 3.2 List View Enhancements | 1/1 | Complete | 2025-12-25 |
| 3.3 Department Page | 1/1 | Complete | 2025-12-25 |
| 4. Reporting | 2/2 | Complete | 2025-12-25 |
| 5. Automated Testing | 2/2 | Complete | 2025-12-25 |
| 6. Risk Appetite | 3/3 | Complete | 2025-12-26 |
| 6.1 KRI Management | 2/2 | Complete | 2025-12-26 |
| **Ad-hoc: AUDIT Fixes** | 14/16 | Complete | 2025-12-26 |
| 7. User Management & RBAC | 7/7 | Complete | 2025-12-27 |
| 8. Permission Filtering | 8/8 | Complete | 2025-12-28 |
| 9. Notification System | 5/5 | Complete | 2025-12-28 |
| 10. Historization | 3/5 | In progress | - |
| 11. Historical Visualization | 0/5 | Not started | - |
| 12-15. Deferred | 0/10 | Deferred | - |
| 12-15. Deferred | 0/10 | Deferred | - |
| 90. AD Integration | 10/10 | Complete | 2025-12-29 |
| 99. Data Migration & Standalone AD | 7/7 | Complete | 2025-12-28 |
| 150. Audit (RiskHub-only) | 2/3 | In progress | - |
| 151. Audit Resolution | 2/7 | In progress | - |
