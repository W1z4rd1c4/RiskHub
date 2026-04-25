---
title: Departments and Organizational Scope
version: "2.4"
last_updated: "2026-04-25"
audience: user
source_of_truth: "frontend/src/pages/DepartmentsPage.tsx + frontend/src/services/departmentApi.ts"
summary: "How to use Departments to understand scope, exposure, and ownership routing across risks, controls, KRIs, users, and activity."
tags:
  - departments
  - access
  - overview
  - workflow
  - troubleshooting
---
# Departments and Organizational Scope

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

Use this manual when you need to understand how records are grouped by department, review ownership gaps, and open related risks, controls, KRIs, vendors, or issues from one place. It is written for users who review ownership and exposure by organizational area, so it focuses on what to do in the app, what to check before you act, and what result to expect after the work is done.

The page is not a technical reference. It explains the everyday operating pattern: start from the right screen, confirm the record is the one you intend to update, make the smallest useful change, and then verify the result in the list, detail page, notifications, or activity history.

You will use this area most often for:

- department list
- department detail
- owners
- risk/control/KRI summaries
- linked records

## Before You Start

Before working in this area, confirm three things. First, make sure you are signed in with the role you normally use for business work. Second, clear any old filters if the list looks incomplete. Third, check whether the record already has pending work in Approvals or Notifications.

If a button or tab is missing, treat that as a normal access signal, not as an error. RiskHub only shows actions that fit your role, scope, record ownership, and the current record state. When an action is unavailable, ask the record owner or your access contact to review it instead of trying to work around the screen.

Have the record name, code, owner, and department ready before asking for help. Those details make support and audit conversations much faster.

## Where To Find It

Primary route: `/departments`

You can usually reach this area from the left sidebar. Detail pages open by selecting a row or a linked card. If you arrive from another record, use the back button or the related-record links to return to the broader context.

Common navigation pattern:

1. Open the list page.
2. Clear filters if you are not sure what should be visible.
3. Search by name, owner, vendor, or department.
4. Open the record.
5. Review linked records and recent activity before changing anything.

## What You Can See and Change

What you can see depends on your role, department scope, and record ownership. A user with broad review responsibility may see more records than a user responsible for one department. A record owner may be able to act on a record even when it is outside the owner’s usual department view.

Typical information in this area includes:

- Department name
- Manager
- Risk count
- Control count
- Kri count
- Vendor and issue context

Changes should be practical and easy to explain. If the change affects ownership, scoring, closure, archive state, or other governance-sensitive information, expect a review step in some environments. Read-only users can still use the page for investigation, filtering, and evidence gathering.

## How To Complete Common Tasks

Follow this basic workflow unless your team has a stricter local procedure:

1. Open a department.
2. Review its current exposure.
3. Check owners and managers.
4. Open related records.
5. Prepare a department-focused evidence set.

After saving or submitting, verify the result. The list should show the new state, the detail page should match your intent, and any expected notification or approval item should be visible. If the page reports that the record changed while you were working, refresh and review the current record before trying again.

When linking records, choose only relationships that are useful to another reviewer. A link should explain a real business relationship: a control reduces a risk, a KRI monitors a risk, a vendor contributes to an exposure, or an issue tracks remediation for a specific problem.

## Approvals and Notifications

Department pages are mostly review surfaces. Changes to ownership or department assignment happen from the record itself or from authorized governance workflows and may require review.

Use approval notes to explain the business reason, not just the button you clicked. A good note says what changed, why it is appropriate, and what evidence supports the decision. Notifications are reminders and pointers; the record detail remains the best place to understand the full context.

If you receive a stale or rejected approval, do not immediately resubmit the same change. Open the record, compare the current state with your intended update, and submit a new focused change only if it is still needed.

## Finding, Filtering, and Evidence

Use department pages to confirm scope, ownership, and related-record context. The Departments page is a review and navigation surface; it does not provide its own export button.

For reliable results, work in this order:

1. Open the department detail page.
2. Review the summary counts and related records.
3. Open the relevant risk, control, KRI, vendor, or issue list with the same department context.
4. Record the related record names or codes that support your review.

For evidence, note the department, date, related record names, and the view you used.

## Tips and Common Mistakes

- Department is a reporting and responsibility lens; it does not replace a named owner.
- If a record appears in a department you did not expect, open the detail and check owner and linked context.
- Use Governance when ownership is missing.

Common mistakes are usually caused by stale filters, unclear ownership, duplicate records, or trying to make a broad change when a focused change would be easier to review. If something looks wrong, first refresh the page and confirm the same result in the detail view.

## Troubleshooting

If the page is empty, clear filters and search by a known record name. If the page is missing from the sidebar, your role may not include that work area. If a save fails, read the message, refresh the record, and check whether another user changed it first.

If a linked record is missing, you may not have access to that related item. Ask for the business name or code rather than a technical identifier. For support, include your role, the route you were using, the record name, the action you attempted, and the exact message shown on screen.

## Related Manuals

Start with [Governance](./governance.md), [Risks](./risks.md), [Controls](./controls.md), [Kris](./kris.md), [Vendors](./vendors.md). These manuals explain the connected workflows and help you follow the record from signal to action to evidence.
