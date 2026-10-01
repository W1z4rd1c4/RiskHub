# frontend/src/components/ui

## Purpose

UI components for `ui` area.

## Contents

- `button.tsx` — shared action primitive; 40px default/icon and the only named
  compact exception (32px compact/iconCompact), plus 44px `lg`; safe native
  `type="button"`, and disabled + `aria-busy` loading behavior. Variants:
  `accent` is THE primary CTA (D4); `default` is a deprecated alias; `secondary`,
  `outline`, `ghost`, `destructive`, `warning`, `success`, `link` (`secondary`
  and `link` keep their pre-§4.7 looks until their callers migrate in W7).
  Icon-only sizes require `aria-label` or `aria-labelledby` at the type level.
- `BackButton.tsx` — labelled back navigation; `label` names the destination
  (D14). `to` renders a router link, `onClick` renders a button.
- `RefreshButton.tsx` — refresh affordance (`size`, `iconOnly`); spinning icon + `aria-busy` while
  `isFetching`, translated default name (`common:actions.refresh`).
- `input.tsx` — `Input` text/number/date input on the `inputVariants` cva
  recipe (§4.8): `size` `default` (40px) or `compact` (32px, filter bars and
  `SearchableEntitySelect`), optional decorative `leadingIcon`; invalid styling
  follows `aria-invalid`. `Textarea` and `NativeSelect` share the recipe.
- `textarea.tsx` — `Textarea` (≥5rem, `resize-y`; `autoResize` grows with the
  content). The remaining copied `TEXTAREA_CLASS` constants (AssetForm,
  ResolveOrphanModal) migrate to it with their forms.
- `checkbox.tsx` — `Checkbox`, a native checkbox with `onCheckedChange` and
  `indeterminate`; name it with `Field layout="inline"` or `aria-label`
  ("Select {name}" for row selection).
- `radio-group.tsx` — `RadioGroup` (`value`, `onValueChange`, `options` with
  optional `description`, `variant` `list`/`card`): native radios in a
  `fieldset role="radiogroup"` named by `legend` or a `Field group`; its ref
  points at the `fieldset`.
- `switch.tsx` — `Switch`, a `button role="switch" aria-checked` (44×24px,
  `bg-input` → `bg-accent`); `aria-label` or `aria-labelledby` is required at
  the type level. Space/Enter toggle.
- `multi-select.tsx` — `MultiSelect` (`options`, `value: string[]`,
  `onChange`): select-only combobox trigger with a selected-count summary
  (`formatSummary`) opening a Radix popover checkbox list (arrow keys, Space,
  Escape; optional `searchable`; `size` `default`/`compact`); removable `Badge`
  chips named "Remove {name}". Its ref points at the trigger.
  The popover is a `themed-select-content` layer, so it works inside
  `DialogShell`: Escape closes only the popover, and tabbing past either end of
  the list returns focus to the trigger instead of leaving the dialog.
- `native-select.tsx` — `NativeSelect`, a styled native `<select>` with the
  `Input` geometry for pre-auth, admin and simple filter forms.
- `field.tsx` — `Field` owns the control id and hands `id` + `aria-labelledby`
  / `aria-describedby` / `aria-invalid` / `aria-required` to its child through
  a render-prop (spread it onto any control above). Props: `help`
  (description), `error`, `required` (aria-hidden `*`, D14), `optional`
  (translated "(optional)"), `labelVisuallyHidden`, `layout` `stack`/`inline`
  (Checkbox/Switch rows), `group` (text label for `RadioGroup`).
- `label.tsx` — `Label` on `@radix-ui/react-label` with the required `*`.
- `select.tsx` — Radix select primitives with the same 40px default geometry.
- `StepIndicator.tsx`
- `ThemedSelect.tsx` — closed-list convenience API built on `select.tsx`. Name
  it with `Field` (`aria-labelledby`) or `triggerAriaLabel`; the unnamed
  overload is `@deprecated` (AX-04) and goes once Phase 3 migrates its callers.
- `badge.tsx` — `Badge` visual shell for status pills (§4.9): `tone` (from
  `lib/tones.ts`), `variant` soft/solid/outline, `size` `md` (12px, tables and
  headers) or `sm` (11px uppercase, dense cells only, D6), `shape` pill/rounded,
  decorative `icon`/`dot`, `srLabel` for icon-only or abbreviated badges.
  `SeverityBadge` paints a `SeverityBand` on the D1 scale via `lib/severity.ts`
  with the translated `common:severity.*` label (or a domain `label`).
