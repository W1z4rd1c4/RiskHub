# tests/frontend/e2e/approval-workflows

## Purpose

Playwright E2E suite for `approval-workflows`.

## Contents

- `self-approval.spec.ts`
- `status-flow.spec.ts`
- `tiered-approval.spec.ts`

## Notes

Keep this README updated when responsibilities or structure in this folder change.
This bundle now includes a deterministic row-action contract check:
primary-approver pending rows must expose `Approve` and hide `Reject`.
