---
title: Managing Controls
version: "2.5"
last_updated: "2026-07-16"
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

Use this manual when you need to design controls, assign owners, link controls to risks, record execution evidence, and understand when a control needs review. It is written for control owners and teams recording mitigation evidence, so it focuses on what to do in the app, what to check before you act, and what result to expect after the work is done.

The page is not a technical reference. It explains the everyday operating pattern: start from the right screen, confirm the record is the one you intend to update, make the smallest useful change, and then verify the result in the list, detail page, notifications, or activity history.

You will use this area most often for:

- control list
- control detail
- execution history
- risk links
- vendor context
- status and review signals

## Before You Start

Before working in this area, confirm three things. First, make sure you are signed in with the role you normally use for business work. Second, clear any old filters if the list looks incomplete. Third, check whether the record already has pending work in Approvals or Notifications.

If a button or tab is missing, treat that as a normal access signal, not as an error. RiskHub only shows actions that fit your role, scope, record ownership, and the current record state. When an action is unavailable, ask the record owner or your access contact to review it instead of trying to work around the screen.

Have the record name, code, owner, and department ready before asking for help. Those details make support and audit conversations much faster.

## Where To Find It

Primary route: `/controls`

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

- Control name and description
- Owner and department
- Frequency
- Design and operating status
- Execution result
- Linked risks and vendors

Changes should be practical and easy to explain. If the change affects ownership, scoring, closure, archive state, or other governance-sensitive information, expect a review step in some environments. Read-only users can still use the page for investigation, filtering, and evidence gathering.

## How To Complete Common Tasks

Follow this basic workflow unless your team has a stricter local procedure:

1. Create or update a control.
2. Connect it to the risks it mitigates.
3. Record an execution result.
4. Attach clear evidence notes.
5. Review failed or overdue controls.

After saving or submitting, verify the result. The list should show the new state, the detail page should match your intent, and any expected notification or approval item should be visible. If the page reports that the record changed while you were working, refresh and review the current record before trying again.

When linking records, choose only relationships that are useful to another reviewer. A link should explain a real business relationship: a control reduces a risk, a KRI monitors a risk, a vendor contributes to an exposure, or an issue tracks remediation for a specific problem.

## Approvals and Notifications

Sensitive edits and archive actions may wait for approval. Execution logs are usually recorded directly, but you should refresh the control before retrying if the page says the record changed.

Use approval notes to explain the business reason, not just the button you clicked. A good note says what changed, why it is appropriate, and what evidence supports the decision. Notifications are reminders and pointers; the record detail remains the best place to understand the full context.

If you receive a stale or rejected approval, do not immediately resubmit the same change. Open the record, compare the current state with your intended update, and submit a new focused change only if it is still needed.

## Finding, Filtering, and Evidence

The Control register now follows the shared register-list interaction used across the ICT Register. With no list state in the URL, it opens in **All** with active Controls and the backend's deterministic business-key order. Existing monitoring-status quick filters remain available. Use grouped views for Category, Department, Process, Risk type, Risk, or Vendor; a Control can appear in every applicable readable relationship group.

Search, view, sort, filters, and the selected group are addressable in the URL. Browser Back and Forward restore the working view, and a copied URL can reopen it for another User who has access to the same records. Page number is intentionally temporary and is not restored; changing a filter returns the list to page 1. Unknown URL parameters are preserved for safe navigation but are not sent to the API or export.

Filters combine predictably: different fields use **AND**, multiple values in one field use **OR** where a filter allows them, and search is additionally ANDed. Use an individual filter chip to remove one condition, or **Clear all** to return to the active-record baseline without clearing search. Filter choices, counts, and relationship groups come from the backend's permission-scoped visible universe, so a missing option can reflect access rather than missing data.

Lifecycle describes whether a record is live or archived; Control status (`Draft`, `Active`, or `Inactive`) and monitoring status are separate operational fields. They combine with AND. For example, Lifecycle **All** plus Control status **Inactive** plus monitoring status **Failed** means failed inactive Controls across live and archived records. Lifecycle **Archived** applies the same status criteria only to archived records. Every visible chip is sent to the list and **Current register view** export.

Filter by lifecycle, monitoring status, domain status, Process, or category before export; use the Department, Risk, or Vendor views for those relationship contexts. For audits, include both the Control definition and execution evidence. **Export** appears only when the backend grants the collection capability. The dialog makes two different evidence purposes explicit:

- **Current register view** is the default. It exports every matching readable Control under the current search, filters, sort, view, and selected group. It never limits the result to the current page, and it does not ask for a date.
- **Point-in-time audit snapshot** asks for an as-of date and uses the historical report contract. Choose it when audit evidence must show the Control register as of a specific day. Its mature CSV schema retains the Control definition plus Monitoring Status, Latest Execution Result, Latest Executed At, Days Since Last Execution, and linked-Risk evidence; it is not a grouped-view export.

Use **Current register view** for operational evidence that must match what you have narrowed on screen. Use **Point-in-time audit snapshot** for date-stamped audit evidence with the mature execution columns. Do not treat the two files as interchangeable.

For reliable results, filter in this order:

1. Start broad enough to confirm the record exists.
2. Narrow by department, owner, status, vendor, or date.
3. Open a sample record to confirm the filter matches your intent.
4. Choose Current register view or Point-in-time audit snapshot deliberately, then export only the evidence needed for the review.

Exports are evidence. Keep them small, label the time period, and avoid sharing unrelated personal or sensitive information.

Archived Controls stay outside the default active list. Select the archived lifecycle filter to review them. Restore is shown only when the row capability permits it; archive and restore authority is not inferred from whether the row is visible.

## Tips and Common Mistakes

- Link only controls that genuinely reduce the risk.
- Failed execution is useful evidence; do not hide it by rewriting the control.
- Keep frequency and next review expectations realistic.

Common mistakes are usually caused by stale filters, unclear ownership, duplicate records, or trying to make a broad change when a focused change would be easier to review. If something looks wrong, first refresh the page and confirm the same result in the detail view.

## Troubleshooting

If the page is empty, clear filters and search by a known record name. If the page is missing from the sidebar, your role may not include that work area. If a save fails, read the message, refresh the record, and check whether another user changed it first.

If a linked record is missing, you may not have access to that related item. Ask for the business name or code rather than a technical identifier. For support, include your role, the route you were using, the record name, the action you attempted, and the exact message shown on screen.

## Related Manuals

Start with [Risks](./risks.md), [Vendors](./vendors.md), [Issues](./issues.md), [Activity Log](./activity-log.md), [Notifications](./notifications.md). These manuals explain the connected workflows and help you follow the record from signal to action to evidence.
