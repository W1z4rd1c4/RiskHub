---
title: Activity Log (Audit Trail for Business Changes)
version: "2.0"
last_updated: "2026-03-05"
audience: user
source_of_truth: "frontend/src/pages/ActivityLogPage.tsx + backend activity log endpoints"
summary: "How to use the Activity Log to investigate changes, confirm approvals, and build an audit-ready narrative without exposing sensitive data."
tags:
  - activity-log
  - audit
  - troubleshooting
  - workflow
  - exports
---

# Activity Log (Audit Trail for Business Changes)

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

The Activity Log is the business-facing audit trail for changes inside RiskHub. It answers questions like:

- Who changed this risk and what exactly changed?
- When did this control get archived or restored?
- Did an approval apply yet, or is it still pending?
- Why did visibility change for a department?

The Activity Log is not a "report". It is a forensic tool. Use it to confirm facts, reduce back-and-forth, and prepare clean evidence for reviews.

Primary app route: `/activity-log`

## Where To Find It

- Sidebar item **Activity Log** → `/activity-log`

If you do not see Activity Log:

- you likely do not have `activity_log:read` (resource `activity_log`, action `read`)
- platform admins are explicitly blocked from business Activity Log, including direct route/API access (admins should use admin console logs instead)

## Roles, Scope, and Visibility

Activity Log access is usually limited because it can reveal:

- cross-department activity
- sensitive workflow decisions (approvals/rejections)
- user and ownership changes

Typical use cases by role:

- risk managers and second line: validate changes and enforce policy consistency
- compliance / audit: spot-check evidence and change control quality
- department leadership (if granted): investigate why a metric changed

Remember: the log is evidence, not authority. If a change is incorrect, you still need to fix the underlying entity.

## Data Model and Key Fields

Each Activity Log entry represents one action.

| Field | Meaning | How to use it |
|---|---|---|
| Entity type | What kind of object changed (risk/control/kri/user/etc) | Use it to narrow the search to the right domain. |
| Entity name | Human-readable label | Prefer this when communicating with stakeholders. |
| Action | `create`, `update`, `archive`, `approve`, `reject`, `link`, etc | Action tells you what kind of event it is. |
| Actor | Who performed it (may be null for system actions) | If actor is missing, treat as system-generated. |
| Department | Context label for routing | Helps explain why something appeared/disappeared in department scope. |
| Changes | Field-level `old` → `new` deltas | Use it to prove the exact edit without opening the entity. |
| Description | Short narrative context | Good for quick scanning, not always exhaustive. |
| Timestamp | When it happened (`created_at`) | Use a tight date range when investigating. |

Changes can include structured values. The UI formats them defensively:

- empty values show as `(empty)`
- objects are displayed as truncated JSON
- long diffs are intentionally condensed

## Core Workflows

### 1) Confirm whether an edit is applied

If you changed an entity and it looks unchanged:

1. Open `/activity-log`.
2. Switch to the entity type tab (Risk / Control / KRI / User).
3. Search for the entity name or a stable identifier.
4. Look for `update` or `status_change` entries.
5. If you see no update, check `/approvals` for a pending request.

This is the fastest way to separate UI cache issues from workflow gating.

### 2) Explain a metric change during a review

When a dashboard number changes unexpectedly (risk totals, critical count, breaches):

1. Use Activity Log to find recent changes in the relevant entity type.
2. Filter by date range to the review window.
3. Identify the specific edits that moved an item in/out of scope:
   - status changes (active → archived)
   - department changes
   - ownership changes
   - threshold changes (for KRIs)
4. Summarize the narrative with timestamps.

### 3) Investigate "Why can’t I see this anymore?"

Visibility changes are often caused by department or ownership edits.

Use Activity Log to:

- find the entry that changed department or owner
- confirm who made the change and when
- identify whether the change is policy-correct or accidental

Then fix the root cause in the entity record (and document why).

### 4) Validate governance actions

After resolving an orphaned item or approving a sensitive change:

1. Find the corresponding Activity Log entry.
2. Confirm the `approve` / `update` event exists.
3. Capture the timestamp and the delta as evidence for your review pack.

## Approvals and Notifications Behavior

Activity Log is closely related to workflow, but it is not the workflow queue.

Use these rules:

- If you see a change as `approve` or `reject`, it usually means a workflow decision occurred.
- If you see the entity-level update but stakeholders claim they were not notified, check `/notifications`.
- If you do not see an expected update, check `/approvals` for a pending request.

A useful habit is to always correlate:

- Activity Log (what changed)
- Approvals (why it changed / who decided)
- Notifications (who was informed)

## Filters, Views, and Exports

Activity Log supports two dimensions of investigation: *what* and *how you want to group it*.

### Tabs (what)

The top tabs let you focus by entity family:

- KRI
- Risk
- Control
- User

### View modes (how)

You can switch between view modes:

- **Chronological**: the default “timeline”
- **By person**: filter to one actor
- **By department**: filter to one department
- **By risk**: filter to one risk context

### Filters

Use filters to control noise:

- search (names and descriptions)
- action (create/update/archive/link/etc)
- date range (from/to)

### Exports

The business Activity Log UI does not provide a first-class export button.

If you need exportable evidence:

- export the underlying entities (risks/controls/issues) and reference the Activity Log timestamps
- for platform-level audit exports, a platform admin can use admin console audit logs

Avoid copying full diffs into external channels unless the recipient is authorized.

## Common Mistakes

- Using Activity Log as a substitute for fixing the underlying record.
- Searching with unstable terms (nicknames, informal abbreviations) instead of entity names/codes.
- Expanding the date range too widely and then missing the relevant entry.
- Sharing log excerpts that include sensitive context with unauthorized audiences.

## Troubleshooting

### I don’t have access to `/activity-log`

- Confirm `activity_log:read`.
- Confirm you are not logged in as platform admin.
- If you should have access, ask your access owner to review your role and effective permissions.

### The log loads but doesn’t show the event I expect

- Tighten the entity type tab.
- Try a different search term (entity name, owner name).
- Expand the date range slightly.
- If the change was approval-gated, look for approval events instead of entity edits.

### I see “network error”

- Refresh the page.
- If it persists, capture the time and the error message and escalate to support.

## Related Documentation

- `./notifications.md`
- `./governance.md`
- `./risks.md`
- `./controls.md`
- `./kris.md`
- `./issues.md`
- `./departments.md`
