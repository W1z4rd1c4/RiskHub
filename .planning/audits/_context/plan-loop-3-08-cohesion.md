# Phase 3 Loop 3 — Cohesion / Master Flow Check

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Build commit
ref: `1ee872a4`. Inputs: every Loop 1 (`plan-loop-1-01..08-*.md`) and Loop 2
(`plan-loop-2-01..07-*.md`, plus `plan-loop-2-08-master-sequence.md`) artefact
in `.planning/audits/_context/`.

This audit treats the Loop 2 master sequence
(`plan-loop-2-08-master-sequence.md:39-117`) as the contract. The 11 cohesion
checks below score the plan as a single deliverable for one sequential
developer.

---

## Check #1: Numbering consistency

- **Status**: NEEDS-FIX (minor — wording, not topology)
- **Finding**: The "77 work units" framing is internally consistent across
  Loop 2 artefacts (`plan-loop-2-08-master-sequence.md:117` 77 rows;
  `plan-loop-2-02-execution-order.md:18-20` quote `"74 audit items + bonus
  #75 + #45a/#45b split + #74a/#74b split = 77"`; master DAG yaml meta at
  line 8 quote `"total_items: 77"`). However, three notation snags appear:
  1. **`#45` split** — Loop 1 introduced `#45a` and `#45b`
     (`plan-loop-2-08-master-sequence.md:110-111`); the parent `#45` never
     re-appears as a single ID — good. But `plan-loop-2-08-master-sequence.md:312`
     reports tier counts that sum to **79** vs. 77 ("Total = 10 + 43 + ~18 + 8
     = 79 (over 77 because some items appear with multiple priority assignments
     in different sources"). The reader must reconcile manually.
  2. **`#74` split** — same story: `#74a` + `#74b` in the table but the prose
     at `plan-loop-2-08-master-sequence.md:309` lists `"#74a, #74b, #62"`
     under P3 without disclosing that the two halves of `#74` count as 2 items
     each.
  3. **`#75` bonus** — clearly disclosed
     (`plan-loop-2-02-execution-order.md:18` quote `"bonus #75
     (_auto_reject_kri_approval)"`). No issue.
  4. **No `#76`, `#77` items** — the master sequence reaches "Seq 77" but the
     final two slots are `#69` (Seq 76) and `#70` (Seq 77), not new IDs.
     The orchestrator's prompt mentions "new #76, #77" — those numbers are
     **sequence positions**, not new audit IDs. Confirm by reading
     `plan-loop-2-08-master-sequence.md:116-117`.
- **Recommendation**: Edit the priority-tier summary at
  `plan-loop-2-08-master-sequence.md:307-312` to read "Total = 10 + 43 + 16 +
  8 = 77 (with `#45a/b` and `#74a/b` each counted once per half, `#75` once)".
  No topology change needed.

---

## Check #2: Effort sum sanity

- **Status**: PASS
- **Finding**: Domain effort totals at
  `plan-loop-2-08-master-sequence.md:226-238` sum to **484 h** which the
  artefact correctly maps to "~12 dev-weeks" (line 238 quote `"60.5 dev-days
  @ 8h/day, ~12 dev-weeks"`). The breakdown by domain is internally
  consistent: `60+16+40+44+56+128+72+68 = 484 h`. Effort buckets follow the
  legend `S=4h, M=8h, L=20h, XL=40h` (line 37). Buffer is acknowledged:
  `plan-loop-2-08-master-sequence.md:326` quote `"Adversarial review and TDD
  overhead can extend to 14–16 weeks"`. This implicit ~30% buffer (2-4 weeks
  on top of 12) is reasonable for TDD + lock-test churn.
- **No fix required**. The effort total is defensible; the 14–16 week
  framing should be the headline rather than buried.

---

## Check #3: Phasing intuition (quick wins → consolidations → heavy refactors)

- **Status**: NEEDS-FIX (minor — phase boundaries are blurred at the seams)
- **Finding**: The master sequence's gate plan
  (`plan-loop-2-08-master-sequence.md:316-324`) maps slots to gates A–G:
  `Gate A (Seq 1-4 ADRs)`, `B (5-14 P1 quick wins)`, `C (15-43 P2 dead-code)`,
  `D (44-58 P2 chains)`, `E (59-69 P3 medium)`, `F (70-75 P4 deferred)`,
  `G (76-77 migration)`. The orchestrator's intuition was:
  - 1-25 quick wins → master maps 1-25 ≈ Gate A + B + first half of C ✅
  - 26-50 mid-tier consolidations → master Seq 26-50 covers tail of Gate C
    + Gate D start ✅
  - 51-77 heavy refactors → master Seq 51-77 covers Gate D tail + E + F + G ✅
  Overall the intuition holds. However, two seams are blurry:
  - **Seq 38 (#47, P3)** sits inside the Seq 15-43 P2 dead-code wave despite
    being a P3 item. `plan-loop-2-08-master-sequence.md:78` notes "(P3 in dev
    answer)". This is fine for execution — P3 quick-wins can interleave with
    P2 — but reviewers may flag it as a mis-tier.
  - **Seq 41-45 (#55, #24, #51, #56, #61)** are validator-heavy items
    (`plan-loop-2-08-master-sequence.md:81-85`, all marked "Validator? = yes").
    These land in the middle of the "dead-code Gate C" rather than in Gate D.
    The plan reasons this with atomic clusters needing to land in P2 wave
    (line 87 `"P2 wave… atomic clusters #24+#51 and #56+#61 land here"`).
- **Recommendation**: Add a one-line annotation at
  `plan-loop-2-08-master-sequence.md:316-324` explicitly calling out that
  Gates C and D each contain 4-5 validator runs (capability contract changes),
  not just dead-code deletes. This sets the developer's expectation that
  Gates C/D ≠ "easy" but rather "small but with locks".

---

## Check #4: TDD discipline (failing test FIRST, count reconciliation)

- **Status**: NEEDS-FIX (minor — counts diverge between Loop 2 sources)
- **Finding**: Every Loop 1 plan establishes a TDD red-green-refactor seam
  per item. A grep confirms `"failing test"` appears 88 times across Loop 1
  plans (10 issues + 5 risks + 9 approvals + 10 kris + 8 vendor + 20 frontend
  + 12 endpoints + 14 crosscut). `"TDD"` appears 91 times. So the discipline
  is on every item.
  Cross-source reconciliation:
  - `plan-loop-2-03-lock-conflict-matrix.md:459-464` quote `"Total NEW
    backend lock test files (architecture/): ~24"`, `"Total NEW backend
    non-architecture test files: ~17"`, `"Total NEW frontend test files:
    ~22"`, `"Grand total NEW lock-tier artifacts: ~63 test files + 6 TOML
    registries"`.
  - This **63** count is the right number to compare with the orchestrator's
    expected `"63 + 17 + 22 = ~100 new test artifacts"` framing — but the
    framing mis-adds: the matrix already says **63 = 24 + 17 + 22** (the
    grand total is 63, NOT 63 + 17 + 22 again).
  - Actual total NEW test files per Loop 2: **24 backend lock + 17 backend
    non-lock + 22 frontend = 63**.
  - 77 items × 1 RED test FIRST ≈ 77 test artifacts (1:1).
  - The gap (77 expected vs. 63 counted) is because some items add assertions
    to *existing* test files (e.g., `test_architecture_deepening_contracts.py`
    is tightened by 9 issues items at `plan-loop-2-03-lock-conflict-matrix.md:316-326`)
    rather than creating new files.
- **Recommendation**: At `plan-loop-2-03-lock-conflict-matrix.md:464`, add a
  line: "63 NEW test files + ~14 in-place tightenings of existing files
  (most landing in `test_architecture_deepening_contracts.py`) = ~77 test
  authoring events, one per master-sequence item."

---

## Check #5: Validator schedule sanity

- **Status**: PASS
- **Finding**: `plan-loop-2-05-validator-schedule.md:425-447` enumerates
  16 items requiring `validate_authz_capability_contract.py`. Per the master
  sequence (`plan-loop-2-08-master-sequence.md:39-117`) the validator items
  land at:
  ```
  Seq  8: #13  (P1 vendor shim)
  Seq 13: #15  (P1 access_user catalog)
  Seq 14: #37  (P1 governance builder)
  Seq 41: #55  (P2 access_user_service facade)
  Seq 42: #24  (P2 KRI atomic A)
  Seq 43: #51  (P2 KRI atomic A)
  Seq 44: #56  (P3 directory shim)
  Seq 45: #61  (P3 graph_directory move)
  Seq 50: #34  (P3 privilege tier)
  Seq 65: #65  (P3 crud capability schema)
  Seq 67: #39  (P3 admin capabilities builder)
  Seq 69: #62  (P3 KRI vendor relocate)
  Seq 72: #66  (P4 AuthContext split)
  Seq 74: #60  (P4 PrivilegeContext)
  Seq 76: #69  (P4 vendor mixin) — bundled
  Seq 77: #70  (P4 vendor status drop) — bundled atomic with #69
  ```
  Spacing: 16 validator runs across 77 slots = 1 every 4.8 slots on average.
  Tight clusters at Seq 41-45 (5 validator runs in 5 slots — KRI atomic + cross-cut
  paired wave) and at Seq 65-77 (6 validator runs in 13 slots — frontend FE-N3
  + admin builder + KRI relocate + AuthContext + PrivilegeContext + migration
  bundle). No two validator items collide on the same source files except the
  three explicit doc-cell collisions called out in
  `plan-loop-2-04-doc-touch-matrix.md:142-148`. A failure at any single
  validator slot does not cascade because:
  1. The validator runs locally pre-commit (`plan-loop-2-05-validator-schedule.md:483-494`).
  2. Each item is its own commit, so a failing validator blocks that one
     commit, not the queue.
  3. The Pydantic↔Zod parity items (#15, #39, #65) are non-adjacent (Seq 13,
     67, 65) so a parity drift in one cannot cascade into another.
- **No fix required**. Spacing is acceptable.

---

## Check #6: Doc churn cadence (capability contract md/json)

- **Status**: NEEDS-FIX (clustered at Seq 41-45, may cause "doc PR exhaustion")
- **Finding**: 14 items touch
  `docs/security/authorization-capability-contract.md` and `.json`
  (`plan-loop-2-04-doc-touch-matrix.md:142-148`). Mapped onto the master
  sequence:
  ```
  Seq  8: #13   (vendor shim)
  Seq 13: #15   (access_user surface add)
  Seq 14: #37   (governance verify-only)
  Seq 22: #50   (KRI submission delete)        — md:117,118,161 + json:389,411
  Seq 41: #55   (access_user_service)          — md:109 + json:106,229
  Seq 42: #24   (KRI linked_vendors)           — md:116,117,118 + json:368,388,410
  Seq 43: #51   (KRI value_application)        — md:117,118,161 + json:389,411
  Seq 44: #56   (directory_identity_service)   — md:109 + json:111,229
  Seq 45: #61   (graph_directory move)         — md:109 + json:113,229
  Seq 50: #34   (privilege tier vocabulary)
  Seq 65: #65   (crudCapabilitySchema catalog snap)
  Seq 67: #39   (admin builder catalog)
  Seq 69: #62   (kri_vendor_assignment path)   — md:172
  Seq 74: #60   (PrivilegeContext vocabulary)
  ```
  The cluster Seq 22 → 41 → 42 → 43 → 44 → 45 is **6 capability-contract
  edits in 24 slots** (every fourth slot). Worse, Seq 41-45 is **5 contract
  edits in 5 consecutive slots**, all hitting overlapping doc cells:
  - md:109 hot row touched by #55 (Seq 41), #56 (Seq 44), #61 (Seq 45) — three
    sequential edits to the same `service_policy` blob
    (`plan-loop-2-07-hidden-prereqs.md:366-378` quote `"hot row touched by 3
    cross-cut items"`).
  - md:117 hot row touched by #50 (Seq 22), #24 (Seq 42), #51 (Seq 43) — three
    edits to the same paragraph
    (`plan-loop-2-07-hidden-prereqs.md:351-356`).
  Each touch fires the validator and reads the same blob. A single dev doing
  TDD across these five slots will mentally compose, validate, undo on
  validator-fail, recompose — five days in a row touching the same document.
  This is a known anti-pattern ("doc PR exhaustion") and the developer answer
  did NOT call it out.
- **Recommendation**: Treat Seq 41-45 as a single "doc-contract wave" with a
  shared one-paragraph mental model (the contract.md `service_policy` blob
  shrinks from 5 tokens to 2 across the wave). At
  `plan-loop-2-08-master-sequence.md:84-85`, add a "doc-contract wave"
  callout under Atomic clusters that says: "Seq 41-45 is the
  capability-contract editing wave; the developer spends 5 sessions reading
  the same `service_policy` blob. Pre-cache the file open in the editor and
  treat as one mental unit."

---

## Check #7: Migration window timing (#69+#70 at slot 76-77)

- **Status**: NEEDS-FIX (debatable — late-window has stale-test risk)
- **Finding**: `#69+#70` lands at Seq 76-77, the literal end of the
  77-item plan (`plan-loop-2-08-master-sequence.md:116-117`). The reasoning
  is in `plan-loop-2-08-master-sequence.md:31` quote `"Migration window LAST
  — #69+#70 atomic ... Defer P4 ... single migration window"`. The argument
  is sound for blast-radius reasons (forward-only Alembic, ADR-010). But
  there is a hidden cost: by Seq 75 the developer has done 75 items of
  refactoring, **including** Vendor-domain items #13 (Seq 8, vendor shim
  delete) and #16 (Seq 55, vendor reports legacy excel tombstones) and #17
  (Seq 46, vendor monitoring shim) and #57 (Seq 6, quarterly facade reject)
  and #31 (Seq 57, vendor reporting service extract).
  - Five Vendor items land BEFORE Seq 76. Each touches `_register_listings/
    vendors.py` or `_vendor_governance/`. By Seq 75 the dev has been mentally
    out of the Vendor model for ~70 slots. The reload cost is real.
  - **Stale-test risk**: every test added in #13/#16/#17/#31 references
    `Vendor.status` (per the audit, Loop 1 #70 lists `status_filter=...` in
    `_register_listings/vendors.py:482` per `plan-loop-1-05-vendor-quarterly.md:328`).
    When Seq 76-77 finally lands, the dev must scrub assertions in tests
    that were written 70 slots earlier.
  - **Counter-argument**: ADR-010 forward-only means rehearsal is operational
    risk. Landing this earlier increases the chance a later refactor breaks
    Postgres lane. The plan correctly minimises that risk.
- **Recommendation**: Either (a) keep Seq 76-77 as-is and add a "test-scrub
  checklist" to `plan-loop-2-06-migration-window.md:599-605` enumerating the
  exact `Vendor.status` references that will need deletion at landing time
  — these are already partially listed at the Step 5 service-edit fan-out
  (line 600). OR (b) consider promoting the migration window to Seq ~62-63
  (after the P3 medium wave but before P4 deferred). The plan-2-08
  rationale at line 297 quote `"could move earlier in the sequence (e.g.,
  Seq 60-65 region)"` already anticipates this; the question is whether to
  exercise it. Recommend keeping at 76-77 but scheduling a "Vendor scrub"
  micro-pass at Seq ~74 to gather all 5 Vendor items' tests for review
  before the migration lands.

---

## Check #8: ADR landing order (ADR-011, ADR-012, ADR-007-amend at slots 1-4)

- **Status**: PASS
- **Finding**: Master sequence
  (`plan-loop-2-08-master-sequence.md:41-44`):
  ```
  Seq 1: #72  ADR-011 (Auth Scheme and Session Model)   M  P1
  Seq 2: #73  ADR-012 (KRI period algebra)              M  P2
  Seq 3: #74a ADR-007 amendment (CENSUS phase)          M  P3
  Seq 4: #74b ADR-007 amendment (ADR text)              M  P3
  ```
  This is correct because:
  1. ADR-011 (#72) is a hard prereq for #71 (Seq 75, session merge)
     (`plan-loop-2-07-hidden-prereqs.md:155-172`). Landing it first ratifies
     vocabulary the developer references for ~74 subsequent slots.
  2. ADR-012 (#73) frames the KRI period algebra — touched by Seq 22, 23
     (#50, #52) and the atomic pair #24+#51 at Seq 42-43. Landing it second
     gives the dev a reference card for KRI work.
  3. ADR-007-amend (#74a then #74b) is sequenced second-half but the prose
     at `plan-loop-2-08-master-sequence.md:43-44` correctly notes #74b waits
     on cross-domain #61 (Seq 45). So #74a at Seq 3 is the census phase
     (TOMLs only) — green standalone — and #74b waits for #61's
     `_graph_directory/` creation. The order is correct.
  But there is a wrinkle: #74a's lock test at
  `plan-loop-1-08-crosscut.md:633` quote `"enumerate
  glob('backend/app/services/_*/'); assert exactly 31 packages today"` will
  drift once #61 lands at Seq 45 (32 packages). This is **Missing-dep #B**
  flagged in `plan-loop-2-07-hidden-prereqs.md:108-114`. The cohesion
  question is: does landing #74a before #61 cause a phantom red?
  - Loop 2 hidden-prereqs gives the answer: amend #74a's wording from
    "exactly 31" to "31 today, 32 after #61". This unblocks the ADR-first
    sequencing.
- **No fix required at ADR level**. The Missing-dep #B fix in
  `plan-loop-2-07-hidden-prereqs.md:551-558` is the right path.

---

## Check #9: Lock-test budget (~63 NEW lock test files vs. current 35)

- **Status**: NEEDS-FIX (cumulative test-runtime concern)
- **Finding**: Current architecture lock-test directory has **34 test files**
  (verified: `ls tests/backend/pytest/architecture/*.py | wc -l` = 34, plus
  `_archive_allowlist.toml`, `_naming_allowlist.toml`,
  `_capabilities_all_allowlist.toml`, `_endpoint_commit_allowlist.toml` are
  TOMLs not test files). Loop 2 adds:
  - 24 NEW backend lock test files (architecture/) per
    `plan-loop-2-03-lock-conflict-matrix.md:459`
  - 17 NEW backend non-architecture test files per line 460
  - 22 NEW frontend test files per line 461
  - 6 NEW TOML registries per line 462
  Final state: **34 + 24 = 58 backend architecture lock-test files** (a 70%
  growth in one initiative). Cumulative test runtime concern:
  - Each lock test is fast (≤ 1 s on average), but `make
    test-architecture-locks` orchestrates `pytest -m contract` over the full
    set. At 58 files × 5-10 tests each, the suite can grow from ~3 minutes
    today to ~5-7 minutes post-cleanup.
  - The validator (`scripts/security/validate_authz_capability_contract.py`)
    runs separately and is fast (~1 s for the 137-entry manifest).
  - There is no Loop 2 acknowledgement that the architecture suite will
    grow ~70% in size, nor a budget cap.
- **Recommendation**: Add a section to
  `plan-loop-2-03-lock-conflict-matrix.md` (after line 464) titled
  "Lock-test runtime budget". Cap budget at +5 minutes wall-clock; if the
  cumulative new tests would push past that, mark the worst offenders as
  candidates for `pytest -m contract -k` filtering (run subset on PR; full
  on nightly). At minimum, document the expected +70% file-count growth
  so reviewers have advance notice.

---

## Check #10: Cross-domain coherence at handoffs

- **Status**: NEEDS-FIX (minor — three handoffs share files but lack
  explicit coordination notes)
- **Finding**: A clean handoff is when domain A finishes its slice and
  domain B starts without referencing deleted modules. The master sequence
  (`plan-loop-2-08-master-sequence.md:41-117`) shows several handoffs:
  - **Seq 14 → 15**: Frontend (#37) → Issues (#2). Disjoint files. ✅
  - **Seq 24 → 25**: Issues (#53) → Approvals (#54). Disjoint. ✅
  - **Seq 28 → 29**: Risks (#20, doc-only) → Endpoints (#21). Disjoint. ✅
  - **Seq 36 → 37**: Frontend (#48) → Frontend (#64). Same domain. ✅
  - **Seq 40 → 41**: Frontend (#23) → Crosscut (#55). #23 deletes
    `controlFormUtils.ts`; #55 deletes `access_user_service.py`. Disjoint. ✅
  - **Seq 45 → 46**: Crosscut (#61) → Vendor (#17). Disjoint. ✅
  - **Seq 53 → 54**: Issues (#28) → Issues (#30). #28 deletes
    `_issue_register/source_mutation.py`; #30 prunes
    `_shared/__init__.py`. The `_shared/__init__.py` re-export of
    `source_mutation` would dangle for one slot if these were not
    sequenced in-domain. They are correctly chained
    (`plan-loop-2-02-execution-order.md:117-118`). ✅
  - **Seq 67 → 68**: Frontend (#39) → Crosscut (#40). #39 lands the new
    `AdminConsoleCapabilities` builder; #40 reorganises the admin
    sub-routers (`plan-loop-2-08-master-sequence.md:107-108`). #40 strictly
    needs #39 green. Captured. ✅
  Three handoffs that need a coordination note but don't have one:
  1. **Seq 8 (#13 vendor shim) → Seq 9 (#1 risks crud `__all__`)**:
     The two are unrelated, but Seq 8 lands `vendor_link_helpers.py`
     deletion which propagates to `vendor_link_helpers` references. Risks
     domain doesn't import vendor link helpers, so handoff is clean.
  2. **Seq 50 (#34 privilege tier) → Seq 51 (#27 issue loading dedup)**:
     #34 migrates `endpoints/users/summary.py:24-26`; #27 touches
     `endpoints/issues/_shared/loading.py`. Disjoint. ✅ But Loop 2 hidden
     prereqs flagged Missing-dep #A: three plans (#34, #12, #37) all edit
     `users/summary.py`. The master sequence at slots 7 (#12), 14 (#37),
     50 (#34) puts the ordering correctly (#37 → #12 → #34 per
     `plan-loop-2-07-hidden-prereqs.md:533-535`). But the handoff between
     Seq 50 and Seq 51 is not the issue; the **3-way file overlap on
     `users/summary.py`** is. The plan should call this out in the master
     sequence not just in hidden-prereqs.
  3. **Seq 65 → 66 (#65 crudCapabilitySchema → #67 useResourcePanelQuery)**:
     Both depend on #46 (Seq 64). The handoff is clean, but if #65
     introduces a base schema that #67 mounts as a hook factory, a
     reviewer might want them paired. Loop 2 marks them as "either order
     after #46" (`plan-loop-2-08-master-sequence.md:285`). Mechanical
     handoff is fine.
- **Recommendation**: At `plan-loop-2-08-master-sequence.md:248-256`
  (Atomic clusters section), add a "File-overlap clusters" subsection
  enumerating the 3 cross-domain file-overlap groups:
  1. `endpoints/users/summary.py` — items #12 (Seq 7), #37 (Seq 14), #34
     (Seq 50). Recommended order: #37 → #12 → #34.
  2. `docs/security/authorization-capability-contract.md` line 109 — items
     #55 (Seq 41), #56 (Seq 44), #61 (Seq 45). Recommended order as
     sequenced.
  3. `tests/backend/pytest/test_architecture_deepening_contracts.py` lines
     117-118, 997-1002 — items #50 (Seq 22), #24 (Seq 42), #51 (Seq 43).
     Recommended order as sequenced.

---

## Check #11: Reviewer fatigue (77 items as one queue)

- **Status**: NEEDS-FIX (recommend grouping into release waves)
- **Finding**: The plan as currently presented is a 77-item linear queue.
  At ~12 weeks (or 14-16 weeks with adversarial review), this is the size
  of a quarterly initiative. A single reviewer following PR-by-PR will
  experience:
  - **PR fatigue** — 77 PRs at typical merge cadence (5-10/week) is 8-15
    weeks of "review one cleanup, approve, next". By PR ~30 the reviewer
    forgets which audit findings are upstream of which.
  - **Lost narrative thread** — without grouping, a reviewer cannot say
    "this batch is the issues domain" or "this batch is the FE auth
    refactor". The natural narrative is buried inside Loop 1 plans, not
    surfaced in the master sequence.
  - **Approval-bandwidth ceiling** — engineering managers typically cap
    approval bandwidth at ~5-10 PRs/dev/day for a single reviewer. 77 PRs
    over 12 weeks at 1 reviewer = ~6.4 PRs/week per reviewer = sustainable
    but only just.
  Loop 2 already groups items into "Gates A-G"
  (`plan-loop-2-08-master-sequence.md:316-324`), but these are landing
  gates, not review waves. They are also unevenly sized:
  ```
  Gate A (ADRs):           4 items
  Gate B (P1 quick wins): 10 items
  Gate C (P2 dead-code):  29 items  ← too large for one review wave
  Gate D (P2 chains):     15 items
  Gate E (P3 medium):     11 items
  Gate F (P4 deferred):    6 items
  Gate G (Migration):      2 items
  ```
  Gate C at 29 items is unwieldy as a single review wave.
- **Recommendation**: Add a "Release waves" or "Review batches" section to
  `plan-loop-2-08-master-sequence.md` after line 324, splitting Gates C
  and D into two waves each:
  ```
  Wave 1 (ADRs):              4 items  (Seq 1-4)   — Week 1
  Wave 2 (P1 quick wins):     10 items (Seq 5-14)  — Week 2
  Wave 3 (P2 dead-code A):    14 items (Seq 15-28) — Weeks 3-4
  Wave 4 (P2 dead-code B):    15 items (Seq 29-43) — Weeks 5-6
  Wave 5 (P2 chains):         15 items (Seq 44-58) — Weeks 7-8
  Wave 6 (P3 medium):         11 items (Seq 59-69) — Weeks 9-10
  Wave 7 (P4 deferred):        6 items (Seq 70-75) — Week 11
  Wave 8 (Migration):          2 items (Seq 76-77) — Week 12 (with rehearsal)
  ```
  Each wave = ~10 items = ~5 PRs/week × 2 weeks. Reviewer fatigue is
  managed by an explicit "wave summary" PR at the start/end of each wave.

---

# Narrative walkthrough

## Monday morning, week 1: ADR-011 ratification

The developer opens `plan-loop-2-08-master-sequence.md` and sees Seq 1:
`#72 — Author ADR-011 (Auth Scheme and Session Model)`. M effort, P1, no
prereqs. They open `docs/adr/ADR-011-auth-scheme-and-session-model.md`
(empty file path), reference `plan-loop-1-08-crosscut.md:534-594` for the
ADR-011 outline, and write a failing test
`tests/backend/pytest/architecture/test_adr_011_present_red.py` that
asserts `(REPO_ROOT / "docs/adr/ADR-011-auth-scheme-and-session-model.md").exists()
and "## Decision" in (...).read_text()`. Red. They then write the ADR:
context, decision, consequences, references. They update
`docs/adr/README.md`, `AGENTS.md:218-231`, `docs/DOCUMENTATION_TREE.md:86-89`.
Validator runs (cap-contract not touched, smoke pass). Architecture-locks
suite runs. The new test goes green. Single commit. Day 1 done.

Tuesday — ADR-012 (#73). Identical shape, different content (KRI period
algebra, `_kri_history/constants.py:2` is the SSOT). Writes ADR text,
adds `_kri_state_vocabulary_allowlist.toml`, updates
`backend/app/services/_config/lookup.py:26` to drop the duplicate
`REPORTING_GRACE_DAYS = 15`. Tests RED → GREEN. Single commit. Day 2 done.

Wednesday — #74a (ADR-007 census). The developer drafts 4-5 new TOMLs
under `tests/backend/pytest/architecture/` (write-side, read-shape,
workflow-pairs, adapters). Writes a classification test that walks
`backend/app/services/_*/` and asserts each package is in exactly one
TOML. Discovers (per the cohesion #B note) that the count needs to read
"31 today, 32 after #61" — applies the wording fix proactively. Day 3.

Thursday — #74b is gated by #61 (Seq 45). Skips ahead to #10 (Seq 5):
keep `riskhub_questionnaires.py`. Doc-only verify. Adds
`test_riskhub_questionnaires_module_present_red.py`. Day 4 (half-day —
this is a single-line presence assert).

Friday — #57 (Seq 6, Reject quarterly facade). #12 (Seq 7, narrow
blanket-except in `users/summary.py`). The dev now realises (per
cohesion #A) they will touch `users/summary.py` 3 times across the
plan: Seq 7 (#12), Seq 14 (#37), Seq 50 (#34). They make a mental note
to keep changes additive and isolated. Day 5.

End of week 1: 4 ADRs ratified + 3 quick wins. Morale is high. The
"red→green→commit" rhythm is established.

## Halfway point (week 6, around Seq 40-45)

The dev has just completed Seq 39-40 (#22, #23 — ControlForm shim
delete + controlFormUtils inline). They are now entering the "doc-contract
wave" — Seq 41-45 — and per cohesion #6 this is **5 consecutive validator
runs touching the same `service_policy` paragraph in
`docs/security/authorization-capability-contract.md`**.

Day 1: Seq 41 (#55, access_user_service.py facade). Reads md:109. Removes
the token. Validator runs. Green. Commits.

Day 2: Seq 42 (#24, KRI linked_vendors barrel) atomic with Seq 43 (#51,
KRI value_application). Both rewrite `kris/linked_vendors.py:3` in the
same commit. Five doc cells edited in `authorization-capability-contract.md`
(rows 116, 117, 118 + json:368, 388, 410, 411 + 389). Five **deepening
contract** assertions in `test_architecture_deepening_contracts.py` lines
976, 979, 980, 998-1000 also relaxed. Validator runs (twice — once before
docs, once after). Green. Single commit per atomic invariant.

Day 3: Seq 44 (#56, directory_identity_service shim) atomic with Seq 45
(#61, graph_directory move). Touches md:109 again (token removal) and
json:111, 113, 229. Creates `_graph_directory/README.md` (new file).
Test rewrites in `test_architecture_deepening_contracts.py:227-238`.
Validator runs. Green. PR with two commits (#56 then #61) per the
"paired wave" boundary.

By Day 5 of this week the dev has done **four contract-edit commits in
five days**, each touching the same blob. The mental cache of the
contract file is now warm; the dev knows every paragraph by heart. This
is sustainable for one week (cache-warm), not for two.

End of week 6: ~45 of 77 items landed (58%). Velocity steady at ~5
items/week. The dev is now confident the architecture-lock suite can
absorb new tests without breaking — every wave so far has run green.

## Home stretch (weeks 11-12, Seq 70-77)

Seq 70 (#45a, ownership characterization tests). The dev writes 3 new
test files capturing current ownership semantics. Tests pass (these are
**characterization** tests — they pin behavior, they don't fail). Seq 71
(#45b, ownership resolver factory). Now the rewrite. The 3 tests stay
green, proving zero behavioral regression.

Seq 72 (#66, AuthContext split). This is the FE refactor. The dev opens
`frontend/src/contexts/AuthContext.tsx` for the first time in 11 weeks.
Reads `plan-loop-1-06-frontend.md:406-425` for context. Writes 2 new
test files (SessionProvider.split.test.tsx, AuthActions.split.test.tsx).
Splits the context into 3 providers. Validator runs (FE local-gate
allowlist may need extension per
`plan-loop-2-05-validator-schedule.md:351-372`).

Seq 73 (#68, WidgetShell). FE-only. Seq 74 (#60, PrivilegeContext). BE,
wraps #34. Seq 75 (#71, session merge 8→4 files). The dev needs ADR-011
ratified — that landed Seq 1, eleven weeks ago. They re-read the ADR.
Writes coordinator/sessionStorage merged tests.

Seq 76-77 (#69+#70, vendor migration bundle). Single commit, single
forward-only Alembic revision. The dev runs the migration on the
Postgres rehearsal lane (`make postgres-up`), captures pre/post row
counts per ADR-010, runs the architecture-locks suite plus all
migration-lane tests. Per cohesion #7, they had stale `Vendor.status`
references in tests written 70 slots earlier; they scrub those before
the commit lands. One bundled commit. ~1-2 days.

End of week 12: 77 items landed. Total commits: ~70 (3 atomic pairs
collapse to 2 commits each; #69+#70 collapse to 1). Total review PRs:
~70. The architecture-lock suite has grown from 34 to ~58 files. The
capability contract has shrunk by ~12 deleted tokens and gained 1 new
surface (access_user). 4 ADRs ratified.

# Top 5 cohesion improvements (apply before Phase 4)

1. **Add a "release waves" section** to
   `plan-loop-2-08-master-sequence.md:316` splitting Gates C and D into
   8 numbered waves of ~10 items each. Reviewer fatigue (Check #11) is
   the largest single risk to a 77-item queue. Waves give the reviewer a
   stop-and-summarize cadence. (Detailed sub-table in the cohesion
   report.)

2. **Pre-cache the doc-contract wave** at Seq 41-45 (Check #6).
   Add a callout under Atomic clusters that says "Seq 41-45 is the
   capability-contract editing wave; 5 sessions touching the same
   `service_policy` paragraph; pre-open the file once per session
   and treat as a single mental unit."

3. **Surface the file-overlap groups** (Check #10). At
   `plan-loop-2-08-master-sequence.md:256` add a "File-overlap clusters"
   subsection enumerating: (a) `users/summary.py` touched by Seq 7, 14,
   50 (#12, #37, #34); (b) contract.md:109 touched by Seq 41, 44, 45
   (#55, #56, #61); (c) `test_architecture_deepening_contracts.py`
   tuple lines touched by Seq 22, 42, 43 (#50, #24, #51). Recommended
   order is already as-sequenced; surfacing it prevents a reviewer from
   re-deriving it from Loop 1 + hidden-prereqs.

4. **Lock-test runtime budget** (Check #9). Add a section to
   `plan-loop-2-03-lock-conflict-matrix.md:464` documenting that the
   architecture-lock test directory grows from 34 to ~58 files (+70%).
   Cap budget at +5 minutes wall-clock; if cumulative new tests would
   push past that, mark candidates for `pytest -m contract -k`
   filtering. At minimum, set reviewer expectation for the +70% file
   count.

5. **Tighten the priority-tier total** (Check #1). At
   `plan-loop-2-08-master-sequence.md:307-312`, change the off-by-2
   total ("10 + 43 + ~18 + 8 = 79") to the correct decomposition:
   "10 (P1) + 43 (P2) + 16 (P3) + 8 (P4) = 77 items, with `#45a/b` and
   `#74a/b` each counted once per half, `#75` once". Minor, but
   reviewer-confidence-affecting at the top of the master sequence.

---

## Appendix A: 11-check scorecard

| Check | Status | Severity |
|---|---|---|
| 1. Numbering consistency | NEEDS-FIX | minor (wording) |
| 2. Effort sum sanity | PASS | — |
| 3. Phasing intuition | NEEDS-FIX | minor (gate seam annotations) |
| 4. TDD discipline & test count reconciliation | NEEDS-FIX | minor (reconciliation) |
| 5. Validator schedule sanity | PASS | — |
| 6. Doc churn cadence (Seq 41-45 cluster) | NEEDS-FIX | medium (ergonomics) |
| 7. Migration window timing | NEEDS-FIX | medium (debatable) |
| 8. ADR landing order | PASS | — |
| 9. Lock-test budget | NEEDS-FIX | medium (cumulative runtime) |
| 10. Cross-domain handoffs | NEEDS-FIX | minor (file-overlap callouts) |
| 11. Reviewer fatigue | NEEDS-FIX | medium (release waves) |

Net: **3 PASS**, **8 NEEDS-FIX** (5 minor, 3 medium). Zero structural
defects (no cycles, no atomic-cluster splits, no priority inversions).
The plan is structurally sound; the fixes are about presentation and
reviewer-experience, not about reordering or re-scoping.

## Appendix B: Items already pre-fixed in Loop 2

- **Missing-dep #A** (3-way file overlap on `users/summary.py`): captured in
  `plan-loop-2-07-hidden-prereqs.md:506-535`. Not yet promoted to the master
  sequence.
- **Missing-dep #B** (#74a "exactly 31" wording): captured at lines 540-558.
  Not yet applied to `plan-loop-1-08-crosscut.md:633`.
- **Missing-dep #C** (cross-cut MD:109 churn): captured at lines 561-580.
  Not yet promoted.
- **Missing-dep #D** (auth/ allowlist 2026-09-01 sunset): captured at lines
  583-603. **No item exists yet.** The cohesion check #11 confirms this is a
  real gap; the recommended action is to add a tracked follow-up item, not
  a new master-sequence row.
- **Missing-dep #E** (#35 → #66 soft prereq): captured at lines 606-622.
  Not yet promoted.
- **Missing-dep #F** (FE Vendor.status type cleanup post-#70): captured at
  lines 625-643. Not yet promoted.
- **Missing-dep #G** (#38 FE TS rename impact): captured at lines 646-662.
  Not yet promoted.

End of Phase 3 Loop 3 cohesion check.
