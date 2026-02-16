---
title: User and Access Governance Runbook
version: "2.0"
last_updated: "2026-02-16"
audience: admin
source_of_truth: "frontend/src/pages/UsersPage.tsx + frontend/src/components/access/AccessEditModal.tsx + backend/app/api/v1/endpoints/access.py + backend/app/api/v1/endpoints/users/"
summary: "Operational runbook for user lifecycle, role/scope governance, auditable access edits, and incident-safe access changes."
tags:
  - access
  - workflow
  - audit
  - troubleshooting
  - settings
---

# User and Access Governance Runbook

## Overview

This runbook covers identity lifecycle and access governance for platform administrators. It is written for the `admin` role and focuses on **safe, auditable, reversible** access operations.

Primary surfaces:

- Access Management UI: `/users`
- Admin Console Sessions (for revocation): `/admin` → Sessions

In RiskHub, user access is a combination of:

- **Role** (what responsibilities a user can take)
- **Permissions** (`resource:action` capabilities)
- **Access scope** (`global`, `department`, `manager`) which shapes default visibility
- **Department and manager assignment** (routing and delegated visibility)

This means most “access bugs” are really one of:

- wrong role
- wrong scope
- wrong department/manager assignment
- stale session (changes made, but user did not re-authenticate)

## When To Use This

Use this runbook when you need to:

- add a new user (or activate/deactivate an existing user)
- change role/department/manager assignments
- adjust access scope (admin/CRO-only capability)
- resolve an access incident (user can’t see a module, can’t edit, sees too much)
- perform an emergency containment action (disable account, revoke sessions)

Do not use this runbook to “fix business ownership disputes”. If a ticket is really “who should own this risk/control”, that is a business decision. Your role is to keep access consistent with the decided policy and to provide evidence when behavior is surprising.

## Preconditions and Safety

Before changing any access attribute:

1. Confirm the identity you are changing (user id + email).
2. Capture the request context:
   - what route is failing (for example `/vendors`)
   - what action fails (read vs write)
   - when it started
3. Identify the blast radius:
   - expanding scope to `global` can change visibility across the entire org
   - role changes can unlock write actions
   - department changes can break reporting and ownership routing

Safety rules:

- Prefer the smallest change that resolves the incident.
- Avoid “temporary global” unless you have explicit approval; it often becomes permanent.
- Record the *previous* values (role, scope, department, manager) so rollback is immediate.
- After deactivating a user for containment, consider session revocation as well (see procedure).

## Step-by-Step Procedure

### A) Add a new user

1. Go to `/users`.
2. Click **Add user** and open `/users/new`.
3. Populate:
   - full name
   - email
   - initial password (per your org policy)
   - role (start with the least-privileged role that fits)
   - department (if the user should be scoped)
4. Create the user.

Verification:

- The user appears in `/users`.
- The user status shows as active (if “active immediately” was selected).

Rollback:

- If created incorrectly, deactivate the user and revoke sessions (if any exist).

### B) Update a user’s profile (name/email/role/department)

1. From `/users`, open the user detail page.
2. Change one category at a time:
   - identity fields (name/email) are low-risk but still audited
   - role/department are high-impact
3. Save.

Verification:

- The new values are visible on refresh.
- The user’s role display name matches the intended selection.

Rollback:

- Restore prior role/department values and save.

### C) Update access via Access Edit (role/department/manager/scope)

Use the Access Edit modal when you need to manage access attributes quickly.

1. In `/users`, locate the user.
2. Open **Edit access**.
3. Apply the minimal changes:
   - role: select the target role
   - department: set only if the user should be scoped by org unit
   - manager: set if the user should inherit manager-scoped visibility
   - scope: only adjust if you are authorized; changing to `global` is a significant expansion
4. Save.

Verification:

- The list reflects the updated values.
- If scope changed, confirm it is visible in the user row (access mode).

Rollback:

- Re-open Access Edit and restore the prior values you recorded.

### D) Deactivate / Reactivate a user (account containment)

Use deactivation when:

- access must be removed quickly (security or termination)
- a compromised credential is suspected
- a user should not operate until a policy dispute is resolved

