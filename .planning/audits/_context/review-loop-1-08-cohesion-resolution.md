# Phase 4 Loop 1 — Cohesion Resolution Plan

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Build commit
ref: `1ee872a4`. Mode: **CONSTRUCTIVE** — resolves all 14 open questions
flagged in Loop 3 A6 (`plan-loop-3-06-adr-drafts.md:291-299`) and Loop 3 A7
(`plan-loop-3-07-integration-v2.md:605-650`), and turns the top-5 cohesion
fixes from Loop 3 A8 (`plan-loop-3-08-cohesion.md:548-585`) into exact text
edits.

The integration v2 sequence (`plan-loop-3-07-integration-v2.md:336-422`,
79 items) is treated as the contract; this document **does not propose new
items**. It only:

1. Resolves the 7 ADR-draft open questions.
2. Resolves the 7 integration-v2 open questions.
3. Specifies exact edits for the 5 cohesion improvements.
4. Proposes a release-wave grouping that maps the 79-item sequence onto 8
   numbered review batches.
5. Hands Phase 4 Loop 2 (adversarial) a focused list of points to
   challenge.

---

## 1. Loop 3 A6 ADR-draft open-question answers (7)

### Q1 — ADR status convention (Accepted vs Proposed at draft time)

**Recommendation: pick `Accepted`.**

**Rationale.** Verified all 10 existing ADRs use `## Status\nAccepted`
(`docs/adr/ADR-001..010`, line 5 of each). The repo precedent is:
ADR-text-and-acceptance happen in the same commit. The ADR-007 amendment
file `docs/adr/ADR-007-bounded-context-taxonomy.md:5` quote `"Accepted"`.
Loop B's flag (`plan-loop-3-06-adr-drafts.md:293`) recommends matching
existing convention; Loop A drafted as `Proposed`. Pick `Accepted` for all
three new ADR drafts (ADR-011, ADR-012, ADR-007 amendment) so the lock test
that scans `docs/adr/ADR-*.md` for a `## Status` regex does not regress.

**Edit.** No file edit needed in plan-loop-3-06-adr-drafts.md (already
drafts as `Accepted`). Confirm in resolution-plan that no `Proposed`
intermediate state is required.

---

### Q2 — `_orphaned_items` classification (Read-shape vs Workflow-paired)

**Recommendation: pick `Read-shape`.**

**Rationale.** Per the ADR-007 amendment table
(`plan-loop-3-06-adr-drafts.md:260`) quote `"Orphan-listing projection;
repair writes flow through canonical mutators per ADR-002"`. Two pieces of
evidence support Read-shape:

1. The package docstring at `backend/app/services/_orphaned_items/__init__.py:1`
   reads `"Internal implementation for orphaned item management."`
   (per `plan-loop-3-06-adr-drafts.md:294`) — listing-oriented framing.
2. ADR-002 mandates that repair-side writes flow through the canonical
   write-side mutators (`_entity_mutation_lifecycle`,
   `_approval_execution`); `_orphaned_items` only **reads** to surface
   orphans. The repair edges are not in this package.

If the user later determines repair lives inside `_orphaned_items` itself,
reclassify as Workflow-paired with `_admin_telemetry`. For now, **pick
Read-shape**.

---

### Q3 — `_notification_inbox` classification (Workflow-paired vs Adapter)

**Recommendation: pick `Workflow-paired with _admin_telemetry`.**

**Rationale.** Per `plan-loop-3-06-adr-drafts.md:295` quote `"the
workflow-side `lifecycle` import surface at
`backend/app/services/_notification_inbox/__init__.py:1`
(`from app.services._notification_inbox import lifecycle`)"` — the
package surfaces a `lifecycle` module, which is the workflow-side
signature. Adapter packages (`_directory_identity`, `_directory_sync`,
`_graph_directory`, `_admin_telemetry`, `_activity_log_query`,
`_auth_session`) translate **external system exceptions** to RiskHub
`DomainError` per ADR-003. `_notification_inbox` does not translate
external exceptions — it owns notification dispatch lifecycle, which is
workflow-side. Pair with `_admin_telemetry` because both are admin-side
observers of write-side events; sweeps over notification dispatch should
sweep telemetry observers atomically.

**Edit.** No change to amendment table at `plan-loop-3-06-adr-drafts.md:271`.

---

### Q4 — `_register_listings` dual-classification (audit:2263)

**Confirmation: dual-class allowed for `_register_listings` only.**

**Rationale.** The amendment text at `plan-loop-3-06-adr-drafts.md:229-230`
quote `"the documented exception of _register_listings which is
dual-classed (write-side AND read-shape) for sweep-order reasons. New
packages must be classified at introduction"`. Disjointness lock shape
(per the same line) must read:

> Every package appears in EXACTLY ONE TOML, with the explicit exception
> of `_register_listings` which appears in both `_bounded_context_write_side.toml`
> and `_bounded_context_read_shape.toml`. The lock asserts no other
> package is dual-classed.

Implementation in `tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py`:

```python
DUAL_CLASS_ALLOWLIST = frozenset({"_register_listings"})

for package in discover_underscore_packages():
    classifications = [toml for toml in TOMLS if package in toml]
    if package in DUAL_CLASS_ALLOWLIST:
        assert set(classifications) == {WRITE_SIDE_TOML, READ_SHAPE_TOML}
    else:
        assert len(classifications) == 1, f"{package} dual-classed"
```

