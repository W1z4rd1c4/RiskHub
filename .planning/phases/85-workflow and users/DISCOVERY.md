# Phase 85 Discovery: User Types and Access Map

Scope: map current roles, permissions, department scoping, and UI tab access for Overview, Risks, Controls, KRIs, plus adjacent tabs. This informs Phase 85-02 (enhanced user management).

## Role Inventory
RoleType constants (backend/app/models/role.py):
- ceo, cfo, cro, coo
- risk_manager, compliance, legal, internal_audit, actuarial
- department_head, employee, admin, viewer

Seeded roles (backend/app/db/seed.py):
- admin, cro, risk_manager
- actuarial, compliance, internal_audit
- department_head, control_owner, viewer

Mismatches and notes:
- control_owner exists in seed but not in RoleType
- RoleType defines ceo/cfo/coo/legal/employee that are not seeded
- privileged role check uses RoleType.privileged_roles, not seed list

Privileged roles (department-unscoped) in code:
- admin, cro, risk_manager, compliance, legal, internal_audit, actuarial, ceo, cfo
Non-privileged (department scoped):
- department_head, control_owner, viewer, employee, coo

## Permission Model (seeded roles)
Role -> permissions (resource:action):
- admin: *:*
- cro: *:*
- risk_manager: controls:*, risks:*, departments:read, reports:*, users:read, approvals:write
- actuarial: controls:read/write, risks:read, reports:read
- compliance: controls:read/write, risks:read, reports:read
- internal_audit: controls:read, risks:read, departments:read, reports:read
- department_head: controls:read/write, risks:read, departments:read, reports:read
- control_owner: controls:read/write, risks:read
- viewer: controls:read, risks:read, departments:read, reports:read

Notes:
- users:read is only granted to risk_manager, but /users list uses can_manage_users (admin/cro) so this permission is effectively unused.
- departments:write exists in permissions but is not assigned to any non-* roles and there are no write endpoints.

## Department Scoping Rules
- get_user_department_ids:
  - privileged roles -> None (all departments)
  - non-privileged -> [user.department_id] if set, else manager department_id if present, else []
- check_department_access:
  - items with department_id = None are only accessible to privileged roles
  - otherwise department_id must be in get_user_department_ids list
- Most list endpoints apply dept scoping automatically for non-privileged users.

## Backend Access Map

### Overview / Dashboard (backend/app/api/v1/endpoints/dashboard.py)
- Auth only; no explicit permission requirement.
- Department scoping enforced via get_user_department_ids (privileged sees all).
- Supports filters (department_id, risk_level, control status/form), but department_id filter is only effective for privileged users.

### Risks (backend/app/api/v1/endpoints/risks.py)
- list/get: auth only plus department scope (non-privileged filtered to dept).
- create: require risks:write plus dept access.
- update: require risks:write OR risk owner; non-privileged edits to sensitive fields (owner_id, department_id, category, is_priority true->false) create approval request.
- delete: require risks:delete; privileged (admin/cro/risk_manager) archives immediately, others create approval (no non-priv roles have risks:delete currently).
- control linking: requires risks:write plus dept access.

### Controls (backend/app/api/v1/endpoints/controls.py, executions.py)
- list/get: auth only plus department scope.
- create: require controls:write plus dept access.
- update: require controls:write OR control owner; non-privileged edits to critical-linked controls or sensitive fields (control_owner_id, department_id) create approval.
- delete: require controls:delete; privileged archives immediately.
- control execution logging:
  - /controls/{id}/executions (log) is auth only plus dept access (no permission check).
  - /executions (create) requires controls:write.
- control-risk linking requires controls:write plus dept access to both control and risk.

### KRIs (backend/app/api/v1/endpoints/kris.py)
- list/get: auth only plus dept scope via linked risk.
- create/update: require risks:write plus dept access; non-privileged edits to KRIs linked to critical risks create approval (no current role has risks:write without approvals).
- delete: require risks:delete; privileged deletes immediately.
- record value: require risks:write plus dept access; non-privileged limited to current period (grace window).
- history correction: require risks:write; non-privileged creates approval (currently unreachable with existing roles).

### Departments (backend/app/api/v1/endpoints/departments.py)
- list/get only; auth only plus department scoping.
- no create/edit/delete endpoints.

### Users (backend/app/api/v1/endpoints/users.py)
- list/create/update: can_manage_users (admin or cro only).
- get user: admin/cro or self.
- list roles: auth only.
- subordinates: requires can_manage_users or self (department_head cannot list subordinates despite docstring).

### Approvals / Workflow (backend/app/api/v1/endpoints/approvals.py)
- create: auth only plus department access to resource.
- list: approvers (admin/cro/risk_manager) see all; others see only own.
- approve/reject: approvers only.
- cancel: requester only.
- pending count: all for approvers, own for others.

### Governance / Orphaned Items (backend/app/api/v1/endpoints/orphaned_items.py)
- stats: auth only (all users).
- list/detail/resolve: admin/cro only.

### Reports / Exports (backend/app/api/v1/endpoints/reports.py)
- all report endpoints require reports:read.
- department scoping enforced; users with no dept get empty reports.

### Notifications (backend/app/api/v1/endpoints/notifications.py)
- list/read/mark read: current user only.
- trigger KRI deadline check: admin/cro/risk_manager only.

### Audit Trail (backend/app/api/v1/endpoints/executions.py)
- list/get executions: auth only plus department scope.
- create execution: controls:write.

## Frontend Access Map (routes plus gating)

Navigation (frontend/src/components/layout/Sidebar.tsx):
- Always visible: Dashboard, Workflow, Controls, Risks, Risk Appetite (KRIs), Departments, Governance, Audit Trail, Settings
- User Management only shown if canManageUsers (users:write)
- Governance badge only shown for canManageUsers

