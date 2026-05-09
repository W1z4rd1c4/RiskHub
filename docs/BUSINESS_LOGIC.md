# RiskHub Business Logic Reference

> **Version**: 1.2
> **Last Updated**: 2026-04-25
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
12. [Risk Assessment Questionnaires](#12-risk-assessment-questionnaires)
13. [Committee Quarterly Comparisons](#13-committee-quarterly-comparisons)

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
| `CONTROL_OWNER` | **Reserved** Control Owner | Department | Reserved for future granular control ownership workflow | ❌ | ❌ |
| `employee` | Employee | Department | ❌ Department-scoped | ❌ | ❌ |
| `admin` | Administrator | System | ❌ **No business data** | ✅ | ❌ |
| `viewer` | Viewer | System | ❌ Read-only | ❌ | ❌ |

> [!NOTE]
> Some deployments do not use a separate `legal` role. `CONTROL_OWNER` is reserved for a future granular control ownership workflow and is not seeded as an active role today. Vendor contract governance permissions are reserved for a future DORA contract-governance workflow.

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
│  (access_scope = GLOBAL for business-data roles)            │
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
| `GET /api/v1/access/users` | GLOBAL-scope users | Platform-wide list/read endpoint. Platform Admin users are returned only to platform Admin callers; all non-Admin callers receive a business-user-only list. |
| `GET /api/v1/access/users/my-department` | Department Head OR GLOBAL-scope users | Department-scoped list/read endpoint. Platform Admin users are excluded for non-Admin callers even when they share a department. |
| `GET /api/v1/access/roles` | GLOBAL-scope users | Role option endpoint. The `admin` role is returned only to platform Admin callers. |
| `PATCH /api/v1/access/users/{id}` | **Admin or CRO only** | Single transactional save for `/users` access modal. CRO owns business-access fields (`department_id`, `manager_id`, `access_scope`) and non-admin `role_id` assignment for non-Admin users, including department assignment. Admin owns platform identity/lifecycle fields (`name`, `email`, authentication/local-account lifecycle) and Admin-role assignment only. Non-Admin callers cannot target platform Admin users; unavailable Admin targets are concealed with not-found behavior. Validation failures reject the whole patch. |

Access-user responses may include additive `capabilities` metadata (`can_edit_identity`, `can_edit_business_access`, `can_edit_role`, `can_deactivate`, `can_revoke_sessions`). The frontend should prefer those backend flags over local role guesses; when a flag is absent, older local fallback behavior remains acceptable.

Admin session operations use the shared auth-session workflow. `/api/v1/admin/sessions` lists only active users with unrevoked, unexpired refresh-token sessions; inactive or deleted users are excluded from the active-session projection. `/api/v1/admin/sessions/{user_id}/revoke` rejects self-revocation, locks the target user row, revokes active refresh-token rows, bumps the target `token_version` exactly once, and writes the admin activity entry in the same transaction.

Additional identity-governance rule for `microsoft_sso` mode:

- For users with `external_id`, `name` and `email` are Entra-authoritative and cannot be edited locally.
- `entra_business_role`, when configured, is also Entra-authoritative metadata. It is visible to the signed-in user and admin read surfaces, but it must not be used for RiskHub authorization.
- Local `role_id`, `department_id`, `access_scope`, and `manager_id` remain RiskHub-authoritative in this release. CRO may override `department_id` locally even for SSO-linked users.
- If an externally linked user was auto-deprovisioned because the directory account is missing or disabled, normal local re-enable is blocked; operators must use the explicit break-glass flow with expiry and audit.
- Entra ID token verifier instances are cached only across equivalent security settings: tenant, client, discovery URL, clock skew, allowed email domains, and business-role token claim must all match. Discovery and JWKS fetches stay behind the outbound egress guard.

> [!IMPORTANT]
> `admin` is a platform role, not a business-data superuser. Admin capabilities must not be interpreted as unrestricted business access. Direct business `/governance` and `/activity-log` access remains blocked for `admin`, including direct route/API requests.

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
- User-audience documents are written as task-oriented manuals. The reader hides maintainer-only source references and raw version chips for user manuals, while preserving those metadata fields in the response for validation and admin/operator documentation.
- Admin-audience documents remain operator runbooks and may expose maintainer references where they help platform support or incident handoff.

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

**Canonical Monitoring Status:**
- Controls expose a derived `monitoring_status` for detail views, list filters, stats, and exports.
- Status precedence is: `new` -> `needs_review` -> `failed` -> `passed`.
- Derivation always uses the **latest execution log only**.
- `new`: no execution logs and control age in days is within `control_execution_stale_days`.
- `needs_review`: no execution logs and control age exceeds `control_execution_stale_days`, or latest execution is older than that threshold.
- `failed`: latest execution exists and result is anything other than `passed`.
- `passed`: latest execution result is `passed`.
- Supporting fields include `latest_execution_result`, `latest_executed_at`, `days_since_last_execution`, and `execution_log_count`.
- Thresholds are configuration-backed in Risk Hub global config, not hardcoded in UI code.
- Control detail responses may include additive `capabilities` metadata for execution logging and risk-link management. The frontend should prefer those flags over local permission guesses and refresh after `403` or `409` mutation failures.

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
- KRIs can also be linked to one or more vendors as secondary monitoring context
- Vendor linkage does **not** replace the required `risk_id`; every KRI must still belong to exactly one parent risk
- Vendor-context KRI create uses the same vendor-link authorization boundary as other vendor link mutations: vendor read + KRI/risk read for visibility, vendor write/owner rules for link changes
- KRI create/update accepts the full desired vendor set via `linked_vendor_ids`; client-side follow-up reconciliation is not authoritative
- Vendor-context KRI create may also request `ensure_parent_risk_vendor_ids` to create missing vendor-risk links in the same transaction before the KRI is saved
- Vendor assignment failures roll back the whole KRI create/update request; there is no partial “created but not linked” KRI state

**Canonical Monitoring Status:**
- KRIs expose a derived `monitoring_status` for detail views, list filters, stats, and exports.
- Status precedence is: `new` -> `not_submitted` -> `breach` -> `warning` -> `optimal`.
- Derivation uses the **latest closed required reporting period**, not any historical submission.
- `new`: no submission history exists and the required period is not overdue.
- `not_submitted`: no submission exists for the required period after its due date.
- `breach`: required-period submission exists and `breach_status != within`.
- `warning`: required-period submission exists, `breach_status == within`, and the value is inside the upper warning margin.
- `optimal`: required-period submission exists, `breach_status == within`, and the value is outside the upper warning margin.
- Supporting fields include `required_due_date`, `days_overdue`, `is_submitted_for_required_period`, and the configured warning margin ratio.
- The upper warning margin is configuration-backed in Risk Hub global config and defaults to 10% of the configured range.
- Period algebra and the reporting grace-window default are governed by [ADR-012](./adr/ADR-012-kri-time-series.md).

**History and Value Governance:**
- KRI list, detail, history, breach, export, and dashboard breach-trend surfaces delegate read access to canonical KRI visibility (`can_read_kri_id`): department access, direct risk ownership, KRI reporting ownership, and linked-control ownership are evaluated by the backend policy layer.
- Explicit KRI department filters remain strict. Ownership and reporting exceptions do not leak rows from a department the caller explicitly cannot access.
- KRI value submission is period-based. Only one value may exist for a given `(kri_id, period_end)`.
- Direct duplicate submissions for an already-recorded period return `409 Conflict`; corrections are the supported way to change an existing period value.
- Non-privileged value submissions queue approval requests and preserve request-time period-window validity using the queued server `recorded_at`. If an approved queued value is stale because that period was recorded while the approval was pending, approval execution auto-rejects without creating a duplicate history row.
- Future `recorded_at` timestamps are rejected for direct privileged value submissions.
- KRI history defaults to recorded-at descending order for API compatibility and also supports period-first sorting; the KRI detail UI requests period-first descending order.
- History correction requires `risks:write` plus canonical KRI read access. Reporting-owner status alone grants read/submit authority, not correction authority.
- KRI history responses expose backend capability metadata such as `can_request_correction`; frontend action visibility should consume this metadata when present.
- Current-value correction uses deterministic latest-row selection: `period_end DESC`, then `recorded_at DESC`, then `id DESC`.

### 2.4 Department

| Field | Type | Description |
|-------|------|-------------|
| `manager_id` | FK → User | Department Manager/Head |
| `is_active` | Boolean | Soft delete flag |
| `is_system` | Boolean | System departments cannot be deleted |

**Who Can Manage Departments:**
- Only CRO can create/edit/delete departments through Risk Hub configuration
- Admin is platform-only and must not create/edit/delete business departments
- Manager assignment determines fallback approval authority
- Department manager assignment is validated server-side: the manager must exist and be active.
- Department deletion is blocked while the department has active users, risks, controls, KRIs through risks, vendors, or pending orphan records.
- Inactive departments, roles, and risk types cannot be edited until restored.
- Risk Hub role, department, risk type, approval scenario, settings, and questionnaire collection actions are driven by backend `capabilities` metadata. Role permission replacement is all-or-nothing: unknown permission IDs reject the request before existing permissions are removed.

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
| `risks:write` | Create/edit risks and design/create/edit KRIs | CRO, Risk Manager |
| `risks:delete` | Delete risks | CRO, Risk Manager |
| `controls:read` | View controls | All (scoped) |
| `controls:write` | Create/edit controls | CRO, Risk Manager, Compliance, Actuarial, Dept Head |
| `controls:delete` | Delete controls | CRO, Risk Manager |
| `controls:approve` | **Reserved** for future granular control approval workflow | Reserved |
| `controls:execute` | Log control executions | CRO, Risk Manager, Compliance, Internal Audit, Actuarial, Department Head, Employee |
| `kri:submit` | Submit KRI values | CRO, Risk Manager, Department Head, KRI Reporting Owner, Risk Owner fallback |
| `approvals:read` | View approval queue | All |
| `approvals:write` | Approve/reject requests | CRO, Risk Manager |
| `users:read` | View `/users` directory mode and user directory API | Admin, CRO, Risk Manager |
| `users:write` | Create/edit users | Admin only |
| `activity_log:read` | View activity log | CRO, Risk Manager, Department Head |
| `vendors:read` | View vendors (Vendor Risk Management) | Governance + business users (scoped) |
| `vendors:write` | Create/edit vendors | Outsourcing Owners, Risk Manager, Department Head |
| `vendors:delete` | Archive vendors | Privileged users only |
| `vendor_contracts:read` | **Reserved** for future vendor contract + DORA clause governance | Reserved |
| `vendor_contracts:write` | **Reserved** for future vendor contract + DORA clause governance | Reserved |
| `issues:read` | View issues/findings | CRO, Risk Manager, Compliance, Internal Audit, Dept Head (scoped) |
| `issues:write` | Create/edit issues and remediation | CRO, Risk Manager, Dept Head (scoped) |
| `issues:approve` | Approve issue exceptions | CRO, Risk Manager (global approvers) |

> [!NOTE]
> Platform admins are console-only and are explicitly blocked from business Activity Log and Governance surfaces, including direct route/API access.

Orphaned item governance uses backend workflow helpers:
- Orphan list/detail payloads are scoped from the current target entity department, not only orphan metadata.
- Responses may include additive `capabilities` metadata for resolve/detail visibility and required resolution fields.
- Resolution locks the orphan row and target entity, validates the orphan is still pending, and rejects stale resolutions with conflict semantics instead of overwriting a target that has already been reassigned.
- Admin batch orphan fixes use the same validation and resolution helper as the business Governance endpoint.

> [!NOTE]
> User discovery and user administration are separate contracts. `/api/v1/users/lookup` is the authenticated picker/search primitive used by forms and filters. `/api/v1/users/directory` is the explicit paginated collection for `/users` directory mode and requires `users:read`. Its response also carries `available_roles` facet metadata derived from the caller's visible directory universe so the frontend role filter stays backend-driven. `/api/v1/access/users*` remains the access-management contract for privileged and department-head access views.

> [!NOTE]
> Manual user lifecycle actions are least-privilege operations. Direct user creation (`POST /api/v1/users`) and directory import (`POST /api/v1/directory/users/{oid}/import`) are Admin-only lifecycle actions even when broader read or access-review surfaces are available to other privileged roles.

> [!NOTE]
> Admin lifecycle/detail endpoints stay separate from access-management review endpoints. `GET /api/v1/users/{id}` and `GET /api/v1/users/roles` are Admin-only lifecycle helpers; the active access-management UI reads role options from `GET /api/v1/access/roles` instead.

> [!NOTE]
> Vendor visibility and vendor-linked risk visibility are related but not identical. A user can have enough access to view a vendor while still lacking permission or scope to read linked risks. In that case the vendor remains visible, but risk-linked summaries and the frontend `By Risk` grouping must only expose readable risks; otherwise the UI must fall back to an unlinked/no-readable-risk bucket rather than leaking risk names.

> [!NOTE]
> Vendor governance uses a shared backend policy. Unfiltered scoped vendor lists, vendor reports, and dashboard vendor metrics include vendors in the user's department scope plus directly owned vendors, but unassigned vendors remain global-only. When a caller supplies an explicit `department_id`, the filter is strict: owner exceptions do not include vendors from another department. Vendor responses may include additive `capabilities` metadata for update, archive/restore, and link actions; the frontend should prefer those flags over local permission guesses.

> [!NOTE]
> Vendor detail now mirrors the individual risk page interaction model for linked entities. `Link Existing` remains governed by vendor edit access (`vendors:write` or vendor ownership rules), while `Add Risk` and `Add Control` require that same vendor edit access plus the corresponding domain write permission (`risks:write` or `controls:write`). Create-from-vendor uses routed forms and auto-links the new entity back to the originating vendor after save.

> [!NOTE]
> Grouped register views are multi-membership, not exclusive partitions. `By Vendor` on Risks, Controls, Issues, and KRIs must place one record into every readable linked-vendor bucket, while `By Flag` on Vendors must place one vendor into every applicable flag bucket (`DORA relevant`, `Supports core function`, `Significant vendor`). Vendors with none of those flags fall into `Insignificant vendors`.

### 4.2 Role-Permission Grid

| Role | Risks / KRI Design | Controls | KRI Values | Approvals | Users | Risk Hub / Departments |
|------|--------------------|----------|------------|-----------|-------|------------------------|
| CRO | Full | Full | Submit | Resolve | Read | Configure + department lifecycle |
| Risk Manager | Full | Full | Submit | Resolve | Read | Read departments |
| Compliance | Read | Read/write/execute | No seeded submit | No | No | Vendor contracts |
| Internal Audit | Read | Read/execute | No seeded submit | No | No | Read departments |
| Actuarial | Read | Read/write/execute | No seeded submit | No | No | No seeded department read |
| Dept Head | Read | Read/write/execute | Submit | No | No | Read departments |
| Employee | Read | Read/execute | No seeded submit | No | No | Read departments |
| Viewer | Read | Read | No seeded submit | No | No | Read departments |
| Admin | No business data | No business data | No | No | Write | Platform only, read departments |

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
| **Privileged Approval** | CRO or Risk Manager | Required if `requires_privileged_approval = true` |

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
| **KRI History Correction** | User with `risks:write` and canonical KRI read access | Non-resolver requests require CRO/Risk Manager approval |

KRI edit notes:

- non-privileged KRI edits create approval requests instead of mutating immediately
- vendor-link changes (`linked_vendor_ids`) are stored in the same approval payload and are only applied when that approval is approved
- approval execution locks the approval row, validates stored `old` values against the current target state, and auto-rejects stale edits before mutating the target
- KRI vendor-link staleness is preflighted before ordinary KRI fields are applied, so a rejected stale approval cannot partially mutate a KRI

### 5.4 Self-Approval Prevention

- Users **cannot approve their own requests**
- If the primary approver (owner) is the requester, it escalates to Department Head
- If Department Head is also the requester, it escalates directly to Privileged
- API approval authorization enforces this rule; UI flags mirror backend (`can_approve=false` when requester)

### 5.5 Pending Queue Semantics

- Users with approval-resolution authority (`CRO`, `Risk Manager`) see pending statuses: `PENDING` + `PENDING_PRIVILEGED`.
- Non-privileged users see pending items by combined predicate:
  - own requests with status in `{PENDING, PENDING_PRIVILEGED}`, plus
  - items where they are `primary_approver_id` and status is `PENDING`.
- Approval list/detail payloads include backend-computed row actions:
  - `can_approve`
  - `can_reject`
  Frontend must consume these flags directly rather than inferring from role.

### 5.6 Request Cancellation

| Status | Who Can Cancel | Result |
|--------|---------------|--------|
| `PENDING` | Request creator OR approval-resolution authority | Status → `CANCELLED` |
| `PENDING_PRIVILEGED` | Request creator OR approval-resolution authority | Status → `CANCELLED` |
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
| **KRI** | (none - inherits from linked Risk) | Value changes may require approval; vendor-link changes are included in the KRI edit approval payload for non-privileged users |

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

### 6.3 Approval Scenario Policy

Approval scenarios configured in Risk Hub are live runtime policy for newly created approval-backed mutations:

- `requires_approval=false` lets the authorized original mutation apply directly when the endpoint can safely apply the change without an approval record.
- `approver_roles` is snapshotted onto the approval request and controls who can approve or reject that request. Existing legacy approval requests without a scenario snapshot keep the historical approval-resolution fallback.
- Seeded scenario keys cover risk/control/KRI deletes, priority risk edits, control edits, KRI value submissions, KRI edits, and KRI history corrections.

### 6.4 Special Cases

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
| **Control Owner** | The control they own + linked-risk workflows for that control, subject to endpoint permission checks |
| **KRI Reporting Owner** | The KRI they own + its linked risk, including related linked-control workflows when endpoint permission checks pass |

> [!NOTE]
> Ownership helpers establish cross-department scope. They are not a substitute for normal write permissions. Mutation endpoints still enforce the resource write permission and any target-side access checks required by the workflow.

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
| `POST /risks/{id}/controls` | `risks:write` + risk access (ownership OR department) + control access (control ownership OR department) | No |
| `DELETE /risks/{id}/controls/{id}` | `risks:write` + risk access (ownership OR department) + control access (control ownership OR department) | No |

> [!NOTE]
> Linking/unlinking controls is **not subject to approval** because:
> - User must already have write permission
> - It's metadata management, not entity modification
> - Both entities must be accessible to the user
> - Ownership on one side does not grant arbitrary cross-department linking; the other side must still be in scope by department or its own ownership rule

---

## 8. Quick Reference Tables

### 8.1 Who Can Create Entities

| Entity | Who Can Create | Default Department |
|--------|----------------|-------------------|
| Risk | Users with `risks:write` | Creator's department |
| Control | Users with `controls:write` | Creator's department |
| KRI | Users with `risks:write` | Inherits from linked Risk |

### 8.2 Who Can Delete (Archive) Entities

| Entity | Archive Permission | Immediate Archive | Requires Approval |
|--------|---------------------|-------------------|-------------------|
| Risk | `risks:delete` | Users with approval-resolution authority | Non-resolvers: creates ApprovalRequest |
| Control | `controls:delete` | Users with approval-resolution authority | Non-resolvers: creates ApprovalRequest |
| KRI | `risks:delete` | Users with approval-resolution authority | Non-resolvers: creates ApprovalRequest |
| Vendor | `vendors:delete` | Immediate | No |
| Vendor SLA | `vendors:delete` | Immediate | No |

> [!NOTE]
> Deletion is implemented as **soft-delete (archival)** to preserve audit trails.
> - Risks: `status = 'archived'`
> - Controls: `status = 'archived'`
> - KRIs: `is_archived = true`, `archived_at`, `archived_by_id`
> - Vendors: archive truth is `is_archived=true`; `status='inactive'` is a legacy/UI alias.
> - Vendor SLAs: `is_archived = true`, `archived_at`, `archived_by_id`
> - Non-privileged risk deletions use the shared **high-risk** escalation rule: `is_priority = true` or `net_score >= high_risk_min_net_score` requires privileged follow-up after primary approval.
> - Vendor archive truth: is_archived=true. Restore is the only lifecycle mutation allowed while archived; edit, link/unlink, and issue vendor-context/link mutations reject with conflict semantics.

### 8.3 Archived Visibility Defaults and Restore

| Surface | Default Behavior | Opt-in Behavior |
|--------|-------------------|-----------------|
| Risks list/search | Archived hidden | `include_archived=true` includes archived risks |
| Controls list/search | Archived hidden | `include_archived=true` includes archived controls |
| KRIs list/detail/history | Archived hidden | `include_archived=true` allows archived KRIs within read scope |
| Vendors list/search | Archived hidden | `include_archived=true` includes `is_archived` rows |
| Vendor SLA list | Archived hidden | `include_archived=true` includes archived SLAs |

| Restore Endpoint | Required Permission | Restore State |
|------------------|---------------------|---------------|
| `POST /api/v1/risks/{id}/restore` | `risks:delete` | `status='active'` |
| `POST /api/v1/controls/{id}/restore` | `controls:delete` | `status='active'` |
| `POST /api/v1/kris/{id}/restore` | `risks:delete` | `is_archived=false`, clear archive metadata |
| `POST /api/v1/vendors/{id}/restore` | `vendors:delete` | `is_archived=false`, clear archive metadata (`status='active'` as backward-compat alias) |
| `POST /api/v1/vendor-slas/{id}/restore` | `vendors:delete` | `is_archived=false`, clear archive metadata |

### 8.4 Approval Action Decision Tree

```
User requests action (DELETE or EDIT sensitive field)
                │
                ▼
┌───────────────────────────────────────┐
│ Does user have approval-resolution    │
│ authority?                            │
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
| KRI Reporting Owner | Submit value | Always creates approval; high-priority linked risks also require privileged follow-up |
| Risk Owner (fallback) | Submit value | Always creates approval; high-priority linked risks also require privileged follow-up |
| Approval resolver (CRO/Risk Manager) | Submit value | Never (immediate) |

Additional KRI value rules:
- Reporting period selection uses the backend KRI history clock and the latest closed required period.
- Direct privileged writes are locked on the parent KRI before creating history.
- KRI collection `can_create` is true only when the caller has `risks:write` and at least one non-archived parent risk accepted by the KRI create endpoint.
- Duplicate period writes return `409`; duplicate/stale approved submissions are auto-rejected during approval execution.

### 8.6 Control Execution Logging

| Logger | Permission Required | Department Scope |
|--------|---------------------|------------------|
| Control Owner | `controls:execute` | Can log own controls (cross-dept) |
| Department Member | `controls:execute` | Department controls only |
| GLOBAL user with `controls:execute` | `controls:execute` | All controls |

Default seeded roles with `controls:execute`: `cro`, `risk_manager`, `compliance`, `internal_audit`, `actuarial`, `department_head`, `employee`.
The canonical RBAC seed contract and the idempotent permission-convergence script must stay aligned on that same role set.

Execution creation is locked on the parent control row. Only active and draft controls are executable; inactive and archived controls reject new execution logs with `409 Conflict`. Both `/api/v1/executions` and `/api/v1/controls/{id}/executions` use the same next-scheduled calculation and the same department-or-control-owner access policy. Generic and control-scoped execution history is ordered by `executed_at DESC, id DESC`, and generic execution list/detail/create responses filter linked risk names through canonical risk visibility before serialization.

### 8.7 Notification Types (Stable Keys)

Notification types are stable string keys shared across backend model, backend API schemas, and frontend TypeScript unions.

**Core types:**
- Approval workflow: `approval_pending`, `approval_resolved`, `approval_cancelled`
- KRI deadlines/breaches: `kri_due_soon`, `kri_due_tomorrow`, `kri_overdue`, `kri_near_breach`, `kri_breach_detected`
- Questionnaires: `questionnaire_sent`, `questionnaire_due_soon`, `questionnaire_overdue`, `questionnaire_submitted`, `questionnaire_clarification_requested`
- Issues: `issue_assigned`, `issue_due_soon`, `issue_overdue`, `issue_exception_requested`, `issue_exception_approved`

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
| VENDOR_ASSESSMENT | **Reserved** for future vendor extended domains |
| VENDOR_INCIDENT | **Reserved** for future vendor extended domains |
| VENDOR_SLA | **Reserved** for future vendor extended domains |
| VENDOR_REMEDIATION | **Reserved** for future vendor extended domains |
| ISSUE | CREATE, UPDATE, STATUS_CHANGE |
| ISSUE_REMEDIATION | CREATE, UPDATE, STATUS_CHANGE |
| ISSUE_EXCEPTION | CREATE, UPDATE, APPROVE, STATUS_CHANGE |

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
- Issues export includes canonical source metadata (`source_type`, `source_id`) plus human-readable source display/source-link labels. Existing linked entity IDs and names remain present for traceability.

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
- Risks, Controls, KRIs, and Vendors unified exports apply scope after as-of replay and row rehydration. The final row state, not the row selected before replay, is authoritative.
- Issues exports are fetch-time scoped and do not use as-of replay; their row scope is enforced at fetch time plus explicit issue filters.
- When a caller supplies an explicit `department_id`, that filter is strict after replay for risks, controls, KRIs, and vendors. Ownership/reporting exceptions do not override an explicit department filter.
- Without an explicit `department_id`, scoped exports preserve actor-visible rows, including direct risk/control/vendor ownership, KRI reporting-owner risk visibility, and linked-control owner risk visibility.
- Legacy/peripheral report exports use the same department-validation context: summary exports count actor-visible risks and controls, issue exports reject out-of-scope explicit departments, and audit-trail exports include visible control executions while filtering linked risk labels through canonical risk visibility.

### 10.4 Dashboard Visibility

- Unfiltered dashboard summaries, risk distributions, risk drilldowns, risk trends, KRI breach trends, control trends, and vendor metrics aggregate rows visible to the actor rather than department rows alone.
- Dashboard explicit `department_id` filters remain strict. Ownership/reporting exceptions do not include rows outside the requested department.
- Department filter UI is backend-capability driven through `DashboardOverviewCapabilities.can_use_department_filter`.

### 10.5 Archived/Inactive Semantics

- Risks/Controls: archived items included when status filter is `archived`
- KRIs: archived items included when status filter is `archived`
- Vendors: archived semantics use `is_archived`

### 10.6 Monitoring Status in Exports

- Controls export accepts `monitoring_status` and includes:
  - `Monitoring Status`
  - `Latest Execution Result`
  - `Latest Executed At`
  - `Days Since Last Execution`
- KRIs export accepts `monitoring_status` and includes:
  - `Monitoring Status`
  - `Required Due Date`
  - `Days Overdue`
- Export filtering uses the same canonical backend-derived monitoring status model as list/detail views.

### 10.7 Specialized CSV Exports

Specialized report exports are CSV:
- `/api/v1/reports/summary/export?format=csv`
- `/api/v1/reports/audit-trail/export?format=csv`
- `/api/v1/vendor-reports/annual?format=csv`
- `/api/v1/vendor-reports/dora-register?format=csv`

Vendor annual and DORA report endpoints also accept optional `department_id`. Without an explicit department filter, reports include every active vendor visible to the actor, including direct cross-department outsourcing-owner exceptions. With an explicit `department_id`, the filter is strict: a department outside the caller's scope is rejected and directly owned vendors in other departments are not included in the selected department's evidence export. The Vendor Reports UI reads backend report capabilities before showing downloads or department filters.

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

Remediation completion invariant:
- A remediation is complete only when `status=completed`, `progress_percent=100`, and `completed_at` is present or normalized by the workflow action.
- `remediation_status=completed` normalizes progress to `100` and sets `completed_at` if missing.
- `progress_percent=100` normalizes status to `completed` and sets `completed_at` if missing.
- Contradictory payloads return `409 Conflict`, including `progress_percent=100` with `active|blocked`, or `remediation_status=completed` with explicit progress below `100`.
- If a `ready_for_validation` issue is updated below complete progress, it moves back to `in_progress`; existing `completed_at` is preserved.

Workflow mutation contract:
- `PATCH /api/v1/issues/{id}` does **not** allow `status` updates.
- Status changes are allowed only through workflow endpoints:
  - `POST /api/v1/issues/{id}/assign`
  - `POST /api/v1/issues/{id}/start-remediation`
  - `POST /api/v1/issues/{id}/update-progress`
  - `POST /api/v1/issues/{id}/close`
  - `POST /api/v1/issues/{id}/revoke-exception` (exception lifecycle)

### 11.2 Scope and Non-Leaky Access

- Issue reads are backend-scoped by department visibility plus ownership exception paths, including issues linked directly to KRIs where the actor is the KRI reporting owner. The direct KRI reporting-owner issue path is read-only; issue mutations still require department, issue-owner, risk-owner, or control-owner scope in addition to `issues:write`.
- Out-of-scope issue reads return `404` (not `403`) to prevent resource leakage.
- Backend remains source of truth for authorization; frontend only mirrors gating.
- Owner assignment (`create`, `patch owner_user_id`, `assign`) is allowed only when owner has global scope or belongs to the issue department.
- Department reassignment is blocked when existing links would become cross-department inconsistent.

### 11.3 Deadline and Exception Semantics

- Due-soon and overdue notifications are generated by scheduled deadline checks.
- KRI reporting reminders dedupe by KRI, notification type, and reporting period text, so a reminder from an earlier period does not suppress a later period inside the lookback window.
- KRI breach reminders dedupe by the current breach direction/threshold message, so a materially different breach state can notify even when an older breach notification exists.
- High-severity overdue issues generate escalation notifications.
- Approved exceptions suppress issue overdue/open dashboard counting while active.
- Requesting a new issue exception is rejected while an approved, unexpired exception is already active for the issue.
- Expired exceptions are auto-marked `expired`; closed issues can be re-opened when remediation is incomplete.
- Expired exceptions do not reopen closed issues whose remediation is complete under the shared completion invariant.
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
- `execution` creates `source_type=control_execution`, `source_id=<execution id>`, and an `IssueLink.execution_id`.
- `kri` creates `source_type=kri_breach`, `source_id=<kri id>`, and an `IssueLink.kri_id`.
- `risk`, `control`, and `vendor` contextual issues use `IssueLink` for the concrete entity and do not store misleading concrete source IDs.
- Raw issue create/update accepts non-manual source metadata only when the source is visible and can be backed by the matching issue link. `manual` and `audit` issues cannot carry arbitrary `source_id` values.
- Issue list/detail responses expose `source_display` and `source_link` from the explicit `IssueLink.is_source_link` provenance marker. For manual contextual risk/control/vendor issues, the contextual link is marked as the source while `source_type` remains `manual`; ordinary links added later to manually created issues are not source links.
- The current source link cannot be deleted until source metadata is changed or cleared; older source links and ordinary manual links remain contextual traceability and can be unlinked.
- Linked risk/control filters include derived contexts. A risk filter matches direct risk links, KRI parent risks, control-linked risks, and execution parent control risks. A control filter matches direct control links and execution parent controls. Unreadable linked filter targets return an empty result set rather than leaking existence.
- Vendor links support direct `vendor_id` in `IssueLink`.
- Inactive vendors cannot be used as contextual issue sources or added as issue vendor links; callers must restore the vendor first.
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

Vendor detail-specific behavior:
- linked risks, linked controls, and linked KRIs render as risk-detail-style card grids with separate archived groups
- `Link Existing` and `Manage Existing Links` mutate vendor links only when vendor edit access is allowed
- `Add Risk` navigates to `/risks/new?vendor_id=:id&return_to=/vendors/:id`
- `Add Control` navigates to `/controls/new?vendor_id=:id&return_to=/vendors/:id`
- `Add KRI` navigates to `/kris/new?vendor_id=:id&return_to=/vendors/:id`
- successful create returns to vendor detail with a confirmation banner and deep link to the created entity
- vendor-context KRI create is transactional: requested vendor assignment and optional parent vendor-risk linking succeed or fail as one save
- KRI edit requests from detail preserve the current KRI state until approval resolves when the user is not allowed to mutate immediately

Register grouped-view behavior:
- Risks, Controls, Issues, and KRIs expose `By Vendor` using readable linked-vendor summaries from backend list payloads.
- Vendors expose `By Flag` using multi-membership buckets derived from `dora_relevant`, `supports_important_core_insurance_function`, and `is_significant_vendor`.
- Unreadable linked vendors must be omitted from grouped views; items with no readable linked vendors fall back to the unlinked bucket.

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

## 12. Risk Assessment Questionnaires

Risk questionnaires are risk-assessment workflows attached to a parent risk.

### 12.1 Visibility and Capabilities

- Questionnaire read access delegates to canonical risk visibility (`can_read_risk_id`).
- Users who can read a risk through ownership or linked-entity exceptions can read questionnaire history for that risk.
- Acting on a questionnaire remains narrower than reading: the assigned risk owner or the department head for the risk department can open, save draft, submit, and respond to clarifications.
- RM/CRO users with canonical risk read access can request clarifications for submitted questionnaires.
- Questionnaire inbox rows and shell-summary questionnaire counts use the same open-questionnaire action policy as the inbox endpoint.
- List/detail responses expose additive `capabilities` metadata (`can_open`, `can_save_draft`, `can_submit`, `can_request_clarification`, `can_respond_to_clarifications`) so UI action visibility mirrors backend authority.
- Risk detail responses expose `RiskCapabilities.can_send_questionnaire` for single-risk questionnaire send affordances.

### 12.2 Lifecycle and Uniqueness

- Normal lifecycle: `sent` -> `in_progress` -> `submitted`; clarification requests are tracked separately on submitted questionnaires.
- Only one open questionnaire (`sent` or `in_progress`) may exist per risk. This is enforced by both a locked send path and a partial unique database index.
- Single-send and batch-send use the same workflow helper and return/record the same skip reason when an open questionnaire already exists.
- `GET /questionnaires/{id}` is read-only; `/open` is the explicit read-adjacent transition and is idempotent for eligible actors.
- Draft/submit after submission return `409`.

### 12.3 Notifications and Deadlines

- Sent and clarification notifications continue to point users to the parent risk workflow.
- Deadline reminder dedupe is per questionnaire instance, so a later questionnaire for the same risk can generate its own due-soon or overdue reminder.
- Notification navigation remains risk-based (`resource_type="risk"`, `resource_id=<risk_id>`).

---

## 13. Committee Quarterly Comparisons

- `current_quarter` must not be later than the actual current quarter.
- `compare_quarter` must be strictly before the selected `current_quarter`.
- Live snapshot metrics are used only for the actual in-progress current quarter.
- Completed selected quarters use stored quarterly snapshots; historical or future labels never receive live current metrics.
- Department-scoped users resolve department snapshots by their scoped department; global snapshots are not a fallback for scoped historical comparisons.
- Period metrics remain numeric and comparable even when snapshot metrics are unavailable.
- Snapshot metric deltas use `direction="unknown"` with `N/A`/dash rendering when either side is missing, and `snapshot_info` reports availability, sources, missing quarters, and missing metric keys.
- Available period choices are scoped to the user and always include the current year plus the default previous-quarter year.

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
| `critical_risk_min_net_score` | 16 | Critical risk threshold |

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
- Successful `POST /api/v1/admin/logs/config` persists the values and reapplies log rotation to the current backend process immediately.

`GET /api/v1/admin/logs/config` returns canonical fields.

---

*Document generated from codebase analysis. See individual model files for authoritative definitions.*
