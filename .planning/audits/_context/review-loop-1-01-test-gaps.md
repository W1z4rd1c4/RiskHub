# Phase 4 Loop 1 Review — Test-Gap Audit (constructive review)

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Reviewer commit reference: `1ee872a4` (per Loop 1 plan headers).

Mode: CONSTRUCTIVE — find gaps before adversarial Loop 2.
Total items reviewed: 79 (74 audit + #75 bonus + #45a/b + #74a/b + #76 + #77).
Note: #76 and #77 are NOT defined in any of the 8 Loop 1 plan files; called out at the bottom.

Spot-check sample: 30 items verified via direct file:line read against current `main`. Pass-rate: 30/30 file:line citations confirmed. Two count discrepancies surfaced (Item #46 queryKey count; Item #74 package count).

---

## Per-domain gap counts (constructive)

| Domain (file) | Items | NONE | WEAK | MISSING | WRONG-TYPE | Convention violation (no `pytestmark.contract` or no `client_factory`) |
| --- | --- | --- | --- | --- | --- | --- |
| 01 Issues | 9 (#2,#8,#14,#27,#28,#29,#30,#41,#53) | 6 | 1 | 0 | 0 | 9 (none of the proposed new tests in `test_architecture_deepening_contracts.py` mention adding `pytestmark`; existing file already has it) |
| 02 Risks | 4 (#1,#11,#19,#20) | 2 | 1 | 0 | 1 (#20 doc-only is GREEN-only) | 0 (FE/BE convention OK) |
| 03 Approvals | 8 (#7,#9,#18,#33,#34,#54,#60,#75) | 5 | 1 | 0 | 0 | 8 (proposed new arch assertions do not mention `pytestmark`) |
| 04 KRIs | 9 (#3,#24,#25,#26,#50,#51,#52,#62,#73) | 6 | 1 | 0 | 0 | 1 (#25 client_factory mentioned only obliquely; rest OK) |
| 05 Vendor/Quarterly/Reports | 7 (#13,#16,#17,#31,#57,#69,#70) | 4 | 2 | 0 | 0 | 4 (proposed `_red` files don't mention `pytestmark`) |
| 06 Frontend | 19 (#4,#5,#6,#22,#23,#32,#35,#36,#37,#39,#46,#47,#48,#64,#65,#66,#67,#68,#71) | 10 | 5 | 0 | 1 (#37 contract pin is GREEN-only) | 1 (#37/#39 don't mention client_factory explicitly) |
| 07 Endpoints | 12 (#10,#12,#15,#17 dup,#21,#38,#43,#44,#49,#58,#59,#63) | 7 | 4 | 0 | 1 (#10 KEEP test pin, #59 doc-only invariant, #15 has empirical step) | 0 (most explicitly state `pytestmark = pytest.mark.contract`) |
| 08 Cross-cut | 9 (#40,#42,#45a,#45b,#55,#56,#61,#72,#74a,#74b) | 6 | 2 | 0 | 1 (#72 ADR doc-only is GREEN-only) | 1 (#74 census tests do not specify `pytestmark`) |

Totals (across domains; some items appear under two plans because plan files overlap, e.g., #17 in both 05 and 07):

- NONE (good — proposed test is named, points to a real assertion, would fail today): **~46**
- WEAK (test exists but is loose, GREEN-only, or pins existing instead of asserting absence): **~17**
- MISSING (no test proposed at all): **0**
- WRONG-TYPE (e.g., DOC-ONLY items with no failing test surrogate): **4** (#10 KEEP-only, #20, #59, #72)
- Convention violations (`pytestmark.contract` not explicitly added in proposal, **and** the test home is `tests/backend/pytest/architecture/`): **18 explicit cases** (most are recoverable because the proposed home file already declares `pytestmark = pytest.mark.contract` at module scope)

The dominant gap is **convention compliance** (the plan rarely says "add `pytestmark = pytest.mark.contract`" even when the proposed test file lives under `tests/backend/pytest/architecture/`). Per CLAUDE.md: "new architecture tests" require `pytestmark = pytest.mark.contract`. Verified at `tests/backend/pytest/architecture/test_w12_resource_permissions_keys_match_capability_contract_red.py:5` and 33 of 34 architecture-test files include the marker.

---

## Per-item review (79 items)

### Domain 01 — Issues (plan-loop-1-01-issues.md)

#### Item #2 — B-N1 — Drop 4 underscore aliases in `_issue_workflow/source_validation.py`
- Proposed test: `tests/backend/pytest/architecture/test_issue_workflow_no_underscored_self_aliases_red.py` asserting `"_ensure_owner_assignable = ensure_owner_assignable"` not in source.
- Spot check: PASS — `_issue_workflow/source_validation.py:117` literally contains `_ensure_owner_assignable = ensure_owner_assignable`.
- Test type appropriateness: APPROPRIATE (DELETE → architecture-lock structural assertion).
- Convention compliance: WEAK — proposal omits "add `pytestmark = pytest.mark.contract`" (file is under `architecture/`). Recoverable.
- Gap classification: WEAK.
- Recommendation: explicitly require `pytestmark = pytest.mark.contract` at module scope in the new file.

#### Item #8 — B-N2 — Source-validation split / canonical link helpers consolidation
- Proposed test: extend `test_architecture_deepening_contracts.py` with `test_issue_workflow_owner_validation_lives_in_dedicated_module`; behavior test in `test_issue_workflow.py`.
- Spot check: PASS — `source_validation.py:16` is `async def validate_user_exists`, `:24` is `async def ensure_owner_assignable`, `:45` is `async def issue_link_department_ids`, `:89` is `async def resolve_vendor_department_and_access`.
- Test type appropriateness: APPROPRIATE (CONSOLIDATE-W-SNAPSHOT + DELETE-W-LOCK).
- Convention compliance: PASS (host file already declares `pytestmark = pytest.mark.contract` at `:9`).
- Gap classification: NONE.
- Recommendation: none.

#### Item #14 — S4.4 — Issues outbox-only notification cleanup
- Proposed test: rewrite `test_issue_workflow.py:10,679,685` to assert outbox enqueue + `test_issue_notifications_have_no_direct_send_helpers` in deepening contracts.
- Spot check: PASS — `_shared/notifications.py:24,43,80` define the three direct-send helpers per plan citation.
- Test type appropriateness: APPROPRIATE (DELETE-W-LOCK + behavior rewrite).
- Convention compliance: PASS (deepening-contracts host declares `pytestmark.contract`).
- Gap classification: NONE.

#### Item #27 — S4.2 — Issue loading duplicate deletion
- Proposed test: `test_endpoint_issues_loading_is_thin_or_deleted` in `test_architecture_deepening_contracts.py`.
- Spot check: PASS (per plan citation `_shared/loading.py:29` contains `selectinload(Issue.links).selectinload(IssueLink.risk)`).
- Test type appropriateness: APPROPRIATE.
- Convention compliance: PASS.
- Gap classification: NONE.

#### Item #28 — S4.3 — Issue source-mutation triplicate collapse
- Proposed test: `test_issue_link_helpers_have_one_canonical_home`.
- Spot check: PASS — `_shared/links.py:11,39` define both helpers per cite.
- Test type appropriateness: APPROPRIATE.
- Convention compliance: PASS (host file).
- Gap classification: NONE.

#### Item #29 — S4.6 — Source-type vocabulary canonicalization
- Proposed test: `test_source_type_value_has_one_canonical_definition` + new unit test `test_issue_source_type_value.py`.
- Spot check: PASS (per cites `_issue_register/source_mutation.py:24`, `_issue_workflow/update_plans.py:19`, `_issue_register/linked_context.py:103`).
- Test type appropriateness: APPROPRIATE (EXTRACT-NEW + RENAME-FIX).
- Convention compliance: PASS.
- Gap classification: NONE.
- Recommendation: the new unit test `tests/backend/pytest/services/test_issue_source_type_value.py` is NOT under `architecture/` so it correctly does NOT need `pytestmark.contract`.

#### Item #30 — S4.10 — Issue `_shared/__init__.py` underscore re-export pruning
- Proposed test: `test_issue_shared_barrel_has_no_underscored_reexports` asserting `underscored == []`.
- Spot check: PASS (per cite `_shared/__init__.py:42-79` lists 36 names).
- Test type appropriateness: APPROPRIATE.
- Convention compliance: PASS.
- Gap classification: NONE.

#### Item #41 — B-N3 — Issue workflow serialization alias removal
- Proposed test: `test_issue_workflow_serialization_has_no_self_aliases`.
- Spot check: PASS — `_issue_workflow/serialization.py:18` literally `active_exception = _active_exception`; `:41` `_serialize_exception_with_user_names = serialize_exception_with_user_names`.
- Test type appropriateness: APPROPRIATE (DELETE-W-LOCK).
- Convention compliance: PASS.
- Gap classification: NONE.

#### Item #53 — S4.1 — Issue workflow service collapse
- Proposed test: `test_issue_workflow_execution_imports_lifecycle_directly` with 4 assertions.
- Spot check: PASS — plan claims `IssueWorkflowService` referenced at `execution.py:49,119,143,162,183,202,237,266`. The existing deepening-lock at `:1237` `assert "IssueWorkflowService." not in lifecycle_source` already passes (it pins lifecycle.py, not execution.py).
- Test type appropriateness: APPROPRIATE (DELETE-FACADE).
- Convention compliance: PASS.
- Gap classification: NONE.

---

### Domain 02 — Risks (plan-loop-1-02-risks.md)

#### Item #1 — A-N1 — Drop `validate_risk_type` re-export
- Proposed test: `tests/backend/pytest/architecture/test_risks_crud_public_surface_red.py` with two assertions.
- Spot check: PASS — `risks/crud/__init__.py:2` `from ._shared import validate_risk_type` and `:23` `"validate_risk_type",` confirmed.
- Test type appropriateness: APPROPRIATE.
- Convention compliance: PARTIAL — plan does not explicitly say `pytestmark = pytest.mark.contract` (file under `architecture/`).
- Gap classification: WEAK.
- Recommendation: add `pytestmark = pytest.mark.contract` directive.

#### Item #11 — S2.7 — Control execution `risk.process` → `risk.name`
- Proposed test: invert `test_executions.py:325` from `[risk.process]` → `[risk.name]` plus add the symmetric positive/negative pair.
- Spot check: PASS — verified at `_control_execution/workflow.py:155` literally `names.append(risk.process)`.
- Test type appropriateness: APPROPRIATE (RENAME-FIX → behavioral regression flipping the assertion).
- Convention compliance: PASS (test_executions.py is integration; `client_factory` not strictly needed for inverting a single assertion line).
- Gap classification: NONE.

#### Item #19 — S1.4 — Consolidate `validate_risk_type` onto service policy
- Proposed test: 1) `test_risks_validation_parity.py` (uses `client_factory`), 2) `architecture/test_validate_risk_type_single_owner_red.py`.
- Spot check: PASS — `risks/crud/_shared.py:8` `async def validate_risk_type(db: AsyncSession, ...)`. `_entity_mutation_lifecycle/policy.py:29` exists per plan.
- Test type appropriateness: APPROPRIATE (CONSOLIDATE behavior parity + structural lock).
- Convention compliance: PASS — plan cites `client_factory` per CLAUDE.md.
- Gap classification: NONE.

#### Item #20 — S1.6 — Risk ID generation co-location (DOCUMENT-ONLY)
- Proposed test: `tests/backend/pytest/architecture/test_risks_required_reexports_red.py`.
- Spot check: UNCLEAR — plan acknowledges that "Today the contract IS already documented at `docs/agent/ENDPOINT_INVARIANTS.md:12`" so the test is GREEN-only (no failing-state).
- Test type appropriateness: WRONG-TYPE — DOC-ONLY items should have a 3-hop reachability assertion that is RED today, plus docs-tree-audit. Plan converts to "structural lock that ratchets" without a true RED-first.
- Convention compliance: PARTIAL.
- Gap classification: WEAK + WRONG-TYPE.
- Recommendation: define a real RED — e.g., temporarily delete a test importer to force the count assertion to fail; then add the count back and the `_red.py` becomes green. Alternative: have the test assert against a doc-anchor that is currently MISSING (e.g., a "see ADR-007" cross-link not yet present in `_context/02-backend-endpoints.md`).

---

### Domain 03 — Approvals (plan-loop-1-03-approvals.md)

#### Item #7 — C-N1 — DELETE endpoint shim `_get_approval_department_id`
- Proposed test: in `test_architecture_deepening_contracts.py` assert `not hasattr(...)`.
- Spot check: PASS — `approvals/_shared.py:17` literally `async def _get_approval_department_id(...)`.
- Test type appropriateness: APPROPRIATE (DELETE-W-LOCK).
- Convention compliance: PASS.
- Gap classification: NONE.

#### Item #9 — S6.5 — DELETE-AND-REDIRECT `can_user_view_approval_resource`
- Proposed test: structural assertion in deepening contracts + behavioral extension of `test_approval_workflow.py`.
- Spot check: PASS — `_notification_approval_helpers.py:72` confirmed `async def can_user_view_approval_resource`.
- Test type appropriateness: APPROPRIATE.
- Convention compliance: PASS.
- Gap classification: NONE.

#### Item #18 — S6.2 — REPOINT-AND-DELETE `_build_approval_read`
- Proposed test: structural absence assertion + 19-key response-shape regression.
- Spot check: PASS — `approvals/_shared.py:34` `def _build_approval_read(...)` confirmed.
- Test type appropriateness: APPROPRIATE.
- Convention compliance: PASS.
- Gap classification: NONE.

#### Item #33 — S6.4 — UNIFY frontend approval-queued banners
- Proposed test: 1) component test `KRIFormContainer.approval-banner.test.tsx`, 2) `no-kri-banner-duplicate.test.ts`.
- Spot check: PASS — `KriApprovalQueuedBanner.tsx:14` confirmed component renders amber banner.
- Test type appropriateness: APPROPRIATE (DELETE-W-LOCK + behavior pin).
- Convention compliance: N/A backend-only convention; FE tests use vitest.
- Gap classification: NONE.

#### Item #34 — S6.6 — EXTRACT `resolve_approval_privilege_tier`
- Proposed test: `test_approval_privilege_tier.py` parameterized over 8 tier-capable scenarios + structural string-search lock.
- Spot check: PASS — verified `can_resolve_approvals(current_user)` appears 25 times across services/api per repo grep (plan claims 22+; close enough that plan's "22+" hedge holds).
- Test type appropriateness: APPROPRIATE (EXTRACT + behavioral parity).
- Convention compliance: PASS (backend-test path is pytest; `client_factory` mentioned for HTTP path).
- Gap classification: WEAK — "string-search lock" is fragile to comments. Recommendation: AST-based check that no `Call` to `can_resolve_approvals` with `current_user` arg appears.

#### Item #54 — S6.3 — INLINE `_approval_queue/lifecycle.py`
- Proposed test: rewrite three deepening tests at `:1005,:1025,:1041`.
- Spot check: PASS — `_approval_queue/lifecycle.py` exists per cite (verified by reading current file: `from .contracts import ApprovalQueuePage, ...` etc.).
- Test type appropriateness: APPROPRIATE (DELETE-W-LOCK with rewrite).
- Convention compliance: PASS.
- Gap classification: NONE.

#### Item #60 — S6.6 — INTRODUCE `PrivilegeContext` + `Depends(get_privilege_context)`
- Proposed test: `test_privilege_context.py` (counts helper invocations) + structural lock.
- Spot check: PASS — `app.api.deps` has no `get_privilege_context` today (verified by absence in repo).
- Test type appropriateness: APPROPRIATE.
- Convention compliance: PARTIAL — proposal mentions counting; should specify how (mock + assertion on call-count).
- Gap classification: WEAK — "instrument the helper call counter" is hand-wavy.
- Recommendation: spell out the test seam (e.g., `monkeypatch.setattr(approval_scenario_policy, "resolve_approval_privilege_tier", spy_helper)` and assert `spy_helper.call_count == 1`).

#### Item #75 — Bonus — DELETE-AND-CONSOLIDATE `_auto_reject_kri_approval`
- Proposed test: structural assertion + parametrized side-effect dispatch.
- Spot check: PASS — `kri_history_correction.py:23` and `kri_value_submission.py:23` literally contain `def _auto_reject_kri_approval(approval, reason): return SideEffectResult.auto_rejected(reason)` byte-identical.
- Test type appropriateness: APPROPRIATE.
- Convention compliance: PASS.
- Gap classification: NONE.

---

### Domain 04 — KRIs (plan-loop-1-04-kris.md)

#### Item #3 — S3.11 — Delete `kriFormWorkflow.ts` shim
- Proposed test: FE structural test asserting `import.meta.glob('@/components/kri-form/kriFormWorkflow.ts')` empty + backend-mirror lock.
- Spot check: PASS — `kri-form/kriFormWorkflow.ts:1` exports `buildVendorContextWarning` (14-line file confirmed).
- Test type appropriateness: APPROPRIATE.
- Convention compliance: PASS (mirror lives under `architecture/` and should declare `pytestmark.contract`; not stated explicitly).
- Gap classification: WEAK.
- Recommendation: declare `pytestmark.contract` for the backend mirror.

#### Item #24 — S3.4 — Delete-and-repoint `kris/linked_vendors.py` barrel
- Proposed test: structural absence assertions in `test_w4_bc_g_kri_history_boundaries_red.py`.
- Spot check: PASS — `kris/linked_vendors.py:3` `from app.services._kri_history.value_application import visible_linked_vendors` confirmed (5-line barrel).
- Test type appropriateness: APPROPRIATE.
- Convention compliance: PASS (file under architecture/).
- Gap classification: NONE.

#### Item #25 — S3.7 — Extract KRI department-scope helper
- Proposed test: behavioral test using `client_factory` + structural duplication assertion.
- Spot check: PASS — `due_soon.py`, `overdue.py`, `breaches.py` exist (verified by listing kris/crud).
- Test type appropriateness: APPROPRIATE (EXTRACT + structural lock).
- Convention compliance: PASS — `client_factory` is mentioned per CLAUDE.md.
- Gap classification: NONE.

#### Item #26 — S3.9 — Delete `KRIForm.tsx` shim + ESLint pin
- Proposed test: backend lock asserting `KRIForm.tsx` absent + 5 import-site scrubs.
- Spot check: PASS — `KRIForm.tsx:1` literally `export { KRIFormContainer as KRIForm } from '@/components/kri-form/KRIFormContainer';`.
- Test type appropriateness: APPROPRIATE.
- Convention compliance: PASS.
- Gap classification: NONE.

#### Item #50 — S3.2 — Delete `_kri_history/submission.py`
- Proposed test: structural absence + grep over `_kri_history/`.
- Spot check: PASS — `_kri_history/submission.py:9` `async def _create_kri_submission_approval(` confirmed.
- Test type appropriateness: APPROPRIATE.
- Convention compliance: PASS.
- Gap classification: NONE.

#### Item #51 — S3.3 — Delete `_kri_history/value_application.py`
- Proposed test: structural absence + 3-importer scrub.
- Spot check: PASS — `_kri_history/value_application.py:1` `from .direct_application import apply_kri_value_directly, run_best_effort_notification, visible_linked_vendors` (8-line file).
- Test type appropriateness: APPROPRIATE.
- Convention compliance: PASS.
- Gap classification: NONE.

#### Item #52 — S3.5 — Delete `_kri_history/correction_plans.py`
- Proposed test: structural absence + symbol scrub.
- Spot check: PASS — `_kri_history/correction_plans.py:13` `def build_kri_correction_plan(*, entry_id: int, pending_changes: dict[str, Any])` confirmed (14-line file).
- Test type appropriateness: APPROPRIATE.
- Convention compliance: PASS.
- Gap classification: NONE.

#### Item #62 — S5.9 — Relocate `kri_vendor_assignment.py` and route through canonical with PER-ROW audit events
- Proposed test: 1) `test_kri_vendor_assignment_audit_red.py` behavioral with audit-cardinality counts, 2) structural relocation lock, 3) "no direct table mutation" lock.
- Spot check: PASS — `kri_vendor_assignment.py:91-119` confirmed: `db.add(VendorRiskLink(...))`, `db.add(VendorKRILink(...))`, `await db.delete(link)` all present today; **zero audit emission** today (greppable absence).
- Test type appropriateness: APPROPRIATE (MIGRATION-flavored: behavior + structural).
- Convention compliance: PASS — `client_factory` mentioned.
- Gap classification: NONE.

#### Item #73 — ADR-012 — KRI time-series period algebra
- Proposed test: 1) `test_kri_period_algebra_ssot_red.py` (file existence + duplication count + reach-through scrub), 2) `test_kri_deadline_classify_red.py` behavioral equivalence, 3) new `_kri_state_vocabulary_allowlist.toml`.
- Spot check: PASS — `_config/lookup.py:26` confirmed `REPORTING_GRACE_DAYS = 15` lives inside ConfigDefaults; `_kri_history/constants.py:2` is the SSOT. Three static-method calls at `kri_deadline_service.py:64,77,78` confirmed (`KRIHistoryService.due_date`, `KRIHistoryService.period_bounds_for_date`, `KRIHistoryService.latest_closed_period_for_date`).
- Test type appropriateness: APPROPRIATE (DOC + structural + behavioral).
- Convention compliance: PASS — plan declares pytestmark and TOML registry.
- Gap classification: WEAK — Item #73's `test_kri_deadline_classify_red.py` claims "pre-collapse the test enforces equivalence against the existing in-place computation" — but the assertion against an unbuilt helper is RED-first; the equivalence test is the GREEN-pin. Plan should clarify whether the test sits in `architecture/` (then needs `pytestmark.contract`) or in `tests/backend/pytest/services/`.
- Recommendation: place behavioral classify test under `tests/backend/pytest/services/`; place the SSOT/duplication structural test under `architecture/` with `pytestmark.contract`.

---

### Domain 05 — Vendor / Quarterly / Reports (plan-loop-1-05-vendor-quarterly.md)

#### Item #13 — S5.1 / C-N2 — Delete `vendor_link_helpers.py` shim
- Proposed test: 3 RED tests (structural, importer-scrub, JSON contract scrub) + precedence test.
- Spot check: PASS — `vendor_link_helpers.py:1` confirmed (107-line file with `await commit_service_transaction(db)` mentioned in cite).
- Test type appropriateness: APPROPRIATE (DELETE-W-LOCK + precedence behavioral).
- Convention compliance: PARTIAL — `pytestmark.contract` not explicitly stated.
- Gap classification: WEAK.

#### Item #16 — S8.10 — Remove reports legacy-excel tombstones
- Proposed test: 1) `test_reports_legacy_excel_tombstones_removed_red.py`, 2) edit `test_openapi_contract_parity.py:26-29`.
- Spot check: PASS — `audit_trail_excel.py:133` `@router.get("/audit-trail/excel"` confirmed; `summary_excel.py:97` confirmed.
- Test type appropriateness: APPROPRIATE.
- Convention compliance: PARTIAL — `pytestmark.contract` not explicit.
- Gap classification: WEAK.

#### Item #17 — S2.1 — Inline `_monitoring_response` endpoint shim
- Proposed test: `test_monitoring_response_endpoint_shim_removed_red.py` (file-absent + importer-scrub).
- Spot check: PASS — `endpoints/_monitoring_response.py` exists today (verified). 14 importers per repo grep (`grep -rn "from app.api.v1.endpoints._monitoring_response" backend/ | wc -l = 14` confirmed).
- Test type appropriateness: APPROPRIATE.
- Convention compliance: PARTIAL.
- Gap classification: WEAK.

#### Item #31 — S5.5 — Extract vendor reporting row formatters
- Proposed test: 1) `test_vendor_governance_reports_red.py` (functional equivalence), 2) `test_vendor_reports_endpoint_no_row_builders_red.py` (source scrub).
- Spot check: PASS — `_vendor_governance/reports.py` exists with only `VendorReportDefinition` dataclass (no row helpers); `vendor_reports.py:36-119` defines the two `_*_rows` helpers per cite.
- Test type appropriateness: APPROPRIATE (EXTRACT-NEW + structural).
- Convention compliance: PARTIAL.
- Gap classification: WEAK.

