# Frontend UX — Manual / Assistive-Technology Verification Record (2026-07-12)

Back to folder index: [`README.md`](./README.md) ·
Back to tree: [`../DOCUMENTATION_TREE.md`](../DOCUMENTATION_TREE.md)

## Purpose

Closeout record for the DORA frontend design/UX remediation. It separates what is
**automated and complete** (machine-checkable gates, enforced on CI) from what is
**human-owned and still pending** (manual keyboard / assistive-technology evaluation,
the user-triggered ultrareview, and the merge decision). This document does **not**
assert WCAG 2.2 AA conformance: AA is a **target** (ADR-013 §N1), and a formal
conformance statement additionally requires the human passes below **and** closure of
the SC 1.4.4 / 1.4.10 exceptions (finding **C6**, ADR-014) — none of which is done here.

Nothing in the "Manual / AT" or "C6" sections may be checked off by an automated agent.
Those boxes are for a human operating real assistive technology on this exact commit.

## State under verification

| Field | Value |
|---|---|
| Branch | `dora` |
| Under verification | The **Round-2 tip** (`36f579ad..HEAD`). The automated remediation is the 7 commits `36f579ad..c8a7f7cd` enumerated below; its last app/test change is the N10 gate `c8a7f7cd` (2026-07-13). This docs-only reconciliation record sits on top and adds **no** app/test surface — and cannot cite its own commit SHA. |
| Automated-remediation range | Round 1 `0fe16977..669b9cc4`; **Round 2 `36f579ad..c8a7f7cd` (7 commits)**: `36f579ad` honest jsx-a11y config, baseline **146 → 0** · `225e9ed6` exact fail-closed ratchet + zero-tolerance axe · `cb23cd63` department id-scope + archived-only refetch + presentation helper · `79ed8c56` real 26-surface / 27-case dialog matrix + footer fix · `416ec077` humanized manuals + a11y testing contract · `51442533` docs-topology green · `c8a7f7cd` N10 stateful browser a11y gate + RN10 source fixes |
| Automated-gate environment | macOS (Darwin 27.0.0), Node `v24.13.1`, system `python3` |
| Assistive-tech environment | **to be recorded by the human tester** (OS + browser + AT versions) |

---

## 1. Automated evidence (automated remediation COMPLETE — PENDING final verification)

These gates are machine-checkable and green at the Round-2 tip (`36f579ad..HEAD`). Entries marked
**(re-verified at Round-2 closeout)** were re-run/re-read directly against this HEAD while
writing this record; the remainder are the gate results carried by the landed
remediation commits and are reproducible via the cited commands.

> **Round-2 closeout (2026-07-13, the Round-2 tip `36f579ad..HEAD`).** After the Round-1
> closeout (HEAD `669b9cc4`) a **7-commit** hardening arc landed — `36f579ad` (honest jsx-a11y
> config; baseline **146 → 0**), `225e9ed6` (exact fail-closed ratchet + zero-tolerance axe),
> `cb23cd63` (department id-scope + archived-only refetch + presentation helper), `79ed8c56`
> (real **26-surface / 27-case** dialog matrix + footer fix), `416ec077` (humanized manuals +
> a11y testing contract in TESTING.md), `51442533` (**docs-topology green** — 25 directory
> READMEs + STRUCTURE.md reconciled + orphans indexed), and `c8a7f7cd` (the **N10 stateful
> browser a11y gate** + RN10 source fixes). The automated numbers below are refreshed to this
> tip: the jsx-a11y baseline is **0 entries** (so the deviation registry is **0** too), the
> base-ref ratchet is **exact and fail-closed**, the axe checks are **enforce-only /
> zero-tolerance** (capture path removed), the dialog matrix is **26 real surfaces (27 cases)**,
> and the N10 gate drives five real stateful surfaces open under axe across all three themes.
> This does not change the human status: the manual / AT passes in §2–§3 and the ultrareview in
> §5 remain **outstanding**, so the automated work is complete **pending final verification**,
> not a merge sign-off.

