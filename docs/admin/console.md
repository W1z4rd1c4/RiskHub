---
title: Admin Console (/admin)
version: "2.2"
last_updated: "2026-03-15"
audience: admin
source_of_truth: "frontend/src/pages/AdminConsolePage.tsx + admin API endpoints"
summary: "Operator-safe runbook for Health, Application logs, Audit logs, Sessions, and evidence export workflows."
tags:
  - overview
  - audit
  - exports
  - troubleshooting
  - settings
---

# Admin Console (/admin)

## Overview

The Admin Console is the first-line operator surface for:

- health validation
- incident triage
- application and audit evidence capture
- session investigation and revocation
- low-risk log configuration changes

Primary route: `/admin`

Platform admins should use `/admin` for platform-state decisions instead of business modules.

## Operator State Guide

| Signal | Acceptable state | Operator action if not met |
|---|---|---|
| Health page | loads without errors | stop access changes and escalate |
| Database | `connected` | stop access changes and escalate |
| Scheduler | lock held and owner populated | capture evidence and escalate as runtime incident |
| Outbox | dead-letter count `0` | capture failures before any retry or replay discussion |
| Application logs / Audit logs / Sessions | each tab loads and can be filtered | treat as observability outage and escalate |
| Exports | CSV/JSON export completes with the intended filter window | retry once with narrower filters, then escalate |

State definitions:

- **Healthy**: all signals above are acceptable.
- **Degraded but operable**: `/admin` loads, but one dependency is degraded while logs/audit/sessions still work.
- **Stop and escalate**: Health fails, database is disconnected, observability tabs fail, or exports fail.

## When To Use This

Use the Admin Console when you need to answer:

- is the platform currently healthy?
- are errors happening right now?
- what changed and who changed it?
- is a session suspicious, stale, or in need of revocation?
- can I capture a minimal evidence package for support or audit?

## Preconditions and Safety

Before taking an admin action:

- confirm you are logged in as `admin`
- confirm you are in the intended environment
- use the least-exposure rule for logs and exports

Safety rules:

- do not paste raw logs into unapproved channels
- export only the minimum needed data
- treat user IDs, emails, IP addresses, and request IDs as sensitive
- do not continue with access changes if the console state is degraded

## Step-by-Step Procedure

### 1) Health

1. Open `/admin` -> **Health**.
2. Classify the state:
   - **Healthy**: database connected, scheduler lock held, outbox dead-letter count `0`
   - **Degraded but operable**: one dependency degraded, but logs/audit/sessions still load
   - **Stop and escalate**: Health fails or database is disconnected
3. If the state is not Healthy, capture the state before making changes elsewhere.

### 2) Application logs

1. Open **Application logs**.
2. Start with a narrow time window and `ERROR` level when relevant.
3. Look for:
   - repeated request IDs
   - repeated routes or features
   - recurring 401/403/500 patterns
4. Export only the minimum lines needed for the case.

### 3) Audit logs

1. Open **Audit logs**.
2. Filter by event type and time window.
3. Use audit logs to confirm:
   - access changes
   - configuration changes
   - session revocations
   - approval decisions, if audited
4. Audit change payloads are intentionally redacted for sensitive fields, free text, unknown keys, and vendor legal names; use entity/action/timestamp correlation rather than expecting raw secret or PII values.
5. Export only the evidence required for the current case.

### 4) Sessions

1. Open **Sessions**.
2. Identify the user by email or name.
3. Confirm last activity, last login, role, and department context.
4. Revoke sessions only when needed:
   - suspected compromise
   - offboarding
   - stuck auth/session behavior

Session revocation is not reversible. The recovery path is user re-authentication.

### 5) Log configuration

1. Open the log configuration panel.
2. Record the current values before changing anything.
3. Make the smallest possible retention/rotation change.
4. Save and refresh to confirm the values persisted.
5. Confirm exports still work afterward.

## Verification Checklist

After using the Admin Console for an operational action, confirm:

- the state classification is still accurate after your action
- scheduler ownership is still visible
- outbox dead-letter count is still zero, or captured for escalation
- exports match the intended filters and do not contain excess data
- revoked sessions are gone and the user can re-authenticate

## Rollback Strategy

- Health checks and exports are read-only and have no rollback
- session revocation is not reversible; recovery is user re-authentication
- log configuration changes roll back by restoring the prior recorded values

## Troubleshooting

### I cannot open `/admin`

- re-authenticate once
- confirm you are still operating as `admin`
- if `/admin` still fails, escalate as an admin-surface incident

### Health is degraded

- stop access changes
- capture the Health state and timestamp
- open Application logs for the same time window
- escalate with the evidence package

### Health looks healthy but a route still fails

- compare the failing route, time window, and repeated request IDs against Application logs
- if one user is affected, compare role/scope/session state in `/users` and **Sessions**
- if the route keeps failing while Health stays healthy, escalate as a platform defect

### Exports are empty or failing

- retry once with fewer filters and a narrower time window
- if the UI also fails to show expected data, treat it as an observability outage
- escalate with the failing tab, filters used, and timestamp

### Audit or logs contain unexpected sensitive data

- stop exporting further data
- treat it as a security incident
- escalate with the minimum evidence required

## Escalation and Handoff

Escalate when:

- database is disconnected
- scheduler ownership is missing
- logs show repeated unexplained errors
- observability tabs or exports are unavailable
- audit data suggests unauthorized activity

Good handoff package:

- environment and time window
- Health classification
- exact route or tab involved
- repeated request IDs
- minimal exports or screenshots

## Related Documentation

- [Admin Incident Quick Reference](./incident-quick-reference.md)
- [User and Access Governance](./user-management.md)
- [Reports and Evidence Exports](./reports.md)
- [Risk Hub Config Boundaries](./riskhub-config.md)
