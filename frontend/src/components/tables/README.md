# frontend/src/components/tables

## Purpose

UI components for `tables` area.

## Contents

- `__tests__/`
- `index.ts`
- `Pagination.tsx` — the one pager (D14): named `<nav>`, `Button`-based
  controls, `aria-current="page"`; `mode` `pages` (default, page buttons),
  `compact` (previous/next + summary) or `cursor` (`hasPrevious`/`hasNext` for
  server cursors). While `isLoading`, previous/next stay focusable but inert
  (`aria-disabled`), so the pressed control keeps keyboard focus.
- `RowActionButton.tsx` — icon-only row action: required `label` (accessible
  name + tooltip), optional `disabledReason` (inert via `aria-disabled`, reason
  as tooltip/description), never bubbles to row activation.
- `SortableTable.tsx` — data table on the `components/ui/table.tsx` primitives:
  sortable headers, loading skeleton, error contract, `rowHref` (navigation
  link), `onRowActivate` (in-page selection: named first-cell button with
  Enter/Space, row click delegates; `rowActivateLabel` adds hidden context),
  `getRowActions` (trailing `RowActionButton`s), `surface="none"` inside an
  existing card, `density`. `onRowClick` is deprecated (mouse-only).

## Notes

Keep this README updated when responsibilities or structure in this folder change.
