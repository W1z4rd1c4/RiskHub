# tests/frontend/unit/src/lib

## Purpose

Vitest coverage for shared frontend library helpers.

## Contents

- `capabilities.test.ts`
- `severity.test.ts`, `tones.test.ts`, `cssTokens.test.ts` - severity scale, tone recipes and runtime token reads
- `cn.test.ts` - `cn()` conflict resolution for the named token scales (shadow, z, duration, max-w, eyebrow)

## Notes

Use this directory for small shared helper contracts that are easier to verify outside a full page/component render.
