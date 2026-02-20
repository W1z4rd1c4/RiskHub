# RiskHub Business Logic Reference

> **Version**: 1.1  
> **Last Updated**: 2026-02-16  
> **Audience**: Product, Engineering, QA, Compliance  
> **Source of Truth**: Backend RBAC and approval enforcement in `backend/app/`

---

## Table of Contents

0. [Companion Guides](#0-companion-guides)
1. [Roles & Access Scopes](#1-roles--access-scopes)
2. [Entity Ownership Rules](#2-entity-ownership-rules)
3. [Department Relationships](#3-department-relationships)
4. [Permission Matrix](#4-permission-matrix)
5. [Approval Workflows](#5-approval-workflows)
6. [Sensitive Field Rules](#6-sensitive-field-rules)
7. [Cross-Department Access](#7-cross-department-access)
8. [Quick Reference Tables](#8-quick-reference-tables)
9. [Activity Logging & Audit Trail](#9-activity-logging--audit-trail)
10. [Reporting Exports](#10-reporting-exports)
11. [Issue Lifecycle](#11-issue-lifecycle)

---

## 0. Companion Guides

Use this document as policy truth. Use the guides below for operational workflow details:

- Platform administration (admin role only):
  - `docs/admin/README.md`
  - `docs/admin-cs/README.md`
- Business/end-user workflows (all non-admin roles):
  - `docs/user/README.md`
  - `docs/user-cs/README.md`
- Localization and docs parity process:
  - `docs/LOCALIZATION.md`
  - `docs/README.md`

## 1. Roles & Access Scopes

### 1.1 Role Definitions

| Role | Display Name | Category | Business Data Access | Platform Admin | Risk Hub Config |
|------|--------------|----------|---------------------|----------------|-----------------|
| `ceo` | CEO | C-Suite | ✅ Privileged | ❌ | ❌ |
| `cfo` | CFO | C-Suite | ✅ Privileged | ❌ | ❌ |
| `cro` | CRO | C-Suite | ✅ Privileged | ❌ | ✅ **Only CRO** |
| `coo` | COO | C-Suite | ❌ | ❌ | ❌ |
| `risk_manager` | Risk Manager | Governance | ✅ Privileged | ❌ | ❌ |
| `compliance` | Compliance | Governance | ✅ Privileged | ❌ | ❌ |
| `legal` | Legal | Governance | ✅ Privileged | ❌ | ❌ |
| `internal_audit` | Internal Audit | Governance | ✅ Privileged | ❌ | ❌ |
| `actuarial` | Actuarial | Governance | ✅ Privileged | ❌ | ❌ |
| `department_head` | Department Head | Department | ❌ Department-scoped | ❌ | ❌ |
| `employee` | Employee | Department | ❌ Department-scoped | ❌ | ❌ |
| `admin` | Administrator | System | ❌ **No business data** | ✅ | ❌ |
| `viewer` | Viewer | System | ❌ Read-only | ❌ | ❌ |

> [!NOTE]
> Some deployments do not use a separate `legal` role. For Vendor Risk Management (Phase 18), contract governance is modeled as a capability permission (`vendor_contracts:*`) and is typically granted to `compliance`.

### 1.2 Access Scopes

Each user has an `access_scope` that determines data visibility:

| Scope | Value | Description | Who Has It |
|-------|-------|-------------|-----------|
| **GLOBAL** | `global` | See all departments' data | C-Suite, Governance roles |
| **DEPARTMENT** | `department` | See only own department's data | Department Head, Employee |
| **MANAGER** | `manager` | See data via manager relationship | Delegated employees |

### 1.3 Privileged vs Non-Privileged

```
┌─────────────────────────────────────────────────────────────┐
│                    PRIVILEGED USERS                         │
│  (access_scope = GLOBAL, can approve/reject requests)       │
│                                                             │
│  CEO, CFO, CRO, Risk Manager, Compliance, Legal,           │
│  Internal Audit, Actuarial                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 NON-PRIVILEGED USERS                        │
│  (access_scope = DEPARTMENT/MANAGER, require approval)      │
│                                                             │
│  Department Head, Employee                                  │
│  (Can request but NOT approve deletions/edits)              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     ADMIN (Special)                         │
│         Platform access only - NO business data             │
│         Can manage users, logs, system health               │
└─────────────────────────────────────────────────────────────┘
```

### 1.4 Access Management Write Policy

Access-management read/list behavior and write behavior are intentionally different:

| Surface | Who Can Access | Notes |
|---------|----------------|-------|
| `GET /api/v1/access/users` | GLOBAL-scope users | Platform-wide list/read endpoint |
| `GET /api/v1/access/users/my-department` | Department Head OR GLOBAL-scope users | Department-scoped list/read endpoint |
| `PATCH /api/v1/access/users/{id}` | **Admin or CRO only** | Applies to all mutable fields (`role_id`, `department_id`, `manager_id`, `access_scope`) |

> [!IMPORTANT]
> `admin` is a platform role, not a business-data superuser. Admin capabilities must not be interpreted as unrestricted business access.

### 1.5 Documentation Library Visibility

Settings and platform documentation use a strict audience split:

| Role | Documentation Audience |
|------|------------------------|
| `admin` | `admin` docs only |
| All non-admin roles (`cro`, `risk_manager`, `department_head`, `employee`, etc.) | `user` docs only |

Rules:
- `GET /api/v1/admin/docs` always returns exactly one audience (`admin` or `user`) per request.
- Payload includes metadata for UI navigation (`audience`, `tags`) so clients can show tag filters.
- Locale lookup uses per-file fallback to English if a localized file is missing.

---

## 2. Entity Ownership Rules

### 2.1 Risk

| Field | Type | Description | Who Can Be Owner |
|-------|------|-------------|------------------|
| `owner_id` | FK → User | Risk Owner | Any active user |
| `department_id` | FK → Department | Owning department | Must match department with `is_active=True` |

**Ownership Hierarchy:**
1. **Risk Owner** (`owner_id`) - Primary responsible person
2. **Department** (`department_id`) - Organizational ownership
3. **Department Head** - Fallback approver if no owner

**Who Can Own a Risk:**
- Any user can be assigned as Risk Owner regardless of their department
- The assigned owner is typically someone in the same department, but this is not enforced
- Changing `owner_id` is a **sensitive field change** requiring approval

### 2.2 Control

| Field | Type | Description | Who Can Be Owner |
|-------|------|-------------|------------------|
| `control_owner_id` | FK → User | Control Owner | Any active user |
| `department_id` | FK → Department | Owning department | Any active department |
| `created_by_id` | FK → User | Creator | Automatically set |
| `updated_by_id` | FK → User | Last updater | Automatically set |

**Ownership Hierarchy:**
1. **Control Owner** (`control_owner_id`) - Responsible for control execution
2. **Department** (`department_id`) - Organizational ownership
3. **Risk Owners of Linked Risks** - Fallback approvers

**Who Can Own a Control:**
- Any user can be Control Owner (cross-department assignment allowed)
- Control Owner can edit the control (subject to approval if linked to high-risk)
- Changing `control_owner_id` is a **sensitive field change**

### 2.3 Key Risk Indicator (KRI)

| Field | Type | Description | Who Can Be Owner |
|-------|------|-------------|------------------|
| `risk_id` | FK → Risk | **Required** parent risk | Must link to existing Risk |
| `reporting_owner_id` | FK → User | Reporting Owner | Any active user (optional) |

**Ownership Hierarchy:**
1. **Reporting Owner** (`reporting_owner_id`) - Responsible for submitting KRI values
2. **Risk Owner** (of linked risk) - Fallback if no reporting owner
3. **Department** (inherited from linked risk)

**Who Can Own a KRI:**
- Any user can be assigned as Reporting Owner
- If no Reporting Owner, the linked Risk's owner is responsible
- KRIs **inherit department access** from their linked Risk

### 2.4 Department

| Field | Type | Description |
|-------|------|-------------|
| `manager_id` | FK → User | Department Manager/Head |
| `is_active` | Boolean | Soft delete flag |
| `is_system` | Boolean | System departments cannot be deleted |

**Who Can Manage Departments:**
- Only Admin and CRO can create/edit/delete departments
- Manager assignment determines fallback approval authority

---

## 3. Department Relationships

### 3.1 Entity-Department Mapping

```
┌─────────────────────────────────────────────────────────────┐
│                      DEPARTMENT                             │
│  manager_id → User (Department Head)                        │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
    ┌─────────┐         ┌──────────┐         ┌─────────┐
    │  USERS  │         │  RISKS   │         │ CONTROLS│
    │ dept_id │         │ dept_id  │         │ dept_id │
    └─────────┘         └──────────┘         └─────────┘
                              │
                              ▼
                        ┌─────────┐
                        │  KRIs   │
                        │ risk_id │ (inherits dept from Risk)
                        └─────────┘
```

### 3.2 Department Access Rules

| User Access Scope | Can See Risks | Can See Controls | Can See KRIs |
|-------------------|--------------|------------------|--------------|
| GLOBAL | All departments | All departments | All departments |
| DEPARTMENT | Own department only | Own department only | Own dept's risks' KRIs |
| MANAGER | Via manager's department | Via manager's department | Via manager |

**Special Cases:**
- **Unassigned items** (`department_id = NULL`): Only GLOBAL users can access
- **Cross-department ownership**: See Section 7

---

## 4. Permission Matrix

### 4.1 Resource Permissions

| Permission | Description | Typical Roles |
|------------|-------------|---------------|
| `risks:read` | View risks | All (scoped by department) |
| `risks:write` | Create/edit risks | Risk Manager, Compliance |
| `risks:delete` | Delete risks | Privileged only (via approval) |
| `controls:read` | View controls | All (scoped) |
| `controls:write` | Create/edit controls | Risk Manager, Dept Head |
| `controls:delete` | Delete controls | Privileged only (via approval) |
| `controls:execute` | Log control executions | Control Owner, Executor |
| `kri:read` | View KRIs | All (scoped) |
| `kri:write` | Create/edit KRIs | Risk Manager |
| `kri:submit` | Submit KRI values | Reporting Owner, Risk Owner |
| `approvals:read` | View approval queue | All |
| `approvals:write` | Approve/reject requests | Privileged users only |
| `users:read` | View user list | Admin, CRO |
| `users:write` | Create/edit users | Admin only |
| `activity_log:read` | View activity log | Risk Manager, Compliance, Admin |
| `vendors:read` | View vendors (Vendor Risk Management) | Governance + business users (scoped) |
| `vendors:write` | Create/edit vendors | Outsourcing Owners, Risk Manager, Department Head |
| `vendors:delete` | Archive vendors | Privileged users only |
| `vendor_contracts:read` | View vendor contracts + DORA clauses | Compliance, CRO |
| `vendor_contracts:write` | Create/edit vendor contracts + DORA clauses | Compliance, CRO |
| `issues:read` | View issues/findings | CRO, Risk Manager, Compliance, Internal Audit, Dept Head (scoped) |
| `issues:write` | Create/edit issues and remediation | CRO, Risk Manager, Dept Head (scoped) |
| `issues:approve` | Approve issue exceptions | CRO, Risk Manager (global approvers) |

### 4.2 Role-Permission Grid

| Role | risks:* | controls:* | kri:* | approvals:write | users:write | Risk Hub |
|------|---------|------------|-------|-----------------|-------------|----------|
| CRO | ✅ Full | ✅ Full | ✅ Full | ✅ | ❌ | ✅ **Configure** |
| Risk Manager | ✅ Full | ✅ Full | ✅ Full | ✅ | ❌ | ❌ |
| Compliance | ✅ Read | ✅ Read | ✅ Read | ✅ | ❌ | ❌ |
| Dept Head | ✅ Dept | ✅ Dept | ✅ Dept | ❌ | ❌ | ❌ |
| Employee | ✅ Dept R | ✅ Dept R | ✅ Dept R | ❌ | ❌ | ❌ |
| Admin | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |

---

## 5. Approval Workflows

### 5.1 Approval Status Flow

```
                    User submits request
                           │
                           ▼
                    ┌─────────────┐
                    │   PENDING   │
                    │ (awaiting   │
                    │  primary)   │
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │  CANCELLED  │ │  REJECTED   │ │  Primary    │
    │ (by user)   │ │ (by approver)│ │  Approved   │
    └─────────────┘ └─────────────┘ └──────┬──────┘
                                           │
                           ┌───────────────┴───────────────┐
                           │  requires_privileged = true?  │
                           └───────────────┬───────────────┘
                                   │               │
                               Yes ▼               ▼ No
                    ┌─────────────────────┐ ┌─────────────┐
                    │ PENDING_PRIVILEGED  │ │  APPROVED   │
                    │ (awaiting CRO/RM)   │ │  (action    │
                    └──────────┬──────────┘ │  executed)  │
                               │            └─────────────┘
               ┌───────────────┼───────────────┐
               ▼               ▼               ▼
        ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
        │  CANCELLED  │ │  REJECTED   │ │  APPROVED   │
        │             │ │             │ │  (action    │
        └─────────────┘ └─────────────┘ │  executed)  │
                                        └─────────────┘
```

### 5.2 Tiered Approval Model

| Stage | Approver | Condition |
|-------|----------|-----------|
| **Primary Approval** | Risk Owner or Department Head | Always required for non-privileged users |
| **Privileged Approval** | CRO, Risk Manager, or other privileged user | Required if `requires_privileged_approval = true` |

**When is Privileged Approval Required?**
- Risk has `is_priority = true`
- Risk has `net_score >= high_risk_min_net_score` threshold (default: 10)
- Control is linked to any high-risk/priority risk

### 5.3 Who Can Approve What

| Action Type | Primary Approver | Privileged Approver |
|------------|------------------|---------------------|
| **Delete Risk** | Risk Owner → Dept Head | CRO, Risk Manager |
| **Delete Control** | Risk Owner of highest-priority linked risk → Dept Head | CRO, Risk Manager |
| **Edit Risk (sensitive)** | Risk Owner → Dept Head | Required if high-risk |
| **Edit Control (sensitive)** | Risk Owner of linked risk → Dept Head | Required if linked to high-risk |
| **Edit KRI** | Risk Owner of linked risk | Required if linked risk is high-risk |
| **KRI History Correction** | Risk Owner | CRO approval required |

### 5.4 Self-Approval Prevention

- Users **cannot approve their own requests**
- If the primary approver (owner) is the requester, it escalates to Department Head
- If Department Head is also the requester, it escalates directly to Privileged

### 5.5 Request Cancellation

| Status | Who Can Cancel | Result |
|--------|---------------|--------|
| `PENDING` | Request creator OR privileged users | Status → `CANCELLED` |
| `PENDING_PRIVILEGED` | Request creator OR privileged users | Status → `CANCELLED` |
| `APPROVED` / `REJECTED` / `CANCELLED` | No one | Cannot cancel terminal states |

> [!NOTE]
> Cancellation is logged in the activity log with action `CANCEL`.

---

## 6. Sensitive Field Rules

### 6.1 Sensitive Fields by Entity

| Entity | Sensitive Fields | Approval Trigger |
|--------|------------------|------------------|
| **Risk** | `owner_id`, `department_id`, `category`, `is_priority` | Any change requires approval |
| **Control** | `control_owner_id`, `department_id` | Any change requires approval |
| **KRI** | (none - inherits from linked Risk) | Value changes may require approval |

### 6.2 Priority Risk Edit Rule

> [!IMPORTANT]
> **Any edit on a priority risk (`is_priority = true`) requires approval from Risk Manager or CRO.**

This applies to **ALL fields**, not just sensitive ones:

| User Type | Editing Priority Risk | Result |
|-----------|----------------------|--------|
| CRO / Risk Manager | Any field | ✅ Immediate update |
| Department Head | Any field | ⏳ Creates approval request |
| Employee | Any field | ⏳ Creates approval request |
| Risk Owner (non-privileged) | Any field | ⏳ Creates approval request |

### 6.3 Special Cases

**is_priority Field (Risk):**
- `true → false` (downgrade): **REQUIRES approval** (removing from priority watch)
- `false → true` (upgrade): NO approval needed (adding to priority is always allowed)

**Clearing to NULL:**
- `owner_id: 5 → null`: **REQUIRES approval** (removing owner)
- This prevents accidental orphaning of entities

---

## 7. Cross-Department Access

### 7.1 Ownership-Based Access

Non-privileged users can access resources **outside their department** if they are:

| Role | Can Access |
|------|-----------|
| **Risk Owner** | The risk they own, regardless of department |
| **Control Owner** | The control they own + its linked risks (read + view controls) |
| **KRI Reporting Owner** | The KRI they own + its linked risk (read + view controls) |

### 7.2 Access Inheritance

```
┌─────────────────────────────────────────────────────────────┐
│   KRI Reporting Owner (Dept A)                              │
│                    │                                        │
│                    ▼                                        │
│   Can view KRI → Can view linked Risk (even if Dept B)      │
│                → Can view Risk's linked Controls            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│   Control Owner (Dept A)                                    │
│                    │                                        │
│                    ▼                                        │
│   Can edit Control → Can view linked Risks (even if Dept B) │
│                    → Can view Risk's linked Controls        │
└─────────────────────────────────────────────────────────────┘
```

### 7.3 Risk-Control Linking Access

| Endpoint | Access Rule | Approval Required? |
|----------|-------------|--------------------|
| `GET /risks/{id}/controls` | Ownership OR department | No (read-only) |
| `POST /risks/{id}/controls` | Ownership for risk + department for control + `risks:write` | No |
| `DELETE /risks/{id}/controls/{id}` | Ownership for risk + department for control + `risks:write` | No |

> [!NOTE]
> Linking/unlinking controls is **not subject to approval** because:
> - User must already have write permission
> - It's metadata management, not entity modification
> - Both entities must be accessible to the user

---

## 8. Quick Reference Tables

### 8.1 Who Can Create Entities

| Entity | Who Can Create | Default Department |
|--------|----------------|-------------------|
| Risk | Users with `risks:write` | Creator's department |
| Control | Users with `controls:write` | Creator's department |
| KRI | Users with `kri:write` | Inherits from linked Risk |

### 8.2 Who Can Delete (Archive) Entities

| Entity | Archive Permission | Immediate Archive | Requires Approval |
|--------|---------------------|-------------------|-------------------|
| Risk | `risks:delete` | Privileged users | Non-privileged: creates ApprovalRequest |
| Control | `controls:delete` | Privileged users | Non-privileged: creates ApprovalRequest |
| KRI | `risks:delete` | Privileged users | Non-privileged: creates ApprovalRequest |
| Vendor | `vendors:delete` | Immediate | No |
| Vendor SLA | `vendors:delete` | Immediate | No |

> [!NOTE]
> Deletion is implemented as **soft-delete (archival)** to preserve audit trails.
> - Risks: `status = 'archived'`
> - Controls: `status = 'archived'`
> - KRIs: `is_archived = true`, `archived_at`, `archived_by_id`
> - Vendors: `status = 'inactive'` (inactive is the archived state)
> - Vendor SLAs: `is_archived = true`, `archived_at`, `archived_by_id`

### 8.3 Archived Visibility Defaults and Restore

| Surface | Default Behavior | Opt-in Behavior |
|--------|-------------------|-----------------|
| Risks list/search | Archived hidden | `include_archived=true` includes archived risks |
| Controls list/search | Archived hidden | `include_archived=true` includes archived controls |
| KRIs list/detail/history | Archived hidden | `include_archived=true` allows archived KRIs within read scope |
| Vendors list/search | Inactive hidden | `include_archived=true` includes inactive vendors |
| Vendor SLA list | Archived hidden | `include_archived=true` includes archived SLAs |

| Restore Endpoint | Required Permission | Restore State |
|------------------|---------------------|---------------|
| `POST /api/v1/risks/{id}/restore` | `risks:delete` | `status='active'` |
| `POST /api/v1/controls/{id}/restore` | `controls:delete` | `status='active'` |
| `POST /api/v1/kris/{id}/restore` | `risks:delete` | `is_archived=false`, clear archive metadata |
| `POST /api/v1/vendors/{id}/restore` | `vendors:delete` | `status='active'` |
| `POST /api/v1/vendor-slas/{id}/restore` | `vendors:delete` | `is_archived=false`, clear archive metadata |

### 8.4 Approval Action Decision Tree

```
User requests action (DELETE or EDIT sensitive field)
                │
                ▼
┌───────────────────────────────────────┐
│        Is user privileged?            │
│    (access_scope = GLOBAL)            │
└───────────────────┬───────────────────┘
                    │
        Yes ───────►│◄──────── No
        │                      │
        ▼                      ▼
    IMMEDIATE           CREATE APPROVAL
    EXECUTION           REQUEST
        │                      │
        │                      ▼
        │           ┌─────────────────────────┐
        │           │ Set primary_approver_id │
        │           │ (Risk Owner or Dept Head)│
        │           └────────────┬────────────┘
        │                        │
        │                        ▼
        │           ┌─────────────────────────┐
        │           │ Is risk high-priority?  │
        │           │ (is_priority OR         │
        │           │  net_score >= threshold)│
        │           └────────────┬────────────┘
        │                        │
        │            Yes ────────┴──────── No
        │            │                     │
        │            ▼                     ▼
        │   requires_privileged    requires_privileged
        │         = TRUE                 = FALSE
        │            │                     │
        │            └──────────┬──────────┘
        │                       │
        └───────────────────────┴─────► DONE
```

### 8.5 KRI Value Submission Flow

| Submitter | Action | Approval Required |
|-----------|--------|-------------------|
| KRI Reporting Owner | Submit value | Only if linked risk is high-priority |
| Risk Owner (fallback) | Submit value | Only if risk is high-priority |
| Privileged User | Submit value | Never (immediate) |

### 8.6 Control Execution Logging

| Logger | Permission Required | Department Scope |
|--------|---------------------|------------------|
| Control Owner | `controls:execute` | Can log own controls (cross-dept) |
| Department Member | `controls:execute` | Department controls only |
| Privileged User | `controls:execute` | All controls |

### 8.7 Notification Types (Stable Keys)

Notification types are stable string keys shared across backend model, backend API schemas, and frontend TypeScript unions.

**Core types:**
- Approval workflow: `approval_pending`, `approval_resolved`, `approval_cancelled`
- KRI deadlines/breaches: `kri_due_soon`, `kri_due_tomorrow`, `kri_overdue`, `kri_near_breach`, `kri_breach_detected`
- Questionnaires: `questionnaire_sent`, `questionnaire_due_soon`, `questionnaire_overdue`, `questionnaire_submitted`, `questionnaire_clarification_requested`

**Vendor Risk Management (Phase 18):**
- Assessments: `vendor_assessment_submitted`, `vendor_assessment_committee_recommended`, `vendor_assessment_decided`
- Reassessments: `vendor_reassessment_due_soon`, `vendor_reassessment_overdue`
- SLA monitoring: `vendor_sla_due_soon`, `vendor_sla_due_tomorrow`, `vendor_sla_overdue`, `vendor_sla_near_breach`, `vendor_sla_breach_detected`

---

## 9. Activity Logging & Audit Trail

### 9.1 Entity-Level Logging

All significant actions are logged to the `activity_logs` table for audit compliance:

| Entity Type | Actions Logged |
|-------------|----------------|
| RISK | CREATE, UPDATE, ARCHIVE |
| CONTROL | CREATE, UPDATE, ARCHIVE |
| KRI | CREATE, UPDATE, ARCHIVE |
| KRI_VALUE | CREATE (value submission), UPDATE (value correction) |
| APPROVAL | CREATE, APPROVE, REJECT, CANCEL |
| VENDOR | CREATE, UPDATE, ARCHIVE |
| VENDOR_ASSESSMENT | CREATE, UPDATE, STATUS_CHANGE |
| VENDOR_INCIDENT | CREATE, UPDATE, STATUS_CHANGE |
| VENDOR_SLA | CREATE, UPDATE, STATUS_CHANGE |
| VENDOR_REMEDIATION | CREATE, UPDATE, STATUS_CHANGE |

### 9.2 Change Tracking

For UPDATE actions, the `changes` column stores a JSON object:
```json
{
  "field_name": {"old": "previous_value", "new": "new_value"},
  "another_field": {"old": 5, "new": 10}
}
```

> [!IMPORTANT]
> Date/datetime values are serialized to ISO format strings. Enum values are stored as their `.value`.

### 9.3 Approval Execution Logging

When an approval is executed:
- The APPROVAL entity logs `APPROVE` or `REJECT`
- The underlying entity (RISK/CONTROL/KRI) logs the actual change (ARCHIVE or UPDATE)
- All entity-level logs include a description like "Archived via approval #123"

---

## 10. Reporting Exports

### 10.1 Unified Export Endpoints

RiskHub provides unified list export endpoints for:
- Risks: `/api/v1/reports/risks/export`
- Controls: `/api/v1/reports/controls/export`
- KRIs: `/api/v1/reports/kris/export`
- Vendors: `/api/v1/reports/vendors/export`
- Issues: `/api/v1/reports/issues/export`

Shared query contract:
- `format` = `csv` (`xlsx` returns `410 excel_export_removed`)
- `as_of_date` = `YYYY-MM-DD` (optional; defaults to current date)
- Issues export supports additional filters:
  - `status`
  - `severity`
  - `owner_user_id`
  - `department_id`
  - `overdue_only`

### 10.2 UI Export Contract

List pages (Risks, Controls, KRIs, Vendors) use:
- One **Export** button per page
- Modal selection of as-of date (CSV export only)
- Page filter-aware exports (status/search/type where relevant)

### 10.3 Access Scope Enforcement

Exported data is always scoped to what the requesting user can access under RBAC:
- Department-scoped users only receive in-scope entities
- Privileged/global users can export across departments
- Ownership/reporting-owner exceptions follow the same logic as list/detail views

### 10.4 Archived/Inactive Semantics

- Risks/Controls: archived items included when status filter is `archived`
- KRIs: archived items included when status filter is `archived`
- Vendors: archived semantics use `status = inactive`

### 10.5 Specialized CSV Exports

Specialized report exports are CSV:
- `/api/v1/reports/summary/export?format=csv`
- `/api/v1/reports/audit-trail/export?format=csv`
- `/api/v1/vendor-reports/annual?format=csv`
- `/api/v1/vendor-reports/dora-register?format=csv`

Legacy Excel endpoints return `410` with replacement metadata.

---

## 11. Issue Lifecycle

### 11.1 Core Workflow States

Issue status transitions:
- `open` -> `triaged` -> `in_progress` -> `ready_for_validation` -> `closed`

Remediation status transitions:
- `draft` -> `active` -> `blocked` -> `completed`

Exception status transitions:
- `requested` -> `approved` -> `revoked|expired`

Invalid transitions return `409` from backend workflow endpoints.

Workflow mutation contract:
- `PATCH /api/v1/issues/{id}` does **not** allow `status` updates.
- Status changes are allowed only through workflow endpoints:
  - `POST /api/v1/issues/{id}/assign`
  - `POST /api/v1/issues/{id}/start-remediation`
  - `POST /api/v1/issues/{id}/update-progress`
  - `POST /api/v1/issues/{id}/close`
  - `POST /api/v1/issues/{id}/revoke-exception` (exception lifecycle)

### 11.2 Scope and Non-Leaky Access

- Issue reads are backend-scoped by department visibility plus ownership exception paths.
- Out-of-scope issue reads return `404` (not `403`) to prevent resource leakage.
- Backend remains source of truth for authorization; frontend only mirrors gating.
- Owner assignment (`create`, `patch owner_user_id`, `assign`) is allowed only when owner has global scope or belongs to the issue department.
- Department reassignment is blocked when existing links would become cross-department inconsistent.

### 11.3 Deadline and Exception Semantics

- Due-soon and overdue notifications are generated by scheduled deadline checks.
- High-severity overdue issues generate escalation notifications.
- Approved exceptions suppress issue overdue/open dashboard counting while active.
- Expired exceptions are auto-marked `expired`; closed issues can be re-opened when remediation is incomplete.
- Explicit exception revocation is available via `POST /api/v1/issues/{id}/revoke-exception`.
- Revocation transitions exception state `approved -> revoked`.
- Revoking an exception re-opens a closed issue to `in_progress` when remediation is not complete.
- Assignment and exception-approved notifications are emitted only to recipients that can read the issue.

### 11.4 Issue Dashboard Metrics

Issue dashboard endpoints:
- `/api/v1/dashboard/issues-summary`
- `/api/v1/dashboard/issues-aging`
- `/api/v1/dashboard/issues-by-severity`

Metric rules:
- Open issues exclude `closed` and active approved exceptions.
- Overdue issues require `due_at < now` and open/not-suppressed.
- Severity breakdown counts open/not-suppressed issues.

### 11.5 Contextual Issue Intake

Contextual creation endpoint:
- `POST /api/v1/issues/contextual`

Supported contextual source entities:
- `risk`
- `control`
- `execution`
- `kri`
- `vendor`

Contextual behavior:
- Backend resolves issue department from linked source entity.
- Vendor links support direct `vendor_id` in `IssueLink`.
- Vendor department fallback:
  - if `vendor.department_id` is null, fallback uses vendor owner department.
  - if both are unresolved, contextual create fails with `409` and explicit validation detail.
- Out-of-scope or missing contextual entities return non-leaky `404`.

UI entry points:
- Risk detail (`/risks/:id`)
- Control detail (`/controls/:id`)
- KRI detail (`/kris/:id`)
- Vendor detail (`/vendors/:id`)

Entry-point actions are permission-gated by `issues:write` and use business labels only (no raw numeric IDs in UI copy).

### 11.6 Simplified Workflow UX (Frontend)

The backend state machine remains authoritative and unchanged.

Frontend simplification rules:
- Workflow summary card shows current status and next guided step.
- Closed issues render summary-only mode (mutation actions hidden).
- Advanced remediation fields (blockers/completion notes) are collapsed by default under an explicit advanced section.
- Action emphasis follows issue status:
  - `open|triaged`: assignment/start remediation emphasized.
  - `in_progress`: progress update and exception actions emphasized.
  - `ready_for_validation`: close action emphasized.

---

## Appendix A: Code References

| Concept | File | Function/Class |
|---------|------|----------------|
| Role Types | `app/models/role.py` | `RoleType` enum |
| Access Scope | `app/models/user.py` | `AccessScope` enum |
| Privileged Check | `app/core/permissions.py` | `is_privileged_user()` |
| Department Access | `app/core/permissions.py` | `check_department_access()` |
| Sensitive Fields | `app/core/permissions.py` | `SENSITIVE_FIELDS` dict |
| High-Risk Check | `app/core/permissions.py` | `is_high_risk_for_approval_async()` |
| Approval Model | `app/models/approval_request.py` | `ApprovalRequest` |
| Primary Approver | `app/core/approval_helpers.py` | `get_primary_approver_for_control()` |
| Cross-dept Access | `app/core/permissions.py` | `is_control_owner()`, `is_kri_reporting_owner()` |

---

## Appendix B: Configuration (Risk Hub)

These values are configurable by CRO in Risk Hub:

| Key | Default | Description |
|-----|---------|-------------|
| `high_risk_min_net_score` | 10 | Threshold for requiring privileged approval |
| `medium_risk_min_net_score` | 5 | Medium risk threshold for reporting |
| `critical_risk_min_net_score` | 20 | Critical risk threshold |

---

## Appendix C: Admin Log Config Contract

Admin Console log configuration uses canonical split fields:

- `app_log_rotation_size_mb`
- `app_log_retention_count`
- `audit_log_rotation_size_mb`
- `audit_log_retention_count`

Compatibility behavior:

- `POST /api/v1/admin/logs/config` accepts canonical payloads.
- Legacy payload (`log_rotation_size_mb`, `log_retention_count`) is accepted temporarily and mirrored to app/audit values.
- Mixed canonical+legacy payloads are rejected (`422`).

`GET /api/v1/admin/logs/config` returns canonical fields.

---

*Document generated from codebase analysis. See individual model files for authoritative definitions.*
