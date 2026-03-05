---
title: Governance: Orphaned Items and Ownership Hygiene
version: "2.0"
last_updated: "2026-03-05"
audience: user
source_of_truth: "frontend/src/pages/GovernancePage.tsx + frontend/src/components/governance/*"
summary: "How to use Governance to detect and resolve orphaned Risks, Controls, and KRIs so ownership, scope, and reporting stay correct."
tags:
  - governance
  - workflow
  - audit
  - troubleshooting
  - access
---

# Governance: Orphaned Items and Ownership Hygiene

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

Governance is a *hygiene* module. It helps you find and fix "orphaned" items: risks, controls, or KRIs that lost their intended ownership or linkage state.

Orphaned items usually happen when:

- a user leaves and their owned entities are not reassigned
- departments are reorganized
- a control or KRI is created without being properly linked
- data is migrated or imported and some references are missing

Why this matters:

- ownership drives accountability and workflow routing
- department assignment drives scope and reporting
- orphaned items create false comfort ("it exists" but nobody owns it)

Primary route: `/governance`

## Where To Find It

- Sidebar item **Governance** → `/governance`

If you do not see Governance:

- your account likely cannot view Governance (`canViewGovernance` is CRO-only in the default contract)
- platform admins do not use business Governance; direct route/API access is blocked and they use admin tooling instead

Governance is designed as a review surface. Treat it as a periodic control:

- daily for high-change environments
- weekly at minimum for stable environments
- before any committee/board pack is finalized

## Roles, Scope, and Visibility

Governance is intentionally restricted because it can expose cross-department ownership data.

Typical access pattern:

- CRO (or a delegated global owner) reviews and resolves orphans
- department stakeholders provide context, but Governance resolution is done centrally

Resolution actions can have broad visibility impact:

- changing owner can grant visibility through ownership exceptions
- changing department can move items in/out of department scope

Operate Governance with an explicit "least surprise" mindset: pick owners and departments that match how the organization actually works.

## Data Model and Key Fields

Governance works with **orphaned items**, which have a common shape.

| Field | Meaning | Notes |
|---|---|---|
| Item type | `risk`, `control`, or `kri` | Use the tabs to focus on one type. |
| Item identifier | Human-friendly code / identifier | Prefer this in communication instead of internal IDs. |
| Item name | Primary label (risk name/control name/KRI name) | If name is unclear, fix the name as part of remediation. |
| Department | Current department (may be empty) | Empty department is a common source of scope confusion. |
| Previous owner | The last known owner name/email | This is diagnostic context, not a target assignment. |
| Orphaned at | Timestamp when it became orphaned | Use it to judge urgency and whether data might be stale. |
| Status | `pending` or `resolved` | Resolve only when ownership/linkage is truly fixed. |

Governance resolution can request:

- `new_owner_id` (for risks/controls)
- `department_id` (for all orphan types)
- `target_risk_id` (for KRIs, and for controls that have no linked risks)

## Core Workflows

### 1) Daily/weekly governance sweep

1. Open `/governance`.
2. Review the headline counts.
3. Start with **risks** (they are the root entity) and resolve high-impact items first.
4. Move to **controls** and ensure each control is linked to the risks it mitigates.
5. Move to **KRIs** and ensure each KRI is linked to the correct risk.
6. Re-check totals and confirm nothing remains unintentionally pending.

### 2) Resolve an orphaned risk

When a risk is orphaned, it usually means owner or department is missing/incorrect.

Resolution procedure:

1. Open the orphan row.
2. Choose a new owner who is accountable for the risk’s lifecycle.
3. Confirm or set the correct department.
4. Submit resolution.
5. Verify the risk now appears correctly in `/risks` and department views.

If there is no clear owner, do not guess. Assign a temporary owner (for example, a central coordinator) and create an Issue to complete reassignment.

### 3) Resolve an orphaned control

Controls need two things to be operationally meaningful:

- ownership + department context
- linkage to the risks they mitigate

Resolution procedure:

1. Open the orphan control.
2. Set the owner and department.
3. Check whether the control already has linked risks.
4. If it has no linked risks, select a **target risk** that the control mitigates.
5. Submit resolution.
6. Verify the control appears correctly in `/controls` and is linked on the risk detail page.

### 4) Resolve an orphaned KRI

KRIs are risk sub-entities. In practice:

- a KRI without a risk linkage is not actionable

Resolution procedure:

1. Open the orphan KRI.
2. Select the correct **target risk**.
3. Confirm department context.
4. Submit resolution.
5. Verify the KRI appears under the risk and in `/kris`.

### 5) Document the “why” (audit hygiene)

Governance fixes are governance decisions.

After resolving a significant orphan (high exposure risk, widely used control, critical KRI), record the decision context:

- why this owner is the right long-term accountable party
- why the department is correct
- what follow-up is needed (for example, update descriptions, add controls, adjust KRIs)

If your organization uses Issues for follow-ups, create one and reference the orphan resolution.

## Approvals and Notifications Behavior

Governance resolution is a structural action. Depending on your environment, it can:

- trigger workflow approvals (if ownership/department changes are governed)
- generate notifications for the new owner or affected stakeholders
- create activity log entries

Practical checks:

- if the change does not appear immediately after submission, check `/approvals`
- check `/notifications` for any routing events
- use `/activity-log` (if you have access) to confirm the recorded change

## Filters, Views, and Exports

Governance is optimized for action, not reporting.

What you can do effectively:

- switch tabs by orphan type (risk/control/kri)
- focus on `pending` items
- open the quick view to inspect context before resolution

What you typically should not do:

- treat Governance counts as “performance” metrics
- export orphan lists as evidence without also resolving them

If you need evidence for an audit, the clean approach is:

1. Resolve orphans.
2. Use the Activity Log or standard exports from `/risks` and `/controls` to show the corrected state.

## Common Mistakes

- Resolving with the "nearest" owner instead of the *accountable* owner.
- Assigning department based on where the issue was discovered, not where the work belongs.
- Linking a control to a risk just to clear the orphan list (creates reporting distortion).
- Ignoring orphans because they look like “data quality” rather than “control quality”.

## Troubleshooting

### Governance shows counts but the list is empty

- Refresh the page.
- The orphan scan can be best-effort; if scanning is blocked, existing items should still be readable.
- If it persists, capture the timestamp and ask support to verify orphan stats vs orphan list.

### I can open Governance but can’t resolve

- You may have read access but not the permissions to resolve.
- Capture the orphan item identifier and escalate to your access owner.

### I resolved an orphan but it still shows as pending

- Refresh and re-open the orphan item.
- If approvals are enabled, the resolution might be waiting in `/approvals`.
- Check `/activity-log` for evidence of the update.

## Related Documentation

- `./risks.md`
- `./controls.md`
- `./kris.md`
- `./departments.md`
- `./issues.md`
- `./access-management.md`
- `./activity-log.md`
