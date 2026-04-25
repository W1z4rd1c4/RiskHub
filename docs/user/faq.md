---
title: User FAQ and Operational Support
version: "2.4"
last_updated: "2026-04-25"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md + in-app workflow behavior"
summary: "Fast answers for common user issues: visibility, approvals, edits, notifications, exports, and where to look before escalating."
tags:
  - overview
  - troubleshooting
  - workflow
  - approvals
  - notifications
  - exports
---
# User FAQ and Operational Support

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

Use this manual when you need to answer common questions about missing data, approvals, edits, exports, notifications, and where to get help. It is written for users troubleshooting common RiskHub questions, so it focuses on what to do in the app, what to check before you act, and what result to expect after the work is done.

The page is not a technical reference. It explains the everyday operating pattern: start from the page where the question happened, confirm the visible item or message, make only the supported action, and then verify the result in the same page, notifications, or activity history.

You will use this area most often for:

- visibility checks
- workflow status
- exports
- notifications
- manual reader
- support handoff

## Before You Start

Before working in this area, confirm three things. First, make sure you are signed in with the role you normally use for business work. Second, clear any old filters if the list looks incomplete. Third, check whether the record already has pending work in Approvals or Notifications.

If a button or tab is missing, treat that as a normal access signal, not as an error. RiskHub only shows actions that fit your role, scope, record ownership, and the current record state. When an action is unavailable, ask the record owner or your access contact to review it instead of trying to work around the screen.

Have the record name, code, owner, and department ready before asking for help. Those details make support and audit conversations much faster.

## Where To Find It

Primary route: `/settings`

You can usually reach the relevant area from the left sidebar, notification, or related link. Different modules use different patterns: tables, tabs, quick views, modals, drilldowns, or separate pages. Follow the controls that are visible on the page where the question started.

Common navigation pattern:

1. Open the list page.
2. Clear filters if you are not sure what should be visible.
3. Search by name, owner, vendor, or department.
4. Open the row, card, modal, drilldown, or separate page only when that page offers one.
5. Review linked records and recent activity before changing anything.

## What You Can See and Change

What you can see depends on your role, department scope, and record ownership. A user with broad review responsibility may see more records than a user responsible for one department. A record owner may be able to act on a record even when it is outside the owner’s usual department view.

Typical information in this area includes:

- Your role
- Department scope
- Filters used
- Record name or code
- Error text
- Time of the action

Changes should be practical and easy to explain. If the change affects ownership, scoring, closure, archive state, or other governance-sensitive information, expect a review step in some environments. Read-only users can still use the page for investigation, filtering, and evidence gathering.

## How To Complete Common Tasks

Follow this basic workflow unless your team has a stricter local procedure:

1. Diagnose a missing page.
2. Diagnose a missing record.
3. Understand why a change is waiting.
4. Prepare a useful support request.
5. Find the right manual.

After saving or submitting, verify the result in the page where the work happened and in any expected notification or approval item. If the page reports that the item changed while you were working, refresh and review the current state before trying again.

When linking records, choose only relationships that are useful to another reviewer. A link should explain a real business relationship: a control reduces a risk, a KRI monitors a risk, a vendor contributes to an exposure, or an issue tracks remediation for a specific problem.

## Approvals and Notifications

If a change is waiting, check Approvals and Notifications before trying again. Duplicate edits can make the review harder and may be rejected if the record changed meanwhile.

Use approval notes to explain the business reason, not just the button you clicked. A good note says what changed, why it is appropriate, and what evidence supports the decision. Notifications are reminders and pointers; the current page and Activity Log help reconstruct the context.

If you receive a stale or rejected approval, do not immediately resubmit the same change. Return to the page where the work started, compare the current state with your intended update, and submit a new focused change only if it is still needed.

## Finding, Filtering, and Evidence

This FAQ helps you diagnose export questions, but it does not provide an export control itself. When a question is about exports, first open the page that owns the data and confirm that page actually shows an export button.

For reliable results, filter in this order:

1. Start broad enough to confirm the record exists.
2. Narrow by department, owner, status, vendor, or date.
3. Open a sample row, card, modal, drilldown, or separate page only when that page offers one.
4. If the page has an export button, retry with fewer filters and a shorter date range.
5. If the page has no export button, capture the visible filters, record name, time, and a screenshot or note approved by your team.

For support, include the manual name, page, filter choices, time, and exact message. Do not promise an export from pages that only support search, refresh, pagination, or review.

## Tips and Common Mistakes

- Refresh once before reporting a stale screen.
- Clear filters before assuming data is gone.
- Use screenshots carefully and avoid sharing more personal or sensitive information than needed.

Common mistakes are usually caused by stale filters, unclear ownership, duplicate-looking names, or trying to make a broad change when a focused change would be easier to review. If something looks wrong, first refresh the page and confirm the same result in the visible list, panel, modal, drilldown, or page.

## Troubleshooting

If the page is empty, clear filters and search by a known record name. If the page is missing from the sidebar, your role may not include that work area. If a save fails, read the message, refresh the record, and check whether another user changed it first.

If a linked record is missing, you may not have access to that related item. Ask for the business name or code rather than a technical identifier. For support, include your role, the route you were using, the record name, the action you attempted, and the exact message shown on screen.

## Related Manuals

Start with [Getting Started](./getting-started.md), [Access Management](./access-management.md), [Notifications](./notifications.md), [Activity Log](./activity-log.md), [Dashboard](./dashboard.md). These manuals explain the connected workflows and help you follow the record from signal to action to evidence.
