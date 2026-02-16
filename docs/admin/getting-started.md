---
title: Admin Onboarding and First-Day Runbook
version: "2.0"
last_updated: "2026-02-16"
audience: admin
source_of_truth: "admin console and access APIs"
summary: "First-day checklist for platform administrators to validate access, docs audience boundaries, observability, and support readiness."
tags:
  - onboarding
  - admin
  - operations
---

# Admin Onboarding and First-Day Runbook

## Overview

This guide establishes a safe baseline for platform administration before you execute production changes.

## Day-One Validation Checklist

1. Confirm your account role is `admin`.
2. Open `/admin` and verify admin console access.
3. Open `/admin/docs` and verify admin documentation audience label.
4. Confirm non-admin docs are not returned in your library.
5. Validate logs, health, and active session views.

## Environment Confidence Checks

Before changing production data:

- verify backend health is stable
- verify authentication mode and session behavior
- verify audit logging is active
- verify user/dept reads are returning expected scope

## Minimal Safe Change Protocol

For each admin action:

1. define intended outcome
2. identify blast radius
3. execute smallest possible change
4. verify post-change state
5. record action context for traceability

## Documentation and Support Readiness

Ensure these are available before operational handover:

- access update runbook (`./user-management.md`)
- structural changes runbook (`./departments.md`)
- approval support triage (`./approvals.md`)
- export evidence workflow (`./reports.md`)

## Troubleshooting

### I can open admin console but docs look like user docs

This indicates role mismatch or audience contract regression. Capture account details and escalate immediately.

### Health looks normal but core pages fail

Check auth/session context and API-level permission responses, then correlate with logs.

### I cannot see expected admin controls

Validate effective role and re-authenticate to clear stale session state.
