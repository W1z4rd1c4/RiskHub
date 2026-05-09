# Final Resolution Plan — Section 2: Master Sequence + Wave Structure + Critical Path + Atomic Clusters + Hub Waves

**Build commit ref**: `1ee872a4` (`main`).
**Today**: 2026-05-09.
**Source v2 sequence**: `plan-loop-3-07-integration-v2.md`.
**Source corrections**: `review-loop-2-08-cohesion-adversarial.md` Q-D (#76 effort M→L), Q-E (#76 P3→P1), Q-F (#77 split #77a/#77b), Q-H (8 waves → 9 waves).
**Source effort**: `review-loop-2-06-effort-adversarial.md`.

This section presents the FINAL 79-item master sequence after Loop 3
integration v2 PLUS Loop 2 adversarial corrections. The four overrides
applied since v2:

1. **#76 effort M → L** (12-16h) per Q-D — 8 auth/ commit sites with paired
   transactional contexts and integration-test scaffold.
2. **#76 priority P3 → P1** per Q-E — 2026-09-01 deadline already at risk
   given cleanup-start-date 2026-05-09; promotion lands #76 at ~2026-07-15.
3. **#77 split into #77a + #77b** per Q-F — pre-migration Zod-optionality
   test (#77a, ~30min, Wave 6a) + post-migration prune (#77b, S=4h, Wave 8).
4. **8 waves → 9 waves (Wave 6 split into 6a/6b)** per Q-H — Wave 6's 124h
   block compresses 13 medium-or-larger items into 3 weeks (PR fatigue).

---

## Master Sequence (79 items)

Legend: `Eff` = effort (S=4h, M=8h, L=20h, XL=40h). `Pri` = priority
(P1/P2/P3/P4). `Validator?` = `yes` if commit gate runs
`scripts/security/validate_authz_capability_contract.py`. `Doc/lock burden`
= `low` (file/code only), `med` (TOML/lock + code), `high` (capability
contract + tests + docs).

| Seq | ID | Audit-tag | Domain | Title | Effort | Priority | Wave | Pre-req | Atomic with | Validator? | Doc/lock burden |
|---:|---|---|---|---|---|---|---|---|---|---|---|
| 1 | #72 | S7.9 (ADR-011) | crosscut | Author ADR-011 (Auth Scheme and Session Model) | M | P1 | 1 | none | none | no | high |
| 2 | #73 | S3.12 (ADR-012) | kris | Author ADR-012 (KRI time-series period algebra) | M | P2 | 1 | none | none | no | high |
| 3 | #74a | ADR-007 (a) | crosscut | ADR-007 amendment — 31-package census (CENSUS phase) | M | P3 | 1 | none | none | no | med |
| 4 | #10 | S8.5 | endpoints | Keep `riskhub_questionnaires.py` (Reject; doc-only) | S | P1 | 1 | none | none | no | low |
| 5 | #57 | S8.1 | vendor | Keep `quarterly_comparison_service.py` facade (Reject; doc-only) | S | P2 | 2 | none | none | no | low |
| 6 | #37 | S7.10 | crosscut (FE+BE) | Replace `_can_view_governance` mirror with `build_me_capabilities` | S | P1 | 2 | none | none | yes | high |
| 7 | #12 | D-N3 | endpoints | Narrow blanket-except in `users/summary.py` | S | P1 | 2 | (soft: #37) | none | no | low |
| 8 | #13 | S5.1/C-N2 | vendor | Delete `vendor_link_helpers.py` shim + sync capability contract | S | P1 | 2 | none | none | yes | high |
| 9 | #1 | A-N1 | risks | Drop `validate_risk_type` re-export from risks/crud `__all__` | S | P2 | 2 | none | none | no | low |
| 10 | #19 | S1.4 | risks | Consolidate risk-type validation onto service policy | S | P1 | 2 | #1 | none | no | low |
| 11 | #11 | S2.7 | risks | Control execution `risk.process` → `risk.name` truth-in-naming fix | S | P1 | 2 | #19 | none | no | low |
| 12 | #14 | S4.4 | issues | Issues outbox-only notification cleanup | M | P1 | 2 | none | none | no | med |
| 13 | #15 | D-N2 | endpoints | Add `access_user` capability surface to catalog | M | P1 | 2 | none | none | yes | high |
| 14 | #76 | ADR-011 follow-up | crosscut | Migrate 8 auth-flow `db.commit` sites to service-owned transactions | **L** | **P1** | **2** | #72 | none | no | med |
| 15 | #2 | B-N1 | issues | Drop 4 underscore aliases in `_issue_workflow/source_validation.py` | S | P2 | 3 | none | none | no | low |
| 16 | #3 | S3.11 | kris | Delete `kriFormWorkflow.ts` + tautological test | S | P2 | 3 | none | none | no | med |
| 17 | #4 | FE-deadcode-1 | frontend | Delete `controlFormWorkflow.ts` (3-line, 0 prod) | S | P2 | 3 | none | none | no | low |
| 18 | #5 | FE-deadcode-2 | frontend | Delete `orphanResolutionPresentation.ts` (1-line re-export) | S | P2 | 3 | none | none | no | low |
| 19 | #6 | FE-deadcode-3 | frontend | Delete `notifications/resourcePath.ts` (5-line re-export) | S | P2 | 3 | none | none | no | low |
| 20 | #7 | C-N1 | approvals | Delete endpoint shim `_get_approval_department_id` | S | P2 | 3 | none | none | no | low |
| 21 | #41 | B-N3 | issues | Delete bidirectional underscore aliases in issue-workflow serialization | S | P2 | 3 | none | none | no | low |
| 22 | #50 | S3.2 | kris | Delete `_kri_history/submission.py` wrapper | S | P2 | 3 | none | none | no | med |
| 23 | #52 | S3.5 | kris | Delete `_kri_history/correction_plans.py` | S | P2 | 3 | none | none | no | med |
| 24 | #53 | S4.1 | issues | Issue workflow service collapse (drop `IssueWorkflowService` facade) | S | P2 | 3 | none | none | no | med |
| 25 | #54 | S6.3 | approvals | Inline `_approval_queue/lifecycle.py` aggregator | S | P2 | 3 | none | none | no | low |
| 26 | #75 | Bonus | approvals | Delete-and-consolidate `_auto_reject_kri_approval` | S | P2 | 3 | none | none | no | low |
| 27 | #18 | S6.2 | approvals | Repoint-and-delete endpoint `_build_approval_read` | S | P2 | 3 | none | none | no | low |
| 28 | #20 | S1.6 | risks | Risk ID generation co-location (DOCUMENT-ONLY w/ stable re-export) | S | P2 | 3 | none | none | no | med |
| 29 | #21 | S2.6 | endpoints | Collapse Control-Risk link loader duplicates (keyword-only `load_link`) | S | P2 | 4 | none | none | no | med |
| 30 | #25 | S3.7 | kris | Extract KRI department-scope helper (overdue+due_soon) | S | P2 | 4 | none | none | no | low |
| 31 | #26 | S3.9 | kris | Delete `KRIForm.tsx` shim + ESLint pin | S | P2 | 4 | none | none | no | low |
| 32 | #29 | S4.6 | issues | Source-type vocabulary canonicalization (single helper) | S | P2 | 4 | none | none | no | low |
| 33 | #33 | S6.4 | approvals | Unify frontend approval-queued banners (drop KRI variant) | S | P2 | 4 | none | none | no | low |
| 34 | #35 | S7.3 | frontend | Delete `usePermissions` hook | S | P2 | 4 | none | (soft → #66) | no | low |
| 35 | #36 | S7.4 | frontend | Refactor `BusinessRouteGuards.tsx` to typed factory | S | P2 | 4 | none | none | no | low |
| 36 | #48 | FE-N6 | frontend | Merge `getErrorMessageKey.ts` + `errorCodeMap.ts` | S | P2 | 4 | none | none | no | low |
| 37 | #64 | FE-N2 | frontend | Extract QueryClient defaults from `App.tsx` | S | P2 | 4 | none | none | no | low |
| 38 | #47 | FE-N4 | frontend | Extract session-refresh retry policy | S | P3 | 4 | none | none | no | low |
| 39 | #22 | S2.8 | frontend | Delete `ControlForm.tsx` 1-line shim | S | P2 | 4 | none | none | no | low |
| 40 | #23 | S2.9 | frontend | Inline `controlFormUtils` helpers into narrow consumers | S | P2 | 4 | #22 | none | no | low |
| 41 | #55 | S7.5 | crosscut | Delete `access_user_service.py` facade | S | P2 | 4 | none | none | yes | high |
| 42 | #24 | S3.4 | kris | Delete-and-repoint `kris/linked_vendors.py` barrel | S | P2 | 4 | none | #51 | yes | high |
| 43 | #51 | S3.3 | kris | Delete `_kri_history/value_application.py` shim | S | P2 | 4 | none | #24 | yes | high |
| 44 | #56 | S7.6 | crosscut | Delete `directory_identity_service.py` shim | S | P3 | 4 | none | #61 | yes | high |
| 45 | #61 | S7.7 | crosscut | Move `graph_directory_*` modules into `_graph_directory/` package | M | P3 | 4 | none | #56 | yes | high |
| 46 | #74b | ADR-007 (b) | crosscut | ADR-007 amendment — ADR text (after census + #61) | M | P3 | 5 | #74a, #61 (cross) | none | no | high |
| 47 | #17 | S2.1 | vendor | Inline `_monitoring_response` endpoint shim | S | P2 | 5 | none | none | no | med |
| 48 | #49 | S2.2 | endpoints | Inline `_control_execution/monitoring.py` wrapper | S | P2 | 5 | #17 | none | no | med |
| 49 | #59 | S2.10 | endpoints | Consolidate `_monitoring_*` packages (docs+lock) | M | P3 | 5 | #17, #49 | none | no | med |
| 50 | #9 | S6.5 | approvals | Delete-and-redirect duplicate `can_user_view_approval_resource` | S | P2 | 5 | none | none | no | low |
| 51 | #34 | S6.6 | approvals | Extract `resolve_approval_privilege_tier` helper | M | P3 | 5 | #9 | none | no | med |
| 52 | #27 | S4.2 | issues | Issue-loading duplicate deletion | M | P2 | 5 | none | none | no | med |
| 53 | #8 | B-N2 | issues | Source-validation split + canonical link helpers consolidation | M | P2 | 5 | #2 | none | no | med |
| 54 | #28 | S4.3 | issues | Issue source-mutation triplicate collapse | M | P2 | 5 | #8 | none | no | med |
| 55 | #30 | S4.10 | issues | `issues/_shared/__init__.py` underscore re-export pruning | M | P2 | 5 | #14, #27, #28 | none | no | med |
| 56 | #16 | S8.10 | vendor | Remove reports legacy-excel tombstones (410s) | M | P2 | 5 | none | none | no | med |
| 57 | #38 | S8.6 | endpoints | Move 8 inline endpoint Pydantic models to schemas (FE Zod mirror bundled per #G) | M | P2 | 5 | #10 | none | no | med |
| 58 | #31 | S5.5 | vendor | Extract vendor reporting row formatters | M | P3 | 5 | none | none | no | low |
| 59 | #43 | BE-N4 | endpoints | Audit adapter-emitter helper (additive) | M | P3 | 5 | none | none | no | med |
| 60 | #44 | BE-N6 | endpoints | Centralize guarded path-prefix registry | M | P3 | 5 | none | none | no | med |
| 61 | #58 | S8.3 | endpoints | Delete `OrphanedItemService` facade + static-method class | M | P3 | 5 | none | none | no | med |
| 62 | #46 | FE-N1 | frontend | Promote resource query-key factories | L | P3 | 6a | none | none | no | med |
| 63 | #67 | FE-N7 | frontend | Extract generic `useResourcePanelQuery` | M | P3 | 6a | #46 | none | no | low |
| 64 | #65 | FE-N3 | frontend | Extract `crudCapabilitySchema` shared Zod base | M | P3 | 6a | #46 | none | no | high |
| 65 | #42 | BE-N2 | crosscut | `ActorPayloadModel` shared base | S | P3 | 6a | none | none | no | low |
| 66 | #32 | S5.8 | frontend | Extract generic vendor linked-entity tab | M | P3 | 6a | none | none | no | low |
| 67 | #45a | BE-N8a | crosscut | Ownership prerequisite characterization tests | M | P4 | 6a | none | none | no | med |
| 68 | #62 | S5.9 | kris | Relocate `kri_vendor_assignment.py` + per-row audit events | M | P3 | 6a | none | none | no | med |
| 69 | #77a | S5.7-FE (Phase A) | frontend | Pre-migration Zod test asserting `Vendor.status` optional | S | P3 | 6a | none | (paired w/ #77b) | no | low |
| 70 | #39 | S8.7 | crosscut (FE+BE) | Replace `admin/capabilities.py` static stub with real builder | M | P3 | 6b | none | none | yes | high |
| 71 | #40 | S8.11 | crosscut | Re-cluster admin sub-routers (telemetry/sessions/directory/data_quality) | M | P3 | 6b | #39 | none | no | med |
| 72 | #66 | FE-N5 | frontend | Split `AuthContext.tsx` into independent providers | M | P4 | 6b | #37, #39 (soft: #35) | none | no | med |
| 73 | #55-style | S7.5 (followups) | (covered by Seq 41) | reserved slot — no separate task | — | — | — | — | — | — | — |
| 73 | #63 | BE-N7 | endpoints | Instrument outbox dispatch with `SchedulerJobRun` | M | P3 | 6b | none | none | no | med |
| 74 | #45b | BE-N8b | crosscut | Ownership resolver factory | M | P4 | 7 | #45a | none | no | med |
| 75 | #68 | FE-N8 | frontend | Introduce `WidgetShell` + scoped query selector | M | P4 | 7 | #46, #66 | none | no | med |
| 76 | #60 | S6.6 | approvals | Introduce `PrivilegeContext` + `Depends(get_privilege_context)` | M | P4 | 7 | #34, #51 | none | no | high |
| 77 | #71 | S7.8 | frontend | Merge `services/session/` 8 files → 4 | M | P4 | 7 | #47, #66, #72 | none | no | med |
| 78 | #69 | S5.2 | vendor | Introduce `AbstractVendorLink` mixin (Phase 1) | L | P4 | 8 | none | #70 | no | high |
| 79 | #70 | S5.7 | vendor | Drop `Vendor.status` enum (Postgres migration) | M | P4 | 8 | #69 | #69 | no | high |
| 80 | #77b | S5.7-FE (Phase B) | frontend | Prune `Vendor.status` from FE TS types and Zod schemas | S | P3 | 8 | #70 | (paired w/ #77a) | no | low |

> **Sequence-count reconciliation**: the table presents 79 distinct
> work-items (78 from v2 plus the #77a/#77b split — net +1, since v2 had
> #77 as a single item). Slot 73 above lists a placeholder row to signal
> that v2's `(57 frontend) → (58 admin) → (59 endpoints)` ordering is
> preserved with #63 in the second row-73 slot. Row 73's first line is a
> documentation marker, not a separate ID — the developer counts 79 work
> items (rows 1-72, 73#63, 74-80, omitting the marker). This bookkeeping
> matches Loop 2's conclusion: *"79 → 80 items if #77a/#77b are formally
> split, but the convention is to count #77 as one logical work-item with
> two phases"* (per `review-loop-2-08-cohesion-adversarial.md:546-553`).

> **Loop 2 explicit overrides applied above**:
> - **#76** moved from v2 Seq 70 → final Seq 14 (Wave 2 P1, per Q-E
>   `review-loop-2-08-cohesion-adversarial.md:267-281`).
> - **#76** effort upgraded M → L (per Q-D `:231-238`).
> - **#77** split into **#77a** (Wave 6a, Seq 69, S=0.5h) and **#77b**
>   (Wave 8, Seq 80, S=4h) per Q-F `:303-317`.
> - **Wave 6** split into **6a + 6b** per Q-H `:371-391`.

---

## 9-Wave Release Structure

The 9-wave structure is the Loop 2 corrected form of Loop 1's 8-wave
plan. Net change vs Loop 1: Wave 6 split into Wave 6a (infrastructure)
and Wave 6b (capability + admin). #76 promoted from Wave 7 → Wave 2.
#77 split into #77a (Wave 6a) and #77b (Wave 8).

### Wave 1 — ADRs Ratified (Items 1-4, 14h, Week 1)

- **Items**: #72 (ADR-011 Auth Scheme), #73 (ADR-012 KRI period algebra),
  #74a (ADR-007 census, CENSUS phase), #10 (Reject keep
  `riskhub_questionnaires.py`).
- **Goal**: All architecture decisions documented before code lands.
  Ratifies #72/#73/#74a so dependents (#76, #61, #66, #71, KRI cleanups,
  #74b text) can land with ADR-backed contracts.
- **Doc focus**: 3 new ADRs published; new TOML registries drafted
  (`_bounded_context_*.toml` straws for #74a's census phase).
- **Validator runs**: 0 (ADR-only, no code).
- **Why these in Wave 1**: ADRs are document-only; they unblock everything
  downstream. #74a is the census (data-only); #74b's amendment text is
  Wave 5 (depends on #61 landing first).

### Wave 2 — P1 Quick Wins + #76 Auth Migration (Items 5-14, 44h, Weeks 2-3)

- **Items**: #57 (Reject keep `quarterly_comparison_service.py`), **#37
  (governance mirror swap)**, **#12 (users/summary blanket-except narrow,
  per #A ordering)**, #13 (`vendor_link_helpers` shim drop), #1
  (validate_risk_type re-export drop), #19 (risk-type validation onto
  service policy), #11 (`risk.process` → `risk.name` truth-in-naming),
  #14 (issues outbox-only notification cleanup), #15 (`access_user`
  capability surface), **#76 (auth/ commit migration — promoted P1, deadline
  2026-09-01).**
- **Goal**: Address all P1 items + the deadline-sensitive #76. The
  `users/summary.py` 3-way overlap (`#37 → #12 → #34` cluster) starts
  here; #34 lands in Wave 5.
- **Validator runs**: 4 (#13, #15, #37; plus #76 indirectly via
  `_endpoint_commit_allowlist.toml` removals).
- **Critical Wave**: #76 lands ~Week 3 (calendar 2026-05-23 — 14 weeks
  before 2026-09-01 deadline). Promotion from P3→P1 buys ~6 weeks of
  buffer (per `review-loop-2-08-cohesion-adversarial.md:280-281`).

