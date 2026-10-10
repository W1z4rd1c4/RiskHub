# frontend/src/hooks

## Purpose

Folder for `frontend/src/hooks` implementation assets.

## Contents

- `useActivityLogPageState.ts`
- `useChartTheme.ts` — Recharts colours read from the theme tokens through `lib/cssTokens.ts`
  (chrome, `--chart-1…8` categorical series, D1 severity and status-tone series); no hex tables.
- `useContentTabs.ts` — tab/panel ARIA wiring with roving tabindex and
  Arrow/Home/End (disabled tabs skipped via `isTabDisabled`); the engine behind
  `components/ui/tabs.tsx`. `contentTabId` / `contentPanelId` build the shared ids.
- `useDebouncedValue.ts`
- `useDepartmentDetail.ts`
- `useApprovalQueued.ts` — D12 / PM-2 approval-queued rule: `announce({ approvalId, to })`
  raises the success toast and returns to (or stays on) the entity page with the router state
  that `components/approvals/ApprovalQueuedNotice` renders as the persistent pending notice.
- `useFocusFirstInvalidField.ts` — audit §4.8 / AX-04 "focus on the first invalid field": returns a
  container ref and, whenever its trigger changes to a truthy value (a failed-check counter or the
  error of that check — never on edits), focuses the first `[aria-invalid="true"]` control inside
  it. The Risk, Control and KRI wizards use it.
- `useFeedback.ts` — toast feedback channel (audit §4.16, D9): `success` /
  `info` / `warning` (polite) and `error` (assertive, `messageKey` translated
  through `translateUiMessage`), `dismiss(id?)`; stable API. Reads the
  `FeedbackProvider` in `contexts/FeedbackContext.tsx`; outside it the message
  is dropped and logged once instead of crashing.
- `usePageTitle.ts` — per-route `document.title` ("{{page}} · RiskHub", `common:page_title.template`,
  D14/NAV-01) from a translated string or `{ key, ns }`. With several callers mounted the one
  rendered last (innermost or newest) owns the title; the pre-mount title returns when the last
  one unmounts.
  `PageHeader`, `EntityDetailHeader` and `AuthFrame` call it.
- `useRiskHubConfig.ts`
- `useUsersPageFilters.ts`

## Notes

Keep this README updated when responsibilities or structure in this folder change.
