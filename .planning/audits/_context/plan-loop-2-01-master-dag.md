# Phase 3 Loop 2 — Master Dependency DAG (narrative)

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Build commit: `1ee872a4`.

This document describes the cross-domain dependency DAG for all 77 items in the
RiskHub architecture-cleanup planning effort (75 audit findings + 1 bonus +
2 splits: `#45a/#45b`, `#74a/#74b`).

**Source data**: `plan-loop-2-01-master-dag.yaml`. Every edge below is a
direct quote/paraphrase from the corresponding `plan-loop-1-NN-*.md` file
(cited inline). No edges were invented.

---

## 1. Top-line totals

| Metric | Value |
|---|---|
| Total nodes | **77** |
| Free leaves (no in-deps) | **57** |
| Terminals (no out-deps) | **54** |
| Directed prereq edges | **27** |
| Atomic-commit pairs | 3 (`#24/#51`, `#56/#61`, `#69/#70`) |
| Cycles detected | **none** |

The graph is a **forest of small chains and a few hubs** rather than a single
dense web. 74% of items (57/77) are free leaves and 70% (54/77) are terminals;
the overlap (items that are both leaf and terminal) covers the bulk of the
single-shot deletes. The longest causal chain has **4 nodes** along
`#37/#39 → #66 → #71`, with `#72` also feeding `#71` cross-domain.

---

## 2. Free leaves (count = 57)

These items have **no in-domain and no cross-domain prerequisites** — they can
land anytime in single-developer sequence. IDs:

```
1, 2, 3, 4, 5, 6, 7, 9, 10, 12, 13, 14, 15, 16, 17, 18, 20, 21, 22, 24,
25, 26, 27, 29, 31, 32, 33, 35, 36, 37, 39, 41, 42, 43, 44, 45a, 46, 47,
48, 50, 51, 52, 53, 54, 55, 56, 57, 58, 61, 62, 63, 64, 69, 72, 73, 74a, 75
```

Atomic-pair items appear as free-leaf pairs:
- `#24/#51` are both leaves (atomic same-commit; no directed edge between them).
- `#56/#61` are both leaves.
- `#69/#70` are both leaves at the cluster level, but inside the bundled
  commit `#69` is sequenced before `#70` (`plan-loop-1-05:225`).

`#22`'s `plan-loop-1-06-frontend.md:81` "none structurally; sequence after #4"
is convention only, no hard edge.

---

## 3. Terminals (count = 54)

These items **block nothing else** (`blocks: []`). IDs:

```
3, 4, 5, 6, 7, 11, 12, 13, 15, 16, 18, 20, 21, 23, 24, 25, 26, 29, 30, 31,
32, 33, 35, 36, 38, 40, 41, 42, 43, 44, 45b, 48, 50, 51, 52, 53, 54, 55,
56, 57, 58, 59, 60, 62, 63, 64, 65, 67, 68, 70, 71, 73, 74b, 75
```

Notable terminals: `#30` (issue barrel prune), `#60` (PrivilegeContext),
`#71` (session merge), `#74b` (ADR-007 amendment), `#40` (admin reorg),
`#65/#67/#68` (FE schema/hook/widget extractions). Atomic-pair members
`#24, #51, #56` and the trailing-position `#70` are terminals; their
upstream pair-mates (`#61` blocks `#74b`; `#69` blocks `#70`) are NOT
terminals.

---

## 4. Cycle check

Performed by walking each item's `in_domain_deps` + `cross_domain_deps`
transitive closure and confirming no node revisits itself. **Result: no
cycles.** The atomic-pair edges (`#24↔#51`, `#56↔#61`, `#69↔#70`) are
same-commit unions, not cyclic dependencies — they appear as a single node
at the commit-boundary level.

---

## 5. Heaviest hubs (≥2 edges)

No node hits the strict >3 threshold; the 3-incoming hubs are the heaviest.

**Incoming (convergence)**

| ID | Count | From | Role |
|---|---|---|---|
| `#30` | **3** | `#14, #27, #28` | issue `_shared/__init__` barrel prune; converges 3 prereqs |
| `#71` | **3** | `#47, #66, #72` | session-merge; needs policy extract + auth split + ADR-011 |
| `#66` | 2 | `#37, #39` | AuthContext split; needs both capability stubs collapsed |
| `#59` | 2 | `#17, #49` | monitoring docs consolidation; tail of monitoring chain |
| `#74b` | 2 | `#74a, #61` | ADR-007 amendment; needs census + graph_directory move |

**Outgoing (fan-out)**

| ID | Count | To | Role |
|---|---|---|---|
| `#46` | 2 | `#65, #67` | FE query-key factories; `#68` is soft-prereq via `#66` |
| `#39` | 2 | `#40, #66` | Capability builder; gates admin reorg + AuthContext |
| `#66` | 2 | `#68, #71` | AuthContext provider split fans out |
| `#17` | 2 | `#49, #59` | Monitoring shim deletion; head of monitoring chain |

