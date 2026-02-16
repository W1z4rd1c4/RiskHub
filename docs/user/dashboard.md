---
title: Dashboard and Reports
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "reporting endpoints and dashboard services"
summary: "Guide for interpreting dashboard metrics, applying filters responsibly, and generating scoped exports for leadership and audit use."
tags:
  - dashboard
  - reports
  - exports
---

# Dashboard and Reports

## Overview

The dashboard is your operating cockpit for monitoring posture, trend direction, and immediate action signals.

Primary routes:

- dashboard: `/`
- entity exports: available from list pages (`/risks`, `/controls`, `/kris`, `/vendors`)

## What to Monitor First

At session start, prioritize:

- trend shifts in high-priority risk areas
- overdue control/KRI operational signals
- open workflow pressure
- cross-functional concentration indicators (where applicable)

## Filter Discipline

Before sharing a metric snapshot:

1. Validate active filters.
2. Validate date/time context.
3. Validate audience relevance.

Most dashboard misunderstanding comes from stale or hidden filters.

## Export Best Practices

- export only what is needed for decision context
- include date range and scope note in handoff message
- preserve original export files for traceability
- avoid spreadsheet edits that remove audit context

## Interpreting Trend Changes

When metrics shift suddenly:

- check if underlying ownership or department assignment changed
- confirm data completeness for the period
- verify whether archived/restored entities affected totals

## Troubleshooting

### Numbers do not match expected reality

Re-check filters, as-of date, and hidden archived toggles where relevant.

### Export button present but file appears incomplete

Confirm your visibility scope; exports are authorization-filtered by design.

### Dashboard looks empty

Verify assigned scope and whether you are in the correct environment/account.

## Related Documentation

- `./risks.md`
- `./controls.md`
- `./kris.md`
- `./vendors.md`
