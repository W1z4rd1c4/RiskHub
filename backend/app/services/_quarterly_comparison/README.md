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


## Caller boundary

Cross-package callers use the reviewed named exports in `__init__.py`.
`CALLER_EXPORTS` is fixed declaration data, checked by the shared architecture
boundary rule; it is not inferred from current imports. Implementation modules
stay private. See [the boundary contract](../../../../docs/development/private-api-boundary-pilot.md)
for role restrictions, behavioral proofs and explicit remaining scope.