`#30` and `#71` tie as the heaviest **convergence** hubs (3 incoming each).
No node has more than 2 strict outgoing edges; transitive edges (e.g.
`#8 → #30` via `#28`) are NOT counted.

---

## 6. Subgraph visuals (top 3)

### 6a. Issues chain — converges on `#30`

```
                                                ┌── #14 (S4.4 outbox-only)
                                                │   plan-loop-1-01:122
                                                │
   #2 (B-N1) ───► #8 (B-N2) ───► #28 (S4.3) ────┤
   plan:49        plan:79         plan:196      │
                                                │
                                                ├── #27 (S4.2 loading)
                                                │   plan-loop-1-01:159
                                                │
                                                └──► #30 (S4.10 prune)
                                                     plan:287
   Independent leaves (issue domain): #29, #41, #53
```

- `#2 → #8`: `plan-loop-1-01-issues.md:79` "#2 lands first if both are touched
  in close-together commits".
- `#8 → #28`: `plan-loop-1-01-issues.md:196` "#8 (must land first so
  update_plans.py already imports issue_link_department_ids".
- `#14 → #30`, `#27 → #30`, `#28 → #30`: `plan-loop-1-01-issues.md:287`
  "Strict prerequisites: #14 (notifications cleanup), #27 (loading dedup),
  #28 (source-mutation collapse) MUST land first".

### 6b. Approvals hub — `approval_scenario_policy.py` wave

```
   Free-order pool (any order):  #7,  #18,  #33,  #54,  #75

   Sequential wave (single hub file):

   #9 (S6.5 redirect) ───► #34 (S6.6 EXTRACT) ───► #60 (PrivilegeContext)
   plan:59                  plan:140                plan:218
   add 1 consumer           extract privilege tier  add Depends() facade
                            16 files / 22+ sites    backend-only
```

- `#9 → #34`: `plan-loop-1-03-approvals.md:140` "#9 lands first (it adds
  another consumer indirectly via the same hub file)".
- `#34 → #60`: `plan-loop-1-03-approvals.md:218` "#34 must land first.
  #54 is a soft (non-blocking) prerequisite".

### 6c. Vendor migration cluster — bundled Alembic window

```
   Standalone vendor items:  #13,  #16,  #17,  #31,  #57

   Bundled atomic pair (single migration revision):

   ┌──────────────────────────────────────────────────────┐
   │  ATOMIC COMMIT (plan:184, plan:222)                  │
   │                                                      │
   │   #69 (S5.2 AbstractVendorLink mixin)                │
   │   plan:184  ↔ "bundled with #70 (single migration    │
   │              window)"                                │
   │                                                      │
   │   #70 (S5.7 Drop Vendor.status)                      │
   │   plan:225  ↔ "depends on #69 mixin being applied    │
   │              first within the bundled commit"        │
   │                                                      │
   │   • Forward-only Alembic; downgrade()=NotImpl        │
   │   • Postgres lane CI required                        │
   │   • ADR-010 ledger entry                             │
   └──────────────────────────────────────────────────────┘
```

- `#69 ↔ #70`: `plan-loop-1-05-vendor-quarterly.md:184` "bundled with #70
  (single migration window for vendor* ADR-010 changes)" and `:222`
  "bundled with #69".
- Internal ordering inside the commit is enumerated at
  `plan-loop-1-05-vendor-quarterly.md:225`.

### Bonus: Auth-session chain (length 4 — longest in the DAG)

```
                            ┌── #37 (S7.10 governance mirror)
                            │   plan-loop-1-06:230
                            │
   #72 (ADR-011 doc-only) ──┤
   plan-loop-1-08:546       │
   ─────► gates #71         │
                            └── #39 (S8.7 capability stub)
                                plan-loop-1-06:256
                                gates #66 + #40
                                       │
                                       ▼
                                #66 (FE-N5 AuthContext split)
                                plan-loop-1-06:407
                                       │
                                       ▼
                                #71 (S7.8 session merge 8→4)
                                plan-loop-1-06:482
                                in-domain: #47, #66; cross-domain: #72
```

- `#37 + #39 → #66`: `plan-loop-1-06-frontend.md:407` "#37 + #39 are real
  prerequisites".
- `#47 + #66 + #72 → #71`: `plan-loop-1-06-frontend.md:482` "#47 (...),
  #66 (...), and ADR-011 (#72 — NOT in this domain) ... strict prerequisite".
- `#72 → #71` (cross-domain): `plan-loop-1-08-crosscut.md:546` "ADR-011
  must land BEFORE #66 (FE-N5 AuthContext) and #71 (S7.8 session merge)".
  Loop B explicit correction: ADR-011 is NOT a prereq for `#66`
  (`plan-loop-1-06-frontend.md:557`); only `#71` carries the hard edge.

### Bonus: FE query-key fan-out (heaviest FE out-hub)

```
                          ┌──► #65 (FE-N3 crud schema base)
                          │     plan-loop-1-06:380 — hard prereq
                          │
   #46 (FE-N1 query keys) ┼──► #67 (FE-N7 useResourcePanelQuery)
   plan-loop-1-06:284     │     plan-loop-1-06:437 — hard prereq
                          │
                          └─ ─► #68 (FE-N8 WidgetShell)
                                plan-loop-1-06:458 — soft "benefits from",
                                NOT a hard prereq; #68's hard prereq is #66
```

