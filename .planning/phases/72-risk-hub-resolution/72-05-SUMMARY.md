# Phase 72-05 Summary: Risk Hub Frontend Alignment

**Completed:** 2026-01-03

## Objective
Align the Risk Hub frontend with backend configuration for risk types, thresholds, approvals, and admin workflows.

## Changes Made

### Task 1: Dynamic Risk Types from Risk Hub
- **Created** `frontend/src/hooks/useRiskHubConfig.ts` with `useRiskTypes()` and `useRiskThresholds()` hooks
- **Updated** `RiskForm.tsx` to populate risk type select from Risk Hub configuration
- **Updated** `RisksPage.tsx` to use dynamic risk types for list filtering
- **Updated** `riskApi.ts` to accept string for `risk_type` instead of hardcoded union
- Implemented fallback to system defaults (operational/strategic) when config unavailable

### Task 2: Configurable Risk Thresholds
- **Updated** `RiskScoreMatrix.tsx` to accept optional threshold props with Risk Hub defaults
- **Updated** `RisksPage.tsx` score coloring to use configurable thresholds
- Thresholds (critical/high/medium) now pulled from Risk Hub global config

### Task 3: Admin Panel Fixes
- **Updated** `ApprovalScenariosPanel.tsx` to fetch roles dynamically from Risk Hub
  - Special `risk_owner` entry merged with backend roles
  - Unknown roles preserved for backward compatibility
- **Updated** `RolesPanel.tsx` with permissions loading guard
  - Save button disabled until permissions load to prevent empty `permission_ids`
- **Updated** `DepartmentsPanel.tsx` to send `manager_id: null` when clearing manager
  - Fixes persistence of manager removal on refresh

## Files Modified
| File | Change |
|------|--------|
| `frontend/src/hooks/useRiskHubConfig.ts` | NEW - Risk Hub config hooks |
| `frontend/src/components/RiskForm.tsx` | Dynamic risk type select |
| `frontend/src/pages/RisksPage.tsx` | Dynamic types & thresholds |
| `frontend/src/services/riskApi.ts` | String type for risk_type |
| `frontend/src/components/RiskScoreMatrix.tsx` | Configurable thresholds |
| `frontend/src/components/riskhub/ApprovalScenariosPanel.tsx` | Dynamic roles |
| `frontend/src/components/riskhub/RolesPanel.tsx` | Permissions loading guard |
| `frontend/src/components/riskhub/DepartmentsPanel.tsx` | Manager null handling |

## Verification
- ✅ Frontend build passes
- ⏳ Manual verification pending
