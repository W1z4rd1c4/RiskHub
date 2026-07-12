# ICT Register — frontend design/UX remediation, grilling capture

_grill-with-docs session, 2026-07-11 (corrected against two code-review rounds, 2026-07-11/12).
Shared understanding reached across 15 decisions. The code is **not yet enacted** —
implementation is gated on explicit go-ahead. Domain vocabulary lives in the root
[CONTEXT.md](../../CONTEXT.md); app-wide architectural decisions are recorded as
[ADR-013](../adr/ADR-013-frontend-accessibility-standard.md),
[ADR-014](../adr/ADR-014-desktop-first-support.md), and
[ADR-015](../adr/ADR-015-frontend-design-system-foundation.md). The findings behind this plan
are enumerated in [FRONTEND-UX-AUDIT-2026-07-11.md](./FRONTEND-UX-AUDIT-2026-07-11.md); the two
reviews of these docs were verified against source and primary standards in
[UX-REMEDIATION-VERIFICATION-2026-07-11.md](./UX-REMEDIATION-VERIFICATION-2026-07-11.md)._

## Origin

A full design/UX audit of the DORA frontend (dora @ `db0826e0`) ran first — 7 explorer agents,
every critical finding re-verified against source. Headline: the feature is functionally
coherent and 100% i18n-clean, but the weak axis is **accessibility and state-feedback**,
systemically. One audit finding was corrected during grilling — register export is **not**
missing (it exists on `VendorReportsPage` / `download_vendor_dora_register`); the real gap is
only that the committee/DQ readiness screens don't link to it. Full, ID'd findings are in the
[audit ledger](./FRONTEND-UX-AUDIT-2026-07-11.md).

## Objective (locked)

**Fix everything the audit found — criticals, shared/main-worktree defects, and polish —
before `dora` merges**, subject to the dispositions in the ledger (some findings are
*accepted limitations* rather than "fixed"). This deliberately pulls app-wide work (design
tokens, accessible primitives, keyboard tables, IA restructure) into the pre-merge scope.

## Decisions (locked)

1. **Scope** — fix all findings pre-merge (incl. 🟢 polish and shared/`main` defects), each
   with an explicit ledger disposition (`resolved` / `accepted limitation` / `deferred`).
2. **Accessibility bar** — **WCAG 2.2 AA as the *target*** (the project upgrades its target
   from 2.1 to 2.2; both are active W3C standards, 2.2 is backward-compatible). **Not a
   present conformance claim** — RiskHub does not conform until implemented + verified, and the
   desktop-only exceptions (decision 7) keep it from a clean AA claim. Machine-checkable subset
   gated in CI: **new** `eslint-plugin-jsx-a11y` + the **existing** `axe`/Playwright smoke
   (`accessibility-smoke.spec.ts`) **extended** to the DORA surfaces, with pinned WCAG tags,
   its `chromium`-only guard removed, and **failing on every violation the WCAG tags select
   (not filtered by axe severity)** against a **ratcheting baseline**. See ADR-013.
3. **Primitive strategy** — build a **minimal set of accessible primitives** matching the
   current aesthetic (shared `Field` wrapper + `Label`/`Input`, **all true dialog / alert-dialog
   surfaces** — inventoried by *interaction contract* in Phase 2c; loading overlays and
   popovers/menus are **not** dialogs and keep their own ARIA — moved onto the existing
   `DialogShell`, tokenized `select`). No full shadcn migration. See ADR-015.
4. **Form validation model** — **keep native `required`** (for its implicit required-state
   semantics) and add **`noValidate`** on the form (suppresses the browser's submission UI
   while retaining semantics); drive validation in JS with **per-field inline errors** via the
   `Field` wrapper (`aria-invalid` + `aria-describedby` + `aria-required`), focus moved to the
   first invalid field, and a `role="alert"` summary. For custom Radix controls (`ThemedSelect`)
   propagate `aria-required`/`aria-invalid` and associate the visible label via `aria-labelledby`
   (its fallback `aria-label` must not override a real label — see ADR-015).
5. **Status colour** — reuse `--destructive`/`-foreground` as canonical danger; add
   `--success`/`--warning`/`--info` (+`-foreground`) tokens with **AA contrast acceptance
   tests**, and **migrate all rival palettes** to them. See ADR-015.
