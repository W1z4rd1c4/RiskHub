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
- [ ] **Phase 2: Control Catalog** — 13-point control structure and CRUD operations
- [ ] **Phase 3: Dashboards** — Executive and department-level dashboards
- [ ] **Phase 4: Reporting** — PDF/Excel exports and audit trails
- [ ] **Phase 5: Polish & Deploy** — i18n, testing, Docker, and documentation

## Phase Details

### Phase 1: Foundation
**Goal**: Set up project infrastructure with role-based access (auth mocked)
**Depends on**: Nothing (first phase)
**Research**: Unlikely (established patterns)
**Plans**: 3 plans

Plans:
- [x] 01-01: React + Vite frontend scaffolding with Tailwind/shadcn
- [x] 01-02: FastAPI backend with SQLAlchemy and PostgreSQL
- [x] 01-03: Role-based access structure (SII roles, auth mocked for now)

### Phase 2: Control Catalog
**Goal**: Implement the 13-point control data structure with full CRUD
**Depends on**: Phase 1
**Research**: Unlikely (domain requirements clear from DEFINICIA KONTROL)
**Plans**: 3 plans

Plans:
- [ ] 02-01: Database schema for controls, departments, and users
- [ ] 02-02: API endpoints for control management
- [ ] 02-03: Control catalog UI with forms and validation

### Phase 3: Dashboards
**Goal**: Build executive and department-level dashboards
**Depends on**: Phase 2
**Research**: Likely (charting libraries, data aggregation patterns)
**Research topics**: React charting libraries (Recharts vs Chart.js), dashboard layout patterns
**Plans**: 2 plans

Plans:
- [ ] 03-01: Dashboard backend (aggregations, metrics endpoints)
- [ ] 03-02: Dashboard UI components and layouts

### Phase 4: Reporting
**Goal**: PDF/Excel exports and audit trail functionality
**Depends on**: Phase 3
**Research**: Likely (PDF generation in Python)
**Research topics**: ReportLab vs WeasyPrint, Excel generation with openpyxl
**Plans**: 2 plans

Plans:
- [ ] 04-01: Report generation backend (PDF, Excel)
- [ ] 04-02: Audit trail and control execution logging

### Phase 5: Polish & Deploy
**Goal**: Internationalization, testing, containerization, and documentation
**Depends on**: Phase 4
**Research**: Unlikely (established patterns)
**Plans**: 3 plans

Plans:
- [ ] 05-01: i18n implementation (English + Czech)
- [ ] 05-02: End-to-end testing with Playwright
- [ ] 05-03: Docker containerization and deployment docs

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete | 2025-12-25 |
| 2. Control Catalog | 0/3 | Not started | - |
| 3. Dashboards | 0/2 | Not started | - |
| 4. Reporting | 0/2 | Not started | - |
| 5. Polish & Deploy | 0/3 | Not started | - |
