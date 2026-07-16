# docs/dora-ict-register

Back to tree: [`docs/DOCUMENTATION_TREE.md`](../DOCUMENTATION_TREE.md)

## Purpose

Design, specification, and remediation records for the **ICT Register** build (the DORA
ICT operational-resilience register). Domain vocabulary for this effort lives in the root
[`CONTEXT.md`](../../CONTEXT.md); these are the working captures, specs, and audit records
behind it.
- [`vendor-canonical-values.md`](./vendor-canonical-values.md): Canonical Vendor stored/API
  codes, workbook-boundary translation, localized UI labels, and regulatory export mapping.

## Contents

- [`dora-excel-functional-spec.md`](./dora-excel-functional-spec.md): Functional specification
  extracted from the authoritative DORA *"registr aktiv a dodavatelů"* workbook.
- [`dora-register-of-information-legal-spec.md`](./dora-register-of-information-legal-spec.md):
  Register of Information (RoI) legal/regulatory specification.
- [`PROCESS-REGISTER-QUERY-CONTRACT.md`](./PROCESS-REGISTER-QUERY-CONTRACT.md): Permission-scoped
  Process list, facet, grouping, lookup, and standard-export API contract.
- [`ASSET-REGISTER-QUERY-CONTRACT.md`](./ASSET-REGISTER-QUERY-CONTRACT.md): Permission-scoped
  Asset list, facet, grouping, lookup, and standard-export API contract.
- [`THREAT-REGISTER-QUERY-CONTRACT.md`](./THREAT-REGISTER-QUERY-CONTRACT.md): Global Threat
  collection plus permission-scoped linked-Risk facets, groups, lookups, and standard export.
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
- [`FRONTEND-DIALOG-INTERACTION-INVENTORY.md`](./FRONTEND-DIALOG-INTERACTION-INVENTORY.md):
  Explanation of the machine-readable two-level inventory (implementation owners + application
  render sites), source-drift validator, 29-case unit matrix, and 48-site browser contract.
- [`FRONTEND-UX-MANUAL-AT-VERIFICATION-2026-07-12.md`](./FRONTEND-UX-MANUAL-AT-VERIFICATION-2026-07-12.md):
  Closeout record separating the automated gate (build/test/lint/i18n/authz, direct strict-zero
  jsx-a11y + axe, validated dialog inventory and browser matrix) from the
  **human-owned + pending** manual / assistive-technology pass, C6 (SC 1.4.4/1.4.10) reproduction,
  ultrareview, and merge decision. Records the #55–#70 process deviation honestly; no WCAG conformance claimed.

## Notes

- These are working/planning records for a specific build; some (captures, audits) are
  point-in-time and may be superseded by later remediation.
- Keep this README updated when records are added to this folder (required for docs-tree
  reachability).
