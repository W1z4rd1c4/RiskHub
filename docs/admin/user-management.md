---
title: User and Access Governance Runbook
version: "2.5"
last_updated: "2026-09-12"
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
- directory-mode role filters now come from `/users/directory` facet metadata instead of a frontend hardcoded role list
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

`/users/new` now follows the same route-level rule. Sessions without lifecycle authority should be redirected before the page loads onboarding data.

### Add a user

1. Open `/users`.
2. Select the auth-mode-specific CTA shown on `/users`:
   - **Add from AD** in directory-first auth modes (`microsoft_sso`, `hybrid_dev`)
   - **Add user** in legacy password development mode; **Create account** uses native invitations
3. Use the creation flow currently available in the UI:
   - import or external-identity flow
   - direct-entry flow
4. If you imported the user from directory, RiskHub returns to `/users` and opens the access edit modal so you can finish onboarding without leaving the route.
5. Before first use, confirm role, department, active status, and any required identity corrections.
6. Save and verify the user appears in `/users`.

If creation actions are missing or disabled, first confirm that the current session is operating as platform `admin`. Creation and import are least-privilege lifecycle actions and should not be improvised from non-admin sessions. If the actions should be present and still are not, stop and use [Admin Incident Quick Reference](./incident-quick-reference.md).

### Native local account invitations and passwords

In a native installation, **Add user** opens the invitation form in `/users/new`.
Native production admission remains gated by #208. The form works for an Admin with
a password-only session under optional policy or an MFA session under required policy.

Admins choose the account's name, email, role and organization assignments and send
an invitation. The recipient verifies the invitation and chooses the password; admins
do not assign or view permanent passwords. Open **Account lifecycle** on the user row to inspect setup and delivery separately.
Delivery distinguishes pending, sent, failed, expired and cancelled links. Pending accounts cannot sign in.

The installation's MFA policy applies to ordinary users and admins. Required MFA
adds factor setup to enrollment; optional MFA allows password-only accounts. Users
who have enabled MFA must still supply it. A replacement administrator must complete
enrollment before the current last effective administrator can be suspended.

Users manage their own passwords through authenticated change or email reset.
A reset invalidates old sessions and retains enrolled MFA. It cannot recover a lost
factor; the [native recovery procedure](https://github.com/W1z4rd1c4/RiskHub/blob/main/docs/security/identity-recovery.md) requires
independent identity verification and separate offline approval for privileged accounts.
Recovery-pending accounts stay unable to sign in, and recovery never clears a suspension. Native email
changes require mailbox verification. See the
[native credential operator guide](https://github.com/W1z4rd1c4/RiskHub/blob/main/docs/security/identity-local-credentials.md) for API and operator details.

### Native account lifecycle

Open **Account lifecycle** from the account row in `/users`. Confirm the name and
email before each action. The same dialog contains the authorized access edit;
identity lifecycle controls are not available to CRO or read-only directory users.

| Action or state | Meaning and operator response |
| --- | --- |
| Invited | The recipient still needs to choose a password and complete required MFA. |
| Password set | Required MFA setup is incomplete; no application session is available. |
| Setup complete | Enrollment completed; suspension, recovery or other eligibility rules may still prevent sign-in. |
| Delivery pending / sent / failed | Mail status is separate from successful account creation. Refresh status; investigate SMTP/outbox health before reissuing. |
| Resend invitation | Invalidates earlier invitation links and creates a new one. |
| Cancel invitation | Invalidates the pending invitation link without deleting the account. |
| Send password reset link | Requests the governed email reset; the recipient chooses the password. Existing MFA remains required. |
| Suspend account | Revokes sessions and records suspension. Review flagged owned items and manager relationships separately. |
| Resume account | Removes local suspension; it does not bypass enrollment, directory or recovery requirements. |
| Start assisted recovery | Ordinary accounts only. Record the incident, verification method, reason and operation, then authenticate as the acting Admin. |
| Privileged recovery | Follow the [offline two-operator procedure](https://github.com/W1z4rd1c4/RiskHub/blob/main/docs/security/identity-recovery.md). No web override exists. |

A successful invitation or mutation stays reported as completed when the optional
list/status reload or mail delivery fails. **Refresh account status** retries the
read. A timeout or unrecognized response may follow a committed write: inspect the
account and audit record before starting another action; do not repeat blindly.

For assisted recovery, verify identity using the approved procedure; possession of
a mailbox alone is insufficient. Do not paste identity documents into the form.
The recent-auth proof binds the target, authority version, chosen operation and any
proposed email. It stays in memory and is discarded after submission. Recovery
revokes sessions and blocks sign-in until completion; existing suspension survives.

A last-eligible-Admin conflict refreshes capability/status data and retains the
operator's reason for correction. Enroll a replacement eligible Admin first. The
reason field follows the existing audit redaction policy: free text is redacted in
activity/SIEM surfaces. Keep the full incident rationale in the approved incident
system. Permission denial never grants a CRO an Admin lifecycle operation.

Entra profile fields are visibly read-only. Native email is also read-only in the
access edit: users change it in **Account security**, or an authorized Admin starts
verified-address recovery after independent identity verification. RiskHub-owned
business assignments continue through the CRO access workflow.

### Update profile

1. Open the access edit modal from `/users`.
2. Change one category at a time:
   - identity fields
   - role or department
3. Save once. `/users` now sends one transactional `PATCH /api/v1/access/users/{id}` for the modal, so either the whole edit applies or the whole save is rejected.
4. Refresh and confirm the updated values are visible.

Identity fields are an Admin-only lifecycle action. CRO or other privileged reviewers should stay in the access-management scope of the modal and should not expect separate lifecycle/detail endpoints. If an identity validation fails, treat the save as unapplied and fix the validation issue before retrying.

The access row returned by the backend can include action capabilities for the target user. The UI requires those flags. Missing configuration or capabilities disables the corresponding action and offers a reload; it does not grant permission from a local role guess. If a locally privileged session cannot see identity, business-access, or role controls for a row, refresh the row and inspect the backend capability flags before escalating.

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

Manager changes are validated by the backend. The selected manager must exist and be active; inactive directory users must be replaced or deliberately re-enabled through the appropriate lifecycle process before they can become a department manager.

### Deactivate or reactivate a user

Use deactivation for offboarding, containment, or urgent access removal.

1. Locate the user in `/users`.
2. Deactivate or reactivate the account.
3. Security-relevant changes invalidate existing sessions automatically. Use `/admin` -> **Sessions** to inspect the result or revoke sessions for a separate containment action.
4. Verify the new account status. Local suspension survives directory synchronization; resuming locally does not override upstream denial or incomplete native enrollment. The last effective platform administrator cannot be removed.

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
  - `Add User` in password mode

What to do:

1. Confirm which auth mode is active so you know whether the expected CTA is **Add from AD** or **Add user**.
2. Open `/admin` and confirm the Health state.
3. Refresh `/users` once.
4. If the expected creation action is still disabled after a healthy refresh, escalate as an admin-surface or auth/config incident.

### “`/users` shows no results, but it might actually be broken”

What it usually means:

- the `/users` fetch failed before the table could load
- the page is showing a retryable error state instead of pretending the result set is empty

What to do:

1. Read the error banner before treating the page as empty.
2. Use **Retry** once.
3. If the same load failure returns, capture the route, time, and request failure and escalate instead of assuming there are no matching users.

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
