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
| Under verification | The complete forward-only **Round-3 remediation range** (`924442ac..HEAD`) on 2026-07-13. This record cannot cite its own final documentation commit, so `HEAD` means the commit containing this record. |
| Automated-remediation range | Round 1 `0fe16977..669b9cc4`; Round 2 `36f579ad..c8a7f7cd`; **Round 3 `924442ac..HEAD`**: native controls + danger tokens; validated two-level dialog inventory; 29-case real unit matrix; 48-site browser matrix plus exact registry assertion; `ci`-project collection/fallback enforcement; strict-zero jsx-a11y + axe policy; owner-keyed department state; canonical E2E repairs; documentation truth reconciliation. |
| Automated-gate environment | macOS (Darwin 27.0.0), canonical E2E under bundled Node `v24.14.0`, system `python3` |
| Assistive-tech environment | **to be recorded by the human tester** (OS + browser + AT versions) |

---

## 1. Automated evidence (automated remediation COMPLETE — VERIFIED)

These gates are machine-checkable. They were rerun sequentially on the final implementation tree
on 2026-07-13. The subsequent closeout-only documentation commit does not change application or
test behavior. The manual/AT status is unchanged.

> **Round-3 correction (2026-07-13).** The 26 implementation owners are not the complete
> application inventory: the validated manifest contains **48 concrete render sites** and
> **5 non-dialog surfaces**. The unit matrix executes **29 unique owner/variant cases**, while
> Playwright executes all **48 application render sites** plus one registry-integrity assertion.
> Twenty component-owned sites use source-owner harnesses and 28 page-owned sites drive real
> authenticated routes; no driver mounts a leaf dialog directly. The JSX and axe JSON files are exact,
> empty audit evidence; neither has a fingerprint, ratchet, deviation, capture, or update path.

### 1.1 Full quality gate

| Gate | Command | Result |
|---|---|---|
| TypeScript + production build | `npx tsc --noEmit`; `npm run build` | PASS — 4,026 modules transformed |
| Unit + component tests | `npm run test:run` | PASS — 268 files / 1,368 tests |
| Lint (a11y enforced) | `npm run lint` | PASS — strict-zero: 0 findings, 0 baseline entries, 0 suppressions |
| i18n parity | `npm run i18n:test` | PASS — 20 namespaces; 630 source files; 8 files / 44 tests |
| Dialog inventory + matrix | `npm run lint:dialog-inventory`; focused Vitest | PASS — 26 implementation owners / 48 render sites / 5 non-dialog surfaces; 29/29 unit cases |
| Playwright collection | `npm run e2e:a11y:collect` | PASS — all three required accessibility specs collected by `ci` |
| Accessibility specs, bundled Chromium fallback | unset `PLAYWRIGHT_CHROMIUM_CHANNEL`; three specs on `--project=ci --workers=1` | PASS — 59/59 |
| Canonical E2E, system Chrome | full `playwright --project=ci --workers=1` | PASS — 371 passed / 22 intentionally skipped / 0 failed (393 collected) |
| Authz capability contract | `python3 scripts/security/validate_authz_capability_contract.py --base-ref origin/main` | PASS |
| Repository contracts | `AUTHZ_CONTRACT_BASE_REF=origin/main make -f scripts/Makefile quality-repo-contracts` | PASS — including 19/19 repo-hygiene tests |
| Documentation topology | `make -f scripts/Makefile docs-topology-consistency` | PASS — contract, README coverage, canonical tree, structure metrics |
| Patch hygiene | `git diff --check` | PASS |

### 1.2 Accessibility state (strict-zero policy)

- **jsx-a11y is direct strict-zero.** Every enabled recommended rule is enforced as an error;
  plugin rules intentionally disabled remain `off`. `jsx-a11y-baseline.json` is audit evidence
  only and must be well-formed with `count: 0, entries: []`; `eslint-suppressions.json` must be an
  empty object. Any finding, malformed/non-empty evidence, or suppression fails. There is no
  write, fingerprint, base-ref anchor, ratchet, deviation, or update workflow. A future exception
  mechanism requires a separate policy change and tracked approval.
