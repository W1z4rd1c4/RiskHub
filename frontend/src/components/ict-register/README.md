# frontend/src/components/ict-register

Presentational components specific to the DORA ICT register: `CriticalityClassPill`
renders an entity's criticality classification as a status pill, and
`RegisterExportLink` renders the register export (download) action.

`RegisterListShell` and `RegisterListToolbar` own the shared register-list layout
and interaction rhythm, including the table/grouping branch, list states,
pagination, and export-dialog lifecycle. Entity pages supply declarative views,
filter definitions, capability-gated actions, columns, rows, and callbacks.
