# tests/frontend/unit/src/i18n

## Purpose

Folder for `tests/frontend/unit/src/i18n` implementation assets.

## Contents

- `__tests__/`
- `hooks.spec.tsx`
- `useFormat.test.tsx` — `useFormat()` (dates, numbers, percent, currency,
  metric units, relative dates; `''` for null, invalid or impossible dates and
  `NaN`; calendar dates `YYYY-MM-DD` keep their day in every timezone) in en and
  cs, re-render on a language switch,
  Czech plural forms through `count()`, and `translateUiMessage()` for
  `errorKeys.*`, namespaced keys, caller-namespace keys and free text.

## Notes

Keep this README updated when responsibilities or structure in this folder change.
