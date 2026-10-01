# ADR-015 Frontend Design-System Foundation: Semantic Status Tokens + Minimal Accessible Primitives

## Status

Accepted

## Context

`components.json` declares a full shadcn/ui scaffold, but `src/components/ui/` contains only
`button` and `select`; every other primitive (inputs, labels, dialogs, tables, badges, tabs)
is hand-rolled per feature in a bespoke glass/dark aesthetic. The 2026-07-11 audit traced
several defects to this: status colour has no single source of truth (only `--destructive` is
tokenized; danger/warning/success/info are re-invented per surface with stock Tailwind classes
in `ConfirmDialog`, route-scoped hex in `vendorRoute.css`, and Excel-pastel fills in the
committee tables), `select.tsx` hardcodes colours that bypass the token system, and only **two
known dialog surfaces** (`ConfirmDialog`, `ArchiveConfirmDialog`) use the one accessible dialog
primitive (`DialogShell`) — the exhaustive dialog render-site inventory, classified by
interaction contract (dialog vs loading overlay vs popover/menu, not by an overlay heuristic), is
produced in Phase 2c.

## Decision

Establish a minimal, bespoke-aesthetic design-system foundation rather than completing a full
shadcn migration:

1. **Semantic status tokens.** Reuse the **existing** `--destructive` / `--destructive-foreground`
   pair (defined in all three themes) as the canonical **danger** token — no rename, and no
   separate `danger` token is introduced (code continues to use `destructive`). Add
   `--success` / `--success-foreground`, `--warning` / `--warning-foreground`,
   `--info` / `--info-foreground` as HSL CSS variables across all three themes
   (default / dark / light), wired into Tailwind (`bg-success text-success-foreground`, …).
   **Contract:** every background/foreground pair must pass a WCAG AA contrast acceptance test
   (≥ 4.5:1 for text, ≥ 3:1 for graphical/UI) in each theme. All rival status palettes migrate
   to these tokens, including the Committee Excel-pastel pills (re-tuned to read red/amber/green
   in the dark theme).
2. **Minimal accessible primitives.** A shared `Field` wrapper that owns the control `id` and
   wires the visible `<label>` (`htmlFor` / `aria-labelledby`), `aria-describedby` (help + error
   text), `aria-invalid`, and `aria-required`. `Label` / `Input` primitives styled to the
   current aesthetic. `ThemedSelect` is **extended** to accept `id` / `aria-labelledby` /
   `aria-describedby` / `aria-invalid` / `aria-required`, and must **prefer an associated visible
   label over its fallback `aria-label`** — today's `aria-label={triggerAriaLabel ?? placeholder}`
   (`ThemedSelect.tsx:89`) would otherwise override a real visible label. `select.tsx` migrated
   to consume tokens; all **dialog / alert-dialog** surfaces standardized on `DialogShell`, which
   is **extended** with `role?: "dialog" | "alertdialog"` (today it hardcodes `role="dialog"` at
   `DialogShell.tsx:176`), with initial-focus behaviour tested per role so confirmation dialogs
   get `alertdialog` semantics. Loading overlays (`aria-busy`) and popovers/menus keep their own
   ARIA and are **not** migrated to `DialogShell`.

Workbook fidelity is preserved where it is regulatory: canonical register values remain
unchanged in storage, transport, import, and regulatory export. Ordinary UI labels follow the
user's active locale, and Excel's conditional-formatting fill colours are not preserved.

## Alternatives Rejected

- **Complete the shadcn migration** (generate Input/Label/Dialog/Table/Badge/Tabs and adopt
  them): rejected — a large migration that must be re-skinned to the glass/dark theme and risks
  fighting existing bespoke CSS.
- **Patch each hand-rolled helper/modal in place, no shared primitive:** rejected — leaves
  per-file duplication and no single source for the ADR-013 a11y gate to enforce.
- **Introduce a new `danger` token / rename `destructive`:** rejected — needless churn across
  existing `--destructive` consumers; reuse it as canonical danger instead.
- **Keep stock Tailwind status colours, documented:** rejected — no theme-awareness and no
  single knob to retheme; status colour is the register's primary visual language.

## Consequences

- Status colour is retheme-able from one place, consistent light/dark, and contrast-tested.
- The `Field` primitive is the enforcement point that makes the ADR-013 jsx-a11y gate pass for
  forms; because it also drives `ThemedSelect`'s ARIA, the repeated-"Not set"-name defect (many
  selects sharing one accessible name) is fixed structurally.

