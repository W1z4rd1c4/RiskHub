---
title: Admin Incident Quick Reference
version: "1.1"
last_updated: "2026-03-29"
audience: admin
source_of_truth: "frontend/src/pages/LoginPage.tsx + frontend/src/pages/UsersPage.tsx + frontend/src/pages/AdminConsolePage.tsx + backend/app/api/v1/endpoints/admin/*"
summary: "Use this first when something is broken. Symptom-first admin runbook for auth, access, health, and evidence incidents."
tags:
  - overview
  - troubleshooting
  - access
  - audit
  - exports
---

# Admin Incident Quick Reference

Use this first when something is broken.

Operator rule:

- start with the exact message, route, affected user, and timestamp
- open `/admin` before making access changes
- if Health is degraded, stay read-only unless the runbook below explicitly tells you otherwise

## Overview

This runbook is the fastest entrypoint for first-line admin support. It is organized by the exact symptoms admins tend to see first, not by backend component or engineering subsystem. Use it when a user shares a banner, a disabled control, a missing module, or an unexpected exposure and you need a safe next action in under a minute.

## When To Use This

Use this runbook before deeper investigation when:

- the user reports an auth or access failure
- `/admin` shows a degraded state
- `/users` is loaded but creation or edit actions are missing
- logs, audit, or exports are unexpectedly empty or failing
- you need to decide whether to retry, correct access, or escalate

If you already know the issue is a routine access change with no live incident attached, go straight to [User and Access Governance](./user-management.md). If the question is about a specific admin console panel, use [Admin Console](./console.md).

## Preconditions and Safety

Before you use a symptom card:

- capture the exact message or observed behavior
- record the route, affected user, timestamp, and environment
- open `/admin` before making access changes anywhere else
- keep actions read-only if Health is degraded

Safety rules:

- do not improvise alternate creation or mutation steps when the intended UI path is disabled
- do not widen access temporarily to test visibility
- do not revoke sessions casually; that action is not reversible
- escalate instead of guessing when the last known good state is unclear

## Step-by-Step Procedure

### 1) Choose the matching symptom card

Pick the card with the closest exact wording. If more than one card fits, start with the route that currently blocks safe operations:

- `/login` or session-restore issues start with the authentication card
- `/users` access or visibility problems start with the access cards
- `/admin` status problems start with the degraded-health card
- missing exports or empty observability start with the export card

### “Authentication service unavailable” (`/login`, `/users`, or session restore)

#### What it usually means

- auth or session restoration failed
- login actions are reaching a degraded dependency
- the user may also be holding a stale session after a recent change

#### What to check first

1. Open `/admin` -> **Health**.
2. Confirm whether database status is `connected` or `disconnected`.
3. Open **Application logs** and look for repeated auth-related 401, 403, or 500 events with request IDs.
4. Confirm whether one user is affected or multiple users are affected.

#### What the admin can safely do

- capture the exact banner text and route
- ask the user to re-authenticate once if Health is healthy
- compare the user’s current role and scope in `/users` if only one user is affected
- stay read-only if Health is degraded

#### When to escalate

- Health fails to load
- database is disconnected
- repeated 500s appear in logs
- more than one user is affected
- login still fails after one clean retry

#### What evidence to capture

- exact route and banner text
- affected user email
- timestamp and environment
- repeated request IDs
- Health classification at the same time

### “User can log in but cannot see the expected module”

#### What it usually means

- wrong role
- wrong access scope
- wrong department or manager assignment
- stale session after a recent access change

#### What to check first

1. Open `/users`.
2. Confirm the user’s role, access scope, department, and manager assignment.
3. Confirm the exact route and whether the problem is read or write.
4. Ask whether the user re-authenticated after the last access change.

#### What the admin can safely do

- apply the smallest access correction in `/users`
- ask the user to log out and log back in after the change
- verify the updated values in `/users` after refresh

#### When to escalate

- the same user gets inconsistent results on the same route
- the save succeeds but access behavior does not change after re-authentication
- audit logs do not show the expected access change

#### What evidence to capture

- route and failing action
- before and after access values
- timestamp of the last change
- request IDs if the route returns forbidden or error responses

### “User sees too much data”

#### What it usually means

- access scope drift, often `global`
- a privileged role was assigned unintentionally
- the session still reflects older, broader access

#### What to check first

1. Open `/users`.
2. Compare the user’s current role and scope with the last known good values.
3. Confirm whether the exposure is limited to one route or spans multiple modules.

#### What the admin can safely do

- revert role or scope to the last known good values immediately
- revoke sessions in `/admin` -> **Sessions** if the exposure is security-sensitive
- verify the correction in `/users`

