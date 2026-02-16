---
title: Risk Hub (CRO Configuration Workspace)
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "frontend/src/pages/RiskHubPage.tsx + frontend/src/components/riskhub/*"
summary: "CRO manual for configuring RiskHub taxonomy, thresholds, approval scenarios, roles, departments, and sending risk questionnaires safely."
tags:
  - riskhub
  - settings
  - workflow
  - approvals
  - notifications
  - troubleshooting
---

# Risk Hub (CRO Configuration Workspace)

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

Risk Hub is the CRO-facing configuration workspace. It exists because some changes are *policy-level* decisions, not day-to-day record edits.

In Risk Hub you can:

- define the risk type taxonomy used throughout the UI
- maintain system settings (thresholds, approvals, notifications configuration)
- configure approval scenarios and approver roles
- manage roles and permission bundles
- manage departments used for routing and reporting
- send risk questionnaires in batches (risk assessment workflow)

Primary route: `/risk-hub`

Think of Risk Hub as "configuration with blast radius". A small change can impact dashboards, scoring, and workflow volume.

## Where To Find It

- Sidebar item **Risk Hub** → `/risk-hub`

If you do not see Risk Hub:

- Risk Hub is visible only to the CRO role
- if you believe you are CRO but cannot access it, verify your role assignment and re-authenticate

## Roles, Scope, and Visibility

Risk Hub is intentionally restricted:

- the CRO role is expected to operate cross-department governance
- configuration changes affect many users and can change how approvals and notifications behave

Before making changes, answer:

- Who will be impacted?
- What will change in their workflow tomorrow morning?
- What verification proves the change did what we intended?

If you are delegating configuration work, use a clear handoff with:

- the intended outcome
- the rollback plan
- a verification checklist (see sections below)

## Data Model and Key Fields

Risk Hub is organized into tabs. The table below is a practical reference of what matters.

| Tab | Key fields | What it affects | Common pitfalls |
|---|---|---|---|
| Risk types | `code`, `display_name`, `description`, `color`, `sort_order`, active/deleted | Risk register taxonomy, grouping, badges | Renaming without communication; inconsistent codes; too many types. |
| System settings | config `key`, `value`, `value_type` (bool/int/string), min/max, editable | Threshold behavior, approval/notification tuning | Treating settings as “tweak until it feels right” without a baseline. |
| Approval rules | scenario `key`, `requires_approval`, `approver_roles` (including special dynamic role `risk_owner`) | Workflow volume and who can approve | Removing approvals and losing control; misconfigured approver roles. |
| Roles | role identifier `name`, `display_name`, `description`, permission list (`resource:action`) | Access enforcement across modules | Giving broad permissions; role proliferation; unclear role intent. |
| Departments | `name`, `code`, `manager`, active/deleted | Routing, scope, reporting | Changing codes breaks continuity; missing manager assignment. |
| Questionnaires | filters (department/process/category/status), select all vs selected IDs, batch send results | Risk assessment pressure and inbox volume | Sending without owners; sending too broadly; not tracking skipped items. |

## Core Workflows

### 1) Maintain risk type taxonomy (Risk Types tab)

A good taxonomy is stable and minimal.

Recommended process:

1. Review existing risk types and confirm each has a distinct meaning.
2. Add a new type only when a real reporting or governance need exists.
3. Use `code` as the stable identifier (lowercase + underscore style).
4. Use `display_name` for user-facing labels.
5. Pick colors that communicate category without creating “severity” confusion.
6. Use `sort_order` to keep the UI predictable.

When you deprecate a type:

- prefer marking as deleted/inactive rather than renaming to something else
- communicate the change and update any guidance that references the old type

### 2) Adjust system settings safely (System Settings tab)

System settings are usually grouped (for example: thresholds, approvals, notifications).

Safe change protocol:

1. Identify the exact key you intend to change.
2. Write down the current value.
3. Decide the target value and why.
4. Save the smallest change.
5. Verify the behavior in the impacted module.

Examples of good verification:

- thresholds: a risk or KRI crosses the threshold and the UI reflects it correctly
- notifications: the intended notification appears (not 10 extra ones)
- approvals: a sensitive change creates a workflow request and lands in `/approvals`

### 3) Configure approval scenarios (Approval Rules tab)

Approval scenarios define:

- whether an action requires approval
- which roles can approve

