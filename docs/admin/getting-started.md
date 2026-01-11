# Getting Started with RiskHub

> **Audience**: First-time administrators and CRO  
> **Time to Complete**: 15-20 minutes

---

## Table of Contents

1. [First Login](#1-first-login)
2. [Navigation Overview](#2-navigation-overview)
3. [Understanding Your Role](#3-understanding-your-role)
4. [Initial Configuration Checklist](#4-initial-configuration-checklist)
5. [Key Concepts](#5-key-concepts)

---

## 1. First Login

### Accessing RiskHub

1. Navigate to your RiskHub URL (e.g., `https://riskhub.yourcompany.com`)
2. You will see the login screen with available demo accounts or AD integration
3. Select your user account or enter credentials

### First-Time Setup for CRO

If you are the CRO (Chief Risk Officer), you have exclusive access to configure Risk Hub settings:

1. **Navigate to Risk Hub** in the sidebar (only visible to CRO)
2. **Configure thresholds** for risk scoring:
   - High Risk Minimum Net Score (default: 10)
   - Medium Risk Minimum Net Score (default: 5)
   - Critical Risk Minimum Net Score (default: 20)
3. **Set up risk types** and categories
4. **Configure notification settings**

> [!IMPORTANT]
> Only the CRO role can access and modify Risk Hub configuration. This ensures governance control over risk thresholds and business rules.

---

## 2. Navigation Overview

### Main Navigation (Sidebar)

| Menu Item | Description | Access |
|-----------|-------------|--------|
| **Dashboard** | Executive overview with charts and metrics | All users |
| **Workflow** | Pending tasks and approvals | All users |
| **Controls** | Control catalog management | Based on permissions |
| **Risks** | Risk register | Based on permissions |
| **Risk Appetite** | KRI management and value submission | Based on permissions |
| **Departments** | Department structure | All users (read) |
| **Governance** | Risk Committee dashboard | Privileged users |
| **Audit Trail** | System audit logs | Admin only |
| **Activity Log** | Business activity history | Risk Manager, Compliance, Audit |
| **Settings** | User preferences | All users |
| **Access Management** | User permissions | Admin, CRO |
| **Risk Hub** | System configuration | CRO only |

### User Menu (Bottom of Sidebar)

- **Profile**: Shows current user name and role
- **Sign Out**: Securely log out of the system

---

## 3. Understanding Your Role

### Role Categories

RiskHub organizes users into three categories:

#### Privileged Users (Global Access Scope)
These users can see ALL data across the organization and can approve/reject requests:

| Role | Special Capabilities |
|------|---------------------|
| CRO | Risk Hub configuration, full governance authority |
| CEO, CFO | Executive oversight |
| Risk Manager | Full risk/control/KRI management |
| Compliance | Read access + approval authority |
| Legal | Legal risk oversight |
| Internal Audit | Audit access and review |
| Actuarial | Quantitative risk analysis |

#### Non-Privileged Users (Department Scope)
These users see only their department's data and require approvals for certain actions:

| Role | Permissions |
|------|-------------|
| Department Head | Manage department risks, primary approver for department |
| Employee | Submit KRI values, log control executions, view department data |

#### Administrator (Platform Scope)
| Role | Permissions |
|------|-------------|
| Admin | User management, system health, logs — **no business data access** |

> [!NOTE]
> The Administrator role is deliberately separated from business data access to maintain separation of duties for compliance.

---

## 4. Initial Configuration Checklist

Complete these tasks in order when setting up RiskHub:

### Phase 1: User Setup (Admin)
- [ ] Create or sync users from Active Directory
- [ ] Assign appropriate roles to each user
- [ ] Assign users to departments
- [ ] Configure access scopes (Global/Department/Manager)

### Phase 2: Department Structure (Admin/CRO)
- [ ] Create all organizational departments
- [ ] Assign Department Heads (managers) to each department
- [ ] Verify department hierarchy

### Phase 3: Risk Hub Configuration (CRO Only)
- [ ] Configure risk scoring thresholds
- [ ] Set up risk types and categories
- [ ] Configure approval rules
- [ ] Set notification preferences
- [ ] Configure log rotation settings

### Phase 4: Data Entry (Risk Manager)
- [ ] Create initial risk register
- [ ] Create control catalog
- [ ] Link controls to risks
- [ ] Create KRIs linked to risks
- [ ] Assign owners to all entities

### Phase 5: Go-Live
- [ ] Train all users on their role-specific workflows
- [ ] Communicate KRI reporting schedules
- [ ] Establish approval workflow expectations

---

## 5. Key Concepts

### Entities and Ownership

RiskHub manages three main entity types:

```
┌─────────────────────────────────────────────────────────────┐
│                      DEPARTMENT                             │
│  manager_id → Department Head                               │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
    ┌─────────┐         ┌──────────┐         ┌─────────┐
    │  USERS  │         │  RISKS   │         │ CONTROLS│
    │ dept_id │         │ owner_id │         │ owner_id│
    └─────────┘         │ dept_id  │         │ dept_id │
                        └──────────┘         └─────────┘
                              │
                              ▼
                        ┌─────────┐
                        │  KRIs   │
                        │ risk_id │ (inherits dept from Risk)
                        └─────────┘
```

### Approval Workflows

Non-privileged users require approval for:
- **Deleting** risks, controls, or KRIs
- **Editing sensitive fields** (owner, department, category, priority)
- **Any edit** to priority risks

Approvals follow a two-tier model:
1. **Primary Approval**: Risk Owner or Department Head
2. **Privileged Approval**: Required for high-risk/priority items (CRO or Risk Manager)

### Soft Deletion (Archival)

RiskHub uses soft deletion to preserve audit trails:
- Deleted items are marked as "archived" rather than removed
- Archived items are hidden from normal views but preserved for compliance
- Audit logs maintain complete history

---

## Next Steps

- [Configure Risk Hub Settings](./riskhub-config.md)
- [Set Up Users](./user-management.md)
- [Create Departments](./departments.md)

---

*For technical deployment, see the main documentation in `/docs`.*
