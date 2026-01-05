# Phase 72 Plan 10: Risk Hub Resolution Summary

**Enabled non-CRO users to access risk thresholds and active risk types via public endpoints, ensuring frontend risk pages work correctly for all authenticated users.**

## Accomplishments

### Threshold Keys Exposed
- Expanded `PUBLIC_CONFIG_ALLOWLIST` to include risk threshold keys:
  - `medium_risk_min_net_score`
  - `high_risk_min_net_score`
  - `critical_risk_min_net_score`
- Non-CRO users can now read these values via `/api/v1/riskhub/public-config/{key}`

### Public Risk Types Endpoint
- Added `GET /api/v1/riskhub/public-risk-types` for all authenticated users
- Returns only active risk types (`is_active == True`)
- Minimal payload with display-only fields: `code`, `display_name`, `color`, `icon`, `sort_order`
- No admin metadata exposed (no `id`, `created_at`, `updated_at`, `is_system`, `risk_count`, `description`)

### Test Coverage
- Extended `test_riskhub_public_config.py` with threshold key access test
- Created `test_riskhub_public_risk_types.py` with 5 tests:
  - Non-CRO access verification
  - Active-only filtering
  - Minimal field validation
  - Unauthenticated blocking
  - Sort order verification

## Files Created/Modified

| File | Change |
|------|--------|
| `backend/app/api/v1/endpoints/riskhub.py` | Added 3 threshold keys to allowlist; added `PublicRiskTypeRead` schema and `/public-risk-types` endpoint |
| `backend/tests/test_riskhub_public_config.py` | Added `test_public_config_threshold_keys_accessible` test |
| `backend/tests/test_riskhub_public_risk_types.py` | **[NEW]** Comprehensive tests for public risk types endpoint |

## Test Results
```
tests/test_riskhub_public_config.py: 5 passed
tests/test_riskhub_public_risk_types.py: 5 passed
```

## Next Step
Execute `72-11-PLAN.md` (Frontend public-config consumption + dynamic type display).
