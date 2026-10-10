# frontend/src/components/documentation

## Purpose

UI components for `documentation` area.
This folder owns markdown rendering and reader presentation helpers for in-app manuals/runbooks.

## Contents

- `__tests__/`
- `contentFormatting.ts`
- `documentationPresentation.ts`
- `DocumentationLibrary.tsx`
- `DocumentationMarkdown.tsx`
- `index.ts`
- `useDocumentationLibrary.ts`

## Notes

`DocumentationLibrary` (card grid + tag filter) and `DocumentationReader` (meta chips + scrolling
manual) with the `useDocumentationLibrary` state hook are the one documentation library shared by
`pages/DocumentationPage.tsx` and `components/settings/DocumentationSettings.tsx` (SM-10); the callers
supply only their chrome, query key and `testIdPrefix`. Manuals are typeset with
`DOCUMENTATION_PROSE_CLASS` (theme tokens, DS-32), and anchor / new-tab names are translated
(`common:documentation.*`, GAP-D-23).

User-audience documents should read like task manuals. Keep maintainer-only metadata display rules in `documentationPresentation.ts` so settings-embedded docs and the full documentation page stay consistent.
