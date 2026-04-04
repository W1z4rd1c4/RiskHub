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

Blocked by CI Ruff hard gate (`ruff check app`) and suppression budget gate (`python3 scripts/tools/suppression_budget.py`) against `backend/app/**`.

Production backend comment debt policy (`backend/app/**`):

1. Do not introduce `TODO`, `FIXME`, `HACK`, or `XXX` markers.
2. If deferred behavior must be documented, use an explicit explanatory comment
   that states current constraints and intended behavior without debt markers.
3. Link deferred work through tracked planning/docs artifacts instead of inline
   debt markers.
4. Suppression directives (`noqa`, `type: ignore`, `pylint: disable`) require an allowlist entry and must not increase the approved budget.

## Exception Lifecycle

Exceptions are defined in:

- `frontend/scripts/quality/debt-allowlist.json`
- `scripts/quality/backend-suppression-allowlist.json`

Each exception must include:

1. Rule id.
2. File path.
3. Line number (or range metadata if explicitly supported).
4. Owner (`team` or `person`) responsible for removal.
5. Linked issue id.
6. Expiration date in `YYYY-MM-DD`.
7. Brief reason.

Backend suppression allowlist entries must include:

1. File path.
2. Line number.
3. Match snippet for suppression directive.
4. Owner (`team` or `person`) responsible for removal.
5. Expiration date in `YYYY-MM-DD` (`expires_on`).
6. Brief reason.

## Expiration Policy

1. Expired exceptions fail `quality:debt`.
2. New exceptions without issue id or expiration date fail `quality:debt`.
3. Exception renewals require explicit review in PR.
4. Expired backend suppression entries fail `suppression_budget.py`.
5. New backend suppressions without allowlist match fail `suppression_budget.py`.
6. Total backend suppressions above allowlist `max_total` fail `suppression_budget.py`.

## CI Governance

1. Lint gates run in `.github/workflows/lint.yml`.
2. Security workflow must not contain contradictory lint gates with `continue-on-error`.
3. Lint failures are merge-blocking.

## Conservative Cleanup Policy

1. Only delete code classified as proven-unused.
2. Keep dormant but active-scope features documented.
3. Directory emulator remains retained unless product scope explicitly changes.
