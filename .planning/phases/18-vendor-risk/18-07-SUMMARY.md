# 18-07 — Exit strategy + contingency plan / BCP artifacts — Summary

## What Shipped

- Added first-class resilience artifacts for vendors:
  - Exit strategy (`VendorExitPlan`)
  - Contingency / BCP plan (`VendorContingencyPlan`)
- Added a single read/update endpoint to keep resilience data consistent and reportable.
- Added computed gap flags to avoid duplicating business logic in dashboards/reports.

## Rules (PI-aligned)

- Resilience artifacts are **required** when:
  - `vendor.supports_important_core_insurance_function = true`
- Contingency plan is considered required (gap logic) when, in addition to being required:
  - `max_tolerable_outage_hours > 24`, OR
  - any CIA impact flag is set (C/I/Au/A).

Gap flags:

- `missing_exit_plan`: required & (missing OR status != `complete`)
- `missing_contingency_plan`: required by outage/CIA rule & (missing OR status != `complete`)

## API

- `GET /vendors/{id}/resilience`
- `PATCH /vendors/{id}/resilience`

## RBAC / Gating

- Read: any user authorized to read the Vendor.
- Write: outsourcing owner OR `vendors:write`.

