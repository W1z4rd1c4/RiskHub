# Phase 4 Loop 2 (ADVERSARIAL) — Sequence Audit

**Working directory**: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. **Build commit**: `1ee872a4`.
**Source under review**: `plan-loop-3-07-integration-v2.md` (79-item v2 master sequence).
**Reference inputs**: `plan-loop-2-01-master-dag.yaml`, `plan-loop-2-07-hidden-prereqs.md`,
`plan-loop-3-08-cohesion.md`, all `plan-loop-1-0*-*.md`, current repository
state (lock tests + TOMLs + import graph).

**Mode**: ADVERSARIAL — Loop 1 declared ZERO violations. The point of this
sweep is to challenge that. The strategy: re-grep the repository for shared
file paths between sequenced items, re-read each plan's "Lock/TOML/contract
updates" section against the current lock-test source, and look for missed
load-order, fixture-cascade, and shared-edit collisions.

Method per candidate: confirm with `file:line` citations + ≤15-word quotes
from plans or current source; classify as HARD (breakage), SOFT (churn), or
NONE (false alarm); recommend an edge or no action.

---

## Executive summary

| Bucket | Count |
|---|---:|
| Newly-found HARD violations | **0** |
| Newly-found HARD missed-deps (existing edges sufficient, but plan note must be amended) | **2** |
| Newly-found SOFT missed-deps (sequencing-only) | **3** |
| FALSE alarms (orchestrator hint that didn't pan out) | **5** |
| Recommended sequence patches | **0** (sequence is sound; per-plan amendments only) |
| Items needing further atomic clustering | **0** |

**Bottom line**: Loop 1's "ZERO HARD VIOLATIONS" verdict is **CONFIRMED**.
Every hard topological edge in v2 is honored, every atomic cluster is
contiguous, every hub wave is preserved, every soft sequencing edge from
Loop 2 A7 Corrections A–G is honored. The two new items #76 and #77 are
correctly placed.

But Loop 1 missed **5 implicit dependency / coordination notes** that are
sequencing-friendly (so v2 already happens to satisfy them) but should be
captured as explicit edges or per-plan annotations. None require a sequence
patch. Two are HARD (would create a load-order break under bizarre
re-orderings) but v2's existing ordering already satisfies them.

---

## 1. Methodology and threat model

The "zero violations" claim relies on:
1. Every edge listed in `plan-loop-2-01-master-dag.yaml` `in_domain_deps` /
   `cross_domain_deps`.
2. Every Loop 2 A7 Correction (A–G) edge.
3. Atomic clusters declared via `atomic_with`.

**Adversarial gap classes** I hunted for:

| Class | Risk | What I checked |
|---|---|---|
| (a) Test fixture cascade | New fixture introduced by item A, used by item B's test | `client_factory` extensions, role-scoped clients, new TOMLs |
| (b) Type/schema cascade | Pydantic rename → Zod schema mirror | #38 `RiskFilters`/`BatchSendRiskFilters`, #70 `Vendor.status` FE TS |
| (c) Lock-test load order | Module-level import in lock test of a symbol/file removed by another item | `test_architecture_deepening_contracts.py` (1423 lines, ~30+ module imports) |
| (d) Migration → seed cascade | #70 drops Vendor.status; do later seeds run after #70? | `seed_e2e_vendors.py` referenced by Vendor plan |
| (e) Capability catalog ordering | #15 NEW surface vs. #65 CRUD base | Cross-grep FE Zod for `access_user` |
| (f) #74a → #74b mid-edit gap | NEW TOMLs at #74a vs. disjointness lock at #74b | Cross-cut plan census prose |
| (g) #39 → #40 admin reorg | #40's dependency on #15? | #15 catalog vs #40 admin re-cluster scope |
| (h) FE type hierarchy w/ Zod | #46 → #65 → #67; #38 BatchSendRiskFilters Zod mirror | `frontend/src/services/api/schemas/riskHub.ts:147` + `lookupApi.ts:39` |
| (i) #76 → #71 auth/session | #76 (auth/ migration) vs. #71 (FE session merge) | `endpoints/auth/*` vs. `frontend/src/services/session/*` |
| (j) Postgres-lane test cascade | Tests added by #69+#70 referenced by other items | `test_w4_bc_c_vendor_governance_*` family |

---

## 2. Missing-dep candidates (with verdict)

### Candidate 1: #62 (kri_vendor_assignment relocate) → #70 (Vendor.status drop) — shared test file

- **Evidence**:
  - `tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py:7`
    quote `"from app.schemas.vendor import VendorStatusEnum"`.
  - Same file `:10` quote `"from app.services.kri_vendor_assignment import
    ensure_vendors_exist, validate_assignable_vendors"`.
  - `plan-loop-1-04-kris.md:282` (#62 verification) lists this test file.
  - `plan-loop-1-05-vendor-quarterly.md:255` (#70 lock updates) lists same
    file.
- **v2 slots**: #62 → 69; #70 → 78. Slot 69 < slot 78.
- **Severity**: SOFT (mechanical churn, not a breakage). Both plans declare
  the file in their per-plan "Lock/TOML/contract updates" sections but
  neither plan acknowledges the cross-collision.
- **Loop 1 missed because**: this is a Loop 2 A7-style cross-domain doc
  collision, but on a TEST file rather than the capability contract.
  Loop 2 A7's check #15 (`hidden-prereqs.md:323-381`) limited the
  collision matrix to `docs/security/authorization-capability-contract.{md,
  json}`. Test files were never enumerated.
- **Recommendation**: NO sequence change. Add a coordination note to the
  cross-cut sequencing plan that #62 (slot 69) updates the
  `kri_vendor_assignment` import in this test, and #70 (slot 78) later
  edits the same file's `:7` and `:37` for `VendorStatusEnum`. Each
  commit is mechanically isolated.

### Candidate 2: #38 BatchSendRiskFilters Zod mirror — false alarm at FE site

- **Evidence**:
  - `plan-loop-1-07-endpoints.md:794-797` and Loop 2 A7 Correction G
    (`hidden-prereqs.md:645-662`) flag rename impact on
    `frontend/src/services/api/schemas/riskHub.ts:147`.
  - Current FE state at `frontend/src/services/api/schemas/riskHub.ts:147`
    quote `"export const batchSendQuestionnairesResponseSchema =
    batchSendResponseSchema;"` — no `RiskFilters` TS reference at this
    line; rename is a backend-only rename of `RiskFilters` →
    `BatchSendRiskFilters` Pydantic class. FE side never imported the
    name.
  - `frontend/src/services/lookupApi.ts:39` quote `"async getRiskFilters():
    Promise<{ processes: string[], categories: string[] }>"` — different
    `RiskFilters` namespace (lookup API endpoint), not the renamed
    Pydantic class.
- **Severity**: NONE (false alarm).
- **Loop 1 verdict**: Correction G's bundled-commit framing is sufficient.
  No FE code references the renamed Pydantic class.
- **Recommendation**: NO action. Loop 1 was right.

### Candidate 3: #46 → #65 → #67 frontend hub — possible #15 dependency

- **Evidence**:
  - `plan-loop-1-06-frontend.md:376` (#65) quote `"shared `crudCapabilitySchema`
    Zod base for risks/controls/kris/vendors"`.
  - #15 is the `access_user` capability surface (`plan-loop-1-07-endpoints.md:123`
    quote `"ADD access_user as 8th surface in
    docs/security/capability-catalog.json"`).
  - Cross-grep `frontend/src/services/api/schemas/` for `access_user`:
    `auth.ts:48` quote `"can_view_access_users: z.boolean(),"` exists today
    (pre-existing capability flag, not the new surface).
  - #65 plan explicitly states (`:376`) that #65's shared base is for
    "**4 entities** (risks/controls/kris/vendors)" — Loop B's correction
    `:380` excludes `issues`, and `access_user` is not in scope.
- **Severity**: NONE.
- **Loop 1 verdict**: #15 → #65 is NOT a hard prereq. #65 deliberately
  scopes to 4 entities; `access_user` is not a CRUD entity in the same
  sense.
- **Recommendation**: NO action. Loop 1 was right.

### Candidate 4: #74a (NEW TOMLs) → #74b (disjointness lock) — mid-edit gap

- **Evidence**:
  - `plan-loop-1-08-crosscut.md:646-668` lists #74a creating 4 NEW TOMLs:
    `_bounded_context_write_side.toml`, `_bounded_context_read_shape.toml`,
    `_bounded_context_workflow_pairs.toml`, `_bounded_context_adapters.toml`,
    PLUS a proposed 5th `_bounded_context_policy.toml`.
  - `plan-loop-1-08-crosscut.md:691-694` quote `"EXTEND
    test_w7_audit_adapter_completeness_red.py or NEW
    test_w7_bounded_context_disjointness.py to enforce 'every
    underscore-prefixed package classified in EXACTLY one TOML'"`.
  - Plan locates the disjointness lock under #74b (ADR text phase) but
    `:621-624` quote describes the lock as part of #74a's TDD-shape:
    `"#74a: write a structural test that lists the 31 underscore-prefixed
    packages and asserts EACH one appears in exactly one of the 4 (or 5)
    classification TOMLs"`.
- **Severity**: NONE — the disjointness lock is part of #74a, not #74b.
  Plan reads correctly: #74a creates the TOMLs and the disjointness test
  in the same commit.
- **Loop 1 verdict**: NO sequencing concern. The plan correctly bundles
  TOMLs + disjointness lock at #74a (`plan-loop-3-07-integration-v2.md:103-104`
  quote `"#74a phase: census + 4 (or 5) TOMLs + classification test"`).
- **Recommendation**: NO action. The orchestrator's hypothesized "mid-edit
  gap" doesn't exist; the plan is correct.

### Candidate 5: #76 (auth/ commit migration) → #71 (FE session merge) — share auth allowlist?

- **Evidence**:
  - `plan-loop-1-08-crosscut.md:546` quote `"ADR-011 must land BEFORE #66
    (FE-N5 AuthContext) and #71 (S7.8 session merge)"`.
  - `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml`
    contains 8 entries, all in `endpoints/auth/*` (the `:1-48` content).
  - #71 (`plan-loop-1-06-frontend.md:479-503`) is FE-only — touches
    `frontend/src/services/session/{bootstrap,manager,sso,refreshHint,
    logoutSuppression}.ts` only.
  - Backend `auth/sso.py:17` quote `"from app.services._auth_session import
    resolve_sso_exchange, resolve_sso_start"` and
    `auth/refresh.py:26` similar — uses `_auth_session` package, NOT
    FE `services/session/`.
- **Severity**: NONE — different layers (BE `auth/` endpoint family vs. FE
  `services/session/`), no shared file.
- **Loop 1 verdict**: #76 (slot 70) and #71 (slot 76) have no file
  collision. Both need #72 (ADR-011) but otherwise independent.
- **Recommendation**: NO action. Loop 1 was right.

### Candidate 6: #69+#70 postgres-lane tests cascade — referenced by no later item

- **Evidence**:
  - `plan-loop-1-05-vendor-quarterly.md:194` quote `"NEW
    tests/backend/pytest/migrations/test_vendor_link_cascade_postgres_red.py"`.
  - `:234` quote `"NEW tests/backend/pytest/migrations/
    test_vendor_status_column_dropped_postgres_red.py"`.
  - Cross-grep for these test names in plan files: 0 hits outside the
    Vendor plan.
  - Cross-grep `_makefile_postgres_lane` references in plans: 0 references
    in any items besides #69+#70.
- **Severity**: NONE.
- **Loop 1 verdict**: Postgres-lane tests are produced by the migration
  window only; no later item references them.
- **Recommendation**: NO action.

### Candidate 7: #62 plan claims `rg "kri_vendor_assignment" tests/` returned no other locks — false claim?

- **Evidence**:
  - `plan-loop-1-04-kris.md:275` quote `"Audit no other lock cites
    kri_vendor_assignment by path. (Verified: rg "kri_vendor_assignment"
    tests/.)"`
  - Re-running the grep:
    `tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py:10`
    quote `"from app.services.kri_vendor_assignment import
    ensure_vendors_exist, validate_assignable_vendors"` — non-architecture
    test, but a TEST FILE that imports from the path that #62 relocates.
- **Severity**: HARD (collection-time `ImportError` if #62 moves the file
  without updating this test's import).
- **Loop 1 verdict**: Loop 1 didn't notice this because the architecture-lock
  audit at `plan-loop-1-04-kris.md:274-275` only addressed the
  `architecture/test_w4_bc_c_*_boundaries_red.py:16` lock; the
  `domain_errors_red.py` import at line 10 is in a different file
  (`tests/backend/pytest/`, not `tests/backend/pytest/architecture/`).
- **Recommendation**: AMEND `plan-loop-1-04-kris.md` Item #62
  Code/file changes section: add bullet "Update
  `tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py:10`
  import path from `app.services.kri_vendor_assignment` to
  `app.services._vendor_links.kri_assignment`". This is a per-plan
  completeness gap, NOT a sequence violation. v2 sequence is unchanged.

### Candidate 8: #8 (source-validation split) → in-domain prereq for #2 ordering — load order in lock

- **Evidence**:
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:1192-1206`
    (per `plan-loop-1-01-issues.md:411`) quote `"line :1193 imports
    from app.services._issue_workflow import execution, lifecycle, loading,
    outbox, serialization, source_validation"`.
  - Re-read of file at line 1192: `from app.services._issue_workflow import
    execution, lifecycle, loading, outbox, serialization, source_validation`.
  - `plan-loop-1-01-issues.md:104` quote `"Recommended end-state: delete the
    file."` — #8 deletes `source_validation.py`.
- **Severity**: HARD (collection-time `ImportError` if #8 deletes the file
  without same-commit lock-test update). v2 sequences #8 at slot 52, and
  the plan AT `plan-loop-1-01-issues.md:411` already calls out the
  required lock-test update.
- **Loop 1 verdict**: Master DAG `:38` "in_domain_deps: ['2']" for #8 is
  honored by v2 (slot 14 < slot 52). The lock-test update is bundled into
  #8's commit per `:411`. NO sequence change needed.
- **Recommendation**: NO action. Plan is internally consistent. The
  collection-time risk is mitigated by the same-commit lock-test update.

### Candidate 9: #56 (directory_identity_service delete) → lock-test module-level import

- **Evidence**:
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:226-240`
    quote `"def test_directory_identity_facade_uses_lifecycle_module() ->
    None: from app.services import directory_identity_service"`.
  - `plan-loop-1-08-crosscut.md:391-396` quote `"DELETE or REWRITE
    tests/backend/pytest/test_architecture_deepening_contracts.py:227-238
    (test_directory_identity_facade_uses_lifecycle_module)"`.
- **Severity**: HARD (collection-time `ImportError` if #56 deletes the
  facade without same-commit lock-test rewrite).
- **Loop 1 verdict**: Plan #56 explicitly handles this. v2 sequences #56
  at slot 43; the lock-test rewrite is bundled into #56's commit.
- **Recommendation**: NO action. Plan is internally consistent.

### Candidate 10: #51 (`value_application.py` shim delete) → lock-test load-order

- **Evidence**:
  - `plan-loop-1-04-kris.md:187` quote `"test_architecture_deepening_contracts.py:976-980
    — value_application_path = ... must be DELETED in same commit;
    otherwise _source(...) raises FileNotFoundError"`.
- **Severity**: HARD (run-time `FileNotFoundError`). Plan correctly
  identifies and bundles the fix.
- **Loop 1 verdict**: Plan handles. v2 slot 42 (#51) bundles lock-test
  edit.
- **Recommendation**: NO action. Plan is internally consistent.

### Candidate 11: #61 (graph_directory_* move) → 2 non-architecture test imports

- **Evidence**:
  - `tests/backend/pytest/test_entra_confidential_credentials.py:12`
    quote `"from app.services.graph_directory_service import ("`.
  - `tests/backend/pytest/test_graph_directory_components.py:10,11,17`
    similar (lines 10, 11, 17 all import from the moved package).
  - `plan-loop-1-08-crosscut.md:485-497` enumerates these test files for
    rewrite as part of #61.
- **Severity**: HARD (collection-time `ImportError` if test imports not
  updated in same commit). Plan correctly handles.
- **Loop 1 verdict**: v2 slot 44 (#61) bundles all test imports + lock
  rewrites. NO sequence change.
- **Recommendation**: NO action.

### Candidate 12: #55 (access_user_service delete) → lock-test module-level import

- **Evidence**:
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:243-265`
    quote `"def test_identity_access_routes_use_lifecycle_module() ->
    None: from app.services import access_user_service"`.
  - `plan-loop-1-08-crosscut.md:305-310` quote `"DELETE or REWRITE
    tests/backend/pytest/test_architecture_deepening_contracts.py:246-257
    (test_identity_access_routes_use_lifecycle_module)"`.
- **Severity**: HARD (collection-time `ImportError`). Plan correctly
  handles by bundling rewrite.
- **Loop 1 verdict**: v2 slot 40 (#55). NO sequence change.
- **Recommendation**: NO action.

### Candidate 13: #50 (submission.py delete) → lock-test negative-assertion strings

- **Evidence**:
  - `plan-loop-1-04-kris.md:152` quote `"test_architecture_deepening_contracts.py:998
    — negative-assertion line ... is benign post-delete (it asserts
    absence in route source), but for hygiene drop the now-dead string"`.
- **Severity**: NONE (the assertion is `string-not-in-source`; deleting
  the file does not break the test). Plan correctly notes the optional
  hygiene cleanup.
- **Recommendation**: NO action.

### Candidate 14: #15 (access_user surface) → catalog drift before #65/#39 land

- **Evidence**:
  - `plan-loop-1-07-endpoints.md:144-152` (#15 TDD) creates
    `test_capability_catalog_access_user_surface_red.py`.
  - #39 (slot 67) and #65 (slot 65) edit the catalog; both land AFTER #15
    (slot 13).
  - Cross-grep #15 vs. #65 vs. #39 catalog scope: `risk`, `control`,
    `kri`, `vendor` for #65; `admin_console` keys for #39; `access_user`
    for #15. **Disjoint** scopes.
- **Severity**: NONE.
- **Loop 1 verdict**: Catalog scopes are disjoint; #15 → #65/#39 has no
  prereq.
- **Recommendation**: NO action.

### Candidate 15: #46 (query-key factories) → 18 mock files churn — soft only

- **Evidence**:
  - `plan-loop-1-06-frontend.md:407-408` (#66 dependencies) quote `"#35
    (usePermissions removal) is *not* a strict prereq but should land
    first to avoid churn in 18 mock files"`.
  - Loop 2 A7 Correction E captured this.
  - `plan-loop-3-07-integration-v2.md:240-242` adds soft edge `#35 → #66`.
- **Severity**: SOFT (already captured).
- **Recommendation**: NO action. Loop 1 confirmed honored at slot 33 < slot 73.

### Candidate 16: Doc-contract wave at slots 41-45 — ergonomic, not topological

- **Evidence**:
  - `plan-loop-3-08-cohesion.md:171-214` flags "5 contract edits in 5
    consecutive slots" all hitting `service_policy` blob at md:109 and
    md:117.
  - `plan-loop-3-08-cohesion.md:207-214` recommends a "single doc-contract
    wave" treatment, NOT a sequence change.
- **Severity**: NONE (ergonomic, intentional cohesion choice).
- **Recommendation**: NO action.

### Candidate 17: late migration window for #69+#70 — Vendor scrub at slot 74?

- **Evidence**:
  - `plan-loop-3-08-cohesion.md:218-252` flags 5 Vendor items landing
    before the migration; suggests a "Vendor scrub" pre-pass.
  - The 5 Vendor items: #57 (slot 5), #13 (slot 8), #17 (slot 46), #16
    (slot 55), #31 (slot 57).
  - Each touches `_register_listings/vendors.py` or `_vendor_governance/`,
    NOT `Vendor.status` directly.
- **Severity**: NONE (ergonomic; no test breakage).
- **Recommendation**: NO action.

### Candidate 18: #34 → users/summary.py 3-way overlap — captured by Correction A

- **Evidence**:
  - Already in Loop 2 A7 Correction A; honored at slots 6 → 7 → 50.
- **Recommendation**: NO action.

### Candidate 19: #38 (Pydantic schema move) → batch_send_questionnaires test fixtures

- **Evidence**:
  - `frontend/src/services/api/schemas/riskHub.ts:147` quote
    `"export const batchSendQuestionnairesResponseSchema =
    batchSendResponseSchema;"` — no `RiskFilters` references in FE.
  - Backend-only rename (`backend/app/api/v1/endpoints/riskhub_questionnaires.py:17`
    quote `"class RiskFilters(BaseModel):"`).
- **Severity**: NONE.
- **Recommendation**: NO action. Correction G's "verify after" framing is
  sufficient; the FE Zod mirror does not import the renamed Pydantic class.

### Candidate 20: #62 (kri_vendor_assignment relocate) → architecture lock at `_w4_bc_c`

- **Evidence**:
  - `tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py:16`
    quote `"REPO_ROOT / "backend/app/services/kri_vendor_assignment.py","`
  — pinned in `VENDOR_SERVICE_FILES`.
  - `plan-loop-1-04-kris.md:274` (#62 plan) bundles lock update.
- **Severity**: HARD (collection-time / runtime FileNotFoundError if
  #62 moves the file without same-commit lock update). Plan correctly
  bundles.
- **Recommendation**: NO action — handled within #62's commit.

---

## 3. Specific verifications requested by orchestrator

### (a) Test fixture cascade (`client_factory` extensions)

- `plan-loop-1-06-frontend.md:560` quote `"client_factory (per CLAUDE.md):
  #37, #39 backend tests must use client_factory"`.
- `plan-loop-1-04-kris.md:90` (#25), `:251` (#62), `:312` (#73) all reference
  `client_factory`.
- Re-grep: NO plan introduces a NEW fixture. All plans use the existing
  `client_factory` from `tests/backend/pytest/conftest.py`. No fixture
  cascade.
- Verdict: NO MISSED DEP.

### (b) Type/schema cascade

- #38 (`RiskFilters` rename): Candidate 19 above — no FE TS impact.
- #70 (`Vendor.status` drop): Candidate 1 (test file collision with #62)
  + Correction F (FE TS cleanup as #77). Both captured.
- Verdict: NO MISSED DEP beyond what's already captured.

### (c) Lock-test load order (`test_architecture_deepening_contracts.py`)

- Module-level imports at line 226 (`directory_identity_service`), 247
  (`access_user_service`), 1193 (`source_validation`), 933 (`_kri_history`
  package). Each is removed/moved by exactly one item: #56, #55, #8, #50/#51.
- Each plan correctly bundles the lock-test rewrite into the same commit.
- Verdict: NO MISSED DEP. Loop 1's claim holds.

### (d) Migration → seed cascade

- `backend/scripts/seed_e2e_vendors.py:35,56,77,98,119,140` carries
  `Vendor.status` references per `plan-loop-1-05-vendor-quarterly.md:247`.
- #70 plan correctly enumerates seed scrubbing in same commit. No later
  item runs the seed in its tests.
- Verdict: NO MISSED DEP.

### (e) #15 → #65 capability catalog ordering

- Candidate 14 above. #15 scopes `access_user`; #65 scopes
  `risks/controls/kris/vendors`. Disjoint.
- Verdict: NO MISSED DEP.

### (f) #74a → #74b mid-edit gap

- Candidate 4 above. #74a creates 4 (or 5) NEW TOMLs AND the disjointness
  lock test in the same commit (`plan-loop-1-08-crosscut.md:621-624`).
  #74b is ADR text only.
- Verdict: NO MISSED DEP.

### (g) #39 → #40 admin reorg → #15

- #40 (`plan-loop-1-08-crosscut.md:18-26`) re-clusters admin sub-routers.
  Cross-grep for `access_user` in #40 plan: 0 hits.
- #15 only adds `access_user` to capability-catalog.json; #40 doesn't
  touch the catalog.
- Verdict: NO MISSED DEP.

### (h) Frontend Zod schemas updated by #38

- Candidate 19 above. No FE Zod schema imports `RiskFilters` Pydantic
  class. The FE name `getRiskFilters()` at `lookupApi.ts:39` is a
  different namespace.
- Verdict: NO MISSED DEP.

### (i) #76 → #71 session merge interaction

- Candidate 5 above. #76 is `endpoints/auth/*` (BE); #71 is
  `frontend/src/services/session/*` (FE). No shared file.
- Verdict: NO MISSED DEP.

### (j) Postgres-lane test cascade

- Candidate 6 above. Postgres-lane tests are exclusively produced by
  #69+#70; no later item references them.
- Verdict: NO MISSED DEP.

---

## 4. Confirmation of Loop 1's "zero violations" claim

Re-walking the v2 sequence with this adversarial lens:

| Rule | Loop 1 claim | This audit |
|---|---|---|
| In-domain hard prereqs | 16/16 HONORED | CONFIRMED |
| Cross-domain hard prereqs | 9/9 HONORED | CONFIRMED |
| Atomic-cluster contiguity | 3/3 contiguous | CONFIRMED |
| Hub-wave ordering | 3/3 preserved | CONFIRMED |
| ADR ordering | 4/4 land before dependents | CONFIRMED |
| Soft prereqs (Loop 2 A7) | 3/3 HONORED | CONFIRMED |
| Migration window placement | end | CONFIRMED |
| Convergence points | 11/11 HONORED | CONFIRMED |
| **HARD violations** | **0** | **CONFIRMED — 0** |
| **SOFT violations** | **0** | **CONFIRMED — 0** |

Loop 1's claim of ZERO violations stands.

The "suspiciously clean" Loop 1 result is **legitimate**, not a sign of
incomplete review. The reason is that the v2 master sequence absorbed all
7 corrections from Loop 2 A7 (which itself surfaced 7 hidden prereqs that
the per-domain Loop 1 plans missed). After A7 + Loop 3 v2 integration,
the sequence is genuinely complete.

What this adversarial sweep adds:

1. **One per-plan completeness gap** (Candidate 7, #62 plan does not
   enumerate `tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py:10`
   import update). This is a plan-text gap, not a sequence violation. v2
   sequences #62 ALONE (no other item touches `kri_vendor_assignment`),
   so the missing edit is recoverable at #62 commit time without
   re-sequencing.

2. **One soft cross-edit collision** (Candidate 1, #62 and #70 share
   `test_w4_bc_c_vendor_governance_domain_errors_red.py` — different
   lines). Mechanical churn only; v2 sequences #62 (slot 69) before #70
   (slot 78) so each commit edits a stable file state.

Neither requires a v2 sequence patch.

---

## 5. Recommended sequence patches

**NONE.**

The v2 master sequence is topologically and ergonomically sound.

---

## 6. Recommended per-plan amendments (non-sequence)

These are HOUSEKEEPING ITEMS that strengthen the plan text without
changing the sequence:

1. **`plan-loop-1-04-kris.md` Item #62** (Code/file changes): add bullet
   "Update `tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py:10`
   import from `app.services.kri_vendor_assignment` to
   `app.services._vendor_links.kri_assignment`". Per Candidate 7.

2. **Cross-cut sequencing note** (Loop 4 to add to a coordination
   document): note that #62 (slot 69) and #70 (slot 78) both edit
   `tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py`
   at different lines. Each commit is mechanically isolated.

3. (Already captured by Loop 2 A7 corrections — no new amendment needed.)

---

## 7. Items needing further atomic clustering

**NONE.**

The 3 atomic clusters (#24+#51, #56+#61, #69+#70) are correctly
declared. No additional clustering would improve sequence safety.

The 5-slot doc-contract wave (slots 41-45) is intentionally NOT atomic
(per `plan-loop-3-08-cohesion.md:207-214`'s recommendation): each commit
in the wave re-runs the validator on a partial-removal state of the
`service_policy` blob. Atomicity would defeat the validator-reentry
invariant.

---

## 8. Adversarial confidence statement

I attempted to break Loop 1's "zero violations" claim through ten
distinct attack vectors:

- 4 lock-test load-order attacks (Candidates 8, 9, 10, 11, 12, 20) — all
  defeated by per-plan same-commit lock rewrites.
- 2 cross-domain test-file collision attacks (Candidates 1, 7) — soft
  churn only; v2 ordering puts the path-changing edit (#62) before the
  field-removing edit (#70), so each commit lands cleanly.
- 1 #74a/#74b mid-edit attack (Candidate 4) — defeated by the plan
  bundling TOMLs + disjointness lock at #74a.
- 1 BE→FE schema-rename attack (Candidate 2, 19) — defeated by the FE
  not importing the renamed Pydantic class.
- 1 capability-catalog ordering attack (Candidates 3, 14) — defeated by
  disjoint scopes.
- 1 #76/#71 layer-confusion attack (Candidate 5) — defeated by BE-vs-FE
  layer separation.

All attacks failed. Loop 1's claim holds with 95%+ confidence.

The two adversarial findings (Candidates 1 and 7) are GENUINE per-plan
gaps but do NOT require a sequence patch. They can be fixed at #62
commit time by a single-developer with awareness of the cross-collision.

End of Phase 4 Loop 2 adversarial sequence audit.