## Rollback Strategy

Individual primitives can be replaced by shadcn equivalents later without re-litigating the
token layer; abandoning semantic tokens requires superseding this ADR.

## Addendum 1 — Severity Scale, Tokens and UI-Contract Defaults (2026-10-01)

### Status

Accepted (2026-10-01). Records the binding design decisions D1, D3, D4, D5, D6 (as amended
2026-10-01) and D14 of the
[frontend UI consistency audit](../audits/2026-09-30-frontend-ui-consistency-audit.md) (§3, §4),
the product-owner default for the vendor tier band (audit §3.1), and the reversal of FR-P1-8.
Per the audit's ordering rule O2, no palette, severity or text-colour codemod may land before
this addendum.

### Context

The 2026-09-30 audit found that Decision 1 above ("all rival status palettes migrate to these
tokens") has not happened in code: raw Tailwind status colours still outnumber the semantic
tokens (danger 382 vs 232, warning 301 vs 162, success 163 vs 146, info 70 vs 46; audit DS-06).
Six live severity maps disagree (a "medium" risk is blue in the register and amber on the
dashboard; issue "high" is red in lists and orange in charts), one modal hard-codes its score
thresholds, and chart and committee colours live in hex tables (audit PG-01, PG-02). The
remediation spec row S5 had been marked "resolved"; it is now "partially resolved"
([spec §5](../dora-ict-register/FRONTEND-UX-REMEDIATION-SPEC.md)). Decision 1 also defined
only a 3-step RAG scale, which cannot express the four risk-score bands that
[ADR-008](./ADR-008-risk-threshold-ssot.md) configures. This addendum fixes the vocabulary
before the codemods start, so they have one target.

### Decision

1. **One 4-step severity scale (D1).** Every low / medium / high / critical surface (risk
   score bands, issue severity, KRI RAG where applicable, heatmaps, charts) uses:
   low = `success` (green), medium = `warning` (amber), high = a new orange `severity-high`
   token family (`--severity-high`, `--severity-high-foreground`, `--severity-high-text`,
   declared in all three themes and contrast-tested like the Decision 1 tokens), critical =
   `destructive` (red).
   - **Blue (`info` / `accent`) never encodes severity.** `info` stays a status tone only.
   - **Single source of truth:** one module, `frontend/src/lib/severity.ts`, extending
     `frontend/src/lib/riskScoreTheme.ts` and absorbing `useStatusTheme`. It owns the band
     type, the per-surface recipes (badge, fill, matrix cell, card, text, chart colour) and
     the issue-severity → band map. No other module maps a severity band to a colour.
   - **Thresholds** always come from the configurable Risk Hub settings through
     `useRiskThresholds()` ([ADR-008](./ADR-008-risk-threshold-ssot.md)); no literal score
     cut-offs outside the severity module.
   - Every severity surface also renders a text label or legend; colour is never the only
     carrier of the band.
2. **`CriticalityClassPill` keeps 3 steps on the same tokens (D1).** DORA criticality is a
   different semantic from risk severity, so the workbook bands keep their 3-step collapse,
   sourced from the D1 tokens: Nízká / low → `success`; Střední / medium and Vysoká / high →
   `warning`; Kritická / critical → `destructive`. The label text carries the exact band.
   Vendor tier (TierDod): critical → `destructive`, significant → `warning`,
   **standard → neutral** (`muted` / `muted-foreground`; product-owner default, audit §3.1).
   Workbook labels stay verbatim; only their colours map onto tokens.
3. **`tint` token family (D3).** White-alpha utilities (`bg-white/N`, `border-white/N`,
   `divide-white/N` and their state variants) move to a theme-aware `--tint` base used with
   the same opacity steps (`bg-tint/N`): white in the two dark themes (so they stay
   pixel-identical) and navy in light. Card edges use `border-border`.
4. **Primary CTA (D4).** `Button` gains an `accent` variant
   (`bg-accent text-accent-foreground`), which is **the** primary call to action. The
   existing `default` variant remains only as a deprecated alias. The `.btn-primary` and
   `.btn-secondary` CSS classes are deleted (the latter was referenced but never defined).
5. **Surfaces (D5).** `glass` / `glass-card` is the canonical, theme-aware card surface; ad hoc
   `bg-card` is dropped. All dialogs render on `DialogShell`'s themed surface (popover tokens);
   hard-coded dark dialog surfaces are not allowed. A dialog's surface change and its inner
   text change ship in the same change set, so no dialog is ever half-migrated.
6. **Typography (D6, amended 2026-10-01).** The minimum font size is 11px, allowed only for
   (a) uppercase eyebrow labels through one `text-eyebrow` utility (11px, weight 600,
   `tracking-wide`, `text-muted-foreground`) and (b) the compact `Badge size="sm"`. Nothing is
   smaller anywhere; body and table text is at least 12px; no `font-black` in app UI;
   `font-heading` is either defined in the Tailwind theme or removed.
7. **Radius, theming mechanism and text levels (D14).**
   - Controls (`Button`, `Input`, `Select`, `Textarea`) use a 12px radius, expressed as
     `rounded-lg` (`--radius-lg` = 0.75rem); `--radius-xl` is not retuned. Bare `rounded`
     maps to 8px (`--radius-sm`).
   - No Tailwind `dark:` variant: themes switch only through the token blocks (`:root` /
     `.theme-riskhub`, `.theme-dark`, `.theme-light`), and the `darkMode` setting is removed.
   - Two text-emphasis levels: `text-foreground` and `text-muted-foreground`. A third level,
     `text-subtle`, is introduced for timestamps and IDs **only if** it measures at least 4.5:1
     in all three themes; otherwise it is not added. Status text uses the paired `*-text` /
     `destructive` tokens, and text on a fill uses that fill's `*-foreground`.
8. **Chart tokens: FR-P1-8 is reversed.** FR-P1-8 deleted the dead `--chart-1..5` variables.
   Charts now get a categorical `--chart-1…8` token family, declared per theme and wired into
   Tailwind as `chart.1…8`, replacing the hex tables in `useChartTheme`. Canvas, SVG and
   Recharts read tokens through one helper (`frontend/src/lib/cssTokens.ts`) that re-reads on
   theme change. Severity-coded series use the D1 severity tokens, never the categorical
   chart tokens; the committee heatmap gets its own sequential `--heat-*` scale.

### Alternatives Rejected

- **Keep the 3-step RAG scale for risk scores:** rejected — ADR-008 configures four bands, and
  collapsing "high" into amber or red loses information users rely on.
- **Use blue for "medium" (the current `riskScoreTheme` choice):** rejected — blue is the link
  and info colour; using it for severity makes the scale non-monotonic.
- **Map vendor tier "standard" to `success` (green):** rejected by the product-owner default
  (audit §3.1) — "standard" is not a positive outcome, and green would read as "safe".
- **Keep the chart hex tables and the FR-P1-8 removal:** rejected — 102 hex literals do not
  follow the theme and cannot be contrast-tested.
- **Generate a third-party component set to enforce the contract:** rejected for the reasons
  recorded above (the shadcn migration); the primitives stay bespoke and token-driven.

### Migration Impact

Phase 1 of the audit roadmap adds the tokens (`severity-high`, `tint`, `chart-*`, `heat-*`), the
Tailwind keys, `lib/severity.ts` and the `Button` `accent` variant; Phases 2–3 migrate
consumers by codemod and module. Changing the "medium" band from blue to amber changes every
register badge, so screenshot baselines are refreshed with that change. Dark-theme rendering of
white-alpha utilities stays pixel-identical under `tint`.

### Rollback Strategy

Rollback of this addendum removes this text and reverts any token additions made under it; the
Decision 1 tokens and Decision 2 primitives above are unaffected. Reverting the severity scale
after the codemods have run requires a superseding ADR.

### Invariant Tests

- `tests/frontend/unit/src/design-system/statusTokenContrast.test.ts` — existing token pair
  contrast acceptance; extended to every token family this addendum adds, in all three themes.
- `tests/frontend/unit/src/design-system/cssVarsDeclared.test.ts` — every `var(--x)` used in
  `frontend/src` is declared (audit DS-18).
- Planned with the Phase 1–2 work: `severityConsistency.test.ts` (every adapter maps each band
  to the same token family) and the UI-consistency ratchet script with its committed baseline,
  whose `raw-palette` count reaching 0 closes spec row S5.