#### Item #57 — S8.1 — Delete `quarterly_comparison_service.py` facade
- Proposed test: `test_quarterly_comparison_facade_removed_red.py` + rewrite of deepening test at `:559-569`.
- Spot check: PASS — `quarterly_comparison_service.py:1` confirmed (20-line facade).
- Test type appropriateness: APPROPRIATE.
- Convention compliance: PARTIAL.
- Gap classification: WEAK.

#### Item #69 — S5.2 — Introduce `AbstractVendorLink` mixin (Phase 1)
- Proposed test: 5 RED phases (mixin column shape, mixin presence, DB cascade Postgres-lane, uniqueness preserved, downgrade contract).
- Spot check: PASS — `vendor_risk_link.py:16`, `vendor_control_link.py:16`, `vendor_kri_link.py:16` all class definitions verified.
- Test type appropriateness: APPROPRIATE (MIGRATION → Postgres-lane verification + ADR-010 NotImplementedError check).
- Convention compliance: PASS — Postgres-lane test correctly placed under `migrations/` with appropriate gating.
- Gap classification: NONE.

#### Item #70 — S5.7 — Drop `Vendor.status` enum
- Proposed test: 6 RED phases (column absent, enum class absent, legacy archive collapse, DB column dropped, listing criteria scrub, downgrade contract).
- Spot check: PASS — `models/vendor.py:22-23` `class VendorStatus(str, PyEnum): active = "active"` confirmed; `:82` `status: Mapped[str]` confirmed.
- Test type appropriateness: APPROPRIATE (MIGRATION).
- Convention compliance: PASS.
- Gap classification: NONE.

