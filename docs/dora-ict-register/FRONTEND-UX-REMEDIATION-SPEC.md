# ICT Register — frontend design/UX remediation specification

_Status: **Approved** — fidelity pass clean; **O1 resolved 2026-07-12** (Step 1 `/to-spec`
complete). Formalizes the locked plan into an implementation- and ticket-ready specification.
**No application code is enacted by this document.** Ticket generation (`/to-tickets`) proceeds
against this committed spec. Nothing here re-opens a decision: it transcribes and structures the
15 locked decisions and their ADRs into normative requirements._

_Baseline: `dora` @ `db0826e0` (audit) / plan committed at `99e4ed0e`. Author date: 2026-07-12._

## Traceability — authoritative sources

This spec is derived **only** from the following, and does not introduce new decisions:

| Source | Role |
|--------|------|
| [FRONTEND-UX-REMEDIATION-CAPTURE.md](./FRONTEND-UX-REMEDIATION-CAPTURE.md) | 15 locked decisions + 5-phase plan with per-phase acceptance + rollback (the spec base) |
| [FRONTEND-UX-AUDIT-2026-07-11.md](./FRONTEND-UX-AUDIT-2026-07-11.md) | Findings ledger (C1–C6, S1–S13, P1–P12) with `file:line`, target phase, acceptance, dispositions |
| [ADR-013](../adr/ADR-013-frontend-accessibility-standard.md) | WCAG 2.2 AA **target** + machine-checkable CI gate (jsx-a11y + stateful axe) |
| [ADR-014](../adr/ADR-014-desktop-first-support.md) | Desktop-only; SC 1.4.4 / 1.4.10 documented accepted exceptions |
| [ADR-015](../adr/ADR-015-frontend-design-system-foundation.md) | Semantic status tokens + minimal accessible primitives |
| [UX-REMEDIATION-VERIFICATION-2026-07-11.md](./UX-REMEDIATION-VERIFICATION-2026-07-11.md) | Why the plan is shaped this way (2 review rounds verified vs source + W3C) |
| [CONTEXT.md](../../CONTEXT.md) | Glossary — **ICT Committee** vs **Risk Committee** |

Normative language: **MUST** / **MUST NOT** / **SHOULD** / **MAY** are used in the RFC 2119 sense.
Each requirement carries an ID (`FR-<phase>-<n>`) so tickets can reference it 1:1.

---

## 1. Purpose & scope

### 1.1 Objective (locked)

**Fix everything the audit found — criticals, shared/main-worktree defects, and polish — before
`dora` merges**, subject to the ledger dispositions (some findings are *accepted limitations*,
not "fixed"). This deliberately pulls app-wide work (design tokens, accessible primitives,
keyboard tables, IA restructure) into the pre-merge scope. Every ledger finding MUST reach an
explicit disposition — `resolved`, `accepted limitation`, or `deferred` (with rationale).

### 1.2 In scope

- All C1–C6, S1–S13, P1–P12 findings in the audit ledger, at their assigned phases.
- App-wide (`SHARED→main`) defects surfaced by the audit — remediated **on `dora`**, not split to a
  main-first branch (decision 15).
- The three ADR foundations: WCAG 2.2 AA target + CI gate (ADR-013), desktop-only policy
  (ADR-014), semantic tokens + accessible primitives (ADR-015).

### 1.3 Out of scope (MUST NOT be pulled in)

- **Application code, this round.** This is Step 1 (`/to-spec`): specification only.
- **A responsive / reflowing shell** (drawer nav, stacked forms, reflowed tables). Desktop-only
  stands (ADR-014); the reflow shell is the deferred path to closing 1.4.4 / 1.4.10.
- **A full shadcn/ui migration.** Only a minimal, bespoke-aesthetic primitive set is built
  (ADR-015).
- **A `danger` token / renaming `--destructive`.** Reuse `--destructive` as canonical danger.
- **Chart tokens.** Dead `--chart-1..5` are **removed**, not redefined (no `chart-*` utility or
  `var(--chart-*)` usage in source; Recharts uses inline colours).
- **The 5 pre-existing orphan docs** (`docs/agents/*`, `docs/security/reports/prod-readiness-*`).
  These predate this effort and are not this spec's concern.

### 1.4 What this spec is NOT

Not a WCAG conformance statement. AA is a **target** (see §2.1). Not a re-grill: the 15 decisions
are settled. Not the ticket set: that is Step 2 (`/to-tickets`), gated on approval of this spec.

---

## 2. Normative constraints (locked — carried verbatim)

These are the non-negotiable contracts. Every phase inherits them; a phase checkpoint MUST NOT
be declared green if any is violated.

### 2.1 Accessibility standard & conformance framing (ADR-013, ADR-014, decisions 2 & 7)

- **N1.** The frontend targets **WCAG 2.2 Level AA** as a **target, not a present-tense
  conformance claim.** The project upgrades its target from 2.1 to 2.2 (both are active W3C
  standards; 2.2 is backward-compatible — it does **not** "supersede" 2.1).
