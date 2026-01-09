# Phase 72 Plan 09: Risk Hub Resolution Summary

Removed remaining backend hardcoded risk-threshold logic so CRO-configured thresholds consistently affect reporting and approval gating.

## Accomplishments
- Aligned `ConfigDefaults` fallback thresholds with seeded Risk Hub defaults (5/10/16)
- Removed hardcoded `>= 16` from the risks PDF summary and passed config-loaded thresholds from the reports endpoint
- Made control “critical/high linked” approval checks use `is_critical_risk_async` (config-driven) in async flows
- Added regression tests proving that changing `global_config` thresholds changes behavior (with cache clears)

## Files Created/Modified
- `backend/app/models/global_config.py`
- `backend/app/services/report_service.py`
- `backend/app/api/v1/endpoints/reports.py`
- `backend/app/core/approval_helpers.py`
- `backend/app/api/v1/endpoints/controls.py`
- `backend/app/core/permissions.py`
- `backend/tests/test_global_config_usage.py`
- `backend/tests/test_threshold_propagation.py`

## Next Step
Execute `72-10-PLAN.md`.

Note: The manual verification checklist from `72-09-PLAN.md` was moved into `72-10-PLAN.md` so it can be done while running the app for the new public endpoints.
