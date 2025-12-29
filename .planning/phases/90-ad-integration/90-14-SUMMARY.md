# Phase 90-14 Summary: Uncategorised Items Governance

## Completed

### Task 1: Uncategorised Sweep Logic
- Implemented `OrphanedItemService.scan_uncategorised_items(db)` method.
- Logic: Scans Risks and Controls in the "Uncategorised" department.
- Action: If items are not already in `orphaned_items` table, they are flagged as "pending" orphans.
- Handling of "headless" items (no owner): Implemented fallback to assign `previous_owner` to the first active Admin user found in the system, to satisfy database constraints.

### Task 2: Trigger on API Call
- Updated `list_orphaned_items` endpoint (`/api/v1/orphaned-items/`).
- Now triggers `scan_uncategorised_items` before returning the list, ensuring the view is always up-to-date.

## Verification

### Manual Trigger
Ran verification script `scripts/verify_orphans.py` after Phase 90-13 cleanups.
- **Result:** 65 new orphaned items identified and flagged.
- **Total:** 67 orphans now in the system (2 existing + 65 new).

## Outcome
- All risks/controls in the "Uncategorised" department are now visible in the Governance tab "Orphaned Items" list.
- Because KRIs are attached to Risks, they are implicitly covered by the Risk resolution process.
- Admins can now reassign these items to proper owners and departments via the "Resolve" UI.

## Files Modified
- `backend/app/services/orphaned_item_service.py`
- `backend/app/api/v1/endpoints/orphaned_items.py`
