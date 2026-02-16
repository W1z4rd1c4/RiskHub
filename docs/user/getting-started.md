---
title: Getting Started with RiskHub
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md + frontend onboarding routes"
summary: "First-day onboarding manual for non-admin users: scope validation, navigation, workflow readiness, and how to avoid the most common early mistakes."
tags:
  - onboarding
  - overview
  - workflow
  - notifications
  - troubleshooting
---

# Getting Started with RiskHub

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

This guide gets you from first login to productive daily use. It focuses on operational readiness:

- confirming your access is correct
- understanding how scope affects what you see
- learning the “workflow mindset” (approvals and notifications)
- building good habits for filters and exports

The fastest way to get value from RiskHub is:

- use the dashboard to detect pressure
- use the queues to manage workflow
- keep risks and controls actionable (ownership + evidence)

## Where To Find It

You will use these routes frequently:

- dashboard: `/`
- approvals queue: `/approvals`
- notifications: `/notifications`
- risks: `/risks`
- controls: `/controls`
- KRIs: `/kris`
- issues: `/issues` (if enabled)
- vendors: `/vendors` (if enabled)
- departments: `/departments`
- settings (including docs): `/settings`

If you can’t open a route you expect, treat it as an access/scope problem first, not a “bug”.

## Roles, Scope, and Visibility

RiskHub behavior depends on:

- role (what you are responsible for)
- scope (global vs department vs manager)
- permissions (resource + action)

Practical examples:

- you might see `/vendors` only if you have `vendors:read`
- you might see `/issues` only if you have `issues:read`
- you might see `/activity-log` only if you have `activity_log:read` (and you are not a platform admin)

Your scope determines *how wide* your default visibility is. Ownership can create exceptions.

If your first-day view looks wrong (missing your team’s risks, or showing unrelated departments), fix scope early. Scope bugs waste the most time.

## Data Model and Key Fields

For day-one success, you don’t need every field. You need the “control points” that drive daily operations.

| Concept | What to watch | Why it matters |
|---|---|---|
| Ownership | owner on risks/controls, reporting owner on KRIs | Ownership drives accountability and routing. |
| Department | department on key entities | Department drives reporting and baseline scope. |
| Status | active/emerging/archived, open/closed | Status influences visibility and priorities. |
| Scoring | net vs gross risk scores | This is how you quantify posture and trend. |
| Due/overdue | KRI due dates, issue due dates | Overdue is a governance signal. |
| Workflow notes | approval reasons and resolution notes | Notes are part of audit trail. |

## Core Workflows

### 1) First login checklist (15 minutes)

1. Sign in and confirm your display name and role label.
2. Open `/settings`:
   - set language preference
   - confirm you can access the documentation library
3. Open `/` and scan whether data looks plausible for your scope.
4. Open `/notifications` and check unread items.
5. Open `/approvals` and check whether you have pending requests.
6. Open `/departments` and confirm your department context is present.

### 2) Your daily operating routine

A simple routine that scales:

1. Dashboard: scan critical and breach signals.
2. Workflow: clear approvals and notifications you own.
3. Execute:
   - update risks that are drifting
   - log control executions
   - record KRIs (or follow up with reporting owners)
4. Document:
   - keep change notes clear
   - create Issues for remediation
5. Export only when you need to share evidence.

### 3) Your weekly hygiene routine

1. Review overdue KRIs.
2. Review open issues by severity.
3. Review top net risks per department.
4. Confirm controls with high risk level have recent executions.

## Approvals and Notifications Behavior

The single most important behavior to understand:

- some edits are not applied immediately; they are queued for approval

How it looks in practice:

- you save and the UI says success
- but the value stays unchanged
- the item shows “pending changes”

When you see this:

1. Open `/approvals` and find the request.
2. Track status.
3. Watch `/notifications` for the outcome.

Write good approval reasons. Bad reasons create rejection and rework.

## Filters, Views, and Exports

### Filters

Most list pages support filters. Two rules prevent 80% of confusion:

1. Always check filters before interpreting a number.
2. Clear filters when switching between different tasks (especially before exporting).

### Views

Some pages support grouped views. Use them for review packs, not for quick day-to-day edits.

### Exports

Exports are evidence.

Export discipline:

- export with an explicit as-of date
- keep the raw export unchanged
- if you create a derived spreadsheet, keep the original export attached

## Common Mistakes

- Treating access problems as bugs without validating role/scope first.
- Editing many governance-sensitive fields at once (creates approval noise).
- Ignoring workflow queues until they become urgent.
- Sharing exports without stating filters and as-of date.

## Troubleshooting

### I can’t see a module my colleague sees

- Compare permissions (`resource:read`).
- Compare scope (global vs department).
- Check ownership assignments.

### My changes didn’t apply

- Check `/approvals` for queued requests.
- Check `/notifications` for outcomes.

### The in-app documentation looks wrong

- If you are non-admin, you should see user documentation.
- If admin documentation appears, your role assignment may be incorrect.

### Language looks inconsistent

- Set your language in `/settings`.
- Refresh and re-open docs.

## Related Documentation

- `./README.md`
- `./notifications.md`
- `./risks.md`
- `./controls.md`
- `./kris.md`
- `./issues.md`
- `./vendors.md`
- `./departments.md`
- `./access-management.md`