### 1.1 Full quality gate

| Gate | Command | Result |
|---|---|---|
| Build / type-check | `npm run build` | green |
| Unit + component tests | `npm run test:run` | green |
| Lint (a11y enforced) | `npm run lint` | green (jsx-a11y `error` + 0-entry baseline + fail-closed ratchet) |
| i18n parity | `npm run i18n:test` | green |
| Authz capability contract | `python3 scripts/security/validate_authz_capability_contract.py` | passes plain **and** `--base-ref 69ffc76d` |
| Docs contract | `python3 scripts/check_docs_contract.py` | **OK** (re-verified at Round-2 closeout) |
| Docs topology | `make -f scripts/Makefile docs-topology-consistency` | **green** — docs contract + README coverage + tree reachability + structure-metrics guard (re-verified at Round-2 closeout) |

### 1.2 Accessibility state (the honest baselines)

- **jsx-a11y baseline is EMPTY (`count: 0`) and enforced.** The Round-2 pass fixed all
  jsx-a11y violations — this workstream's changed-file findings **and** the previously
  carried app-wide residual — and rebuilt the baseline **146 → 0** (`36f579ad`). Because the
  baseline is empty, the deviation registry is empty too, so there are **zero deviations**.
  The gate holds this three ways: the exact check fails on any **new** finding and on any
  **stale** entry (each keyed `rule|file|line|column`), and the **base-ref ratchet fails
  closed** — it forbids the committed baseline from widening, resolving the base ref as
  `origin/main` when that ref carries `jsx-a11y-baseline.json`, else the committed anchor SHA
  (`36f579ad`) in `frontend/scripts/a11y/baseline-anchor.json`; if **neither** resolves it
  **fails** (never skips), so the 0-entry baseline can never be silently re-widened.
  - `frontend/scripts/a11y/jsx-a11y-baseline.json` → `count: 0, entries: []` (re-verified at Round-2 closeout).
  - `frontend/scripts/a11y/jsx-a11y-deviations.json` → `count: 0, deviations: []` (re-verified at Round-2 closeout).
  - Details: [`FRONTEND-ACCESSIBILITY-BASELINE-DEVIATIONS.md`](./FRONTEND-ACCESSIBILITY-BASELINE-DEVIATIONS.md).
- **axe baseline is EMPTY for the scanned routes and ENFORCE-ONLY (zero-tolerance).** The
  stateful axe/Playwright baseline (`tests/frontend/e2e/accessibility-axe-baseline.json`)
  enumerates **11 routes × 3 themes (riskhub / light / dark)**, every route→theme carrying an
  empty `[]` violation list — i.e. **zero tolerated axe violations**, including both DORA
  routes `/ict-register/data-quality` and `/?view=ict-committee` (re-verified at Round-2
  closeout). Round 2 removed the capture/overwrite path from the helper
  (`tests/frontend/e2e/helpers/axeBaseline.ts`): there is **no `UPDATE_A11Y_AXE_BASELINE`
  update mode** anymore, so a violation can only be resolved by fixing the app. The scan pins
  explicit WCAG tags (`wcag2a`/`wcag2aa`/`wcag21a`/`wcag21aa`/`wcag22aa`), is **not** filtered
  by impact, and runs on the `ci` Playwright project only.
- **Stateful browser a11y gate (N10 — new in `c8a7f7cd`).** A dedicated Playwright spec
  (`tests/frontend/e2e/dora-ux-stateful-a11y.spec.ts`) drives **five real stateful surfaces**
  open and axe-scans each with the pinned WCAG 2.2 AA tags: (1) an opened DORA `alertdialog`
  (focus-trap + restoration), (2) an invalid entity-form error state, (3) an open Radix
  `ThemedSelect` listbox, (4) an expanded sub-outsourcing disclosure chain, and (5) the
  Data-Quality + ICT-Committee loading/error states. It is **enforce-only** (no
  baseline/capture path — every finding is a hard failure) with **zero rule-disables**,
  running one case per theme (**riskhub / light / dark**) on the `ci` Playwright project;
  all three pass. The findings it surfaced (**RN10**) were fixed **at source**: back-button
  `aria-label`s on the Process / Threat / Asset detail pages, and the `ConfirmDialog` danger
  button re-set to white-on-`#ba3535` (**5.76:1**, clears AA) **without** redefining the
  `--destructive` token.