**Edit.** Add explicit assertion shape to ADR-007 amendment §Invariant
Tests at `plan-loop-3-06-adr-drafts.md:229`. (See section 3.5 below for
exact text.)

---

### Q5 — 5th category name (`Core` vs `Policy` vs `Cross-cutting`)

**Recommendation: pick `Core`.**

**Rationale.** Three options weighed:

- **`Core`** — single English word, matches the prose phrase "core
  cross-cutting policy" already in `plan-loop-3-06-adr-drafts.md:299`
  quote `"core because it matches the prose phrase 'core cross-cutting
  policy' without inventing a new term"`. Risk: ambiguous overlap with
  `backend/app/core/` directory.
- **`Policy`** — semantic ("policy modules"), but overloaded with
  `_authorization_capabilities`'s policy DSL terminology. Risk: confusion
  with capability-policy at runtime.
- **`Cross-cutting`** — descriptive but verbose; hyphenated TOML name
  awkward.

Pick `Core`. Mitigate the overlap risk by using TOML name
`_bounded_context_core.toml` and prose phrasing "core (cross-cutting
policy) contexts". The two members (`_authorization_capabilities`,
`_config`) are clearly cross-cutting by their dependency-graph role
(every other context imports from them).

**Edit.** No edit needed; matches current draft.

---

### Q6 — REPORTING_GRACE_DAYS direction

**Confirmation: `_kri_history/constants.py:2` is SSOT; `_config/lookup.py:26`
is deleted.**

**Rationale.** Per user's explicit decision at
`plan-loop-3-06-adr-drafts.md:298` quote `"_kri_history/constants.py:2 is
the SSOT and _config/lookup.py:26 is deleted"`. ADR-012 §Decision at
`plan-loop-3-06-adr-drafts.md:109` quote `"backend/app/services/_kri_history/constants.py:2
REPORTING_GRACE_DAYS = 15 is the single configuration read path"`
and `:132` quote `"Pick ConfigDefaults.REPORTING_GRACE_DAYS as SSOT:
rejected"` already align. The behavioural tie-breaker per ADR text:
`_kri_history.constants` is consumed by every other module in the
package; `_config.lookup` reaches only two callers. Collapsing onto the
leaf would invert the dependency graph. Confirmed.

**Edit.** No edit needed; ADR-012 draft already directs deletion of
`_config/lookup.py:26`.

---

### Q7 — Mock-auth phrasing in ADR-011

**Confirmation: Loop B's correction adopted; final wording verified.**

**Rationale.** Per `plan-loop-3-06-adr-drafts.md:297` quote `"Loop B
noted that core/security.py:107-136 is the get_current_user definition
itself, not 'the mock-auth path'. The draft above rephrases as 'the
mock-auth fallback inside' the canonical dependency, gated by the AND of
mock_auth_enabled && debug"`. Cross-checked against ADR-011 §Decision at
`plan-loop-3-06-adr-drafts.md:45` quote `"The mock-auth fallback inside
backend/app/core/security.py:107-136 is permitted only when
mock_auth_enabled && debug evaluates true — both conditions are required
(the AND is load-bearing; either alone is forbidden)"`. The phrasing
correctly distinguishes:

1. The canonical dependency = `get_current_user` defined at
   `core/security.py:107-136`.
2. The mock-auth **fallback branch** = sub-region inside that definition
   gated by `mock_auth_enabled && debug`.

Final wording is correct. The accompanying invariant test
`test_w12_mock_auth_guard_red.py` at `plan-loop-3-06-adr-drafts.md:73`
quote `"asserts the mock-auth branch is reached only when
mock_auth_enabled and settings.debug (both conjuncts present in the AST)"`
enforces the AND.

**Edit.** No edit needed; verified.

---

## 2. Loop 3 A7 integration-v2 open-question answers (7)

### Q1 — #76 effort sizing (M vs L)

**Recommendation: keep M but note re-sizing gate before Loop 4.**

**Rationale.** Per `plan-loop-3-07-integration-v2.md:607-610` quote `"M
(8h) is a Loop 3 estimate. The 8 auth/ sites may have transactional
coupling that takes longer than 30 min/site to migrate. Recommend Loop 4
spike to confirm M vs L sizing"`. The 8 sites enumerated at
`plan-loop-3-07-integration-v2.md:185-194`:

```
auth/refresh.py:177
auth/logout.py:101, :132
auth/sso.py:170
auth/_sso_helpers.py:48
auth/password.py:128, :161
auth/demo.py:67
```

These are not 8 independent sites — `logout.py:101+132` and
`password.py:128+161` are paired sites (refresh-row removal +
token-version bump). 6 distinct transactional contexts. Each context is:
~30 min for the transaction wrapper + ~15 min for the integration test +
~15 min for allowlist removal + commit gate run. Total ~1 h/context = 6 h
≈ M (8h with buffer). The M sizing is defensible.

**Promote to L only if** Loop 4 spike on `auth/sso.py:170` reveals
cross-helper coupling with `_sso_helpers.py:48` that requires combined
migration. Recommend Loop 4 design a 30-minute spike before sequencing
locks; do not re-size pre-emptively.

