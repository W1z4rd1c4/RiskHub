---
title: Approvals Support (Admin Runbook)
version: "2.1"
last_updated: "2026-04-25"
audience: admin
source_of_truth: "frontend/src/pages/ApprovalsPage.tsx + backend/app/api/v1/endpoints/approvals/* + backend/app/core/activity_logger.py"
summary: "Admin support runbook for approvals incidents: stuck requests, transition failures, missing notifications, and evidence-backed escalation."
tags:
  - approvals
  - workflow
  - audit
  - troubleshooting
  - notifications
---

# Approvals Support (Admin Runbook)

## Overview

Approvals are the system’s guardrail for governance-sensitive changes. They exist so that:

- high-impact changes do not apply silently
- there is an explicit decision trail (who approved/rejected, when, and why)
- “rollback” can be handled through a new controlled change rather than manual edits

As a platform admin, your job is to keep the workflow **reliable and legible**. You are not the business decision-maker by default.

An approvals incident is usually one of:

- a request exists but does not progress (stuck)
- a user expects a request but none is created (missing request)
- transitions fail (forbidden/validation/500)
- notifications do not match workflow events (missing or noisy)

If you can reduce the problem to one of these shapes, the resolution is usually quick.

## When To Use This

Use this runbook when:

- the approvals queue grows unexpectedly or contains old pending items
- users report “I saved, but nothing changed”
- approvers report they can’t approve/reject (unexpected forbidden)
- “pending” vs “pending privileged” behavior is confusing in the org
- notifications around approvals are missing, delayed, or spammy

## Preconditions and Safety

Before intervening:

1. Confirm the environment (prod vs staging) and incident severity.
2. Capture the minimum facts needed to reproduce:
   - approval request id (best)
   - affected entity id/name (risk/control/vendor/etc.)
   - route(s) involved (`/approvals` plus underlying entity route)
   - requester/approver identities
   - approximate timestamps
3. Decide whether you are authorized to resolve approvals in your governance model.
   - Even if you technically can, doing so may violate policy. Default to support + evidence + handoff.

Safety rules:

- Do not bypass approvals by editing business data directly.
- Prefer reversible interventions:
  - cancel/reject with clear notes (if policy allows)
  - session refresh (log out/in)
- Treat missing audit trails as a high-severity reliability issue. You cannot operate safely without traceability.
- Treat stale auto-rejections as protective behavior, not queue failure. Approval execution validates current target state before applying sensitive changes.

## Step-by-Step Procedure

### 1) Identify the request and the intended change

If you have an approval request id, start there. If not, reconstruct:

1. Ask the reporter for:
   - what they changed (fields)
   - when they clicked save
   - what they expected to happen next
2. Open `/approvals` (if available in your environment) and search by:
   - status (`pending` first)
   - “my requests” vs queue view (depends on resolver capability)
3. Record:
   - current status
   - requester identity
   - the pending change set (old → new)

If you cannot locate the request, move to “missing request” troubleshooting (below).

### 2) Classify the incident: technical vs policy vs data quality

Use this split to avoid wasting time:

- **Policy**: ownership/approver chain dispute, “should this be allowed?”, decision disagreement.
- **Data quality**: missing owner/department/manager mapping, orphan links, invalid values.
- **Technical**: server errors, forbidden mismatches, transition errors, missing logs.

If it’s policy: produce an evidence pack and hand off quickly. Admin time is most valuable on technical/data integrity.

### 3) Correlate with evidence (Admin Console)

Use `/admin` to gather evidence:

- **Audit logs**: confirm create/resolve/cancel events occurred and by whom.
- **Application logs**: confirm whether the backend rejected the transition (validation vs permission vs exception).

Capture:

- timestamps of key events
- request IDs (if visible)
- event types
- error payloads/messages

This is the difference between “it seems stuck” and “it failed because permission X is missing”.

### 4) Choose the minimal safe intervention

Pick the smallest action that unblocks without bypassing governance.

Common safe interventions:

- **Stale session** suspected:
  - ask the user to log out and log back in
  - retry once
