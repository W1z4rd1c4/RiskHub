---
title: RiskHub Platform Administration Documentation
version: "2.1"
last_updated: "2026-03-15"
audience: admin
source_of_truth: "docs/BUSINESS_LOGIC.md §1.5 + admin routes + admin docs endpoint"
summary: "Incident-first documentation library for platform admins covering health triage, access operations, evidence capture, and escalation-safe support."
tags:
  - overview
  - troubleshooting
  - onboarding
  - access
  - audit
  - exports
---

# RiskHub Platform Administration Documentation

> **Start here when something is failing:** [Admin Incident Quick Reference](./incident-quick-reference.md)

This library is the canonical runbook set for first-line platform admins. Use it to restore safe operations, verify platform health, manage access, capture evidence, and hand incidents to engineering or business owners without improvising risky workarounds.

## Overview

RiskHub platform admins own the operating surface around the application, not the business decisions inside the application. This documentation library exists to make that boundary obvious and repeatable. The goal is not to turn admins into engineers. The goal is to help admins answer four questions quickly and safely:

- what does this symptom usually mean
- what is the first safe check
- what counts as healthy versus degraded
- when should I stop and escalate

The runbooks are written for real incidents, not ideal demos. They assume an admin may arrive with only a screenshot, a confused end-user report, or a route that suddenly stopped working. Every runbook therefore prioritizes exact routes, pass/fail checks, evidence capture, and minimal safe actions.

Read the core runbooks in this order:

1. Live incident or confusing user report: [Admin Incident Quick Reference](./incident-quick-reference.md)
2. New operator or post-change baseline check: [Admin Onboarding](./getting-started.md)
3. Health, logs, audit, sessions, and exports: [Admin Console](./console.md)
4. Add, update, deactivate, or re-scope a user: [User and Access Governance](./user-management.md)

## Audience and Boundary

This library is for platform admins who can access `/admin`, `/admin/docs`, and `/users`. It is not a business-configuration manual and it is not an engineering deployment guide.

Admins are expected to own:

- access and session support
- platform health verification
- audit and log evidence capture
- low-risk, reversible admin actions
- escalation handoff quality

Admins are not expected to decide:

- policy ownership
- risk thresholds
- business approval outcomes
- platform architecture or deployment repair

When a request crosses from operations into business judgment or engineering repair, the correct action is to capture evidence and hand it off with enough precision that the next team can act immediately.

## Quick Start (First Hour)

Use this sequence when you first receive access to an environment or when you are returning after a long gap:

1. Open [Admin Incident Quick Reference](./incident-quick-reference.md) and scan the symptom cards so you know where to start during an interruption.
2. Open `/admin` and classify the environment as **Healthy**, **Degraded but operable**, or **Stop and escalate** using [Admin Console](./console.md).
3. Open `/admin/docs` and confirm the reader is showing admin manuals, not user manuals.
4. Open `/users` and confirm the admin access surface loads, including role, department, manager, and scope information.
5. Export one small audit sample so you know evidence capture works before a real incident depends on it.
6. Read the escalation rules in [User and Access Governance](./user-management.md) and [Admin Console](./console.md) so you know which actions are reversible and which are not.

At the end of the first hour, you should be able to say:

- where to start when something breaks
- what a healthy admin surface looks like
- what evidence to capture before escalating
- which admin changes are safe versus irreversible

## Library Map (By Operator Task)

| Operator task | Primary route | Canonical runbook |
|---|---|---|
| Triage a live auth, access, or health incident | `/admin`, `/users`, affected route | [Admin Incident Quick Reference](./incident-quick-reference.md) |
| Prove the environment is ready for safe admin work | `/admin`, `/admin/docs`, `/users` | [Admin Onboarding](./getting-started.md) |
| Inspect Health, logs, sessions, and exports | `/admin` | [Admin Console](./console.md) |
| Add a user or change role, scope, department, or manager | `/users` | [User and Access Governance](./user-management.md) |
| Support workflow and approval questions from an operator angle | support path plus logs | [Approvals Support](./approvals.md) |
| Export evidence for incident response or audit | `/admin` | [Reports and Evidence Exports](./reports.md) |
| Troubleshoot department-scoping questions | `/users` plus handoff evidence | [Departments: Admin Support](./departments.md) |
| Keep Risk Hub configuration issues inside the right ownership boundary | `/risk-hub` for reference only | [Risk Hub Config Boundaries](./riskhub-config.md) |

