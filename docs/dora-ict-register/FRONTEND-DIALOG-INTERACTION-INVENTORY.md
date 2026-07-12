# Frontend Dialog Interaction Inventory (FR-P2c-1)

Back to folder index: [`docs/dora-ict-register/README.md`](./README.md) ·
Back to tree: [`docs/DOCUMENTATION_TREE.md`](../DOCUMENTATION_TREE.md)

## Purpose

Every overlay render site in the frontend, classified by its **interaction
contract** (not by filename). This is the missing inventory artifact for the
DialogShell migration (ADR-013/014/015, spec N10/N14/N15): it records, per
surface, which accessible primitive it adopted, where its accessible name comes
from, where initial focus lands, how Escape and focus-restoration behave, the
test that verifies it, and its remediation disposition.

The per-surface interaction proof lives in
`tests/frontend/unit/src/components/dialogInteractionMatrix.test.tsx`; the shared
primitive proof lives in `tests/frontend/unit/src/components/DialogShell.test.tsx`.

## Discovery method

Population was enumerated with:

```
rg -n 'DialogShell|createPortal|SelectPrimitive.Portal|role="dialog"|role="alertdialog"|fixed inset-0|AnimatePresence' frontend/src
```

then classified by interaction contract. `DialogShell.tsx:20` exposes
`role?: 'dialog' | 'alertdialog'` (default `'dialog'`); every true modal surface
is migrated onto it. The `SelectPrimitive.Portal` term catches the Radix
`ui/select.tsx` listbox overlay — a non-dialog N14 popover/listbox class (see the
non-dialog overlay table), not a modal surface.

## Shared contract (all DialogShell surfaces)

These columns are near-constant and are guaranteed by the primitive, so the
per-row tables record only the surface-specific wiring:

- **Adopted primitive** — `DialogShell` (`frontend/src/components/DialogShell.tsx`).
- **Escape** — `DialogShell.tsx:102` `handleKeyDown` intercepts `Escape` and
  calls the surface's `onClose` (only when the surface holds focus, so stacked
  dialogs peel off one at a time).
- **Restoration target** — the **opener**: `DialogShell.tsx:150-168` captures
  `document.activeElement` on open and refocuses it on close.
- **Focus trap** — `DialogShell.tsx:102-148` traps Tab / Shift-Tab inside the
  surface.
- **Initial focus** — explicit `initialFocusRef` when provided; else for
  `role="dialog"` the first focusable element, and for `role="alertdialog"`
  (no ref) the dialog container itself (`DialogShell.tsx:66-95`), so the
  labelled + described alert is announced instead of a destructive control.

## Summary

| Classification | Count | Verified (matrix green) | Verified via existing test | Needs name fix (C5a) |
|---|---:|---:|---:|---:|
| DialogShell — `dialog` | 20 | 20 | 0 | 0 |
| DialogShell — `alertdialog` | 6 | 6 | 0 | 0 |
| **DialogShell total** | **26** | **26** | **0** | **0** |
| Non-dialog overlays | 5 | 1 (status overlay) | — | — (out of scope: not modal dialogs) |

**All 26 DialogShell surfaces are now mounted OPEN in the matrix** and pass the
full seven-point contract plus the pinned-tag (`wcag2a/2aa/21a/21aa/22aa`)
open-state axe sweep. The matrix carries **zero `.skip` cases**:

- The 13 former "needs name fix (C5a)" surfaces were un-skipped once their
  accessible-name fixes (icon-only-control `aria-label`s / programmatic `<label>`
  associations) landed; each retains a `C5a — accessible-name fixed` annotation
  in the matrix citing the control that was remediated.
- The 5 former "verified via existing test" surfaces (`LinkManagementDialog`,
  `ADUserPicker`, `ControlCreateDialog`, and the `DepartmentsPanel` /
  `RiskTypesPanel` delete confirms) were mounted REAL and OPEN in the matrix in
  R4 — two of them (`ADUserPicker`, `ControlCreateDialog`) had been stubbed
  `() => null` in the delegated tests, so the prior "verified via existing test"
  claim was hollow. Their network lookups now run against deterministic MSW
  handlers, gated on a loaded-state sentinel before the contract assertions.