Procedure:

1. In `/users`, locate the user.
2. Trigger deactivate and confirm in the dialog.
3. If the case is security-sensitive, also revoke sessions:
   - go to `/admin` → Sessions
   - identify sessions for the user
   - revoke sessions

Verification:

- User status indicates deactivated.
- Sessions are revoked (if performed).

Rollback:

- Reactivate if the deactivation was accidental, then instruct the user to re-authenticate.

## Verification Checklist

After any access change, confirm:

- the change is reflected in `/users` after refresh
- the user can re-authenticate (if you changed role/scope significantly)
- the user sees exactly the expected modules (no more, no less)
- auditability exists (audit logs show a clear event trail)

If you cannot verify user-facing outcomes directly, capture:

- what you changed (before/after)
- the route the user should test
- the expected success criteria (one sentence)

## Rollback Strategy

Rollback should be immediate and mechanical:

1. Revert to last known-good values (role, department, manager, scope).
2. If containment actions were taken:
   - reactivate only with explicit approval
   - re-issue credentials if compromise is suspected (outside RiskHub scope if handled by SSO/IdP)
3. Document:
   - what was reverted
   - why
   - what risk remains

If a rollback is not possible without deeper investigation, stop and escalate. Access changes are not the right place for improvisation.

## Troubleshooting

### “I changed access but the user still can’t see it”

Checks:

- was the change saved successfully?
- is the user using a stale session?
- is the missing module permission-gated? (for example `vendors:read`, `issues:read`)
- is scope restricting visibility even with the permission?

Actions:

- ask the user to log out and log back in
- re-check role/scope in `/users`
- if it still fails, capture the exact error (403/forbidden) and request ID and correlate with logs

### “The user sees too much data”

Checks:

- was scope expanded to `global`?
- is the user assigned a privileged role unexpectedly?

Actions:

- revert scope/role to last known-good immediately
- revoke sessions if the exposure was security-sensitive
- hand off to security or business owner depending on severity

### “I can view `/users` but can’t edit access”

This can happen when a user can view the users page but is not authorized to mutate access.

Actions:

- confirm you are operating as `admin` (not a privileged non-admin)
- confirm the mutation is allowed for your role
- if it should be allowed but is forbidden, escalate as an auth regression

## Escalation and Handoff

Escalate to engineering/security when:

- authorization boundaries behave inconsistently (same user, same route, different outcomes)
- audit trails are missing or incomplete
- session revocation fails during containment

Handoff package:

- who was affected (user id/email)
- what was changed (before/after)
- what route/action is failing
- timestamps + request IDs (if available)
- what you verified and what remains unknown

## Related Documentation

- Admin onboarding baseline: [Admin Onboarding](./getting-started.md)
- Admin Console operations (sessions/logs/audit): [Admin Console](./console.md)
- Workflow support patterns: [Approvals Support](./approvals.md)
- Evidence exports: [Reports and Evidence Exports](./reports.md)

Treat these operations as high risk:

- role reassignment
- scope expansion to global
- department reassignment for active owners
- manager-chain changes affecting delegated visibility

## Standard Change Workflow

1. Locate user and review current access profile.
2. Confirm requested change source and approval context.
3. Apply minimal change.
4. Verify effective permissions after save.
5. Check audit log entry and timestamp.

## Deactivation Procedure

Before deactivation:

- identify owned entities and pending workflow items
- ensure ownership handoff is complete
- confirm no orphaned governance responsibilities remain

Then deactivate and verify no unintended access artifacts remain.

## Safe Rollback Strategy

If a change causes scope/permission regression:

- revert to last known-good role/scope immediately
- capture incident context
- run impact review for affected entities and approvals

## Troubleshooting

### User reports missing data after role change

Check scope first, then department assignment, then ownership exceptions.

### User can access too much data

Likely scope escalation or role drift. Reconcile effective permissions against policy.

### Access change not reflected immediately

Confirm save completed, then re-authenticate to refresh session-bound claims.

## Related Documentation

- `./departments.md`
- `./approvals.md`
- `./reports.md`
