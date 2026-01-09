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
- [x] **Phase 11: Historical Visualization** — Charts and trend analysis
- [ ] **Phase 12: Compliance Governance** — Risk Committee dashboard & Activity Logs
- [ ] **Phase 13: Issue & Remediation Management** — Findings and Action Plans (NEW)
- [ ] **Phase 14: Risk Assessments** — Campaigns and questionnaires (NEW)
- [ ] **Phase 15: Settings Page** — Read-only profile, appearance, localization, and documentation (5 plans)
- [ ] **Phase 17: Production Deployment** — Docker, Azure, AD SSO, testing, and documentation (14 plans)
- [ ] **Phase 18: Vendor Risk Management** — Third-party risk assessments (deferred)
- [ ] **Phase 19: Advanced Audit Workflows** — Audit automation (deferred)
- [ ] **Phase 70: Risk Hub** — Admin Console for system configuration, dynamic risk types, approval rules (Plans 1-7 verified)
- [ ] **Phase 71: Risk Hub Review** — Audit Risk Hub implementation for logical/technical errors and bugs
- [ ] **Phase 72: Risk Hub Resolution** — Fix Phase 71 findings across backend and frontend
- [ ] **Phase 85: Workflow & Users** — Access mapping and user management enhancements
- [ ] **Phase 90: AD Emulator** — Active Directory emulator server + user sync + change management UI
- [x] **Phase 100: Marketing Presentation** — Single HTML presentation for the board (Czech)
- [ ] **Phase 150: Audit (RiskHub-only)** — Systematic code and logic audit for RiskHub (exclude AD Emulator)
- [ ] **Phase 151: Audit Resolution** — Remediate Phase 150 audit findings across backend and frontend
- [ ] **Phase 200: Entity Naming Enforcement** — Mandatory naming for KRI, Risk, and Control entities (10 plans)

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
**Plans**: 3 plans

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
- [x] 11-01: Frontend history components (timeline, change cards, trend charts)
- [x] 11-02: Add history tabs to detail pages (risks, controls, KRIs)
- [x] 11-03: Historical comparison view (side-by-side diff between dates)
- [x] 11-04: Dashboard historical widgets (risk trends, breach history)
- [x] 11-05: Audit report generation (PDF/Excel export of audit trail)

### Phase 12: Compliance Governance
**Goal**: Implement Activity Log for system-wide change tracking and Risk Committee dashboard enhancements
**Depends on**: Phase 11
**Source**: OS 18 Gap Analysis + User Requirements
**Status**: Planning
**Plans**: 3 plans

Plans:
- [x] 12-01: Activity Log Backend (model, API, tampering protection)
- [x] 12-02: Activity Log Frontend (new tab with filters and search)
- [x] 12-03: Dashboard Risk Committee (executive summary, meeting mode)
- [x] 12-05: Backend Structured Logging (structlog, context injection)
- [x] 12-06: Audit Log Separation & Rotation (file handlers, splitting streams)
- [x] 12-07: SIEM Documentation & Verification (Option A: Forwarding guide)

### Phase 12.1: Phase 12 Review / Audit (INSERTED)
**Goal**: Review Phase 12 implementation for scope alignment, authorization gaps, data leakage risks, and operational readiness.
**Depends on**: Phase 12
**Status**: In progress
**Plans**: 10 plans

Plans:
- [x] 12.1-01: Scope & Evidence Audit
- [x] 12.1-02: Activity Log Backend Audit
- [x] 12.1-03: Activity Log Frontend Audit
- [x] 12.1-04: Risk Committee Dashboard Audit
- [x] 12.1-05: SIEM & Logging Audit
- [x] 12.1-06: Access Control Remediation (Risk Committee)
- [x] 12.1-07: Activity Log Backend Remediation
- [x] 12.1-08: Activity Log Frontend Remediation
- [x] 12.1-09: Risk Committee Metrics Remediation
- [x] 12.1-10: SIEM & Logging Remediation

