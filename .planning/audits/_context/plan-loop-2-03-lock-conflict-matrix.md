# Phase 3 Loop 2 — Lock/TOML Conflict Matrix

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Commit reference: `1ee872a4`.

Scope: cross-walk every architecture-lock test and TOML registry against every Phase 3 Loop 1 item that touches it. Identify high-risk overlaps that demand strict ordering, atomic-commit recommendations, and the full ledger of NEW lock tests proposed by Loop 1.

Conventions: `file:line` cite + ≤15-word quote per touch. Items are referenced by Phase 2 number (#N). Touch kinds:
- **add-entry** — append a row to a TOML registry (or to a hardcoded set/list inside a lock test).
- **remove-entry** — drop a row.
- **rename-line** — change a `file = "..."` / `path = "..."` token in place.
- **relax** — delete or invert an assertion in a lock test.
- **tighten** — extend an existing lock test with a new assertion or stricter substring.
- **delete-test** / **add-test** — top-level lock-test file deletion / creation.
- **rewrite** — replace the body of a lock function (semantic rewrite).

Section ordering follows the inventory in `.planning/audits/_context/04-architecture-locks.md`.

---

## Lock: `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml`

- **Cap**: `len(allowed) <= 8`. All entries `expires_at = "2026-09-01"`.
- **Consumer test**: `tests/backend/pytest/architecture/test_w5_endpoint_commit_ratchet_red.py` — quote `:333` `"len(allowed) <= 8"`.

| Item | Touch kind | Note |
|---|---|---|
| #72 (ADR-011) | reference-only (no entry change) | ADR-011 cites the 8 entries' `2026-09-01` sunset. plan-loop-1-08 line 555 quote `expires_at 2026-09-01 mentioned`. |
| #18 (S6.2 build_approval_read repoint) | none (verified) | Plan-loop-1-03 line 97 quote `_endpoint_commit_allowlist.toml: no changes`. |
| #40 (admin re-cluster) | verify-no-change | Plan-loop-1-08 line 64 quote `admin commit sites already excluded; verify no entry change`. |

- **Conflict risk**: LOW. No Loop 1 item adds, removes, or renames an entry. The 8 auth-flow entries persist through Phase 3.
- **Strict-order requirement**: none.
- **Atomic-commit recommendation**: none. ADR-011 (#72) lands first as documentation; the actual auth-flow commit eliminations are explicitly out of Loop 1 scope (`docs/security/authorization-capability-contract` policy is unchanged).
- **Cap-pressure check**: cap is 8; current is 8. **NO room for additional auth/* commits before 2026-09-01 expiry.** Any future auth-flow commit must remove an existing entry first.

---

## Lock: `tests/backend/pytest/architecture/_capabilities_all_allowlist.toml`

- **Cap**: 16 ordered names; consumer asserts `_module_all_names(CAPABILITIES_INIT) == public_names` (ORDER preserved).
- **Consumer test**: `tests/backend/pytest/architecture/test_w10_capabilities_all_allowlist_red.py`.

| Item | Touch kind | Note |
|---|---|---|
| #37 (S7.10 _can_view_governance) | verify-only | plan-loop-1-06 line 242 quote `_capabilities_all_allowlist.toml — confirm can_view_governance is listed`. |
| #39 (S8.7 admin/capabilities builder) | add-entry (potential) | plan-loop-1-06 line 268 quote `confirm the four admin capability keys are registered against admin_console`. Adds 0–4 entries depending on whether they are already in `_authorization_capabilities/__init__.py`'s `__all__`. |
| #65 (FE-N3 crudCapabilitySchema) | verify-only | plan-loop-1-06 line 394 quote `confirm catalog/test alignment`. |

- **Conflict risk**: MEDIUM. #39 may need to add new admin capability names to `__all__` and to the allowlist (in matching order). Order is asserted strictly.
- **Strict-order requirement**: #39 must insert any new admin capability entry into `_authorization_capabilities/__init__.py.__all__` AND into `_capabilities_all_allowlist.toml` in the same commit. Order of `[[public_names]]` must mirror `__all__`.
- **Atomic-commit recommendation**: #39's commit must touch BOTH the Python module's `__all__` and the TOML in lockstep.
- **Cap-pressure check**: no cap; ratchet is order-preservation only.

---

## Lock: `tests/backend/pytest/architecture/_archive_allowlist.toml`

- **Cap**: 4 `[[paths]]` entries today.
- **Consumer test**: `tests/backend/pytest/architecture/test_w8b_archivable_encapsulation_red.py` — paths must be `startswith("backend/app/" or "backend/alembic/versions/")`.

| Item | Touch kind | Note |
|---|---|---|
| #69 (AbstractVendorLink mixin) | verify-only | plan-loop-1-05 line 202 quote `no entry needed; vendor-link tables are not archivable`. |
| #70 (Vendor.status drop) | review (likely no-op) | plan-loop-1-05 line 252 quote `review: any entry citing Vendor.status legacy archive coercion can be removed`. The current 4 entries do not name `Vendor.status`; effectively no-op. |
| #4–#6 (FE dead-code deletes) | scrub if listed | plan-loop-1-06 line 22 quote `If the file is referenced in any _naming_allowlist.toml or _archive_allowlist.toml entry, scrub`. (Verified: no FE files listed.) |

- **Conflict risk**: LOW.
- **Strict-order requirement**: none.
- **Atomic-commit recommendation**: none.

---

## Lock: `tests/backend/pytest/architecture/_naming_allowlist.toml`

- **Cap**: `paths = []` (empty by invariant). External assertion at `tests/backend/pytest/test_w8a_persistence_contracts_red.py:18` quote `data.get("paths", []) == []`.

| Item | Touch kind | Note |
|---|---|---|
| #46 (FE-N1 query-key factories) | add-entry candidate | plan-loop-1-06 line 293 quote `register the new queryKeys/ modules per the project's naming convention`. *Note*: this lock is BACKEND persistence-naming; Loop 1 likely conflates with frontend filename convention. Treated as MISIDENTIFIED — no actual TOML edit needed. |
| #66 (AuthContext split) | add-entry candidate | plan-loop-1-06 line 421 quote `register new contexts`. Same misidentification: backend lock, FE convention. |
| #71 (session merge) | add-entry candidate | plan-loop-1-06 line 497 quote `drop the 5 deleted modules; register sessionStorage + coordinator`. Same misidentification. |
| #48 (errorKeys merge) | remove-entry candidate | plan-loop-1-06 line 344 quote `drop the two old paths if listed`. Same misidentification. |
| #22, #35, #4, #5, #6 (FE shim deletes) | scrub if listed | plan-loop-1-06 line 22, 188 quote `If the shim is referenced in any _naming_allowlist.toml… scrub` / `drop usePermissions if listed`. |
| #8a / #8b (#74) bounded-context TOMLs | adjacent | The new 4–5 bounded-context TOMLs proposed by #74 (e.g. `_bounded_context_write_side.toml`) are SEPARATE from `_naming_allowlist.toml`. |

- **Conflict risk**: LOW (the FE references are misidentified — backend TOML governs SQL persistence naming, not frontend filenames). If any FE item really does add to `_naming_allowlist.toml`, the `paths == []` invariant lock at `test_w8a:18` ALSO has to be relaxed in the SAME commit. Phase 3 should treat any FE-driven add as a RED FLAG and re-verify.
- **Strict-order requirement**: any genuine add must update both the TOML AND `test_w8a:18` together (atomic).
- **Atomic-commit recommendation**: none expected; flag for human review during Phase 4.

---

## Lock: `tests/backend/pytest/architecture/_riskhub_config_service_commit_allowlist.toml`

- **Cap**: `len(commit_sites) <= 2`. Consumer test `tests/backend/pytest/architecture/test_w12_riskhub_config_service_commit_ratchet_red.py:40` cap=2.

| Item | Touch kind | Note |
|---|---|---|
| (none) | | No Loop 1 item adds/removes a commit in `backend/app/services/_riskhub_config/`. plan-loop-1-* has no entries touching this allowlist. |

- **Conflict risk**: LOW.
- **Strict-order requirement**: none.
- **Cap-pressure check**: cap is 2; current is 2. Any future commit addition requires removal first.

---

## Lock: `tests/backend/pytest/architecture/_vendor_governance_service_commit_allowlist.toml`

- **Cap**: `len(commit_sites) <= 4`. Consumer test `tests/backend/pytest/architecture/test_w12_vendor_governance_service_commit_ratchet_red.py:40` cap=4.

| Item | Touch kind | Note |
|---|---|---|
| #62 (kri_vendor_assignment relocate) | verify-no-add | plan-loop-1-04 line 274 enumerates lock-line update at `test_w4_bc_c_vendor_governance_boundaries_red.py:16`; the per-row audit rewrite goes through `link_vendor_target` which currently lives in `_vendor_links/`, NOT `_vendor_governance/`. So this allowlist is unaffected unless the relocated file imports/wraps a new commit. |
| #69, #70 (vendor mixin + status drop) | verify-no-add | Both touch `models/` and `_vendor_governance/lifecycle.py` indirectly; plan does not flag a new commit. |

- **Conflict risk**: LOW.
- **Strict-order requirement**: none.
- **Cap-pressure check**: cap is 4; current is 4. No room.

---

## Lock: `tests/backend/pytest/_get_db_override_whitelist.toml`

- **Cap**: `allowed_files = ["tests/backend/pytest/conftest.py"]` (1 entry).
- **Consumer test**: `tests/backend/pytest/architecture/test_w11a_dependency_override_discipline_red.py:13`.

| Item | Touch kind | Note |
|---|---|---|
| #19 (validate_risk_type consolidation) | verify-not-implicated | plan-loop-1-02 line 154 quote `_get_db_override_whitelist.toml — verified not implicated`. |
| #69, #70 (vendor migrations) | verify-not-implicated | plan-loop-1-05 line 303 quote `none of the planned RED tests need such overrides`. |
| #11, #25 (kri/risk endpoints tests) | verify-not-implicated | All Loop 1 plans use `client_factory` per CLAUDE.md. |

- **Conflict risk**: LOW. No Loop 1 item adds new `dependency_overrides[get_db]` blocks.
- **Strict-order requirement**: none.

---

## Lock: `backend/app/core/audit/_audit_matrix.toml`

- **Cap**: 37 `[[adapter]]` rows (Loop B-verified count; plan-loop-1-07 line 353 quote `Loop-B: _audit_matrix.toml count is 37, not 38`).
- **Consumer test**: `tests/backend/pytest/architecture/test_w7_audit_adapter_completeness_red.py:13`.

| Item | Touch kind | Note |
|---|---|---|
| #43 (BE-N4 audit emit helper) | additive (no row change) | plan-loop-1-07 line 357 quote `each named function in <module>.py MUST remain`; helper is invoked INSIDE each existing `def`. No TOML row added/removed/renamed. |
| #62 (kri_vendor_assignment per-row events) | verify-rows-exist | plan-loop-1-04 line 254-255 audit calls emit `vendor_link_created` / `vendor_link_deleted` (rows already present in matrix). |

- **Conflict risk**: LOW. Both items are PURELY ADDITIVE w.r.t. the matrix rows.
- **Strict-order requirement**: #43 must keep all 37 `def`s at module level (the W7 lock checks presence, not body). #62 emits via existing rows, no matrix change.
- **Atomic-commit recommendation**: #43 is ONE commit per plan-loop-1-07 line 397 quote `ONE commit ("Extract audit adapter emit helper")` — but the body change spans 6 audit modules (`risk.py`, `control.py`, `kri.py`, `issue.py`, `approval.py`, `vendor.py`), and the contract test only checks `def` presence so a green-throughout per-module split is acceptable.

---

## Lock: `backend/app/api/v1/endpoints/_reserved_modules.toml`

- **Cap**: 8 `[[reserved]]` entries.
- **Consumer test**: `tests/backend/pytest/test_w2_doc_contract_alignment_red.py:45`.

| Item | Touch kind | Note |
|---|---|---|
| #73 (ADR-012 KRI period algebra) | reference-only | plan-loop-1-08 line 794 quote `ADR-012's _kri_history.constants.REPORTING_GRACE_DAYS alias deprecation window should cite ADR-009 Reserved Surfaces Convention for the alias entry in _reserved_modules.toml`. Loop 1 does not modify reserved entries; only references the convention. |

- **Conflict risk**: LOW.
- **Strict-order requirement**: none.

---

## Lock: `tests/backend/pytest/test_architecture_deepening_contracts.py` — high-traffic test surface (49+ tests)

This file is the **primary contention surface**. It is marked `pytestmark = pytest.mark.contract` at `:9` and counts as architecture-tier.

### `test_control_execution_governance_uses_split_modules` (`:183-193`)

| Item | Touch kind | Note |
|---|---|---|
| #49 (S2.2 inline _control_execution/monitoring) | relax | plan-loop-1-07 line 478-481 quote `remove or invert assertions at line 188 (hasattr(monitoring, "load_control_execution_monitoring_context")) and line 192 ("from app.services._control_execution.monitoring" in governance_source)`. |

- **Conflict risk**: LOW (single owner). The two assertions at `:188` and `:192` are paired and must drop together when `monitoring.py` is deleted.
- **Strict-order requirement**: #49 lock relaxation lands in the same commit as `monitoring.py` deletion — plan-loop-1-07 line 506-509 quote `ONE commit ("Inline _control_execution monitoring wrapper") covering deletion, callsite updates, and lock relaxation`.
- **Atomic-commit recommendation**: #49's commit MUST atomically remove the file, repoint 4 callsites, and edit `:188,192`.

### `test_directory_identity_facade_uses_lifecycle_module` (`:226-240`)

| Item | Touch kind | Note |
|---|---|---|
| #56 (S7.6 delete directory_identity_service shim) | rewrite (or delete) | plan-loop-1-08 line 392 quote `DELETE or REWRITE tests/backend/pytest/test_architecture_deepening_contracts.py:227-238 (test_directory_identity_facade_uses_lifecycle_module)`. The full identity-of-symbols assertion at `:235-236` references the deleted shim. |

- **Conflict risk**: HIGH (test introspects the file being deleted). Without rewriting in the same commit, the test raises `ImportError` on `from app.services import directory_identity_service`.
- **Strict-order requirement**: #56's commit MUST delete OR rewrite the test in the same diff.
- **Atomic-commit recommendation**: #56 (paired with #61) is one PR per plan-loop-1-08 line 413; the lock rewrite lands in the SAME PR.

### `test_identity_access_routes_use_lifecycle_module` (`:243-272`)

| Item | Touch kind | Note |
|---|---|---|
| #55 (S7.5 delete access_user_service.py) | rewrite (or delete) | plan-loop-1-08 line 305-310 quote `DELETE or REWRITE tests/backend/pytest/test_architecture_deepening_contracts.py:246-257 (test_identity_access_routes_use_lifecycle_module) — the inspect.getsource source-introspection assertion at :257 references the deleted facade`. |

- **Conflict risk**: HIGH. `from app.services import access_user_service` at `:246` and `inspect.getsource(access_user_service)` at `:257` both reach the file being deleted.
- **Strict-order requirement**: #55's commit must delete OR rewrite the test in the same diff.
- **Atomic-commit recommendation**: ONE PR per plan-loop-1-08 line 325.

### `test_quarterly_comparison_service_is_composition_facade` (`:559-569`)

| Item | Touch kind | Note |
|---|---|---|
| #57 (S8.1 delete quarterly_comparison_service facade) | rewrite | plan-loop-1-05 line 158-161 quote `rewrite tests/backend/pytest/test_architecture_deepening_contracts.py:559-569 test_quarterly_comparison_service_is_composition_facade → new name e.g. test_quarterly_comparison_dashboard_imports_composition_directly`. |

- **Conflict risk**: HIGH. Loop A flagged this lock as a "doc-only Reject anchor" — it pins the facade's existence. Test imports the facade at `:560` and asserts `quarterly_comparison_service.build_quarterly_comparison is composition.build_quarterly_comparison` at `:566`.
- **Strict-order requirement**: #57's commit lands the rewrite + facade deletion atomically.
- **Atomic-commit recommendation**: ONE PR per plan-loop-1-05 line 176 quote `All in one commit per orchestrator override so doc lock and code change land atomically`.

### `test_kri_history_uses_service_owned_intake_and_projection` (`:955-971`)

Touched lines: `:956` import tuple, `:962` `assert hasattr(correction_plans, "build_kri_correction_plan")`.

| Item | Touch kind | Note |
|---|---|---|
| #52 (S3.5 delete _kri_history/correction_plans.py) | relax | plan-loop-1-04 line 215-218 quote `drop correction_plans from the import tuple` / `drop assert hasattr(correction_plans, "build_kri_correction_plan")`. Both edits MUST land in same commit. |

- **Conflict risk**: HIGH. Removing the file without editing `:956` raises `ImportError` on `from app.services._kri_history import approval_intake, correction_plans, ...`.
- **Strict-order requirement**: #52's commit edits BOTH lines + deletes the file in lockstep.
- **Atomic-commit recommendation**: standalone single commit per plan-loop-1-04 line 223.

### `test_kri_history_direct_application_and_routes_do_not_use_private_wrappers` (`:974-980`)

Touched lines: `:976` `value_application_path = ...`, `:979` `assert "_apply_kri_value_directly" not in _source(value_application_path)`, `:980` `assert "_run_best_effort_notification" not in _source(value_application_path)`.

| Item | Touch kind | Note |
|---|---|---|
| #51 (S3.3 delete _kri_history/value_application.py) | relax | plan-loop-1-04 line 187 quote `value_application_path = "backend/app/services/_kri_history/value_application.py" and the two _source(value_application_path) assertions at :979,980 must be DELETED in same commit`. |

- **Conflict risk**: HIGH. Three lines (`:976,979,980`) all reach the deleted file.
- **Strict-order requirement**: #51's commit edits ALL three lines + deletes the file in lockstep.
- **Atomic-commit recommendation**: SAME COMMIT as #24 per plan-loop-1-04 line 197 (atomic cluster A).

### `test_risk_restore_passes_display_name_before_activity_redaction` (`:983-1002`)

Touched lines: `:998-1000` private-import strings.

| Item | Touch kind | Note |
|---|---|---|
| #50 (S3.2 delete submission.py) | tighten/relax | plan-loop-1-04 line 152-153 quote `negative-assertion line "from app.services._kri_history.submission import _create_kri_submission_approval" is benign post-delete (it asserts absence in route source), but for hygiene drop the now-dead string from the tuple at :997-1002`. |
| #51 (S3.3 delete value_application.py) | tighten/relax | plan-loop-1-04 line 188 quote `drop the now-dead "from app.services._kri_history.value_application import _apply_kri_value_directly" and "from app.services._kri_history.value_application import (" strings from the negative-assertion tuple`. |
| #18 (S6.2 build_approval_read repoint) | reference-only | plan-loop-1-03 line 90 quote `existing positive anchor at tests/backend/pytest/test_architecture_deepening_contracts.py:1029 (assert hasattr(projection, "build_approval_read")) is reinforced — no change needed`. (`:1029` is a different test; cited here because Loop B notes the line is unchanged.) |

- **Conflict risk**: MEDIUM. Two items (#50, #51) both edit `:997-1002`; if landed in different commits, the second commit's edit will collide with the first's tuple shape.
- **Strict-order requirement**: #51 follows #50 OR they bundle. Plan-loop-1-04 line 197 puts #51 in cluster A (with #24); #50 is independent (cluster B). Per recommended order: #52 (#962 edit) → #50 (`:997-1002` edit removing submission.py string) → cluster A #24+#51 (`:976,979,980,999,1000` edits).
- **Atomic-commit recommendation**: #50 and #51 each remove distinct strings from the tuple; sequence #50 BEFORE #51 to avoid a stale tuple in cluster A's commit.

### `test_approval_queue_routes_use_queue_lifecycle_module` (`:1005-1022`)

| Item | Touch kind | Note |
|---|---|---|
| #54 (S6.3 inline _approval_queue/lifecycle.py) | rewrite | plan-loop-1-03 line 195 quote `test_approval_queue_routes_use_queue_lifecycle_module (line 1005): drop from app.services._approval_queue import lifecycle; replace with from app.services import _approval_queue as queue_pkg`. |

- **Conflict risk**: HIGH. The test imports `lifecycle` at `:1007` and reads `inspect.getsource(lifecycle)` indirectly via `assert hasattr(lifecycle, ...)`. Deleting the file without the rewrite raises `ImportError`.
- **Strict-order requirement**: #54's commit deletes file + rewrites this test in lockstep.
- **Atomic-commit recommendation**: single commit per plan-loop-1-03 line 209.

### `test_approval_queue_lifecycle_uses_service_owned_helpers` (`:1025-1038`)

| Item | Touch kind | Note |
|---|---|---|
| #54 (S6.3 inline lifecycle.py) | rewrite | plan-loop-1-03 line 196 quote `drop the lifecycle import; replace lifecycle_source = inspect.getsource(lifecycle) with package_source = inspect.getsource(queue_pkg)`. |
| #18 (S6.2 build_approval_read repoint) | reference-only | plan-loop-1-03 line 90 quote `existing positive anchor at tests/backend/pytest/test_architecture_deepening_contracts.py:1029 (assert hasattr(projection, "build_approval_read")) is reinforced — no change needed`. |

- **Conflict risk**: HIGH (#54). #54 rewrites the function; #18 only verifies `:1029` stays green.
- **Strict-order requirement**: #54 rewrite atomic with file delete. #18 lands independently (file not deleted).
- **Atomic-commit recommendation**: #54 single commit covers all 3 deepening tests + file delete.

### `test_approval_queue_lifecycle_delegates_intake_query_projection` (`:1041-1071`)

| Item | Touch kind | Note |
|---|---|---|
| #54 (S6.3 inline lifecycle.py) | rewrite | plan-loop-1-03 line 197 quote `drop the _source("backend/app/services/_approval_queue/lifecycle.py") read; replace with _source("backend/app/services/_approval_queue/__init__.py")`. |

- **Conflict risk**: HIGH. The test's `_source(...)` at `:1064` reads the deleted file.
- **Strict-order requirement**: #54 rewrite atomic with file delete.

### `test_issue_workflow_routes_use_lifecycle_module` (`:1165-1189`)

| Item | Touch kind | Note |
|---|---|---|
| (no Loop 1 item directly edits this function) | — | Existing assertion at `:1189` `assert "OutboxService.enqueue" not in route_source` is reinforced by #14 / #53 work but no edit needed. |

### `test_issue_workflow_lifecycle_uses_service_owned_helpers` (`:1192-1206`)

Loop 1 plan-loop-1-01 lines 39, 484 cite `:1192-1206` and `:1193`.

| Item | Touch kind | Note |
|---|---|---|
| #8 (B-N2 source-validation split) | rewrite | plan-loop-1-01 line 484 quote `the architecture-lock at tests/backend/pytest/test_architecture_deepening_contracts.py:1192-1206 enumerates _issue_workflow modules; both #8 and #53 must update that import list when source_validation.py is deleted`. |
| #53 (S4.1 IssueWorkflowService collapse) | tighten | plan-loop-1-01 line 411 quote `Update lock test_architecture_deepening_contracts.py:1192-1206 — line :1193 imports from app.services._issue_workflow import execution, lifecycle, loading, outbox, serialization, source_validation`. After #8/#28 source_validation.py may be deleted; delete it from this import too. |
| #55, #56 (cluster 08) | reference-only | not implicated. |

- **Conflict risk**: MEDIUM. Two items (#8, #53) both edit `:1193`. #8 is the canonical mover; #53 follows.
- **Strict-order requirement**: #8 lands first (it deletes `source_validation.py` body). #53 lands later (it strengthens execution.py imports). Both must keep the import line consistent with surviving files.
- **Atomic-commit recommendation**: #8 and #53 are SEPARATE commits; if `source_validation.py` is deleted in #8, the #53 commit must reflect the post-#8 import list.

### `test_issue_workflow_lifecycle_delegates_mutation_execution` (`:1225-1242`)

| Item | Touch kind | Note |
|---|---|---|
| #53 (S4.1) | reference-only | Plan-loop-1-01 line 410 quote `Existing lock test_architecture_deepening_contracts.py:1237 (assert "IssueWorkflowService." not in lifecycle_source) still passes`. No edit. |

### `test_frontend_workflow_helpers_are_used_by_production_code` (`:1330-1341`)

| Item | Touch kind | Note |
|---|---|---|
| #3 (S3.11 delete kriFormWorkflow.ts) | reference-only | plan-loop-1-04 line 41 quote `the asserted symbol list (:1331-1340) does not include buildVendorContextWarning`. No edit. |

### Loop 1 NEW assertions appended to `test_architecture_deepening_contracts.py`

(These are tightenings of the existing file rather than new test files. They are NOT counted as new lock-test files.)

| Source item | Inserted assertion |
|---|---|
| #2 (B-N1) | new test `test_issue_workflow_no_underscored_self_aliases_red` (alternative: new architecture-tier file). plan-loop-1-01 line 53. |
| #8 (B-N2) | `test_issue_workflow_owner_validation_lives_in_dedicated_module`. plan-loop-1-01 line 83. |
| #14 (S4.4) | `test_issue_notifications_have_no_direct_send_helpers`. plan-loop-1-01 line 127. |
| #27 (S4.2) | `test_endpoint_issues_loading_is_thin_or_deleted`. plan-loop-1-01 line 162. |
| #28 (S4.3) | `test_issue_link_helpers_have_one_canonical_home`. plan-loop-1-01 line 200. |
| #29 (S4.6) | `test_source_type_value_has_one_canonical_definition`. plan-loop-1-01 line 239. |
| #30 (S4.10) | `test_issue_shared_barrel_has_no_underscored_reexports`. plan-loop-1-01 line 291. |
| #41 (B-N3) | `test_issue_workflow_serialization_has_no_self_aliases`. plan-loop-1-01 line 354. |
| #53 (S4.1) | `test_issue_workflow_execution_imports_lifecycle_directly`. plan-loop-1-01 line 389. |
| #7 (C-N1) | structural assertion `not hasattr(_shared, "_get_approval_department_id")`. plan-loop-1-03 line 35. |
| #9 (S6.5) | structural assertion `not hasattr(_notification_approval_helpers, "can_user_view_approval_resource")`. plan-loop-1-03 line 63. |
| #18 (S6.2) | structural assertion + 19-key response-shape regression. plan-loop-1-03 line 88. |
| #34 (S6.6) | `hasattr(approval_scenario_policy, "resolve_approval_privilege_tier")`. plan-loop-1-03 line 144. |
| #60 (PrivilegeContext) | `hasattr(app.api.deps, "get_privilege_context")`. plan-loop-1-03 line 223. |
| #75 (auto_reject) | `hasattr(_approval_execution.results, "auto_reject_kri_approval")`. plan-loop-1-03 line 256. |

- **Conflict risk on test_architecture_deepening_contracts.py**: HIGH overall. **Most edits cluster on lines `:188, 192, 559-569, 956, 962, 976-980, 997-1002, 1005, 1025, 1041, 1029, 1192-1206`**. Without strict ordering, sibling commits collide on tuples and import lists.
- **Strict-order summary** (this file only):
  1. #52 first → `:956, 962`.
  2. #50 next → `:997-1002` submission.py string.
  3. Cluster A (#24+#51) → `:976, 979, 980, 998-1000` value_application strings.
  4. #57 → `:559-569` rewrite.
  5. #54 → `:1005, 1025, 1041` rewrite.
  6. #49 → `:188, 192` relax.
  7. #56 → `:227-238` rewrite.
  8. #55 → `:246-257` rewrite.
  9. #8 → `:1193` import list shrink.
  10. #53 → `:1193` follow-up if needed.

- **Atomic-commit recommendation**: each item bundles its own line edits with its source change. NEVER let a deletion land before the corresponding lock edit.

---

## Lock test files in `tests/backend/pytest/architecture/test_w<N>_*_red.py` (~34 tests)

### `test_w4_bc_c_vendor_governance_boundaries_red.py` (`:12-17` `VENDOR_SERVICE_FILES`)

| Item | Touch kind | Note |
|---|---|---|
| #62 (kri_vendor_assignment relocate) | rename-line | plan-loop-1-04 line 274 quote `change the VENDOR_SERVICE_FILES entry to the new path. Lock travels with the file`. Specifically `:16` `kri_vendor_assignment.py` → `_vendor_links/kri_assignment.py`. |

- **Conflict risk**: HIGH. The lock file lists exact paths; if the file moves without updating the lock, the test crashes on `tree = ast.parse(path.read_text(...))`.
- **Strict-order requirement**: #62 ONE COMMIT per plan-loop-1-04 line 284.

### `test_w4_bc_g_kri_history_boundaries_red.py`

Loop 1 adds many structural assertions to this file (file-existence, importer scrubs).

| Item | Touch kind | Note |
|---|---|---|
| #3 (kriFormWorkflow.ts delete) | tighten | plan-loop-1-04 line 36 quote `Backend mirror lock test in tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py (new test) asserting not (REPO_ROOT / "frontend/src/components/kri-form/kriFormWorkflow.ts").exists()`. |
| #24 (kris/linked_vendors.py delete) | tighten | plan-loop-1-04 line 61-63 quote `Add to tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py: assert not (REPO_ROOT / "backend/app/api/v1/endpoints/kris/linked_vendors.py").exists()`. |
| #25 (kri department-scope helper) | tighten | plan-loop-1-04 line 91 quote `Structural lock in tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py: assert that get_user_department_ids appears at most once across due_soon.py, overdue.py, breaches.py`. |
| #26 (KRIForm.tsx delete) | tighten | plan-loop-1-04 line 114 quote `Add to backend lock test_w4_bc_g_kri_history_boundaries_red.py (or new frontend-mirror test): assert not (REPO_ROOT / "frontend/src/components/KRIForm.tsx").exists()`. |
| #50 (submission.py delete) | tighten | plan-loop-1-04 line 147 quote `Add to tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py: assert not (REPO_ROOT / "backend/app/services/_kri_history/submission.py").exists()`. |
| #51 (value_application.py delete) | tighten | plan-loop-1-04 line 175 quote `assert not (REPO_ROOT / "backend/app/services/_kri_history/value_application.py").exists()`. |
| #52 (correction_plans.py delete) | tighten | plan-loop-1-04 line 210 quote `assert not (REPO_ROOT / "backend/app/services/_kri_history/correction_plans.py").exists()`. |

- **Conflict risk**: HIGH. **Seven items append assertions to the same file.** Without ordering, commits race on the same `assert not (REPO_ROOT / "...").exists()` family.
- **Strict-order requirement**: per recommended sequential order: #3 → #52 → #50 → cluster A (#24+#51) → #26 → #25.
- **Atomic-commit recommendation**: each item appends its own stanza. Append-only on this file is safe; the per-item ordering only matters for the file deletions themselves.

### `test_w11b_test_infra_polish_red.py` (`:18-25` `DEAD_KRI_HISTORY_FACADES`)

| Item | Touch kind | Note |
|---|---|---|
| (no Loop 1 item edits this hardcoded set) | reference-only | The 6 dead facades are already verified gone by `test_dead_kri_history_endpoint_facades_are_removed` at `:63-66`. #50 and #52 add NEW deletion assertions in `test_w4_bc_g_*` rather than extending this set. |

- **Conflict risk**: LOW. Hardcoded set unchanged.
- **Strict-order requirement**: any new architecture test file added by Loop 1 must include `pytestmark = pytest.mark.contract` (the `test_architecture_tests_are_marked_contract` invariant at `:32-43`).

### `test_w12_riskhub_config_service_commit_ratchet_red.py:40` cap=2

- See `_riskhub_config_service_commit_allowlist.toml` section above. **No Loop 1 item touches this lock or its TOML.**

### `test_w12_vendor_governance_service_commit_ratchet_red.py:40` cap=4

- See `_vendor_governance_service_commit_allowlist.toml` section above. **No Loop 1 item touches this lock or its TOML.**

---

## NEW lock-test files proposed by Loop 1

Compiled from all 8 plans. Each must declare `pytestmark = pytest.mark.contract` per `test_w11b:32-43`.

| Source item | New file | Section |
|---|---|---|
| #1 (A-N1) | `tests/backend/pytest/architecture/test_risks_crud_public_surface_red.py` | risks domain |
| #19 (S1.4) | `tests/backend/pytest/architecture/test_validate_risk_type_single_owner_red.py` | risks domain |
| #20 (S1.6) | `tests/backend/pytest/architecture/test_risks_required_reexports_red.py` | risks domain |
| #2 (B-N1) | `tests/backend/pytest/architecture/test_issue_workflow_no_underscored_self_aliases_red.py` (or appended in deepening contracts) | issues domain |
| #25 (S3.7) | `tests/backend/pytest/test_kris_department_scope_helper_red.py` | kris domain |
| #62 (S5.9) | `tests/backend/pytest/test_kri_vendor_assignment_audit_red.py` | kris domain |
| #73 (ADR-012) | `tests/backend/pytest/architecture/test_kri_period_algebra_ssot_red.py` + `_kri_state_vocabulary_allowlist.toml` (NEW TOML) + `tests/backend/pytest/test_kri_deadline_classify_red.py` | kris domain |
| #13 (S5.1) | `tests/backend/pytest/architecture/test_vendor_link_helpers_shim_removed_red.py` | vendor domain |
| #16 (S8.10) | `tests/backend/pytest/architecture/test_reports_legacy_excel_tombstones_removed_red.py` | vendor domain |
| #17 (S2.1) | `tests/backend/pytest/architecture/test_monitoring_response_endpoint_shim_removed_red.py` (or `test_monitoring_response_shim_removed_red.py` — endpoint plan calls it the latter) | endpoints domain |
| #31 (S5.5) | `tests/backend/pytest/services/test_vendor_governance_reports_red.py` + `tests/backend/pytest/architecture/test_vendor_reports_endpoint_no_row_builders_red.py` | vendor domain |
| #57 (S8.1) | `tests/backend/pytest/architecture/test_quarterly_comparison_facade_removed_red.py` | vendor/quarterly domain |
| #69 (S5.2) | `tests/backend/pytest/architecture/test_vendor_link_mixin_red.py` + `tests/backend/pytest/migrations/test_vendor_link_cascade_postgres_red.py` | vendor domain |
| #70 (S5.7) | `tests/backend/pytest/architecture/test_vendor_status_drop_red.py` + `tests/backend/pytest/migrations/test_vendor_status_column_dropped_postgres_red.py` | vendor domain |
| #4 (FE-deadcode-1) | `tests/frontend/unit/src/components/control-form/__tests__/controlFormWorkflow.deleted.test.ts` | FE domain |
| #5 (FE-deadcode-2) | `tests/frontend/unit/src/components/governance/__tests__/orphanResolutionPresentation.deleted.test.ts` | FE domain |
| #6 (FE-deadcode-3) | `tests/frontend/unit/src/components/notifications/__tests__/resourcePath.deleted.test.ts` | FE domain |
| #22 (S2.8) | `tests/frontend/unit/src/components/__tests__/ControlForm.shim.deleted.test.ts` | FE domain |
| #23 (S2.9) | `tests/frontend/unit/src/components/control-form/__tests__/controlFormUtils.inline.test.ts` | FE domain |
| #32 (S5.8) | `tests/frontend/unit/src/components/vendors/__tests__/useVendorLinkedEntityTab.contract.test.tsx` + `VendorLinkedEntityTab.duplication.test.ts` | FE domain |
| #35 (S7.7) | `tests/frontend/unit/src/hooks/__tests__/usePermissions.deleted.test.ts` + `Sidebar.usePermissions.replaced.test.tsx` | FE domain |
| #36 (S7.8a) | `tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.factory.test.tsx` | FE domain |
| #37 (S7.10) | `tests/backend/pytest/api/v1/users/test_summary_can_view_governance.py` | FE domain (backend prereq for #66) |
| #39 (S8.7) | `tests/backend/pytest/api/v1/admin/test_capabilities_builder.py` | FE domain (backend prereq for #66) |
| #46 (FE-N1) | `tests/frontend/unit/src/lib/queryKeys/__tests__/queryKeys.invariant.test.ts` | FE domain |
| #47 (FE-N4) | `tests/frontend/unit/src/services/api/__tests__/sessionRefreshPolicy.test.ts` | FE domain |
| #48 (FE-N6) | `tests/frontend/unit/src/i18n/__tests__/errorKeys.merged.test.ts` | FE domain |
| #64 (FE-N2) | `tests/frontend/unit/src/services/api/__tests__/queryClient.defaults.test.ts` | FE domain |
| #65 (FE-N3) | `tests/frontend/unit/src/services/api/schemas/__tests__/crudCapabilitySchema.snapshot.test.ts` | FE domain |
| #66 (FE-N5) | `tests/frontend/unit/src/contexts/__tests__/SessionProvider.split.test.tsx` + `AuthActions.split.test.tsx` | FE domain |
| #67 (FE-N7) | `tests/frontend/unit/src/hooks/__tests__/useResourcePanelQuery.contract.test.tsx` | FE domain |
| #68 (FE-N8) | `tests/frontend/unit/src/components/dashboard/__tests__/WidgetShell.contract.test.tsx` + `DashboardFilterContext.scopedSelector.test.tsx` | FE domain |
| #71 (S7.8) | `tests/frontend/unit/src/services/session/__tests__/sessionStorage.merged.test.ts` + `coordinator.merged.test.ts` + `coordinator.singleFlight.test.ts` | FE domain |
| #10 (S8.5) | `tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py` | endpoints domain |
| #12 (D-N3) | `tests/backend/pytest/api/v1/test_users_summary_blanket_except_red.py` + optional `tests/backend/pytest/architecture/test_users_summary_narrow_excepts_red.py` | endpoints domain |
| #15 (D-N2) | `tests/backend/pytest/architecture/test_capability_catalog_access_user_surface_red.py` | endpoints domain |
| #21 (S2.6) | `tests/backend/pytest/architecture/test_control_risk_link_loader_collapsed_red.py` | endpoints domain |
| #38 (S8.6) | `tests/backend/pytest/architecture/test_endpoint_inline_pydantic_evicted_red.py` | endpoints domain |
| #43 (BE-N4) | `tests/backend/pytest/architecture/test_audit_adapter_emitter_helper_red.py` | endpoints domain |
| #44 (BE-N6) | `tests/backend/pytest/architecture/test_router_prefix_registry_red.py` + `backend/app/api/v1/_router_registry.toml` (NEW TOML) | endpoints domain |
| #49 (S2.2) | `tests/backend/pytest/architecture/test_control_execution_monitoring_inlined_red.py` | endpoints domain |
| #58 (S8.3) | `tests/backend/pytest/architecture/test_orphaned_item_facade_removed_red.py` | endpoints domain |
| #59 (S2.10) | `tests/backend/pytest/architecture/test_monitoring_packages_separated_red.py` | endpoints domain |
| #63 (BE-N7) | `tests/backend/pytest/test_outbox_dispatch_scheduler_job_run_red.py` | endpoints domain |
| #40 (S8.11) | `tests/backend/pytest/architecture/test_w12_admin_subrouter_clustering_red.py` + `tests/backend/pytest/test_admin_route_table_snapshot_red.py` | crosscut domain |
| #42 (BE-N2) | `tests/backend/pytest/test_outbox_actor_payload_base_red.py` | crosscut domain |
| #45a (BE-N8a) | `tests/backend/pytest/test_ownership_resolver_kri_archived_asymmetry.py` + `test_ownership_resolver_control_join.py` + `test_visible_ids_via_ownership.py` | crosscut domain |
| #45b (BE-N8b) | `tests/backend/pytest/test_ownership_resolver_factory_equivalence_red.py` | crosscut domain |
| #55 (S7.5) | `tests/backend/pytest/architecture/test_access_user_service_removed_red.py` | crosscut domain |
| #56 (S7.6) | `tests/backend/pytest/architecture/test_directory_identity_service_removed_red.py` | crosscut domain |
| #61 (S7.7) | `tests/backend/pytest/architecture/test_graph_directory_package_move_red.py` | crosscut domain |
| #72 (ADR-011) | `tests/backend/pytest/architecture/test_adr_011_present_red.py` | crosscut domain |
| #74a (ADR-007 census) | `tests/backend/pytest/architecture/test_bounded_context_classification_complete_red.py` + 4–5 NEW TOMLs (`_bounded_context_write_side.toml`, `_bounded_context_read_shape.toml`, `_bounded_context_workflow_pairs.toml`, `_bounded_context_adapters.toml`, optional `_bounded_context_policy.toml`) | crosscut domain |
| #74b (ADR-007 amendment) | `tests/backend/pytest/architecture/test_adr_007_amendment_present_red.py` | crosscut domain |

**Total NEW backend lock test files (architecture/)**: ~24.
**Total NEW backend non-architecture test files**: ~17 (includes Postgres-lane migration tests, ownership characterization tests, behavioral pins).
**Total NEW frontend test files**: ~22.
**Total NEW TOML registries**: 6 — `_kri_state_vocabulary_allowlist.toml` (#73), `_router_registry.toml` (#44), `_bounded_context_write_side.toml` + `_bounded_context_read_shape.toml` + `_bounded_context_workflow_pairs.toml` + `_bounded_context_adapters.toml` (#74a, plus optional `_bounded_context_policy.toml`).

**Grand total NEW lock-tier artifacts**: ~63 test files + 6 TOML registries.

---

## High-risk overlap matrix (HIGH-risk locks)

| Lock | Items that touch it (HIGH) | Recommended order | Atomic-commit boundary |
|---|---|---|---|
| `test_architecture_deepening_contracts.py:188,192` | #49 | n/a (single owner) | Same commit as `monitoring.py` deletion. |
| `test_architecture_deepening_contracts.py:226-240` | #56 | n/a | Same PR as #56 (paired with #61). |
| `test_architecture_deepening_contracts.py:243-272` | #55 | n/a | Same PR as #55. |
| `test_architecture_deepening_contracts.py:559-569` | #57 | n/a | Same commit per plan-loop-1-05 line 176. |
| `test_architecture_deepening_contracts.py:956,962` | #52 | n/a | Same commit as `correction_plans.py` deletion. |
| `test_architecture_deepening_contracts.py:976,979,980` | #51 | After #50 finishes its tuple edit | Cluster A (#24+#51) single commit. |
| `test_architecture_deepening_contracts.py:997-1002` | #50, #51 | #50 BEFORE cluster A (#24+#51) | Two separate commits; #50 leaves a clean tuple for cluster A to subset-edit. |
| `test_architecture_deepening_contracts.py:1005,1025,1041` | #54 | n/a | Same commit per plan-loop-1-03 line 209. |
| `test_architecture_deepening_contracts.py:1192-1206` | #8, #53 | #8 BEFORE #53 | #8 deletes source_validation; #53 strengthens execution.py (no direct re-edit). |
| `tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py:16` | #62 | n/a | Same commit as `kri_vendor_assignment.py` move. |
| `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py` | #3, #24, #25, #26, #50, #51, #52 | append-only; per-item ordering matches file-deletion ordering | Each item single commit; #3 → #52 → #50 → cluster A → #26 → #25. |

---

## Sequencing recommendations (cross-domain)

1. **Wave 1 — leaves with no lock conflict**:
   - #1 (risks crud surface), #20 (risks doc-only), #11 (risk.process bug), #19 (validate_risk_type) — risks domain.
   - #4, #5, #6 (FE dead-code) — FE domain.
   - #36, #46, #47, #48, #64 — FE domain.
   - #42 (ActorPayloadModel), #72 (ADR-011), #45a (ownership tests), #74a (census) — crosscut.
   - #10 (riskhub_questionnaires presence), #21 (load_link), #15 (access_user catalog), #44 (router registry) — endpoints.
   - #62 (kri_vendor_assignment relocate) — kris domain (touches W4-bc-c lock; single-owner so no cross-commit hazard).

2. **Wave 2 — single-owner deepening-contract rewrites** (each is its own commit):
   - #57 (quarterly facade) — `:559-569`.
   - #54 (approval_queue lifecycle inline) — `:1005, 1025, 1041`.
   - #49 (monitoring inline) — `:188, 192`.
   - #52 (correction_plans delete) — `:956, 962`.

3. **Wave 3 — sequenced KRI deletions on shared deepening contract tuple `:997-1002`**:
   - #50 (submission.py) → removes one tuple entry.
   - Cluster A (#24+#51, atomic) → removes two more entries + edits `:976,979,980`.

4. **Wave 4 — cluster 08 paired wave**:
   - #56 + #61 (single PR per plan-loop-1-08 line 413; deepening contract `:226-240` rewrite + path renames).
   - #55 (`:246-257` rewrite) — independent of #56/#61.

5. **Wave 5 — issues domain tail**:
   - #2, #41, #14, #27, #8, #28, #30, #29, #53 — internal sequencing per plan-loop-1-01 line 462.
   - #8 first to clear `_issue_workflow/source_validation.py` body.
   - #53 follows; the `:1193` import line is the only deepening contract touch.

6. **Wave 6 — vendor migration bundle**:
   - #69 + #70 single PR per plan-loop-1-05 line 215 (single Alembic revision).

7. **Wave 7 — adversarial / late items**:
   - #45b (after #45a green).
   - #74b (after #74a green).
   - #40 (after out-of-Loop #39 lands; admin re-cluster).

**Single-developer sequential**: every wave is sequential within itself. Adjacent waves overlap only where atomicity requires (Wave 2 items are mutually independent; Wave 3 strictly serial).

---

## Cap-pressure risks

- `_endpoint_commit_allowlist.toml`: cap 8, current 8. **NO ROOM** for new auth-flow commits before 2026-09-01 expiry.
- `_riskhub_config_service_commit_allowlist.toml`: cap 2, current 2. NO ROOM.
- `_vendor_governance_service_commit_allowlist.toml`: cap 4, current 4. NO ROOM.

Loop 1 plans verify (per plan-loop-1-03 line 97 `_endpoint_commit_allowlist.toml: no changes`; plan-loop-1-08 line 64 `verify no entry change needed`) — **no Loop 1 item adds, removes, or renames any commit-allowlist entry**. The only pressure is the 2026-09-01 sunset, which ADR-011 (#72) addresses by documenting the auth-flow plan.

---

## Final risk classification

| Risk class | Lock surfaces |
|---|---|
| HIGH | `test_architecture_deepening_contracts.py` (cluster of 11 separate test functions edited by 11 different items); `test_w4_bc_c_vendor_governance_boundaries_red.py:16`; `test_w4_bc_g_kri_history_boundaries_red.py` (7 items append). |
| MEDIUM | `_capabilities_all_allowlist.toml` (#39 may need to insert). |
| LOW | All commit-allowlist TOMLs (no row change planned); `_archive_allowlist.toml`; `_naming_allowlist.toml` (Loop 1's FE references appear misidentified); `_audit_matrix.toml` (additive helper); `_reserved_modules.toml`; `_get_db_override_whitelist.toml`. |

End of Loop 2 conflict matrix.
