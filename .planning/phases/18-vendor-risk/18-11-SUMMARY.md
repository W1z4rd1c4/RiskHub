# 18-11 — Dashboard + Risk Committee integration — Summary

## What Shipped

- Dashboard Summary now includes vendor metrics (additive fields):
  - total vendors, high-risk vendors, overdue reassessments, breached SLAs
- Risk Committee summary now includes vendor decision signals:
  - critical vendors list
  - vendor alerts: overdue reassessments, SLA breaches, major incidents (30d)
- Quarterly snapshots and comparisons now include VRM governance metrics:
  - active vendors, overdue vendor reassessments, vendor SLA breaches
- Frontend updates:
  - vendor card on Dashboard overview
  - vendor sections in Risk Committee view
  - Vendor sidebar item gated by `vendors:read`
  - vendor notifications deep-link to the correct vendor tab via `?tab=...`

## Tests

- Added backend tests validating dashboard vendor counts and committee payload shape.