- **N2.** RiskHub **MUST NOT** assert full WCAG 2.2 AA conformance while desktop-only stands.
  Under ADR-014, **SC 1.4.4 Resize Text (AA)** and **SC 1.4.10 Reflow (AA)** are **known,
  documented, accepted exceptions** (finding **C6**). Because conformance is asserted per *full
  page* and cannot exclude an automatically-presented viewport variation
  (<https://www.w3.org/TR/WCAG22/#cc2>), a formal statement would require **both** implementation +
  manual/AT verification **and** the 1.4.4 / 1.4.10 exceptions to be **closed**.
- **N3.** Conformance is not machine-decidable: the CI gate enforces a **machine-checkable
  subset**, backed by a **per-phase manual / assistive-technology evaluation** (keyboard, focus
  order, screen reader, 200%/400% zoom + reflow). No machine-testable conformance percentage is
  claimed.

### 2.2 jsx-a11y author-time gate (ADR-013, decision 2)

- **N4.** Add `eslint-plugin-jsx-a11y` to the lint gate with rules kept as **`error`**.
- **N5.** Existing violations are held by a **committed fingerprinted baseline file** (keyed by
  **file + rule + location**) plus a **CI validator**: current findings MUST be a **subset** of
  the baseline (new findings fail) **and stale/unused baseline entries MUST also fail** so the
  baseline can only **shrink**.
- **N6.** A bare `--max-warnings` total is **insufficient and MUST NOT** be used as the mechanism
  — it only fails on total-count overflow, so a new violation can replace a fixed one and
  unrelated rules share the budget.

### 2.3 axe / Playwright stateful gate (ADR-013, decision 2)

- **N7.** **Extend** the existing `tests/frontend/e2e/accessibility-smoke.spec.ts` to the DORA
  surfaces (it covers none today).
- **N8.** **Pin explicit axe WCAG tags** (`wcag2a wcag2aa wcag21a wcag21aa wcag22aa`); **remove
  the `chromium`-only guard** so it runs on CI's primary project.
- **N9.** **Fail on every violation the WCAG tags select — NOT filtered by axe `impact`/severity**
  — against an explicit **rule/selector baseline that may only shrink.**
- **N10.** The sweep MUST be **stateful**: open each modal/overlay, trigger representative
  validation errors, open Radix selects, expand disclosure/chain rows, and scan each state — and
  assert **focus trapping + restoration** on Radix portals inside `DialogShell`. Route-level scans
  alone are insufficient.

### 2.4 Forms & field ARIA (ADR-015, decision 4)

- **N11.** **Keep native `required`** (for its implicit required-state semantics) **and add
  `noValidate`** on the form (suppresses the browser submission UI while retaining semantics).
- **N12.** Validation is driven in JS with **per-field inline errors** via a shared **`Field`
  wrapper** exposing `aria-required` + `aria-invalid` + `aria-describedby`; focus moves to the
  first invalid field; a `role="alert"` summary is present.
- **N13.** For `ThemedSelect`, propagate `aria-required` / `aria-invalid` and associate the
  visible label via **`aria-labelledby`**. Its fallback `aria-label` **MUST NOT override a real
  visible label** (today `aria-label={triggerAriaLabel ?? placeholder}` at `ThemedSelect.tsx:89`
  would). `ThemedSelect` ARIA is extended across **~95 call sites / 48 files** — an **active**
  migration requiring **three-theme component / visual-regression** coverage, not a dormant one.

### 2.5 Dialog / overlay inventory by interaction contract (ADR-015, decision 3, S7)

- **N14.** Overlays MUST be inventoried **by interaction contract**, each classified as exactly
  one of:
  - **dialog / alert-dialog** → migrate onto `DialogShell` (focus trap, Esc, focus restoration);
  - **loading overlay** → `aria-busy` / status, **no focus transfer** (e.g.
    `ControlDetailPage.tsx:292` `isLoadingRisk` is a **loading overlay, NOT a dialog**);
  - **popover / listbox / menu** → its own ARIA pattern, **not** `DialogShell`.
- **N15.** `DialogShell` is **extended** with `role?: "dialog" | "alertdialog"` (it hardcodes
  `role="dialog"` at `DialogShell.tsx:176` today), with **initial-focus behaviour tested per
  role**. Only **2** surfaces (`ConfirmDialog`, `ArchiveConfirmDialog`) are on `DialogShell`
  today. The **exhaustive render-site inventory is the first task of Phase 2c**; it is not
  pre-enumerated here.

### 2.6 Tables & error contract (decisions 8 & 9, C2/C3/C4)

- **N16.** `SortableTable` has **11 consumers / 19 sites**. The `SortableTable` change **and its
  consumer prop-migration MUST revert as ONE commit range** (callers pass new
  `isLoading`/`isError` props, so the component cannot be reverted alone without breaking
  type-checking).
- **N17.** A **reusable table error contract** — `isError` + **localized message** + **retry
  callback** + defined **stale-data** behaviour — MUST be **shared** by `SortableTable` and the
  DQ / Committee branches. A failed fetch MUST NOT render as "empty".
- **N18.** `SortableTable` sort headers become real `<button>`s inside `<th scope="col"
  aria-sort>`; the trailing chevron becomes a focusable `<Link aria-label="View …">` as the
  keyboard path; row `onClick` stays as a mouse convenience.

### 2.7 Semantic status tokens (ADR-015, decisions 5 & 6)

- **N19.** **Reuse** `--destructive` / `--destructive-foreground` as canonical **danger** — **no
  rename, no new `danger` token.** Add `--success`, `--warning`, `--info` (each with
  `-foreground`) as HSL CSS variables across **all three themes** (default / dark / light), wired
  into Tailwind.
- **N20.** Every background/foreground pair MUST pass a **WCAG AA contrast acceptance test**
  (≥ 4.5:1 text, ≥ 3:1 graphical/UI) **in each theme**. All rival status palettes migrate to these
  tokens, including the Committee Excel-pastel pills (re-tuned to read red/amber/green in dark
  theme). Workbook fidelity lives in **data + verbatim labels + the export**, not spreadsheet fill
  colours.

### 2.8 Export capability gating (decision, S2)

- **N21.** Readiness-screen export links MUST gate on the **separate `can_download_dora_register`
  capability** (from `vendor_report_capabilities`, requiring **`reports:read` + role**) — **NOT**
  `ict_committee:read` or `vendors:read`. Tests MUST cover **allowed + denied**.

### 2.9 IA / routing (decisions 10, 11, 12; S3/S4)

- **N22.** ICT Committee becomes a **URL-addressable Dashboard tab at `/?view=ict-committee`.**
  The dashboard is the **`/` index route — there is NO `/dashboard` route** (a `/dashboard` target
  would hit the `*`→`/` wildcard, drop the query string, and break `routingManifest.test.ts`).
- **N23.** `/ict-register/committee` **redirects** to `/?view=ict-committee`. The **DQ page stays
  routed** — its `?check=` deep-links are inbound and MUST survive. The old routed committee page
  is **retained until the redirect is verified**, so a revert restores it with no dead deep-links.
- **N24.** The two committee surfaces are disambiguated as **"Risk Committee"** and **"ICT
  Committee"** (adjacent Dashboard tabs); the Risk Committee tab also gains URL addressability.
  Glossary is updated accordingly.

### 2.10 Packaging (decision 15)

- **N25.** All work executes **on the `dora` branch**, in **ordered, independently-revertable
  phases**, each an ultrareview / `code-review` **checkpoint**. **No main-first split.** The full
  gate (tsc/build, lint, vitest, a11y) MUST be green at every phase boundary — in **baseline mode**
  where a gate would otherwise be red on the still-broken app.

---

## 3. Architectural basis

The 15 decisions map to the three ADRs and this spec's phases as follows:

| Decision | Summary | ADR | Constraints | Phase(s) |
|----------|---------|-----|-------------|----------|
| 1 | Fix all findings pre-merge, each with a disposition | — | §1.1 | all |
| 2 | WCAG 2.2 AA target + CI gate | 013 | N1–N10 | P1 (gate) / all (manual) |
| 3 | Minimal accessible primitives | 015 | N12, N14–N15 | P2a/2c |
| 4 | `required` + `noValidate` + per-field validation | 015 | N11–N13 | P2b |
| 5 | Semantic status tokens | 015 | N19–N20 | P1 (define) / P5 (migrate) |
| 6 | Committee pills → tokens | 015 | N20 | P5 |
| 7 | Desktop-only, advisory below `lg` | 014 | N2 | P5 (notice) / all (manual) |
| 8 | `isLoading` skeleton + reusable error contract | — | N16–N17 | P3 |
| 9 | Table keyboard access | — | N18 | P3 |
| 10 | Nav grouping (Overview/Registers/ICT Register/Administration) | — | N22–N24 | P4 |
| 11 | ICT Committee → Dashboard tab | — | N22–N23 | P4 |
| 12 | Committee naming disambiguation | — | N24 | P4 |
| 13 | Sub-outsourcing chain grouping | — | — | P4 |
| 14 | Link-removal `ConfirmDialog` | — | — | P4 |
| 15 | Packaging: all on `dora`, phased | — | N25 | all |

---

## 4. Requirements by phase

Phases are ordered, each a single tightly-scoped, independently-revertable commit range. The
**rollback point is the prior phase's green HEAD** (full gate green at every boundary).

### Phase 1 — Foundation (blocks all other phases)

**Objective.** Land the token layer + a11y gate + page metadata as an **additive** foundation so
later phases build on tokens and the gate catches regressions from day one.

| ID | Requirement | Source |
|----|-------------|--------|
| FR-P1-1 | Define `--success`/`-foreground`, `--warning`/`-foreground`, `--info`/`-foreground` HSL variables across all three themes; keep `--destructive` as canonical danger (no rename). | N19, S5 |
| FR-P1-2 | Wire the new tokens into Tailwind (`bg-success text-success-foreground`, …). | N19 |
| FR-P1-3 | Add contrast acceptance tests: every bg/fg pair ≥ 4.5:1 (text) / ≥ 3:1 (graphical) in each theme. | N20 |
| FR-P1-4 | Add `eslint-plugin-jsx-a11y` (rules `error`) + committed **fingerprinted baseline file** + **CI validator** (subset-fails-new, stale-fails-shrink). Not `--max-warnings`. | N4–N6 |
| FR-P1-5 | Extend `accessibility-smoke.spec.ts`: DORA surfaces, pinned WCAG tags, remove `chromium` guard, no severity filter, rule/selector baseline. (Stateful coverage lands with the surfaces in later phases.) | N7–N9 |
| FR-P1-6 | `index.html`: real `<title>` + favicon + meta description (replaces `<title>frontend</title>` + vite favicon). | P1 |
| FR-P1-7 | Fonts: move blocking `@import` → `preconnect` + `link`. | P2 |
| FR-P1-8 | Remove dead `--chart-1..5` tokens (referenced, undefined, unused). | P3, decision correction |

- **Acceptance.** Tokens defined + wired with **zero visual regression** + passing contrast tests;
  **both** a11y gates run in **baseline mode** — jsx-a11y as `error` with a committed fingerprinted
  baseline + CI validator (new findings fail; stale entries fail so it only shrinks — **not** a
  bare `--max-warnings` total, which lets a new violation replace a fixed one); axe as an explicit
  rule/selector baseline — so any **new** violation fails; both baselines only shrink;
  metadata/preconnect landed; dead chart tokens removed; full gate green.
- **Rollback.** Additive only (new tokens + CI job + baselines) — revert the phase range.
- **Resolves:** S5 (tokens), P1, P2, P3 (fully); establishes N4–N10, N19–N20 for later phases.

### Phase 2 — Primitives + forms + modals

Split into **three independently-revertable sub-phases.** **2a blocks 2b and 2c.**

#### Phase 2a — primitives + tokenized select

**Objective.** Build the accessible primitive set and put `select` on tokens.

| ID | Requirement | Source |
|----|-------------|--------|
| FR-P2a-1 | Build shared `Field` wrapper owning the control `id`, wiring `<label>` (`htmlFor`/`aria-labelledby`), `aria-describedby` (help + error), `aria-invalid`, `aria-required`. | N12, ADR-015 |
| FR-P2a-2 | Build `Label` / `Input` primitives styled to the current glass/dark aesthetic. | ADR-015 |
| FR-P2a-3 | Migrate `select.tsx` to consume tokens; fix `focus:` → `focus-visible:`, `ring-accent` → `ring-ring`. | N19, S6 |
| FR-P2a-4 | Extend `ThemedSelect` to accept `id`/`aria-labelledby`/`aria-describedby`/`aria-invalid`/`aria-required`; prefer associated visible label over fallback `aria-label` (no override of a real label). | N13, C1 |

- **Acceptance.** Unit + **stateful axe** tests on the primitives; because tokenizing `select.tsx`
  changes focus + theme styling across **~95 `ThemedSelect` call sites (48 files)**, add
  **three-theme component / visual-regression coverage** — this is an **active** migration.
- **Rollback.** The `select.tsx`/`ThemedSelect` change reverts as **one range** (adopted
  immediately by all sites); the new `Field`/`Label`/`Input` primitives are **dormant** until 2b
  adopts them.
- **Resolves:** C1 (structural name fix), S6; enables 2b/2c.

#### Phase 2b — forms (needs 2a)

**Objective.** Adopt the `Field` primitive across the DORA sub-forms with the locked validation
model.

| ID | Requirement | Source |
|----|-------------|--------|
| FR-P2b-1 | Migrate Asset / Process / Threat / Vendor sub-forms to `Field` with `required` + `noValidate` + per-field validation. | N11–N12, C5 |
| FR-P2b-2 | Every label associated; distinct accessible names; `aria-required`/`aria-invalid` exposed; focus-first-invalid; `role="alert"` summary. | N12, C1/C5/S11 |
| FR-P2b-3 | Read `.isError` on in-form fetches (e.g. `AssetForm.tsx:116`) so a dropped request is not an empty dropdown. | C4 (forms portion) |
| FR-P2b-4 | `ThreatForm` regains submit feedback; split the two collapsed required-field messages into per-field errors. | S11 |
| FR-P2b-5 | Remove the corresponding jsx-a11y baseline entries (label/control rules) — rules are already `error` from P1, so the baseline shrinks. | N5 |

- **Acceptance.** Every label associated, distinct accessible names, `aria-required`/`aria-invalid`
  exposed, focus-first-invalid, submit success/failure e2e; the corresponding jsx-a11y baseline
  entries removed.
- **Rollback.** One commit per form.
- **Resolves:** C5, S11, C1 (forms), C4 (forms portion), P7 (search-input name, forms portion).

#### Phase 2c — dialog migration (needs 2a)

**Objective.** Standardize true dialogs on `DialogShell`; leave non-dialogs alone.

| ID | Requirement | Source |
|----|-------------|--------|
| FR-P2c-1 | **First task:** produce the **exhaustive overlay render-site inventory, classified by interaction contract** (dialog/alert-dialog vs loading overlay vs popover/menu). | N14, S7 |
| FR-P2c-2 | Extend `DialogShell` with `role?: "dialog" \| "alertdialog"`; test initial-focus behaviour per role. | N15, ADR-015 |
| FR-P2c-3 | Migrate **only** dialog/alert-dialog surfaces onto `DialogShell` (focus trap + Esc + focus restoration). Candidates include `RiskHubModalFrame` + consumers, inline delete dialogs (`DepartmentsPanel.tsx:313`, `RiskTypesPanel.tsx:310`), `RiskQuestionnaireDetailContainer.tsx:58`, `ADUserPicker.tsx:13`, and the named `*Modal`/`*Dialog` files — the exact set is FR-P2c-1's output. | N14–N15, S7 |
| FR-P2c-4 | Loading overlays (e.g. `ControlDetailPage.tsx:292`) use `aria-busy`/status with **no focus transfer**; popovers/menus keep their own ARIA — **neither** migrates to `DialogShell`. | N14 |

- **Acceptance.** `DialogShell` extended with `role?: "dialog"|"alertdialog"` (initial-focus tested
  per role — it hardcodes `role="dialog"` at `DialogShell.tsx:176` today); every dialog surface has
  focus trap + Esc + focus restoration (**stateful axe/e2e matrix**); the dialog/focus-trap
  baseline reaches **0**.
- **Rollback.** One commit per surface or cluster.
- **Resolves:** S7.

### Phase 3 — Tables + loading/error states (needs P1)

**Objective.** Centralize loading/error/keyboard behaviour in `SortableTable` and give the two
non-`SortableTable` screens (DQ, Committee) the same contract.

| ID | Requirement | Source |
|----|-------------|--------|
| FR-P3-1 | `SortableTable` keyboard access: `<button>` in `<th scope="col" aria-sort>`; focusable row `<Link aria-label="View …">`; row `onClick` retained as mouse convenience. | N18, C2 |
| FR-P3-2 | `SortableTable` column-aware `isLoading` skeleton (no false empty/zero flash). | C3, decision 8 |
| FR-P3-3 | `SortableTable` `isError` branch using the **reusable table error contract** (localized message + retry callback + stale-data behaviour). | N17, C4 |
| FR-P3-4 | Explicit top-level `aria-busy` **loading** and **error** branches for **DQ** and **Committee** screens (neither consumes `SortableTable`), using the **same** contract. | N17, C3/C4, decision 8 |

- **Acceptance.** **All 11 `SortableTable` consumers / 19 sites** exercised — AssetsPage,
  ProcessesPage, ThreatsPage, ControlsTableSection, DepartmentTabContent, IssuesTableSection,
  KRIsTableSection, RisksTableSection, VendorsTableSection, VendorContractsSection,
  VendorSubOutsourcingSection — with `SortableTable` component tests + representative regression
  coverage across existing consumers; DQ + Committee loading/error branches proven by e2e; axe +
  keyboard-nav green.
- **Rollback.** The reusable error contract (N17, FR-P3-3/FR-P3-4) lands **first** as a small
  **additive shared module** — its own **prerequisite**, dormant until consumed — so the two
  consuming changes are genuinely independent: **two** independently-revertable commit **ranges** —
  (i) the `SortableTable` change **together with its consumer prop-migration** (callers pass new
  `isLoading`/`isError`, so the component cannot be reverted alone without breaking type-checking,
  per N16), and (ii) the DQ/Committee branch change — **not** one centralized commit. Because both
  ranges consume the shared module, the two consuming tickets must **not** be dispatched
  concurrently with the `VendorSubOutsourcingSection`/committee-surface P4 work (see §7 dispatch-safety).
- **Resolves:** C2, C3, C4 (table portion).

### Phase 4 — IA restructure (needs P1; highest routing risk)

**Objective.** Group the nav, move ICT Committee to a URL-addressable Dashboard tab, and land the
IA-adjacent finding fixes.

| ID | Requirement | Source |
|----|-------------|--------|
| FR-P4-1 | Add a `group` field to the nav model; assign every sidebar item to one of the four sections per the resolved **Phase 4 sidebar section map** (below). | decision 10, S4, O1 |
| FR-P4-2 | Fix sidebar active state: replace exact `pathname === item.href` so `:id`/edit routes highlight the active item. | S3 |
| FR-P4-3 | Refactor `IctRegisterCommitteePage` body into an `IctCommitteeSection`; render as a **URL-addressable Dashboard tab at `/?view=ict-committee`**, sibling to the Risk Committee tab (which gains addressability); remove the sidebar item; gate on `authz.can('read','ict_committee')`. | N22, N24, decision 11 |
| FR-P4-4 | Redirect `/ict-register/committee` → `/?view=ict-committee`; **retain the old routed page until the redirect is verified**. DQ **stays routed** (`?check=` deep-links survive). Bare `/ict-register` redirects to the DQ page. | N23, S4 |
| FR-P4-5 | Disambiguate committee names to **"Risk Committee"** / **"ICT Committee"**; update glossary; localize the committee label left in English (`cs/navigation.json:13`). | N24, S4, P12 |
| FR-P4-6 | Archived-row demotion (dim + separate) per the existing `VendorLinkedEntitiesTab` convention. | S9 (demote), decision folded |
| FR-P4-7 | Sub-outsourcing chain: group rows under a per-contract header with **expand/collapse** chain nodes (keep indent + rank badge). | decision 13, S13 |
| FR-P4-8 | Link removal reuses the existing **`ConfirmDialog`** (no new toast infra) so a mis-click is recoverable. | decision 14, P6 |
| FR-P4-9 | Preserve every sidebar item's existing visibility/capability checks and its current relative ordering within each group. | O1 |
| FR-P4-10 | Render a group heading only when the current user has ≥ 1 visible item in that group (omit empty groups). | O1 |
| FR-P4-11 | Use stable group keys `overview` / `registers` / `ict_register` / `administration`, with localized labels in English **and** Czech. | O1 |
| FR-P4-12 | Add routing-manifest tests for grouping, intra-group ordering, conditional empty-group omission, and the platform-admin view. | O1 |

**Phase 4 sidebar section map (O1 — resolved 2026-07-12).** Every sidebar item is assigned to one
of four groups (stable key → EN label). ICT Committee has **no** sidebar entry — it becomes the
Dashboard tab (FR-P4-3/4). Preserve each item's existing visibility/capability checks and its
current relative order within the group.

- **`overview` → Overview:** Dashboard (`/`), Workflow (`/approvals`), Departments
  (`/departments`) — the organizational risk/control **exposure** view, *not* department
  administration.
- **`registers` → Registers:** Controls (`/controls`), Risks (`/risks`), Issues (`/issues`),
  Risk Appetite (`/kris`), Vendors (`/vendors`).
- **`ict_register` → ICT Register:** Processes (`/processes`), Assets (`/assets`), Threats
  (`/threats`), ICT Data Quality (`/ict-register/data-quality`).
- **`administration` → Administration:** Governance (`/governance`), Audit Trail
  (`/activity-log`), Settings (`/settings`), Access Management (`/users`), Risk Hub
  (`/risk-hub`), Admin Console (`/admin`), Documentation (`/admin/docs`).

A group heading renders **only** when the current user has ≥ 1 visible item in it (empty groups
omitted). Group labels are localized in **English and Czech**.

- **Acceptance.** Grouped sidebar renders the four-section map above, with **group headings
  omitted for groups with no visible items** and existing visibility/capability checks +
  intra-group ordering preserved; **(a)** authorized deep-link `/?view=ict-committee` + legacy
  redirect resolve; **(b)** unauthorized or invalid `view` normalizes to overview **without**
  fetching committee data; **(c)** browser back/forward updates the selected tab; **(d)** ICT
  loading/error is **independent** of the overview request (today `DashboardPage.tsx:69` returns
  early on overview loading/error); DQ `?check=` deep-links still resolve; routing-manifest tests
  cover **grouping, intra-group ordering, conditional empty-group omission, and the platform-admin
  view** and are green.
- **Rollback.** Keep redirect + tab in **one commit** and **retain the old routed page until the
  redirect is verified**, so reverting restores the standalone page with no dead deep-links.
- **Resolves:** S3, S4, S9 (demote), S13, P6, P12, decisions 10–14.

### Phase 5 — Polish (needs P1–P4)

**Objective.** Migrate the status palette, land the desktop-only advisory, and close every
remaining ledger finding to a disposition.

| ID | Requirement | Source |
|----|-------------|--------|
| FR-P5-1 | Migrate all rival status palettes to the semantic tokens, **including the committee Excel-pastel pills** (re-tuned to read red/amber/green in dark theme). | N20, S5, decision 6 |
| FR-P5-2 | Desktop-first advisory notice below `lg` (neutral copy: optimized for ≥ 1024px, **with a path to an accessible alternative**; **must not** tell users to reduce zoom); **no reflow shell**. SC 1.4.4 / 1.4.10 recorded as accepted exceptions. | N2, C6, ADR-014 |
| FR-P5-3 | Dense tables/heatmaps get horizontal-scroll containers at `≥ lg` (fix `overflow-hidden` clipping) — no narrow-viewport layout. | ADR-014 consequences |
| FR-P5-4 | Date formatting via `formatDateValue`; currency right-aligned + `tabular-nums`; truncated cells get `title` + hover cue. | S9 (format), P8, P9 |
| FR-P5-5 | Empty states distinguish "no data" vs "no search results"; DQ gets a positive **"0 findings" all-clear**; DQ shows **"N of M shown"** when scoped counts differ from global. | S10, S12 |
| FR-P5-6 | Committee blocking counts visually prioritized (not the same neutral `text-white` as inventory counts). | S1 |
| FR-P5-7 | Heatmaps get a legend; the RoI readiness bar gets a colour threshold. | P10 |
| FR-P5-8 | Readiness screens (Committee + DQ) link to the register export, **gated on `can_download_dora_register`** (test allowed + denied). | N21, S2 |
| FR-P5-9 | Residual `aria-label` sweep: icon-only actions, `Pagination` page buttons, `SearchableEntitySelect` search inputs. | S8, P5, P7 |
| FR-P5-10 | Remove the dead light-theme `!important` input rule that kills `.vendor-input` theming. | P4 |
| FR-P5-11 | Tokenize residual radius / z-index / motion durations. | P11 |

- **Acceptance.** **Every ledger finding reaches an explicit disposition** — `resolved`,
  `accepted limitation` (**C6**), or `deferred` (with rationale) — with **no un-triaged findings**;
  the axe baseline is **empty for the DORA routes** and the jsx-a11y baseline is **shrink-only with
  each residual entry carrying a 1:1 documented deviation** (not required to be empty); the manual pass shows
  applicable criteria passing and **C6's expected 1.4.4 / 1.4.10 failures reproduced and recorded**
  (not asserted green); keyboard / focus-order / screen-reader passes green.
- **Rollback.** Cosmetic/additive, grouped by finding ID — partial rollback of any single commit.
- **Resolves:** S1, S2, S5 (migrate), S8, S10, S12, C6 (accepted), P4, P5, P7 (polish), P8, P9,
  P10, P11; final disposition sweep for all findings.

---

## 5. Findings traceability matrix

Every audit finding → severity → target phase → resolving requirement(s) → disposition. Default
disposition is **resolved** at the target-phase checkpoint unless noted.

| ID | Sev | Phase | Requirement(s) | Disposition |
|----|-----|-------|----------------|-------------|
| C1 | 🔴 | 2a/2b | FR-P2a-4, FR-P2b-2 | resolved |
| C2 | 🔴 | 3 | FR-P3-1 | resolved |
| C3 | 🔴 | 3 | FR-P3-2, FR-P3-4 | resolved |
| C4 | 🔴 | 3 (2b for forms) | FR-P3-3, FR-P2b-3 | resolved |
| C5 | 🔴 | 2b | FR-P2b-1 | resolved |
| C6 | 🔴 | 5 † | FR-P5-2 | **accepted limitation** (SC 1.4.4/1.4.10; excluded from P5 "zero un-triaged" gate) |
| S1 | 🟡 | 5 | FR-P5-6 | resolved |
| S2 | 🟡 | 5 | FR-P5-8 | **re-scoped** (export exists; discoverability + capability gate) |
| S3 | 🟡 | 4 | FR-P4-2 | resolved |
| S4 | 🟡 | 4 | FR-P4-1, FR-P4-4, FR-P4-5, FR-P4-9…12 | resolved |
| S5 | 🟡 | 1 (tokens) / 5 (migrate) | FR-P1-1..3, FR-P5-1 | resolved |
| S6 | 🟡 | 2a | FR-P2a-3 | resolved |
| S7 | 🟡 | 2c | FR-P2c-1..4 | resolved — backed by the [dialog interaction inventory](./FRONTEND-DIALOG-INTERACTION-INVENTORY.md) (26 DialogShell surfaces); real-surface matrix 22/22 active, 0 skipped |
| S8 | 🟡 | 5 | FR-P5-9 | resolved |
| S9 | 🟡 | 4 (demote) / 5 (format) | FR-P4-6, FR-P5-4 | resolved |
| S10 | 🟡 | 5 | FR-P5-5 | resolved |
| S11 | 🟡 | 2b | FR-P2b-4 | resolved |
| S12 | 🟡 | 5 | FR-P5-5 | resolved |
| S13 | 🟡 | 4 | FR-P4-7 | resolved |
| P1 | 🟢 | 1 | FR-P1-6 | resolved |
| P2 | 🟢 | 1 | FR-P1-7 | resolved |
| P3 | 🟢 | 1 | FR-P1-8 | resolved |
| P4 | 🟢 | 5 | FR-P5-10 | resolved |
| P5 | 🟢 | 5 | FR-P5-9 | resolved |
| P6 | 🟢 | 4 | FR-P4-8 | resolved |
| P7 | 🟢 | 2/5 | FR-P2b-2, FR-P5-9 | resolved |
| P8 | 🟢 | 5 | FR-P5-4 | resolved |
| P9 | 🟢 | 5 | FR-P5-4 | resolved |
| P10 | 🟢 | 5 | FR-P5-7 | resolved |
| P11 | 🟢 | 5 | FR-P5-11 | resolved |
| P12 | 🟢 | 4 | FR-P4-5 | resolved |

**Disposition taxonomy:** `resolved` (fixed + verified at its phase checkpoint) · `accepted
limitation` (known, documented, not fixed — C6 only) · `deferred` (explicitly out of pre-merge
scope, with rationale — none at spec time).

**† C6 phase reconciliation.** The audit ledger lists C6 under Phase 4, but the **capture**
authoritatively schedules the desktop-only advisory notice (C6's fix) in **Phase 5** — both in the
Phase 5 description and its acceptance ("C6's expected 1.4.4 / 1.4.10 failures reproduced and
recorded") — and the ledger's own Dispositions gate C6 against "Phase 5's zero-un-triaged gate."
This spec follows the capture (Phase 5); the ledger's Phase-4 cell is superseded (audits are
point-in-time and may be superseded by later remediation).

**Closeout reconciliation (2026-07-12, HEAD `669b9cc4`).** This spec was written at Step 1
(`/to-spec`) as forward-looking acceptance criteria; the dispositions above default to `resolved`
"at the target-phase checkpoint." At closeout the honest status is split:

- **Automated remediation — COMPLETE and enforced.** Full gate green at HEAD `669b9cc4`
  (`npm run build`; `npm run test:run` — 1315 tests; `npm run lint` with a11y enforced;
  `npm run i18n:test`; the authz capability-contract validator). **S7** is now backed by the
  [dialog interaction inventory](./FRONTEND-DIALOG-INTERACTION-INVENTORY.md) + the 22/22 real-surface
  matrix. The a11y baselines are **shrink-only and enforced, not empty**: the **jsx-a11y baseline is
  146 entries, each with a 1:1 documented deviation** ([deviation registry](./FRONTEND-ACCESSIBILITY-BASELINE-DEVIATIONS.md),
  tracking `accessibility-baseline-debt`), and the **axe baseline is empty for the DORA routes**
  (`/ict-register/data-quality`, `/?view=ict-committee`) and enforced.
- **Human gates — PENDING.** The **manual / assistive-technology pass** (keyboard, focus order,
  screen reader, 200%/400% zoom with **C6** reproduced — accepted limitation, **not** marked green),
  the user-triggered **ultrareview** (`/code-review ultra`), and the **merge decision** remain open.
  No WCAG 2.2 AA conformance is claimed — AA stays a target (§2.1). Full record:
  [`FRONTEND-UX-MANUAL-AT-VERIFICATION-2026-07-12.md`](./FRONTEND-UX-MANUAL-AT-VERIFICATION-2026-07-12.md).
- **Process note.** The original #55–#70 workstream bypassed the planned per-phase manual/AT gates
  (CT-2) and per-phase ultrareviews and prematurely reported "done"; the corrective remediation
  `0fe16977..669b9cc4` + this single final automated gate + the pending human pass are the
  compensating control — they do **not** retroactively satisfy the missing per-phase gates.

---

## 6. Cross-cutting acceptance & test contracts

These MUST hold at the relevant checkpoints regardless of phase:

- **CT-1 (a11y gate, baseline mode).** From P1 onward, jsx-a11y (`error` + fingerprinted baseline
  + validator) and the extended stateful axe (pinned tags, no severity filter, shrinking baseline)
  both run on CI's primary project. New violations fail; baselines only shrink. (N4–N10.)
- **CT-2 (manual/AT per phase).** Each phase checkpoint adds a manual pass: keyboard-only
  operation, focus order, screen-reader walkthrough, and 200%/400% zoom + reflow in which **C6's
  1.4.4 / 1.4.10 failures are expected, reproduced, and recorded** — not treated as a pass, not
  tested only at `≥ lg`. (N3, CT for ADR-013.)
- **CT-3 (contrast).** Every semantic status bg/fg pair passes AA contrast in all three themes.
  (N20.)
- **CT-4 (three-theme regression).** The `select.tsx`/`ThemedSelect` tokenization carries
  three-theme component / visual-regression coverage across its ~95 sites / 48 files. (N13.)
- **CT-5 (capability gating).** Export links tested **allowed + denied** against
  `can_download_dora_register` (not `ict_committee:read`/`vendors:read`). (N21.)
- **CT-6 (routing).** Authorized deep-link + legacy redirect resolve; unauthorized/invalid `view`
  → overview **without** fetching committee data; back/forward updates the tab; ICT loading/error
  independent of the overview request; DQ `?check=` deep-links survive; routing-manifest tests
  green. (N22–N23, CT-6.)
- **CT-7 (full gate at boundaries).** tsc/build + lint + vitest + a11y green at every phase
  boundary (baseline mode where applicable). Note: **vitest green ≠ build green** — the `tsc` /
  `npm run build` type-check MUST be re-run against the final commit of each phase. (N25.)

---

## 7. Phase dependency graph & ticket-cluster map (input to `/to-tickets`)

This section stages Step 2. It does **not** create tickets. The blocking edges are:

```
                 ┌─────────────────────────────────────────────┐
                 │ P1 Foundation (tokens + a11y gate + metadata) │  ── blocks ALL
                 └───────────────┬───────────────┬───────────────┘
                                 │               │
             ┌───────────────────┤               ├───────────────────┐
             ▼                   ▼               ▼                   ▼
   ┌───────────────────┐   ┌───────────┐   ┌───────────┐   ┌───────────────────┐
   │ P2a primitives +  │   │ P3 tables │   │ P4 IA     │   │ (P2a also feeds    │
   │ tokenized select  │   │ + loading │   │ restructure│  │  P5 via primitives)│
   └─────────┬─────────┘   └─────┬─────┘   └─────┬─────┘   └───────────────────┘
       ┌─────┴─────┐             │               │
       ▼           ▼             │               │
 ┌──────────┐ ┌──────────┐       │               │
 │ P2b forms│ │ P2c dialog│      │               │
 └────┬─────┘ └────┬─────┘       │               │
      └─────┬──────┴─────────────┴───────────────┘
            ▼
   ┌─────────────────────────────────────────────┐
   │ P5 polish + palette + close dispositions     │  ── needs P1–P4
   └─────────────────────────────────────────────┘
```

| Cluster | Depends on | Notes |
|---------|-----------|-------|
| **P1 Foundation** | — | Blocks everything. Additive; the enabling foundation. |
| **P2a primitives + select** | P1 | Blocks P2b and P2c. `select.tsx`/`ThemedSelect` revert as one range. |
| **P2b forms** | P2a | One commit per form. |
| **P2c dialog migration** | P2a | First task = the interaction-contract inventory. |
| **P3 tables + loading** | P1 | Error contract lands first (shared prereq); then two independent revert ranges (component+consumers; DQ/Committee). |
| **P4 IA restructure** | P1 | Highest routing risk; retain old page until redirect verified. Follows the overlapping P3 work (see dispatch-safety). |
| **P5 polish + palette + dispositions** | P1–P4 | Closes every finding to a disposition. |

Tracer-bullet ticketing (Step 2) SHOULD open one epic/cluster per phase with blocking edges above,
and one issue per requirement ID (or tight requirement group), each citing its `FR-*`/finding IDs.

### Dispatch-safety ordering (execution constraints layered on the phase DAG) — added 2026-07-12

The phase DAG governs **product** dependencies; the edges below additionally prevent **concurrent
edits to the same source file** when tickets are dispatched to parallel AFK agents. They do **not**
change product scope — they encode a safe execution order and gate ownership.

- **`tailwind.config.js`** — P1 token-wiring (FR-P1-2) and P1 dead-chart-token removal (FR-P1-8)
  both edit it → run **sequentially or in the same agent**; never dispatch concurrently. (The a11y
  gate, FR-P1-4/5, may run alongside.)
- **Reusable table error contract** (N17) — landed **first** as a small additive shared module
  (a P3 **prerequisite**) that both the `SortableTable` range and the DQ/Committee range consume,
  so the two P3 ranges stay independently revertible (see Phase 3 rollback).
- **`VendorSubOutsourcingSection.tsx`** — the `SortableTable` consumer-migration (P3) must land
  **before** the sub-outsourcing chain-grouping (P4, FR-P4-7).
- **`IctRegisterCommitteePage.tsx`** — the committee loading/error branch (P3, FR-P3-4) must land
  **before** the ICT Committee → Dashboard-tab refactor (P4, FR-P4-3); the tab refactor
  **coordinates with** the sidebar-grouping ticket (FR-P4-1) over ICT Committee's sidebar removal.
- **P3 precedes the overlapping P4 work** on shared surfaces (the two edges above).
- **Phase closeouts are PM/human-owned gates.** A phase's downstream tickets flip from `blocked`
  to `ready-for-agent` **only after** that phase's terminal gate passes: full **tsc/build + lint +
  vitest + a11y** (baseline mode, CT-7), **CT-2 manual/AT** evidence (keyboard, focus order,
  screen reader, zoom/reflow with C6 recorded), and the **ultrareview / `code-review` checkpoint**
  (decision 15). The ultrareview is user-triggered; the gate owner is the PM/human, not an AFK
  agent. Tracked on the epic's phase-closeout checklist.

---

## 8. Open items & non-blocking follow-ups

- **O1 — nav section map. RESOLVED (2026-07-12).** The concrete item→section map is fixed in
  Phase 4 (**Phase 4 sidebar section map**; FR-P4-1 + FR-P4-9…12): four groups
  (`overview` / `registers` / `ict_register` / `administration`), empty groups omitted, existing
  capability checks + intra-group ordering preserved, EN/CS labels, routing-manifest tests added.
- **NB1 — archived-CONTRACT-root DQ rule.** Separate, **non-blocking** follow-up — **MUST NOT**
  become a ticket in this remediation epic; tracked separately.
- **NB2 — optional concurrency advisory-lock.** Separate, **non-blocking** follow-up — **MUST NOT**
  become a ticket in this remediation epic; tracked separately.

The 5 pre-existing orphan docs remain **out of scope** (§1.3). Filename
`FRONTEND-UX-REMEDIATION-SPEC.md` is **approved**.

---

## 9. Glossary & references

- **ICT Committee** — the CRO / Risk-Committee read-model aggregating the register (reproduces the
  workbook Dashboard / CRO-overview). *Target state:* a URL-addressable Dashboard tab; currently
  still ships as standalone `/ict-register/committee` pending this remediation. Avoid: "CRO
  dashboard", "committee dashboard", "ICT dashboard". (CONTEXT.md.)
- **Risk Committee** — the existing Dashboard tab for the enterprise risk-committee view; distinct
  from ICT Committee. Always qualify which committee is meant. (CONTEXT.md.)
- **DQ** — the Data-Quality readiness page (`IctRegisterDqPage`); stays routed; `?check=`
  deep-links are inbound and must survive.
- **`DialogShell`** — the one accessible dialog primitive (focus trap, Esc, focus restoration);
  extended in 2c with `role?: "dialog" | "alertdialog"`.
- **`can_download_dora_register`** — the distinct export capability (`reports:read` + role) that
  gates the readiness-screen export links.

All decisions trace to [FRONTEND-UX-REMEDIATION-CAPTURE.md](./FRONTEND-UX-REMEDIATION-CAPTURE.md);
all findings to [FRONTEND-UX-AUDIT-2026-07-11.md](./FRONTEND-UX-AUDIT-2026-07-11.md); architectural
basis in [ADR-013](../adr/ADR-013-frontend-accessibility-standard.md),
[ADR-014](../adr/ADR-014-desktop-first-support.md),
[ADR-015](../adr/ADR-015-frontend-design-system-foundation.md); rationale in
[UX-REMEDIATION-VERIFICATION-2026-07-11.md](./UX-REMEDIATION-VERIFICATION-2026-07-11.md).
