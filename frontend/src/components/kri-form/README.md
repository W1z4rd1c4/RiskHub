# frontend/src/components/kri-form

KRI form decomposition modules owned by Phase 252.

This directory contains the typed state, selectors, submit logic, and presentational steps behind `KRIFormContainer`.

- `KriFormSteps.tsx` — the wizard chrome shared with the Risk and Control forms
  (PG-11): `KriFormStepIndicator` (`StepIndicator`), `KriFormFooter`
  (`WizardFooter`) and `KriFormErrorBanner` (form-level `InlineMessage`).
- `useKriDetailValidation.ts` — details-step validation with per-field errors
  (AX-04); the banner only carries risk-selection, lookup and server errors.