Disposition legend:

- **verified** — mounted OPEN in the matrix; full seven-point contract + axe pass.
  This is now the disposition of **every** DialogShell surface.
- **verified via existing test** / **needs name fix (C5a)** — *retired* (0 rows):
  every surface that once carried these dispositions is now matrix-mounted and
  `verified`. The labels are kept in the row tables only as historical provenance
  of what was remediated (a C5a name fix, or an R4 real mount).

## DialogShell — `dialog` surfaces (20)

| Render site (`file:line`) | Accessible-name source | Initial focus | Escape → | Verification test | Disposition |
|---|---|---|---|---|---|
| `reports/ExportDialog.tsx:55` | `<h3 id>` `export.title` / `title` prop (`:70`) | first focusable | `onClose` | matrix `ExportDialog` | verified (C5a name fix landed: close btn `:76`, date input `:91`) |
| `riskhub/roles/RoleModal.tsx:95` | `<h2 id>` new/edit title (`:102`) | first focusable | `onClose` | matrix `RoleModal` | verified |
| `kri/KRIModal.tsx:29` | `<div id>` wrapping `KriModalHeader` `<h3>` (`:36`) | first focusable | `onClose` | matrix `KRIModal` | verified (C5a name fix landed: header close `KriModalHeader.tsx:31`) |
| `LinkManagementDialog.tsx:75` | `<h2 id>` `getLinkDialogTitle` (`:89`) | first focusable | `onClose` | matrix `LinkManagementDialog` (R4) | verified (R4 real mount; MSW `/departments` + `/lookups/risk-filters` + base `/controls`, gated on a loaded search result) |
| `dashboard/RiskDrilldownModal.tsx:80` | `<h3 id>` `risk_drilldown.title` (`:95`) | first focusable | `onClose` | matrix `RiskDrilldownModal` | verified (C5a name fix landed: close btn `:107`) |
| `executions/ExecutionLogModal.tsx:60` | `<h3 id>` `executions.log_execution` (`:71`) | first focusable | `onClose` | matrix `ExecutionLogModal` | verified (C5a name fix landed: close btn `:74`, form fields) |
| `issues/IssueQuickCreateModal.tsx:93` | `<h3 id>` `quick_create.title` (`:102`) | first focusable (close has `aria-label`) | `onClose` | matrix `IssueQuickCreateModal` | verified (C5a name fix landed: unassociated `<label>` `:132`) |
| `riskhub/panelPrimitives.tsx:16` (`RiskHubModalFrame`) | `<h2 id>` `title` prop (`:23`) | first focusable | `onClose` | matrix `RiskHubModalFrame (panelPrimitives)` | verified |
| `users/ADUserPicker.tsx:20` | `<h3 id>` `users.add_from_ad` (`:28`) | first focusable (close has `aria-label`) | `onClose` | matrix `ADUserPicker` (R4) | verified (R4 real mount; **was stubbed `() => null`** in `UsersPage.sso-cta.test.tsx`. No lookup on open; usable state = directory-search textbox) |
| `pages/admin-console/sections/audit/AuditDetailsModal.tsx:36` | `<h4 id>` `audit.details_modal.title` (`:44`) | first focusable | `onClose` | matrix `AuditDetailsModal` | verified |
| `RiskQuickViewModal.tsx:30` | `<h2 id>` `risk.name`/`risk.process` (`:49`) | first focusable | `onClose` | matrix `RiskQuickViewModal` | verified (C5a name fix landed: close btn `:55`) |
| `ControlCreateDialog.tsx:18` | `<h2 id>` `create_control` (`:32`) | first focusable | `onClose` | matrix `ControlCreateDialog` (R4) | verified (R4 real mount; **was stubbed `() => null`** in `riskDetailOverviewKriNavigation.test.tsx`. MSW `/departments` + base `/users/lookup`,`/risks`; gated on `control-form-lookups-ready`) |
| `access/AccessEditModal.tsx:101` | `<h2 id class="sr-only">` `access.modal.title` (`:114`) | first focusable | `onClose` | matrix `AccessEditModal` | verified (C5a name fix landed: header close `AccessEditModalSections.tsx:26`) |
| `governance/OrphanQuickViewModal.tsx:110` | `<h3 id>` `quick_view.title` (`:121`) | first focusable | `onClose` (`handleClose`) | matrix `OrphanQuickViewModal` | verified (C5a name fix landed: close btn `:128`) |
| `governance/ResolveOrphanModal.tsx:39` | `<h3 id>` resolve title (`:49`) | first focusable | `onClose` | matrix `ResolveOrphanModal` | verified (C5a name fix landed: close btn `:58`) |
| `kri/KRIHistoryEditModal.tsx:64` | `<h2 id>` `history_edit.request_correction` (`:78`) | first focusable | `onClose` | matrix `KRIHistoryEditModal` | verified (C5a name fix landed: close btn `:84`, form fields) |
| `kri/KRIValueModal.tsx:76` | `<h3 id>` `value_modal.title` (`:92`) | `initialFocusRef` → value input (`:81`,`:165`) | `onClose` (`handleClose`) | matrix `KRIValueModal` | verified (C5a name fix landed: close btn `:96`, inputs) |
| `pages/approvals/ApprovalResolutionDialog.tsx:32` | `<h3 id>` approve/reject title (`:42`) | first focusable | `onClose` | matrix `ApprovalResolutionDialog` | verified (C5a name fix landed: resolution textarea `:49`) |
| `pages/users/BreakGlassEnableDialog.tsx:37` | `<h3 id>` `break_glass_enable` (`:46`) | first focusable | `onClose` | matrix `BreakGlassEnableDialog` | verified |
| `risks/risk-questionnaire-detail/RiskQuestionnaireDetailContainer.tsx:59` | `<span id class="sr-only">` `questionnaire.title` (`:66`) | first focusable | `onClose` (`workflow.close`) | matrix `RiskQuestionnaireDetail` | verified (C5a name fix landed: header close in `RiskQuestionnaireDetailHeader`) |