6. **Committee pills** — migrate the Excel-pastel committee-table fills to the new tokens,
   tuned to still read red/amber/green. Workbook fidelity stays in data + verbatim labels +
   the export, not spreadsheet fill colours.
7. **Mobile stance** — **desktop-only** (supported at `≥ lg`, 1024px). No reflow shell; below
   `lg` (narrow viewport or high zoom) an **informational notice** replaces the broken layout.
   This leaves **SC 1.4.10 Reflow / 1.4.4 Resize Text unmet** — a **documented, accepted AA
   deviation**, so RiskHub does **not** make a full WCAG 2.2 AA conformance claim while
   desktop-only stands. See ADR-014.
8. **Loading states** — centralize a **column-aware `isLoading` skeleton in `SortableTable`**;
   DQ and the committee view get explicit top-level `aria-busy` loading branches. Handle
   `.isError` via a **reusable table error contract** (localized message + retry callback +
   defined stale-data behaviour) shared by `SortableTable` and the DQ/Committee branches — a
   failed fetch must not render as "empty".
9. **Table keyboard access** — `SortableTable` sort headers become real `<button>`s inside
   `<th scope="col" aria-sort>`; the trailing chevron becomes a focusable
   `<Link aria-label="View …">` as the keyboard path; row `onClick` stays as a mouse
   convenience.
10. **Nav grouping** — add a `group` field to the nav model and organize the sidebar into
    labeled sections (**Overview / Registers / ICT Register / Administration**). Concrete
    section map to be approved with the plan.
11. **ICT Committee placement** — the committee view becomes a **URL-addressable Dashboard tab**
    (`?view=…`), sibling to the Risk Committee tab (which gains addressability too). The
    `IctRegisterCommitteePage` body is refactored into an `IctCommitteeSection`; the sidebar
    item is removed and `/ict-register/committee` redirects to **`/?view=ict-committee`** (the
    dashboard is the `/` index route — there is no `/dashboard` route). Gated by the existing
    `authz.can('read','ict_committee')`. DQ **stays** a routed page (its `?check=` deep-links
    are inbound and must survive). Glossary updated accordingly.
12. **Committee naming** — the two committee surfaces are disambiguated as **"Risk Committee"**
    and **"ICT Committee"** (adjacent Dashboard tabs). See CONTEXT.md.
13. **Sub-outsourcing chain** — group rows under a per-contract header with **expand/collapse**
    chain nodes (keep indent + rank badge).
14. **Link removal** — reuse the existing **`ConfirmDialog`** (no new toast infra) so a
    mis-click is recoverable.
15. **Packaging** — execute **all on the `dora` branch in ordered, reviewable phases**
    (foundation/tokens+gate → primitives+forms → tables+loading → IA restructure → polish),
    each an ultrareview/`code-review` checkpoint. No main-first split.

## Corrections after review (2026-07-11 / 07-12)

Two code-review rounds of these docs were verified against source and W3C primary sources
(see the [verification note](./UX-REMEDIATION-VERIFICATION-2026-07-11.md)). Folded in:

- **Route** — redirect is `/?view=ict-committee`, not `/dashboard?view=…` (no `/dashboard`
  route; dashboard is `/`).
- **A11y gate** — a narrow axe smoke gate already exists; the plan *extends* it (WCAG tags,
  DORA coverage, project-guard fix, **no severity filter**, ratcheting baseline) and *adds*
  jsx-a11y.
- **Standard** — the project **upgrades its target** to 2.2 AA (2.2 does not "supersede" 2.1;
  both are active standards).
- **Conformance framing** — AA is a **target**, not a present claim; desktop-only keeps 1.4.4 /
  1.4.10 as documented exceptions, so no full AA conformance is asserted (WCAG is per-full-page
  and cannot exclude viewport variations).
