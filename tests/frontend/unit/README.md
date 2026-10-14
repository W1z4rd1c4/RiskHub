# tests/frontend/unit

## Purpose

Folder for `tests/frontend/unit` implementation assets.

## Contents

- `src/`

## Notes

Keep this README updated when responsibilities or structure in this folder change.
The canonical Vitest config lives at `frontend/vitest.config.ts`; this folder stores tests and helpers only.

## Coverage denominator

`cd frontend && npm run test:coverage` measures all `src/**/*.{ts,tsx}` files,
including files no test imports. Runtime schemas, entrypoints and generated
runtime code remain included. Only declarations, test files, `__tests__` fixtures
and `src/test` support are excluded; CSS, static assets and the external E2E
harness are outside the TypeScript application-source denominator.

The existing floors remain statements 57%, branches 47%, functions 47% and lines
58%. No new coverage percentage has been assumed. CI uploads coverage JSON/HTML,
logs and an observed covered/total summary for the exact tested commit, including
failure evidence. A failed/incomplete run is not an accepted baseline. If the
broader denominator misses a floor, add behavioral tests or propose a separately
reviewed rollout; do not lower floors or exclude untested runtime code to turn
the gate green. Future ratchets must be based on successful CI measurements and
reviewed committed floors, never an unpersisted automatic CI update.