- `card.tsx` — `Card` on the canonical `glass` surface (D5; `tone="nested"` for
  inner panels, `padding` none/compact/default, `interactive`), `CardHeader`
  (`h2` section title by default, eyebrow, description, actions), `CardTitle`,
  `CardBody`, `CardFooter`.
- `inline-message.tsx` — `InlineMessage` banner (§4.10, AX-05): tone
  info/success/warning/danger/neutral; `danger` → `role="alert"`, other tones →
  `role="status"` (`live` overrides); optional named dismiss button.
- `tabs.tsx` — `TabList` / `TabPanel` on `hooks/useContentTabs` (D8): roving
  tabindex, Arrow/Home/End (disabled tabs skipped), `underline` (detail) and
  `pill` (page views) variants, optional icon and count per tab.
- `table.tsx` — presentational `Table` (named horizontal scroll region,
  `density`), `THead`, `TBody`, `TR`, `TH` (`scope="col"`, D14 header recipe,
  `onSort` → sort button + `aria-sort`), `TD`, and `TableRowButton` (named
  first-cell activation button). `SortableTable` renders these internally.
- `dialog.tsx` — `DialogShell` v2 (§4.11, D5): focus trap, Escape/backdrop
  close, opener restore; fixed `bg-popover` surface on a `bg-overlay` backdrop,
  `size` (`sm`…`2xl`), close guards `closeDisabled` / `isBusy` and an optional
  `dirtyGuard` (`useDirtyTaskGuard`). `DialogHeader` (h2 title on the shell's
  `titleId`, tone icon, close), `DialogBody`, `DialogFooter` (Cancel then the
  primary action, right-aligned), also as `DialogShell.Header/Body/Footer`.
  The class props are deprecated; `components/DialogShell.tsx` re-exports it.

## Control geometry

The desktop control system uses one monotonic radius scale: 8, 10, 12, 14,
and 16px (`sm` through `2xl`), plus `full` for pills. Ordinary controls are
40px high with a 12px radius. Button's explicit compact and compact-icon
variants are 32px high with a 10px radius. Cards and dialogs use the 16px
radius. Callers should select a proven named variant instead of overriding
height or radius locally.

## Form primitive API conventions

Every form primitive (`Input`, `Textarea`, `NativeSelect`, `Checkbox`,
`Switch`, `RadioGroup`, `MultiSelect`) follows the same contract, covered by
the API-consistency block in
`tests/frontend/unit/src/components/ui/formControls.test.tsx`:

- **Refs:** forwarded to the native control; `MultiSelect` forwards to its
  trigger button and `RadioGroup` to its `fieldset` root.
- **`displayName`** equals the export name.
- **`className`** is merged with `cn` (tailwind-merge), so a caller class wins
  over the recipe class it conflicts with.
- **Size vocabulary:** `default` (40px) / `compact` (32px), shared through
  `inputVariants` by `Input`, `NativeSelect` and the `MultiSelect` trigger
  (tables use the same words for `density`). Checkbox, radio and switch have
  one size.
- **Tones:** colour meaning comes from `lib/tones.ts` (`Badge`,
  `InlineMessage`); controls carry no tone of their own, their invalid state
  follows `aria-invalid`.

## Selector decision table

| Need | Owner | Use |
| --- | --- | --- |
| Simple browser-native closed list used as a low-level interaction seam | Native `select` | Keep native semantics. The register toolbar's visually hidden Add-filter selector stays native because tests and keyboard activation rely on its stable value/change contract. |
| Short closed list on pre-auth, admin or simple filter forms where native behaviour matters | `NativeSelect` | Spread `Field`'s render-prop; options are `<option>` children. |
| Styled closed list from known options | `ThemedSelect` | Use with a visible `Field` label or an explicit `triggerAriaLabel`. |
| Several values from a known list | `MultiSelect` | Popover checkbox list with a count summary and removable chips; name it through `Field` or `triggerAriaLabel`. |
| Low-level Radix composition | `Select*` primitives | Use only when `ThemedSelect` cannot express the required composition; retain the default geometry and Field ARIA wiring. |
| Search or selection from a large entity directory | Existing domain search/select component | Reuse the domain owner rather than expanding `ThemedSelect` into a searchable abstraction. |
| Free-form creation mixed with selection | Creatable combobox work | Do not simulate this with a closed select; it belongs to the separately scoped combobox ticket. |

Status badges share the visual shell (`Badge`), not the vocabulary: domain
wrappers stay in their presentation modules and choose the tone and the
translated label, because status vocabulary, tone, and workflow meaning are not
interchangeable. Severity bands always go through `SeverityBadge`.

## Notes

Keep this README updated when responsibilities or structure in this folder change.
