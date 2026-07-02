# backend/app/services/_reporting

## Purpose

Read-shape bounded context (ADR-007): report export projection. Renders
tabular/CSV exports (`tabular.py`), the summary export payload with
archive-aware totals (`excel.py`), shared count helpers (`counts.py`), and the
per-register export definitions plus fetch pipeline (`exports/`). Read-only:
no commits happen here; endpoint adapters own transactions per ADR-002.
Canonical import home for `generate_tabular_csv` (the old
`app.services.report_service` shim is deleted).
