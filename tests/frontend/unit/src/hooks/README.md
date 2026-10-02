# Frontend Hook Tests

This directory holds unit tests and helpers for frontend hooks under `tests/frontend/unit/src/hooks/`.

- `usePageTitle.test.tsx` covers the translated "<page> · RiskHub" `document.title`, key input with
  language changes, title updates, restore on unmount, innermost-caller-wins nesting,
  out-of-order unmounts, the StrictMode double mount and route changes (NAV-01).
- `useResourcePanelQuery` covers the generic `ResourcePanelQueryDefinition<TItem, TCreate, TUpdate>` adapter used by resource panels for list/create/update/delete/restore orchestration.
- `useApprovalQueued.test.tsx` covers the D12 / PM-2 approval-queued rule: return to (or stay on) the
  entity page, the persistent `ApprovalQueuedNotice` with its `/approvals` deep link and dismissal,
  the success toast, and the router-state helpers.