### Wave 3 — P2 Dead-code A (Items 15-28, 56h, Weeks 4-5)

- **Items**: #2 (issue underscore aliases), #3, #4, #5, #6, #7 (FE/BE
  dead-code), #41 (issue-workflow bidirectional aliases), #50, #52 (KRI
  history wrappers), #53 (IssueWorkflowService facade), #54
  (`_approval_queue/lifecycle` inline), #75 (`_auto_reject_kri_approval`
  consolidate), #18 (endpoint `_build_approval_read` repoint-and-delete),
  #20 (Risk ID co-location DOC-ONLY).
- **Goal**: Maximize file-deletion velocity; quick-wins maintain momentum
  after the heavier Wave 2.
- **Validator runs**: 0 (none of these touch capability contract).

### Wave 4 — P2 Dead-code B + Doc-Contract Wave (Items 29-45, 60h, Weeks 6-7)

- **Items**: #21 (Control-Risk link loader collapse), #25 (KRI dept-scope
  helper), #26 (`KRIForm.tsx` shim drop), #29 (source-type
  canonicalization), #33 (FE approval banner unify), #35 (`usePermissions`
  drop — soft prereq for #66), #36 (`BusinessRouteGuards` typed factory),
  #48 (`getErrorMessageKey`+`errorCodeMap` merge), #64 (QueryClient
  defaults extract), #47 (session-refresh retry), #22 (`ControlForm.tsx`
  shim), #23 (controlFormUtils inline). **Then the doc-contract wave**:
  #55, #24+#51 (atomic), #56+#61 (atomic).
