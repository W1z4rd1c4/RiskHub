---
title: Managing Issues and Findings
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "frontend/src/pages/IssuesPage.tsx + issue workflows in backend"
summary: "How to log, triage, remediate, and close Issues (findings) with clear ownership, due dates, exceptions, and audit-ready exports."
tags:
  - issues
  - workflow
  - approvals
  - notifications
  - exports
  - troubleshooting
---

# Managing Issues and Findings

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

Issues (also called findings) are the operational way to record a problem that needs remediation, tracking, and evidence. In RiskHub, Issues are intentionally simple: they capture the "what", "so what", and "by when". The goal is not perfect prose. The goal is an unambiguous remediation loop.

Use Issues when:

- a control execution failed or was incomplete
- a KRI breached its limits and needs a corrective action
- an audit review identified a gap
- a user reports a recurring operational risk that needs a tracked fix

An Issue is successful when someone can answer all of these without asking you:

- What exactly is wrong?
- Who owns the next action?
- What is the due date and what is the risk of delay?
- What evidence will prove the fix?

Primary app route: `/issues`

## Where To Find It

- Issue register (list): `/issues`
- Issue detail: open any row from the list
- Quick links from other modules: you may see Issues created or referenced from Risks, Controls, KRIs, or Vendors (depending on your permissions)

If you do not see **Issues** in the sidebar:

- you likely do not have the permission `issues:read` (resource `issues`, action `read`)
- your role may be scoped to a department that does not grant Issues visibility

Start by validating your access in `/settings` and then ask your access owner to confirm your effective permissions.

## Roles, Scope, and Visibility

Issues follow the same core visibility model as other business entities:

- **Scope first**: global roles can typically see cross-department Issues; department-scoped users usually see their department
- **Ownership exceptions**: ownership can grant visibility even when the department differs
- **Backend is authoritative**: the UI can hide buttons, but the API is the real enforcement

Typical responsibilities (this is descriptive, not a rule):

- **Issue creator**: records the initial finding with enough context to act
- **Issue owner**: is responsible for keeping status and due dates current and coordinating remediation
- **Second line / reviewers**: validate closure quality and raise exception/override decisions when needed

Write access is permission-gated:

- `issues:write` controls whether you can create and update issues
- some status transitions can be gated by workflow policy (for example, closure validation)

## Data Model and Key Fields

The table below lists the fields that matter most in practice.

| Field | Meaning | Pitfalls / notes |
|---|---|---|
| Title | Short, searchable statement of the finding | Avoid titles like "Issue" or "Problem". Include the object and failure mode. |
| Description | What happened, what should have happened, and impact | Include the smallest reproducible context. Avoid blame language. |
| Severity | Prioritization signal (low → critical) | Severity should reflect impact + urgency, not who is asking. |
| Status | Lifecycle state (`open`, `triaged`, `in_progress`, `ready_for_validation`, `closed`) | Status is a promise to stakeholders. Don’t mark `closed` without evidence. |
| Department | Organizational context for routing and reporting | Choose the department that owns the remediation, not the department that noticed the issue. |
| Owner | Person accountable for next action | If owner is missing, the system may block some flows (and questionnaires may skip). |
| Due date | Commitment date for remediation | Too-aggressive due dates create churn; too-late dates hide risk. |
| Source | Where it came from (manual, audit, KRI breach, control execution) | Source helps reviewers interpret urgency and expected evidence. |
| Remediation plan | Optional structured plan/status for larger fixes | Keep plan status consistent with issue status. |
| Exceptions | Time-bound approval to deviate from standard policy | Exceptions are not closures. They must be explicit and revisited. |

When in doubt, optimize for *auditability*: a reviewer should be able to read the record months later and understand why decisions were made.

## Core Workflows

### 1) Create a new Issue

1. Go to `/issues`.
2. Click **New**.
3. Fill `Title` and `Description` with operational clarity.
4. Set `Severity` and `Due date`.
5. Assign `Department` and `Owner`.
6. Save.
7. Confirm the Issue appears in the list and is visible to the right stakeholders.

A good first version is better than a perfect late version. If the owner is not known yet, set the department and write the next action explicitly ("Identify owner for remediation within 2 days").

### 2) Triage an Issue

