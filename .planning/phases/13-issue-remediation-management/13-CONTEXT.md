# Phase 13 Context: Simplified Contextual Issues (Reopen)

## Why Phase 13 Is Reopened

Phase 13 shipped core issue lifecycle capabilities (`13-01`..`13-03`) and is functionally complete, but the current user experience still requires too much manual setup for issue creation.

The follow-up objective is to simplify issue intake and make issue creation contextual from source entities (Risk, Control, KRI, Vendor) while preserving existing backend workflow state semantics.

## Locked Decisions

1. Phase lineage remains in Phase 13 (no `13.1` fork).
2. Existing workflow states and endpoints remain authoritative.
3. Contextual entry points are added on detail pages only.
4. `IssueLink` gets first-class `vendor_id` support.
5. Vendor department resolution rule:
   - use `vendor.department_id` when present,
   - otherwise use vendor owner department,
   - fail with clear validation error if no department can be resolved.

## Current-State Evidence

1. Phase 13 is currently marked complete in planning metadata:
   - `.planning/ROADMAP.md`
   - `.planning/STATE.md`
2. Manual issue creation flow requires explicit department selection and uses `source_type='manual'`:
   - `frontend/src/components/issues/IssueCreateForm.tsx`
3. `IssueLink` currently supports only risk/control/execution/kri targets:
   - `backend/app/models/issue.py`
   - `backend/app/schemas/issue.py`
4. Issues routes already split list/new/detail and can host simplification follow-ups cleanly:
   - `frontend/src/App.tsx`
5. Vendors can be department-null today, creating contextual-link ambiguity:
   - `backend/app/models/vendor.py`

## Scope

### In Scope

- Add backend contextual issue creation contract.
- Add vendor direct linkage in issue linking model.
- Add reusable frontend quick-create modal for contextual issue intake.
- Add issue creation actions on Risk/Control/KRI/Vendor detail pages.
- Simplify Issues detail workflow UX without changing backend state machine.
- Add verification and docs closeout plans for reopen scope.

### Out of Scope

- Redesign of backend issue workflow states and transitions.
- New list-page contextual actions.
- Global non-Issues UX redesign.
- Breaking API removals from existing issue endpoints.

## Risk Areas

1. Scope leakage when contextual source entities are cross-department.
2. Constraint drift in `IssueLink` exactly-one-target check when adding `vendor_id`.
3. Vendor department fallback ambiguity for global-scope owner users.
4. UI simplification accidentally hiding required actions for certain role scopes.

## Definition of Done for Reopened Slice

1. Phase 13 contains executable follow-up plans `13-04..13-08` with wave dependencies.
2. Roadmap/state reflect Phase 13 as in-progress (`3/8`) with historical `13-01..13-03` preserved.
3. Follow-up plans are decision-complete and consumable by `/gsd:execute-phase 13`.
4. Deferred/non-goal items are explicitly tracked in `13-FOLLOWUPS.md`.