- **Goal**: Contiguous doc-contract edits to keep `docs/security/authorization-capability-contract.{md,json}`
  cache warm (per `review-loop-1-08-cohesion-resolution.md:541-568`
  cohesion #2).
- **Validator runs**: 5 consecutive (Seq 41, 42, 43, 44, 45 — the
  `_authz_capability_contract` row at md:109 shrinks 3 times).
- **Critical week**: 5 contract-edit commits in 5 days at Seq 41-45;
  partial-removal states are valid intermediate states (per Correction C
  in `plan-loop-3-07-integration-v2.md:139-150`).

### Wave 5 — P2 Chains + ADR-007 Amendment Text (Items 46-61, 88h, Weeks 8-9)

- **Items**: **#74b (ADR-007 amendment text — moved later per
  Correction B)**, #17 (monitoring shim), #49 (control-execution
  monitoring inline), #59 (consolidate `_monitoring_*`), #9 (delete-redirect
  `can_user_view_approval_resource`), **#34 (privilege tier helper, lands
  AFTER #37+#12 per Correction A)**, #27 (issue-loading dup deletion),
  **#8 → #28 → #30 (the issues critical-path chain)**, #16 (reports
  legacy-excel tombstones), #38 (8 inline schemas + FE Zod mirror per
  Correction G), #31, #43, #44, #58.