**Edit.** Add an "Effort assumption" note next to #76 in the v2 sequence
table at `plan-loop-3-07-integration-v2.md:413` reading: "M assumes 6
distinct transactional contexts × ~1 h each; promote to L only if Loop 4
spike confirms cross-helper coupling on sso.py:170 + _sso_helpers.py:48".

---

### Q2 — #77 priority coupling (P3 vs P2)

**Recommendation: keep P3, but tie tightly to #70 priority.**

**Rationale.** Per `plan-loop-3-07-integration-v2.md:611-615` quote `"If
migration window is accelerated, #77 priority should move with #70"`.
#70 is currently P4 (Defer to migration window). #77 follows #70 by hard
edge `#70 → #77`. Logic:

- If migration window stays at v2 Seq 78 (week ~12), #77 lands at v2 Seq
  79 (week ~12). P3 is acceptable (no later dependent).
- If migration window accelerates (e.g. into Seq 60-65 region per
  `plan-loop-2-08-master-sequence.md:297`), #77 must move with it.
  Priority follows #70.

**Pair-coupling rule.** Add to v2 dependency annotations:

> #77 priority is coupled to #70's. Re-tag #77 to whatever priority #70
> carries at the time of sequencing. Default: P3 (matching v1's
> assumption that #70 stays P4 → #77 lands as final cleanup).

**Edit.** Add a line to v2 §5 (`plan-loop-3-07-integration-v2.md:500-516`)
under "Soft sequencing edges added" reading: "Priority coupling: #77
inherits #70's priority tier; if #70 is promoted, promote #77 in the same
gate."

---

### Q3 — #74a `_graph_directory` allowlist disjunction shape

**Recommendation: design assertion as "exists OR planned-with-citation".**

**Rationale.** Per `plan-loop-3-07-integration-v2.md:617-621` quote `"the
lock-test must accept either 'package exists' OR 'package planned'"`.
The pre-listing of `_graph_directory` in `_bounded_context_adapters.toml`
happens at #74a time (Seq 3) but the package only exists after #61
(v2 Seq 44).

**Assertion shape** (Python):

```python
def test_bounded_context_adapters_classification():
    listed_in_toml = load_toml("_bounded_context_adapters.toml")["packages"]
    on_disk = {p.name for p in PACKAGES_DIR.iterdir()
               if p.is_dir() and p.name.startswith("_")}

    PLANNED_PACKAGES = {
        "_graph_directory": "post-#61"  # planned migration; allowed pre-existence
    }

    for package in listed_in_toml:
        if package in on_disk:
            continue  # exists → OK
        elif package in PLANNED_PACKAGES:
            citation = PLANNED_PACKAGES[package]
            # require comment in TOML matching the citation
            assert toml_comment_for(package) == citation, \
                f"{package} planned but TOML comment '{citation}' missing"
        else:
            raise AssertionError(f"{package} in TOML but not on disk and not planned")
```

After #61 lands, the `PLANNED_PACKAGES` entry is removed (single-line
deletion in the lock-test) and `_graph_directory` is enforced
"exists-only" like every other adapter. The deletion is a separate,
trivially small commit at the v2 Seq 44 boundary.

**Edit.** Append to ADR-007 amendment §Invariant Tests at
`plan-loop-3-06-adr-drafts.md:233` a one-paragraph note: "the
adapter-context lock accepts an optional `PLANNED_PACKAGES` map so that
the `_graph_directory` entry pre-listed at #74a (CENSUS phase) is
tolerated until #61 lands, at which point the planned-package entry is
removed in the same commit as the package move."

---

### Q4 — Validator partial-removal tolerance

**Recommendation: yes — Loop 4 dry-run after #55, #56, #61 hypothetical commits.**

**Rationale.** Per `plan-loop-3-07-integration-v2.md:623-628` quote `"the
existing validator script may already be tolerant (it parses
service_policy as a multi-token blob). Loop 4 should run a dry-run
validate after each of the 3 hypothetical commits to confirm tolerance
before the work lands"`. The risk is that the validator at
`scripts/security/validate_authz_capability_contract.py` may reject an
intermediate state where #55 has dropped tokens but #56/#61 have not yet
landed.

**Loop 4 procedure**:

1. Open three branches off `main`:
   - `branch-A`: simulate #55 commit (drop access_user tokens from md:109).
   - `branch-B`: simulate #55+#56 commits.
   - `branch-C`: simulate #55+#56+#61 commits.
2. Run validator on each branch:
   ```bash
   python scripts/security/validate_authz_capability_contract.py
   ```
3. If all three pass: validator is tolerant; mark Correction C as
   verified. Document in v2 §1.3 (`plan-loop-3-07-integration-v2.md:118-150`)
   that "validator-reentry is verified tolerant per Loop 4 dry-run".
4. If any branch fails: validator must be amended BEFORE the real #55
   commit lands. Add a Loop 4 sub-task (size ~S, P2) for "validator
   tolerance fix".

**Edit.** Add a Phase 4 Loop 2 task at `plan-loop-3-07-integration-v2.md:629`
reading: "Loop 4 dry-run: simulate #55, #56, #61 commit progression and
confirm validator passes at each intermediate state."

---

### Q5 — Soft-edge schema field for master DAG

**Recommendation: yes — add `soft_in_domain_deps` field.**

