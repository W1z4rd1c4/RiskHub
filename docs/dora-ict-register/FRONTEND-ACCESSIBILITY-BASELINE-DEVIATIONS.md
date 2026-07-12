# Frontend Accessibility Baseline — Deviation Registry

Back to folder: [`README.md`](./README.md) · Tree: [`../DOCUMENTATION_TREE.md`](../DOCUMENTATION_TREE.md)

## What this is

The frontend lint gate runs `eslint-plugin-jsx-a11y` (ADR-013 / FR-P1-4) and holds the
application against a **committed, fingerprinted baseline** so that *new* violations fail
while the baseline can only shrink. Each recommended rule keeps the severity the plugin
ships and only `warn` is upgraded to `error`; rules the plugin ships as `off` stay off (see
[Severity policy](#severity-policy-round-2-correction) below).

**The residual baseline is now empty (0 entries).** Every genuinely-`error` jsx-a11y
violation in the application has been remediated, and the deviation registry therefore holds
**0 records**. The machinery below stays armed: the moment any new jsx-a11y violation is
introduced, the gate fails.

### Machinery

| File | Role |
| --- | --- |
| `frontend/scripts/a11y/jsx-a11y-baseline.json` | Fingerprinted baseline (`rule\|file\|line\|column`). Currently **0 entries**. Regenerated only by `--write`. |
| `frontend/scripts/a11y/jsx-a11y-deviations.json` | Deviation registry — one record per baseline entry, keyed by the same fingerprint. Currently **0 records**. |
| `frontend/scripts/a11y/generate-jsx-a11y-deviations.mjs` | Reproducible generator: reads the baseline, emits the registry 1:1. Re-run after any baseline `--write`. |
| `frontend/scripts/a11y/jsx-a11y-baseline.mjs` | The gate (`npm run lint:a11y`). Enforces: exact baseline match, base-ref shrink-only ratchet, **and** the deviation 1:1 mapping. |

The deviation validator fails the gate if any baseline entry has no record, any record has no
matching baseline entry, or any fingerprint carries more than one record — so the registry can
never drift from the baseline.

## Severity policy (Round-2 correction)

`eslint.config.js` derives the jsx-a11y rule block from
`jsxA11y.flatConfigs.recommended.rules`. The **correct** policy — and the one now in force — is
to **preserve each rule's shipped severity and upgrade only `warn` → `error`**. This is encoded
by the exported `promoteJsxA11yWarnToError` helper and guarded by
`tests/frontend/unit/src/a11y/eslintConfigJsxA11ySeverity.test.ts`.

A prior version instead force-promoted **every** recommended entry to `error`. That discarded
the two severities the plugin deliberately ships as `off`:

- `jsx-a11y/label-has-for` — **deprecated**, shipped `off`.
- `jsx-a11y/control-has-associated-label` — shipped `off` (with an options tuple).

Promoting those to `error` **manufactured** 136 baseline entries (110 `label-has-for` +
26 `control-has-associated-label`) that were never real violations the plugin intended to
report. The modern labeling rule `jsx-a11y/label-has-associated-control` ships `error` and
stays enabled, so honouring the plugin's `off` on the two deprecated/disabled rules loses **no**
real labeling coverage.

Correcting the config dropped all 136 manufactured entries. The 10 genuinely-`error` findings
that remained were then remediated individually (below), taking the baseline to **0**.

## Residual

**0 entries.** There are no tolerated jsx-a11y violations.

### Genuine findings remediated in Round-2

The 10 real (non-manufactured) findings that survived the severity correction were each fixed at
source rather than baselined:

| Rule(s) | Site | Fix |
| --- | --- | --- |
| `click-events-have-key-events` + `no-static-element-interactions` | `src/components/executions/ExecutionHistory.tsx` (execution disclosure header) | `role="button"`, `tabIndex={0}`, `aria-expanded`, and an Enter/Space `onKeyDown`. |
| `click-events-have-key-events` + `no-static-element-interactions` | `src/components/kris/KRIDetailOverviewTab.tsx` (linked-risk card) | `role="button"`, `tabIndex={0}`, and an Enter/Space `onKeyDown`. |
| `click-events-have-key-events` + `no-static-element-interactions` | `src/pages/controls/ControlDetailOverviewTab.tsx` (active linked-risk card) | `role="button"`, `tabIndex={0}`, and an Enter/Space `onKeyDown`. |
| `click-events-have-key-events` + `no-static-element-interactions` | `src/pages/controls/ControlDetailOverviewTab.tsx` (archived linked-risk card) | `role="button"`, `tabIndex={0}`, and an Enter/Space `onKeyDown`. |
| `label-has-associated-control` | `src/components/kri/KRIVendorSelector.tsx` (vendor checkbox) | `aria-label={vendor.name}` on the `<input>`, so its accessible name no longer depends on text nested beyond the rule's depth. |
| `no-autofocus` | `src/components/kri-form/KriDetailsStep.tsx` (metric-name field) | Removed the `autoFocus` (no evidence it was deliberate). |

For the four interactive-`<div>` sites the Enter/Space handler delegates to the element's own
click (`event.currentTarget.click()`), so keyboard and pointer activation share one code path.

## Tracking (for any future residual)

The baseline is currently empty, so there is nothing to track. If a future violation is ever
baselined rather than fixed, the generator stamps each record with a `tracking` value of
`accessibility-baseline-debt`. **That label is the intended single backlog handle for a11y
baseline debt; a remediation epic has not yet been created — epic creation is user-owned and
pending.** Do not treat the label or an epic as already existing.

## How to keep it at zero (and how to remediate a future entry)

1. Fix the source: give the control a real associated label (`htmlFor` + `id`, nest the control
   inside the `<label>`, or an `aria-label`/`aria-labelledby`), add the missing keyboard handler +
   role, or remove the offending `autoFocus`. Localize any new visible or `aria-*` text (EN + CS).
2. Regenerate the baseline **once**: `npm run lint:a11y:write` (from `frontend/`).
3. Regenerate the registry: `node scripts/a11y/generate-jsx-a11y-deviations.mjs`, so it stays
   provably 1:1 with the baseline.
4. Verify green: `npm run lint` (eslint + the a11y gate), `npm run build`, `npm run test:run`.

The baseline is **shrink-only**: the gate rejects any regeneration that would widen a
`(file, rule)` count relative to the base ref, so a fixed entry can never silently return.

## Provenance

- **Round-1** (commit 5a, DORA frontend a11y remediation): remediated the DORA changed-file
  jsx-a11y scope (0 remaining there) and regenerated the baseline **221 → 146**. The 146
  residual was reported as pre-existing app-wide debt.
- **Round-2 (this commit)**: corrected the severity over-promotion in `eslint.config.js`
  (`off` rules were being forced to `error`), which removed **136 manufactured** entries, then
  remediated the **10 genuine** residual findings at source. Baseline **146 → 0**. Round-1's
  aria-hidden / label-association source fixes are retained (still valid a11y even though
  `label-has-for` and `control-has-associated-label` are now correctly `off`).
- Companion: [`FRONTEND-DIALOG-INTERACTION-INVENTORY.md`](./FRONTEND-DIALOG-INTERACTION-INVENTORY.md)
  (the per-surface dialog contract matrix, whose 13 accessible-name gaps were closed in Round-1).