- **Dialog / overlay contract.** The interaction inventory
  ([`FRONTEND-DIALOG-INTERACTION-INVENTORY.md`](./FRONTEND-DIALOG-INTERACTION-INVENTORY.md))
  classifies the DialogShell surfaces; the Round-2 real-surface matrix
  (`tests/frontend/unit/src/components/dialogInteractionMatrix.test.tsx`) mounts **26 real
  dialog/alertdialog surfaces** OPEN and asserts the **seven-point contract** (`aria-modal`,
  accessible name via `aria-labelledby`, initial focus inside, Tab + Shift-Tab focus-trap,
  open-state axe sweep, Escape-closes-and-restores-focus). A 27th case guards the non-dialog
  busy overlay (`role="status"`, which must not trap focus): **27 `it()` cases, 0 skipped**
  (re-verified at Round-2 closeout).
- **Table error contract.** Department-tab fetch failures now render an error + retry
  state (previously the empty-table **C4** bug); Round 2 also scoped department rows by id and
  covered the archived-only refetch path (`cb23cd63`). 5 table sections adopt the N17
  stale-data contract.
- **Routing / e2e.** The ICT Committee e2e is rewritten for `/?view=ict-committee`
  (redirect + addressability + capability normalization); three-theme `ThemedSelect`
  computed-style + contrast coverage was added.

### 1.3 What "COMPLETE" means here

Automated remediation is **complete and enforced — but PENDING final verification.** The
green machine gate is a **necessary, not sufficient**, precondition for merge: it does
**not** by itself establish WCAG 2.2 AA conformance, and it does **not** substitute for the
human passes in §2–§3 or the user-triggered ultrareview in §5. Those remain outstanding, so
"complete" here means the **automated remediation** is done — not that the workstream is
verified for merge (§4).

---

## 2. Manual / assistive-technology matrix (HUMAN-OWNED — UNCHECKED)

Every row below is **pending** and must be completed by a human operating real
assistive technology against the Round-2 tip (`36f579ad..HEAD`). An automated agent **cannot** run screen
readers or judge focus order, so no agent may check these boxes or backdate them.
Record the tester, date, OS/browser/AT versions, and pass/fail + notes per row.

### 2.1 Keyboard-only operation & focus order

- [ ] pending (human) — **ICT Register** (data-quality page): full keyboard traversal, visible focus, logical order, no traps.
- [ ] pending (human) — **ICT Committee** (`/?view=ict-committee`): keyboard traversal + focus order; committee tables reachable and operable.
- [ ] pending (human) — **Data-Quality (DQ)** readiness page incl. `?check=` deep-links: keyboard operation of checks/filters.
- [ ] pending (human) — **Entity forms** (risk / control / vendor / KRI): tab order, `Field` errors announced, focus moves to first invalid field on submit.
- [ ] pending (human) — **Dialogs / overlays**: focus trap on open, `Escape` closes, focus restores to the opener; stacked dialogs peel off one at a time.
- [ ] pending (human) — **Sidebar / IA**: grouped nav operable by keyboard; group headings and intra-group order sensible to keyboard users.

### 2.2 Screen-reader walkthrough (VoiceOver + Safari)

- [ ] pending (human) — Register / Committee / DQ: headings, landmarks, table semantics (`<th scope>`, `aria-sort`) announced correctly.
- [ ] pending (human) — Dialogs: accessible name announced on open; `alertdialog` surfaces announce label + description before any destructive control.
- [ ] pending (human) — Forms: `aria-required` / `aria-invalid` / `aria-describedby` and the `role="alert"` error summary announced.
- [ ] pending (human) — Status pills / semantic tokens: state conveyed by more than colour (text/icon), announced meaningfully.
- [ ] pending (human) — `ThemedSelect`: visible label associated via `aria-labelledby`; options announced; no `aria-label` overriding the real label.

