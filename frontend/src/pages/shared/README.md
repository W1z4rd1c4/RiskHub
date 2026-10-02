# frontend/src/pages/shared

## Purpose

Small shared helpers for page-level collection state that are reused by list pages without introducing a broad generic page framework.

## Contents

- `collectionPageState.ts`
- `EntityFormChrome.tsx` — chrome of the Asset, Process and Threat forms: `FormSection` (card + `h2`),
  `FormErrorSummary` (`role="alert"`), `FormLoadFailedNotice` (status + retry) and `FormActions`
  (Cancel then submit with a pending state).
- `useRestoreWithFeedback.ts` — restore with toast feedback (D9 / FB-01) for register rows and
  detail pages; a row failure never flips the register into its error state.

## Notes

Keep domain-specific filters, API calls, and error behavior in each page hook. Shared helpers should stay narrow and pure.