- **Validation** — keep `required` + add `noValidate` (don't drop `required`); wire
  `aria-required`/`aria-invalid`/`aria-describedby`, incl. on `ThemedSelect`.
- **Export gating** — readiness-screen export links must gate on the **separate**
  `can_download_dora_register` capability (from `vendor_report_capabilities`; needs
  `reports:read` + role), not `ict_committee:read`/`vendors:read`; test allowed + denied.
- **Blast radius** — `SortableTable` has **11 consumers / 20 sites** (not just the new lists);
  see Phase 3.
- **Decision count / audit persistence / doc reachability** — 15 decisions; findings persisted
  in the linked ledger; the `dora-ict-register/` folder indexed for docs-tree reachability.
- **Chart tokens** — **removed** (dead: no `chart-*` utility or `var(--chart-*)` is used;
  Recharts uses inline colours), not "define or remove".

## Also folded into the plan (obvious fixes, no separate decision)

Icon-only actions get `aria-label`; archived rows demoted (dim + separate) per the existing
`VendorLinkedEntitiesTab` convention; ISO dates formatted via `formatDateValue`; currency
right-aligned/`tabular-nums`; truncated cells get `title` + hover cue; empty states distinguish
"no data" vs "no search results" and give DQ a positive "0 findings" all-clear; DQ shows
"N of M shown" when scoped counts differ from global; heatmaps get a legend and the RoI
readiness bar a colour threshold; `ThreatForm` regains the submit pulse; readiness screens link
to the existing register export **(capability-gated, see above)**; `index.html` gets a real
title/favicon/meta; fonts move from blocking `@import` to `preconnect`+`link`; dead
`--chart-1..5` tokens are **removed**; `Pagination` page buttons get `aria-label`;
`SearchableEntitySelect` search inputs get accessible names; `/ict-register` bare path redirects
to the DQ page.

## Execution phases (on `dora`) — with acceptance criteria + rollback

Each phase is one tightly-scoped, independently-revertable commit range; the rollback point is
the prior phase's green HEAD (full gate — tsc/build, lint, vitest, a11y — green at every
boundary).

1. **Foundation** — semantic status tokens + Tailwind wiring (contrast-tested); a11y gate
   (jsx-a11y + extended axe with pinned WCAG tags, project-guard fix);
   `index.html`/fonts/chart-token cleanup.
   - _Acceptance:_ tokens defined + wired with zero visual regression + passing contrast tests;
     **both** a11y gates run in baseline mode — **jsx-a11y** rules as `error` with a **committed
     fingerprinted baseline file + CI validator** (file+rule+location; new findings fail, stale
     entries fail so it only shrinks — **not** a bare `--max-warnings` total, which lets a new
     violation replace a fixed one), **axe** as an explicit rule/selector baseline — so any
     **new** violation fails; both baselines only shrink; metadata/preconnect landed; dead chart
     tokens removed; full gate green.
   - _Rollback:_ additive only (new tokens + CI job + baselines) — revert the phase range.
2. **Primitives + forms + modals** — split into three independently-revertable sub-phases:
   - **2a — primitives + tokenized select.** `Field`/`Label`/`Input`; `select.tsx` on tokens;
     `ThemedSelect` ARIA extended (`id`/`aria-labelledby`/`aria-describedby`/`aria-invalid`/
     `aria-required`, no `aria-label` override). _Acceptance:_ unit + stateful axe tests on the
     primitives; because tokenizing `select.tsx` changes focus + theme styling across **~95
     `ThemedSelect` call sites (48 files)**, add **three-theme component / visual-regression
     coverage** — this is an **active** migration, not dormant. _Rollback:_ the
     `select.tsx`/`ThemedSelect` change reverts as one range (adopted immediately by all sites);
     the new `Field`/`Label`/`Input` primitives are dormant until 2b adopts them.
   - **2b — forms.** Migrate Asset/Process/Threat/Vendor sub-forms to `Field` with
     `required`+`noValidate`+per-field validation. _Acceptance:_ every label associated, distinct
     accessible names, `aria-required`/`aria-invalid` exposed, focus-first-invalid, submit
     success/failure e2e; the corresponding jsx-a11y baseline entries (label/control rules) are
     **removed** (rules are already `error` from Phase 1). _Rollback:_ one commit per form.
   - **2c — dialog migration.** First **inventory every overlay render-site by interaction
     contract**, classifying each as **dialog / alert-dialog** (→ `DialogShell`: focus trap, Esc,
     focus restoration), **loading overlay** (→ `aria-busy`/status, *no* focus transfer — e.g.
     `ControlDetailPage.tsx:292` `isLoadingRisk`), or **popover/listbox/menu** (→ its own ARIA
     pattern, not `DialogShell`). Migrate only the **dialog/alert-dialog** surfaces (today only
     `ConfirmDialog` + `ArchiveConfirmDialog` are on `DialogShell`; the rest include
     `RiskHubModalFrame` + consumers, the inline delete dialogs,
     `RiskQuestionnaireDetailContainer`, `ADUserPicker`, and the named `*Modal`/`*Dialog` files).
     _Acceptance:_ `DialogShell` extended with `role?: "dialog" | "alertdialog"` (initial-focus
     behaviour tested per role — it hardcodes `role="dialog"` today at `DialogShell.tsx:176`);
     every dialog surface has focus trap + Esc + focus restoration (stateful axe/e2e matrix); the
     dialog/focus-trap baseline reaches 0. _Rollback:_ one commit per surface or cluster.
