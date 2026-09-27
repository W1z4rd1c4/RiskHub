# Risk Form Tests

Vitest coverage for shared risk form helpers and lookup behavior.

Form lookup tests should verify that server-backed options remain available beyond the first page and that approval-aware save behavior does not fabricate local authority.

Owner assignment coverage (#176) includes a 205-person lookup fixture, explicit pointer/keyboard selection and clear, preserved owner/Department submission after filtering, edit-mode identity retention, bounded server queries, error/retry/no-match distinctions, and late query/Department responses. `RiskForm.ownership.test.tsx` exercises the form through accessible controls and intercepted HTTP; `useRiskOwnerSearch.test.ts` also checks a transport that ignores abort.

The 2026-09-27 Chromium acceptance pass used the real `RiskForm` with an isolated Vite server and intercepted assignment lookup responses (no live database mutation). It reproduced the baseline All-filter clear and missing edit identity, then verified the above pointer/keyboard, beyond-200, failure/retry and out-of-order scenarios. Axe found no structural violations in the ownership subtree; combined light/dark contrast verification belongs to #175.
