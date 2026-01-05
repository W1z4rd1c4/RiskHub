# Phase 72 Plan 11: Risk Hub Resolution Summary

**Updated the frontend to consume public Risk Hub endpoints and replaced hardcoded strategic/operational type display with config-driven rendering for all authenticated users.**

## Accomplishments

### API Client Updates
- Added `PublicRiskType` interface with minimal fields
- Added `getPublicRiskTypes()` method calling `/riskhub/public-risk-types`

### Hook Updates
- `useRiskTypes()` now calls public endpoint instead of CRO-only `/riskhub/risk-types`
- `useRiskThresholds()` now uses correct keys via `/riskhub/public-config/{key}`:
  - `critical_risk_min_net_score`
  - `high_risk_min_net_score`
  - `medium_risk_min_net_score`
- Added `getInitials()` helper for compact 2-character type badges

### Type System Relaxation
- Changed `RiskType` from `'strategic' | 'operational'` to `string`
- Renamed constant from `RiskType` to `RiskTypeCodes` for backward compatibility

### UI Updates
- RisksPage.tsx: Type badge uses config color via `hexToRgba()` and `getInitials()` for label
- RiskDetailPage.tsx: Type chip uses config color and `getDisplayName()` for full label
- Removed all `risk_type === 'strategic' ? 'S' : 'O'` patterns

### Test Coverage
- Created `riskhub_public_config_consumption.spec.ts` Playwright test
- Updated test mocks in `handlers.ts` with correct threshold keys
- Added mock handlers for `public-risk-types` and `public-config/:key`

## Files Created/Modified

| File | Change |
|------|--------|
| `frontend/src/services/riskHubApi.ts` | Added `PublicRiskType` interface and `getPublicRiskTypes()` method |
| `frontend/src/hooks/useRiskHubConfig.ts` | Rewrote to use public endpoints + correct keys, added `getInitials()` |
| `frontend/src/types/risk.ts` | Changed `RiskType` to `string`, renamed constants |
| `frontend/src/pages/RisksPage.tsx` | Config-driven type badge with `hexToRgba`, removed S/O hardcoding |
| `frontend/src/pages/RiskDetailPage.tsx` | Config-driven type chip with full display name |
| `frontend/tests/riskhub_public_config_consumption.spec.ts` | **[NEW]** Playwright test for endpoint verification |
| `frontend/src/test/mocks/handlers.ts` | Updated threshold keys, added public endpoint handlers |

## Build Status
- ✅ `npm run build` completes without errors

## Manual Verification Required

Before declaring complete, verify manually:
1. Login as a non-CRO user
2. Open `/risks` and check DevTools Network tab:
   - Should call `/riskhub/public-risk-types`
   - Should call `/riskhub/public-config/critical_risk_min_net_score`
   - Should call `/riskhub/public-config/high_risk_min_net_score`
   - Should call `/riskhub/public-config/medium_risk_min_net_score`
3. Verify type badges show 2+ character labels (not single S/O)
4. Open risk detail page and verify Type chip shows full display name

## Next Step
Execute `72-12-PLAN.md` (Naming cleanup for approval threshold helpers).
