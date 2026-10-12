# backend/app/services/_reporting

## Purpose

Read-shape bounded context (ADR-007): report export projection. Renders
tabular/CSV exports (`tabular.py`), the summary export payload with
archive-aware totals (`excel.py`), shared count helpers (`counts.py`), and the
per-register export definitions plus fetch pipeline (`exports/`). Read-only:
no commits happen here; endpoint adapters own transactions per ADR-002.
Canonical import home for `generate_tabular_csv` (the old
`app.services.report_service` shim is deleted).

## Caller boundary (#267 / partial #254)

External production callers import the fixed declared package root. Private row,
fetch and replay helpers remain internal; the existing export-definition dispatcher
and current CSV renderers are public. Literal lazy bindings avoid eager import
cycles and preserve concrete signatures for type checking.

`current_register.py` shapes already permission-scoped current KRI models and
applies the existing effective lifecycle and monitoring facts. Historical KRI
replay continues through the unchanged export definition and parent snapshots.
`exports/issue_rows.py` projects scoped Issue models in batches of at most 100,
revalidating linked visibility for each batch. Callers explicitly supply time and
mode: current register overdue includes active exceptions, evaluation-report
overdue suppresses them. An evaluation date does not reconstruct Issue history.
No projection helper grants row access or changes transaction ownership.
