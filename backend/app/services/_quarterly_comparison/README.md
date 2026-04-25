# backend/app/services/_quarterly_comparison

## Purpose

Internal helpers for the dashboard quarterly comparison service.

## Contents

- `changes.py` - metric change calculations.
- `period_metrics.py` - current and historical metric loading.
- `periods.py` - quarter boundary and selection helpers.
- `snapshots.py` - snapshot availability and source selection.

## Notes

Keep `backend/app/services/quarterly_comparison_service.py` as the public service entrypoint. New period or snapshot rules should be tested through the dashboard regression tests before changing these helpers.
