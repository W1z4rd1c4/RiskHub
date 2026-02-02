# 18-09 — Reporting (annual report) + exports (incl. DORA register) — Summary

## What Shipped

- Annual Vendor Management Report export (PDF + Excel) with:
  - vendor list + classification flags
  - outsourcing owner / department / last decision / reassessment fields
  - major incidents/breaches (year-filtered)
  - process evaluation counts (overdue reassessments, missing plans, etc.)
- DORA “Register of Information” export (Excel) with a stable MVP column contract.
- Frontend “Vendor Reports” page for downloads (year selector + format).

## API

- `GET /vendor-reports/annual?year=YYYY&format=pdf|xlsx`
- `GET /vendor-reports/dora-register?format=xlsx`

## RBAC

- Reports are restricted to: Risk Manager, CRO, Compliance, Internal Audit.

## Tests

- Backend tests cover role-based access + content-type for PDF/Excel endpoints.