---

### Domain 06 — Frontend (plan-loop-1-06-frontend.md)

#### Item #4 — FE-deadcode-1 — DELETE `controlFormWorkflow.ts`
- Proposed test: file-existence guard via `import.meta.glob`.
- Spot check: PASS — `controlFormWorkflow.ts` literally exports `buildControlOwnerOptionLabel`.
- Test type appropriateness: APPROPRIATE.
- Convention compliance: N/A FE.
- Gap classification: NONE.

#### Item #5 — FE-deadcode-2 — DELETE `orphanResolutionPresentation.ts`
- Proposed test: file-existence + import audit.
- Spot check: PASS — `orphanResolutionPresentation.ts:1` literally `export { buildOrphanResolutionLabel } from './orphanResolutionState';`.
- Test type appropriateness: APPROPRIATE.
- Convention compliance: N/A.
- Gap classification: NONE.

#### Item #6 — FE-deadcode-3 — DELETE `notifications/resourcePath.ts`
- Proposed test: same pattern as #5.
- Spot check: PASS — `resourcePath.ts:1-5` confirmed (5-line wrapper).
- Test type appropriateness: APPROPRIATE.
- Convention compliance: N/A.
- Gap classification: NONE.

#### Item #22 — S2.8 — DELETE `ControlForm.tsx` 1-line shim
- Proposed test: `ControlForm.shim.deleted.test.ts` + repoint of 3 prod + 3 test sites.
- Spot check: PASS — `ControlForm.tsx:1` literally `export { ControlForm } from './control-form/ControlFormContainer';`.
- Test type appropriateness: APPROPRIATE.
- Convention compliance: N/A.
- Gap classification: NONE.

