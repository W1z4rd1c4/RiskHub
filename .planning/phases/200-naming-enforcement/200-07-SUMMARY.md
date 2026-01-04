# Summary: Control Naming Consistency (UI/UX)

**Phase**: 200 Entity Naming Enforcement  
**Plan**: 200-07  
**Date**: 2026-01-04

## Objective
Ensure Control "Name" is consistently displayed and enforced in UI.

## Review Findings

### ControlForm ([ControlForm.tsx](file:///Users/stefanlesnak/Antigravity/Risk%20App/frontend/src/components/ControlForm.tsx))
- ✅ "Control Name" is already the first field in Step 1 (Identity)
- ✅ Validation message: "Control Name is required."
- ✅ Name field is required and prominent

### ControlsPage ([ControlsPage.tsx](file:///Users/stefanlesnak/Antigravity/Risk%20App/frontend/src/pages/ControlsPage.tsx))
- ✅ "Name" column is already first in the table
- ✅ control.name is displayed prominently

### ControlDetailPage ([ControlDetailPage.tsx](file:///Users/stefanlesnak/Antigravity/Risk%20App/frontend/src/pages/ControlDetailPage.tsx))
- ✅ control.name displayed as main header
- **Updated**: Linked risks now show risk.name as primary identifier
- **Updated**: Process and description shown as secondary info

## Changes Made

### Control Types ([control.ts](file:///Users/stefanlesnak/Antigravity/Risk%20App/frontend/src/types/control.ts))
- Added `name: string` and `process: string` to `ControlRiskLink.risk` nested type
- This enables displaying Risk Name in linked risks section

### ControlDetailPage
- Updated linked risks section to show risk.name prominently
- Added risk.process as subtitle
- Risk description shown as additional context

## Verification
- ✅ Frontend builds successfully
- ✅ Control naming is consistent across all views

## Impact
- Linked risks in ControlDetailPage now show Risk Name prominently
- Type definitions aligned with backend schema

## Next Steps
- Phase 200-08: Export/PDF Updates