3. **Tables + loading/error states** — (a) `SortableTable` keyboard access (`<button>` in
   `<th aria-sort>`, focusable row `<Link>`), `isLoading` skeleton, and an `isError` branch using
   the **reusable table error contract** (decision 8: localized message + retry callback +
   stale-data behaviour); (b) explicit top-level `aria-busy` loading **and** error branches for
   the **DQ** and **Committee** screens (neither consumes `SortableTable`) using the same contract.
   - _Acceptance:_ **all 11 SortableTable consumers / 20 sites** exercised — AssetsPage,
     ProcessesPage, ThreatsPage, ControlsTableSection, DepartmentTabContent, IssuesTableSection,
     KRIsTableSection, RisksTableSection, VendorsTableSection, VendorContractsSection,
     VendorSubOutsourcingSection — with `SortableTable` component tests + representative regression
     coverage across existing consumers; DQ + Committee loading/error branches proven by e2e;
     axe + keyboard-nav green.
   - _Rollback:_ **two** independently-revertable commit *ranges* — the `SortableTable` change
     **together with its consumer prop-migration** (callers pass the new `isLoading`/`isError`
     props, so the component cannot be reverted alone without breaking type-checking), and the
     DQ/Committee branch change — not one centralized commit.
4. **IA restructure** (highest routing risk) — sidebar grouping; ICT Committee → URL-addressable
   Dashboard tab with `/ict-register/committee → /?view=ict-committee` redirect; archived-row
   demotion; sub-outsourcing chain grouping; link-removal `ConfirmDialog`.
   - _Acceptance:_ grouped sidebar; **(a)** authorized deep-link `/?view=ict-committee` + legacy
     redirect resolve; **(b)** unauthorized or invalid `view` normalizes to overview **without**
     fetching committee data; **(c)** browser back/forward updates the selected tab; **(d)** ICT
     loading/error is independent of the overview request (today `DashboardPage.tsx:69` returns
     early on overview loading/error); DQ `?check=` deep-links still resolve; routing-manifest
     tests updated and green.
   - _Rollback:_ keep redirect + tab in one commit and **retain the old routed page until the
     redirect is verified**, so reverting restores the standalone page with no dead deep-links.
5. **Polish** — status-palette migration incl. committee pills; desktop-first advisory notice
   below `lg` (no reflow shell); date/currency/truncation; empty-vs-no-results + DQ all-clear +
   "N of M"; heatmap legend; readiness→export links (capability-gated); residual aria-label
   sweep; radius/z-index/motion tokenization.
   - _Acceptance:_ **every ledger finding reaches an explicit disposition** — `resolved`,
     `accepted limitation` (C6), or `deferred` (with rationale) — with no un-triaged findings;
     both a11y baselines are empty (or only documented deviations remain); the manual pass shows
     applicable criteria passing and **C6's expected 1.4.4 / 1.4.10 failures reproduced and
     recorded** (not asserted green); keyboard / focus-order / screen-reader passes green.
   - _Rollback:_ cosmetic/additive, grouped by finding ID — partial rollback of any single commit.

## Next step (when go-ahead is given — not before)

Turn Phase 1 into concrete edits on `dora`, gate-green (baseline mode), checkpoint, then proceed
phase by phase. Nothing above has been implemented yet.