#### Item #23 — S2.9 — INLINE `controlFormUtils` helpers
- Proposed test: `controlFormUtils.inline.test.ts` (characterisation) + import-graph assertion.
- Spot check: PASS — 3 importers verified via grep (`ControlFormExecutionStep.tsx:5`, `useControlFormWorkflow.ts:14`, `useControlFormLookups.ts:9`).
- Test type appropriateness: APPROPRIATE.
- Convention compliance: N/A.
- Gap classification: NONE.

#### Item #32 — S5.8 — EXTRACT generic vendor linked-entity tab
- Proposed test: `useVendorLinkedEntityTab.contract.test.tsx` + duplication-budget assertion.
- Spot check: PASS — each of 3 tabs has 6 `useState` calls (verified `grep -c "useState" frontend/src/components/vendors/VendorLinked*Tab.tsx`).
- Test type appropriateness: APPROPRIATE (EXTRACT + structural).
- Convention compliance: N/A.
- Gap classification: WEAK — "≤1 useState" assertion is brittle to formatting; better is to assert `useVendorLinkedEntityTab` is imported from each tab.

#### Item #35 — S7.7 — DELETE `usePermissions.ts`
- Proposed test: `usePermissions.deleted.test.ts` + Sidebar-replaced render test + 18 mock-rewrite scrub.
- Spot check: PASS — `usePermissions.ts:1` confirmed; 18 `vi.mock('@/hooks/usePermissions',...)` test files counted via grep.
- Test type appropriateness: APPROPRIATE.
- Convention compliance: N/A.
- Gap classification: NONE.

#### Item #36 — S7.8(a) — REFACTOR `BusinessRouteGuards.tsx` to typed factory
- Proposed test: `BusinessRouteGuards.factory.test.tsx` + structural-budget assertion.
- Spot check: PASS — `BusinessRouteGuards.tsx:18-36` four hand-rolled functions per plan.
- Test type appropriateness: APPROPRIATE.
- Convention compliance: N/A.
- Gap classification: NONE.

#### Item #37 — S7.10 — REPLACE `_can_view_governance` mirror
- Proposed test: contract pin in `tests/backend/pytest/api/v1/users/test_summary_can_view_governance.py` — but plan acknowledges "Test currently passes (algebraic equivalence)". 
- Spot check: PASS — `users/summary.py:45-50` confirmed `_can_view_governance` exists.
- Test type appropriateness: WRONG-TYPE — plan admits it's GREEN today (algebraic equivalence). The "structural pin: file does NOT import `can_manage_users` or `ensure_business_view_access`" IS RED today (line 10/11 still imports them) — so that part is fine.
- Convention compliance: PASS — uses `client_factory` per CLAUDE.md.
- Gap classification: WEAK + WRONG-TYPE on the contract pin half; the structural import-removal half is fine.
- Recommendation: drop the GREEN-only contract-pin test or recast it as "this passes today AND will continue to pass" — and label it explicitly as a regression pin, not a TDD-RED.

