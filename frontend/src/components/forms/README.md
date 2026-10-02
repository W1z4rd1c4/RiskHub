# Shared Form Components

Reusable form-adjacent UI components shared across domain pages.

## Contents

- `FormStepContext.tsx` — `createFormStepContext<T>(name)` builds a typed provider/hook pair for a
  wizard's shared state (the hook throws outside its provider), and `useFormStepNavigation` returns
  `nextStep` (validates the current step first), `prevStep` and `handleStepClick` for a step list.
  Consumed by the Control wizard (`components/control-form`).
- `entityFormWorkflow.ts` — `nextEntityFormStep` / `previousEntityFormStep`, the pure step arithmetic
  behind `useFormStepNavigation`.
- `README.md` — this inventory.

The form controls themselves (`Field`, `Input`, `Textarea`, `Checkbox`, `RadioGroup`, `Switch`,
`MultiSelect`, `NativeSelect`, `WizardFooter`, `StepIndicator`) live in `components/ui/`; see its README.

Queued-approval feedback is not a form concern: an approval-routed submit
returns to the entity page through `useApprovalQueued()` (`hooks/`), which
shows `components/approvals/ApprovalQueuedNotice` plus a success toast
(D12 / PM-2).

Do not place domain-specific workflow policy here. Backend capability metadata and domain service responses remain the source of truth for whether a form action is available.
