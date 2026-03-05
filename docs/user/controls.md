---
title: Managing Controls
version: "2.0"
last_updated: "2026-03-05"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md §2.2, §4, §7 + frontend/src/pages/ControlsPage.tsx"
summary: "Full manual for control lifecycle management: design, ownership, execution logging, linkage to risks, exports, and approval-aware governance."
tags:
  - controls
  - workflow
  - approvals
  - exports
  - troubleshooting
---

# Managing Controls

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

Controls convert policy into repeatable execution. In RiskHub, a control is only valuable when it can be:

- owned by a specific person
- executed at a defined frequency
- logged with evidence
- linked to the risks it mitigates

Controls are also governance objects: sensitive edits and archiving can be approval-gated.

Primary route: `/controls`

## Where To Find It

- Controls catalog: `/controls`
- Control detail: click a row
- Create control: from `/controls` (requires `controls:write`)

If you don’t see **Controls** in the sidebar:

- you likely lack `controls:read`

## Roles, Scope, and Visibility

Controls follow the same visibility model as risks:

- scope and department define baseline visibility
- ownership can grant exceptions
- backend enforcement is authoritative

Write access is permission-gated:

- `controls:write` to create/edit
- `controls:delete` for archive/restore actions (depending on policy)
- `controls:execute` to log executions

Execution logging may also be permission-gated. In most environments:

- control owners and delegated executors can log executions
- reviewers can read execution history

Default seeded roles with `controls:execute` are CRO, Risk Manager, Compliance, Internal Audit, Actuarial, Department Head, and Employee.

## Data Model and Key Fields

Controls have a lifecycle, execution expectations, and evidence.

| Field | Meaning | Pitfalls / notes |
|---|---|---|
| Name | What the control is | Names should be testable statements, not slogans. |
| Description | What is done and why | Include scope boundaries and “what success looks like”. |
| Control form | `manual` or `automatic` | Don’t mark “automatic” unless evidence exists. |
| Frequency | daily/weekly/monthly/… | Frequency must match operational reality. |
| Risk level | 1–5 criticality signal | Use as prioritization for execution discipline. |
| Status | `draft`, `active`, `inactive`, `archived` | Use `draft` while designing; `archived` when retired. |
| Owner | Accountable for control design and effectiveness | Owner is not always the executor. |
| Owner position | Role/title context for owner | Helps routing when names change. |
| Executor position | Who executes (if different) | Useful for operational handoffs. |
| Department | Routing/reporting context | Align with where the control is operated. |
| Data source | Where evidence/data comes from | Must be specific (system, report, log). |
| Methodology reference | Policy/procedure reference | Link to internal procedure IDs if you have them. |
| Output / reporting | What is produced and who receives it | Helps reviewers evaluate evidence quality. |
| Documentation location | Where evidence lives | Keep it stable and access-controlled. |
| Linked risks | Risks mitigated by the control | Link with effectiveness and notes. |
| Execution logs | History of execution results + evidence references | This is the audit trail. |

Execution log fields commonly include:

- result: `passed`, `failed`, `warning`, `not_applicable`
- findings: what was observed
- evidence reference: where proof lives
- notes: context and follow-up

## Core Workflows

### 1) Create a control (design for execution)

1. Go to `/controls` → **New control**.
2. Write a name and description that can be tested.
3. Set ownership and department.
4. Define execution inputs:
   - data source
   - methodology reference
   - frequency
5. Set status:
   - `draft` while iterating
   - `active` when ready for execution
6. Optionally link to the primary risk now (you can also link later).
7. Save.

Recipe: *create controls that don’t generate audit pain*

- be explicit about what evidence must exist after execution
- avoid vague descriptions (“ensure compliance”)
- define who reviews and where the output goes

### 2) Link a control to risks (mitigation mapping)

A control without linked risks becomes reporting noise.

Linking pattern:

- link to each risk the control materially mitigates
- choose effectiveness (high/medium/low) based on reality, not optimism
- add notes explaining the mechanism (“prevents X”, “detects Y”, “limits Z”)

If a control is linked to many risks, confirm it’s not actually a “program” or “process” that should be modeled differently.

### 3) Log a control execution (the evidence loop)

Execution logging is the difference between a control that exists and a control that works.

Operational procedure:

1. Open the control detail.
2. Click **Log execution**.
3. Set the result.
4. Record findings:
   - what was checked
   - what exceptions were found
5. Add an evidence reference.
6. Save.

Interpretation of results:

- `passed`: executed as expected, evidence exists
- `warning`: executed but with a minor concern
- `failed`: executed and failed (this should usually drive an Issue)
- `not_applicable`: expected execution was legitimately not required (document why)

When a control fails:

- create an Issue for remediation (`/issues`) and reference the execution
- consider whether risk net scoring should change

### 4) Update a control safely

Control edits can have policy impact (ownership, department, frequency, status).

Before editing:

- check linked risks (blast radius)
- check recent execution history (don’t invalidate evidence without documenting why)

Make changes in the smallest possible units and document the rationale.

### 5) Archive and restore

Archive a control when it is retired or replaced.

Safe archive procedure:

1. Confirm replacement control exists (if applicable).
2. Update linked risks if mitigation mapping changes.
3. Archive.
4. Verify it no longer appears in active reporting.

If your environment approval-gates archiving, the action will be queued and visible in `/approvals`.

## Approvals and Notifications Behavior

Controls often trigger approvals for:

- ownership changes
- department changes
- status changes with governance impact
- archiving

Practical signals:

- the save succeeds but the field doesn’t change
- the control shows as “pending changes” in list views

When this happens:

- check `/approvals` for the request
- track outcomes via `/notifications`

Use `./notifications.md` as the queue manual.

## Filters, Views, and Exports

### Filters

Controls list supports:

- search (name/description)
- status filter (including archived)
- view mode (all vs grouped)

Use grouped views for review prep and concentration analysis.

### Exports

Controls can be exported for audit packs and operational reviews.

Export discipline:

- export with clear filters (status, search)
- keep “as of” context
- keep the raw export unchanged

## Common Mistakes

- Writing controls as aspirations instead of testable actions.
- Logging executions with low-information notes (“done”).
- Using `not_applicable` as a shortcut without explaining why.
- Linking controls to risks broadly to “look covered”.
- Changing frequency without assessing workload and evidence impact.

## Troubleshooting

### I can view controls but can’t create/edit

- You likely have `controls:read` but not `controls:write`.

### Execution history is missing

- Confirm the control has been executed (and that you have read access to executions).
- If execution logging is new, establish the first baseline execution.

### My update didn’t apply

- Check `/approvals` for a queued request.
- Check `/notifications` for resolution.

### Export failed

- Retry with fewer filters.
- Capture the error if it persists.

## Related Documentation

- `./risks.md`
- `./kris.md`
- `./issues.md`
- `./notifications.md`
- `./dashboard.md`
- `./activity-log.md`