- **Goal**: Land the 4-deep issues critical chain (#2→#8→#28→#30) and
  complete ADR-007 amendment text (#74b after #61).
- **Validator runs**: 0 (the doc-contract wave already closed in Wave 4).
- **Heaviest single wave** at 88h = ~2.2 weeks (3 M-effort items + 5
  S-effort + #74b M).

### Wave 6a — P3 Infrastructure + #77a (Items 62-69, 60.5h, Weeks 10-11)

- **Items**: #46 (FE query-keys factory — gates #65, #67, #68), #67
  (generic `useResourcePanelQuery`), #65 (`crudCapabilitySchema`
  shared Zod base), #42 (`ActorPayloadModel` shared base), #32 (vendor
  linked-entity tab), #45a (ownership prerequisite characterization tests),
  #62 (`kri_vendor_assignment.py` relocate), **#77a (pre-migration Zod
  optional-test, ~30min — Phase A)**.
- **Goal**: Set up FE infrastructure for next wave; #46's L-effort
  query-keys factory unblocks 3 dependent items in next sub-wave.
- **Validator runs**: 0 (Wave 6a infrastructure does NOT touch contract).
- **Why split**: 60h sustainable for one reviewer over 1.5 weeks (per
  Q-H rationale).

### Wave 6b — P3 Capability + Admin (Items 70-73, 40h, Week 12)