- **Duplicate pending requests** for the same underlying resource:
  - cancel the older request (if policy allows), or ask the requester to cancel
  - keep one authoritative pending request
- **Missing ownership / unclear approver**:
  - do not guess the owner
  - hand off to the business owner to decide
  - once decided, correct the routing data (often via access/governance tooling) and re-run the approval
- **Stale auto-rejection**:
  - inspect resolution notes and the target entity activity log
  - ask the requester to resubmit against current values if the change is still needed
  - do not manually reapply the stale payload

Avoid:

- direct database edits
- “admin override” changes outside the approval system

### 5) Verify the end state

After intervention:

- request status is correct (pending/approved/rejected/canceled)
- if approved, the underlying entity reflects the new values
- no duplicate pending requests remain for the same resource
- notifications are consistent with workflow events (no repeated false reminders)
- for KRI value approvals, only one history row exists for the target period

## Verification Checklist

Before closing:

- request exists and is in the expected status
- requester and approver identities match expectation
- pending change set matches what was intended
- any rejection includes resolution notes (clear rationale)
- audit trail exists for create + resolve/cancel attempts
- if approved: entity shows new values and does not show “pending changes” anymore

## Rollback Strategy

Approvals make rollback safer than direct edits. Your rollback option depends on state:

- **Pending**:
  - cancel (preferred) or reject with notes (if policy allows)
- **Approved but wrong**:
  - create a new approval request that reverts the value (audit-safe)
  - avoid silent direct writes outside workflow
- **Rejected but still disputed**:
  - escalate decision to the business owner, then re-submit a cleaner request

If you cannot explain the rollback in one paragraph, stop and escalate. Improvised rollback is an audit risk.

## Troubleshooting

### Request appears frozen in `pending`

Checks:

- approver unavailable (policy/workload), not a technical defect
- request is in a privileged pending state (more sensitive)
- multiple pending requests exist for the same underlying resource

Actions:

- identify which request is authoritative
- cancel duplicates (or ask requester to cancel)
- if approver chain is disputed: hand off to business owner

### Approve/reject fails with forbidden

Checks:

- does the actor have `approvals:write`?
- is the actor allowed to see the underlying resource in their scope?
- did the actor’s role/scope change recently (stale session)?

Actions:

- session refresh
- verify role/scope in `/users`
- correlate with logs for the failing request

### Approval auto-rejected during approve

Checks:

- target risk/control/KRI changed after the request was created
- KRI history already contains a value for the queued period
- KRI vendor links changed before a mixed KRI edit was approved

Actions:

- keep the rejected approval as audit evidence
- resubmit a fresh request with current old/new values if the business change is still valid
- escalate only if the target state did not actually change or a partial mutation occurred

### “I saved but nothing changed” and there is no approval request

Checks:

- was the save successful or did it error?
- does this change type require approval in this environment?

Actions:

- reproduce the same edit and capture timestamps
- check audit/logs for create-request events or validation errors
- if request creation is unreliable, escalate to engineering

### Notifications are missing or spammy

Checks:

- do audit/log feeds show matching workflow events?
- is the user looking at the right time window?
- do due dates/frequency inputs on the underlying record make sense?

Actions:

- confirm create/resolve events exist
- correct obvious data-quality inputs (with proper governance) if reminders are based on invalid cadence

## Escalation and Handoff

Escalate to business owners when:

- ownership/approver chain is disputed
- the approval content is a domain decision

Escalate to engineering when:

- transitions throw server errors
- audit trail is missing or inconsistent
- request creation is unreliable

Handoff package:

- approval request id (or the best reconstruction you have)
- status timeline
- actors involved (requester/approver)
- what failed (action + error)
- timestamps + request IDs (if available)
- what you verified and what remains unknown

## Related Documentation

- Evidence exports and audit context: [Reports and Evidence Exports](./reports.md)
- Access/scoping corrections: [User and Access Management](./user-management.md)
- Risk Hub boundary handoff model: [Risk Hub Config Boundaries](./riskhub-config.md)
