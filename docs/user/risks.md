---
title: Managing Risks
version: "2.4"
last_updated: "2026-04-25"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md §2.1, §6, §7 + frontend/src/pages/RisksPage.tsx"
summary: "Full manual for building and operating a high-quality risk register: scoring, ownership, scope rules, control linkage, exports, and approval-aware edits."
tags:
  - risks
  - workflow
  - approvals
  - exports
  - troubleshooting
---
# Managing Risks

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

Use this manual when you need to create useful risk records, keep ownership and scoring current, connect risks to controls, KRIs, and vendors, and prepare audit-ready evidence. It is written for risk owners, reviewers, and managers maintaining the risk register, so it focuses on what to do in the app, what to check before you act, and what result to expect after the work is done.

The page is not a technical reference. It explains the everyday operating pattern: start from the right screen, confirm the record is the one you intend to update, make the smallest useful change, and then verify the result in the list, detail page, notifications, or activity history.

You will use this area most often for:

- risk list
- risk detail
- risk scoring
- linked controls
- linked KRIs
- linked vendors
- questionnaires

## Before You Start

Before working in this area, confirm three things. First, make sure you are signed in with the role you normally use for business work. Second, clear any old filters if the list looks incomplete. Third, check whether the record already has pending work in Approvals or Notifications.

If a button or tab is missing, treat that as a normal access signal, not as an error. RiskHub only shows actions that fit your role, scope, record ownership, and the current record state. When an action is unavailable, ask the record owner or your access contact to review it instead of trying to work around the screen.

Have the record name, code, owner, and department ready before asking for help. Those details make support and audit conversations much faster.

## Where To Find It

Primary route: `/risks`

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

- Risk name and description
- Owner and department
- Gross and net scoring
- Linked controls
- Linked kris
- Linked vendors
- Questionnaire history

Changes should be practical and easy to explain. If the change affects ownership, scoring, closure, archive state, or other governance-sensitive information, expect a review step in some environments. Read-only users can still use the page for investigation, filtering, and evidence gathering.

## How To Complete Common Tasks

Follow this basic workflow unless your team has a stricter local procedure:

1. Create a clear risk statement.
2. Set owner, department, likelihood, and impact.
3. Link controls that reduce the risk.
4. Link kris that monitor the risk.
5. Connect vendors when third parties are part of the exposure.
6. Answer or review questionnaires and clarifications.

After saving or submitting, verify the result. The list should show the new state, the detail page should match your intent, and any expected notification or approval item should be visible. If the page reports that the record changed while you were working, refresh and review the current record before trying again.

When linking records, choose only relationships that are useful to another reviewer. A link should explain a real business relationship: a control reduces a risk, a KRI monitors a risk, a vendor contributes to an exposure, or an issue tracks remediation for a specific problem.

## Approvals and Notifications

Edits that affect governance, ownership, scoring, or archive state may be sent for review. If a change is waiting, use Approvals or Notifications to follow it instead of creating a second competing edit.

Use approval notes to explain the business reason, not just the button you clicked. A good note says what changed, why it is appropriate, and what evidence supports the decision. Notifications are reminders and pointers; the record detail remains the best place to understand the full context.

If you receive a stale or rejected approval, do not immediately resubmit the same change. Open the record, compare the current state with your intended update, and submit a new focused change only if it is still needed.

## Finding, Filtering, and Evidence

Use list filters, grouped views, and the detail page to confirm the exact risks you need before exporting. Include links to controls, KRIs, and vendors when the evidence needs context.

For reliable results, filter in this order:

1. Start broad enough to confirm the record exists.
2. Narrow by department, owner, status, vendor, or date.
3. Open a sample record to confirm the filter matches your intent.
4. Export only the filtered view needed for the review.

Exports are evidence. Keep them small, label the time period, and avoid sharing unrelated personal or sensitive information.

## Tips and Common Mistakes

- Write the risk as a business failure mode, not a vague concern.
- Do not lower net score unless controls and evidence justify it.
- Use clarification threads on questionnaires instead of guessing missing answers.

Common mistakes are usually caused by stale filters, unclear ownership, duplicate records, or trying to make a broad change when a focused change would be easier to review. If something looks wrong, first refresh the page and confirm the same result in the detail view.

## Troubleshooting

If the page is empty, clear filters and search by a known record name. If the page is missing from the sidebar, your role may not include that work area. If a save fails, read the message, refresh the record, and check whether another user changed it first.

If a linked record is missing, you may not have access to that related item. Ask for the business name or code rather than a technical identifier. For support, include your role, the route you were using, the record name, the action you attempted, and the exact message shown on screen.

## Related Manuals

Start with [Controls](./controls.md), [Kris](./kris.md), [Vendors](./vendors.md), [Risk Hub](./risk-hub.md), [Notifications](./notifications.md). These manuals explain the connected workflows and help you follow the record from signal to action to evidence.