### 2.3 Zoom (200% and 400%)

- [ ] pending (human) — **200% zoom**: reproduce and record behaviour across register / committee / DQ / forms (see **C6**, §3 — expected failure, not a pass).
- [ ] pending (human) — **400% zoom**: reproduce and record behaviour (see **C6**, §3 — expected failure, not a pass).

### 2.4 Reflow / narrow viewport

- [ ] pending (human) — Below `lg` (~1024px): confirm the desktop-only advisory notice renders with the neutral copy + path to an accessible alternative (ADR-014); it must **not** instruct users to reduce zoom.
- [ ] pending (human) — Confirm no dense table/heatmap is clipped by `overflow-hidden` at `≥ lg` (horizontal-scroll containers present).

---

## 3. C6 — SC 1.4.4 (Resize Text) / SC 1.4.10 (Reflow)

**Disposition: accepted limitation (desktop-only; ADR-014). Reproduction pending (human).**

RiskHub is desktop-only (ADR-014), so **SC 1.4.4 Resize Text (AA)** and **SC 1.4.10
Reflow (AA)** are known, documented, **accepted exceptions** — not defects to fix in this
round and not to be marked green. The reflow shell that would close them is explicitly
out of scope (SPEC §1.3).

The human tester must **reproduce and record** the two expected failures at 200% and
400% zoom (§2.3) and leave this disposition as **"accepted limitation — reproduction
pending (human)."** Do **not** assert these criteria pass, and do **not** derive a WCAG
2.2 AA conformance claim from the rest of the gate while these exceptions stand
(ADR-013 §N2).

- [ ] pending (human) — SC 1.4.4 failure reproduced and recorded at 200% / 400% zoom.
- [ ] pending (human) — SC 1.4.10 failure reproduced and recorded at 200% / 400% zoom.

---

## 4. Process deviation (recorded honestly)

The original UX ticket workstream (**#55–#70**) **bypassed the planned per-phase manual /
assistive-technology gates (CT-2)** and the **per-phase ultrareview / `code-review`
checkpoint** (decision 15; SPEC §7 "Phase closeouts are PM/human-owned gates"), and
**prematurely reported the work as "done."** That report was not backed by the required
per-phase human evaluation.

This is recorded as a genuine process deviation. It is **not** being rewritten: the
per-phase manual/AT gates and per-phase ultrareviews **did not happen** as designed, and
this document does not claim otherwise.

**Compensating control (what was actually done instead):** a corrective remediation pass
landed as the Round-1 commits `0fe16977..669b9cc4`, extended by the **7-commit Round-2
hardening arc `36f579ad..c8a7f7cd`**, which (a) reconciled the false dispositions,
(b) brought the **full final automated gate** to green and **enforced** the a11y baselines
(§1), and (c) scheduled the **still-pending human manual/AT pass** (§2–§3) and the
user-triggered ultrareview (§5) as explicit, un-checked gates before merge. The
compensating control substitutes a single rigorous **final** automated gate + a pending
human pass for the missing **per-phase** gates; it does not retroactively satisfy them.

---

## 5. Remaining human-owned items (all PENDING)

- [ ] pending (human) — Complete the manual / AT matrix in §2 and the C6 reproduction in §3.
- [ ] pending (human) — Run the user-triggered **`/code-review ultra`** (ultrareview) against the Round-2 tip (`36f579ad..HEAD`).
- [ ] pending (human) — Make the **merge decision** for `dora` once §2–§3 pass (with C6 recorded as an accepted limitation) and §5 ultrareview is clean.

Until every box above is checked by a human, `dora` is **not** established as
merge-ready by this record, regardless of the green automated gate in §1.
