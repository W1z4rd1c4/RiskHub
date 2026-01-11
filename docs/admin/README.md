# RiskHub Administrator Guide

> **Version**: 1.0  
> **Last Updated**: 2026-01-11  
> **Audience**: CRO, Administrators, Risk Managers

---

## Introduction

Welcome to the RiskHub Administration Guide. This documentation provides comprehensive instructions for configuring, managing, and maintaining your RiskHub deployment.

RiskHub is an enterprise risk management platform designed for insurance companies, enabling organizations to:
- Manage risks, controls, and key risk indicators (KRIs)
- Enforce role-based access and approval workflows
- Generate compliance reports for regulatory requirements
- Maintain complete audit trails for all system activities

---

## Quick Links

| Guide | Description |
|-------|-------------|
| [Getting Started](./getting-started.md) | First-time setup, navigation, and initial configuration |
| [Risk Hub Configuration](./riskhub-config.md) | System thresholds, risk types, approval rules, and notifications |
| [User Management](./user-management.md) | Adding users, roles, departments, and access scopes |
| [Department Management](./departments.md) | Creating departments, hierarchies, and handling orphaned items |
| [Approvals & Governance](./approvals.md) | Understanding and managing approval workflows |
| [Reports & Exports](./reports.md) | Available reports, PDF/Excel exports, and audit trails |

---

## Role-Based Access Overview

RiskHub implements a sophisticated role-based access control (RBAC) system:

### Privileged Users (Global Access)
Users with organization-wide visibility and approval authority:
- **CRO** – Chief Risk Officer (only role that can configure Risk Hub)
- **CEO, CFO** – C-Suite executives
- **Risk Manager** – Primary risk governance
- **Compliance, Legal, Internal Audit, Actuarial** – Governance functions

### Non-Privileged Users (Department-Scoped)
Users with access limited to their assigned department:
- **Department Head** – Manages department risks and approvals
- **Employee** – View and submit data for their department

### Special Roles
- **Administrator** – Platform management only (users, logs, system health) – **no business data access**
- **Viewer** – Read-only access to permitted areas

---

## System Requirements

RiskHub is deployed as a containerized application:

| Component | Requirement |
|-----------|-------------|
| **Docker** | Version 20.10+ |
| **PostgreSQL** | Version 14+ |
| **Browser** | Chrome, Firefox, Edge (latest versions) |
| **Network** | HTTPS (TLS 1.2+) |

---

## Support

For technical assistance, contact your system administrator or refer to the technical documentation in the main `/docs` directory.

---

*© 2026 RiskHub. All rights reserved.*