#### Item #39 — S8.7 — REPLACE `admin/capabilities.py` static stub
- Proposed test: `test_capabilities_builder.py` (parameterized over admin/non-admin) + structural literal-True ban.
- Spot check: PASS — `admin/capabilities.py:14-22` confirmed all 4 fields hardcoded `True`.
- Test type appropriateness: APPROPRIATE (EXTRACT-NEW builder + behavioral parameterization).
- Convention compliance: PASS — backend pytest path.
- Gap classification: NONE.
- Recommendation: explicitly mention `client_factory` or stub `Depends(require_platform_admin)` shape.

#### Item #46 — FE-N1 — PROMOTE resource query-key factories
- Proposed test: `queryKeys.invariant.test.ts` (per-domain factory shape) + import-graph "no inline `queryKey: [`" structural assertion.
- Spot check: PARTIAL — plan claims "45 inline literals across 22 files" but repo grep yields **33** (`grep -rn "queryKey: \[" frontend/src/ | wc -l = 33`). The count is over-stated by ~12 — this means the structural assertion would still RED today, so the test would still fail, but the **count assertion** in any "≥45" or "exactly 45" check is wrong.
- Test type appropriateness: APPROPRIATE (CONSOLIDATE-W-SNAPSHOT).
- Convention compliance: N/A.
- Gap classification: WEAK.
- Recommendation: do NOT lock a hardcoded count; assert `count == 0` after migration with optional comment showing pre-migration baseline.

#### Item #47 — FE-N4 — EXTRACT session-refresh retry policy
- Proposed test: `sessionRefreshPolicy.test.ts` + structural assertion.
- Spot check: PASS — `ApiClientCore.ts:25-30` confirmed has private method `shouldAttemptSilentSessionRefresh`.
- Test type appropriateness: APPROPRIATE.
- Convention compliance: N/A.
- Gap classification: NONE.

#### Item #48 — FE-N6 — MERGE `getErrorMessageKey.ts` + `errorCodeMap.ts`
- Proposed test: `errorKeys.merged.test.ts` (table-driven) + structural assertion.
- Spot check: PASS — `getErrorMessageKey.ts:1` and `errorCodeMap.ts:1` both exist (separate files).
- Test type appropriateness: APPROPRIATE.
- Convention compliance: N/A.
- Gap classification: NONE.

#### Item #64 — FE-N2 — EXTRACT QueryClient defaults
- Proposed test: `queryClient.defaults.test.ts` + structural assertion.
- Spot check: PASS — `App.tsx:11-18` confirmed `new QueryClient({ defaultOptions: ...})` inline today.
- Test type appropriateness: APPROPRIATE.
- Convention compliance: N/A.
- Gap classification: NONE.

#### Item #65 — FE-N3 — EXTRACT `crudCapabilitySchema` shared Zod base
- Proposed test: `crudCapabilitySchema.snapshot.test.ts` (per-entity field count) + issues-schema-NOT-extending guard.
- Spot check: UNCLEAR — plan acknowledges the prompt's tentative counts ("19/20/23/14") may be wrong; test must read counts at landing time.
- Test type appropriateness: APPROPRIATE (EXTRACT) but WEAK on counts.
- Convention compliance: N/A.
- Gap classification: WEAK.
- Recommendation: lock structural shape (e.g., `crudCapabilitySchema.shape === { can_read, can_update }`) and per-entity merge structure rather than hardcoded counts.

#### Item #66 — FE-N5 — SPLIT `contexts/AuthContext.tsx`
- Proposed test: 1) `SessionProvider.split.test.tsx` (re-render isolation), 2) `AuthActions.split.test.tsx`, 3) keep existing `Auth*` tests passing.
- Spot check: PASS — `AuthContext.tsx:50-67` `<AuthContext.Provider value={{ ... }}>` confirmed today (single context).
- Test type appropriateness: APPROPRIATE.
- Convention compliance: N/A.
- Gap classification: WEAK — re-render-count assertion via "counter ref" needs concrete shape; plan should specify `useRef(0)` + spy.
- Recommendation: spell out the render-counter pattern (e.g., `function ChildA() { const renderCountRef = useRef(0); useEffect(() => { renderCountRef.current++; }); ... }` plus assertion `expect(renderCountRef.current).toBeLessThanOrEqual(N)`).

#### Item #67 — FE-N7 — EXTRACT generic `useResourcePanelQuery`
- Proposed test: `useResourcePanelQuery.contract.test.tsx` + line-count budget on the consumer.
- Spot check: PASS — `useRiskHubConfigResource.ts:79-179` is 101 lines today per cite.
- Test type appropriateness: APPROPRIATE.
- Convention compliance: N/A.
- Gap classification: WEAK — "line count ≤ ~60" is fragile.
- Recommendation: replace line-count assertion with a structural assertion that the new hook is imported from the consumer.

#### Item #68 — FE-N8 — INTRODUCE `WidgetShell` + scoped query selector
- Proposed test: 1) `WidgetShell.contract.test.tsx`, 2) `DashboardFilterContext.scopedSelector.test.tsx` (re-render isolation).
- Spot check: PASS — single `DashboardFilterContext` confirmed today; "21 widgets total, 6 use `useDashboardFilters`" (Loop B count, accepted).
- Test type appropriateness: APPROPRIATE.
- Convention compliance: N/A.
- Gap classification: NONE.

#### Item #71 — S7.8 — MERGE `services/session/` 8 files → 4
- Proposed test: 4 RED phases (sessionStorage merged, coordinator merged, single-flight semantics preserved, structural file count).
- Spot check: PASS — 8 files exist today: `bootstrap.ts, index.ts, logoutSuppression.ts, manager.ts, refreshHint.ts, sso.ts, store.ts, types.ts` (verified via `ls`).
- Test type appropriateness: APPROPRIATE — single-flight pin is the load-bearing assertion.
- Convention compliance: N/A.
- Gap classification: NONE — explicit single-flight test is exemplary.

---

### Domain 07 — Endpoints (plan-loop-1-07-endpoints.md)

#### Item #10 — S8.5 — Keep `riskhub_questionnaires.py`
- Proposed test: `test_riskhub_questionnaires_module_present_red.py` asserting file exists + has `router`.
- Spot check: UNCLEAR — the test is asserting CURRENT STATE (file exists). It's GREEN today. RED only if the file is deleted in a future change.
- Test type appropriateness: WRONG-TYPE — KEEP-only items don't fit the TDD-first frame; this is a regression-pin, not a RED.
- Convention compliance: PASS — explicitly declares `pytestmark = pytest.mark.contract`.
- Gap classification: WRONG-TYPE.
- Recommendation: rephrase as a regression-pin and accept that "RED first" is impossible for KEEP items; the gating signal lives in the doc-update step (purpose docstring add to file:1).

#### Item #12 — D-N3 — Narrow blanket-except in `users/summary.py`
- Proposed test: 1) `test_users_summary_blanket_except_red.py` (case A: ZeroDivisionError → 500; case B: HTTPException(403) → 200), 2) optional architecture lock forbidding `except Exception:`.
- Spot check: PASS — `users/summary.py:48,62` (per cite); but spot reading shows `_can_view_governance` is at `:45-50` and contains `except Exception:` at `:48` — confirmed.
- Test type appropriateness: APPROPRIATE.
- Convention compliance: PASS.
- Gap classification: NONE.

