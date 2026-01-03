# Phase 90-11 Summary: Uncategorised Department Fallback

## Completed

### Task 1: Seed Uncategorised Department
- Added `is_system` column to `Department` model to mark system-reserved departments
- Seeded "Uncategorised" department (id=999, code=UNCAT, is_system=TRUE)
- Updated DB schema via direct ALTER TABLE

### Task 2: Update Orphan Resolution Logic
- Modified `OrphanedItemService.resolve_orphan()` to accept optional `department_id`
- Implemented fallback logic: explicit dept > owner's dept > Uncategorised
- Updated endpoint schema to accept `department_id` in request body

### Task 3: Update Resolve Modal UI
- Added department selection dropdown to `ResolveOrphanModal.tsx`
- Added warning badge when "Uncategorised" department is selected
- Fixed TypeScript types in `orphanedItem.ts` and imports

### Task 4: Governance Page Enhancement
- Added "Uncategorised" stat card to `GovernancePage.tsx`
- Added visual highlighting (badge/icon) for uncategorised items in `OrphanedItemsTable.tsx`
- Updated grid layout to accommodate new stat card

## Files Modified

- `backend/app/models/department.py` - Added `is_system` column
- `backend/app/services/orphaned_item_service.py` - Updated resolve logic
- `backend/app/schemas/orphaned_item.py` - Added `department_id` to resolve schema
- `backend/app/api/v1/endpoints/orphaned_items.py` - Pass `department_id` to service
- `frontend/src/types/orphanedItem.ts` - Added `department_id` to `ResolveOrphanRequest`
- `frontend/src/components/governance/ResolveOrphanModal.tsx` - Added department selection and warning badge
- `frontend/src/components/governance/OrphanedItemsTable.tsx` - Highlighted Uncategorised items
- `frontend/src/pages/GovernancePage.tsx` - Added Uncategorised Items stat card

## Verification

```
Uncategorised department exists: id=999, code=UNCAT, is_system=TRUE
```
