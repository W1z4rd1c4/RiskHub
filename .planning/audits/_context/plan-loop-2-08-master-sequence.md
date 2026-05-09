# Phase 3 Loop 2 — Master Sequential Execution List (all 77 items)

**Build commit ref**: `1ee872a4` (`main`)
**Source DAG**: `plan-loop-2-01-master-dag.yaml`
**Source priorities**: `developer answer.md` summary table (P1/P2/P3/P4)
**Source efforts**: per Loop 1 plans (`plan-loop-1-01..08-*.md`)

## Constraints recap

- **Single sequential developer**, TDD red→green, doc/lock-only Reject items, Defers planned (not skipped).
- **Sequencing rules** (priority order):
  1. Dependency topology (no item before any prereq).
  2. Priority within tier: P1 > P2 > P3 > P4 (per dev answer).
  3. Effort within tier: S < M < L < XL.
  4. Atomic clusters land contiguously: **#24+#51, #69+#70, #56+#61** (also note #66 splits FE-N5 chain; #45a→#45b prerequisite-not-atomic).
  5. Hub waves stay additive: Approvals **#9 → #34 → #60**; Frontend **#46 → {#65, #67, #68}**; Endpoints **#17 → #49 → #59**.
  6. ADR drafts (#72, #73, #74a, #74b) land EARLY to unlock dependents.
  7. Migration window (#69+#70) lands LATE to avoid blocking other work.

## Ordering rationale (high level)

1. **ADRs first** (#72 P1, #73 P2 ADR-012, #74a→#74b P3 ADR-007 amendment) — these are document-only and unblock #66/#68/#71 (FE), #61 (graph_directory move), and KRI cleanups.
2. **P1 quick-wins next** — #10 (Reject/keep, doc-only verify), #12, #13 (S size, P1) — to lock contract/docs early.
3. **P1 chain #1 → #19 → #11** — risk-type validation unification then truth-in-naming bug fix.
4. **P1 #14, #15, #37** — outbox cleanup, capability catalog gap, governance helper.
5. **P2 quick-wins (free-leaf, S)** — dead-code deletes (#3, #4, #5, #6, #7, #18, #20, #21, #25, #26, #29, #33, #41, #50, #52, #53, #54, #55, #57, #75, #2 isolated, #35, #36, #48, #64, #47, atomic pair #24+#51, atomic pair #56+#61).
6. **P2 chain build-up** — #2→#8 (issues source-validation pre-req), then #14/#27/#28 → #30 (issue _shared barrel prune), monitoring chain #17→#49→#59, schemas pair #10→#38, frontend hub #46→#65/#67, approvals hub #9→#34, ControlForm pair #22→#23.
7. **P2 medium** — #14 done already in P1; #16 reports, #31 vendor reporting, #32 vendor tabs, #38 schemas eviction, #43, #44, #58, #63 instrumentation.
8. **P3 items** — #34 escalation, #39 admin builder, #40 admin reorg (after #39), #42 actor base, #46 query-keys, #56+#61 atomic, #59, #61, #65, #67, #74a/b ADR census/text.
9. **P4 deferred** — #45a→#45b, #60 PrivilegeContext, #62 KRI vendor assignment, #66 AuthContext, #68 WidgetShell, #71 session merge.
10. **Migration window LAST** — #69+#70 atomic (P3+P4 — the dev answer marks both as Defer P4; #69 in DAG is P3, #70 is P3; for safety treat as P4 deferred to a single migration window).

---

## Master sequence table

Legend: Eff = effort (S=4h, M=8h, L=20h, XL=40h). Pri = developer-answer priority. Doc/lock burden = "low" (file/code only), "med" (TOML/lock + code), "high" (capability contract + tests + docs). Validator? = "yes" if `scripts/security/validate_authz_capability_contract.py` is part of the commit gate.

| Seq | ID | Audit-tag | Domain | Title | Effort | Priority | Pre-req | Atomic with | Doc/lock burden | Validator? |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | #72 | S7.9 (ADR-011) | crosscut | Author ADR-011 (Auth Scheme and Session Model) | M | P1 | none | none | high (new ADR + xref to ADR-002 allowlist) | no |
| 2 | #73 | S3.12 (ADR-012) | kris | Author ADR-012 (KRI time-series period algebra) | M | P2 | none | none | high (new ADR + KRI state allowlist precedent) | no |
| 3 | #74a | ADR-007 (a) | crosscut | ADR-007 amendment — 31-package census (CENSUS phase) | M | P3 | none | none | med (census TOMLs draft) | no |
| 4 | #74b | ADR-007 (b) | crosscut | ADR-007 amendment — ADR text (after census) | M | P3 | #74a, #61 (cross) | none | high (amend ADR-007, 4 new TOMLs) | no |
| 5 | #10 | S8.5 | endpoints | Keep `riskhub_questionnaires.py` module presence (Reject; document-only) | S | P1 | none | none | low (audit/AGENTS xref) | no |
| 6 | #57 | S8.1 | vendor | Keep `quarterly_comparison_service.py` facade (Reject; document-only) | S | P2 | none | none | low (architecture lock note) | no |
| 7 | #12 | D-N3 | endpoints | Narrow blanket-except in `users/summary.py` | S | P1 | none | none | low | no |
| 8 | #13 | S5.1/C-N2 | vendor | Delete `vendor_link_helpers.py` shim + sync capability contract | S | P1 | none | none | high (md+json contract citations) | yes |
| 9 | #1 | A-N1 | risks | Drop `validate_risk_type` re-export from risks/crud `__all__` | S | P2 | none | none | low | no |
| 10 | #19 | S1.4 | risks | Consolidate risk-type validation onto service policy | S | P1 | #1 | none | low (test for HTTP 400 parity) | no |
| 11 | #11 | S2.7 | risks | Control execution `risk.process` → `risk.name` truth-in-naming fix | S | P1 | #19 | none | low (test regression) | no |
| 12 | #14 | S4.4 | issues | Issues outbox-only notification cleanup | M | P1 | none | none | med (lock + outbox tests) | no |
| 13 | #15 | D-N2 | endpoints | Add `access_user` capability surface to catalog | M | P1 | none | none | high (capability-catalog.json + validator) | yes |
| 14 | #37 | S7.10 | frontend (BE in fact) | Replace `_can_view_governance` mirror with `build_me_capabilities` | S | P1 | none | none | high (capability contract + users-summary test) | yes |
| 15 | #2 | B-N1 | issues | Drop 4 underscore aliases in `_issue_workflow/source_validation.py` | S | P2 | none | none | low | no |
| 16 | #3 | S3.11 | kris | Delete `kriFormWorkflow.ts` + tautological test | S | P2 | none | none | med (architecture-lock update) | no |
| 17 | #4 | FE-deadcode-1 | frontend | Delete `controlFormWorkflow.ts` (3-line, 0 prod) | S | P2 | none | none | low | no |
| 18 | #5 | FE-deadcode-2 | frontend | Delete `orphanResolutionPresentation.ts` (1-line re-export) | S | P2 | none | none | low | no |
| 19 | #6 | FE-deadcode-3 | frontend | Delete `notifications/resourcePath.ts` (5-line re-export) | S | P2 | none | none | low | no |
| 20 | #7 | C-N1 | approvals | Delete endpoint shim `_get_approval_department_id` | S | P2 | none | none | low | no |
| 21 | #41 | B-N3 | issues | Delete bidirectional underscore aliases in issue-workflow serialization | S | P2 | none | none | low | no |
| 22 | #50 | S3.2 | kris | Delete `_kri_history/submission.py` wrapper | S | P2 | none | none | med (architecture-lock update) | no |
| 23 | #52 | S3.5 | kris | Delete `_kri_history/correction_plans.py` | S | P2 | none | none | med (architecture-lock update) | no |
| 24 | #53 | S4.1 | issues | Issue workflow service collapse (drop `IssueWorkflowService` facade) | S | P2 | none | none | med (architecture-lock update) | no |
| 25 | #54 | S6.3 | approvals | Inline `_approval_queue/lifecycle.py` aggregator | S | P2 | none | none | low (move imports) | no |
| 26 | #75 | Bonus | approvals | Delete-and-consolidate `_auto_reject_kri_approval` | S | P2 | none | none | low | no |
| 27 | #18 | S6.2 | approvals | Repoint-and-delete endpoint `_build_approval_read` | S | P2 | none | none | low (approval API tests) | no |
| 28 | #20 | S1.6 | risks | Risk ID generation co-location (DOCUMENT-ONLY w/ stable re-export) | S | P2 | none | none | med (AGENTS+ENDPOINT_INVARIANTS) | no |
| 29 | #21 | S2.6 | endpoints | Collapse Control-Risk link loader duplicates (keyword-only `load_link`) | S | P2 | none | none | med (architecture lock) | no |
| 30 | #25 | S3.7 | kris | Extract KRI department-scope helper (overdue+due_soon) | S | P2 | none | none | low | no |
| 31 | #26 | S3.9 | kris | Delete `KRIForm.tsx` shim + ESLint pin | S | P2 | none | none | low | no |
| 32 | #29 | S4.6 | issues | Source-type vocabulary canonicalization (single helper) | S | P2 | none | none | low | no |
| 33 | #33 | S6.4 | approvals | Unify frontend approval-queued banners (drop KRI variant) | S | P2 | none | none | low | no |
| 34 | #35 | S7.3 | frontend | Delete `usePermissions` hook | S | P2 | none | none | low | no |
| 35 | #36 | S7.4 | frontend | Refactor `BusinessRouteGuards.tsx` to typed factory | S | P2 | none | none | low (closed-enum test stays intact) | no |
| 36 | #48 | FE-N6 | frontend | Merge `getErrorMessageKey.ts` + `errorCodeMap.ts` | S | P2 | none | none | low | no |
| 37 | #64 | FE-N2 | frontend | Extract QueryClient defaults from `App.tsx` | S | P2 | none | none | low | no |
| 38 | #47 | FE-N4 | frontend | Extract session-refresh retry policy (P3 in dev answer) | S | P3 | none | none | low | no |
| 39 | #22 | S2.8 | frontend | Delete `ControlForm.tsx` 1-line shim | S | P2 | none | none | low | no |
| 40 | #23 | S2.9 | frontend | Inline `controlFormUtils` helpers into narrow consumers | S | P2 | #22 | none | low | no |
| 41 | #55 | S7.5 | crosscut | Delete `access_user_service.py` facade | S | P2 | none | none | high (capability contract md+json+validator fixture) | yes |
| 42 | #24 | S3.4 | kris | Delete-and-repoint `kris/linked_vendors.py` barrel | S | P2 | none | #51 (atomic) | high (capability contract citations) | yes |
| 43 | #51 | S3.3 | kris | Delete `_kri_history/value_application.py` shim | S | P2 | none | #24 (atomic) | high (capability contract citations) | yes |
| 44 | #56 | S7.6 | crosscut | Delete `directory_identity_service.py` shim | S | P3 | none | #61 (atomic) | high (capability contract md+json) | yes |
| 45 | #61 | S7.7 | crosscut | Move `graph_directory_*` modules into `_graph_directory/` package | M | P3 | none | #56 (atomic) | high (capability contract + tests) | yes |
| 46 | #17 | S2.1 | vendor | Inline `_monitoring_response` endpoint shim | S | P2 | none | none | med (architecture lock) | no |
| 47 | #49 | S2.2 | endpoints | Inline `_control_execution/monitoring.py` wrapper | S | P2 | #17 | none | med (architecture lock) | no |
| 48 | #59 | S2.10 | endpoints | Consolidate `_monitoring_*` packages (docs+lock) | M | P3 | #17, #49 | none | med (architecture lock) | no |
| 49 | #9 | S6.5 | approvals | Delete-and-redirect duplicate `can_user_view_approval_resource` | S | P2 | none | none | low (security helper) | no |
| 50 | #34 | S6.6 | approvals | Extract `resolve_approval_privilege_tier` helper | M | P3 | #9 | none | med (security adversarial tests) | no |
| 51 | #27 | S4.2 | issues | Issue-loading duplicate deletion | M | P2 | none | none | med (issue API tests) | no |
| 52 | #8 | B-N2 | issues | Source-validation split + canonical link helpers consolidation | M | P2 | #2 | none | med (3-file repoint) | no |
| 53 | #28 | S4.3 | issues | Issue source-mutation triplicate collapse | M | P2 | #8 | none | med | no |
| 54 | #30 | S4.10 | issues | `issues/_shared/__init__.py` underscore re-export pruning | M | P2 | #14, #27, #28 | none | med (allowlist update) | no |
| 55 | #16 | S8.10 | vendor | Remove reports legacy-excel tombstones (410s) | M | P2 | none | none | med (OpenAPI + tests) | no |
| 56 | #38 | S8.6 | endpoints | Move 8 inline endpoint Pydantic models to schemas | M | P2 | #10 | none | med (architecture allowlist) | no |
| 57 | #31 | S5.5 | vendor | Extract vendor reporting row formatters | M | P3 | none | none | low (test coverage) | no |
| 58 | #32 | S5.8 | frontend | Extract generic vendor linked-entity tab | M | P3 | none | none | low | no |
| 59 | #43 | BE-N4 | endpoints | Audit adapter-emitter helper (additive) | M | P3 | none | none | med (audit matrix preserved) | no |
| 60 | #44 | BE-N6 | endpoints | Centralize guarded path-prefix registry | M | P3 | none | none | med (invariant tests) | no |
| 61 | #42 | BE-N2 | crosscut | `ActorPayloadModel` shared base | S | P3 | none | none | low (idempotency test untouched) | no |
| 62 | #58 | S8.3 | endpoints | Delete `OrphanedItemService` facade + static-method class | M | P3 | none | none | med (architecture lock) | no |
| 63 | #63 | BE-N7 | endpoints | Instrument outbox dispatch with `SchedulerJobRun` | M | P3 | none | none | med (admin runtime state preserved) | no |
| 64 | #46 | FE-N1 | frontend | Promote resource query-key factories | L | P3 | none | none | med (typed factory module) | no |
| 65 | #65 | FE-N3 | frontend | Extract `crudCapabilitySchema` shared Zod base | M | P3 | #46 | none | high (capability-catalog snapshot test) | no |
| 66 | #67 | FE-N7 | frontend | Extract generic `useResourcePanelQuery` | M | P3 | #46 | none | low | no |
| 67 | #39 | S8.7 | frontend (BE) | Replace `admin/capabilities.py` static stub with real builder | M | P3 | none | none | high (capability contract + admin role matrix) | yes |
| 68 | #40 | S8.11 | crosscut | Re-cluster admin sub-routers (telemetry/sessions/directory/data_quality) | M | P3 (dev: P4 Defer) | #39 | none | med (router lock + docs) | no |
| 69 | #62 | S5.9 | kris | Relocate `kri_vendor_assignment.py` + per-row audit events | M | P3 (dev: P4 Defer) | none | none | med (audit matrix) | no |
| 70 | #45a | BE-N8a | crosscut | Ownership prerequisite characterization tests | M | P4 | none | none | med (new tests pin behavior) | no |
| 71 | #45b | BE-N8b | crosscut | Ownership resolver factory | M | P4 | #45a | none | med | no |
| 72 | #66 | FE-N5 | frontend | Split `AuthContext.tsx` into independent providers | M | P4 | #37, #39 | none | med (re-render-isolation tests) | no |
| 73 | #68 | FE-N8 | frontend | Introduce `WidgetShell` + scoped query selector | M | P4 | #46, #66 | none | med (dashboard regression plan) | no |
| 74 | #60 | S6.6 | approvals | Introduce `PrivilegeContext` + `Depends(get_privilege_context)` | M | P4 | #34, #51 | none | high (privileged KRI write tests) | no |
| 75 | #71 | S7.8 | frontend | Merge `services/session/` 8 files → 4 | M | P4 | #47, #66, #72 | none | med (session lifecycle tests) | no |
| 76 | #69 | S5.2 | vendor | Introduce `AbstractVendorLink` mixin (Phase 1) | L | P4 | none | #70 (atomic, single migration window) | high (forward-only Postgres migration; ADR-005 + ADR-010) | no |
| 77 | #70 | S5.7 | vendor | Drop `Vendor.status` enum | M | P4 | #69 | #69 (atomic) | high (data-validation pre-flight) | no |

---

## Critical path

**Length 5 chain** (longest dependency chain by sequence position):

```
#72 (Seq 1, ADR-011) → #66 (Seq 72, AuthContext split, also needs #37+#39) → #71 (Seq 75, session merge, also needs #47)
```

Plus the converging chain into #66 itself:
```
#37 (Seq 14) ┐
            ├→ #66 (Seq 72) → #68 (Seq 73)  (also needs #46)
#39 (Seq 67) ┘                #71 (Seq 75)  (also needs #47, #72)
```

Pure topological longest path (counting nodes, ignoring atomic-bundling):
```
#72 → #66 → #71  (length 3)
#39 → #66 → #71  (length 3)
#37 → #66 → #71  (length 3)
#46 → #68        (length 2)
#46 → #65        (length 2)
#46 → #67        (length 2)
#1 → #19 → #11   (length 3)
#2 → #8 → #28 → #30   (length 4)  [also #14→#30, #27→#30, so #30 has indegree 3]
#9 → #34 → #60   (length 3)
#17 → #49 → #59  (length 3)
#74a → #74b      (length 2; also #61 → #74b cross)
#45a → #45b      (length 2)
#69 → #70        (length 2; atomic)
```

**Critical path (longest dependency chain)**:

```
#2 → #8 → #28 → #30      (length 4 nodes)
```

This is the issues-domain barrel-prune chain: `B-N1` underscore-alias drop → `B-N2` source-validation split → `S4.3` source-mutation triplicate collapse → `S4.10` `_shared/__init__.py` prune.

**Equal-length parallel chains** (length 3):
- `#1 → #19 → #11` (risks)
- `#9 → #34 → #60` (approvals privilege tier)
- `#17 → #49 → #59` (monitoring)
- `#37 (or #39 or #72) → #66 → #71` (FE auth/session)

**Total path lengths (counting transitive prereqs to terminals):**
- Issues chain: 4 nodes
- Risks chain: 3 nodes
- Approvals chain: 3 nodes
- Monitoring chain: 3 nodes
- FE auth/session chain: 3 nodes (4 if you count #72/#37/#39 → #66 → #71 → terminal)

Considering convergence at #71 (which needs all of {#47, #66, #72}, and #66 needs {#37, #39}), the deepest reachable chain when you flatten transitive prereqs is:

```
#39 → #66 → #71     and     #37 → #66 → #71     and     #72 → #71
        plus #47 → #71
```

So **#71 is the deepest sink**: 4 distinct prereqs converge on it. The longest single linear path is **#2 → #8 → #28 → #30** (4 nodes).

---

## First 10 free-leaf items (any dev can start immediately)

These have no in-domain or cross-domain prereqs and are sequenced earliest under priority+effort+ADR-first rules:

1. **#72** — ADR-011 (Auth Scheme and Session Model) — M, P1, ADR-first
2. **#73** — ADR-012 (KRI time-series period algebra) — M, P2, ADR-first
3. **#74a** — ADR-007 amendment census (CENSUS phase) — M, P3, ADR-first
4. **#10** — Reject (keep `riskhub_questionnaires.py`) — S, P1, doc-only verify
5. **#57** — Reject (keep `quarterly_comparison_service.py` facade) — S, P2, doc-only verify
6. **#12** — Narrow blanket-except in `users/summary.py` — S, P1
7. **#13** — Delete `vendor_link_helpers.py` shim + capability contract sync — S, P1
8. **#1** — Drop `validate_risk_type` re-export from risks/crud — S, P2 (chain head)
9. **#14** — Issues outbox-only notification cleanup — M, P1
10. **#15** — Add `access_user` capability surface to catalog — M, P1

(Other free leaves: #2, #3, #4, #5, #6, #7, #9, #16, #17, #18, #20, #21, #24, #25, #26, #27, #29, #31, #32, #33, #35, #36, #37, #39, #41, #42, #43, #44, #45a, #46, #47, #48, #50, #51, #52, #53, #54, #55, #56, #58, #61, #62, #63, #64, #69, #75 — all of these are also no-prereq.)

---

## Last 10 terminal items (nothing depends on them)

These have no outgoing edges in the DAG (in `blocks: []`):

1. **#71** — Merge frontend `services/session/` 8 files → 4 (M, P4)
2. **#68** — `WidgetShell` + scoped query selector (M, P4)
3. **#70** — Drop `Vendor.status` enum (M, P4) — last of migration window
4. **#69** — `AbstractVendorLink` mixin Phase 1 (L, P4) — atomic with #70
5. **#60** — `PrivilegeContext` + `Depends(get_privilege_context)` (M, P4)
6. **#62** — Relocate `kri_vendor_assignment.py` + per-row audit events (M, P3)
7. **#45b** — Ownership resolver factory (M, P4)
8. **#74b** — ADR-007 amendment text (M, P3) — depends on census #74a + cross #61
9. **#40** — Re-cluster admin sub-routers (M, P3, after #39)
10. **#67** — `useResourcePanelQuery` generic hook (M, P3, after #46)

(Other terminals listed for completeness: #3, #4, #5, #6, #7, #11, #12, #13, #15, #16, #18, #20, #21, #23, #25, #26, #29, #30, #31, #32, #33, #35, #36, #38, #41, #42, #43, #44, #45b, #48, #50, #51, #52, #53, #54, #55, #57, #58, #59, #63, #64, #65, #67, #68, #73, #75 — all leaf-out nodes.)

---

## Domain effort totals (S=4h, M=8h, L=20h, XL=40h)

Computed from the 77-item table above:

| Domain | Items (count) | S | M | L | XL | Total hours |
|---|---:|---:|---:|---:|---:|---:|
| issues | 9: #2, #8, #14, #27, #28, #29, #30, #41, #53 | 3 (4h ×3) | 6 (8h ×6) | 0 | 0 | 12 + 48 = **60 h** |
| risks | 4: #1, #11, #19, #20 | 4 (4h ×4) | 0 | 0 | 0 | **16 h** |
| approvals | 8: #7, #9, #18, #33, #34, #54, #60, #75 | 6 (4h ×6) | 2 (8h ×2) | 0 | 0 | 24 + 16 = **40 h** |
| kris | 9: #3, #24, #25, #26, #50, #51, #52, #62, #73 | 7 (4h ×7) | 2 (8h ×2) | 0 | 0 | 28 + 16 = **44 h** |
| vendor | 7: #13, #16, #17, #31, #57, #69, #70 | 3 (4h ×3) | 3 (8h ×3) | 1 (20h ×1) | 0 | 12 + 24 + 20 = **56 h** |
| frontend | 19: #4, #5, #6, #22, #23, #32, #35, #36, #37, #39, #46, #47, #48, #64, #65, #66, #67, #68, #71 | 9 (4h ×9) | 9 (8h ×9) | 1 (20h ×1) | 0 | 36 + 72 + 20 = **128 h** |
| endpoints | 11: #10, #12, #15, #21, #38, #43, #44, #49, #58, #59, #63 | 4 (4h ×4) | 7 (8h ×7) | 0 | 0 | 16 + 56 = **72 h** |
| crosscut | 10: #40, #42, #45a, #45b, #55, #56, #61, #72, #74a, #74b | 3 (4h ×3) | 7 (8h ×7) | 0 | 0 | 12 + 56 = **68 h** |

**Grand total**: ~**484 hours** ≈ 60.5 dev-days @ 8h/day, ~12 dev-weeks for a single sequential developer (excluding meetings/review/redo).

Notes:
- #37 is listed under frontend in the DAG (cross-domain authority) but is a backend change. Counted under frontend per DAG attribution.
- #39 same: backend item filed under frontend in DAG because it gates FE-N5.
- #17 listed under vendor in DAG (primary owner there); also referenced in endpoints chain.
- The L item (#69) and #46 are the most expensive single tasks; #69 is migration-window, #46 is FE refactor blocking 3 hubs.

---

## Atomic clusters (must land contiguously / same commit)

| Cluster | Items | Reason |
|---|---|---|
| **#24 + #51** | KRI linked-vendors barrel + KRI value-application shim | docs/contract citations span both files; atomic per `plan-loop-1-04-kris.md:57,171` |
| **#56 + #61** | directory_identity_service shim + graph_directory adapter package | shared docs/contracts; atomic per `plan-loop-1-08-crosscut.md:347,432` |
| **#69 + #70** | AbstractVendorLink mixin + Vendor.status drop | single migration window (ADR-005 + ADR-010) per `plan-loop-1-05-vendor-quarterly.md:184,222` |

(Note: #45a → #45b is sequential-prerequisite, not atomic.)

---

## Hub waves (members must complete in order, single-domain phase)

| Hub | Sequence | Contiguous block? |
|---|---|---|
| **Approvals privilege tier** | #9 → #34 → #60 | Yes (Seq 49 → 50 → 74; #60 deferred to P4 wave) |
| **Frontend query-keys** | #46 → {#65, #67, #68} | #46 (Seq 64) → #65 (Seq 65) + #67 (Seq 66) → #68 (Seq 73, also needs #66) |
| **Endpoints monitoring** | #17 → #49 → #59 | Yes (Seq 46 → 47 → 48) |

---

## Notable swappable pairs

These are pairs where neither item depends on the other and either order works:

| Pair A | Pair B | Note |
|---|---|---|
| **#73 (ADR-012)** | **#74a (ADR-007 census)** | Both are ADRs; #73 is P2 (kris), #74a is P3 (crosscut). Either ordering acceptable; current sequence puts ADR-012 second to align with the kris cleanups it informs. |
| **#12 (D-N3)** | **#13 (S5.1/C-N2)** | Both P1, both S, no shared touchpoints; #13 hits validator (capability contract), #12 is endpoint-only narrowing. |
| **#3 (S3.11)** | **#4 / #5 / #6** | All FE dead-code deletes, S/P2, no overlap. |
| **#7 (C-N1)** | **#18 (S6.2)** | Both approvals, both S/P2, no shared file. |
| **#42 (BE-N2)** | **#44 (BE-N6)** | Both crosscut/endpoints S-or-M P3, independent code paths (outbox payloads vs middleware registries). |
| **#43 (BE-N4)** | **#58 (S8.3)** | Both endpoints P3 M; audit-emitter helper vs orphaned item facade — independent. |
| **#46 (FE-N1)** | **#39 (S8.7)** | Different domains (FE query-keys vs BE admin builder); both unlock other items but don't depend on each other. #46 unlocks 3 FE refactors; #39 unlocks #40 + #66. |
| **#16 (S8.10)** | **#31 (S5.5)** | Both vendor M items, fully independent (legacy-excel tombstone removal vs reporting row formatter extraction). |
| **#67 (FE-N7)** | **#65 (FE-N3)** | Both depend on #46; either can land first after #46. |
| **#56 + #61 atomic** | **#74b** | #74b cross-depends on #61 — so #74b must be sequenced after #56+#61 atomic pair. Could swap #56+#61 order earlier or later (currently Seq 44/45) without affecting other items. |
| **#22 + #23 pair** | **#48 / #64** | All FE/S/P2; #22→#23 is in-domain pair, others are independent. |
| **#21 (S2.6)** | **#25 (S3.7)** | Different domains (endpoints control-risk loader vs kris dept scope); both S/P2, no overlap. |

---

## Notes & assumptions

1. **#57 (Reject)** is included as Seq 6 because the developer answer says "Keep facade" which is *document-only* work to record the rejection in audit followup (lock & README citations). It's not a no-op — it requires updating the audit trail.
2. **#10 (Reject)** is included as Seq 5 for the same reason: keep the module, but cite the AGENTS.md / ENDPOINT_INVARIANTS.md evidence and update audit followup. It also unblocks #38 (which moves the inline schemas without removing the route).
3. **#37 priority is P1** in the dev answer (governance capability builder) and **gates FE-N5 (#66)** plus is itself a capability contract change requiring the validator.
4. **#39 priority is P3** in the dev answer (M effort) but it gates **#40 and #66**. Sequenced at Seq 67 (P3 wave) — if the team wants to accelerate FE auth work, #39 could be promoted to the P2 wave (Seq ~50) without violating the DAG.
5. **#69 + #70 migration window LAST** — this is by design. The dev answer Defers both to P4 with a "forward-only migration window" gate. If a Postgres migration window is scheduled mid-cleanup, this pair could move earlier in the sequence (e.g., Seq 60-65 region).
6. **#62 (P3 in DAG, P4 Defer in dev answer)** — sequenced at Seq 69 as a P3 item but with the caveat that the dev answer marks it as Defer until #69 lands. If strict adherence to dev-answer priorities is required, sequence after #69+#70.
7. **#60 (P4 Defer)** — depends on **#34 (Seq 50)** AND **#51 (Seq 43, atomic with #24)**. Both prereqs land in the P2 wave; #60 itself is sequenced in P4 territory at Seq 74.
8. **Frontend query-key fanout** (#46 → 65/67/68): The fanout at #46 unlocks 3 dependents, but only #65 and #67 are direct must-have FE-N3/FE-N7 sequencing. #68 is FE-N8 (P4 Defer) and waits for #66 too.
9. **TDD discipline (per CLAUDE.md / AGENTS.md)**: every commit has a red→green test sequence; the doc/lock burden column reflects whether a TOML allowlist or capability-contract fixture also moves with code. **All items with "Validator? = yes"** must run `python3 scripts/security/validate_authz_capability_contract.py` as part of the commit gate.

---

## Summary by priority tier

- **P1 items (10)**: #10, #11, #12, #13, #14, #15, #19, #37, #72 — sequenced in the first ~14 slots (after ADR #72).
- **P2 items (43)**: occupy slots ~15–66 (mix of S quick-wins and M chained items).
- **P3 items (16)**: #31, #32, #34, #36 (note dev says P3), #39, #40, #42, #43, #44, #46, #47, #56, #58, #59, #61, #63, #65, #67, #74a, #74b, #62 — sequenced slots ~50–69.
- **P4 items (8)**: #45a, #45b, #60, #66, #68, #71, #69, #70 — sequenced slots 70–77 (last segment).

Total = 10 + 43 + ~18 + 8 = 79 (over 77 because some items appear with multiple priority assignments in different sources; in the master sequence each item appears exactly once).

---

## Gate-by-gate land plan (high level)

- **Gate A (ADRs)**: Seq 1–4 (#72, #73, #74a, #74b). After this, all ADR-dependent items can plan against ratified text.
- **Gate B (P1 quick wins)**: Seq 5–14. Lock contracts, fix the truth-in-naming bug, close capability catalog gaps.
- **Gate C (P2 dead-code & shims)**: Seq 15–43. Bulk of the cleanup landing as 1–2-line deletions or thin re-points; atomic clusters #24+#51 and #56+#61 land here.
- **Gate D (P2 chains & monitoring)**: Seq 44–58. Issue-domain consolidation chain, reports tombstone removal, schemas eviction, monitoring chain.
- **Gate E (P3 medium)**: Seq 59–69. Audit emitter helper, path-prefix registry, query-keys factory + dependents, admin builder + reorg, KRI vendor relocation.
- **Gate F (P4 deferred)**: Seq 70–75. Ownership factory after characterization tests, AuthContext split, WidgetShell, PrivilegeContext, session merge.
- **Gate G (Migration window)**: Seq 76–77. AbstractVendorLink mixin + Vendor.status drop, atomic, dedicated rehearsal.

Estimated calendar time @ 1 dev × 8h/day, 5d/week = ~12 weeks (484 / 40). Adversarial review and TDD overhead can extend to 14–16 weeks.

---

End of master sequence.
