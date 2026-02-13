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

- [x] **Phase 1: Foundation** — Project scaffolding, auth, and database setup (4/4)
- [x] **Phase 2: Control Catalog** — 13-point control structure and CRUD operations (3/3)
- [x] **Phase 2.1: Risk Register** — Risk Register UI with visualization (2/2)
- [x] **Phase 2.2: Risk Status Enhancement** — Risk status improvements (1/1)
- [x] **Phase 3: Dashboards** — Executive and department-level dashboards (2/2)
- [x] **Phase 3.1: Interactive Dashboards** — Filters, drill-downs, exploration (1/1)
- [x] **Phase 3.2: List View Enhancements** — Grouped views, sorting, pagination (1/1)
- [x] **Phase 3.3: Department Page** — Department detail pages (1/1)
- [x] **Phase 4: Reporting** — Unified exports (Excel/CSV), as-of snapshots, and audit trails (6/6)
- [x] **Phase 5: Automated Testing** — Backend and frontend test coverage (2/2)
- [x] **Phase 6: Risk Appetite** — Key Risk Indicators with limit monitoring (2/2)
- [x] **Phase 6.1: KRI Management Tab** — KRI management page (1/1)
- [x] **Phase 7: User Management & RBAC** — Role-based access and department hierarchy (17/17)
- [x] **Phase 8: Permission-Based Filtering** — Data filtering and approval workflows (8/8)
- [x] **Phase 9: Notification System** — KRI deadlines and approval notifications (7/7)
- [x] **Phase 10: Historization** — Historical tracking and audit trails (5/5)
- [x] **Phase 11: Historical Visualization** — Charts and trend analysis (5/5)
- [x] **Phase 12: Compliance Governance** — Risk Committee dashboard & Activity Logs (7/7)
- [x] **Phase 12.1: Compliance Governance Review** — Phase 12 audit (10/10)
- [x] **Phase 13: Issue & Remediation Management** — Findings and Action Plans (8/8)
- [x] **Phase 14: Risk Assessments** — Campaigns and questionnaires (7/7)
- [x] **Phase 15: Settings Page** — Read-only profile, appearance, localization (5/5)
- [x] **Phase 16: Risk Assessment Polish** — Review, reminders, reporting (3/3)
- [ ] **Phase 17: Production Deployment** — Docker, Azure, AD SSO, testing (8/15)
- [x] **Phase 18: Vendor Risk Management** — Third-party risk assessments (12/12)
- [ ] **Phase 19: Polish & Deploy** — Advanced audit workflows (0/6)
- [x] **Phase 20: Czech Localization** — Full i18n infrastructure (16/12 — overdelivered)
- [x] **Phase 25: User-Specific Settings** — Theme/language persistence (5/5)
- [ ] **Phase 26: Dark Mode Polish** — Dark mode refinements (0/1)
- [ ] **Phase 70: Risk Hub** — Admin Console for system configuration (8/12)
- [x] **Phase 71: Risk Hub Review** — Audit Risk Hub implementation (3/3)
- [x] **Phase 72: Risk Hub Resolution** — Fix Phase 71 findings (12/12)
- [ ] **Phase 73: Approval Permission Fix** — Approval permissions (0/6)
- [x] **Phase 85: Workflow & Users** — Access mapping and user management (6/6)
- [ ] **Phase 90: AD Emulator** — Standalone AD emulator (2/3)
- [ ] **Phase 90: AD Integration** — AD sync with RiskHub (11/12)
- [x] **Phase 99: Data Migration** — Data migration & standalone AD (8/8)
- [x] **Phase 100: Marketing Presentation** — Single HTML presentation (3/3)
- [ ] **Phase 150: Audit** — Systematic code and logic audit (8/11)
- [x] **Phase 151: Audit Resolution** — Remediate Phase 150 findings (19/19)
- [x] **Phase 152: Audit Resolution 2** — Additional audit fixes (8/8)
- [x] **Phase 153: Audit Resolution 3** — Further audit fixes (12/12)
- [x] **Phase 154: Workflow Bug Sweep** — Workflow bug fixes (5/5)
- [ ] **Phase 155: Approval Edit UX** — Approval UX improvements (0/1)
- [ ] **Phase 156: Audit** — Additional audit phase (1/8)
- [x] **Phase 156.1: Admin Role & RBAC Hardening** — Fix admin-role authorization gaps and RBAC contract drift (5/5)
- [x] **Phase 157: Business Logic Compliance** — Fix BUSINESS_LOGIC.md discrepancies (6/6)
- [x] **Phase 158: Audit** — Full-app audit findings → 10 independent fix plans (10/10)
- [x] **Phase 159: Audit Fixes** — Fix Phase 158 code review findings (10/10)
- [x] **Phase 179: E2E Test Data** — E2E test data seeding (17/17)
- [x] **Phase 180: E2E Business Logic** — E2E business logic tests (15/15)
- [x] **Phase 200: Entity Naming Enforcement** — Mandatory naming (10/10)
- [ ] **Phase 201: Archived Visibility + Restore** — Archive toggle parity and unarchive flows (4/5)
- [x] **Phase 250: Spaghetti Simplification** — Code simplification (10/10)
- [x] **Phase 251: Spaghetti Simplification 2** — More code cleanup (11/11)

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

