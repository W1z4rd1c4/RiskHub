# tests/frontend/e2e/approval-workflows

## Purpose

Playwright E2E suite for `approval-workflows`.

## Contents

- `self-approval.spec.ts`
- `status-flow.spec.ts`
- `tiered-approval.spec.ts`
- `governed-process-edit.spec.ts` — ADR-016 protected CIF Process submission,
  immutable pending truth/diff/edit lock, requester cancellation, composite
  Process/primary-Asset/downstream-Vendor impact, and a stateful zero-tolerance
  accessibility scan.
- `governed-process-create.spec.ts` — protected CIF creation remains outside
  the operational register, projects only to requester/approver pending work,
  enforces no-self/cancellation, activates only after independent approval,
  governs archive while keeping restore direct, excludes pending creation from
  operational list/export surfaces, and passes a stateful accessibility scan.
- `governed-process-relationships.spec.ts` — protected Risk, Asset, and Vendor
  relationship add/remove (plus Asset primary-link update) preserve approved
  truth until an eligible CRO approves each immutable proposal.
- `governed-asset.spec.ts` — protected Asset accountability reassignment,
  rowless creation, immutable edit, and archive apply only after independent
  approval; an Asset-only protected Process link exposes composite Asset
  impact before apply, with a zero-tolerance accessibility scan.
- `governed-vendor.spec.ts` — protected Vendor accountability covers both
  rejection and independent approval, archive requests preserve approved truth
  until resolution, and restore stays direct.
- `governed-vendor-links.spec.ts` — the 5-step governed Vendor link journey:
  a protected Vendor Risk link submits with a reason, queues as 202 (never
  success), leaves pre-approval truth unchanged, and applies in API and UI
  only after independent approval.
- `governed-notification-preferences.spec.ts` — governed delivery preferences
  suppress notifications without changing Pending Queue, My Requests, or
  History truth.

The ordinary `register-links.spec.ts` pair uses `E2E-PROC-004`, whose derived
CIF is No, to pin the complementary direct path: its confirmation dialog has
no request-reason field and the link mutates without entering the queue.

## Notes

Keep this README updated when responsibilities or structure in this folder change.
This bundle now includes a deterministic row-action contract check:
primary-approver pending rows must expose `Approve` and hide `Reject`.
