# frontend/src/i18n

## Purpose

Folder for `frontend/src/i18n` implementation assets.

## Contents

- `__tests__/`
- `allResources.ts` — every locale bundled eagerly (unit-test mode only).
- `errorMessageKey.ts` — API error code / HTTP status → `errorKeys.*` key.
- `formatters.ts` — pure, locale-parameterised `Intl` formatters (date,
  date-time, time, relative, number, metric with optional unit, percent,
  currency); the only place besides `hooks.ts` that may construct `Intl.*`.
- `hooks.ts` — `useTranslation` (stable `t`, `errorKeys.` prefix handling),
  `useFormat()` (the formatters bound to the UI language, plus plural-aware
  `count`), `translateUiMessage(t, keyOrMessage)` for error keys, namespaced
  keys and free text, `useLanguage()`; `useFormattedDate` /
  `useFormattedNumber` are deprecated aliases of `useFormat()`.
- `index.ts` — i18next bootstrap, supported languages, lazy locale loading.
- `locales/`
- `types.ts`

Formatting and plural rules: `docs/LOCALIZATION.md`, "Formatting and plurals".

## Notes

Keep this README updated when responsibilities or structure in this folder change.
