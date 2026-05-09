# Phase 4 Loop 1 — Constructive Plan Review #6: Effort Estimate Audit

**Build commit ref**: `1ee872a4` (`main`)
**Source**: 79-item v2 master sequence (`plan-loop-3-07-integration-v2.md`)
**Prior totals**: Loop 2 declared **484 h** (`plan-loop-2-08-master-sequence.md:238`)
**Mode**: CONSTRUCTIVE — challenge S/M/L/XL effort vs realistic scope
**Effort scale recap**: S ≤2h, M 4–8h (half-day to 1d), L 8–24h (1–3d), XL >3d

---

## 1. Methodology

For each item I cite the per-domain Loop 1 plan that owns it, count file
touches, test additions, lock-TOML edits, contract entries, and any
hidden complexity flagged in the plan body. Effort numbers from the
master sequence at `plan-loop-2-08-master-sequence.md:37` are S=4h,
M=8h, L=20h, XL=40h. I evaluate the realistic effort against scope and
return CLAIM CORRECT / UNDERESTIMATE / OVERESTIMATE per item.

Quoted snippets ≤15 words; every count cites `file:line`.

---

## 2. Per-item analysis (79 items, v2 sequence order)

### Group A — ADRs (Seq 1–3)

#### Item #72 — claimed: M (ADR-011 Auth Scheme)
- Files touched: 2 (NEW ADR doc; `docs/adr/README.md` index row)
- New files: 1 (`docs/adr/ADR-011-auth-scheme-and-session-model.md`)
- Test files added: 1 (`test_adr_011_present_red.py` — section regex)
- Lock TOMLs touched: 0
- Doc files touched: 2–3 (ADR + index + optional `AGENTS.md` row)
- Capability-contract entries: 0 (Enforcement section names follow-up locks)
- Hidden complexity: must rephrase Decision-2 mock-auth wording per
  Loop B; cross-link to 8 auth-flow `_endpoint_commit_allowlist.toml`
  rows (`plan-loop-1-08-crosscut.md:579`).
- Realistic effort: M
- Verdict: CLAIM CORRECT — drafting an ADR with 9 mandatory sections plus
  one structural test is a textbook half-day.

#### Item #73 — claimed: M (ADR-012 KRI period algebra)
- Files touched: ~7 (ADR + 1 lock test + 1 new TOML + 1 behavioural
  test + 3 production files: `kri_deadline_service.py`,
  `kri_deadline_support.py`, `_config/lookup.py`)
- New files: 4 (ADR, TOML, structural lock, behavioural test)
- Test files added: 2
- Lock TOMLs touched: 1 (NEW `_kri_state_vocabulary_allowlist.toml`)
- Doc files touched: 3 (ADR, ADR README index, `_kri_history/README.md`)
- Capability-contract entries: 0 (contract not pinned)
- Hidden complexity: collapses 3 `KRIHistoryService.*` static-method
  reaches at `kri_deadline_service.py:64,77,78` into a single
  `classify` helper; removes `ConfigDefaults.REPORTING_GRACE_DAYS`;
  ADR scope is bigger than typical "doc-only" ADR.
- Realistic effort: M-LARGE (close to L; 8–10h is plausible)
- Verdict: UNDERESTIMATE BORDERLINE — should be M (top-of-range) or low-L.
  The plan itself describes ADR + lock + TOML + classify rewrite + 2
  ConfigDefaults edits + 5 doc surfaces (`plan-loop-1-04-kris.md:298-348`).
  Recommend keeping M but flagging that overrun risk is real.

#### Item #74a — claimed: M (ADR-007 census)
- Files touched: 5 NEW TOMLs (4 mandatory + 1 proposed 5th category) + 1
  classification lock test
- New files: 6 (5 TOMLs + 1 test)
- Test files added: 1 (`test_bounded_context_classification_complete_red.py`)
- Lock TOMLs touched: 5 NEW (`_bounded_context_{write_side,read_shape,
  workflow_pairs,adapters,policy}.toml` per `plan-loop-1-08-crosscut.md:646-672`)