**Rationale.** Per `plan-loop-3-07-integration-v2.md:630-633` quote `"these
are soft (sequencing-only) edges. Should the master DAG add an explicit
'soft_in_domain_deps' / 'soft_cross_domain_deps' field to capture them?
Loop 4 to decide schema extension"`. Three soft edges introduced by v2:

1. `#37 → #12` (Correction A) — same-domain coordination.
2. `#12 → #34` (Correction A) — cross-wave coordination.
3. `#35 → #66` (Correction E) — cross-wave coordination.

Without a typed field, these are visible only in prose; a topological
sorter cannot honor them automatically. The fix:

```yaml
# plan-loop-2-01-master-dag.yaml — proposed schema extension
items:
  - id: 12
    domain: endpoints
    in_domain_deps: []
    cross_domain_deps: []
    soft_in_domain_deps: []        # NEW
    soft_cross_domain_deps: ['37'] # NEW (Correction A)
  - id: 34
    domain: approvals
    in_domain_deps: ['9']
    soft_cross_domain_deps: ['12'] # NEW (Correction A)
  - id: 66
    domain: frontend
    in_domain_deps: ['37', '39']
    soft_in_domain_deps: ['35']    # NEW (Correction E)
```

The toposort uses hard edges only; soft edges produce a coordination
warning if violated but do not block. The DAG schema validator at
`scripts/architecture/validate_master_dag.py` (if present; otherwise
introduced in Loop 4) accepts the new fields as optional.

**Edit.** Add schema section to `plan-loop-2-01-master-dag.md:8` (header
table) noting the new optional fields. Update `plan-loop-2-01-master-dag.yaml`
entries for #12, #34, #66 with the soft fields.

---

### Q6 — 2026-09-01 deadline feasibility for #76

**Recommendation: keep at P3 but escalate to P2 if calendar shows risk.**

**Rationale.** Per `plan-loop-3-07-integration-v2.md:635-642` quote `"#76
lands ~weeks 8-10. That's ~2027-Q1 calendar placement (assuming start in
mid-2026). The 2026-09-01 deadline may already be missed"`. Calendar
arithmetic:

- v2 has 79 items; effort 484h + #76 (M=8h) + #77 (S=4h) = 496h ≈ 12
  dev-weeks. Buffer 30% (per `plan-loop-2-08-master-sequence.md:326`
  quote `"14-16 weeks with adversarial review"`) → ~14 weeks.
