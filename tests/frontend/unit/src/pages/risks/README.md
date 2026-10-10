# Risk register unit tests

Focused contracts for the Risk list's declarative configuration, normalized
query mapping, and shared register behavior. Route-level interaction tests live
in `../__tests__/RisksPage.archived-visibility.test.tsx`.

`riskColumns.restore.test.tsx` covers the archived-row restore
`RowActionButton` (PG-28): named, typed, and isolated from row activation.
