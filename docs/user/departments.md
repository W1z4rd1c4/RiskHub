---
title: Departments and Organizational Scope
version: "2.5"
last_updated: "2026-07-31"
audience: user
source_of_truth: "frontend/src/pages/DepartmentsPage.tsx + frontend/src/services/departmentApi.ts"
summary: "How to use the Department workspace across risks, controls, KRIs, issues, processes, assets, vendors, users, and activity."
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

Department detail always provides ten tabs:

1. Overview
2. Risks
3. Controls
4. KRIs
5. Issues
6. Processes
7. Assets
8. Vendors
9. Users
10. Activity

Threats are intentionally absent because Threat stewardship is global rather than Department-owned.

Overview has exactly eight entity cards in a four-column by two-row desktop grid, followed by full-width recent Department activity. The health signals are fixed: Risks show high and critical; Controls show attention; KRIs show breach and overdue; Issues show open and overdue; Processes show critical and Critical or Important Function (CIF); Assets show critical and legacy; Vendors show critical and DORA; Users show active. The grid reflows to two columns and then one column on narrower supported layouts.

The total and each health number are separate actions. Selecting a total opens the matching tab without an added health filter. Selecting a health number opens the same tab with that exact health filter. In both cases, the Department filter remains locked and cannot be removed or replaced. Counts use the same permission-scoped records as the destination register and exclude proposed creations that are still pending approval. A metric shown as **N/A** is unavailable under the current user's permissions.

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

Use department pages to confirm scope, ownership, and related-record context. Each entity tab is the same register experience as its top-level page: search, filters, grouped views, sorting, pagination, capability-driven actions, pending badges, archive treatment, and filtered export remain available. The Department itself is a locked filter. **Clear all** clears only filters you added; it cannot remove or replace the Department.

For reliable results, work in this order:

1. Open the department detail page.
2. Review the summary counts and related records.
3. Open the relevant Risk, Control, KRI, Issue, Process, Asset, Vendor, or User tab.
4. Record the related record names or codes that support your review.

The URL preserves the selected tab and allowed register state, so browser Back and Forward can return to the prior search, view, group, sort, filters, and page. Export from an entity tab includes all matching Department rows under your permissions, not just the visible page.

Department membership follows the record's canonical Owning Department. The home Department of a Process Owner, Asset Owner, Vendor Outsourcing Owner, or other Accountable User does not move the record between Department tabs.

For evidence, note the department, date, related record names, filters, and the view you used.

## Tips and Common Mistakes

- Department is a reporting and responsibility lens; it does not replace a named owner.
- If a record appears in a department you did not expect, open the detail and check its Owning Department separately from the Accountable owner's home Department.
- Use Governance when ownership is missing.

Common mistakes are usually caused by stale filters, unclear ownership, duplicate records, or trying to make a broad change when a focused change would be easier to review. If something looks wrong, first refresh the page and confirm the same result in the detail view.

## Troubleshooting

If the page is empty, clear filters and search by a known record name. If the page is missing from the sidebar, your role may not include that work area. If a save fails, read the message, refresh the record, and check whether another user changed it first.

If a linked record is missing, you may not have access to that related item. Ask for the business name or code rather than a technical identifier. For support, include your role, the route you were using, the record name, the action you attempted, and the exact message shown on screen.

## Related Manuals

Start with [Governance](./governance.md), [Risks](./risks.md), [Controls](./controls.md), [Kris](./kris.md), [Vendors](./vendors.md). These manuals explain the connected workflows and help you follow the record from signal to action to evidence.
