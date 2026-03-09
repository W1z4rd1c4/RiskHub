---
title: User FAQ and Operational Support
version: "2.0"
last_updated: "2026-03-05"
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

This FAQ is the “fast lane” for common day-to-day problems. It is written for operators, not for admins.

Before escalating, try to capture:

- the route you were on (for example `/risks`)
- the entity identifier (risk code, control name, vendor name)
- what you expected vs what happened
- the time window (timestamps matter for workflow)

## Where To Find It

- You can read this FAQ from the in-app documentation library (Settings → Help & Docs).
- Many answers reference key routes:
  - `/notifications`
  - `/approvals`
  - `/activity-log` (if enabled for your business role; not for platform admin)

## Roles, Scope, and Visibility

Most “the app is broken” reports are actually scope/visibility misunderstandings.

Checklist:

- Do you have the right role?
- Is your scope global or department?
- Is the entity owned by you (ownership exception)?
- Was the entity archived?
- Do you even have the permission for the feature? (for example `issues:read`, `vendors:read`, `controls:execute`, `activity_log:read`)

Practical signals:

- If a sidebar item is missing (for example **Issues**), it is usually **permission** (`issues:read`), not filters.
- If the sidebar item exists but lists look empty, it is usually **scope** + **filters**.
- If you can open a detail page from a notification link but can’t find it via lists, it is often an **ownership exception** (you can act on a record you own even if it is outside your department scope).
- If you are logged in as `admin`, missing business routes such as `/governance` and `/activity-log` is expected. Use `/admin` and the admin docs library instead.

If you learn one thing from this FAQ, learn this:

- backend enforcement is authoritative
- UI visibility is a hint, not a guarantee

## Data Model and Key Fields

When troubleshooting, these fields are the highest leverage:

| Entity | Key fields to check | Why |
|---|---|---|
| Risk | status, department, owner, net score | Drives visibility, critical filters, workflow. |
| Control | status, owner, department, frequency | Explains why it appears in reporting and execution views. |
| KRI | breach status, last period end, reporting owner | Explains breach/overdue reminders. |
| Issue | status, severity, owner, due date | Explains overdue and review workload. |
| Vendor | outsourcing owner, status, vendor type | Explains edit rights and ownership context. |

Status vocabulary to keep straight:

| Status concept | What it usually means | Common “surprise” |
|---|---|---|
| `active` | should appear in day-to-day views | “I can’t find it” is usually filters/scope. |
| `archived` | intentionally removed from active operations | People forget the archive filter defaults. |
| `pending` (approval) | request exists and is waiting for a decision | People assume “save = applied”. |
| `approved` / `rejected` | request resolved | People forget to read resolution notes. |

## Core Workflows

### “Where do I look first?” flow

1. If you expected a value to change but it didn’t: check `/approvals`.
2. If you expected to be notified: check `/notifications`.
3. If a number changed and you don’t know why: check `/activity-log` (if you have access).
4. If you can’t see an entity: check department + owner + archived status.

### “Is this an access problem or a data problem?” flow

Use this to avoid escalating the wrong thing:

1. **Is the sidebar item missing?**
   - Yes: likely permission (for example `vendors:read`, `issues:read`).
   - No: continue.
2. **Can you open a detail page from any link/notification?**
   - Yes: likely filters or scope.
   - No: continue.
3. **Do you get a permission/forbidden error?**
   - Yes: likely permission mismatch or stale session.
   - No: continue.
4. **Is the record archived?**
   - Yes: toggle archive filters and confirm restore rules.
   - No: continue.
5. **Does a colleague with broader scope see it?**
   - Yes: scope/ownership boundary.
   - No: data missing (record may not exist) or system issue.

### “How do I ask for help without wasting time?” flow

When escalating, include:

- route
- entity ID/name
- screenshots are optional; text is fine
- timestamps
- your role + scope

This turns a 30-minute back-and-forth into a 5-minute fix.

## Approvals and Notifications Behavior

### Why did my edit not apply?

Because the change was queued for approval.

What to do:

- open `/approvals`
- find your request
- read the pending changes
- wait for resolution or follow up with an approver

Notes that reduce confusion:

- If you do not have `approvals:write`, the queue is still useful. You will typically see “my requests” and your own pending items.
- Some environments use a “privileged” approval state (for example `pending_privileged`) when the change is more sensitive. The action is the same: it must be approved before it applies.
- A good approval request is narrow. If you change five governance-sensitive fields at once, you usually create a slower, more contentious approval.

### Can I cancel a request I started?

If the request is still pending, the workflow UI may offer a cancel action. If not, ask the approver to reject with a clear note, then re-submit a cleaner, narrower request.

### Why do I keep receiving reminders?

Reminders are policy signals:

- overdue KRI: monitoring is not being executed
- overdue questionnaire: risk assessment process is blocked

Don’t mute reminders as a first response. Fix the underlying workflow.

## Filters, Views, and Exports

### “My numbers don’t match my colleague’s”

Most often caused by:

- different filters
- different scope
- archived items included in one view but not the other

Rule:

- always state filters and as-of time when comparing numbers

Practical debugging tip:

- When comparing numbers, ask both people to temporarily reset filters to “All active” and then re-apply the same status/department filters in the same order.

### “My export is missing items”

Check:

- active filters
- status (archived excluded by default)
- scope limitations

If you need audit evidence:

- export only what is needed
- keep the raw export unchanged
- include the “as of” timestamp and filters used in the cover note (even a one-liner is enough)

## Common Mistakes

- Editing sensitive fields without understanding approvals.
- Editing many sensitive fields in one submission and creating a hard-to-approve request.
- Leaving owners blank (“someone will pick it up”).
- Using overly broad tags/categories that make search useless.
- Treating department as ownership (department is routing/reporting; owner is accountability).
- Sharing exports without context.

## Troubleshooting

### I can’t see a record I should see

Checks:

1. Is it archived?
2. Which department is it assigned to?
3. Who is the owner?
4. Does your scope allow visibility?

Next actions:

- if scope mismatch: request access change
- if owner mismatch: update owner through governance process

### The sidebar item exists, but the list is empty

Checks:

1. Clear filters (status, department, owner, search).
2. Confirm you are not looking at an archived-only view.
3. Check whether the list view defaults to “mine” or “pending”.
4. Try opening the record from a notification link (if you have one).

Next actions:

- If a colleague can see it but you can’t: scope boundary.
- If nobody can see it: verify the record exists and is active.

### I can’t create or edit

Checks:

- do you have `<resource>:write`? (for example `risks:write`)

### I can’t resolve approvals

Checks:

- do you have `approvals:write`?

### I get “Forbidden” or “Permission denied”

Checks:

- If you recently changed roles/scope, log out and log back in (stale sessions can mislead).
- Verify the permission you expect (for example `vendors:write`) is actually granted.
- If the permission is correct but still failing, capture:
  - route
  - approximate timestamp
  - entity name/id
  - the exact error text

### KRI is always overdue

Checks:

- is the reporting owner set?
- is the frequency realistic?
- is the period end being updated?

## Related Documentation

- [Getting Started](./getting-started.md)
- [Access Management](./access-management.md)
- [Workflow, Approvals, Notifications](./notifications.md)
- [Activity Log](./activity-log.md)
- [Managing Risks](./risks.md)
- [Managing Controls](./controls.md)
- [Managing KRIs](./kris.md)
- [Managing Issues](./issues.md)
- [Managing Vendors](./vendors.md)