- Doc files touched: 0 (text moves to #74b)
- Capability-contract entries: 0
- Hidden complexity: Loop B re-counted **31 packages** (Loop A had 13);
  13 unclassified orphans need developer sign-off — straw proposal
  must survive review (`plan-loop-1-08-crosscut.md:602-613,674-681`).
  Loop 3 added a "≥31 today; 32 after #61" lock-test wording fix
  (Correction B at `plan-loop-3-07-integration-v2.md:96-115`). The
  3-hop reachability check for each of the 31 packages is hand-work.
- Realistic effort: L (12–16 h)
- **Verdict: UNDERESTIMATE — should be L.** 31 packages × 3-hop audit + 5
  TOMLs + 1 lock test + straw allowlist with "post-#61" annotation +
  developer review of 13 orphan classifications is more than 8h.

---

### Group B — P1 quick wins (Seq 4–13)

#### Item #10 — claimed: S (Reject `riskhub_questionnaires.py`)
- Files touched: 2 (1 module docstring extended + 1 NEW arch test)
- New files: 1 (`test_riskhub_questionnaires_module_present_red.py`)
- Realistic effort: S — Verdict: CLAIM CORRECT.

#### Item #57 — claimed: S (Reject `quarterly_comparison_service.py` facade)
- Files touched: 7 (file delete + 1 endpoint repoint + 4 `.planning/codebase/*.md` doc anchors + 1 deepening-test rewrite)
- New files: 1 RED test
- Lock TOMLs touched: 0
- Doc files touched: 4 (`README.md` for `_quarterly_comparison`, plus
  CONVENTIONS, CONCERNS, STRUCTURE, ARCHITECTURE per
  `plan-loop-1-05-vendor-quarterly.md:166-171`)
- Hidden complexity: rewrites
  `test_quarterly_comparison_service_is_composition_facade` lock at
  `test_architecture_deepening_contracts.py:559-569`.
- Realistic effort: S (top-of-range, ~2h) — Verdict: CLAIM CORRECT.

#### Item #37 — claimed: S (replace `_can_view_governance` mirror)
- Files touched: 2 (`users/summary.py` + 1 NEW test)
- New files: 1 (`test_summary_can_view_governance.py`)
- Capability-contract entries: 1 (note `can_view_governance` SSOT in `.md`)
- Validator: YES (`scripts/security/validate_authz_capability_contract.py`)
- Hidden complexity: 7 user-fixture matrix (`admin/global` … `end_user/dept`)
  per `plan-loop-1-06-frontend.md:234`; uses `client_factory`.
- Realistic effort: S (4h is fine; the parametric matrix is the bulk)
- Verdict: CLAIM CORRECT.

#### Item #12 — claimed: S (narrow blanket-except in `users/summary.py`)
- Files touched: 1 prod + 1–2 tests
- New files: 1–2 (parity test + optional AST lock)
- Hidden complexity: Loop-B correction — real raise is
  `HTTPException(403)`, not `AuthorizationError`
  (`plan-loop-1-07-endpoints.md:67-110`). The `except (HTTPException,
  SQLAlchemyError):` tuple may need extension once registry runs.
- Realistic effort: S — Verdict: CLAIM CORRECT.

#### Item #13 — claimed: S (delete `vendor_link_helpers.py` shim)
- Files touched: 5 (1 prod delete; 4 `docs/security/authorization-capability-contract.{md,json}`
  edits at `:55,479,502,121,122` per `plan-loop-1-05-vendor-quarterly.md:28-32`)
- New files: 2 RED tests
- Capability-contract entries: 4 (`sensitive_change_paths`,
  `AUTHZ-VENDORS-READ.service_policy`, `AUTHZ-VENDORS-WRITE.service_policy`,
  + 2 MD lines)
- Validator: YES
- Hidden complexity: precedence-invariant test (403 BEFORE 409); ADR-002
  `commit_service_transaction` divergence noted at
  `plan-loop-1-05-vendor-quarterly.md:14`.
- Realistic effort: S (4h for the precedence test alone; manageable)
- Verdict: CLAIM CORRECT.

#### Item #1 — claimed: S (drop `validate_risk_type` re-export)
- Files touched: 2 (`crud/__init__.py` + 1 NEW lock test)
- Realistic effort: S — Verdict: CLAIM CORRECT.

#### Item #19 — claimed: S (consolidate risk-type validation onto policy)
- Files touched: 4 (`crud/_shared.py` delete; `crud/create.py:20`;
  2 `_context/*.md` notes)
- New tests: 2 (`test_risks_validation_parity.py` +
  `test_validate_risk_type_single_owner_red.py`)
- Realistic effort: S (≤2h — wire-parity + lock + import rewire)
- Verdict: CLAIM CORRECT.

#### Item #11 — claimed: S (`risk.process` → `risk.name` truth-in-naming fix)
- Files touched: 1 prod (`workflow.py:155`) + 1 test inversion + 2 doc notes
- Realistic effort: S (≤2h)
- Verdict: CLAIM CORRECT.

#### Item #14 — claimed: M (issues outbox-only notification cleanup)
- Files touched: 4 (`_shared/notifications.py` delete; `_shared/__init__.py`
  prune; rewrite `test_issue_workflow.py:10,679,685`)
- New tests: 1 (`test_issue_notifications_have_no_direct_send_helpers`)
- Hidden complexity: rewriting 2 test sites is "the bulk of the work"
  (`plan-loop-1-01-issues.md:151`); coordinate with #30 prune.
- Realistic effort: M — Verdict: CLAIM CORRECT.

#### Item #15 — claimed: M (add `access_user` capability surface)
- Files touched: 3 (`docs/security/capability-catalog.json`, `.md` matrix,
  + 1 NEW arch test)
- New tests: 2 (catalog presence + validator subprocess)
- Capability-contract entries: 1 NEW surface with 7 capability flags
- Validator: YES
- Hidden complexity: parity check against `architecture/test_w11_docs_index_completeness_red.py` substring assertions.
- Realistic effort: M — Verdict: CLAIM CORRECT.

---

### Group C — P2 quick wins (Seq 14–43)

#### Item #2 — claimed: S
- Files: 1 prod (`source_validation.py:117-120` 4-alias delete) + 1 lock test
- Verdict: CLAIM CORRECT.

#### Item #3 — claimed: S (delete `kriFormWorkflow.ts`)
- Files: 1 frontend delete + 1 test importer trim + 1 NEW backend lock test
- Verdict: CLAIM CORRECT.

#### Items #4 / #5 / #6 — claimed: S each (FE dead-code deletes)
- Each is 1 file delete + 1 NEW structural test
- Verdict: CLAIM CORRECT (×3).

#### Item #7 — claimed: S (delete `_get_approval_department_id` shim)
- Files: 1 prod delete (`approvals/_shared.py:17-31`) + 1 NEW lock test
- Verdict: CLAIM CORRECT.

#### Item #41 — claimed: S (delete underscore aliases in serialization.py)
- Files: 1 prod (`_issue_workflow/serialization.py:18,41`) + 1 NEW lock test
- Hidden complexity: Option A promotes `_active_exception` →
  `active_exception` in `_issue_register/serialization.py:47`
  (`plan-loop-1-01-issues.md:361`)
- Verdict: CLAIM CORRECT.

#### Item #50 — claimed: S (delete `_kri_history/submission.py`)
- Files: 1 prod delete + 1 lock-tuple entry + 5 doc citations across
  contract MD+JSON + README
- Hidden complexity: 5 doc citations is on the border of S
- Verdict: CLAIM CORRECT (top-of-range S).

#### Item #52 — claimed: S (delete `_kri_history/correction_plans.py`)
- Files: 1 prod + 2 lock-test edits at `:956,962` + 1 README
- Verdict: CLAIM CORRECT.

#### Item #53 — claimed: S (collapse `IssueWorkflowService`)
- Files: 7 call-site swaps in `execution.py:49,119,143,162,183,202,237,266`
  + delete `issue_workflow_service.py` + delete `service.py:25-44`
- Lock edits: `test_architecture_deepening_contracts.py:1192-1206` import line
- Verdict: CLAIM CORRECT (mechanical pass-through swap).

#### Item #54 — claimed: S (inline `_approval_queue/lifecycle.py`)
- Files: 2 prod (`__init__.py` + delete `lifecycle.py`)
- Test rewrites: 3 deepening contracts (`test_architecture_deepening_contracts.py:1005,1025,1041`)
- Hidden complexity: 3 lock-test rewrites move from `lifecycle` import
  to `__init__.py` source introspection
- Verdict: CLAIM CORRECT.

#### Item #75 — claimed: S (consolidate `_auto_reject_kri_approval`)
- Files: 3 prod (`results.py` host; 2 callers); 6 call-site edits
- Verdict: CLAIM CORRECT.

#### Item #18 — claimed: S (repoint `_build_approval_read`)
- Files: 3 prod (`resolve.py:61,85,102`, `detail.py:56`, `_shared.py` delete 34-61)
- New tests: response-shape parity across 4 paths returning 19 keys
- Verdict: CLAIM CORRECT.

#### Item #20 — claimed: S (risk ID generation co-location, doc-only)
- Files: 1 NEW lock test + 3 doc updates (`ENDPOINT_INVARIANTS.md` date
  bump, 2 `_context/*.md` notes)
- Verdict: CLAIM CORRECT.

#### Item #21 — claimed: S (collapse Control-Risk link loaders)
- Files: 1 prod (`link_policy.py:22-45`) + 2 callers (`link_governance.py:102,181`)
- Tests: 1 NEW lock test + behavioural regression
- Verdict: CLAIM CORRECT.

#### Item #25 — claimed: S (extract KRI department-scope helper)
- Files: 1 NEW helper in `kris/access.py` + 3 endpoint files
  (`due_soon.py:30-51`, `overdue.py:29-50`, `breaches.py:41-47`)
- Tests: 1 NEW behavioural + 1 structural lock
- Hidden complexity: behavioural test exercises 4 RBAC permutations using
  `client_factory`
- Realistic effort: S top-of-range or low-M
- Verdict: CLAIM BORDERLINE — keep S but watch for overrun.

#### Item #26 — claimed: S (delete `KRIForm.tsx` shim + ESLint pin)
- Files: 1 frontend delete + 1 page import + 4 test sites + ESLint
  config block (`eslint.config.js:145-158`) + 1 README
- Verdict: CLAIM CORRECT.

#### Item #29 — claimed: S (canonicalize `source_type_value`)
- Files: 1 helper add (`_issue_register/constants.py`) + 3 callers
  (`update_plans.py:19`, `source_mutation.py:24`, `linked_context.py:103`)
- New tests: 1 unit test
- Verdict: CLAIM CORRECT.

#### Item #33 — claimed: S (unify FE approval-queued banners)
- Files: 1 frontend delete (`KriApprovalQueuedBanner.tsx`) + 1
  `KRIFormContainer.tsx` rewrite at `:7,158-163`
- Verdict: CLAIM CORRECT.

#### Item #35 — claimed: S (delete `usePermissions` hook)
- Files: 1 hook delete + 1 `Sidebar.tsx:12` rewrite + **18 test mock files**
  (enumerated `plan-loop-1-06-frontend.md:168-185`)
- Hidden complexity: Each test file replaces `vi.mock('@/hooks/usePermissions')`
  with `vi.mock('@/contexts/AuthContext')` — Loop 3 Correction E flags
  this as 18-file double-rewrite avoidance vs #66 (`plan-loop-3-07-integration-v2.md:209-242`).
- Realistic effort: M (8h — 18 mock files × ~15min + Sidebar test = ~5h)
- **Verdict: UNDERESTIMATE — should be M.** Plan itself notes "S (per prompt;
  the 18-file mock rewrite is mechanical but voluminous)"
  (`plan-loop-1-06-frontend.md:196`). 18 files × ~15min is already 4.5h
  before the Sidebar refactor and lock TOML drop. Top-of-S is exhausted
  by the mock churn alone.

