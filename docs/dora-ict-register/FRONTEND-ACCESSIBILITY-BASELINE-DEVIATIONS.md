# Frontend Accessibility Baseline — Deviation Registry

Back to folder: [`README.md`](./README.md) · Tree: [`../DOCUMENTATION_TREE.md`](../DOCUMENTATION_TREE.md)

## What this is

The frontend lint gate runs `eslint-plugin-jsx-a11y` (every recommended rule pinned
to `error`, ADR-013 / FR-P1-4) and holds the still-broken application against a
**committed, fingerprinted baseline** so that *new* violations fail while the baseline
can only shrink. Commit 5a remediated **every jsx-a11y violation in the files this DORA
UX workstream changed** (75 findings across the changed-file audit scope) and
regenerated the baseline once (**221 → 146**).

The **146 remaining entries are pre-existing, app-wide accessibility debt that lives
outside the DORA changed-file audit scope.** They are now enumerated 1:1 in a machine-
checked deviation registry so nothing is silently tolerated: each residual baseline entry
carries an explicit, honest record of its user impact, rationale, owner, tracking label,
and review-by date.

### Machinery

| File | Role |
| --- | --- |
| `frontend/scripts/a11y/jsx-a11y-baseline.json` | Fingerprinted baseline (`rule\|file\|line\|column`), 146 entries. Regenerated only by `--write`. |
| `frontend/scripts/a11y/jsx-a11y-deviations.json` | Deviation registry — one record per baseline entry, keyed by the same fingerprint. |
| `frontend/scripts/a11y/generate-jsx-a11y-deviations.mjs` | Reproducible generator: reads the baseline, emits the registry 1:1. Re-run after any baseline `--write`. |
| `frontend/scripts/a11y/jsx-a11y-baseline.mjs` | The gate (`npm run lint:a11y`). Enforces: exact baseline match, base-ref shrink-only ratchet, **and** the deviation 1:1 mapping (active once the registry file exists). |

The deviation validator fails the gate if any baseline entry has no record, any record
has no matching baseline entry, or any fingerprint carries more than one record — so the
registry can never drift from the baseline.

## Residual, grouped by rule (146 total, ~48 files)

| Rule | Count | Honest user impact |
| --- | ---: | --- |
| `jsx-a11y/label-has-for` | 110 | Deprecated rule requiring a `<label>` to **both** wrap and reference its control. Many residual sites do associate the field via `htmlFor`/`aria` (so the control is named for assistive tech) but are not nested; where no association exists the field may lack a reliable name. |
| `jsx-a11y/control-has-associated-label` | 26 | An interactive control has no programmatic text label, so screen-reader users may encounter an unnamed control. |
| `jsx-a11y/click-events-have-key-events` | 4 | A click handler on a non-interactive element has no keyboard equivalent, so keyboard-only users cannot trigger the action. |
| `jsx-a11y/no-static-element-interactions` | 4 | A static element carries interaction handlers without an interactive role, so assistive tech does not expose it as actionable. |
| `jsx-a11y/label-has-associated-control` | 1 | A `<label>` has no associated form control, so its text is not exposed as a field name. |
| `jsx-a11y/no-autofocus` | 1 | `autoFocus` moves focus on mount, which can disorient screen-reader and keyboard users by skipping surrounding context. |

The largest concentrations are the multi-step entity forms (risk / control / vendor / KRI
form steps), `AuditTrailPage.tsx` (12), and several table/filter presentation modules — all
pre-existing and untouched by the DORA changed-file scope.

## Shared rationale, ownership, and review

Every record carries:

- **`reason`** — `Pre-existing <rule> — pre-existing app-wide a11y debt outside the DORA
  changed-file audit scope; held by the fingerprinted jsx-a11y baseline and tracked for
  systematic remediation.`
- **`tracking`** — `accessibility-baseline-debt` (a PM-owned remediation epic carries this
  label; it is the single backlog handle for the whole residual).
- **`owner`** — `frontend-platform` (placeholder team pending per-area assignment via the
  tracking epic).
- **`reviewBy`** — `2027-01-12` (~2 quarters out from the 2026-07 audit).

## How to claim (remediate) one

1. Fix the source: give the control a real associated label (`htmlFor` + `id`, or nest the
   control inside the `<label>`, or an `aria-label`/`aria-labelledby`), add the missing
   keyboard handler + role, or remove the offending `autoFocus`. Localize any new visible
   or `aria-*` text (EN + CS).
2. Regenerate the baseline **once**: `npm run lint:a11y:write` (from `frontend/`). It shrinks
   by the entries you fixed.
3. Regenerate the registry: `node scripts/a11y/generate-jsx-a11y-deviations.mjs`. It drops the
   same entries, staying provably 1:1.
4. Verify green: `npm run lint` (eslint + the a11y gate) and `npm run build` / `npm run test:run`.

The baseline is **shrink-only**: the gate rejects any regeneration that would widen a
`(file, rule)` count relative to the base ref, so claimed entries can never silently return.

## Provenance

- Introduced by commit 5a (DORA frontend a11y remediation). Changed-file jsx-a11y scope: **0
  remaining** (fully fixed). Residual: **146**, all pre-existing.
- Companion: [`FRONTEND-DIALOG-INTERACTION-INVENTORY.md`](./FRONTEND-DIALOG-INTERACTION-INVENTORY.md)
  (the per-surface dialog contract matrix, whose 13 accessible-name gaps were also closed in 5a).