### Phase 13: Issue & Remediation Management (NEW)
**Goal**: Manage findings, remediation plans, and exception tracking for failed controls or high risks.
**Depends on**: Phase 12
**Status**: Planned
**Plans**: 3 plans

Plans:
- [ ] 13-01: Findings & Issues backend (model, API, linkage to Controls/Risks)
- [ ] 13-02: Remediation Plan workflow (assignments, due dates, progress tracking)
- [ ] 13-03: Findings Dashboard & Reporting (open issues, aging analysis)

### Phase 14: Risk Assessments (NEW)
**Goal**: Launch risk assessment campaigns and surveys to business owners.
**Depends on**: Phase 13
**Status**: Planned
**Plans**: 3 plans

Plans:
- [ ] 14-01: Assessment Template Builder (questions, scoring logic)
- [ ] 14-02: Campaign Management (launch assessments, track completions)
- [ ] 14-03: Assessment Response UI & Scoring Engine

### Phase 15: Settings Page
**Goal**: Transform the static Settings page into a functional user hub with read-only profile, appearance customization, localization, and role-based documentation.
**Depends on**: Phase 7 (User Management)
**Status**: Planned
**Plans**: 5 plans

Plans:
- [x] 15-01: Tab Switching Infrastructure (useState, cn(), tab pattern)
- [x] 15-02: Profile Tab (read-only user info, role, permissions display)
- [x] 15-03: Appearance Tab (light/dark/system theme toggle with persistence)
- [x] 15-04: Localization Tab (language selector placeholder for future i18n)
- [x] 15-05: Documentation Tab (role-based help docs, placeholder content for Phase 17)

**Deferred to future phase:**
- Delegation settings (out-of-office approval routing) — see Phase 15.1

### Phase 17: Production Deployment & Enterprise Integration
**Goal**: Production-ready deployment, Azure AD/Entra SSO, comprehensive documentation, and enterprise testing
**Depends on**: Can run independently
**Status**: Planned
**Plans**: 14 plans

**Security Concerns (Penetration Test - 2026-01-08):**
> [!WARNING]
> The following issues were identified during live penetration testing and MUST be addressed before production deployment:

| Finding | Severity | Remediation |
|---------|----------|-------------|
| **Webhook allows user injection** | Critical | Set `WEBHOOK_SECRET` to a strong random value - endpoint accepts ANY signature when empty |
| **OpenAPI/Swagger publicly exposed** | Medium | Disable `/docs` and `/openapi.json` in production or require authentication |
| **Database port 5432 exposed to host** | Medium | Remove `ports: - "5432:5432"` from docker-compose; bind DB to internal Docker network only |
| **Rate limiting disabled in DEBUG mode** | Medium | Ensure `DEBUG=false` in production to enable brute-force protection |
| **Mock Auth enabled in docker-compose.yml** | Critical | Set `MOCK_AUTH_ENABLED=false` and `DEBUG=false` for any non-development deployment |
| **Demo login endpoint** | Medium | Disable `/auth/demo-login/{id}` in production (only works when DEBUG=true) |
| **Null byte in email causes 500** | Low | Add input validation to reject null bytes in string fields |
| **Excel exports formula injection** | Low | Sanitize cell values starting with `=`, `+`, `-`, `@` by prefixing with single quote |
| **Verbose Pydantic errors** | Low | Consider masking field details in production error responses |

**Verified Secure (Elite Attacks Blocked):**
- All API endpoints require valid JWT (unauthenticated access blocked)
- SQL injection attempts blocked (parameterized queries via SQLAlchemy)
- Blind SQL timing attacks blocked (queries return instantly)
- JWT forgery (`alg: none`) rejected
- JWT `kid` path traversal rejected
- JWT secret brute-force failed (not using common secrets)
- Path traversal blocked
- Security headers properly configured (CSP, X-Frame-Options, HSTS, XSS protection)
- HTTP Request Smuggling rejected ("Invalid HTTP request")
- CRLF header injection handled gracefully
- Log injection handled (newlines treated as literal strings)
- NoSQL injection blocked by Pydantic type validation
- Mass assignment with nested objects ignored
- Race conditions on approvals properly blocked
- XSS stored but safely rendered (React escapes, PDF/Excel shows raw text)
- SSRF via PDF not exploitable (URLs rendered as text)
- Privilege escalation blocked (users cannot modify own role)
- IDOR blocked (cross-department access denied)
- Error messages don't reveal user existence

