---
title: Activity Log (Audit Trail for Business Changes)
version: "2.4"
last_updated: "2026-04-25"
audience: user
source_of_truth: "frontend/src/pages/ActivityLogPage.tsx + backend activity log endpoints"
summary: "How to use the Activity Log to investigate changes, confirm approvals, and build an audit-ready narrative without exposing sensitive data."
tags:
  - activity-log
  - audit
  - overview
  - troubleshooting
  - workflow
---
# Activity Log (Audit Trail for Business Changes)

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

Use this manual when you need to find who changed what, when it happened, which record was affected, and how the change relates to approvals or follow-up work. It is written for users who need to reconstruct business changes, so it focuses on what to do in the app, what to check before you act, and what result to expect after the work is done.

The page is not a technical reference. It explains the everyday operating pattern: start from the Activity Log, narrow the timeline, review the entry card and change summary, and then record the evidence you need.

You will use this area most often for:

- activity list
- filters
- record links
- event details

## Before You Start

Before working in this area, confirm three things. First, make sure you are signed in with the role you normally use for business work. Second, clear any old filters if the list looks incomplete. Third, check whether the record already has pending work in Approvals or Notifications.

If a button or tab is missing, treat that as a normal access signal, not as an error. RiskHub only shows actions that fit your role, scope, record ownership, and the current record state. When an action is unavailable, ask the record owner or your access contact to review it instead of trying to work around the screen.

Have the record name, code, owner, and department ready before asking for help. Those details make support and audit conversations much faster.

## Where To Find It

Primary route: `/activity-log`

You can usually reach this area from the left sidebar. The Activity Log is a timeline surface with tabs, filters, entry cards, refresh, and pagination. Work stays in the filtered timeline.

Common navigation pattern:

1. Open Activity Log.
2. Pick the right tab for the type of activity you need.
3. Clear filters if you are not sure what should be visible.
4. Search by person, action, record type, record name, department, or date.
5. Review the matching entry cards and change summaries.

## What You Can See and Change

What you can see depends on your role, department scope, and record ownership. A user with broad review responsibility may see more records than a user responsible for one department. A record owner may be able to act on a record even when it is outside the owner’s usual department view.

Typical information in this area includes:

- Event time
- Actor
- Action
- Record type
- Record name or code
- Change summary
- Related approval when available

Changes should be practical and easy to explain. If the change affects ownership, scoring, closure, archive state, or other governance-sensitive information, expect a review step in some environments. Read-only users can still use the page for investigation, filtering, and evidence gathering.

## How To Complete Common Tasks

Follow this basic workflow unless your team has a stricter local procedure:

1. Search by date, person, record, or action.
2. Review the matching entry cards.
3. Compare activity timestamps with approvals.
4. Capture the focused timeline details for audit notes or support.

After filtering or refreshing, verify that the timeline shows the expected event, actor, action, and change summary. If the page reloads while you are working, review the current filters before recording the result.

When using the Activity Log as evidence, keep the time window, actor, action, record type, and change summary together so another reviewer can reconstruct the sequence.

## Approvals and Notifications

Approved changes may appear as both a request and an applied change. Use the timestamps and actor names to explain the sequence rather than assuming the same person performed every step.

Use approval notes to explain the business reason, not just the button you clicked. A good note says what changed, why it is appropriate, and what evidence supports the decision. Notifications are reminders and pointers; Activity Log entries show the timeline of what happened.

If you receive a stale or rejected approval, do not immediately resubmit the same change. Compare the approval timestamps with the Activity Log and submit a new focused change only if it is still needed.

## Finding, Filtering, and Evidence

Use the time window, actor, action, and record filters to narrow the timeline. The business Activity Log page is for investigation and review; it does not provide a user-facing export button.

For reliable results, work in this order:

1. Start with the smallest time window that could contain the event.
2. Narrow by person, action, record type, or record name.
3. Review the entry description and change summary when you need business context.
4. Capture the filtered view details in your audit notes or support handoff.

For formal evidence, record the filtered time window, actor, action, and related record name in your audit notes or support handoff.

## Tips and Common Mistakes

- Use business names or codes in your search notes.
- If a record name changed, search around the time of the change and compare the old and new names shown in the entry.
- Do not treat missing access to a linked record as proof that the activity is wrong.

Common mistakes are usually caused by stale filters, wrong tabs, unclear actor names, or a time window that is too narrow. If something looks wrong, first refresh the page and confirm the same result in the filtered timeline.

## Troubleshooting

If the page is empty, clear filters, switch tabs, and search by a known record name or actor. If the page is missing from the sidebar, your role may not include that work area. If loading fails, read the message and refresh the timeline.

If an expected activity is missing, you may be outside the right date range, tab, or department scope. Ask for the business name or code rather than a technical identifier. For support, include your role, the route you were using, the record name, filters, and exact message shown on screen.

## Related Manuals

Start with [Notifications](./notifications.md), [Risks](./risks.md), [Controls](./controls.md), [Issues](./issues.md), [Access Management](./access-management.md). These manuals explain the connected workflows and help you follow the record from signal to action to evidence.