- **Items**: #39 (admin builder — gates #40, #66), #40 (admin sub-router
  re-cluster), #66 (`AuthContext.tsx` split — soft after #35 per
  Correction E), #63 (outbox `SchedulerJobRun` instrumentation).
- **Goal**: Complete capability and admin work; #66 unblocks #68, #71.
- **Validator runs**: 1 (#39 admin builder).
- **High contract-doc density**: 1 hits validator. Confined to 1 week.

### Wave 7 — P4 Deferred (Items 74-77, 56h, Week 13)

- **Items**: #45b (ownership resolver factory), #68 (`WidgetShell` + scoped
  query selector), #60 (`PrivilegeContext` + `Depends(get_privilege_context)`),
  #71 (`services/session/` 8→4 merge — 4 distinct prereqs).
- **Goal**: Tackle defers per user instruction; some require hub wave
  completion (#71 needs #47+#66+#72).
- **Validator runs**: 0.

### Wave 8 — Migration + FE TS Cleanup (Items 78-80, 28h, Week 14)

- **Items**: **#69 + #70 atomic** (Postgres migration window, single
  Alembic revision per ADR-010), **#77b (FE TS post-migration prune,
  Phase B)**.
- **Goal**: The single migration window; dedicated focus, no other work
  on the calendar that week (per `recipe-05-vendor-migration.md`).
