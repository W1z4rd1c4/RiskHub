# docs/dora-ict-register

Back to tree: [`docs/DOCUMENTATION_TREE.md`](../DOCUMENTATION_TREE.md)

## Purpose

Design, specification, and remediation records for the **ICT Register** build (the DORA
ICT operational-resilience register). Domain vocabulary for this effort lives in the root
[`CONTEXT.md`](../../CONTEXT.md); these are the working captures, specs, and audit records
behind it.

## Contents

- [`dora-excel-functional-spec.md`](./dora-excel-functional-spec.md): Functional specification
  extracted from the authoritative DORA *"registr aktiv a dodavatelů"* workbook.
- [`dora-register-of-information-legal-spec.md`](./dora-register-of-information-legal-spec.md):
  Register of Information (RoI) legal/regulatory specification.
- [`dashboard-cro-tile-inventory.md`](./dashboard-cro-tile-inventory.md): Inventory of the
  workbook's Dashboard / CRO-overview tiles reproduced by the ICT Committee read-model.
- [`GRILLING-CAPTURE.md`](./GRILLING-CAPTURE.md): grill-with-docs capture of what the register
  build is and the destination decisions.
- [`cutover-record.md`](./cutover-record.md): Cutover record for retiring the workbook as the
  system of record.
- [`FRONTEND-UX-AUDIT-2026-07-11.md`](./FRONTEND-UX-AUDIT-2026-07-11.md): Frontend design/UX
  audit findings ledger (finding IDs, severities, `file:line`, target phases).
- [`FRONTEND-UX-REMEDIATION-CAPTURE.md`](./FRONTEND-UX-REMEDIATION-CAPTURE.md): grill-with-docs
  capture of the frontend design/UX remediation plan (15 locked decisions, phased execution).
- [`FRONTEND-UX-REMEDIATION-SPEC.md`](./FRONTEND-UX-REMEDIATION-SPEC.md): implementation- and
  ticket-ready specification formalizing the capture + ADRs (normative constraints, per-phase
  requirements with `FR-*` IDs, findings traceability, phase-dependency DAG for ticketing).
- [`UX-REMEDIATION-VERIFICATION-2026-07-11.md`](./UX-REMEDIATION-VERIFICATION-2026-07-11.md):
  Verification of a code review of the remediation docs against source and W3C primary sources.
- [`FRONTEND-DIALOG-INTERACTION-INVENTORY.md`](./FRONTEND-DIALOG-INTERACTION-INVENTORY.md): Per-surface
  inventory of every overlay render site (FR-P2c-1), classified by interaction contract, with the
  DialogShell accessible-name/focus/Escape/restoration wiring, verification test, and C5a disposition.
- [`FRONTEND-ACCESSIBILITY-BASELINE-DEVIATIONS.md`](./FRONTEND-ACCESSIBILITY-BASELINE-DEVIATIONS.md):
  The residual jsx-a11y baseline debt (146 entries) after commit 5a fixed all changed-file violations —
  grouped by rule with honest user-impact, the shared rationale/owner/tracking, and how to claim (fix)
  one. Backed by the machine-checked 1:1 deviation registry (`frontend/scripts/a11y/jsx-a11y-deviations.json`).
- [`FRONTEND-UX-MANUAL-AT-VERIFICATION-2026-07-12.md`](./FRONTEND-UX-MANUAL-AT-VERIFICATION-2026-07-12.md):
  Closeout record separating the **complete + enforced** automated gate (build/test/lint/i18n/authz,
  jsx-a11y baseline 146 with 1:1 deviations, axe empty + enforced for the DORA routes) from the
  **human-owned + pending** manual / assistive-technology pass, C6 (SC 1.4.4/1.4.10) reproduction,
  ultrareview, and merge decision. Records the #55–#70 process deviation honestly; no WCAG conformance claimed.

## Notes

- These are working/planning records for a specific build; some (captures, audits) are
  point-in-time and may be superseded by later remediation.
- Keep this README updated when records are added to this folder (required for docs-tree
  reachability).