**Goal**: Unified exports (Excel/CSV) with as-of snapshots and audit trail functionality
**Depends on**: Phase 3
**Research**: Likely (export tooling and snapshot reconstruction)
**Research topics**: Excel generation with openpyxl, CSV safety, point-in-time replay
**Plans**: 6 plans

Plans:

- [x] 04-01: Report generation backend (PDF, Excel)
- [x] 04-02: Audit trail and control execution logging
- [x] 04-03: Unified backend exports for risks/controls/kris/vendors (pdf/xlsx/csv + as_of_date)
- [x] 04-04: Single export button + shared export modal on Risks/Controls/KRIs/Vendors pages
- [x] 04-05: Export regression, docs reconciliation, and phase-state closeout
- [x] 04-06: Hard-remove PDF export format and migrate reporting surfaces to Excel/CSV only

### Phase 5: Automated Testing (INSERTED)

**Goal**: Establish comprehensive test coverage for backend and frontend
**Depends on**: Phase 4
**Research**: Likely (pytest-asyncio patterns, Vitest/RTL setup)
**Plans**: 2 plans

Plans:

- [x] 05-01: Backend API testing with pytest
- [x] 05-02: Frontend component/integration testing with Vitest

### Phase 6: Risk Appetite

**Goal**: Implement Key Risk Indicators (KRIs) linked to Risks with limit monitoring
**Depends on**: Phase 5
**Source**: OS 18 Gap Analysis + placeholder-kri-source.xlsx
**Plans**: 2 plans

Plans:

- [x] 06-01: Backend (KRI schema, API, seed script)
- [x] 06-02: Frontend (KRI UI, gauges, dashboard widget)

### Phase 6.1: KRI Management Tab (COMPLETE)

**Goal**: Create dedicated KRI management page with full CRUD like Risks and Controls
**Depends on**: Phase 6
**Plans**: 1 plan
**Completed**: 2025-12-26

Plans:

- [x] 06.1-01: KRI list page, detail page, create/edit forms, navigation

### Phase 7: User Management & RBAC

**Goal**: Implement comprehensive user management with role-based access control and department hierarchy
**Depends on**: Phase 6.1
**Research**: Unlikely (standard RBAC patterns)
**Plans**: 17 plans

Plans:

- [x] 07-01: Backend schema and user models (users, roles, department hierarchy)
- [x] 07-02: Backend API endpoints for user CRUD and permission checking
- [x] 07-03: Frontend user management UI (list, forms, hierarchy tree)
- [x] 07-04: Permission filtering for all endpoints (risks, controls, KRIs, dashboard)
- [x] 07-05: Seed script for sample users with different roles
- [x] 07-06: Security Fixes & Permission Hardening (Deep Check Results)
- [x] 07-07: Phase 7 Audit Remediation (API methods, password updates, auth fixes)
- [x] 07-08: Report Endpoint Department Scoping
- [x] 07-09: Execution Endpoint Department Scoping
- [x] 07-10: Dynamic Role Selection in User Forms
- [x] 07-11: KRI Permission Enforcement
- [x] 07-12: Permission Model Consistency & Null Department Handling
- [x] 07-13: Directory Webhook Authentication (CRITICAL)
- [x] 07-14: Production Security Defaults (HIGH)
- [x] 07-15: Control-Trends Department Filter Fix (MEDIUM)
- [x] 07-16: Approval Request Resource Access Check (MEDIUM)
- [x] 07-17: Verify Export Department Filtering (MEDIUM)

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
**Plans**: 7 plans
**Completed**: 2025-12-28

Plans:

- [x] 09-01: Notification schema and models
- [x] 09-02: Notification generation logic (approval events)
- [x] 09-03: Notification API endpoints (list, mark read, unread count)
- [x] 09-04: Frontend notification UI (bell icon, dropdown panel, page)
- [x] 09-05: Background task scheduler for KRI breach checking
- [x] 09-06: Notification preferences (backend model, API, migration)
- [x] 09-07: Notifications settings tab (frontend UI + API wiring)

