# Phase 4 Loop 1 (Constructive) — Sequence Audit (v2)

**Working directory**: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. **Build commit**: `1ee872a4`.
**Source under review**: `plan-loop-3-07-integration-v2.md` (79-item v2 master sequence).
**Reference inputs**: `plan-loop-2-01-master-dag.yaml`, `plan-loop-2-08-master-sequence.md`,
`plan-loop-2-07-hidden-prereqs.md`, `plan-loop-3-08-cohesion.md`, all `plan-loop-1-0*-*.md`.

**Method**: For each of the 79 v2 sequence slots, walk the master DAG's `in_domain_deps`
and `cross_domain_deps` lists for that item, look up the v2 sequence position of every
prereq, and assert v2_seq(item) > v2_seq(prereq). Atomic clusters checked for
contiguity. Hub waves checked for sequence ordering. Soft prereqs (per Loop 2 A7
Corrections A and E) are flagged separately because they are coordination-only.

**Mode**: CONSTRUCTIVE — surface gaps; do not propose new items; do not paraphrase
plan text.

---

## 1. Quick legend (v2 slot ↔ ID lookup)

| v2 Seq | ID  | v2 Seq | ID  | v2 Seq | ID  | v2 Seq | ID  |
|---:|---|---:|---|---:|---|---:|---|
|  1 | #72 | 21 | #50 | 41 | #24 | 61 | #42 |
|  2 | #73 | 22 | #52 | 42 | #51 | 62 | #58 |
|  3 | #74a | 23 | #53 | 43 | #56 | 63 | #63 |
|  4 | #10 | 24 | #54 | 44 | #61 | 64 | #46 |
|  5 | #57 | 25 | #75 | 45 | #74b | 65 | #65 |
|  6 | #37 | 26 | #18 | 46 | #17 | 66 | #67 |
|  7 | #12 | 27 | #20 | 47 | #49 | 67 | #39 |
|  8 | #13 | 28 | #21 | 48 | #59 | 68 | #40 |
|  9 | #1  | 29 | #25 | 49 | #9  | 69 | #62 |
| 10 | #19 | 30 | #26 | 50 | #34 | 70 | #76 |
| 11 | #11 | 31 | #29 | 51 | #27 | 71 | #45a |
| 12 | #14 | 32 | #33 | 52 | #8  | 72 | #45b |
| 13 | #15 | 33 | #35 | 53 | #28 | 73 | #66 |
| 14 | #2  | 34 | #36 | 54 | #30 | 74 | #68 |
| 15 | #3  | 35 | #48 | 55 | #16 | 75 | #60 |
| 16 | #4  | 36 | #64 | 56 | #38 | 76 | #71 |
| 17 | #5  | 37 | #47 | 57 | #31 | 77 | #69 |
| 18 | #6  | 38 | #22 | 58 | #32 | 78 | #70 |
| 19 | #7  | 39 | #23 | 59 | #43 | 79 | #77 |
| 20 | #41 | 40 | #55 | 60 | #44 |    |     |

(Reverse map: each ID below cited as `#X (slot N)`. Source: `plan-loop-3-07-integration-v2.md:343-422`.)

---

## 2. Item-by-item dependency check (all 79 slots)

The audit walks every item, listing its prereqs from
`plan-loop-2-01-master-dag.yaml` plus the new edges added by Loop 3 v2
(`plan-loop-3-07-integration-v2.md:504-516`).

`HONORED` = item's slot strictly greater than every prereq's slot.
`VIOLATED` = at least one prereq lands AFTER the item.
`N/A` = no prereqs.

### Slot 1 — #72 (ADR-011)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A
- Atomic with: [] — N/A
- Hub wave: head of `{#72} → {#76, #71}` (ADR-011) — preserved YES (slot 1 first)

### Slot 2 — #73 (ADR-012)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A
- Atomic with: [] — N/A

### Slot 3 — #74a (ADR-007 census)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A
- Atomic with: [] — N/A
- Notes: lock-test wording amended per Correction B (`plan-loop-3-07-integration-v2.md:104`).

