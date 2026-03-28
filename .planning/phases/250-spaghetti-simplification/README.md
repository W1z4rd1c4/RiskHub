# Phase 250: SPAGHETTI Code Simplification

## Goal
Systematically simplify the RiskHub codebase by identifying and refactoring 10 major complexity areas while **preserving all existing functionality**. Each area follows the `/simplify` workflow principles.

## Simplification Principles (from /simplify workflow)
1. **Preserve Functionality** - Never change what the code does, only how it does it
2. **Apply Project Standards** - ES modules, function keywords, explicit types, proper React patterns
3. **Enhance Clarity** - Reduce nesting, eliminate redundant code, consolidate related logic
4. **Avoid Nested Ternaries** - Prefer switch/if-else for multiple conditions
5. **Maintain Balance** - Don't over-simplify or remove helpful abstractions

## Scope
- **In Scope**: RiskHub backend (`/backend/app`) and frontend (`/frontend/src`)
- **Out of Scope**: AD Emulator, tests (unless broken), documentation

## Plans Overview

| Plan | Target | Lines | Focus |
|------|--------|-------|-------|
| 250-01 | `riskhub.py` | 1509 | Extract schemas, modularize by resource type |
| 250-02 | `dashboard.py` | 1144 | Extract `get_quarterly_comparison` helper functions, reduce duplication |
| 250-03 | `approvals.py` | 960 | Extract `approve_request` into service layer |
| 250-04 | `kris.py` + `risks.py` | 953 + 884 | Consolidate duplicate CRUD patterns |
| 250-05 | `ControlForm.tsx` + `RiskForm.tsx` | 794 + 765 | Extract shared wizard logic to custom hook |
| 250-06 | `RiskDetailPage.tsx` | 718 | Extract tab content into subcomponents |
| 250-07 | `UsersPage.tsx` | 670 | Extract filter logic, simplify render loops |
| 250-08 | `AdminConsolePage.tsx` | 619 | Keep as-is (already well-structured panels) → Replaced with `permissions.py` |
| 250-09 | `DepartmentDetailPage.tsx` | 574 | Reduce state complexity, extract metrics |
| 250-10 | Service Layer Consolidation | ~1200 | Unify orphaned_item_service, directory_sync_service patterns |

## Execution Strategy
1. Each plan is self-contained and can be executed independently
2. Run tests after each plan to verify functionality preservation
3. Use git commits after each plan for easy rollback if needed

## Verification
- All existing tests must pass after each plan
- Manual smoke test of affected pages/endpoints
- No new linter errors introduced

---

*Created: 2026-01-10*
*Completed: 2026-01-10*