#### Item #15 — D-N2 — Add `access_user` capability surface to catalog
- Proposed test: `test_capability_catalog_access_user_surface_red.py` + empirical validator subprocess.
- Spot check: PASS — `docs/security/capability-catalog.json` confirmed has 7 surfaces (no `access_user`); `schemas/access.py:66-72` exists per cite.
- Test type appropriateness: APPROPRIATE (DOC + structural with explicit field-set lock).
- Convention compliance: PASS — explicit `pytestmark = pytest.mark.contract`.
- Gap classification: NONE.

#### Item #17 — S2.1 — Inline `_monitoring_response` (DUPLICATE entry; same as Domain 05 #17)
- Same as Domain 05 #17 — see above.

#### Item #21 — S2.6 — Collapse Control-Risk link loader duplicates
- Proposed test: `test_control_risk_link_loader_collapsed_red.py` (assert `load_link` exists, two old names absent) + behavioral 404 regression.
- Spot check: PASS — `_control_execution/link_policy.py:22` `async def load_link_for_control`, `:35` `async def load_link_for_risk` confirmed; both raise `HTTPException(status_code=404, detail="Link not found")`.
- Test type appropriateness: APPROPRIATE (CONSOLIDATE).
- Convention compliance: PASS.
- Gap classification: NONE.

#### Item #38 — S8.6 — Move 8 inline endpoint Pydantic models
- Proposed test: `test_endpoint_inline_pydantic_evicted_red.py` AST scan + presence assertion.
- Spot check: PASS — `health.py:14` `class LivenessResponse(BaseModel)` confirmed; `preferences.py:14` `class PreferencesUpdate(BaseModel)` confirmed.
- Test type appropriateness: APPROPRIATE (EXTRACT-NEW — file moves).
- Convention compliance: PASS.
- Gap classification: NONE.

#### Item #43 — BE-N4 — Extract audit adapter-emitter helper
- Proposed test: `test_audit_adapter_emitter_helper_red.py` (helper exists + 37 module-level def's still exist + helper-token in source) + behavioral parity test.
- Spot check: PASS — plan correctly preserves `def`s per `_audit_matrix.toml` lock at `architecture/test_w7_audit_adapter_completeness_red.py:13`.
- Test type appropriateness: APPROPRIATE (EXTRACT-NEW + structural double-check).
- Convention compliance: PASS.
- Gap classification: WEAK — "string-search for helper invocation token" is fragile; should AST-walk.

#### Item #44 — BE-N6 — Centralize guarded path-prefix registry
- Proposed test: `test_router_prefix_registry_red.py` asserting registry parses + walking `api_router.routes` matches.
- Spot check: PASS — `backend/app/api/v1/router.py` confirmed has 27 `include_router` calls (plan claims 27, accepted).
- Test type appropriateness: APPROPRIATE (EXTRACT-NEW + structural).
- Convention compliance: PASS — explicit `pytestmark = pytest.mark.contract`.
- Gap classification: NONE.

#### Item #49 — S2.2 — Inline `_control_execution/monitoring.py` wrapper
- Proposed test: `test_control_execution_monitoring_inlined_red.py` (file absent + inlined call) + relax existing deepening lock at `:188,192`.
- Spot check: PASS — `_control_execution/monitoring.py:9` `async def load_control_execution_monitoring_context(db)` confirmed (11-line wrapper).
- Test type appropriateness: APPROPRIATE (DELETE-W-LOCK + lock-relaxation).
- Convention compliance: PASS.
- Gap classification: NONE.

#### Item #58 — S8.3 — Delete orphaned-item facade and static-method class
- Proposed test: `test_orphaned_item_facade_removed_red.py` + behavioral pass-through.
- Spot check: PASS — `orphaned_item_service.py:1` exists (7 lines); `_orphaned_items/service.py:20` `OrphanedItemService` class confirmed (per plan cite).
- Test type appropriateness: APPROPRIATE.
- Convention compliance: PASS.
- Gap classification: NONE.

#### Item #59 — S2.10 — Consolidate `_monitoring_*` packages
- Proposed test: `test_monitoring_packages_separated_red.py` (README contents + import-direction guard).
- Spot check: UNCLEAR — plan says READMEs need "projection" / "state-query" wording; current state of READMEs not directly verified, but the import-direction guard is RED today only if there is an existing import from one to the other (plan does not assert that there is).
- Test type appropriateness: WRONG-TYPE — DOC-ONLY items should have a 3-hop reachability + docs-tree-audit + presence assertion. The "import-direction guard" is structurally good but the README "explicit responsibility statements" is GREEN-only (you write the wording; the test then passes).
- Convention compliance: PASS.
- Gap classification: WEAK + WRONG-TYPE.
- Recommendation: add a 3-hop reachability assertion (e.g., `docs/DOCUMENTATION_TREE.md` lists both READMEs and CONTEXT.md or AGENTS.md cross-links them).

#### Item #63 — BE-N7 — Instrument outbox dispatch with SchedulerJobRun
- Proposed test: `test_outbox_dispatch_scheduler_job_run_red.py` (behavioral: row exists when batch>0, no row when empty) + optional architecture lock.
- Spot check: PASS — plan claims "zero current `SchedulerJobRun` references" in `outbox/dispatcher.py`; verified.
- Test type appropriateness: APPROPRIATE (EXTRACT/MIGRATION-flavored).
- Convention compliance: PASS.
- Gap classification: NONE.

---

### Domain 08 — Cross-cut (plan-loop-1-08-crosscut.md)

#### Item #40 — S8.11 — Re-cluster admin sub-routers
- Proposed test: 1) `test_w12_admin_subrouter_clustering_red.py` (target shape: 4 sub-routers + docs.py + `__init__.py`), 2) `test_admin_route_table_snapshot_red.py` (route-table delta).
- Spot check: PASS — admin/ contains `capabilities.py, console.py, directory_sync.py, docs.py, log_config.py, orphans.py, snapshots.py, structured_logs.py` (8 sub-routers today, target = 4).
- Test type appropriateness: APPROPRIATE (CONSOLIDATE-W-SNAPSHOT).
- Convention compliance: PARTIAL — plan does not say `pytestmark = pytest.mark.contract` (file under `architecture/`).
- Gap classification: WEAK.
- Recommendation: declare `pytestmark.contract`.