Use the map as a routing table. Do not read everything before acting. Pick the task, open the runbook, and follow the smallest safe path.

## Access and Safety Principles

These principles apply across every admin runbook:

- use the smallest possible change
- prefer one change at a time
- stay read-only when Health is degraded unless a runbook explicitly says otherwise
- never widen access temporarily just to “see if it works”
- do not improvise alternate admin paths when the intended UI action is disabled
- record the before-state before changing anything material
- treat request IDs, emails, exported rows, and session details as sensitive evidence

If you cannot explain the intended outcome and rollback in one sentence before acting, you do not yet have a safe admin action. Stop, capture evidence, and escalate.

## Operational Support Triage

All first-line admin support should follow the same pattern:

1. Capture the exact symptom text, route, affected user, and timestamp.
2. Open `/admin` and classify the environment.
3. Determine whether the issue is local to one user, one route, or multiple users and routes.
4. Take the smallest safe admin action only if the relevant runbook allows it.
5. Re-check the outcome and record what changed.

Use these state definitions consistently:

- **Healthy**: Health loads, database is connected, scheduler lock is held, outbox dead-letter count is `0`, and logs, audit, sessions, and exports are available.
- **Degraded but operable**: `/admin` loads, but one dependency or subsystem is degraded while observability still works.
- **Stop and escalate**: `/admin` fails, database is disconnected, observability tabs fail, exports fail, or the admin and user documentation boundary is wrong.

Do not continue with access changes during a `Stop and escalate` state. If the state is `Degraded but operable`, favor read-only investigation and only the lowest-risk recovery steps described in the relevant runbook.

## Observability and Evidence

Evidence quality determines whether an escalation is useful. Good evidence is precise, minimal, and time-bound. It should help the next team reproduce or diagnose the problem without asking the admin to restate the issue.

For most cases, a solid evidence package includes:

- affected user or affected population
- exact route and action
- time window plus environment
- Health classification at the same time
- repeated request IDs when present
- one export or screenshot that proves the symptom
- note of any admin action already taken

Admins should rely on `/admin` as the evidence source of record for platform-state questions. If observability itself is failing, that failure becomes part of the incident. Capture the tab that failed, the filters used, and the time window, then escalate instead of working around the gap.

## Change Management Expectations

RiskHub admin work is safe only when it remains controlled and auditable. Treat every access or session action as something that may later need to be explained to engineering, compliance, security, or management.

Before a change:

- confirm the identity and route involved
- confirm the expected outcome
- record the current state

During a change:

- change one variable at a time
- avoid combining access edits with session revocation unless the case truly requires both
- do not treat degraded UI states as permission to try manual alternatives

After a change:

- verify the new state after refresh
- verify the user outcome where appropriate
- confirm the audit trail or evidence exists
- document the rollback path if the issue remains open

This library intentionally stays inside the admin operating boundary. Engineering repair steps belong in engineering runbooks, not in admin manuals.

## Escalation and Handoff

Escalate when any of the following is true:

- Health is in `Stop and escalate`
- the same symptom affects multiple users or routes unexpectedly
- the last known good access state cannot be determined
- a save appears to succeed but behavior does not change after re-authentication
- audit, log, or export evidence is missing when it should exist
- the issue requires a business decision rather than an operating action

Minimum handoff packet:

- summary of the symptom in one sentence
- exact route and time window
- affected user or affected population
- Health classification
- relevant request IDs
- evidence captured
- actions already taken
- clear statement of what remains unknown or blocked

## Related Documentation

- [Admin Incident Quick Reference](./incident-quick-reference.md)
- [Admin Onboarding](./getting-started.md)
- [Admin Console](./console.md)
- [User and Access Governance](./user-management.md)
- [Reports and Evidence Exports](./reports.md)