Plans:
- [x] 17-00: Admin Console Robustness Fixes (Active Users Timezone Logic)
- [ ] 17-01: Docker Scaffolding (multi-stage builds, Compose, health checks)
- [ ] 17-02: Production Hardening (CORS, CSP, secrets, rate limiting)
- [ ] 17-03: Automated Security Scanning (SAST, dependency scanning, secrets detection)
- [ ] 17-04: End-to-End Regression Suite (Playwright full coverage)
- [ ] 17-05: Performance & Load Testing (Locust, benchmarks)
- [ ] 17-06: VM Deployment Scripts (systemd, nginx, install scripts)
- [ ] 17-07: Azure Deployment (Bicep templates, App Service, CI/CD)
- [ ] 17-08: Technical Deployment Documentation (IT/DevOps guides)
- [ ] 17-09: Administrator Guide (CRO/Admin configuration)
- [ ] 17-10: End-User Guide (Risk manager documentation)
- [ ] 17-11: Azure AD/Entra SSO (MSAL integration, token validation)
- [ ] 17-12: AD User Directory Lookup (Graph API, user import)
- [ ] 17-13: Session Management (refresh tokens, sliding sessions, force logout)
- [ ] 17-14: AD Deprovisioning Check (deleted user detection, auto-deactivate)

### Phase 18: Vendor Risk Management (DEFERRED)
**Goal**: Third-party risk assessments, scoring, supply chain visualization, and specialized DORA compliance tracking.
**Depends on**: Phase 17
**Status**: Deferred for future release
**Vision**:
1. **Vendor Catalog**: Registry with risk tiers (critical/high/medium/low) and schedules.
2. **Assessments**: Questionnaires, scoring, and response tracking.
3. **Supply Chain**: Dependency visualization and fourth-party risk.
4. **DORA Compliance**: Specialized, exhaustive scope for DORA-relevant vendors (ICT, Cloud).
**Plans**: 2 plans

Plans:
- [ ] 18-01: Vendor database and hierarchical tiering system
- [ ] 18-02: Assessment workflows, DORA compliance layer, and tracking

### Phase 19: Advanced Audit Workflows (DEFERRED)
**Goal**: Streamline internal audit with sampling and automated evidence collection
**Depends on**: Phase 18
**Status**: Deferred for future release
**Plans**: 2 plans

Plans:
- [ ] 19-01: Audit planning wizard and automated sampling engine
- [ ] 19-02: Evidence collection pipeline and exception triage

### Phase 71: Risk Hub Review
**Goal**: Audit Risk Hub implementation for logical/technical errors and bugs
**Depends on**: Phase 70
**Research**: None
**Plans**: 3 plans

Plans:
- [x] 71-01: Risk Hub config models and usage audit
- [x] 71-02: Risk Hub access and CRUD audit
- [x] 71-03: Risk Hub frontend audit

### Phase 72: Risk Hub Resolution
**Goal**: Implement fixes for all Phase 71 findings across backend and frontend
**Depends on**: Phase 71
**Research**: None
**Plans**: 12 plans

Plans:
- [x] 72-01: Backend risk type integration + risk count accuracy
- [x] 72-02: Global config thresholds + notification settings integration
- [x] 72-03: Cross-department Owner Access + Notification Fan-out
- [x] 72-04: Risk Hub CRUD hardening + public-config gating + tests
- [x] 72-05: Frontend alignment with Risk Hub config (risk types, thresholds, approvals)
- [x] 72-06: Granular permissions for KRI submission + execution logging (`kri:submit`, `controls:execute`)
- [ ] 72-07: Full-modality permission independence + documentation reconciliation
- [ ] 72-08: Full-modality cleanup (RBAC enforcement, migration convergence, repo hygiene)
- [x] 72-09: Backend threshold propagation cleanup (reports + approvals)
- [ ] 72-10: Public endpoints for thresholds + risk types (non-CRO)
- [ ] 72-11: Frontend public-config consumption + dynamic type display
- [ ] 72-12: Naming cleanup for approval threshold helpers (`is_critical_risk_*` semantics)

