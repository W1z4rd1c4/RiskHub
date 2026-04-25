---
title: Notifications and Approvals
version: "2.4"
last_updated: "2026-04-25"
audience: user
source_of_truth: "frontend/src/pages/ApprovalsPage.tsx + frontend/src/pages/NotificationsPage.tsx + docs/BUSINESS_LOGIC.md"
summary: "Production workflow manual for approvals, notifications, decision notes, queue triage, and escalation patterns."
tags:
  - workflow
  - approvals
  - notifications
  - audit
  - troubleshooting
---
# Notifications and Approvals

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

Use this manual when you need to understand what needs your attention, decide approval requests consistently, respond to reminders, and know where to look when a change is waiting. It is written for users who receive tasks, approval requests, reminders, or workflow updates, so it focuses on what to do in the app, what to check before you act, and what result to expect after the work is done.

The page is not a technical reference. It explains the everyday operating pattern: start from Notifications or Approvals, review the message or request, act only when the action is clear, and then verify the item state.

You will use this area most often for:

- notification bell
- notifications page
- approvals page
- decision notes
- linked records

## Before You Start

Before working in this area, confirm three things. First, make sure you are signed in with the role you normally use for business work. Second, clear any old filters if the list looks incomplete. Third, check whether the record already has pending work in Approvals or Notifications.

If a button or tab is missing, treat that as a normal access signal, not as an error. RiskHub only shows actions that fit your role, scope, record ownership, and the current record state. When an action is unavailable, ask the record owner or your access contact to review it instead of trying to work around the screen.

Have the record name, code, owner, and department ready before asking for help. Those details make support and audit conversations much faster.

## Where To Find It

Primary route: `/notifications`

You can usually reach this area from the left sidebar or notification bell. Notifications and Approvals are inbox surfaces with tabs, lists, row expansion, decision dialogs, and pagination. A notification may take you to a supported related page; otherwise, work stays in the inbox.

Common navigation pattern:

1. Open Notifications or Approvals.
2. Choose All, Unread, Pending, or the relevant approval tab.
3. Read the message, requester, due date, and current state.
4. Expand the row or open the decision dialog when available.
5. Follow a related page link only when the notification provides one.

## What You Can See and Change

What you can see depends on your role, department scope, and record ownership. A user with broad review responsibility may see more records than a user responsible for one department. A record owner may be able to act on a record even when it is outside the owner’s usual department view.

Typical information in this area includes:

- Notification title
- Related record
- Due date
- Approval requester
- Decision note
- Current status

Changes should be practical and easy to explain. If the change affects ownership, scoring, closure, archive state, or other governance-sensitive information, expect a review step in some environments. Read-only users can still use the page for investigation, filtering, and evidence gathering.

## How To Complete Common Tasks

Follow this basic workflow unless your team has a stricter local procedure:

1. Open a notification.
2. Follow it to the related record.
3. Review an approval request.
4. Approve or reject with a clear note.
5. Clear reminders after the underlying work is complete.

After approving, rejecting, cancelling, or marking items read, verify that the inbox row updates and the badge count changes. If the page reports that the item changed while you were working, refresh and review the current row before trying again.

When acting from a notification, make the decision from the current message and related context, not from memory of an older state.

## Approvals and Notifications

Approvals are the control point for sensitive changes. Review the record context, compare the requested change with the current state, and write a decision note that another reviewer can understand.

Use approval notes to explain the business reason, not just the button you clicked. A good note says what changed, why it is appropriate, and what evidence supports the decision. Notifications are reminders and pointers; the inbox row and Activity Log help reconstruct the workflow.

If you receive a stale or rejected approval, do not immediately resubmit the same change. Refresh the inbox, compare the current row with your intended update, and submit a new focused change only if it is still needed.

## Finding, Filtering, and Evidence

Use filters and status cues to triage notifications and approvals. The Notifications and Approvals pages do not provide an export button, so use them to make decisions and reconstruct workflow context.

For reliable results, work in this order:

1. Start with the unread, pending, or most recent items.
2. Open the related page before approving, rejecting, or escalating when the notification provides one.
3. Record clear decision notes when you act.
4. Use Activity Log and the current inbox state when you need an evidence trail.

For formal evidence, use the Activity Log entry and the current inbox or approval row that records the decision.

## Tips and Common Mistakes

- Do not approve a change you cannot explain.
- If the record changed since the request was created, reject or ask for a fresh request.
- Use reminders as prompts to complete the work, not as evidence by themselves.

Common mistakes are usually caused by stale inbox data, unread filters, unclear requester context, or acting from an old notification. If something looks wrong, first refresh the page and confirm the same result in the inbox row.

## Troubleshooting

If the page is empty, clear filters and search by a known record name. If the page is missing from the sidebar, your role may not include that work area. If a save fails, read the message, refresh the record, and check whether another user changed it first.

If a linked record is missing, you may not have access to that related item. Ask for the business name or code rather than a technical identifier. For support, include your role, the route you were using, the record name, the action you attempted, and the exact message shown on screen.

## Related Manuals

Start with [Activity Log](./activity-log.md), [Risks](./risks.md), [Controls](./controls.md), [Kris](./kris.md), [Issues](./issues.md). These manuals explain the connected workflows and help you follow the record from signal to action to evidence.
