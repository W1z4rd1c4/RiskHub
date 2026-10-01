# frontend/src/hooks

## Purpose

Folder for `frontend/src/hooks` implementation assets.

## Contents

- `useActivityLogPageState.ts`
- `useChartTheme.ts`
- `useContentTabs.ts` — tab/panel ARIA wiring with roving tabindex and
  Arrow/Home/End (disabled tabs skipped via `isTabDisabled`); the engine behind
  `components/ui/tabs.tsx`. `contentTabId` / `contentPanelId` build the shared ids.
- `useDebouncedValue.ts`
- `useDepartmentDetail.ts`
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
- `useStatusTheme.ts`
- `useUsersPageFilters.ts`

## Notes

Keep this README updated when responsibilities or structure in this folder change.
