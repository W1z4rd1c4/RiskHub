---
title: Dashboard and Reporting Overview
version: "2.1"
last_updated: "2026-04-25"
audience: user
source_of_truth: "frontend/src/pages/DashboardPage.tsx + dashboard widgets and report exports"
summary: "How to use the Dashboard as an operational cockpit: filters, drill-downs, committee view, export discipline, and interpreting trend changes correctly."
tags:
  - overview
  - exports
  - workflow
  - audit
  - troubleshooting
---

# Dashboard and Reporting Overview

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

The Dashboard is your operational cockpit. It summarizes posture and highlights where attention is needed *today*.

A dashboard is only useful when:

- filters are understood and controlled
- metrics are interpreted with scope context
- drill-downs are used to find the underlying drivers

Primary route: `/`

The dashboard is live-updating (polling). Treat it as “current posture”, not a static report.

## Where To Find It

- Sidebar item **Dashboard** → `/`

Drill-down links commonly take you to:

- `/risks` (including critical filters)
- `/controls`
- `/kris`
- `/departments`
- `/vendors` (if you have `vendors:read`)
- `/issues` (if you have `issues:read`)

## Roles, Scope, and Visibility

Dashboard data respects your scope.

Practical consequences:

- a department-scoped user will see a different posture than a global-scope reviewer
- if you are missing a widget entirely, it may be permission-gated (for example, issues widgets only appear if you can read issues)

Some organizations also have a "committee" view, available to certain roles/scopes, which emphasizes review-ready summaries.

## Data Model and Key Fields

Dashboard widgets are aggregates across core entities.

| Widget / metric | What it usually represents | How to interpret |
|---|---|---|
| Total controls | Count of controls in scope | A high number is not “good”; execution quality matters more. |
| Active departments | Departments with meaningful exposure | Use as navigation, not as performance. |
| Critical risks | Net score above a threshold | Thresholds matter; confirm how “critical” is defined in your environment. |
| Average net risk score | Mean residual exposure | Useful only alongside distribution (high/critical concentration). |
| Vendors | Vendor count in scope | Only visible if you can read vendors. |
| Open issues | Findings count | Only visible if you can read issues. |
| Risk distribution (gross/net) | Heatmap of scoring | Use drill-down to find the top drivers. |
| KRI breach widgets | Breach / due / overdue signals | Treat as monitoring discipline + risk pressure signals. |
| Trends | Time series for risks/controls/breaches | Use to detect change points and follow up with evidence. |

KRI status drill-downs use canonical KRI list filters:

- overdue widget drill-down: `/kris?monitoring_status=not_submitted`
- upcoming widget drill-down: `/kris?timeliness_status=due_soon`

## Core Workflows

### 1) Start-of-day routine (5–10 minutes)

1. Open `/`.
2. Confirm filters are correct.
3. Scan for urgent signals:
   - critical risks
   - KRI breaches and overdue items
   - open issues (if visible)
4. Click through to the underlying list pages and take action.
5. Check workflow queues (`/notifications`, `/approvals`) before you start editing.

### 2) Prepare a review/committee pack

Dashboard is a starting point, not the final artifact.

Recommended approach:

1. Use department metrics to identify where exposure concentrates.
2. Use risk distribution to identify high/critical clusters.
3. Export entity lists with explicit filters:
   - `/risks` (critical, priority, breached)
   - `/controls` (status, risk level)
   - `/kris` (breach, overdue)
   - `/issues` (overdue, high/critical)
4. Write the narrative using “drivers”, not just counts.

### 3) Diagnose a sudden metric shift

If a number changes suddenly:

- check whether filters changed
- check whether statuses changed (active ↔ archived)
- check whether ownership/department edits moved items in/out of scope

Use `/activity-log` (if you have access) to confirm what changed, when, and by whom.

### 4) Use drill-downs responsibly

Many widgets support drill-down:

- a heatmap cell can open a risk list filtered to that cell
- “critical risks” can open `/risks?critical=true`
- KRI status widget uses canonical KRI filters instead of legacy overdue query flags

When you share a drill-down result, always state:

- the active filters
- the as-of date/time
- the scope (global vs department)

## Approvals and Notifications Behavior

Dashboard is mostly read-only. It does not directly create approvals.

However, it is often the *reason* approvals happen:

- dashboard highlights pressure → someone edits scoring/ownership → approval request is queued

Operational discipline:

- if you plan to change sensitive fields, check `/approvals` and use clear reasons
- treat KRI breach/overdue widgets as triggers to create Issues and route remediation

## Filters, Views, and Exports

### Filters

Dashboard filters (such as department filters) change what you see everywhere.

Rules:

- always confirm the filter bar before interpreting a number
- reset filters when switching between personal work and presentation work

### Views

Some deployments support a committee/overview toggle.

Use committee view when:

- you need stability and narrative clarity
- you are preparing for formal review

Committee quarterly comparison rules:

- current quarter selection cannot be later than the actual current quarter
- compare quarter must be earlier than the selected current quarter
- live snapshot metrics are used only for the actual in-progress current quarter
- completed quarters use stored snapshots; historical selections do not show live current values under an old label
- department-scoped users see scoped period choices and scoped snapshots
- if a selected snapshot or individual snapshot metric is missing, the widget shows a warning, dashes for unavailable sides, and `N/A` for that delta instead of treating missing values as zero

Use overview view when:

- you are doing day-to-day operational routing

### Exports

Dashboard supports a summary export (CSV download).

Export discipline:

- export only when you need a snapshot for a decision or audit
- attach the context: filter settings and timestamp
- keep the raw exported file unchanged

## Common Mistakes

- Reading metrics without checking filters.
- Treating counts as KPIs (more controls ≠ better control environment).
- Sharing screenshots or exports without stating scope and as-of time.
- Overreacting to a single breach without checking trend and context.

## Troubleshooting

### Dashboard looks empty or incomplete

- Confirm you are authenticated.
- Confirm your permissions (issues/vendors widgets may be hidden).
- Try refresh; dashboard is live-updating.

### Export button fails

- Retry.
- Confirm you have a stable connection.
- If it persists, capture the error and escalate.

### Numbers don’t match a colleague’s screen

- Compare filters.
- Compare scope (global vs department).
- Check whether archived items are included in one view and not the other.
- In committee view, compare selected quarters and snapshot warnings; one user may be looking at live current-quarter metrics while another is looking at a stored historical quarter.

## Related Documentation

- `./getting-started.md`
- `./risks.md`
- `./controls.md`
- `./kris.md`
- `./issues.md`
- `./vendors.md`
- `./departments.md`
- `./notifications.md`
- `./activity-log.md`