- `#46 → #65, #67`: hard edges from `plan-loop-1-06-frontend.md:284` "#46 is
  a structural prereq for #65 (shared CRUD capability schema) and #67
  (generic useResourcePanelQuery)".
- `#46 → #68`: not encoded as a hard edge; `:458` says "benefits from #46
  already landing" — convention only. `#68`'s only hard prereq is `#66`.

---

## 7. Cross-domain edges (count = 4 explicit)

Edges where prerequisite lives in a **different** Loop 1 plan:

| From | To | Source | Citation |
|---|---|---|---|
| `#71` | `#72` | crosscut → frontend reverse | `plan-loop-1-06-frontend.md:482` "ADR-011 (#72 — NOT in this domain)" |
| `#40` | `#39` | crosscut → frontend | `plan-loop-1-08-crosscut.md:21` "#39 (capability builder real implementation) must land first — not in this Loop 1 plan but referenced by other domain Loop 1" |
| `#74b` | `#61` | crosscut self-ref but listed | `plan-loop-1-08-crosscut.md:614` "#74b cross-links to #61" |
| `#66` | `#37, #39` | frontend cross-domain inside FE plan | `plan-loop-1-06-frontend.md:407` (in-domain inside FE Loop 1 because the plan placed them there) |

Note: items `#37` and `#39` are nominally backend but were placed inside the
frontend plan per `plan-loop-1-06-frontend.md:5` "#37 and #39 are nominally
backend items; they are kept here because they gate the frontend #66". For
graph purposes they are treated as in-domain to the frontend plan.

---

## 8. Atomic-commit clusters (3)

Pairs that MUST land in the **same commit** (not just same order):

| Cluster | Items | Source | Reason |
|---|---|---|---|
| A | `#24` ↔ `#51` | `plan-loop-1-04:57` "ATOMIC with #51"; `:171` "ATOMIC with #24" | both rewrite `kris/linked_vendors.py:3` |
| B | `#56` ↔ `#61` | `plan-loop-1-08:347` "PAIRED with #61"; `:432` "PAIRED with #56" | `graph_directory_service.py:8` import seam |
| C | `#69` ↔ `#70` | `plan-loop-1-05:184` "bundled with #70 (single migration window)" | shared Alembic forward-only revision |

---

## 9. Sequential strands by domain

**Issues** (length-4 longest chain): `#2 → #8 → #28 → #30`; with `#14, #27`
also feeding `#30`. `#41, #53, #29` independent.

**Risks**: `#1 → #19 → #11`; `#20` doc-only at end (soft sequence).

**Approvals**: `#9 → #34 → #60`; `#7, #18, #33, #54, #75` independent.

**KRIs**: `#3, #50, #52, #25, #26, #62, #73` standalone; `#24` ↔ `#51`
atomic pair.

**Vendor**: all standalone except atomic pair `#69` ↔ `#70`.

**Frontend**: `#22 → #23` (control-form); `#37 + #39 → #66 → {#68, #71}`;
`#46 → {#65, #67, #68}`; `#47 → #71`; `#66 → #71`; `#72 → #71` cross.

**Endpoints**: `#10 → #38`; `#17 → #49 → #59`; rest standalone.

**Crosscut**: `#45a → #45b`; `#74a → #74b`; `#56 ↔ #61` pair; `#39 → #40`
cross; `#72 → #71` cross.

---

## 10. Notes for downstream Phase 3 loops

1. **No cycles**, so a topological sort is well-defined. Phase 3 Loop 3
   (sequencing) can use this DAG as-is.
2. **3 atomic commits** mean the implementation phase has 77 nodes but
   ≤74 commit slots if the pairs collapse. (Not explicitly asked, but worth
   noting for Loop 3.)
3. **Hub `#30` is the convergence point** for the issues domain. Phase 4
   should land all three prereqs (`#14, #27, #28`) before opening `#30`.
4. **Hub `#46` is the fan-out point** for FE structural improvements.
   Phase 4 should land it early in any FE-heavy week.
5. **`#72` (ADR-011) gates `#71`** but not `#66` (Loop B-corrected at
   `plan-loop-1-06-frontend.md:557`). The orchestrator framing was wrong;
   this DAG reflects Loop B's correction.
6. **`#39` is doubly load-bearing**: it gates FE `#66` AND crosscut `#40`.
   The FE plan ranks it as Bucket E urgency.
7. **Vendor `#69+#70` is the only L-class bundle** — every other atomic
   pair is S/M.
8. **`#74` (ADR-007 amendment) was repaired into `#74a` (census, M-L) +
   `#74b` (ADR text)** per `plan-loop-1-08-crosscut.md:599-614`. `#74a`
   must classify all 31 underscore-prefixed packages before `#74b` can
   write the amendment.

---

End of Loop 2 master DAG narrative. Data file:
`plan-loop-2-01-master-dag.yaml`.
