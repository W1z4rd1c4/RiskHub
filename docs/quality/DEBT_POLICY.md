# Lint and Legacy Debt Policy

## Purpose

This policy defines what counts as code-quality debt in RiskHub and how exceptions are managed.

## Scope

- Frontend production source: `frontend/src/**`
- Backend lint scope: `backend/app/**` (hard gate), full backend tree (informational ratchet track)

## Debt Rules

### Frontend (`frontend/src/**`)

Blocked by `npm run quality:debt`:

1. Any `eslint-disable` comments.
2. Any `@ts-ignore` or `@ts-expect-error` comments.
3. Any `no-explicit-any` suppression comments.
4. Any explicit `any` type usage, except approved and time-boxed allowlist entries.
5. Any production comment debt markers (`TODO`, `FIXME`, `HACK`, `XXX`).

### Backend

Blocked by CI Ruff hard gate (`ruff check app`) and ratcheted over time by reducing ignores/excludes.

Production backend comment debt policy (`backend/app/**`):

1. Do not introduce `TODO`, `FIXME`, `HACK`, or `XXX` markers.
2. If deferred behavior must be documented, use an explicit explanatory comment
   that states current constraints and intended behavior without debt markers.
3. Link deferred work through tracked planning/docs artifacts instead of inline
   debt markers.

## Exception Lifecycle

Exceptions are defined in:

- `frontend/scripts/quality/debt-allowlist.json`

Each exception must include:

1. Rule id.
2. File path.
3. Line number (or range metadata if explicitly supported).
4. Owner (`team` or `person`) responsible for removal.
5. Linked issue id.
6. Expiration date in `YYYY-MM-DD`.
7. Brief reason.

## Expiration Policy

1. Expired exceptions fail `quality:debt`.
2. New exceptions without issue id or expiration date fail `quality:debt`.
3. Exception renewals require explicit review in PR.

## CI Governance

1. Lint gates run in `.github/workflows/lint.yml`.
2. Security workflow must not contain contradictory lint gates with `continue-on-error`.
3. Lint failures are merge-blocking.

## Conservative Cleanup Policy

1. Only delete code classified as proven-unused.
2. Keep dormant but active-scope features documented.
3. Directory emulator remains retained unless product scope explicitly changes.
