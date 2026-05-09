# Phase 3 Loop 3 — Integration v2 (Master Sequence with Loop 2 A7 Corrections Applied)

**Build commit ref**: `1ee872a4` (`main`).
**Source v1**: `plan-loop-2-08-master-sequence.md` (77 items).
**Source corrections**: `plan-loop-2-07-hidden-prereqs.md` Missing-deps #A–#G.
**Output**: 79-item v2 master sequence with Loop 2 A7's 7 corrections integrated.

This document is the integration of Loop 2 A7's hidden cross-domain
prerequisites into the v1 master sequence. Two new items (#76 — auth/
commit migration; #77 — Vendor.status FE TS cleanup) are added per A7's
recommendations. All other corrections are sequencing edits, dependency
edges, and per-plan amendments.

---

## 1. Correction-by-correction integration

### Correction A — `users/summary.py` 3-way overlap

**Source**: `plan-loop-2-07-hidden-prereqs.md:506-535` (Missing-dep #A).

**Quote** (`:530-534`): "Three plans edit `users/summary.py`: #12
(Endpoints; narrows excepts), #37 (Frontend; removes `_can_view_governance`
mirror), #34 (Approvals; tier migration). Recommended order: #37 → #12 →
#34".

**Per-plan citations re-checked**:

- `plan-loop-1-03-approvals.md:151` — quote
  "endpoints/users/summary.py:24-26 — same".
- `plan-loop-1-06-frontend.md:237-241` (per `:526` of Loop 2 A7) — Frontend
  removes `_can_view_governance` (lines 45-50) and imports.
- `plan-loop-1-07-endpoints.md` Item #12 narrows blanket-except in same
  file at `:48,62`.

**v1 sequence** (current placement):

- #37 → Seq 14 (P1 wave)
- #12 → Seq 7 (P1 wave; ahead of #37)
- #34 → Seq 50 (P3 wave)

**Problem**: v1 has `#12 → #37 → ...→ #34`. Loop 2 A7 mandates
`#37 → #12 → #34`. v1 violates the recommended order.

**Edit to v2**:

1. **Promote #37** from Seq 14 to Seq 7 (still in P1 wave; P1 ordering
   intact).
2. **Demote #12** from Seq 7 to Seq 8 (still in P1 wave; just behind #37).
3. **#34 stays** in P3 wave (the cross-wave gap is acceptable; the
   ordering invariant is satisfied because #37 and #12 both land before
   #34).

**Updated dependency edges**:

- ADD soft edge `#37 → #12` (sequencing-only, not topological).
- ADD soft edge `#12 → #34` (sequencing-only, not topological).
- These are coordination soft-deps, not hard prereqs — each commit is
  mechanically isolated.

**Per-plan amendment**: amend `plan-loop-1-03-approvals.md` Item #34
cross-domain section to add the 3-way file overlap callout per Loop 2 A7
recommendation 3 (`:707-710`).

---

### Correction B — #74a "exactly 31 packages" assertion drift

