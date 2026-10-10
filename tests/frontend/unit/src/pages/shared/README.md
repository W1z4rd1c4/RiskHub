# tests/frontend/unit/src/pages/shared

## Purpose

Unit tests for shared page-state helpers used by collection pages.

## Contents

- `EntityFormChrome.test.tsx` - form section, error / lookup-failure messages and the Cancel + submit footer.
- `collectionPageState.test.ts` - lifecycle, stale request, 403 clearing, drilldown reset, export state, and capability preservation coverage.

## Notes

Add tests here when collection page behavior moves into shared helpers instead of individual page hooks.
