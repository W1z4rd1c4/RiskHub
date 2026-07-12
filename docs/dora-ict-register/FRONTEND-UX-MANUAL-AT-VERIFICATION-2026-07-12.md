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
| HEAD commit | `669b9cc48faa3f46d0bb812b621f17d408dd71b2` (`669b9cc4`) |
| HEAD subject | `fix(dora-ux): resolve 18 axe findings + sidebar-contrast regression; enforce empty DORA axe baseline` |
| HEAD commit date | `2026-07-12T22:22:28+02:00` |
| Remediation commit range | `0fe16977..669b9cc4` (7 commits) |
| Automated-gate environment | macOS (Darwin 27.0.0), Node `v24.13.1`, system `python3` |
| Assistive-tech environment | **to be recorded by the human tester** (OS + browser + AT versions) |

---

## 1. Automated evidence (COMPLETE — enforced on CI)

These gates are machine-checkable and green at HEAD `669b9cc4`. Entries marked
**(re-verified at closeout)** were re-run/re-read directly against this HEAD while
writing this record; the remainder are the gate results carried by the landed
remediation commits and are reproducible via the cited commands.

### 1.1 Full quality gate

| Gate | Command | Result |
|---|---|---|
| Build / type-check | `npm run build` | green |
| Unit + component tests | `npm run test:run` | green — **1315 tests** |
| Lint (a11y enforced) | `npm run lint` | green (jsx-a11y `error` + baseline + deviation validator) |
| i18n parity | `npm run i18n:test` | green |
| Authz capability contract | `python3 scripts/security/validate_authz_capability_contract.py` | passes plain **and** `--base-ref 69ffc76d` |
| Docs contract | `python3 scripts/check_docs_contract.py` | **OK** (re-verified at closeout) |

### 1.2 Accessibility state (the honest baselines)

- **jsx-a11y baseline is shrink-only and enforced, NOT empty.** The changed-file
  remediation fixed all **75** jsx-a11y violations in this workstream's changed files
  and regenerated the baseline once: **221 → 146**. The **146** residual entries are
  pre-existing, app-wide debt outside the DORA changed-file scope; each carries a **1:1
  documented deviation** record (rule/user-impact/owner/tracking/review-by), and a
  validator fails the gate if the baseline and the deviation registry ever drift apart.
  Tracking label: **`accessibility-baseline-debt`**.
  - `frontend/scripts/a11y/jsx-a11y-baseline.json` → `count: 146, entries: 146` (re-verified at closeout).
  - `frontend/scripts/a11y/jsx-a11y-deviations.json` → `count: 146, deviations: 146` (re-verified at closeout).
  - Details: [`FRONTEND-ACCESSIBILITY-BASELINE-DEVIATIONS.md`](./FRONTEND-ACCESSIBILITY-BASELINE-DEVIATIONS.md).
- **axe baseline is EMPTY for the DORA routes and enforced.** The stateful axe/Playwright
  baseline (`tests/frontend/e2e/accessibility-axe-baseline.json`) enumerates **11 routes ×
  3 themes (riskhub / light / dark)**, every route→theme carrying an empty `[]` violation
  list — i.e. **zero tolerated axe violations**, including both DORA routes
  `/ict-register/data-quality` and `/?view=ict-committee` (re-verified at closeout).
  18 axe findings plus a `#63` sidebar-contrast regression were fixed to reach this. The
  baseline is update-only via an env flag (`UPDATE_A11Y_AXE_BASELINE=1`); enforce-mode
  smoke ran **6 passed / 0 drift** across riskhub / light / dark.
- **Dialog / overlay contract.** The interaction inventory
  ([`FRONTEND-DIALOG-INTERACTION-INVENTORY.md`](./FRONTEND-DIALOG-INTERACTION-INVENTORY.md))
  classifies **26 DialogShell surfaces** by interaction contract; the real-surface
  interaction matrix (`tests/frontend/unit/src/components/dialogInteractionMatrix.test.tsx`)
  is **22/22 active, 0 skipped** (re-verified at closeout: 22 `it()` cases, 0 `.skip`).
- **Table error contract.** Department-tab fetch failures now render an error + retry
  state (previously the empty-table **C4** bug); 5 table sections adopt the N17
  stale-data contract.
- **Routing / e2e.** The ICT Committee e2e is rewritten for `/?view=ict-committee`
  (redirect + addressability + capability normalization); three-theme `ThemedSelect`
  computed-style + contrast coverage was added.

### 1.3 What "COMPLETE" means here

Automated remediation is **complete and enforced**. It does **not** by itself establish
WCAG 2.2 AA conformance, and it does **not** substitute for the human passes in §2–§3.
A green machine gate is a **necessary, not sufficient**, precondition for the merge
decision in §4.

---

## 2. Manual / assistive-technology matrix (HUMAN-OWNED — UNCHECKED)

Every row below is **pending** and must be completed by a human operating real
assistive technology against HEAD `669b9cc4`. An automated agent **cannot** run screen
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
landed as the 7 commits `0fe16977..669b9cc4`, which (a) reconciled the false dispositions,
(b) brought the **full final automated gate** to green and **enforced** the a11y baselines
(§1), and (c) scheduled the **still-pending human manual/AT pass** (§2–§3) and the
user-triggered ultrareview (§5) as explicit, un-checked gates before merge. The
compensating control substitutes a single rigorous **final** automated gate + a pending
human pass for the missing **per-phase** gates; it does not retroactively satisfy them.

---

## 5. Remaining human-owned items (all PENDING)

- [ ] pending (human) — Complete the manual / AT matrix in §2 and the C6 reproduction in §3.
- [ ] pending (human) — Run the user-triggered **`/code-review ultra`** (ultrareview) against HEAD `669b9cc4`.
- [ ] pending (human) — Make the **merge decision** for `dora` once §2–§3 pass (with C6 recorded as an accepted limitation) and §5 ultrareview is clean.

Until every box above is checked by a human, `dora` is **not** established as
merge-ready by this record, regardless of the green automated gate in §1.
