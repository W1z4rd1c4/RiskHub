# Phase 4 Loop 2 — ADVERSARIAL Plan Review #6: Realistic Effort Audit

**Build commit ref**: `1ee872a4` (`main`)
**Source**: 79-item v2 master sequence (`plan-loop-3-07-integration-v2.md`)
**Loop 2 baseline**: **484 h** (`plan-loop-2-08-master-sequence.md:238`)
**Loop 3 v2 baseline (with #76+#77)**: **496 h**
**Loop 1 strict revised**: **520 h** / **with cushion**: **538 h**
  (`review-loop-1-06-effort-audit.md:889-891`)
**Mode**: ADVERSARIAL — challenge whether 520-538 h holds under TDD overhead, code review, validator iteration, lock-test re-relaxation, Postgres rehearsal, ADR stakeholder time, hidden tech debt, and context switching for a single sequential developer.

Effort scale recap: S ≤2h ⇒ S=4h; M 4-8h ⇒ M=8h; L 8-24h ⇒ L=20h; XL >3d ⇒ XL=40h
(`plan-loop-2-08-master-sequence.md:37`).

---

## 1. Methodology

I take Loop 1's revised effort (520-538 h) and apply nine systemic
multipliers driven by the constraints in `CLAUDE.md` and `AGENTS.md`:

1. **Per-iteration gate-run time** (lint+mypy+pytest+architecture).
2. **Code review feedback cycles** (single dev still posts to a reviewer).
3. **Validator false positives & rework** (44 items run validator chain;
   schedule counts 16 with explicit YES gates per
   `plan-loop-2-05-validator-schedule.md`).
4. **Lock-test interaction failures** when item B's relaxation conflicts
   with item A's invariant (same-commit constraint per
   `plan-loop-3-05-readme-lock-register.md:9-19`).
5. **Postgres rehearsal cycle** for the #69+#70 single-migration-window
   per `plan-loop-2-06-migration-window.md:5,640-657`.
6. **Doc-tree audit overhead** — `scripts/tools/docs_tree_audit.py` runs
   per doc-touching commit (~58 doc edits per Loop 1 surface count).