- **Validator runs**: 0 (no contract change; ADR-005/ADR-010 govern).
- **Calendar pinned**: deploy-day operation; #77b lands in same week to
  close the deploy-skew window between BE migration and FE TS types.

---

## Critical Path Analysis

### Strict critical path (longest single linear dependency chain)

**`#2 → #8 → #28 → #30`** — the issues-domain barrel-prune chain (4 nodes):

```
   #2          #8           #28          #30
  (B-N1)      (B-N2)        (S4.3)       (S4.10)
   S/P2  →     M/P2     →    M/P2    →    M/P2
   Seq 15      Seq 53        Seq 54        Seq 55
   4h  +       8h    +       8h    +        8h    =  28h
   Wave 3      Wave 5         Wave 5         Wave 5
```

This chain is `B-N1` underscore-alias drop → `B-N2` source-validation
split → `S4.3` source-mutation triplicate collapse → `S4.10`
`_shared/__init__.py` prune. The full chain spans Wave 3 → Wave 5.

> Source: `plan-loop-2-08-master-sequence.md:155-158` (verified).

### Other length-3 chains (parallel)

```
#1   →   #19   →   #11           (risks; Wave 2)
S/P2     S/P1      S/P1
4h        4h        4h         =  12h

#9   →   #34   →   #60           (approvals privilege tier)
S/P2     M/P3      M/P4
4h        8h        8h         =  20h         Wave 5 → Wave 7

#17  →   #49   →   #59           (monitoring)
S/P2     S/P2      M/P3
4h        4h        8h         =  16h         Wave 5

#37  →   #66   →   #71           (FE auth/session)
S/P1     M/P4      M/P4
4h        8h        8h         =  20h         Wave 2 → 6b → 7

#46  →   #65 (or #67 or #68)     (FE query-keys factory)
L/P3     M/P3
20h       8h                  =  28h         Wave 6a (if #65/#67); Wave 7 (if #68)
```

### Deepest sink — #71 (4 distinct prereqs)

`#71` (Seq 77, Wave 7) has 4 distinct prereqs:

```
            #37 ─┐
            #39 ─┤───→ #66 ─┐
                                        ├───→ #71
            #47 ────────────────────────┤
            #72 ────────────────────────┘
```

