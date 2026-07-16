# frontend/src/components/ict-register

Presentational components specific to the DORA ICT register: `CriticalityClassPill`
renders an entity's criticality classification as a status pill, and
`RegisterExportLink` renders the register export (download) action.

`RegisterListShell` and `RegisterListToolbar` are the canonical shared list seam
for Process, Asset, Threat, Vendor, Risk, Control, KRI, and Issue. They own the
layout and interaction rhythm, including the table/grouping branch, loading,
empty, error and access-denied states, pagination, capability-gated page actions,
and export-dialog lifecycle. Entity pages supply declarative views and filters,
columns, rows, and domain callbacks; they must not recreate shell orchestration.

URL parsing/serialization lives in `frontend/src/pages/shared/registerListQuery.ts`
and reusable async collection state in
`frontend/src/pages/shared/collectionPageState.ts`. Entity `*RegisterConfig.ts`
modules map that shared state to normalized backend list/export parameters.
Current-view export uses those parameters without list pagination. Historical
Risk, Control, KRI, and Issue snapshots remain separate reporting operations.

The complete boundary, eight-register map, invariants, and verification evidence
are documented in `docs/dora-ict-register/SHARED-REGISTER-CONTRACT.md`.