#### Item #36 — claimed: S (refactor `BusinessRouteGuards` to typed factory)
- Files: 1 prod (`BusinessRouteGuards.tsx`) + 1 NEW factory test
- Verdict: CLAIM CORRECT.

#### Item #48 — claimed: S (merge `getErrorMessageKey.ts` + `errorCodeMap.ts`)
- Files: 2 deletes + 1 NEW `errorKeys.ts` + 3 callsites (`ApiClientCore.ts:1,44,79`,
  `apiErrors.ts`)
- Verdict: CLAIM CORRECT.

#### Item #64 — claimed: S (extract `QueryClient` defaults)
- Files: 1 NEW `services/api/queryClient.ts` + `App.tsx:11-18` swap
- Verdict: CLAIM CORRECT.

#### Item #47 — claimed: S (extract session-refresh retry policy)
- Files: 1 NEW `sessionRefreshPolicy.ts` + `ApiClientCore.ts:25-30,61-72`
- Verdict: CLAIM CORRECT.

#### Item #22 — claimed: S (delete `ControlForm.tsx` shim)
- Files: 1 delete + 3 prod importers + 3 test sites
- Verdict: CLAIM CORRECT.

#### Item #23 — claimed: S (inline `controlFormUtils`)
- Files: 1 delete (`controlFormUtils.ts`) + 3 consumer files
  (`ControlFormExecutionStep.tsx:5`, `useControlFormWorkflow.ts:14`,
  `useControlFormLookups.ts:9`)
- Verdict: CLAIM CORRECT.

#### Item #55 — claimed: S (delete `access_user_service.py` facade)
- Files: 1 delete + 1 prod importer (`access.py:19,209`) + 4 contract
  edits (`md:109`, `json:106,229,229`)
- Tests: 1 NEW lock + 1 contract-validator fixture rewrite at
  `test_authz_capability_contract_validator.py:502` + delete/rewrite
  `test_architecture_deepening_contracts.py:246-257`
- Validator: YES
- Hidden complexity: positional rename `user_data` → `update_data`
  in `update_access_profile` call (`plan-loop-1-08-crosscut.md:298-300`)
- Verdict: CLAIM CORRECT (top-of-S; barely fits 4h budget).

#### Item #24 — claimed: S (atomic with #51; delete `kris/linked_vendors.py`)
- Files: 1 delete + 4 endpoint repoints + 6 contract citations stripped
  (`md:116,117,118; json:368,388,410`)
- Validator: YES
- Verdict: CLAIM CORRECT.

#### Item #51 — claimed: S (atomic with #24; delete `_kri_history/value_application.py`)
- Files: 1 delete + 3 importer repoints + 4 lock-line edits at
  `test_architecture_deepening_contracts.py:976-980,999-1000` +
  5 doc-citation strings (`md:117,118,161; json:389,411`)
- Validator: YES
- Hidden complexity: removing the `value_application_path =` definition
  + 2 `_source(value_application_path)` assertions must land in same
  commit or the test raises `FileNotFoundError`
  (`plan-loop-1-04-kris.md:187`).
- Verdict: CLAIM CORRECT (top-of-range S; combined with #24 the cluster is
  still ≤8h = M).

#### Item #56 — claimed: S (delete `directory_identity_service.py` shim, atomic with #61)
- Files touched: 1 delete (35-line shim) + **8 prod importers** + **1 script**
  (`bootstrap_sso_user.py:17`) + 4 contract edits + 2 lock test edits
- Test files added: 1 NEW lock test
- Lock TOMLs touched: 1 (validator fixture at `test_authz_capability_contract_validator.py:500`)
- Doc files touched: 3 (contract MD/JSON + `services/README.md`)
- Capability-contract entries: 4 (per `plan-loop-1-08-crosscut.md:387-403`)
- Validator: YES
- Hidden complexity: 13 names re-exported (Loop B re-count); 8 importers
  span 4 service packages; coordinated with #61's `service.py:8` rewrite
  in same diff.
- Realistic effort: S top-of-range (~4h alone), or **part of an M cluster
  with #61**.
- Verdict: BORDERLINE. The plan itself says S
  (`plan-loop-1-08-crosscut.md:417`); but combined with #61 the atomic
  pair is 12-16h (= M+M ≈ L cluster). **CLAIM CORRECT for #56 standalone**;
  see #61 below for the cluster verdict.

#### Item #61 — claimed: M (move `graph_directory_*` → `_graph_directory/`)
- Files touched: 4 file moves + 1 NEW `__init__.py` + 1 NEW `README.md` +
  1 prod importer + **2 test files with ~16 monkeypatch path strings**
- New files: 2 (package `__init__.py` + `README.md`)
- Test files added: 1 NEW package-move lock test
- Lock TOMLs touched: 1 validator fixture rewrite at `:504`
- Doc files touched: 3 (contract MD/JSON + 2 README updates)
- Capability-contract entries: 3 (`md:109`, `json:113,229`)
- Hidden complexity: ~16 monkeypatch path strings across
  `test_graph_directory_components.py` and `test_entra_confidential_credentials.py`
  (lines 51, 55, 57, 76, ~125, 109, 127, 148, 151, 153, 175, 177, 180,
  204, 206, 209 per `plan-loop-1-08-crosscut.md:485-497`); paired with
  #56 in same diff; cross-link to #74b ADR-007 amendment.
