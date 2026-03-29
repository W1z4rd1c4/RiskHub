---
title: Access Management and the Users Directory
version: "2.2"
last_updated: "2026-03-29"
audience: user
source_of_truth: "frontend/src/pages/UsersPage.tsx + frontend/src/authz/policy.ts + backend access APIs"
summary: "How to use /users in directory mode and access mode, understand roles and scopes, and request/verify permission changes safely."
tags:
  - access
  - audit
  - workflow
  - troubleshooting
  - settings
---

# Access Management and the Users Directory

**On this page**
- [Overview](#overview)
- [Where To Find It](#where-to-find-it)
- [Roles, Scope, and Visibility](#roles-scope-and-visibility)
- [Data Model and Key Fields](#data-model-and-key-fields)
- [Core Workflows](#core-workflows)
- [Approvals and Notifications Behavior](#approvals-and-notifications-behavior)
- [Filters, Views, and Exports](#filters-views-and-exports)
- [Common Mistakes](#common-mistakes)
- [Troubleshooting](#troubleshooting)
- [Related Documentation](#related-documentation)

## Overview

The `/users` page serves two distinct purposes depending on your privileges:

1. **Users directory** (read-only): quickly find colleagues and understand who is responsible for what.
2. **Access management view** (privileged): see roles, scopes, and permissions for users and (in some environments) manage them.

This manual explains both, and more importantly: how to *request and verify* access changes without breaking scope boundaries.

Primary route: `/users`

Important contract split:

- `/users` directory mode is backed by the dedicated user-directory API.
- `/access/users*` remains the access-management contract for privileged reviews and edits.
- `/users/lookup` stays a generic picker/search primitive for forms and filters. It is not the `/users` page contract.
- `/users` does not expose a standalone colleague detail page. Directory rows are informational, and privileged edits stay in the `/users` modal workflow.
- Admin-only lifecycle/detail endpoints remain separate from access-management review. Role-selection data for the active UI comes from `/access/roles`, not from legacy `/users` lifecycle helpers.
- directory-mode role filter options come from `/users/directory` facet metadata for your visible colleague universe; if a role is missing from the filter, there are currently no visible directory users for that role in scope.
- Directory mode remains a supported contract, but the current seeded demo matrix does not include a canonical directory-only actor. Manual demo-account verification therefore focuses on access modes until product intentionally assigns `users:read` to a non-access-view role.

## Where To Find It

- Sidebar item **Users** → `/users`

If you do not see **Users**:

- your account likely lacks both directory entitlement (`users:read`) and access-view entitlement
- ask your access owner to validate whether you should have directory access

## Roles, Scope, and Visibility

RiskHub access is built on three layers:

- **Role**: what kind of user you are (what responsibilities you have)
- **Scope**: how wide your visibility is (global vs department vs manager)
- **Permissions**: what actions you can do per resource (read/write/delete/submit)

### Directory mode vs access mode

The `/users` page chooses a mode based on your authorization:

- **Access mode** (privileged): you can see users with their scopes and capability details.
  - global privileged users use the full access-management view
  - department heads use the department access view
- **Directory mode** (standard): you can search a visible user list but you will not see full permission details.

Mode precedence matters:

1. access-management mode for global privileged users
2. department access mode for department heads
3. directory mode for users who have `users:read` but not an access-management view

If you do not match any of those modes, the route should redirect away instead of rendering a partial or misleading users screen.

### Platform admin is different

Platform admins are intentionally separated:

- they do not browse business modules
- they use admin console and admin documentation
- business routes such as `/governance` and `/activity-log` stay blocked for them, even via direct route/API access

If you are platform admin, these user docs are not your primary manual.

## Data Model and Key Fields

In access mode, you will typically see:

| Field | Meaning | Pitfalls / notes |
|---|---|---|
| Name / email | Identity of the user | Emails are stable identifiers; names can change. |
| Role | What the user is responsible for (e.g., CRO, risk manager, department head) | Role alone does not determine visibility; scope + permissions matter. |
| Access scope | `global`, `department`, or `manager` | Scope governs “how wide” visibility is. |
| Department | Home department (if assigned) | Department is routing context, not necessarily ownership. |
| Active status | Whether the account is enabled | Disabling is a governance action; treat it as reversible but audited. |
| Permissions | Resource + action (e.g., `risks:read`, `vendors:write`) | Effective permissions can differ from expected; always verify. |

In directory mode, the UI focuses on identity and discoverability rather than enforcement details. It is intentionally separate from the authenticated `/users/lookup` picker used by assignment/search widgets elsewhere in the product. Directory results are server-filtered and paginated; searching and role filtering are part of the `/users` page contract rather than a client-side lookup fallback.

## Core Workflows

### 1) Find the right person (ownership discovery)

When you need to route work:

1. Open `/users`.
2. Search by name or email.
3. Confirm department context.
4. Use this to assign owners in risks, controls, KRIs, and issues.

This is a simple workflow, but it prevents one of the most common failure modes: assigning work to the wrong person.

### 2) Understand “why can’t I see / edit X?”

Access problems are usually one of these:

- missing permission (resource/action)
- wrong scope (department-only vs global)
- wrong department assignment
- ownership not set (so ownership exception doesn’t apply)

Use this diagnostic loop:

1. Identify the entity and its department + owner.
2. Confirm your own scope.
3. Confirm your permissions for the resource:
   - risks: `risks:read` / `risks:write`
   - controls: `controls:read` / `controls:write` / `controls:execute` (execution logging)
   - vendors: `vendors:read` / `vendors:write`
   - issues: `issues:read` / `issues:write`
   - business activity log: `activity_log:read` (non-admin only)
4. If needed, ask a privileged user to compare your effective permissions.

### 3) Request an access change (safe pattern)

When you request access, provide what an admin needs to approve quickly:

- which resource and action you need (`vendors:read`, `issues:write`, etc.)
- why you need it (role responsibility)
- the smallest scope that is sufficient
- how long you need it (temporary vs permanent)

Avoid requesting `*:*` or broad permissions as a shortcut. Broad access creates audit and privacy risk.

### 4) Verify an access change (don’t assume it worked)

After an access change is applied:

1. Log out and log back in (refresh effective permissions).
2. Re-open `/users` and confirm expected mode (directory vs access) if applicable.
3. Navigate to the module and try the exact action you needed.
4. Check `/notifications` and `/approvals` for any workflow gating.

If verification fails, report:

- the user email
- the time you tested
- the route and action that failed

### 5) Manage users (only if you have authority)

Some environments allow privileged business users to review access users. Manual lifecycle actions are narrower.

If you can manage users, use a “least privilege” process:

- on `/users`, the create CTA is auth-mode dependent: **Add from AD** in directory-first auth modes and **Add user** in password mode
- create or import accounts only when onboarding is confirmed and your role is authorized for lifecycle actions
- after a successful directory import, stay on `/users` and complete the onboarding fields in the edit modal instead of looking for a separate user detail page
- assign the minimum role and permissions needed
- set the correct department
- verify that dashboards and lists match the expected scope

If you are not platform admin, do not expect admin lifecycle/detail endpoints to be available even if you can still review or edit access fields in `/users`.

If you do not have edit rights, treat `/users` as a read surface and escalate changes to the platform admin team.

If `/users` shows a retry banner instead of user rows, treat that as a load failure, not as proof that there are no matching users.

## Approvals and Notifications Behavior

Access changes are governance-sensitive.

What to expect:

- some changes may be approval-gated (policy dependent)
- users may receive notifications when their access changes
- access-related actions often leave a trail in the Activity Log

If you are validating the change as platform admin, use admin console audit/log exports instead of the business Activity Log route.
  - platform admins should use admin console audit/log exports instead of the business Activity Log route

If you suspect a change is pending:

- check `/approvals` for access-related requests
- check `/notifications` for results

## Filters, Views, and Exports

### Filters

`/users` includes filtering to make audits and reviews practical:

- search (name/email)
- role filter
- scope filter (in access mode)
- capability filter (resource + action) in access mode

These filters are valuable for questions like:

- “Who has `vendors:write`?”
- “Which users are global scope?”
- “Who is a department head?”

### Views

- directory mode: simplified view intended for discoverability
- access mode: richer view intended for governance and reviews

### Exports

The Users page is not primarily an export surface.

If you need evidence for an audit:

- use Activity Log entries for change proof when you are a business user
- coordinate with platform admins for formal exports where required

## Common Mistakes

- Treating role as the full story (scope and permissions matter).
- Granting broad permissions to “make it work” rather than fixing ownership/department routing.
- Forgetting to verify after a change.
- Disabling users without documenting why and what follow-up is required.

## Troubleshooting

### I expected access mode but I see only a directory

- You likely do not have global scope or department-head access.
- Confirm whether you should have `users:read` and whether you should also have a global or department access view.

### I can see permissions but can’t edit

- Viewing access data and editing are separate privileges.
- In many setups, lifecycle actions such as direct create/import are Admin-only even when broader read or access-review surfaces are available.

### A user still can’t see a module after granting access

- Make sure the permission is correct (resource/action).
- Verify the user logged out and back in.
- Confirm department assignment and ownership where relevant.

## Related Documentation

- `./departments.md`
- `./notifications.md`
- `./activity-log.md`
- `./getting-started.md`
- `./risks.md`
- `./controls.md`
- `./vendors.md`
- `./issues.md`
