# frontend/src/pages/shared

## Purpose

Small shared helpers for page-level collection state that are reused by list pages without introducing a broad generic page framework.

## Contents

- `collectionPageState.ts`
- `useRegisterUrlWorkingSet.ts` - URL writes, page history, normalization, sort
  validation and debounced search. Its query hook commits the rendered list identity
  in the layout phase and supplies pagination-free current-view export parameters.
  All eight operational registers use it; domain filters and API calls stay local.
  Entity hooks return one `workingSet` object; the shared list shell consumes its
  focused navigation interface directly, without per-page scalar forwarding.
- `EntityFormChrome.tsx` — chrome of the Asset, Process and Threat forms: `FormSection` (card + `h2`),
  `FormErrorSummary` (`role="alert"`), `FormLoadFailedNotice` (status + retry) and `FormActions`
  (Cancel then submit with a pending state).
- `useRestoreWithFeedback.ts` — restore with toast feedback (D9 / FB-01) for register rows and
  detail pages; a row failure never flips the register into its error state. Retry repeats the captured record action while its canonical session and committed route/query generation still owns it, keeping rows and pagination visible. All seven registers with restore share the helper; Issues has no restore action.

## Notes

Keep domain-specific filters, legacy translations, API calls, and error behavior in each page hook. Shared helpers and hooks should stay narrow.
