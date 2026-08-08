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
- [`VENDOR-REGISTER-QUERY-CONTRACT.md`](./VENDOR-REGISTER-QUERY-CONTRACT.md): Permission-scoped
  Vendor filters, multi-membership views, safe lookups, URL state, and standard export.
- [`SHARED-REGISTER-CONTRACT.md`](./SHARED-REGISTER-CONTRACT.md): Canonical frontend shell,
  normalized backend query/facet/export seams, invariants, and evidence map for all eight
  operational registers.
- [`REGISTER-LISTING-CONTRACTION-2026-07-16.md`](./REGISTER-LISTING-CONTRACTION-2026-07-16.md):
  #83 expand-contract decision, removed legacy paths, and regression locks.
- [`dashboard-cro-tile-inventory.md`](./dashboard-cro-tile-inventory.md): Inventory of the
  workbook's Dashboard / CRO-overview tiles reproduced by the ICT Committee read-model.
- [`GRILLING-CAPTURE.md`](./GRILLING-CAPTURE.md): grill-with-docs capture of what the register
  build is and the destination decisions.
- [`cutover-record.md`](./cutover-record.md): Cutover record for retiring the workbook as the
  system of record.
- [`cutover-manifest.json`](./cutover-manifest.json): Repository-trusted sizes and SHA-256
  digests for every executable/data input accepted by the one-time production importer.
- [`FRONTEND-UX-AUDIT-2026-07-11.md`](./FRONTEND-UX-AUDIT-2026-07-11.md): Frontend design/UX
  audit findings ledger (finding IDs, severities, `file:line`, target phases).
- [`FRONTEND-UX-REMEDIATION-CAPTURE.md`](./FRONTEND-UX-REMEDIATION-CAPTURE.md): grill-with-docs
  capture of the frontend design/UX remediation plan (15 locked decisions, phased execution).
- [`REGISTER-UX-CONSISTENCY-GRILLING-CAPTURE.md`](./REGISTER-UX-CONSISTENCY-GRILLING-CAPTURE.md):
  confirmed grill-with-docs capture for register filters, user-linked accountability,
  localization, list-page consistency, Department views, and governed mutations.
- [`REGISTER-UX-OWNERSHIP-APPROVAL-SPEC.md`](./REGISTER-UX-OWNERSHIP-APPROVAL-SPEC.md):
  implementation specification for register consistency, accountability, CISO stewardship,
  localization, approvals, notifications, verification, and bilingual documentation.
- Bilingual user manuals:
  [`docs/user/processes.md`](../user/processes.md),
  [`docs/user/assets.md`](../user/assets.md),
  [`docs/user/threats.md`](../user/threats.md),
  [`docs/user-cs/processes.md`](../user-cs/processes.md),
  [`docs/user-cs/assets.md`](../user-cs/assets.md), and
  [`docs/user-cs/threats.md`](../user-cs/threats.md).
- Bilingual admin runbooks:
  [`docs/admin/processes.md`](../admin/processes.md),
  [`docs/admin/assets.md`](../admin/assets.md),
  [`docs/admin/threats.md`](../admin/threats.md),
  [`docs/admin-cs/processes.md`](../admin-cs/processes.md),
  [`docs/admin-cs/assets.md`](../admin-cs/assets.md), and
  [`docs/admin-cs/threats.md`](../admin-cs/threats.md).
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
- [`RELEASE-HARDENING-RETROSPECTIVE-2026-08-08.md`](./RELEASE-HARDENING-RETROSPECTIVE-2026-08-08.md):
  Retrospective record (#108) of release-evidence commit `2425ecbe`'s true scope, the four
  expiring security acceptances with their release-acceptance owner, and the five refuted
  `eb7ca6f9` review findings recorded as checked-and-cleared.

## Notes

- These are working/planning records for a specific build; some (captures, audits) are
  point-in-time and may be superseded by later remediation.
- Keep this README updated when records are added to this folder (required for docs-tree
  reachability).
