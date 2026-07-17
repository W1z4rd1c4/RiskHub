# tests/frontend/e2e/approval-workflows

## Purpose

Playwright E2E suite for `approval-workflows`.

## Contents

- `self-approval.spec.ts`
- `status-flow.spec.ts`
- `tiered-approval.spec.ts`
- `governed-process-edit.spec.ts` — ADR-016 protected CIF Process submission,
  immutable pending truth/diff/edit lock, requester cancellation, and a
  stateful zero-tolerance accessibility scan.

## Notes

Keep this README updated when responsibilities or structure in this folder change.
This bundle now includes a deterministic row-action contract check:
primary-approver pending rows must expose `Approve` and hide `Reject`.