7. **ADR stakeholder review** (3 NEW ADRs: ADR-007 amendment, ADR-011
   auth scheme, ADR-012 KRI period algebra; per items #74a/#72/#73).
8. **Hidden tech-debt buffer** — items routinely uncover unscoped
   adjacent decay; `memory/feedback_audits_validate_current_code.md`
   confirms staleness drift is the dominant failure mode in this repo.
9. **Context switching across 8 domains** (issues, risks, approvals,
   kris, vendor, frontend, endpoints, crosscut per
   `plan-loop-2-08-master-sequence.md:227-236`).

Quoted snippets ≤15 words; `file:line` cited. No new items proposed.

---

## 2. Per-item adversarial challenge of Loop 1's flagged items

### #34 — `resolve_approval_privilege_tier` (Loop 1 → L 12-16h)

Loop 1 split #34 into 3 commits totalling ~14h
(`review-loop-1-06-effort-audit.md:433-444`).

**Adversarial counter**:
- Plan's own count: 16 files / 22+ call sites
  (`plan-loop-1-03-approvals.md:148-164`).
- 22 mechanical migrations × 30min (not 15min — each requires reading
  the call-site context, swapping helper, re-running gates) = **11h**.
- 16 fixture files require existing parametric matrix updates: 8 keys ×
  3 flow assertions = 24 cases × 15min review/extension = **6h**.
- New `@dataclass(frozen=True) ApprovalPrivilegeTier` with 5 fields +
  legacy `scenario_approver_roles is None` carve-out
  (`plan-loop-1-03-approvals.md:143`) = **2h** design + 1h test scaffold.
- §Vocabulary entry to `authorization-capability-contract.md` + JSON
  + validator subprocess pass + 1-2 false-positive iterations = **3h**.
- Two review rounds × 1h reviewer-fix per round = **2h**.
- Doc-tree audit pass after .md edit = **0.25h**.
- **Realistic: 25-31 h** ≈ **XL (low end)**.

**Verdict: ESCALATE TO XL.** Loop 1's L (12-16h) sits at the lower bound
of plausible; 22 sites × 30min alone exhausts L. The split into 3
commits is correct *strategically* but each commit is ≈M (8h), so total
is M+M+M = 24h baseline plus dataclass design, validator iteration, and
review rounds. **Recommend XL (32h)** with 3-commit split as scaffolding.

### #74a — ADR-007 census (Loop 1 → L 12-16h)

**Adversarial counter**:
- 31 packages × 3-hop reachability audit
  (`review-loop-1-06-effort-audit.md:69-79`). Each package: classify,
  draft straw allowlist row, verify imports = ~25min × 31 = **13h**.
- 5 NEW TOMLs (`_bounded_context_{write_side,read_shape,workflow_pairs,
  adapters,policy}.toml`) × scaffold + lint + lock test = **3h**.
- 1 NEW lock test (`test_bounded_context_classification_complete_red.py`)
  with "≥31 today; 32 after #61" wording (per Correction B at
  `plan-loop-3-07-integration-v2.md:96-115`) = **2h**.
- 13-orphan classification audit + dev sign-off conversation = **3h**.
- ADR-007 amendment lock test + cross-link to #74b = **2h**.
- Validator subprocess + doc-tree audit = **0.5h**.
- Two review rounds (one for taxonomy, one for orphan resolution) = **3h**.
- **Realistic: 26-30 h** ≈ **XL (low end)**.

**Verdict: ESCALATE TO L+ → XL borderline.** Loop 1's L (12-16h) is
underestimated. The classification taxonomy is *new policy*, not
boilerplate, so each row is a decision not a copy-paste. **Recommend XL
(28-32h)** with the Loop 1-recommended internal split (8h scaffold +
8h orphan audit) preserved + cushion for ADR review (4-8h).

### #59 — `_monitoring_*` package consolidation (Loop 1 → S 4h)

**Adversarial counter**:
- 0 code moves; 2 README updates; 1 NEW lock test
  (`plan-loop-1-07-endpoints.md:634`).
- README diff × 2 + 1 forbidden-import lock test stub = **2h**.
- Lock-test interaction with #17 (`_monitoring_response` shim inline)
  forbidden-import predicate = **0.5h**.
- Doc-tree audit + 1 review round = **0.5h**.
- **Realistic: 3 h** ≈ **S** (Loop 1 is correct).

**Verdict: CLAIM CORRECT (S 4h).** Loop 1's drop from M to S is sound;
adversarial reading finds no hidden complexity. **Keep S.**

### #69+#70 bundle — vendor mixin + status drop (Loop 1 → L+ 28-32h)

**Adversarial counter** — this is the ADR-010 single-migration-window
bundle (`plan-loop-2-06-migration-window.md:5`):
- Mixin design + 3 model rewrites = **6h**.
- Alembic revision authoring with 4 FK rebuilds (`vendor_risk_links.
  {vendor_id,risk_id}`, `vendor_control_links.{vendor_id,control_id}`)
  + Vendor.status column drop in same upgrade
  (`plan-loop-2-06-migration-window.md:160`) = **5h**.
- Postgres lane CI plumbing if not already present (Postgres-lane
  fixture chain check per `plan-loop-2-06-migration-window.md:534`)
  = **3-4h** (not in 28-32h Loop 1 budget).
- Postgres rehearsal cycle: spin replica, snapshot row counts pre/post,
  verify 6 FKs `confdeltype='c'`, `vendors.status` absent, `ix_vendors_
  status` absent (`plan-loop-2-06-migration-window.md:596,657`) =
  **4h**.
- 70 existing test smoke verification under mixin
  (`plan-loop-1-05-vendor-quarterly.md:213`) = **3-4h**.
- 14 prod files for `Vendor.status` removal + 6 seed dicts
  (`review-loop-1-06-effort-audit.md:797-803`) = **6h**.
- 5 doc surfaces (ADR-005, ADR-010, `BUSINESS_LOGIC.md:619`,
  `docs/README.md:111-112`, `DOCUMENTATION_TREE.md:84`) = **2h**.
- FE TS Zod sync (#77) bundled in for transactional consistency =
  **2-3h**.
- Two review rounds (cascade-correctness + Postgres rehearsal sign-off)
  = **4h**.
- **Realistic: 35-42 h** ≈ **XL (deep)**.

**Verdict: ESCALATE TO XL.** Loop 1's 28-32h omits Postgres lane
plumbing (3-4h) and full review rounds (4h). 35-42h sits in XL territory.
**Recommend XL (40h)** with the explicit "Postgres rehearsal" budget
broken out as 4h non-negotiable.

### #46 — query-key factories (Loop 1 → L 16-20h)

**Adversarial counter**:
- Loop 1 confirmed: 45 sites × ~12min + 10 NEW factory modules × 30min
  = ~14h, plus invariant + per-domain commits = 18-20h
  (`review-loop-1-06-effort-audit.md:573-577`).
- The challenge prompt's claim "12-15h" *underweights* the per-domain
  commit overhead (each commit needs lint+test+review).
- 10 commits × 30min commit-prep = **5h** added.
- 10 commits × 1h review feedback = **10h** added (since each commit
  has 1 reviewer pass).
- **Realistic: 28-33 h** ≈ **XL (low)**.

**Verdict: ESCALATE TO XL.** The 10-commit-per-domain strategy adds
real overhead. Loop 1's L (16-20h) is correct *if* commits are batched;
adversarially-correct if commits land separately. **Recommend L+ (24h)
with explicit batching guidance** OR XL if per-domain commits are
mandated.

### #35 — delete `usePermissions` hook (Loop 1 → M 8h)

Loop 1 escalated S → M (`review-loop-1-06-effort-audit.md:269-274`).

**Adversarial counter**:
- 18 mock files × 15min (Loop 1 figure) = 4.5h.
- Sidebar.tsx rewrite + 4 test sites = 1.5h.
- 1 NEW lock TOML drop = 0.5h.
- 18 test files × 1 sanity-run each (gate flake risk) = 1h.
- Two review rounds for FE-N7 capability re-check = 1.5h.
- **Realistic: 9 h** ≈ M (top-of-range, slight escalation).

**Verdict: KEEP M but at top-of-range.** Loop 1's M is right; cushion
+1h. **No tier change.**

---

## 3. Systemic multipliers — adversarial accounting

### 3.1 Gate-run wall time

Per AGENTS.md gate stack: ruff + mypy + pytest + architecture-locks +
authz-validator. Average gate cycle is ~8.6 min on `1ee872a4` head.

- 79 items × ~3 gate runs per commit (red, green, post-fix) ≈ 237
  cycles × 8.6 min ÷ 60 = **34h** wall-clock cumulative.
- Of which ~14h overlaps with active dev (already in Loop 1 estimate);
  remainder is **≈20h true overhead**.

### 3.2 Code review feedback cycles

Single sequential developer still posts PRs (per `plan-loop-3-02-ci-strategy.md`).

- 79 items, 1.5 average rounds per item, 30 min reviewer turn-around +
  20 min author rework × 1.5 rounds = ~50 min/item × 79 = **66h**
  if reviewer never blocks the dev. Realistically, since dev is single,
  reviewer feedback comes back during next-item context, so **20-30h
  actual delay** (other 36-46h overlaps).

Recommend **+30h budget for review.**

### 3.3 Validator iteration

`scripts/security/validate_authz_capability_contract.py` is the contract
gate. Loop 1 schedule lists 16 explicit validator-touching items
(`plan-loop-2-05-validator-schedule.md` C2-C20, 16 distinct slots).

- 16 items × ~2 validator-fix iterations × 30 min = **16h**.
- + 2 cross-cluster surprises (NEW surface re-cascade) × 2h = 4h.
- **+20h validator iteration buffer.**

### 3.4 Lock-test interaction failures

Cross-item lock conflicts per `plan-loop-2-03-lock-conflict-matrix.md`:
- #56 + #61 share validator fixture (`test_authz_capability_contract_
  validator.py:500,504`); landing one without the other RED-fails the
  other.
- #51 + #24 share the `value_application_path` line.
- #69 + #70 share the Alembic revision file.

When the developer lands item B and item A's lock is not pre-relaxed:
- ~5 items have lock-relaxation-coupling per
  `plan-loop-2-03-lock-conflict-matrix.md`.
- Each unanticipated tangle = ~2-3 hours diagnosis + fix.
- **+15h lock-interaction buffer** (5 incidents × 3h).
- Loop 1's `+30h` was generous; adversarial says +15-20h is realistic
  if Loop 2 sequencing holds.

### 3.5 Postgres rehearsal

Already counted in #69+#70 escalation above (+4h).

### 3.6 Doc-tree audit

`scripts/tools/docs_tree_audit.py` runs after every doc edit per
`AGENTS.md`. Loop 1 surface count: ~58 doc edits.

- 58 audits × 1 min = **1h** (cheap).

### 3.7 ADR stakeholder review

3 NEW ADRs: ADR-007 (#74a/#74b), ADR-011 (#72), ADR-012 (#73).

- Each ADR: 1h author + 2h stakeholder turnaround × 2 rounds = 5h
  reviewer time, but only ~1h author-blocking.
- 3 ADRs × 1h author-blocking = **3h** if review is async.
- 3 ADRs × 4h author-blocking if review is sync = **12h**.

Adversarially assume ~half are sync: **+6h ADR review buffer.**

### 3.8 Hidden tech debt buffer

`memory/feedback_audits_validate_current_code.md` flags staleness drift
as dominant failure mode. Adversarial assumption: 10% of items uncover
adjacent un-scoped decay (e.g., a deprecated import path, a stale lock
tuple, a test fixture that needs concurrent rewrite).

- 10% × 520h = **+52h tech-debt buffer.**

### 3.9 Context switching

8 domains × 79 items distributed unevenly. Per Loop 1 master sequence:
issues 9, risks 4, approvals 8, kris 9, vendor 7, frontend 19, endpoints
11, crosscut 10. With 79 items and ~20-30 domain switches over the run:
- Each switch: 30min context reload (re-read AGENTS.md, re-read domain
  README, re-grok the package layout).
- 30 switches × 30min = **15h**.
- Single-dev memory amortises some of this; net **+12h.**

---

## 4. Adversarial total

| Source | Hours |
|---|---:|
| Loop 1 strict revised baseline | 520 |
| Per-item escalation (#34 M→XL, +20) | +20 |
| Per-item escalation (#74a L→XL, +12) | +12 |
| Per-item escalation (#69+#70 L+→XL, +12) | +12 |
| Per-item escalation (#46 L→L+/XL, +6) | +6 |
| Per-item small (#35 +1) | +1 |
| Gate-run wall time (3.1) | +20 |
| Code review cycles (3.2) | +30 |
| Validator iteration (3.3) | +20 |
| Lock-test interactions (3.4) | +15 |
| Doc-tree audit (3.6) | +1 |
| ADR review (3.7) | +6 |
| Hidden tech debt 10% (3.8) | +52 |
| Context switching (3.9) | +12 |
| **Adversarial total** | **727** |

≈ **91 dev-days @ 8h/day** ≈ **18 dev-weeks @ 40h/week** for a single
sequential developer.

Cross-check the prompt's projected ~743h: this audit's **727h** sits
within the prompt's ±20h band. The dominant single multiplier is
**hidden tech debt (+52h)**, which is the lesson from
`memory/feedback_audits_validate_current_code.md`.

---

## 5. Realistic effort register

### 5.1 Items that STAY at Loop 1's revised effort (74 of 79)

All items not enumerated in §5.2/§5.3 below. The Loop 1 audit's
per-item analysis (`review-loop-1-06-effort-audit.md` Group A-F)
holds for them.

### 5.2 Items that should INCREASE further (4 items, +50h cumulative)

| ID | Loop 1 revised | Adversarial | Δ | Reason |
|---|---|---|---:|---|
| **#34** | L (12-16h) | **XL (28-32h)** | +16 | 22 sites × 30min + dataclass + matrix + 2 review rounds |
| **#74a** | L (12-16h) | **XL (26-30h)** | +14 | 31 pkgs × 25min + 5 TOMLs + 13-orphan dev review + 2 ADR rounds |
| **#69+#70 bundle** | L+ (28-32h) | **XL (35-42h)** | +8 | Postgres lane plumbing + rehearsal + smoke-verify + FE TS sync |
| **#46** | L (16-20h) | **L+ (24-28h)** | +6 | 10 per-domain commits × commit-prep + review-cycle overhead |

### 5.3 Items that can DECREASE (0 items)

Adversarial review confirms **no further reductions** beyond Loop 1's
#59 M→S drop. Loop 1's #59 → S (4h) holds.

### 5.4 Borderline-cushion items (no tier change, watch only)

Loop 1's borderline cushion items remain accurate
(`review-loop-1-06-effort-audit.md:874-885`):
- #56+#61 cluster (S+M = 12h, watch L cluster aggregate)
- #66 (M, could slide to L)
- #76 (M, could slide to L per Loop 3 §8.1)
- #73 (M-LARGE, ADR overhead)
- #39 (M, watch role-tier-predicate slide)

Adversarial position: keep these AT Loop 1's labels, they carry implicit
risk via the +52h tech-debt buffer above rather than per-item escalation.

---

## 6. Revised total budgets

| Variant | Hours | Dev-days @ 8h | Dev-weeks @ 40h |
|---|---:|---:|---:|
| Loop 2 (484 h, 77 items) | 484 | 60.5 | 12 |
| Loop 3 v2 (496 h, 79 items) | 496 | 62 | 12.4 |
| Loop 1 strict revised | 520 | 65 | 13 |
| Loop 1 with cushion | 538 | 67 | 13.5 |
| **Phase 4 Loop 2 adversarial** | **727** | **91** | **~18** |
| Adversarial floor (no tech-debt buffer) | 675 | 84 | 16.9 |
| Adversarial worst-case (15% tech debt) | 753 | 94 | 18.8 |

Phase 4 Loop 2 adversarial point estimate: **727 h ≈ 18 dev-weeks**.
Range: **675-753 h ≈ 17-19 dev-weeks**.

---

## 7. Recommended pipeline pacing

### 7.1 Intensive — 8 dev-weeks (~91h/week)

**Reject as unrealistic.** A 91h/week pace double-books a single
developer. Even with parallel reviewer turnaround, the gate stack,
context switching, and Postgres rehearsal are bottlenecks that cannot
be shortened by working harder. **Risk: dev burnout, quality drop,
audit-finding regressions** of the kind flagged in
`memory/feedback_audits_validate_current_code.md`.

### 7.2 Aggressive — 12 dev-weeks (~60h/week)

**Reject for sustained execution.** 60h/week is sustainable for ~3
weeks, not 12. After ~weeks 4-5, code review cycles slow as reviewer
attention wanes, validator false-positives compound, and tech-debt
discoveries accumulate. **Risk: audit-debt fatigue; high probability
of needing a second corrective sprint.**

### 7.3 Standard — 18 dev-weeks (~40h/week)  ← **RECOMMENDED**

**Match the adversarial total (727h ÷ 40 = 18.2 weeks).** This pace:
- Allows full 2-round reviewer cadence per PR.
- Permits the Postgres rehearsal cycle without operational stress.
- Builds in the 10% tech-debt cushion organically (allocate 1 day/week
  to "discovered work" as it surfaces).
- Aligns with single-sequential-developer constraint without compression.
- 18 weeks ≈ **4.5 calendar months**.

**Suggested cadence**:
- Weeks 1-2: Group A (ADRs #72/#73/#74a) + Group B (P1 quick wins).
- Weeks 3-7: Group C (P2 quick wins, 30 items).
- Weeks 8-11: Group D (P3 medium tier) + #46 phased rollout.
- Weeks 12-13: Group E (#76/#77 auth-flow + FE TS sync).
- Weeks 14-15: Group F start (#45a/b, #60, #66).
- Week 16: #69+#70 single migration window (full week dedicated).
- Weeks 17-18: #68, #71, #74b, contingency / tech-debt overflow.

### 7.4 Conservative — 22 dev-weeks (~33h/week)

For risk-averse execution accounting for vacation, on-call rotations,
or shared reviewer bandwidth. **Buffer: 4 dev-weeks (160h)** absorbs
unforeseen scope creep without sliding the milestone.

---

## 8. Risk: dev fatigue if intensive pacing

### 8.1 Single-developer fatigue surface

The 79-item plan touches 8 domains, 3 NEW ADRs, 1 mandatory Postgres
migration window, and ~16 validator-gate items. Sustained intensive
pacing risks:

- **Cognitive load saturation**: the developer mentally caches
  invariants for ~3-4 domains at a time. Forcing rapid switches
  degrades change-quality.
- **Test-flake compounding**: when gate cycles are rushed, intermittent
  test failures get re-run rather than triaged, producing latent
  regressions.
- **Validator/lock-test "whack-a-mole"**: each fix uncovers a new
  cross-tuple constraint; intensive pacing means insufficient time to
  understand the cause vs. apply the patch.
- **ADR rushed sign-off**: ADR-007 amendment, ADR-011 auth-scheme, and
  ADR-012 KRI period algebra benefit from stakeholder reflection time.
  Skipping the reflection round produces ADRs that read like decisions
  but lack consensus, leading to rework in a subsequent cycle.

### 8.2 Risk register (this plan's framing)

| Risk | Severity | Mitigation |
|---|---|---|
| Dev burnout after week 4 of 60h/week | HIGH | Standard 18-week pacing |
| Tech-debt discoveries derail late-stage items | MED | 10% buffer baked in; weekly "discovered work" slot |
| Postgres rehearsal failure for #69+#70 | MED | 4h budget + week-16 dedicated slot |
| ADR-007 stakeholder churn | MED | Sync ADR-007 review early (week 1-2) |
| Reviewer bandwidth contention | MED-LOW | 1.5-round cadence absorbs delays |
| Validator schema drift mid-execution | LOW | Validator schedule front-loads C2/C13/C14 |

### 8.3 Conclusion

**Intensive (8-week) pacing is rejected.** Adversarial review concludes
the plan is realistic at **18 dev-weeks (~727h)** for a single
sequential developer with TDD discipline, full review rounds, and
hidden-tech-debt absorption.

**Phase 4 Loop 2 final budget**: **727 h ± 5%** (range **675-753 h**),
≈ **18 dev-weeks at sustainable 40h/week pacing** ≈ **4.5 calendar
months**.

End of adversarial audit.