## DialogShell — `alertdialog` surfaces (6)

| Render site (`file:line`) | Accessible-name source | Initial focus | Escape → | Verification test | Disposition |
|---|---|---|---|---|---|
| `ConfirmDialog.tsx:100` | `<h3 id>` `title` prop (`:110`) | `initialFocusRef` → confirm button / input (`:98`) | `onClose` (`handleClose`) | matrix `ConfirmDialog` + existing `DialogShell.test.tsx:216` | verified |
| `ArchiveConfirmDialog.tsx:73` | `<h3 id>` `archive_title` (`:85`) | `initialFocusRef` → reason textarea (`:71`) | `onClose` (`handleClose`) | matrix `ArchiveConfirmDialog` | verified |
| `riskhub/roles/RoleDeleteDialog.tsx:27` | `<h3 id>` `delete_role` (`:31`) | dialog container (alertdialog) | `onCancel` | matrix `RoleDeleteDialog` | verified |
| `kri-form/KriMismatchDialog.tsx:30` | `<h3 id>` `mismatch_dialog.title` (`:40`) | dialog container (alertdialog) | `onCancel` | matrix `KriMismatchDialog` | verified |
| `riskhub/DepartmentsPanel.tsx:317` (role `:321`) | `<h3 id>` `delete_department` (`:325`) | dialog container (alertdialog) | `onClose` (`panel.closeDelete`) | matrix `DepartmentsPanel delete confirm` (R4) | verified (R4 real mount; MSW `/riskhub/departments` + `/riskhub/capabilities`, opened via the row delete action) |
| `riskhub/RiskTypesPanel.tsx:314` (role `:318`) | `<h3 id>` `delete_risk_type` (`:322`) | dialog container (alertdialog) | `onClose` (`panel.closeDelete`) | matrix `RiskTypesPanel delete confirm` (R4) | verified (R4 real mount; MSW `/riskhub/risk-types` + `/riskhub/capabilities`, opened via the row delete action) |

