---
title: Admin Onboarding and First-Day Runbook
version: "2.0"
last_updated: "2026-03-05"
audience: admin
source_of_truth: "frontend/src/pages/AdminConsolePage.tsx + frontend/src/pages/UsersPage.tsx + backend/app/api/v1/endpoints/admin/*"
summary: "First-day operational runbook for platform admins: validate access, docs audience boundaries, observability, and safe-change readiness."
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

This runbook establishes a safe baseline for platform administration before you execute production-impacting changes.

The goal is not “learn the UI”. The goal is **operational confidence**:

- you can prove which role you are operating as
- you can observe platform health, logs, audit trails, and sessions
- you can confirm the documentation audience split is intact
- you can support user access incidents without guessing
- you can make small changes and verify outcomes

## When To Use This

Use this runbook:

- when you become an on-call / operator for a RiskHub environment
- after a deployment that touches auth, sessions, or admin console behavior
- when you suspect the admin/non-admin boundary regressed (for example admins seeing business navigation or vice versa)

Do not use this as a substitute for a production incident playbook. If the system is actively failing, prioritize incident response first.

## Preconditions and Safety

Before you do any admin action, validate:

- you are signed in as the correct identity (avoid shared accounts)
- your account has role `admin` (not CRO/risk manager)
- you have an escalation path (engineering owner, security owner, business owner)

Safety rules:

- Prefer **read-only validation** first (health/logs/audit).
- If you change configuration (for example log retention), record previous values so you can roll back.
- If you are unsure whether an action touches business data, stop and verify scope and role boundaries.

## Step-by-Step Procedure

### 1) Confirm identity, role, and expected navigation

1. Confirm your effective role is `admin`.
2. Confirm your default landing route is `/admin` (admins should not default to the business dashboard).
3. Confirm the sidebar shows only admin-safe navigation (typically Settings, Users/Access, Admin Console, Documentation).
4. Confirm direct navigation to `/activity-log` and `/governance` is denied or redirected. That boundary is expected for `admin`.

If you see business modules (Risks/Controls/Vendors) as `admin`, treat it as a boundary regression and escalate.

### 2) Validate Admin Console baseline (/admin)

Open `/admin` and validate each tab:

1. **Health**
   - the panel loads quickly (no spinner loops)
   - the metrics look plausible (CPU/memory/db stats are present)
2. **Application Logs**
   - the log feed loads
   - filtering is responsive
   - export actions work without leaking secrets
3. **Audit Logs**
   - entries load
   - event type filtering works
   - CSV/JSON export produces a file with timestamps, event names, and request IDs
4. **Sessions**
   - active sessions list loads
   - session revocation actions are visible (if implemented) and are clearly labeled

If any tab fails, do not proceed to access changes. Fix observability first, otherwise you will operate blind.

### 3) Validate documentation audience split (/admin/docs)

Open `/admin/docs` and validate:

- the audience label indicates **admin documentation**
- the library contains admin runbooks (not user manuals)
- doc links behave deterministically:
  - `./file.md` opens another doc inside the reader
  - `/path` navigates to app routes
  - `https://...` opens a new tab

Boundary check you should be able to state explicitly:

- “Admins see admin docs only.”
- “Non-admins see user docs only.”

If you cannot confirm that with confidence, stop and investigate (see Troubleshooting).

### 4) Validate Access Management surface (/users)

Open `/users` and validate what mode you are in:

- **Access mode** (privileged access list):
  - you can see role, department, manager, and access scope
  - you can open the access edit modal (admin-only mutations)
- **Directory mode** (read-only lookup list):
  - you can see user identities but not privileged access controls

As an `admin`, you are expected to support access incidents. If `/users` is not usable, you are missing a critical operator surface.

### 5) Run the “minimal safe change” drill (optional but recommended)

Perform one low-risk, reversible operation:

1. In `/admin` audit logs, export the last 50 lines to CSV.
2. Verify the export file exists and contains expected columns (timestamp, event, request ID).
3. Do not modify business data during this drill.

This confirms your environment supports evidence capture, which is required for almost every incident.

## Verification Checklist

Use this checklist to decide whether you are “ready to operate”.

- `/admin` loads, all tabs usable (Health, Logs, Audit, Sessions)
- `/admin/docs` shows admin manuals (no user docs)
- `/users` loads and shows access mode for admin
- exports (CSV/JSON) work in admin console
- you know how to capture request IDs and correlate with errors
- you know who to escalate to for:
  - engineering defects
  - business policy decisions
  - security/incident severity

If any box is unchecked, your “first fix” should be to restore that capability, not to push forward with risky changes.

## Rollback Strategy

Onboarding itself is mostly read-only. Rollback applies to any change you made during validation.

Rollback rules:

- If you changed log retention/rotation settings, revert to the prior values you recorded.
- If you revoked a session as part of a drill, document which session was revoked and why.
- If you changed a user’s access during training, revert it immediately and record the action.

If you cannot confidently roll back a change, you should not make it.

## Troubleshooting

### I can open `/admin` but `/admin/docs` looks like user docs

Likely causes:

- your account is not truly role `admin` (role mismatch)
- the docs endpoint audience split regressed
- stale session (role changed but session not refreshed)

What to do:

1. Log out and back in (clear stale auth).
2. Re-open `/admin/docs` and verify the audience label.
3. If still wrong, capture:
   - your user id/email
   - current role label
   - locale used
   - the list of documents returned (ids)
4. Escalate as an authorization boundary incident.

### Health looks normal but admin tabs fail or show empty feeds

What to check:

- network/API errors in the browser console
- whether the backend is returning 401/403/500
- whether the failure is isolated to one tab (logs vs audit vs sessions)

What to do:

- use request IDs (from logs/audit) to correlate failures
- if exports fail, treat it as an observability outage (it blocks incident work)

### I can’t access `/users` or access edits fail

What to check:

- do you see the user list at all (routing/session problem)?
- do you get forbidden errors on mutation (role mismatch)?

What to do:

- avoid “manual fixes” elsewhere; `/users` is the supported admin surface
- capture the failing request and escalate as a permissions regression if needed

## Escalation and Handoff

Escalate immediately if you observe any of these:

- admin/non-admin boundaries are mixed (audience leakage)
- audit logs are missing or exports don’t work
- sessions cannot be observed/revoked when required

Handoff package:

- what you observed (route + timestamp)
- what you expected (one sentence)
- relevant export files (audit/logs)
- request IDs and error messages
- the minimal reproduction steps

## Related Documentation

- User access operations: [User and Access Management](./user-management.md)
- Workflow support: [Approvals Support](./approvals.md)
- Evidence exports: [Reports and Evidence Exports](./reports.md)
- Admin Console operations: [Admin Console](./console.md)

Validate effective role and re-authenticate to clear stale session state.
