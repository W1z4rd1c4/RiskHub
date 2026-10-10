# frontend/src/components/riskhub

## Purpose

The Risk Hub admin panels rendered by `pages/RiskHubPage.tsx` (one tab each):
risk types, system settings, approval scenarios, roles, departments and the
questionnaire batch send.

## Contents

- `ApprovalScenariosPanel.tsx` — approval scenario list and the configure
  dialog (`Switch` + approver-role `MultiSelect` in `Field`s, fixed-policy card).
- `DepartmentsPanel.tsx` — department list, create/edit dialog and archive
  confirmation.
- `index.ts` — panel exports for the page.
- `panelPrimitives.tsx` — module-local adapters over the shared primitives:
  `RiskHubModalFrame` / `RiskHubModalActions` (DialogShell v2 form dialog),
  `RiskHubFieldError` (server error as an `InlineMessage` inside the dialog) and
  `RiskHubShowArchivedToggle` (`Field` + `Checkbox`).
- `riskQuestionnairePanelState.ts` — filter, selection, load and batch-send
  hooks of the questionnaire panel.
- `RiskQuestionnairesPanel.tsx` — questionnaire batch send (labelled filters,
  selection table, `ConfirmDialog intent="send"`, outcome summary).
- `RiskTypesPanel.tsx` — risk type list, create/edit dialog and archive
  confirmation.
- `RolesPanel.tsx` — roles tab; the table, dialogs and data hook live in `roles/`.
- `SystemSettingsPanel.tsx` — global configuration rows on `Field` + `Input` /
  `Switch`, "Save {name}" buttons and success toasts.
- `useRiskHubCapabilities.ts` — Risk Hub capability query and flag helper.
- `useRiskHubConfigPanelState.ts` — modal / archive-confirmation / show-archived
  state shared by the list panels.
- `useRiskHubConfigResource.ts` — list query and create/update/archive/restore
  workflow shared by the list panels (success toasts, errors kept in the open
  dialog, restore through `useRestoreWithFeedback`).

## Notes

- Built only on `components/ui/**` primitives and tokens (audit 2026-09-30
  §5.5, module 3a): tables on `ui/table`, statuses on `Badge`, row actions on
  `RowActionButton` (an unavailable action stays visible with its
  `disabledReason`, GAP-B-03), every control inside `Field`, query regions on the
  `state.tsx` states.
- Archive is always `ConfirmDialog intent="archive"` (PM-1); the Risk Hub
  archive APIs take no reason, so no reason field is shown. An archive that is
  blocked by linked records is explained on the disabled row action instead of
  opening a confirmation that cannot confirm.
- Keep this README updated when responsibilities or structure in this folder change.
