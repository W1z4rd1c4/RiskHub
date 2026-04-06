# Plan 252-03 Summary: KRI Form Decomposition

## Completed

- Replaced the monolithic `frontend/src/components/KRIForm.tsx` implementation with a stable façade that re-exports `frontend/src/components/kri-form/KRIFormContainer.tsx`.
- Split the KRI form internals into typed modules under `frontend/src/components/kri-form/`:
  - `KRIFormContainer.tsx`
  - `useKriFormState.ts`
  - `useKriLookups.ts`
  - `useKriSubmit.ts`
  - `KriRiskSelectionStep.tsx`
  - `KriDetailsStep.tsx`
  - `KriFormNavigation.tsx`
  - `KriFormStepContent.tsx`
  - `kriForm.selectors.ts`
  - `kriForm.utils.ts`
  - `kriForm.types.ts`
  - supporting UI pieces for banners, mismatch dialog, and footer
- Preserved the import-stable public contract from `@/components/KRIForm`.
- Preserved vendor-context behavior:
  - vendor-context banner
  - vendor-only/all-readable risk toggle
  - mismatch dialog for parent risks not yet linked to the vendor
  - `linked_vendor_ids` and `ensure_parent_risk_vendor_ids` submission behavior
- Preserved approval-queued edit behavior by keeping the `parseUpdateResult(...)` handling in the extracted submit hook.
- Added direct component-level edit-path regression coverage for both approval-queued and immediately-applied update responses, including `linked_vendor_ids` forwarding.
- Removed all raw `console.error` calls from the KRI form path.
- Added focused internal regression coverage for the new selector/state modules.

## Verification

- `cd frontend && npm run test:run -- src/components/__tests__/KRIForm.vendor-context.test.tsx src/components/__tests__/KRIModal.vendor-selection.test.tsx src/pages/__tests__/KRIForms.vendor-context.test.tsx src/__tests__/approval_edit_update_handling.spec.ts src/components/kri-form/kriForm.selectors.test.ts src/components/kri-form/useKriFormState.test.tsx` -> `6 files passed`, `23 tests passed`
- `cd frontend && npm run test:run -- src/components/__tests__/KRIForm.vendor-context.test.tsx src/components/__tests__/KRIForm.edit.test.tsx src/pages/__tests__/KRIForms.vendor-context.test.tsx src/pages/__tests__/KRIDetailPage.edit-approval.test.tsx src/__tests__/approval_edit_update_handling.spec.ts` -> `5 files passed`, `21 tests passed`
- `cd frontend && npm run lint && npx tsc --noEmit` -> passed

## Notes

- The current KRI UX still has two real steps, so no `KriReviewStep.tsx` was added.
- Phase 252 façade enforcement is phased: `KRIForm.tsx` is now under the strict façade cap because its decomposition wave landed, while the still-unsplit façades remain on explicit no-growth line caps until their own waves are complete.