### Slot 4 — #10 (Reject riskhub_questionnaires.py)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A
- Blocks: [#38 at slot 56] — HONORED

### Slot 5 — #57 (Reject quarterly_comparison_service.py)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 6 — #37 (replace `_can_view_governance` mirror)
- In-domain deps: [] — N/A (Master DAG `:537`)
- Cross-domain deps: [] — N/A
- Blocks: [#66 at slot 73] — HONORED
- Soft sequencing edge `#37 → #12` (added by Correction A, `plan-loop-3-07-integration-v2.md:511`) — slot 6 < slot 7 — HONORED
- Soft sequencing edge `#37 → #34` (implied by 3-way overlap) — slot 6 < slot 50 — HONORED

### Slot 7 — #12 (narrow blanket-except in users/summary.py)
- In-domain deps: [] — N/A (Master DAG `:672`)
- Cross-domain deps: [] — N/A
- Soft prereq from #37 — slot 7 > slot 6 — HONORED
- Soft sequencing edge `#12 → #34` — slot 7 < slot 50 — HONORED

### Slot 8 — #13 (delete vendor_link_helpers.py shim)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 9 — #1 (drop validate_risk_type re-export)
- In-domain deps: [] — N/A (Master DAG `:128`)
- Cross-domain deps: [] — N/A
- Blocks: [#19 at slot 10] — HONORED (chain head)

### Slot 10 — #19 (consolidate risk-type validation onto service policy)
- In-domain deps: [#1 at slot 9] — HONORED
- Cross-domain deps: [] — N/A
- Blocks: [#11 at slot 11] — HONORED

### Slot 11 — #11 (risk.process → risk.name truth-in-naming fix)
- In-domain deps: [#19 at slot 10] — HONORED
- Cross-domain deps: [] — N/A

### Slot 12 — #14 (issues outbox-only notification cleanup)
- In-domain deps: [] — N/A (Master DAG `:50`)
- Cross-domain deps: [] — N/A
- Blocks: [#30 at slot 54] — HONORED

### Slot 13 — #15 (add access_user capability surface)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 14 — #2 (drop 4 underscore aliases in source_validation.py)
- In-domain deps: [] — N/A (Master DAG `:27`)
- Cross-domain deps: [] — N/A
- Blocks: [#8 at slot 52] — HONORED (chain head)

### Slot 15 — #3 (delete kriFormWorkflow.ts)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 16 — #4 (delete controlFormWorkflow.ts)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 17 — #5 (delete orphanResolutionPresentation.ts)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 18 — #6 (delete notifications/resourcePath.ts)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 19 — #7 (delete `_get_approval_department_id` shim)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 20 — #41 (delete bidirectional underscore aliases)
- In-domain deps: [] — N/A (Master DAG `:103`)
- Cross-domain deps: [] — N/A

### Slot 21 — #50 (delete `_kri_history/submission.py` wrapper)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 22 — #52 (delete `_kri_history/correction_plans.py`)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 23 — #53 (drop IssueWorkflowService facade)
- In-domain deps: [] — N/A (Master DAG `:104`)
- Cross-domain deps: [] — N/A

### Slot 24 — #54 (inline `_approval_queue/lifecycle.py`)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 25 — #75 (delete-and-consolidate `_auto_reject_kri_approval`)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 26 — #18 (repoint-and-delete `_build_approval_read`)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 27 — #20 (risk ID generation co-location)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 28 — #21 (collapse Control-Risk link loader duplicates)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 29 — #25 (extract KRI department-scope helper)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 30 — #26 (delete `KRIForm.tsx` shim + ESLint pin)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 31 — #29 (source-type vocabulary canonicalization)
- In-domain deps: [] — N/A (`plan:235` "independent")
- Cross-domain deps: [] — N/A

### Slot 32 — #33 (unify FE approval-queued banners)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 33 — #35 (delete `usePermissions` hook)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A
- Soft prereq for #66 (per Correction E) — slot 33 < slot 73 — HONORED

### Slot 34 — #36 (refactor `BusinessRouteGuards.tsx`)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 35 — #48 (merge errorKeys)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 36 — #64 (extract QueryClient defaults)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 37 — #47 (extract session-refresh retry policy)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A
- Blocks: [#71 at slot 76] — HONORED

### Slot 38 — #22 (delete `ControlForm.tsx` shim)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A
- Blocks: [#23 at slot 39] — HONORED

### Slot 39 — #23 (inline `controlFormUtils` helpers)
- In-domain deps: [#22 at slot 38] — HONORED
- Cross-domain deps: [] — N/A

### Slot 40 — #55 (delete `access_user_service.py` facade)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A
- Validator-reentry annotation (per Correction C) — slot 40 lands before #56/#61 — HONORED

### Slot 41 — #24 (delete-and-repoint `kris/linked_vendors.py` barrel)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A
- Atomic with: [#51 at slot 42] — contiguous YES (slot 41+42)

### Slot 42 — #51 (delete `_kri_history/value_application.py` shim)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A
- Atomic with: [#24 at slot 41] — contiguous YES (slot 41+42)
- Blocks: [#60 at slot 75] — HONORED

### Slot 43 — #56 (delete `directory_identity_service.py` shim)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A
- Atomic with: [#61 at slot 44] — contiguous YES (slot 43+44)

### Slot 44 — #61 (move `graph_directory_*` → `_graph_directory/`)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A
- Atomic with: [#56 at slot 43] — contiguous YES (slot 43+44)
- Blocks: [#74b at slot 45] — HONORED (slot 44 < 45)

### Slot 45 — #74b (ADR-007 amendment text)
- In-domain deps: [#74a at slot 3] — HONORED
- Cross-domain deps: [#61 at slot 44] — HONORED (slot 45 > 44)
- Verification: v1 had #74b at Seq 4 which was infeasible
  (`plan-loop-3-07-integration-v2.md:88-94`); v2 fix is correct.

### Slot 46 — #17 (inline `_monitoring_response` endpoint shim)
- In-domain deps: [] — N/A (Master DAG `:391`)
- Cross-domain deps: [] — N/A
- Blocks: [#49 at slot 47, #59 at slot 48] — HONORED
- Hub wave: head of `#17 → #49 → #59` — preserved YES (46 → 47 → 48)

### Slot 47 — #49 (inline `_control_execution/monitoring.py`)
- In-domain deps: [#17 at slot 46] — HONORED
- Cross-domain deps: [] — N/A
- Blocks: [#59 at slot 48] — HONORED
- Hub wave: middle of `#17 → #49 → #59` — preserved YES

### Slot 48 — #59 (consolidate `_monitoring_*` packages)
- In-domain deps: [#17 at slot 46, #49 at slot 47] — HONORED
- Cross-domain deps: [] — N/A
- Hub wave: tail of `#17 → #49 → #59` — preserved YES

### Slot 49 — #9 (delete-and-redirect `can_user_view_approval_resource`)
- In-domain deps: [] — N/A (Master DAG `:188`)
- Cross-domain deps: [] — N/A
- Blocks: [#34 at slot 50] — HONORED
- Hub wave: head of `#9 → #34 → #60` — preserved YES (49 → 50 → 75)

### Slot 50 — #34 (extract `resolve_approval_privilege_tier` helper)
- In-domain deps: [#9 at slot 49] — HONORED
- Cross-domain deps: [] — N/A (Master DAG explicit)
- Soft prereq from #37 (slot 6) — HONORED
- Soft prereq from #12 (slot 7) — HONORED
- Blocks: [#60 at slot 75] — HONORED
- Hub wave: middle of `#9 → #34 → #60` — preserved YES

### Slot 51 — #27 (issue-loading duplicate deletion)
- In-domain deps: [] — N/A (Master DAG `:60`)
- Cross-domain deps: [] — N/A
- Blocks: [#30 at slot 54] — HONORED

### Slot 52 — #8 (source-validation split + canonical link helpers)
- In-domain deps: [#2 at slot 14] — HONORED
- Cross-domain deps: [] — N/A
- Blocks: [#28 at slot 53] — HONORED

### Slot 53 — #28 (issue source-mutation triplicate collapse)
- In-domain deps: [#8 at slot 52] — HONORED
- Cross-domain deps: [] — N/A
- Blocks: [#30 at slot 54] — HONORED

### Slot 54 — #30 (`issues/_shared/__init__.py` underscore prune)
- In-domain deps: [#14 at slot 12, #27 at slot 51, #28 at slot 53] — HONORED
- Cross-domain deps: [] — N/A
- Critical-path tail of `#2 → #8 → #28 → #30` — HONORED

### Slot 55 — #16 (remove reports legacy-excel tombstones)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 56 — #38 (move 8 inline endpoint Pydantic models)
- In-domain deps: [#10 at slot 4] — HONORED
- Cross-domain deps: [] — N/A (FE Zod mirror BUNDLED in same commit per Correction G,
  `plan-loop-3-07-integration-v2.md:322-326`)
- No new edge added; bundling note is annotation-only.

### Slot 57 — #31 (extract vendor reporting row formatters)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 58 — #32 (extract generic vendor linked-entity tab)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 59 — #43 (audit adapter-emitter helper)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 60 — #44 (centralize guarded path-prefix registry)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 61 — #42 (`ActorPayloadModel` shared base)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 62 — #58 (delete `OrphanedItemService` facade)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 63 — #63 (instrument outbox dispatch with `SchedulerJobRun`)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 64 — #46 (promote resource query-key factories)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A
- Blocks: [#65 at slot 65, #67 at slot 66, #68 at slot 74 (soft)] — HONORED
- Hub wave: head of `#46 → {#65, #67, #68}` — preserved YES (64 → 65, 66, 74)

### Slot 65 — #65 (extract `crudCapabilitySchema` shared Zod base)
- In-domain deps: [#46 at slot 64] — HONORED
- Cross-domain deps: [] — N/A
- Hub wave: tail of `#46 → #65` — preserved YES

### Slot 66 — #67 (extract generic `useResourcePanelQuery`)
- In-domain deps: [#46 at slot 64] — HONORED
- Cross-domain deps: [] — N/A
- Hub wave: tail of `#46 → #67` — preserved YES

### Slot 67 — #39 (replace `admin/capabilities.py` static stub)
- In-domain deps: [] — N/A (Master DAG `:548`)
- Cross-domain deps: [] — N/A
- Blocks: [#40 at slot 68, #66 at slot 73] — HONORED

### Slot 68 — #40 (re-cluster admin sub-routers)
- In-domain deps: [] — N/A (Master DAG `:786`)
- Cross-domain deps: [#39 at slot 67] — HONORED

### Slot 69 — #62 (relocate `kri_vendor_assignment.py`)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A

### Slot 70 — #76 (NEW — migrate 8 auth-flow `db.commit` sites)
- In-domain deps: [] — N/A
- Cross-domain deps: [#72 at slot 1] — HONORED (slot 70 > slot 1)
- Verification per Correction D: hard edge `#72 → #76` added (`plan-loop-3-07-integration-v2.md:198`).

### Slot 71 — #45a (ownership prerequisite characterization tests)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A
- Blocks: [#45b at slot 72] — HONORED

### Slot 72 — #45b (ownership resolver factory)
- In-domain deps: [#45a at slot 71] — HONORED
- Cross-domain deps: [] — N/A

### Slot 73 — #66 (split `AuthContext.tsx` into providers)
- In-domain deps: [#37 at slot 6, #39 at slot 67] — HONORED
- Cross-domain deps: [] — N/A (Master DAG correctly omits #72 per Loop B correction)
- Soft prereq from #35 (per Correction E) — slot 73 > slot 33 — HONORED
- Blocks: [#68 at slot 74, #71 at slot 76] — HONORED

### Slot 74 — #68 (introduce `WidgetShell` + scoped query selector)
- In-domain deps: [#66 at slot 73] — HONORED (also benefits-from #46 at slot 64)
- Cross-domain deps: [] — N/A
- Hub wave: tail of `#46 → … → #68` (via #66) — preserved YES

### Slot 75 — #60 (`PrivilegeContext` + `Depends(get_privilege_context)`)
- In-domain deps: [#34 at slot 50] — HONORED
- Cross-domain deps: [#51 at slot 42] (per `plan-loop-2-08-master-sequence.md:114` "Pre-req: #34, #51") — HONORED
- Hub wave: tail of `#9 → #34 → #60` — preserved YES (49 → 50 → 75)

### Slot 76 — #71 (merge `services/session/` 8 → 4)
- In-domain deps: [#47 at slot 37, #66 at slot 73] — HONORED
- Cross-domain deps: [#72 at slot 1] — HONORED

### Slot 77 — #69 (introduce `AbstractVendorLink` mixin Phase 1)
- In-domain deps: [] — N/A
- Cross-domain deps: [] — N/A
- Atomic with: [#70 at slot 78] — contiguous YES (slot 77+78)
- Blocks: [#70 at slot 78] — HONORED (intra-atomic ordering edge `#69 → #70`)

### Slot 78 — #70 (drop `Vendor.status` enum)
- In-domain deps: [#69 at slot 77] — HONORED (intra-atomic ordering)
- Cross-domain deps: [] — N/A
- Atomic with: [#69 at slot 77] — contiguous YES
- Blocks: [#77 at slot 79] — HONORED (per new edge from Correction F)

### Slot 79 — #77 (NEW — prune `Vendor.status` from FE TS + Zod)
- In-domain deps: [] — N/A
- Cross-domain deps: [#70 at slot 78] — HONORED
- Verification per Correction F: hard edge `#70 → #77` added (`plan-loop-3-07-integration-v2.md:506-507`).

---

## 3. Atomic-cluster contiguity verification

| Cluster | v2 Slots | Contiguous? | Source citation |
|---|---|---|---|
| **#24 + #51** (KRI linked-vendors atomic) | 41 + 42 | YES | `plan-loop-3-07-integration-v2.md:486` "v2 Seq 41 + 42" |
| **#56 + #61** (graph_directory atomic)  | 43 + 44 | YES | `:487` "v2 Seq 43 + 44" |
| **#69 + #70** (Vendor migration window)  | 77 + 78 | YES | `:488` "v2 Seq 77 + 78" |

All three atomic clusters are at consecutive sequence numbers — verified.

---

## 4. Hub wave verification

### Approvals privilege tier hub: `#9 → #34 → #60`
- Slots: 49 → 50 → 75
- Order preserved YES; gap-of-25 between #34 (slot 50) and #60 (slot 75) is
  intentional because #60 is P4-deferred and additionally requires #51 (slot 42).

### Frontend query-keys hub: `#46 → {#65, #67}`
- Slots: 64 → 65, 66
- Order preserved YES. #68 also depends on #66 (slot 73 → slot 74) so the full
  fan-out `#46 → #65, #67, then #66 → #68` lands cleanly at 64 → 65/66 → 73 → 74.

### Endpoints monitoring hub: `#17 → #49 → #59`
- Slots: 46 → 47 → 48
- Order preserved YES; consecutive, validating Hub-wave additivity.

---

## 5. ADR ordering verification

All 4 ADRs land BEFORE their code-item dependents:

| ADR | v2 slot | Dependents | Slots of dependents | OK? |
|---|---:|---|---|---|
| #72 (ADR-011) | 1  | #71, #76 | 76, 70 | YES |
| #73 (ADR-012) | 2  | (informational; KRI cleanups #50/#52/#24/#51) | 21, 22, 41, 42 | YES |
| #74a (ADR-007 census) | 3 | #74b | 45 | YES |
| #74b (ADR-007 text) | 45 | (terminal) | — | YES |

All ADRs are well-ordered relative to their dependents. The v2 fix moves #74b
from infeasible v1 Seq 4 to v2 Seq 45, after #61 (slot 44) — verified.

---

## 6. Migration window placement verification

`#69 + #70` lands at slots 77 + 78 (last but one and last but two slots before
the new #77). `plan-loop-3-07-integration-v2.md:421` confirms: `#70 | atomic
with #69`. The new #77 (slot 79) is correctly placed AFTER the migration
window since it depends on #70 (`plan-loop-3-07-integration-v2.md:506-507`).

Migration window is placed at the END as planned — verified.

---

## 7. Hidden cross-dependency spot-checks (per Loop 2 A7 Corrections A-G)

### Correction A — `users/summary.py` 3-way overlap (`#37 → #12 → #34`)
- v2 slots: 6 → 7 → 50
- HONORED: 6 < 7 < 50.
- Soft sequencing: ordering recommendation enforced via slot promotion of #37
  from v1 Seq 14 to v2 Seq 6 (`plan-loop-3-07-integration-v2.md:46-52`).

### Correction B — #74a count drift / #74b position
- #74b was infeasibly at v1 Seq 4 (before #61 at v1 Seq 45).
- v2 fix: #74b moved to slot 45 (after #61 at slot 44). HONORED.
- #74a wording amended from "exactly 31 packages today" to "≥ 31; 32 after
  #61" per `plan-loop-3-07-integration-v2.md:104`.

### Correction C — #55 → #56+#61 validator-reentry
- v2 slots: 40 → 43+44.
- Strict topological order HONORED; `Validator-reentry: required after each
  commit` annotation added per `plan-loop-3-07-integration-v2.md:142-147`.

### Correction D — `#72 → #76` (ADR-011 → auth/ commit migration)
- v2 slots: 1 → 70.
- HONORED. New item #76 added at slot 70 per `plan-loop-3-07-integration-v2.md:413`.

### Correction E — `#35 → #66` (soft, avoid 18-test-file double-rewrite)
- v2 slots: 33 → 73.
- HONORED. Soft sequencing edge added per
  `plan-loop-3-07-integration-v2.md:240-242`. Existing v1 ordering preserved.

### Correction F — `#70 → #77` (Vendor.status FE TS cleanup)
- v2 slots: 78 → 79.
- HONORED. New item #77 added at slot 79 per
  `plan-loop-3-07-integration-v2.md:422`.

### Correction G — #38 BatchSendRiskFilters rename FE Zod mirror
- v2 slot: #38 at slot 56.
- No new node added; FE Zod mirror update bundled IN the #38 commit per
  `plan-loop-3-07-integration-v2.md:322`. No sequencing concern.

---

## 8. Critical-path verification

The longest single linear chain in v2 should remain `#2 → #8 → #28 → #30`:

| Item | v2 slot |
|---|---:|
| #2  | 14 |
| #8  | 52 |
| #28 | 53 |
| #30 | 54 |

Slots 14 < 52 < 53 < 54 — chain preserved, contiguity-tight at the tail.
HONORED. (Source: `plan-loop-3-07-integration-v2.md:540-549` "v2 critical
path: UNCHANGED ... #2 → #8 → #28 → #30 (4 nodes)".)

---

## 9. Convergence-point verification (≥2 incoming edges)

Per Master DAG `:919-948` `heaviest_hubs`:

| Sink | Prereqs | Prereq slots | Sink slot | OK? |
|---|---|---|---:|---|
| #30 | #14, #27, #28 | 12, 51, 53 | 54 | YES (max 53 < 54) |
| #71 | #47, #66, #72 | 37, 73, 1 | 76 | YES (max 73 < 76) |
| #66 | #37, #39 | 6, 67 | 73 | YES (max 67 < 73) |
| #59 | #17, #49 | 46, 47 | 48 | YES (max 47 < 48) |
| #74b | #74a, #61 | 3, 44 | 45 | YES (max 44 < 45) |
| #60 | #34, #51 | 50, 42 | 75 | YES (max 50 < 75) |
| #45b | #45a | 71 | 72 | YES |
| #40 | #39 | 67 | 68 | YES |
| #74b | #74a, #61 | 3, 44 | 45 | YES |
| #76 | #72 | 1 | 70 | YES (NEW) |
| #77 | #70 | 78 | 79 | YES (NEW) |

All convergence points correctly sequence sink AFTER all prereqs.

---

## 10. Violation roster

### HARD violations (item before its hard prereq)

**NONE** — every hard topological edge in the v2 sequence is honored.
The single hard violation in v1 (#74b before #61) is corrected by v2's
re-sequencing of #74b to slot 45.

### SOFT violations (item before a soft / coordination prereq)

**NONE** — every soft sequencing edge added by Corrections A and E is honored:

- `#37 → #12` (Correction A): slot 6 < slot 7 — HONORED.
- `#12 → #34` (Correction A): slot 7 < slot 50 — HONORED.
- `#35 → #66` (Correction E): slot 33 < slot 73 — HONORED.

### SUBOPTIMAL ordering (technically valid but creates avoidable churn)

The following observations are flagged in `plan-loop-3-08-cohesion.md` but are
sequencing-valid; they are coordination opportunities, not violations:

1. **Doc-contract wave at slots 41-45** (`plan-loop-3-08-cohesion.md:171-214`):
   Five validator-gated commits in five consecutive slots all touch
   `docs/security/authorization-capability-contract.md`. Topologically valid;
   ergonomically dense. Loop 3 cohesion check classifies this as
   `NEEDS-FIX (medium — ergonomics)`. NOT a hard or soft violation; the
   v2 sequencing actually MAXIMIZES atomic-cluster contiguity which is the
   higher-priority constraint.
2. **Late migration window for `#69+#70` at slots 77-78**
   (`plan-loop-3-08-cohesion.md:218-252`): Five Vendor items land before the
   migration; their tests may carry `Vendor.status` references that need
   scrubbing at landing time. Topologically valid; Cohesion check flags as
   `NEEDS-FIX (medium — debatable)`. The tradeoff is intentional per ADR-005 +
   ADR-010 (`plan-loop-2-08-master-sequence.md:31`). NOT a violation.
3. **`#62` (KRI vendor assignment relocate) at slot 69** lands BEFORE the
   `#69+#70` migration window at 77+78. `plan-loop-2-01-master-dag.yaml:344`
   "in_domain_deps: [] # plan:247 'none. Defer override: NOT blocked by #69'".
   So topologically free. The dev answer marks #62 as P4 Defer, suggesting
   it could land WITH or AFTER the migration window — but no edge requires
   that. Suboptimal-debatable; v2 places it at slot 69 (P3 wave end), which
   matches the master-sequence rationale at
   `plan-loop-2-08-master-sequence.md:298`.

### Atomic-cluster contiguity SUBOPTIMAL flag

NONE. All three atomic pairs (#24+#51, #56+#61, #69+#70) are exactly contiguous.

---

## 11. Counts

| Rule | HONORED | VIOLATED | N/A | Total |
|---|---:|---:|---:|---:|
| In-domain deps | 16 | 0 | 63 | 79 |
| Cross-domain deps | 9 | 0 | 70 | 79 |
| Atomic-cluster contiguity | 3 | 0 | — | 3 |
| Hub-wave ordering | 3 | 0 | — | 3 |
| ADR ordering | 4 | 0 | — | 4 |
| Soft prereqs (Loop 2 A7) | 3 | 0 | — | 3 |
| Migration window placement | 1 | 0 | — | 1 |
| Convergence points | 11 | 0 | — | 11 |

### Counts in plain prose

- Total items: **79**.
- Items with at least one in-domain prereq: **16** (all HONORED).
- Items with at least one cross-domain prereq: **9** (all HONORED, including
  the 2 new edges from Corrections D and F).
- Atomic clusters: **3 / 3 contiguous**.
- Hub waves: **3 / 3 preserved**.
- ADR ordering: **4 / 4 ADRs land before their dependents**.
- Soft-sequencing edges: **3 / 3 honored**.
- Migration window: **placed at end as planned**.
- Convergence points (≥2 incoming): **11 / 11 honored**.
- HARD violations: **0**.
- SOFT violations: **0**.
- SUBOPTIMAL orderings flagged: **3** (all noted in `plan-loop-3-08-cohesion.md`
  as ergonomic concerns, not topological violations).

---

## 12. Specific verifications requested by orchestrator

| Specific check | v2 slots | Verdict |
|---|---|---|
| #74a (census) → #74b (amend text), #74b moved to slot 45 | 3 → 45 | HONORED |
| #61 (graph_directory move) → #74b | 44 → 45 | HONORED |
| #72 (ADR-011) → #76 (auth/ migration) | 1 → 70 | HONORED |
| #70 (Vendor.status drop) → #77 (FE TS cleanup) | 78 → 79 | HONORED |
| #2 → #8 → #28 → #30 critical path | 14 → 52 → 53 → 54 | HONORED |
| #45a → #45b ownership | 71 → 72 | HONORED |
| #37 → #12 → #34 soft sequencing | 6 → 7 → 50 | HONORED |
| #9 → #34 → #60 approvals hub | 49 → 50 → 75 | HONORED |
| #46 → #65 → #67 → #68 frontend hub | 64 → 65 / 66 → 74 | HONORED |
| #17 → #49 → #59 monitoring hub | 46 → 47 → 48 | HONORED |
| #56 + #61 paired wave contiguous | 43 + 44 | YES |
| #24 + #51 atomic cluster contiguous | 41 + 42 | YES |
| #69 + #70 atomic cluster contiguous | 77 + 78 | YES |

All 13 orchestrator-requested specific verifications PASS.

---

## 13. Closing summary

The v2 master sequence in `plan-loop-3-07-integration-v2.md` is
topologically sound: every hard prerequisite edge is honored, every soft
sequencing edge added by Corrections A and E is honored, every atomic cluster
is exactly contiguous, every hub wave preserves additivity, every ADR lands
before its code-item dependents, and the migration window is placed at the
end as planned.

The only suboptimal orderings flagged are ergonomic (doc-contract wave at
slots 41-45 and late migration window for `#69+#70`); both are documented in
`plan-loop-3-08-cohesion.md` and represent intentional tradeoffs — NOT
sequencing violations.

The two new items from Loop 3 (#76 at slot 70 from Correction D; #77 at
slot 79 from Correction F) are correctly placed AFTER their prereqs (#72 at
slot 1; #70 at slot 78). The single v1 infeasibility (#74b at v1 Seq 4 ahead
of #61 at v1 Seq 45) is corrected by v2's relocation of #74b to slot 45.

End of constructive sequence audit.
