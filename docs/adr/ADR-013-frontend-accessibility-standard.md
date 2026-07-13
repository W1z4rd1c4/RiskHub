# ADR-013 Frontend Accessibility Standard (WCAG 2.2 AA target)

## Status

Accepted

## Context

A design/UX audit of the DORA frontend (2026-07-11) found systemic accessibility gaps that
no *author-time* check would catch: form `<label>`s not programmatically associated with their
controls, many `ThemedSelect`s deriving their accessible name from a repeated "Not set"
placeholder (most app-wide selects omit an explicit label; a few pass one), `SortableTable`
sort headers and rows operable only by mouse, and icon-only actions relying on `title` alone.

At the time of adoption, the repo ran a **narrow** accessibility gate:
`tests/frontend/e2e/accessibility-smoke.spec.ts` runs `@axe-core/playwright` over `/`,
`/controls`, `/risks`, `/settings` and `/admin` (three themes) and fails on serious/critical
violations. But it (a) covers **none** of the new DORA surfaces, (b) runs axe with default
rules and **no WCAG tag/level pinned**, (c) only executes under the `chromium` Playwright
project and is **skipped on CI's primary `ci` project**, (d) has **no author-time (lint)
equivalent**, and (e) is a **route-level DOM scan** that never exercises stateful surfaces
(open modals, open Radix selects, validation errors, expanded rows). There is no documented
accessibility standard of record.

## Decision

The frontend adopts **WCAG 2.2 Level AA** as its accessibility **target** — not a present-tense
conformance claim. (WCAG 2.2 is the current W3C Recommendation, 12 Dec 2024; the project
upgrades its target from 2.1 to 2.2. Both remain active W3C standards; 2.2 is backward-compatible.
Adopt 2.1 only if a contract pins it.)

**RiskHub does not currently conform, and cannot make a full 2.2 AA conformance statement while
the desktop-only exceptions stand.** The [audit ledger](../dora-ict-register/FRONTEND-UX-AUDIT-2026-07-11.md)
lists open A/AA failures, and under the desktop-only policy ([ADR-014](./ADR-014-desktop-first-support.md))
SC 1.4.4 Resize Text (AA) and SC 1.4.10 Reflow (AA) are **known, accepted exceptions**. Because
WCAG conformance is asserted per *full page* and cannot exclude an automatically-presented
viewport variation (<https://www.w3.org/TR/WCAG22/#cc2>), a formal conformance statement
requires **both** (i) implementation + manual/AT verification of the remediation, **and**
(ii) the ADR-014 desktop-only exceptions (1.4.4 / 1.4.10) to be **closed** — verification alone
is insufficient while desktop-only stands.

Two legs of work toward the target:

1. **Automated (machine-checkable subset), gated in CI with direct zero enforcement:**
   - `eslint-plugin-jsx-a11y` in the lint gate. Every **enabled recommended rule is enforced as
     an error**; rules the plugin intentionally disables remain `off`. The committed baseline
     JSON is audit evidence only and must remain well-formed with zero entries. The gate fails
     for any enabled-rule finding, any non-empty or malformed baseline, or any ESLint suppression
     entry. There is no write, anchor, fingerprint, deviation, or update workflow.
   - **Extend** `accessibility-smoke.spec.ts` to the DORA surfaces, **pin explicit axe WCAG
     tags** (`wcag2a wcag2aa wcag21a wcag21aa wcag22aa`), **remove the `chromium`-only guard**,
     **fail on every violation the tags select (not filtered by axe `impact`)**. The committed
     route/theme JSON is an exact, empty audit-evidence matrix, not an exception ledger.
   - Make the axe sweep **stateful**: open each modal/overlay, trigger representative validation
     errors, open Radix selects, expand disclosure/chain rows, and scan each state — plus assert
     focus trapping + restoration on Radix portals inside `DialogShell`. Route-level scans alone
     miss these.
2. **Manual / assistive-technology evaluation (required for conformance):** each phase checkpoint
   adds a manual pass — keyboard-only operation, focus order, a screen-reader walkthrough, and a
   200% / 400% zoom + reflow pass in which the **desktop-only 1.4.4 / 1.4.10 failures (finding
   C6) are expected, reproduced, and recorded** — not treated as a pass and not tested only at
   `≥ lg`.

## Alternatives Rejected

- **Fix the findings without extending the gate:** rejected — regressions return on the next
  new form; the existing smoke covers no DORA surface and skips CI's primary project.
- **Stay on WCAG 2.1:** rejected — 2.2 is current and backward-compatible.
- **Claim "AA conformant" on automation alone, before implementation, or while 1.4.4 / 1.4.10
  are open exceptions:** rejected as an overclaim (see Decision).
- **Filter the gate by axe severity (serious/critical only):** rejected — severity ≠ WCAG level.
- **Gate jsx-a11y with a bare `--max-warnings` total:** rejected — a total warning budget does
  **not** guarantee new findings fail because a new violation can replace a fixed one.
- **Retain a writable fingerprint/deviation mechanism after reaching zero:** rejected — it lets
  a branch weaken policy. Any future exception mechanism requires a separate policy change and
  tracked approval.
- **Target AAA:** rejected — disproportionate for an internal enterprise console.

## Enforcement

- `eslint-plugin-jsx-a11y` in `frontend/eslint.config.js`; every enabled recommended rule is an
  `error`. `frontend/scripts/a11y/jsx-a11y-baseline.mjs` enforces zero findings, a well-formed
  empty evidence file, and zero suppression entries, with no writable exception path.
- Extended, **stateful** `accessibility-smoke.spec.ts` — DORA coverage, pinned WCAG tags, no
  severity filter, strict zero findings, primary `ci` project, per-state scans + focus-trap
  assertions. E2E collection is asserted before the run, and CI falls back from system Chrome to
  bundled Chromium without changing projects.
- A per-phase manual/AT checklist (keyboard, focus order, screen reader, zoom/reflow with C6
  failures recorded).

## Sources

- WCAG 2.2 conformance requirements (full pages; variations included): <https://www.w3.org/TR/WCAG22/#cc2>
- Evaluating accessibility requires human judgement: <https://www.w3.org/WAI/test-evaluate/>
- What's new in WCAG 2.2: <https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/>

## Rollback Strategy

Any future rule exception or baseline mechanism requires a separate policy change with tracked
approval. Removing the gate wholesale, or dropping the AA target, requires superseding this ADR.