### Phase 10: Historization Schema & API (COMPLETE)

**Goal**: Implement historical tracking for all changes to risks, controls, and KRIs
**Depends on**: Phase 9
**Research**: Unlikely (standard audit trail patterns)
**Plans**: 5 plans
**Completed**: 2026-02-11

Plans:

- [x] 10-01: KRI historization backend (KRIValueHistory model, fields, migration)
- [x] 10-02: KRI history service and API endpoints
- [x] 10-03: KRI frontend historization (types, forms, value recording, history UI)
- [x] 10-04: History tests and human verification
- [x] 10-05: KRI value recording endpoint with breach detection

Note:
- 10-05 was closed via reconciliation because value-recording + breach detection had already been implemented and tested through `POST /api/v1/kris/{kri_id}/values` and related historization/approval flows.

### Phase 11: Historical Visualization & Charts (COMPLETE)

**Goal**: Build UI for viewing historical data, trends, and audit trails
**Depends on**: Phase 10
**Research**: Unlikely (using existing Recharts library)
**Plans**: 5 plans
**Completed**: 2026-02-11

Plans:

- [x] 11-01: Frontend history components (timeline, change cards, trend charts)
- [x] 11-02: Add history tabs to detail pages (risks, controls, KRIs)
- [x] 11-03: Historical comparison view (side-by-side diff between dates)
- [x] 11-04: Dashboard historical widgets (risk trends, breach history)
- [x] 11-05: Audit report generation (PDF/Excel export of audit trail)

Note:
- 11-04 was closed via reconciliation because dashboard historical widgets were already implemented and wired end-to-end across backend APIs, dashboard schemas, frontend API client, and dashboard chart components.

### Phase 12: Compliance Governance

**Goal**: Implement Activity Log for system-wide change tracking and Risk Committee dashboard enhancements
**Depends on**: Phase 11
**Source**: OS 18 Gap Analysis + User Requirements
**Status**: ✅ Complete
**Plans**: 7 plans

Plans:

- [x] 12-01: Activity Log Backend (model, API, tampering protection)
- [x] 12-02: Activity Log Frontend (new tab with filters and search)
- [x] 12-03: Dashboard Risk Committee (executive summary, meeting mode)
- [x] 12-04: Proposed Metrics (CRO Perspective)
- [x] 12-05: Backend Structured Logging (structlog, context injection)
- [x] 12-06: Audit Log Separation & Rotation (file handlers, splitting streams)
- [x] 12-07: SIEM Documentation & Verification (Option A: Forwarding guide)

### Phase 12.1: Phase 12 Review / Audit (INSERTED)

**Goal**: Review Phase 12 implementation for scope alignment, authorization gaps, data leakage risks, and operational readiness.
**Depends on**: Phase 12
**Status**: In progress
**Plans**: 11 plans

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
**Status**: ✅ Complete (reopened scope delivered)
**Reopened**: 2026-02-12
**Plans**: 8 plans

Plans:

- [x] 13-01: Findings & Issues backend (model, API, linkage to Controls/Risks)
- [x] 13-02: Remediation Plan workflow (assignments, due dates, progress tracking)
- [x] 13-03: Findings Dashboard & Reporting (open issues, aging analysis)
- [x] 13-04: Contextual issue creation backend contract + vendor direct linking
- [x] 13-05: Shared frontend contextual quick-create modal + API typing
- [x] 13-06: Contextual “Create Issue” actions on Risk/Control/KRI/Vendor detail pages
- [x] 13-07: Issues detail workflow UX simplification (guided actions, lower clutter)
- [x] 13-08: Verification, docs reconciliation, and re-closeout

Note:
- `13-01..13-03` remain completed historical baseline from the initial Phase 13 execution.
- Reopen scope is additive and preserves existing workflow state-machine contracts.
- Reopen execution closed on 2026-02-12 after verification gates and docs reconciliation.

### Phase 14: Risk Assessments

**Goal**: Launch risk assessment campaigns and surveys to business owners.
**Depends on**: Phase 13
**Status**: ✅ Complete
**Plans**: 7 plans

Plans:

- [x] 14-01: Questionnaire schema + models
- [x] 14-02: Questionnaire API + RBAC
- [x] 14-03: Notifications + reminders + activity logging
- [x] 14-04: Risk detail tab + questionnaire history grid
- [x] 14-05: Questionnaire detail + submission form (v1 questions)
- [x] 14-06: CRO batch send in Risk Hub
- [x] 14-07: End-to-end verification (tests + Playwright)

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

### Phase 16: Risk Assessment Polish (NEW)