Triage is the act of making the issue actionable:

- confirm severity is appropriate
- ensure owner and due date are set
- decide whether it is a quick fix or needs a remediation plan
- link it to the relevant entity context (risk/control/kri/vendor) where your workflow supports it

Use `triaged` when the issue is understood and assigned.

### 3) Remediate and update status

Use status consistently:

- `open`: newly created, not yet routed
- `triaged`: owner + due date are set, work is planned
- `in_progress`: remediation started
- `ready_for_validation`: fix is implemented and awaiting review
- `closed`: validated and archived as evidence

If your organization uses a remediation plan card, keep it aligned:

- plan `draft/active/blocked/completed` should not contradict the issue status

### 4) Close with evidence

Closure is an evidence event, not a UI event.

Before moving to `closed`, record:

- what changed
- how you verified it
- where the supporting evidence lives (link, ticket, reference ID)
- what monitoring will detect regression (if applicable)

If validation fails, move back to `in_progress` and state the specific gap ("Evidence missing for period X", "Control execution still failing", etc.).

### 5) Handle exceptions (when remediation cannot be completed)

Exceptions should be treated as time-bound risk acceptance.

Use an exception when:

- remediation is blocked by dependencies outside your team
- remediation is disproportionate and an alternate control is acceptable
- remediation is planned but cannot meet deadlines for valid reasons

In the Issue, be explicit:

- what requirement is being waived
- what compensating controls exist
- the expiration date and the owner of renewal/review

## Approvals and Notifications Behavior

Issues commonly interact with workflow in two ways:

1. **Status and exception decisions** can trigger approvals (policy dependent).
2. **Downstream entities** (risks/controls/kris) may trigger workflow, and the Issue becomes the narrative context for that request.

Practical rules:

- Expect notifications when an Issue changes status, is assigned to you, or an exception is requested/approved.
- If you save an update and it does not appear immediately, check `/approvals` and `/notifications` for a pending request.
- Always add resolution notes for approvals. Notes are part of the audit trail.

For the complete workflow mechanics and queue triage, use: `./notifications.md`.

## Filters, Views, and Exports

The Issue list supports operational filtering so you can run it like an inbox.

Common filters and what they are for:

- **Status**: focus on `open`/`triaged` for routing, `in_progress` for execution pressure, `ready_for_validation` for review workload
- **Severity**: isolate `high` and `critical`
- **Overdue**: find broken commitments quickly
- **Exclude active exceptions**: focus on issues that still require action (not temporarily waived)
- **Search**: use stable keywords (system name, process name, vendor name)

Sorting is useful when you are preparing for a review:

- sort by `due_at` to see time pressure
- sort by `updated_at` to find stale issues

### Exports

Use **Export** for review packs and audit evidence.

Export discipline:

- export with a clear “as of” date
- prefer exports filtered to the smallest needed scope
- include severity/status filters so the reader understands what’s in the file
- never edit exports in a way that removes traceability (if you must transform, keep the original export)

## Common Mistakes

- **No owner**: an issue without an owner becomes a mailbox.
- **Due date without capacity**: unrealistic due dates train the organization to ignore dates.
- **Status inflation**: moving to `ready_for_validation` without evidence, or closing without verification.
- **Severity misuse**: setting everything to `high` makes the filter meaningless.
- **Narrative drift**: changing the problem statement mid-remediation without documenting why.

## Troubleshooting

### I can’t see `/issues` in the sidebar

- Confirm you have `issues:read`.
- Confirm you are not logged in as platform admin (admins do not use business modules).
- If you recently got access, log out and back in to refresh effective permissions.

### I can see Issues but can’t create or edit

- You likely have `issues:read` but not `issues:write`.
- Some status transitions may be policy-gated; check `/approvals` for pending workflow.

### My update saved but didn’t apply

- You likely triggered a workflow request. Open `/approvals` and search for the entity.
- Check `/notifications` for the request outcome.

### Exports fail or are incomplete

- Check active filters (status/severity/overdue) before exporting.
- Retry after a refresh. If the problem persists, capture the error message and share it with support.

## Related Documentation

- `./notifications.md`
- `./risks.md`
- `./controls.md`
- `./kris.md`
- `./vendors.md`
- `./departments.md`
- `./activity-log.md`
