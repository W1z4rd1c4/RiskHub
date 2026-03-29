---
title: User and Access Governance Runbook
version: "2.3"
last_updated: "2026-03-29"
audience: admin
source_of_truth: "frontend/src/pages/UsersPage.tsx + frontend/src/components/access/AccessEditModal.tsx + backend/app/api/v1/endpoints/access.py + backend/app/api/v1/endpoints/users/"
summary: "Operator-safe runbook for adding users, changing access, deactivating accounts, and troubleshooting common access incidents."
tags:
  - access
  - workflow
  - audit
  - troubleshooting
  - settings
---

# User and Access Governance Runbook

## Overview

Use this runbook for safe, auditable, reversible admin work in `/users`.

Primary surfaces:

- `/users`
- `/admin` -> **Sessions**
- `/admin` -> **Audit logs**

Contract note:

- `/users` remains the single operator route
- `/access/users*` backs the access-management views on that route
- `/users/lookup` is picker/search only and not the operator page contract
- `/users` no longer uses a standalone user detail route; identity and access edits stay on `/users` via the access edit modal
- manual user lifecycle actions on `/users` are Admin-only
- access-management role data now comes from `/access/roles`; legacy lifecycle role/detail endpoints remain Admin-only
- mode precedence on `/users` is explicit: global access view, then department access view, then read-only directory view when `users:read` exists without access-management authority

Most access incidents come from one of four causes:

- wrong role
- wrong access scope
- wrong department or manager assignment
- stale session after a change

## When To Use This

Use this runbook when you need to:

- add a new user
- update profile or identity fields
- edit role, scope, department, or manager assignment
- deactivate or reactivate a user
- resolve “cannot see module” or “sees too much data” incidents

Do not use this runbook to decide business ownership or policy. Capture the facts and hand those questions off.

## Preconditions and Safety

Before changing access:

1. Confirm the identity you are changing.
2. Capture the route, action, and start time of the incident or request.
3. Record the current role, scope, department, and manager values.

Safety rules:

- use the smallest change that resolves the issue
- avoid temporary `global` scope as a shortcut
- prefer one change at a time
- if the incident is security-sensitive, be ready to revoke sessions after the change

## Step-by-Step Procedure

### Standard access change workflow

1. Open `/users` and review the current access profile.
2. Confirm the requested change and expected outcome.
3. Apply the smallest safe change.
4. Refresh and verify the new values.
5. Ask the user to re-authenticate if role or scope changed.
6. Confirm the audit trail exists.

If a user should not have any `/users` entitlement, expect the route to redirect away rather than render a partial list.

### Add a user

1. Open `/users`.
2. Select the auth-mode-specific CTA shown on `/users`:
   - **Add from AD** in directory-first auth modes (`microsoft_sso`, `hybrid_dev`)
   - in password mode, use **Add user** for manual entry or **Add from AD** for directory import
3. Use the creation flow currently available in the UI:
   - import or external-identity flow
   - direct-entry flow
4. If you imported the user from directory, RiskHub returns to `/users` and opens the access edit modal so you can finish onboarding without leaving the route.
5. Before first use, confirm role, department, active status, and any required identity corrections.
6. Save and verify the user appears in `/users`.

If creation actions are missing or disabled, first confirm that the current session is operating as platform `admin`. Creation and import are least-privilege lifecycle actions and should not be improvised from non-admin sessions. If the actions should be present and still are not, stop and use [Admin Incident Quick Reference](./incident-quick-reference.md).

### Update profile

1. Open the access edit modal from `/users`.
2. Change one category at a time:
   - identity fields
   - role or department
3. Save once. `/users` now sends one transactional `PATCH /api/v1/access/users/{id}` for the modal, so either the whole edit applies or the whole save is rejected.
4. Refresh and confirm the updated values are visible.

Identity fields are an Admin-only lifecycle action. CRO or other privileged reviewers should stay in the access-management scope of the modal and should not expect separate lifecycle/detail endpoints. If an identity validation fails, treat the save as unapplied and fix the validation issue before retrying.

### Edit access

1. In `/users`, open **Edit access**.
2. Update only the fields required:
   - role
   - department
   - manager
   - scope
3. Save once.
4. Refresh and confirm the values in the user row or access panel.

Changing scope to `global` is a significant expansion. Record the reason before saving.

### Deactivate or reactivate a user

Use deactivation for offboarding, containment, or urgent access removal.

1. Locate the user in `/users`.
2. Deactivate or reactivate the account.
3. If the case is security-sensitive, open `/admin` -> **Sessions** and revoke active sessions.
4. Verify the new account status and, if applicable, session revocation.

## Verification Checklist

After any access change, confirm:

- the new values persist after refresh
- the user can re-authenticate if role or scope changed
- the user now sees exactly the intended routes
- the audit trail reflects the change
- you can describe the current state and the intended rollback without guessing

## Rollback Strategy

Use rollback when the change saved correctly but produced the wrong operating outcome.

1. Restore the last known good role, scope, department, and manager values.
2. Revoke sessions if you need stale claims cleared immediately.
3. Document what you reverted and why.

If you cannot describe the rollback in one sentence before acting, stop and escalate.

## Troubleshooting

### “I changed access but the user still cannot see it”

What it usually means:

- stale session
- wrong scope
- wrong department or manager assignment

What to do:

1. Confirm the saved values in `/users`.
2. Ask the user to log out and log back in.
3. Re-check role, scope, department, and manager assignment.
4. If the route still fails, capture the exact error and request ID and escalate.

### “The user sees too much data”

What it usually means:

- scope is too broad
- role is more privileged than intended

What to do:

1. Revert to the last known good role or scope immediately.
2. Revoke sessions if the exposure is security-sensitive.
3. Verify the correction and record the incident.

### “I can view `/users` but cannot edit access”

What it usually means:

- the session is not truly operating as `admin`
- the mutation path is failing or forbidden
- the session has directory or review visibility but not lifecycle authority

What to do:

1. Re-authenticate once.
2. Confirm you still have the `admin` role.
3. If the mutation should be allowed and still fails, escalate as an authorization defect.

### “Add user / Add from AD is disabled”

What it usually means:

- the page loaded the user list, but the auth-mode-specific creation path is in a safe degraded state
- the visible CTA depends on auth mode:
  - `Add from AD` in directory-first modes
  - both `Add User` and `Add from AD` in password mode

What to do:

1. Confirm which auth mode is active so you know whether the expected create action is **Add from AD** only, or both **Add user** and **Add from AD**.
2. Open `/admin` and confirm the Health state.
3. Refresh `/users` once.
4. If the expected creation action is still disabled after a healthy refresh, escalate as an admin-surface or auth/config incident.

## Escalation and Handoff

Escalate when:

- access behavior is inconsistent after a confirmed save and re-authentication
- audit trails are missing
- session revocation fails
- you cannot identify the last known good access state

Handoff package:

- affected user
- route and failing action
- before and after access values
- timestamp and request IDs
- what you verified and what remains unknown

## Related Documentation

- [Admin Incident Quick Reference](./incident-quick-reference.md)
- [Admin Onboarding](./getting-started.md)
- [Admin Console](./console.md)
- [Reports and Evidence Exports](./reports.md)
