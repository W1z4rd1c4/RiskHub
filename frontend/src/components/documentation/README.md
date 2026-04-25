# frontend/src/components/documentation

## Purpose

UI components for `documentation` area.
This folder owns markdown rendering and reader presentation helpers for in-app manuals/runbooks.

## Contents

- `__tests__/`
- `contentFormatting.ts`
- `documentationPresentation.ts`
- `DocumentationMarkdown.tsx`
- `index.ts`

## Notes

User-audience documents should read like task manuals. Keep maintainer-only metadata display rules in `documentationPresentation.ts` so settings-embedded docs and the full documentation page stay consistent.