## Non-dialog overlays (5) — deliberately NOT DialogShell

These use `fixed inset-0` / portal-ish markup but are **not** modal dialogs.
They must not expose a `dialog`/`alertdialog` role or trap/transfer focus.

| Render site (`file:line`) | Interaction classification | Primitive | Role / name | Focus behavior | Verification test | Disposition |
|---|---|---|---|---|---|---|
| `pages/ControlDetailPage.tsx:297` (overlay `:292-306`) | busy/loading overlay | raw `motion.div` (not DialogShell) | `role="status"` `aria-busy="true"`; visible text `controls:detail.fetching_risk_details` | no focus transfer; not focusable | matrix `ControlDetailPage loading overlay` (contract mirror; source-referenced) | verified (not-a-dialog contract) |
| `linking/LinkConfirmationPanel.tsx:29` | non-modal inline confirmation | in-flow panel (no portal / trap) | region heading; not a dialog | in-flow; no trap/restoration | existing linking tests | out of scope — non-modal (no DialogShell contract) |
| `dashboard/FilterBar.tsx:164` | popover (dismiss-on-outside) | anchored popover (non-modal) | not a dialog | non-modal; closes on outside click / Escape | existing dashboard tests | out of scope — non-modal popover |
| `layout/DesktopOnlyNotice.tsx:22` | responsive full-screen notice | viewport-gated `fixed inset-0` notice | informational; not a dialog | not interactive; no trap | n/a | out of scope — responsive gate, not a modal |
| `ui/select.tsx:81` (`SelectPrimitive.Portal` → `Content`) | N14 popover / listbox / menu class | Radix `@radix-ui/react-select` portal (non-modal) | `role="listbox"` (Radix-managed) with `role="option"` items; trigger is `role="combobox"` | Radix roving focus; closes on select / outside click / Escape; no focus trap or opener restoration | existing `ThemedSelect` tests | out of scope — N14 non-modal popover/listbox, not a DialogShell modal |

## C5a accessible-name worklist (13) — COMPLETE

All 13 cases below were remediated and **un-skipped**; each is now mounted OPEN
and `verified` in the matrix (see the "Disposition" column above), with a
`C5a — accessible-name fixed` annotation on its matrix case citing the control.
Fixes were icon-only-control `aria-label`s and programmatic `<label>`
associations only, batched so the jsdom a11y baseline regenerated once. Retained
here as the provenance record of what each fix targeted.

1. `reports/ExportDialog.tsx` — close button `:76`; date input `:91`
2. `kri/KRIModal.tsx` — header close `KriModalHeader.tsx:31`
3. `dashboard/RiskDrilldownModal.tsx` — close button `:107`
4. `executions/ExecutionLogModal.tsx` — close button `:74`; form fields
5. `issues/IssueQuickCreateModal.tsx` — unassociated `<label>` `:132`
6. `RiskQuickViewModal.tsx` — close button `:55`
7. `access/AccessEditModal.tsx` — header close `AccessEditModalSections.tsx:26`
8. `governance/OrphanQuickViewModal.tsx` — close button `:128`
9. `governance/ResolveOrphanModal.tsx` — close button `:58`
10. `kri/KRIHistoryEditModal.tsx` — close button `:84`; form fields
11. `kri/KRIValueModal.tsx` — close button `:96`; inputs
12. `pages/approvals/ApprovalResolutionDialog.tsx` — resolution textarea `:49`
13. `risks/risk-questionnaire-detail/RiskQuestionnaireDetailContainer.tsx` — header close in `RiskQuestionnaireDetailHeader`
