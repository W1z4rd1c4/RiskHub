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

Workbook fidelity is preserved where it is regulatory — the register data and the verbatim
Czech closed-list labels — not in Excel's conditional-formatting fill colours.

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
