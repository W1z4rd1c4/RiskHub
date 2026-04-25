---
title: Dashboard and Reporting Overview
version: "2.4"
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
- [What This Page Helps You Do](#what-this-page-helps-you-do)
- [Before You Start](#before-you-start)
- [Where To Find It](#where-to-find-it)
- [What You Can See and Change](#what-you-can-see-and-change)
- [How To Complete Common Tasks](#how-to-complete-common-tasks)
- [Approvals and Notifications](#approvals-and-notifications)
- [Finding, Filtering, and Evidence](#finding-filtering-and-evidence)
- [Tips and Common Mistakes](#tips-and-common-mistakes)
- [Troubleshooting](#troubleshooting)
- [Related Manuals](#related-manuals)

## What This Page Helps You Do

Use this manual when you need to read the main signals, compare periods, open supporting records, and export evidence without changing any business data. It is written for users who need a quick view of current risk posture, so it focuses on what to do in the app, what to check before you act, and what result to expect after the work is done.

The page is not a technical reference. It explains the everyday operating pattern: start from the dashboard view, confirm the metric or widget, drill into supporting lists when available, and export the summary when you need evidence.

You will use this area most often for:

- summary cards
- risk heat map
- KRI widgets
- quarterly comparison
- committee view
- exports

## Before You Start

Before working in this area, confirm three things. First, make sure you are signed in with the role you normally use for business work. Second, clear any old filters if the list looks incomplete. Third, check whether the record already has pending work in Approvals or Notifications.

If a button or tab is missing, treat that as a normal access signal, not as an error. RiskHub only shows actions that fit your role, scope, record ownership, and the current record state. When an action is unavailable, ask the record owner or your access contact to review it instead of trying to work around the screen.

Have the record name, code, owner, and department ready before asking for help. Those details make support and audit conversations much faster.

## Where To Find It

Primary route: `/`

You can usually reach this area from the left sidebar or the home route. Dashboard is a summary surface with filters, widgets, matrix drilldowns, committee view, and export. Work stays in widgets, views, drilldowns, and supporting lists.

Common navigation pattern:

1. Open Dashboard.
2. Clear or set the department filter.
3. Review the widget, chart, or matrix that raised the question.
4. Use available drilldowns to open the supporting list.
5. Export the dashboard summary only after confirming the filters.

## What You Can See and Change

What you can see depends on your role, department scope, and record ownership. A user with broad review responsibility may see more records than a user responsible for one department. A record owner may be able to act on a record even when it is outside the owner’s usual department view.

Typical information in this area includes:

- Risk counts and scores
- Control status
- Kri status
- Vendor concentration signals
- Quarterly comparison notes

Changes should be practical and easy to explain. If the change affects ownership, scoring, closure, archive state, or other governance-sensitive information, expect a review step in some environments. Read-only users can still use the page for investigation, filtering, and evidence gathering.

## How To Complete Common Tasks

Follow this basic workflow unless your team has a stricter local procedure:

1. Review today’s risk posture.
2. Filter by department or time period.
3. Open supporting risks, controls, kris, or vendors.
4. Prepare a compact evidence export.

After changing filters or switching views, verify that the dashboard widgets, charts, and summary counts match your intent. If the page reloads while you are working, refresh and review the current filters before using the numbers.

When linking records, choose only relationships that are useful to another reviewer. A link should explain a real business relationship: a control reduces a risk, a KRI monitors a risk, a vendor contributes to an exposure, or an issue tracks remediation for a specific problem.

## Approvals and Notifications

Dashboard pages do not approve changes. They show the current state after normal workflow rules have been applied. Pending approvals may explain why a number has not changed yet.

Use approval notes to explain the business reason, not just the button you clicked. A good note says what changed, why it is appropriate, and what evidence supports the decision. Notifications are reminders and pointers; dashboard widgets and supporting lists help explain the current context.

If you receive a stale or rejected approval, do not immediately resubmit the same change. Open the supporting list or source page, compare the current state with your intended update, and submit a new focused change only if it is still needed.

## Finding, Filtering, and Evidence

Use filters first, then export. For committee or quarterly views, note whether the selected period has complete historical snapshots or whether the page marks part of the comparison as unavailable.

For reliable results, filter in this order:

1. Start broad enough to confirm the record exists.
2. Narrow by department, owner, status, vendor, or date.
3. Open a supporting list or drilldown, when available, to confirm the filter matches your intent.
4. Export only the filtered view needed for the review.

Exports are evidence. Keep them small, label the time period, and avoid sharing unrelated personal or sensitive information.

## Tips and Common Mistakes

- Treat missing comparison data as a snapshot availability question, not as a zero value.
- Open the supporting list before escalating a dashboard number.
- Use the same filters in the export that you used while reviewing the screen.

Common mistakes are usually caused by stale filters, unclear department scope, or reading a summary without checking the supporting list. If something looks wrong, first refresh the page and confirm the same result in the dashboard widgets.

## Troubleshooting

If the page is empty, clear filters and search by a known record name. If the page is missing from the sidebar, your role may not include that work area. If a save fails, read the message, refresh the record, and check whether another user changed it first.

If a linked record is missing, you may not have access to that related item. Ask for the business name or code rather than a technical identifier. For support, include your role, the route you were using, the record name, the action you attempted, and the exact message shown on screen.

## Related Manuals

Start with [Risks](./risks.md), [Controls](./controls.md), [Kris](./kris.md), [Vendors](./vendors.md), [Notifications](./notifications.md). These manuals explain the connected workflows and help you follow the record from signal to action to evidence.