### Phase 85: Workflow & Users
**Goal**: Map current access by role and deliver enhanced user management workflows (role rights, manager visibility, department remediation).
**Depends on**: Phase 7 (User Management), Phase 8 (Permission Filtering)
**Research**: Unlikely
**Plans**: 6 plans

Plans:
- [x] 85-01: User access map (roles x tabs, backend + frontend gating)
- [x] 85-02: Backend access management model + APIs (access scope, access endpoints)
- [x] 85-03: Access management UI (permissions visibility, guarded edits)
- [x] 85-04: KRI workflow improvements (weekly reminders, CRO due-soon visibility, all-edit approvals)
- [x] 85-05: Owner-based KRI permissions (kri:submit permission, tiered approval with Risk Owner)
- [x] 85-06: Control owner edit permissions (Control Owner edits → Risk Owner approval)

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
- [x] 99-08: Risk naming improvement from descriptions

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
**Plans**: 13 plans

Plans:
- [x] 151-01: Backend department/KRI list consistency
- [x] 151-02: Dashboard metrics archived filtering + control trend errors
- [x] 151-03: Lookup auth + default role safety + approvals permission seed
- [x] 151-04: Script/timestamp hygiene fixes
- [x] 151-05: Frontend user/approvals permission gating + role defaults
- [x] 151-06: Execution enum alignment + risk list fixes
- [x] 151-07: Frontend pagination and grouped view completeness
- [x] 151-08: KRI historization corrections (calendar periods + approvals + notifications)
- [x] 151-11: Frontend access gating + scoped user pickers
- [x] 151-12: KRI value submission approval (open-period recording)
- [ ] 151-13: KRI value correction UI + overdue badges
- [x] 151-15: Robust Risk ID generation (atomic retry pattern)
- [x] 151-16: Approval Request DB-level constraints (partial unique index)
- [x] 151-17: Sensitive field detection refinement (None values + owner semantics)
- [x] 151-18: Production security guardrails & concurrency verification tests
- [ ] 151-19: Approval workflow edge cases & activity logging

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → ... → 6.1 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 90

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
| 11. Historical Visualization | 5/5 | Complete | 2025-12-31 |
| 12 Compliance Governance | 6/6 | Complete | 2026-01-04 |
| 13 Issue & Remediation | 0/3 | Planned | - |
| 14 Risk Assessments | 0/3 | Planned | - |
| 15 Settings Page | 5/5 | Complete | 2026-01-07 |
| 16 Enterprise Testing | 0/3 | Planned | - |
| 17-19. Deferred | 0/10 | Deferred | - |
| 90. AD Integration | 10/10 | Complete | 2025-12-29 |
| 99. Data Migration & Standalone AD | 8/8 | Complete | 2026-01-04 |
| 150. Audit (RiskHub-only) | 2/3 | In progress | - |
| 151. Audit Resolution | 8/11 | In progress | - |

### Phase 200: Entity Naming Enforcement
**Goal**: Enforce mandatory "Name" field for all entities (Risk, Control, KRI) and update all UI components to display it prominently.
**Depends on**: None
**Research**: None
**Plans**: 10 plans

Plans:
- [x] 200-01: Database Schema & Migration (Risk Name)
- [x] 200-02: Backend API & Logic Updates (Risk Name)
- [x] 200-03: Frontend Risk List & Table Updates
- [x] 200-04: Frontend Risk Wizard & Form Updates
- [x] 200-05: Frontend Risk Details & Linkage Components
- [x] 200-06: KRI Naming Consistency (UI/UX)
- [x] 200-07: Control Naming Consistency (UI/UX)
- [ ] 200-08: Export & Reporting Updates
- [ ] 200-09: Verification & Regression Testing
- [ ] 200-10: Final Cleanup & Documentation
