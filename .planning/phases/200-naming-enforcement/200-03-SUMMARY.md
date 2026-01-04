# Summary: Frontend Risk List & Table Updates

**Phase**: 200 Entity Naming Enforcement  
**Plan**: 200-03  
**Date**: 2026-01-04

## Objective
Update the Risk list views and tables to display the new "Name" field prominently.

## Changes Made

### TypeScript Types ([risk.ts](../../../frontend/src/types/risk.ts))
- Added `name: string` to `Risk` interface
- Added `name: string` to `RiskSummary` interface
- Added `name: string` to `RiskCreate` interface

### Risks Page ([RisksPage.tsx](../../../frontend/src/pages/RisksPage.tsx))
- Changed first column from "Risk" (showing process) to "Name"
- Name displayed as primary identifier with bold styling
- Process shown as secondary info below name in smaller text
- Updated grouped view `renderItem` to match
- Updated search placeholder: "Search by name, process or category..."

### Backend Search ([risks.py](../../../backend/app/api/v1/endpoints/risks.py))
- Added `Risk.name.ilike(search_pattern)` to search filter

## Verification
- ✅ Frontend builds successfully
- ✅ TypeScript types are correct
- ✅ RisksPage table displays Name column

## Impact
- Risk list now shows Name as the primary identifier
- Search now includes the Name field
- Consistent with entity naming enforcement goals

## Next Steps
- Phase 200-04: Frontend Risk Wizard & Form Updates to capture Name during creation