#### When to escalate

- the last known good access state cannot be determined
- exposure remains after correction and re-authentication
- audit logs do not explain how the access changed

#### What evidence to capture

- exposed route or routes
- user email and current role and scope
- before and after values if you reverted anything
- timestamps and relevant audit entries

### “Add user / Add from AD is disabled”

#### What it usually means

- `/users` loaded, but the identity or configuration side of the page is degraded
- the page is in a safe read-only mode for creation actions

#### What to check first

1. Open `/admin` -> **Health**.
2. Confirm whether Health is healthy or degraded.
3. Open **Application logs** and look for repeated auth or configuration errors.
4. Refresh `/users` once after the Health check.
5. If an import already succeeded, confirm whether `/users` returned and opened the access edit modal. Do not look for a separate user detail page.

#### What the admin can safely do

- continue read-only review in `/users`
- retry once after confirming Health
- if import succeeds but the edit modal does not open back on `/users`, capture it as a `/users` workflow defect
- stop before improvising alternate creation steps

#### When to escalate

- creation actions stay disabled after Health is healthy and the page is refreshed
- Health is degraded
- repeated auth or configuration errors continue in Application logs

#### What evidence to capture

- screenshot of the disabled state
- timestamp and environment
- Health state
- repeated request IDs from logs if present

### “Admin Console health is degraded”

#### What it usually means

- a dependency or runtime subsystem is unhealthy
- admin changes now carry higher operational risk

#### What to check first

1. Open `/admin` -> **Health**.
2. Identify which signal is failing:
   - database connectivity
   - scheduler lock or owner
   - outbox dead-letter count
   - recent dispatch or run failures
3. Open **Application logs** for the same time window.

#### What the admin can safely do

- capture Health state and request IDs
- perform read-only evidence collection
- pause non-essential access changes

#### When to escalate

- database is disconnected
- Health page fails to load
- scheduler lock is missing
- dead-letter or repeated runtime failures are present

#### What evidence to capture

- Health panel screenshot or exported values
- timestamps
- repeated request IDs
- related log excerpts

### “Audit/log exports are empty or failing”

#### What it usually means

- filters are too narrow
- the export surface is degraded
- observability is not reliable enough for incident work

#### What to check first

1. Retry with a smaller time window and fewer filters.
2. Confirm the relevant tab still loads entries in the UI.
3. Confirm whether both export and on-screen data are affected.

#### What the admin can safely do

- retry once with narrower filters
- capture the on-screen state if export is failing
- treat missing observability as a blocking issue for risky admin actions

#### When to escalate

- exports fail after one retry
- the log or audit tab itself is empty when it should not be
- request IDs or timestamps cannot be captured for an active incident

#### What evidence to capture

- filters used
- screenshot of the empty or failed export state
- affected tab (`Health`, `Application logs`, `Audit logs`, `Sessions`)
- timestamp and environment

## Verification Checklist

After using a symptom card, confirm:

- you classified the platform as Healthy, Degraded but operable, or Stop and escalate
- you took only the admin-safe action described by the card
- you captured the evidence needed for the next step
- you can explain why you retried, corrected access, or escalated

## Rollback Strategy

This quick reference is mostly a routing aid and evidence guide. Rollback depends on the action you actually took:

- read-only checks and exports have no rollback
- access corrections roll back by restoring the last known good values in [User and Access Governance](./user-management.md)
- session revocation is not reversible; recovery is user re-authentication

If you cannot identify a rollback path before acting, stop and escalate instead of improvising.

## Troubleshooting

Use this section when the symptom does not fit cleanly into one card:

- if `/login` fails and `/admin` is degraded, prioritize the degraded-health card after you capture the login symptom
- if `/users` loads but actions are disabled and Health is healthy, treat that as a platform defect and escalate with request IDs
- if a stale query string keeps showing an old auth banner after the platform is healthy again, capture the current route and current Health state before assuming the incident is still active

When in doubt, choose the card that matches the current blocking surface, not the original report.

## Escalation and Handoff

Every escalation should include:

- the exact symptom wording
- route and time window
- affected user or population
- Health classification
- request IDs or screenshots
- actions already taken
- the reason you stopped instead of continuing

Escalate to engineering when the platform state is degraded or inconsistent. Escalate to business owners when the facts are clear but the requested outcome is a policy decision.

## Related Documentation

- [Admin Onboarding](./getting-started.md)
- [Admin Console](./console.md)
- [User and Access Governance](./user-management.md)
- [Reports and Evidence Exports](./reports.md)
