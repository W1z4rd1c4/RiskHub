# frontend/src/components/ui

## Purpose

UI components for `ui` area.

## Contents

- `button.tsx` — shared action primitive; 40px default/icon and the only named
  compact exception (32px compact/iconCompact), safe native `type="button"`,
  and disabled + `aria-busy` loading behavior.
- `input.tsx` — shared text/number/date input with the 40px default geometry.
- `field.tsx` — visible label, help, required, invalid, and error association.
- `select.tsx` — Radix select primitives with the same 40px default geometry.
- `StepIndicator.tsx`
- `ThemedSelect.tsx` — closed-list convenience API built on `select.tsx`.

## Control geometry

The desktop control system uses one monotonic radius scale: 8, 10, 12, 14,
and 16px (`sm` through `2xl`), plus `full` for pills. Ordinary controls are
40px high with a 12px radius. Button's explicit compact and compact-icon
variants are 32px high with a 10px radius. Cards and dialogs use the 16px
radius. Callers should select a proven named variant instead of overriding
height or radius locally.

## Selector decision table

| Need | Owner | Use |
| --- | --- | --- |
| Simple browser-native closed list used as a low-level interaction seam | Native `select` | Keep native semantics. The register toolbar's visually hidden Add-filter selector stays native because tests and keyboard activation rely on its stable value/change contract. |
| Styled closed list from known options | `ThemedSelect` | Use with a visible `Field` label or an explicit `triggerAriaLabel`. |
| Low-level Radix composition | `Select*` primitives | Use only when `ThemedSelect` cannot express the required composition; retain the default geometry and Field ARIA wiring. |
| Search or selection from a large entity directory | Existing domain search/select component | Reuse the domain owner rather than expanding `ThemedSelect` into a searchable abstraction. |
| Free-form creation mixed with selection | Creatable combobox work | Do not simulate this with a closed select; it belongs to the separately scoped combobox ticket. |

Domain status badges remain owned by their domain presentation modules. There
is no shared status component because the status vocabulary, tone, and workflow
meaning are not interchangeable.

## Notes

Keep this README updated when responsibilities or structure in this folder change.
