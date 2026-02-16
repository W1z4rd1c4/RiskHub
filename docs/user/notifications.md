---
title: Notifications and Approvals
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md §5"
summary: "Workflow guide for approval queues, notification triage, decision logging, and escalation management in daily operations."
tags:
  - notifications
  - approvals
  - workflow
---

# Notifications and Approvals

## Overview

RiskHub notifications are the operational inbox for workflow, approval, and control/KRI events.

Primary routes:

- notifications: `/notifications`
- approvals queue: `/approvals`

## Recommended Triage Cadence

Run this cadence at least twice daily:

1. Review critical/high-priority notifications.
2. Process pending approvals with deadline pressure.
3. Validate if any request needs escalation.
4. Capture rationale for decisions.
5. Confirm request end-state and follow-up actions.

## Approval Decision Protocol

When deciding on a request:

- verify entity context and requested change
- check whether requester/owner overlap triggers escalation constraints
- ensure rationale is explicit and auditable
- avoid one-line approvals for complex changes

## Notification Types You Should Recognize

- pending approvals
- approved/rejected request outcomes
- KRI due and overdue reminders
- threshold breach alerts
- workflow transition updates

## How to Avoid Queue Backlog

- keep approvals short but evidence-based
- reject incomplete requests with actionable notes
- escalate early when domain owner input is required
- avoid deferring requests without a follow-up owner

## Troubleshooting

### I am not receiving expected notifications

Check notification settings, then confirm role/scope and assignment context.

### Request appears stuck in pending

Inspect transition history and verify approver availability/escalation path.

### I can view but cannot decide

Your role likely has read visibility but not approval-write capability for that request type.

## Related Documentation

- `./getting-started.md`
- `./risks.md`
- `./controls.md`
- `./kris.md`