**Goal**: Improve risk assessment questionnaire operations with review/clarification workflow, configurable reminders, and reporting.
**Depends on**: Phase 14
**Status**: Complete
**Plans**: 3 plans

Plans:

- [x] 16-01: Review flow + template v2 (compare vs last cycle, changes, clarification + likelihood/loss)
- [x] 16-02: Reminders (2 days before due + overdue Mondays)
- [x] 16-03: Reporting (export + risk detail assessment summary)

### Phase 20: Czech Localization

**Goal**: Implement full Czech language support for the RiskHub application including UI, API messages, reports, and documentation.
**Depends on**: Phase 15 (Settings Page with localization placeholder)
**Status**: Planned
**Plans**: 12 plans

Plans:

- [x] 20-01: i18n Infrastructure Setup (react-i18next, translation file structure, language switching)
- [x] 20-02: Frontend Core Components Translation (layout, navigation, common UI)
- [x] 20-03: Risk, Control, and KRI Page Translation (domain terminology)
- [x] 20-04: Dashboard, Approvals, and Admin Pages Translation
- [x] 20-05: Backend API Messages Translation (errors, validation, activity log)
- [x] 20-06: PDF/Excel Report Translation (export documents in Czech)
- [x] 20-07: Administrator Documentation Translation (7 docs → docs/admin-cs/)
- [x] 20-08: End-User Documentation Translation (8 docs → docs/user-cs/)
- [x] 20-09: Localization Integration and Verification (testing, glossary, dev docs)
- [x] 20-10: Remaining UI Translation Summary
- [x] 20-11: Translate remaining hardcoded strings (forms, admin panels, dashboards)
- [x] 20-16: Runtime Message Localization

### Phase 25: User-Specific Settings

**Goal**: Fix theme and language settings persistence across user sessions with cross-device sync via server storage.
**Depends on**: Phase 15 (Settings Page), Phase 20 (Czech Localization)
**Status**: Planned
**Plans**: 5 plans

Plans:

- [x] 25-00: Backend Preferences Storage (User model columns, migration, API endpoints)
- [x] 25-01: Frontend Sync Infrastructure (API client, storage utils, AuthContext sync)
- [x] 25-02: Theme Context Refactoring (server sync, multi-tab sync, simplify)
- [x] 25-03: Language Context Refactoring (server sync, i18n trigger, simplify)
- [x] 25-04: Verification & E2E Testing (settings-isolation.spec.ts, data-testid)

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
- [x] 17-01: Docker Scaffolding (multi-stage builds, Compose, health checks)
- [x] 17-02: Production Hardening (CORS, CSP, secrets, rate limiting)
- [x] 17-03: Automated Security Scanning (SAST, dependency scanning, secrets detection)
- [x] 17-04: End-to-End Regression Suite (Playwright full coverage)
- [x] 17-05: Performance & Load Testing (Locust, benchmarks)
- [ ] 17-06: VM Deployment Scripts (systemd, nginx, install scripts)
- [ ] 17-07: Azure Deployment (Bicep templates, App Service, CI/CD)
- [ ] 17-08: Technical Deployment Documentation (IT/DevOps guides)
- [x] 17-09: Administrator Guide (CRO/Admin configuration)
- [x] 17-10: End-User Guide (Risk manager documentation)
- [ ] 17-11: Azure AD/Entra SSO (MSAL integration, token validation)
- [ ] 17-12: AD User Directory Lookup (Graph API, user import)
- [ ] 17-13: Session Management (refresh tokens, sliding sessions, force logout)
- [ ] 17-14: AD Deprovisioning Check (deleted user detection, auto-deactivate)

### Phase 18: Vendor Risk Management

**Goal**: Comprehensive third‑party risk management (TPRM): vendor catalog, due diligence + assessments/scoring, monitoring, exit/BCP artifacts, reporting, supply chain visibility, and specialized DORA tracking.
**Depends on**: Phase 17
**Status**: Complete
**Completed**: 2026-01-26
**Vision**:

1. **Vendor Catalog**: Registry with risk tiers (critical/high/medium/low) and schedules.
2. **Assessments**: Questionnaires, scoring, and response tracking.
3. **Supply Chain**: Dependency visualization and fourth-party risk.
4. **DORA Compliance**: Specialized, exhaustive scope for DORA-relevant vendors (ICT, Cloud).
**Plans**: 12 plans

Plans:

- [x] 18-00: Phase 18 plumbing (RBAC seed parity + notifications schema alignment)
- [x] 18-01: Vendor catalog + ownership (outsourcing owner) + manual classification
- [x] 18-02: Vendor risk taxonomy + risk factors + linkage to Risk Register
- [x] 18-03: Due diligence workflow (questionnaires, evidence, committee recommendation)
- [x] 18-04: Reassessment scheduling + reminders (annual vs 3-year cadence)
- [x] 18-05: Concentration risk + dependency/supply-chain modeling (4th parties)
- [x] 18-06: Contract controls + DORA clause tracking (templates, evidence, status)
- [x] 18-07: Exit strategy + contingency plan / BCP artifacts and statuses
- [x] 18-08: Monitoring + incidents + remediation actions (audit trail)
- [x] 18-09: Reporting (annual management report) + exports (incl. DORA register)
- [x] 18-10: Optional third‑party signal integrations (public registry, cyber rating, sanctions)
- [x] 18-11: Dashboard + Risk Committee integration (vendors, reassessments, SLA breaches)

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
- [x] 72-07: Full-modality permission independence + documentation reconciliation
- [x] 72-08: Full-modality cleanup (RBAC enforcement, migration convergence, repo hygiene)
- [x] 72-09: Backend threshold propagation cleanup (reports + approvals)
- [x] 72-10: Public endpoints for thresholds + risk types (non-CRO)
- [x] 72-11: Frontend public-config consumption + dynamic type display
- [x] 72-12: Naming cleanup for approval threshold helpers (`is_critical_risk_*` semantics)

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
- [ ] 90-15: Governance UI Redesign & KRI Orphans

### Phase 99: Data Migration & AD Emulator Standalone

**Goal**: Migrate real data and separate AD Emulator into standalone application that communicates with RiskHub via HTTP API
**Depends on**: Phase 90 (AD Emulator), Phase 7 (User Management)
**Research**: None (building on existing work)
**Plans**: 6 plans

Plans:

- [x] 99-01: Risks migration from placeholder-risk-register.xlsx
- [x] 99-02: Controls migration from placeholder-controls-source.xlsx
- [x] 99-03: KRIs migration from placeholder-kri-source.xlsx
- [x] 99-04: AD Emulator standalone backend (separate FastAPI app in /AD Emulator)
- [x] 99-05: AD Emulator standalone frontend (separate React app with premium design)
- [x] 99-06: RiskHub integration with external AD Emulator (HTTP sync)
- [x] 99-07: AD Emulator integration hardening (external_id, sync reliability, frontend polish)
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
**Plans**: 11 plans

Plans:

- [x] 150-01: Backend auth/permissions audit
- [x] 150-02: Backend domain/services audit
- [x] 150-03: Frontend audit + consolidation
- [ ] 150-04: Webhook + Mock Auth Hardening
- [x] 150-05: KRI Approval + Orphan Timestamp Fixes
- [x] 150-06: Department Detail Pagination + Enum Alignment
- [x] 150-07: Frontend Lint Cleanup
- [x] 150-08: Backend Limits + Approval Fixes
- [x] 150-09: Department Detail Pagination
- [ ] 150-10: Backend Counts + Lookup Scoping
- [ ] 150-11: Department Detail Pagination Reset

### Phase 151: Audit Resolution

**Goal**: Resolve Phase 150 audit findings across RiskHub backend and frontend.
**Depends on**: Phase 150
**Research**: None
**Plans**: 19 plans

Plans:

- [x] 151-01: Backend department/KRI list consistency
- [x] 151-02: Dashboard metrics archived filtering + control trend errors
- [x] 151-03: Lookup auth + default role safety + approvals permission seed
- [x] 151-04: Script/timestamp hygiene fixes
- [x] 151-05: Frontend user/approvals permission gating + role defaults
- [x] 151-06: Execution enum alignment + risk list fixes
- [x] 151-07: Frontend pagination and grouped view completeness
- [x] 151-08: KRI historization corrections (calendar periods + approvals + notifications)
- [x] 151-09: KRI Overdue + Correction UI
- [x] 151-10: Access Guardrails + Scoped User Lookup
- [x] 151-11: Frontend access gating + scoped user pickers
- [x] 151-12: KRI value submission approval (open-period recording)
- [x] 151-13: KRI value correction UI + overdue badges
- [x] 151-14: Frontend Audit Fixes
- [x] 151-15: Robust Risk ID generation (atomic retry pattern)
- [x] 151-16: Approval Request DB-level constraints (partial unique index)
- [x] 151-17: Sensitive field detection refinement (None values + owner semantics)
- [x] 151-18: Production security guardrails & concurrency verification tests
- [x] 151-19: Approval workflow edge cases & activity logging

### Phase 156.1: Admin Role & RBAC Hardening (INSERTED)

