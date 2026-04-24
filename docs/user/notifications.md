---
title: Notifications and Approvals
version: "2.1"
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

RiskHub uses workflow for governance. The workflow system shows up in two places:

- **Notifications** (`/notifications`): your operational inbox
- **Approvals** (`/approvals`): the queue of approval requests and risk assessment questionnaires

The mental model that works in production:

- Notifications tell you *what needs attention*.
- Approvals tell you *what needs a decision*.
- Activity Log (if you have access) tells you *what actually changed*.

A healthy workflow culture is not “approve everything quickly”. It is:

- decisions with explicit rationale
- predictable escalation
- minimal backlog
- clear ownership of next actions

Primary routes:

- `/notifications`
- `/approvals`

## Where To Find It

- Sidebar item **Approvals** → `/approvals`
- Sidebar item **Notifications** → `/notifications`

If you don’t see these routes:

- approvals are usually visible to most business users, but the ability to resolve depends on permissions
- notifications are typically visible if your account receives workflow events

If access seems wrong, validate your role and permissions as described in `./access-management.md`.

## Roles, Scope, and Visibility

### Who can resolve approvals?

Approvals have two audiences:

- **requesters**: people who propose a change (they should be able to track status)
- **resolvers**: people who can approve/reject (policy-driven)

In the UI, the ability to resolve approvals is permission-gated. A common pattern is:

- `approvals:write` is required to approve/reject
- users without resolver permissions still see “My requests” and can cancel their own requests

### Scope matters

Approvals are tied to resources (risk/control/kri) and your visibility is still governed by scope.

If you can’t find an approval someone references:

- you may not have visibility to the underlying resource
- or the approval is not assigned to your scope/role group

### Admin vs business users

Platform admins are intentionally separated from business workflow. They should support workflow from the platform side, not act as business approvers.

## Data Model and Key Fields

### Approval requests

| Field | Meaning | Notes |
|---|---|---|
| Resource type | `risk`, `control`, `kri` | Which domain the request affects. |
| Action type | `edit` or `delete` | Deletion includes archive/restore-like governance depending on policy. |
| Pending changes | Field-level deltas (old → new) | Review these carefully; don’t approve blind. |
| Reason | Requester’s rationale | Should answer “why now” and “why safe”. |
| Status | `pending`, `pending_privileged`, `approved`, `rejected`, `cancelled` | `pending_privileged` indicates higher-sensitivity gating. |
| Requested by | Who initiated | Use for follow-up questions. |
| Resolved by / at | Who decided and when | This is audit-critical. |
| Resolution notes | The decision narrative | Required in the UI for approvals/rejections. |

### Notifications

Notifications are typed events. Common categories:

- approvals: `approval_pending`, `approval_resolved`, `approval_cancelled`
- KRIs: due/overdue and breach detection
- questionnaires: sent/due/overdue/submitted/clarification

Each notification includes:

- title/message for quick scanning
- a resource pointer (type/id) when it is tied to an entity
- read/unread state
- timestamps (created and sometimes expires)

## Core Workflows

### 1) Daily queue triage (recommended cadence)

Run this twice daily in most environments (morning + late afternoon):

1. Open `/notifications`.
2. Switch to **Unread**.
3. Process in priority order:
   - approval pending
   - overdue KRI / questionnaire
   - breach alerts
4. Open `/approvals` and clear pending decisions you are responsible for.
5. Re-check `/notifications` for outcomes.

This keeps backlog low and prevents “silent drift” where risky changes accumulate without oversight.

### 2) Approve or reject a request

When you resolve an approval, do it like a control:

1. Open the approval request.
2. Read the **reason**.
3. Review **pending changes** field by field.
4. Ask: “If this were wrong, what would break?” (scope, reporting, ownership routing, thresholds).
5. Decide approve or reject.
6. Write resolution notes that a third party could understand in six months.

Good resolution notes include:

- why it is approved/rejected
- what evidence you relied on
- any conditions or follow-up actions

### 3) Cancel a request you created

If you are the requester and the request is no longer valid:

- cancel it instead of letting it expire in pending
- leave a short note in your team channel or ticket system explaining the cancellation

