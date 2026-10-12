# backend/app/services/_dashboard_metrics

## Purpose

Business/service-layer logic for `_dashboard_metrics`.

## Contents

- `__init__.py`
- `__pycache__/`
- `committee_projection.py`
- `controls.py`
- `departments.py`
- `kris.py`
- `lifecycle.py`
- `periods.py`
- `risks.py`
- `risk_levels.py`

## Notes

Keep this README updated when responsibilities or structure in this folder change.


## Caller boundary

Cross-package callers use the reviewed named exports in `__init__.py`.
`CALLER_EXPORTS` is fixed declaration data, checked by the shared architecture
boundary rule; it is not inferred from current imports. Implementation modules
stay private. See [the boundary contract](../../../../docs/development/private-api-boundary-pilot.md)
for role restrictions, behavioral proofs and explicit remaining scope.