- **axe is direct strict-zero.** `accessibility-axe-baseline.json` must contain exactly the `ci`
  project, three themes, and 11 required routes, with every cell an empty array. The helper
  validates that complete shape before scanning and fails directly for every finding selected by
  the pinned WCAG tags, without impact filtering or rule exclusions.
- **Stateful browser gate.** `dora-ux-stateful-a11y.spec.ts` scans the five representative state
  groups in riskhub/light/dark and separately drives a real `AccessEditModal` containing a
  portalled `ThemedSelect`: the dialog stays open, focus moves into the listbox, Tab remains in the
  active interaction layer, the first Escape closes only the listbox, and the second closes the
  dialog and restores the opener. Axe reports zero with no exclusions.
- **Dialog / overlay contract.** The canonical descriptor records 26 implementation owners,
  48 application render sites, and 5 non-dialog surfaces. The validator discovers owners and
  consumers from source and requires exact agreement. The unit matrix executes 29 real
  owner/variant cases, including production `ControlRiskLoadingOverlay`; the browser matrix
  executes all 48 render sites plus one exact registry assertion. Twenty sites mount production
  source parents through owner harnesses and 28 drive real authenticated routes; no driver mounts
  a leaf dialog directly. Unexpected network, console, uncaught, and React `act` output fail.
- **Native controls + tokens.** Execution-history disclosure and issue creation are separate
  native buttons; KRI/control pseudo-buttons are removed. `ConfirmDialog` consumes
  `bg-destructive text-destructive-foreground`; all three theme pairs and the 90% hover fill meet
  the 4.5:1 test, using a near-black foreground in riskhub/dark and white in light.
- **Department ownership.** Metadata and every tab state are keyed by department owner ID. An
  A→B route change hides A synchronously; delayed A responses remain rejected; B error/retry,
  totals, and archived-only vendor behavior are covered while the public hook shape stays stable.
- **CI execution.** The collection guard requires all three accessibility specs. The workflow
  always runs `--project=ci`; it unsets the Chrome channel and uses bundled Chromium when system
  Chrome is unavailable instead of selecting another project.

### 1.3 What "COMPLETE" means here

Automated remediation is **implemented and verified by the final sequential rerun.** A green
machine gate is a **necessary, not sufficient**, precondition for merge: it does
**not** by itself establish WCAG 2.2 AA conformance, and it does **not** substitute for the
human passes in §2–§3 or the user-triggered ultrareview in §5. Those remain outstanding, so
"complete" here means the **automated remediation** is done — not that the workstream is
verified for merge (§4).

---

## 2. Manual / assistive-technology matrix (HUMAN-OWNED — UNCHECKED)

Every row below is **pending** and must be completed by a human operating real
assistive technology against the Round-3 range tip (`924442ac..HEAD`). An automated agent **cannot** run screen
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

**Compensating control (what was actually done instead):** corrective remediation landed in
Round 1 (`0fe16977..669b9cc4`), Round 2 (`36f579ad..c8a7f7cd`), and the forward-only Round 3
range (`924442ac..HEAD`). Round 3 removes the remaining copied test surface, render-site gap,
branch-widenable policy, custom keyboard emulation, and department ownership race, then runs the
full final automated gate sequentially. It keeps the **still-pending human manual/AT pass**
(§2–§3) and user-triggered ultrareview (§5) as explicit, unchecked gates before merge. The
compensating control substitutes a single rigorous **final** automated gate + a pending
human pass for the missing **per-phase** gates; it does not retroactively satisfy them.

---

## 5. Remaining human-owned items (all PENDING)

- [ ] pending (human) — Complete the manual / AT matrix in §2 and the C6 reproduction in §3.
- [ ] pending (human) — Run the user-triggered **`/code-review ultra`** (ultrareview) against the Round-3 tip (`924442ac..HEAD`).
- [ ] pending (human) — Make the **merge decision** for `dora` once §2–§3 pass (with C6 recorded as an accepted limitation) and §5 ultrareview is clean.

Until every box above is checked by a human, `dora` is **not** established as
merge-ready by this record, regardless of the green automated gate in §1.
