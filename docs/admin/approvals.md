---
title: Approval Workflow Observability for Admins
version: "2.0"
last_updated: "2026-02-16"
audience: admin
source_of_truth: "workflow status model and activity logs"
summary: "Operational support guide for diagnosing approval queue issues, transition anomalies, and escalation bottlenecks."
tags:
  - approvals
  - observability
  - workflow
---

# Approval Workflow Observability for Admins

## Overview

Admins support workflow reliability and traceability. They do not make business decisions on request content unless explicitly delegated by governance policy.

## What to Monitor

- growing pending queue without resolution trend
- repeated transition failures
- self-approval escalation anomalies
- missing notification or audit events

## Support Triage Procedure

1. Capture request ID and current status.
2. Load transition history and timestamps.
3. Validate actor identity states (requester/approver).
4. Confirm permission context for attempted action.
5. Determine whether issue is technical, policy, or data quality.

## Technical vs Policy Incident Split

- **Technical issue**: invalid transition, missing log, API denial mismatch
- **Policy issue**: approver chain disagreement, business-level decision conflict

Escalate policy disputes to business owner; keep technical corrections in admin flow.

## Evidence Package for Escalation

For unresolved incidents, include:

- request ID
- status timeline
- relevant actor IDs
- impacted endpoint action
- log excerpts and timestamps

## Troubleshooting

### Request appears frozen in pending

Check approver availability, escalation rules, and failed transition attempts.

### Decision action returns denial unexpectedly

Verify endpoint-level permission and request visibility scope.

### Logs incomplete for a transition

Investigate logging pipeline health and correlated request IDs across services.

## Related Documentation

- `./reports.md`
- `./riskhub-config.md`