- Realistic effort: M-LARGE (close to top-of-M, 10-12h)
- Verdict: CLAIM CORRECT — but the **#56+#61 combined effort is realistically
  L (12-16h)**. If executing as separate commits of an atomic cluster, the
  M label hides 4–6h of monkeypatch churn that the plan acknowledges. The
  prompt asked specifically: "Each M (8h)?" — answer: #56 standalone is S
  (~4h). #61 standalone is M (8h). Atomic landed together is M+M ≈ L (12-16h)
  realistic. **Claim is mostly correct**, but the cluster aggregate should
  be flagged as L for scheduling.

#### Item #17 — claimed: S (inline `_monitoring_response` shim)
- Files: 1 delete + **14 endpoint importers** repointed
  (`plan-loop-1-08-crosscut.md:93-107`)
- Tests: 1 NEW lock test (file-absent + grep)
- Hidden complexity: 14 importers × `from X import Y` rewrite = 14 small edits
- Realistic effort: S top-of-range (~3.5h)
- Verdict: CLAIM CORRECT (mechanical; sequential imports).

#### Item #49 — claimed: S (inline `_control_execution/monitoring.py`)
- Files: 1 delete (11-line wrapper) + 4 callers in `link_governance.py:62,91,141,170`
- Lock edits: `test_architecture_deepening_contracts.py:188,192` (2 deletions)
- Hidden complexity: introduces `now = utc_now()` per function; the
  module + lock relaxation must land same commit
  (`plan-loop-1-07-endpoints.md:478-482`).
- Verdict: CLAIM CORRECT.

#### Item #59 — claimed: M (consolidate `_monitoring_*` packages)
- Files: 0 code moves; 2 README updates (`_monitoring_response`, `_monitoring_status`)
- Tests: 1 NEW lock test (forbidden-import + required-substring)
- Realistic effort: S-M — Verdict: OVERESTIMATE BORDERLINE. Plan itself
  says "M (could shrink to S if no code moves)" (`plan-loop-1-07-endpoints.md:634`).
  Shrink to S; save 4h.

#### Item #9 — claimed: S (delete duplicate `can_user_view_approval_resource`)
- Files: 1 prod (`_notification_approval_helpers.py:72-79,98`) + 1 import add at `:9`
- Tests: 1 NEW structural + behavioural recipient test
- Verdict: CLAIM CORRECT.

#### Item #34 — claimed: M (extract `resolve_approval_privilege_tier`)
- Files touched: **16 files** with **22+ call sites** enumerated at
  `plan-loop-1-03-approvals.md:148-164` (e.g.
  `endpoints/approvals/detail.py:47`, `notifications.py:127`,
  `users/summary.py:24-26`, `_approval_execution/authorization.py:30`,
  `_approval_queue/counts.py:12`, `_approval_queue/queries.py:28,33`,
  `_authorization_capabilities/{approvals,controls,kris,risks}.py`,
  `_entity_mutation_lifecycle/{approval_plans.py:69,162,267,
  archive_plans.py:110,186,255}`, `_kri_history/{governance.py:238,
  intake.py:42}`, `approval_execution_service.py:116,222,235,237`,
  `notification_visibility.py:78,207`)
- New files: 0 (logic added to existing `approval_scenario_policy.py`)
- Test files added: 2 (`test_approval_privilege_tier.py` parametric;
  structural assertion added to deepening contracts)
