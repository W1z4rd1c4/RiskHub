---
title: Admin Onboarding and First-Day Runbook
version: "2.1"
last_updated: "2026-03-15"
audience: admin
source_of_truth: "frontend/src/pages/AdminConsolePage.tsx + frontend/src/pages/UsersPage.tsx + backend/app/api/v1/endpoints/admin/*"
summary: "Day-one admin readiness runbook with explicit healthy, degraded, and stop states for platform operators."
tags:
  - onboarding
  - overview
  - access
  - audit
  - troubleshooting
  - settings
---

# Admin Onboarding and First-Day Runbook

## Overview

Use this runbook to confirm that an environment is safe to operate before you make admin changes. It is the first-day baseline for a new operator and the post-change baseline after releases that may affect authentication, sessions, logs, audit, or the admin console.

For live incidents, start with [Admin Incident Quick Reference](./incident-quick-reference.md) instead.

## When To Use This

Use this runbook:

- when you first become an operator for an environment
- after a deployment that changed auth, sessions, logs, audit, or admin console behavior
- when you want to prove the admin and non-admin boundary is still intact
- when you need a documented baseline before you begin routine access work

## Preconditions and Safety

Before you begin onboarding checks:

- confirm you are signed in with the intended `admin` account
- confirm you know which environment you are operating in
- confirm you are not already responding to a live outage that requires incident-first triage
- keep your checks read-only except for the explicit export drill in this runbook

Safety rules for day-one validation:

- do not test by widening access for yourself or another user
- do not treat missing buttons as a prompt to try alternate or manual flows
- do not continue if the environment falls into `Stop and escalate`
- capture evidence as you go so you do not have to reconstruct the first hour later

## Readiness States

| State | Criteria | Operator action |
|---|---|---|
| Healthy | `/admin` loads, database is connected, scheduler lock is held, outbox dead-letter count is `0`, and Logs, Audit, and Sessions all load | Continue with onboarding and low-risk admin work |
| Degraded but operable | `/admin` loads, but one dependency is degraded while Logs, Audit, and Sessions still work | Capture evidence, keep actions read-only or low-risk, and escalate if user impact exists |
| Stop and escalate | Health page fails, database is disconnected, Logs, Audit, or Sessions fail, exports fail, or admin boundaries look wrong | Stop access changes and escalate immediately |

## Do Not Continue With Access Changes If Any Of These Are True

- Health page fails to load
- database status is `disconnected`
- Logs, Audit, or Sessions does not load
- CSV or JSON exports fail
- `/admin/docs` shows user manuals instead of admin manuals
- admin navigation shows business-only modules unexpectedly

## Step-by-Step Procedure

### 1) Confirm identity, role, and navigation

1. Confirm your effective role is `admin`.
2. Confirm your default landing route is `/admin`.
3. Confirm the sidebar shows admin-safe navigation only.
4. Confirm `/activity-log` and `/governance` are denied or redirected for `admin`.

If you see business modules as `admin`, stop and escalate.

### 2) Validate the Admin Console baseline

Open `/admin` and confirm:

- **Health** loads and shows:
  - database `connected`
  - scheduler lock held with a current owner
  - outbox dead-letter count `0`
- **Application logs** loads and can be filtered
- **Audit logs** loads and can be filtered
- **Sessions** loads and shows active session records

If any of those fail, treat the environment as not ready for access changes.

### 3) Validate the documentation audience split

Open `/admin/docs` and confirm:

- the audience label says admin documentation
- admin runbooks are present
- internal doc links open inside the reader
- app route links navigate inside the app
- external links open in a new tab

You should be able to say:

- “Admins see admin docs only.”
- “Non-admins see user docs only.”

### 4) Validate the access surface

Open `/users` and confirm:

- the user list loads
- role, department, manager, and scope are visible in access mode
- **Edit access** is available for admin mutations

If `/users` is not usable, do not continue with access work.

### 5) Run one minimal safe drill

1. In `/admin` -> **Audit logs**, export the last 50 lines to CSV.
2. Confirm the file exists and includes timestamps, event names, and request IDs.
3. Do not modify business data during this drill.

## Verification Checklist

You are ready to operate only if all of these are true:

- `/admin` loads and the state is `Healthy`
- `/admin/docs` shows admin manuals only
- `/users` is usable for admin work
- exports work in the Admin Console
- you can capture request IDs and correlate them with logs
- you know who receives escalations for engineering, security, and business-policy issues
- you can explain which actions are read-only, reversible, or irreversible before taking them

## Rollback Strategy

This runbook is mostly read-only. If you changed something during validation:

- revert any log configuration values to the prior recorded values
- document any session revocation you performed
- revert any training or test access change immediately
- note whether the rollback restored the original state or whether escalation is still required

## Troubleshooting

### `/admin/docs` looks like user documentation

1. Log out and back in.
2. Re-open `/admin/docs`.
3. If the audience is still wrong, capture user email, role label, locale, and document IDs.
4. Escalate as an authorization boundary incident.

### Health is degraded during onboarding

- stop before access changes
- capture the Health state and timestamp
- open Application logs and record repeated request IDs
- escalate with the evidence package

### `/users` is unavailable during onboarding

- do not use alternate or manual paths for access changes
- capture the failing route and request IDs
- escalate as an admin-surface regression

### The environment is degraded but still partially usable

- stop treating onboarding as a checklist completion exercise
- classify the environment as `Degraded but operable`
- finish only evidence-capture steps that are still safe and read-only
- open [Admin Console](./console.md) for the precise failure mode and handoff expectations

## Escalation and Handoff

Include:

- what you observed
- the route and timestamp
- the readiness state you classified
- request IDs and export evidence
- the smallest reproduction steps

## Related Documentation

- [Admin Incident Quick Reference](./incident-quick-reference.md)
- [Admin Console](./console.md)
- [User and Access Governance](./user-management.md)
- [Reports and Evidence Exports](./reports.md)
