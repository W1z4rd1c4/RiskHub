# Phase 2 Plan 2: API Endpoints Summary

**Created CRUD API endpoints for Controls and Risks with bidirectional linking, execution logging, and RBAC enforcement.**

## Accomplishments

- Controls API with CRUD, pagination, search, department filtering
- Risks API with CRUD, type/priority filtering, score calculation
- Control execution logging with automatic next_scheduled calculation
- Bidirectional Control↔Risk linking with effectiveness rating
- RBAC permission checks on all mutating endpoints
- Seed data: 6 controls, 5 risks, 6 links, 9 execution records

## Files Created/Modified

- `backend/app/api/v1/endpoints/controls.py` - Controls CRUD, executions, risk linking
- `backend/app/api/v1/endpoints/risks.py` - Risks CRUD, control linking
- `backend/app/api/v1/router.py` - Registered controls/risks routers
- `backend/app/db/seed.py` - Extended with controls, risks, links, executions
- `backend/app/core/security.py` - Fixed eager-loading for RolePermission.permission

## Decisions Made

- Soft delete via status='archived' instead of hard delete
- Auto-calculate gross_score/net_score from probability × impact
- Control owners can update their controls without controls:write permission

## Issues Encountered

- **MissingGreenlet error**: Fixed by adding nested `selectinload(RolePermission.permission)` in get_current_user to properly eager-load permissions for async RBAC checks.

## Next Step

Ready for 02-03-PLAN.md (Control Catalog UI)

---
*Completed: 2025-12-25*