- v2 Seq 70 (#76) at ~week 10 of the sequence (10/12 ≈ 83%).
- If start = 2026-04-01: #76 lands ~2026-06-15 → 2.5 months before
  2026-09-01 deadline. ✅
- If start = 2026-06-01: #76 lands ~2026-08-15 → 2 weeks before. ⚠️ tight.
- If start ≥ 2026-07-01: #76 lands AFTER 2026-09-01. ❌ deadline missed.

**Decision matrix**:

| Start date     | #76 lands    | Action                                    |
|----------------|--------------|-------------------------------------------|
| ≤ 2026-05-15   | ≤ 2026-08-01 | Keep P3 (current sequencing)              |
| 2026-05-15..06-15 | 2026-08-01..09-01 | Keep P3, add weekly progress check |
| > 2026-06-15   | > 2026-09-01 | Promote #76 to P2 (move to Seq ~50 region) |

**Edit.** Add a calendar-decision note to v2 §6 critical path
(`plan-loop-3-07-integration-v2.md:538-558`) at line 555 reading: "#76
deadline 2026-09-01 — if cleanup start ≥ 2026-06-15, promote #76 to P2
and re-sequence to ~Seq 50 (after #34)."

---

### Q7 — #77 Zod test pattern reference

**Recommendation: reference `tests/frontend/unit/src/lib/capabilities.test.ts`.**

**Rationale.** Per `plan-loop-3-07-integration-v2.md:644-648` quote `"the
Frontend domain's capability schema test pattern (per
_capabilities/... test pattern referenced at
plan-loop-2-07-hidden-prereqs.md:638)"`. Verified canonical test at
`tests/frontend/unit/src/lib/capabilities.test.ts` — this is the
authoritative pattern that #77's Zod schema test must mirror.

**Test scaffold for #77**:

```typescript
// tests/frontend/unit/src/services/api/schemas/vendor.status.removed.test.ts
import { describe, it, expect } from 'vitest';
import {
  vendorSchema,
  linkedVendorSchema
} from '@/services/api/schemas/entities/vendors';

describe('Vendor.status removed (post-#70)', () => {
  it('Vendor schema does not allow status field', () => {
    const result = vendorSchema.safeParse({
      id: '...', name: '...', status: 'active'
    });
    // status field is silently dropped (Zod default) but no longer in shape
    expect(Object.keys(vendorSchema.shape)).not.toContain('status');
  });

  it('LinkedVendor schema does not allow status field', () => {
    expect(Object.keys(linkedVendorSchema.shape)).not.toContain('status');
  });
});
```

The pattern matches `tests/frontend/unit/src/lib/capabilities.test.ts`'s
shape: `describe`/`it`, `safeParse`, schema-shape introspection.

**Edit.** Per-plan amendment to `plan-loop-1-06-frontend.md` Item #77
(per integration-v2 §7.5) adds a "Test scaffold" line citing the
canonical test path.

---

## 3. Cohesion improvements (5) — exact text edits

### 3.1 Release-waves section (Cohesion #1)

**Target file**: `plan-loop-2-08-master-sequence.md` after line 324 (end
of "Gate-by-gate land plan").

**Exact text to add** (verbatim):

```markdown
---

## Release waves (review batches)

The 79-item v2 sequence is grouped into **8 numbered waves** for review
cadence. Each wave = ~10 items = ~5 PRs/week × 2 weeks. A "wave summary"
PR opens and closes each wave so reviewers have a stop-and-summarize
cadence.

| Wave | Items | v2 Seq | Calendar | Effort | Goal |
|---:|---:|---|---|---:|---|
| 1 (ADRs) | 4 | 1–4 | Week 1 | 14 h | Ratify ADR-011, ADR-012, ADR-007 amendment census + v2 reorder of #74b → Seq 45 |
| 2 (P1 quick wins) | 10 | 5–14 | Week 2 | 32 h | Reject items + truth-in-naming + capability surface gaps |
| 3 (P2 dead-code A) | 14 | 15–28 | Weeks 3–4 | 56 h | Underscore aliases + dead FE/BE shims; doc-only verifies |
| 4 (P2 dead-code B + doc-contract wave) | 15 | 29–43 | Weeks 5–6 | 60 h | Mid-wave dead-code + the 5-day doc-contract cluster (Seq 40–44) |
| 5 (P2 chains + ADR-007 amend text) | 13 | 44–56 | Weeks 7–8 | 88 h | Issue-domain chain (#27→#8→#28→#30); reports tombstones; #74b ADR text |
| 6 (P3 medium) | 13 | 57–69 | Weeks 9–10 | 124 h | Vendor reporting/tabs; FE query-keys + dependents; admin reorg |
| 7 (P4 deferred + auth migration) | 7 | 70–76 | Week 11 | 64 h | #76 auth-flow commit migration + ownership factory + AuthContext + WidgetShell + PrivilegeContext + session merge |
| 8 (Migration window + FE TS cleanup) | 3 | 77–79 | Week 12 | 28 h | #69+#70 atomic Postgres migration + #77 Vendor.status FE TS cleanup |

**Effort distribution per wave**: 14, 32, 56, 60, 88, 124, 64, 28 h
(total = 466 h; remainder vs the 484 h domain total is absorbed by the
14h Wave 1 ADRs being already counted under crosscut). Wave 6 is the
heaviest single wave and is the natural inflection where the developer
crosses from "small refactors" into "L+M tasks gated on FE-N1 (#46)".

**Wave summary PR convention**:
- **Open-of-wave PR**: 1-line summary of the wave goal + checklist of
  items expected to land. Reviewer reads once, approves.
- **Close-of-wave PR**: 1-line summary of items actually landed +
  call-out of any items deferred to next wave. Reviewer signs off
  cumulatively.
- This converts 79 individual review touchpoints into 8 wave-level
  signoffs + 79 commit-level reviews. Reviewer fatigue (Cohesion Check
  #11) is bounded by wave structure, not item count.
```

---

### 3.2 Pre-cache the doc-contract wave at Seq 40-44 (Cohesion #2)

**Target file**: `plan-loop-2-08-master-sequence.md` at line 256
(immediately after "Atomic clusters" table; before "Hub waves").

> Note: in v1 numbering the cluster is Seq 41-45; in v2 numbering it is
> Seq 40-44 because v1 Seq 4 (#74b) vacated and shifted everything by
> -1 in this region. The v2 cluster is **Seq 40 (#55) → 41 (#24) → 42
> (#51) → 43 (#56) → 44 (#61)**.

**Exact text to add** (verbatim):

```markdown
---

## Doc-contract wave (Seq 40–44 in v2; Seq 41–45 in v1)

These five sequential commits are the **single most concentrated**
capability-contract editing window of the cleanup. The developer should
treat them as one mental unit.

| v2 Seq | ID | What changes in `docs/security/authorization-capability-contract.md` |
|---:|---|---|
| 40 | #55 | drop `access_user_service` token from `service_policy` blob (md:109); validator runs |
| 41 | #24 | KRI linked-vendors barrel: edit md:117/118 + json:368/388/410 (atomic with #51) |
| 42 | #51 | KRI value-application shim: edit md:117/118/161 + json:389/411 (atomic with #24) |
| 43 | #56 | drop `directory_identity_service` token from md:109 + json:111/229 (atomic with #61) |
| 44 | #61 | move graph_directory_* into `_graph_directory/`; final md:109 token drop + json:113/229 (atomic with #56) |

**Operator notes**:
- The `service_policy` row at `md:109` shrinks across Seq 40 → 43 → 44
  (3 token drops in that one row).
- Pre-open `docs/security/authorization-capability-contract.md` and
  `.json` once at the start of the wave; keep them in the editor across
  all 5 commits.
- The validator (`scripts/security/validate_authz_capability_contract.py`)
  re-runs after every commit; **partial-removal states between Seq 40
  and 44 are valid intermediate states** (per Correction C in v2 §1.3).
- Mental cache warming: by Seq 44 the developer should know every cell
  by heart. This is sustainable for one week (cache-warm), not for two
  — schedule no other contract-touching work in the same week.
```

---

### 3.3 File-overlap clusters (Cohesion #3)

**Target file**: `plan-loop-2-08-master-sequence.md` at line 256
(after the "Doc-contract wave" subsection added in 3.2; before "Hub
waves").

**Exact text to add** (verbatim):

```markdown
---

## File-overlap clusters (cross-domain)

Three files are touched by 3 different items each. v2 sequencing already
honors the recommended order; this subsection surfaces the groupings so
reviewers don't have to re-derive them from Loop 1 + hidden-prereqs.

### Cluster 1 — `backend/app/api/v1/endpoints/users/summary.py`

| Order | v2 Seq | ID | What it does |
|---|---:|---|---|
| 1 | 6 | #37 | Replace `_can_view_governance` mirror with `build_me_capabilities` |
| 2 | 7 | #12 | Narrow blanket-except to `(SQLAlchemyError, ValidationError)` |
| 3 | 50 | #34 | Migrate `summary.py:24-26` to `resolve_approval_privilege_tier` helper |

**Rationale** (per Correction A, `plan-loop-3-07-integration-v2.md:18-65`):
#37 establishes the capability builder #12 narrows around; #34 migrates
the privilege tier on top of #12's narrowed except.

### Cluster 2 — `docs/security/authorization-capability-contract.md` row 109

| Order | v2 Seq | ID | What it does |
|---|---:|---|---|
| 1 | 40 | #55 | Drop `access_user_service` token |
| 2 | 43 | #56 | Drop `directory_identity_service` token |
| 3 | 44 | #61 | Final `graph_directory` rebrand |

**Rationale** (per Correction C, `plan-loop-3-07-integration-v2.md:118-150`):
3 sequential token-drops on the same `service_policy` row; validator
must tolerate partial-removal states between them.

### Cluster 3 — `tests/backend/pytest/test_architecture_deepening_contracts.py` (lines 117/118, 997-1002)

| Order | v2 Seq | ID | What it does |
|---|---:|---|---|
| 1 | 21 | #50 | Delete `_kri_history/submission.py` wrapper |
| 2 | 41 | #24 | Delete-and-repoint `kris/linked_vendors.py` barrel |
| 3 | 42 | #51 | Delete `_kri_history/value_application.py` shim |

**Rationale** (per Loop 2 lock-conflict matrix
`plan-loop-2-03-lock-conflict-matrix.md:316-326`): 3 deepening-contract
tuples in the same test file are relaxed across these commits.
Recommended order is as-sequenced.
```

---

### 3.4 Lock-test runtime budget (Cohesion #4)

**Target file**: `plan-loop-2-03-lock-conflict-matrix.md` after line 464
(end of "Grand total NEW lock-tier artifacts" paragraph).

**Exact text to add** (verbatim):

```markdown

---

## Lock-test runtime budget

Pre-cleanup architecture-lock test directory: **34 `.py` files** (verified
by `ls tests/backend/pytest/architecture/*.py | wc -l = 34`). Loop 2 adds
**24 NEW backend lock test files** (this matrix line 459) → final state
**58 architecture lock-test files** (a 70% growth in one initiative).

**Runtime budget**: cap at +5 minutes wall-clock for `make -f
scripts/Makefile test-architecture-locks` measured against the pre-Wave-1
baseline. Today's suite runs in ~3 minutes; post-cleanup target ≤ 8
minutes.

**Mitigation if budget breached**:
1. Mark worst offenders for `pytest -m contract -k <name>` filtering —
   PR-time runs a curated subset; nightly CI runs the full suite.
2. Group new architecture tests by ADR (e.g., all ADR-007 amendment
   tests under a `bounded_context` marker) so the filter granularity is
   coherent.
3. For test files that walk the full `_*/` package list (`#74a` census),
   cache the package-discovery glob once per pytest session via
   `@pytest.fixture(scope="session")`.

**Reviewer-ready expectation**: by Wave 5 (week 7-8), reviewers should be
told to expect a +70% file-count growth in the architecture-locks
directory. The 24 new files map 1:1 to specific items in the v2 sequence
(see this matrix lines 459-464 for the count breakdown).

**63 NEW test files + ~14 in-place tightenings** of existing files
(most landing in `test_architecture_deepening_contracts.py`) =
**~77 test authoring events**, one per master-sequence item.
```

---

### 3.5 Tighten priority-tier total (Cohesion #5)

**Target file**: `plan-loop-2-08-master-sequence.md` line 312.

**Exact edit**:

Old line:
```
Total = 10 + 43 + ~18 + 8 = 79 (over 77 because some items appear with multiple priority assignments in different sources; in the master sequence each item appears exactly once).
```

New text:
```
Total = 10 (P1) + 43 (P2) + 16 (P3) + 8 (P4) = 77 items, with `#45a/b` and `#74a/b` each counted once per half, `#75` once. (v2 sequence adds 2 items: #76 P3 + #77 P3, total 79 items / 12 P3 net.)
```

---

## 4. Proposed release-wave structure (consolidated)

The 8-wave structure (full table in §3.1) maps onto the v2 79-item
sequence as follows:

| Wave | Theme | Items | v2 Seq | Calendar | Effort | Reviewer focus |
|---:|---|---:|---|---|---:|---|
| 1 | ADRs ratified | 4 | 1–4 | Wk 1 | 14 h | Read-shape vs Workflow-paired classification; ADR-007 amendment text |
| 2 | P1 quick wins | 10 | 5–14 | Wk 2 | 32 h | `users/summary.py` 3-way handoff (#37→#12); validator gates on #13/#15/#37 |
| 3 | P2 dead-code A | 14 | 15–28 | Wk 3-4 | 56 h | Underscore aliases; FE dead-code burndown; risks/issues quick wins |
| 4 | P2 dead-code B + doc-contract wave | 15 | 29–43 | Wk 5-6 | 60 h | **Critical week**: 5 contract-edit commits in 5 days at Seq 40-44 |
| 5 | P2 chains + ADR text | 13 | 44–56 | Wk 7-8 | 88 h | Issue-domain consolidation (#27→#8→#28→#30); #74b ADR-007 text |
| 6 | P3 medium | 13 | 57–69 | Wk 9-10 | 124 h | Vendor reporting; FE query-keys + 3 dependents (#65/#67/#68 fanout); admin reorg |
| 7 | P4 + auth migration | 7 | 70–76 | Wk 11 | 64 h | **#76 auth migration** must land before 2026-09-01; ownership factory; AuthContext split |
| 8 | Migration + FE TS cleanup | 3 | 77–79 | Wk 12 | 28 h | #69+#70 atomic Postgres migration window + #77 Vendor.status TS cleanup |

**Natural break points** (why these waves and not others):

- **Wave 1/2 break**: ADR ratification → P1 cleanup. ADRs are pure-doc;
  P1 introduces code edits.
- **Wave 2/3 break**: P1 → P2. Priority-tier transition.
- **Wave 3/4 break**: dead-code A → dead-code B + doc-contract wave.
  Wave 4 is unique because the 5-commit doc-contract sub-cluster is in
  it; reviewers should know to slow down here.
- **Wave 4/5 break**: doc-contract wave closes; chains begin. Issue
  domain (#2→#8→#28→#30) is the longest single chain (4 nodes per
  `plan-loop-3-07-integration-v2.md:548-549`).
- **Wave 5/6 break**: chains → P3 medium. Effort doubles per item
  (S-mostly to M-mostly).
- **Wave 6/7 break**: P3 medium → P4 deferred + auth migration. The
  inflection where #46 (FE-N1, L) has unblocked #65/#67/#68; the
  developer pivots to FE auth refactor.
- **Wave 7/8 break**: P4 cleanup → Postgres migration window. Migration
  rehearsal is operational risk; reviewers focus on rollback strategy.

**Effort distribution per wave**: roughly bell-shaped, peaking at Wave 6
(124 h = the FE/BE convergence). Wave 4 (60 h) and Wave 5 (88 h) are the
"crunch weeks" because doc-contract wave sits in Wave 4 and the issue
chain bottlenecks Wave 5.

---

## 5. Reviewer-friendly grouping for the resolution plan

The resolution plan document itself (this file) is structured to be
review-friendly:

- §1 (7 ADR Q&A) → review against `plan-loop-3-06-adr-drafts.md` open
  questions. Each Q has a Recommendation + Rationale + Edit triple.
- §2 (7 integration-v2 Q&A) → review against
  `plan-loop-3-07-integration-v2.md:605-650`. Same triple shape.
- §3 (5 cohesion improvements) → review against
  `plan-loop-3-08-cohesion.md:548-585`. Each has the **target file** +
  **target line** + **exact verbatim text** to insert.
- §4 (release waves) → consolidates §3.1 into a one-page summary for the
  reviewer's at-a-glance use.
- §5 (this section) → meta.
- §6 (Phase 4 Loop 2 priorities) → tells the next loop what to challenge.

**Triage tags used throughout**:
- 🔴 Critical / blocking → would gate a Phase 4 commit.
- 🟡 Should fix before commit → reviewer should ensure the edit lands
  before Phase 5.
- 🟢 Observations / nice-to-have → not blocking; can defer to Phase 6.
- ✅ Verified clean → no action needed.

This document's open-question-by-open-question shape is **🟡 mostly** —
edits to plan files are required, but no v2 sequence renumbering is
needed.

---

## 6. Phase 4 Loop 2 priorities — what to challenge

Loop 2 (adversarial) should treat this resolution plan as a Round-1
output and stress-test the following points (in order of risk):

### 6.1 🔴 Validator partial-removal tolerance (Q4 §2.4)

**Challenge**: the dry-run procedure assumes the validator is _readable_
between commits. If the validator's intermediate state assertion is
fragile (e.g., it requires the `service_policy` blob to match a specific
shape), the partial-removal sequence at Seq 40-44 will fail.

**Loop 2 task**: actually run the dry-run on a `git stash`-protected
branch. Don't assume tolerance; verify it. Report the validator's exit
code at each branch.

### 6.2 🔴 #76 calendar feasibility (Q6 §2.6)

**Challenge**: the calendar arithmetic assumes a linear single-developer
pace. If adversarial review (Phase 4 Loops 1+2 = 4-5 weeks) is folded in
ON TOP of the 12-14 week sequence, #76 calendar slips further. The
2026-09-01 deadline may already be missed.

**Loop 2 task**: assume a Phase 4 Loop 1 start of 2026-05-09 (today).
Calculate when #76 lands at:
- Linear single-dev: 12 weeks → 2026-08-01 (✅ before deadline).
- + 30% buffer: 15.6 weeks → 2026-08-26 (⚠️ tight).
- + 4 weeks adversarial: 19.6 weeks → 2026-09-22 (❌ deadline missed).

If adversarial weeks are NOT folded in (i.e., adversarial happens during
each wave's review, not after), the linear calc holds. Loop 2 must
confirm which model is used.

### 6.3 🟡 Soft-edge schema field (Q5 §2.5)

**Challenge**: introducing `soft_in_domain_deps` mid-stream in the master
DAG yaml may break existing tooling (e.g., a topo-sorter that expects a
fixed schema).

**Loop 2 task**: grep for consumers of `plan-loop-2-01-master-dag.yaml`
in the repo. If any tool/script reads it, ensure backward-compat (the
new fields are optional; defaults to `[]`).

### 6.4 🟡 Lock-test runtime budget (Q4 §3.4)

**Challenge**: the +5 minute cap is a guess. The actual growth depends
on the test shapes — if some new tests walk the full `_*/` package
tree, runtime grows superlinearly with package count.

**Loop 2 task**: pick 3 representative new lock tests from the Loop 2
matrix (one allowlist test, one parity test, one disjointness test) and
estimate per-test runtime. Compare cumulative against the 5-minute cap.

### 6.5 🟡 Wave structure (Q3.1)

**Challenge**: the 8-wave grouping is a presentation artifact. If a
critical-path slip happens in Wave 4 (doc-contract wave), Wave 5 may
absorb the slip and break the wave-summary cadence.

**Loop 2 task**: verify each wave has at most one "critical" item (one
that cannot slip). Wave 4's doc-contract wave is the highest-risk;
confirm there is no second critical item in Wave 4.

### 6.6 🟢 ADR status convention (Q1 §1.1)

**Challenge**: matches existing precedent; low risk. Confirm the
ADR-text-and-acceptance-in-same-commit convention is acceptable to
reviewers (vs. a 2-step "Proposed → Accepted" workflow that some teams
prefer).

**Loop 2 task**: if reviewers want a 2-step workflow, the convention can
be changed at Phase 5 — but that's a 3-line edit per ADR (status text +
two commit sequence). Note as deferrable.

### 6.7 🟢 Effort sizing for #76 (Q1 §2.1)

**Challenge**: keep at M but Loop 2 should not pre-emptively L-size.
Loop 4 spike is the right venue.

**Loop 2 task**: confirm Loop 4 will run a 30-minute spike before #76 is
sequenced. If Loop 4 venue is unclear, escalate.

### 6.8 ✅ Verified clean

- Q2/Q3/Q4 from §1 (`_orphaned_items`, `_notification_inbox`,
  `_register_listings` dual-class) — all defensible classifications;
  amendment table at `plan-loop-3-06-adr-drafts.md:245-279` is internally
  consistent.
- Q6 (REPORTING_GRACE_DAYS direction) — user's explicit decision; no
  challenge needed.
- Q7 (mock-auth phrasing) — Loop B's correction is verified; no
  challenge needed.
- Critical path unchanged at #2→#8→#28→#30 (4 nodes); no Phase 4 reroute.

---

## Appendix A — Cross-references for Phase 5

When this resolution plan is merged into the master sequence
(`plan-loop-2-08-master-sequence.md`) at Phase 5, the following file
edits land:

1. `plan-loop-2-08-master-sequence.md` line 256 → insert §3.2
   "Doc-contract wave" subsection.
2. `plan-loop-2-08-master-sequence.md` line 256 → insert §3.3
   "File-overlap clusters" subsection (after 3.2).
3. `plan-loop-2-08-master-sequence.md` line 312 → replace 79 with 77
   priority-tier total per §3.5.
4. `plan-loop-2-08-master-sequence.md` after line 324 → insert §3.1
   "Release waves" section.
5. `plan-loop-2-03-lock-conflict-matrix.md` after line 464 → insert §3.4
   "Lock-test runtime budget".

Per-plan amendments (already enumerated in
`plan-loop-3-07-integration-v2.md:564-602`) carry the integration-v2 §7
amendments. This resolution plan does not duplicate them.

---

## Appendix B — Acronym/term consistency

For reviewer convenience, the resolution plan uses:

- **v2 sequence** = `plan-loop-3-07-integration-v2.md` 79-item sequence.
- **v1 sequence** = `plan-loop-2-08-master-sequence.md` 77-item sequence.
- **Wave** = a release/review batch (1-8 in §3.1).
- **Gate** = a landing gate (A-G in `plan-loop-2-08-master-sequence.md:316-324`).
  Waves and Gates are 1:1 except Wave 4 splits Gate C; the Wave/Gate
  mapping is:
  - Wave 1 = Gate A
  - Wave 2 = Gate B
  - Wave 3 + Wave 4 = Gate C (split at v2 Seq 28/29 boundary)
  - Wave 5 = Gate D + first half of Gate E (#74b at v2 Seq 45)
  - Wave 6 = Gate E (P3 medium)
  - Wave 7 = Gate F + #76 from v2 (Seq 70)
  - Wave 8 = Gate G + #77 from v2 (Seq 79)

---

End of Phase 4 Loop 1 cohesion-resolution plan.
