# frontend/scripts/a11y

Node scripts that maintain the frontend `jsx-a11y` accessibility lint ratchet.
They capture the accepted baseline (`jsx-a11y-baseline.*`, `baseline-anchor.json`),
generate the per-rule deviation snapshot (`generate-jsx-a11y-deviations.mjs` →
`jsx-a11y-deviations.json`), and enforce the fail-closed ratchet in CI
(`jsx-a11y-ratchet.mjs`) so accessibility debt can only decrease.
