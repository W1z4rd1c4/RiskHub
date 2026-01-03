# Phase 7 Permission Audit (User Management and RBAC)

## Summary
- The directory webhook now supports HMAC signatures, but the default empty secret makes it effectively unauthenticated in the default config.
- JWT signing still uses a placeholder secret by default, which allows token forgery if not overridden.
- Several permission mismatches remain between seed data, backend enforcement, and frontend gating (approvals and default role selection).

## Scope
- Backend RBAC model and enforcement: roles/permissions, auth, department scoping
- API endpoints: auth, users, controls/risks/kris, reports, executions, approvals, departments, dashboard, directory sync
- Frontend permission usage: AuthContext, usePermissions, PermissionGate, navigation/user management UI
- Seed data and role mappings

## How Permissions Work (Current Implementation)
- Roles and permissions are stored in roles, permissions, and role_permissions; current user responses include a flattened `resource:action` list derived from role permissions (`backend/app/api/v1/endpoints/auth.py:63`, `backend/app/schemas/user.py:63`).
- Backend enforcement uses `require_permission(resource, action)` for some endpoints (reports) and role-based checks like `can_manage_users` and `can_resolve_approvals` (`backend/app/core/security.py:119`, `backend/app/core/permissions.py:83`).
- Department scoping is enforced by `get_user_department_ids` and `check_department_access`, with privileged roles seeing all departments and unassigned items restricted to privileged users (`backend/app/core/permissions.py:8`).
- Frontend uses `AuthContext.hasPermission` as the single source of truth and `usePermissions` for role-based helpers; approvals UI uses `canResolveApprovals` derived from permissions (`frontend/src/contexts/AuthContext.tsx:88`, `frontend/src/hooks/usePermissions.ts:9`).
- Seed data defines the available permissions and the role mappings (`backend/app/db/seed.py:26`).

## Findings (Detailed)

### CRITICAL (Must Fix)
- **[backend/app/api/v1/endpoints/directory.py:45] Webhook signature verification is skipped when WEBHOOK_SECRET is empty (default).**
  - What is happening: The webhook verifier returns early if `settings.webhook_secret` is empty and logs a warning. Config default sets `webhook_secret` to an empty string (`backend/app/core/config.py:27`), so the public webhook endpoint accepts unsigned payloads by default.
  - Implications: Anyone who can reach `/directory/webhook` can create/update/deactivate users and reassign departments/managers. This is a direct RBAC bypass and enables privilege escalation.
  - Fix: Treat missing WEBHOOK_SECRET as a hard failure in non-dev environments (reject with 401/500), and require the secret to be set at startup. Consider network allowlisting in addition to HMAC.

### HIGH (Should Fix)
- **[backend/app/core/config.py:17] JWT secret defaults to a placeholder value.**
  - What is happening: `secret_key` has a fixed default string and is used for JWT signing/verification (`backend/app/core/security.py:44`).
  - Implications: If the environment variable is not set, tokens can be forged, which is a full authentication and RBAC compromise.
  - Fix: Fail fast on startup when `secret_key` is unset or equals the placeholder. Require a strong, env-provided secret in all non-test deployments.
- **[backend/app/db/seed.py:26, backend/app/db/seed.py:47, frontend/src/hooks/usePermissions.ts:26] approvals:write is referenced but not defined in PERMISSIONS.**
  - What is happening: ROLE_PERMISSIONS grants `approvals:write` to risk_manager, and the UI uses it for gating, but PERMISSIONS does not define it so it is never attached to users.
  - Implications: Risk managers can still approve via API (role-based), but the UI hides resolve actions. This creates inconsistent behavior and obscures real authorization state.
  - Fix: Add `approvals:write` to PERMISSIONS (and seed it), or remove the permission check and standardize on `can_resolve_approvals` everywhere.
- **[frontend/src/pages/UserNewPage.tsx:43, backend/app/db/seed.py:13] Default role selection expects "employee", which is not seeded.**
  - What is happening: The new user form defaults to role name `employee`, then falls back to the first role returned by the API if missing.
  - Implications: Role ordering is undefined; the fallback can default to a privileged role, creating over-privileged accounts.
  - Fix: Add an `employee` role in seed data or explicitly default to a safe known role (e.g., control_owner). If not found, force the user to choose.

### MEDIUM (Consider)
- **[backend/app/api/v1/endpoints/approvals.py:81] KRI approval request creation does not enforce department access.**
  - What is happening: Risk and control approval requests validate department access, but the KRI branch does not check access via the linked risk's department.
  - Implications: A user can create approval requests for KRIs outside their scope, exposing metadata and enabling cross-department workflow spam.
  - Fix: Load the KRI's linked risk and apply `check_department_access(risk.department_id, current_user)` before creating the request.
- **[backend/app/api/v1/endpoints/reports.py:60, backend/app/db/seed.py:38] reports:export exists but is not enforced.**
  - What is happening: Export endpoints require only `reports:read`; `reports:export` is never checked.
  - Implications: Any role with read access can export data, even if export should be more restrictive. This undermines permission granularity.
  - Fix: Require `reports:export` on export endpoints, or remove the unused permission to avoid false assurance.

## Test Coverage Gaps
- No tests assert that webhook requests are rejected when WEBHOOK_SECRET is unset in non-dev configurations.
- No tests cover department scoping for KRI-based approval requests.
- No tests validate that approvals:write is present in seeded permissions or that the UI can resolve approvals when it should.
- No tests enforce safe default role selection in the user creation flow.
- No tests differentiate reports:read from reports:export on export endpoints.

## What Is Working Well / Recent Fixes Observed
- Directory webhook signature verification exists and is tested when a secret is configured (`backend/tests/test_directory_sync.py:152`).
- Department scoping for control-trends returns empty results for users with no departments (`backend/app/api/v1/endpoints/dashboard.py:295`).
- Department scoping and privileged handling for unassigned items now align with Phase 7 requirements (`backend/app/core/permissions.py:22`).
- Manager department inheritance is implemented in `get_user_department_ids` (`backend/app/core/permissions.py:76`).
- Frontend permission checks are centralized through `AuthContext.hasPermission` (`frontend/src/hooks/usePermissions.ts:5`).
