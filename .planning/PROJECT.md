# RiskHub - Insurance Risk Management Platform

## Vision

RiskHub is a modern, enterprise-grade risk management platform designed specifically for insurance companies. It provides a centralized system for managing control catalogs across departments, with each department owning and maintaining their controls while providing company-wide visibility through dashboards and reporting.

The platform integrates with Active Directory/Entra ID for role-based access control, ensuring that department heads, risk managers, auditors, and executives see exactly what they need. The UI is modern, user-friendly, and designed for daily use by non-technical insurance professionals.

Built with on-premise deployment as the primary target, the architecture is designed for seamless cloud migration when the organization is ready.

## Problem

Currently, risk management and control documentation is fragmented across departments. There is no standardized system for:
- Documenting all controls with the required 13 data points
- Tracking control execution and verification
- Providing management and auditors with visibility into control status
- Ensuring compliance with CAP/CKP membership requirements and regulatory directives

Manual processes in spreadsheets lead to inconsistencies, missed controls, and audit findings. Department heads lack the tools to efficiently manage their control catalogs, and executives lack real-time dashboards for risk oversight.

## Success Criteria

How we know this worked:

- [x] All departments can create and manage their control catalogs with 13 required data points
- [ ] Role-based access control works with Active Directory/Entra ID
- [x] Dashboards show real-time control status across departments
- [ ] Auditors can verify control execution through the system
- [x] Control execution is documented and timestamped
- [ ] System can be deployed on-premise with the supported `docker` and `linux` deployment targets
- [ ] Architecture supports future cloud migration to Azure

## Scope

### Building (v1)

**Core Features:**
- Control Catalog Management (13-point data structure)
- Department-based ownership and permissions
- Control execution logging and verification
- Risk Register with gross/net risk scoring
- Risk-Control linkage and mitigation tracking
- Key Risk Indicator (KRI) management and appetite monitoring
- KRI limit tracking with breach detection
- Role-based access (mocked auth, AD integration deferred)

**SII Role Structure (Solvency II Compliance):**
- **Admin** — System administration, user management
- **Chief Risk Officer (CRO)** — Full access, risk oversight, reporting
- **Risk Manager** — Risk register management, control oversight
- **Actuarial Function** — Actuarial controls, reserving oversight
- **Compliance Officer** — Regulatory compliance, policy controls
- **Internal Audit** — Read-only audit access, verification rights
- **Department Head** — Department control catalog ownership
- **Control Owner** — Specific control management and execution
- **Viewer** — Read-only dashboard access

**Dashboards & Reporting:**
- Executive dashboard with risk overview
- Department-level control status
- KRI breach monitoring widget
- Control execution frequency tracking
- Risk significance heatmaps
- Risk appetite grouped views (by category, department, process)
- Export to PDF/Excel

**Infrastructure:**
- React 18+ frontend with Vite
- Python FastAPI backend
- PostgreSQL database with SQLAlchemy ORM
- Docker containerization
- On-premise deployment ready
- i18n support (English default, Czech option)

### Not Building (v1)

- **Vendor Risk Management** — Deferred to v2 (requires third-party integrations)
- **Advanced Analytics/AI** — Deferred to v2 (requires data accumulation first)
- **Incident Management** — Included in v1 as basic logging, full workflow in v2
- **Mobile App** — Responsive web only for v1

## Context

**Reference Documents:**
- `placeholder-risk-policy.pdf` — Company risk management policy
- `placeholder-controls-source.xlsx` — Example control catalog from Provoz department
- `DEFINICIA KONTROL` — 13-point control data structure definition

**Control Data Structure (13 Points):**
1. Control Name
2. Brief Description
3. Data Source/Input
4. Directive/Policy Reference
5. Form (Manual/Automatic)
6. Process Owner Position
7. Control Owner Position
8. Control Executor
9. Frequency (Daily, Weekly, Monthly, Quarterly, Annual)
10. Significance/Risk Level (1-5, 5 = highest)
11. Control Output
12. Report Recipient
13. Documentation/Storage Location

**Existing Ecosystem:**
- Active Directory/Entra ID for authentication
- CAP/CKP membership compliance requirements
- Regulatory directives and internal policies

## Constraints

- **Tech Stack**: Next.js 14+, PostgreSQL, Prisma, Docker — chosen for modern DX and enterprise readiness
- **Authentication**: Must integrate with Active Directory/Entra ID — no standalone auth
- **Deployment**: On-premise first (`docker` or `linux` target), cloud-ready architecture
- **Language**: UI in Czech/Slovak for v1
- **Compliance**: Must support audit trails and control verification

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Frontend | React 18+ with Vite | Fast builds, mature ecosystem, excellent for dashboards |
| Backend | Python FastAPI | Async, fast, great for APIs, strong typing with Pydantic |
| Database | PostgreSQL + SQLAlchemy | Enterprise-grade, async support, type-safe ORM |
| Auth | Azure AD via MSAL | Native Entra ID integration, token management |
| Deployment | Docker and Linux deploy targets | On-premise first, cloud migration path |
| UI Framework | Tailwind + shadcn/ui | Modern, accessible, fast development |
| i18n | react-i18next | English default, Czech language option |

## Open Questions

- [ ] Which departments will pilot the system first?
- [ ] What are the specific AD groups to map to application roles?
- [ ] Are there existing APIs to integrate with (e.g., HR system for positions)?
- [ ] What is the expected volume of controls per department?
- [ ] Are there specific audit report formats required?

---
*Initialized: 2025-12-25*