**Source**: `plan-loop-2-07-hidden-prereqs.md:537-558` (Missing-dep #B).

**Quote** (`plan-loop-1-08-crosscut.md:632`): "assert exactly 31 packages
today".

**Quote** (`plan-loop-2-07-hidden-prereqs.md:556-558`): "Update wording
to '31 today, 32 after #61, locked via `_bounded_context_*.toml`
enumeration'".

**v1 sequence** (current placement):

- #74a → Seq 3 (ADR wave)
- #56 → Seq 44 (P3 wave, atomic with #61)
- #61 → Seq 45 (P3 wave, atomic with #56)
- #74b → Seq 4 (ADR wave) — depends on #74a + cross-#61

**Problem 1**: v1 puts #74b at Seq 4, but #74b's cross-dep on #61 means
it cannot land before Seq 45. v1 master sequence has this wrong.

**Verification**: re-reading `plan-loop-2-08-master-sequence.md:44`
"`#74b | ... | #74a, #61 (cross) | none`". The dependency is captured but
the SEQUENCE position is too early. This is a v1 inconsistency that v2
must fix.

**v1 sequence position** for #74b is Seq 4 in the table at line 44 — but
this is INFEASIBLE because #61 lands at Seq 45.

**Edit to v2** (combining #B with the v1 #74b sequencing fix):

1. **Keep #74a at Seq 3** (still ADR wave, lands first).
2. **Move #74b from Seq 4 to a slot AFTER #61** — new position Seq ~46
   (immediately after the #56+#61 atomic pair). This honors the
   `cross_domain_deps: ['61']` edge.
3. **Amend #74a's lock-test wording**: change "exactly 31 packages
   today" to "≥ 31 packages today; 32 after #61 lands; allowlist
   enumerates `_graph_directory` as planned-package".
4. **Pre-list `_graph_directory`** in `_bounded_context_adapters.toml`
   at #74a time, with a "post-#61" comment.

**Per-plan amendment**: amend `plan-loop-1-08-crosscut.md` Item #74a
TDD-shape and lock-test wording per Loop 2 A7 recommendation 1
(`:698-702`).

**Updated dependency edges** (no new hard edges; #74b's existing
`cross_domain_deps: ['61']` edge is preserved and the v2 sequence
position now honors it).

---

### Correction C — contract `.md:109` row touched by #55, #56, #61

**Source**: `plan-loop-2-07-hidden-prereqs.md:560-580` (Missing-dep #C).

**Quote** (`plan-loop-2-07-hidden-prereqs.md:573-574`): "the validator
must be tolerant of partial-removal states. Loop B did not stress-test
this".

**Quote** (`plan-loop-2-07-hidden-prereqs.md:578-580`): "ADD a cross-cut
sequencing note ... that explicitly states the 3 commits land in order
(#55 → #56+#61) and EACH commit re-runs the validator".

**v1 sequence** (current placement):

- #55 → Seq 41 (P2 wave)
- #56+#61 atomic → Seq 44/45 (P3 wave)

**Verification**: v1 already sequences `#55 → #56+#61` correctly
(Seq 41 then Seq 44/45). The integration is already in place — but the
"validator runs after EACH commit" invariant is not explicitly called
out.

**Edit to v2**: NO sequence change needed. Annotate the 3 sequence rows
(#55, #56, #61) with `Validator-reentry: required after each commit` so
the operator knows partial-removal states are expected.

**Per-plan amendment**: amend `plan-loop-1-08-crosscut.md` to add a
cross-cut sequencing note per Loop 2 A7 recommendation 1 (`:701-702`)
that explicitly states the validator-reentry invariant for the
`service_policy` row at `.md:109`.

**Updated dependency edges**: NONE (sequencing was already correct;
this is a documentation hardening only).

---

### Correction D — ADR-011 (#72) needs auth/ commit migration follow-up

**Source**: `plan-loop-2-07-hidden-prereqs.md:582-603` (Missing-dep #D).

**Quote** (`plan-loop-2-07-hidden-prereqs.md:597-600`): "ADD a NEW item
(suggested numbering #76 ...) to: 'Migrate 8 auth-flow `db.commit` sites
to service-owned transactions before 2026-09-01'".

**v1 sequence**: NO item exists for this work.

**Edit to v2**: ADD new item **#76** — "Migrate 8 auth-flow db.commit
sites to service-owned transactions" (P3, M effort).

**Item #76 shape**:

- **ID**: #76
- **Audit-tag**: ADR-011 (follow-up; deadline `2026-09-01`)
- **Domain**: crosscut (touches `auth/` endpoint family but is
  service-owned-tx work, which is cross-cutting)
- **Title**: Migrate 8 auth-flow `db.commit` sites to service-owned
  transactions
- **Effort**: M (8h — 8 sites × ~30 min each + integration tests)
- **Priority**: P3 (must complete before `2026-09-01` per
  `_endpoint_commit_allowlist.toml`)
- **Pre-req**: #72 (ADR-011 must ratify the rule first)
- **Atomic with**: none
- **Doc/lock burden**: med (`_endpoint_commit_allowlist.toml` entries
  removed as each migration lands; capability contract unchanged)
- **Validator?**: no

**The 8 sites** (per `verify-loop-b-08-crosscut.md:179` cited at
Loop 2 A7 `:589-591`):

1. `auth/refresh.py:177`
2. `auth/logout.py:101`
3. `auth/logout.py:132`
4. `auth/sso.py:170`
5. `auth/_sso_helpers.py:48`
6. `auth/password.py:128`
7. `auth/password.py:161`
8. `auth/demo.py:67`

**Updated dependency edges**:

- ADD `#72 → #76` (hard edge — ADR-011 must ratify the rule first).
- #76 has no outgoing edges (terminal).

**v2 placement**: late P3 wave, before P4. New Seq position: roughly
Seq ~70 (after the P3 medium tier, before the P4 deferred tier).

**Per-plan amendment**: amend `plan-loop-1-08-crosscut.md` to add Item
#76 explicitly per Loop 2 A7 recommendation 2 (`:703-705`).

---

### Correction E — #35 → #66 soft prereq (avoids 18-test-file double-rewrite)

**Source**: `plan-loop-2-07-hidden-prereqs.md:606-622` (Missing-dep #E).

**Quote** (`plan-loop-1-06-frontend.md:407`): "**#35 (usePermissions
removal) is *not* a strict prereq but should land first to avoid churn
in 18 mock files**".

**Quote** (`plan-loop-2-07-hidden-prereqs.md:618-622`): "ADD `#35` as a
SOFT in-domain prereq on #66 in the master DAG ... so the recommended
sequential order is unambiguous".

**v1 sequence** (current placement):

- #35 → Seq 34 (P2 wave)
- #66 → Seq 72 (P4 wave)

**Verification**: v1 already sequences `#35 → #66` (Seq 34 then Seq 72).
The integration is already implicit. The gap is only that the master
DAG `in_domain_deps` for #66 omits #35.

**Edit to v2**: NO sequence change needed. Annotate the master DAG entry
for #66 to read `in_domain_deps: ['37', '39']  # soft: ['35']` so the
soft edge is explicit.

**Per-plan amendment**: amend `plan-loop-1-06-frontend.md` Item #66 to
note #35 as a recommended-precedence soft prereq per Loop 2 A7
recommendation 4 (`:712-713`).

**Updated dependency edges**:

- ADD soft edge `#35 → #66` (sequencing-only, not topological;
  recommended to avoid double-rewrite of 18 mock files).

---

### Correction F — Vendor.status FE TS cleanup (new item #77)

**Source**: `plan-loop-2-07-hidden-prereqs.md:624-643` (Missing-dep #F).

**Quote** (`plan-loop-1-05-vendor-quarterly.md:302`): "**Frontend impact
(out of scope here, flag for Loop 6)**: dropping `Vendor.status` from
API response payloads (#70) ... The frontend's `LinkedVendor` /
`Vendor` TypeScript types may carry `status?: string` and need pruning
under Loop 6".

**Quote** (`plan-loop-2-07-hidden-prereqs.md:639-643`): "ADD a follow-up
item OR amend `plan-loop-1-06-frontend.md` with a small task: 'After
#70 lands, prune `status?: string` from `LinkedVendor` / `Vendor` TS
types and Zod schemas'".

**Verification of gap**: `grep` over `plan-loop-1-06-frontend.md` for
`Vendor.status` returns 0 hits — confirmed Loop 2 A7's gap claim.

**v1 sequence**: NO item exists for this work.

**Edit to v2**: ADD new item **#77** — "Prune `Vendor.status` from FE TS
types and Zod schemas after #70 lands" (P3, S effort).

**Item #77 shape**:

- **ID**: #77
- **Audit-tag**: S5.7-FE (follow-up to #70)
- **Domain**: frontend
- **Title**: Prune `Vendor.status` from FE TS types and Zod schemas
- **Effort**: S (4h — 2 type files + Zod schemas + grep verification)
- **Priority**: P3
- **Pre-req**: #70 (must drop `Vendor.status` from API first)
- **Atomic with**: none
- **Doc/lock burden**: low (TS-only; no contract validator change)
- **Validator?**: no

**Files** (inferred from Vendor plan `:302` + Loop 6 callout):

- `frontend/src/types/vendor.ts` (or wherever `LinkedVendor` /
  `Vendor` are declared) — drop `status?: string`.
- `frontend/src/services/api/schemas/*.ts` — drop matching Zod
  field if present.
- Run TS compiler + Zod schema test to confirm no consumer breaks.

**Updated dependency edges**:

- ADD `#70 → #77` (hard edge — FE TS cleanup must follow API drop).
- #77 has no outgoing edges (terminal).

**v2 placement**: AFTER #70 (which is at v1 Seq 77 — last slot). New
Seq position: Seq 79 (final slot in v2).

**Per-plan amendment**: amend `plan-loop-1-06-frontend.md` to add Item
#77 explicitly per Loop 2 A7 recommendation 5 (`:715-717`).

---

### Correction G — #38 BatchSendRiskFilters rename FE Zod mirror

**Source**: `plan-loop-2-07-hidden-prereqs.md:645-662` (Missing-dep #G).

**Quote** (`plan-loop-1-07-endpoints.md:299-301`): "rename generic
`RiskFilters` → `BatchSendRiskFilters` to avoid collision".

**Quote** (`plan-loop-1-07-endpoints.md:794-797`): "to verify after
#38: `frontend/src/services/api/schemas/riskHub.ts:147`
(`batchSendQuestionnairesResponseSchema`)".

**Quote** (`plan-loop-2-07-hidden-prereqs.md:657-662`): "rename
`RiskFilters` → `BatchSendRiskFilters` in same commit as
`frontend/src/services/api/schemas/riskHub.ts:147` if any TS type
references the old name".

**v1 sequence** (current placement):

- #38 → Seq 56 (P2 wave)

**Edit to v2**: NO new item. AMEND #38's recipe to include the FE Zod
mirror update in the SAME commit. The Endpoints plan at `:794-797`
already lists "verify after #38" — Loop 2 A7's correction is to upgrade
this from "verify" to "update in same commit".

**Per-plan amendment**: amend `plan-loop-1-07-endpoints.md` Item #38
Cross-domain prerequisites to bundle the FE TS rename per Loop 2 A7
recommendation 6 (`:718-720`).

**Updated dependency edges**: NONE (the FE update is bundled in #38's
commit; no new node added).

---

## 2. v2 Master sequence (compact, all 79 items)

Legend: `eff` = effort (S/M/L/XL); `pri` = priority (P1/P2/P3/P4).
v1→v2 column shows the previous slot; `=` means unchanged. Bold = item
moved or newly added.

| v2 Seq | ID | v1 Seq | Title (short) | Eff | Pri | Reason for slot |
|---:|---|---:|---|---|---|---|
| 1 | #72 | 1 | ADR-011 (Auth Scheme) | M | P1 | ADR-first; gates #71, #76 |
| 2 | #73 | 2 | ADR-012 (KRI period algebra) | M | P2 | ADR-first; gates kri cleanups |
| 3 | #74a | 3 | ADR-007 census (CENSUS phase) | M | P3 | ADR-first; lock-test wording amended (≥ 31, not exactly 31) |
| 4 | #10 | 5 | Keep `riskhub_questionnaires.py` (Reject) | S | P1 | doc-only verify; gates #38 |
| 5 | #57 | 6 | Keep `quarterly_comparison_service.py` (Reject) | S | P2 | doc-only verify |
| **6** | **#37** | **14** | Replace `_can_view_governance` mirror | S | P1 | **MOVED EARLIER** (per #A: #37 → #12 → #34) |
| **7** | **#12** | **7** | Narrow blanket-except in `users/summary.py` | S | P1 | **REORDERED** (now after #37 per #A) |
| 8 | #13 | 8 | Delete `vendor_link_helpers.py` shim | S | P1 | unchanged |
| 9 | #1 | 9 | Drop `validate_risk_type` re-export | S | P2 | chain head |
| 10 | #19 | 10 | Risk-type validation onto service policy | S | P1 | after #1 |
| 11 | #11 | 11 | `risk.process` → `risk.name` truth-in-naming | S | P1 | after #19 |
| 12 | #14 | 12 | Issues outbox-only notification cleanup | M | P1 | gates #30 |
| 13 | #15 | 13 | Add `access_user` capability surface | M | P1 | capability catalog |
| 14 | #2 | 15 | Drop 4 underscore aliases in `source_validation.py` | S | P2 | chain head (gates #8) |
| 15 | #3 | 16 | Delete `kriFormWorkflow.ts` | S | P2 | dead code |
| 16 | #4 | 17 | Delete `controlFormWorkflow.ts` | S | P2 | dead code |
| 17 | #5 | 18 | Delete `orphanResolutionPresentation.ts` | S | P2 | dead code |
| 18 | #6 | 19 | Delete `notifications/resourcePath.ts` | S | P2 | dead code |
| 19 | #7 | 20 | Delete `_get_approval_department_id` shim | S | P2 | dead code |
| 20 | #41 | 21 | Delete bidirectional underscore aliases | S | P2 | dead code |
| 21 | #50 | 22 | Delete `_kri_history/submission.py` wrapper | S | P2 | dead code |
| 22 | #52 | 23 | Delete `_kri_history/correction_plans.py` | S | P2 | dead code |
| 23 | #53 | 24 | Drop `IssueWorkflowService` facade | S | P2 | dead code |
| 24 | #54 | 25 | Inline `_approval_queue/lifecycle.py` | S | P2 | dead code |
| 25 | #75 | 26 | Delete-and-consolidate `_auto_reject_kri_approval` | S | P2 | dead code |
| 26 | #18 | 27 | Repoint-and-delete `_build_approval_read` | S | P2 | dead code |
| 27 | #20 | 28 | Risk ID generation co-location | S | P2 | doc-only |
| 28 | #21 | 29 | Collapse Control-Risk link loader duplicates | S | P2 | small refactor |
| 29 | #25 | 30 | Extract KRI department-scope helper | S | P2 | small refactor |
| 30 | #26 | 31 | Delete `KRIForm.tsx` shim + ESLint pin | S | P2 | dead code |
| 31 | #29 | 32 | Source-type vocabulary canonicalization | S | P2 | small refactor |
| 32 | #33 | 33 | Unify FE approval-queued banners | S | P2 | small refactor |
| 33 | #35 | 34 | Delete `usePermissions` hook | S | P2 | gates #66 (soft) per #E |
| 34 | #36 | 35 | Refactor `BusinessRouteGuards.tsx` | S | P2 | small refactor |
| 35 | #48 | 36 | Merge `getErrorMessageKey.ts` + `errorCodeMap.ts` | S | P2 | small refactor |
| 36 | #64 | 37 | Extract QueryClient defaults from `App.tsx` | S | P2 | small refactor |
| 37 | #47 | 38 | Extract session-refresh retry policy | S | P3 | gates #71 |
| 38 | #22 | 39 | Delete `ControlForm.tsx` 1-line shim | S | P2 | dead code |
| 39 | #23 | 40 | Inline `controlFormUtils` helpers | S | P2 | after #22 |
| 40 | #55 | 41 | Delete `access_user_service.py` facade | S | P2 | validator-reentry per #C |
| 41 | #24 | 42 | Delete-and-repoint `kris/linked_vendors.py` | S | P2 | atomic with #51 |
| 42 | #51 | 43 | Delete `_kri_history/value_application.py` shim | S | P2 | atomic with #24 |
| 43 | #56 | 44 | Delete `directory_identity_service.py` shim | S | P3 | atomic with #61 (validator-reentry per #C) |
| 44 | #61 | 45 | Move `graph_directory_*` → `_graph_directory/` | M | P3 | atomic with #56 (validator-reentry per #C) |
| **45** | **#74b** | **4** | ADR-007 amendment text | M | P3 | **MOVED LATER** (cross-dep on #61 per #B; v1 had infeasible Seq 4) |
| 46 | #17 | 46 | Inline `_monitoring_response` endpoint shim | S | P2 | gates #49 |
| 47 | #49 | 47 | Inline `_control_execution/monitoring.py` | S | P2 | after #17 |
| 48 | #59 | 48 | Consolidate `_monitoring_*` packages | M | P3 | after #17, #49 |
| 49 | #9 | 49 | Delete-and-redirect duplicate `can_user_view_approval_resource` | S | P2 | gates #34 |
| 50 | #34 | 50 | Extract `resolve_approval_privilege_tier` helper | M | P3 | after #9 (lands AFTER #37 + #12 per #A) |
| 51 | #27 | 51 | Issue-loading duplicate deletion | M | P2 | gates #30 |
| 52 | #8 | 52 | Source-validation split + canonical link helpers | M | P2 | after #2 |
| 53 | #28 | 53 | Issue source-mutation triplicate collapse | M | P2 | after #8 |
| 54 | #30 | 54 | `issues/_shared/__init__.py` underscore prune | M | P2 | after #14, #27, #28 |
| 55 | #16 | 55 | Remove reports legacy-excel tombstones (410s) | M | P2 | medium |
| 56 | #38 | 56 | Move 8 inline endpoint Pydantic models to schemas | M | P2 | after #10; FE Zod mirror bundled per #G |
| 57 | #31 | 57 | Extract vendor reporting row formatters | M | P3 | medium |
| 58 | #32 | 58 | Extract generic vendor linked-entity tab | M | P3 | medium |
| 59 | #43 | 59 | Audit adapter-emitter helper (additive) | M | P3 | medium |
| 60 | #44 | 60 | Centralize guarded path-prefix registry | M | P3 | medium |
| 61 | #42 | 61 | `ActorPayloadModel` shared base | S | P3 | small refactor |
| 62 | #58 | 62 | Delete `OrphanedItemService` facade | M | P3 | medium |
| 63 | #63 | 63 | Instrument outbox dispatch with `SchedulerJobRun` | M | P3 | medium |
| 64 | #46 | 64 | Promote resource query-key factories | L | P3 | gates #65, #67, #68 |
| 65 | #65 | 65 | Extract `crudCapabilitySchema` shared Zod base | M | P3 | after #46 |
| 66 | #67 | 66 | Extract generic `useResourcePanelQuery` | M | P3 | after #46 |
| 67 | #39 | 67 | Replace `admin/capabilities.py` static stub | M | P3 | gates #40, #66 |
| 68 | #40 | 68 | Re-cluster admin sub-routers | M | P3 | after #39 |
| 69 | #62 | 69 | Relocate `kri_vendor_assignment.py` | M | P3 | medium |
| **70** | **#76** | **(NEW)** | **Migrate 8 auth-flow `db.commit` sites** | **M** | **P3** | **NEW per #D** (after #72) |
| 71 | #45a | 70 | Ownership prerequisite characterization tests | M | P4 | gates #45b |
| 72 | #45b | 71 | Ownership resolver factory | M | P4 | after #45a |
| 73 | #66 | 72 | Split `AuthContext.tsx` into providers | M | P4 | after #37, #39 (soft after #35 per #E) |
| 74 | #68 | 73 | Introduce `WidgetShell` + scoped query selector | M | P4 | after #46, #66 |
| 75 | #60 | 74 | `PrivilegeContext` + `Depends(get_privilege_context)` | M | P4 | after #34, #51 |
| 76 | #71 | 75 | Merge `services/session/` 8 files → 4 | M | P4 | after #47, #66, #72 |
| 77 | #69 | 76 | Introduce `AbstractVendorLink` mixin (Phase 1) | L | P4 | atomic with #70 |
| 78 | #70 | 77 | Drop `Vendor.status` enum | M | P4 | atomic with #69 |
| **79** | **#77** | **(NEW)** | **Prune `Vendor.status` from FE TS + Zod** | **S** | **P3** | **NEW per #F** (after #70) |

---

## 3. Items that moved (v1 → v2)

### Items moved EARLIER

| ID | v1 Seq | v2 Seq | Reason |
|---|---:|---:|---|
| #37 | 14 | 6 | Per Correction A — must precede #12 in `users/summary.py` 3-way overlap |

### Items moved LATER

| ID | v1 Seq | v2 Seq | Reason |
|---|---:|---:|---|
| #74b | 4 | 45 | Per Correction B — v1 had it at Seq 4 but `cross_domain_deps: ['61']` (which is at Seq 44) made that infeasible. Loop 2 A7 noted this implicitly via the 31-package drift. v2 honors the cross-edge. |

### Items REORDERED within same wave

| ID | v1 Seq | v2 Seq | Reason |
|---|---:|---:|---|
| #12 | 7 | 7 | Position shifts down by one to accommodate #37 promoted ahead of it |

### NEW items added

| ID | v2 Seq | Reason |
|---|---:|---|
| #76 | 70 | Per Correction D — auth/ commit migration follow-up to ADR-011 |
| #77 | 79 | Per Correction F — Vendor.status FE TS cleanup follow-up to #70 |

### Items renumbered (cascade from new items + reorders)

The cascade from inserting #74b at Seq 45 (was Seq 4) and adding #76 +
#77 shifts every item after Seq 4 by +1, then items after Seq 45 by
another +0 (since #74b moved INTO Seq 45 not added on top), then items
after Seq 70 by +1 (for #76), and item Seq 79 is new (#77) so no shift
needed.

Net effect:

- Seq 1–3: unchanged.
- v1 Seq 4 (#74b) → moved to v2 Seq 45.
- v1 Seq 5–13: shift −1 (Seq 4 vacated by #74b move).
- v1 Seq 14 (#37): jumps to Seq 6 (per Correction A).
- v1 Seq 5–13 mapping: #10 v1=5 → v2=4; #57 v1=6 → v2=5; #12 v1=7 →
  v2=7 (kept after #37 per A); #13 v1=8 → v2=8; #1 v1=9 → v2=9; #19
  v1=10 → v2=10; #11 v1=11 → v2=11; #14 v1=12 → v2=12; #15 v1=13 →
  v2=13; — net: Seq 4–5 shifted up by one, Seq 6 is now #37.
- Items Seq 15–44 (v1): shift −1 in v2 (Seq 14–43) because v1 Seq 4
  vacated.
- v1 Seq 45 (#61): now v2 Seq 44.
- v2 Seq 45: new home for #74b (was v1 Seq 4).
- Items Seq 46–69 (v1): unchanged in v2 (Seq 46–69).
- v2 Seq 70: new #76.
- Items v1 Seq 70–77: shift +1 in v2 (Seq 71–78).
- v2 Seq 79: new #77.

---

## 4. New atomic clusters

**No new atomic clusters introduced.** Existing clusters preserved:

- `#24 + #51` (KRI atomic) — v2 Seq 41 + 42.
- `#56 + #61` (graph_directory atomic) — v2 Seq 43 + 44.
- `#69 + #70` (Vendor migration window atomic) — v2 Seq 77 + 78.

**Sequencing-only soft clusters** (per Loop 2 A7's coordination
recommendations):

- `#37 → #12 → #34` (users/summary.py 3-way) per Correction A.
- `#55 → #56+#61` (validator-reentry per Correction C; already
  satisfied in v1, hardened in v2 docs).
- `#35 → #66` (avoid 18-mock-file double-rewrite) per Correction E.

---

## 5. Updated dependency edges (full list of NEW edges in v2)

### Hard topological edges added

1. **`#72 → #76`** — ADR-011 must ratify the rule before the auth/
   migration lands. Per Correction D.
2. **`#70 → #77`** — Vendor.status must drop from API before FE TS
   cleanup. Per Correction F.

### Soft sequencing edges added (master DAG annotations only)

3. **`#37 → #12`** (soft, per Correction A) — coordination on
   `users/summary.py`.
4. **`#12 → #34`** (soft, per Correction A) — coordination on
   `users/summary.py`.
5. **`#35 → #66`** (soft, per Correction E) — avoid double-rewrite of
   18 mock files.

### No edges removed

Loop 2 A7 did not request edge removal. The pre-existing
`#74b → #61` cross-edge is preserved (now correctly honored by v2's
sequence position).

### Edge updates (annotations to existing edges)

- Master DAG entry for #66: `in_domain_deps: ['37', '39']  # soft:
  ['35']` (per Correction E annotation).
- Master DAG entry for #74a: lock-test wording in #74a's TDD-shape
  amended from "exactly 31 packages today" to "≥ 31; 32 after #61
  lands" (per Correction B annotation).
- Master DAG entry for #38: cross_domain notes now bundle FE Zod
  mirror update (per Correction G annotation).
- Master DAG entries for #55, #56, #61: annotated with
  `Validator-reentry: required after each commit` (per Correction C).

---

## 6. Critical-path update

**v1 critical path** (longest single linear chain): `#2 → #8 → #28 →
#30` (4 nodes).

**v2 critical path**: UNCHANGED. The new edges (`#72 → #76`,
`#70 → #77`) are 2-node chains and do not extend the longest path.
The longest single linear chain remains:

```
#2 → #8 → #28 → #30  (4 nodes)
```

**Convergence at #71** (v2 Seq 76): #71 still has 4 distinct prereqs
(`{#47, #66, #72}` plus #66's prereqs `{#37, #39}`). No change.

**New convergence point #76** (v2 Seq 70): single prereq #72; trivial
chain.

**New convergence point #77** (v2 Seq 79): single prereq #70; trivial
chain.

---

## 7. Per-plan amendments to apply (consolidated checklist)

Per Loop 2 A7 recommendations 1–7 (`:696-725`):

1. **`plan-loop-1-08-crosscut.md` Item #74a** — change "exactly 31
   packages today" wording to "≥ 31 today; 32 after #61 lands".
   Pre-list `_graph_directory` in `_bounded_context_adapters.toml`
   straw with "post-#61" comment.

2. **`plan-loop-1-08-crosscut.md`** — add new Item #76 (auth/ commit
   migration). Hard prereq: #72. Cite the 8 sites from
   `verify-loop-b-08-crosscut.md:179`.

3. **`plan-loop-1-03-approvals.md` Item #34** — cross-domain section
   adds 3-way file overlap callout: "Three plans edit `users/summary.py`:
   #12, #37, #34. Recommended order: #37 → #12 → #34".

4. **`plan-loop-1-06-frontend.md` Item #66** — note #35 as
   recommended-precedence soft prereq (not hard); avoids 18-mock-file
   double-rewrite per Loop 2 A7 `:611-622`.

5. **`plan-loop-1-06-frontend.md`** — add new Item #77 (Vendor.status
   FE TS cleanup). Hard prereq: #70. Touches FE TS types + Zod schemas.

6. **`plan-loop-1-07-endpoints.md` Item #38** — Cross-domain
   prerequisites bundles FE TS rename: "rename `RiskFilters` →
   `BatchSendRiskFilters` in same commit as
   `frontend/src/services/api/schemas/riskHub.ts:147` if any TS type
   references the old name". Upgrade existing `:794-797`
   "verify after" to "update in same commit".

7. **`plan-loop-1-08-crosscut.md` Item #72 prose at `:546`** — drop
   "#66" from the "ADR-011 must land BEFORE..." sentence. (Loop 2 A7
   side-finding; included for tidiness — `:170-172` of A7.)

8. **`plan-loop-1-08-crosscut.md` Items #55, #56, #61** — add
   validator-reentry annotation: "Each commit re-runs
   `python scripts/security/validate_authz_capability_contract.py`;
   the validator must tolerate partial-removal states of the
   `service_policy` row at `.md:109`".

---

## 8. New questions that emerge (open)

1. **#76 effort estimate** — M (8h) is a Loop 3 estimate. The 8
   auth/ sites may have transactional coupling that takes longer
   than 30 min/site to migrate. Recommend Loop 4 spike to confirm
   M vs L sizing.

2. **#77 priority** — Loop 2 A7 did not specify priority for the
   FE TS cleanup. Loop 3 assigns P3 (since #70 itself is P4
   Defer). If migration window is accelerated, #77 priority should
   move with #70.

3. **#74a `_graph_directory` straw allowlist** — pre-listing
   `_graph_directory` in `_bounded_context_adapters.toml` BEFORE
   #61 creates the package means the lock-test must accept either
   "package exists" OR "package planned". Loop 4 should design
   the assertion shape (e.g., glob+TOML disjunction).

4. **Validator partial-removal tolerance** (#55 → #56+#61
   sequence, Correction C) — the existing validator script may
   already be tolerant (it parses `service_policy` as a multi-token
   blob). Loop 4 should run a dry-run validate after each of the
   3 hypothetical commits to confirm tolerance before the work
   lands.

5. **#37 → #12 → #34 ordering enforcement** — these are soft
   (sequencing-only) edges. Should the master DAG add an
   explicit "soft_in_domain_deps" / "soft_cross_domain_deps"
   field to capture them? Loop 4 to decide schema extension.

6. **ADR-011 sunset deadline `2026-09-01`** — at current
   v2 sequencing, #76 lands in P3 wave (Seq 70). Rough calendar
   estimate (12–14 weeks for full sequence at single-dev pace)
   means #76 lands ~weeks 8–10. That's ~2027-Q1 calendar
   placement (assuming start in mid-2026). The 2026-09-01
   deadline may already be missed. Loop 4 must confirm calendar
   feasibility OR escalate #76 priority to P2 to land before
   2026-09-01.

7. **#77 Zod schema test pattern** — the Frontend domain's
   capability schema test pattern (per `_capabilities/...` test
   pattern referenced at `plan-loop-2-07-hidden-prereqs.md:638`)
   needs to be applied to `LinkedVendor`/`Vendor` schemas. Loop 4
   to confirm the test scaffold is in place.

---

## 9. Validator/CI gate inventory after v2

`scripts/security/validate_authz_capability_contract.py` continues to
run on every commit that touches the capability contract. v2 commits
that gate-on it:

| v2 Seq | ID | Note |
|---:|---|---|
| 8 | #13 | vendor_link_helpers shim drop |
| 13 | #15 | access_user capability surface add |
| 6 | #37 | _can_view_governance mirror swap |
| 40 | #55 | access_user_service drop (validator-reentry start) |
| 41 | #24 | linked_vendors barrel atomic |
| 42 | #51 | value_application atomic |
| 43 | #56 | directory_identity_service drop (validator-reentry) |
| 44 | #61 | graph_directory move (validator-reentry final) |
| 67 | #39 | admin builder real impl |

Validator gate count: **9 commits**. v1 had the same 9 commits — no
change. Validator-reentry annotation strengthens the operator's
expectation that partial-removal states of `service_policy` at
`.md:109` are valid intermediate states across the
`#55 → #56 → #61` sequence.

---

## 10. v2 sequence diff summary (for reviewers)

```
v1 (77 items) → v2 (79 items)
├─ +2 new items (#76, #77)
├─ 1 item moved earlier (#37: Seq 14 → Seq 6)
├─ 1 item moved later  (#74b: Seq 4 → Seq 45)
├─ 5 new dependency edges (2 hard, 3 soft)
├─ 7 per-plan amendments to apply
└─ 0 atomic clusters added
```

Critical path unchanged: `#2 → #8 → #28 → #30` (4 nodes).

---

End of Phase 3 Loop 3 integration v2.
