# tests/frontend/unit/src/components/ui

Unit tests for shared UI primitives: form primitive components
(`formPrimitives.test.tsx`) and the accessibility of the themed select control
(`themedSelectA11y.test.tsx`).

Button contract tests: variants, sizes, loading and keyboard
(`buttonVariants.test.tsx`), plus the derived `BackButton.test.tsx` and
`RefreshButton.test.tsx`.

Phase 1.6/1.8/1.9 primitive contracts: `badge.test.tsx` (tones, variants,
sizes, `srLabel`, `SeverityBadge` D1 bands with en/cs labels), `card.test.tsx`
(glass/nested surfaces, padding, heading levels), `inlineMessage.test.tsx`
(role by tone, `live` override, named dismiss), `tabs.test.tsx` (roles, ids,
roving tabindex, Arrow/Home/End skipping disabled tabs, variants) and
`tablePrimitives.test.tsx` (scroll region, header recipe, sortable `TH`,
`TableRowButton`).

Form-control contract tests (audit §4.8, roadmap 1.5): `formControls.test.tsx`
(Textarea, Checkbox, Switch, RadioGroup, NativeSelect: names, required, error
announcement, keyboard, axe in 3 themes, plus the API-consistency block:
forwarded refs, `displayName`, `cn` class merging and the shared
`default`/`compact` size vocabulary) and `multiSelect.test.tsx`
(MultiSelect: combobox naming, count summary, keyboard, search, chip removal,
DialogShell layering, open-state axe). `formPrimitives.test.tsx` also covers
the `Input` sizes and the `Field` optional / visually hidden / inline layouts.