Cancellation is a governance action: it reduces queue noise and prevents stale changes from being approved later.

### 4) Risk assessment questionnaires (Approvals tab)

The approvals page can include a “risk assessment” view powered by questionnaires.

Use it to:

- see which risk owners have outstanding questionnaires
- follow up on overdue submissions
- track clarifications

Operational pattern:

- treat questionnaires like time-boxed requests
- follow up early (before overdue) to avoid last-minute low-quality responses
- KRI due/overdue reminders are period-aware; an older period reminder should not hide a new period that needs reporting
- KRI breach reminders are state-aware; a changed breach direction or threshold context can create a new notification
- questionnaire due-soon/overdue reminders are deduped per questionnaire instance, not just per risk
- notifications still navigate to the parent risk so the recipient lands in the operational context

### 5) Close the loop after a decision

Approvals are only valuable if the operational world updates accordingly.

After approving a sensitive change:

- confirm the entity reflects the new state
- confirm stakeholders were notified (or that the change is visible where expected)
- if the change affects reporting, note the date so reviewers understand breakpoints

## Approvals and Notifications Behavior

### The most important behavior: 202 “queued changes”

Some edits are not applied immediately. Instead, the backend returns a queued approval response (often surfaced as “pending changes” in the UI).

Practical consequences:

- the list may show a “pending” indicator on the item
- the old value may remain visible until approval
- you must check `/approvals` to see whether the request exists and who can resolve it

### Notifications are signals, not actions

Notifications are designed to reduce scanning cost. Your job is to convert them into actions:

- resolve an approval
- update an entity
- create an Issue
- follow up with an owner

If a notification “keeps coming back”, it is usually telling you the underlying policy is not being executed (overdue KRI, repeated breach, stuck approval).

Approval execution is apply-time validated. A queued change can be rejected during approval if the target record changed while the request was pending; read the resolution notes before resubmitting.

### Preference tuning

Notification preferences may be configurable in Settings depending on your deployment. If you are overwhelmed:

- do not mute everything
- tune high-volume categories while keeping governance-critical categories on (approvals, breaches)

## Filters, Views, and Exports

### Approvals filters

The approvals page supports operational filters:

- **Pending**: the active queue
- **My requests**: what you submitted (useful for follow-up)
- **All**: history (useful for audits and “why did this change?” questions)
- **Risk assessment**: questionnaires view

Use “Pending” as your primary queue view.

### Notifications filters

Notifications typically support:

- **All** vs **Unread**
- pagination
- mark all as read

Treat “mark all read” as a decision: only do it when you have either acted or consciously deferred.

### Exports

Approvals and notifications are not primarily export surfaces.

If you need evidence:

- export the underlying entities (risks, controls, issues)
- use Activity Log for timestamped change proof
- capture approval IDs and resolution notes in your audit pack narrative

## Common Mistakes

- Approving without reading pending changes.
- Using one-line resolution notes (“ok”) for complex governance changes.
- Letting “pending” build up because nobody owns queue discipline.
- Treating notifications as “FYI” and not converting them into actions.
- Muting approvals/breaches because they are noisy (fix the underlying cause instead).

## Troubleshooting

### I am not receiving notifications I expect

- Check whether you are the owner/requester of the entity.
- Check whether preferences are disabled (if configurable).
- Validate that the action actually occurred (Activity Log is best if you have access).

### My edit saved but the value didn’t change

- You likely triggered an approval queue.
- Check `/approvals` for a pending request.
- Check `/notifications` for resolution outcomes.

### I can see approvals but can’t resolve them

- You probably have `approvals:read` but not `approvals:write`.
- Escalate to your workflow owner to confirm approver role assignment.

### Approvals are “stuck”

- Confirm the request has an eligible approver.
- Confirm approvers are active users.
- If the request is invalid, cancel and re-submit with clearer rationale.

## Related Documentation

- `./getting-started.md`
- `./access-management.md`
- `./activity-log.md`
- `./risks.md`
- `./controls.md`
- `./kris.md`
- `./issues.md`
- `./vendors.md`
