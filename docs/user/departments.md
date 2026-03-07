---
title: Departments and Organizational Scope
version: "2.0"
last_updated: "2026-03-07"
audience: user
source_of_truth: "frontend/src/pages/DepartmentsPage.tsx + frontend/src/services/departmentApi.ts"
summary: "How to use Departments to understand scope, exposure, and ownership routing across risks, controls, KRIs, users, and activity."
tags:
  - departments
  - access
  - workflow
  - exports
  - troubleshooting
---

# Departments and Organizational Scope

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

Departments in RiskHub are not just a directory. They are the primary way the platform expresses organizational scope:

- what data you can see
- who should own remediation work
- how reporting is grouped
- which exposures are considered “local” vs “cross-functional”

A department record also acts as a landing page for exposure metrics. From a single department you can quickly answer:

- How many risks and controls sit in this area?
- Are there KRIs breaching limits that need attention?
- Is the total exposure trending high (net score sum)?

Primary routes:

- departments overview: `/departments`
- department details: `/departments/<id>` (opened by clicking a department card)

## Where To Find It

- Sidebar item **Departments** → `/departments`
- Click any department card to open its details page

If you do not see **Departments**:

- you may be in a restricted environment or have an unusual permission set
- ask your access owner to confirm your role and effective permissions

In most organizations, departments are broadly readable because they are the backbone of scope decisions.

## Roles, Scope, and Visibility

Department visibility and the meaning of department affiliation depends on role and scope.

### How department scope typically works

- **Global scope** users can usually see all departments and their exposure metrics.
- **Department scope** users generally see their own department’s context and the entities tied to it.
- **Ownership exceptions** can allow you to see risks/controls outside your department when you are the owner.

### Why this matters

Departments are used in multiple workflows:

- **routing**: who should triage and remediate an Issue
- **reporting**: how exports and dashboards group results
- **approvals**: who is a natural reviewer (even if workflow is role-based)

If your department assignment is wrong, many other things will look “broken” (missing risks, empty dashboards, approvals you can’t act on).

## Data Model and Key Fields

The department detail view aggregates data from multiple modules.

| Field / metric | Meaning | Pitfalls / notes |
|---|---|---|
| Name | Human-readable department name | Don’t overload the name with abbreviations; use `Code` for that. |
| Code | Short identifier used in reporting | Codes should be stable; changing them causes confusion in exports. |
| Description | Optional context for what the department covers | Keep it practical (scope boundaries, not org-chart history). |
| User count | How many users are assigned | This is not necessarily “how many can see the data” (ownership can differ). |
| Risk count | Number of risks tied to the department | If you archive risks, the count can change based on archived inclusion. |
| Control count | Number of controls tied to the department | Controls linked to risks can still be in a different department (cross-functional). |
| KRI count | Number of KRIs under risks in this area | KRIs inherit context from risks; treat them as risk sub-entities. |
| High risk count | Count of critical/high exposure risks | Use as a prioritization signal, not as a performance metric. |
| Breaching KRI count | How many KRIs are outside limits | A single breaching KRI can be more important than the count suggests. |
| KRI monitoring counts | Count split by `new`, `not_submitted`, `breach`, `warning`, `optimal` | These are canonical monitoring-status counts used by the department KRI tab and summary cards. |
| Total net score | Aggregated net exposure | This is a summary; investigate the top drivers before presenting it. |

Department details can also include:

- risk distribution (low/medium/high/critical)
- risk by status (active/emerging/etc)
- control stats (active/inactive and breakdown)
- KRI monitoring counts (`new`, `not_submitted`, `breach`, `warning`, `optimal`)
- recent control executions (useful for operational pulse)

## Core Workflows

### 1) Use departments to understand your “blast radius”

When you start a day or a review cycle:

1. Open `/departments`.
2. Identify departments with breaching KRIs or high-risk counts.
3. Drill into a department and scan the top risks and active controls.
4. Decide where you need deeper action: risk updates, control execution follow-ups, or new Issues.

This workflow is especially useful before a committee meeting: you can quickly move from “where is pressure” to “what exactly is driving it”.

### 2) Diagnose visibility problems (“Why can’t I see X?”)

Departments are the first diagnostic stop for most access questions.

When a user can’t see a risk/control/vendor they expect:

1. Check which department the entity belongs to.
2. Check whether the user’s scope is global or department.
3. Check whether ownership exceptions apply (is the user the owner?).
4. If still unclear, open the Activity Log (if you have access) to see recent changes to ownership/department.

### 3) Prepare a clean export for a department review

Exports are done from entity list pages (Risks/Controls/KRIs/Issues/Vendors). Departments help you keep the export scoped.

Recommended approach:

1. Start in `/departments` and choose the department you’re reporting on.
2. Jump to `/risks` and apply filters that match the department scope.
3. Export with a clear as-of date.
4. Repeat for `/controls`, `/kris`, and `/issues` if needed.

When you move from the department detail KRI tab into `/kris`, keep the canonical monitoring filter terminology aligned so totals stay comparable.

If your organization expects department-level packs, use a consistent filter set and naming convention for exported files.

### 4) Align ownership and routing

Departments are not ownership.

Use department assignment for:

- where the work should be routed
- where exposure is reported

Use ownership for:

- who is accountable to act
- who receives notifications and approvals (depending on policy)

When these drift apart (department says “Team A” but owner is “Team B”), your workflows will produce noise. Fix drift early.

## Approvals and Notifications Behavior

Most users use departments as a read surface; structural edits are often restricted.

What to expect:

- If you *can* edit department structure (name/code/manager), those changes may be treated as governance-sensitive and can trigger workflow.
- Even without editing departments, you will see downstream approvals and notifications when entities change department or ownership.

Practical habit:

- when you change an entity’s department, add a clear note explaining why (so reviewers and auditors can reconstruct routing decisions later)

For queue mechanics, see: `./notifications.md`.

## Filters, Views, and Exports

Departments are intentionally lightweight:

- the overview page is a set of cards with key metrics
- the detail page is a drill-down hub

For filtering and exports, you generally:

- use the **Departments** page to decide *where* to look
- use entity pages to filter/export:
  - risks: `/risks`
  - controls: `/controls`
  - KRIs: `/kris`
  - issues: `/issues`
  - vendors: `/vendors` (if you have `vendors:read`)

Department detail now applies server-side KRI filters using canonical monitoring status values:

- `all`
- `new`
- `not_submitted`
- `breach`
- `warning`
- `optimal`

The KRI tab pagination uses the filtered server total, not the unfiltered department KRI count.

## Common Mistakes

- Treating department metrics as performance KPIs without context. They are exposure signals.
- Mixing department and ownership (assigning a department change instead of assigning an owner).
- Presenting “total net score” without listing top drivers.
- Forgetting that archived items may be excluded from counts unless explicitly included.

## Troubleshooting

### Department metrics look wrong

- Refresh the page and re-open the department.
- Check whether you are comparing against exports that include archived items.
- Validate that the underlying risks/controls have correct department assignment.

### I can open `/departments` but can’t open a department detail

- Your permissions may allow list access but block detail reads.
- Capture the department ID and the error message and escalate to your access owner.

### Users are assigned to the “wrong” department

- Department assignment is an access/governance concern.
- Use the Users/Access page (`/users`) if you have access; otherwise ask a privileged user to validate.

## Related Documentation

- `./access-management.md`
- `./risks.md`
- `./controls.md`
- `./kris.md`
- `./issues.md`
- `./governance.md`
- `./activity-log.md`