Good governance is not “approvals everywhere”. It is approvals for actions with real policy impact.

Recommended approach:

1. Keep approvals enabled for ownership/department/risk-scoring changes unless you have a documented alternative control.
2. Use approver roles that match accountability.
3. Use the `risk_owner` dynamic role when the risk owner is the right approver (and conflict-of-interest rules allow it).
4. Avoid “no approvers configured” states: they create stuck requests.

After changing an approval scenario, run a real end-to-end test (create a request and verify resolution).

### 4) Manage roles and permissions (Roles tab)

Roles are permission bundles.

Recommended operating model:

- keep the number of roles small
- each role should have a clear description (what it is for and what it is not)
- grant the minimum permissions needed

Permissions are expressed as `resource:action` (for example `vendors:read`, `issues:write`).

Before saving a role change:

- list which modules will be newly visible
- list which write actions become possible
- confirm whether this changes who can view governance surfaces (risk hub, governance, users access mode)

If you remove permissions:

- communicate it (people will experience it as “the app broke”)
- provide an alternative workflow if needed

### 5) Manage departments (Departments tab)

Departments affect reporting and routing.

Safe process:

1. Create a department with a stable `code`.
2. Assign a manager where possible (helps routing and accountability).
3. Avoid renaming codes unless you have a clear migration plan.
4. If you delete/deactivate a department, verify what happens to:
   - risks and controls assigned to it
   - users assigned to it
   - dashboard grouping

### 6) Send risk questionnaires (Questionnaires tab)

Questionnaires are a structured “risk assessment request” workflow.

Batch sending has two modes:

- **Select all**: send to all risks matching filters
- **Selected IDs**: send to only the checked risks

Recommended workflow:

1. Filter to the intended scope (department/process/category/status).
2. Verify that risks have owners (or you will see “skipped_no_owner”).
3. Prefer “Selected IDs” for high-stakes cycles (reduces accidental spam).
4. Send.
5. Review results:
   - created count
   - skipped because no owner
   - skipped because an open questionnaire already exists
   - error list
6. Follow up on skipped items (assign owners or close existing questionnaires).

Questionnaires contribute to the workflow badge count and to `/approvals` (risk assessment tab).

## Approvals and Notifications Behavior

Risk Hub changes are governance changes.

Expect:

- immediate impact on UI behavior (taxonomy, thresholds)
- potential workflow impact (more or fewer approval requests)
- notifications and audit trails for important changes

If a change doesn’t behave as expected:

- check `/activity-log` for the configuration update event
- validate the scenario by performing a real user action that should trigger it
- if an approval should exist but doesn’t, review the approval scenario configuration

Use `./notifications.md` as the canonical queue manual.

## Filters, Views, and Exports

Risk Hub uses lightweight “show deleted/inactive” toggles in several tabs.

Practical guidance:

- keep deleted items hidden during normal operation (reduces mistakes)
- enable “show deleted” only when restoring or investigating

Exports are not the primary surface here. If you need evidence:

- use Activity Log for configuration change proof
- export affected entities from their module pages (risks, controls, issues)

## Common Mistakes

- Changing taxonomy (risk types) during an active reporting cycle without communication.
- Disabling approvals to “reduce friction” and accidentally removing a key control.
- Adding roles for one-off cases instead of adjusting permissions deliberately.
- Batch-sending questionnaires too broadly (creates inbox spam and erodes trust).
- Treating system settings as an experimentation playground without a baseline and rollback.

## Troubleshooting

### I can’t access `/risk-hub`

- Risk Hub is CRO-only. Confirm your role.
- Log out and back in to refresh role state.

### A configuration change doesn’t appear to apply

- Refresh the page.
- Check whether the change is blocked by network errors.
- Use `/activity-log` (if you have access) to confirm the update event.

### Questionnaires are skipped

- `skipped_no_owner`: assign owners to the risks, then re-send.
- `skipped_open_exists`: close or resolve existing open questionnaires before re-sending.

### Approvals are stuck after a scenario change

- Ensure approver roles are configured.
- Verify at least one user actually has the approver role and the needed permissions.
- If stuck, revert the scenario and re-test.

## Related Documentation

- `./notifications.md`
- `./risks.md`
- `./kris.md`
- `./controls.md`
- `./issues.md`
- `./departments.md`
- `./access-management.md`
- `./activity-log.md`
