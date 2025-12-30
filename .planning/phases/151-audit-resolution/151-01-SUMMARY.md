# Phase 151 Plan 01: Department and KRI List Alignment Summary

**Aligned department control counts and KRI breaches with archived filtering; populated ControlSummary fields.**

## Accomplishments

- Department controls list and counts now exclude archived controls by default
- ControlSummary fields (`department_name`, `control_owner_name`) properly populated via eager loading
- KRI breaches endpoint excludes archived risks by default (with `include_archived` option)
- All verification tests pass (9/9)

## Files Modified

- `backend/app/api/v1/endpoints/departments.py`
  - Control counts exclude archived in `list_departments()` and `get_department()`
  - `list_department_controls()` excludes archived by default, maps ControlSummary fields
  - Added import for schema enums

- `backend/app/api/v1/endpoints/kris.py`
  - `list_breaches()` now filters out archived risks by default
  - Added `include_archived` query parameter

## Decisions Made

- Used existing ControlStatus enum from models for filtering consistency
- Added `include_archived` parameter to breaches endpoint for flexibility

## Issues Encountered

None

## Next Step

Ready for 151-02-PLAN.md
