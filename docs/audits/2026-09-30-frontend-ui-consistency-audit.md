# Frontend UI & UX Consistency Audit — 2026-09-30

Back to index: [`docs/audits/README.md`](./README.md)

## 1. Audit metadata

| Field | Value |
|---|---|
| Audit date | 2026-09-30 |
| Commit | `ba42b38` "Fix creation access errors and KRI restore/history workflows (#232)", clean working tree before and after every round |
| Goal | **One consistent UI across the whole app**: one token mechanism, one primitive per pattern, one behaviour per interaction, in all three themes |
| Scope | `frontend/src` UI layer: all 343 non-test `.tsx` files under `pages/` and `components/` (100 % reviewed), plus `frontend/src/index.css` and route CSS, `frontend/tailwind.config.js`, `frontend/eslint.config.js`, `frontend/src/i18n/locales/*`, `frontend/scripts/i18n/*`, and the e2e contrast specs under `tests/frontend/e2e/` |
| Method | Five rounds run by review subagents. **R1:** three domain audits (design system and primitives; core modules Risks/Controls/KRIs/Issues/Approvals/Dashboard; secondary modules plus cross-cutting a11y, i18n, responsive, navigation and feedback). **R2:** adversarial re-verification of every 🔴/🟡 and a 🟢 sample; empirical gates (`tsc`, ESLint, `lint:a11y`, dialog inventory, i18n scan/parity/usage, debt budget); rendered contrast measured in Chromium on 25 surfaces × 3 themes; gap audits of files R1 only sampled. **R3:** adversarial verification of R2's new findings and a cross-report merge map; a 100 % file-coverage sweep; a target design standard. **R4:** assembly of this document. **R5:** evidence re-check of every GAP-D entry and a 59-entry register sample (§11.6) |
| Authority | Design-lead / PM decisions D1–D17 (§3) are binding and override any report recommendation. Severity, evidence and counts follow the latest verification round (R3 > R2 > R1) |
| Status | **Point-in-time evidence.** Per [`docs/DOCUMENTATION_OWNERSHIP.md`](../DOCUMENTATION_OWNERSHIP.md), dated audits are historical records; live remediation scope and status belong in GitHub Issues and pull requests. Later corrections must be additive |
| Owner | RiskHub Maintainer (frontend) |

Conventions used throughout:

- **Severity:** 🔴 critical (broken, unreadable or inaccessible) · 🟡 should fix (clear inconsistency or a11y/i18n defect) · 🟢 nice-to-have · ✅ verified clean.
- **Effort:** S < ½ engineer-day · M 1–3 days · L > 3 days or a codemod over 50+ files.
- **Phase:** the remediation phase in §5 (0 guards and quick fixes, 1 foundations, 2 shared patterns, 3 module migrations, 4 cleanup).
- **Paths** are repo-relative and line numbers are at `ba42b38`. Quotes are verbatim and at most 15 words.
- **IDs** keep the prefix of the round that raised them: `DS`, `PG` (R1-A/R1-B), `SM`, `AX`, `I18N`, `RS`, `NAV`, `FB` (R1-C), `NEW-V1`, `GAP-B`, `GAP-C` (R2), `R3`, `GAP-D` (R3). Merged IDs are listed under **Also** on the surviving entry.
- Scripts, logs, screenshots and JSON produced during the audit lived in session scratch artifacts (not committed). §12.3 describes how to recreate them.

---

## 2. Executive summary

### 2.1 Headline

- **The light theme is broken in production.** Rendered in Chromium, 208 of 663 text elements (31 %) on 25 surfaces fall below 4.5:1 in light, and **104 are effectively invisible (< 1.5:1)**. The riskhub and dark themes have 0 elements below 1.5:1. Root cause: commit `c47d94d` deleted the `.theme-light .text-white` / `.text-slate-*` remaps without migrating the 323 bare `text-white`, 73 `hover:text-white` and 7 `group-hover:text-white` usages in 126 files (DS-01). Hand-rolled inputs type white text into light fields (DS-02, 1.07:1), raw slate/status shades fail AA in at least one theme on ~1,300 text nodes (DS-03), and 11 dialogs stay hard-coded dark on a light page (DS-07).
- **The primitives exist; adoption is the problem.** There are 394 raw `<button>` against 107 `<Button>`, 60 hand-rolled text controls with hard-coded white text, 64 of 121 `<label>`s associated with nothing, and **zero** `Field` usages in `control-form`, `kri-form`, `issues` and `riskhub`. The Vendor module, the Native auth pages, the RiskTypes panel and `QuestionAnswerField` prove the target is reachable.
- **Every gate is green and blind.** `tsc`, ESLint (722 files, 0 findings), `lint:a11y`, the dialog inventory, three i18n gates, the debt budget and the CI axe contrast matrix all pass at `ba42b38`. None of them sees white-on-white text (axe `incomplete` is ignored), orphan `<label>{t(…)}</label>`s, raw enums, or Czech plurals (NEW-V1-02, AX-00).
- **Severity colours contradict each other.** Six live maps disagree: a "medium" risk is blue in the register and amber on the dashboard; issue "low" is blue in lists and green in the chart (PG-01). `RiskQuickViewModal` hard-codes 20/12/6 and misclassifies scores even at the default thresholds 16/10/5, violating [ADR-008](../adr/ADR-008-risk-threshold-ssot.md) (PG-02 🔴). D1 fixes this with one 4-step scale.
- **Production SSO login tells every user "Live SSO is disabled on this page"** under a working Microsoft button (GAP-B-01 🔴, an S fix).
- **Keyboard and screen-reader blockers:** 10 icon-only buttons have no accessible name (AX-01), questionnaire history rows can only be opened with a mouse (AX-02), and the Risk Hub system-setting toggle has no role, state or name (DS-04).
- **Fragmentation everywhere a pattern repeats:** 6 pagination implementations (the shared one plus 5 bespoke), 5 tab styles (2 more without keyboard support), 3 archive implementations (KRI's says "Delete"), 4 dialog-footer styles, 8 backdrop and 17 dialog-title recipes, 173 inline pill recipes in 84 files, 533 eyebrow labels in 48 combinations, and at least 9 routes without an `<h1>`.
- **Feedback is ad hoc.** There is no toast system. A failed row restore replaces the whole register with an error state (FB-01), and admin panels, vendor register links and issue history render a load failure as an empty list (GAP-C-11).
- **i18n leaks:** raw enums reach the UI (risk status, control-form frequency/status, questionnaire status, KRI units, audit event names), 68 of 71 Czech `{{count}}` strings have no plural forms, and `<html lang>` stays `en` while the UI is Czech (AX-09).
- **What is already right:** `DialogShell` behaviour (focus trap, Escape, opener restore), `SortableTable`, `useContentTabs`, `Field`/`Input`/`ThemedSelect`, `RegisterListShell`, the status-token contrast test, the vendored fonts, reduced-motion handling (CSS, framer and Recharts), and the #175 workflow-contrast families (0 failures in all three themes).
- **Final register:** 213 raw IDs across six reports and three rounds consolidate into **124 entries: 8 🔴, 67 🟡, 49 🟢** after the merge map and one false flag (AX-13). Estimated remediation effort is **57–85 engineer-days** over five phases (§5).

### 2.2 Scorecard (final register, after merges and false-flag removal)

| Domain (register section) | 🔴 | 🟡 | 🟢 | Total |
|---|---|---|---|---|
| 6.1 Theming, colour and contrast | 3 | 7 | 4 | 14 |
| 6.2 Design tokens, typography, spacing | 0 | 2 | 4 | 6 |
| 6.3 Primitives and components | 1 | 12 | 9 | 22 |
| 6.4 Page layout and navigation | 0 | 7 | 4 | 11 |
| 6.5 States and feedback | 0 | 4 | 4 | 8 |
| 6.6 Severity and status semantics | 1 | 2 | 1 | 4 |
| 6.7 Accessibility | 2 | 12 | 5 | 19 |
| 6.8 i18n and formatting | 0 | 10 | 10 | 20 |
| 6.9 Responsive | 0 | 2 | 2 | 4 |
| 6.10 Module-specific | 1 | 9 | 6 | 16 |
| **Total** | **8** | **67** | **49** | **124** |

The 🔴 entries are DS-01, DS-02, DS-03 (light-theme and AA contrast), DS-04 (switch with no role/state/name), PG-02 (hard-coded risk thresholds), AX-01 (unnamed icon buttons), AX-02 (mouse-only rows) and GAP-B-01 (false "SSO disabled" copy on the production login).

### 2.3 Rendered contrast per theme (R2-V3, Chromium, 1440×900)

Same 25 surfaces in each theme: the `frontend/workflow-contrast.html` families, 13 `frontend/dialog-contract.html` owner sites measured closed and opened, and the routes `/risks`, `/settings`, `/risk-hub`, `/controls/new`, `/risks/new`, `/issues/new`, `/dashboard`, `/users/new` with a mocked API.

| Theme | Text elements | < 4.5:1 (AA, large-text aware) | < 3:1 | < 1.5:1 (effectively invisible) | `text-white` on a light background |
|---|---|---|---|---|---|
| **light** | 663 | **208** | **177** | **104** | **75** |
| riskhub (default) | 663 | 99 | 17 | 0 | 0 |
| dark | 663 | 92 | 9 | 0 | 0 |

Worst light-theme surfaces: the questionnaire dialog (38 of 67 text nodes below 1.5:1 when open), the Risk Hub Departments, Approval Scenarios and Roles panels (14/17, 11/12 and 11/14 below 3:1), Settings (`h1` at 1.00:1), and KRI edit inputs (values at 1.07:1). The token-migrated RiskTypes panel measures 0 failures. Per-surface detail is in §9.2. Caveats: gradient backgrounds (the `/login` demo view) cannot be composited and are excluded; `/dashboard` and `/issues/new` rendered mostly permission or error states because of mock gaps, so their low counts prove nothing.

### 2.4 Top 15 fixes by impact

| # | Fix | Register IDs | Effort | Phase |
|---|---|---|---|---|
| 1 | Stop rendering preview-only copy on the production SSO login | GAP-B-01 | S | 0 |
| 2 | Make the CI contrast gate see what it misses (fail or ratchet axe `incomplete`) and commit the rendered-contrast gate over 3 themes with a baseline | NEW-V1-02, AX-00 | M | 0 |
| 3 | Fix `text-white` in the shared shells (Pagination, StepIndicator, ReadAccessDeniedState, ArchiveConfirmDialog, SortableTable empty text) and ship the measured D2 light-theme stop-gap | DS-01, DS-03 | S | 0 |
| 4 | `RiskQuickViewModal` uses `useRiskThresholds()`; broaden the ADR-008 lint rule | PG-02 | S | 0 |
| 5 | Name the 10 icon-only buttons; make questionnaire-history rows keyboard-operable | AX-01, AX-02 | S | 0 |
| 6 | Give the Risk Hub system-setting switch `role="switch"`, state and name; label its inputs | DS-04 | S | 0 |
| 7 | Tokenise the 11 hard-coded dark dialog surfaces **together with** their inner text, one dialog family per PR | DS-07 | L | 2 |
| 8 | App-wide text-token codemod (`text-white` / `text-slate-*` / bright status text → role tokens) before the stop-gap deadline | DS-01, DS-03, DS-19 | L | 2 |
| 9 | Hand-rolled inputs → `Field` + `Input`/`Textarea`; fix the 64 orphan labels | DS-02, AX-04, DS-10 | L | 1–3 |
| 10 | One severity module (`lib/severity.ts`) after the ADR-015 addendum; delete rival palettes | PG-01, DS-06, DS-05 | M | 0–2 |
| 11 | `useFeedback()` toast; row-level failures never replace the register | FB-01 | M | 1–2 |
| 12 | One confirmation contract for archive / delete / remove-link / bulk send; KRI "Delete" becomes "Archive" | PG-07 | M | 2 |
| 13 | Load failures render an error state, never an empty one | GAP-C-11, DS-17 | M | 0–3 |
| 14 | `PageHeader` with exactly one `<h1>` per route, per-route `document.title` and `<html lang>` sync | DS-15, NAV-01, AX-09 | M | 0–2 |
| 15 | Replace the white-alpha remap hack with the `tint` token family (dividers vanish in light today) | DS-22 | M | 1–2 |

---

## 3. Design decisions (binding)

These decisions were taken by the design lead and PM after R3 and are binding for the standard (§4), the roadmap (§5) and every **Fix** line in the register. Where a report recommended something different, the decision wins and the difference is recorded in §11.4.

| ID | Decision | Status | Affected findings |
|---|---|---|---|
| D1 | **One 4-step severity scale** for every low/medium/high/critical surface (risk score bands, issue severity, KRI RAG where applicable, heatmaps, charts): low = green (`success`), medium = amber (`warning`), high = orange (new `--severity-high` token), critical = red (`destructive`). **Blue never encodes severity.** Single source of truth: one module, `lib/severity.ts`, extending `riskScoreTheme` / `useStatusTheme`. Thresholds always come from the configurable Risk Hub settings (ADR-008). Requires an **ADR-015 addendum before any codemod**. `CriticalityClassPill` (DORA criticality) is a different semantic: it keeps its 3-step scale but takes its colours from the same tokens, documented in the addendum | DECIDED | PG-01, PG-02, DS-06, DS-05, PG-32, PG-40, GAP-D-12, GAP-B-16 |
| D2 | **Light-theme stop-gap:** Phase 0 ships a scoped, measured CSS remap of `text-white`, `text-slate-*` and `divide-white/*` under `.theme-light` that **excludes coloured fills and dark dialog surfaces**, verified by the rendered-contrast script. It carries a code comment with a removal deadline of **Phase 2 exit**. If it cannot reach 0 elements below 3:1 on the harness surfaces, label Light as "Beta" in AppearanceSettings until Phase 2 | DECIDED | DS-01, DS-02, DS-03, DS-22, NEW-V1-02 |
| D3 | **White-alpha classes** move to a new `tint` token family (same opacity steps, theme-aware base colour) so the dark themes stay pixel-identical; card edges use `border-border` | DECIDED | DS-22, DS-05, DS-21, GAP-D-22 |
| D4 | **Primary CTA:** `Button` gets an `accent` variant as THE primary call to action. Delete the `.btn-primary` and `.btn-secondary` CSS classes (the latter is referenced but undefined, GAP-D-05) | DECIDED | DS-09, GAP-D-05, DS-10, PG-08 |
| D5 | **Surfaces:** keep `glass` / `glass-card` as the canonical, theme-aware card surface; drop ad hoc `bg-card`. **All dialogs use DialogShell's themed surface**, with no hard-coded dark dialogs. The dialog surface fix and the in-dialog text fix ship **in the same PR** (the NEW-V1-01 ordering rule) | DECIDED | DS-07, DS-08, DS-20, SM-09 |
| D6 | **Typography (amended 2026-10-01):** minimum font size 11px, allowed only for (a) uppercase eyebrow labels through one `text-eyebrow` utility (11px / weight 600 / `tracking-wide`) and (b) the compact `Badge size="sm"` (§4.9); nothing smaller anywhere; body and table text at least 12px; no `font-black` in app UI; define or delete `font-heading` | DECIDED | DS-14, DS-15, DS-13 |
| D7 | **Page titles:** exactly one `<h1>` per route and one page-title style everywhere, including entity detail via `EntityDetailHeader`; section titles are `h2` with one style | DECIDED | DS-15, SM-05, AX-03 (in DS-15) |
| D8 | **Tabs:** build a `Tabs` primitive on the existing `useContentTabs` hook (already ARIA- and keyboard-correct); remove the unused `@radix-ui/react-tabs` | DECIDED | DS-12 |
| D9 | **Feedback:** add `@radix-ui/react-toast` behind a `useFeedback()` hook. Toast for success and transient outcomes; inline banner (`role="alert"`) only for blocking errors, scoped to the failing region; row-level failures never replace the whole register | DECIDED | FB-01, GAP-C-11, DS-04, GAP-D-09, AX-05 |
| D10 | **Archive / delete / unlink:** Archive = `Archive` icon + "Archive" (reversible); Delete = `Trash2` (irreversible only); Unlink = `Unlink` icon + "Remove link". Every one goes through `ConfirmDialog`. Reason-required derives from one approval flag; Threat needs backend support | DECIDED (wording, icons) — PO to confirm (reason policy) | PG-07, GAP-D-08, DS-13 |
| D11 | **Page width:** max 1520px content width app-wide; forms 960px; a single page-container component with one padding rhythm | DECIDED | DS-16, SM-09, RS-01 |
| D12 | **Approval-queued navigation:** return to the entity page, show a persistent pending banner with a link to `/approvals`, plus a success toast | DECIDED — PO to confirm | FB-01 |
| D13 | **Vendor module:** fold its parallel components into the shared set as thin aliases first and migrate last in Phase 3. Supersedes the exemption in [`docs/quality/vendor-route-overhaul-2026-03-08.md`](../quality/vendor-route-overhaul-2026-03-08.md) | DECIDED | SM-09, GAP-C-08, DS-05 |
| D14 | **Other defaults:** `SortableTable` header recipe everywhere; keyboard-activatable rows (Enter/Space, focusable, role/link semantics) inside `SortableTable` itself; one `Pagination`; controls at a 12px radius and bare `rounded` = 8px; no Tailwind `dark:` variant (theme via tokens only); two text-emphasis levels (`text-foreground`, `text-muted-foreground`) plus `text-subtle` for meta **only if** it passes AA in all 3 themes; required marker `*` via `Field`; login/public pages follow the OS colour-scheme preference; labelled back buttons whose name matches the destination; breadcrumbs on detail/edit pages; per-route `document.title` and `<html lang>` sync | DECIDED | DS-11, AX-02, DS-29, DS-25, DS-20, DS-03, AX-04, DS-24, AX-06, NAV-01, NAV-02, AX-09, GAP-D-10 |
| D15 | **Guards:** eslint suppressions and inline disables are forbidden, so regression ratchets are a standalone script, `scripts/quality/ui-consistency-ratchet.mjs` (placed at `frontend/scripts/quality/`, §11.4), with a committed baseline counts JSON that may only go down; plus a Playwright rendered-contrast gate over all 3 themes that fails on **measured** contrast, not only on axe `violations` (NEW-V1-02); plus an i18n scanner fix for single-word literals and Czech plural forms (`_one`/`_few`/`_other`) | DECIDED | AX-00, NEW-V1-02, GAP-B-14, all ratcheted classes |
| D16 | **Dead code first:** delete `GroupedView`, `CategoryDrillDown`, `MiniHeatmap`, `VendorEmptyState` and other confirmed-dead UI **before** running any codemod (R3-01) | DECIDED | PG-43, GAP-D-21, DS-20, PG-32, PG-34, SM-09 |
| D17 | **Severity policy for this document:** final severities from the latest verification round (R3 > R2 > R1). RS-02 stays 🟡. AX-13 is removed (false flag, see §11.1). NEW-V1-01 is 🟡 (narrowed) | DECIDED | all; RS-02, AX-13, NEW-V1-01 |

### 3.1 Items the decisions leave open

These came up in the reports but are not settled by D1–D17. The design lead resolved the design-owned items on 2026-10-01 (marked **RESOLVED**). The rest need a product-owner decision before their phase starts.

| Item | Context | Proposed owner and default |
|---|---|---|
| Control radius token name | D14 says "controls 12px (`rounded-xl`)", but in `frontend/src/index.css:78-79` `--radius-lg` is `0.75rem` (12px) and `--radius-xl` is `0.875rem` (14px). See §11.4 | **RESOLVED by design lead (2026-10-01):** the 12px value is binding and the class is `rounded-lg`, matching `frontend/src/components/ui/README.md`. Do not retune `--radius-xl`; raw `rounded-xl` on controls goes away as primitives are adopted |
| Czech `_many` plural form | D15 names `_one/_few/_other`; R2/R3 fixes and i18next's Czech rules also use `_many` (fractions) | **RESOLVED by design lead (2026-10-01):** the validator requires `_one/_few/_other` for Czech and accepts an optional `_many` (fractions); a missing `_many` falls back to `_other` |
| Vendor tier "standard" band | `frontend/src/components/ict-register/CriticalityClassPill.tsx:34` `VENDOR_TIER_PILLS` must map onto D1 tokens; "standard" could be `low` (green) or neutral | PO, in the ADR-015 addendum. Default: neutral |
| Closed-list code translation | GAP-C-09: raw Czech DORA codes ("Ano/Ne") shown to English users | PO decides which lists are regulatory; default: translate labels, keep raw values |
| Archive reason policy | D10: reason-required from one approval flag; Threat's API takes no reason | PO (D10); backend change for Threat |
| Approval-queued behaviour | D12 | PO to confirm |
| Sidebar grouping | NAV-06: `departments` sits in `overview`; `evidence` and `risk_hub` sit in `administration` | PO; default: keep the current grouping |
| `MultiSelect` implementation | GAP-B-07 needs a multi-select; Radix Popover would be a new dependency | **RESOLVED by design lead (2026-10-01):** approve `@radix-ui/react-popover` (same Radix family as the select/label/toast already chosen) for a `MultiSelect` primitive in `components/ui/`: a checkbox list in a popover, with a selected-count summary in the trigger |

---

## 4. Target design standard ("the UI contract")

This section is the contract engineers implement against. It adapts the R3 design standard to the binding decisions in §3. Each area gives the canonical component or token, an API sketch, do/don't rules, a codemod mapping, and the regression guard. Finding detail lives in the register (§6); this section only names the IDs.

**Existing vs NEW names.** At `ba42b38`, `frontend/tailwind.config.js` and `frontend/src/index.css` already define the colours `background`, `foreground`, `card`, `popover`, `nested`, `glass`, `primary`, `secondary`, `muted`, `accent` (+ `hover`, `text`), `destructive`, `success` (+ `text`), `warning` (+ `text`), `info`, `border`, `input`, `ring`, `icon-muted`, and the radii `sm`–`2xl` (`--radius-sm` 8px … `--radius-2xl` 16px). Everything else this section names is **NEW** and must be added before use: the CSS variables in the §4.2 token table (`--tint`, `--overlay`, `--severity-high*`, `--chart-1…8`, `--heat-0…4`, `--nav-active*`, `--badge-count*`, values there) and their Tailwind colour keys in `tailwind.config.js`; the `tailwind.config.js` keys `fontFamily`, `fontSize.2xs` (§4.5), `borderRadius.DEFAULT`, `boxShadow.popover`, `zIndex.*`, `transitionDuration.*` and `maxWidth.*` (§4.6, values there); the `index.css` utilities `.text-eyebrow` (§4.5), `.focus-ring` and the global `:focus-visible` rule (§4.6); and `text-subtle` (conditional, D14). There is no `--info-text` or `--destructive-text`: soft `Badge` text uses `text-accent-text` for `info`, `text-destructive` for `danger` and `text-muted-foreground` for `neutral`.

### 4.0 Principles

- **P1 Tokens only.** Colour, radius, shadow, z-index, font family, font size and duration come from named tokens. No raw Tailwind palette classes (`*-slate-400`, `*-rose-500`), no `text-white`, no `bg-white/N`, no hex or `rgba()` in TSX. The only exception is data-driven colour (user-chosen risk-type colours in `frontend/src/hooks/useRiskHubConfig.ts` and the `RiskTypesPanel` colour picker).
- **P2 One theming mechanism.** Themes switch by root class (`theme-riskhub | theme-dark | theme-light`, set in `frontend/src/contexts/ThemeContext.tsx`) and CSS custom properties. No `!important` class remaps, no per-theme JS colour maps, no `dark:` variant (D14), no route-scoped palettes.
- **P3 Light is first-class.** The remediation spec commits to "all three themes" (`docs/dora-ict-register/FRONTEND-UX-REMEDIATION-SPEC.md:154`). Every primitive and surface must pass AA in riskhub, dark and light, proven by **rendered** measurement (D15), not only token arithmetic.
- **P4 Bespoke primitives.** ADR-015 rejects generating the shadcn set. New primitives are hand-written, token-driven, `cva`-based and live in `frontend/src/components/ui/`.
- **P5 A11y by construction.** Primitives own their ARIA: `Field` owns the label, `Switch` owns `role="switch"`, `DialogShell` owns the focus trap, `Tabs` owns roving tabindex, `SortableTable` owns row activation (D14). Bypassing a primitive is what the guards catch.
- **P6 Ratchet, don't big-bang.** Debt counts may only go down (D15). A module flips to hard ESLint errors once its counts reach zero.
- **P7 Semantics before hue.** Callers express meaning (`tone="danger"`, `band="high"`, `intent="archive"`); only `components/ui/*` and `lib/severity.ts` map meaning to classes.

### 4.1 Guard infrastructure (D15)

The areas below reference these guards by ID.

**G-RATCHET: `frontend/scripts/quality/ui-consistency-ratchet.mjs`** (D15 name) with a committed `frontend/scripts/quality/ui-consistency-baseline.json` of per-file, per-pattern counts. It fails if any `(file, pattern)` count increases or a new file appears with a count above 0; `--write` may only shrink the baseline. Wire it as `npm run quality:ui-ratchet` and as a step in `.github/workflows/maintenance-governance.yml` next to `frontend/scripts/quality/validate-no-inline-styles.mjs`. It is modelled on `frontend/scripts/quality/validate-no-inline-styles.mjs` and `frontend/scripts/quality/debt-budget.mjs`. It scans `src/**/*.{ts,tsx}` excluding `__tests__` and `*.test.*`. A separate script is required because `frontend/eslint.config.js` sets `linterOptions.noInlineConfig: true` and `frontend/scripts/a11y/jsx-a11y-baseline.mjs` requires `frontend/eslint-suppressions.json` to stay `{}` ([ADR-013](../adr/ADR-013-frontend-accessibility-standard.md) strict zero).

| Pattern | Regex (JS, per line) | Covers | Baseline at `ba42b38` |
|---|---|---|---|
| `text-white` | `/(?<![\w-])(?:[a-z-]+:)*text-white(?![\w/-])/g` | DS-01 | 403 lines |
| `raw-palette` | `/(?<![\w-])(?:[a-z-]+:)*(?:bg\|text\|border\|ring\|from\|to\|via\|fill\|stroke\|divide\|outline\|shadow\|placeholder\|decoration\|accent\|caret)-(?:slate\|gray\|zinc\|neutral\|stone\|red\|orange\|amber\|yellow\|lime\|green\|emerald\|teal\|cyan\|sky\|blue\|indigo\|violet\|purple\|fuchsia\|pink\|rose)-\d{2,3}\b/g` | DS-03, DS-06 | 2,048 |
| `white-alpha` | `/(?<![\w-])(?:[a-z-]+:)*(?:bg\|text\|border\|ring\|divide\|from\|to\|via\|fill\|stroke)-(?:white\|black)\/[\w.\[\]]+/g` | DS-22 | ~1,400 |
| `micro-font` | `/text-\[(?:[0-9]\|10)(?:\.\d+)?px\]/g` | DS-14 | 264 |
| `arbitrary-color` | `/-\[[^\] "]*(?:#[0-9a-fA-F]{3}\|rgba?\(\|hsla?\()/g` | DS-24, PG-01 | 18 |
| `hex-literal` | `/['"\`]#[0-9a-fA-F]{3,8}['"\`]/g` | DS-05 | 115 |
| `text-accent-as-text` | `/\btext-accent(?![\w-])/g` (count only; icons allowed after review) | DS-19 | 198 (≈100 real text) |
| `raw-button` | `/<button\b/g` | DS-10 | 394 |
| `raw-text-input` | `/<(?:textarea\|input)\b(?![^>]*type=(?:"\|')(?:checkbox\|radio\|hidden\|range\|color\|file))/g` | DS-02 | ~102 |
| `raw-table` | `/<table\b/g` outside `components/ui/table.tsx` | DS-11 | 21 |
| `z-arbitrary` | `/\bz-\[\d+\]/g` | DS-27 | 5 |
| `radius-offscale` | `/\brounded-(?:3xl\|\[)/g` | DS-25 | 11 |
| `btn-classes` | `/\bbtn-(?:primary\|secondary)\b/g` | DS-09, GAP-D-05 | 11 |
| `important-css` | `!important` in `src/**/*.css` | DS-05 | 106 (86 + 8 + 12) |
| `pill-inline` | `/px-(?:1\.5\|2\|2\.5) py-(?:0\.5\|1)\b/` on lines also matching `text-(\[(8\|9\|10\|11)px\]\|xs)` | DS-13 | 173 |

**G-ESLINT: path-scoped hard bans.** Add a `no-restricted-syntax` block to `frontend/eslint.config.js` scoped with `files: DESIGN_CLEAN_PATHS`. The list starts with `src/pages/native/**` only (0 hits for these selectors at `ba42b38`; confirm with the report-mode command in §12.2). Every other path, including `src/components/ui/**` and `src/components/vendors/**`, is added only once its counts for the banned patterns reach zero, so the list grows as primitives are tokenised (Phase 1 exit) and as each module finishes Phase 3. Flat-config rule arrays replace each other, so every new block must re-include the existing raw-ID and ADR-008 selectors (`frontend/eslint.config.js:107-116`). `components/ui/**` implementation files are exempt from element bans.

```js
{ selector: "Literal[value=/(^|\\s)(?:[a-z-]+:)*text-white(?![\\w/-])/]", message: "Use text-foreground or a *-foreground token (§4.3)." },
{ selector: "TemplateElement[value.raw=/(^|\\s)(?:[a-z-]+:)*text-white(?![\\w/-])/]", message: "Use text-foreground or a *-foreground token (§4.3)." },
{ selector: "Literal[value=/-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3}\\b/]", message: "Raw palette colour. Use a semantic token (§4.2-4.4)." },
{ selector: "Literal[value=/-(?:white|black)\\/[\\w.\\[\\]]+/]", message: "White/black alpha. Use tint/overlay tokens (§4.2)." },
{ selector: "Literal[value=/text-\\[(?:[0-9]|10)(?:\\.\\d+)?px\\]/]", message: "Below the 11px floor. Use text-eyebrow or text-xs (§4.5)." },
{ selector: "Literal[value=/-\\[[^\\] ]*(?:#[0-9a-fA-F]{3}|rgba?\\(|hsla?\\()/]", message: "Arbitrary colour literal. Add a token." },
{ selector: "JSXOpeningElement[name.name='button']", message: "Use <Button> from components/ui/button." },
{ selector: "JSXOpeningElement[name.name='textarea']", message: "Use <Textarea> inside <Field>." },
{ selector: "JSXOpeningElement[name.name='table']", message: "Use <SortableTable> or ui/table." },
{ selector: "JSXOpeningElement[name.name='tr'] > JSXAttribute[name.name='onClick']", message: "Mouse-only row activation (AX-02). Use SortableTable row activation." },
{ selector: "JSXElement[openingElement.name.name='label']:not(:has(JSXAttribute[name.name='htmlFor'])):not(:has(JSXOpeningElement[name.name=/^(input|select|textarea|Input|ThemedSelect|Textarea|Checkbox|Switch)$/]))", message: "Unassociated label (AX-04). Use <Field>." },
```

**G-RENDER: Playwright rendered-contrast gate over 3 themes** (D15, NEW-V1-02).

1. Fix the existing gate: `tests/frontend/e2e/theme-contrast-matrix.spec.ts:349-350` reads only `result.violations`. Also fail on (or ratchet) `result.incomplete` for `color-contrast`.
2. Commit an in-page auditor as `tests/frontend/e2e/helpers/renderedContrastAudit.ts`, reusing the compositing algorithm of `tests/frontend/e2e/helpers/renderedContrast.ts` (method in §12.3), and a new spec `tests/frontend/e2e/theme-rendered-contrast.spec.ts`. Matrix: 3 themes × {every audit route} ∪ {every `frontend/dialog-contract.html` owner site, **opened**} ∪ {`frontend/workflow-contrast.html` families}.
3. Assertion: zero text elements below 4.5:1 (3:1 for large text) per theme. Until Phase 3 exit the spec compares against a committed `rendered-contrast-baseline.json` that may only go down; today's baseline is light 208, riskhub 99, dark 92 (§2.3).
4. Targeted `renderedContrast()` probes: the Pagination "Showing 1 to 20" spans, a New/Edit page title, the `SortableTable` empty state, and `IssueQuickCreateModal` with a typed title and a selected severity.
5. `/login` probes at 1024×600 and 1280×600: the language switch is clickable and the `h1` top is ≥ 0 (RS-02).

**G-I18N** (D15): in `frontend/scripts/i18n/scan-hardcoded-ui.mjs`, the `JsxText` visitor calls `isNoiseText(raw, { allowShortWord: true })` (today `:50-51` drop single-word literals); add a fixture test with `<span>Uncategorised</span>`. New `frontend/scripts/i18n/validate-plurals.mjs` wired into `i18n:test`: every leaf containing `{{count}}` is a plural family (`cs` `_one/_few/_other`, optional `_many`; `en` `_one/_other`), with an allowlist for count-free uses such as `{{count}}%`. Baseline: 68 `cs` violations. Add a concatenation selector for template literals that join `t()` calls with words or colons.

**G-UNIT:** each new primitive ships a vitest + Testing Library contract test (role, name, state, keyboard, token classes). Extend `tests/frontend/unit/src/design-system/statusTokenContrast.test.ts` to every new token pair (`tint`, `overlay`, `severity-high*`, `chart-*`, `heat-*`, `nav-active`, `badge-count`, and `muted-foreground` against `glass`, `nested`, `popover` in all 3 themes). Add `cssVarsDeclared.test.ts` (every `var(--x)` in `src` is declared, closing DS-18) and `severityConsistency.test.ts` (§4.4).

### 4.2 Colour tokens and the theming mechanism

**Findings:** DS-05, DS-06, DS-18, DS-20, DS-21, DS-22, DS-33, PG-01 (chart/committee colours).

**Canonical.** CSS custom properties in `frontend/src/index.css`, in exactly three blocks: `:root, .theme-riskhub { … }` (add the explicit selector), `.theme-dark { … }`, `.theme-light { … }`. They are consumed only through semantic Tailwind colours in `frontend/tailwind.config.js`, or `hsl(var(--x))` in the rare CSS rule. Canvas, SVG and Recharts read them through one helper:

```ts
// frontend/src/lib/cssTokens.ts (new)
export function readCssColor(token: ColorToken, alpha?: number): string; // "hsl(H S% L%)" from the current root
// useChartTheme becomes useMemo(() => buildFromTokens(readCssColor), [theme])  // re-read on theme change
```

**Token additions** (HSL triplets; verify with G-UNIT and G-RENDER before merging):

| Token | riskhub / dark | light | Tailwind key | Replaces |
|---|---|---|---|---|
| `--tint` | `0 0% 100%` | `222 47% 11%` | `tint` (with `/N`) | every `*-white/N` (D3): dark themes pixel-identical, light gets navy alpha; lets `frontend/src/index.css:329-344` and `:534-564` be deleted |
| `--overlay` + `--overlay-alpha` | `222 47% 4%` / `0.7` (riskhub), `0 0% 0%` / `0.8` (dark) | `222 47% 11%` / `0.4` | `overlay` | the 8 dialog backdrop recipes |
| `--severity-high`, `-foreground`, `-text` | `25 95% 53%`, `26 84% 6%`, `25 95% 68%` | `25 95% 53%`, `26 84% 6%`, `22 90% 34%` | `severity-high.{DEFAULT,foreground,text}` | the orange "high" band (D1); text 7.97:1 riskhub glass, 9.41:1 dark glass, 6.22:1 light |
| `--chart-1…8` | seeds: accent `210 100% 60%`, violet `262 83% 66%`, teal `173 80% 45%`, warning, pink `330 81% 65%`, sky `199 89% 60%`, lime `84 70% 50%`, neutral `215 16% 55%` | L − 15 | `chart.1…8` | `useChartTheme` hex tables (102 literals). Re-adding chart tokens reverses FR-P1-8; record it in the ADR-015 addendum |
| `--heat-0…4` + `-foreground` | sequential surface → `--destructive`, per theme | per theme | `heat.0…4` | the Excel RGB scale in the ICT committee heatmap |
| `--nav-active`, `-foreground` | `224 76% 48%` / `0 0% 100%` | `222 47% 11%` / `0 0% 100%` | `nav-active` | `frontend/src/components/layout/sidebar.css:2,9` hex |
| `--badge-count`, `-foreground` | `347 77% 42%` / `210 40% 98%` | same | `badge-count` | `#be123c !important` at `frontend/src/index.css:426-433` |

Config fixes: `boxShadow.glass: 'var(--glass-shadow)'`; remove `darkMode: ["class"]` (D14); delete or document the zero-use utilities `card-foreground`, `nested-foreground`, `glass-foreground`, `glass-hover-border`; drop ad hoc `bg-card` in favour of `glass` (D5).

**Do:** `bg-{token}`, `text-{token}`, `border-{token}`, opacity modifiers (`bg-destructive/10`); add a token with three theme values and a contrast test whenever a colour has no semantic home.
**Don't:** raw palette classes, `bg-white/N`, `text-white`, `[#hex]`, `rgba()` in TSX, `!important` remaps, `dark:` variants, per-theme JS objects, route CSS that defines colours.

**Codemod mapping:**

| From | To | Note |
|---|---|---|
| `bg-white/(5\|10\|20)`, `hover:` / `group-hover:` variants | `bg-tint/N`, `hover:bg-tint/N`, `group-hover:bg-tint/N` | same N |
| `bg-white/[0.02\|0.025\|0.03]` | `bg-tint/[0.03]` | 71 sites |
| `divide-white/(5\|10)` | `divide-border` (rows) or `divide-tint/10` | **before** deleting `.theme-light tr` (R-a below) |
| `border-white/(5\|10)` | `border-border` (card edges) or `border-tint/10` (hairlines) | D3 |
| `border-white/(15\|20\|30)` | `border-input` (control edges) or `border-tint/20` | |
| `border-white/(6\|8)`, `via-sky-400/12` | `border-tint/[0.08]` | these never compile today |
| `bg-black/N`, `bg-slate-950/N` backdrops | nothing: `DialogShell` default `bg-overlay` | |
| `bg-slate-900`, `/95` dialog surfaces | `bg-popover text-popover-foreground border-border` | same PR as inner text (D5) |
| `rgba(var(--accent-rgb),0.2)` | `hsl(var(--accent)/0.2)` | DS-18 |
| `accent-[var(--color-accent)]` | `accent-accent` | DS-18 |
| `useStatusTheme()` consumers | `lib/severity.ts` / `BADGE_TONES` | then delete the hook |
| `--admin-*` rgba, sidebar hex | `--nested`, `--border`, `--muted-foreground`, `--nav-active` | |

**Ordering rules:** (R-a) delete `.theme-light tr { border-color … !important }` only after `divide-white/*` → `divide-border`, or every register loses row dividers in light; (R-b) delete the `bg-white\/5` remap blocks only after the `tint` codemod reaches 0 in G-RATCHET; (R-c) `readCssColor` re-reads on theme change.
**Guards:** G-RATCHET `white-alpha`, `raw-palette`, `hex-literal`, `arbitrary-color`, `important-css`; G-ESLINT class bans; `cssVarsDeclared.test.ts`.

### 4.3 Text colour roles

**Findings:** DS-01, DS-02 (text), DS-03, DS-19, DS-32, GAP-D-15.

Two neutral emphasis levels plus role tokens (D14). No shade scale.

| Role | Class | Minimum contrast, all 3 themes | Use for |
|---|---|---|---|
| Primary | `text-foreground` | ≥ 7:1 | body, headings, values, cells, input values |
| Secondary | `text-muted-foreground` | ≥ 4.5:1 (7.4 riskhub glass, 9.1 dark glass, 7.5 light white) | labels, meta, eyebrows, help, placeholders, table headers, empty-state copy |
| Subtle meta (optional, D14) | `text-subtle` (NEW, conditional) | must measure ≥ 4.5:1 in all 3 themes, otherwise not introduced | timestamps and IDs only |
| Icon | `text-icon-muted` | ≥ 3:1 | decorative and secondary icons |
| Link / info | `text-accent-text` | ≥ 4.5:1 | links, info text, active tab label |
| Status | `text-destructive`, `text-success-text`, `text-warning-text`, `text-severity-high-text` (NEW, §4.2) | ≥ 4.5:1 | |
| On a fill | `text-{fill}-foreground` | pair-tested | any text on a solid token fill |

**Do:** choose by role; put text on a fill only via its paired `*-foreground`; express "disabled" with `disabled:opacity-50` on the control.
**Don't:** `text-white`, `text-black`, `text-slate-*`, `text-{hue}-N`, `text-white/NN`, `text-accent` on text (icons are fine), legacy `placeholder-*`, or dimming readable content with `opacity-*` (GAP-D-14).

**Codemod (by role, not by shade). Order: dialog surfaces first, then text (D5).**

| From | To | Condition |
|---|---|---|
| `text-white`, `hover:text-white`, `group-hover:text-white` | `text-foreground` (+ variants) | element and ancestors have no solid fill |
| `text-white` on `bg-accent` | `text-accent-foreground` | visual change: navy on accent 4.69:1 replaces white on accent 3.81:1 (fails today) |
| `text-white` on `bg-red-500` / `bg-rose-5–6xx` / `bg-destructive` | `text-destructive-foreground` (fill → `bg-destructive`) | `bg-red-500 text-white` is 3.76:1 |
| `text-white` on `bg-success` / `bg-info` | `text-success-foreground` / `text-info-foreground` | |
| `text-slate-950/900` on light fills | the fill's `*-foreground` | `frontend/src/components/kri/KriModalFooter.tsx:53`, `.btn-primary` |
| `text-slate-(50\|100\|200\|300)` | `text-foreground` | |
| `text-slate-(400\|500\|600\|700)` | `text-muted-foreground` | slate-600 fails even in riskhub (2.14:1) |
| `text-(rose\|red)-(300\|400\|500)` | `text-destructive` | |
| `text-(emerald\|green)-(300\|400)` | `text-success-text` | |
| `text-(amber\|yellow)-(100…400)` | `text-warning-text` | |
| `text-orange-(300\|400)` | `text-severity-high-text` | D1 |
| `text-(sky\|blue\|cyan)-(300\|400)` | `text-accent-text` | |
| `text-accent` on non-icon elements | `text-accent-text` | keep on PascalCase icon components |
| `placeholder-slate-500`, `placeholder:text-slate-*` | `placeholder:text-muted-foreground` | DS-32 |

**Ordering rules:** (R-d) a dialog's surface and its inner text change in one PR (D5; NEW-V1-01 in DS-07); (R-e) the D2 stop-gap excludes dark-surface ancestors (`[class*="bg-slate-9"]`) and coloured fills; (R-f) solid-fill detection must look at ancestors, so run the same-line grep in §12.2 and rely on G-RENDER for the rest; (R-g) the stop-gap is deleted at Phase 2 exit, so the app-wide text codemod is a Phase 2 item.
**Guards:** G-RATCHET `text-white`, `raw-palette`, `text-accent-as-text`; G-ESLINT text bans; G-RENDER (the only guard that catches ancestor-fill mistakes).

### 4.4 Severity, status and RAG (single source)

**Findings:** PG-01, PG-02, DS-06, PG-32, PG-40, GAP-D-12, GAP-B-16; status tones in PG-03 and DS-13.

Two scales, deliberately separate.

**A. Status tones (5):** lifecycle, monitoring and outcome status. Canonical: `frontend/src/lib/monitoringStatus.ts` `BADGE_TONES` (`success | warning | danger | info | neutral`), moved to `lib/tones.ts` and re-exported. Domain presentation modules keep mapping *status → tone*.

**B. Severity bands (4, D1):** risk score, issue severity, KRI RAG, heatmaps and charts. Canonical: `frontend/src/lib/severity.ts` (new), extending `frontend/src/lib/riskScoreTheme.ts` and absorbing `useStatusTheme`:

```ts
export type SeverityBand = 'low' | 'medium' | 'high' | 'critical';
export function severityClass(variant: 'badge'|'fill'|'matrix-cell'|'card'|'text'|'slider', band: SeverityBand): string;
export function severityChartColor(band: SeverityBand): string;                    // readCssColor-based
export function classifyRiskScore(score: number, t: RiskScoreThresholds): SeverityBand;   // existing, ADR-008
export function riskScoreVariantClass(v, score, t): string;                               // existing, ADR-008
export const ISSUE_SEVERITY_BAND: Record<IssueSeverity, SeverityBand>;
export const CRITICALITY_CLASS_TONE: Record<CriticalityClass, 'success'|'warning'|'destructive'>; // 3-step, same tokens (D1)
```

| Band | Fill | Soft badge | Text | Matrix cell |
|---|---|---|---|---|
| low | `bg-success text-success-foreground` | `bg-success/10 text-success-text border-success/20` | `text-success-text` | `bg-success/40` |
| medium | `bg-warning text-warning-foreground` | `bg-warning/10 text-warning-text border-warning/20` | `text-warning-text` | `bg-warning/40` |
| high | `bg-severity-high text-severity-high-foreground` | `bg-severity-high/10 text-severity-high-text border-severity-high/20` | `text-severity-high-text` | `bg-severity-high/40` |
| critical | `bg-destructive text-destructive-foreground` | `bg-destructive/10 text-destructive border-destructive/20` | `text-destructive` | `bg-destructive/40` |

**Rules:** blue/info never denotes severity (D1); every severity surface also renders a text label or legend, and heatmap cells carry an `aria-label`; thresholds come only from `useRiskThresholds()` (ADR-008); DORA workbook labels stay verbatim and only their colour maps through tokens; `CriticalityClassPill` keeps 3 steps sourced from the same tokens (D1).

| Site | Change |
|---|---|
| `frontend/src/components/RiskQuickViewModal.tsx:23-25` | `riskScoreVariantClass('badge', level, thresholds)` via `useRiskThresholds()` |
| `frontend/src/hooks/useStatusTheme.ts` `.matrix` / `.control` / `.kri` | `severityClass('matrix-cell', band)` / `BADGE_TONES`; delete the hook |
| `frontend/src/hooks/useChartTheme.ts` `issueSeverity` | `severityChartColor(band)` |
| `frontend/src/components/issues/issueUi.ts:53-58` `issueSeverityClass` | `severityClass('badge', ISSUE_SEVERITY_BAND[s])` |
| `frontend/src/components/ict-register/CriticalityClassPill.tsx:14-34` | the same tokens; `VENDOR_TIER_PILLS` via the addendum mapping |
| `frontend/src/components/dashboard/RiskCommitteeCards.tsx:32-35` | `severityClass` |
| `frontend/src/components/dashboard/RiskDistributionMatrix.tsx:119-131` legend and `frontend/src/components/dashboard/FilterBar.tsx:54-56` | existing `dashboard:risk_levels.*` keys, not `issues.severity.*` |
| `frontend/src/components/dashboard/ictCommittee/IctCommitteeExecutiveSummarySection.tsx:101` inline `style` | `bg-heat-N text-heat-N-foreground` |

**Ordering rules:** the ADR-015 addendum (D1) is merged before any palette codemod; changing `riskScoreTheme` medium from blue to amber changes every register badge, so announce it and refresh screenshot baselines; in light, `--warning-text` and `--severity-high-text` are 16° apart, so always render the label and test CIEDE2000 ΔE ≥ 20 between the fills (all matrix cells start at `/40`; raise one band's opacity only if that test fails).
**Guards:** extend the ADR-008 `no-restricted-syntax` rule (`frontend/eslint.config.js:112`) from `^(5|10|15|16)$` to any integer and from the current properties to `/^(net_score|gross_score|score|level|risk_score)$/` outside `lib/severity.ts`; `severityConsistency.test.ts` asserts every adapter maps each band to the same token family; update spec row S5 from "resolved" to "partially resolved" until G-RATCHET reaches 0.

### 4.5 Typography

**Findings:** DS-14, DS-15, DS-13 (pill sizes).

```js
// frontend/tailwind.config.js theme.extend: NEW keys (add to tailwind.config.js)
fontFamily: { sans: ['"Inter Variable"', 'system-ui', 'sans-serif'], heading: ['"Outfit Variable"', '"Inter Variable"', 'sans-serif'] }, // makes the 6 font-heading uses work (D6)
fontSize:   { '2xs': ['0.6875rem', { lineHeight: '1rem' }] },  // 11px: .text-eyebrow and Badge size="sm" only (D6, amended 2026-10-01)
// frontend/src/index.css @layer components: NEW utility (add to index.css)
.text-eyebrow { @apply text-2xs font-semibold uppercase tracking-wide text-muted-foreground; }   // D6: 11px / 600 / tracking-wide
```

| Role | Element | Recipe |
|---|---|---|
| Page title | `h1`, one per route, only from `PageHeader` / `EntityDetailHeader` / `AuthFrame` | `font-heading text-3xl font-bold tracking-tight text-foreground` (D7) |
| Section title | `h2` | `font-heading text-xl font-semibold text-foreground` |
| Card / subsection title | `h3` | `font-heading text-base font-semibold text-foreground` |
| Dialog title | `h2` in `DialogHeader` | `font-heading text-lg font-semibold text-foreground` |
| Eyebrow / uppercase label | `p`, `span`, `dt` | `.text-eyebrow` (replaces 533 lines in 48 combinations) |
| Form label | `Label` | `text-sm font-medium text-foreground` |
| Body / meta | — | `text-sm text-foreground` / `text-xs text-muted-foreground` |
| KPI value | `p`, never a heading | `font-heading text-3xl font-bold tabular-nums text-foreground` |
| Table header | `th` | `text-xs font-bold uppercase tracking-wider text-muted-foreground` (`frontend/src/components/tables/SortableTable.tsx:260`, D14) |

**Rules (D6, amended 2026-10-01):** 11px only for (a) uppercase eyebrows via `.text-eyebrow` and (b) the compact `Badge size="sm"` (§4.9); nothing below 11px anywhere; everything else at least 12px; no `font-black` in app UI; heading levels follow document structure (h1 → h2 → h3) and visual size comes from the role class; read-only label/value pairs use `<dl><dt><dd>`, not `<label>`.
**Codemod:** `text-[6–10px] … uppercase tracking-* font-(black|bold) text-slate-*` → `text-eyebrow`; non-uppercase `text-[10px]` → `text-xs`; New/Edit `<h2 className="text-3xl font-black …">` → `PageHeader`; stat `h3` values → `<p>`; `font-black` → `font-bold`.
**Risk:** 10px → 11/12px plus long Czech strings can overflow fixed pills; run G-RENDER at 1024px with `cs`.
**Guards:** G-RATCHET `micro-font`; G-ESLINT micro-font ban; a Playwright assertion `expect(page.locator('h1')).toHaveCount(1)` per audit route; keep axe `heading-order` enabled.

### 4.6 Layout tokens: spacing, page container, radius, z-index, motion, focus, icons

**Findings:** DS-16, DS-25, DS-26, DS-27, DS-30, DS-31, RS-01, RS-03.

```js
// frontend/tailwind.config.js theme.extend: NEW keys (add to tailwind.config.js), except radii sm…2xl (exist) and boxShadow.glass (exists; value changes)
borderRadius: { DEFAULT: 'var(--radius-sm)' /* bare `rounded` = 8px, D14 */, sm, md, lg, xl, '2xl' },
boxShadow:    { glass: 'var(--glass-shadow)', popover: '0 10px 38px -10px hsl(var(--foreground) / 0.25)' },
zIndex:       { sidebar: '40', header: '45', skiplink: '60', overlay: '9000', modal: '9999', 'modal-overlay': '10000', popover: '10050', toast: '10100' },
transitionDuration: { fast: '150ms', base: '200ms', slow: '300ms' },
maxWidth:     { page: '1520px', form: '960px', prose: '72ch' },   // D11
```

| Radius | Role |
|---|---|
| `rounded-md` (10px) | compact controls (`Button size="compact"`) |
| `rounded-lg` (12px) | ordinary controls: `Button`, `Input`, `Select`, `Textarea` (D14's 12px; see §3.1) |
| `rounded-xl` (14px) | nested panels, inner cards and toasts (§4.16) |
| `rounded-2xl` (16px) | cards, dialogs, page sections |
| `rounded-full` | pills, avatars, switches |
| `rounded` (8px) | small chips, kbd |

No `rounded-3xl`, no arbitrary radius.

**Page container (D11).** `MainLayout`'s `<main>` owns the gutter (`px-6 py-6 md:px-8 md:py-8`); pages never add outer padding.

```tsx
// frontend/src/components/layout/PageContainer.tsx (new)
interface PageContainerProps { size?: 'default' | 'form' | 'prose'; children: ReactNode; className?: string }
// default → "mx-auto w-full max-w-page space-y-8"; form → "mx-auto w-full max-w-form space-y-8"; prose → "max-w-prose"
```

Rhythm: page sections `space-y-8`, inside a card `space-y-6`, form fields `space-y-4`, field internals `space-y-1.5`. Card padding `p-6` (compact `p-4`); dialogs `p-0` with header/body/footer padding. Stat grids `grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]` (RS-01). Header rows `flex flex-wrap items-start justify-between gap-4` (RS-03).

**Focus.** One NEW utility (add to `frontend/src/index.css`) used by every primitive, plus a NEW global fallback:

```css
@layer utilities { .focus-ring { @apply focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background; } }
@layer base { :focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; } }
```

**Motion:** `transition-colors duration-base` by default, `transition-[transform,opacity]` for movement, no `transition-all`; keep the global reduced-motion rule and `<MotionConfig reducedMotion="user">`.
**Icons:** lucide only; `size-4` inline and in buttons, `size-5` section headers and dialog close, `size-8` page-state spinners, `size-12` empty/denied illustrations; entity → icon map in `frontend/src/constants/entityIcons.ts` (new) (NAV-03).

| From | To |
|---|---|
| page-root `p-8` / `p-6` inside `MainLayout`; root `space-y-3/4/6/10` | remove; `<PageContainer>` |
| `rounded-3xl`, `rounded-[…]` | `rounded-2xl` |
| raw-control `rounded-xl` | disappears with primitive adoption; residue → `rounded-lg` |
| `z-[9999]` / `z-[10000]` / `z-[10050]` / `z-[60]` | `z-modal` / `z-modal-overlay` / `z-popover` / `z-skiplink` |
| `outline-none focus:border-accent/50`; `focus-visible:ring-1` in `frontend/src/components/ui/button.tsx:8`, `frontend/src/components/ui/input.tsx:25` | `focus-ring` |
| `transition-all`; `duration-200/300` | `transition-colors`; `duration-base` / `duration-slow` |

**Risks:** `borderRadius.DEFAULT` moves 92 bare `rounded` sites from 4px to 8px (accepted by D14); `max-w-page` changes very wide screens on all registers (accepted by D11); the ring offset colour must be `ring-offset-background`.
**Guards:** G-RATCHET `z-arbitrary`, `radius-offscale`; ESLint literal ban on `transition-all`; a keyboard-tab screenshot per theme in `tests/frontend/e2e/dora-ux-stateful-a11y.spec.ts`.

### 4.7 Buttons and the primary CTA

**Findings:** DS-09, DS-10 (buttons), DS-29, PG-08, PG-28, GAP-B-03, GAP-D-05, AX-01.

**Canonical:** `frontend/src/components/ui/button.tsx`, extended:

```ts
variant: {
  accent:      "bg-accent text-accent-foreground shadow-sm hover:bg-accent-hover",                 // THE primary CTA (D4)
  default:     "bg-primary text-primary-foreground shadow hover:bg-primary/90",                    // deprecated alias
  secondary:   "bg-secondary text-secondary-foreground border border-border shadow-sm hover:bg-tint/10",
  outline:     "border border-input bg-transparent shadow-sm hover:bg-tint/10 hover:text-foreground", // DS-29
  ghost:       "hover:bg-tint/10 hover:text-foreground",                                            // DS-29
  destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
  warning:     "bg-warning text-warning-foreground shadow-sm hover:bg-warning/90",                  // break-glass
  success:     "bg-success text-success-foreground shadow-sm hover:bg-success/90",                  // KRI "record value"
  link:        "text-accent-text underline-offset-4 hover:underline",
},
size: { default: "h-10 px-4", lg: "h-11 px-6 text-base", compact: "h-8 rounded-md px-3 text-xs", icon: "h-10 w-10", iconCompact: "h-8 w-8 rounded-md" },
// base: "focus-ring" replaces "focus-visible:ring-1 focus-visible:ring-ring"
type IconButtonProps = ButtonProps & { size: 'icon' | 'iconCompact'; 'aria-label': string };   // icon-only requires a name
```

Derived thin components (all new; `BackButton` and `RefreshButton` in `frontend/src/components/ui/`, `RowActionButton` and `RowRestoreButton` in `frontend/src/components/tables/`, per PG-28): `BackButton({ to | onClick, label })` (labelled, name = destination, D14); `RefreshButton({ onRefresh, isFetching, label })` with `aria-busy`; `RowActionButton({ icon, label, onClick, disabledReason? })` with `aria-label` and `aria-disabled` + tooltip; `RowRestoreButton` = `RowActionButton` + `ArchiveRestore` + NEW key `common:actions.restore` (en + cs; replaces `common:actions.unarchive` in row actions, DS-13).

**Action-row contract (page and detail headers):** one labelled `accent` action, then labelled `outline` secondaries, then the destructive action last (labelled). Icon-only actions are allowed only as `RowActionButton` inside tables. Dialog footers: Cancel = `secondary`, Confirm = `accent` or `destructive`, submit rightmost.
**Do:** `<Button>` for every non-navigation action; `<Link className={buttonVariants(…)}>` for navigation.
**Don't:** raw `<button className=…>`, `.btn-primary` / `.btn-secondary` (deleted, D4), caller height or radius overrides, `ISSUE_*_BUTTON` constants, colour classes on `Button`.

| From | To |
|---|---|
| `className="btn-primary"` (10) | `<Button variant="accent" size="lg">` |
| `className="btn-secondary …"` (`frontend/src/components/risk-form/RiskFormOwnershipStep.tsx:179`) | `<Button variant="secondary" size="compact">` |
| `<Button className="bg-accent … hover:bg-accent-hover">` (35 lines / 30 files); raw `<button>` with `bg-accent` (68) | `<Button variant="accent">` |
| raw `bg-red-500 text-white` | `<Button variant="destructive">` |
| raw `glass rounded-xl text-slate-300 hover:text-white` | `<Button variant="secondary">` |
| `ISSUE_PRIMARY/SECONDARY/WARNING/SUCCESS_BUTTON` | `accent` / `secondary` / `warning` / `success` |
| unnamed icon-only `<button>` | `<Button size="iconCompact" aria-label=…>` + `aria-hidden` icon |
| `frontend/src/components/ErrorBoundary.tsx:63` raw button | `buttonVariants({ variant: 'accent' })` (keeps the boundary dependency-light) |

**Risks:** the `outline`/`ghost` hover change touches all 107 `<Button>` users (visual diff in the primitive PR); `accent` is navy-on-blue, a visible brand change accepted by D4.
**Guards:** G-ESLINT `button` ban; G-RATCHET `raw-button`, `btn-classes`; the TS icon-button union; selector `JSXElement[openingElement.name.name='Button']:has(JSXAttribute[name.name='size'][value.value=/^icon/]):not(:has(JSXAttribute[name.name=/^aria-label(ledby)?$/]))`.

### 4.8 Form controls

**Findings:** DS-02, DS-04, DS-10, AX-04, GAP-B-07, GAP-D-26, DS-28, DS-18 (radios), GAP-C-15.

Every control is **`Field` + a primitive**. `frontend/src/components/ui/field.tsx` is canonical and correct; extend it:

```ts
export interface FieldProps {
  label: React.ReactNode; children: (field: FieldControlProps) => React.ReactNode;
  id?: string; help?: React.ReactNode; error?: React.ReactNode;
  required?: boolean;             // renders the aria-hidden "*" + aria-required (D14)
  optional?: boolean;             // NEW: "(optional)" via common:labels.optional (key to be created)
  labelVisuallyHidden?: boolean;  // NEW: compact filter bars (sr-only label, never placeholder-only)
  layout?: 'stack' | 'inline';    // NEW: inline for Switch/Checkbox rows
  className?: string; labelClassName?: string;  // labelClassName deprecated once text-eyebrow exists
}
```

| Primitive | File | API sketch |
|---|---|---|
| Input | `frontend/src/components/ui/input.tsx` (convert to `cva`) | `size?: 'default' \| 'compact'` (32px for `SearchableEntitySelect` and filters), `leadingIcon?: LucideIcon`; tokens `border-input bg-input/40 text-foreground placeholder:text-muted-foreground focus-ring` |
| Textarea | `ui/textarea.tsx` (new) | textarea attrs + `autoResize?`; same tokens, `min-h-[5rem] py-2.5 resize-y` |
| Select | `frontend/src/components/ui/ThemedSelect.tsx` (canonical) | TS overload: `triggerAriaLabel` **or** `aria-labelledby` required |
| MultiSelect | `ui/multi-select.tsx` (new) | `options, value: string[], onChange`; listbox with `aria-multiselectable` or Popover + checkboxes (§3.1) |
| NativeSelect | `ui/native-select.tsx` (new) | pre-auth and admin forms; `Input` geometry and `focus-ring` |
| Checkbox | `ui/checkbox.tsx` (new) | native `input[type=checkbox]`, `checked, onCheckedChange, indeterminate?`; `size-4 border-input accent-accent focus-ring` |
| RadioGroup | `ui/radio-group.tsx` (new) | `value, onValueChange, options, variant?: 'list' \| 'card'`; native radios in `fieldset`/`legend`; card variant copies `frontend/src/components/settings/AppearanceSettings.tsx:61` |
| Switch | `ui/switch.tsx` (new) | `<button type="button" role="switch" aria-checked>`; requires `aria-labelledby` or `aria-label`; track `bg-input` → `bg-accent`, `h-6 w-11`, `focus-ring` |

**Rules:** `<Field label required error>{(f) => <Input {...f} />}</Field>`; wrap forms in `<form onSubmit noValidate>` with a `type="submit"` primary; `<fieldset disabled={isSubmitting}>` while submitting; per-field errors plus one form-top `InlineMessage tone="danger"` for server errors, focus on the first invalid field, never the same error twice; required marker `*` via `Field` (D14).
**Don't:** raw `<input>`/`<textarea>`/`<select>` outside `ui/` (only exception: the hidden native Add-filter select in `RegisterListToolbar`, per `frontend/src/components/ui/README.md`), placeholder as the only label, `<label>` for read-only values, hard-coded English validation strings.
**Wizard footer:** `WizardFooter` (new, `frontend/src/components/ui/`) renders Back / Cancel / Next-or-Submit with the submit as `Button variant="accent"`; the Risk, Control and KRI wizards use it (DS-10).

| From | To |
|---|---|
| `<label …>{t(x)}</label><input className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white …">` | `<Field label={t(x)} required error>{(f) => <Input {...f} />}</Field>` |
| `<textarea className={TEXTAREA_CLASS}>` (3 identical constants) | `<Textarea {...f} />`; delete the constants |
| `<input type="checkbox">` + adjacent text | `<Field layout="inline">{(f) => <Checkbox {...f} />}</Field>` |
| three switch copies (`frontend/src/components/riskhub/SystemSettingsPanel.tsx:60-79`, `frontend/src/components/settings/NotificationSettings.tsx:26`, `frontend/src/components/riskhub/ApprovalScenariosPanel.tsx:125`) | `<Switch aria-labelledby={nameId} />` |
| `<select className="… bg-slate-900 … text-white">` (filter bars) | `<ThemedSelect allowEmpty triggerAriaLabel=… />` |
| `rounded-md border bg-background p-2` native selects | `<NativeSelect>` |
| `frontend/src/components/reports/ExportDialog.tsx:138,160` radios; `frontend/src/components/settings/LocalizationSettings.tsx:53` language buttons | `<RadioGroup>` / `<RadioGroup variant="card">` |
| `frontend/src/components/riskhub/ApprovalScenariosPanel.tsx:203-245` fake listbox | `<MultiSelect>`; chip removal labelled "Remove" |
| banner-only validation (Control, KRI, Issue) | per-field error maps + one server banner |

**Ordering:** forms inside dark dialogs (`ControlCreateDialog`, `IssueQuickCreateModal`) migrate only after their dialog surface (D5). `Input` is 40px against ~46px raw inputs; forms get denser (ADR-015 geometry). The switch migration keeps NotificationSettings' optimistic rollback and adds an inline error.
**Guards:** G-ESLINT label selector, `textarea` and raw `select` bans; G-RATCHET `raw-text-input`; G-UNIT per primitive; one stateful axe pass per migrated form in `tests/frontend/e2e/dora-ux-stateful-a11y.spec.ts` (lint alone never proves labelling, AX-00).

### 4.9 Badges and status pills

**Findings:** DS-13, PG-28, PG-29, PG-46, PG-03 (labels).

```ts
// frontend/src/components/ui/badge.tsx (new, visual shell only; vocabulary stays domain-owned)
const badgeVariants = cva("inline-flex items-center gap-1 whitespace-nowrap border font-bold", { variants: {
  tone:    { neutral, info, success, warning, danger, accent, 'severity-high' },   // BADGE_TONES / severity recipes
  variant: { soft, solid, outline },                                              // soft = "bg-{t}/10 text-{t}-text border-{t}/20"; solid = "bg-{t} text-{t}-foreground border-transparent"
  size:    { sm: "h-5 px-2 text-2xs uppercase tracking-wide", md: "h-6 px-2.5 text-xs" },
  shape:   { pill: "rounded-full", rounded: "rounded" } },
  defaultVariants: { tone: 'neutral', variant: 'soft', size: 'md', shape: 'pill' } });
interface BadgeProps { icon?: LucideIcon /* aria-hidden */; srLabel?: string /* icon/abbrev badges */ }
```

Domain wrappers stay in their modules: `RiskStatusBadge`, `ControlStatusBadge`, `QuestionnaireStatusBadge`, `PendingChangeBadge`, `ArchivedBadge`, `SeverityBadge` (= `Badge` + `severityClass`), `CriticalityClassPill` and `RiskTypeBadge` on `Badge` geometry.
**Rules:** badges always show a translated label (never the raw enum); icon-only badges need `srLabel`; one geometry app-wide (`rounded-full`; `shape="rounded"` only for `RiskTypeBadge` and kbd-like chips), `md` in tables and headers, `sm` only in dense cells); update the `frontend/src/components/ui/README.md` "no shared status component" line: the visual shell is shared, the vocabulary is not.

| From | To |
|---|---|
| `rounded-md text-[10px] font-bold uppercase ${getRiskStatusColor(s)}` + `{displayStatus}` | `<RiskStatusBadge status={s} />` |
| `bg-green-500/20 text-green-400`, `bg-emerald-500/20 text-emerald-400`, `bg-success/10 text-success-text` | `<Badge tone="success">` |
| `ARCHIVED_CONTROL_BADGE_CLASS_NAME`, KRI `bg-slate-500/15 … text-slate-300` | `<ArchivedBadge />` |
| pending badges (Risk, Control, Process, Asset, Vendor) | `<PendingChangeBadge />`; add it wherever `has_pending_*` exists (Threat, KRI, Issue) |
| `frontend/src/pages/IctRegisterDqPage.tsx:27,65` `StatusPill` / `SeverityChip`; `VendorBadge` | `Badge` / `SeverityBadge` |

**Guards:** G-RATCHET `pill-inline`; a unit test that each `*StatusBadge` resolves a key for every enum member in both locales.

### 4.10 Cards, surfaces and inline messages

**Findings:** DS-08, DS-20 (`bg-card`), SM-09, AX-05, SM-15, DS-32.

Surface = `glass` (D5). Primitives in `frontend/src/components/ui/card.tsx` (new):

```tsx
interface CardProps extends React.HTMLAttributes<HTMLElement> {
  as?: 'section' | 'div' | 'article'; padding?: 'none' | 'compact' | 'default';   // p-0 / p-4 / p-6
  interactive?: boolean;  tone?: 'default' | 'nested';                            // glass vs bg-nested
}
export function Card(p: CardProps); export function CardHeader(p: { title; titleAs?: 'h2'|'h3'; eyebrow?; description?; actions? });
export function CardBody(p); export function CardFooter(p);                     // footer: border-t border-border pt-4 flex justify-end gap-3
// frontend/src/components/ui/inline-message.tsx (new)
interface InlineMessageProps { tone: 'info'|'success'|'warning'|'danger'|'neutral'; title?; children; action?;
  onDismiss?: () => void;                 // renders a named iconCompact close button
  live?: 'polite'|'assertive'|'off' }     // default: danger → role="alert", others → role="status"
```

**Rules:** a page section is a `Card` with a `CardHeader` `h2`; never nest `glass` in `glass` (use `tone="nested"`); never double-pad; `DetailActionBanner` keeps its API and renders `InlineMessage`; `VendorInlineMessage` becomes a re-export; `.docs-reader-*` is rewritten on tokens so its 15 light-override blocks can go.
**Guard:** ratchet the `glass-card` count downwards once `Card` exists; G-RENDER on nested surfaces.

### 4.11 Dialogs and confirmations

**Findings:** DS-07, DS-08, PG-07, PG-22, GAP-D-08, PG-34.

**Canonical:** `frontend/src/components/DialogShell.tsx`, moved to `components/ui/dialog.tsx` and re-exported from the old path. Behaviour stays; raw class props are deprecated; the surface is fixed and themed (D5).

```tsx
interface DialogShellProps {
  isOpen: boolean; onClose: () => void; titleId: string; descriptionIds?: string[];
  role?: 'dialog' | 'alertdialog'; size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  closeDisabled?: boolean;                 // must be wired to isSubmitting
  initialFocusRef?: RefObject<HTMLElement>; children: ReactNode; dataTestId?: string;
  /** @deprecated migration only */ containerClassName?: string; backdropClassName?: string; contentClassName?: string;
}
// container "fixed inset-0 z-modal flex items-center justify-center p-4"; backdrop "absolute inset-0 bg-overlay backdrop-blur-sm"
// surface   "relative w-full {size} rounded-2xl border border-border bg-popover text-popover-foreground shadow-popover overflow-hidden flex max-h-[calc(100vh-2rem)] flex-col"
export function DialogHeader(p: { titleId; title; description?; icon?; tone?: 'default'|'danger'|'warning'|'info'; onClose?; closeDisabled? });
//   title: <h2 class="font-heading text-lg font-semibold text-foreground">; close: Button ghost iconCompact aria-label="Close"
export function DialogBody(p);    // "flex-1 overflow-y-auto p-6 space-y-4"
export function DialogFooter(p: { onCancel; cancelLabel?; submitLabel; submitForm?; onSubmit?; isSubmitting?; intent?: 'accent'|'destructive'|'warning'; extra? });
//   "flex items-center justify-end gap-3 border-t border-border bg-nested/50 px-6 py-4"; Cancel = secondary; submit rightmost
```

`ConfirmDialog` gains an `intent`; `ArchiveConfirmDialog` is deleted and its callers use `<ConfirmDialog intent="archive">`.

```ts
type ConfirmIntent = 'archive' | 'delete' | 'unlink' | 'send' | 'discard' | 'generic';
interface ConfirmDialogProps { isOpen; onClose; onConfirm: (reason?: string) => void | Promise<void>;
  intent: ConfirmIntent; entityLabel: string; entityName?: string; count?: number;
  reason?: 'none' | 'optional' | 'required';   // from one approval/capability flag (D10, PO to confirm)
  isLoading?: boolean; errorText?: string | null;   // errors stay in the dialog
  title?: string; message?: string; confirmLabel?: string }
```

| intent | Icon | Button | Title key (new, `common`, en + cs) | Confirm label | Body |
|---|---|---|---|---|---|
| `archive` | `Archive` | `destructive` | `common:confirm.archive.title` "Archive {{entity}}?" | `common:actions.archive` | "…can be restored later" (`confirmation.archive_reversible` exists) |
| `delete` | `Trash2` | `destructive` | `common:confirm.delete.title` | `common:actions.delete` | "This cannot be undone." |
| `unlink` | `Unlink` | `destructive` | `common:confirm.unlink.title` "Remove link to {{name}}?" | "Remove link" (new key) | "The {{entity}} itself is not deleted." |
| `send` | `Send` | `accent` | `common:confirm.send.title` (plural) | `common:actions.send` (new key) | plural count |
| `discard` | `AlertTriangle` | `warning` | dirty-guard copy | `common:actions.discard` (new key) | |

**Rules (D5, D10):** every destructive, irreversible or outbound bulk action goes through `ConfirmDialog` (`role="alertdialog"`), including link removal and contract/sub-outsourcing archive without an approval requirement; archive never uses `Trash2` or the word "Delete"; mutation errors stay in the open dialog via `errorText`; `closeDisabled={isSubmitting}` is mandatory for submitting dialogs and dirty forms use `useDirtyTaskGuard`; the title `id` sits on the `h2` only; dialogs never set surface colours.

| From | To |
|---|---|
| `backdropClassName="bg-slate-950/80 backdrop-blur-md"` and 7 other recipes | remove the prop |
| `contentClassName="… bg-slate-900/95 … max-w-2xl"` (11 dark dialogs) | `size="lg"` + Header/Body/Footer, **in the same PR as the inner text** |
| `contentClassName="glass-card w-full max-w-md …"` (6 double-padded) | `size="md"` + sub-components |
| 17 title recipes, e.g. `<h3 id={titleId} className="text-lg font-bold text-white">` | `<DialogHeader titleId title />` |
| 4 footer recipes | `<DialogFooter intent=… />` |
| `ArchiveConfirmDialog`, KRI `kris:delete_dialog.*` + `Trash2` | `<ConfirmDialog intent="archive" reason=… />` |
| `frontend/src/components/LinkManagementDialog.tsx:163-165` delete title/label; Threat→Risk one-click unlink | `intent="unlink"` |

**Ordering:** surface + inner text per dialog family in one PR (D5); moving `DialogShell` updates the dialog-inventory contract (`frontend/scripts/a11y/validate-dialog-inventory.mjs`) in the same PR; `ControlCreateDialog`'s inner white `glass-card` island becomes `Card tone="nested"`; Threat's reason policy needs a backend change, the UI part (keep errors in the dialog) ships first.
**Guards:** dialog-inventory contract fails if a `<DialogShell` passes `backdropClassName`/`containerClassName` or a colour class in `contentClassName`; G-ESLINT selector `JSXOpeningElement[name.name='DialogShell'] > JSXAttribute[name.name=/^(backdrop|container)ClassName$/]`; G-RENDER opens every `frontend/dialog-contract.html` site in 3 themes; a unit test that `intent="archive"` renders the `Archive` icon and no "Delete".

### 4.12 Tabs (D8)

**Findings:** DS-12.

```tsx
// frontend/src/components/ui/tabs.tsx (new, on useContentTabs; no Radix)
interface TabsProps<T extends string> { tabs: ReadonlyArray<{ id: T; label: ReactNode; icon?: LucideIcon; count?: number; disabled?: boolean }>;
  activeTab: T; onChange: (t: T) => void; idPrefix: string; variant?: 'underline' | 'pill'; ariaLabel: string }
export function TabList<T extends string>(p: TabsProps<T>); export function TabPanel<T extends string>(p: { tab: T; activeTab: T; idPrefix: string; children: ReactNode });
// underline (in-entity/detail): list "flex gap-1 border-b border-border"; tab "px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground aria-selected:text-accent-text aria-selected:border-b-2 aria-selected:border-accent focus-ring"
// pill (page-level views):      list "inline-flex gap-1 rounded-xl bg-nested/60 p-1"; tab "rounded-lg px-4 py-2 text-sm font-semibold aria-selected:bg-accent aria-selected:text-accent-foreground"
```

**Rules:** a switcher that filters data rather than switching panels (register table/grouped view, Governance stat cards) is not tabs; it is a segmented `Button` group with `aria-pressed` (`frontend/src/components/ict-register/RegisterListShell.tsx:237-251` already does this). The Dashboard uppercase pill style is retired.
**Codemod:** every `role="tablist"` + hand-written classes (10 files) → `<TabList>`; `frontend/src/pages/departments/DepartmentDetailTabs.tsx:41-50` and `frontend/src/pages/ActivityLogPage.tsx:83-93` → `<TabList>`; delete `.vendor-tab` and `.admin-tab-inactive`; remove `@radix-ui/react-tabs` in Phase 4.
**Guard:** G-ESLINT `JSXAttribute[name.name='role'][value.value='tab']` outside `ui/tabs.tsx` and `frontend/src/hooks/useContentTabs.ts`.

### 4.13 Tables and pagination (D14)

**Findings:** DS-11, AX-02, DS-29, GAP-D-10, GAP-D-22, PG-41, PG-42.

- **Data tables:** `frontend/src/components/tables/SortableTable.tsx`. **Static tables:** a new presentational `components/ui/table.tsx` (`Table` with `density`, `THead`, `TBody` `divide-y divide-border`, `TR` `hover:bg-tint/5`, `TH` with `scope="col"` and the `frontend/src/components/tables/SortableTable.tsx:260` header recipe, `TD`), which `SortableTable` renders internally.
- **Row activation lives in `SortableTable` (D14):**

```ts
interface SortableTableProps<T> {
  rowHref?: (item: T) => string;          // navigation → focusable trailing <Link> (existing)
  rowLabel?: (item: T) => string;
  onRowActivate?: (item: T) => void;      // in-page selection → named <button> in the first cell; Enter/Space; row click delegates
  /** @deprecated mouse-only */ onRowClick?: (item: T) => void;
  getRowActions?: (item: T) => ReactNode; // RowActionButton[] in a trailing cell
}
```

- **Pagination (one, D14):** `frontend/src/components/tables/Pagination.tsx` fixed with `text-foreground`, `Button` `iconCompact`/`compact`, `aria-current="page"`, `nav aria-label`, plus `mode: 'pages' | 'cursor'` for server cursors (Approvals, Notifications, KRI history).
- **Rules:** every table sits in the scroll container that `Table` provides; row dividers use `divide-border`; row actions are named `RowActionButton`s; truncation is CSS `truncate` + `title`, never `slice()+'...'`; the empty state is `EmptyState`, never "Loading data…" when nothing is loading; sortable headers are buttons with `aria-sort` on the `th`.

| From | To |
|---|---|
| raw `<table>` in `riskhub/*`, `roles/RolesTable`, `access/UsersTable`, `AuditTrailPage`, `SessionsTable`, `IctCommittee*`, `VendorDerivedSection`, `ProcessDetailPage`, `dashboard/DepartmentTable` | `Table` (static) or `SortableTable` |
| `<tr onClick={() => navigate(…)}>` | `rowHref` |
| `<tr onClick={() => onSelect(id)}>` | `onRowActivate` |
| `ActivityLogPagination`, Notifications chevrons, ICT DQ text pager, `frontend/src/pages/ApprovalsPage.tsx:140-178`, `frontend/src/components/kris/KRIDetailHistoryTab.tsx:128` | `<Pagination mode=…>` |
| `.theme-light th/tr`, `.theme-dark th/tr:hover` | delete after all tables use `divide-border` / `TR` |

**Guards:** G-ESLINT `table` and `tr[onClick]` bans; G-RATCHET `raw-table`; a unit test that `onRowActivate` renders a focusable named button per row; a keyboard-only Playwright path that opens a questionnaire from history.

### 4.14 Page layout and navigation

**Findings:** DS-15, DS-16, NAV-01, NAV-02, NAV-03, NAV-04, AX-06, AX-09, SM-05, PG-08.

Two header components, one `h1` rule (D7):

```tsx
// frontend/src/components/layout/PageHeader.tsx (new): registers, dashboards, settings, admin, approvals, New/Edit forms
interface PageHeaderProps {
  title: ReactNode;               // <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
  documentTitle?: string;         // document.title = `${documentTitle} · RiskHub` (D14)
  eyebrow?: ReactNode; description?: ReactNode; icon?: LucideIcon;
  back?: { to: string; label: string } | { onClick: () => void; label: string };   // BackButton, labelled by destination (D14)
  breadcrumbs?: Array<{ label: string; to?: string }>;                              // detail/edit pages (D14)
  actions?: ReactNode;            // wraps: flex-wrap gap-4
}
// frontend/src/pages/detail/EntityDetailHeader.tsx (existing, canonical for entities): add back, breadcrumbs, documentTitle; same h1 recipe (D7)
```

Shared pieces: `usePageTitle(title)` (new; sets `document.title`, announces via the `MainLayout` live region); `MainLayout` focuses the page `h1` after a **pathname** change (not on in-page tab changes; `frontend/src/pages/native/NativeFrame.tsx:18` is the reference) and wraps the `Outlet` in `<Suspense fallback={<LoadingState layout="page" />}>`; `LanguageProvider` syncs `document.documentElement.lang` (D14); `AppRouteDef.activeNavHref?` assigns unowned routes to a sidebar parent; new `frontend/src/pages/detail/EditBlockedState.tsx`, `OwnershipGovernanceAlert.tsx` and `DetailField.tsx`; new `frontend/src/constants/entityIcons.ts`.
**Back navigation (D14):** the label names the destination (`actions.back_to_register`, new `common:actions.back_to_detail` "Back to {{name}}"); destinations honour `return_to`; always a labelled `BackButton`; never `t('back') + t('title')`.

| Page | Change |
|---|---|
| `RiskNewPage`, `RiskEditPage`, `ControlNewPage`, `ControlEditPage`, `KRINewPage`, `IssueNewPage` | `<PageHeader title icon back breadcrumbs />` + whole-phrase back keys |
| `frontend/src/pages/KRIDetailPage.tsx:115-211`, `frontend/src/pages/IssueDetailPage.tsx:104-142`, `frontend/src/pages/ThreatDetailPage.tsx:392`, `frontend/src/pages/ProcessDetailPage.tsx:451`, `frontend/src/pages/departments/DepartmentDetailHeader.tsx:32` | `EntityDetailHeader`; drop `p-8` and `motion` wrappers |
| `frontend/src/pages/dashboard/DashboardHeader.tsx:51`, `frontend/src/pages/DepartmentsPage.tsx:48`, `frontend/src/pages/GovernancePage.tsx:252`, `frontend/src/pages/AuditTrailPage.tsx:142,165`, `frontend/src/pages/ApprovalsPage.tsx:75`, `frontend/src/pages/RiskHubPage.tsx:60`, `frontend/src/pages/SettingsPage.tsx:45`, `frontend/src/pages/AdminConsolePage.tsx:56`, `frontend/src/pages/users/UsersPageHeader.tsx:29`, `NotificationsPage` | `PageHeader` |
| `frontend/src/components/ict-register/RegisterListShell.tsx:206` | renders `PageHeader` internally |
| `frontend/src/components/dashboard/IctCommitteeSection.tsx:103` `<h1>` | `<h2>` |
| Threat/Process/Asset/Vendor edit-blocked views | `EditBlockedState` |

**Guards:** the one-`h1` assertion (§4.5); a Playwright check that `document.title` differs between two routes and is translated in `cs`, and that `documentElement.lang === 'cs'` after switching; G-ESLINT `h1` outside `PageHeader`, `EntityDetailHeader`, `NotFoundPage`, `DesktopOnlyNotice`, `NativeFrame`, `AuthFrame`.

### 4.15 Page states

**Findings:** DS-17, GAP-C-11, GAP-D-20.

```tsx
// frontend/src/components/ui/state.tsx (new). TableErrorState stays as the table-contract adapter over ErrorState.
type StateLayout = 'page' | 'section' | 'inline';
export function Spinner(p: { size?: 'sm'|'md'|'lg'; label?: string });              // Loader2 animate-spin text-accent-text; role="status" + sr-only label
export function Skeleton(p: { className?: string });                                  // "animate-pulse rounded-lg bg-tint/10" aria-hidden
export function LoadingState(p: { layout?: StateLayout; label?: string; skeleton?: ReactNode });  // role="status" aria-live="polite" aria-busy
export function EmptyState(p: { layout?; icon?; title: string; description?; kind?: 'no-data'|'no-results'; action? });  // role="status"
export function ErrorState(p: { layout?; variant?: 'block'|'banner'; title?; messageKey?; onRetry?; retryLabel? });     // role="alert"
export function AccessDeniedState(p: { layout?; descriptionKey?: string; ns?: string });                               // ShieldX + heading, text-foreground
```

**Rules:** every query-backed region renders exactly one of: `LoadingState` (first load), `ErrorState` (error, no data), `ErrorState variant="banner"` + stale data (refetch error), `EmptyState`, or data; pick with the existing `resolveCollectionOutcome` / `resolveTableErrorContract`; an error never falls through to an empty state; row-level mutation failures never flip the list into its error state (D9); icons `aria-hidden`; tokens only.
**Charts:** `ChartFrame` (new, `frontend/src/components/ui/`) gives every chart `role="img"` with a summary `aria-label`, an optional sr-only data table, and `EmptyState` when there is no data (GAP-D-11).
**Guards:** G-RATCHET for `animate-spin` outside `ui/` and `border-t-transparent`; G-UNIT per state primitive; optional custom ESLint rule for `useQuery` destructuring without `isError`/`error`.

### 4.16 Feedback and toasts (D9, D12)

**Findings:** FB-01, AX-05, GAP-D-09.

```ts
// frontend/src/components/ui/toast.tsx (@radix-ui/react-toast, new dependency) + frontend/src/hooks/useFeedback.ts; FeedbackProvider in App.tsx
type FeedbackTone = 'success' | 'info' | 'warning' | 'danger';
interface FeedbackOptions { title: string; description?: string; action?: { label: string; onClick: () => void }; durationMs?: number }
export function useFeedback(): { success(o: FeedbackOptions): void; info(o): void; warning(o): void;
  error(o: FeedbackOptions & { messageKey?: string }): void };   // error() renders tone 'danger'; translates errorKeys.* through translateUiMessage (NEW, §4.18, frontend/src/i18n/hooks.ts)
// viewport fixed bottom-right z-toast; item "bg-popover text-popover-foreground border border-border rounded-xl shadow-popover" + tone icon
// danger → assertive; others polite; default 5s, danger 8s, never auto-dismiss when it has an action
```

| Situation | Channel |
|---|---|
| Transient outcome of a user action (save, archive, restore, send, copy) | toast |
| Row-level action failure in a list | toast `error`; never `setErrorKey` on the list |
| Blocking error scoped to a region | `InlineMessage tone="danger"` (`role="alert"`) in that region |
| Persistent page state (pending approval, stale data, ownership pending) | `InlineMessage` |
| Validation | `Field` error + one form-top `InlineMessage` |
| Error inside an open dialog | `errorText` in the dialog |
| Approval queued after submit (D12, PO to confirm) | return to the entity page + persistent pending `InlineMessage` linking to `/approvals` + success toast |

**Codemod:** `setErrorKey(apiClient.toUiMessageKey(error))` in restore handlers (`frontend/src/pages/risks/useRisksPageState.ts:185`, `frontend/src/pages/controls/useControlsPageState.ts:124`, `frontend/src/pages/kris/useKrisPageState.ts:156`, `frontend/src/pages/threats/useThreatsPageState.ts:165`, `frontend/src/pages/vendors/useVendorsPageState.ts:214`) → `feedback.error`; router-state flashes (`controlFlash`, `vendorFlash`, `nativeInvitation`) → `feedback.success` before navigating; KRI bespoke banners → `InlineMessage` + toast; `SystemSettingsPanel` 2s `setTimeout` → `feedback.success`.
**Guards:** a grep ratchet for `setErrorKey(` inside mutation `onError` handlers; a unit test that `FeedbackProvider` announces through its live region.

### 4.17 Date and number formatting

**Findings:** I18N-03, PG-35, I18N-07, AX-09.

`frontend/src/i18n/formatters.ts` is canonical (`formatDateValue`, `formatDateTimeValue`, `formatRelativeDateValue`, `formatNumberValue`, `formatMetricNumberValue`); expose it through one hook:

```ts
// frontend/src/i18n/hooks.ts: extend useFormattedDate → useFormat()
export function useFormat(): { date(v, o?), dateTime(v, o?), time(v), relative(v), number(v, o?), metric(v, unit?),
  percent(v, digits?), currency(v, currency = 'CZK'), count(n, key: string) /* t(key, { count: n }) */ };
```

**Rules:** default date style `month: 'short'`; numbers `tabular-nums`, currency right-aligned; language from `useLanguage()` only; no `toLocaleString(` or `new Intl.*(` outside `src/i18n/`; no `.toUpperCase()` on translated strings (CSS `uppercase`); `LanguageProvider` sets `document.documentElement.lang` and the login-only writers are deleted.
**Guards:** G-ESLINT `CallExpression[callee.property.name=/^toLocale(String|DateString|TimeString)$/]` and `NewExpression[callee.object.name='Intl']` outside `src/i18n/**`; Playwright `lang` check; remove `date-fns` in Phase 4.

### 4.18 i18n

**Findings:** I18N-01, PG-03, GAP-B-14, GAP-C-09, GAP-D-01..04, GAP-D-06, PG-30, PG-36, PG-37, I18N-05, I18N-06.

**Rules:** shared vocabulary (actions, fallbacks, labels, confirm, pending, states) lives only in `common`; module namespaces hold domain terms; whole-phrase keys with interpolation (`back_to_register`, `view_approvals`, `"created_count": "Created: {{count}}"`), never concatenation; any `{{count}}` string is a plural family (D15); enums always render through `t(\`<ns>:<enum>.${value}\`)` via a domain `…Meta()` helper, never through `.replace(/_/g, ' ')`; one NEW `translateUiMessage(t, key)` helper in `frontend/src/i18n/hooks.ts` for `errorKeys.*`; regulatory closed-list codes keep their raw value and get a translated label with a raw fallback (PO decision, §3.1); `docs/LOCALIZATION.md` gains a "Formatting and plurals" section and a scanner-scope note.
**Guards:** G-I18N (scanner fix + plural validator, ratchet 68 → 0); the concatenation selector; an enum-coverage unit test per enum union.

### 4.19 Vendor module fold-in (D13)

**Findings:** SM-09, GAP-C-08.

| Vendor piece | Becomes |
|---|---|
| `VendorSurface` / `VendorSectionHeader` | `Card` / `CardHeader` |
| `VendorBadge` | `Badge` |
| `VendorInlineMessage` | `InlineMessage` (gains role-by-tone) |
| `VendorEmptyState` | deleted in Phase 0 (0 uses, D16) |
| `.vendor-tab` | `TabList variant="underline"` |
| `.vendor-label` | `Field` label / `.text-eyebrow` |
| `.vendor-page { max-width: 1520px }` | `PageContainer` app-wide (D11) |

Vendor components first become thin aliases (Phase 1–2); the module migrates **last in Phase 3**, because it is already theme-safe and is the best regression reference; `frontend/src/components/vendors/vendorRoute.css` shrinks to layout and is deleted in Phase 4. Record the change as an additive disposition in `docs/quality/vendor-route-overhaul-2026-03-08.md` (D13 supersedes its exemption). Guard: G-RATCHET count of `className="vendor-`.

### 4.20 Login and public surfaces

**Findings:** DS-24, GAP-B-01, RS-02.

```tsx
// frontend/src/components/layout/AuthFrame.tsx (new): SSO, Native, Callback, ProdLoginPreview, Hero
interface AuthFrameProps { title: string /* h1, focused on change + document.title */; subtitle?: ReactNode; children: ReactNode;
  footer?: ReactNode; backdrop?: 'mesh' | 'plain'; error?: ReactNode /* role="alert", focused */; busy?: boolean }
// <main className="min-h-screen overflow-y-auto bg-background text-foreground"> header(BrandWordmark + LanguageSwitch)
//   section "mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center p-6"; card = Card className="w-full max-w-md shadow-popover"
```

Extract `components/layout/BrandWordmark.tsx` and `LanguageSwitch.tsx` (one pattern: an `aria-pressed` segmented `Button` pair). **Theme policy (D14):** pre-auth pages follow `prefers-color-scheme`, mapping dark → `theme-riskhub` and light → `theme-light`; tokens do the rest, which removes `bg-[#07111b]`.
**Guards:** extend G-ESLINT clean paths to `src/pages/login/**` after migration; the `/login` viewport probes (§4.1); a unit test that the production SSO view never renders `preview_note`.

---

## 5. Phased remediation roadmap

Effort is in engineer-days for one engineer. IDs are register entries (§6); an entry may span phases (for example a Phase 1 primitive and its Phase 3 adoption). Every PR ends with `tsc`, ESLint, `lint:a11y`, `lint:dialog-inventory`, the i18n gates, G-RATCHET and G-RENDER green.

### 5.1 Ordering dependencies (hard rules)

| # | Rule | Source |
|---|---|---|
| O1 | Delete confirmed-dead UI (`GroupedView`, `CategoryDrillDown`, `MiniHeatmap`, `VendorEmptyState`, `ViewSwitcher`, dead `[data-radix-select-trigger]` CSS, dead `getControlStatusColor` cases, `KRIModal` dead create/delete paths) **before any codemod**, so codemods and ratchet baselines do not count dead code | D16, PG-43, GAP-D-21 |
| O2 | Merge the **ADR-015 addendum** (D1 severity scale, D3 `tint`, D4 `accent`, D5 surfaces, D6 typography, D14 radius/`dark:`/text levels, chart-token reversal of FR-P1-8) before any palette or severity codemod | D1, PG-01, DS-06 |
| O3 | Commit G-RATCHET and G-RENDER (baseline mode) before the first codemod, so each codemod PR proves it lowered the counts | D15, NEW-V1-02 |
| O4 | A dialog's surface tokenisation and its inner-text fix ship **in the same PR**; never run `text-white → text-foreground` or raw input → `Input` inside a still-dark dialog. PR checklist: `IssueQuickCreateModal`'s inputs rely on their own dark overrides (`frontend/src/components/issues/IssueQuickCreateModal.tsx:178`); strip them only in the surface PR | D5, DS-07 (NEW-V1-01, R3-04) |
| O5 | The D2 stop-gap excludes coloured fills and dark dialog surfaces, is measured by G-RENDER, and is **deleted at Phase 2 exit**; therefore the app-wide text-token codemod (DS-01, DS-03, DS-02 colour) completes in Phase 2, not per module in Phase 3 | D2 |
| O6 | Replace `divide-white/*` with `divide-border` before deleting `.theme-light tr { border-color … !important }`; finish the `tint` codemod before deleting the `bg-white\/5` remap blocks | DS-22, DS-11 |
| O7 | `Badge`, severity pills and chart colours need the Phase 1 tokens and `lib/severity.ts` first | D1, DS-13 |
| O8 | Moving `DialogShell` to `components/ui/` updates the dialog-inventory contract in the same PR | DS-07 |
| O9 | Threat's archive reason needs a backend API change; the UI part (keep errors in the dialog) ships first | PG-07, D10 |
| O10 | The Vendor module migrates last in Phase 3 (thin aliases earlier) | D13 |
| O11 | Remove `@radix-ui/react-tabs` and `date-fns` only after the last consumer migration (Phase 4) | D8, I18N-07 |

### 5.2 Phase 0: guards, dead code and quick 🔴 fixes (≈ 7–10 days)

| # | Item | IDs | Effort |
|---|---|---|---|
| 0.1 | Delete dead UI and dead CSS (O1) | PG-43, GAP-D-21, DS-20, PG-32, PG-34, SM-09 (`VendorEmptyState`) | S |
| 0.2 | `ui-consistency-ratchet.mjs` + baseline JSON + CI step | AX-00, enables DS-01/03/06/10/13/14/22/27 | M |
| 0.3 | Contrast gate: fail or ratchet axe `incomplete`; commit `theme-rendered-contrast.spec.ts` in baseline mode (light 208 / riskhub 99 / dark 92) and the targeted probes | NEW-V1-02 | M |
| 0.4 | i18n scanner `allowShortWord`; `validate-plurals.mjs` (ratchet at 68) | AX-00 (I18N-02), GAP-B-14 | S |
| 0.5 | ADR-015 addendum (O2); spec S5 "resolved" → "partially resolved" | DS-06, PG-01 | S |
| 0.6 | Production SSO copy; login scrolls instead of clipping | GAP-B-01, RS-02 | S |
| 0.7 | `RiskQuickViewModal` thresholds; broaden the ADR-008 lint regex | PG-02 | S |
| 0.8 | Name the 10 icon-only buttons; `DetailActionBanner` close | AX-01 | S |
| 0.9 | Keyboard row activation for questionnaire history; name the AuditTrail chevron | AX-02 | S |
| 0.10 | `SystemSettingsPanel`: `role="switch"`, `aria-checked`, `aria-labelledby`, `type="button"`; label the inputs | DS-04 | S |
| 0.11 | `text-white` → tokens in shared shells: `Pagination` (+ `type="button"`), `StepIndicator`, `ReadAccessDeniedState`, `ArchiveConfirmDialog`, `SortableTable` empty text | DS-01, DS-03 | S |
| 0.12 | D2 stop-gap remap, measured by 0.3; if it cannot reach 0 elements < 3:1 on harness surfaces, label Light "Beta" in AppearanceSettings | DS-01, DS-02, DS-03, DS-22 | S |
| 0.13 | `<html lang>` sync in `LanguageProvider` | AX-09 | S |
| 0.14 | Undefined CSS vars + `cssVarsDeclared.test.ts` | DS-18 | S |
| 0.15 | Double-padded dialogs `!p-0` ×6 (temporary; removed by `DialogShell` v2, 4.3) | DS-08 | S |
| 0.16 | Issues access-denied → `ReadAccessDeniedState` | DS-17 | S |
| 0.17 | `btn-secondary` retry → `Button variant="secondary"` | GAP-D-05 | S |

**Exit criteria:** G-RATCHET and G-RENDER run in CI and fail on any increase; `theme-contrast-matrix` treats `incomplete` as failing or ratchets it; GAP-B-01 and PG-02 closed; the Phase 0 parts of AX-01, AX-02 and DS-04 merged (no unnamed icon button, no mouse-only questionnaire row, the switch has role, state and name); D2 met: the rendered-contrast script reports 0 text elements below 3:1 in the light theme on the harness surfaces, or Light is labelled "Beta" in AppearanceSettings until Phase 2; the ADR-015 addendum is merged; `git grep "Live SSO is disabled"` matches only the preview route; the dead components of O1 are gone.

### 5.3 Phase 1: foundations, tokens and primitives (≈ 12–16 days)

| # | Item | IDs | Effort |
|---|---|---|---|
| 1.1 | Tokens: `tint`, `overlay`, `severity-high*`, `chart-1..8`, `heat-0..4`, `nav-active`, `badge-count`; `.theme-riskhub` selector; `boxShadow.glass`; `statusTokenContrast` extension | DS-05, DS-22, DS-33, PG-01 | M |
| 1.2 | Tailwind: `fontFamily`, `fontSize.2xs`, `.text-eyebrow`, `zIndex`, `transitionDuration`, `maxWidth`, `borderRadius.DEFAULT`, `.focus-ring` + global `:focus-visible`; remove `darkMode`; document icon size roles | DS-14, DS-15, DS-20, DS-25, DS-26, DS-27, DS-30, DS-31 | S |
| 1.3 | `lib/severity.ts`, `lib/tones.ts`, `lib/cssTokens.ts` | PG-01, DS-05 | M |
| 1.4 | `Button` variants (`accent` etc.); `BackButton`, `RefreshButton`, `RowActionButton` | DS-09, DS-29, FB-02, GAP-B-03 | M |
| 1.5 | `Textarea`, `Checkbox`, `RadioGroup`, `Switch`, `MultiSelect`, `NativeSelect`; `Input` `cva`; `Field` extensions; `ThemedSelect` name overload | DS-02, DS-04, DS-10, GAP-B-07, DS-28, GAP-D-26, PG-37 | L |
| 1.6 | `Badge` + `SeverityBadge`; `Card`; `InlineMessage` | DS-13, SM-09, AX-05 | M |
| 1.7 | `DialogShell` v2 (size, fixed surface, Header/Body/Footer, `cn`); `ConfirmDialog` `intent` + reason policy + plurals | DS-07, PG-07, PG-22 | M |
| 1.8 | `ui/tabs.tsx` on `useContentTabs` | DS-12 | S |
| 1.9 | `ui/table.tsx`; `SortableTable` `onRowActivate` / `getRowActions`; `Pagination` `mode` + tokens | DS-11, AX-02, DS-29 | M |
| 1.10 | `PageHeader`, `PageContainer`, `usePageTitle`; `EntityDetailHeader` `back`/`breadcrumbs`; `EditBlockedState`, `DetailField` | DS-15, DS-16, NAV-01, SM-05 | M |
| 1.11 | `ui/state.tsx` | DS-17, GAP-D-20 | M |
| 1.12 | `@radix-ui/react-toast` + `FeedbackProvider` + `useFeedback` | FB-01 | M |
| 1.13 | `useFormat()` + `translateUiMessage` | I18N-03, PG-36 | S |
| 1.14 | `AuthFrame`, `BrandWordmark`, `LanguageSwitch` | DS-24 | M |
| 1.15 | `frontend/src/components/ui/README.md` rewrite; `docs/LOCALIZATION.md` formatting/plurals section | DS-28, I18N-06 | S |

**Exit criteria:** every primitive has a G-UNIT contract test and passes G-RENDER on a harness page in 3 themes (add `frontend/design-system.html`, modelled on `frontend/dialog-contract.html`); G-ESLINT clean paths include `src/components/ui/**`, new `src/components/layout/**` files and `src/lib/severity.ts` with 0 violations.

### 5.4 Phase 2: shared patterns (≈ 10–14 days)

| # | Item | IDs | Effort |
|---|---|---|---|
| 2.1 | Tokenise the 11 dark dialog surfaces **with** their inner text, one dialog family per PR (O4); migrate all 27 `DialogShell` sites to v2 | DS-07 | L |
| 2.2 | App-wide text-token codemod (O5): `text-white`, `text-slate-*`, bright status text, `text-accent` on text, raw-input text colour, the score-matrix `ring-white` selection ring | DS-01, DS-03, DS-19, DS-02, GAP-D-15, GAP-D-24 | L |
| 2.3 | `tint` codemod; `divide-border`; then delete the white-alpha remaps and `.theme-* th/tr` rules (O6) | DS-22, DS-11, DS-21 | M |
| 2.4 | Archive / delete / remove-link / bulk-send confirmations; KRI "Delete" → Archive | PG-07, GAP-D-08 | M |
| 2.5 | `RegisterListShell` → `PageHeader` + `PageContainer`; `SortableTable` on `ui/table` | DS-15, DS-16, DS-11 | M |
| 2.6 | Pagination 6 → 1 | DS-29 | M |
| 2.7 | `EntityDetailHeader` for KRI, Issue, Threat, Process, Department; labelled back buttons; breadcrumbs; `activeNavHref` | DS-15, AX-06, NAV-02, PG-08, SM-05 | M |
| 2.8 | `MainLayout`: focus `h1` on navigation, live region, `<Suspense>` around the `Outlet`; sidebar count-badge context | NAV-01, NAV-04, AX-14 | S |
| 2.9 | State primitives replace bespoke states; error-as-empty sites fixed | DS-17, GAP-C-11 | M |
| 2.10 | Feedback: row-restore errors → toast; flashes → toast; `DetailActionBanner` → `InlineMessage`; approval-queued rule (D12) | FB-01, AX-05 | M |
| 2.11 | Severity SSOT adoption: `useStatusTheme` consumers, `useChartTheme` → tokens, `issueUi`, `CriticalityClassPill`, matrix legends, committee heatmap | PG-01, DS-06, DS-05 | M |
| 2.12 | Formatting: Issue date helpers, raw ISO dates, `cs-CZ` literals, `useLanguage()` everywhere | I18N-03, PG-35 | S |
| 2.13 | Tabs: all tablists → `TabList` | DS-12 | M |

**Exit criteria:** the D2 stop-gap is deleted (O5) and G-RENDER shows 0 elements below 3:1 in light on all harness surfaces; 0 below 4.5:1 on shared-shell surfaces (registers, detail headers, opened dialogs) in 3 themes; one pagination; `frontend/src/hooks/useStatusTheme.ts` and the `useChartTheme` hex tables deleted; `severityConsistency.test.ts` green; every routed page has exactly one `h1` and a translated `document.title`.

### 5.5 Phase 3: module migrations (≈ 25–40 days)

Order is by user impact (rendered light-theme failures and 🔴/🟡 density). Each module ends by joining the G-ESLINT clean paths and shrinking its G-RATCHET baseline.

| # | Module | IDs | Effort |
|---|---|---|---|
| 3a | Risk Hub admin (`components/riskhub/*`, `roles/*`) | DS-04 (full rewrite), GAP-B-03, GAP-B-07, AX-04 and DS-10 sites, DS-13 (GAP-B-08) | M–L |
| 3b | Core registers and forms: Risk, Control, KRI, Issue | DS-02 (primitives), DS-10, AX-04, PG-03, PG-05, PG-08, PG-25, PG-28, PG-29, PG-31, PG-30, PG-34, PG-40, PG-41, PG-42, PG-46, GAP-D-01, GAP-D-03, GAP-D-04, GAP-D-06, GAP-D-14 (risk), GAP-D-19, GAP-D-22; optional KRI edit modal → page (L) | L |
| 3c | Settings, Users, Access, Admin console | GAP-C-15, AX-10, SM-15, GAP-D-16, GAP-D-17, GAP-D-18, GAP-D-27, GAP-D-02 (audit events); `frontend/src/pages/admin-console/adminConsoleRoute.css` → tokens | M–L |
| 3d | Asset, Process, Threat and link sections | SM-05, GAP-D-07, GAP-D-08, AX-05 and AX-04 sites, I18N-03 dates, FB-01 (Process divergence) | L |
| 3e | Questionnaires (risk tab, dialog, inbox) and the legacy approval diff | PG-03 (GAP-B-23), GAP-B-24, GAP-D-09, AX-02, GAP-D-25 | M |
| 3f | Governance, ActivityLog, AuditTrail, Notifications, Departments, Docs | SM-10, SM-11, RS-01, RS-03, NAV-03, FB-02, I18N-01, GAP-D-13, GAP-D-23, DS-32, GAP-D-02 (activity log), NAV-06 | M–L |
| 3g | Dashboard and ICT committee | GAP-B-16, GAP-B-19, GAP-D-10, GAP-D-11, GAP-D-12, GAP-D-19, GAP-D-20, RS-01, GAP-D-02 (category charts) | M |
| 3h | Vendor fold-in (last, D13) | SM-09, GAP-C-08, GAP-C-09 (after the PO decision), GAP-D-14 (vendor) | M |
| 3i | Login and public → `AuthFrame` | DS-24, NAV-07 (in DS-24) | M |

**Per-module exit:** module paths in G-ESLINT clean paths; G-RATCHET counts 0 for `text-white`, `raw-palette`, `white-alpha`, `micro-font`, `raw-button`, `raw-text-input`, `raw-table`; G-RENDER 0 below 4.5:1 on the module's surfaces in 3 themes; one stateful axe pass per module form or dialog; fixed pixel widths re-checked under G-RENDER at 1024px with `cs` (RS-04).
**Phase exit:** app-wide ratchet totals 0 for those patterns (data-driven colours allowlisted by file); the G-RENDER baseline file is deleted and the spec is a hard zero; `validate-plurals.mjs` at 0.

### 5.6 Phase 4: cleanup (≈ 3–5 days)

| # | Item | IDs |
|---|---|---|
| 4.1 | Delete the `frontend/src/index.css` remap blocks, element selectors (`aside`, `nav`, `th`, `tr`) and `.btn-primary`; `important-css` from 106 to ≤ 4 | DS-05, DS-21, DS-09 |
| 4.2 | Delete `frontend/src/components/vendors/vendorRoute.css`; sidebar hex and `frontend/src/pages/admin-console/adminConsoleRoute.css` colour vars → tokens | SM-09, DS-33 |
| 4.3 | Remove `DialogShell` deprecated class props; delete `ArchiveConfirmDialog` (callers use `<ConfirmDialog intent="archive">`); delete `ISSUE_*_BUTTON`, `TEXTAREA_CLASS`, `useStatusTheme` | DS-07, DS-10 |
| 4.4 | Remove `date-fns` and `@radix-ui/react-tabs` | I18N-07, DS-12 |
| 4.5 | Flip G-ESLINT from clean paths to `src/**` (minus `components/ui/**` element overrides) and retire the matching G-RATCHET patterns | AX-00 |
| 4.6 | Docs: ADR-015 status note, spec FR-P5-1 / FR-P5-11 dispositions, `tables`/`layout`/`forms` README inventories, additive disposition in the vendor overhaul doc, I18N-05 translations, `frontend/src/routing/README.md` guard rule | DS-06, DS-28, I18N-05, NAV-05 |

**Exit criteria:** `grep -c '!important' frontend/src/index.css` ≤ 4; ESLint green with design bans at error across `src/**`; `npm ls date-fns @radix-ui/react-tabs` reports both absent; the rendered-contrast spec is a hard zero in all 3 themes; the ADR-015 status note is merged.

### 5.7 Effort roll-up

| Phase | Engineer-days | Parallelism |
|---|---|---|
| 0 | 7–10 | guards ∥ 🔴 fixes |
| 1 | 12–16 | primitives in parallel after 1.1–1.3 |
| 2 | 10–14 | 2.1 (dialog families) then 2.2 (text codemod), then the rest in parallel |
| 3 | 25–40 | by module |
| 4 | 3–5 | — |
| **Total** | **≈ 57–85** | |

### 5.8 Suggested PR breakdown

| PR | Phase | Content | Main IDs (full list in §5.2–§5.6) |
|---|---|---|---|
| 1 | 0 | Dead-code removal (components, tests, README entries, dead CSS) | PG-43, GAP-D-21, DS-20, PG-32, PG-34, SM-09 |
| 2 | 0 | `ui-consistency-ratchet.mjs` + baseline + CI wiring | AX-00 |
| 3 | 0 | Contrast gate `incomplete` fix + `theme-rendered-contrast.spec.ts` + probes | NEW-V1-02 |
| 4 | 0 | i18n scanner fix + plural validator | AX-00, GAP-B-14 |
| 5 | 0 | ADR-015 addendum + spec S5 disposition (docs only) | DS-06, PG-01 |
| 6 | 0 | Login: SSO copy + scroll | GAP-B-01, RS-02 |
| 7 | 0 | A11y quick fixes: icon names, row keyboard, system-setting switch | AX-01, AX-02, DS-04 |
| 8 | 0 | `RiskQuickViewModal` thresholds + ADR-008 lint | PG-02 |
| 9 | 0 | Shared-shell text fixes + D2 stop-gap + `html lang` + CSS vars + `!p-0` + Issues denied state + `btn-secondary` | DS-01, DS-03, AX-09, DS-18, DS-08, DS-17, GAP-D-05 |
| 10 | 1 | Tokens + Tailwind config | DS-05, DS-14, DS-20, DS-25, DS-26, DS-27, DS-31 |
| 11 | 1 | `lib/severity.ts` + `cssTokens` | PG-01 |
| 12 | 1 | `Button` + derived buttons | DS-09, DS-29 |
| 13 | 1 | Form primitives + `Field` | DS-10, DS-04, GAP-B-07, GAP-D-26 |
| 14 | 1 | `Badge`, `Card`, `InlineMessage` | DS-13, AX-05 |
| 15 | 1 | `DialogShell` v2 + `ConfirmDialog` intents | DS-07, PG-07, PG-22 |
| 16 | 1 | Tabs, table, pagination primitives | DS-12, DS-11, DS-29 |
| 17 | 1 | `PageHeader`, `PageContainer`, states, toast, `useFormat`, `AuthFrame`, README/LOCALIZATION | DS-15, DS-16, DS-17, FB-01, I18N-03, DS-24 |
| 18–25 | 2 | One PR per dark dialog family (RiskHub modal frame + delete dialogs; `RoleModal`; `IssueQuickCreateModal`; `ControlCreateDialog`; `LinkManagementDialog`; `ADUserPicker`; `KriMismatchDialog`; `BreakGlassEnableDialog`) | DS-07 |
| 26 | 2 | App-wide text-token codemod, then stop-gap deletion | DS-01, DS-03, DS-19, DS-02 |
| 27 | 2 | `tint` codemod + remap deletion | DS-22, DS-21 |
| 28 | 2 | Confirmations | PG-07, GAP-D-08 |
| 29 | 2 | Headers, navigation, `MainLayout` | DS-15, AX-06, NAV-01, NAV-02, NAV-04 |
| 30 | 2 | States, feedback, severity adoption, formatting, tabs | DS-17, GAP-C-11, FB-01, PG-01, I18N-03, DS-12 |
| 31–39 | 3 | One PR per module 3a–3i | §5.5 |
| 40 | 4 | Cleanup and dependency removal | §5.6 |

---

## 6. Findings register

Every confirmed finding after the merge map appears exactly once. Entries are grouped by domain and ordered 🔴 → 🟡 → 🟢 (§6.10 is grouped by module instead); the 🟢 entries of each group are a compact table. Entry IDs are the merge-map primaries; merged IDs are listed under **Also**. "≈" marks a partial overlap whose remainder lives in another entry. The **Verification** line is the verdict trail (R1 → R2 → R3). Entries raised in the R3 coverage sweep (`GAP-D-*`) had one adversarial pass in R3 and were re-verified against the code in R5 (§11.6); their trail ends in "R5 confirmed".

### 6.1 Theming, colour and contrast

#### DS-01 🔴 Light theme: `text-white` on neutral surfaces renders white-on-white

- **Also:** SM-01, GAP-B-17, GAP-B-25 (headings), GAP-B-02 (panel text), PG-12 (`text-white` h2s), PG-06 (`hover:text-white`), GAP-B-21 (`ISSUE_SECTION_TITLE`). ≈DS-03 (same root cause, same codemod).
- **Evidence:**
  - `frontend/src/components/tables/Pagination.tsx:38` `<span className="font-medium text-white">{startItem}</span>` (also `:39`, `:40`, `:47`, `:48`, `:62`). Rendered on `/risks` in light at 1.04:1; the screenshot reads "Showing  to  of  results".
  - `frontend/src/pages/ControlNewPage.tsx:113` `<h2 className="text-3xl font-black text-white tracking-tighter">`, rendered at 1.04:1. Same recipe at `frontend/src/pages/ControlEditPage.tsx:59`, `frontend/src/pages/RiskEditPage.tsx:56`, `frontend/src/pages/KRINewPage.tsx:70`, `frontend/src/pages/IssueNewPage.tsx:74`. Also `frontend/src/pages/SettingsPage.tsx:45` `h1` at 1.00:1, `frontend/src/pages/shared/ReadAccessDeniedState.tsx:19` `h2` at 1.04:1, `frontend/src/pages/UserNewPage.tsx:71` `h1` at 1.04:1.
  - `frontend/src/components/riskhub/DepartmentsPanel.tsx:173` `<h3 className="text-lg font-semibold text-white">` against `frontend/src/components/riskhub/RiskTypesPanel.tsx:190` `text-foreground`. `text-white` / `text-foreground` per panel: ApprovalScenarios 5/0, RolesTable 2/0, SystemSettings 5/0, RiskQuestionnaires 5/0, Departments 8/0.
  - `frontend/src/components/dashboard/ictCommittee/IctCommitteeExecutiveSummarySection.tsx:216` `<h2 className="text-xl font-bold text-white">`; `frontend/src/components/risks/risk-questionnaire-detail/RiskQuestionnaireDetailHeader.tsx:30` `text-lg font-bold text-white` (questionnaire dialog open in light: 38 of 67 text nodes below 1.5:1).
  - **Scale:** 323 bare `text-white` in 126 files + 73 `hover:` + 7 `group-hover:` = 403 lines; 117 on `<h1>`–`<h4>`. **Cause:** `c47d94d` removed `-.theme-light .text-white {` / `-  color: #0f172a !important;` and the slate remaps (`git show c47d94d -- frontend/src/index.css`). Grep in §12.2.
- **Impact:** Light is user-selectable (`frontend/src/components/settings/AppearanceSettings.tsx:13` `value: 'light' as const,`) and persisted on the server. Light users lose page titles, pagination numbers, stepper labels, access-denied text, Risk Hub panel titles and dashboard section titles: 75 `text-white` elements on light backgrounds across 25 rendered surfaces, at 1.00–1.07:1.
- **Fix:** Phase 0: tokenise the shared shells (`Pagination`, `StepIndicator`, `ReadAccessDeniedState`, `ArchiveConfirmDialog`, `SortableTable` empty text) and ship the measured D2 stop-gap (§4.3 R-e). Phase 2: app-wide codemod by role (§4.3) after each dark dialog's surface PR (O4); delete the stop-gap at Phase 2 exit (O5). Guards: G-RATCHET `text-white`, G-ESLINT ban, G-RENDER.
- **Effort:** S (shared subset + stop-gap) / L (codemod).
- **Phase:** 0 → 2.
- **Verification:** R1 (DS-01, SM-01) → R2-V1 confirmed with corrections (403 = 323 + 73 + 7, not 403 + 80; a light-theme axe gate does exist, see NEW-V1-02) → R2-V3 confirmed rendered → R3 merge M1; dead `GroupedView` / `CategoryDrillDown` citations dropped (R3-01).

#### DS-02 🔴 Hand-rolled inputs type white text into light-theme fields

- **Also:** GAP-B-25 (`QuestionAnswerField`), GAP-B-26 (textarea colour), GAP-B-21 (`ISSUE_FIELD`), GAP-C-05 (`frontend/src/pages/processes/ProcessVendorLinksSection.tsx:188` input colour; R5: was `:187`, the placeholder line).
- **Evidence:**
  - `frontend/src/components/control-form/ControlFormIdentityStep.tsx:19` `className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white …"`.
  - `frontend/src/pages/threats/ThreatRegisterFilterBar.tsx:76` `rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white` (also `frontend/src/pages/assets/AssetRegisterFilterBar.tsx:80`, `frontend/src/pages/processes/ProcessRegisterFilterBar.tsx:83`); `frontend/src/components/kri-form/KriDetailsStep.tsx:55`; `frontend/src/components/executions/ExecutionLogModal.tsx:135`; `frontend/src/components/ArchiveConfirmDialog.tsx:137` `… text-sm text-white placeholder:text-slate-600 …`.
  - `frontend/src/index.css:445-450` says inputs are themed "by the token-driven Input primitive" and that the blanket light rule was removed, so every control not on `Input` lost its light text colour.
  - **Scale:** 60 real text-entry controls (48 `<input>`, 12 `<textarea>`) in 32 files; the reproduce command returns 63 matches, of which 3 are `-A10` window leaks (`frontend/src/components/kri/KRIVendorSelector.tsx:127`, `frontend/src/components/riskhub/RiskQuestionnairesPanel.tsx:236`, `frontend/src/components/riskhub/roles/RoleModal.tsx:198`). Grep in §12.2. Coverage-sweep sites: `frontend/src/components/control-form/ControlFormExecutionStep.tsx:44,51`, `frontend/src/components/governance/ResolveOrphanOwnerSelection.tsx:47`, `frontend/src/components/governance/ResolveOrphanRiskSelection.tsx:52`, `frontend/src/components/governance/ResolveOrphanDepartmentSelection.tsx:40`; `frontend/src/components/risks/risk-questionnaire-detail/QuestionAnswerField.tsx:157,179,192` (entry controls; `:64` is the read-only answer box with the same `text-white`); `frontend/src/components/issues/issueUi.ts:11` `ISSUE_FIELD`.
  - **Rendered:** KRIModal, KRI form and ControlCreateDialog typed values are `rgb(255,255,255)` on `rgb(247,247,247)`, 1.07:1; the screenshot shows invisible values.
- **Impact:** light-theme users cannot read what they type in the Control, KRI and Issue forms, archive-reason fields, register search boxes and Risk Hub modals.
- **Fix:** Phase 2: colour codemod on raw inputs (`text-white` → `text-foreground`; their `bg-white/5` is already remapped) as part of O5, never inside a still-dark dialog (O4). Phase 1–3: replace with `Field` + `Input` / `Textarea` (§4.8). Guards: G-RATCHET `raw-text-input`, G-ESLINT `textarea` ban.
- **Effort:** M (≈32 files, mostly identical strings).
- **Phase:** 0 (stop-gap) → 2 (colour) → 3 (primitives).
- **Verification:** R1 → R2-V1 confirmed with corrections (60 real controls, 3 leaks) → R2-V3 confirmed rendered → R3 merge M1b → R5 line corrections (`ProcessVendorLinksSection` `:187` → `:188`; `QuestionAnswerField` entry controls are `:157,179,192`, `:64` is a read-only display).

#### DS-03 🔴 Raw slate and status shades fail AA in at least one theme on ~1,300 text nodes

- **Also:** R3-03 (`frontend/src/pages/admin-console/sections/ops/SessionsPanel.tsx:124` admin error banner). ≈DS-01 (light half).
- **Evidence:**
  - **Scale:** 474 `text-slate-200/300/400` (≤ 2.56:1 on light); 448 `text-slate-500/600/700` (slate-600 = 2.14:1 and slate-500 = 3.40:1 on riskhub glass); 377 bright status text (`text-rose-400` 84, `text-emerald-400` 56, `text-amber-400` 51, `text-rose-300` 39, `text-amber-200` 24), 1.19–2.69:1 on light.
  - `frontend/src/components/kri/KRIValueModal.tsx:190` `<p className="text-[9px] text-slate-600 ml-1">` (9px and ≈2.1:1 in the dark themes).
  - `frontend/src/components/tables/SortableTable.tsx:330` `<p className="text-slate-400">{resolvedEmptyMessage}</p>` (every empty register, 2.56:1 in light).
  - `frontend/src/pages/IssuesPage.tsx:29` `glass-card p-8 flex items-center gap-3 text-amber-200` (1.25:1 in light).
  - `frontend/src/pages/admin-console/sections/ops/SessionsPanel.tsx:124` `border-rose-500/30 bg-rose-500/10 … text-rose-100` (≈1.1:1 in light); `frontend/src/pages/KRIDetailPage.tsx:232` banner `text-amber-100`; `frontend/src/pages/risks/riskColumns.tsx:203` `text-emerald-300` (≈1.5:1 in light); `frontend/src/hooks/useStatusTheme.ts:37` `highText: 'text-emerald-400'`.
  - **Rendered:** below 4.5:1 — riskhub 99, dark 92, light 208 elements.
- **Impact:** no raw slate shade passes AA in all three themes; labels, meta and status text fail even in the default theme.
- **Fix:** codemod by role, not by shade (§4.3) in Phase 2 together with DS-01; status text moves to the `*-text` tokens that `tests/frontend/unit/src/design-system/statusTokenContrast.test.ts` already covers. Guards: G-RATCHET `raw-palette`, G-ESLINT palette ban.
- **Effort:** L (≈200 files, semantic review per file).
- **Phase:** 0 (shared subset) → 2.
- **Verification:** R1 → R2-V1 confirmed with corrections (`highText` is at `:37`, not `:39`; extra sites) → R2-V3 rendered riskhub/dark failures → R3 adds R3-03 → R5 line correction (`SessionsPanel` banner class is on `:124`, not `:125`).

#### NEW-V1-02 🟡 The CI light-theme contrast gate passes while white-on-white text ships

- **Also:** the R2-V3 "gates are blind" takeaway (merge group M3, e2e primary; the static-gate primary is AX-00).
- **Evidence:**
  - `tests/frontend/e2e/theme-contrast-matrix.spec.ts:349` `new AxeBuilder({ page }).withRules(['color-contrast']).analyze();`, then `:350` `if (result.violations.length > 0)`. `incomplete` is never read.
  - It runs in CI: `frontend/playwright.config.ts:37` lists it in `CI_ONLY_SPECS`, `.github/workflows/e2e.yml:210` runs `--project=ci`, and run 36326175751 on `ba42b38` passed all 4 shards. Theme seeding is correct (`tests/frontend/e2e/theme-contrast-matrix.spec.ts:60-75` stub `/api/v1/preferences`).
  - It covers `/issues` and `/kris`, where `frontend/src/components/ict-register/RegisterListShell.tsx:147-148` always renders `Pagination` (`frontend/src/components/tables/Pagination.tsx:34` `text-slate-400` at 2.45:1 in light; `:38` `text-white`).
- **Impact:** the only rendered contrast gate is green on surfaces measured at 1.04:1, so DS-01/DS-03 regressions are invisible to CI. The likely cause, axe classifying text over `backdrop-blur` glass as `incomplete`, is plausible but unproven.
- **Fix:** G-RENDER (§4.1, D15): fail on or ratchet `incomplete`; commit the measured rendered-contrast spec with a 3-theme baseline; add targeted probes.
- **Effort:** M. **Phase:** 0.
- **Verification:** R2-V1 new (plausible) → R3 confirmed (gate facts), cause plausible.

#### DS-05 🟡 Four competing theming mechanisms

- **Also:** ≈DS-23 (chart hex tables; committee colours are in PG-01), ≈SM-09 (vendor CSS vars).
- **Evidence:**
  - Token variables `frontend/src/index.css:8-82`; class remaps `frontend/src/index.css:535-537` `.theme-light .bg-white\/5 {` / `background-color: rgba(0, 0, 0, 0.03) !important;` (86 `!important` in `frontend/src/index.css`).
  - JS maps: `frontend/src/hooks/useStatusTheme.ts:35-63`; `frontend/src/hooks/useChartTheme.ts:74` `danger: '#EF4444',` (102 hex literals), which matches neither `--destructive` value.
  - Route variables: `frontend/src/pages/admin-console/adminConsoleRoute.css:2` `--admin-surface-muted: rgba(255, 255, 255, 0.05);`; `frontend/src/components/layout/sidebar.css:2` `--sidebar-active-bg: #1d4ed8;`; `frontend/src/index.css:428` `#be123c !important` (applies in all themes).
  - Inventory (hex / rgba / `!important`): `frontend/src/index.css` 45 / 70 / 86; `frontend/src/components/layout/sidebar.css` 7 / 1 / 8; `frontend/src/pages/admin-console/adminConsoleRoute.css` 3 / 27 / 12; `frontend/src/components/vendors/vendorRoute.css` 0 / 0 / 0 with 114 `hsl(var(--…))`.
- **Impact:** retheming means editing four places with four contrast stories; the JS maps drift from the tokens.
- **Fix:** §4.2: add chart, heat, nav and badge tokens; `readCssColor` memoised on theme for Recharts; `lib/severity.ts` replaces `useStatusTheme`; route variables move to tokens; remaps deleted after DS-22.
- **Effort:** M–L. **Phase:** 1 → 4.
- **Verification:** R1 → R2-V1 confirmed (inventory exact) → R3 n/a.

#### DS-18 🟡 Two undefined CSS custom properties

- **Evidence:** `frontend/src/pages/GovernancePage.tsx:294` `shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)]` (`--accent-rgb` is defined nowhere, so the active-filter glow never renders); `frontend/src/components/reports/ExportDialog.tsx:138,160` `className="mt-1 accent-[var(--color-accent)]"` (radios fall back to the browser accent colour). A full scan of `var(--x)` in `src` finds only these two undefined, plus the Radix-provided `--radix-select-trigger-*`.
- **Impact:** silent visual drift; nothing catches undefined variables.
- **Fix:** `shadow-[0_0_20px_hsl(var(--accent)/0.2)]`; `accent-accent` (later `RadioGroup`); add `cssVarsDeclared.test.ts`.
- **Effort:** S. **Phase:** 0.
- **Verification:** R1 → R2-V1 confirmed.

#### DS-19 🟡 `text-accent` (a fill token) used as text

- **Evidence:** `frontend/src/index.css:19-22` "Accent fill and accent text are deliberately separate". 198 `text-accent` (159 bare, 23 `hover:`, 12 `group-hover:`, 4 `group-focus-within:`) against 116 `text-accent-text`; about 97 sit on icon components (allowed at ≥ 3:1), leaving ≈100 real text uses. `frontend/src/components/dashboard/departmentTablePresentation.tsx:156` `text-[9px] font-bold text-accent uppercase tracking-wider`. Accent as text: 4.25:1 on riskhub glass, 3.81:1 on light white.
- **Impact:** link-coloured text fails AA on glass and in light.
- **Fix:** Phase 2 codemod `text-accent` → `text-accent-text` on non-icon elements (PascalCase heuristic); G-RATCHET `text-accent-as-text`.
- **Effort:** S–M. **Phase:** 2.
- **Verification:** R1 → R2-V1 OVERSTATED (real scope ≈100, not 198) → stays 🟡.

#### DS-22 🟡 The white-alpha remap is partial: dividers and tints vanish in light

- **Evidence:**
  - Not remapped: `divide-white/*` 23 (21 × `/5`, 2 × `/10`); `bg-white/[…]`, `/15`, `/30` 72; `hover:bg-white/{15,20,[…]}` 16; `border-white/{6,8,15,30}` 9; `hover:border-white/*` 6; `group-hover:bg-white/10` 4.
  - Live CSS probe in light: `divide-white/5` → `rgba(255,255,255,0.05)` (≈1.0:1); `bg-white/[0.02]` and `[0.03]` unchanged; remapped `border-white/5|10` → `rgba(0,0,0,0.08)` at 1.196:1.
  - Live breakage at 14 non-table sites, e.g. `frontend/src/components/dashboard/KRIStatusWidget.tsx:160`, `frontend/src/components/dashboard/KRIBreachWidget.tsx:101`, `frontend/src/pages/NotificationsPage.tsx:394`, `frontend/src/pages/departments/DepartmentTabContent.tsx:69`, `frontend/src/components/users/DirectoryUserImportPanel.tsx:135`.
  - **Corrected headline:** `frontend/src/components/tables/SortableTable.tsx:310,346` `<tbody className="divide-y divide-white/5">` rows *are* visible in light, but only because `frontend/src/index.css:457-459` `.theme-light tr { border-color: #e2e8f0 !important; }` overrides them.
- **Impact:** list separators and tinted panels disappear in light; the table dividers survive only through a global `!important` hack.
- **Fix:** D3 `tint` codemod (§4.2), `divide-border` for rows, then delete the remaps and the `tr` rule (O6).
- **Effort:** M. **Phase:** 0 (stop-gap) → 1 → 2.
- **Verification:** R1 → R2-V1 confirmed with corrections (the `SortableTable` headline is a false flag) → R2-V3 confirmed by live probe → R3-01 removed the dead `frontend/src/components/tables/GroupedView.tsx:99` / `frontend/src/components/tables/CategoryDrillDown.tsx:106` examples.

#### GAP-D-14 🟡 Draft and archived linked controls are dimmed with whole-group opacity

- **Evidence:** `frontend/src/components/risks/detail-overview/RiskLinkedControlsSection.tsx:124` `className="opacity-60"` (drafts) and `:139` `className="opacity-40 hover:opacity-100 transition-opacity"` (archived); `frontend/src/components/vendors/VendorLinkedEntitiesTab.tsx:144` `opacity-50 hover:opacity-100`. The dimmed content is interactive cards; `text-muted-foreground` at 40 % drops to ≈2:1 in riskhub, and keyboard focus does not trigger the hover restore. The headings at `:116-118` / `:131-133` already state the status.
- **Impact:** sub-AA text and focus rings on interactive content.
- **Fix:** remove group opacity; mark state per card with a `Badge` or `text-muted-foreground`.
- **Effort:** S. **Phase:** 3 (3b, 3h).
- **Verification:** R3 coverage sweep → R5 confirmed (lines and quotes exact; `ControlGroup` applies the class to the grid of clickable cards).

#### GAP-D-15 🟡 Risk-overview empty KRI hint uses `text-slate-700` (1.56:1 in the default theme)

- **Evidence:** `frontend/src/components/risks/detail-overview/RiskKriSection.tsx:60-61` `text-slate-600 text-sm` and `<p className="text-xs text-slate-700 …">`. It is the only text use of `text-slate-700` in `src` (the other 8 are 7 icons and 1 decorative `|` separator in `frontend/src/components/executions/ExecutionHistory.tsx:302`) and falls below DS-03's slate-500/600 table.
- **Impact:** near-invisible (≈1.56:1) in the riskhub and dark themes.
- **Fix:** `text-muted-foreground` (part of the Phase 2 codemod).
- **Effort:** S. **Phase:** 2.
- **Verification:** R3 coverage sweep → R5 confirmed with corrections (the 8 other uses are 7 icons plus one decorative separator, not 8 icons).

**🟢 Observations (6.1)**

| ID | Title | Evidence | Fix | Effort | Phase | Verification |
|---|---|---|---|---|---|---|
| DS-20 | Dead and redundant tokens and config | `frontend/tailwind.config.js:3` `darkMode: ["class"],` (0 `dark:` uses); zero-use `card-foreground`, `nested-foreground`, `glass-foreground`, `glass-hover-border`; `bg-card` 4 vs `glass-card` 251; `tailwind.config.js:18` hard-coded `glass` shadow; dead `frontend/src/index.css:640-655,674-683` `[data-radix-select-trigger]` rules (Radix emits only `data-radix-select-viewport`) | Remove `darkMode` (D14); `boxShadow.glass: 'var(--glass-shadow)'`; delete the dead selectors and fix the `:445-450` comment (D16); drop ad hoc `bg-card` (D5) | S | 0–1 | R1 🟡 → R2-V1 🟢 (dead code, no user impact) → R3 justified |
| DS-21 | Element-selector overrides paint unrelated `nav`/`aside` | `frontend/src/index.css:528-532` `.theme-light aside, .theme-light nav` matches 4 elements (`frontend/src/components/layout/Sidebar.tsx:162,189`, `frontend/src/pages/ApprovalsPage.tsx:140`, `frontend/src/components/kris/KRIDetailHistoryTab.tsx:128`) with a near-invisible 0.95 fill | Delete the element-selector `!important` rule at `frontend/src/index.css:528-532` (the sidebar already uses tokens; no new class); re-check `frontend/src/components/layout/Sidebar.tsx:162,189`, `frontend/src/pages/ApprovalsPage.tsx:140` and `frontend/src/components/kris/KRIDetailHistoryTab.tsx:128` in light under G-RENDER | S | 2 → 4 | R1 🟡 → R2-V1 overstated, 🟢 → R3 justified |
| DS-33 | Sidebar and notification-badge colours hard-coded | `frontend/src/components/layout/sidebar.css:2` `--sidebar-active-bg: #1d4ed8;` (also `:9`, `:25`); `frontend/src/index.css:428,433` `#be123c` | `--nav-active` and `--badge-count` tokens with contrast tests (§4.2) | S | 1 → 4 | R1 → R2-V1 confirmed |
| GAP-D-24 | Score-matrix selection ring hard-coded for dark surfaces | `frontend/src/components/RiskScoreMatrix.tsx:88` `'ring-2 ring-white ring-offset-1 ring-offset-slate-900 scale-110 z-10'`: invisible ring and a slate halo in light | `ring-foreground ring-offset-background` | S | 2 | R3 coverage sweep → R5 confirmed (live in the risk form scoring step and risk overview) |

### 6.2 Design tokens, typography and spacing

#### DS-14 🟡 Micro-typography has no scale: 533 eyebrow labels in 48 combinations, 264 labels at 10px or less

- **Evidence:**
  - 533 `uppercase` + `tracking-*` lines: sizes `text-xs` 296 / `text-[10px]` 179 / `text-sm` 50 / smaller; tracking `widest` 434 / `wider` 87 / `wide` 14; weight `black` 324 / `bold` 180. 249 `text-[10px]` plus 15 below 10px.
  - Live sub-10px: `frontend/src/pages/risks/riskColumns.tsx:56` `rounded text-[8px] font-black uppercase tracking-widest`; `frontend/src/components/history/HistoryChangeCard.tsx:43` `text-[9px] font-black text-muted-foreground uppercase tracking-widest`; `frontend/src/components/dashboard/departmentTablePresentation.tsx:186` `text-[9px] font-bold text-slate-600 uppercase tracking-tighter`; `frontend/src/components/dashboard/KRIBreachWidget.tsx:118,122`; `frontend/src/components/kri/KRIValueModal.tsx:190`.
  - Top `text-[10px]` files: `frontend/src/components/approvals/GovernedMutationDiff.tsx` 13, `frontend/src/pages/AuditTrailPage.tsx` 11, `frontend/src/components/kri-form/KriDetailsStep.tsx` 10, `frontend/src/pages/risks/riskColumns.tsx` 9, `frontend/src/components/RiskQuickViewModal.tsx` 9.
- **Impact:** illegible 8–9px labels and visibly different label styles on adjacent pages.
- **Fix:** D6: `text-2xs` (11px) and one `.text-eyebrow` (11px / 600 / `tracking-wide`); no `font-black`; codemod in §4.5. Guards: G-RATCHET `micro-font`, G-ESLINT ban.
- **Effort:** M. **Phase:** 1 → 3.
- **Verification:** R1 → R2-V1 confirmed with corrections (the 6–7px `MiniHeatmap` examples are dead code, now in PG-43).

#### DS-25 🟡 Radius scale drifts from the documented control geometry

- **Evidence:** `frontend/src/components/ui/README.md` "Ordinary controls are 40px high with a 12px radius…"; `frontend/src/index.css:74-75` "compact controls use md, ordinary controls use lg, cards/dialogs use 2xl". Usage: `rounded-xl` 381 (14px, the de-facto control radius), `rounded-lg` 260, `rounded-full` 200, bare `rounded` 92 (4px, off-scale), `rounded-2xl` 82, `rounded-md` 57, `rounded-3xl` 6, plus `rounded-[32px]`, `rounded-[26px]`, `rounded-[1px]`. Raw inputs `px-4 py-3` are ≈46px next to `Input` `h-10` in the same forms.
- **Impact:** controls of different heights and radii side by side.
- **Fix:** D14: `borderRadius.DEFAULT` = 8px; controls at 12px (`rounded-lg`, see §3.1); no `rounded-3xl` or arbitrary radius (§4.6). Guard: G-RATCHET `radius-offscale`.
- **Effort:** S (config) + M (codemod). **Phase:** 1 → 3.
- **Verification:** R1 → R2-V1 confirmed (counts ±2).

**🟢 Observations (6.2)**

| ID | Title | Evidence | Fix | Effort | Phase | Verification |
|---|---|---|---|---|---|---|
| DS-27 | z-index untokenised despite FR-P5-11 | `frontend/src/components/DialogShell.tsx:68` `z-[9999]`; `frontend/src/components/controls/ControlRiskLoadingOverlay.tsx:22` `z-[10000]`; `frontend/src/components/ui/select.tsx:85` `z-[10050]`; `frontend/src/components/layout/MainLayout.tsx:23` `z-[60]` | `zIndex` tokens (§4.6) | S | 1 | R1 → R2-V1 confirmed |
| DS-30 | Icons consistent but sizes not normalised | lucide in 234 files, 2 inline `<svg>`; close X `h-4 w-4` (`frontend/src/components/ConfirmDialog.tsx:139`) vs `h-5 w-5` (`frontend/src/components/ArchiveConfirmDialog.tsx:103`, `frontend/src/components/ControlCreateDialog.tsx:62`, `frontend/src/components/LinkManagementDialog.tsx:102`); `frontend/src/components/ui/button.tsx:8` already forces `[&_svg]:size-4` | Document icon size roles (§4.6); optional `size-N` codemod | S | 1 | R1 → R2-V1 confirmed (234, not 231) |
| DS-31 | No motion duration tokens; `transition-all` common | `transition-all` 133 vs `transition-colors` 295; `duration-300` 14, `-200` 10, `-500` 6; e.g. `frontend/src/components/ict-register/RegisterExportLink.tsx:18` `hover:bg-accent/30 transition-all` | `transitionDuration` tokens; ban `transition-all` | S | 1 | R1 → R2-V1 confirmed |
| DS-32 | Legacy placeholder syntax; docs-reader hex | `placeholder-slate-*` × 8, e.g. `frontend/src/components/riskhub/RiskTypesPanel.tsx:82` `placeholder-slate-500`; `.docs-reader-*` in `frontend/src/index.css:139-223` (20+ hex/rgba) with light overrides `:465-525` | `placeholder:text-muted-foreground`; rewrite docs-reader on tokens | S | 3 | R1 → R2-V1 confirmed |

### 6.3 Primitives and components

#### DS-04 🔴 Risk Hub system-setting toggle has no role, state or name; three switch implementations; unlabelled value inputs

- **Also:** NEW-V1-04, GAP-B-10, PG-38.
- **Evidence:**
  - `frontend/src/components/riskhub/SystemSettingsPanel.tsx:60-79` `<button onClick={() => {` … `"relative inline-flex h-6 w-11 items-center rounded-full transition-colors",`: no `type`, no `role="switch"`, no `aria-checked`, no label. The file has no `<label>` and no `aria-` attribute.
  - `:89` `<input type="text" inputMode="numeric"` and `:105` `<input type="text"` have no id, aria or label; the setting name is only a sibling `:119` `<span className="text-white font-medium">{config.display_name}</span>`; `:135-146` render N identical "Save" buttons.
  - `:141` `<span className="animate-spin">⏳</span>`; `:49` `setTimeout(() => setSaved(false), 2000)` with no live region; `:86` `numValue.toLocaleString('cs-CZ')` ignores the UI language (also an input mask).
  - Correct but divergent siblings: `frontend/src/components/settings/NotificationSettings.tsx:25-28` and `frontend/src/components/riskhub/ApprovalScenariosPanel.tsx:124-128` use `role="switch"` with different geometry and off colours (`bg-slate-700`, `bg-slate-600`, `bg-white/20`).
- **Impact:** a screen-reader user hears an unlabelled "button" with no on/off state and cannot tell which value field or Save button belongs to which setting (WCAG 4.1.2).
- **Fix:** Phase 0: `type="button" role="switch" aria-checked aria-labelledby`; `aria-label` on the inputs; "Save {display_name}". Phase 3a: rewrite on `Field` + `Input` + `Switch` (§4.8), `useFeedback().success`, `Spinner`, `formatNumberValue`.
- **Effort:** S (Phase 0) + M (rewrite). **Phase:** 0 → 3.
- **Verification:** R1 → R2-V1 confirmed (+ NEW-V1-04) → R3 confirmed NEW-V1-04 and GAP-B-10 (duplicate), merge M5.

#### DS-07 🟡 Dialog surfaces are free-form; 11 dialogs stay dark in light and token children leak navy-on-dark

- **Also:** NEW-V1-01 (narrowed, 🟡), GAP-B-12, GAP-B-02 (modal part), GAP-B-15 (forced-dark selects), GAP-C-17 (surface), R3-04. ≈DS-08, ≈PG-22.
- **Evidence:**
  - `frontend/src/components/DialogShell.tsx:68-70` takes raw-string `containerClassName`, `backdropClassName`, `contentClassName`; 27 `DialogShell` sites; 8 backdrop recipes (9/7/3/2/2/1/1/1 uses); 17 title styles.
  - 11 hard-coded dark surfaces: `frontend/src/components/users/ADUserPicker.tsx:26`, `frontend/src/components/issues/IssueQuickCreateModal.tsx:135`, `frontend/src/components/ControlCreateDialog.tsx:42`, `frontend/src/components/riskhub/RiskTypesPanel.tsx:333`, `frontend/src/components/riskhub/DepartmentsPanel.tsx:331`, `frontend/src/components/riskhub/roles/RoleModal.tsx:104`, `frontend/src/components/riskhub/roles/RoleDeleteDialog.tsx:29`, `frontend/src/components/riskhub/panelPrimitives.tsx:21` `bg-slate-900 border border-white/10 shadow-2xl rounded-2xl …`, `frontend/src/components/kri-form/KriMismatchDialog.tsx:46`, `frontend/src/components/LinkManagementDialog.tsx:82` `bg-slate-900/95 backdrop-blur-xl`, `frontend/src/pages/users/BreakGlassEnableDialog.tsx:46`. Rendered in light (7 of them): surface luminance 0.009–0.016 on a `rgb(250,250,250)` page.
  - Reverse leak (NEW-V1-01, narrowed): `frontend/src/components/issues/IssueQuickCreateModal.tsx:185-191` `<ThemedSelect … className="w-full"` renders `text-foreground` navy on `bg-input/40` over slate-900, ≈2.0:1. Same at `frontend/src/components/riskhub/DepartmentsPanel.tsx:116` (owner select inside `frontend/src/components/riskhub/panelPrimitives.tsx:21`) and `frontend/src/components/linking/LinkConfirmationPanel.tsx:41` `text-sm font-bold text-foreground leading-tight` inside `frontend/src/components/LinkManagementDialog.tsx:82` (≈1.1:1), with `frontend/src/components/linking/LinkConfirmationPanel.tsx:56,71` `bg-nested` light islands.
  - Readable only through dark overrides (R3-04): `frontend/src/components/issues/IssueQuickCreateModal.tsx:178` `"border-white/10 bg-white/5 text-white placeholder:text-slate-600 …"` (placeholder ≈2:1 in every theme). `frontend/src/components/linking/LinkSearchFilters.tsx:90` `border-white/20 bg-slate-800/80 text-slate-100` is correct today only because its host is always dark.
  - `ControlCreateDialog` hosts a white `glass-card` island (`frontend/src/components/control-form/ControlFormContainer.tsx:231` `<div className="glass-card min-h-[400px] flex flex-col">`).
- **Impact:** dark modals on a light page; and if text is tokenised before the surface, dialog text turns navy-on-slate (the ordering hazard).
- **Fix:** D5: `DialogShell` v2 with a fixed `bg-popover` surface, `bg-overlay` backdrop and Header/Body/Footer (§4.11); one PR per dialog family containing surface + inner text + a `renderedContrast` probe (O4); remove forced-dark overrides in the same PR; inner `glass-card` → `Card tone="nested"`.
- **Effort:** M (primitive) + L (27 sites). **Phase:** 1 → 2 (deprecated props removed 4).
- **Verification:** R1 (9 dark) → R2-V1 confirmed with corrections (11 dark; NEW-V1-01 raised as 🔴) → R2-V3 7 rendered → R3: NEW-V1-01 narrowed to 🟡 (the `ControlCreateDialog` half is false: `ControlForm` renders inside a themed `glass-card`), merge M2; R3-04 checklist note → R5 line corrections (owner select `:116`, not its label at `:115`; the `bg-nested` islands are in `LinkConfirmationPanel.tsx:56,71`, not `LinkManagementDialog.tsx:56`).

#### DS-08 🟡 Six dialogs double-pad

- **Evidence:** `.glass-card` = `@apply glass rounded-2xl p-6;` (`frontend/src/index.css:125`), and `frontend/src/components/ConfirmDialog.tsx:118` correctly uses `glass-card !p-0`. Lacking it: `frontend/src/components/ArchiveConfirmDialog.tsx:76` `contentClassName="glass-card w-full max-w-md overflow-hidden"` with a `:79` `p-6 border-b` header; `frontend/src/components/kri/KRIHistoryEditModal.tsx:72`; `frontend/src/components/executions/ExecutionLogModal.tsx:71` (header `:74`); `frontend/src/components/governance/OrphanQuickViewModal.tsx:150`; `frontend/src/components/governance/ResolveOrphanModal.tsx:64`; `frontend/src/components/access/AccessEditModal.tsx:126`.
- **Impact:** 48px gutters and header tints inset 24px from the edge; Archive and Confirm dialogs look different side by side.
- **Fix:** add `!p-0` now; fixed by construction in `DialogShell` v2.
- **Effort:** S. **Phase:** 0.
- **Verification:** R1 → R2-V1 confirmed (exactly 6).

#### DS-09 🟡 Three competing primary-CTA looks; raw destructive buttons fail AA

- **Also:** GAP-B-11 (button part), PG-22 (footer variants).
- **Evidence:**
  - `frontend/src/components/ui/button.tsx:13` default `"bg-primary text-primary-foreground shadow hover:bg-primary/90"` (near-white in the dark themes, navy in light).
  - `frontend/src/index.css:233-235` `.btn-primary { @apply px-8 py-3 bg-white text-slate-950 font-semibold rounded-full …`, used 10 times (`frontend/src/components/risk-form/RiskFormContainer.tsx:212,221`, `frontend/src/components/control-form/ControlFormContainer.tsx:333,342`, `frontend/src/components/kri-form/KriFormFooter.tsx:47,67`, `frontend/src/components/kri-form/KriMismatchDialog.tsx:66`, `frontend/src/components/executions/ExecutionLogModal.tsx:190`, `frontend/src/components/issues/IssueCreateForm.tsx:277`, `frontend/src/pages/HeroPage.tsx:57`).
  - Caller accent overrides in 35 lines / 30 files, e.g. `frontend/src/components/ict-register/RegisterListShell.tsx:226` `className="bg-accent px-5 font-bold text-accent-foreground hover:bg-accent-hover …"`; plus 68 raw `<button>`s with `bg-accent`.
  - Destructive: `frontend/src/components/riskhub/RiskTypesPanel.tsx:354`, `frontend/src/components/riskhub/DepartmentsPanel.tsx:373`, `frontend/src/components/riskhub/roles/RoleDeleteDialog.tsx:53` `bg-red-500 text-white` = 3.76:1 (fails AA at 14px).
  - Four dialog footers: `frontend/src/components/ConfirmDialog.tsx:181-198` (Button secondary + Button); `frontend/src/components/kri/KRIHistoryEditModal.tsx:153-156` (outline `flex-1`); `frontend/src/components/executions/ExecutionLogModal.tsx:179-199` (raw button + `btn-primary`); `frontend/src/components/kri/KRIValueModal.tsx:202-213` and `frontend/src/components/kri/KriModalFooter.tsx:53` raw accent with `text-slate-950`.
- **Impact:** the main action looks different on every page and in every dialog.
- **Fix:** D4 `accent` variant as the one primary CTA (§4.7); delete `.btn-primary` / `.btn-secondary`; `destructive` variant; `DialogFooter` (§4.11). Guards: G-RATCHET `btn-classes`, `raw-button`.
- **Effort:** M. **Phase:** 1 → 3 (CSS deletion 4).
- **Verification:** R1 → R2-V1 confirmed → R3 merge M20 (GAP-B-11 recomputed at 3.76:1).

#### DS-10 🟡 Low primitive adoption; no Textarea, Checkbox, Radio or Switch primitive

- **Also:** SM-03, PG-11, PG-24, GAP-C-10, GAP-C-16 (dialect), GAP-C-17 (Field/Button part), GAP-C-18, GAP-B-21 (button constants).
- **Evidence:**
  - **Counts:** `<button` 394 in 175 files vs `<Button` 107 in 44; ≈64 raw text inputs vs `<Input` 40; 38 `<textarea`, 31 checkboxes, 4 radios with no primitive; 17 raw `<select>`; 122 `<label` vs 2 `<Label` (+ 114 through `<Field`). Per domain (Input / raw input+textarea / Field / ThemedSelect / raw select): `control-form` 0/9/0/7/0, `kri-form` 0/6/0/6/0, `components/kri` 0/12/0/2/0, `issues` 2/11/0/6/0, `riskhub` 0/22/0/3/0.
  - Same action, two looks: `frontend/src/pages/ThreatDetailPage.tsx:415` `px-4 py-2.5 glass rounded-xl text-slate-300 hover:text-white` vs `frontend/src/pages/AssetDetailPage.tsx:387-389` `<Button type="button" variant="secondary"`; Process uses `<Button` once against 18 raw buttons, Threat once against 16.
  - Copies: `TEXTAREA_CLASS` byte-identical in `frontend/src/pages/threats/ThreatForm.tsx:25`, `frontend/src/pages/assets/AssetForm.tsx:25`, `frontend/src/pages/processes/ProcessForm.tsx:31`; `function DetailField({` in `frontend/src/pages/ThreatDetailPage.tsx:30`, `frontend/src/pages/AssetDetailPage.tsx:43`, `frontend/src/pages/ProcessDetailPage.tsx:41`; Threat disables fields one by one, Asset/Process use `<fieldset disabled>` (`frontend/src/pages/assets/AssetForm.tsx:414`, `frontend/src/pages/processes/ProcessForm.tsx:476`).
  - `frontend/src/components/issues/issueUi.ts:15` `ISSUE_PRIMARY_BUTTON` and siblings; `frontend/src/pages/users/UsersPageHeader.tsx:40-44` raw `<button` with `border-info/30 bg-info/10` vs `frontend/src/pages/admin-console/sections/ops/SessionsPanel.tsx:98-100` `<Button type="button" variant="secondary"` for the same action.
  - `frontend/src/pages/risks/RiskRegisterFilterBar.tsx:60` native `<select>` with `bg-slate-900 px-3 py-2 text-sm text-white`; `:145` risk-type select lacks the test IDs of `:141`.
  - `frontend/src/pages/users/BreakGlassEnableDialog.tsx:57-58` `<span id="break-glass-reason-label"`; submit `:109-110` `type="button"` + `onClick` (no `<form>`, Enter does not submit); CTA raw `bg-amber-500`.
  - Flow shape (PG-11): `frontend/src/components/kri-form/KRIFormContainer.tsx:185` `max-w-3xl` and no `StepIndicator`; KRI edit is a modal with separate field components (`frontend/src/components/kri/KRIModal.tsx:79-110`); `frontend/src/components/issues/IssueCreateForm.tsx:273-275` `<button type="button" onClick={handleCreateIssue}`; cancel links `text-muted-foreground` (Risk) vs `text-slate-400/500` (Control, KRI, Issue). `frontend/src/components/access/AccessEditModalSections.tsx:60-61` adds a `rounded-md border bg-background p-2` input dialect.
- **Impact:** every bypassed primitive re-opens a theming, focus or labelling defect; forms in one app feel like four products.
- **Fix:** Phase 1 bespoke primitives (§4.7, §4.8; ADR-015 rejects shadcn generation); Phase 3 adoption per module: shared `WizardFooter`, `StepIndicator` for KRI, Issue create wrapped in `<form>`, optional `/kris/:id/edit` reusing `KRIFormContainer`, `DetailField` and `Textarea` replace the copies, `fieldset disabled` everywhere. Guards: G-RATCHET `raw-button`, `raw-text-input`; G-ESLINT element bans.
- **Effort:** L. **Phase:** 1 → 3 (cleanup 4).
- **Verification:** R1 (DS-10, SM-03, PG-11, PG-24) → R2 confirmed (counts exact) → R2-V2 GAP-C-10/16/17/18 → R3 confirmed, merge M19 (GAP-C-10 correction: the `text-slate-500` label passes on white but fails on riskhub glass).

#### DS-11 🟡 Tables: 18 hand-rolled `<table>`s with at least 9 header recipes; global `th`/`tr` overrides

- **Evidence:** canonical header `frontend/src/components/tables/SortableTable.tsx:260` `'px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground'`. Hand-rolled: `frontend/src/components/riskhub/ApprovalScenariosPanel.tsx:350` and `frontend/src/components/riskhub/roles/RolesTable.tsx:24` `text-left py-3 px-4 text-sm font-medium text-slate-400`; `frontend/src/components/riskhub/RiskQuestionnairesPanel.tsx:184`; `frontend/src/components/access/UsersTable.tsx:60`; `frontend/src/pages/AuditTrailPage.tsx:265` `px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500`; `frontend/src/pages/admin-console/sections/ops/SessionsTable.tsx:26`; `frontend/src/components/dashboard/ictCommittee/IctCommitteeExecutiveSummarySection.tsx:118`; `frontend/src/pages/vendors/VendorDerivedSection.tsx:125`; `frontend/src/pages/ProcessDetailPage.tsx:621`. Global rules `frontend/src/index.css:347-353` `.theme-dark th { … !important; }` and `:453-463` `.theme-light th` / `tr`.
- **Impact:** table headers look different per page; the `!important` rules override component row styles.
- **Fix:** `ui/table.tsx` rendered inside `SortableTable`; the D14 header recipe everywhere; delete the global rules after `divide-border` (O6).
- **Effort:** M. **Phase:** 1 → 3.
- **Verification:** R1 → R2-V1 confirmed (19 files contain `<table>`; the `tr` rule currently keeps light dividers visible).

#### DS-12 🟡 Tabs: five visual styles, two tablists without keyboard support, unused `@radix-ui/react-tabs`

- **Also:** PG-16, AX-07.
- **Evidence:** `frontend/package.json:42` `"@radix-ui/react-tabs": "^1.1.21"`, imported nowhere. Styles: detail underline `frontend/src/pages/RiskDetailPage.tsx:248` (copied in Control and KRI; Issue variant `frontend/src/pages/IssueDetailPage.tsx:153-154`); `frontend/src/pages/approvals/ApprovalsTabs.tsx:42` `'px-4 py-2 text-sm font-bold rounded-xl transition-colors'`; `frontend/src/pages/RiskHubPage.tsx:77` pill in a card; `frontend/src/pages/dashboard/DashboardViewTabs.tsx:19` uppercase pill; register switcher `frontend/src/components/ict-register/RegisterListShell.tsx:237-251`; Vendor `.vendor-tab` and Admin `.admin-tab-inactive` (`bg-slate-700`). Keyboard: `frontend/src/pages/departments/DepartmentDetailTabs.tsx:41-50` `role="tab"` without roving tabindex or arrow keys; `frontend/src/pages/ActivityLogPage.tsx:83-93` no role, active state by colour only. `useContentTabs` (ARIA + keyboard) is already used in ≈10 files.
- **Impact:** tabs look and behave differently per page; two are not keyboard-operable.
- **Fix:** D8: `ui/tabs.tsx` on `useContentTabs` (§4.12); remove the Radix dependency in Phase 4.
- **Effort:** M. **Phase:** 1 → 2 (dependency removal 4).
- **Verification:** R1 (DS-12, PG-16, AX-07) → R2 confirmed → R3 merge M16.

#### DS-13 🟡 Badge and pill fragmentation: 173 inline recipes in 84 files

- **Also:** PG-27, GAP-B-08, SM-06 (badge, pending and restore parts). ≈DS-06.
- **Evidence:**
  - 173 pill lines in 84 files: radius `rounded` 41 / `rounded-full` 78 / `rounded-md` 27 / `rounded-lg` 23; size `text-xs` 120 / `text-[10px]` 50; weight `font-bold` 63 / `font-black` 50. Named variants: `frontend/src/components/ui/RiskTypeBadge.tsx:18`, `frontend/src/components/ict-register/CriticalityClassPill.tsx:56`, `VendorBadge` (`frontend/src/components/vendors/vendorRouteUi.tsx:91`), `frontend/src/pages/IctRegisterDqPage.tsx:27,65`. Archived badge in three implementations (`getRiskStatusColor('archived')`, `frontend/src/pages/controls/controlsPagePresentation.ts:11`, `frontend/src/pages/kris/kriColumns.tsx:57`).
  - "Active" on one page in three palettes: `frontend/src/components/riskhub/ApprovalScenariosPanel.tsx:376` `bg-green-500/20 text-green-400`, `frontend/src/components/riskhub/DepartmentsPanel.tsx:259` emerald, `frontend/src/components/riskhub/RiskTypesPanel.tsx:265` `bg-success/10 text-success-text`.
  - Registers: Vendor status neutral (`frontend/src/pages/vendors/vendorColumns.tsx:97`) vs success colours elsewhere (`frontend/src/pages/threats/threatColumns.tsx:18`); pending badge `frontend/src/pages/processes/processColumns.tsx:129` `bg-amber-400/15 … text-amber-200` vs `frontend/src/pages/assets/assetColumns.tsx:109` `bg-warning/10 … text-warning-text` vs `frontend/src/pages/vendors/vendorColumns.tsx:103` `bg-warning/15`; Threat shows none although `has_pending_change` exists. Restore vocabulary: Vendor text "Unarchive" (`frontend/src/pages/vendors/vendorColumns.tsx:125`) vs icon-only "Restore" (`frontend/src/pages/threats/threatColumns.tsx:120`).
- **Impact:** the same status looks different on each page; pending changes are invisible in some registers.
- **Fix:** `ui/badge.tsx` + domain wrappers (§4.9); `PendingChangeBadge` wherever `has_pending_*` exists; one "Restore" vocabulary via `RowRestoreButton` (PG-28). Guard: G-RATCHET `pill-inline`.
- **Effort:** M. **Phase:** 1 → 3.
- **Verification:** R1 (DS-13, PG-27, SM-06) → R2 confirmed with corrections (84 files, not 82; SM-06 line drift) → R3 merge M12.

#### PG-07 🟡 Destructive actions: confirmation missing or inconsistent; archive labelled "Delete" and drawn with `Trash2`

- **Also:** SM-04, GAP-C-01, R3-02, GAP-C-06, GAP-B-05, GAP-B-13.
- **Evidence:**
  - Three archive implementations: Risk `frontend/src/pages/RiskDetailPage.tsx:326` `<ConfirmDialog` with `confirmLabel={t('common:actions.archive')}`; Control `frontend/src/pages/ControlDetailPage.tsx:307` `<ArchiveConfirmDialog` (raw `rose-*`; `frontend/src/components/ArchiveConfirmDialog.tsx:12` `resourceType: 'control' | 'risk';`); KRI `frontend/src/pages/KRIDetailPage.tsx:207` `t('common:actions.delete')` with `kris:delete_dialog.title` "Delete KRI", although the action is gated by `canArchive` (`:111`) and restorable. All use `Trash2` (e.g. `frontend/src/pages/RiskDetailPage.tsx:236`, `frontend/src/pages/ThreatDetailPage.tsx:428`).
  - Reason policy (SM-04): Vendor (`frontend/src/pages/VendorDetailPage.tsx:364-365`) and Asset (`frontend/src/pages/AssetDetailPage.tsx:664-665`) always; Process conditionally (`frontend/src/pages/ProcessDetailPage.tsx:775`); Threat never, and it closes the dialog on error (`frontend/src/pages/ThreatDetailPage.tsx:131` `setActionError(t('errors.archive_failed'));`, `:134`) because `frontend/src/services/threatApi.ts:135` `async archiveThreat(id: number): Promise<void> {`.
  - One-click link removal (GAP-C-01, R3-02): `frontend/src/pages/threats/ThreatRiskLinksSection.tsx:130` `onClick={() => removeRiskLink.mutate(link.id)}`; Risk side `frontend/src/components/risks/detail-overview/RiskRegisterLinksSection.tsx:516` `onRemove={(linkId) => removeThreatLink.mutate({ linkId, ownerId: risk.id })}`, while the process and asset blocks in the same file use `GovernedMutationReasonDialog` (`:609`, `:632`). Reference pattern: `frontend/src/pages/assets/AssetLinkSections.tsx:38-45` (FR-P4-8).
  - Archive with no confirmation when approval isn't required (GAP-C-06): `frontend/src/pages/vendors/VendorContractsSection.tsx:240` `archiveContract.mutate({ contract, reason: '' });`, `frontend/src/pages/vendors/VendorSubOutsourcingSection.tsx:285` (reversible through `onRestore`).
  - Outbound bulk send with no confirmation (GAP-B-05): `frontend/src/components/riskhub/RiskQuestionnairesPanel.tsx:257` `onClick={handleBatchSend}`; `select_all: true` sends to every filtered risk (`frontend/src/components/riskhub/riskQuestionnairePanelState.ts:154-157`).
  - Unlink worded as delete (GAP-B-13): `frontend/src/components/LinkManagementDialog.tsx:163` `title={t('common:confirmation.delete_title')}`, `:165` `confirmLabel={t('common:actions.delete')}`, while `frontend/src/components/linking/ExistingLinksPanel.tsx:70` uses `risks:actions.unlink` and `:33` heads the list with `common:labels.details`.
- **Impact:** users cannot tell a reversible archive from an irreversible delete; links are removed and questionnaires sent in one click; Threat archive errors appear after the dialog has closed.
- **Fix:** D10 (§4.11): `ConfirmDialog intent` `archive` / `delete` / `unlink` / `send` with `Archive` / `Trash2` / `Unlink` / `Send`; always confirm, ask for a reason only when approval is required (one flag, PO to confirm); errors stay in the dialog; KRI copy renamed; plural count for bulk send; Threat reason needs a backend change (O9).
- **Effort:** M. **Phase:** 1 → 2.
- **Verification:** R1 (PG-07, SM-04) → R2 confirmed (SM-04 correction: Threat's API takes no reason) → R2-V2 / R2-V3 GAP-C-01, GAP-C-06, GAP-B-05, GAP-B-13 → R3 confirmed; GAP-C-01 broadened to the Risk side (R3-02); GAP-B-13 lowered to 🟢; merge M10 → R5 path correction (`select_all` payload lives in `riskQuestionnairePanelState.ts:154-157`, not `RiskQuestionnairesPanel.tsx`).

#### PG-22 🟡 Dialogs can close mid-submit; close guards are inconsistent

- **Also:** ≈DS-07; the footer variants are in DS-09.
- **Evidence:** `frontend/src/components/executions/ExecutionLogModal.tsx:67` `onClose={onClose}` without `closeDisabled`, and its Cancel at `:181` lacks `disabled={isSubmitting}`. `ExecutionLogModal`, `KRIValueModal` and `KRIHistoryEditModal` have no `useDirtyTaskGuard`, while `KRIModal`, `IssueQuickCreateModal`, `ControlCreateDialog` (through its hosted form, `frontend/src/components/control-form/ControlFormContainer.tsx:16,129`) and every page form use it.
- **Impact:** a user can dismiss a dialog while its mutation is in flight, or lose typed input without a prompt.
- **Fix:** `closeDisabled={isSubmitting}` + `useDirtyTaskGuard`; `DialogFooter` (§4.11).
- **Effort:** S–M. **Phase:** 1 → 2.
- **Verification:** R1 → R2-V1 confirmed → R5 path correction (`:16`, `:129` are in `ControlFormContainer.tsx`; `ControlCreateDialog.tsx` itself does not call the hook).

#### GAP-B-07 🟡 The approver-role picker is a fake listbox

- **Evidence:** `frontend/src/components/riskhub/ApprovalScenariosPanel.tsx:203` `aria-haspopup="listbox"`; `:215` a plain `div` of buttons with no `role="option"` or `aria-selected`, and no Escape or outside-click close (only `setShowRoleDropdown` at `:78`, `:201`); `:245` `{t('common:actions.delete')} {getRoleLabel(role)}` labels chip removal "Delete". `common:actions.remove` does not exist in `frontend/src/i18n/locales/en/common.json`.
- **Impact:** the announced listbox has no listbox semantics; removing a role from a scenario is worded as deleting it.
- **Fix:** `MultiSelect` (§4.8); create `common:actions.remove` (en + cs).
- **Effort:** M. **Phase:** 1 → 3a.
- **Verification:** R2-V3 → R3 confirmed with corrections (the key must be created).

#### GAP-D-05 🟡 The owner-lookup Retry uses an undefined `.btn-secondary` class and renders unstyled

- **Evidence:** `frontend/src/components/risk-form/RiskFormOwnershipStep.tsx:179` `className="btn-secondary mt-2"`. No CSS file defines `.btn-secondary`; only `.btn-primary` exists (`frontend/src/index.css:233`). Under Tailwind preflight the Retry control (shown in the owner-results box when the lookup fails) is a bare transparent text button with inherited colour.
- **Impact:** a recovery action with no button affordance in the Risk form (still focusable and named "Retry").
- **Fix:** `<Button variant="secondary" size="compact">` (D4 deletes the class names).
- **Effort:** S. **Phase:** 0.
- **Verification:** R3 coverage sweep → R5 confirmed (grep of every `.css`/`.js`/`.ts`/`.tsx` under `frontend/` outside `node_modules` finds `btn-secondary` only at `:179`); impact wording softened ("invisible-looking" → "no button affordance").

#### GAP-D-07 🟡 Pending-change panels are copied four times; three are hard-coded amber and unreadable in light

- **Evidence:** `frontend/src/pages/assets/AssetPendingChangePanel.tsx:36` `text-amber-200` (1.25:1 on white), `:45` `text-slate-300`, `:62` `text-amber-100` (1.11:1); the same markup in `frontend/src/pages/threats/ThreatPendingChangePanel.tsx:39,67` and `frontend/src/pages/processes/ProcessPendingChangePanel.tsx:34,56`; the tokenised copy `frontend/src/pages/vendors/VendorPendingChangePanel.tsx:35` uses `text-warning-text` and `border-warning/30`. `frontend/src/pages/processes/ProcessPendingCreationsPanel.tsx:107` styles "cancel pending request" in `text-rose-300` while the panels above use amber.
- **Impact:** three copies drift; pending-change notices are unreadable in light.
- **Fix:** extract `components/approvals/PendingChangePanel.tsx` from the Vendor version (`namespace`, `testIdPrefix` props) and delete the three raw copies; one tone for cancel.
- **Effort:** S. **Phase:** 3d.
- **Verification:** R3 coverage sweep → R5 confirmed (all cited lines and classes exact).

**🟢 Observations (6.3)**

| ID | Title | Evidence | Fix | Effort | Phase | Verification |
|---|---|---|---|---|---|---|
| DS-28 | Primitive README drift; `SearchableEntitySelect` bypasses `Input` | `frontend/src/components/ui/README.md` lists 6 of 12 files; tables and forms READMEs omit files; `frontend/src/components/layout/README.md` misses `frontend/src/components/layout/DestinationLauncher.tsx` and `frontend/src/components/layout/sidebar.css`; `frontend/src/components/ui/SearchableEntitySelect.tsx:62` `w-full glass rounded-lg pl-8 pr-3 py-1.5 text-sm … bg-white/5` (≈32px next to 40px selects) | Rewrite the READMEs; `Input size="compact"` | S | 1 → 4 (inventories) | R1 → R2-V1 confirmed with corrections (layout README does list `DesktopOnlyNotice`) |
| DS-29 | Primitive hygiene; six pagination implementations | `frontend/src/components/DialogShell.tsx:36` `function classNames(...values: Array<string \| undefined>) {`; `frontend/src/components/ErrorBoundary.tsx:63` raw `rounded-md bg-primary` button; `frontend/src/components/tables/Pagination.tsx:53-113` buttons without `type`; other pagers `frontend/src/components/kris/KRIDetailHistoryTab.tsx:128`, `frontend/src/pages/ApprovalsPage.tsx:140-178`, `ActivityLogPagination`, Notifications, ICT DQ; `frontend/src/components/ui/StepIndicator.tsx:44-57` no focus style; `frontend/src/components/ui/button.tsx:17,20` outline/ghost hover to saturated accent | `cn`; `buttonVariants`; one `Pagination` with `mode` (D14, §4.13); `focus-ring`; hover `bg-tint/10` | S (pagination M) | 1 → 2 | R1 → R2-V1 confirmed |
| PG-28 | Row "Unarchive" buttons are raw with hard-coded emerald | `frontend/src/pages/risks/riskColumns.tsx:200-206` raw button without `type`, `text-emerald-300` (≈1.5:1 in light); copies `frontend/src/pages/controls/controlColumns.tsx:105-112`, `frontend/src/pages/kris/kriColumns.tsx:81-86` | `RowRestoreButton` in `components/tables/` (§4.7) | S | 3b | R1 → R2-V1 confirmed |
| PG-29 | Pending-approval row badge duplicated for Risk/Control, missing for KRI/Issue | `frontend/src/pages/risks/riskColumns.tsx:57` `columns.pending_tooltip` vs `frontend/src/pages/controls/controlColumns.tsx:34` `columns.pending_changes_title` | `PendingChangeBadge` (§4.9) | S | 3b | R1 → R2-V1 confirmed |
| PG-31 | Identical `renderGroupBody` in ControlsPage and KRIsPage | `frontend/src/pages/ControlsPage.tsx:58` and `frontend/src/pages/KRIsPage.tsx:93-97` `grid grid-cols-2 gap-y-2 pb-2 border-b border-white/5` | Extract `RiskGroupMetaBody` | S | 3b | R1 → R2-V1 confirmed |
| PG-43 | Dead UI cited as live evidence: `MiniHeatmap`, `GroupedView`, `CategoryDrillDown` (Also: R3-01, DS-14 MiniHeatmap part, I18N-01 CategoryDrillDown part, DS-01/DS-22 dead citations) | `frontend/src/components/tables/index.ts:6-9` exports them; no importer outside `components/tables/`; `CategoryDrillDown` is referenced only by `tests/frontend/unit/src/components/tables/CollectionGroupDrillDown.i18n.test.tsx:6`; the live `CollectionGroupDrillDown` (imported by `frontend/src/components/ict-register/RegisterListShell.tsx:6`) has 0 `text-white` | Delete the three components, the unit test and README entries before any codemod (D16, O1) | S | 0 | R1 → R2-V1 confirmed → R3-01 |
| GAP-D-21 | Dead `ViewSwitcher` duplicates the register view switcher without its a11y | exported at `frontend/src/components/tables/index.ts:10`, imported nowhere; `frontend/src/components/tables/ViewSwitcher.tsx:45-58` buttons without `type` or `aria-pressed` (vs `frontend/src/components/ict-register/RegisterListShell.tsx:241`) | Delete (D16) | S | 0 | R3 coverage sweep → R5 confirmed (no importer in `frontend/src` or `tests/`; only the barrel and `frontend/src/components/tables/README.md:16` mention it) |
| GAP-D-22 | Register "added filter" card copied 8 times, 7 raw | `frontend/src/pages/controls/ControlRegisterFilterBar.tsx:52`, `frontend/src/pages/assets/AssetRegisterFilterBar.tsx:188`, `frontend/src/pages/kris/KriRegisterFilterBar.tsx:143`, `frontend/src/pages/issues/IssuesFilterBar.tsx:90`, `frontend/src/pages/processes/ProcessRegisterFilterBar.tsx:325`, `frontend/src/pages/risks/RiskRegisterFilterBar.tsx:147`, `frontend/src/pages/threats/ThreatRegisterFilterBar.tsx:312` `rounded-xl border border-white/10 bg-white/[0.025] p-3 pr-12`; tokenised `frontend/src/pages/vendors/VendorRegisterFilterBar.tsx:338`; `frontend/src/pages/controls/ControlRegisterFilterBar.tsx:47` names the status select "All statuses" | `RegisterFilterCard` slot in `RegisterListToolbar` with the vendor tokens; name the select `t('columns.status')` | S | 3b | R3 coverage sweep → R5 confirmed (8 cards, 7 raw) |
| GAP-D-26 | Hand-rolled native selects in native auth and user admin | `frontend/src/pages/native/NativeFactor.tsx:82`, `frontend/src/pages/native/NativePublicPage.tsx:89`, `frontend/src/pages/native/NativeSecurityPage.tsx:128,148`, `frontend/src/pages/users/NativeUserLifecyclePanel.tsx:135,141` `w-full rounded-md border bg-background p-2`; a third recipe at `frontend/src/pages/vendors/VendorRegisterFilterBar.tsx:273` | `ui/native-select.tsx` with `Input` geometry and `focus-ring` (§4.8) | S | 1 → 3 | R3 coverage sweep → R5 confirmed |

### 6.4 Page layout and navigation

#### DS-15 🟡 Page-title hierarchy: 5+ recipes, at least 9 routes without an `<h1>`, dead `font-heading`

- **Also:** PG-17, AX-03, GAP-C-19, PG-06 (header and title part), SM-02 (header part), GAP-B-21 (h3/h4 part), PG-12 (header-structure remainder, assigned at assembly).
- **Evidence:**
  - Recipes: registers `frontend/src/components/ict-register/RegisterListShell.tsx:206` `<h1 className="text-3xl font-bold text-foreground">{title}</h1>`; entity detail `frontend/src/pages/detail/EntityDetailHeader.tsx:51` `text-4xl font-black tracking-tighter`; `frontend/src/pages/ApprovalsPage.tsx:75` `text-4xl font-black … tracking-tighter`; `frontend/src/pages/KRIDetailPage.tsx:146` `text-2xl font-black`; `frontend/src/pages/RiskHubPage.tsx:60`, `frontend/src/pages/SettingsPage.tsx:45`, `frontend/src/pages/AdminConsolePage.tsx:56` `text-2xl font-bold … font-heading`; Threat and Process `text-3xl font-bold` (`frontend/src/pages/ThreatDetailPage.tsx:392`, `frontend/src/pages/ProcessDetailPage.tsx:451`).
  - No `<h1>`: the 6 New/Edit pages (`<h2 className="text-3xl font-black text-white tracking-tighter">`), `frontend/src/pages/dashboard/DashboardHeader.tsx:51`, `frontend/src/pages/DepartmentsPage.tsx:48`, `frontend/src/pages/IssueDetailPage.tsx:116` `<h2 className="text-4xl font-black text-foreground tracking-tighter">`, `frontend/src/pages/GovernancePage.tsx:252`, `frontend/src/pages/AuditTrailPage.tsx:142,165`, `frontend/src/pages/departments/DepartmentDetailHeader.tsx:32`. The only layout `<h1>` is `frontend/src/components/layout/DesktopOnlyNotice.tsx:28` (below `lg`).
  - Misuse and skipped levels: `frontend/src/pages/GovernancePage.tsx:243` stat value as `<h3 className="text-4xl …">`; `frontend/src/components/dashboard/IctCommitteeSection.tsx:103` `<h1>` inside the dashboard; `frontend/src/pages/SettingsPage.tsx:45` h1 → `frontend/src/components/settings/NotificationSettings.tsx:157` h3 → h4; `frontend/src/pages/AdminConsolePage.tsx:56` h1 → `frontend/src/pages/admin-console/sections/ops/SessionsPanel.tsx:92` h3 → `frontend/src/pages/admin-console/sections/ops/SchedulerStatusSection.tsx:17` h4 → `:50` h5; `frontend/src/pages/VendorReportsPage.tsx:248` h1 → h3; issue cards `frontend/src/components/issues/remediation/WorkflowSummarySection.tsx:46` h3 next to sibling h4s (`frontend/src/components/issues/RemediationPlanCard.tsx:19-64`).
  - Header divergence (PG-06, SM-02, PG-12): KRI, Issue, Threat, Process and Department hand-roll their headers; `frontend/src/pages/KRIDetailPage.tsx:127` `<button onClick={() => navigate(returnTo)} className="hover:text-white …`; `frontend/src/pages/IssueDetailPage.tsx:106-113` plain button back link; RiskEdit and IssueNew have no back link; ControlNew/Edit lack the icon tile; ≥ 7 back-affordance variants.
  - `font-heading` is used 6 times and compiles to nothing (no `fontFamily` in `tailwind.config.js`).
- **Impact:** screen-reader users cannot jump to the page title on ≥ 9 routes; titles change size and weight from page to page.
- **Fix:** D7 (§4.14): `PageHeader` and `EntityDetailHeader` are the only `h1` sources, with one recipe; section titles `h2`; KPI values `<p>`; `fontFamily.heading` (D6). Guard: one-`h1` Playwright assertion.
- **Effort:** M. **Phase:** 1 → 2.
- **Verification:** R1 (DS-15, PG-17, AX-03, PG-06, SM-02) → R2-V1 confirmed with corrections (≥ 9 routes, not 6; `font-heading` has 0 compiled rules) → R2-V2 GAP-C-19, R2-V3 GAP-B-21 → R3 merge M11.

#### DS-16 🟡 Page container: double padding and six root rhythms

- **Also:** PG-15 (`p-8` part and remainder), PG-06 (KRI `p-8`), SM-14.
- **Evidence:**
  - `frontend/src/components/layout/MainLayout.tsx:37` `className="flex-1 overflow-y-auto p-6 md:p-8"`, then pages add their own: `frontend/src/pages/ApprovalsPage.tsx:73` `<div className="space-y-8 p-8">`, `frontend/src/pages/NotificationsPage.tsx:291` `<div className="p-8 max-w-4xl mx-auto">`, `frontend/src/pages/KRIDetailPage.tsx:90,115` `p-8`.
  - Root rhythm `space-y-3/4/6/8/10` and `gap-6`; only `frontend/src/components/vendors/vendorRoute.css:5-8` caps width (1520px), `frontend/src/pages/UserNewPage.tsx:53` uses `max-w-4xl`; page loading containers use `h-[60vh]`, `min-h-[60vh]` or `h-96`.
  - Approvals remainder (PG-15): `frontend/src/pages/ApprovalsPage.tsx:109-116` raw search `<input` (token text, readable); bespoke pager `:140-178`; `:80-81` `<X className="h-5 w-5" />` used as an error glyph.
- **Impact:** 64px gutters on some pages, different content widths and spacing per route.
- **Fix:** D11 `PageContainer` (1520px, forms 960px) with `MainLayout` owning the gutter (§4.6); Approvals uses `Input` + `Search` icon, `Pagination mode="cursor"` and `ErrorState variant="banner"`.
- **Effort:** S–M. **Phase:** 1 → 2.
- **Verification:** R1 (DS-16, PG-15, SM-14) → R2 confirmed (PG-15 corrections: token text; nav starts at `:140`) → R3 merge M23.

#### NAV-01 🟡 No per-route document title and no route-change announcement

- **Also:** I18N-04.
- **Evidence:** `document.title` is written only by `frontend/src/pages/ProdLoginPreviewPage.tsx:19` and `frontend/src/pages/login/useProdLoginMetadata.ts:19`; every authenticated route keeps `frontend/index.html:12` `<title>RiskHub — Enterprise Risk Management</title>` (English only). `<main tabIndex={-1}>` is focused only by the skip link (`frontend/src/components/layout/MainLayout.tsx:17-26`).
- **Impact:** every tab and history entry is called the same; screen readers get no cue after SPA navigation (WCAG 2.4.2).
- **Fix:** D14: `usePageTitle` through `PageHeader`; `MainLayout` focuses the `h1` after a pathname change and announces through a live region (§4.14); `frontend/src/pages/native/NativeFrame.tsx:18` is the reference.
- **Effort:** M. **Phase:** 1 → 2.
- **Verification:** R1 → R2-V2 confirmed → R3 merge M26.

#### NAV-02 🟡 Unowned routes highlight nothing; breadcrumbs almost absent; Department ignores `return_to`

- **Evidence:** `frontend/src/routing/business.tsx:82-85` (notifications), `:316-319` (vendor-reports) and `:321-329` (audit-trail) have no `nav`, so `resolveActiveSidebarHref` (`frontend/src/routing/index.ts:67-78`) highlights nothing. The only breadcrumb is `frontend/src/pages/KRIDetailPage.tsx:121`. `frontend/src/pages/DepartmentDetailPage.tsx:88` `onBack={() => navigate('/departments')}` ignores the `return_to` context the registers honour.
- **Impact:** users lose orientation on three routes and on most detail pages.
- **Fix:** `AppRouteDef.activeNavHref`; breadcrumbs on detail and edit pages through `EntityDetailHeader` (D14); honour `return_to`.
- **Effort:** S–M. **Phase:** 2.
- **Verification:** R1 → R2-V2 confirmed.

#### AX-06 🟡 Back-button names don't match their destinations

- **Evidence:** `frontend/src/pages/ThreatDetailPage.tsx:232-233` `onClick={() => navigate(threatDetailPath(threat.id))}` with `aria-label={t('actions.back_to_register')}` ("Back to Threats", but it goes to the detail page); same pairing at `:259-260`, `:292-293`, `frontend/src/pages/ProcessDetailPage.tsx:279-280,320-321,353-354`, `frontend/src/pages/AssetDetailPage.tsx:239-240,264-265,287-288`. `frontend/src/pages/VendorDetailPage.tsx:225-226` shows a visible "Back to register" that navigates to the detail page; `:183` `backLabel={t('title')}`.
- **Impact:** 12 back controls announce the wrong destination.
- **Fix:** new `common:actions.back_to_detail` "Back to {{name}}"; labelled `BackButton` (D14).
- **Effort:** S. **Phase:** 2.
- **Verification:** R1 → R2-V2 confirmed.

#### PG-08 🟡 Detail action rows: icon-only vs labelled vs absent

- **Evidence:** Risk Edit `frontend/src/pages/RiskDetailPage.tsx:199-208` and Archive ≈`:225-238`, Control `frontend/src/pages/ControlDetailPage.tsx:178-187`, all `size="icon"`; KRI `frontend/src/pages/KRIDetailPage.tsx:180-182` labelled outline "Edit", and `:175` `className="bg-success text-success-foreground hover:bg-success/90"`; KRI builds its own issue CTA (`:166-173`) instead of `ContextualIssueAction`; Issue detail has only a refresh icon (`frontend/src/pages/IssueDetailPage.tsx:128-141`).
- **Impact:** the same actions sit in different places with different affordances on each detail page.
- **Fix:** the action-row contract (§4.7): labelled `accent` primary, labelled `outline` secondaries, destructive last; `Button variant="success"`; `ContextualIssueAction` for KRI.
- **Effort:** S–M. **Phase:** 2 → 3b.
- **Verification:** R1 → R2-V1 confirmed with corrections (Risk Archive is at ≈`:225-238`).

#### SM-05 🟡 Blocked-edit views and ownership banners have four implementations

- **Evidence:** blocked-edit views: Threat `frontend/src/pages/ThreatDetailPage.tsx:227-240` (no `h1`), Process `frontend/src/pages/ProcessDetailPage.tsx:286` `{t('pending_change.edit_blocked_title')}` (has `h1`), Asset `frontend/src/pages/AssetDetailPage.tsx:232-243` (no `h1`), Vendor `frontend/src/pages/VendorDetailPage.tsx:225` (text back button). Ownership banners: `StewardshipAlert` (`frontend/src/pages/ThreatDetailPage.tsx:49`), `ProcessOwnershipAlert` (`frontend/src/pages/ProcessDetailPage.tsx:331`), Asset inline `<div role="alert" … border-amber-400/30 text-amber-200">` (`frontend/src/pages/AssetDetailPage.tsx:269`), `VendorOwnershipPendingMessage` (`frontend/src/pages/VendorDetailPage.tsx:237`).
- **Impact:** the same governance state reads differently per module.
- **Fix:** `EditBlockedState` and `OwnershipGovernanceAlert` in `pages/detail/` on warning tokens (§4.14).
- **Effort:** M. **Phase:** 1 → 3d.
- **Verification:** R1 → R2-V2 confirmed.

**🟢 Observations (6.4)**

| ID | Title | Evidence | Fix | Effort | Phase | Verification |
|---|---|---|---|---|---|---|
| NAV-03 | Entity-to-icon mapping inconsistent | `frontend/src/routing/admin.tsx:22` and `frontend/src/routing/business.tsx:196` both `icon: Server,`; Governance cards `frontend/src/pages/GovernancePage.tsx:138` `icon: Scale,` (risk), `:160` `AlertTriangle` (KRI), `:171` `ShieldAlert` (threat), `:204` `Truck` (vendor); `frontend/src/pages/DepartmentsPage.tsx:144` `Activity` for KRIs | `constants/entityIcons.ts` used by routing, governance, departments and search | S | 3f | R1 → R2-V2 confirmed |
| NAV-04 | Single root Suspense with a bare text fallback | `frontend/src/App.tsx:64` is the only `<Suspense`; `frontend/src/App.tsx:45` `<div className="flex items-center justify-center min-h-screen">{t('loading.generic')}</div>` | `<Suspense>` around the `Outlet` with `LoadingState layout="page"` | S | 2 | R1 → R2-V2 confirmed |
| NAV-05 | Route guarding mixed | `frontend/src/routing/business.tsx:272` `GovernanceRouteGuard` plus the in-page `frontend/src/pages/GovernancePage.tsx:366` `if (!authz.canViewGovernance) {` | Document the rule in `frontend/src/routing/README.md`; drop the duplicate guard | S | 4 | R1 → R2-V2 confirmed |
| NAV-06 | Sidebar grouping semantics | `departments` in `group: 'overview'` (`frontend/src/routing/business.tsx:262`); `evidence` (`:311`) and `risk_hub` (`:338`) in `'administration'` | Move `departments` out of `overview` and `evidence`/`risk_hub` out of `administration` per the PO answer (§3.1) | S | 3f | R1 only (not spot-checked in R2) |

### 6.5 States and feedback

#### DS-17 🟡 Loading, empty, error and access-denied states are re-implemented per feature

- **Also:** PG-13, PG-14, SM-07, SM-08, AX-12, PG-45, GAP-B-26 (loading part).
- **Evidence:**
  - Loading: `Loader2` 20, CSS ring 15 (`frontend/src/pages/RiskDetailPage.tsx:102` `w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin`), `RefreshCw` 14, `animate-pulse` 21. `aria-busy` only at `frontend/src/pages/RiskDetailPage.tsx:101` (not `frontend/src/pages/ControlDetailPage.tsx:82`, `frontend/src/pages/IssueDetailPage.tsx:79`). Plain-text cards: `frontend/src/pages/ThreatDetailPage.tsx:193` `<div className="glass-card text-sm text-muted-foreground">{tCommon('loading.generic')}</div>` (also Process `:239`, Asset `:198`). `frontend/src/pages/DepartmentDetailPage.tsx:68` puts `aria-label` on a role-less div; `frontend/src/App.tsx:29,45`, `frontend/src/pages/AdminConsolePage.tsx:41` and `frontend/src/components/risks/risk-questionnaire-detail/RiskQuestionnaireDetailContainer.tsx:79` are plain text; only Notifications, `ActivityLogEntries` and `IctRegisterDqPage` expose `role="status"` or `aria-busy`.
  - Access denied: `frontend/src/pages/IssuesPage.tsx:29` `accessDeniedState={<div className="glass-card p-8 flex items-center gap-3 text-amber-200">`; `frontend/src/pages/ActivityLogPage.tsx:32-42` and `frontend/src/pages/AuditTrailPage.tsx:124-134` re-implement `ReadAccessDeniedState`, whose `descriptionKey` has 0 callers; `frontend/src/pages/IssueNewPage.tsx:28-30` `catch { … setCanCreate(false)` turns network errors into "denied" with no retry; `frontend/src/pages/UserNewPage.tsx:96` vs `:117-120` show two denied renderings.
  - Error boxes instead of `TableErrorState`: `frontend/src/pages/UsersPage.tsx:331`, `frontend/src/pages/DepartmentsPage.tsx:63`, `frontend/src/pages/AuditTrailPage.tsx:145`, `frontend/src/pages/GovernancePage.tsx:106-127`.
  - "Loading data…" as the empty message when nothing is loading: `frontend/src/pages/KRIsPage.tsx:78` `t('common:loading.data')` (also Risks `:53`, Controls `:47`, Issues `:73`).
- **Impact:** most loading states are not announced; failures and denials look different on every page.
- **Fix:** `ui/state.tsx` (§4.15). Phase 0: Issues uses `ReadAccessDeniedState`. Later: `IssueNewPage` on `useCreateCapabilityGate` + `FormCapabilityGateState`; AuditTrail passes `descriptionKey="controls:access.denied_control_execution_history"`.
- **Effort:** M. **Phase:** 0 → 2.
- **Verification:** R1 (DS-17, PG-13, PG-14, SM-07, SM-08, AX-12, PG-45) → R2 confirmed (SM-07 line drift) → R3 merge M21.

#### GAP-C-11 🟡 Primary-data load failures render as empty or as nothing

- **Also:** GAP-B-04, GAP-C-03, GAP-C-21, PG-21 (error-as-empty part and remainder).
- **Evidence:**
  - Admin console: `frontend/src/pages/admin-console/sections/ops/SessionsPanel.tsx:29` `const { data: sessions, isLoading } = useQuery({` (empty table body on failure); `frontend/src/pages/admin-console/sections/ops/LogsPanel.tsx:21` (same); `frontend/src/pages/admin-console/sections/audit/LogSettingsPanel.tsx:152` `if (isLoading || !form) return null;`.
  - Risk Hub: `frontend/src/components/riskhub/DepartmentsPanel.tsx:158` `if (panel.isLoading) {` with no error branch, although `frontend/src/components/riskhub/useRiskHubConfigResource.ts:44` exposes `error: query.error`; `frontend/src/components/riskhub/RolesPanel.tsx:17` `if (rolesPanel.rolesLoading) {`, and `frontend/src/components/riskhub/roles/useRolesPanelData.ts:45-59` exposes no error.
  - Vendor register links: `frontend/src/pages/vendors/VendorRegisterLinksSection.tsx:211` `assetLinksQuery.data ?? []`, and `:271` `{assetRows.length === 0 ? (` shows "no linked assets" on failure.
  - Issue history: `frontend/src/pages/issues/issue-detail/useIssueHistory.ts:38-39` returns only items and `isLoading`, so a failed fetch renders `detail.messages.no_history`. Remainder: `frontend/src/pages/issues/issue-detail/IssueHistoryTab.tsx:37` `{entry.action.replaceAll('_', ' ')}` (raw enum, see GAP-D-02) and `frontend/src/pages/issues/issue-detail/useIssueHistory.ts:31` `limit: 100,` with no paging.
  - Sub-outsourcing: `frontend/src/pages/vendors/VendorSubOutsourcingSection.tsx:475` `entriesQuery.isLoading || entriesQuery.isError || chainGroups.length === 0 ?` collapses the grouping on a refetch error (the error banner is kept).
- **Impact:** an outage reads as "no data", which in a GRC tool can be mistaken for a clean state.
- **Fix:** every query region renders `LoadingState` / `ErrorState` / `EmptyState` chosen by `resolveCollectionOutcome` / `resolveTableErrorContract` (§4.15). Departments needs ~5 lines; the Roles hook must expose `error`; translate issue actions; page issue history with `Pagination` (§4.13) instead of the fixed `limit: 100`.
- **Effort:** S–M. **Phase:** 2 → 3.
- **Verification:** R1 PG-21 → R2-V2 GAP-C-03/11/21, R2-V3 GAP-B-04 → R3 confirmed, merge M7.

#### FB-01 🟡 No unified feedback; a failed row restore replaces the whole register

- **Also:** PG-09, SM-12, GAP-C-14, GAP-C-12 (raw-message part), GAP-B-10 (2 s "saved" part; primary DS-04).
- **Evidence:**
  - No toast library or component (`grep -rni "toast|snackbar|sonner"` → 0), and `@radix-ui/react-toast` is not a dependency.
  - Row restore: `frontend/src/pages/risks/useRisksPageState.ts:185` `if (isQueryCurrent(restoreQueryIdentity)) setErrorKey(apiClient.toUiMessageKey(error));`, identical in `frontend/src/pages/controls/useControlsPageState.ts:124`, `frontend/src/pages/kris/useKrisPageState.ts:156`, `frontend/src/pages/threats/useThreatsPageState.ts:165`, `frontend/src/pages/vendors/useVendorsPageState.ts:214`; `frontend/src/pages/RisksPage.tsx:48` `isError={Boolean(state.errorKey)}` flips the list into its error state, and Retry re-fetches instead of retrying the restore. A successful restore gives no confirmation.
  - Five mechanisms: router-state flashes (`frontend/src/components/control-form/useControlFormWorkflow.ts:177` `controlFlash`, `frontend/src/pages/vendors/useVendorDetailPageEffects.ts:15` `vendorFlash`, `frontend/src/pages/users/NativeInviteForm.tsx:79` `nativeInvitation`); `ApprovalQueuedBanner` (Risk, Control, KRI only); redirect to `/approvals?tab=mine` (Vendor, Asset, Threat); Process edit returns silently to detail (`frontend/src/pages/ProcessDetailPage.tsx:379-381`) while Process create redirects (`:228-230`); bespoke KRI banner (`frontend/src/pages/KRIDetailPage.tsx:232`).
  - Silent or raw failures: Threat/Asset/Process save, archive and restore are silent; `frontend/src/components/settings/NotificationSettings.tsx:84-86` `// Rollback on error` only logs (siblings use `PreferenceSyncStatus`), Retry at `:117` has no `type`; `frontend/src/pages/admin-console/sections/ops/SessionsPanel.tsx:46` `? (error.rawMessage ?? error.messageKey)` shows backend text or untranslated keys; `frontend/src/pages/admin-console/sections/audit/LogSettingsPanel.tsx:120`.
- **Impact:** users don't learn whether an action worked; one failed row hides the whole register.
- **Fix:** D9 (§4.16): `@radix-ui/react-toast` behind `useFeedback()`; row failures → toast; flashes → toast; D12 approval-queued rule (PO to confirm); translate through `errorKeys`.
- **Effort:** M–L. **Phase:** 1 → 2 (Process divergence 3d).
- **Verification:** R1 (FB-01, PG-09, SM-12) → R2 confirmed (correction: Radix Toast is not installed) → R2-V2 GAP-C-12, GAP-C-14 → R3 confirmed (banner at `:125`), merge M9.

#### GAP-D-09 🟡 Questionnaire "sent" success is shown in warning amber and not announced

- **Evidence:** `frontend/src/components/risks/RiskDetailQuestionnairesTab.tsx:67` `<div className="p-4 border-b border-white/5 text-sm text-amber-400 bg-amber-500/5">` wrapping `{message}` (`:66-69`). `message` is either `risks:questionnaires.send_success` (`frontend/src/components/risks/useRiskQuestionnairesTabData.ts:240`) or `send_open_exists` (`:246`, chosen by matching the English backend text `'open questionnaire already exists'` at `:245`); both render identically, without `role="status"`.
- **Impact:** success looks like a warning, and "already open" looks like success.
- **Fix:** keep `{tone, text}`; success via `useFeedback().success` (D9); "already open" as `InlineMessage tone="warning"`.
- **Effort:** S. **Phase:** 3e.
- **Verification:** R3 coverage sweep → R5 confirmed with corrections (quote was a multi-line composite; now cites the `:67` line verbatim).

**🟢 Observations (6.5)**

| ID | Title | Evidence | Fix | Effort | Phase | Verification |
|---|---|---|---|---|---|---|
| FB-02 | Refresh, export and "live" affordances diverge | `frontend/src/pages/DepartmentsPage.tsx:52-58` icon-only refresh with `title` only, no `type`; `frontend/src/pages/AuditTrailPage.tsx:178-187` text refresh and `:189-198` direct CSV download; `frontend/src/pages/GovernancePage.tsx:271-272` permanently pulsing `bg-emerald-500 animate-pulse` "live" dot | `RefreshButton` with `aria-busy`; tie the live dot to `isFetching` / `isError` | S | 1 → 3f | R1 → R2-V2 confirmed |
| GAP-C-08 | Contract request-reason error renders twice | `frontend/src/pages/vendors/VendorContractsSection.tsx:356-363` `<VendorInlineMessage role="alert" …>{requestReasonError}` plus `Field error={requestReasonError}` at `:516` | Keep only the field error | S | 3h | R2-V2 → R3 confirmed |
| GAP-D-20 | `WidgetShell` defaults are unusable, so every caller re-implements them | `frontend/src/components/dashboard/WidgetShell.tsx:31` `{title}: {i18n.t('loading.generic')}`; `:34` `{title}: {error.message}` (raw); `:37` unstyled empty; non-reactive `i18n.t`; of 6 callers, the 3 that pass state props (`RiskDrilldownModal`, `KRIStatusWidget`, `KRIBreachWidget`) override all three fallbacks and the other 3 (`DepartmentTable`, `CategoryBreakdownCharts`, `FilterBar`) use it only as a labelled `<section>` | Styled, announced defaults from `ui/state.tsx` | S | 1 → 3g | R3 coverage sweep → R5 confirmed with corrections (6 callers, not 4; 3 override, 3 never trigger the states) |
| SM-15 | Users invitation success banner unstyled | `frontend/src/pages/UsersPage.tsx:285` `<div role="status" className="rounded-md border p-4">` vs the success tokens at `:294` | `InlineMessage tone="success"` | S | 3c | R1 → R2-V2 confirmed |

### 6.6 Severity and status semantics

#### PG-02 🔴 `RiskQuickViewModal` hard-codes thresholds and misclassifies risks at the default configuration

- **Evidence:** `frontend/src/components/RiskQuickViewModal.tsx:23` `if (level >= 20) return 'text-rose-400 bg-rose-400/10 border-rose-400/20';`, `:24` `>= 12`, `:25` `>= 6`. The default thresholds are `critical: 16, high: 10, medium: 5` (`frontend/src/hooks/useRiskHubConfig.ts:36-38`). `:124` `<p className="text-sm font-bold text-white capitalize">{risk.risk_type}</p>` shows the raw type code. The modal opens from Control detail (`frontend/src/pages/controls/ControlDetailOverviewTab.tsx:6`).
- **Impact:** scores 16–19 show "high/orange" while the register says critical, 10–11 show amber and 5 shows green, even with default settings. This violates ADR-008 ("Frontend code uses `useRiskThresholds()`…"); the ADR-008 lint rule bans only `>= 5/10/15/16`, so 20/12/6 slip through.
- **Fix:** `riskScoreVariantClass('badge', score, thresholds)` through `useRiskThresholds()`; `useRiskTypes().getDisplayName` or `<RiskTypeBadge>`; broaden the ADR-008 lint selector (§4.4).
- **Effort:** S. **Phase:** 0.
- **Verification:** R1 → R2-V1 confirmed with corrections (stronger: wrong at defaults; ADR-008 violation) → R3 kept separate from merge group M24.

#### PG-01 🟡 Six live severity palettes disagree across surfaces

- **Also:** PG-26, PG-39, DS-23 (committee colours), GAP-B-18. ≈DS-05 (JS maps).
- **Evidence:**
  - `frontend/src/lib/riskScoreTheme.ts:13-14` `high: 'text-warning-text …'` and `medium: 'text-accent-text bg-info/10 border-info/20',`: "medium" is blue in the register (`frontend/src/pages/risks/riskColumns.tsx:119`) and the detail matrix.
  - `frontend/src/hooks/useStatusTheme.ts:54-55` `medium: 'bg-amber-500/40',` / `high: 'bg-orange-500/40',` (dashboard heatmap, `frontend/src/components/dashboard/RiskDistributionMatrix.tsx:36`).
  - `frontend/src/hooks/useChartTheme.ts:84-85` `medium: '#F59E0B',` / `high: '#F97316',`; `frontend/src/components/issues/issueUi.ts:53-58` `case 'high': return 'border-destructive/40 bg-destructive/10 text-destructive';` and "low" = info (blue).
  - `frontend/src/components/ict-register/CriticalityClassPill.tsx:12-31` deliberately collapses medium and high to `FILL_WARNING`, with a comment saying so.
  - Legend keys: `frontend/src/components/dashboard/RiskDistributionMatrix.tsx:119` `{t('issues.severity.low')}` labels *risk* bands with issue keys (also `:123,127,131`).
  - `frontend/src/components/dashboard/RiskCommitteeCards.tsx:32-35` `getVendorRiskColor` uses raw rose/amber/emerald, and `:20-29` re-implements relative dates.
  - Committee heatmap: `frontend/src/pages/ictRegisterCommittee/buildIctCommitteePresentation.ts:327-329` Excel white→yellow→red `SCALE_*`, rendered through `frontend/src/components/dashboard/ictCommittee/IctCommitteeExecutiveSummarySection.tsx:101` `style={fill ? { backgroundColor: fill, color: '#0F172A' } : undefined}`: pastel cells on the dark themes, contrary to ADR-015 ("Excel's conditional-formatting fill colours are not preserved"). Committee tooltips `:381,434` use `borderRadius: '12px'` instead of `frontend/src/components/dashboard/chartTooltip.ts:30` `'8px'` with `labelStyle`.
- **Impact:** "medium" is blue in the register and amber on the dashboard; "high" is amber vs orange; issue "high" is the same red as "critical" in lists but orange in the chart; issue "low" is blue in lists and green in the chart. Each surface is consistent with its own legend, so no data is misclassified (that is PG-02), but the risk signal changes colour between pages.
- **Fix:** D1: one 4-step scale in `lib/severity.ts` (§4.4), only after the ADR-015 addendum (O2); `--heat-*` tokens and a bucket index for the committee heatmap; `getChartTooltipProps`; `formatRelativeDateValue`; existing `dashboard:risk_levels.*` legend keys; `severityConsistency.test.ts`.
- **Effort:** M. **Phase:** 0 (addendum) → 1 → 2.
- **Verification:** R1 🔴 → R2-V1 🟡 (each surface legend-consistent; 6th live map `CriticalityClassPill` added; `MiniHeatmap` is dead) → R3 justified, merge M24.

#### DS-06 🟡 ADR-015 and the spec say rival status palettes are migrated; code disagrees

- **Also:** ≈DS-13.
- **Evidence:** [ADR-015](../adr/ADR-015-frontend-design-system-foundation.md) Decision 1 "All rival status palettes migrate to these tokens"; `docs/dora-ict-register/FRONTEND-UX-REMEDIATION-SPEC.md:429` `| S5 | 🟡 | … | resolved |`. Raw vs token counts: danger 382 / 232, success 163 / 146, warning 301 / 162, info 70 / 46. Mixed in one file: `frontend/src/components/ict-register/CriticalityClassPill.tsx:17` `const FILL_SUCCESS = 'bg-success text-success-foreground border-transparent';` vs `:34` `critical: 'text-rose-400 bg-rose-400/10 border-rose-400/20',` (`VENDOR_TIER_PILLS`, verbatim workbook labels).
- **Impact:** the governing documents claim a migration that has not happened, so nothing schedules it.
- **Fix:** spec S5 → "partially resolved" (Phase 0); codemod `bg-rose-500/10` → `bg-destructive/10` etc. together with DS-03; migrate colours, not workbook labels; G-RATCHET `raw-palette`.
- **Effort:** L. **Phase:** 0 → 2 (ADR status note 4).
- **Verification:** R1 → R2-V1 confirmed.

**🟢 Observations (6.6)**

| ID | Title | Evidence | Fix | Effort | Phase | Verification |
|---|---|---|---|---|---|---|
| PG-32 | Dead switch cases in `getControlStatusColor` | `frontend/src/pages/controls/controlsPagePresentation.ts:35-38` `case 'active': case 'draft': case 'inactive':` is unreachable after `ControlStatus.*` (`frontend/src/types/control.ts:29-31`) | Delete (D16) | S | 0 | R1 → R2-V1 confirmed |

### 6.7 Accessibility

#### AX-01 🔴 Icon-only buttons with no accessible name, or a `title`-only name

- **Also:** PG-33, GAP-C-04 (title-only tier).
- **Evidence:**
  - No name (10 sites): `frontend/src/pages/detail/DetailActionBanner.tsx:51-56` `<button onClick={onClose}` → `<XCircle className="h-4 w-4" />` (no `type`; shared by Risk and Control); `frontend/src/pages/VendorDetailPage.tsx:288-294`; `frontend/src/pages/NotificationsPage.tsx:464-471` and `:475-482` chevrons; `frontend/src/components/activity-log/ActivityLogPagination.tsx:32-38` and `:58-64` chevrons (its page buttons also lack `aria-current`); `frontend/src/pages/AuditTrailPage.tsx:370-372` `<button className="p-2 text-slate-600 group-hover:text-white transition-colors">`; clear-selection `<X>` buttons in `frontend/src/components/control-form/ControlFormOwnershipStep.tsx:132-138`, `frontend/src/components/control-form/ControlFormRiskLinkStep.tsx:64-70`, `frontend/src/components/kri-form/KriRiskSelectionStep.tsx:121-127`.
  - `title`-only names (ADR-013 lists "icon-only actions relying on `title` alone" as a defect; the name doesn't say which link is removed): `frontend/src/pages/assets/AssetLinkSections.tsx:648,752`, `frontend/src/pages/processes/ProcessVendorLinksSection.tsx:158`, `frontend/src/pages/threats/ThreatRiskLinksSection.tsx:132`, `frontend/src/pages/vendors/VendorRegisterLinksSection.tsx:299,388`, `frontend/src/components/risks/detail-overview/RiskRegisterLinksSection.tsx:217`, `frontend/src/pages/vendors/vendorSubOutsourcingPresentation.tsx:306,317,328`.
  - The full ESLint run is green because `jsx-a11y/control-has-associated-label` is off (AX-00).
- **Impact:** screen-reader users hear "button" with no purpose on banners, pagers and form steps (WCAG 4.1.2).
- **Fix:** Phase 0: `aria-label` plus `aria-hidden` icons; a NEW key `t('links.remove_named', { name })` (en + cs) for link removal. Phase 1–2: the icon-button type union and selector (§4.7); replace the bespoke pagers (DS-29).
- **Effort:** S. **Phase:** 0 → 2.
- **Verification:** R1 (AX-01, PG-33) → R2 confirmed; PG-33 raised 🟢 → 🟡 (effective 🔴) → R2-V2 GAP-C-04 → R3: GAP-C-04 mechanism corrected (`title` is a fallback name, so it is a policy and weak-name defect rather than a 4.1.2 failure), merge M6.

#### AX-02 🔴 Mouse-only row navigation

- **Evidence:** `frontend/src/components/risks/QuestionnaireHistoryTable.tsx:65-68` `<tr key={questionnaire.id} className="hover:bg-white/5 cursor-pointer" onClick={() => onSelect(questionnaire.id)}` with no focusable element in the row, so keyboard users cannot open a questionnaire (WCAG 2.1.1, Level A). `frontend/src/pages/AuditTrailPage.tsx:306-310` `<tr … onClick={() => navigate(…)}` is reachable only through the unnamed chevron at `:370` (AX-01). `frontend/src/components/tables/SortableTable.tsx:354` `onClick={onRowClick ? () => onRowClick(item) : undefined}` is mouse-only too; only `rowHref` (`:366-369`) renders a focusable link.
- **Impact:** a core questionnaire workflow is unreachable by keyboard.
- **Fix:** D14: row activation lives in `SortableTable` (`onRowActivate` renders a named first-cell button; `rowHref` a link) (§4.13). Phase 0: a named first-cell button in `QuestionnaireHistoryTable` and a named AuditTrail chevron.
- **Effort:** S–M. **Phase:** 0 → 1 → 3e.
- **Verification:** R1 → R2-V2 confirmed with corrections (AuditTrail works by keyboard via the chevron; `rowHref` does not fit in-page selection).

#### AX-00 🟡 Static gates are blind to the defect classes in this audit

- **Also:** I18N-02, GAP-B-20 (gate-miss note), PG-10 (gate-miss note). Merge group M3 static primary; the e2e primary is NEW-V1-02.
- **Evidence:**
  - `frontend/eslint.config.js:9-19` keeps `jsx-a11y/control-has-associated-label` off ("NOT force-promoted").
  - `label-has-associated-control` already defaults to `assert: 'either'`; the blind spot is the plugin's `util/mayContainChildComponent.js:34` `if (childNode.type === 'JSXExpressionContainer') { return true;`, so every `<label>{t('…')}</label>` passes (e.g. the 9 issue-remediation labels such as `frontend/src/components/issues/remediation/AssignmentSection.tsx:56`).
  - `<tr onClick>` maps to the interactive `row` role, so `click-events-have-key-events` does not fire.
  - i18n scanner: `frontend/scripts/i18n/scan-hardcoded-ui.mjs:50` `if (!allowShortWord && !/\s/.test(v) && v.length < 10) return true;` and `:51`; the `JsxText` visitor (`:223`) never passes `allowShortWord`, so "Uncategorised", "Baseline" or "Limit:" pass, although `docs/LOCALIZATION.md:38` presents `i18n:scan` as the merge check.
  - The parity validator does not check plural families; ESLint has no design-literal rules; `frontend/eslint-suppressions.json` is `{}` and `noInlineConfig: true`, so suppression-based ratchets are impossible.
  - At `ba42b38` all gates are green (§9).
- **Impact:** every class of defect in this register can regress without a red build.
- **Fix:** D15 guards (§4.1): G-RATCHET, G-ESLINT selectors (orphan label, unnamed icon button, `tr[onClick]`), G-I18N scanner fix and plural validator; one stateful axe pass per migrated form.
- **Effort:** M. **Phase:** 0 → 4.
- **Verification:** R1 context note (no severity) → R2-V2 corrected (the `assert` change is a no-op; the real blind spot is `mayContainChildComponent`) → R2-V3 empirical (ESLint: 722 files, 0 findings) → R3 merge M3. Severity 🟡 assigned at assembly (I18N-02, merged here, was 🟡).

#### AX-04 🟡 Form controls without programmatic or visible labels; `Field` bypassed

- **Also:** PG-10, GAP-B-20, GAP-B-06, GAP-C-05 (label part), GAP-C-16 (label part), GAP-C-07, GAP-B-26 (label part and remainder), GAP-B-15 (search input), AX-11.
- **Evidence:**
  - **Scale:** 121 `<label>`, 25 with `htmlFor`, **64 with neither `htmlFor` nor a nested control** (top files: `KriDetailsStep` 8, `IssueCreateForm` 6, `ProfileSettings` 5, `UserNewLocalForm` 5). `Field` is used in 23 files and in none of `control-form`, `kri-form`, `issues`, `riskhub`.
  - Core forms: `frontend/src/components/control-form/ControlFormIdentityStep.tsx:13` `<label className="block text-[10px] font-black text-slate-500 …">` (native `required`, no marker); `frontend/src/components/issues/IssueCreateForm.tsx:173` `<label className={ISSUE_LABEL}>{t('form.fields.title')}</label>`; `frontend/src/components/issues/remediation/AssignmentSection.tsx:56` `<label className={ISSUE_LABEL}>{t('workflow.fields.owner')}</label>` (9 remediation labels, 0 `htmlFor`/`useId` in 4 files). Risk shows `*` (`frontend/src/components/risk-form/RiskFormIdentityStep.tsx:51`) but mixes `Field` with raw labels. Validation is inline in Risk and a single banner in Control (`frontend/src/components/control-form/ControlFormContainer.tsx:244`), KRI (`frontend/src/components/kri-form/KriFormErrorAlert.tsx:14`) and Issue (`frontend/src/components/issues/IssueCreateForm.tsx:163-169`).
  - Users and access: `frontend/src/pages/users/UserNewLocalForm.tsx:41` `<label className="text-sm font-medium text-slate-300">` (orphan); `frontend/src/components/access/AccessEditModalSections.tsx:123` orphan label above a `ThemedSelect` announced as "No department"; `frontend/src/components/vendor-form/VendorOwnershipSection.tsx:88-89`.
  - Placeholder-only: `frontend/src/components/access/UsersFilterBar.tsx:51-56` search; `:100`, `:108` selects both announced "Select" (`frontend/src/components/ui/ThemedSelect.tsx:79` `const resolvedPlaceholder = placeholder ?? t('actions.select')`); link pickers `frontend/src/pages/assets/AssetLinkSections.tsx:552,561,697` and `frontend/src/pages/vendors/VendorRegisterLinksSection.tsx:326` (the AT name survives through the placeholder fallback, but the visible label disappears after selection, WCAG 3.3.2); `frontend/src/pages/processes/ProcessVendorLinksSection.tsx:187` raw input; `frontend/src/components/linking/LinkSearchFilters.tsx:62`; `frontend/src/components/riskhub/RiskQuestionnairesPanel.tsx:147`.
  - Unnamed checkboxes: `frontend/src/components/riskhub/RiskQuestionnairesPanel.tsx:189` `onChange={toggleAllVisible}` and `:230` (4.1.2 failures); borrowed keys `:196` `governance.col_name`, `:213` `console.loading`.
  - Vendor sub-outsourcing: hand-rolled `<span id=…>` labels (`frontend/src/pages/vendors/VendorSubOutsourcingSection.tsx:307,326`, named through `aria-labelledby` at `:311,:329`), no closed-list failure branch, reason error not focused (`:380-382`).
  - Read-only values in `<label>`: `frontend/src/components/settings/ProfileSettings.tsx:52` `<label className="text-[10px] font-black text-slate-500 uppercase tracking-widest` (also `:61`, `:70`, `:83`, `:94`).
  - Questionnaire detail: clarification textareas with placeholder only (`frontend/src/components/risks/risk-questionnaire-detail/ClarificationRequestPanel.tsx:30-39`, `frontend/src/components/risks/risk-questionnaire-detail/ClarificationThread.tsx:84`); compare toggle without `aria-pressed` (`frontend/src/components/risks/risk-questionnaire-detail/RiskQuestionnaireMetaBar.tsx:58-60`); duplicated sr-only title (`frontend/src/components/risks/risk-questionnaire-detail/RiskQuestionnaireDetailContainer.tsx:66`); non-wrapping meta rows (`frontend/src/components/risks/risk-questionnaire-detail/RiskQuestionnaireMetaBar.tsx:28,44`).
  - Coverage-sweep sites: orphan labels `frontend/src/components/dashboard/FilterBar.tsx:189,216,239,255`, `frontend/src/components/control-form/ControlFormExecutionStep.tsx:19,28,38`, `frontend/src/components/control-form/ControlFormStatusStep.tsx:14,31`, `frontend/src/components/kri/KriCadenceOwnerFields.tsx:24,46`, `frontend/src/components/vendor-form/VendorClassificationSection.tsx:56,94`, `frontend/src/components/vendor-form/VendorResilienceSection.tsx:28,39`; 11 unnamed or placeholder-named `ThemedSelect`s (`frontend/src/components/control-form/ControlFormExecutionStep.tsx:20,29`, `frontend/src/components/history/HistoryComparisonPanel.tsx:172,182`, `frontend/src/components/kri/KriCadenceOwnerFields.tsx:28,50`, `frontend/src/components/dashboard/FilterBar.tsx:193,243,259`, `frontend/src/components/governance/ResolveOrphanRiskSelection.tsx:39`, `frontend/src/components/vendor-form/VendorResilienceSection.tsx:29`); placeholder-only searches `frontend/src/components/governance/ResolveOrphanDepartmentSelection.tsx:37`, `frontend/src/components/governance/ResolveOrphanOwnerSelection.tsx:44`, `frontend/src/components/governance/ResolveOrphanRiskSelection.tsx:49`.
- **Impact:** screen readers announce many controls as "Select" or with no name; sighted users lose the label once a value is picked.
- **Fix:** `Field` + primitives everywhere (§4.8): per-field errors plus one server banner, required `*` via `Field` (D14), `labelVisuallyHidden` or `triggerAriaLabel` in filter bars, `aria-label="Select {name}"` for row checkboxes, `aria-pressed` on toggles, `<dl>` for read-only values, panel-owned i18n keys. Guards: G-ESLINT label selector; one stateful axe pass per form.
- **Effort:** M–L. **Phase:** 1 → 3.
- **Verification:** R1 (AX-04, PG-10, AX-11) → R2 confirmed with corrections (counts exact; the `assert` fix is a no-op) → R2-V2 / R2-V3 GAP-C-05/07/16, GAP-B-06/15/20/26 → R3 confirmed with corrections (GAP-C-05: AT name persists; GAP-C-07: inputs named through `aria-labelledby`; GAP-C-16: AccessEditModal is a themed `glass-card`), merge M4.

#### AX-05 🟡 Status and error messages are not announced

- **Also:** GAP-C-02, GAP-C-12 (role part), GAP-B-11 (`RiskHubFieldError`), GAP-B-22 (banner).
- **Evidence:** detail action errors `frontend/src/pages/ThreatDetailPage.tsx:337` `<div className="glass-card flex items-start gap-3 border border-rose-400/30 text-rose-300">` (also `frontend/src/pages/ProcessDetailPage.tsx:398`, `frontend/src/pages/AssetDetailPage.tsx:318`); `frontend/src/components/vendors/vendorRouteUi.tsx:128-139` `VendorInlineMessage` has no default role and carries form submit errors (`frontend/src/components/vendor-form/VendorFormContainer.tsx:165`); `frontend/src/pages/detail/DetailActionBanner.tsx:36` root without a role; link sections `frontend/src/pages/threats/ThreatRiskLinksSection.tsx:108` `<div className="border border-rose-400/30 rounded-xl px-4 py-3 text-rose-300`, `frontend/src/pages/processes/ProcessVendorLinksSection.tsx:125`, `frontend/src/pages/vendors/VendorRegisterLinksSection.tsx:259`; admin `frontend/src/pages/admin-console/sections/ops/SessionsPanel.tsx:125`, `frontend/src/pages/admin-console/sections/audit/LogSettingsPanel.tsx:215,220`; `frontend/src/components/riskhub/panelPrimitives.tsx:75` `RiskHubFieldError`; `frontend/src/components/issues/remediation/WorkflowSummarySection.tsx:52`; `frontend/src/pages/DepartmentsPage.tsx:63`, `frontend/src/pages/UsersPage.tsx:331`, `frontend/src/pages/UserNewPage.tsx:77,88,117`; sweep sites `frontend/src/components/risks/RiskDetailQuestionnairesTab.tsx:67,83`, `frontend/src/components/governance/ResolveOrphanFooter.tsx:66`, `frontend/src/components/dashboard/QuarterlyComparisonWidget.tsx:100-102`. Correct references: `frontend/src/pages/ProcessDetailPage.tsx:291` `<div role="alert"`, `frontend/src/pages/assets/AssetLinkSections.tsx:443`.
- **Impact:** screen-reader users are not told that an action failed or succeeded.
- **Fix:** `InlineMessage` with role by tone (§4.10); `DetailActionBanner` and `VendorInlineMessage` render it; then migrate the listed sites.
- **Effort:** S. **Phase:** 1 → 3.
- **Verification:** R1 → R2-V2 confirmed with corrections (root at `:36`; `VendorInlineMessage` spreads props) → R2-V2 GAP-C-02 (line drift) → R3 merge M8.

#### AX-09 🟡 `<html lang>` never follows the in-app language

- **Evidence:** `frontend/index.html:2` `<html lang="en">`. The only writers are login-specific: `frontend/src/pages/login/useProdLoginMetadata.ts:20` `document.documentElement.lang = language;` and `frontend/src/pages/ProdLoginPreviewPage.tsx:18`; `frontend/src/i18n/index.ts:180` only reads `htmlTag`. Rendered: Czech UI with `lang="en"` after login.
- **Impact:** Czech text is read with English pronunciation (WCAG 3.1.1, Level A).
- **Fix:** D14: `LanguageProvider` sets `document.documentElement.lang`; delete the login writers; Playwright check.
- **Effort:** S. **Phase:** 0.
- **Verification:** R1 → R2-V2 confirmed → R2-V3 confirmed rendered.

#### DS-26 🟡 Focus indicators: four conventions; ≈57 controls rely on a colour-only border

- **Also:** AX-08, GAP-C-07 (`outline-none` part).
- **Evidence:** `focus:ring-accent` 28, `focus-visible:ring-ring` 21, `focus-visible:ring-accent` 11, `focus:border-accent(/50)` 48; 110 `outline-none`, 57 with no ring (top files `KriDetailsStep` 5, `KriMetricFields` 4, `ExecutionLogModal` 4). `frontend/src/components/ConfirmDialog.tsx:161` `outline-none focus:border-accent/50 transition-all resize-none`; `frontend/src/pages/threats/ThreatRegisterFilterBar.tsx:76` `text-sm text-white outline-none focus:border-accent/50`; `frontend/src/pages/vendors/VendorSubOutsourcingSection.tsx:314` `focus:border-accent/50 outline-none` (also `:422`, `:445`; R5: was `:316`). `frontend/src/components/ui/button.tsx:8` and `frontend/src/components/ui/input.tsx:25` use `ring-1` while `frontend/src/components/tables/SortableTable.tsx:135` uses `ring-2`. `frontend/src/index.css` has no global `:focus-visible` fallback.
- **Impact:** keyboard focus is barely visible on many inputs (WCAG 2.4.7 / 1.4.11).
- **Fix:** `.focus-ring` plus a global `:focus-visible` fallback (§4.6); primitive adoption fixes the rest.
- **Effort:** S–M. **Phase:** 1 → 3.
- **Verification:** R1 (DS-26, AX-08) → R2 confirmed (48 / 57) → R3 merge M17.

#### GAP-B-16 🟡 ICT-committee heatmap cells are links named only by a number

- **Evidence:** `frontend/src/components/dashboard/ictCommittee/IctCommitteeExecutiveSummarySection.tsx:257-266` `<Link … className="block">` wraps `<MatrixCell … count={cell.count}`, and `MatrixCell` (`:97-106`) renders only `{count}`, so 25 links are named "0", "3", … (WCAG 2.4.4). Reference: `frontend/src/components/dashboard/RiskDistributionMatrix.tsx:84` `cell_aria`.
- **Impact:** the committee heatmap is unusable with a screen reader.
- **Fix:** an `aria-label` with band/axis and count, copying `cell_aria`.
- **Effort:** S. **Phase:** 3g.
- **Verification:** R2-V3 → R3 confirmed.

#### GAP-C-15 🟡 The language picker has no selected-state semantics

- **Evidence:** `frontend/src/components/settings/LocalizationSettings.tsx:53-55` `<button` … `onClick={() => setLanguage(lang.code)}` without `aria-pressed` or a radio role; `:65` `<span className="text-3xl">{lang.flag}</span>` is not hidden. The adjacent `frontend/src/components/settings/AppearanceSettings.tsx:61` uses `type="radio"`.
- **Impact:** the current language is not announced; the flag emoji is read aloud.
- **Fix:** `RadioGroup variant="card"` (§4.8); `aria-hidden` on the flag.
- **Effort:** S. **Phase:** 3c.
- **Verification:** R2-V2 → R3 confirmed.

#### GAP-D-10 🟡 Dashboard department table has mouse-only sortable headers

- **Evidence:** `frontend/src/components/dashboard/DepartmentTable.tsx:47-49` `<th` with `:48` `… text-slate-500 cursor-pointer hover:text-white transition-colors"` and `:49` `onClick={() => handleSort('department_name')}`, repeated at `:56`, `:65`, `:74`, `:83`; no button, `tabIndex`, `scope` or `aria-sort`.
- **Impact:** keyboard users cannot sort, and the sort state is invisible to assistive technology.
- **Fix:** render through `SortableTable` (D14), which provides header buttons with `aria-sort` on the `th`.
- **Effort:** S. **Phase:** 3g.
- **Verification:** R3 coverage sweep → R5 confirmed with corrections (quote was a composite of three lines; now per-line verbatim).

#### GAP-D-11 🟡 Dashboard charts have no text alternative; two lack an empty state

- **Evidence:** none of the 7 chart files (`IssueAgingChart`, `OpenIssuesBySeverityChart`, `ControlTrendChart`, `RiskTrendChart`, `KRIBreachHistoryChart`, `CategoryBreakdownCharts`, `HistoryTrendChart`; an 8th Recharts importer, `IctCommitteeExecutiveSummarySection`, names its bar links, GAP-B-16) sets `role="img"`, `aria-label`, `title`/`desc` or an sr-only table. Recharts 3.10.1 turns `accessibilityLayer` on by default (`frontend/node_modules/recharts/lib/chart/CartesianChart.js:31`), which adds keyboard tooltip navigation but no summary text. `frontend/src/components/dashboard/IssueAgingChart.tsx:30` `<Bar dataKey="count" …/>` has no `name`, so the tooltip says "count"; `frontend/src/components/dashboard/OpenIssuesBySeverityChart.tsx:37-49` has no `<Legend>` (severity by colour only). Empty states: italic `text-slate-500` in `frontend/src/components/dashboard/RiskTrendChart.tsx:31-36` and `frontend/src/components/dashboard/KRIBreachHistoryChart.tsx:31-36`, the parent's `text-slate-600` at `frontend/src/pages/dashboard/DashboardRiskSections.tsx:85`, none in the other two.
- **Impact:** charts carry information that screen-reader users never receive; three empty-state recipes on one page.
- **Fix:** a shared `ChartFrame` (`role="img"`, summary `aria-label`, optional sr-only table, one `EmptyState`); series `name`; a legend; chart tokens (D1).
- **Effort:** M. **Phase:** 3g.
- **Verification:** R3 coverage sweep → R5 confirmed with corrections (`accessibilityLayer` is on by default in Recharts 3, so "does not set it" was moot; 8 files import Recharts, not 7; the two issue charts have no empty state at `frontend/src/pages/dashboard/DashboardSummarySections.tsx:74,81`).

#### GAP-D-12 🟡 Dashboard filter controls lack state and label association

- **Evidence:** `frontend/src/components/dashboard/FilterBar.tsx:123-126` expander `onClick={() => setIsExpanded(!isExpanded)}` with no `aria-expanded`/`aria-controls`; `:222-229` risk-level toggles show selection only by `ring-1 ring-white/20` and colour; `:189,216,239,255` orphan labels; `:54-56` `label: t('dashboard:issues.severity.high')` for the *risk* level (also the active-filter chip at `:97`), although `:53` already uses `dashboard:risk_levels.critical`.
- **Impact:** filter state is invisible to assistive technology; risk levels reuse issue wording.
- **Fix:** `aria-expanded`; `aria-pressed` or a radiogroup; `Field`; use the existing `dashboard:risk_levels.*` keys (en and cs `dashboard.json:268-273`, D1).
- **Effort:** S. **Phase:** 3g.
- **Verification:** R3 coverage sweep → R5 confirmed with corrections (the `risk_levels.*` keys already exist, so no new keys are needed; chip label at `:97` added).

#### GAP-D-13 🟡 Orphan-resolution pickers lack selection semantics and empty states

- **Evidence:** `frontend/src/components/governance/ResolveOrphanOwnerSelection.tsx:63-67`, `frontend/src/components/governance/ResolveOrphanRiskSelection.tsx:58-61` and `frontend/src/components/governance/ResolveOrphanDepartmentSelection.tsx:46-50` are plain buttons whose selection is shown only by colour and a check icon (the Department picker has no check icon, only border and text colour; no `aria-pressed`, radio role or `aria-selected` anywhere); `frontend/src/components/governance/ResolveOrphanRiskSelection.tsx:58` lacks `type="button"`; a search that filters everything out leaves an empty box (compare `frontend/src/components/risk-form/RiskFormOwnershipStep.tsx:184-185` `role="status"`); `frontend/src/components/governance/ResolveOrphanFooter.tsx:66` is a 10px uppercase error without `role="alert"`.
- **Impact:** governance users with assistive technology cannot tell what is selected or why a list is empty.
- **Fix:** `RadioGroup` (§4.8, single selection); `EmptyState kind="no-results"`; `InlineMessage tone="danger"` at normal size.
- **Effort:** S. **Phase:** 3f.
- **Verification:** R3 coverage sweep → R5 confirmed with corrections (Department picker signals selection by colour only, without a check icon).

#### GAP-D-16 🟡 Permission-matrix toggles have no pressed state; read-only chips are disabled buttons

- **Evidence:** `frontend/src/components/access/PermissionMatrix.tsx:127-142` `<button … disabled={!editable} onClick={() => togglePermission(resource, action)} aria-label={label}`: granted and not-granted permissions get the same name; the state is shown only by the check glyph (`:147`) and colour. The only production mount is read-only (`frontend/src/components/access/ExpandedAccessDetailsRow.tsx:89` `<PermissionMatrix permissions={user.effective_permissions} />`; `editable` defaults to `false`), so every chip is a disabled button, removed from tab order; edit mode is exercised only by `tests/frontend/unit/src/components/access/PermissionMatrix.presentation.test.tsx:55-58`. `:145` `"border-slate-800"` makes unchecked boxes invisible on dark surfaces; `:27-34` emoji icons (rendered at `:111`) (`'⚠️'`, `'🛡️'`) are not `aria-hidden`.
- **Impact:** administrators using assistive technology cannot tell which permissions a user actually has; the edit mode would carry the same defect if wired up.
- **Fix:** `<span>` chips with a text or sr-only granted/not-granted state in read-only mode; `Checkbox` (§4.8) in edit mode, if it ships; `border-border`, lucide icons.
- **Effort:** S. **Phase:** 3c.
- **Verification:** R3 coverage sweep → R5 confirmed with corrections (edit mode has no production caller; the live defect is the read-only display, where granted vs not granted is visual only; stays 🟡).

**🟢 Observations (6.7)**

| ID | Title | Evidence | Fix | Effort | Phase | Verification |
|---|---|---|---|---|---|---|
| AX-10 | Expand toggles and the notification bell lack state | `frontend/src/components/access/AccessUserRow.tsx:55-61` and `:74-80` no `aria-expanded`; `frontend/src/components/notifications/NotificationBell.tsx:195-200` static `aria-label={t('aria.bell')}` hides the unread count; no `aria-expanded`/`aria-controls`; no Escape handler | `aria-expanded`; NEW key `t('aria.bell_with_count', { count })` (en + cs); Escape returns focus to the trigger | S | 3c | R1 → R2-V2 confirmed |
| AX-14 | Sidebar count badges lack context | `frontend/src/components/layout/Sidebar.tsx:227-229` `<span className="sidebar-nav-badge …">{item.badge}</span>` reads "Approvals 3" | sr-only NEW key `t('sidebar.pending_count', { count })` (en + cs) | S | 2 | R1 → R2-V2 confirmed |
| PG-46 | Risk priority star has no accessible name | `frontend/src/pages/risks/riskColumns.tsx:52` `<Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />`, also `frontend/src/pages/RiskDetailPage.tsx:175`; lucide renders `aria-hidden` | `<Badge icon={Star} srLabel={…}>` with a NEW `risks:priority_label` key (en + cs) | S | 3b | R1 → R2-V1 confirmed |
| GAP-B-19 | Information only in `title`; `aria-disabled` on a static element | `frontend/src/components/dashboard/ictCommittee/IctCommitteeRoiReadinessSection.tsx:74` `title={template.coverageHint}`; `frontend/src/components/dashboard/ictCommittee/IctCommitteeExecutiveSummarySection.tsx:242` `className="glass-card block cursor-default" aria-disabled="true"` | Visible `text-xs text-muted-foreground` help text; drop `aria-disabled` | S | 3g | R2-V3 → R3 confirmed |
| GAP-D-25 | Legacy approval diff relies on strike-through and colour | `frontend/src/components/approvals/LegacyApprovalChanges.tsx:393-395` `<span className="text-destructive line-through">{before.text}</span>` then a `text-success-text` span (also `:328-334`) | sr-only NEW "from"/"to" keys (en + cs) or `<del>`/`<ins>` | S | 3e | R3 coverage sweep → R5 confirmed (live in `ApprovalList` and `ApprovalResolutionDialog`; the arrow between the spans is `aria-hidden`) |

### 6.8 i18n and formatting

The scanner blind spot (I18N-02) is merged into AX-00 (§6.7); the static English `<title>` (I18N-04) into NAV-01 (§6.4).

#### I18N-01 🟡 Hard-coded English UI literals and fallbacks

- **Also:** PG-04, PG-44, GAP-B-22 (`Unknown` defaultValue and remainder).
- **Evidence:**
  - Live literals (11, plus `'N/A'`): `frontend/src/components/governance/OrphanedItemsTable.tsx:141` `>Uncategorised</span>` and `:145` `'N/A'`; `frontend/src/components/history/HistoryChangeCard.tsx:44` `<span className="w-24">Baseline</span>` and `:45` "Current"; `frontend/src/components/dashboard/KRIBreachWidget.tsx:119` `Current: <span className="text-rose-400">` and `:123` "Limit:"; `frontend/src/components/dashboard/RiskDrilldownModal.tsx:103,168` "Score:"; `frontend/src/components/risks/detail-overview/RiskLinkedVendorsSection.tsx:61` "Core"; `frontend/src/pages/approvals/QuestionnaireInboxList.tsx:116` `by{' '}`; `frontend/src/components/dashboard/QuarterMetricCard.tsx:111` "vs"; `frontend/src/pages/AuditTrailPage.tsx:197` "CSV". (`frontend/src/components/layout/Sidebar.tsx:157` brand suffix "Hub" is acceptable; the `CategoryDrillDown` literals are dead code, PG-43.)
  - Risk form validation: `frontend/src/components/risk-form/riskFormWorkflow.ts:84` `errors.name = 'Risk Name is required';` (also `:87`, `:93`, `:94`; its neighbour `:85` is keyed), rendered raw at `frontend/src/components/risk-form/RiskFormIdentityStep.tsx:63`; `risks:form.errors` has only `process_required` and `category_required`.
  - `frontend/src/lib/approvalUi.ts:54-55` `const prefix = t ? t('approval.submitted_for_approval') : 'Submitted for approval';` and `` `${prefix} (ID: ${approvalId})` ``.
  - `frontend/src/pages/issues/issue-detail/IssueOverviewTab.tsx:61-66` `Unknown ${link.linked_entity_type}` is a `t()` defaultValue (near-dead because fallbacks cover the entity types). Remainder: linked entities render as plain `<p>` text, not links (`:61`).
- **Impact:** English text in a Czech UI.
- **Fix:** add `common:labels.items|active|baseline|current|limit|score|by|vs`; create `risks:form.errors.{name,description,department,owner}_required` (en + cs) and render via `t()`; make `t` required in `getApprovalBannerMessage` and move "(ID: …)" into the key; link the linked entities; scanner fix (AX-00).
- **Effort:** S. **Phase:** 0 (scanner) → 3.
- **Verification:** R1 (I18N-01, PG-04, PG-44) → R2-V2 confirmed with corrections (`CategoryDrillDown` dead; `'N/A'` added; PG-04 keys must be created) → R3 merge M14.

#### I18N-03 🟡 Locale-unaware date, number and text formatting

- **Also:** PG-18. (The `SystemSettingsPanel` `cs-CZ` part, PG-38, is in DS-04.)
- **Evidence:** Issue dates use three private helpers, `frontend/src/pages/issues/issue-detail/issueDetail.formatters.ts:9-15`, `frontend/src/pages/issues/issuesPagePresentation.ts:187-193` and `frontend/src/components/issues/remediation/remediationPresentation.tsx:9-15`, each `new Intl.DateTimeFormat(locale, {` with `month: 'numeric'`, while `frontend/src/i18n/formatters.ts:44-50` defaults to `month: 'short'`. Raw ISO dates: `frontend/src/pages/AssetDetailPage.tsx:635` `value={asset.standard_support_end_date}` (also `:596`, `:636-638`) and `frontend/src/pages/ProcessDetailPage.tsx:598,733,750` (Vendor formats them, `frontend/src/pages/vendors/VendorOverviewTab.tsx:63`). `frontend/src/pages/vendors/vendorContractsPresentation.tsx:50` `amount.toLocaleString('cs-CZ')`. Concatenation and case: `frontend/src/pages/AssetDetailPage.tsx:434` `t('form.business_owner') + ' — ' + t('form.owner_department')`; `frontend/src/pages/DepartmentsPage.tsx:115` `{t('kris:status.breached').toUpperCase()}`.
- **Impact:** dates read "30. 9. 2026" on Issues and "30. zář 2026" elsewhere; ISO strings and Czech number formats reach English users.
- **Fix:** `useFormat()` (§4.17); delete the Issue helpers; whole-phrase keys; CSS `uppercase`.
- **Effort:** S–M. **Phase:** 1 → 2 (Asset/Process 3d).
- **Verification:** R1 (I18N-03, PG-18) → R2-V2 confirmed with corrections (`VendorOverviewTab` is under `pages/vendors/`) → R3 merge M15.

#### PG-03 🟡 Raw enums and untranslated codes displayed

- **Also:** GAP-B-23, GAP-B-09, PG-19, GAP-B-15 (frequency part), PG-20 (status part). Linked, not merged: GAP-C-09, PG-40, I18N-05.
- **Evidence:**
  - Risk status: `frontend/src/pages/risks/riskColumns.tsx:146` and `frontend/src/pages/RiskDetailPage.tsx:179` `{displayStatus}`; keys `risks:status.*` exist and Controls translate theirs (`frontend/src/pages/ControlDetailPage.tsx:154`).
  - Questionnaire status: `frontend/src/components/risks/risk-questionnaire-detail/RiskQuestionnaireMetaBar.tsx:46` `<span className="text-slate-300">{questionnaire.status}</span>` (rendered "Status: in_progress"; keys `risks:questionnaire.status.*` exist).
  - Permissions: `frontend/src/components/riskhub/roles/RolesTable.tsx:149` `{permission}` vs `frontend/src/components/riskhub/roles/RoleModal.tsx:186` `getPermissionLabel(permissionToken, t)`.
  - Control effectiveness: `frontend/src/pages/controls/ControlDetailOverviewTab.tsx:243-248` `link.effectiveness === 'high' ? 'bg-success/10 text-success-text' : 'bg-warning/10 text-warning-text'` and `{link.effectiveness}` (raw, and "low" looks like "medium"; also `:277-282`).
  - Frequency: `frontend/src/components/controls/ControlGaugeCard.tsx:20` `const frequency = control?.frequency || '—';` rendered at `:62`; also `frontend/src/components/vendors/VendorLinkedControlCard.tsx:14`, `frontend/src/components/linking/LinkSearchResultItem.tsx:61` `{result.frequency}`.
  - Questionnaire status colours: "submitted" is emerald in `frontend/src/components/risks/questionnairesTabPresentation.tsx:42` and slate in `frontend/src/pages/approvals/approvalsPresentation.ts:95`; `isQuestionnaireOverdue` is duplicated (`frontend/src/components/risks/questionnairesTabPresentation.tsx:13`, `frontend/src/pages/approvals/approvalsPresentation.ts:81`).
- **Impact:** users see `in_progress`, `high`, `weekly` or permission tokens instead of words, in both languages.
- **Fix:** domain `…Meta()` helpers rendering `Badge` (§4.9, §4.18): `t(\`risks:status.${s}\`)`; `getControlEffectivenessMeta` (high success, medium warning, low danger, with a label key); `controls:frequencies.*`; one `getQuestionnaireStatusMeta` on `BADGE_TONES`; `getPermissionLabel`; delete the duplicate `getStatusColor` (`frontend/src/pages/RiskDetailPage.tsx:90-96`). Enum-coverage unit test.
- **Effort:** S per site. **Phase:** 3 (3a, 3b, 3e).
- **Verification:** R1 (PG-03, PG-19, PG-20) → R2 confirmed → R2-V3 GAP-B-09/15/23 (GAP-B-23 rendered) → R3 merge M13.

#### GAP-B-14 🟡 String concatenation and missing plural forms

- **Also:** GAP-C-13, GAP-B-05 (colon), GAP-B-22 (colon), PG-12 (concatenation part), PG-23.
- **Evidence:**
  - `frontend/src/components/linking/LinkSearchResults.tsx:43` `{searchResults.length} {resultCountLabel}` with cs `"result_plural": "položek"` (`frontend/src/i18n/locales/cs/common.json:354`) → "2 položek" (correct: "položky").
  - `frontend/src/pages/admin-console/sections/ops/SessionsTable.tsx:61` `{session.active_sessions} {t('sessions.devices')}` → English "1 devices" (Czech "zařízení" is invariant).
  - `frontend/src/components/riskhub/RiskQuestionnairesPanel.tsx:124` `{t('riskhub.questionnaires.created')}: {result.created_count}`; `frontend/src/pages/issues/issue-detail/IssueOverviewTab.tsx:106` `{t('detail.messages.expires')}:{' '}`.
  - `frontend/src/pages/RiskNewPage.tsx:107` `` `${t('common:actions.back')} ${t('risks:title')}` `` → "Zpět Registr rizik" (also `ControlNewPage.tsx:111`, `KRINewPage.tsx:63`, `ControlEditPage.tsx:57`; "View approvals" at `RiskFormContainer.tsx:118`).
  - `frontend/src/pages/risks/riskColumns.tsx:162` `{count} {count === 1 ? 'Ctrl' : 'Ctrls'}` and `:187` KRI/KRIs; `frontend/src/components/kri/KRIGaugeCard.tsx:81` `` `${resolvedDaysOverdue}d` ``.
  - Systemic: 68 of 71 Czech strings that interpolate `{{count}}` have no plural forms; the only plural family is `dashboard.json` `risk_count_one/_few/_other`.
- **Impact:** ungrammatical Czech and English counts and labels across the app.
- **Fix:** whole-phrase keys with `{{count}}` plural families (D15: cs `_one/_few/_other`, en `_one/_other`); `validate-plurals.mjs`; the concatenation selector (§4.1).
- **Effort:** S per site. **Phase:** 0 (validator) → 3.
- **Verification:** R2-V3 GAP-B-14 🟡 → R3 🟢 (convention barely established; GAP-C-13 Czech claim false, the bug is English) → merge M14b; entry severity raised back to 🟡 at assembly because merged members PG-12, PG-23 and GAP-B-05 are 🟡 (§11.3).

#### GAP-C-09 🟡 Raw Czech closed-list codes shown as option labels and chips (PO decision)

- **Linked:** PG-03 (merge group M13).
- **Evidence:** `frontend/src/pages/vendors/VendorContractsSection.tsx:122`, `frontend/src/pages/vendors/VendorSubOutsourcingSection.tsx:132` and `frontend/src/pages/assets/AssetLinkSections.tsx:175` build `label: String(value)` from `AnoNe`, `TypUjednani`, `VyznamVazby`, `RoleDodavatele`, so English users see "Ano/Ne". [ADR-015](../adr/ADR-015-frontend-design-system-foundation.md):49-51 "Ordinary UI labels follow the user's active locale"; Asset and Process forms translate their codes (`frontend/src/pages/assets/AssetForm.tsx:256`). Backend CZ→EN maps already exist (`docs/dora-ict-register/dora-excel-functional-spec.md:770` `ROI_MAPS`). Correction: `frontend/src/pages/vendors/vendorContractsPresentation.tsx:122` `contract.main_contract === 'Ano'` compares the canonical stored code, which is correct.
- **Impact:** English users see Czech codes in vendor DORA forms.
- **Fix:** translated labels under `values.closed_lists.<List>.<code>` with a raw fallback; keep the raw value; the PO decides which lists stay regulatory (§3.1).
- **Effort:** M. **Phase:** 3h.
- **Verification:** R2-V2 → R3 confirmed with corrections.

#### GAP-D-01 🟡 The control create/edit form shows raw English enum text in every locale

- **Evidence:** `frontend/src/components/control-form/ControlFormExecutionStep.tsx:5-6` `value.replace(/[_-]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());` builds "Semi Annually"; `:33` `label: form.toUpperCase()` gives "MANUAL"; `frontend/src/components/control-form/ControlFormStatusStep.tsx:41` renders `{status}`. Keys exist: `frontend/src/i18n/locales/en/controls.json:29-37` frequencies and `:38-41` status (cs `"draft": "Návrh"`); `semi-annually` has no `controls:frequencies` key.
- **Impact:** Czech users see English, regex-capitalised labels in a core form.
- **Fix:** `t(\`controls:frequencies.${f}\`)` (add NEW key `controls:frequencies.semi-annually`, en + cs), `t(\`controls:status.${s}\`)` (existing keys), and NEW keys `controls:control_forms.{manual,automatic}` (en + cs; `controls` has no `forms` group).
- **Effort:** S. **Phase:** 3b.
- **Verification:** R3 coverage sweep → R5 confirmed (`frontend/src/types/control.ts:15` includes `'semi-annually'`, which has no key).

#### GAP-D-02 🟡 Raw-code "prettifying" with regex instead of i18n

- **Evidence:** `frontend/src/pages/admin-console/sections/audit/auditPresentation.ts:15` `return event?.replace(/_/g, ' ') || fallback;` (audit event column, `frontend/src/pages/admin-console/sections/audit/AuditLogsTable.tsx:47`); `frontend/src/pages/admin-console/sections/audit/AuditLogsPanel.tsx:130` (event-type filter options); `frontend/src/components/activity-log/ActivityLogEntries.tsx:189` `{field.replace(/_/g, ' ')}`; `frontend/src/components/dashboard/CategoryBreakdownCharts.tsx:21` `key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ')`; `frontend/src/pages/issues/issue-detail/IssueHistoryTab.tsx:37` (GAP-C-11 remainder); `frontend/src/components/control-form/ControlFormExecutionStep.tsx:6` (GAP-D-01).
- **Impact:** snake_case-derived English shown to Czech users in audit, activity and chart views.
- **Fix:** `t(\`<ns>:<group>.${code}\`, { defaultValue: humanizeCode(code) })` with NEW `<ns>:<group>.*` keys (en + cs) and a NEW `humanizeCode` helper in `frontend/src/lib/` (only the local `humanizeRiskTypeCode` exists, `frontend/src/components/approvals/LegacyApprovalChanges.tsx:181`); a grep gate for `.replace(/_/g, ' ')` and `.replaceAll('_', ' ')` in render paths.
- **Effort:** S–M. **Phase:** 3 (3c, 3f, 3g).
- **Verification:** R3 coverage sweep → R5 confirmed (note: `CategoryBreakdownCharts.tsx:21` is only the `t(\`charts.${key}\`, formatLabel(key))` fallback at `:40`, so it leaks only for codes without a key; the issue-history site uses `replaceAll`, which the proposed grep gate must also match).

#### GAP-D-03 🟡 KRI unit codes are shown raw

- **Evidence:** `frontend/src/components/kris/KRIDetailOverviewTab.tsx:56` `<span className="text-lg text-slate-400 ml-2 font-bold">{kri.unit}</span>` (also `:59` limits and `:224` `{kri.unit || '—'}`); `frontend/src/components/history/HistoryComparisonPanel.tsx:99` (also `:100-128`, `:145`); `frontend/src/components/kri/KRIValueModal.tsx:147` `{kri.current_value} {kri.unit}`; `frontend/src/components/kri/KRIHistoryEditModal.tsx:118`. Only `frontend/src/components/kri-form/KriDetailsStep.tsx:129-135` and `frontend/src/components/approvals/LegacyApprovalChanges.tsx:127` (`UNIT_VALUE_KEYS`) translate units.
- **Impact:** "count"/"days" in a Czech UI.
- **Fix:** create a NEW helper `formatKriUnit(unit, t)` in `frontend/src/lib/kriUnits.ts` that reuses the existing `kris:form.units.*` keys (CZK and EUR pass through), and reuse it in `LegacyApprovalChanges`.
- **Effort:** S. **Phase:** 3b.
- **Verification:** R3 coverage sweep → R5 confirmed with corrections (two more raw sites in `KRIDetailOverviewTab.tsx`, `:59` and `:224`).

#### GAP-D-04 🟡 KRI comparison panel shows the raw breach enum and has two identically named selects

- **Evidence:** `frontend/src/components/history/HistoryComparisonPanel.tsx:107-108` `before: leftEntry.breach_status.toUpperCase(),` gives "WITHIN"/"ABOVE"; the baseline and target pickers at `:172` and `:182` have no label, so both are announced "Select".
- **Impact:** untranslated status; indistinguishable controls for screen-reader users.
- **Fix:** add NEW keys `kris:breach_status.{within,above,below}` (en + cs; `kris:monitoring` has no `within`/`above`) rendered via `t()`; `triggerAriaLabel` "Baseline" / "Target".
- **Effort:** S. **Phase:** 3b.
- **Verification:** R3 coverage sweep → R5 confirmed (both selects fall back to the placeholder name `t('actions.select')`, `frontend/src/components/ui/ThemedSelect.tsx:79,89`).

#### GAP-D-06 🟡 The risk owner picker shows raw role codes

- **Evidence:** `frontend/src/components/risk-form/RiskFormOwnershipStep.tsx:122` `{role}` (from `frontend/src/components/risk-form/riskFormWorkflow.ts:79` `users.map((user) => user.role_name)`) and `:199` `<span className="text-xs text-muted-foreground capitalize">{u.role_name}</span>`; `frontend/src/components/access/DirectoryUserRow.tsx:33` displays `user.role_display_name || user.role_name`.
- **Impact:** role codes instead of role names in filter chips and results.
- **Fix:** carry `role_display_name` in `UserLookupItem` (`frontend/src/services/lookupApi.ts:13-21` has only `role_name`, filled from `Role.name` in `backend/app/api/v1/endpoints/users/lookup.py:151`), or create a NEW shared helper `getRoleLabel(role, t)` in `frontend/src/lib/roleLabels.ts`, extracted from the local closures in `frontend/src/components/riskhub/ApprovalScenariosPanel.tsx:111,322`, and reuse it in both places; keep the code as the filter value.
- **Effort:** S. **Phase:** 3b.
- **Verification:** R3 coverage sweep → R5 confirmed with corrections (`getRoleLabel(role, t)` does not exist as a reusable helper; fix line made concrete).

**🟢 Observations (6.8)**

| ID | Title | Evidence | Fix | Effort | Phase | Verification |
|---|---|---|---|---|---|---|
| PG-30 | Label and fallback key divergence across registers | "Uncategorized": `common:fallbacks.not_available` (`frontend/src/pages/RisksPage.tsx:64`, `frontend/src/pages/KRIsPage.tsx:87`), `controls:form.labels.uncategorized` (`frontend/src/pages/ControlsPage.tsx:53`), `issues:fallbacks.uncategorized` (`frontend/src/pages/IssuesPage.tsx:83`); Export: `common:actions.export` renders cs "Exportovat" (`frontend/src/pages/IssuesPage.tsx:40`) while module keys render "Export", and `issues` has no `actions.export`; owner fallback `issues:fallbacks.unassigned` (`frontend/src/pages/issues/issueColumns.tsx:40`) | Shared vocabulary only in `common`; delete module copies | S | 3b | R1 → R2-V1 confirmed with corrections |
| PG-35 | Pages resolve language and error keys several ways (Also: SM-13, merged at assembly) | `frontend/src/pages/KRIsPage.tsx:25` and `frontend/src/pages/IssuesPage.tsx:23` `i18n.language as SupportedLanguage`; `frontend/src/pages/VendorsPage.tsx:29` `i18n.language.startsWith('cs') ? 'cs' : 'en'`; `frontend/src/pages/RisksPage.tsx:26`, `frontend/src/pages/AssetsPage.tsx:25` `useLanguage()`; `frontend/src/pages/VendorsPage.tsx:80` `t(state.errorKey, { ns: 'errorKeys' })` vs `frontend/src/pages/AssetsPage.tsx:47`; dead `frontend/src/pages/vendors/useVendorsPageState.ts:147` `fallbackErrorKey` | `useLanguage()` everywhere; `t(state.errorKey)`; drop the dead fallback | S | 2 | R1 → R2-V1 / R2-V2 confirmed |
| PG-36 | Four idioms for rendering `errorKeys.*` | `frontend/src/components/risk-form/RiskFormContainer.tsx:125`, `frontend/src/components/issues/IssueCreateForm.tsx:166`, `frontend/src/pages/ControlDetailPage.tsx:112-118`, `frontend/src/components/kri-form/KriFormErrorAlert.tsx:18-22`; the wrapper already strips the prefix (`frontend/src/i18n/hooks.ts:62`) | One `translateUiMessage(t, key)` | S | 1 → 3 | R1 → R2-V1 confirmed |
| PG-37 | Copy bug: "Notes (None)" instead of "(optional)" | `frontend/src/components/control-form/ControlFormRiskLinkStep.tsx:89` `{t('common:labels.notes')} ({t('common:labels.none')})`; `common:labels.optional` does not exist | Create `common:labels.optional`; `Field optional` (§4.8) | S | 1 | R1 → R2-V1 confirmed |
| PG-40 | Czech display strings used as filter values (linked to PG-03) | `frontend/src/pages/risks/RiskRegisterFilterBar.tsx:20-25` `NET_BAND_LABEL_KEYS` keyed by `'Nízké'`, `'Kritické'`; `frontend/src/components/dashboard/RiskCommitteeCards.tsx:96` `navigate('/risks?net_band=Kritick%C3%A9')`; `frontend/src/pages/departments/DepartmentStatsGrid.tsx:41-42` `net_band: 'Vysoké'`; no control sets `net_band` (chip only) | Band codes in URLs, mapped to the backend value in `frontend/src/pages/risks/riskRegisterConfig.ts` (needs a backend check) | S–M | 3b | R1 → R2-V1 confirmed |
| I18N-05 | Untranslated cs values and a wrong xlsx label (linked to PG-03) | `frontend/src/i18n/locales/en/common.json:80` and the cs twin `"xlsx": "CSV (.csv)"`; `frontend/src/i18n/locales/cs/assets.json:62-63` "GDPR relevance", "AI relevance"; admin "Sys Admins", "Dead letter" | Translate; delete the unused `xlsx` key (no XLSX export exists) | S | 4 | R1 → R2-V2 confirmed |
| I18N-06 | Gaps in `docs/LOCALIZATION.md` | `docs/LOCALIZATION.md:92` broken `cd ""`; no formatting, plural or `<html lang>` rules; scanner blind spot undocumented | Add "Formatting and plurals" and scanner scope; fix the command | S | 1 | R1 → R2-V2 confirmed |
| I18N-07 | `date-fns` is an unused dependency | `frontend/package.json:46` `"date-fns": "^4.4.0",`; 0 imports | Remove (O11) | S | 4 | R1 → R2-V2 confirmed |
| GAP-B-24 | Unanswered questions display "Unknown" | `frontend/src/components/risks/risk-questionnaire-detail/questionnairePresentation.ts:135` `if (value === undefined \|\| value === null) return t('labels.unknown');`, rendered 5 times as an answer | A NEW "Not answered" key (en + cs) in muted style | S | 3e | R2-V3 🟡 → R3 🟢 (wording only) |
| GAP-D-23 | Documentation heading anchors have English accessible names | `frontend/src/components/documentation/DocumentationMarkdown.tsx:233-235` `` `Anchor link for ${headingText}` ``; external links `:322` `target="_blank"` with no new-tab hint | NEW key `t('docs.anchor_link', { heading })` (en + cs); sr-only "(opens in new tab)" | S | 3f | R3 coverage sweep → R5 confirmed (`anchorLabel` is passed to `aria-label` at `:243`) |

### 6.9 Responsive

[ADR-014](../adr/ADR-014-desktop-first-support.md) makes the app desktop-only from 1024px (`lg`); at exactly `lg` the content column is ≈ 672px (1024 − 288 sidebar − 64 padding). Public routes are outside `DesktopOnlyNotice`.

#### RS-01 🟡 Governance and Dashboard stat grids are too dense at `lg`

- **Evidence:** `frontend/src/pages/GovernancePage.tsx:281` `className="grid gap-6 md:grid-cols-2 lg:grid-cols-6"` holds 8 `glass-card`s: (672 − 120) / 6 = 92px per card, 44px of content for `text-4xl` numbers. Same `lg:grid-cols-6` in `frontend/src/pages/dashboard/DashboardSummarySections.tsx:42`.
- **Impact:** cramped, truncated KPI cards at the minimum supported width.
- **Fix:** `grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]` (§4.6).
- **Effort:** S. **Phase:** 3f / 3g.
- **Verification:** R1 → R2-V2 confirmed.

#### RS-02 🟡 The SSO login clips instead of scrolling; the language switch can be occluded

- **Evidence:** `frontend/src/pages/login/SsoOnlyView.tsx:36` `<div className="h-screen overflow-hidden bg-[#07111b] text-slate-100">`, `:42` `flex h-screen w-full max-w-[1320px] flex-col`, `:78` `<section className="flex min-h-0 flex-1 items-center justify-center">` with no overflow (R5: was `:79`). Measured: at 1280×600 the content bottom is 647px against a 600px viewport and `scrollHeight` is 600; `elementFromPoint` at the CS button returns the sign-in card and a Playwright click times out. At 1024×600 the `h1` top is −41px and 204px are clipped. 1280×800 and 1440×900 are fine.
- **Impact:** on short viewports or with browser zoom, the language switch cannot be used and the headline is clipped. The "Continue with Microsoft" CTA was not shown to be unreachable.
- **Fix:** `min-h-screen` and `overflow-y-auto`, drop the `min-h-0` clipping (Phase 0); `AuthFrame` (§4.20); viewport probes in G-RENDER.
- **Effort:** S. **Phase:** 0.
- **Verification:** R1 (plausible) → R2-V2 confirmed by CSS → R2-V3 measured, proposed 🔴 → R3 not justified, 🟡 → D17 keeps 🟡.

**🟢 Observations (6.9)**

| ID | Title | Evidence | Fix | Effort | Phase | Verification |
|---|---|---|---|---|---|---|
| RS-03 | Header rows don't wrap | `frontend/src/pages/DepartmentsPage.tsx:46` `<div className="flex items-center justify-between">`; `frontend/src/pages/GovernancePage.tsx:250`; `frontend/src/pages/ActivityLogPage.tsx:49`; `frontend/src/pages/departments/DepartmentDetailHeader.tsx:17`; registers use `flex flex-col md:flex-row … gap-4` (`frontend/src/components/ict-register/RegisterListShell.tsx:204`) | `PageHeader` with `flex-wrap gap-4` | S | 3f | R1 → R2-V2 confirmed |
| RS-04 | Fixed pixel widths are column hints only | 39 fixed `w-`/`min-w-` widths in non-test `.tsx` (`grep -rnoE "(^|[^-a-z])(min-)?w-\[[0-9]{3,4}px\]" --include=*.tsx frontend/src`; R1's `\b` pattern also matched `max-w-*` and gave 49–55, recounted 2026-10-01), all inside scroll containers or behind `max-w-*`; e.g. `frontend/src/components/history/HistoryComparisonPanel.tsx:175` `className="min-w-[180px]"` | No code change; keep them inside `Table`'s scroll container (§4.13) and re-check under G-RENDER at 1024px with `cs` | — | 3 (re-check at each module exit, §5.5) | R1 only (no-action observation; not spot-checked in R2) |

### 6.10 Module-specific findings

Cross-cutting entries above already cover most module defects; this section holds the entries that belong to one module. Pointers list the main cross-cutting IDs per module.

**Module: Risks**

- Cross-cutting: DS-01, PG-01, PG-02, PG-03, PG-07, AX-04, DS-14, GAP-D-05, GAP-D-06, GAP-D-14, GAP-D-15, PG-28, PG-29, PG-46.

#### GAP-D-19 🟡 The risk overview tab and the dashboard mix tokenised and hard-coded section cards

- **Evidence:** tokenised titles `frontend/src/components/risks/detail-overview/RiskSummaryCards.tsx:54` `font-bold text-foreground uppercase tracking-widest text-xs` (also `:88`, `:118`) and `frontend/src/components/risks/detail-overview/RiskKriSection.tsx:31`; hard-coded on the same tab `frontend/src/components/risks/detail-overview/RiskAssessmentSection.tsx:23` `font-bold text-white uppercase tracking-widest text-xs` and `frontend/src/components/risks/detail-overview/RiskLinkedControlsSection.tsx:69` and `frontend/src/components/risks/detail-overview/RiskLinkedVendorsSection.tsx:28`, so 3 of the 7 card titles of this recipe on `/risks/:id` disappear in light (1.04:1, computed); the register-links block uses a third recipe (`frontend/src/components/risks/detail-overview/RiskRegisterLinksSection.tsx:195` `text-slate-500`). The dashboard has three card-title recipes: `frontend/src/pages/dashboard/DashboardSummarySections.tsx` tokens, `frontend/src/pages/dashboard/DashboardRiskSections.tsx:76` `text-lg font-bold text-white` and `:163`, `frontend/src/components/dashboard/QuarterlyComparisonWidget.tsx:98`.
- **Impact:** half-migrated pages; part of each page vanishes in light.
- **Fix:** one `CardHeader` (§4.10) on both pages; the colour part lands with the Phase 2 codemod.
- **Effort:** S. **Phase:** 2 → 3b / 3g.
- **Verification:** R3 coverage sweep → R5 confirmed with corrections (3 of 7 titles, not 2 of 5: `RiskLinkedVendorsSection` was missed).

| ID | Title | Evidence | Fix | Effort | Phase | Verification |
|---|---|---|---|---|---|---|
| PG-41 🟢 | Risk description truncation is manual and uses an ASCII ellipsis | `frontend/src/pages/risks/riskColumns.tsx:80-87` `const isLong = text.length > 20;` … `` `${text.slice(0, 20)}...` ``; KRI uses CSS `truncate max-w-[200px]` + `title` (`kriColumns.tsx:73`) | CSS truncation (§4.13) | S | 3b | R1 → R2-V1 confirmed |

**Module: Controls**

- No control-only entries remain. Cross-cutting: DS-02 and AX-04 (`control-form`), GAP-D-01, PG-03 (effectiveness, frequency), PG-07 (`ArchiveConfirmDialog`), PG-32, PG-31.

**Module: KRIs**

#### PG-25 🟡 The KRI filter bar duplicates the status filter, and "All" wipes unrelated filters

- **Evidence:** `frontend/src/pages/kris/KriRegisterFilterBar.tsx:123` monitoring `ThemedSelect` plus a pill row at `:138-141` writing the same `monitoring_status` / `timeliness_status` / `lifecycle`; `:138` `onClick={onClearAll}` bypasses the toolbar wrapper at `:127`, so it clears department, owner, frequency and search group, and leaves empty optional filter boxes open.
- **Impact:** two controls for one filter; "All" silently discards the user's other filters.
- **Fix:** drop the pill row (no other register has one), which also removes the "All" pill that wipes unrelated filters; the remaining monitoring `ThemedSelect` resets only `monitoring_status`.
- **Effort:** S. **Phase:** 3b.
- **Verification:** R1 → R2-V1 confirmed.

| ID | Title | Evidence | Fix | Effort | Phase | Verification |
|---|---|---|---|---|---|---|
| PG-34 🟢 | `KRIModal` carries dead create/delete paths and an over-broad title id | The only consumer `frontend/src/pages/KRIDetailPage.tsx:310-316` never passes `onDelete`; `frontend/src/components/kri/KriModalFooter.tsx:31-39` is dead; `frontend/src/components/kri/KRIModal.tsx:58` `<div id={titleId}>` wraps the whole header including Close | Remove dead paths (D16); put the `id` on the `h3` | S | 0 (dead paths) → 3b (title id) | R1 → R2-V1 confirmed |

- Cross-cutting: DS-10 (KRI edit modal vs create page, no `StepIndicator`), PG-07 ("Delete KRI"), PG-08, DS-16 (`p-8`), DS-15, GAP-D-03, GAP-D-04, DS-17.

**Module: Issues**

#### PG-05 🟡 Issue filter chips have the wrong prefix and no values

- **Evidence:** `frontend/src/pages/issues/IssuesFilterBar.tsx:45` `` label: `${t('filters.all_statuses')}: ${t(`status.${filters.status}`)}` `` renders "All statuses: Open"; `:46` does the same for severity; `:50` `...selected.map((key) => ({ key, label: labels[key] })),` shows department, owner and remediation chips without their value. Other registers render `Label: value` (`KriRegisterFilterBar.tsx:68-73`, `:78`).
- **Impact:** misleading chips in the Issues register.
- **Fix:** `columns.status` / `columns.severity` prefixes; a shared `buildFacetChip(label, facetOptions, value)` in `RegisterListToolbar` for all filter bars.
- **Effort:** S. **Phase:** 3b.
- **Verification:** R1 → R2-V1 confirmed.

| ID | Title | Evidence | Fix | Effort | Phase | Verification |
|---|---|---|---|---|---|---|
| PG-42 🟢 | The Issues register sorts fewer columns than its peers | `frontend/src/pages/issues/issueColumns.tsx:33-36` (department) and `:38-41` (owner) lack `sortable: true` (3 of 6 sortable); Controls sort department | Add `sortable: true` to `frontend/src/pages/issues/issueColumns.tsx:33-41` after confirming `/issues` accepts `sort_by` for department and owner; otherwise file a backend issue | S | 3b | R1 → R2-V1 confirmed |

- Cross-cutting: DS-17 (bespoke denied states), DS-15 (`h2` title), DS-10 (not a `<form>`, `ISSUE_*` constants), AX-04 (remediation labels), PG-01 (issue severity colours), I18N-03 (dates), GAP-C-11 (history).

**Module: Approvals**

- No approvals-only entries remain. Cross-cutting: DS-16 (PG-15 remainder: `p-8`, raw search, bespoke pager, `X` error glyph), DS-29, DS-12, PG-03 (questionnaire status), FB-01 (D12).

**Module: Dashboard and ICT committee**

- No dashboard-only entries beyond GAP-D-19 (Risks). Cross-cutting: PG-01, GAP-B-16, GAP-B-19, GAP-D-10, GAP-D-11, GAP-D-12, GAP-D-20, RS-01, DS-15 (`h2` title, committee `h1`).

**Module: Risk Hub admin**

| ID | Title | Evidence | Fix | Effort | Phase | Verification |
|---|---|---|---|---|---|---|
| GAP-B-03 🟢 | Three "no permission" affordances for row Edit on one page | `frontend/src/components/riskhub/RiskTypesPanel.tsx:276` `{canUpdate ? (` (hidden); `frontend/src/components/riskhub/DepartmentsPanel.tsx:278` `disabled={!canUpdate}` with a generic title; `frontend/src/components/riskhub/roles/RolesTable.tsx:85` `edit_disabled` reason | `RowActionButton` with `disabledReason` (the RolesTable pattern) | S | 1 → 3a | R2-V3 🟡 → R3 🟢 |

- Cross-cutting: DS-04, DS-07 (modal frame), DS-01 (panel text), GAP-B-07, AX-04 (GAP-B-06), PG-07 (GAP-B-05), DS-13 (GAP-B-08), PG-03 (GAP-B-09), GAP-C-11 (GAP-B-04), DS-09 (GAP-B-11), DS-11.

**Module: Vendors**

#### SM-09 🟡 The Vendor module runs a parallel design system

- **Also:** GAP-C-20. ≈DS-05 (vendor CSS variables).
- **Evidence:** `frontend/src/components/vendors/vendorRoute.css:7` `max-width: 1520px;` in a 646-line file defining `.vendor-surface`, `.vendor-title`, `.vendor-inline-message--danger` and more; `frontend/src/components/vendors/vendorRouteUi.tsx:42-121` exports `VendorSurface`, `VendorSectionHeader`, `VendorBadge`, `VendorEmptyState`, `VendorInlineMessage`. `VendorEmptyState` (`:110`) has 0 consumers in `src` and tests; `VendorSurface` and `VendorSectionHeader` are used only in `vendor-form/*` plus `frontend/src/pages/vendors/VendorDetailStates.tsx:11` and `frontend/src/pages/vendors/VendorFormView.tsx:6`; the DORA detail sections use plain `glass-card` and `<h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">` (`frontend/src/pages/vendors/VendorContractsSection.tsx:293-297`). The system is deliberate ([`vendor-route-overhaul-2026-03-08.md`](../quality/vendor-route-overhaul-2026-03-08.md)) and is the cleanest module: 0 `text-white`, 0 hex.
- **Impact:** a second vocabulary for surfaces, badges, messages and tabs; a width cap only on Vendor pages.
- **Fix:** D13: thin aliases over `Card`, `Badge`, `InlineMessage`, `TabList`, `Field` first; delete `VendorEmptyState` in Phase 0 (D16); migrate last in Phase 3; delete `frontend/src/components/vendors/vendorRoute.css` in Phase 4; append an additive disposition to the vendor overhaul doc.
- **Effort:** L. **Phase:** 0 → 4.
- **Verification:** R1 → R2-V2 confirmed with corrections (deliberate, documented system; thin internal adoption) → R3 GAP-C-20 corrected (`VendorSurface` is also used outside `vendor-form/*`), merge M22.

- Cross-cutting: GAP-C-09, GAP-C-08, PG-07 (GAP-C-06), AX-04 (GAP-C-07), GAP-C-11 (GAP-C-03, GAP-C-21), AX-05, AX-06, I18N-03.

**Module: Assets, Processes and Threats**

#### GAP-D-08 🟡 Cancelling a pending creation on the Processes register has no confirmation

- **Evidence:** `frontend/src/pages/ProcessesPage.tsx:148` `onCancel={(approvalId) => void cancelPendingCreation(approvalId)}` calls `approvalsApi.cancel` directly (`:41`). Every pending-change cancel on detail pages goes through `PendingChangeCancellationDialog` (`frontend/src/pages/AssetDetailPage.tsx:217`, `frontend/src/pages/ThreatDetailPage.tsx:212`, `frontend/src/pages/VendorDetailPage.tsx:195`, `frontend/src/pages/ProcessDetailPage.tsx:258`). The row buttons `frontend/src/pages/processes/ProcessPendingCreationsPanel.tsx:88,103` (names at `:100` `{t('pending_creation.open_request')}` and `:111` `{t('pending_change.cancel')}`) repeat without item context in their names.
- **Impact:** a one-click, unconfirmed cancellation of a pending request (offered only where `can_cancel` is set).
- **Fix:** route through `PendingChangeCancellationDialog` with `targetName`; `aria-describedby` to the row heading (D10).
- **Effort:** S. **Phase:** 2 → 3d.
- **Verification:** R3 coverage sweep → R5 confirmed with corrections (`:100,111` are the label lines; the buttons open at `:88,103`; no confirmation anywhere between `:106` `onClick={() => onCancel(item.approval_id)}` and `approvalsApi.cancel`).

- Cross-cutting: SM-05, AX-06, DS-10 (GAP-C-10, raw buttons), AX-05, I18N-03 (raw ISO dates), PG-07 (GAP-C-01, Threat archive), FB-01 (Process divergence), GAP-D-07, DS-13 (pending badge).

**Module: Departments**

- No department-only entries remain. Cross-cutting: DS-15 (`h2` titles), RS-03, NAV-02 (`return_to`), DS-12 (tabs without keyboard), PG-40, GAP-D-27, GAP-D-10, FB-02.

**Module: Users and Access**

#### GAP-D-18 🟡 The native-user lifecycle panel is unstyled inside a themed modal; outcomes, errors and destructive operations look the same

- **Evidence:** `frontend/src/pages/users/NativeUserLifecyclePanel.tsx:118` `{outcome && <p ref={focus} tabIndex={-1} role="status">{outcome}</p>}` and `:119` the `role="alert"` error are both plain `<p>`s with no tone; `:108` `<h3 className="font-semibold">` differs from the surrounding sections; `:125` suspend, cancel invitation and assisted recovery are all `variant="outline"`. Mounted in `frontend/src/components/access/AccessEditModal.tsx:163`.
- **Impact:** administrators cannot tell success from failure or a safe action from a destructive one.
- **Fix:** `InlineMessage` tones; `variant="destructive"` for suspend/cancel; align the heading.
- **Effort:** S. **Phase:** 3c.
- **Verification:** R3 coverage sweep → R5 confirmed (each operation does open a reason form before submit, `:126-150`, so the defect is tone and hierarchy, not a missing confirmation).

| ID | Title | Evidence | Fix | Effort | Phase | Verification |
|---|---|---|---|---|---|---|
| GAP-D-27 🟢 | Small copy and state nits | `frontend/src/components/risks/detail-overview/RiskSummaryCards.tsx:94` `{risk.owner?.name?.[0] \|\| 'U'}`; `charAt(0)` avatars `frontend/src/components/governance/ResolveOrphanOwnerSelection.tsx:70`, `frontend/src/components/access/DirectoryUserRow.tsx:18`; `frontend/src/components/access/DirectoryUserRow.tsx:42-44` always "Active" (`bg-emerald-500/10 text-emerald-500`); `frontend/src/pages/admin-console/sections/audit/AuditDetailsModal.tsx:53-56` "Copied" without `aria-live`, failure only logged (`:32`); `frontend/src/pages/departments/DepartmentStatsGrid.tsx:137` `count: action.count ?? t('fallbacks.not_available'),` passes a string into a plural key | One avatar recipe; status-driven `Badge`; `useFeedback`; numeric counts or a separate key | S each | 3c | R3 coverage sweep → R5 confirmed with corrections (`DepartmentStatsGrid` quote was paraphrased; now verbatim) |

- Cross-cutting: AX-04 (UserNewLocalForm, UsersFilterBar, AccessEditModal), DS-10 (GAP-C-16, GAP-C-17, GAP-C-18), GAP-D-16, AX-10, SM-15, DS-17 (UserNewPage denied states).

**Module: Admin console and Settings**

#### GAP-D-17 🟡 The Health panel misreports when the health query fails

- **Evidence:** `frontend/src/pages/admin-console/sections/ops/HealthPanel.tsx:76` `{health?.database_status === 'connected' ? t('health.connected') : t('health.error')}` shows a red "Error" database card when `health` is undefined, although the database may be fine; `:79` renders "ms", `:89` "0h 0m", `:102` " MB"; there is no `isError` branch; units `ms`, `MB`, `h`, `m`, `s` are hard-coded (also `frontend/src/pages/admin-console/sections/ops/OutboxStatusSection.tsx:50`).
- **Impact:** a false negative status on the operator health page.
- **Fix:** `ErrorState` with retry; "—" for missing metrics; units through `useFormat().number(v, { style: 'unit', unit })` (§4.17).
- **Effort:** S. **Phase:** 3c.
- **Verification:** R3 coverage sweep (extends GAP-C-11) → R5 confirmed (`:37` `const health = healthQuery.data;`; only `isLoading` is branched at `:40`).

| ID | Title | Evidence | Fix | Effort | Phase | Verification |
|---|---|---|---|---|---|---|
| SM-10 🟢 | `DocumentationPage` and `DocumentationSettings` are near-duplicates | `frontend/src/pages/DocumentationPage.tsx:115` and `frontend/src/components/settings/DocumentationSettings.tsx:108` render the same `bg-white/5 hover:bg-white/10 text-slate-400` back button; 279 vs 289 lines with only 134 differing | Extract `components/documentation/DocumentationLibrary.tsx` | M | 3f | R1 🟡 → R2-V2 🟢 (maintenance duplication) |

- Cross-cutting: DS-04, GAP-C-11 (Sessions, Logs, LogSettings), FB-01 (raw messages), AX-05, GAP-C-15, DS-15 (heading levels), GAP-D-02 (audit events), DS-05 (`frontend/src/pages/admin-console/adminConsoleRoute.css`).

**Module: Governance and ICT register**

#### SM-11 🟡 The Governance page filters twice and compares against a backend sentinel

- **Evidence:** `frontend/src/pages/GovernancePage.tsx:130` `const filteredOrphans = orphans.filter(o => o.item_type === activeTab);` while `frontend/src/components/governance/OrphanedItemsTable.tsx:76-88` still offers its own type select (`{ value: 'all', label: t('governance.all_types') },`), so picking any other type empties the table; that select has no `triggerAriaLabel`; `:138` compares `item.department_name === 'Uncategorised'` (the backend sentinel at `backend/app/services/_orphaned_items/flagging.py:208`).
- **Impact:** a filter that can only produce an empty table; logic tied to an English display string.
- **Fix:** one filter control; compare a flag or ID; translate the label (I18N-01).
- **Effort:** S. **Phase:** 3f.
- **Verification:** R1 → R2-V2 confirmed.

- Cross-cutting: RS-01, DS-18 (glow), NAV-03, FB-02, GAP-D-13, DS-15 (`h2` title, stat `h3`), DS-17; ICT DQ page: DS-13 (`StatusPill`/`SeverityChip`), DS-29 (text pager); register shells: DS-11, GAP-D-22.

**Module: Login and public surfaces**

#### GAP-B-01 🔴 The production SSO login shows preview-only copy: "Live SSO is disabled on this page"

- **Evidence:** `frontend/src/pages/login/SsoOnlyView.tsx:159` `text-slate-500">{prodCopy.button_hint}</p>` and `:162` `{prodCopy.preview_note}`, fed from `frontend/src/pages/LoginPage.tsx:198-201` whenever `auth_mode === 'microsoft_sso'`. `frontend/src/i18n/locales/en/auth.json:99` "Preview only. Live SSO is disabled on this page." (cs `:99` says the same). Rendered on the real `/login` with `sso.enabled: true`. `frontend/src/pages/ProdLoginPreviewPage.tsx:118,123` legitimately uses the same keys; no test asserts the production copy.
- **Impact:** every production SSO user is told SSO is disabled, directly under a working "Continue with Microsoft" button.
- **Fix:** render `button_hint` / `preview_note` only from `ProdLoginPreviewPage`; a unit test that the production view never renders `preview_note`.
- **Effort:** S. **Phase:** 0.
- **Verification:** R2-V3 (found while rendering) → R3 confirmed 🔴.

#### DS-24 🟡 Pre-auth and public surfaces use four visual languages

- **Also:** NEW-V1-03, GAP-C-22, AX-15, NAV-07. (RS-02 and GAP-B-01 stay separate.)
- **Evidence:**
  - SSO / preview: `frontend/src/pages/login/SsoOnlyView.tsx:36` `bg-[#07111b] text-slate-100`, cards `rounded-[32px]` (`:92`) and `rounded-[26px]` (`:118`), `text-[#185abc]` (`:120`), duplicated in `frontend/src/pages/ProdLoginPreviewPage.tsx:23,86,91,93`. Callback: `frontend/src/pages/SsoCallbackPage.tsx:49` `min-h-screen flex items-center justify-center bg-slate-950 text-white p-4`. Native: token-based `frontend/src/pages/native/NativeFrame.tsx:20-21` (the a11y reference: `:18` focuses the `h1`, `:19` the alert). Hero: `frontend/src/pages/HeroPage.tsx:21` `mesh-gradient` + `.btn-primary` (`:57`).
  - Classes that never compile (NEW-V1-03): `border-white/8`, `border-white/6`, `via-sky-400/12` at `frontend/src/pages/login/SsoOnlyView.tsx:81,118,133` and `frontend/src/pages/ProdLoginPreviewPage.tsx:26,70,91,105`; a Tailwind 3.4.19 compile probe emits only `.border-white\/10`.
  - No `<main>` landmark (AX-15): `frontend/src/pages/login/LoginStateViews.tsx:26,47`, `frontend/src/pages/login/SsoOnlyView.tsx:36`, `frontend/src/pages/SsoCallbackPage.tsx:49`, `frontend/src/pages/login/DemoLoginView.tsx:40`, `frontend/src/pages/HeroPage.tsx:21`.
  - Language switch (GAP-C-22): a labelled `<select>` in `frontend/src/pages/native/NativeFrame.tsx:25-35` vs `aria-pressed` pills in `frontend/src/pages/login/SsoOnlyView.tsx:58-73`. Brand split duplicated (NAV-07): `frontend/src/components/layout/Sidebar.tsx:157` `const brandAccentSuffix = 'Hub';`, `frontend/src/pages/HeroPage.tsx:10`, `frontend/src/pages/login/SsoOnlyView.tsx:49`, `frontend/src/pages/ProdLoginPreviewPage.tsx:36`.
- **Impact:** the first screens users see look like different products; borders silently fall back; no landmark for screen readers.
- **Fix:** `AuthFrame`, `BrandWordmark`, `LanguageSwitch` (§4.20); pre-auth pages follow the OS colour scheme (D14); `<main>` in `AuthFrame`.
- **Effort:** M. **Phase:** 1 → 3i.
- **Verification:** R1 (DS-24, AX-15, NAV-07) → R2 confirmed; NEW-V1-03 → R3 confirmed by compile probe (🟢); GAP-C-22 → R3 confirmed; merge M18.

---

## 7. Per-directory rollups

The register cites representative lines; this section gives the scale. Counts exclude `__tests__/` and `*.test.*` and are regex-based (±5 %). Commands are in §12.2.

### 7.1 App-wide counts (corrected to the latest verification)

| Metric | Count | Register entry |
|---|---|---|
| Non-test `.tsx` files in `frontend/src` | 360 (343 under `pages/` and `components/`) | §10 |
| Raw Tailwind palette colour classes | 2,048 in 236 files (slate 1,057, rose 339, amber 276, emerald 161, red 44, purple 40, blue 37, sky 26, orange 25) | DS-03, DS-06 |
| `text-white` lines | 403 = 323 bare (126 files) + 73 `hover:` + 7 `group-hover:`; 117 on `<h1>`–`<h4>` | DS-01 |
| `text-slate-200/300/400` · `text-slate-500/600/700` · bright status text | 474 · 448 · 377 | DS-03 |
| Raw status palette vs semantic status tokens | 682 vs 438 (danger 382/232, success 163/146, warning 301/162, info 70/46) | DS-06 |
| White/black-alpha utilities | ≈1,400 (`bg-white/5` 298, `border-white/10` 225, `border-white/5` 180, `bg-white/10` 95, …); unremapped subset in DS-22 | DS-22 |
| Arbitrary values `x-[…]` · arbitrary colour literals | 539 · 18 | DS-05, DS-24 |
| `text-[10px]` · below 10px | 249 · 15 | DS-14 |
| Uppercase eyebrow lines | 533 in 48 combinations | DS-14 |
| Hex literals in TS/TSX | 115 (102 in `frontend/src/hooks/useChartTheme.ts`) | DS-05 |
| `text-accent` used as text | 198 hits, ≈100 on text (the rest on icons) | DS-19 |
| Raw `<button` vs `<Button` | 394 (175 files) vs 107 (44 files) | DS-10 |
| Raw text inputs vs `<Input` · `<textarea` · raw `<select>` | ≈64 vs 40 · 38 · 17 | DS-10 |
| Hand-rolled text controls with hard-coded white text | 60 (48 `<input>`, 12 `<textarea>`) in 32 files | DS-02 |
| `<label>` · with `htmlFor` · orphan | 121 · 25 · 64 | AX-04 |
| `outline-none` · without any ring | 110 · 57 | DS-26 |
| Inline pill recipes | 173 lines in 84 files | DS-13 |
| `<table>` files · `role="tablist"` files | 19 (18 outside `SortableTable`) · 10 | DS-11, DS-12 |
| Radius classes | `rounded-xl` 381, `rounded-lg` 260, `rounded-full` 200, bare `rounded` 92, `rounded-2xl` 82, `rounded-md` 57, `rounded-3xl` 6 | DS-25 |
| `DialogShell` sites · backdrop recipes · title recipes · hard-coded dark surfaces | 27 · 8 · 17 · 11 | DS-07 |
| Spinners | `Loader2` 20, CSS ring 15, `RefreshCw` 14, `animate-pulse` 21 | DS-17 |
| `transition-all` vs `transition-colors` | 133 vs 295 | DS-31 |
| lucide-react importers · inline `<svg>` | 234 · 2 | DS-30 |
| Czech `{{count}}` strings without plural forms | 68 of 71 | GAP-B-14 |
| `dark:` variants · `style=` props | 0 · 6 (all in the ICT committee section) | DS-20, PG-01 |

CSS inventory:

| File | Hex | rgb(a) | `hsl(var(--…))` | `!important` |
|---|---|---|---|---|
| `frontend/src/index.css` | 45 | 70 | 7 | 86 |
| `frontend/src/components/layout/sidebar.css` | 7 | 1 | 0 | 8 |
| `frontend/src/pages/admin-console/adminConsoleRoute.css` | 3 | 27 | 0 | 12 |
| `frontend/src/components/vendors/vendorRoute.css` | 0 | 0 | 114 | 0 |

Top raw-palette files: `frontend/src/hooks/useStatusTheme.ts` 53, `frontend/src/components/riskhub/DepartmentsPanel.tsx` 38, `frontend/src/pages/AuditTrailPage.tsx` 32, `frontend/src/components/riskhub/ApprovalScenariosPanel.tsx` 27, `frontend/src/pages/ProcessDetailPage.tsx` 25, `frontend/src/components/governance/OrphanQuickViewModal.tsx` 23, `frontend/src/pages/login/SsoOnlyView.tsx` 22, `frontend/src/pages/login/AccountButton.tsx` 22, `frontend/src/pages/assets/AssetLinkSections.tsx` 20, `frontend/src/pages/GovernancePage.tsx` 20, `frontend/src/components/kri/KRIValueModal.tsx` 20.

Top `text-white` files: `frontend/src/pages/ThreatDetailPage.tsx` 10, `frontend/src/pages/ProcessDetailPage.tsx` 10, `frontend/src/pages/AuditTrailPage.tsx` 10, `frontend/src/components/dashboard/ictCommittee/IctCommitteeExecutiveSummarySection.tsx` 10, `frontend/src/pages/controls/ControlDetailOverviewTab.tsx` 9, `frontend/src/components/tables/Pagination.tsx` 8, `frontend/src/components/settings/ProfileSettings.tsx` 8, `frontend/src/components/riskhub/RiskTypesPanel.tsx` 8, `frontend/src/components/riskhub/DepartmentsPanel.tsx` 8, `frontend/src/components/kri/KRIValueModal.tsx` 8.

### 7.2 Module adoption (secondary modules, R1-C)

| Module | raw `<button` | `<Button` | `text-white` | `text-slate-*` | `text-foreground` | `text-muted-foreground` | raw status hues |
|---|---|---|---|---|---|---|---|
| vendors (+ vendor-form, components/vendors) | 33 | 9 | **0** | **1** | 72 | 82 | **0** |
| vendorReports | 5 | 0 | 0 | 0 | 10 | 4 | 7 |
| assets | 14 | 9 | 9 | 41 | 8 | 12 | 34 |
| processes | 18 | **1** | 21 | 56 | 9 | 15 | 45 |
| threats | 16 | **1** | 15 | 30 | 9 | 8 | 26 |
| departments | 6 | 2 | 0 | 5 | 13 | 15 | 8 |
| users (+ access, components/users) | 26 | 7 | 31 | 53 | 16 | 39 | 69 |
| settings | 10 | 0 | 16 | 37 | 3 | 6 | 13 |
| admin-console | 1 | 10 | 2 | 2 | 0 | 0 | 18 |
| governance | 13 | 0 | 20 | 43 | 10 | 21 | 35 |
| docs | 4 | 0 | 5 | 5 | 2 | 6 | 0 |
| notifications | 7 | 6 | 3 | 2 | 7 | 18 | 6 |
| activity-log | 7 | 0 | 0 | 9 | 7 | 10 | 10 |
| audit-trail | 6 | 0 | 10 | 23 | 1 | 2 | 9 |
| ICT DQ | 5 | 0 | 0 | 0 | 7 | 18 | 0 |
| login / native / hero / sso | 9 | 12 | 12 | 33 | 1 | 4 | 53 |

Per-domain form adoption (Input / raw input+textarea / Field / ThemedSelect / raw select): `components/risk-form` 2/9/12/2/0 · `control-form` 0/9/0/7/0 · `kri-form` 0/6/0/6/0 · `components/kri` 0/12/0/2/0 · `vendor-form` 4/9/13/5/0 · `pages/assets` 1/7/8/11/1 · `pages/processes` 1/8/6/2/1 · `pages/threats` 2/5/6/2/1 · `pages/users` 9/6/14/2/5 · `components/issues` 2/11/0/6/0 · `components/riskhub` 0/22/0/3/0.

### 7.3 Rollups from the R3 coverage sweep (93 formerly uncited files)

New instances of already-registered classes; they carry no new ID. "Low-contrast dark" = `text-slate-500/600/700`; "pale status" = `text-{amber,rose,emerald,slate}-100/200/300` (sub-AA in light).

| Directory | Files | Raw palette | `text-white` | Low-contrast dark | Pale status | Notable lines |
|---|---|---|---|---|---|---|
| `components/dashboard` | 13 | 43 | 7 | 15 | 6 | `frontend/src/components/dashboard/DepartmentTable.tsx:48` `hover:text-white`; `frontend/src/components/dashboard/QuarterlyComparisonWidget.tsx:98` `text-white`; `frontend/src/components/dashboard/SnapshotAvailabilityNotice.tsx:17` `text-amber-300` |
| `pages/dashboard` | 2 | 6 | 6 | 2 | 0 | `frontend/src/pages/dashboard/DashboardRiskSections.tsx:76,117,134,163,176,192` `text-white` h3s; `:85` `text-slate-600` empty state |
| `components/governance` | 5 | 40 | 9 | 9 | 2 | `frontend/src/components/governance/ResolveOrphanOwnerSelection.tsx:74`; hand-rolled search inputs (DS-02 class) |
| `components/access` | 3 | 30 | 10 | 4 | 0 | `frontend/src/components/access/ExpandedAccessDetailsRow.tsx:25-71` 8 × `text-white text-sm` cards |
| `components/risks` + `detail-overview` | 9 | 33 | 10 | 8 | 2 | `frontend/src/components/risks/QuestionnaireAssessmentSummary.tsx:40,74,81,90,97`; `frontend/src/components/risks/detail-overview/RiskAssessmentSection.tsx:23`; `frontend/src/components/risks/detail-overview/RiskLinkedControlsSection.tsx:69,100` |
| `pages/processes`, `pages/assets`, `pages/threats` | 4 | 47 | 2 | 11 | 17 | `frontend/src/pages/assets/AssetPendingChangePanel.tsx:36,62`; `frontend/src/pages/processes/ProcessPendingCreationsPanel.tsx:65,69` `text-slate-600` `<dt>` |
| `pages/users` | 3 | 14 | 1 | 0 | 3 | `frontend/src/pages/users/UserNewDirectoryImportSection.tsx:26` `text-white`; `:34` `text-amber-100` |
| `pages/admin-console/sections/ops` | 2 | 7 | 0 | 0 | 3 | `frontend/src/pages/admin-console/sections/ops/OutboxStatusSection.tsx:67,82,88` `text-rose-300` |
| `control-form`, `kri`, `kri-form`, `kris` | 9 | 14 | 3 | 10 | 0 | `frontend/src/components/control-form/ControlFormExecutionStep.tsx:44,51` `text-white` inputs |
| `components/notifications` | 1 | 7 | 0 | 0 | 0 | `frontend/src/components/notifications/notificationPresentation.tsx:87-99` tone map (icons only) |
| vendor-form, vendors, approvals, history, risk-form, native, departments | 29 | ≤ 1 each | 0 | ≤ 1 | 0 | **Tokenised: the reference for fixes** |

Site lists for other known classes from the sweep are folded into their register entries: unnamed or placeholder-named `ThemedSelect` (11 sites) and orphan labels → AX-04; placeholder-only searches → AX-04; `title`-only icon buttons → AX-01; unannounced banners → AX-05; raw `<button>` sites (`frontend/src/components/governance/ResolveOrphanFooter.tsx:85-98`, `frontend/src/components/risks/RiskDetailQuestionnairesTab.tsx:107,119`, `frontend/src/components/risks/detail-overview/RiskLinkedControlsSection.tsx:73,84,147`, `frontend/src/components/risks/detail-overview/RiskKriSection.tsx:34`, `frontend/src/pages/processes/ProcessPendingCreationsPanel.tsx:88,103`, `frontend/src/components/dashboard/FilterBar.tsx:123,161,222`) → DS-10; Czech filter values → PG-40; issue-severity keys for risk levels → GAP-D-12; raw frequency → PG-03; `aria-label` on role-less divs (`frontend/src/components/dashboard/QuarterlyComparisonWidget.tsx:131`, `frontend/src/components/dashboard/IssuesSummaryCard.tsx:110`, `frontend/src/pages/DepartmentDetailPage.tsx:68`) → DS-17.

---

## 8. Module × pattern consistency matrices

Corrected to the latest verification. Bold marks the outlier.

### 8.1 List pages

| Pattern | Risks | Controls | KRIs | Issues | Approvals | Vendors | Assets | Processes | Threats |
|---|---|---|---|---|---|---|---|---|---|
| Shell | `RegisterListShell` | same | same | same | **bespoke** | `RegisterListShell` | same | same | same |
| Title | `h1 text-3xl font-bold` | same | same | same | **`h1 text-4xl font-black`** | same as registers | same | same | same |
| Extra page padding | — | — | — | — | **`p-8`** | — | — | — | — |
| Search | toolbar `Input` | same | same | same | **raw `<input>`** (token text) | toolbar | toolbar | toolbar (**raw `text-white` input**) | toolbar (**raw `text-white` input**) |
| Status filter | `ThemedSelect` | `ThemedSelect` | `ThemedSelect` **+ duplicate pill row** | `ThemedSelect` | tabs | `ThemedSelect` | `ThemedSelect` | `ThemedSelect` | `ThemedSelect` |
| Boolean filters | checkbox + **native `<select>`** | — | checkbox | checkbox | — | — | — | — | — |
| Chip format | `Label: value` | same | same | **`All statuses: value` / label-only** | — | same | same | same | same |
| Semantic filter summary | ✓ | ✗ | ✗ | ✗ | — | ✓ | ✓ | ✓ | **✗** |
| Sortable columns | 9/10 | 5/6 | 5/7 | **3/6** | none | — | — | — | — |
| Pagination | shared | shared | shared | shared | **bespoke Prev/Next** | shared | shared | shared | shared |
| Pending badge | yes | yes | **no** | **no** | — | `bg-warning/15` | `bg-warning/10` | **`bg-amber-400/15 text-amber-200`** | **none** |
| Restore action | raw button, no `type` | raw button | raw button `text-xs` | — | — | **text "Unarchive"** | icon "Restore" | icon | icon |
| Loading / empty | skeleton / `glass-card` text | same | same | same | **spinner / dashed card** | same | same | same | same |
| Access denied | `ReadAccessDeniedState` | same | same | **bespoke amber card** | n/a | same | same | same | same |
| Export label key | `risks:actions.export` | module key | module key | **`common:actions.export` ("Exportovat")** | — | — | — | — | — |
| Language source | `useLanguage()` | `useLanguage()` | **`i18n.language as …`** | **`i18n.language as …`** | `i18n.language` | **`startsWith('cs')`** | `useLanguage()` | `useLanguage()` | `useLanguage()` |

Bespoke list pages:

| Pattern | Departments | Users | ActivityLog | AuditTrail | Governance | Notifications | ICT DQ |
|---|---|---|---|---|---|---|---|
| Title | **`h2`** `text-3xl font-black` | `h1` + icon | `h1` + icon | **`h2` `text-white`** | **`h2`** | `h1` + `font-heading` | `h1` |
| Table | card grid | raw `<table>` | card list | **raw `<table>`, clickable `<tr>`** | raw `<table>` | list | raw list |
| Pagination | none | shared | **`ActivityLogPagination`** | shared | none | **inline chevrons** | **inline text** |
| Error state | **rose div, no role** | **rose div, no role** | custom | custom `role="alert"` | custom `role="alert"` | custom `role="alert"` | `TableErrorState` |
| Access denied | shared | route guard | **inline copy** | **inline copy** | shared | inline text | shared |
| Refresh | **icon, `title` only** | none | icon + label | **text button** | icon + label | none | text + icon |

### 8.2 Detail pages

| Pattern | Risk | Control | KRI | Issue | Vendor | Asset | Process | Threat | Department |
|---|---|---|---|---|---|---|---|---|---|
| Header | `EntityDetailHeader` | same | **bespoke `motion.div`** | **bespoke div** | `EntityDetailHeader` | same | **hand-rolled** | **hand-rolled** | **own `h2` header** |
| Title | `h1 text-4xl font-black` | same | **`h1 text-2xl`** | **`h2 text-4xl`** | `h1 text-4xl` | same | **`h1 text-3xl font-bold`** | **`h1 text-3xl font-bold`** | **`h2 text-3xl`** |
| Back | secondary `Button` | secondary `Button` | **breadcrumb text link** | **plain `<button>`** | text button | icon `Button` | **icon raw button** | **icon raw button** | icon `Button outline`, ignores `return_to` |
| Wrapper | `space-y-8` | `space-y-8` | **`p-8`** | `space-y-8` | vendor CSS | `space-y-8` | `space-y-8` | `space-y-8` | — |
| Loading | spinner + `aria-busy` | spinner, **no `aria-busy`** | **skeleton** | spinner, no `aria-busy` | spinner card | **plain text card** | **plain text card** | **plain text card** | **pulse, unannounced** |
| Edit | icon-only → page | icon-only → page | **labelled → modal** | **none** | `Button` | `Button` | **raw button** | **raw button** | — |
| Archive | icon `Trash2` → `ConfirmDialog` | icon `Trash2` → **`ArchiveConfirmDialog`** | **"Delete" `Trash2`** → `ConfirmDialog` | n/a | `Trash2`, reason always | `Trash2`, reason always | `Trash2`, reason conditional | `Trash2`, **no reason, dialog closes on error** | — |
| Status badge | **raw enum** | translated | translated | translated | uppercase neutral list / pill header | — | — | — | — |
| Action-error banner | `DetailActionBanner` (no role, unnamed close) | same | **bespoke amber** | n/a | `VendorInlineMessage` (no role) | div, no role | div, no role | div, no role | — |
| Approval queued (edit) | banner | banner | banner | n/a | → `/approvals?tab=mine` | → `/approvals` | **→ detail, silent** | → `/approvals` | — |

### 8.3 Create and edit flows

| | Risk | Control | KRI | Issue |
|---|---|---|---|---|
| Create | page wizard, 3 steps, `StepIndicator` | page wizard, 5 steps, `StepIndicator` (also `ControlCreateDialog`) | page, 2 steps, **no `StepIndicator`**, `max-w-3xl` | single-page form, **not a `<form>`** |
| Edit | page wizard | page wizard | **modal `KRIModal`** with separate field components | **none** |
| Capability gate | `useCreateCapabilityGate` | same | same | **bespoke; network errors become "denied"** |
| Header | `h2 text-foreground` + icon tile | **`h2 text-white`, no icon** | **`h2 text-white`** + icon | **`h2 text-white`** + icon, **no back link** |
| Back label | concatenated "Back" + title | concatenated | concatenated | — |
| Fields | `Field` (partial) + raw labels | **raw orphan labels** | **raw orphan labels** (edit modal uses `htmlFor`) | **raw orphan labels** |
| Required marker | `*` | **none** (native `required`) | **none** | **none** |
| Validation | inline per field, **4 English messages** | top banner | top banner | top banner |
| Footer | text Cancel + `btn-primary` | same, `text-slate-400` cancel | same, `text-slate-500` cancel | same; submit `type="button"` |

### 8.4 Archive, delete and unlink flows

| Flow | Confirmation | Icon / verb | Reason | Error surface |
|---|---|---|---|---|
| Risk archive | `ConfirmDialog` | `Trash2` / Archive | — | in dialog |
| Control archive | `ArchiveConfirmDialog` | `Trash2` / Archive | required | in dialog |
| KRI archive | `ConfirmDialog` | **`Trash2` / "Delete KRI"** | "Deletion reason" | in dialog |
| Vendor / Asset archive | `ConfirmDialog` | `Trash2` | always | in dialog |
| Process archive | `ConfirmDialog` | `Trash2` | when approval required | in dialog |
| Threat archive | `ConfirmDialog` | `Trash2` | **never (API takes none)** | **page banner, dialog closes** |
| Contract / sub-outsourcing archive | **only when approval required** | `Trash2` (title-only name) | `reason: ''` otherwise | — |
| Asset link removal | `ConfirmDialog` | — | — | in dialog, `role="alert"` |
| Process/Vendor register-link removal | `GovernedMutationReasonDialog` | `title`-only | governed | banner **without role** |
| Threat → Risk link removal | **none** | `title`-only | — | banner without role |
| Risk → Threat link removal | **none** (process/asset blocks are governed) | `title`-only | — | `TableErrorState` |
| Link management dialog unlink | `ConfirmDialog` | **"Delete" title and label** | — | in dialog |
| Questionnaire batch send | **none**, even for "select all" | — | — | banner |
| Pending-creation cancel (Processes) | **none** | — | — | — |
| Pending-change cancel (detail pages) | `PendingChangeCancellationDialog` | — | — | in dialog |

Target: §4.11 (D10).

### 8.5 Severity palettes

| Band | `riskScoreTheme` (register, matrix, sliders) | `useStatusTheme.matrix` (dashboard heatmap) | `useChartTheme.issueSeverity` | `issueUi` (issue pills) | `CriticalityClassPill` | `RiskQuickViewModal` | **Target (D1)** |
|---|---|---|---|---|---|---|---|
| low | success | emerald | `#22C55E` | **info (blue)** | success fill | emerald | `success` |
| medium | **info (blue)** | amber | amber | warning | warning | amber | `warning` |
| high | **warning** | orange | orange | **destructive** | **warning** (deliberate 3-step) | orange | `severity-high` (orange) |
| critical | destructive | rose | red | destructive | destructive | rose | `destructive` |
| thresholds | Risk Hub config | config | n/a | n/a | n/a | **hard-coded 20/12/6** | `useRiskThresholds()` |

`MiniHeatmap` had a seventh palette but is dead code (PG-43). Other one-off maps: `getControlRiskLevelColor`, `getVendorRiskColor` (raw), two questionnaire-status maps that disagree on "submitted", a 2-tier control-effectiveness map, the committee Excel colour scale, and three "Active" palettes on the Risk Hub page.

### 8.6 Page states

| Module | Loading | Empty | Error | Access denied |
|---|---|---|---|---|
| Registers (Risks, Controls, KRIs, Issues, Vendors, Assets, Processes, Threats) | table skeleton | `glass-card` text; "Loading data…" placeholder when never loaded | `TableErrorState` (**row restore failure flips the list**) | `ReadAccessDeniedState` (**Issues bespoke**) |
| Risk / Control / Issue detail | spinner (`aria-busy` on Risk only) | — | `DetailLoadUnavailableState`, `DetailStaleWarning` | — |
| KRI detail | skeleton | — | same as above | — |
| Asset / Process / Threat detail | **plain text card** | — | same as above | — |
| Department detail | **pulse, `aria-label` on a role-less div** | — | — | — |
| Dashboard | `RefreshCw` spinner | 3 recipes per page | `DashboardErrorState` | — |
| Governance | `RefreshCw` + text | — | custom `role="alert"` | **in-page guard + route guard** |
| ActivityLog / AuditTrail | custom | custom | custom | **inline copies** |
| Admin console | **full-screen text** | — | **none (Sessions, Logs, LogSettings, Health misreports)** | route guard |
| Risk Hub panels | text | — | RiskTypes/ApprovalScenarios/SystemSettings ✓; **Departments, Roles none** | `ReadAccessDeniedState` |
| Vendor register links | — | "no linked assets" | **none (failure renders as empty)** | — |
| Issue history | text only | "no history" | **none (failure renders as "no history")** | — |
| App bootstrap / lazy routes | **bare text, single root Suspense** | — | — | — |

### 8.7 Pagination and tabs

| Pagination | File | Prev/next names | `aria-current` |
|---|---|---|---|
| Shared | `frontend/src/components/tables/Pagination.tsx:57,104` | ✓ | ✓ (but `text-white` numbers, no `type`) |
| ActivityLog | `frontend/src/components/activity-log/ActivityLogPagination.tsx:32,58` | **✗** | **✗** |
| Notifications | `frontend/src/pages/NotificationsPage.tsx:464,475` | **✗** | n/a |
| ICT DQ | `frontend/src/pages/IctRegisterDqPage.tsx:154,169` | text ✓ | n/a |
| Approvals | `frontend/src/pages/ApprovalsPage.tsx:140-178` | text ✓ | n/a |
| KRI history | `frontend/src/components/kris/KRIDetailHistoryTab.tsx:128` | — | — |

| Tabs | Pattern | Keyboard | Active style |
|---|---|---|---|
| Settings, Admin, Notifications, RiskHub, Approvals, Risk/Control/KRI/Issue detail | `useContentTabs` | ✓ | pill `bg-accent`; **Admin `bg-slate-700`**; detail pages underline |
| Dashboard view tabs | `useContentTabs` | ✓ | **uppercase pill** |
| Department detail | **hand-rolled `role="tab"`** | **✗** | underline |
| ActivityLog | **plain buttons, no role** | **✗** | pill by colour only |
| Vendor | `.vendor-tab` BEM | — | vendor CSS |
| Register view switcher, Governance stat cards | `aria-pressed` buttons (correct: not tabs) | ✓ | segmented / ring |

### 8.8 Link-management sections

| Aspect | Asset | Vendor register links | Process → Vendor | Threat → Risk | Risk register links |
|---|---|---|---|---|---|
| Remove confirmation | `ConfirmDialog` | governed dialog | governed dialog | **none** | governed for process/asset; **none for threat** |
| Error banner role | `role="alert"` | **none** | **none** | **none** | `TableErrorState` |
| Load / error state | embedded | **none (error renders as empty)** | n/a | n/a | `role="status"` + `TableErrorState` |
| Palette | raw slate/white/rose | tokens | raw | raw | mixed |
| Remove button name | `title` only | `title` only | `title` only | `title` only | `title` only |
| Picker labels | placeholder only | placeholder only | raw placeholder-only input | — | — |

---

## 9. Quality-gate results and why they missed these defects

### 9.1 Gate runs at `ba42b38` (R2-V3, after `npm ci`)

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npx tsc -b` | exit 0, no diagnostics |
| ESLint | `npx eslint . -f json` | 722 files, 0 errors, 0 warnings; `frontend/eslint-suppressions.json` is `{}` |
| jsx-a11y | `npm run lint:a11y` | "jsx-a11y strict-zero gate OK: 0 findings, 0 baseline entries, 0 suppressions." |
| Dialog inventory | `npm run lint:dialog-inventory` | "27 implementation owners, 57 application render sites, 5 non-dialog surfaces, 30 executable contract cases." |
| i18n scan | `npm run i18n:scan` | "No hardcoded UI strings detected by scanner." |
| i18n parity | `npm run i18n:validate:strict` | "i18n parity OK across 21 namespaces." |
| i18n usage | `npm run i18n:validate:usage` | "i18n key usage OK across 699 source files." |
| Debt budget | `npm run quality:debt` | "Debt budget passed: no disallowed debt markers in frontend/src." |
| E2E light contrast (CI) | `tests/frontend/e2e/theme-contrast-matrix.spec.ts` in `--project=ci` | run 36326175751 on `ba42b38`: ✓ all 4 shards |
| Workflow contrast (#175 families) | rendered audit of `frontend/workflow-contrast.html` | 0 failures in light, riskhub and dark |

R2-V3 ran on Node 22.22 (`engines` asks for 24.x; warning only). The ESLint row is a direct `npx eslint . -f json` run; the jsx-a11y row is the `npm run lint:a11y` wrapper's own output (that wrapper also writes a report file into the repo, which is why the counts come from the direct run).

### 9.2 Rendered contrast by surface (light theme, base → dialog opened)

| Surface | < 3:1 | < 1.5:1 | `text-white` on light | Worst examples (measured) |
|---|---|---|---|---|
| `/risks` register | 4 | 3 | 3 | Pagination `span.font-medium.text-white` "1" at 1.04 |
| `/settings` | 14 | 11 | 9 | `h1 "Platform Settings"` at 1.00; email, department and scope values at 1.07 |
| `/risk-hub` (access denied) | 2 | 1 | 1 | `ReadAccessDeniedState` `h2` at 1.04 |
| `/controls/new` | 1 | 1 | 1 | `h2 "New Control"` at 1.04 |
| `/users/new` | 5 | 1 | 1 | `h1 "Add New User"` at 1.04 |
| Risk Hub departments frame | 14 → 15 | 3 | 2 | `h3` and row name at 1.04; `th` `text-slate-400` 2.36; count `text-slate-300` 1.33 |
| Risk Hub approval scenarios | 11 | 4 | 2 | `h3 "Approval Scenarios"` at 1.04 |
| Roles panel / role modal | 11 | 3 | 2 | `h3 "Platform Roles"` at 1.04 |
| Risk Hub risk types | **0** | 0 | 0 | token-migrated panel |
| KRI form mismatch | 11 | 6 | 6 | inputs "Uptime", "99" and description at 1.07 |
| `KRIModal` | 11 | 8 | 8 | `h3 "Edit KRI"` 1.00; 6 input values 1.07 |
| Risk questionnaire tab / dialog | 18 → 49 | 7 → **38** | 2 → 17 | header `h3` and section `h4`s at 1.00; read-only answers 1.07 |
| Dashboard risk drill-down | 17 → 21 | 7 → 10 | 7 → 10 | section `h3`s ("Gross risk", "Net risk", …) at 1.00 |
| Control overview links | 10 → 11 | 9 | 8 | `ControlDetailOverviewTab` `h3`s and values at 1.00 |
| Issue execution history | 3 → 4 | 1 | 1 | execution date `span.text-white` at 1.00 |

Dark dialog surfaces opened on a light page (`rgb(250,250,250)`): `RiskHubModalFrame` (edit department, risk type, scenario) and `RoleModal` `rgb(15,23,42)`; `IssueQuickCreateModal`, `LinkManagementDialog` and `ControlCreateDialog` `rgb(27,34,52)` (the last also contains a white `glass-card` island).

### 9.3 Why every gate missed these defects

| Defect class | Why the gate is blind | Guard that closes it (D15) |
|---|---|---|
| White-on-white / sub-AA text (DS-01, DS-03) | No lint rule knows that `text-white` is a theme defect; the CI axe gate reads only `violations` and axe reports text over blurred glass as `incomplete` (NEW-V1-02, plausible) | G-RATCHET `text-white` / `raw-palette`; G-RENDER measured contrast |
| Orphan labels (AX-04) | `label-has-associated-control` treats any `{expression}` child as a possible control (`mayContainChildComponent.js:34`) | G-ESLINT label selector; stateful axe per form |
| Unnamed icon buttons (AX-01) | `control-has-associated-label` is off | G-ESLINT icon-button selector; TS union |
| Mouse-only rows (AX-02) | `<tr onClick>` maps to role `row`, so `click-events-have-key-events` is silent | G-ESLINT `tr[onClick]` ban; `SortableTable` row activation |
| Hard-coded English (I18N-01) | the scanner drops single-word literals | G-I18N scanner fix |
| Czech plurals (GAP-B-14) | parity checks keys, not plural families | `validate-plurals.mjs` |
| Raw enums (PG-03, GAP-D-01/02) | usage validation sees keys, not values rendered without `t()` | enum-coverage unit tests; `.replace(/_/g, ' ')` grep gate |
| Hard-coded thresholds (PG-02) | the ADR-008 selector matches only 5/10/15/16 | broadened ADR-008 selector |
| Undefined CSS variables (DS-18) | nothing scans `var(--x)` | `cssVarsDeclared.test.ts` |
| Dialog surfaces (DS-07) | the dialog inventory checks owners and sites, not surfaces | inventory contract bans colour classes in `contentClassName` |
| Any regression in the above | suppressions and inline disables are forbidden, so ESLint cannot ratchet | standalone `ui-consistency-ratchet.mjs` with a baseline that only goes down |

---

## 10. Coverage map

Scope: every non-test `.tsx` file under `frontend/src/pages` and `frontend/src/components` (excluding `__tests__/`, `*.test.*`, `*.stories.*`): **343 files**. Before R3, 250 (72.9 %) were cited by an R1/R2 report; the R3 sweep read the other 93 in full (or their whole render section for files over 200 lines). **After R3: 343 / 343 reviewed (100 %).**

| Directory (`frontend/src/…`) | Files | Cited in R1/R2 | Swept in R3 | Uncited files reviewed in R3 |
|---|---|---|---|---|
| `components` (root) | 10 | 8 | 2 | RiskForm, VendorForm (re-exports) |
| `components/access` | 8 | 5 | 3 | DirectoryUserRow, ExpandedAccessDetailsRow, PermissionMatrix |
| `components/activity-log` | 3 | 3 | 0 | — |
| `components/approvals` | 4 | 1 | 3 | GovernedMutationReasonDialog, LegacyApprovalChanges, PendingChangeCancellationDialog |
| `components/control-form` | 6 | 4 | 2 | ControlFormExecutionStep, ControlFormStatusStep |
| `components/controls` | 2 | 2 | 0 | — |
| `components/dashboard` | 23 | 10 | 13 | ControlTrendChart, DepartmentTable, FilterBar, IssueAgingChart, IssuesSummaryCard, KRIBreachHistoryChart, OpenIssuesBySeverityChart, QuarterPeriodSelector, QuarterlyComparisonWidget, RiskCommitteeSection, RiskTrendChart, SnapshotAvailabilityNotice, WidgetShell |
| `components/dashboard/ictCommittee` | 3 | 3 | 0 | — |
| `components/documentation` | 1 | 0 | 1 | DocumentationMarkdown |
| `components/executions` | 2 | 2 | 0 | — |
| `components/forms` | 2 | 2 | 0 | — |
| `components/governance` | 8 | 3 | 5 | ResolveOrphanDepartmentSelection, ResolveOrphanFooter, ResolveOrphanOwnerSelection, ResolveOrphanRiskSelection, ResolveOrphanSummary |
| `components/history` | 4 | 3 | 1 | HistoryComparisonPanel |
| `components/ict-register` | 4 | 3 | 1 | RegisterExportLink |
| `components/issues` | 3 | 2 | 1 | RemediationPlanCard |
| `components/issues/remediation` | 7 | 7 | 0 | — |
| `components/kri` | 11 | 9 | 2 | KriCadenceOwnerFields, KriVendorSection |
| `components/kri-form` | 10 | 6 | 4 | KriCreateDialogs, KriFormNavigation, KriFormStepContent, KriVendorContextBanner |
| `components/kris` | 2 | 1 | 1 | KRIDetailOverviewTab |
| `components/layout` | 4 | 4 | 0 | — |
| `components/linking` | 6 | 5 | 1 | LinkSearchPanel |
| `components/notifications` | 2 | 1 | 1 | notificationPresentation |
| `components/reports` | 1 | 1 | 0 | — |
| `components/risk-form` | 4 | 2 | 2 | RiskFormOwnershipStep, RiskFormScoringStep |
| `components/riskhub` (+ `roles`) | 10 | 10 | 0 | — |
| `components/risks` | 7 | 3 | 4 | QuestionnaireAssessmentSummary, RiskDetailKriHistoryTab, RiskDetailOverviewTab, RiskDetailQuestionnairesTab |
| `components/risks/detail-overview` | 7 | 2 | 5 | RiskAssessmentSection, RiskKriSection, RiskLinkedControlsSection, RiskSummaryCards, RiskTimestamps |
| `components/risks/risk-questionnaire-detail` | 9 | 8 | 1 | RiskQuestionnaireCompareNotice |
| `components/settings` | 6 | 6 | 0 | — |
| `components/tables` (+ `tableError`) | 8 | 7 | 1 | ViewSwitcher |
| `components/ui` | 12 | 12 | 0 | — |
| `components/users` | 2 | 2 | 0 | — |
| `components/vendor-form` | 7 | 2 | 5 | VendorClassificationSection, VendorIdentitySection, VendorRegisterSection, VendorResilienceSection, VendorSuggestions |
| `components/vendors` | 7 | 1 | 6 | VendorLinkedControlCard, VendorLinkedControlsTab, VendorLinkedEntitiesTab, VendorLinkedKRIsTab, VendorLinkedRiskCard, VendorLinkedRisksTab |
| `pages` (root) | 44 | 41 | 3 | LoginPage, ProcessesPage, ThreatsPage |
| `pages/admin-console/sections` | 2 | 0 | 2 | AdminConsoleAuditPanels, AdminConsoleOpsPanels (re-exports) |
| `pages/admin-console/sections/audit` | 4 | 2 | 2 | AuditDetailsModal, AuditLogsTable |
| `pages/admin-console/sections/ops` | 6 | 4 | 2 | HealthPanel, OutboxStatusSection |
| `pages/approvals` | 4 | 4 | 0 | — |
| `pages/assets` | 5 | 4 | 1 | AssetPendingChangePanel |
| `pages/controls` | 3 | 2 | 1 | ControlRegisterFilterBar |
| `pages/dashboard` | 7 | 5 | 2 | DashboardOverviewContent, DashboardRiskSections |
| `pages/departments` | 5 | 3 | 2 | DepartmentRegisterScope, DepartmentStatsGrid |
| `pages/detail` | 4 | 4 | 0 | — |
| `pages/issues` (+ `issue-detail`) | 6 | 6 | 0 | — |
| `pages/kris` | 2 | 2 | 0 | — |
| `pages/login` | 4 | 4 | 0 | — |
| `pages/native` | 5 | 1 | 4 | NativeFactor, NativeLoginView, NativePublicPage, NativeSecurityPage |
| `pages/processes` | 6 | 4 | 2 | ProcessPendingChangePanel, ProcessPendingCreationsPanel |
| `pages/risks` | 2 | 2 | 0 | — |
| `pages/shared` | 3 | 3 | 0 | — |
| `pages/threats` | 5 | 4 | 1 | ThreatPendingChangePanel |
| `pages/users` | 7 | 4 | 3 | NativeUserLifecyclePanel, UserNewDirectoryImportSection, UsersAccessStats |
| `pages/vendors` | 14 | 11 | 3 | VendorPendingChangePanel, VendorRegisterFilterBar, vendorSubOutsourcingPresentation |
| **Total** | **343** | **250** | **93** | |

Classification of the 93 swept files: 5 non-rendering (re-exports or providers); 13 composition-only files that delegate to canonical primitives (✅ clean); 75 UI files reviewed in full, which produced GAP-D-01..27 and the §7.3 rollups.

Coverage caveats: coverage is measured by basename citation; ten files counted as cited are mentioned only in passing (`RiskScoreMatrix`, re-read in R3; `ActivityLogFilterBar`, `NotFoundPage`, `IssueWorkflowTab`, `SemanticFilterSummary`, `PreferenceSyncStatus`, `RiskQuestionnaireDetail`, `RiskForm`/`VendorForm` via their containers, `ThreatsPage` via its state hook). `/dashboard` and `/issues/new` rendered without seeded data, so their contrast is not measured; a seeded dashboard render is still needed. Recharts chart props, i18n text overflow with long Czech strings, and keyboard focus order were only partly covered. R1-A also covered CSS, tokens, `tailwind.config.js`, `eslint.config.js`, hooks and `lib/` presentation modules outside the 343-file scope.

---

## 11. Verification ledger

### 11.1 False flags removed from the register

| Item | Original claim | Why it is false | Source |
|---|---|---|---|
| **AX-13** | Recharts animations ignore reduced motion | Recharts 3.10.1 defaults `isAnimationActive: 'auto'`, and `JavascriptAnimate.js:45` disables animation when `prefersReducedMotion`; `src` has 0 overrides; framer is covered by `frontend/src/App.tsx:103` `<MotionConfig reducedMotion="user">` | R2-V2, R2-V3, R3 |
| DS-22 headline | `SortableTable` row dividers vanish in light | `.theme-light tr { border-color: #e2e8f0 !important; }` keeps them visible; the real breakage is 14 non-table sites | R2-V1 |
| NEW-V1-01, `ControlCreateDialog` half | `ControlForm` selects are navy-on-dark | `ControlForm` renders inside a themed `glass-card` island, white in light; the real leaks are `IssueQuickCreateModal`'s severity select, `DepartmentsPanel` and `LinkConfirmationPanel` | R3 |
| GAP-C-09 sub-claim | `contract.main_contract === 'Ano'` compares display text | It compares the canonical stored code, which is correct | R3 |
| GAP-C-13 Czech claim | "zařízení" breaks Czech plurals | The Czech word is invariant; the real bug is English "1 devices" | R3 |
| DS-01 gate claim | Light theme is not gated | `tests/frontend/e2e/theme-contrast-matrix.spec.ts` runs in CI; it is blind, not absent (NEW-V1-02) | R2-V1 |
| AX-00 fix | Set `label-has-associated-control` to `assert: 'either'` | That is already the default; the blind spot is `mayContainChildComponent` | R2-V2 |
| PG-09 premise | Radix Toast is "already a Radix stack" | `@radix-ui/react-toast` is not a dependency | R2-V1 |
| AX-02 AuditTrail part | AuditTrail rows are keyboard-unreachable | Enter on the (unnamed) chevron bubbles to the row; only the name is missing (AX-01) | R2-V2 |
| AX-02 fix | Migrate to `rowHref` | `rowHref` does not fit in-page selection; `onRowClick` is mouse-only too | R2-V2 |
| GAP-C-16 framing | AccessEditModal is a dark modal | It is a themed `glass-card` (DS-08 double padding) | R3 |
| GAP-B-15 forced-dark selects | A current bug | Correct today because the host dialog is always dark; becomes a bug only when DS-07 lands, so remove in the same PR | R3 |

### 11.2 Overstated items and corrected scope

| ID | Original | Corrected |
|---|---|---|
| DS-01 | 403 `text-white` + 80 `hover:` | 403 lines total = 323 bare (126 files) + 73 `hover:` + 7 `group-hover:` |
| DS-02 | 63 controls | 60 real controls (48 inputs, 12 textareas); 3 regex-window leaks |
| DS-07 | 9 dark dialogs, "readable only because their text is white" | 11 dark dialogs (7 rendered); token children leak navy-on-dark |
| DS-13 | 82 files | 84 files |
| DS-14 | 6–7px examples | `MiniHeatmap` examples are dead code; live examples are 8–9px |
| DS-15 | 6 pages without an `h1` | at least 9 routes, plus Governance, AuditTrail and Department detail |
| DS-19 | 198 text uses | ≈100 text uses; ≈97 are icons (allowed) |
| DS-21 | Bleeds onto unrelated nav/aside | 4 elements, near-invisible fill, default theme unaffected |
| DS-25 / DS-26 / DS-06 / DS-30 | counts | `rounded-full` 200, `rounded-2xl` 82, `rounded-md` 57; `focus:border-accent` 48, no-ring 57; warning tokens 162, info 46; lucide 234 files |
| DS-28 | layout README misses `DesktopOnlyNotice` | it lists it; only `frontend/src/components/layout/DestinationLauncher.tsx` and `frontend/src/components/layout/sidebar.css` are missing |
| PG-01 | MiniHeatmap is a live palette | dead; `CriticalityClassPill` is the missed 6th live map |
| PG-02 | wrong when settings differ from 20/12/6 | wrong even at the default 16/10/5 (ADR-008 violation) |
| PG-12 | Czech renders "Zpět Rizika" | renders "Zpět Registr rizik" (still ungrammatical) |
| PG-15 | raw input breaks light theme | it uses token text and is readable; nav starts at `:140` |
| PG-30 | Export keys | the `issues` namespace has no `actions.export` |
| SM-09 | promote vendor primitives wholesale | the system is deliberate and documented; fold in as aliases (D13) |
| SM-04 | Threat reason is a UI gap | Threat's API takes no reason; needs a backend change |
| I18N-01 | 13 literals | 11 live literals plus `'N/A'`; `CategoryDrillDown` literals are dead |
| GAP-C-01 | Risk side is governed | the threat block of `RiskRegisterLinksSection` is one-click too (R3-02) |
| GAP-C-04 | 4.1.2 failure | `title` is a fallback name; it is the ADR-013 policy / weak-name tier |
| GAP-C-05 | No accessible name | `ThemedSelect` falls back to the placeholder for the AT name; the defect is the visible label (3.3.2) |
| GAP-C-07 | inputs unnamed | named via `aria-labelledby`; focus cue, error branch and focus-on-error remain |
| GAP-C-10 | `text-slate-500` label is dark-only | 4.76:1 on white (passes); fails on riskhub glass |
| GAP-B-22 | English fallback renders | it is a `t()` defaultValue, near-dead |
| Line drift | various | SM-06 `frontend/src/pages/vendors/vendorColumns.tsx:125` / `frontend/src/pages/threats/threatColumns.tsx:120`; SM-07 `frontend/src/pages/UsersPage.tsx:331`, `frontend/src/pages/DepartmentsPage.tsx:63`; AX-05 `frontend/src/pages/detail/DetailActionBanner.tsx:36`; GAP-C-02 `:125` / `:259`; GAP-C-12 `:125`; GAP-B-22 `:52`; DS-03 `frontend/src/hooks/useStatusTheme.ts:37`; PG-08 archive ≈`:225-238`; I18N-03 `frontend/src/pages/vendors/VendorOverviewTab.tsx` |
| RS-02 | plausible | confirmed and measured (1280×600, 1024×600), CTA not shown unreachable |

### 11.3 Severity changes

| ID | Change | Reason |
|---|---|---|
| PG-01 | 🔴 → 🟡 | Each surface is legend-consistent; the real misclassification is PG-02 (R2-V1, justified in R3) |
| PG-33 | 🟢 → 🟡 (effective 🔴) | WCAG 4.1.2 failure on a shared component; merged into AX-01 🔴 |
| DS-20 | 🟡 → 🟢 | Dead config and CSS, no user impact |
| DS-21 | 🟡 → 🟢 | 4 elements, near-invisible effect |
| SM-10 | 🟡 → 🟢 | Maintenance duplication, cosmetic divergence |
| RS-02 | 🟡 → 🔴 (R2-V3) → 🟡 (R3, D17) | Clipping and occlusion are real, but the primary CTA was not shown unreachable and ≤ 600px heights are an edge case |
| NEW-V1-01 | 🔴 (R2-V1) → 🟡 (R3, D17) | Narrower than claimed; merged into DS-07 as an ordering rule |
| GAP-B-03 | 🟡 → 🟢 | Affordance inconsistency, no functional harm |
| GAP-B-13 | 🟡 → 🟢 | Wording, not data risk (merged into PG-07) |
| GAP-B-14 | 🟡 → 🟢 (R3) → 🟡 (assembly) | R3 lowered it because the plural convention is barely established; it now heads merge group M14b, whose members PG-12, PG-23 and GAP-B-05 are 🟡, and a merged entry takes its most severe member's final severity |
| GAP-B-21 | 🟡 → 🟢 | Residual after the DS-01/DS-02 merges is primitive adoption |
| GAP-B-24 | 🟡 → 🟢 | Wording, not data ambiguity |
| AX-13 | 🟢 → removed | False flag |
| AX-00 | context → 🟡 (assembly) | Became the static-gate primary of M3, absorbing I18N-02 (🟡) |

### 11.4 Contradictions between inputs and how they were resolved

| Topic | Conflict | Resolution in this document |
|---|---|---|
| RS-02 severity | R2-V3 and the R3 design standard say 🔴; R3 verification says 🟡 | 🟡 per D17 |
| NEW-V1-01 severity | R2-V1 🔴; the R3 standard still calls it 🔴; R3 verification 🟡 | 🟡 per D17, as a DS-07 sub-item |
| Control radius | D14 says "controls 12px (`rounded-xl`)", but `rounded-xl` = 14px and `rounded-lg` = 12px in `frontend/src/index.css:78-79` | The 12px value is applied (`rounded-lg`); design lead confirmed it on 2026-10-01 (§3.1) |
| Czech plural forms | D15 `_one/_few/_other`; R2/R3 fixes `_one/_few/_many/_other` | Validator requires D15's set and accepts optional `_many` (§3.1) |
| Primary CTA variant name | R3 standard `primary`; D4 `accent` | `accent` (D4) |
| Ratchet script | R3 standard `design-debt-ratchet.mjs`; D15 `ui-consistency-ratchet.mjs` | D15 name, under `frontend/scripts/quality/` |
| Form width | R3 standard 56rem (896px); D11 960px | 960px (D11) |
| Eyebrow recipe | R3 standard bold / `tracking-widest`; D6 600 / `tracking-wide` | D6 |
| Badge micro size | D6 restricted 11px to `text-eyebrow`; §4.9 needs an 11px uppercase `Badge size="sm"` | D6 amended by the design lead on 2026-10-01: 11px allowed for `text-eyebrow` and `Badge size="sm"` only, nothing smaller; recorded in the ADR-015 addendum (O2) |
| Third text level | R3 standard "no"; D14 allows `text-subtle` if AA in all themes | D14 (conditional) |
| Back buttons | R3 standard allows icon-only with breadcrumbs; D14 labelled | labelled (D14) |
| Light "Beta" fallback | R3 standard until Phase 3; D2 until Phase 2 | Phase 2 (D2); therefore the text codemod moves to Phase 2 (O5) |
| Severity scale | R2-V1 notes that a 4th orange token contradicts `CriticalityClassPill`'s 3-token collapse | D1: severity is 4-step; `CriticalityClassPill` keeps 3 steps on the same tokens, documented in the ADR-015 addendum |
| R1 tooling caveats | R1 reported `node_modules` absent | Superseded: R2 installed dependencies and ran every gate (§9.1) |
| GAP-C-09 / PG-40 / I18N-05 | Merge map lists them as "linked sub-items" of PG-03 | Kept as separate entries marked "Linked", because they are different root issues and GAP-C-09 awaits a PO decision |

### 11.5 Merge decisions taken at assembly

The R3 merge map (§12.1) was applied as written. These additional decisions were needed to place every remainder:

- R3-01 → PG-43; R3-02 → PG-07 (via GAP-C-01); R3-03 → DS-03; R3-04 → DS-07.
- SM-13 → PG-35 (R2-V1 flagged PG-35 "same as SM-13"; both are language/error-key resolution).
- PG-12 header-structure remainder (missing back links and icon tiles) → DS-15.
- PG-15 remainder (raw search, bespoke pager, `X` glyph) → DS-16.
- PG-21 remainder (raw action names, 100-item cap) → GAP-C-11 (raw names also in GAP-D-02).
- GAP-B-22 remainder (linked entities as plain text) → I18N-01.
- GAP-B-26 remainder (compare toggle, duplicate title, non-wrapping rows) → AX-04.
- SM-06 restore-vocabulary remainder → DS-13 (with PG-28 for the button).
- I18N-02 and the "gate misses" notes → AX-00 (static-gate primary of M3).

### 11.6 Round 5 evidence check

Method: every `GAP-D-*` entry (single R3 pass) was re-opened against the code at `ba42b38` (working tree clean under `frontend/`), with imports, props and conditions traced; then a sample of 59 other register entries, including all 8 🔴, was checked citation by citation (path exists, line in range, quote verbatim at or within ±3 lines of the cited line), first by a scripted pass and then by reading each flagged site.

**GAP-D verdicts (27 entries: 27 confirmed, 0 false flags, 0 severity changes)**

| ID | Verdict | Change |
|---|---|---|
| GAP-D-01 | Confirmed | none |
| GAP-D-02 | Confirmed | note: `CategoryBreakdownCharts` regex is only a `t()` fallback; grep gate must also match `replaceAll` |
| GAP-D-03 | Confirmed w/ corrections | added `KRIDetailOverviewTab.tsx:59,224` |
| GAP-D-04 | Confirmed | none |
| GAP-D-05 | Confirmed w/ corrections | `.btn-secondary` undefined in every CSS/JS file; impact softened to "no button affordance" |
| GAP-D-06 | Confirmed w/ corrections | fix line: `getRoleLabel` is a local closure, not a shared helper |
| GAP-D-07 | Confirmed | none |
| GAP-D-08 | Confirmed w/ corrections | buttons at `:88,103` (`:100,111` are labels); cancel path verified unguarded |
| GAP-D-09 | Confirmed w/ corrections | composite quote replaced by verbatim `:67` |
| GAP-D-10 | Confirmed w/ corrections | composite quote replaced by per-line verbatim quotes |
| GAP-D-11 | Confirmed w/ corrections | Recharts 3.10.1 enables `accessibilityLayer` by default; 8 Recharts importers, not 7 |
| GAP-D-12 | Confirmed w/ corrections | `dashboard:risk_levels.*` already exists (en/cs); chip `:97` added |
| GAP-D-13 | Confirmed w/ corrections | Department picker has no check icon (colour only) |
| GAP-D-14 | Confirmed | none |
| GAP-D-15 | Confirmed w/ corrections | other `text-slate-700` uses are 7 icons + 1 decorative separator |
| GAP-D-16 | Confirmed w/ corrections | edit mode has no production caller; live defect is the read-only display; stays 🟡 |
| GAP-D-17 | Confirmed | none |
| GAP-D-18 | Confirmed | note: operations already open a reason form |
| GAP-D-19 | Confirmed w/ corrections | 3 of 7 titles (adds `RiskLinkedVendorsSection.tsx:28`), not 2 of 5 |
| GAP-D-20 | Confirmed w/ corrections | 6 callers (3 override, 3 never use the states), not "all 4" |
| GAP-D-21 | Confirmed | dead: no importer in `src` or `tests` |
| GAP-D-22 | Confirmed | none |
| GAP-D-23 | Confirmed | none |
| GAP-D-24 | Confirmed | none |
| GAP-D-25 | Confirmed | live in `ApprovalList` and `ApprovalResolutionDialog` |
| GAP-D-26 | Confirmed | none |
| GAP-D-27 | Confirmed w/ corrections | `DepartmentStatsGrid.tsx:137` quote made verbatim |

**Sampled entries (59):** 🔴 DS-01, DS-02, DS-03, DS-04, PG-02, AX-01, AX-02, GAP-B-01; 6.1 NEW-V1-02, DS-05, DS-18, DS-19, DS-22, DS-21, DS-33; 6.2 DS-14, DS-25, DS-27, DS-30; 6.3 DS-07, DS-08, DS-09, DS-12, DS-13, PG-07, PG-22, GAP-B-07, PG-28, DS-29; 6.4 DS-15, NAV-01, AX-06, SM-05; 6.5 GAP-C-11, FB-01, SM-15; 6.6 PG-01, DS-06; 6.7 AX-05, AX-09, DS-26, GAP-B-16, AX-10, PG-46; 6.8 I18N-01, PG-03, GAP-B-14, PG-37, PG-40, I18N-07, GAP-B-24; 6.9 RS-01, RS-02; 6.10 SM-11, PG-41, SM-10, DS-24, SM-09, PG-25.

**Result:** 51 of 59 fully accurate; 8 had a citation defect (no claim, count or severity was wrong). All 8 🔴 entries: findings reproduce; DS-02 and DS-03 needed line fixes.

**Corrections made in place (sample)**

- DS-02: `ProcessVendorLinksSection.tsx:187` → `:188`; `QuestionAnswerField.tsx` entry controls are `:157,179,192` (`:64` is a read-only display).
- DS-03: `SessionsPanel.tsx:125` → `:124` (Also and Evidence).
- NEW-V1-02: bare `:60-75` attributed to `tests/frontend/e2e/theme-contrast-matrix.spec.ts`.
- DS-07: `DepartmentsPanel.tsx:115` → `:116`; `bg-nested` islands are `LinkConfirmationPanel.tsx:56,71`, not `LinkManagementDialog.tsx:56`.
- PG-07: `select_all` payload is in `riskQuestionnairePanelState.ts:154-157`.
- PG-22: `useDirtyTaskGuard` `:16,129` are in `ControlFormContainer.tsx`, not `ControlCreateDialog.tsx`.
- DS-26: `VendorSubOutsourcingSection.tsx:316` → `:314` (also `:422`, `:445`).
- RS-02: `SsoOnlyView.tsx:79` → `:78`.

**Totals:** no entry removed or re-graded, so §2.2 is unchanged and re-derived from the register headings and 🟢 tables: **124 entries, 8 🔴 / 67 🟡 / 49 🟢** (per-domain rows match). The §5 roadmap, §7 rollups and §8 matrices need no change.

### 11.7 Editorial QA (2026-10-01)

A 60-row editorial and consistency QA was applied together with the design lead's rulings of 2026-10-01 (D6 amended for `Badge size="sm"`; G-ESLINT starts with `src/pages/native/**` only; the Phase 0 exit matches D2; keys, helpers, tokens and classes that do not exist at `ba42b38` are marked NEW; every register entry is placed in the §5 phase its **Phase:** field names). Result: all 60 rows applied, 0 declined. Eleven were adapted to the rulings or to re-verified facts (Q2, Q3, Q7, Q9, Q11, Q15, Q31, Q32, Q36, Q40, Q57); Q50 took the `/40` option rather than an unmeasured ΔE note; Q11's Phase "—" became "3 (re-check at each module exit)" so RS-04 stays on the roadmap. The same rule marked five further proposed keys NEW (AX-01, AX-10, AX-14, GAP-D-23, GAP-B-24), and §4 now opens with an existing-vs-NEW token list. Severities, the 124-entry count and §2.2 are unchanged.

---

## 12. Appendix

### 12.1 Merge map (R3)

| # | Root issue | Primary | Merged |
|---|---|---|---|
| M1 | Hard-coded `text-white` / `text-slate-*` in light | DS-01 | SM-01, GAP-B-17, GAP-B-25 (headings), GAP-B-02 (panel text), PG-12 (h2s), PG-06 (`hover:text-white`), GAP-B-21 (`ISSUE_SECTION_TITLE`); ≈DS-03 |
| M1b | Hand-rolled inputs with white text | DS-02 | GAP-B-25 (`QuestionAnswerField`), GAP-B-26 (textarea colour), GAP-B-21 (`ISSUE_FIELD`), GAP-C-05 (input colour) |
| M2 | Hard-coded dark dialogs and reverse leak | DS-07 | NEW-V1-01, GAP-B-12, GAP-B-02 (modal), GAP-B-15 (forced-dark selects), GAP-C-17 (surface); ≈DS-08, PG-22 |
| M3 | Gates blind to confirmed defects | NEW-V1-02 (e2e) + AX-00 (lint) | V3 §1 takeaway, GAP-B-20 (gate miss), PG-10 (lint note), I18N-02 |
| M4 | Controls without labels; `Field` bypassed | AX-04 | PG-10, GAP-B-20, GAP-B-06, GAP-C-05, GAP-C-16 (label), GAP-C-07, GAP-B-26 (label), GAP-B-15 (search), AX-11 |
| M5 | `SystemSettingsPanel` rewrite | DS-04 | NEW-V1-04, GAP-B-10, PG-38, I18N-03 (`SystemSettingsPanel` part) |
| M6 | Icon-only buttons with no or weak name | AX-01 | PG-33, GAP-C-04; PG-46 separate |
| M7 | Load failure renders as empty | GAP-C-11 | GAP-B-04, GAP-C-03, GAP-C-21, PG-21 (error part) |
| M8 | Messages not announced | AX-05 | GAP-C-02, GAP-C-12 (role), GAP-B-11 (`RiskHubFieldError`), GAP-B-22 (banner) |
| M9 | No unified feedback | FB-01 | PG-09, SM-12, GAP-C-14, GAP-C-12 (raw message), GAP-B-10 (2s "saved") |
| M10 | Destructive actions and verbs | PG-07 | SM-04, GAP-C-01, GAP-C-06, GAP-B-05, GAP-B-13 |
| M11 | Heading hierarchy and page titles | DS-15 | PG-17, AX-03, GAP-C-19, GAP-B-21 (h3/h4), PG-06 (title), SM-02 (header) |
| M12 | Badge/pill fragmentation | DS-13 | PG-27, GAP-B-08, SM-06 (badge); ≈DS-06 |
| M13 | Raw enums / untranslated values | PG-03 | GAP-B-23, GAP-B-09, PG-19, GAP-B-15 (frequency), PG-20 (status); linked: GAP-C-09, PG-40, I18N-05 |
| M14 | Hard-coded English literals | I18N-01 | PG-04, PG-44, GAP-B-22 (defaultValue) |
| M14b | Concatenation and plurals | GAP-B-14 | GAP-C-13, GAP-B-05 (colon), GAP-B-22 (colon), PG-12 (concat), PG-23 |
| M15 | Locale-unaware formatting | I18N-03 | PG-18, PG-38 (also M5) |
| M16 | Tabs | DS-12 | PG-16, AX-07 |
| M17 | Focus indicators | DS-26 | AX-08, GAP-C-07 (`outline-none`) |
| M18 | Pre-auth / public surfaces | DS-24 | NEW-V1-03, GAP-C-22, AX-15, NAV-07; RS-02 and GAP-B-01 separate |
| M19 | Low primitive adoption | DS-10 | SM-03, GAP-C-10, GAP-C-16 (dialect), GAP-C-17 (Field/Button), GAP-C-18, GAP-B-21 (buttons), PG-24, PG-11 |
| M20 | CTA and destructive-button looks | DS-09 | GAP-B-11 (button), PG-22 (footers) |
| M21 | States re-implemented | DS-17 | PG-13, PG-14, SM-07, SM-08, AX-12, PG-45, GAP-B-26 (loading) |
| M22 | Vendor parallel design system | SM-09 | GAP-C-20; ≈DS-05 |
| M23 | Page container padding | DS-16 | PG-15 (`p-8`), PG-06 (`p-8`), SM-14 |
| M24 | Cross-surface risk-band palettes | PG-01 | PG-26, PG-39, DS-23 (committee), GAP-B-18; ≈DS-05; PG-02 separate |
| M25 | Dead components cited as live | PG-43 | DS-14 (MiniHeatmap), I18N-01 (`CategoryDrillDown`), DS-01/DS-22 dead citations |
| M26 | Document title and route announcement | NAV-01 | I18N-04 |

Unmerged by design: PG-02, AX-02, AX-06, AX-09, AX-10, AX-14, RS-01, RS-02, RS-03, NAV-02..06, GAP-B-01, GAP-B-03, GAP-B-07, GAP-B-16, GAP-B-19, GAP-B-24, GAP-C-08, GAP-C-15, DS-18..21, DS-25, DS-27..33, PG-05, PG-08, PG-25, PG-28..32, PG-34..37, PG-41, PG-42, DS-11, DS-22, FB-02, I18N-06, I18N-07, RS-04, SM-05, SM-10, SM-11, SM-15. Assembly additions are listed in §11.5.

### 12.2 Reproduce commands

Run from the repository root; `EX` excludes tests.

```bash
cd frontend/src
EX='--exclude-dir=__tests__ --exclude=*.test.tsx --exclude=*.test.ts'

# Raw palette classes (DS-03, DS-06): expect 2,048
P='(bg|text|border|ring|from|to|via|fill|stroke|divide|outline|shadow|placeholder|decoration|accent|caret)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}'
grep -rhoE $EX --include=*.tsx --include=*.ts "$P" . | wc -l

# text-white lines incl. hover:/group-hover: (DS-01): expect 403
grep -rnE $EX --include=*.tsx --include=*.ts '(^|[ "`:])(hover:|group-hover:)?text-white($|[^/[:alnum:]_-])' . | wc -l
# text-white on a same-line solid fill (must NOT become text-foreground)
grep -rnE --include=*.tsx 'text-white' . | grep -E 'bg-(accent|primary|destructive|success|info|warning|(rose|red|emerald|green|blue|sky|amber|orange|purple|indigo)-[5-9]00)\b|from-'

# Slate text and bright status text (DS-03): expect 474 / 448 / 377
grep -rhoE $EX --include=*.tsx --include=*.ts 'text-slate-(200|300|400)\b' . | wc -l
grep -rhoE $EX --include=*.tsx --include=*.ts 'text-slate-(500|600|700)\b' . | wc -l
grep -rhoE $EX --include=*.tsx --include=*.ts 'text-(rose|red|emerald|green|amber|yellow|orange|sky|blue|cyan|purple|violet|indigo|teal)-(200|300|400)\b' . | wc -l

# Hand-rolled white-text controls (DS-02): 63 matches, 60 real controls
grep -rnE --include=*.tsx --exclude-dir=__tests__ -A10 '<(input|textarea)\b' . | grep -E 'className=.*text-white\b' | wc -l

# White-alpha utilities (DS-22)
grep -rhoE $EX --include=*.tsx --include=*.ts '\b(bg|text|border|ring|divide|from|to|via|fill|stroke)-(white|black)(/[0-9]+)?\b' . | sort | uniq -c | sort -rn

# Micro font sizes (DS-14) and eyebrows
grep -rhoE $EX --include=*.tsx --include=*.ts 'text-\[[0-9.]+(px|rem|em)\]' . | sort | uniq -c
grep -rnE --include=*.tsx --exclude-dir=__tests__ 'uppercase' . | grep -E 'tracking-(wide|wider|widest)' | wc -l

# Inline pills (DS-13): 173 lines
grep -rnE --include=*.tsx --include=*.ts --exclude-dir=__tests__ 'px-(1\.5|2|2\.5) py-(0\.5|1)\b' . | grep -E 'text-(\[(8|9|10|11)px\]|xs)' | wc -l

# Primitive adoption (DS-10)
grep -rn --include=*.tsx '<button' . | grep -v __tests__ | grep -v '\.test\.tsx' | wc -l    # 394
grep -rn --include=*.tsx '<Button' . | grep -v __tests__ | grep -v '\.test\.tsx' | wc -l    # 107

# Dialogs (DS-07, DS-08)
grep -rhoE --include=*.tsx --exclude-dir=__tests__ 'backdropClassName="[^"]*"' . | sort | uniq -c
grep -rnE --include=*.tsx 'contentClassName="[^"]*bg-slate-9' .

# Hard-coded thresholds and rival band maps (PG-01, PG-02)
grep -rnE --include=*.ts --include=*.tsx '(level|score|gross_score|net_score)\s*>=\s*[0-9]+' .
grep -rnE --include=*.ts --include=*.tsx '(critical|high|medium|low)\s*:\s*.(bg|text|border)-' .

# Non-locale-aware formatting and language resolution (I18N-03, PG-35)
grep -rnE --include=*.ts --include=*.tsx 'new Intl\.(DateTimeFormat|NumberFormat)|toLocale(String|DateString|TimeString)\(' . | grep -v '^\./i18n/'
grep -rnE --include=*.tsx 'i18n\.language( as|\.startsWith)' .

# Outline without a ring (DS-26): 110 / 57
grep -rn 'outline-none' --include=*.tsx . | wc -l
grep -rn 'outline-none' --include=*.tsx . | grep -v ring | wc -l

# Orphan labels (AX-04): ESLint selector in report mode
cd .. && npx eslint src --rule '{"no-restricted-syntax":["warn",{"selector":"JSXElement[openingElement.name.name=\"label\"]:not(:has(JSXAttribute[name.name=\"htmlFor\"])):not(:has(JSXOpeningElement[name.name=/^(input|select|textarea|Input|ThemedSelect)$/]))","message":"orphan label"}]}' -f unix

# Root cause of the light-theme regression
git show c47d94d -- frontend/src/index.css | grep '^-'
```

Gate commands are in §9.1.

### 12.3 Rendered-contrast method (to recreate; scripts were not committed)

The R2-V3 scripts, logs, JSON results and 114 screenshots lived in session scratch artifacts (not committed). To reproduce the §2.3 and §9.2 numbers:

1. `cd frontend && npm ci`, then start Vite (R2-V3 used port 5199) and a Chromium that matches Playwright (R2-V3 set `executablePath` explicitly because the installed revision differed).
2. Set the theme through `localStorage['riskhub-theme']` (`light`, `riskhub`, `dark`) before navigation, and assert that `ThemeProvider` put the matching `theme-*` class on `<html>`.
3. Surfaces: `frontend/workflow-contrast.html` (all families); `frontend/dialog-contract.html` (13 owner sites, measured before and after opening each dialog, with the API mocked by a copy of `installApiContract` from `tests/frontend/e2e/dialog-render-sites.spec.ts`); the app routes `/risks`, `/settings`, `/risk-hub`, `/controls/new`, `/risks/new`, `/issues/new`, `/dashboard`, `/users/new` after a demo-persona login, with auth mocked as in `tests/frontend/e2e/kri-history-pagination.spec.ts`. Viewport 1440×900.
4. In-page auditor: for every visible element with its own non-empty text node, plus every `input` and `textarea` (using the value), read the computed `color`; walk up the ancestors compositing each `background-color` with its alpha over the next opaque ancestor (the algorithm of `tests/frontend/e2e/helpers/renderedContrast.ts`); compute the WCAG 2.x ratio; classify against 4.5:1 (3:1 for large text: ≥ 24px, or ≥ 18.66px bold), 3:1 and 1.5:1; flag `text-white` on a light composite. Skip gradient backgrounds, which cannot be composited.
5. Utility probe: inject elements with `divide-white/5`, `divide-white/10`, `border-white/5|10|15`, `bg-white/[0.02]`, `bg-white/[0.03]`, `bg-slate-900` into a light page and read their computed colours (§6.1 DS-22).
6. SSO probe: render `/login` with `auth_mode: microsoft_sso` at 1024×600, 1280×600, 1280×800 and 1440×900; record content bottom vs viewport, `scrollHeight`, the `h1` top, `elementFromPoint` at the language buttons, and whether clicking CS sets `lang="cs"` (RS-02, AX-09).
7. Store per-surface, per-theme counts as JSON.

**Recommendation (D15):** commit this as `tests/frontend/e2e/helpers/renderedContrastAudit.ts` plus `tests/frontend/e2e/theme-rendered-contrast.spec.ts`, run it in the `ci` Playwright project over all three themes, fail on measured contrast (not only on axe `violations`), and compare against a committed `rendered-contrast-baseline.json` (light 208 / riskhub 99 / dark 92 elements below 4.5:1) that may only go down until it becomes a hard zero at Phase 3 exit (§4.1 G-RENDER, §5.2 item 0.3).