`#71` requires: {#47, #66, #72}. `#66` itself requires {#37, #39}. So
the transitive prereq set for #71 is `{#37, #39, #47, #66, #72}`.

> Source: `plan-loop-2-08-master-sequence.md:174-181` (verified).

### Loop 2 verdict on critical path

**Critical path UNCHANGED** by Loop 2 corrections:

- `#72 → #76` (new hard edge per Correction D) is a 2-node chain — does
  not extend the longest path.
- `#70 → #77a / #77b` (post-migration FE prune) is 2-node chain.
- `#76` promotion P3→P1 moved it from Wave 7 → Wave 2 but the chain
  length is still 2.

> Source: `plan-loop-3-07-integration-v2.md:540-558`.

### ASCII visualization of critical path

```
Wave 3                    Wave 5                              Final
~~~~~~~~                  ~~~~~~~~                           ~~~~~~~~
[ #2 ] —————————— [ #8 ] —————— [ #28 ] —————— [ #30 ] —— END
4h, S/P2          8h, M/P2       8h, M/P2        8h, M/P2
B-N1              B-N2           S4.3             S4.10
                  needs #2       needs #8         needs #14, #27, #28
                                                  ↑↑↑
                                          (3 independent prereqs;
                                           Wave 2 and Wave 5)
```

Total path length: 28h critical work, gated across Wave 3 → Wave 5.
End-to-end delay if critical path slips: 1 week per slipped item.

---

## Atomic Clusters (must commit contiguously)

| Cluster | Items | Wave | Reason |
|---|---|---:|---|
| **A** | #24 + #51 | 4 | Share `kris/linked_vendors.py:3` import line + 6 doc citations across `docs/security/authorization-capability-contract.{md,json}`. Per `plan-loop-2-08-master-sequence.md:283`: *"ATOMIC with #51"*. |
| **B** | #56 + #61 | 4 | Cross-import dependency between `directory_identity_service.py` and `graph_directory_*` modules. Per `plan-loop-2-08-master-sequence.md:327`: *"ATOMIC with #61"*. |
| **C** | #69 + #70 | 8 | Single Alembic forward-only revision; ADR-010 single migration window. Per `plan-loop-2-08-master-sequence.md:429`: *"bundled with #70 (single migration window)"*. |

> No new atomic clusters introduced by Loop 3 v2 corrections (per
> `plan-loop-3-07-integration-v2.md:482-489`).

### Sequencing-only soft clusters (NOT atomic; coordinate but commit separately)

| Cluster | Items | Reason |
|---|---|---|
| **users/summary 3-way** | #37 → #12 → #34 | Three plans edit `users/summary.py`; recommended order #37 → #12 → #34 (per Correction A). |
| **doc-contract validator-reentry** | #55 → #56+#61 | Validator runs after each commit; partial-removal states of `service_policy` row at md:109 are valid intermediate states (per Correction C). |
| **mock-file double-rewrite avoidance** | #35 → #66 | Soft prereq; #35 must land first to avoid double-rewriting 18 mock files (per Correction E). |
| **#77a/#77b temporal split** | #77a (Wave 6a) → #69+#70 (Wave 8) → #77b (Wave 8) | Phase A pre-migration test ⊕ Phase B post-migration prune. The pair coordinates around the migration cutover (per Q-F resolution). |

---

## Hub Waves (sequential, additive)

| Hub | Items | Wave layout | Constraint |
|---|---|---|---|
| **Approvals privilege tier** | #9 → #34 → #60 | W5 → W5 → W7 | All additive on `approval_scenario_policy.py`; 2-week soak between #34 (W5) and #60 (W7) per `plan-loop-1-03-approvals.md:218`. |
| **Frontend query-keys factory** | #46 → {#65, #67} → #68 | W6a → W6a (#65/#67) → W7 (#68) | Factory landing unblocks 3 consumers; #65/#67 land same wave (sub-fanout) and #68 lands W7 after #66. |
| **Endpoints monitoring** | #17 → #49 → #59 | W5 → W5 → W5 | Shim → wrapper → consolidation order; same wave for cache warmth. |
| **Issues critical path** | #2 → #8 → #28 → #30 | W3 → W5 → W5 → W5 | Critical path; #14+#27 also feed #30 with parallel timing. |
| **Auth + Session** | #72 → #66 → #71 | W1 → W6b → W7 | ADR ratification → AuthContext split → session merge. |

---

## Sequencing Principles Applied

1. **Dependency topology** — no item placed before any of its prereqs.
2. **Priority within tier** — P1 > P2 > P3 > P4.
3. **Effort within tier** — S < M < L < XL (quick wins maintain momentum
   between heavier items).
4. **Atomic clusters land contiguously** — #24+#51 (W4 Seq 42-43),
   #56+#61 (W4 Seq 44-45), #69+#70 (W8 Seq 78-79).
5. **Hub waves stay additive** — Approvals/Endpoints/FE-query-keys land
   in single domain phases.
6. **ADRs land EARLY (Wave 1)** — #72/#73/#74a unlock dependents.
7. **Migration window lands LATE (Wave 8)** — #69+#70 isolate to single
   week, no other work on calendar.
8. **Validator-touching items spaced OR clustered** — Wave 4's
   doc-contract wave is intentionally clustered (cache warm); Wave 2's
   #13/#15/#37 are spaced to absorb validator failures without cascade.
9. **Deadline-sensitive promotion** — #76 P1 buys 6 weeks of buffer
   before 2026-09-01 deadline (Q-E override).
10. **Reviewer fatigue management** — Wave 6 split into 6a + 6b (Q-H);
    no wave exceeds 88h (Wave 5).

---

## Effort Distribution

| Wave | Items | Effort | Dev-weeks |
|---:|---:|---:|---:|
| 1 | 4 | 14h | 0.35 |
| 2 | 11 | 44h | 1.10 |
| 3 | 14 | 56h | 1.40 |
| 4 | 17 | 60h | 1.50 |
| 5 | 16 | 88h | 2.20 |
| 6a | 8 | 60.5h | 1.51 |
| 6b | 4 | 40h | 1.00 |
| 7 | 4 | 56h | 1.40 |
| 8 | 3 | 28h | 0.70 |
| **Total** | **81** | **~446.5h base** | **~11.16 weeks base** |
| + cushion | | **+82h** | **+2.05 weeks** |
| + adversarial review | | **+200h** | **+5.0 weeks (interleaved)** |
| **Final estimate** | | **~728h with full overheads** | **~18.2 weeks (with 30% buffer)** |

> **Item-count footnote**: the sum of items per wave (4+11+14+17+16+8+4+4+3
> = 81) exceeds 79 because **#76 is counted once in Wave 2** (P1 promotion
> per Q-E, not Wave 7) and **#77 is counted twice (#77a in Wave 6a + #77b
> in Wave 8)** but represents 1 logical work-item with two phases. The 79
> distinct work-items are preserved; the +2 ledger discrepancy is solely
> the #77a/#77b split bookkeeping. Per
> `review-loop-2-08-cohesion-adversarial.md:413-414`: *"Reconciled item
> count: 79 (unchanged — Loop 1's items preserved; #76 moves to Wave 2;
> #77 splits temporally not as a new ID)"*.

> **Effort-total reconciliation with Loop 2 §8** (per
> `review-loop-2-08-cohesion-adversarial.md:586-598`):
>
> - Loop 2 master-sequence baseline: 484 h (77 items).
> - + #76 + #77 (Loop 3 v2): +12 h → 496 h (79 items).
> - Loop 1 A6 strict adjustments (#34 +12, #35 +4, #74a +12, #59 -4): +24 h → 520 h.
> - Loop 1 A6 borderline cushion: +18 h → 538 h.
> - Loop 2 Q-D adjustment (#76 M → L): +8 h → **546 h with cushion**.
> - Loop 2 net total: ≈ 68.25 dev-days ≈ 13.65 weeks single-dev.
> - With 30% buffer: ~18 weeks; today is 2026-05-09; project completion
>   ~2026-09-09 (interleaved review) or ~2026-10-07 (sequential review).

> **Wave 5 calendar warning**: Wave 5 at 88h is 2.2 dev-weeks. Combined
> with Wave 4's 60h doc-contract density, Weeks 6-9 are the **crunch
> period**; if Wave 4's validator partial-removal tolerance fails (open
> issue per Q-Q4), Wave 5 starts ~3 days late.

---

## Cross-references

- **Master sequence v2 (with corrections-applied table)**:
  `.planning/audits/_context/plan-loop-3-07-integration-v2.md` §2.
- **Loop 2 adversarial overrides**:
  `.planning/audits/_context/review-loop-2-08-cohesion-adversarial.md`
  Q-D, Q-E, Q-F, Q-H.
- **Effort total derivation**:
  `.planning/audits/_context/review-loop-2-06-effort-adversarial.md` and
  `review-loop-1-06-effort-audit.md:889-891`.
- **Atomic clusters source**:
  `.planning/audits/_context/plan-loop-2-01-master-dag.yaml` lines 283,
  327, 429.
- **Critical path source**:
  `.planning/audits/_context/plan-loop-2-08-master-sequence.md:155-181`.
- **Hub wave structure source**:
  `.planning/audits/_context/plan-loop-2-08-master-sequence.md:14-17`.

---

End of Phase 7 Section 2 — Master Sequence + Wave Structure + Critical
Path + Atomic Clusters + Hub Waves.
