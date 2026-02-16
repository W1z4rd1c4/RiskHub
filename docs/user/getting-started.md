---
title: Getting Started with RiskHub
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md §1-§4"
summary: "First-day onboarding guide for non-admin users, including role scope validation, dashboard orientation, and workflow readiness checks."
tags:
  - onboarding
  - navigation
  - settings
---

# Getting Started with RiskHub

## Overview

This guide gets you from first login to productive daily use. It focuses on operational readiness: scope verification, queue awareness, and baseline navigation.

## Before You Start

Confirm these prerequisites with your team lead or system owner:

- your role assignment is correct
- your department assignment is correct (if applicable)
- your account is active and you can sign in
- your browser language preference is set as expected

## First Login Checklist

1. Sign in and confirm your display name and role badge.
2. Open `/settings` and set language/theme preferences.
3. Open `/` (Dashboard) and verify visible data matches your role/scope.
4. Open `/notifications` and check pending items.
5. Open the docs tab in Settings and confirm user documentation is available.

## Validate Access Scope Early

Scope issues are easiest to fix on day one. Validate:

- can you open entities your team expects you to manage?
- are unrelated departments hidden (unless your role is global)?
- do ownership exceptions behave correctly on assigned entities?

If scope appears wrong, collect examples (entity ID + timestamp) and escalate.

## Learn the Core Navigation Paths

- Risk register: `/risks`
- Controls catalog: `/controls`
- KRI monitoring: `/kris`
- Issues and remediation: `/issues`
- Vendor management: `/vendors`
- Workflow queue: `/approvals` and `/notifications`

## Approval-Aware Editing Mindset

RiskHub may convert certain edits into approval requests. This is expected behavior. Always:

- review whether your change touched sensitive fields
- confirm request status after save
- include clear business rationale in request notes

## Daily Operating Routine (Recommended)

1. Start on Dashboard.
2. Review notifications and pending approvals.
3. Process high-priority risks/controls/KRIs.
4. Update tracked entities with complete notes.
5. Export/share evidence only when needed.

## Troubleshooting

### I cannot see expected records

Check role, department scope, and ownership assignment first. If still incorrect, escalate with affected IDs.

### My edit did not apply immediately

You likely triggered an approval workflow. Open notifications/workflow to check status.

### I see the wrong documentation audience

User accounts should receive user docs. Report role mismatch if admin docs appear unexpectedly.

## Related Documentation

- `./risks.md`
- `./controls.md`
- `./kris.md`
- `./notifications.md`
- `./faq.md`
