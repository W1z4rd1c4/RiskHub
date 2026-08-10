# ICT Register — UX-remediation docs, review verification

_2026-07-11. A code review of the first draft of the frontend-UX planning docs (3 ADRs +
[FRONTEND-UX-REMEDIATION-CAPTURE.md](./FRONTEND-UX-REMEDIATION-CAPTURE.md)) raised several
claims. This note records the verification of each against **source code** and **W3C primary
sources** (5 verification agents), and what was changed as a result. Repo facts cite
`file:line`; standards facts cite official W3C URLs._

## Verdicts

| # | Review claim | Verdict | Basis |
|---|--------------|---------|-------|
| 1 | No `/dashboard` route; capture's redirect is broken | **CONFIRMED** | Dashboard is the `/` index (`frontend/src/routing/core.tsx:47`). No `path: 'dashboard'` anywhere. `/dashboard` hits the `*`→`/` wildcard (`App.tsx:72`) which also drops the query string. Correct target: `/?view=ict-committee`. Introducing `/dashboard` would break `routingManifest.test.ts`. |
| 2 | An axe gate already exists; ADR-013 "no gate" overstates | **CONFIRMED** | `tests/frontend/e2e/accessibility-smoke.spec.ts:56` runs `AxeBuilder`, filters serious/critical, `expect(...)`-fails. Covers `/`,`/controls`,`/risks`,`/settings`,`/admin` in 3 themes. **But**: no DORA surface covered; **no WCAG tags pinned** (axe defaults); **skipped on CI's `--project=ci`** (guard at `:86`, runs only under `--project=chromium`). `eslint-plugin-jsx-a11y` genuinely absent. → gate is *extended*, jsx-a11y is *new*. |
| 3 | Hard desktop gate below 1024px conflicts with WCAG AA | **CONFIRMED** | SC 1.4.10 Reflow (AA) requires no loss of functionality down to a 320 CSS-px-equivalent viewport; SC 1.4.4 Resize Text (AA) requires 200% zoom. Zoom shrinks the CSS viewport, so a 1024px gate trips at ~125% zoom. The 1.4.10 two-dimensional exception is scoped to components (tables/maps), not the whole app. |
| 4 | Prefer WCAG 2.2 over 2.1 | **CONFIRMED** | WCAG 2.2 is a W3C Recommendation (12 Dec 2024), backward-compatible ("content that conforms to 2.2 also conforms to 2.1"); W3C advises using the latest version. New AA SC of note: 2.4.11 Focus Not Obscured, 2.5.7 Dragging, 2.5.8 Target Size, 3.3.8 Accessible Authentication. |
| 5 | "AA enforced in CI" overstates conformance | **CONFIRMED** | W3C: automated tools cannot determine conformance alone; human evaluation is required. Reworded to "machine-checkable subset gated in CI, backed by manual/AT evaluation." (No specific machine-testable percentage is published by W3C; avoid citing one.) |
| 6 | ICT Committee currently ships as a standalone route (CONTEXT.md asserted tab reality) | **CONFIRMED** | `frontend/src/routing/business.tsx:222` still exports `path: 'ict-register/committee'` + sidebar item. Risk Committee IS already a Dashboard tab (`DashboardPage.tsx:97`) but `useState`-driven, not URL-addressable. Glossary re-marked "target state". |
| 7 | Capture header says "13 decisions" but lists 15 | **CONFIRMED** | Fixed to 15. |
| 8 | Audit not preserved as a linked artifact | **CONFIRMED** | No findings/IDs anywhere in `docs/**`. Repo has a house genre — `docs/audits/` with an "Audit Traceability Ledger" (`docs/audits/2026-05-23-architecture-audit-remediation-plan.md:142`). Persisted as [FRONTEND-UX-AUDIT-2026-07-11.md](./FRONTEND-UX-AUDIT-2026-07-11.md). |
| 9 | Capture orphaned — violates docs Reachability Contract | **CONFIRMED** | `docs/DOCUMENTATION_TREE.md:128` requires canonical leaves reachable within 3 hops, checked by `scripts/tools/docs_tree_audit.py --fail-on-unreachable`. Inbound links added from `CONTEXT.md` footer → capture → audit + this note. |

## Changes applied to the docs

- **CONTEXT.md** — ICT Committee entry re-marked as *target state* (still a standalone page
  today); dropped the premature "ICT Risk Committee page" avoid-term; footer now links the
  remediation capture, audit ledger, and this note (reachability).
- **ADR-013** — retitled **WCAG 2.2 AA**; context rewritten to describe the existing narrow
  axe gate accurately; two-leg conformance (automated subset + manual/AT); enforcement =
  jsx-a11y (new) + extended axe (pinned tags, project-guard fix).
- **ADR-014** — hard sub-`lg` gate rejected as an AA violation; resolved as **desktop-only**,
  with SC 1.4.4 / 1.4.10 recorded as **documented exceptions** and a neutral informational notice
  (no reflow shell, **no AA-scope claim** — see the second-review section below); W3C sources cited.
- **Capture** — 15 decisions; `/?view=ict-committee`; decision 2 (2.2 + extended gate) and
  decision 7 (reflow-compatible) corrected; per-phase acceptance + rollback added; corrections
  section + audit/verification links added.
- **Audit ledger** — created, with finding IDs (C1–C6, S1–S13, P1–P12), severities,
  `file:line`, New/Shared, target phase, acceptance.

