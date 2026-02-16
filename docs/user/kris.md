---
title: KRIs (Key Risk Indicators)
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "frontend/src/pages/KRIsPage.tsx + frontend/src/pages/KRIDetailPage.tsx + docs/BUSINESS_LOGIC.md"
summary: "How to create and operate KRIs: thresholds, breach/overdue logic, value recording, history review, exports, and notification-driven monitoring."
tags:
  - kri
  - workflow
  - notifications
  - exports
  - troubleshooting
---

# KRIs (Key Risk Indicators)

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

KRIs (Key Risk Indicators) are the monitoring layer for risks. They turn "we think this risk is rising" into measurable signals.

A KRI is successful when it provides:

- a clear metric name and unit
- a normal range (limits)
- a consistent recording cadence
- a breach state that triggers action

Primary route: `/kris`

In RiskHub, KRIs are treated as risk sub-entities:

- they are linked to a risk
- they inherit context (department, process, category)
- they drive dashboard widgets and notifications

## Where To Find It

- KRI list: `/kris`
- KRI detail: click a row
- KRIs on a risk: open a risk detail page (`/risks/<id>`) and review KRI-related sections

If you do not see **KRIs** in the sidebar:

- you likely lack `risks:read` (KRIs are risk sub-entities)

## Roles, Scope, and Visibility

KRI access typically splits into two capabilities:

1. **KRI design** (create/edit): usually gated by `risks:write` (because KRIs are part of risk governance)
2. **KRI value recording**: gated by `kri:submit` and/or by being the reporting owner

Practical rules:

- If you can’t create/edit KRIs, you may still be able to record values (if you are the reporting owner and policy allows).
- If you can see KRIs but not record, check whether you have `kri:submit`.

Scope rules still apply:

- department and ownership influence what you can see
- backend enforcement is authoritative

## Data Model and Key Fields

| Field | Meaning | Pitfalls / notes |
|---|---|---|
| Metric name | Human-readable KRI label | Use stable naming; changing names breaks trend readability. |
| Description | What the metric represents and why it matters | Include data source and interpretation. |
| Unit | %, count, currency, etc | Unit must match the value. |
| Lower/upper limits | Acceptable range | Limits should be meaningful (not too wide, not too narrow). |
| Current value | Most recent recorded value | Should correspond to a defined period end. |
| Breach status | `within`, `above`, `below` | Breach drives alerts and prioritization. |
| Frequency | daily/weekly/monthly/… | Must match how the metric is actually produced. |
| Reporting owner | Person responsible for submitting values | Separate from risk owner if needed. |
| Last period end | End date of the last reporting period | Used to compute due/overdue state. |
| Overdue logic | Due date = period end + 15 days | Overdue is a monitoring failure signal. |
| History entries | Recorded values over time | This is your trend evidence. |

## Core Workflows

### 1) Create a KRI for a risk

Good KRIs start from a risk failure mode.

1. Identify the risk you want to monitor.
2. Define a metric that changes before the risk materializes.
3. Create the KRI:
   - metric name
   - unit
   - limits (lower/upper)
   - frequency
   - reporting owner
4. Save.
5. Record the first value as a baseline.

Recipe: *choose KRIs that don’t become noise*

- prefer metrics you can actually obtain on schedule
- avoid KRIs that require subjective judgment
- define limits so breach is actionable (not constant)

### 2) Record a KRI value

Recording is the operational heartbeat.

1. Open the KRI detail.
2. Click **Record value**.
3. Enter the value and (if needed) the period end.
4. Save.
5. Confirm breach/within status updates as expected.

If you cannot record:

- confirm you have `kri:submit`
- confirm you are the reporting owner (some environments allow reporting owners to submit)

### 3) Use KRI history to explain trends

The history tab is the evidence surface.

Use it to:

- prove when a metric started drifting
- correlate with control execution failures
- support changes to net risk scoring

When you change limits, document why. Otherwise trend interpretation becomes ambiguous.

### 4) Respond to breach and overdue signals

Breach and overdue are different:

- **breach**: the metric is outside limits (risk pressure signal)
- **overdue**: the metric was not recorded on time (monitoring discipline signal)

Recommended response pattern:

- breach: create an Issue and route remediation, then review related risks/controls
- overdue: fix the reporting process (owner, cadence, data source)

### 5) Archive and restore KRIs

Archive KRIs that are no longer meaningful (metric replaced, risk retired).

Before archiving:

- confirm whether dashboards rely on it
- confirm whether an audit period expects it

Restore if archived incorrectly.

## Approvals and Notifications Behavior

KRIs interact with workflow in two ways:

- **Notifications**: due soon, overdue, near breach, breach detected
- **Approvals**: sensitive changes (like risk-level governance changes) can be approval-gated depending on policy

Practical signals:

- if the UI shows a breach, expect notifications to be generated
- if edits do not apply, check `/approvals`

Use `./notifications.md` for queue mechanics.

## Filters, Views, and Exports

### Filters

The KRI list supports operational filters:

- within limits
- breach
- overdue
- archived
- search

Use “overdue” as a discipline view and “breach” as a risk pressure view.

### Views

KRIs can be viewed in:

- paged list (all)
- grouped views (for review packs and concentration)

### Exports

KRIs can be exported from the list.

Export discipline:

- export with a clear as-of date
- keep filters explicit (breach vs within)
- keep raw exports unchanged

## Common Mistakes

- Picking KRIs that can’t be recorded reliably.
- Limits that are either always breached or never breached.
- Treating overdue as “data admin work” rather than a governance control failure.
- Changing limits without documenting why.
- Recording values without clarifying the reporting period.

## Troubleshooting

### I can see KRIs but can’t record values

- Check whether you have `kri:submit`.
- Check whether you are the reporting owner.

### Breach status looks wrong

- Validate unit and limits.
- Confirm you recorded the value for the intended period.

### Overdue is triggered unexpectedly

- Overdue depends on `last_period_end`.
- If period end is wrong, update it via governance process.

### Export failed

- Retry with fewer filters.
- Capture the error if it persists.

## Related Documentation

- `./risks.md`
- `./issues.md`
- `./controls.md`
- `./notifications.md`
- `./dashboard.md`
- `./activity-log.md`
