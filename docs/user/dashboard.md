---
title: Dashboard and Reporting Overview
version: "2.5"
last_updated: "2026-07-13"
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
- [Dashboard views & committee access](#dashboard-views--committee-access)
- [ICT Register evidence export](#ict-register-evidence-export)
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

## Dashboard views & committee access

The dashboard is view-addressable through the `?view=` query parameter, so a specific tab can be linked or bookmarked:

- `/` — the overview is the canonical default and carries no `?view=` parameter.
- `/?view=risk-committee` — the Risk Committee view, shown only to users who hold committee access.
- `/?view=ict-committee` — the ICT Risk Committee view, shown only to users who have ICT Risk Committee access.

Tab visibility is capability-dependent: each committee tab appears only when your role grants the matching read permission. If you open a committee link you are not authorized for — or a `?view=` value the page does not recognize — the dashboard normalizes the address back to the overview default, shows the overview, and does not load any committee data. The older `/ict-register/committee` address still works and redirects to `/?view=ict-committee`; there is no separate sidebar entry for the committee page.

## ICT Register evidence export

The DORA ICT Register export itself lives on the Vendor Reports page. From the ICT Register readiness screens — the Data Quality page and the ICT Risk Committee view — a "Download DORA register" link appears only when you have permission to download the DORA register. If you can read a readiness screen but cannot export the register, the link stays hidden so you never see an action you cannot use. Follow the link to reach the export, then set your filters before downloading, using the same export discipline described below.

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

Use filters first, then export. The summary export uses the same actor-visible population, filters, and configured Risk thresholds as the screen, and records its own generation time. Its metadata states that Risk Level applies only to Risk metrics, Control Status and Control Form apply only to Control metrics, and Vendor metrics are unaffected by those Risk and Control filters. Hidden metrics are not quantified.

For an in-progress current quarter, flow metrics compare equal elapsed windows; completed quarters use their complete windows. The comparison shows exact flow ranges plus the observation time and Live, Stored, or Missing source for stock values. Stored observations must have the same snapshot type: quarter-end pairs compare, while manual pairs compare only when both were captured at the exact quarter end or at equivalent positions within their quarters. Mixed manual and quarter-end observations, genuinely unequal manual positions, and observations with different metric definitions are not compared. A change from zero is shown as **New (from 0)** with the absolute change and no percentage. Unsupported or missing comparisons remain N/A rather than implying a trend.

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

Start with [Risks](./risks.md), [Controls](./controls.md), [KRIs](./kris.md), [Vendors](./vendors.md), [Notifications](./notifications.md). These manuals explain the connected workflows and help you follow the record from signal to action to evidence.
