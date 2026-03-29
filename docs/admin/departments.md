---
title: Departments: Admin Support and Access Integrity
version: "2.1"
last_updated: "2026-03-29"
audience: admin
source_of_truth: "docs/BUSINESS_LOGIC.md (scope/visibility) + backend/app/api/v1/endpoints/riskhub/departments.py + frontend/src/pages/UsersPage.tsx"
summary: "Admin runbook for supporting department changes without breaking access integrity: scoping diagnosis, user reassignments, and safe handoff to business owners."
tags:
  - departments
  - access
  - workflow
  - audit
  - troubleshooting
---

# Departments: Admin Support and Access Integrity

## Overview

Departments are structural boundaries in RiskHub that influence:

- default visibility (via access scope + department assignment)
- reporting rollups (department-level dashboards and exports)
- workflow routing context (where approvals/ownership are interpreted)

Important boundary: **department CRUD is a business-governance function** (typically CRO-owned). Platform admins usually do not “decide departments”. Admin responsibility is to keep access behavior predictable, to keep user assignments consistent, and to provide evidence when department changes create incidents.

This runbook describes how an admin supports department work safely: diagnosing scope issues, applying user reassignments, and coordinating a clean handoff to the business owner for department create/update/archive actions.

## When To Use This

Use this runbook when:

- a user can’t see their department’s data (or sees the wrong department)
- a re-org is happening and user assignments must be updated
- department codes/names are inconsistent and break selection in `/users`
- a department appears “missing” in selectors or dashboards
- a department is being deactivated/archived by the business owner and you need to prevent access regressions

## Preconditions and Safety

Before touching any user assignments:

1. Confirm the request is not a policy dispute disguised as a platform problem.
   - Example policy dispute: “Which department should own this vendor?”
2. Capture scope facts:
   - affected user(s)
   - current role and access scope (`global`, `department`, `manager`)
   - expected vs observed visibility
   - time window (when did it start?)
3. Record current user assignments before you change anything:
   - department id/name
   - manager id/name

Safety rules:

- Change one dimension at a time (department or manager). Mixing creates ambiguity.
- If the request requires creating/updating/deactivating a department record, do not improvise. Hand off to the business owner with an evidence pack.

## Step-by-Step Procedure

### A) Diagnose “user can’t see department data”

1. Confirm whether the sidebar module is permission-gated:
   - Missing module entirely can be permission, not department.
2. Confirm the user’s **access scope**:
   - `department` scope means “my department only” by default.
   - `manager` scope means “my reporting tree” by default.
3. Confirm the user’s **department assignment** in `/users`.
4. Confirm the user’s **manager assignment** in `/users` (critical for manager scope).
5. If the user is an owner of records outside their department, validate whether ownership exceptions apply (expected behavior).

Outcomes:

- If the user has correct permissions but wrong department assignment: fix via `/users` (see procedure B).
- If the user has correct department assignment but still cannot see expected data: scope mismatch or data ownership mismatch. Capture evidence and escalate.

### B) Update user department or manager assignment safely

1. Open `/users` and locate the user.
2. Open the Access Edit modal from `/users`.
3. Update **department** *or* **manager** (one change at a time).
4. Save.
5. Ask the user to re-authenticate if the change affects session-derived claims (role/scope changes especially).

Verification checklist for this step:

- The user row in `/users` reflects the new department/manager.
- The user can open the expected module route.
- The user sees expected data for their scope.

Rollback:

- Restore the prior department/manager values you recorded.

### C) Support a re-org (bulk change discipline)

When a re-org touches many users, the risk is not the change itself; it is **silent drift** and unclear ownership.

Admin best practice:

1. Request the business owner provide a source list:
   - who moves from dept A to dept B
   - who becomes manager of whom (for manager scope orgs)
2. Apply changes in small batches.
3. After each batch, sample verification with at least one user in the batch:
   - expected modules visible
   - expected department dashboards show plausible metrics
4. Record a short “re-org window note” (date/time, affected departments, expected side effects).

This avoids false incident escalations when teams compare dashboards across a restructuring window.

### D) Handoff for department CRUD (create/update/archive/restore)

If the task is “create a new department” or “rename/deactivate a department”, treat it as business-governance.

Admin handoff responsibilities:

1. Confirm what the business owner wants to change:
   - name
   - code
   - manager assignment
   - active/inactive state
2. Provide evidence of current impact:
   - users currently assigned
   - which routes/features are blocked due to the department state
   - any errors observed (including timestamps)
3. Stay available to apply user assignment follow-ups after the department change is executed.

## Verification Checklist

After a department-related support action, confirm:

- no user lost access unexpectedly (spot-check a few representative roles/scopes)
- the affected user can see expected department data
- dashboards for the affected department show plausible counts (not necessarily identical to before, but not “zeroed” by accident)
- any incident ticket contains:
  - before/after assignment facts
  - who approved the re-org decision (business owner)
  - what was verified post-change

## Rollback Strategy

Rollback for department support is usually a **user assignment rollback**, not a department object rollback.

1. Restore prior department/manager assignments.
2. Ask impacted users to re-authenticate.
3. If a business owner executed a department rename/deactivation that caused widespread breakage:
   - escalate immediately
   - propose temporary containment (re-activate department) only if the business owner approves

Do not apply “creative fixes” that rewrite business structure without ownership approval.

## Troubleshooting

### A department is “missing” in department selectors

Likely causes:

- the department is inactive/archived
- name/code conflicts exist (duplicate code)
- the user’s scope/permissions prevent loading supporting data

Actions:

- confirm the department exists and is active (business owner may need to restore)
- capture exact error and timestamp
- escalate to business owner for CRUD actions

### Users lost expected visibility after a re-org

Checks:

- confirm department assignment in `/users`
- confirm manager chain for manager-scope orgs
- confirm users re-authenticated after role/scope edits

If the change was large, look for “partial batch” problems (some users moved, others not).

### Unexpected cross-department access after a change

Checks:

- scope accidentally expanded (`global`)
- ownership exceptions (record owner visibility) are behaving as designed

Actions:

- if it is a scope expansion: revert immediately and revoke sessions if needed
- if it is ownership-based: document as expected behavior, and hand off if policy needs change

## Escalation and Handoff

Escalate when:

- boundary rules appear mixed (a user sees cross-department data without a clear scope/ownership explanation)
- a re-org causes widespread visibility loss across multiple users
- department CRUD fails with server errors or inconsistent validation (business owner cannot complete the change)

Handoff package:

- affected users and their scopes
- before/after assignments (department/manager)
- minimal reproduction steps
- timestamps + error text + request IDs (if available)

Default handoff targets:

- business owner/CRO for department CRUD and ownership decisions
- engineering for technical failures or inconsistent enforcement

## Related Documentation

- User access operations: [User and Access Management](./user-management.md)
- Workflow support patterns: [Approvals Support](./approvals.md)
- Evidence exports for incidents: [Reports and Evidence Exports](./reports.md)