## Two decisions that changed (resolved with the user)

1. **WCAG 2.1 → 2.2 AA** (decision 2) — **kept 2.2** (backward-compatible, W3C-advised).
2. **Desktop-first: hard gate → desktop-only with documented AA gap** (decision 7) — **kept
   strict desktop-only** (no reflow shell). RiskHub does **not** claim AA conformance (WCAG cannot
   scope out an automatically-presented viewport); SC 1.4.4 / 1.4.10 are **documented, accepted
   exceptions** (ADR-014). The AA-clean alternative (a reflow shell) was deferred as out-of-scope
   UI work.

## Second review round (2026-07-12) — verified & incorporated

| Claim | Verdict | Basis / fix |
|-------|---------|-------------|
| "AA at ≥lg" is an invalid conformance claim | **CONFIRMED** | WCAG conformance is per full page and cannot exclude an automatically-presented viewport (<https://www.w3.org/TR/WCAG22/#cc2>). Reframed everywhere: AA is the **target**; desktop-only leaves 1.4.4/1.4.10 as documented exceptions → **no full AA conformance claim**. |
| Phase 1 can't be green while enabling gates that detect deferred violations | **CONFIRMED** | The initial plan used a temporary migration baseline. Round 3 supersedes that migration mechanism: the current tree has zero findings and direct strict-zero enforcement with no writable exception path. |
| Removing native `required` drops useful semantics | **CONFIRMED** | Decision 4 now **keeps `required` + adds `noValidate`**, wires `aria-required`/`aria-invalid`/`aria-describedby` incl. on `ThemedSelect` (which must not let its fallback `aria-label` override a real label — `ThemedSelect.tsx:89`). |
| axe severity filter ≠ WCAG conformance | **CONFIRMED** | Gate **fails on all violations the WCAG tags select** (no serious/critical filter). Round 3 validates an exact empty audit-evidence matrix and fails findings directly; it has no ratchet or capture path. |
| Export needs capability gating | **CONFIRMED** | `vendor_report_capabilities` (`vendor_report_policy.py:20`) returns a **distinct** `can_download_dora_register` (needs `reports:read` + role), not implied by `ict_committee:read`/`vendors:read`. Readiness links gate on it; test allowed + denied. |
| `SortableTable` blast radius understated | **CONFIRMED** | **11 files / 20 sites** (Controls/Departments/Issues/KRIs/Risks/Vendors list + the new ones). Phase 3 acceptance now requires regression coverage across all consumers. |
| "Everything found" not provable (statuses/inventories) | **CONFIRMED** | Ledger gains a **Dispositions** taxonomy (resolved / accepted limitation / deferred); S7 reframed to an **interaction-contract** inventory (dialog vs loading overlay vs popover — `ControlDetailPage`'s loading overlay excluded; exact render-site enumeration is a Phase 2c task); C3/S2 anchors; P11 in-scope; C6 = accepted limitation reconciled with Phase 5. |
| ADR-015 token contract unspecified | **CONFIRMED** | Reuse `--destructive`/`-foreground` (no `danger` rename); add `--success/--warning/--info` (+`-foreground`) with **AA contrast acceptance tests**. |
| "2.2 supersedes 2.1" inaccurate | **CONFIRMED** | Reworded to "upgrades its target"; both remain active W3C standards. |
| Phase 4 URL/RBAC criteria thin | **CONFIRMED** | Added: authorized deep-link + legacy redirect; unauthorized/invalid `view` → overview **without** fetching committee data; back/forward updates tab; ICT loading/error independent of the overview request (`DashboardPage.tsx:69`). |
| Chart tokens: "define or remove" left open | **CONFIRMED** | Decided **remove** (no `chart-*`/`var(--chart-*)` usage in source). |

## Round 3 implementation reconciliation (2026-07-13)

- The canonical dialog descriptor now separates 26 implementation owners from 48 application
  render sites and 5 non-dialog surfaces. Source discovery, 29 unit cases, and 48 Playwright
  render-site cases must agree.
- The control-risk loading overlay is tested through production `ControlRiskLoadingOverlay`, not
  a copied test mirror.
- jsx-a11y enforces every enabled recommended rule as an error and requires zero findings, an
  empty well-formed evidence JSON, and zero suppressions. Axe requires the exact empty `ci` /
  theme / route evidence matrix. Neither mechanism has a write, fingerprint, deviation, anchor,
  ratchet, capture, or branch-controlled widening path.
- CI always runs the `ci` Playwright project; bundled Chromium is the fallback when system Chrome
  is absent. Collection fails unless all three accessibility specs are present.
- These automated corrections do not complete the human keyboard, VoiceOver/Safari, zoom/reflow,
  C6 reproduction, ultrareview, or merge gates.

## Sources (W3C primary)

- SC 1.4.10 Reflow: <https://www.w3.org/WAI/WCAG22/Understanding/reflow>
- SC 1.4.4 Resize Text: <https://www.w3.org/WAI/WCAG22/Understanding/resize-text>
- What's new in WCAG 2.2 (status, back-compat, new SC): <https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/>
- Evaluating accessibility (human evaluation required): <https://www.w3.org/WAI/test-evaluate/>
- Selecting evaluation tools (tools assist, not determine): <https://www.w3.org/WAI/test-evaluate/tools/selecting/>