Tab details:

- Overview (Dashboard):
  - Accessible to all authenticated users.
  - FilterBar uses lookupApi.getDepartments (dept-scoped list).
  - Export summary PDF button always shown; backend requires reports:read (control_owner will 403).

- Risks:
  - New Risk button gated by PermissionGate risks:write.
  - Edit/delete actions on detail page gated by risks:write.
  - Export PDF/Excel always shown; backend requires reports:read.
  - Backend allows risk owners to edit, but UI only checks risks:write (owner-only edits blocked in UI).

- Controls:
  - New Control button gated by controls:write.
  - Edit/delete actions gated by controls:write / controls:delete.
  - Execution logging and risk linking gated by controls:write.
  - Export PDF/Excel always shown; backend requires reports:read.

- KRIs (Risk Appetite):
  - New KRI, record value, edit, delete all gated by risks:write.
  - View is open to all authenticated users.

- Departments:
  - No UI for create/edit; list/detail accessible to all authenticated users (backend scopes to dept).

- Workflow (Approvals):
  - Visible to all.
  - Approve/reject buttons shown only for canResolveApprovals.
  - Cancel shown only for requester.

- Governance:
  - Visible to all; no frontend gating on list/resolve.
  - Non-admin users will hit backend 403 for orphan list/resolve; stats still load.

- Audit Trail:
  - Visible to all; no frontend gating. Backend scopes by dept.

- Notifications:
  - Visible to all; user-specific data.

- Settings:
  - Visible to all; currently static.

- User Management:
  - Nav item only for canManageUsers.
  - /users/new redirects away if no permission.
  - /users/:id is view-only when canManageUsers is false (but backend only allows self).
  - User list fetches /users, which is admin/cro only.

Frontend and backend mismatches:
- Export buttons shown to roles without reports:read (e.g., control_owner).
- Risk owner edit capability exists in backend but is blocked by UI PermissionGate (risks:write only).
- Risk/Control forms call lookupApi.getUsers (GET /users) which is admin/cro-only, so non-admin editors cannot load owner lists.
- Governance page attempts to load orphan list for all users; backend forbids non-admin/cro.

## Role x Tab Access Matrix
Legend: V = view/list, C = create, E = edit/update, D = delete/archive, X = export report, A = approve/reject, R = record KRI value/history correction, Exec = log control execution.
Scope: (all) = all departments, (dept) = scoped to user/manager dept, (own) = own items/requests only.

| Role | Overview | Risks | Controls | KRIs | Departments | Workflow | Governance | Audit Trail | Notifications | Settings | User Mgmt |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| admin | V(all)+X | V/C/E/D(all) | V/C/E/D(all)+Exec | V/C/E/D(all)+R | V(all) | V(all)+A | Stats+List/Resolve | V(all) | V(own)+Trigger | V | V/C/E/Deactivate |
| cro | V(all)+X | V/C/E/D(all) | V/C/E/D(all)+Exec | V/C/E/D(all)+R | V(all) | V(all)+A | Stats+List/Resolve | V(all) | V(own)+Trigger | V | V/C/E/Deactivate |
| risk_manager | V(all)+X | V/C/E/D(all) | V/C/E/D(all)+Exec | V/C/E/D(all)+R | V(all) | V(all)+A | Stats only | V(all) | V(own)+Trigger | V | Hidden/No access |
| compliance | V(all)+X | V(all) | V(all)+C/E | V(all) | V(all) | V(own) | Stats only | V(all) | V(own) | V | Hidden/No access |
| actuarial | V(all)+X | V(all) | V(all)+C/E | V(all) | V(all) | V(own) | Stats only | V(all) | V(own) | V | Hidden/No access |
| internal_audit | V(all)+X | V(all) | V(all) | V(all) | V(all) | V(own) | Stats only | V(all) | V(own) | V | Hidden/No access |
| department_head | V(dept)+X | V(dept) | V(dept)+C/E+Exec | V(dept) | V(dept) | V(own) | Stats only | V(dept) | V(own) | V | Hidden/No access |
| control_owner | V(dept) | V(dept) | V(dept)+C/E+Exec | V(dept) | V(dept) | V(own) | Stats only | V(dept) | V(own) | V | Hidden/No access |
| viewer | V(dept)+X | V(dept) | V(dept) | V(dept) | V(dept) | V(own) | Stats only | V(dept) | V(own) | V | Hidden/No access |

Notes:
- "Hidden/No access" indicates the nav item is hidden and API endpoints reject access (except /users/roles and self view).
- Department scope for non-privileged users is derived from user.department_id or manager.department_id; empty means no data.
- Department endpoints do not enforce departments:read permission; any authenticated user can access them (still scoped).

## Gaps and Notes for Phase 85-02 (User Management Enhancement)
- Managers (department_head) cannot list their subordinates or view their rights; /users/{id}/subordinates requires admin/cro.
- Risk managers cannot access user list or edit roles despite users:read permission and being privileged; can_manage_users only allows admin/cro.
- No endpoint or UI exists to create departments or reassign users across departments in bulk; department updates require admin/cro and departments cannot be created via API.
- UI does not expose a clear per-tab permission matrix to users; UserDetail page only shows a generic "Full access" vs "Scoped" message.
- Export buttons and governance list actions are visible to roles that will receive backend 403s; should be gated or messaged.
- Risk owners without risks:write cannot edit risks in the UI despite backend support.
- User lookup for risk/control assignment uses /users list (admin/cro only), blocking non-admin roles from assigning owners.
- Department and privilege definitions are split between RoleType and seed roles (missing control_owner, extra CEO/CFO/COO/legal); this complicates consistent role mapping.
