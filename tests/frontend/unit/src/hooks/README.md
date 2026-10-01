# Frontend Hook Tests

This directory holds unit tests and helpers for frontend hooks under `tests/frontend/unit/src/hooks/`.

- `usePageTitle.test.tsx` covers the translated "<page> · RiskHub" `document.title`, key input with
  language changes, title updates, restore on unmount, innermost-caller-wins nesting,
  out-of-order unmounts, the StrictMode double mount and route changes (NAV-01).
- `useResourcePanelQuery` covers the generic `ResourcePanelQueryDefinition<TItem, TCreate, TUpdate>` adapter used by resource panels for list/create/update/delete/restore orchestration.
