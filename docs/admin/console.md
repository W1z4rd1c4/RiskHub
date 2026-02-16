---
title: Admin Console (/admin)
version: "2.0"
last_updated: "2026-02-16"
audience: admin
source_of_truth: "frontend/src/pages/AdminConsolePage.tsx + admin API endpoints"
summary: "Runbook for platform admins to use the Admin Console for health checks, log/audit export, session triage, and safe operational support."
tags:
  - overview
  - audit
  - exports
  - troubleshooting
  - settings
---

# Admin Console (/admin)

**On this page**
- [Overview](#overview)
- [When To Use This](#when-to-use-this)
- [Preconditions and Safety](#preconditions-and-safety)
- [Step-by-Step Procedure](#step-by-step-procedure)
- [Verification Checklist](#verification-checklist)
- [Rollback Strategy](#rollback-strategy)
- [Troubleshooting](#troubleshooting)
- [Escalation and Handoff](#escalation-and-handoff)
- [Related Documentation](#related-documentation)

## Overview

The Admin Console is the platform-admin operational cockpit. It is designed for:

- service health validation
- incident triage (API failures, auth/session issues)
- observability via application logs and audit logs
- session investigation and revocation
- safe export of limited evidence for support and compliance needs

Primary route: `/admin`

Important boundary:

- Platform admins should not operate business modules (Risks, Controls, KRIs, Vendors, Issues).
- Platform admins should validate platform behavior and support governance safely.

## When To Use This

Use the Admin Console when you need to answer one of these quickly:

- “Is the backend healthy and reachable?”
- “Are errors happening right now?”
- “What changed (audit trail) and who performed the action?”
- “Is a user session suspicious or stale?”
- “Can we export a small subset of logs to support an investigation?”

Typical scenarios:

- after deploy / environment change
- authentication incidents (users being logged out, failing to log in)
- data access incidents (unexpected 403s across the app)
- audit / compliance requests for change evidence

## Preconditions and Safety

Before you take any admin action, confirm:

- You are logged in as `admin`.
- You are operating in the intended environment (dev/staging/prod).
- You understand the “least exposure” rule for logs and exports.

Safety rules:

- Do not paste raw logs into unapproved channels.
- Do not export more than you need. Prefer narrow windows and specific event types.
- Treat user IDs, emails, IP addresses, and request IDs as sensitive.
- When changing log retention/rotation, consider incident response needs and storage impact.

If you are responding to a security incident, follow your security checklist and engage the security owner early.

## Step-by-Step Procedure

### 1) Health tab: quick platform readiness check

Goal: validate that the platform is up and dependency health is acceptable.

Procedure:

1. Open `/admin`.
2. Select **Health**.
3. Confirm:
   - database status is healthy
   - latency is within expected bounds
   - uptime is consistent with recent deploys
4. If health is degraded:
   - check application logs for correlated errors
   - verify database connectivity and credentials (outside the UI)

### 2) Application logs tab: investigate runtime failures

Goal: find error patterns without turning logs into a data leak.

Procedure:

1. Open **Application logs**.
2. Filter by level if available (focus on ERROR first).
3. Increase lines only as needed (start small).
4. Identify:
   - timestamp window
   - request IDs that repeat
   - endpoints or features referenced
5. Export:
   - prefer JSON for structured analysis
   - prefer CSV for quick human review

Rules of thumb:

- One error is a clue. A repeating error is a root-cause candidate.
- When debugging auth, look for request IDs that show 401/403 patterns.

### 3) Audit logs tab: confirm governance actions

Goal: produce an audit narrative: what happened, who did it, and when.

Procedure:

1. Open **Audit logs**.
2. Filter by event type when possible.
3. Use a narrow line window and a tight time range.
4. Export only the lines needed to support the claim.

Use audit logs for:

- access changes
- configuration changes
- approval decisions (if audited)
- session revocations

### 4) Sessions tab: investigate and revoke sessions

Goal: reduce risk by ending suspicious or broken sessions.

Procedure:

1. Open **Sessions**.
2. Identify the user by email/name (confirm identity in a secure channel).
3. Validate the session characteristics:
   - last activity time
   - last login time
   - role and department context
4. If revocation is required:
   - revoke the session
   - notify the user to log in again

Notes:

- Session revocation is not reversible.
- Use revocation when you suspect token compromise, user offboarding, or a stuck auth state.

### 5) Log configuration: rotation and retention

Goal: maintain logs long enough for incident response without causing storage risk.

Procedure:

1. In the console, open the log configuration panel.
2. Adjust rotation size and retention count for:
   - application logs
   - audit logs
3. Save.
4. Verify:
   - new config is persisted
   - exports still work

Change discipline:

- Make small changes.
- Record the previous values so you can roll back quickly.

## Verification Checklist

After using the Admin Console for an operational action, verify:

- Health is stable (or you captured the degraded state with timestamps).
- Log exports match the intended filter/window and do not include excess data.
- Any revoked session is no longer active and the user can re-authenticate.
- If you changed log configuration, the new values are visible after a refresh.

If your action was part of a support case, attach:

- environment
- timestamps
- request IDs (if applicable)
- a minimal export excerpt

## Rollback Strategy

- Health checks: no rollback (read-only).
- Log exports: no rollback; ensure you store exports securely and delete when no longer needed.
- Session revocation: cannot be undone. If you revoked incorrectly, the “rollback” is user re-authentication and follow-up.
- Log configuration changes: revert to the prior rotation/retention values and verify stability.

## Troubleshooting

### I cannot open `/admin`

- Confirm you are logged in as `admin`.
- Confirm your session is valid (re-authenticate).
- If you still cannot access, check backend role enforcement and logs.

### Health looks OK but the app is failing

- Check application logs for 401/403/500 patterns.
- Verify auth mode and session behavior.
- Validate frontend-backend connectivity (CORS, base URL, proxy settings).

### Exports are empty or incomplete

- Reduce filters and retry.
- Increase lines slightly.
- Confirm the event type filter is not too narrow.

### Audit log contains unexpected data

- Treat as potential security incident.
- Stop exporting further data.
- Escalate to security/engineering with minimal necessary evidence.

## Escalation and Handoff

Escalate when:

- health indicates database connectivity issues
- logs show repeated errors without an obvious configuration cause
- audit data suggests unauthorized access or policy breach

Good handoff bundle:

- environment + time window
- what you observed (one paragraph)
- what you tried (steps)
- minimal exports (JSON/CSV excerpts) stored securely
- relevant request IDs and user emails (only in approved channels)

## Related Documentation

- `./user-management.md`
- `./departments.md`
- `./approvals.md`
- `./reports.md`
- `./riskhub-config.md`