**Goal**: Resolve critical admin-role and privileged-access inconsistencies found in deep review, with backend-first enforcement and frontend/test/docs contract alignment.
**Depends on**: Phase 156 (Audit)
**Research**: Completed (`.planning/phases/156.1-admin-role-rbac-hardening/156.1-RESEARCH.md`)
**Status**: ✅ Complete
**Completed**: 2026-02-11
**Plans**: 5 plans

Plans:

- [x] 156.1-01: Backend access-management mutation hardening (admin/CRO only)
- [x] 156.1-02: Frontend access-management edit gating alignment
- [x] 156.1-03: Admin log-config API contract alignment with compatibility shim
- [x] 156.1-04: RBAC seed, fixture, and mock contract convergence
- [x] 156.1-05: Regression matrix, docs reconciliation, and rollout gate

### Phase 157: Business Logic Compliance

**Goal**: Fix discrepancies between implementation and docs/BUSINESS_LOGIC.md identified during deep code review
**Depends on**: None (independent fixes)
**Research**: None (already researched during deep review)
**Status**: ✅ Complete
**Completed**: 2026-01-22
**Plans**: 6 plans

Plans:

- [x] 157-01: Approval Cancellation Permission Fix (privileged users can cancel per §5.5)
- [x] 157-02: KRI History Correction CRO Approval (enforce per §5.3)
- [x] 157-03: Complete 151-13 KRI Value Correction UI + Overdue Badges
- [x] 157-04: Complete 151-19 Approval Workflow Edge Cases & Activity Logging
- [x] 157-05: Seed File Role Consistency (align control_owner → employee per §1.1)
- [x] 157-06: E2E Business Logic Test Coverage (accelerate Phase 180)

### Phase 158: Audit

**Goal**: Address full-app audit findings across backend, frontend, DB migrations, and production hardening.
**Depends on**: None (independent fixes; each plan is runnable in any order)
**Research**: None (audit findings already captured in `158-CONTEXT.md`)
**Plans**: 10 plans

Plans:

- [x] 158-01: Fix ApprovalRequest model import crash (UTC import order) + regression test
- [x] 158-02: Approval-applied EDIT parity (Risk score recompute + Control audit attribution) + tests
- [x] 158-03: Restore approval DB uniqueness + converge enum/index drift + tests
- [x] 158-04: Fix Risk ID generator past 99 + tests
- [x] 158-05: Unify risk thresholds via GlobalConfig (backend + frontend) + tests
- [x] 158-06: Add `continuous` to backend ControlFrequency enum (+ optional dashboard test)
- [x] 158-07: Fix report downloads without `VITE_API_URL` + align frontend base URL conventions
- [x] 158-08: Replace UsersPage fallback with true read-only directory mode
- [x] 158-09: Fix Tailwind dynamic class purge in LoginPage
- [x] 158-10: Production hardening (fail-closed webhooks, scheduler singleton, rate limiting, CSP)

### Phase 159: Audit Fixes

**Goal**: Fix code review findings from Phase 158 including test reliability, security, and polish items.
**Depends on**: Phase 158 (Audit)
**Research**: None (issues already analyzed in code review)
**Status**: ✅ Complete
**Completed**: 2026-01-23
**Plans**: 10 plans

Plans:

- [x] 159-01: PostgreSQL-only test assertions + dialect-aware skips
- [x] 159-02: Risk ID generation test regression fix (DB-backed)
- [x] 159-03: Security CIDR matching fix (ipaddress module)
- [x] 159-04: Department high risk threshold consistency
- [x] 159-05: Approval field whitelist (prevent arbitrary writes)
- [x] 159-06: Migration duplicate cancellation audit fields
- [x] 159-07: Webhook sync error response codes
- [x] 159-08: Nginx CSP connect-src cleanup
- [x] 159-09: API client code cleanup
- [x] 159-10: Test infrastructure documentation

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → ... → 6.1 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 90

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 4/4 | ✅ Complete | 2025-12-25 |
| 2. Control Catalog | 3/3 | ✅ Complete | 2025-12-25 |
| 2.1 Risk Register | 2/2 | ✅ Complete | 2025-12-25 |
| 2.2 Risk Status Enhancement | 1/1 | ✅ Complete | - |
| 3. Dashboards | 2/2 | ✅ Complete | 2025-12-25 |
| 3.1 Interactive Dashboards | 1/1 | ✅ Complete | - |
| 3.2 List Enhancements | 1/1 | ✅ Complete | 2025-12-25 |
| 3.3 Department Page | 1/1 | ✅ Complete | 2025-12-25 |
| 4. Reporting | 6/6 | ✅ Complete | 2026-02-10 |
| 5. Automated Testing | 2/2 | ✅ Complete | 2025-12-25 |
| 6. Risk Appetite | 2/2 | ✅ Complete | - |
| 6.1 KRI Management | 1/1 | ✅ Complete | 2025-12-26 |
| 7. User Management & RBAC | 17/17 | ✅ Complete | - |
| 8. Permission Filtering | 8/8 | ✅ Complete | 2025-12-28 |
| 8-05. Testing Concerns | 1/1 | ✅ Complete | - |
| 9. Notification System | 7/7 | ✅ Complete | 2025-12-28 |
| 10. Historization | 5/5 | ✅ Complete | 2026-02-11 |
| 11. Historical Visualization | 5/5 | ✅ Complete | 2026-02-11 |
| 12. Compliance Governance | 7/7 | ✅ Complete | 2026-01-04 |
| 12.1 Compliance Review | 10/10 | ✅ Complete | 2026-01-04 |
| 13. Issue & Remediation Management | 8/8 | ✅ Complete | 2026-02-12 |
| 15. Settings Page | 5/5 | ✅ Complete | 2026-01-07 |
| 17. Production Deploy | 8/15 | ⏳ In progress | - |
| 18. Vendor Risk | 0/0 | ⏸️ Deferred | - |
| 19. Polish & Deploy | 0/6 | ⏸️ Planned | - |
| 20. Czech Localization | 16/12 | ✅ Complete | - |
| 25. User Settings | 5/5 | ✅ Complete | 2026-01-11 |
| 26. Dark Mode Polish | 0/1 | ⏸️ Open | - |
| 70. Risk Hub | 8/12 | ⏳ In progress | - |
| 71. Risk Hub Review | 3/3 | ✅ Complete | 2026-01-03 |
| 72. Risk Hub Resolution | 12/12 | ✅ Complete | 2026-01-05 |
| 73. Approval Permission Fix | 0/6 | ⏸️ Planned | - |
| 85. Workflow & Users | 6/6 | ✅ Complete | 2026-01-01 |
| 90. AD Emulator | 2/3 | ⏳ In progress | - |
| 90. AD Integration | 11/12 | ⏳ In progress | - |
| 99. Data Migration | 8/8 | ✅ Complete | 2026-01-04 |
| 100. Marketing | 3/3 | ✅ Complete | 2025-12-29 |
| 150. Audit | 8/11 | ⏳ In progress | - |
| 151. Audit Resolution | 19/19 | ✅ Complete | 2026-01-10 |
| 152. Audit Resolution 2 | 8/8 | ✅ Complete | 2026-01-10 |
| 153. Audit Resolution 3 | 12/12 | ✅ Complete | 2026-01-10 |
| 154. Workflow Bug Sweep | 5/5 | ✅ Complete | 2026-01-14 |
| 155. Approval Edit UX | 0/1 | ⏸️ Planned | - |
| 156. Audit | 1/8 | ⏳ In progress | - |
| 156.1 Admin Role & RBAC Hardening | 5/5 | ✅ Complete | 2026-02-11 |
| 157. Business Logic Compliance | 6/6 | ✅ Complete | 2026-01-22 |
| 158. Audit | 10/10 | ✅ Complete | 2026-01-19 |
| 159. Audit Fixes | 10/10 | ✅ Complete | 2026-01-23 |
| 179. E2E Test Data | 17/17 | ✅ Complete | 2026-02-11 |
| 180. E2E Business Logic | 15/15 | ✅ Complete | 2026-02-11 |
| 200. Entity Naming | 10/10 | ✅ Complete | 2026-02-11 |
| 201. Archived Visibility + Restore | 4/5 | ⏳ In progress | - |
| 250. Spaghetti Simplification | 10/10 | ✅ Complete | 2026-01-10 |
| 251. Spaghetti Simplification 2 | 11/11 | ✅ Complete | 2026-01-10 |

### Phase 179: E2E Test Data

**Goal**: Create comprehensive insurance risk data (risks, controls, KRIs) with cross-department ownership to enable E2E tests that currently skip due to missing data.
**Depends on**: Phase 180 (E2E Business Logic Testing)
**Research**: None (data based on Slavia Pojišťovna insurance operations research)
**Plans**: 17 plans

Plans:

- [x] 179-00: E2E Test Data Overview
- [x] 179-01: Foundation & User Verification (validate demo users, create ID mappings)
- [x] 179-02: Cross-Department Risk Data (15 risks with cross-dept ownership per §2.1, §7.1)
- [x] 179-03: Cross-Department Control Data (12 controls with risk links per §2.2, §7.2)
- [x] 179-04: KRI Data with Reporting Owners (10 KRIs per §2.3)
- [x] 179-05: Approval Request Seeding (5 approval requests per §5.1-§5.4)
- [x] 179-06: Master Seed Script & Integration (orchestration and seed_all.py integration)
- [x] 179-07: Activity Log Data Seeding (CRUD history for activity-logging tests)
- [x] 179-08: Resolved Approval Data (APPROVED/REJECTED/CANCELLED for workflow tests)
- [x] 179-09: Sensitive Field Approval Data (pending approvals for owner/dept changes)
- [x] 179-10: Permission-Gated Action Data (delete approvals, control executions, KRI corrections)
- [x] 179-11: Deterministic Cross-Department Scenarios (known user-entity ownership)
- [x] 179-12: Fresh DB Foundation Hardening (strict prerequisites, no user/department creation)
- [x] 179-13: Deterministic Vendor Seed Matrix (active + inactive/archive semantics)
- [x] 179-14: Deterministic Vendor SLA Seed Matrix (active + archived)
- [x] 179-15: Deterministic Archive Matrix Seeding (risk/control/kri/vendor/vendor-sla)
- [x] 179-16: Orchestration Finalization + Idempotency + State Reconciliation

Note:
- `179-00` closed by reconciliation to align overview/state metadata with the already completed `179-01..179-16` execution artifacts (no new seed implementation required).
- Closeout summary artifact: `.planning/phases/179-e2e-test-data/179-00-SUMMARY.md`.

### Phase 180: E2E Business Logic Testing

**Goal**: Comprehensive E2E test suite covering all business logic defined in docs/BUSINESS_LOGIC.md
**Depends on**: Phase 5 (Automated Testing), Phase 8 (Permission Filtering)
**Research**: None
**Plans**: 15 plans

Plans:

- [x] 180-01: E2E Infrastructure & Role-Based Access (fixtures, helpers, POMs, §1 tests)
- [x] 180-02: Entity Ownership & Department Relationships (§2, §3 tests)
- [x] 180-03: Permission Matrix & CRUD Operations (§4 tests)
- [x] 180-04: Approval Workflows - Full Lifecycle (§5 tests)
- [x] 180-05: Sensitive Field Rules (§6 tests)
- [x] 180-06: Cross-Department Access (§7 tests)
- [x] 180-07: Activity Logging & Audit Trail (§9 tests)
- [x] 180-08: Suite Integration & Full Regression (CI config, docs)
- [x] 180-09: E2E Test Data Verification (verify Phase 179 data enables tests)
- [x] 180-10: E2E Test Updates for Deterministic Scenarios (use Phase 179 seeded data)
- [x] 180-11: Deterministic E2E Fixture Constants (all entity families + archive variants)
- [x] 180-12: Deterministic Risk/Control/KRI Spec Refactor (reduce skip-driven paths)
- [x] 180-13: Vendor + Vendor SLA E2E Coverage (visibility/archive/restore/RBAC)
- [x] 180-14: Archive Visibility & Restore Matrix Across Surfaces (list/search/link)
- [x] 180-15: Full Verification + Skip Budget + Docs/State Reconciliation

Note:
- `kri-owner-access` deterministic stabilization follow-up is complete (focused + stress green).
- `cross-department/control-owner-access` timeout blocker was fixed via locale-safe controls search locator.
- Critical deterministic verification set remains green (`44/44`, chromium) for the core deterministic surface.
- 180-15 closeout is complete with targeted-only reconciliation evidence (`93 tests`, `0 failures`, skip-budget recorded) and inherited full-gate pass from 180-16 (`/tmp/riskhub-playwright-watchdog/full-ci-gate-final-r2/summary.txt`).

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
- [x] 200-08: Export & Reporting Updates
- [x] 200-09: Verification & Regression Testing
- [x] 200-10: Final Cleanup & Documentation

### Phase 201: Archived Visibility + Restore

**Goal**: Standardize archived visibility defaults and restore/unarchive behavior across Risks, Controls, KRIs, Vendors, and Vendor SLAs.
**Depends on**: Phase 200 (Entity Naming)
**Research**: None (implementation path defined by phase plan set)
**Plans**: 5 plans

Plans:

- [x] 201-01: Backend archive visibility contract alignment (include_archived + schema/type updates)
- [x] 201-02: Restore endpoints + delete-permission enforcement + activity logs
- [x] 201-03: Frontend include archived toggles in list/search surfaces
- [x] 201-04: Unarchive actions + archived linked-item grouping/muted styling
- [ ] 201-05: Tests, E2E verification, and documentation reconciliation
