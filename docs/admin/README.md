---
title: RiskHub Platform Administration Documentation
version: "2.0"
last_updated: "2026-02-16"
audience: admin
source_of_truth: "docs/BUSINESS_LOGIC.md §1.5 and admin endpoints"
summary: "Production runbook library for platform administrators: access governance, safe changes, observability, evidence exports, and operational support procedures."
tags:
  - overview
  - onboarding
  - access
  - audit
  - exports
  - troubleshooting
  - settings
---

# RiskHub Platform Administration Documentation

Back to tree: <a href="../DOCUMENTATION_TREE.md">/Users/stefanlesnak/Antigravity/Risk App 2/docs/DOCUMENTATION_TREE.md</a>

This library is the canonical runbook set for platform operators. It is written for the `admin` role and focuses on platform integrity, access governance, and operational support.

It is intentionally **not** a business-user manual. When a request turns into a policy decision (“should we accept this risk?”, “what should this threshold be?”), the correct outcome is a clean handoff to the business owner, not an admin override.

**On this page**
- [Overview](#overview)
- [Audience and Boundary](#audience-and-boundary)
- [Quick Start (First Hour)](#quick-start-first-hour)
- [Library Map (By Operator Task)](#library-map-by-operator-task)
- [Access and Safety Principles](#access-and-safety-principles)
- [Operational Support Triage](#operational-support-triage)
- [Observability and Evidence](#observability-and-evidence)
- [Change Management Expectations](#change-management-expectations)
- [Escalation and Handoff](#escalation-and-handoff)
- [Related Documentation](#related-documentation)

## Overview

Platform administration in RiskHub has a narrow purpose:

- keep authentication and authorization reliable
- keep auditability intact (admins must be traceable)
- keep users unblocked (access, sessions, and support surfaces)
- provide evidence exports for incidents and audits

This library is organized as production runbooks. Each runbook includes preconditions, a step-by-step procedure, verification checks, and rollback guidance.

## Audience and Boundary

This library is for `admin` role users who manage platform-level surfaces:

- `/users` (Access Management)
- `/admin` (Admin Console: health/logs/audit/sessions)
- `/admin/docs` (Documentation library)
- `/settings` (local admin preferences only)

Boundary rules:

- Admins enable access and stability. They do not own business semantics.
- Admins may mention business roles only for **handoff context** (who to talk to), not as “instructions for business users”.
- If a workflow is blocked because a business owner must approve something, the admin role is to prove what is blocked and why, not to bypass the workflow.

## Quick Start (First Hour)

Use this checklist when you first become an operator for an environment.

1. Confirm your account is actually the `admin` role.
2. Open `/admin` and validate:
   - Health panel loads and looks plausible
   - Logs and Audit feeds load
   - Sessions panel loads
3. Open `/admin/docs` and confirm:
   - Audience label indicates admin manuals
   - Links inside docs open correctly (doc links stay in reader)
4. Open `/users` and confirm you can:
   - list users in access mode (if allowed by scope)
   - open the access edit modal for a user (admin-only mutations)
5. Do one safe, reversible operation as a confidence test:
   - update a non-sensitive log view filter
   - export a small audit log sample to confirm evidence flow works

If any of these fail, stop. Fix baseline reliability before executing changes that affect production users.

## Library Map (By Operator Task)

| Operator task | Where in app | Canonical runbook |
|---|---|---|
| Establish an admin baseline (day-one checks) | `/admin`, `/admin/docs` | [Admin Onboarding](./getting-started.md) |
| Add/modify/deactivate users safely | `/users` | [User and Access Management](./user-management.md) |
| Triage workflow/approval incidents (stuck requests, odd states) | support + logs | [Approvals Support](./approvals.md) |
| Export evidence for audit/incident response | `/admin` + exports | [Reports and Evidence Exports](./reports.md) |
| Resolve department scoping and structure issues (admin side) | `/users` + handoff | [Departments: Admin Support](./departments.md) |
| Support Risk Hub configuration boundaries (technical vs policy) | `/risk-hub` (business-owned) | [Risk Hub Config Boundaries](./riskhub-config.md) |
| Operate the Admin Console | `/admin` | [Admin Console](./console.md) |

## Access and Safety Principles

Admin work is high blast-radius work. Treat it as safety-critical.

Principles:

- **Least privilege**: grant the minimum that makes a user productive; avoid “temporary global scope” as a shortcut.
- **Two-step thinking**: separate “what you observed” from “what you conclude”.
- **Reversibility**: prefer changes you can revert quickly (especially access and session operations).
- **Evidence first**: before changing anything, capture:
  - who is affected (user id/email)
  - what is affected (route/entity)
  - when it started
  - whether it is reproducible
- **Single change per action**: do not mix unrelated fixes in one pass. It destroys traceability.

## Operational Support Triage

Most admin incidents fall into one of three buckets:

1. **Access incident**: user can’t see a module, can’t edit, or gets forbidden.
2. **Workflow incident**: approvals/notifications are stuck or confusing.
3. **Platform incident**: health degradation, elevated errors, or session/auth instability.

Triage order:

1. Confirm the user identity and effective role/scope.
2. Reproduce with the same route and a known entity id where possible.
3. Check Admin Console logs/audit for correlated errors and request IDs.
4. Decide: technical defect vs expected policy behavior.
5. Execute the smallest safe fix and verify the outcome.

## Observability and Evidence

Admin conclusions must be reproducible. “I think it’s fine” is not a valid closure.

Evidence package checklist:

- exact route(s) and time window
- affected user(s) and role/scope
- relevant audit events (what changed, by whom)
- relevant application log snippets (errors, request IDs)
- export files (CSV/JSON) if used

Risk management note: avoid exporting more data than you need. Evidence exports should be scoped to the minimum required for the incident/audit question.

## Change Management Expectations

When you change access or operational settings:

- communicate intent before execution (what will change, who is affected)
- verify after execution (what is now true)
- record the result (what you observed, and any remaining risk)

If you can’t explain what you changed in three sentences, you likely changed too much at once.

## Escalation and Handoff

Escalate when:

- the issue is a **business policy** dispute (ownership, thresholds, acceptance)
- the issue requires a **data decision** (what department should own this record)
- the issue is a **product defect** that needs engineering work

Handoff format (keep it short, but complete):

- what the user reported
- what you verified (steps + outcomes)
- what logs/audit show
- what you changed (if anything)
- what decision is required and who owns it

## Related Documentation

- Admin baseline and confidence checks: [Admin Onboarding](./getting-started.md)
- User access operations: [User and Access Management](./user-management.md)
- Console operations: [Admin Console](./console.md)
- Workflow support: [Approvals Support](./approvals.md)
- Evidence exports: [Reports and Evidence Exports](./reports.md)
