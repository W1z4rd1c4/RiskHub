# frontend/scripts/a11y

Node scripts that enforce frontend accessibility contracts. The `jsx-a11y`
gate requires zero findings, an empty audit-evidence baseline, and an empty ESLint
suppression file. It has no capture, update, anchor, or deviation mechanism.
The dialog-inventory and Playwright-collection validators fail when source or CI
coverage drifts from their committed contracts.