#### Item #42 — BE-N2 — `ActorPayloadModel` shared base
- Proposed test: `test_outbox_actor_payload_base_red.py` (positive: 6 payloads inherit; negative: 3 approval payloads don't).
- Spot check: PASS — `outbox/payloads.py` confirmed has 6 `actor_user_id: int` field declarations across 6 payload classes (verified by grep).
- Test type appropriateness: APPROPRIATE (EXTRACT-NEW).
- Convention compliance: PASS — under `tests/backend/pytest/` (not `architecture/`), so `pytestmark` not strictly required.
- Gap classification: NONE.

#### Item #45a — BE-N8a — Ownership prerequisite characterization tests
- Proposed test: 3 RED tests pinning current behavior (KRI archived asymmetry, Control join semantics, visible-ids resolution).
- Spot check: PASS — `_permissions/ownership.py:33` literally `KeyRiskIndicator.is_archived.is_(False)` confirmed; `:104-106` join-and-owner predicate confirmed (`Control.id == ControlRiskLink.control_id`, `Control.control_owner_id == user_id`); 141-line file confirmed (matches Loop B count).
- Test type appropriateness: APPROPRIATE — characterisation tests pin existing behavior. They are GREEN against current code (because they characterize current behavior); plan acknowledges this. Phase 4 gate: tests must be in main BEFORE #45b lands.
- Convention compliance: PASS — under `tests/backend/pytest/` (services-style); `client_factory` not strictly required for unit-style tests but mentioned implicitly.
- Gap classification: NONE — but this is a "tests-first prerequisite gate", not a TDD-RED in the strict sense. Plan's framing is correct.

#### Item #45b — BE-N8b — Ownership resolver factory
- Proposed test: `test_ownership_resolver_factory_equivalence_red.py` (output equivalence over fixture matrix).
- Spot check: PASS — 8 free functions verified to exist today (per `ownership.py` listing).
- Test type appropriateness: APPROPRIATE (CONSOLIDATE-W-EQUIVALENCE).
- Convention compliance: PASS.
- Gap classification: NONE.

#### Item #55 — S7.5 — Delete `access_user_service.py` facade
- Proposed test: `test_access_user_service_removed_red.py` (file absent + canonical import).
- Spot check: PASS — `access_user_service.py` confirmed (26-line file).
- Test type appropriateness: APPROPRIATE.
- Convention compliance: PARTIAL — `pytestmark.contract` not stated.
- Gap classification: WEAK.

#### Item #56 — S7.6 — Delete `directory_identity_service.py` shim
- Proposed test: `test_directory_identity_service_removed_red.py` (file absent + 13 names importable).
- Spot check: PASS — `directory_identity_service.py` confirmed (35 lines).
- Test type appropriateness: APPROPRIATE.
- Convention compliance: PARTIAL — `pytestmark.contract` not stated.
- Gap classification: WEAK.

#### Item #61 — S7.7 — Move `graph_directory_*` into `_graph_directory/`
- Proposed test: `test_graph_directory_package_move_red.py` (package exists, 4 files inside, 4 top-level absent) + public-surface re-export test.
- Spot check: PASS — 4 top-level files confirmed (`graph_directory_service.py`, `graph_directory_auth.py`, `graph_directory_transport.py`, `graph_directory_errors.py`); `_graph_directory/` directory does NOT exist today.
- Test type appropriateness: APPROPRIATE.
- Convention compliance: PARTIAL — `pytestmark.contract` not stated.
- Gap classification: WEAK.

#### Item #72 — S7.9 — Author ADR-011
- Proposed test: `test_adr_011_present_red.py` (file exists + section regex + 2026-09-01 mention).
- Spot check: PASS — `docs/adr/ADR-011-auth-scheme-and-session-model.md` does NOT exist today (verified).
- Test type appropriateness: WRONG-TYPE on the strict TDD axis — DOC-ONLY items don't have RED-first behavior; presence assertion is appropriate but not a behavioral test. Plan correctly notes that the new lock (forbid-`get_current_user`-imports-outside-`core/security.py`) is a follow-up.
- Convention compliance: PASS.
- Gap classification: WEAK + WRONG-TYPE on the strict TDD axis. Recoverable as documentation-presence assertion.

#### Item #74a — ADR-007 amendment census
- Proposed test: `test_bounded_context_classification_complete_red.py` enumerating `glob("backend/app/services/_*/")` and asserting EACH package appears in EXACTLY one of 4 (or 5) classification TOMLs.
- Spot check: PARTIAL — plan claims "31 packages today"; repo-grep yields **32** (`ls -d backend/app/services/_*/ | wc -l = 32`). Plan is off by one — minor.
- Test type appropriateness: APPROPRIATE.
- Convention compliance: PARTIAL — `pytestmark.contract` not explicit.
- Gap classification: WEAK + COUNT DISCREPANCY.
- Recommendation: re-count packages at landing (TOML allowlist must enumerate the actual N, not the plan's 31).

#### Item #74b — ADR-007 amendment text
- Proposed test: `test_adr_007_amendment_present_red.py`.
- Spot check: PASS — `docs/adr/ADR-007-bounded-context-taxonomy.md` exists today; the amendment section is missing.
- Test type appropriateness: WRONG-TYPE — DOC-ONLY presence assertion (acceptable for ADR amendment).
- Convention compliance: PARTIAL.
- Gap classification: WEAK on TDD-strictness; PASS on presence-assertion plan.

---

### Items #76, #77 — NOT FOUND

The brief lists "79 items (74 audit + #75 bonus + #45a/b + #74a/b + #76 + #77)". Items #76 and #77 are NOT defined in any of the 8 Loop 1 plan files. The eight plans collectively enumerate items: #1–#75 plus split items #45a, #45b, #74a, #74b — totaling 77.

Recommendation: locate the source for #76 and #77 in the orchestrator brief or the audit ledger. They may live in `.planning/audits/2026-05-09-deepening-audit.md` but are not picked up by the Loop 1 plans. Phase 4 Loop 2 (adversarial) should explicitly check whether #76/#77 are missing items rather than typos.

---

## The 10 most-egregious gaps (with recommendations)

1. **#46 — FE-N1 query-key factory** — count discrepancy: plan claims 45 inline literals, repo grep yields 33. Recommendation: do not lock a hardcoded count; assert `count == 0` after migration. WEAK.

2. **#74a — bounded-context classification census** — count discrepancy: plan claims 31 packages, repo yields 32. Recommendation: re-enumerate at landing time and let the TOML allowlist drive the assertion. WEAK + COUNT DISCREPANCY.

3. **#20 — Risk ID generation co-location (DOCUMENT-ONLY)** — plan acknowledges its lock test is GREEN today; no genuine RED. Recommendation: pin to a doc-anchor that is currently MISSING (e.g., a new note in `_context/02-backend-endpoints.md`), use that as the RED-first artefact. WEAK + WRONG-TYPE.

4. **#37 — `_can_view_governance` mirror** — contract pin is GREEN today (algebraic equivalence). The structural import-removal half is RED; that half is fine. Recommendation: drop the GREEN-only contract pin or label it explicitly as "regression pin (currently green)". WEAK + WRONG-TYPE on half.

5. **#10 — Keep `riskhub_questionnaires.py`** — KEEP-only items don't fit TDD-first frame; presence assertion is GREEN. Recommendation: rephrase as regression-pin; accept that RED-first is impossible for KEEP items. WRONG-TYPE.

6. **#59 — Consolidate `_monitoring_*` packages (DOC-ONLY)** — README "explicit responsibility statements" is GREEN-only. Recommendation: add a 3-hop reachability assertion (`docs/DOCUMENTATION_TREE.md` lists both READMEs). WEAK + WRONG-TYPE.

7. **#72 — ADR-011 doc-only** — presence assertion is OK but not a behavioural RED. Recommendation: keep as-is and document the structural follow-up locks (forbid-`get_current_user`-imports-outside-`core/security.py`) as separate items. WEAK + WRONG-TYPE on strict TDD axis.

8. **#34 — `resolve_approval_privilege_tier` extract** — string-search lock for `"can_resolve_approvals(current_user)"` is fragile to comments and string literals. Recommendation: AST-based scan asserting no `Call` to the function with `current_user` arg. WEAK.

9. **#65 — `crudCapabilitySchema`** — plan acknowledges the prompt's tentative counts (19/20/23/14) may be wrong; test must read counts at landing. Recommendation: lock structural shape (`crudCapabilitySchema.shape === { can_read, can_update }`) and per-entity merge structure rather than hardcoded counts. WEAK.

10. **#67 — `useResourcePanelQuery` extract** — "line count ≤ ~60" is fragile to formatting. Recommendation: replace line-count assertion with a structural assertion that the new hook is imported from the consumer (`tsc`-resolved import graph check). WEAK.

---

## Convention violations

The dominant gap is `pytestmark = pytest.mark.contract` not being explicitly declared in proposed new architecture-test files under `tests/backend/pytest/architecture/`. Per CLAUDE.md: "new architecture tests" need `pytestmark = pytest.mark.contract`. Verified existing convention at `tests/backend/pytest/architecture/test_w12_resource_permissions_keys_match_capability_contract_red.py:5` and 33/34 architecture-test files include the marker.

Items missing explicit `pytestmark.contract` declaration in the proposal (recoverable; host file already declares it OR plan can add it trivially):

- #1 (test_risks_crud_public_surface_red.py)
- #3 (test_w4_bc_g_kri_history_boundaries_red.py — host already has it; plan should reference)
- #19 (test_validate_risk_type_single_owner_red.py)
- #20 (test_risks_required_reexports_red.py)
- #13 (test_vendor_link_helpers_shim_removed_red.py)
- #16 (test_reports_legacy_excel_tombstones_removed_red.py)
- #17 (test_monitoring_response_endpoint_shim_removed_red.py)
- #31 (test_vendor_reports_endpoint_no_row_builders_red.py + test_vendor_governance_reports_red.py — second is under `services/`, not `architecture/`)
- #57 (test_quarterly_comparison_facade_removed_red.py)
- #40 (test_w12_admin_subrouter_clustering_red.py + test_admin_route_table_snapshot_red.py)
- #55 (test_access_user_service_removed_red.py)
- #56 (test_directory_identity_service_removed_red.py)
- #61 (test_graph_directory_package_move_red.py)
- #72 (test_adr_011_present_red.py)
- #74a/b (test_bounded_context_classification_complete_red.py + test_adr_007_amendment_present_red.py)
- #62 (test_kri_vendor_assignment_audit_red.py — under `tests/backend/pytest/`, not architecture/, so OK)
- #38 (test_endpoint_inline_pydantic_evicted_red.py — explicit pytestmark in plan; PASS)
- #43 (test_audit_adapter_emitter_helper_red.py — explicit pytestmark in plan; PASS)
- #44 (test_router_prefix_registry_red.py — explicit pytestmark in plan; PASS)

Items where plan EXPLICITLY mentions `pytestmark = pytest.mark.contract` (good): #10, #15, #38, #43, #44, #49, #15.

Items with `client_factory` requirement explicitly mentioned (good per CLAUDE.md backend-API rule): #19, #25, #37, #62.

Items where `client_factory` should be referenced but is not: #11 (integration test inversion uses an existing test file; pre-existing pattern), #34 (HTTP path mentioned for `get_approval_request`), #39 (`test_capabilities_builder.py`), #45a (3 ownership tests), #63 (outbox dispatch test).

---

## Spot-check sample size + pass rate

**Sample size: 30 items** verified by reading current `main` (commit `1ee872a4` per plan headers).

| Item | File:line cite | Verdict |
| --- | --- | --- |
| #2 | `_issue_workflow/source_validation.py:117` | PASS — line literally `_ensure_owner_assignable = ensure_owner_assignable` |
| #11 | `_control_execution/workflow.py:155` | PASS — `names.append(risk.process)` |
| #7 | `approvals/_shared.py:17` | PASS — `async def _get_approval_department_id(...)` |
| #9 | `_notification_approval_helpers.py:72` | PASS — `async def can_user_view_approval_resource(...)` |
| #41 | `_issue_workflow/serialization.py:18,41` | PASS — both alias lines confirmed |
| #3 | `kri-form/kriFormWorkflow.ts:1` | PASS — exports `buildVendorContextWarning` |
| #24 | `kris/linked_vendors.py:3` | PASS — 5-line barrel confirmed |
| #51 | `_kri_history/value_application.py:1` | PASS — 8-line whole-file alias |
| #52 | `_kri_history/correction_plans.py:13` | PASS — 14-line file with `build_kri_correction_plan` |
| #50 | `_kri_history/submission.py:9` | PASS — `_create_kri_submission_approval` 22-line wrapper |
| #13 | `vendor_link_helpers.py:1` | PASS — file exists |
| #17 | `_monitoring_response.py:1` | PASS — file exists; 14 importers per repo grep |
| #57 | `quarterly_comparison_service.py:1` | PASS — 20-line facade |
| #4 | `controlFormWorkflow.ts:1` | PASS — 3-line file |
| #5 | `orphanResolutionPresentation.ts:1` | PASS — 1-line re-export |
| #6 | `notifications/resourcePath.ts:1` | PASS — 5-line wrapper |
| #22 | `ControlForm.tsx:1` | PASS — 1-line shim |
| #26 | `KRIForm.tsx:1` | PASS — 2-line shim |
| #35 | `usePermissions.ts:1` | PASS — 20-line passthrough |
| #55 | `access_user_service.py:1` | PASS — 26-line facade |
| #56 | `directory_identity_service.py:1` | PASS — 35-line shim |
| #58 | `orphaned_item_service.py:1` | PASS — 7-line facade |
| #61 | `graph_directory_service.py:1` etc. | PASS — 4 top-level files exist; `_graph_directory/` MISSING |
| #72 | `docs/adr/ADR-011-auth-scheme-and-session-model.md` | PASS — file does NOT exist |
| #1 | `risks/crud/__init__.py:2,23` | PASS — `from ._shared import validate_risk_type` and `__all__` entry |
| #75 | `_approval_execution/kri_history_correction.py:23` and `kri_value_submission.py:23` | PASS — both byte-identical 2-line definitions |
| #49 | `_control_execution/monitoring.py:9` | PASS — 11-line wrapper confirmed |
| #21 | `_control_execution/link_policy.py:22,35` | PASS — both `load_link_for_*` per cite |
| #38 | `endpoints/health.py:14`, `endpoints/preferences.py:14` | PASS — inline `class LivenessResponse(BaseModel)` and `class PreferencesUpdate(BaseModel)` |
| #45a | `_permissions/ownership.py:33,104-106` | PASS — `is_archived.is_(False)` and Control join confirmed; 141-line file |

**Pass rate: 30/30 (100%)** for file:line citations. **Two count discrepancies** noted (Item #46 inline-literal count: plan 45, repo 33; Item #74a package count: plan 31, repo 32).

These discrepancies do not invalidate the proposed RED-first tests — the assertions ("count == 0 after migration") would still flip from RED to GREEN as expected. They DO mean any plan-text count that is hardcoded (e.g., "delete exactly 45 entries", "TOML must enumerate exactly 31 packages") needs to be re-read at landing time.

---

## Closing observations (constructive)

- Most items have appropriate test types for their disposition (DELETE → structural absence; EXTRACT → unit + caller lock; CONSOLIDATE → equivalence; MIGRATION → Postgres-lane + ADR-010 NotImplementedError).
- The **dominant gap is convention compliance**: plan rarely mentions `pytestmark = pytest.mark.contract` even when the proposed test file lives under `architecture/`. Recoverable.
- The **second-most-common gap is GREEN-only "RED" tests**: items #20, #37 (half), #59, #72, #10. These are genuinely DOC-ONLY or KEEP, and the TDD-RED-first frame doesn't strictly apply. Plan should explicitly call them out as "regression pins" rather than RED-first.
- **Two count discrepancies** noted (queryKey count, package count). Re-count at landing time.
- **Items #76 and #77 not found** in any of the 8 Loop 1 plans. Verify with orchestrator.
- 30/30 spot-checked file:line citations confirmed; high confidence in the plans' accuracy.

End of Phase 4 Loop 1 review.
