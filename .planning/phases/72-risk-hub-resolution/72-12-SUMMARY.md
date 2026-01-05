# Phase 72 Plan 12: Risk Hub Resolution Summary

**Corrected misleading `is_critical_risk*` helper naming to `is_high_risk_for_approval*` to match actual threshold semantics (uses HIGH_RISK threshold, not CRITICAL_RISK).**

## Accomplishments

### Task 1: New Correctly-Named Helpers
- Added `is_high_risk_for_approval(risk) -> bool` (sync version)
- Added `is_high_risk_for_approval_async(risk, db) -> bool` (async version)
- Both use `HIGH_RISK_MIN_NET_SCORE` / `high_risk_min_net_score` config key
- Clear docstrings explaining the threshold semantics

### Task 2: Deprecated Aliases for Backward Compatibility
- Kept `is_critical_risk()` as thin alias calling `is_high_risk_for_approval()`
- Kept `is_critical_risk_async()` as thin alias calling `is_high_risk_for_approval_async()`
- Added deprecation warnings in docstrings explaining the naming issue

### Task 3: Updated Call Sites
- `approval_helpers.py`: Now imports and uses `is_high_risk_for_approval_async`
- `controls.py`: Now imports and uses `is_high_risk_for_approval_async`
- Old misleading names no longer used in approval gating logic

### Task 4: Updated Tests
- `test_global_config_usage.py`: Updated to use new helper names
- `test_threshold_propagation.py`: Updated to use new helper names
- Added regression guard test `test_deprecated_is_critical_risk_alias_matches_new_helper`

## Files Modified

| File | Change |
|------|--------|
| `backend/app/core/permissions.py` | Added new helpers, kept old as deprecated aliases |
| `backend/app/core/approval_helpers.py` | Updated to use `is_high_risk_for_approval_async` |
| `backend/app/api/v1/endpoints/controls.py` | Updated to use `is_high_risk_for_approval_async` |
| `backend/tests/test_global_config_usage.py` | Updated tests + added regression guard |
| `backend/tests/test_threshold_propagation.py` | Updated tests to use new helper |

## Verification

```
✅ rg "is_critical_risk" in call sites returns empty (no usage)
✅ 15 tests pass (pytest test_global_config_usage.py test_threshold_propagation.py)
✅ Backward compatibility preserved via alias tests
```

## Next Step
Phase 72 resolution work is complete. Continue with any remaining Phase 72 plans or proceed to Phase 99 data migration work.
