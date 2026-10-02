# frontend/src/components/tables

## Purpose

UI components for `tables` area.

## Contents

- `__tests__/`
- `index.ts`
- `CollectionGroupDrillDown.tsx` — grouped register view: group cards are
  whole-card actions (`Card as="button"`, `data-testid="register-group-card"`);
  the selected group shows a destination-named `BackButton`
  (`common:tables.back_to_groups`), a pluralised count `Badge`, the table and
  the shared `Pagination`.
- `Pagination.tsx` — the one pager (D14): named `<nav>`, `Button`-based
  controls, `aria-current="page"`; `mode` `pages` (default, page buttons),
  `compact` (previous/next + summary) or `cursor` (`hasPrevious`/`hasNext` for
  server cursors). While `isLoading`, previous/next stay focusable but inert
  (`aria-disabled`), so the pressed control keeps keyboard focus.
- `RowActionButton.tsx` — icon-only row action: required `label` (accessible
  name + tooltip), optional `disabledReason` (inert via `aria-disabled`, reason
  as tooltip/description), optional `isLoading` (spinner in place of the icon,
  same element), never bubbles to row activation.
- `RowRestoreButton.tsx` — `RowActionButton` + `ArchiveRestore` with the shared
  `common:actions.restore` / `restore_named` vocabulary: the register row
  "restore from archive" action (PG-28).
- `SortableTable.tsx` — data table on the `components/ui/table.tsx` primitives:
  sortable headers, loading skeleton, error contract, `rowHref` (navigation
  link), `onRowActivate` (in-page selection: named first-cell button with
  Enter/Space, row click delegates; `rowActivateLabel` adds hidden context),
  `getRowActions` (trailing `RowActionButton`s), `surface="none"` inside an
  existing card, `density`. `onRowClick` is deprecated (mouse-only).

## Notes

Keep this README updated when responsibilities or structure in this folder change.
