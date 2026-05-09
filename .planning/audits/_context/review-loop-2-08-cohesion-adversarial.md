# Phase 4 Loop 2 — Cohesion Resolution Adversarial Review

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Build commit
ref: `1ee872a4` (`main`). Today: 2026-05-09.

**Mode**: ADVERSARIAL — challenges Loop 1's cohesion-resolution plan
(`review-loop-1-08-cohesion-resolution.md`) which answered 14 open
questions, made 5 cohesion edits, and proposed an 8-wave structure.

**Constraints (re-stated)**: single sequential developer; TDD red→green;
doc/lock-only Reject items; Defers planned not skipped.

**Process**: every Loop 1 answer is challenged; the Phase 4 Loop 2
priorities at `review-loop-1-08-cohesion-resolution.md:768-846` are
treated as the **target list** to attack. New corrections go in §3 below.

---

## 1. Conflict resolution — three direct disagreements

These three items had explicit divergence between Loop 1 §A7 and Loop 1
§A8 that the orchestrator demanded a decision on.

### 1.1 5th category name — `Cross-cutting` (A7) vs `Core` (A8)

- **Loop 1 §A7 stance**: `Cross-cutting` (per the prose at
  `plan-loop-3-08-cohesion.md:551-554` quote *"core because it matches
  the prose phrase 'core cross-cutting policy'"* — wait, A8 actually
  argued for `Core`; A7's earlier preference was `Cross-cutting`).
- **Loop 1 §A8 stance**: `Core` (per
  `review-loop-1-08-cohesion-resolution.md:128-148`).
- **Loop 2 challenge**: the only material risk is **collision with
  `backend/app/core/`**. ADR-007 amendment text reaches reviewers
  who already pattern-match "core" → `app/core/security.py`. A
  TOML named `_bounded_context_core.toml` will sit beside files
  like `test_w12_get_current_user_isolation_red.py` (per
  ADR-011) which references `app.core.security`. The collision is
  unavoidable in mental indexing.
- **Loop 2 verdict**: **ACCEPT `Core`** (Loop 1 §A8's choice).
- **Rationale**: per `plan-loop-3-06-adr-drafts.md:299` quote *"core
  because it matches the prose phrase 'core cross-cutting policy'"*.
  Mitigation: Loop 1's choice of TOML name `_bounded_context_core.toml`
  and prose phrasing *"core (cross-cutting policy) contexts"*
  preserves the disambiguator. `Cross-cutting` as a TOML name is
  hyphenated and awkward; `Policy` overloads `_authorization_capabilities`'s
  policy DSL.

### 1.2 `_orphaned_items` classification — Workflow-paired (A7) vs Read-shape (A8)

- **Loop 1 §A7 stance**: Workflow-paired with `_admin_telemetry`.
- **Loop 1 §A8 stance**: Read-shape (per
  `review-loop-1-08-cohesion-resolution.md:46-65`).
- **Loop 2 challenge**: re-read the package docstring at
  `backend/app/services/_orphaned_items/__init__.py:1` (per
  Loop 1 §A8's citation) reads *"Internal implementation for orphaned
  item management."*. The word **management** is ambiguous —
  it spans both listing and repair. The strong evidence is **whether the
  package commits writes**: ADR-002 mandates write-side mutators
  (`_entity_mutation_lifecycle`, `_approval_execution`) own commits;
  if `_orphaned_items` only **reads** to surface orphans (and repair
  flows through canonical mutators), Read-shape is correct.
- **Loop 2 verdict**: **ACCEPT Read-shape**.
- **Rationale**: per `plan-loop-3-06-adr-drafts.md:260` quote
  *"Orphan-listing projection; repair writes flow through canonical
  mutators per ADR-002"*. The amendment table is internally
  consistent and Loop 1 §A8's reasoning that the listing surface
  dominates is defensible. **Caveat**: if the dev later finds that
  `_orphaned_items` does in fact contain `db.commit` calls, reclassify
  in a follow-up commit (single-line TOML edit).

### 1.3 `_notification_inbox` — Workflow-paired (both A7+A8 agree)

- **Loop 1 §A7 stance**: Workflow-paired with `_admin_telemetry`.
- **Loop 1 §A8 stance**: Workflow-paired with `_admin_telemetry`.
- **Loop 2 challenge**: both Loop 1 cohorts agree. The risk is that
  **Adapter** is also defensible — notification dispatch is fundamentally
  an adapter to external systems (SMTP, push, etc.). However, ADR-003
  specifies adapters translate **external system exceptions** to
  RiskHub `DomainError`. `_notification_inbox` does NOT translate
  external exceptions; it owns notification dispatch lifecycle.
- **Loop 2 verdict**: **CONFIRM Workflow-paired with `_admin_telemetry`**.
- **Rationale**: per `plan-loop-3-06-adr-drafts.md:295` quote *"the
  workflow-side `lifecycle` import surface at
  `backend/app/services/_notification_inbox/__init__.py:1`"*. The
  surface is workflow-side, not adapter-side; the pairing with
  `_admin_telemetry` is for atomic sweep semantics (notification dispatch
  events sweep with telemetry observers).

---

## 2. Loop 1 14-answer challenge

Each Q from Loop 1's §1 (7 ADR-draft Qs) and §2 (7 integration-v2 Qs)
gets a Loop 2 adversarial pass.

---

### Q-A: ADR status — Accepted (Loop 1) vs Proposed (challenge)

- **Loop 1 answer**: `Accepted` (per
  `review-loop-1-08-cohesion-resolution.md:30-41`).
- **Loop 2 challenge**: the Phase 4 resolution plan **cannot pre-Accept
  an ADR before stakeholder review**. ADR-001..010 were Accepted at
  draft time because each was authored by a stakeholder (the developer)
  via direct decision. ADR-011/ADR-012/ADR-007 amendment, however,
  emerge from a multi-loop planning process where stakeholder review is
  only at Phase 6. Should they ship as `Proposed` until Phase 6 ratifies?
- **Loop 2 verdict**: **ACCEPT `Accepted`** but with caveat.
- **Rationale**: per `plan-loop-3-06-adr-drafts.md:308` quote *"every
  existing ADR uses Accepted (lines 5 of each file)"*. The lock test
  scans `docs/adr/ADR-*.md` for a `## Status` regex; introducing
  `Proposed` would either need a separate enum extension (more lock
  surface) or fire the lock immediately. The ADR-text-and-acceptance
  in the same commit is an established repo convention.
- **Caveat**: `Accepted` here means **architecture-lock-test accepted**;
  the human stakeholder review at Phase 6 can demand a revision in a
  follow-up amendment commit (which would itself land as `Accepted`,
  per repo precedent). If a stakeholder vetoes the ADR, the rollback
  procedure in each ADR §Rollback Strategy applies.
- **Caveat formalised**: add a one-paragraph note to the resolution
  plan under §1.1 stating *"Accepted means architecture-lock-test
  accepted; stakeholder veto at Phase 6 triggers ADR amendment, not
  status downgrade"*.

---

### Q-B: `_register_listings` dual-class — disjointness lock semantics

- **Loop 1 answer**: dual-class allowed; assertion shape at
  `review-loop-1-08-cohesion-resolution.md:107-116` uses a frozenset
  `DUAL_CLASS_ALLOWLIST = {"_register_listings"}`.
- **Loop 2 challenge**: Loop 1's pseudocode shape is correct in
  spirit but glosses over how the lock test handles the "exactly-one
  except `_register_listings`" semantics in plain prose for the ADR-007
  amendment. Reviewer reading the ADR text sees:
  > Every package appears in EXACTLY ONE TOML, with the explicit exception
  > of `_register_listings` which appears in both `_bounded_context_write_side.toml`
  > and `_bounded_context_read_shape.toml`.

  The risk: a future maintainer reading the lock test sees the
  `frozenset({"_register_listings"})` and treats it as a generic allowlist —
  appending other packages to it without an ADR amendment. The lock test
  itself doesn't enforce that the allowlist is single-element.
- **Loop 2 verdict**: **OVERRIDE — strengthen the lock**.
- **Rationale**: per `plan-loop-3-06-adr-drafts.md:229` quote *"Every
  package appears in EXACTLY ONE TOML, with the documented exception
  of `_register_listings` which is dual-classed"*. Add an extra
  assertion to the lock test:
  ```python
  assert DUAL_CLASS_ALLOWLIST == frozenset({"_register_listings"}), \
      "dual-class allowlist must remain single-element; new dual-classes need ADR-007 amendment"
  ```
- **Edit to resolution plan §1.4**: append the extra assertion above to
  the pseudocode at `review-loop-1-08-cohesion-resolution.md:107-116`.

---

### Q-C: REPORTING_GRACE_DAYS direction — verify against current code

- **Loop 1 answer**: `_kri_history/constants.py:2` is SSOT;
  `_config/lookup.py:26` is deleted (per
  `review-loop-1-08-cohesion-resolution.md:152-168`).
- **Loop 2 challenge**: verify by reading both files directly.
  - `backend/app/services/_kri_history/constants.py:2` reads
    `REPORTING_GRACE_DAYS = 15` (verified).
  - `backend/app/services/_config/lookup.py:26` reads
    `REPORTING_GRACE_DAYS = 15` inside `class ConfigDefaults:` (verified).
  - Consumers (verified by grep):
    - `_kri_history/periods.py:9` imports from `.constants` — already
      uses SSOT path.
    - `kri_history_service.py:8` imports from
      `app.services._kri_history.constants` — uses SSOT path.
    - `kri_deadline_service.py:52` reads
      `ConfigDefaults.REPORTING_GRACE_DAYS` — uses LEAF path.
    - `kri_deadline_support.py:36` reads
      `ConfigDefaults.REPORTING_GRACE_DAYS` — uses LEAF path.
  - **Counts**: 2 callers reach the leaf (`_config/lookup.py`); 2+
    callers reach the SSOT root (`_kri_history.constants`).
- **Loop 2 verdict**: **CONFIRM Loop 1's direction**.
- **Rationale**: per `plan-loop-3-06-adr-drafts.md:298` quote
  *"_kri_history/constants.py:2 is the SSOT and _config/lookup.py:26
  is deleted"* (user's explicit decision). Code verification confirms
  the direction is right: `_kri_history.constants` is the deeper
  source consumed by the package's own modules; `ConfigDefaults` is
  the leaf reached by 2 callers. Collapsing onto the leaf would
  invert the dependency graph.
- **Migration impact verified**: when Loop 1 lands ADR-012 (#73 in
  v2 Seq 2), the diff is:
  1. Delete `backend/app/services/_config/lookup.py:26` line
     `REPORTING_GRACE_DAYS = 15`.
  2. Rewrite `kri_deadline_service.py:52` import from
     `ConfigDefaults.REPORTING_GRACE_DAYS` to
     `from app.services._kri_history.constants import REPORTING_GRACE_DAYS`.
  3. Same rewrite at `kri_deadline_support.py:36`.
  4. Lock test asserts SSOT presence at
     `_kri_history/constants.py:2` and absence in `_config/lookup.py`.

---

### Q-D: #76 effort = M — verify 8 sites claim

- **Loop 1 answer**: keep M (8h); Loop 4 spike to confirm (per
  `review-loop-1-08-cohesion-resolution.md:204-238`).
- **Loop 2 challenge**: the orchestrator flagged that *"Loop 1 A6
  (effort audit) didn't review #76 because it didn't exist in any
  Loop 1 plan"*. **Verify Loop 3 A7's claim that #76 has 8 sites.**
- **Loop 2 verification** (direct grep):
  ```
  auth/_sso_helpers.py:48:    await db.commit()
  auth/password.py:128:        await db.commit()
  auth/password.py:161:    await db.commit()
  auth/logout.py:101:        await db.commit()
  auth/logout.py:132:    await db.commit()
  auth/demo.py:67:    await db.commit()
  auth/sso.py:170:    await db.commit()
  auth/refresh.py:177:    await db.commit()
  ```
  **8 sites confirmed** at the exact line numbers cited in
  `plan-loop-3-07-integration-v2.md:185-194`.
- **Loop 2 effort sanity** (against verified counts):
  - 8 commit sites; 6 of them are at top-level function bodies (refresh,
    sso, _sso_helpers, demo) — each a 30-45 min wrap-in-service-tx.
  - 2 paired sites (logout.py:101+132, password.py:128+161) — each
    pair requires ~1h to refactor coherently (refresh-row removal +
    token-version bump).
  - Integration test scaffold per migration: ~30 min × 8 = 4h, but
    parametrise to bring this to ~2-2.5h.
  - Allowlist removal + commit gate run: ~15 min × 8 = 2h.
  - Total: 4h (top-level) + 2h (paired) + 2h (tests) + 2h (allowlist)
    = ~10h.
- **Loop 2 verdict**: **OVERRIDE — promote #76 to L (12-16h)**.
- **Rationale**: per `review-loop-1-06-effort-audit.md:655-661`
  Loop 1 A6 itself flagged *"could slide to L (10-14h)"* under
  borderline risk. Direct verification of the 8 sites confirms 6
  distinct + 2 paired transactional contexts, but Loop 1 A8's "1h /
  context" estimate undercounts the **integration-test-per-migration**
  burden. Loop 4 spike still recommended; default sizing changes from
  M to L until spike confirms otherwise.
- **Calendar implication** (see Q-E below): L = 12-16h vs M = 8h adds
  ~0.5-1.0 dev-day to the path through #76.

---

### Q-E: 2026-09-01 deadline feasibility for #76

- **Loop 1 answer**: keep at P3; calendar matrix at
  `review-loop-1-08-cohesion-resolution.md:404-429` recommends promoting
  to P2 only if start date ≥ 2026-06-15.
- **Loop 2 challenge** (calendar arithmetic with verified inputs):
  - Today is 2026-05-09 (per env date).
  - Loop 1 A6 effort total: **538h (with cushion)** ≈ 67 dev-days ≈
    **13.5 weeks** at 1 dev × 8h/day × 5d/week (per
    `review-loop-1-06-effort-audit.md:889-891`).
  - Loop 1 A6 also flags Phase 4 adversarial review adds
    "+30% buffer" ≈ 4 weeks; total ≈ **17.5 weeks** for end-to-end.
  - 2026-05-09 + 13.5 weeks (no review) = 2026-08-13.
  - 2026-05-09 + 17.5 weeks (with review) = 2026-09-09.
  - 2026-05-09 + 19 weeks (Loop 1 A8's ceiling cited at
    `review-loop-1-08-cohesion-resolution.md:790-791`) = 2026-09-19.
  - **#76 lands at v2 Seq 70 / 79 ≈ 88% through the sequence.**
    13.5w × 88% = 11.9w → lands ~2026-08-01 (linear case).
    17.5w × 88% = 15.4w → lands ~2026-08-29 ⚠ (within 3 days of
    deadline).
    19w × 88% = 16.7w → lands ~2026-09-08 ❌ (deadline missed).
  - Adding the Q-D L-resize (+8h ≈ +1 dev-day → +0.2 weeks shift):
    9 days slip → 2026-09-08 + 9d = 2026-09-17 ❌.
- **Loop 2 verdict**: **OVERRIDE — promote #76 to P1**, move to v2 Seq
  ~50 region (after #34, before #27→#8 chain).
- **Rationale**: per `plan-loop-3-07-integration-v2.md:638-642` quote
  *"the 2026-09-01 deadline may already be missed"*. Loop 1 A8's
  conditional promotion ("if start ≥ 2026-06-15") is **already
  triggered** because the start date IS 2026-05-09 and the buffered
  calendar shows ~16-17 weeks landing in mid-Sept. Promoting to P1
  moves #76 to ~Seq 50 (after the privilege-tier helper #34 lands)
  and gives ~6 weeks of buffer before the 2026-09-01 deadline.
- **Edit to resolution plan §2.6**: replace the conditional matrix
  with an unconditional promotion: *"#76 promoted from P3 to P1; v2
  Seq 70 → Seq ~50 region; rationale: today is 2026-05-09 and
  realistic calendar with adversarial review puts #76 landing at
  ~2026-09-08 to 2026-09-17, missing the 2026-09-01 deadline. P1
  promotion lands #76 at ~2026-07-15, leaving 6 weeks of buffer."*

---

### Q-F: #77 priority = P3 — coupling with #70

- **Loop 1 answer**: keep P3, tie tightly to #70's priority (per
  `review-loop-1-08-cohesion-resolution.md:244-266`).
- **Loop 2 challenge**: the pair-coupling rule is correct but the
  current sequencing is broken. v2 Seq 78-79 has #69 → #70 → #77.
  - #69+#70 land in the **migration window** (Postgres rehearsal,
    forward-only Alembic per ADR-010). The migration cutover is
    typically a deploy-day operation.
  - **#77 (FE TS cleanup) at Seq 79 is AFTER the migration**. This
    creates **deploy-skew**: between the BE migration (drops
    `Vendor.status` from API payloads) and the FE TS cleanup (drops
    `Vendor.status` from TypeScript types/Zod schemas), the FE will
    receive responses without `status` but its types still expect
    `status?: string`.
  - Zod's default behavior on optional fields is silent omission, so
    the runtime cost is low — but the **deploy-skew window** is
    arbitrarily long if #77 is deferred.
- **Loop 2 verdict**: **OVERRIDE — split #77 timing**.
- **Rationale**: per `plan-loop-3-07-integration-v2.md:611-615`
  Loop 1 A7 quote *"If migration window is accelerated, #77
  priority should move with #70"*. The deploy-skew risk is real
  but the FE TypeScript types are already permissive (`status?: string`
  is optional), so post-migration breakage is bounded. **Two-phase fix**:
  1. **Phase A — pre-migration**: ADD a Zod schema test asserting
     `Vendor.status` is **optional** (not required). This lands at v2
     Seq ~63 (P3 wave, before the migration). Cost: ~30 min.
  2. **Phase B — post-migration**: full prune (current #77 work) lands
     at v2 Seq 79. Cost: ~3-4h (current S sizing).
- **Edit to resolution plan §2.2**: add Phase-A pre-test as a
  micro-task at v2 Seq ~63 with a cross-reference annotation
  *"#77a — pre-migration Zod test asserting Vendor.status optional;
  removed by #77 (Phase B) post-migration"*.

---

### Q-G: Soft-edge schema field for master DAG

- **Loop 1 answer**: yes — add `soft_in_domain_deps` and
  `soft_cross_domain_deps` fields (per
  `review-loop-1-08-cohesion-resolution.md:354-396`).
- **Loop 2 challenge**: does the master DAG yaml format support it
  without parser changes?
- **Loop 2 verification**: grep for consumers of
  `plan-loop-2-01-master-dag.yaml` returns **zero hits** in
  `scripts/`, `tests/`, `backend/app/`. The yaml is a planning artefact
  with no parser today (verified). Therefore adding optional new fields
  is **schema-extending only**; no consumer to break.
- **Loop 2 verdict**: **ACCEPT — add the fields**.
- **Rationale**: per `plan-loop-3-07-integration-v2.md:630-633` quote
  *"these are soft (sequencing-only) edges. Should the master DAG add
  an explicit 'soft_in_domain_deps' / 'soft_cross_domain_deps'
  field"*. Loop 1's yaml schema extension is backward-compatible
  (new fields default to `[]` for items that don't have soft edges).
  When a parser is built in Loop 4 (per
  `review-loop-1-08-cohesion-resolution.md:798-806` Phase 4 Loop 2
  task), it must accept the new optional fields.
- **Caveat**: Loop 4 must not bake parser strictness on the existence
  of these fields — defaults to `[]` if absent.

---

### Q-H: 8-wave structure — Wave 6 has 124h (3 dev-weeks)

- **Loop 1 answer**: 8 waves, table at
  `review-loop-1-08-cohesion-resolution.md:497-506`.
- **Loop 2 challenge**: Wave 6 = 124h = 3.1 dev-weeks. Wave 4 = 60h
  with doc-contract density. Reasonable?
  - **Wave 6 critique**:
    - Items: #46 (L=20h), #65 (M=8h), #67 (M=8h), #39 (M=8h), #40 (M=8h),
      #62 (M=8h), #76 (M=8h, if not promoted), #45a (M=8h), #45b (M=8h),
      #66 (M=8h), #68 (M=8h), #60 (M=8h), #71 (M=8h) = 13 items × ~9.5h
      avg = 124h ≈ 15.5 dev-days = **3.1 dev-weeks**.
    - One reviewer over 3 weeks of "M-only or larger" items will
      experience PR fatigue; this is exactly the failure mode Cohesion
      Check #11 was meant to mitigate.
    - Loop 1 already flagged Wave 6 as *"the heaviest single wave"*
      (`review-loop-1-08-cohesion-resolution.md:511`).
  - **Wave 4 critique**:
    - Items: #29-43 (15 items) including the doc-contract sub-cluster
      at Seq 40-44 (5 commits in 5 days touching same `service_policy`
      blob).
    - 60h / 15 items = 4h/item average — fine.
    - But **doc-contract density** is the concern: 5 contract-edit
      commits in one week burns mental cache; if a validator-fail
      cascades, the whole week stalls.
- **Loop 2 verdict**: **OVERRIDE — split Wave 6 into 6a and 6b**.
- **Rationale**: per `review-loop-1-08-cohesion-resolution.md:511`
  Loop 1 A8 quote *"Wave 6 is the heaviest single wave and is the
  natural inflection where the developer crosses from 'small refactors'
  into 'L+M tasks'"*. Loop 1 acknowledged the inflection but did not
  split it. Splitting:
  - **Wave 6a (P3 medium - infrastructure)**: 8 items (Seq 57-64) =
    #31, #32, #43, #44, #42, #58, #63, #46. Effort = 60h. Theme:
    extract/factor/instrument backend infrastructure that does NOT
    touch capability contract.
  - **Wave 6b (P3 medium - capability+admin)**: 5 items (Seq 65-69) =
    #65, #67, #39, #40, #62. Effort = 40h. Theme: capability
    catalog + admin reorg + KRI vendor relocate. **All 5 hit the
    validator** (high contract-doc density).
  - Net: Wave 6 (124h) → Wave 6a (60h, 1.5 weeks) + Wave 6b (40h, 1
    week). Total wave count: 8 → 9.
- **Wave 4 verdict**: **ACCEPT** Loop 1's wave structure for Wave 4.
  60h is sustainable; the doc-contract sub-cluster is one-week-cache-warm
  per cohesion #6 callout.
- **Edit to resolution plan §3.1**: replace 8-wave table with 9-wave
  table (split Wave 6 into 6a and 6b).

---

## 3. Reconciled wave structure (after Loop 1 + Loop 2)

After Loop 2 corrections (Q-E promotes #76 to P1; Q-H splits Wave 6;
Q-F adds #77a micro-task to Wave 6a region), the reconciled 9-wave
structure:

| Wave | Theme | Items | v2 Seq (approx) | Calendar | Effort | Reviewer focus |
|---:|---|---:|---|---|---:|---|
| 1 | ADRs | 4 | 1–4 | Wk 1 | 14 h | ADR-011/012/007 ratification |
| 2 | P1 quick wins (incl. #76) | 11 | 5–14 + #76 promoted into Seq ~14 region | Wk 2-3 | 32+12 = 44 h | `users/summary.py` 3-way; **#76 auth migration P1**; validator gates |
| 3 | P2 dead-code A | 14 | 15–28 | Wk 4-5 | 56 h | Underscore aliases; FE dead-code |
| 4 | P2 dead-code B + doc-contract | 15 | 29–43 | Wk 6-7 | 60 h | **5-commit doc-contract cluster Seq 40-44** |
| 5 | P2 chains + #74b | 13 | 44–56 | Wk 8-9 | 88 h | Issue-domain consolidation; ADR-007 amend text |
| 6a | P3 medium - infrastructure | 8 | 57–64 + #77a pre-test | Wk 10-11 | 60+0.5 = 60.5 h | Vendor reporting; query-keys; outbox instrumentation |
| 6b | P3 medium - capability+admin | 5 | 65–69 | Wk 12 | 40 h | crudCapabilitySchema; admin reorg; KRI vendor relocate |
| 7 | P4 deferred | 6 | 70–75 (no #76; #76 lifted out) | Wk 13 | 56 h | Ownership factory; AuthContext; PrivilegeContext |
| 8 | Migration + FE TS cleanup | 3 | 76–78 (was 77-79) + #77 (B) | Wk 14 | 28 h | #69+#70 atomic Postgres migration + #77 (B) Vendor.status FE |

**Reconciled item count: 79 (unchanged — Loop 1's items preserved; #76
moves to Wave 2; #77 splits temporally not as a new ID).**

**Reconciled effort distribution per wave**: 14, 44, 56, 60, 88, 60.5,
40, 56, 28 h = **446.5 h** baseline. Loop 1 A8's 8-wave total was 466h;
the discrepancy comes from #76 promotion (no net change — it shifts
into Wave 2) and the Wave 6/6a+6b split (no net change either).

**Cross-reconciliation with Loop 1 A6's 538h** (with cushion) needs
the borderline cushion (+18h) and 12h promotion-cost for #76 (M→L =
+8h, plus carry to P1 wave reordering = +4h overhead). 446.5 + 18 +
12 = **476.5 h baseline**, **494.5 h with cushion**. Wait — Loop 1 A6
declared 538h end-to-end with cushion. The wave-level allocation is
466 h "single counted" because some ADR-1 work is double-counted
under crosscut domain. Reconciliation with Loop 1 A6's 538h:

- Loop 1 A6 strict: 520h (= 484 + 24 + 12 from #76/#77 already counted).
- Loop 1 A6 with cushion: 538h.
- Loop 2 adjustment from Q-D (#76 M → L): +8h.
- Loop 2 net total strict: **528h**.
- Loop 2 net total with cushion: **546h** ≈ 68.25 dev-days ≈
  13.65 weeks.

---

## 4. Reconciled "final answer set" — 14+ Q answers

| Q | Loop 1 answer | Loop 2 verdict | Rationale (≤15 words quote) |
|---|---|---|---|
| Q1: ADR status | Accepted | ACCEPT (with caveat) | "every existing ADR uses Accepted" |
| Q2: `_orphaned_items` | Read-shape | ACCEPT | "Orphan-listing projection; repair writes flow through canonical mutators" |
| Q3: `_notification_inbox` | Workflow-paired | CONFIRM | "the workflow-side `lifecycle` import surface" |
| Q4: `_register_listings` dual | dual allowed | OVERRIDE — strengthen lock | "explicit exception of `_register_listings` which is dual-classed" |
| Q5: 5th category name | Core | ACCEPT | "matches the prose phrase 'core cross-cutting policy'" |
| Q6: REPORTING_GRACE_DAYS | _kri_history SSOT | CONFIRM (verified code) | "_kri_history/constants.py:2 is the SSOT and _config/lookup.py:26 is deleted" |
| Q7: Mock-auth phrasing | Loop B correction | CONFIRM | "the mock-auth fallback inside" |
| Q1: #76 effort | M | OVERRIDE — L | "8 auth/ sites may have transactional coupling" |
| Q2: #77 priority | P3 (coupled) | OVERRIDE — split #77a/#77b | "If migration window is accelerated, #77 priority should move" |
| Q3: #74a allowlist | exists OR planned | ACCEPT | "lock-test must accept either 'package exists' OR 'package planned'" |
| Q4: Validator partial-removal | dry-run in Loop 4 | ACCEPT | "validator must be tolerant of partial-removal states" |
| Q5: Soft-edge schema | yes, add fields | ACCEPT (no parser today) | "Loop 4 to decide schema extension" |
| Q6: 2026-09-01 #76 deadline | conditional P2 | OVERRIDE — promote to P1 unconditionally | "the 2026-09-01 deadline may already be missed" |
| Q7: #77 Zod test pattern | reference capabilities.test.ts | ACCEPT | "the canonical pattern that #77's Zod schema test must mirror" |
| **Cohesion conflict 1**: 5th category | Core (A8) | ACCEPT Core | (above Q5) |
| **Cohesion conflict 2**: `_orphaned_items` | Read-shape (A8) | ACCEPT Read-shape | (above Q2) |
| **Cohesion conflict 3**: `_notification_inbox` | Workflow-paired | CONFIRM | (above Q3) |
| **Cohesion challenge H**: 8-wave structure | 8 waves | OVERRIDE — 9 waves (split Wave 6) | "Wave 6 is the heaviest single wave" |

**Net Loop 2 changes**:
- 4 OVERRIDE: Q4 (lock strength), Q-D (#76 M→L), Q-E (#76 P3→P1), Q-F
  (#77 split), Q-H (8 waves → 9 waves).
- 13 ACCEPT/CONFIRM.

---

## 5. Cohesion improvements — any Loop 1 fixes invalidated?

Loop 1 A8 proposed 5 cohesion edits (per
`plan-loop-3-08-cohesion.md:548-585`). Loop 2 verdict on each:

| # | Loop 1 edit | Loop 2 verdict |
|---|---|---|
| 1 | Add Release-waves section (8 waves) | **PARTIAL OVERRIDE** — replace with 9-wave structure (Wave 6 split) per Q-H |
| 2 | Pre-cache doc-contract wave at Seq 40-44 | **ACCEPT** — verbatim text edit unchanged |
| 3 | Surface file-overlap clusters | **ACCEPT** — verbatim text edit unchanged; updates if #76 moves shift adversely numbered (but #76 doesn't touch users/summary.py or md:109) |
| 4 | Lock-test runtime budget | **ACCEPT** — +5min cap is a guess but reasonable; Loop 4 is responsible for empirical validation |
| 5 | Tighten priority-tier total | **ACCEPT** — 79 → 77 +2 net (since #76+#77 are still 2 new items) corrected wording remains valid; with #76 promoted to P1 wave the priority-tier total updates to "11 (P1) + 43 (P2) + 15 (P3) + 8 (P4) = 77 items" |

**Loop 1 fix #5 (priority tally) edit** — when #76 moves from P3 to P1,
the line at `plan-loop-2-08-master-sequence.md:312` updates further:
- Loop 1 A8 wording: "10 (P1) + 43 (P2) + 16 (P3) + 8 (P4) = 77 items"
- Loop 2 reconciled wording: "11 (P1) + 43 (P2) + 15 (P3) + 8 (P4) = 77
  items, with `#45a/b` and `#74a/b` each counted once per half, `#75`
  once. (v2 sequence adds 2 items: #76 P1 + #77 P3, total 79 items / 11
  P1 net.)"

Loop 1 fix #2 (doc-contract wave callout text) is preserved verbatim;
the 5 commits (#55, #24, #51, #56, #61) at v2 Seq 40-44 are unaffected
by #76's promotion.

Loop 1 fix #3 (file-overlap clusters) is preserved verbatim; the 3
files (`users/summary.py`, `md:109`, `test_architecture_deepening_contracts.py`)
are not touched by #76 or #77.

Loop 1 fix #4 (lock-test runtime budget) is unaffected by Loop 2.

**Net cohesion-edit invalidations**: 1 of 5 (Loop 1 fix #1, the wave
table — replaced with 9-wave structure).

---

## 6. Top 3 unresolved issues for Phase 5+ work

After Loop 1 and Loop 2 reconciliation, three issues remain unresolved
and require Phase 5+ attention:

### 6.1 🔴 Validator partial-removal tolerance (Q-Q4 in Loop 1; carried over)

Status: deferred to Loop 4 (per Loop 1 A8's Phase 4 Loop 2 priorities
at `review-loop-1-08-cohesion-resolution.md:769-779`). Loop 2 did NOT
run the dry-run because:
- Doing so requires `git stash` + branch creation + 3 hypothetical
  commits.
- Loop 2's mode is *"adversarial plan review"*, not empirical testing.
- The empirical dry-run is in scope for Loop 4 per the Loop 1 plan.

**Phase 5 priority**: Loop 4 must run the dry-run procedure (3
hypothetical commits at #55, #56, #61 progression) before any of those
commits land in the real cleanup.

**Risk**: medium-high. If validator is fragile, the 5-day doc-contract
wave at v2 Seq 40-44 will fail mid-wave with no rollback path.

### 6.2 🔴 #76 P1 promotion has cascade effects (NEW from Loop 2 Q-E)

The decision to promote #76 from P3 to P1 (Loop 2 verdict on Q-E)
moves it from v2 Seq 70 to ~Seq 50. This requires:
1. Re-sequencing 20 items between Seq 50 and Seq 70 by +1.
2. Updating master DAG yaml `priority` field for #76.
3. Updating `plan-loop-3-07-integration-v2.md` v2 sequence table.
4. Updating Loop 1 A8's wave structure (Wave 2 grows from 10 → 11
   items; Wave 7 shrinks from 7 → 6 items).
5. Confirming #76's hard prereq (#72 ADR-011 at Seq 1) lands first —
   already true since #72 is at Seq 1 and any P1 wave member lands
   after Seq 1.

**Phase 5 priority**: Loop 4 must propagate the #76 promotion through
all DAG/sequence/wave artifacts. Estimated 1-2h of cascade edits.

### 6.3 🟡 #77 split into Phase A (pre-migration test) + Phase B (post-migration prune) is a NEW item shape (NEW from Loop 2 Q-F)

The decision to split #77 (Loop 2 verdict on Q-F) into:
- **#77a**: Phase A pre-migration Zod-optionality test, lands at v2 Seq
  ~63 (P3 wave, ~30min effort).
- **#77b**: Phase B post-migration prune (full work), lands at v2 Seq
  79 (P3 wave, ~3-4h effort, the original #77).

This creates a new sub-item shape that Loop 1 did not anticipate. Loop
1 A8's 8-wave table did not allocate for #77a. Loop 2's 9-wave
reconciliation (§3 above) inserts #77a into Wave 6a but does not
formally renumber.

**Phase 5 priority**: Phase 5 must decide — is #77a a new ID (#77a/#77b
split, mirroring #45a/b and #74a/b precedent), or is it a
"verify-only" sub-task of #77 that doesn't need a separate ID? The
precedent says #74a was given its own ID; consistency favors #77a as
a separate ID.

**Risk**: low. Either decision works; the work is small (~30 min) and
mechanical. The risk is **plan-artifact drift** if #77a is not formally
sequenced.

---

## 7. Phase 5 priority list (top 5)

1. **🔴 Loop 4 validator dry-run** — must run before doc-contract wave
   begins (per §6.1).
2. **🔴 #76 P1 promotion cascade** — re-sequence v2 ~Seq 50; update
   wave structure (per §6.2).
3. **🟡 #77a / #77b formalization** — decide sub-ID nomenclature; add
   #77a as Wave 6a entry (per §6.3).
4. **🟡 9-wave structure adoption** — replace Loop 1's 8-wave table
   with Loop 2's 9-wave table (Wave 6 split into 6a/6b per Q-H).
5. **🟡 ADR-007 dual-class lock strengthening** — add the
   `frozenset({"_register_listings"})` single-element assertion to the
   disjointness lock (per Q-B).

---

## 8. Reconciled effort total

After Loop 1 538h + Loop 2 challenges:

| Source | Effort | Notes |
|---|---:|---|
| Loop 2 master-sequence baseline | 484 h | 77 items |
| + #76, #77 (Loop 3 v2) | +12 h | 79 items, 496 h |
| Loop 1 A6 strict adjustments (#34 +12, #35 +4, #74a +12, #59 -4) | +24 h | 520 h strict |
| Loop 1 A6 borderline cushion | +18 h | 538 h with cushion |
| **Loop 2 Q-D adjustment**: #76 M → L | **+8 h** | **528 h strict / 546 h cushion** |
| **Loop 2 Q-E carry**: #76 P1 promotion | **0 h** (no scope change, only sequencing) | unchanged |
| **Loop 2 Q-F adjustment**: #77 split (Phase A test + Phase B prune) | **+0.5 h** (negligible) | rounded to 0 h |
| **Loop 2 Q-H wave 6 split** | 0 h (presentation only) | unchanged |
| **Loop 2 net total strict** | **528 h** | ≈ 66 dev-days ≈ 13.2 weeks |
| **Loop 2 net total with cushion** | **546 h** | ≈ 68.25 dev-days ≈ 13.65 weeks |

**Reconciled headline**: 13.5 weeks single-dev (with cushion). With
adversarial review (Phase 4 Loops 1+2 ≈ 4 weeks) folded in, end-to-end
is ~17.5 weeks. Today is 2026-05-09; project completion ~2026-09-09 if
adversarial weeks happen during cleanup (interleaved), or ~2026-10-07 if
adversarial weeks happen sequentially after cleanup.

---

## 9. Effort multiplier verdict

Loop 1 A6 declared a **7-12% upward correction** to Loop 2's 484h
baseline. Loop 2 Q-D adds +8h (#76 M→L). Net upward correction over
Loop 2 baseline:

- Strict: (528 - 484) / 484 = **+9.1%**.
- With cushion: (546 - 484) / 484 = **+12.8%**.

This is **slightly above** Loop 1 A6's "7-12% low" framing, but well
within rounding. The dominant single change is still #34 (+12h), with
#74a (+12h) and #76 (+8h, Loop 2 addition) tied for second.

---

## 10. Summary of Loop 2 deliverables

- 14 Q answers reconciled (4 OVERRIDE, 13 ACCEPT/CONFIRM, including
  3 cohesion conflicts).
- 5 Loop 1 cohesion edits reviewed: 1 partial-override (wave table),
  4 accepted with minor wording carry-overs.
- Wave structure: 8 waves → 9 waves (Wave 6 split into 6a/6b).
- Effort total: 484h base → 528h strict / 546h cushion.
- 3 unresolved issues for Phase 5+ (validator dry-run, #76 cascade,
  #77 split formalization).
- 5 Phase 5 priorities (top critical: validator dry-run before
  doc-contract wave).

The Loop 1 cohesion-resolution plan is structurally sound; Loop 2
adversarial review hardens the lock semantics (Q-B), corrects the
calendar feasibility (Q-E), and rebalances the heaviest wave (Q-H).
No structural defects detected; no cycles; no atomic-cluster splits.

---

End of Phase 4 Loop 2 cohesion-adversarial review.