- Lock TOMLs touched: 0
- Doc files touched: 2 (capability-contract MD + JSON; new "privilege
  tier" §Vocabulary entry)
- Capability-contract entries: §Vocabulary update + AUTHZ-APPROVALS row
- Validator: YES (privilege-tier doc requires fresh validator pass)
- Hidden complexity: NEW `@dataclass(frozen=True) ApprovalPrivilegeTier`
  with 5 fields; behavioural regression test enforces parity across 3
  flows (`assert_can_approve`, `_assert_can_reject`, `get_approval_request`)
  parametrised across 8 `TIER_CAPABLE_SCENARIO_KEYS` plus a legacy
  `scenario_approver_roles is None` case
  (`plan-loop-1-03-approvals.md:143`). Plan explicitly says "this is the
  largest in-domain diff (16 files)" (`:179`).
- Realistic effort: **L (12-16h)**
- **Verdict: UNDERESTIMATE — should be L.** 22 sites × ~15min each = 5.5h
  just for mechanical migration; add the dataclass design (1h), 8-key
  parametric test matrix (3h), 16-file string-search lock (1h), capability
  contract §Vocabulary update + validator re-run (1.5h), behavioural
  triplet regression (2h) = ~14h. M (8h) is not enough; the prompt's hunch
  is correct.
- **Recommend split into 3 commits**:
  1. **#34a — Add helper + dataclass + behavioural test** (M, 6h):
     Land `ApprovalPrivilegeTier` + `resolve_approval_privilege_tier` in
     `approval_scenario_policy.py`; add the parametric test matrix; the
     16 call sites are unchanged so the test asserts parity against the
     *new* helper output vs the *old* hand-rolled ladders.
  2. **#34b — Migrate 16 call sites** (M, 6h): repoint all 22+ sites;
     add the structural lock asserting `can_resolve_approvals(current_user)`
     no longer appears in the 16 migration-target files.
  3. **#34c — Capability contract + validator** (S, 2h):
     `docs/security/authorization-capability-contract.md` §Vocabulary +
     `.json` refresh + validator passes.

#### Item #27 — claimed: M (issue-loading duplicate deletion)
- Files: 1 delete (`_shared/loading.py` 65 lines) + 4 endpoint repoints
  (`crud/contextual.py:20,95`, `crud/create.py:21,107`, `crud/detail.py:10,21`,
  `links.py:14,80,128`) + barrel prune (subset of #30) + 1 README
- Tests: 1 NEW structural lock
- Verdict: CLAIM CORRECT.

#### Item #8 — claimed: M (source-validation split)
- Files: 5 prod files repointed (`assignment.py` extended;
  `update_plans.py:9-14`; `execution.py:41-47`;
  `_shared/validation.py:11-37`; `_shared/links.py:11-80`)
- Plus: optional `git rm source_validation.py`
- Doc edits: capability contract `md:128`, `json:629`
- Tests: 1 NEW structural + behavioural pin (3-case)
- Plan estimate: "M (half-day; touches 6 files plus docs/lock)"
  (`plan-loop-1-01-issues.md:115`)
- Verdict: CLAIM CORRECT.

#### Item #28 — claimed: M (issue source-mutation triplicate collapse)
- Files: 2 prod (`update_plans.py:9-14` + `endpoints/issues/links.py:13-19,68`);
  1 delete (`_shared/links.py`); coordinate body deletes already done by #8
- Tests: 1 NEW structural lock (5-clause)
- Capability-contract edits (drop `_shared/links.py` from `service_policy`)
- Validator: YES
- Verdict: CLAIM CORRECT.

#### Item #30 — claimed: M (`_shared/__init__.py` underscore prune)
- Files: 1 barrel rewrite (drops 14 underscored re-exports) + 5 endpoint
  files renamed (consumers of 9 re-pointable underscored names) +
  capability-contract scrub
- Tests: 1 NEW structural lock
- Hidden complexity: per-name disposition table is 14 drops + 9 renames =
  23 surface decisions (`plan-loop-1-01-issues.md:298-326`).
- Realistic effort: M (top-of-range; "~half-day; touches 5 endpoint files
  plus barrel plus lock" per plan `:343`)
- Verdict: CLAIM CORRECT.

#### Item #16 — claimed: M (remove reports legacy-excel tombstones)
- Files: 1 delete (`legacy_excel.py`) + 2 endpoint route deletes
  (`audit_trail_excel.py:133-139`, `summary_excel.py:97-103`) + reports
  router edit + 4 OpenAPI parity entries + 4 protocol-probe entries +
  6 RBAC test deletions + 2 doc edits
- Tests: 1 NEW lock test (4-RED bundle)
- Verdict: CLAIM CORRECT (M is right; lots of small edits but no design
  work).

#### Item #38 — claimed: M (move 8 inline endpoint Pydantic models)
- Files: 2 NEW schema files (`schemas/health.py`, `schemas/preferences.py`);
  1 extension (`schemas/riskhub.py`); 3 endpoint rewrites
  (`health.py:16-35`, `preferences.py:15-40`, `riskhub_questionnaires.py:17-34,37,38,40,42`)
- Tests: 1 NEW AST-name-blocklist lock
- Hidden complexity: Loop 3 Correction G — rename `RiskFilters` →
  `BatchSendRiskFilters` AND update FE Zod mirror at
  `frontend/src/services/api/schemas/riskHub.ts:147` in same commit
  (`plan-loop-3-07-integration-v2.md:302-333`).
- Realistic effort: M (top-of-range, 8h)
- Verdict: CLAIM CORRECT — the FE Zod bundling is the new wrinkle
  but it's a 1-line rename + 1 type assert.

#### Item #31 — claimed: M (extract vendor reporting row formatters)
- Files: 1 service extension (`_vendor_governance/reports.py:7`) + 1
  endpoint trim (`vendor_reports.py:36-119,146,170`)
- Tests: 2 NEW (functional equivalence + endpoint owner-check)
- Verdict: CLAIM CORRECT.

#### Item #32 — claimed: M (extract generic vendor linked-entity tab)
- Files: 2 NEW (`useVendorLinkedEntityTab.ts`, `VendorLinkedEntityTab.tsx`)
  + 3 tab refactors (`VendorLinkedRisksTab.tsx`, `VendorLinkedControlsTab.tsx`,
  `VendorLinkedKRIsTab.tsx`)
- Tests: 2 NEW (contract + duplication-budget)
- Hidden complexity: generic typing `useVendorLinkedEntityTab<TEntity, TLinkPayload>`
  with 5-field `VendorLinkedEntityConfig` shape
- Verdict: CLAIM CORRECT.

#### Item #43 — claimed: M (audit adapter-emitter helper)
- Files: 1 NEW (`core/audit/_emit.py`) + **37 adapter call sites** across
  6 audit modules (`risk.py`, `control.py`, `kri.py`, `issue.py`,
  `approval.py`, `vendor.py`)
- Tests: 2 NEW (adapter-emitter helper + behavioural)
- Hidden complexity: Loop B re-counted 37 rows (Phase 1 said 38);
  preserve module-level `def`s for `architecture/test_w7_audit_adapter_completeness_red.py:13`
- Realistic effort: M (top-of-range; 37 sites × ~10min mechanical = 6h)
- Verdict: CLAIM CORRECT (M; close to top-of-range).

#### Item #44 — claimed: M (centralize guarded path-prefix registry)
- Files: 1 NEW TOML (`_router_registry.toml`); optional `router.py` refactor
  deferred to follow-up
- Tests: 1 NEW lock test (registry parity)
- Hidden complexity: dual-router support for `risk_questionnaires` registered
  twice (`router.py:44,60`); 27 `include_router` calls (Phase 1 said 28)
- Verdict: CLAIM CORRECT.

#### Item #42 — claimed: S (`ActorPayloadModel` shared base)
- Files: 1 prod (`outbox/payloads.py` — insert base class + 6 inheritance edits)
- Tests: 1 NEW structural test
- Verdict: CLAIM CORRECT.

#### Item #58 — claimed: M (delete `OrphanedItemService` facade)
- Files: 1 delete (`orphaned_item_service.py`) + 7 endpoint call-site
  rewrites (`endpoints/orphaned_items.py:45,70,119,120,147,164,187`) + 1
  static-method-class delete (`_orphaned_items/service.py:20`)
- Tests: 1 NEW lock test
- Verdict: CLAIM CORRECT.

#### Item #63 — claimed: M (instrument outbox dispatch with `SchedulerJobRun`)
- Files: 1 prod (`outbox/dispatcher.py` 110 lines) + preserve
  `_outbox_dispatch_state` runtime state
- Tests: 1 NEW behavioural + 1 optional lock
- Hidden complexity: ledger-flood policy decision ("only when
  `processed > 0`"), reuse or new `execute_tracked_job_when_processed`
  helper, ADR-002 line refresh
- Verdict: CLAIM CORRECT.

---

### Group D — P3 medium tier (Seq 64–69)

#### Item #46 — claimed: L (promote resource query-key factories)
- Files touched: **45 inline `queryKey:` literals across 22 files**
  (per `plan-loop-1-06-frontend.md:282,288`)
- New files: ~10 NEW per-domain factory modules
  (`frontend/src/lib/queryKeys/{risks,controls,vendors,kris,issues,
  dashboard,admin,riskHub,audit,governance,notifications}.ts`)
- Test files added: 1 NEW invariant test
- Lock TOMLs touched: 1 (`_naming_allowlist.toml` registers new modules)
- Doc files touched: 1 (`frontend/src/lib/README.md`)
- Hidden complexity: per-domain commits recommended (~10 commits) per
  `plan-loop-1-06-frontend.md:297`; mechanical but volume-heavy
- Realistic effort: L (16-20h)
- Verdict: CLAIM CORRECT (L is right; volume = real work). 45 sites × ~12min
  + 10 NEW factory modules × ~30min = ~14h, plus invariant test scaffold +
  per-domain commits × structure overhead = 18-20h.

#### Item #65 — claimed: M (extract `crudCapabilitySchema` shared Zod base)
- Files: 1 NEW Zod base (`crudCapabilitySchema.ts`); 4 entity refactors
  (`risks.ts`, `controls.ts`, `kris.ts`, `vendors.ts`)
- Tests: 2 NEW (snapshot per-entity field counts + issues-not-extending guard)
- Hidden complexity: snapshot LOCKS catalog field counts (risks 19,
  controls 20, kris 14, vendors 14) — Loop B said issues schema is
  structurally distinct and stays unchanged
- Realistic effort: M
- Verdict: CLAIM CORRECT.

#### Item #67 — claimed: M (extract generic `useResourcePanelQuery`)
- Files: 1 NEW (`useResourcePanelQuery.ts`); 1 refactor
  (`useRiskHubConfigResource.ts:79-179` → ≤60 lines)
- Tests: 1 NEW contract test
- Verdict: CLAIM CORRECT.

#### Item #39 — claimed: M (replace `admin/capabilities.py` static stub)
- Files: 1 NEW (`_authorization_capabilities/admin.py`); 1 endpoint rewrite
  (`admin/capabilities.py:14-22`)
- Tests: 2 NEW (catalog snapshot + RBAC matrix + structural)
- Capability-contract entries: 4 admin capability keys against
  `admin_console`; pin authoritative truth tables in
  `docs/security/{authorization-capability-contract,capability-catalog}.json`
- Validator: YES
- Hidden complexity: per-role boolean derivation of 4 admin capabilities
  (logic that the static stub elides); plan light on detail at
  `plan-loop-1-06-frontend.md:262-275`. The "real builder" must consult
  `User.role`/`User.access_scope` and any admin-tier predicates.
- Realistic effort: M (top-of-range; 8h is plausible if the role-tier
  predicates are simple booleans; could slide to L if scope/dept logic
  is needed).
- Verdict: CLAIM BORDERLINE — keep M but monitor. Risk of slide to L is real.

#### Item #40 — claimed: M (re-cluster admin sub-routers)
- Files: 4 NEW sub-routers (`telemetry.py`, `sessions.py`, `directory.py`,
  `data_quality.py`) + 1 delete (`capabilities.py`) + 1 rename
  (`directory_sync.py` → `directory.py`) + `__init__.py` rewrite
- Tests: 2 NEW (clustering + 21-route snapshot)
- Hidden complexity: 7 routes (Loop B-corrected; plan said 8); merge
  console.py + structured_logs.py into telemetry.py; orphans.py +
  snapshots.py + log_config.py into data_quality.py
- Verdict: CLAIM CORRECT.

#### Item #62 — claimed: M (relocate `kri_vendor_assignment.py` + per-row audit)
- Files: 1 file rename (`kri_vendor_assignment.py` →
  `_vendor_links/kri_assignment.py`) + 1 service rewrite (replace direct
  `db.add(VendorRiskLink/VendorKRILink)` at `:91-102,104-117` with per-row
  `link_vendor_target`/`unlink_vendor_target` calls) + 4 importer pivots
  (`kris/crud/create.py:16`, `_approval_execution/kri_generic_edit.py:16`,
  `_entity_mutation_lifecycle/{direct_apply.py:23,policy.py:22}`)
- Tests: 3 NEW (audit-cardinality + relocation lock + no-direct-mutation lock)
- Lock TOMLs touched: 1 (`test_w4_bc_c_vendor_governance_boundaries_red.py:16`)
- Doc files touched: 2 (capability-contract MD `:172` + JSON if mentioned)
- Hidden complexity: per-row vs roll-up audit cardinality decision is the
  whole point; plan documents it in the new ADR-012 cross-reference
  (`plan-loop-1-04-kris.md:233-243`). The behavioural test asserts 3 + 1 + 1
  events for a 3→2-vendor reassignment.
- Realistic effort: M (top-of-M, 8h; close to L if audit-cardinality test
  scaffolding is harder than expected)
- Verdict: CLAIM CORRECT.

---

### Group E — NEW (Loop 3 A7 corrections)

#### Item #76 — claimed: M (migrate 8 auth-flow `db.commit` sites)
- Files touched: 8 prod (`auth/refresh.py:177`, `auth/logout.py:101,132`,
  `auth/sso.py:170`, `auth/_sso_helpers.py:48`, `auth/password.py:128,161`,
  `auth/demo.py:67`)
- New files: 0 (service-owned-tx pattern reused)
- Test files added: 1 (integration test asserting outbox + service-tx invariant)
- Lock TOMLs touched: 1 (`_endpoint_commit_allowlist.toml` rows removed
  per migration)
- Doc files touched: 1 (ADR-002 line refresh if needed)
- Capability-contract entries: 0
- Hidden complexity: Loop 3 v2 §8.1 explicitly flagged — "8 auth/ sites
  may have transactional coupling that takes longer than 30 min/site"
  (`plan-loop-3-07-integration-v2.md:609-611`).
- Realistic effort: M (top-of-range; 8h plausible) or L if any site has
  cross-session lock or logout-suppression coupling
- Verdict: CLAIM BORDERLINE — keep M but flag spike risk. **Recommend a
  ½-day spike before commit-time** to confirm ~30min/site holds. Loop 4
  is explicitly tagged for this.

#### Item #77 — claimed: S (prune `Vendor.status` from FE TS + Zod)
- Files: 2-3 (`frontend/src/types/vendor.ts`, `frontend/src/services/api/schemas/*.ts`)
- New files: 0
- Test files added: 0 (TypeScript compile + existing Zod tests)
- Lock TOMLs touched: 0
- Doc files touched: 0
- Capability-contract entries: 0
- Hidden complexity: depends on how many TS consumers reference
  `vendor.status`; Loop 3 says "TS-only; no contract validator change"
  (`plan-loop-3-07-integration-v2.md:278`). Very few hits expected.
- Realistic effort: S (≤2-3h) — verdict depends on cascade depth
- Verdict: CLAIM CORRECT — pending grep verification at landing time.
  Loop 3's prediction of "few schema refs" is reasonable; risk of cascade
  is low because `Vendor.status` is API-payload-derived, not domain-modelled
  on the frontend.

---

### Group F — P4 deferred (Seq 71–78)

#### Item #45a — claimed: M (ownership prerequisite characterization tests)
- Files: 0 prod; 3 NEW test files
  (`test_ownership_resolver_kri_archived_asymmetry.py`,
   `test_ownership_resolver_control_join.py`,
   `test_visible_ids_via_ownership.py`)
- Hidden complexity: 9-role × {archived/non-archived/link-present/owner-match}
  fixture matrix at `plan-loop-1-08-crosscut.md:177-184`; visible-ids
  test is "the long pole".
- Realistic effort: M (top-of-range, 8h)
- Verdict: CLAIM CORRECT.

#### Item #45b — claimed: M (ownership resolver factory)
- Files: 1 NEW (`_ownership_factory.py`) + `ownership.py` rewrite
  (8 free fns → factory) + `entity_access.py:21,23,48` checks
- Tests: 1 NEW factory-equivalence (#45a's 3 stay green)
- Verdict: CLAIM CORRECT.

#### Item #66 — claimed: M (split `AuthContext.tsx` into providers)
- Files: 3 NEW (`SessionContext.tsx`, `PreferencesContext.tsx`,
  `AuthActionsContext.tsx`); 1 rewrite (`AuthContext.tsx` → facade)
- Tests: 2 NEW (re-render isolation + `useAuthActions`); 4 existing must
  pass through (`AuthBootstrapConfig.test.tsx`, `AuthBootstrapRouteGuard.test.tsx`,
  `AuthLogoutFlow.test.tsx`, `AuthSessionAuthority.test.tsx`)
- Hidden complexity: re-render isolation requires careful `useMemo`/`useCallback`
  patterns to avoid the current "fresh object every render" bug
  (`plan-loop-1-06-frontend.md:411,564`); 4-commit boundary recommended.
- Realistic effort: M-LARGE (~10-12h)
- Verdict: CLAIM BORDERLINE — keep M but watch; could slide to L. Splitting
  into 3 commits per provider + 1 facade collapse is the plan-recommended
  approach.

#### Item #68 — claimed: M (introduce `WidgetShell` + scoped query selector)
- Files: 1 NEW (`WidgetShell.tsx`); 1 extension (`DashboardFilterContext.tsx`
  with `useDashboardFilterSelector<T>`); refactor 6 filter-aware widgets +
  optional 15 non-filter widgets
- Tests: 2 NEW (shell contract + scoped selector re-render)
- Hidden complexity: Loop B-corrected widget counts (21 total, 6 use
  filters); 3-commit boundary recommended (`plan-loop-1-06-frontend.md:473`).
- Realistic effort: M (top-of-range)
- Verdict: CLAIM CORRECT.

#### Item #60 — claimed: M (introduce `PrivilegeContext`)
- Files: 1 prod (`backend/app/api/deps.py`) + signatures of 6+ services
  (`_authorization_capabilities/{approvals,risks,controls,kris}.py`,
  `_approval_queue/{queries,counts}.py`)
- Tests: 2 NEW (`test_privilege_context.py` + structural lock)
- Capability-contract entries: §Privilege context update
- Validator: YES
- Hidden complexity: optional `privilege: PrivilegeContext | None = None`
  parameter on 6 functions for backward-compat with non-FastAPI callers
  (`plan-loop-1-03-approvals.md:229`); largest authorization-pathway change.
- Realistic effort: M-LARGE (top-of-M, 8-10h)
- Verdict: CLAIM CORRECT.

#### Item #71 — claimed: M (merge `services/session/` 8 files → 4)
- Files touched: 5 deletes (`bootstrap.ts`, `manager.ts`, `sso.ts`,
  `refreshHint.ts`, `logoutSuppression.ts`); 2 NEW (`sessionStorage.ts`,
  `coordinator.ts`); barrel rewrite (`index.ts`); 1 importer
  (`ApiClientCore.ts:2-4`)
- New files: 2
- Test files added: 4 NEW (`sessionStorage.merged.test.ts`,
  `coordinator.merged.test.ts`, `coordinator.singleFlight.test.ts`,
  structural assertion)
- Lock TOMLs touched: 1 (`_naming_allowlist.toml`)
- Doc files touched: 1 (`services/session/README.md`)
- Capability-contract entries: 0
- Hidden complexity: **module-scope state preservation** (`refreshInFlight`,
  `lastRefreshFailureAt`, `REFRESH_FAILURE_COOLDOWN_MS`) is the highest
  landing-time risk; 3-commit boundary recommended; depends on #47 +
  #66 + ADR-011 (`plan-loop-1-06-frontend.md:481-503`).
- Realistic effort: M (8h is right boundary; merge could be all day)
- Verdict: CLAIM CORRECT — M is the right boundary; the prompt's hunch
  ("merge could be all day; M is right boundary") is exactly right.

#### Item #69 — claimed: L (introduce `AbstractVendorLink` mixin)
- Files touched: 1 NEW mixin (`_vendor_link_mixin.py`); 3 model rewrites
  (`vendor_risk_link.py:16`, `vendor_control_link.py:16`,
  `vendor_kri_link.py:16`); 1 NEW Alembic revision
- New files: 2 (mixin + Alembic)
- Test files added: 2 NEW (`test_vendor_link_mixin_red.py` model-shape +
  `test_vendor_link_cascade_postgres_red.py` Postgres-lane)
- Lock TOMLs touched: 1 review (`_archive_allowlist.toml`)
- Doc files touched: 4 (`models/README.md`, `_vendor_links/README.md`,
  ADR-005 archive-state, ADR-010 forward-only ledger)
- Capability-contract entries: 0
- Hidden complexity: Postgres-lane rehearsal **mandatory** (forward-only
  per ADR-010); ~70 existing constructor/select sites must still pass
  with the mixin (`plan-loop-1-05-vendor-quarterly.md:213`); 4 FK rebuilds
  with `ON DELETE CASCADE` (`vendor_risk_links.{vendor_id,risk_id}`,
  `vendor_control_links.{vendor_id,control_id}`); pre-merge snapshot
  rehearsal on Postgres replica.
- Realistic effort: **L (24h+) or borderline XL**
- **Verdict: UNDERESTIMATE BORDERLINE — should be high-L or low-XL.** L is
  20h baseline; this includes mixin design (2h) + 3 model rewrites (1.5h) +
  Alembic revision authoring (3h) + Postgres lane CI setup if not present
  (4h) + Postgres rehearsal cycle (4h) + 70-test smoke verification (4h) +
  2 Postgres-lane RED tests (2h) + 4 doc/ADR updates (3h) + bundling
  coordination with #70 (1.5h). Total ~25h. This sits at L's upper
  boundary (24h) and could spill to XL if any of the 70 tests regresses
  or the Postgres lane needs CI plumbing. **Bundled with #70 (M, 8h)**,
  the cluster is realistic at **28-32h ≈ L+ or low-XL**. The plan-text
  effort summary at `plan-loop-1-05-vendor-quarterly.md:317` says
  "Bundle (#69+#70): Single migration window — L". Loop 2 master sequence
  also has #69=L+#70=M, so cluster = 28h, but this is on the edge.
- **Recommend label: keep #69 = L** with explicit "Postgres rehearsal
  cycle" budget and **escalate cluster aggregate to L+ (28h)** in the
  schedule.

#### Item #70 — claimed: M (drop `Vendor.status` enum)
- Files touched: ~14 prod files
  (`models/vendor.py:22-23,82`, `models/__init__.py:34,80`,
  `schemas/vendor.py:12-13,53,83`, `models/_archivable.py:60-65`,
  `_register_listings/vendors.py:53,89,103,131,161,200,273,482,516`,
  `_monitoring_response.py:219`, `_register_listings/{controls.py:554,
  risks.py:430}`, `_reporting/exports/rows.py:120`,
  `_kri_history/direct_application.py:36`, `seed_e2e_vendors.py:35,56,77,98,119,140`,
  `seed_e2e_archives.py:283`)
- New files: 1 NEW Postgres-lane test
  (`test_vendor_status_column_dropped_postgres_red.py`)
- Test files added: 2 NEW + 5 existing test edits (`test_e2e_seed_archive_state_red.py`,
  `test_w8b_archivable_encapsulation_red.py`,
  `test_w4_bc_c_vendor_governance_domain_errors_red.py:7,37`,
  `test_dashboard.py:960,970,980`, `test_vendors.py:436`)
- Lock TOMLs touched: 1 review
- Doc files touched: 5 (`docs/README.md:111-112`, `DOCUMENTATION_TREE.md:84`,
  ADR-005, ADR-010, `BUSINESS_LOGIC.md:619`)
- Hidden complexity: 9 prod sites + 6 seed dicts; bundled in #69's
  Alembic revision (column drop + CASCADE rebuilds in same upgrade
  function); column-drop must occur AFTER cascade rebuilds in same
  migration. Plan says "M (bundled with #69 L → effective L for the
  bundle)" (`plan-loop-1-05-vendor-quarterly.md:272`).
- Realistic effort: M (8h standalone) or **part of #69's L bundle**
- Verdict: CLAIM CORRECT for the M label of standalone effort. **Bundled
  with #69**, the combined effort is L+ (28h). Accept M for accounting;
  schedule #69+#70 as a single L+ migration window.

---

## 3. Summary tables

### 3.1 Items with verdict UNDERESTIMATE (≥1 tier off)

| ID | Claimed | Realistic | Why |
|---|---|---|---|
| **#34** | M (8h) | **L (12-16h)** | 16 files / 22+ sites + dataclass + parametric matrix + capability §Vocabulary + validator |
| **#35** | S (4h) | **M (5-7h)** | 18 mock files × ~15min = 4.5h before Sidebar refactor |
| **#74a** | M (8h) | **L (12-16h)** | 31 packages + 5 NEW TOMLs + 13-orphan classification dev review + 3-hop audit |

### 3.2 Items at top-of-claim with overrun risk (BORDERLINE)

| ID | Claimed | Watch for | Risk |
|---|---|---|---|
| #56+#61 cluster | S+M (12h) | M+M ≈ L (12-16h) | 16 monkeypatch path strings; cluster aggregate is L not M |
| #66 | M (8h) | could slide to L (10-12h) | 3 NEW providers + 4-commit boundary + memoisation invariants |
| #69 | L (20h) | L+ (24-28h) or low-XL | Postgres rehearsal + 70-test smoke + Alembic complexity |
| #69+#70 bundle | L+M = 28h | L+ (28-32h) | Single migration window aggregate |
| #76 | M (8h) | could slide to L (10-14h) | Loop 3 §8.1: "transactional coupling >30 min/site" risk |
| #73 | M (8h) | M-LARGE (8-10h) | ADR + lock + TOML + classify rewrite + ConfigDefaults edits |
| #59 | M (8h) | could shrink to S (4h) | Plan itself says "could shrink to S if no code moves" |
| #39 | M (8h) | could slide to L if scope/dept logic | Light plan detail on per-role boolean derivation |

### 3.3 Items overestimated (≥1 tier high) — narrow finding

| ID | Claimed | Realistic | Why |
|---|---|---|---|
| #59 | M (8h) | S (4h) | Plan: 0 code moves, 2 README + 1 lock test only |

### 3.4 Items where claim is correct (no change)

All other 73 of 79 items: claims correct.

---

## 4. Revised total effort

### 4.1 Loop 2 baseline

`plan-loop-2-08-master-sequence.md:238`: **484 h** for 77 items.
Loop 3 added #76 (M=8h) and #77 (S=4h) → **496 h** for 79 items.

### 4.2 Adjustments

| ID | Direction | Δ hours |
|---|---|---|
| #34 | M → L | +12 (8 → 20) |
| #35 | S → M | +4 (4 → 8) |
| #74a | M → L | +12 (8 → 20) |
| #59 | M → S | -4 (8 → 4) |
| **Net** | | **+24 h** |

### 4.3 Borderline cushion (recommended for risk buffer)

| ID | Cushion | Δ hours |
|---|---|---|
| #56+#61 cluster | +4 (M+M → L) | +4 |
| #66 | +4 (M → M-large) | +4 |
| #69 | +4 (L → L+) | +4 |
| #76 | +4 (M → M-large) | +4 |
| #73 | +2 | +2 |
| #39 | +0 (keep M, watch) | +0 |

**Borderline cushion total**: **+18 h** (recommended buffer; not certain
overruns).

### 4.4 Revised totals

- **Strict revised**: 496 + 24 = **520 h** ≈ 65 dev-days ≈ 13 weeks
- **With borderline cushion**: 520 + 18 = **538 h** ≈ 67 dev-days ≈ 13.5
  weeks
- **Loop 2 grand total of 484 h was 7-12 % low** depending on borderline
  treatment.

---

## 5. Items recommended for commit-split

| ID | Recommended split |
|---|---|
| **#34** | (a) `add helper + dataclass + behavioural test` (M, 6h); (b) `migrate 16 sites + structural lock` (M, 6h); (c) `capability-contract §Vocabulary + validator` (S, 2h). 3 commits totalling ~14h. |
| **#46** | Per-domain commits already recommended in plan: 1 commit per of 11 domains + 1 finalisation commit (12 commits). Mechanical, reviewable independently. |
| **#66** | Already 4-commit plan: SessionProvider + PreferencesProvider + AuthActionsProvider + facade collapse. Keep as-is. |
| **#68** | Already 3-commit plan: WidgetShell + scoped selector + remaining widget adoption. Keep. |
| **#71** | Already 3-commit plan: sessionStorage merge + coordinator merge + barrel rewire. Keep. |
| **#74a/#74b** | Already 2 commits: census TOMLs (#74a L) → ADR text (#74b M). #74a's overrun warrants formal split into "TOML scaffolding + structural test" (M, 8h) + "13-orphan classification audit" (M, 8h) within #74a itself. |
| **#69+#70** | **Bundle is mandatory** per plan (single migration window). Inside the bundle: (1) mixin file + 3 model rewrites; (2) Vendor.status drop in 14 files; (3) Alembic revision; (4) Postgres rehearsal. Each substep is a "logical sub-commit" but lands as a single git commit per ADR-010 single-migration-window rule. |

---

## 6. Constraint cross-checks

- **TDD red-first**: every plan opens with the failing-first artefact;
  effort numbers include test-writing time.
- **Single sequential developer**: parallel work assumptions absent;
  totals scale linearly.
- **Doc/lock-only Reject invalid**: #10 and #57 still have effort >0
  (S each) for doc anchor scrubs and lock rewrites — counted.
- **Defers planned, not skipped**: #45a/b, #60, #66, #68, #69, #70, #71
  all have full effort attribution.

---

## 7. Conclusion

Loop 2's 484 h baseline (Loop 3 v2 = 496 h with #76/#77 additions) is
**7-12 % low**. The dominant correction is **#34** (8h → 20h, +12h):
the privilege-tier extraction is genuinely the largest in-domain refactor
in the plan and the M label hides 16-file fan-out and capability-contract
work. **#74a** (M → L, +12h) is the second-largest miss: 31-package
classification census across 5 NEW TOMLs needs a full day plus dev review.
**#35** (S → M, +4h) is the cleanest one-tier UNDERESTIMATE — 18 mock
files cannot fit into 4h.

Net revised: **520 h strict; 538 h with borderline cushion**.

Recommend splitting **#34 into 3 commits** (helper+test → migration →
contract) to keep individual diff sizes within 8h windows; **#74a into 2
internal substeps** (scaffolding → orphan classification); and treating
**#69+#70 as a single L+ (28-32h) migration window** rather than L+M=28h.

End of audit.
