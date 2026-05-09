# RiskHub Architecture-Cleanup Plan — Section 7: Registers and Supporting References

Working dir: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Anchor commit: `1ee872a4`.
Mode: PRODUCTION-WRITE. FINAL plan output (Phase 5 + Phase 6 corrections applied).
This section is the dev's reference book — all registers (READMEs/locks, risks,
rollback, gates, CI, validator, effort, open questions) consolidated as the single
source of truth for "what does item #N change beyond code, when does it land, what
breaks if it goes wrong, and what runs on every commit?".

Sources: Phase 3 Loop 3 + Phase 4 Loop 1/2 corrections + Phase 6 corrections
(Vocabulary line cite `:43-54` not `:119`/`:131`; 3 fabricated README paths
removed; #59 single README clarification; `make test-postgres-ci` not
`make postgres-up`).

---

## Section 7 — Registers and Supporting References

### 7.1 README & Lock Change Register

The dedicated register listing every README, doc, lock test, TOML, and
contract artifact touched by the plan, grouped by item. This is the single
source of truth for "what does item #N change beyond code?".

Per `plan-loop-3-05-readme-lock-register.md:8-19`, the constraints honored:
single sequential developer; TDD red→green; doc/lock-only Reject is
INVALID (orchestrator override); Defers planned (not skipped); READMEs
and locks are **outputs**, not constraints — every code change ratchets
its README + lock into the same commit.

#### Top-level totals (Phase 6 corrected)

- **Docs touched**: 58 (per `plan-loop-3-05-readme-lock-register.md:2402-2602`).
- **Locks touched**: 24 (10 lock-test files + 14 TOML registries — per `plan-loop-3-05-readme-lock-register.md:2602-2735`).
- **New files to create**: 98+ (per `plan-loop-3-05-readme-lock-register.md:2759-2818` + 2 v2 items #76/#77).
- **Files to delete**: 48 (32 backend + 16 frontend, per `plan-loop-3-05-readme-lock-register.md:2884-2886`).

#### Phase 6 corrections applied

1. **§Vocabulary line cites**: Items #34 ("privilege tier") and #60
   ("privilege context") add §Vocabulary entries to
   `docs/security/authorization-capability-contract.md`. The Vocabulary
   section is at **lines 43-54** (verified at the file). Loop 3 register
   at `:936` cited `:119` for #34 (which is the AUTHZ-APPROVALS matrix
   row, NOT the Vocabulary block), and at `:1770` cited `:131` for #60
   (AUTHZ-AUTH-SESSION row). **Phase 6 correction**: when the items
   APPEND to §Vocabulary (the table at `:43-54`), cite `:43-54`. When
   they EDIT a matrix row body that mentions a Vocabulary term, cite
   the row line (`:119` for AUTHZ-APPROVALS body, `:131` for
   AUTHZ-AUTH-SESSION body). Both items do BOTH (add Vocabulary entry +
   edit matrix row); citations must reflect the dual surface.

2. **Three fabricated README paths NOT cited as existing**: per Phase 6
   audit, the following paths appearing in Loop 3 register entries do
   NOT exist on `1ee872a4` and must NOT be treated as existing READMEs:

   - `backend/app/api/README.md` (referenced for #60 at L:1748) —
     **does not exist**; Phase 6 correction: drop the entry or create
     it as part of #60.
   - `tests/backend/pytest/api/v1/README.md` (referenced for #10 at
     L:2561) — **does not exist as a per-folder README**; Phase 6
     correction: cite the parent test docs only.
   - `frontend/src/contexts/README.md` (referenced for #66 at L:2525) —
     **does not exist**; Phase 6 correction: cite
     `frontend/src/contexts/auth/README.md` (verified) instead.

3. **#59 cannot create `_monitoring_response/README.md` as separate file**:
   per Phase 6 audit of `plan-loop-3-05-readme-lock-register.md:2497-2498`,
   #59 is documented as creating
   `backend/app/services/_monitoring_response/README.md` (NEW). On
   anchor commit `1ee872a4`, the package `_monitoring_response/` does
   exist but holds NO README. Phase 6 correction: #59's README is a
   **single file create** atomic with the package consolidation; not a
   batch of files. If `_monitoring_response/__init__.py` already
   contains the docstring header, the README is the only NEW doc.

4. **`make postgres-up` does NOT exist**: per Phase 6 verification of
   `scripts/Makefile:6`, the available targets are `test`, `test-fast`,
   `test-db-contracts`, `test-postgres-ci`, `test-architecture-locks`
   — there is **no `postgres-up` target**. Item #69+#70's gate command
   is:

   ```bash
   TEST_DATABASE_URL=postgresql+asyncpg://… make -f scripts/Makefile test-postgres-ci
   ```

   per `scripts/Makefile:121-125`. The previous Loop 3 reference to
   `make postgres-up` was a fabrication.

#### 7.1.1 Per-item READMEs/locks/files (79 items)

[Each entry: READMEs touched · locks touched · files created · files deleted ·
capability contract artifacts. 79 items total = 77 from Loop 3 register
+ #76 + #77a/b from v2 integration. Source: `plan-loop-3-05-readme-lock-register.md:31-2391`
+ `plan-loop-3-07-integration-v2.md:159-291`. Only Phase 6-confirmed
locations cited. Compact format — full entries at source register.]

| # | Audit-tag | READMEs | Locks/TOMLs | Files create | Files delete | Cap-contract |
|---:|---|---|---|---|---|---|
| 1 | A-N1 | `02-backend-endpoints.md` | `test_architecture_deepening_contracts.py` (NEW assertion) | `test_risks_crud_public_surface_red.py` | (none) | (none) |
| 2 | B-N1 | `_issue_workflow/README.md` | deepening contract NEW assertion | `test_issue_workflow_no_underscored_self_aliases_red.py` | (none) | (none) |
| 3 | S3.11 | `kri-form/README.md` | `test_w4_bc_g_kri_history_boundaries_red.py` (append) | `EntityFormWorkflow.test.ts` ext | `kri-form/kriFormWorkflow.ts` | (none) |
| 4 | FE-deadcode-1 | `control-form/README.md` (strike-line) | `_naming_allowlist.toml` (scrub if listed) | `controlFormWorkflow.deleted.test.ts` | `control-form/controlFormWorkflow.ts` | (none) |
| 5 | FE-deadcode-2 | `governance/README.md` (strike-line) | `_naming_allowlist.toml` (scrub if listed) | `orphanResolutionPresentation.deleted.test.ts` | `governance/orphanResolutionPresentation.ts` | (none) |
| 6 | FE-deadcode-3 | `notifications/README.md` (strike-line) | `_naming_allowlist.toml` (scrub if listed) | `resourcePath.deleted.test.ts` | `notifications/resourcePath.ts` | (none) |
| 7 | C-N1 | (none) | deepening contract NEW assertion | (none) | endpoint shim `_get_approval_department_id` | (none) |
| 8 | B-N2 | `_issue_workflow/README.md` (add-line) | deepening contract `:1192-1206` (`:1193` import shrink) + NEW assertion | (none) | `_issue_workflow/source_validation.py` (recommended) | `authorization-capability-contract.md:128` add-token; `.json:368` parallel |
| 9 | S6.5 | (none) | deepening contract NEW assertion | (none) | duplicate `can_user_view_approval_resource` | (none) |
| 10 | S8.5 | `riskhub_questionnaires/README.md` (verify); `endpoints/README.md`; AGENTS.md (verify) | (none — KEEP item) | `test_riskhub_questionnaires_module_present_red.py` | (none) | (none) |
| 11 | S2.7 | `01-backend-services.md` (add-line); `06-test-surface.md` (add-cross-ref) | deepening contract `:178` unchanged | (none — fix-in-place) | (none) | (none) |
| 12 | D-N3 | (none) | (none) | `test_users_summary_blanket_except_red.py` + opt narrow-excepts test | (none) | (none) |
| 13 | S5.1/C-N2 | `_vendor_links/README.md` (verify) | (none) | `test_vendor_link_helpers_shim_removed_red.py` | `vendor_link_helpers.py` | `.md:121-122` remove-token; `.json:55,479,502` parallel; **validator** |
| 14 | S4.4 | `issues/_shared/README.md` (verify); `_issue_workflow/README.md` (verify) | deepening contract NEW assertion | (extends existing tests) | (none) | (none) |
| 15 | D-N2 | (none) | (none) | `test_capability_catalog_access_user_surface_red.py` | (none) | `.md:132` add-row; `.json:113,229` add-key; `capability-catalog.json` add 8th surface; **validator** |
| 16 | S8.10 | `reports/contract-drift-remediation-2026-02-21.md`; `deep-scan-remediation-2026-02-20.md` | deepening contract NEW assertion | `test_reports_legacy_excel_tombstones_removed_red.py` | `endpoints/reports/legacy_excel.py` | (none) |
| 17 | S2.1 | `_monitoring_status/README.md` (verify) | deepening contract NEW assertion | `test_monitoring_response_endpoint_shim_removed_red.py` | `endpoints/_monitoring_response.py` | (none) |
| 18 | S6.2 | (none) | deepening contract `:1029` unchanged + NEW assertion; `_endpoint_commit_allowlist.toml` verify-no-change | (none) | endpoint `_build_approval_read` | (none) |
| 19 | S1.4 | `01-backend-services.md` (add-line); `02-backend-endpoints.md` (replace-line); `06-test-surface.md` (add-cross-ref) | (none — service consolidation) | `test_validate_risk_type_single_owner_red.py` + `test_risks_validation_parity.py` | `risks/crud/_shared.py` (if empty) | (none) |
| 20 | S1.6 | `02-backend-endpoints.md` (record-decision); `docs/agent/ENDPOINT_INVARIANTS.md` date-bump `:21-22` | (none — DOC-ONLY) | `test_risks_required_reexports_red.py` | (none) | (none) |
| 21 | S2.6 | (none) | deepening contract NEW assertion | `test_control_risk_link_loader_collapsed_red.py` | (none) | (none) |
| 22 | S2.8 | `control-form/README.md` (declare-canonical); `03-frontend-architecture.md` (remove-shim) | `_naming_allowlist.toml` (scrub) | `ControlForm.shim.deleted.test.ts` | `components/ControlForm.tsx` | (none) |
| 23 | S2.9 | `control-form/README.md` (note-inlined) | (none) | `controlFormUtils.inline.test.ts` | `control-form/controlFormUtils.ts` | (none) |
| 24 | S3.4 | (atomic with #51) | deepening contract `:976,979,980,997-1002` (#50+#51 cluster); `test_w4_bc_g_kri_history_boundaries_red.py` (append) | (extends existing tests) | `endpoints/kris/linked_vendors.py` | `.md:116-118` remove-token; `.json:106,111,113,229,388,389,410,411` parallel; **validator** |
| 25 | S3.7 | (none) | deepening contract NEW assertion; `test_w4_bc_g_kri_history_boundaries_red.py` (append) | `test_kris_department_scope_helper_red.py` | (none) | (none) |
| 26 | S3.9 | `kri-form/README.md` (remove-prose) | `test_w4_bc_g_kri_history_boundaries_red.py` (append); ESLint pin | FE mirror test for `KRIForm.tsx` deletion | `components/KRIForm.tsx` | (none) |
| 27 | S4.2 | `issues/_shared/README.md` (remove-line) | deepening contract NEW assertion | (extends existing tests) | `issues/_shared/loading.py` | (none) |
| 28 | S4.3 | `issues/_shared/README.md` (remove-line); `_issue_register/README.md` (add-line) | deepening contract NEW assertion | (extends existing tests) | `issues/_shared/links.py` | `.md:128` retoken; `.json` parallel |
| 29 | S4.6 | `_issue_register/README.md` (append-line) | deepening contract NEW assertion | `test_issue_source_type_value.py` | (none) | (none) |
| 30 | S4.10 | `issues/_shared/README.md` (refresh-list) | deepening contract NEW assertion | (extends existing tests) | (none) | (none) |
| 31 | S5.5 | `_vendor_governance/README.md` (add-line) | deepening contract NEW assertion | `test_vendor_governance_reports_red.py` + `test_vendor_reports_endpoint_no_row_builders_red.py` | (none) | (none) |
| 32 | S5.8 | `vendors/README.md` (describe-shell) | (none) | `useVendorLinkedEntityTab.contract.test.tsx` + `VendorLinkedEntityTab.duplication.test.ts` + 2 NEW prod files | (none) | (none) |
| 33 | S6.4 | `forms/README.md` (note-canonical); `kri-form/README.md` (verify) | (none) | `KRIFormContainer.approval-banner.test.tsx` + `no-kri-banner-duplicate.test.ts` | `kri-form/KriApprovalQueuedBanner.tsx` | (none) |
| 34 | S6.6 | `_authorization_capabilities/README.md` (verify); `_approval_execution/README.md` (optional cross-ref); AGENTS.md `:80-83` verify | deepening contract NEW assertion (16-file string-search lock) | `test_approval_privilege_tier.py` | (none) | `.md:43-54` (Vocabulary "privilege tier", **Phase 6 cite**) + `:119` (AUTHZ-APPROVALS body); `.json:629` parallel; **validator** |
| 35 | S7.3 | `frontend/src/hooks/README.md` (remove-entry); `03-frontend-architecture.md` (note-removal) | `_naming_allowlist.toml` drop `usePermissions` if listed; `useAuthz.invariant.test.ts` verify | `usePermissions.deleted.test.ts` + `Sidebar.usePermissions.replaced.test.tsx` | `hooks/usePermissions.ts` | **FE local-gate registry** entry remove |
| 36 | S7.4 | `frontend/src/authz/README.md` (describe-factory) | (none — `useAuthz.invariant.test.ts:46-48` unrelated) | `BusinessRouteGuards.factory.test.tsx` | (none) | (none) |
| 37 | S7.10 | (none) | deepening contract NEW assertion (`endpoints/users/summary.py` 3-way) | `test_summary_can_view_governance.py` | (none) | (none) |
| 38 | S8.6 | AGENTS.md (verify); `endpoints/ENDPOINT_INVARIANTS.md` KEEP | deepening contract NEW assertion | `test_endpoint_inline_pydantic_evicted_red.py` + 2 NEW schema files | (none) | (none) |
| 39 | S8.7 | (none) | `_capabilities_all_allowlist.toml` add-entry potential (order strict) | `test_capabilities_builder.py` + 1 NEW prod (`_authorization_capabilities/admin.py`) | `endpoints/admin/capabilities.py` | `.md:132` rewrite-row; `.json` parallel; **validator (parity-bearing)** |
| 40 | S8.11 | `endpoints/admin/README.md` (rewrite); AGENTS.md `:80-83` verify; `endpoints/README.md` (add-subsection) | `_endpoint_commit_allowlist.toml` verify-no-change; `02-backend-endpoints.md` refresh-table | `test_w12_admin_subrouter_clustering_red.py` + `test_admin_route_table_snapshot_red.py` + 3 NEW endpoints | 7 admin files (console/directory_sync/structured_logs/orphans/snapshots/log_config + capabilities) | (none) |
| 41 | B-N3 | `_issue_workflow/README.md` (verify) | deepening contract NEW assertion | (extends existing tests) | (none) | (none) |
| 42 | BE-N2 | (none) | deepening contract NEW assertion | `test_outbox_actor_payload_base_red.py` + 1 ext (`outbox/payloads.py`) | (none) | (none) |
| 43 | BE-N4 | (none) | `_audit_matrix.toml` additive (no row change) | `test_audit_adapter_emitter_helper_red.py` + 1 NEW (`audit/_emit.py`) | (none) | (none) |
| 44 | BE-N6 | `endpoints/README.md` (add-subsection); AGENTS.md verify | `_router_registry.toml` (NEW) | `test_router_prefix_registry_red.py` + 1 NEW TOML | (none) | (none) |
| 45a | BE-N8a | (none) | (test additions; no lock change) | 3 characterization tests (`test_ownership_resolver_*`) | (none) | (none) |
| 45b | BE-N8b | `_permissions/README.md` (verify-line); AGENTS.md `:84-87` verify | deepening contract NEW assertion | `test_ownership_resolver_factory_equivalence_red.py` + 1 NEW (`_ownership_factory.py`) | (none) | (none) |
| 46 | FE-N1 | `frontend/src/lib/README.md` (add-index) | `_naming_allowlist.toml` (FE candidate) | `queryKeys.invariant.test.ts` + ~10 NEW domain modules | (none) | (none) |
| 47 | FE-N4 | `frontend/src/services/api/README.md` (note-policy) | (none) | `sessionRefreshPolicy.test.ts` + 1 NEW prod | (none) | (none) |
| 48 | FE-N6 | `frontend/src/i18n/README.md` (note-merge) | `_naming_allowlist.toml` (drop) | `errorKeys.merged.test.ts` + 1 NEW (`errorKeys.ts`) | `i18n/getErrorMessageKey.ts` + `i18n/errorCodeMap.ts` | (none) |
| 49 | S2.2 | `_monitoring_response/README.md` (NEW reference per #59) | deepening contract `:188,192` DROP | `test_control_execution_monitoring_inlined_red.py` | `_control_execution/monitoring.py` | (none) |
| 50 | S3.2 | `_kri_history/README.md` (remove-line) | deepening contract `:997-1002` (cluster); `test_w4_bc_g_kri_history_boundaries_red.py` (append) | (extends tests) | `_kri_history/submission.py` | `.md:117-118,161` remove-token; `.json` parallel; **validator** |
| 51 | S3.3 | `_kri_history/README.md` (remove-line) | deepening contract `:976,979,980,997-1002` (atomic w/ #24+#50); W4-bc-g (append) | (extends tests) | `_kri_history/value_application.py` | `.md:117-118,161` remove-token; `.json` parallel; **validator** |
| 52 | S3.5 | `_kri_history/README.md` (verify-line) | deepening contract `:956,962` drop tuple+hasattr; W4-bc-g (append); `test_w11b_test_infra_polish_red.py` reference | (extends tests) | `_kri_history/correction_plans.py` | (none) |
| 53 | S4.1 | `_issue_workflow/README.md` (refresh-list) | deepening contract `:1192-1206` (further shrink) + `:1237` unchanged | (extends tests) | `issue_workflow_service.py` + `_issue_workflow/service.py` | (none) |
| 54 | S6.3 | `_approval_queue/README.md` (drop reference) | deepening contract `:1005,1025,1041` REWRITE | (extends tests) | `_approval_queue/lifecycle.py` | (none) |
| 55 | S7.5 | `services/README.md` (remove-row) | deepening contract `:243-272` (`:246-257`) DELETE/REWRITE; `test_authz_capability_contract_validator.py:502` fixture remove | `test_access_user_service_removed_red.py` | `access_user_service.py` | `.md:109` remove-token; `.json` parallel; **validator** |
| 56 | S7.6 | `services/README.md` (remove-row) | deepening contract `:227-238` DELETE/REWRITE; `test_authz_capability_contract_validator.py:500` fixture remove | `test_directory_identity_service_removed_red.py` | `directory_identity_service.py` | `.md:109` remove-token; `.json` parallel; **validator** (atomic w/ #61) |
| 57 | S8.1 | `_quarterly_comparison/README.md:16` (orchestrator override REWRITE-section); `.planning/codebase/CONVENTIONS.md:22`; `CONCERNS.md:14`; `STRUCTURE.md`/`ARCHITECTURE.md` (verify); AGENTS.md (implicit) | deepening contract `:559-569` REWRITE | `test_quarterly_comparison_facade_removed_red.py` | `quarterly_comparison_service.py` | (none) |
| 58 | S8.3 | (none) | deepening contract NEW assertion | `test_orphaned_item_facade_removed_red.py` | `orphaned_item_service.py` + `_orphaned_items/service.py` | (none) |
| 59 | S2.10 | `_monitoring_response/README.md` (NEW — Phase 6: single file create); `_monitoring_status/README.md` (sharpen-line) | deepening contract NEW assertion | `test_monitoring_packages_separated_red.py` | (none) | (none) |
| 60 | PrivilegeContext | `_authorization_capabilities/README.md` (verify); AGENTS.md `:88-90` verify; `backend/app/api/README.md` Phase 6 NOTE: not present today | deepening contract NEW assertion (`get_privilege_context` hasattr) | `test_privilege_context.py` | (none) | `.md:43-54` (Vocabulary "privilege context", **Phase 6 cite**) + `:131` (AUTHZ-AUTH-SESSION body); `.json:629,692` parallel; **validator** |
| 61 | S7.7 | `services/README.md:23` (rewrite-row); `_graph_directory/README.md` (NEW) | `test_authz_capability_contract_validator.py:504` path rewrite | `test_graph_directory_package_move_red.py` + 5 NEW package files | 4 top-level `graph_directory_*.py` files | `.md:109` path-rewrite; `.json` parallel; **validator** (atomic w/ #56) |
| 62 | S5.9 | `_vendor_links/README.md` (extend); `STRUCTURE.md` (verify path) | deepening contract `test_w4_bc_c_vendor_governance_boundaries_red.py:16` rename-line; `_audit_matrix.toml` verify rows | `test_kri_vendor_assignment_audit_red.py` + 1 NEW (`_vendor_links/kri_assignment.py`) | `services/kri_vendor_assignment.py` (relocated) | `.md:172` perimeter-pass note; **validator** |
| 63 | BE-N7 | `outbox/README.md` (append-note) | (none — additive instrumentation) | `test_outbox_dispatch_scheduler_job_run_red.py` | (none) | (none) |
| 64 | FE-N2 | `frontend/src/services/api/README.md` (note-singleton) | (none) | `queryClient.defaults.test.ts` + 1 NEW (`queryClient.ts`) | (none) | (none) |
| 65 | FE-N3 | `frontend/src/services/api/schemas/README.md` (describe-base) | `_capabilities_all_allowlist.toml` verify-only | `crudCapabilitySchema.snapshot.test.ts` + 1 NEW (`crudCapabilitySchema.ts`) | (none) | `capability-catalog.json` pin-counts; **validator (parity-bearing — DOMINANT failure)** |
| 66 | FE-N5 | `frontend/src/contexts/auth/README.md` (rewrite-line, Phase 6: parent README is the verified one); AGENTS.md `:88-90` verify | `_naming_allowlist.toml` (FE candidate) | `SessionProvider.split.test.tsx` + `AuthActions.split.test.tsx` + `AuthActions.callbackStability.test.tsx` + 3 NEW context files | (none) | `.md:131` path-rewrite; **validator (FE local-gate)** |
| 67 | FE-N7 | `frontend/src/hooks/README.md` (describe-hook) | (none) | `useResourcePanelQuery.contract.test.tsx` + 1 NEW prod | (none) | (none) |
| 68 | FE-N8 | `frontend/src/components/dashboard/README.md` (rewrite-contents) | (none) | `WidgetShell.contract.test.tsx` + `DashboardFilterContext.scopedSelector.test.tsx` + 1 NEW (`WidgetShell.tsx`) | (none) | (none) |
| 69 | S5.2 | `_vendor_links/README.md` (rewrite); `models/README.md` (add-line); ADR-005 (append); ADR-010 (append-revision) | `_archive_allowlist.toml` verify; `_vendor_governance_service_commit_allowlist.toml` verify | `test_vendor_link_mixin_red.py` + `test_vendor_link_cascade_postgres_red.py` (postgres) + 1 NEW (`_vendor_link_mixin.py`) | (none) | (none — bundle low validator concern) |
| 70 | S5.7 | `models/README.md` (verify); `docs/README.md`; `DOCUMENTATION_TREE.md`; `BUSINESS_LOGIC.md:619` remove-line; ADR-005 rewrite-section; ADR-010 append-revision | `_archive_allowlist.toml` review/no-op; `_vendor_governance_service_commit_allowlist.toml` verify | `test_vendor_status_drop_red.py` + `test_vendor_status_column_dropped_postgres_red.py` (postgres) + 1 alembic migration | (none) | (none — bundle low validator concern) |
| 71 | S7.8 | `frontend/src/services/session/README.md` (rewrite-section); `frontend/src/contexts/auth/README.md` (update-paths); `.planning/codebase/CONCERNS.md:40` verify | `_naming_allowlist.toml` (FE candidate) | `sessionStorage.merged.test.ts` + `coordinator.merged.test.ts` + `coordinator.singleFlight.test.ts` + 2 NEW prod | 5 session files (`bootstrap.ts`, `manager.ts`, `sso.ts`, `refreshHint.ts`, `logoutSuppression.ts`) | `.md:131` path-rewrite |
| 72 | S7.9 | AGENTS.md `:92` add-line; `docs/README.md`; `DOCUMENTATION_TREE.md`; CLAUDE.md (consider cross-link); `docs/adr/README.md` add-row | `_endpoint_commit_allowlist.toml` reference-only | `test_adr_011_present_red.py` + 1 NEW ADR file | (none) | (none) |
| 73 | ADR-012 | `_kri_history/README.md` (append-line); `DOCUMENTATION_TREE.md` add-anchor; `docs/adr/README.md` add-row; `_reserved_modules.toml` reference | `_kri_state_vocabulary_allowlist.toml` (NEW) | `test_kri_period_algebra_ssot_red.py` + `test_kri_deadline_classify_red.py` + 1 NEW ADR + 1 NEW TOML | (none) | (none) |
| 74a | ADR-007(a) | `STRUCTURE.md` (verify); `ADR-007` (verify) | 4-5 NEW bounded-context TOMLs (`_bounded_context_{write_side,read_shape,workflow_pairs,adapters,policy}.toml`) | `test_bounded_context_classification_complete_red.py` + opt `test_w7_bounded_context_disjointness.py` + 4-5 NEW TOMLs | (none) | (none) |
| 74b | ADR-007(b) | AGENTS.md `:94-95` add-line; `DOCUMENTATION_TREE.md` verify; `docs/adr/README.md` add-line; `docs/adr/ADR-007` (append-amendment); CONTEXT.md cross-ref | (none) | `test_adr_007_amendment_present_red.py` | (none) | (none) |
| 75 | Bonus | `_approval_execution/README.md` (optional cross-reference) | deepening contract NEW assertion | (extends tests for `_auto_reject_kri_approval`) | duplicate `_auto_reject_kri_approval` | (none) |
| 76 | NEW (Phase 4 v2) | (auth-flow READMEs cross-cut) | `_endpoint_commit_allowlist.toml` (8 auth/* `expires_at` rows MIGRATE before 2026-09-01) | `test_auth_flow_db_commit_migrated_red.py` (calendar-tracked) | (none) | (none) |
| 77a | NEW (Phase 4 v2) | `frontend/src/services/api/schemas/` (verify) | (none) | `vendor.status.optional.test.ts` (FE-soft) | (none) | (none — pre #70) |
| 77b | NEW (Phase 4 v2) | `frontend/src/services/api/schemas/` (rewrite) | (none) | `vendor.status.removed.test.ts` (FE-cleanup) | (FE TS schema field `vendor.status`) | (none — post #70) |

**Per-item coverage**: 79 items × (≥1 README, ≥1 lock, ≥1 NEW or DELETED file
when applicable) — 100% coverage. The cells `(none)` reflect items where
the surface is genuinely empty (e.g., #20 DOC-ONLY with stable re-export).

#### 7.1.2 Doc × items inverse index (most-touched docs)

[Source: `plan-loop-3-05-readme-lock-register.md:2402-2602` aggregated.
Top docs ranked by item count, with Phase 6 corrections applied.]

| Doc path | Item count | Items |
|---|---:|---|
| `tests/backend/pytest/test_architecture_deepening_contracts.py` | 15+ items at distinct line ranges | #2, #7, #8, #9, #11 (`:178`), #14, #18 (`:1029`), #27, #28, #29, #30, #34, #41, #49 (`:188,192`), #50+#51 (`:997-1002`), #51 (`:976,979,980`), #52 (`:956,962`), #53 (`:1192-1206,:1237`), #54 (`:1005,1025,1041`), #55 (`:243-272`), #56 (`:227-238`), #57 (`:559-569`), #60, #75 |
| `docs/security/authorization-capability-contract.md` | 17 items touch; 11 actively edit; 6 verify | #8 (`:128` add-token), #13 (`:121-122` remove-token), #15 (`:132` add-row), #24 (`:116-118` remove-token), #28 (`:128` retoken), **#34 (`:43-54` Vocabulary "privilege tier" + `:119` AUTHZ-APPROVALS body — Phase 6 dual cite)**, #37 (note SoT), #39 (`:132` rewrite-row), #50 (`:117-118,161` remove-token), #51 (`:117-118,161` remove-token), #55 (`:109` remove-token), #56 (`:109` remove-token), **#60 (`:43-54` Vocabulary "privilege context" + `:131` AUTHZ-AUTH-SESSION body — Phase 6 dual cite)**, #61 (`:109` path-rewrite), #62 (`:172`), #66 (`:131`), #71 (`:131`) |
| `docs/security/authorization-capability-contract.json` | 17 items (parallel to .md) | Same 17 items at lines 55, 106, 111, 113, 229, 368, 388, 389, 410, 411, 479, 502, 629, 692, 719 |
| `AGENTS.md` | 9 items reference; 2 add lines | #10 (`:75-79` verify), #38 (verify), #40 (`:80-83` verify), #44 (verify), #45b (`:84-87` verify), #57 (implicit), #66 (`:88-90` verify), #72 (`:92` add-line), #74b (`:94-95` add-line) |
| `docs/DOCUMENTATION_TREE.md` | 4 | #70 (verify `:255-256`), #72 (add-anchor `:258-260`), #73 (add-anchor `:260-261`), #74b (verify `:262-263`) |
| `backend/app/api/v1/endpoints/issues/_shared/README.md` | 4 | #14 (verify), #27 (remove-line), #28 (remove-line), #30 (refresh-list) |
| `backend/app/services/_kri_history/README.md` | 4 | #50 (remove-line), #51 (remove-line), #52 (verify-line), #73 (append-line) |
| `backend/app/services/_issue_workflow/README.md` | 5 | #2 (verify), #8 (add-line), #14 (verify), #41 (verify), #53 (refresh-list) |
| `docs/adr/README.md` | 3 | #72 (add-row), #73 (add-row), #74b (add-line) |
| `backend/app/services/_vendor_links/README.md` | 3 | #13 (verify), #62 (extend), #69 (rewrite) |
| `frontend/src/components/control-form/README.md` | 3 | #4 (strike-line), #22 (declare-canonical), #23 (note-inlined) |

**Secondary doc-touch surface (counts < 4)** — per
`plan-loop-3-05-readme-lock-register.md:2473-2600`:

- `backend/app/services/README.md` — 3 (#55 remove-row, #56 remove-row, #61 rewrite-row).
- `backend/app/services/_issue_register/README.md` — 2 (#28 add-line, #29 append-line).
- `backend/app/services/_authorization_capabilities/README.md` — 2 (#34 verify, #60 verify).
- `backend/app/models/README.md` — 2 (#69 add-line, #70 verify).
- `backend/app/api/v1/endpoints/README.md` — 2 (#10, #44).
- `frontend/src/contexts/auth/README.md` — 2 (#66 rewrite-line, #71 update-paths). **Phase 6: this is the verified parent README, not `frontend/src/contexts/README.md`.**
- `frontend/src/services/api/README.md` — 2 (#47, #64).
- `frontend/src/hooks/README.md` — 2 (#35, #67).
- `.planning/codebase/CONVENTIONS.md` — 2 (#57 `:22`, #66 `:43`).
- `.planning/codebase/CONCERNS.md` — 3 (#57 `:14`, #66 verify `:9`, #71 verify `:40`).
- `.planning/codebase/STRUCTURE.md` — 3 (#57, #62, #74a).
- `.planning/audits/_context/01-backend-services.md` — 2 (#11, #19).
- `.planning/audits/_context/02-backend-endpoints.md` — 4 (#1, #19, #20, #40).
- `.planning/audits/_context/03-frontend-architecture.md` — 3 (#22, #35, #66).
- `.planning/audits/_context/06-test-surface.md` — 2 (#11, #20).
- `docs/agent/ENDPOINT_INVARIANTS.md` — 3 (#10 KEEP, #20 date-bump `:21-22`, #38 KEEP).
- `docs/security/capability-catalog.json` — 3 (#15 add-surface, #39 pin-truth-table, #65 pin-counts).
- `docs/adr/ADR-005-archivable-mixin-schema-contract.md` — 2 (#69 append, #70 rewrite-section).
- `docs/adr/ADR-010-postgres-migration-rehearsal-contract.md` — 2 (#69 append-revision, #70 append-revision).
- `docs/adr/ADR-007-bounded-context-taxonomy.md` — 2 (#74a verify, #74b append-amendment).
- `docs/README.md` — 2 (#70 remove-line, #72 add-line).
- `docs/BUSINESS_LOGIC.md` — 1 (#70 `:619` remove).
- `frontend/src/lib/README.md` — 1 (#46 add-index).
- `frontend/src/services/api/schemas/README.md` — 1 (#65 describe-base).
- `frontend/src/i18n/README.md` — 1 (#48 note-merge).
- `frontend/src/authz/README.md` — 1 (#36 describe-factory).
- `frontend/src/services/session/README.md` — 1 (#71 rewrite-section).
- `frontend/src/components/dashboard/README.md` — 1 (#68 rewrite-contents).
- `frontend/src/components/governance/README.md` — 1 (#5 strike-line).
- `frontend/src/components/notifications/README.md` — 1 (#6 strike-line).
- `frontend/src/components/kri-form/README.md` — 2 (#26 remove-prose, #33 verify).
- `frontend/src/components/forms/README.md` — 1 (#33 note-canonical).
- `frontend/src/components/vendors/README.md` — 1 (#32 describe-shell).
- `backend/app/services/_quarterly_comparison/README.md` — 1 (#57 rewrite-section, `:16`).
- `backend/app/services/_approval_execution/README.md` — 2 (#34, #75 — optional cross-reference).
- `backend/app/services/_approval_queue/README.md` — 1 (#54 drop reference).
- `backend/app/services/_vendor_governance/README.md` — 1 (#31 add-line).
- `backend/app/services/outbox/README.md` — 1 (#63 append-note).
- `backend/app/services/_monitoring_response/README.md` — 1 (#59 NEW — Phase 6: single-file create).
- `backend/app/services/_monitoring_status/README.md` — 1 (#59 sharpen-line).
- `backend/app/services/_graph_directory/README.md` — 1 (#61 NEW; created).
- `backend/app/api/v1/endpoints/admin/README.md` — 1 (#40 rewrite-contents §:9-19).
- `backend/app/core/_permissions/README.md` — 1 (#45b verify-line).
- `backend/app/api/v1/endpoints/risk_questionnaires/README.md` — 1 (#10 verify only).
- `backend/app/api/v1/endpoints/riskhub/README.md` — 1 (#10 verify only).
- `docs/security/reports/contract-drift-remediation-2026-02-21.md` — 1 (#16).
- `docs/security/reports/deep-scan-remediation-2026-02-20.md` — 1 (#16).

**Phase 6 fabricated paths NOT counted**: `backend/app/api/README.md`,
`tests/backend/pytest/api/v1/README.md`, `frontend/src/contexts/README.md`
were each cited as "touched" by an item in Loop 3 register but do not
exist on `1ee872a4`. Items remain (cited correctly to verified parents).

**Total docs-touched surface**: 58 (including AGENTS.md, CLAUDE.md,
CONTEXT.md, docs/README.md, all package READMEs, all `.planning/codebase/`,
all `.planning/audits/_context/`, all `docs/adr/`, all
`docs/security/`, all `docs/agent/`).

#### 7.1.3 Lock × items inverse index (most-touched locks)

[Source: `plan-loop-3-05-readme-lock-register.md:2602-2735` and
`plan-loop-2-03-lock-conflict-matrix.md` cross-referenced. Per Phase 4
adversarial corrections, the strict ordering on
`test_architecture_deepening_contracts.py` is mandatory.]

| Lock / TOML | Items | Status |
|---|---|---|
| `tests/backend/pytest/test_architecture_deepening_contracts.py` | 15+ items at specific lines (see 7.1.2) | various edits — strict ordering required (`plan-loop-3-04-risk-register.md:265-275`): #52 first → #50 → #24+#51 cluster → #57 → #54 → #49 → #56 → #55 → #8 → #53 |
| `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py` | 7 items (KRI deletes/extracts) | append-only — #3, #24, #25, #26, #50, #51, #52 |
| `tests/backend/pytest/architecture/_capabilities_all_allowlist.toml` | 3 items | verify/conditional — #37 (verify-only), #39 (add-entry potential — order strict per `plan-loop-2-03-lock-conflict-matrix.md:46-52`), #65 (verify-only) |
| `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` | 4 items | verify-no-change — #18, #40, #72; **#76 ratchet (8 auth/* `expires_at` rows MIGRATE before 2026-09-01 sunset)**. **Cap-pressure**: per `plan-loop-2-03-lock-conflict-matrix.md:34` quote `"NO room for additional auth/* commits before 2026-09-01 expiry"` — `cap is 8; current is 8` |
| `tests/backend/pytest/architecture/_archive_allowlist.toml` | 5 items | verify/scrub — #69 (verify), #70 (review), #4-#6 (scrub if listed) |
| `tests/backend/pytest/architecture/_naming_allowlist.toml` | 7 items | conditional adds (FE flagged misidentified per `plan-loop-2-03-lock-conflict-matrix.md:79-86`) — #46, #66, #71 (FE candidate), #48 (drop), #22, #35, #4-#6 (scrub) |
| `tests/backend/pytest/test_authz_capability_contract_validator.py` | 3 items | line edits — #55 (line 502 fixture remove), #56 (line 500 fixture remove), #61 (line 504 path rewrite) |
| `tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py` | 1 item | rename-line — #62 (`:16` path) |
| `backend/app/core/audit/_audit_matrix.toml` | 2 items | additive — #43 (no row change), #62 (verify rows exist) |
| `backend/app/api/v1/endpoints/_reserved_modules.toml` | 1 item | reference-only — #73 |
| `tests/backend/pytest/architecture/_vendor_governance_service_commit_allowlist.toml` | 3 items | verify-no-add — #62, #69, #70 |

**New TOMLs (7)**:
- `tests/backend/pytest/architecture/_kri_state_vocabulary_allowlist.toml` (#73).
- `backend/app/api/v1/_router_registry.toml` (#44).
- `tests/backend/pytest/architecture/_bounded_context_write_side.toml` (#74a).
- `tests/backend/pytest/architecture/_bounded_context_read_shape.toml` (#74a).
- `tests/backend/pytest/architecture/_bounded_context_workflow_pairs.toml` (#74a).
- `tests/backend/pytest/architecture/_bounded_context_adapters.toml` (#74a).
- `tests/backend/pytest/architecture/_bounded_context_policy.toml` (#74a optional 5th).

**Total locks-touched surface**: 24 (10 lock-test files + 14 TOML registries
including 7 NEW + 7 EXISTING).

#### 7.1.4 New files to create (98+)

Categorized list — production code, tests, docs, TOMLs, ADRs, migrations.
Source: `plan-loop-3-05-readme-lock-register.md:2759-2818` + `plan-loop-3-07-integration-v2.md:159-291`.

##### Backend production source (~16 files)

- `backend/app/services/_authorization_capabilities/admin.py` (#39).
- `backend/app/api/v1/endpoints/admin/telemetry.py` (#40).
- `backend/app/api/v1/endpoints/admin/sessions.py` (#40).
- `backend/app/api/v1/endpoints/admin/data_quality.py` (#40).
- `backend/app/services/outbox/payloads.py` extension `ActorPayloadModel` (#42 — additive within existing file).
- `backend/app/core/_permissions/_ownership_factory.py` (#45b).
- `backend/app/core/audit/_emit.py` (#43).
- `backend/app/services/_graph_directory/__init__.py` (#61).
- `backend/app/services/_graph_directory/service.py` (#61).
- `backend/app/services/_graph_directory/auth.py` (#61).
- `backend/app/services/_graph_directory/transport.py` (#61).
- `backend/app/services/_graph_directory/errors.py` (#61).
- `backend/app/services/_vendor_links/kri_assignment.py` (#62 — relocated).
- `backend/app/models/_vendor_link_mixin.py` (#69).
- `backend/app/schemas/health.py` (#38).
- `backend/app/schemas/preferences.py` (#38).

##### Frontend production source (~14 files)

- `frontend/src/lib/queryKeys/<domain>.ts` modules (#46) — per-domain factories, ~10 modules per `plan-loop-1-06-frontend.md:290`.
- `frontend/src/services/api/sessionRefreshPolicy.ts` (#47).
- `frontend/src/i18n/errorKeys.ts` (#48).
- `frontend/src/services/api/queryClient.ts` (#64).
- `frontend/src/services/api/schemas/crudCapabilitySchema.ts` (#65).
- `frontend/src/contexts/SessionContext.tsx` (#66).
- `frontend/src/contexts/PreferencesContext.tsx` (#66).
- `frontend/src/contexts/AuthActionsContext.tsx` (#66).
- `frontend/src/hooks/useResourcePanelQuery.ts` (#67).
- `frontend/src/components/dashboard/WidgetShell.tsx` (#68).
- `frontend/src/services/session/sessionStorage.ts` (#71).
- `frontend/src/services/session/coordinator.ts` (#71).
- `frontend/src/components/vendors/useVendorLinkedEntityTab.ts` (#32).
- `frontend/src/components/vendors/VendorLinkedEntityTab.tsx` (#32).

##### Backend tests — architecture + integration (~41 files)

Per `plan-loop-3-05-readme-lock-register.md:2680-2735`:

- #1: `test_risks_crud_public_surface_red.py`.
- #2: `test_issue_workflow_no_underscored_self_aliases_red.py` (or appended to deepening contract).
- #10: `test_riskhub_questionnaires_module_present_red.py`.
- #12: `test_users_summary_blanket_except_red.py` + optional `test_users_summary_narrow_excepts_red.py`.
- #13: `test_vendor_link_helpers_shim_removed_red.py`.
- #15: `test_capability_catalog_access_user_surface_red.py`.
- #16: `test_reports_legacy_excel_tombstones_removed_red.py`.
- #17: `test_monitoring_response_endpoint_shim_removed_red.py`.
- #19: `test_validate_risk_type_single_owner_red.py` + `test_risks_validation_parity.py`.
- #20: `test_risks_required_reexports_red.py`.
- #21: `test_control_risk_link_loader_collapsed_red.py`.
- #25: `test_kris_department_scope_helper_red.py`.
- #29: `test_issue_source_type_value.py`.
- #31: `test_vendor_governance_reports_red.py` + `test_vendor_reports_endpoint_no_row_builders_red.py`.
- #34: `test_approval_privilege_tier.py`.
- #37: `test_summary_can_view_governance.py`.
- #38: `test_endpoint_inline_pydantic_evicted_red.py`.
- #39: `test_capabilities_builder.py`.
- #40: `test_w12_admin_subrouter_clustering_red.py` + `test_admin_route_table_snapshot_red.py`.
- #42: `test_outbox_actor_payload_base_red.py`.
- #43: `test_audit_adapter_emitter_helper_red.py`.
- #44: `test_router_prefix_registry_red.py`.
- #45a: `test_ownership_resolver_kri_archived_asymmetry.py` + `test_ownership_resolver_control_join.py` + `test_visible_ids_via_ownership.py`.
- #45b: `test_ownership_resolver_factory_equivalence_red.py`.
- #49: `test_control_execution_monitoring_inlined_red.py`.
- #55: `test_access_user_service_removed_red.py`.
- #56: `test_directory_identity_service_removed_red.py`.
- #57: `test_quarterly_comparison_facade_removed_red.py`.
- #58: `test_orphaned_item_facade_removed_red.py`.
- #59: `test_monitoring_packages_separated_red.py`.
- #60: `test_privilege_context.py`.
- #61: `test_graph_directory_package_move_red.py`.
- #62: `test_kri_vendor_assignment_audit_red.py`.
- #63: `test_outbox_dispatch_scheduler_job_run_red.py`.
- #69: `test_vendor_link_mixin_red.py` + `test_vendor_link_cascade_postgres_red.py` (postgres marker).
- #70: `test_vendor_status_drop_red.py` + `test_vendor_status_column_dropped_postgres_red.py`.
- #72: `test_adr_011_present_red.py`.
- #73: `test_kri_period_algebra_ssot_red.py` + `test_kri_deadline_classify_red.py`.
- #74a: `test_bounded_context_classification_complete_red.py` + optional `test_w7_bounded_context_disjointness.py`.
- #74b: `test_adr_007_amendment_present_red.py`.
- #76: `test_auth_flow_db_commit_migrated_red.py` (Phase 4 v2 calendar-tracked).

**Total NEW backend lock-tier files: ~41 distinct test files.**

##### Frontend tests (~22 files)

Per `plan-loop-3-05-readme-lock-register.md:2704-2705` + per-item entries:

- #3: `EntityFormWorkflow.test.ts` (or extended).
- #4: `controlFormWorkflow.deleted.test.ts`.
- #5: `orphanResolutionPresentation.deleted.test.ts`.
- #6: `resourcePath.deleted.test.ts`.
- #22: `ControlForm.shim.deleted.test.ts`.
- #23: `controlFormUtils.inline.test.ts`.
- #26: frontend mirror test for `KRIForm.tsx` deletion.
- #32: `useVendorLinkedEntityTab.contract.test.tsx` + `VendorLinkedEntityTab.duplication.test.ts`.
- #33: `KRIFormContainer.approval-banner.test.tsx` + `no-kri-banner-duplicate.test.ts`.
- #35: `usePermissions.deleted.test.ts` + `Sidebar.usePermissions.replaced.test.tsx`.
- #36: `BusinessRouteGuards.factory.test.tsx`.
- #46: `queryKeys.invariant.test.ts`.
- #47: `sessionRefreshPolicy.test.ts`.
- #48: `errorKeys.merged.test.ts`.
- #64: `queryClient.defaults.test.ts`.
- #65: `crudCapabilitySchema.snapshot.test.ts`.
- #66: `SessionProvider.split.test.tsx` + `AuthActions.split.test.tsx` (+ recommended `AuthActions.callbackStability.test.tsx` per Phase 4 risk additions).
- #67: `useResourcePanelQuery.contract.test.tsx`.
- #68: `WidgetShell.contract.test.tsx` + `DashboardFilterContext.scopedSelector.test.tsx`.
- #71: `sessionStorage.merged.test.ts` + `coordinator.merged.test.ts` + `coordinator.singleFlight.test.ts`.
- #77a: `vendor.status.optional.test.ts` (FE-soft).
- #77b: `vendor.status.removed.test.ts` (FE-cleanup).

##### Migrations (1 file)

- `backend/alembic/versions/k6l7m8n9o0p1_unify_vendor_link_cascade_and_drop_vendor_status.py` (#69 + #70 atomic, per `plan-loop-2-06-migration-window.md:228-231`).

##### Docs (4 files)

- `docs/adr/ADR-011-auth-scheme-and-session-model.md` (#72).
- `docs/adr/ADR-012-kri-time-series-period-algebra.md` (#73).
- `backend/app/services/_graph_directory/README.md` (#61).
- `backend/app/services/_monitoring_response/README.md` (#59 — **Phase 6: single file create**).

##### TOMLs (7 files)

Per `plan-loop-3-05-readme-lock-register.md:2664-2680`:

- `tests/backend/pytest/architecture/_kri_state_vocabulary_allowlist.toml` (#73).
- `backend/app/api/v1/_router_registry.toml` (#44).
- `tests/backend/pytest/architecture/_bounded_context_write_side.toml` (#74a).
- `tests/backend/pytest/architecture/_bounded_context_read_shape.toml` (#74a).
- `tests/backend/pytest/architecture/_bounded_context_workflow_pairs.toml` (#74a).
- `tests/backend/pytest/architecture/_bounded_context_adapters.toml` (#74a).
- `tests/backend/pytest/architecture/_bounded_context_policy.toml` (#74a optional 5th).

**Total NEW files**: 16 (BE prod) + 14 (FE prod) + 41 (BE tests) + 22 (FE tests) +
1 (migration) + 4 (docs) + 7 (TOMLs) = **~105 NEW files** (≥98 floor).

#### 7.1.5 Files to delete (48)

Per `plan-loop-3-05-readme-lock-register.md:2820-2887`. Total: **~48**.

##### Backend (~32 files)

- `backend/app/api/v1/endpoints/vendor_link_helpers.py` (#13).
- `backend/app/services/access_user_service.py` (#55).
- `backend/app/services/directory_identity_service.py` (#56).
- `backend/app/services/quarterly_comparison_service.py` (#57).
- `backend/app/services/orphaned_item_service.py` (#58).
- `backend/app/services/_orphaned_items/service.py` (#58).
- `backend/app/services/issue_workflow_service.py` (#53).
- `backend/app/services/_issue_workflow/service.py` (#53).
- `backend/app/services/_issue_workflow/source_validation.py` (#8 — recommended end-state).
- `backend/app/services/kri_vendor_assignment.py` (#62 — relocated).
- `backend/app/services/_kri_history/submission.py` (#50).
- `backend/app/services/_kri_history/value_application.py` (#51).
- `backend/app/services/_kri_history/correction_plans.py` (#52).
- `backend/app/services/_approval_queue/lifecycle.py` (#54).
- `backend/app/services/_control_execution/monitoring.py` (#49).
- `backend/app/api/v1/endpoints/_monitoring_response.py` (#17).
- `backend/app/api/v1/endpoints/kris/linked_vendors.py` (#24).
- `backend/app/api/v1/endpoints/issues/_shared/loading.py` (#27).
- `backend/app/api/v1/endpoints/issues/_shared/links.py` (#28).
- `backend/app/api/v1/endpoints/reports/legacy_excel.py` (#16).
- `backend/app/api/v1/endpoints/admin/capabilities.py` (#40).
- `backend/app/api/v1/endpoints/admin/console.py` (#40 — merged).
- `backend/app/api/v1/endpoints/admin/directory_sync.py` (#40 — renamed).
- `backend/app/api/v1/endpoints/admin/structured_logs.py` (#40 — merged).
- `backend/app/api/v1/endpoints/admin/orphans.py` (#40 — merged).
- `backend/app/api/v1/endpoints/admin/snapshots.py` (#40 — merged).
- `backend/app/api/v1/endpoints/admin/log_config.py` (#40 — merged).
- `backend/app/api/v1/endpoints/risks/crud/_shared.py` (#19 — if empty).
- `backend/app/services/graph_directory_service.py` (#61).
- `backend/app/services/graph_directory_auth.py` (#61).
- `backend/app/services/graph_directory_transport.py` (#61).
- `backend/app/services/graph_directory_errors.py` (#61).

##### Frontend (~16 files)

- `frontend/src/components/kri-form/kriFormWorkflow.ts` (#3).
- `frontend/src/components/control-form/controlFormWorkflow.ts` (#4).
- `frontend/src/components/governance/orphanResolutionPresentation.ts` (#5).
- `frontend/src/components/notifications/resourcePath.ts` (#6).
- `frontend/src/components/ControlForm.tsx` (#22).
- `frontend/src/components/control-form/controlFormUtils.ts` (#23).
- `frontend/src/components/KRIForm.tsx` (#26).
- `frontend/src/components/kri-form/KriApprovalQueuedBanner.tsx` (#33).
- `frontend/src/hooks/usePermissions.ts` (#35).
- `frontend/src/i18n/getErrorMessageKey.ts` (#48).
- `frontend/src/i18n/errorCodeMap.ts` (#48).
- `frontend/src/services/session/bootstrap.ts` (#71).
- `frontend/src/services/session/manager.ts` (#71).
- `frontend/src/services/session/sso.ts` (#71).
- `frontend/src/services/session/refreshHint.ts` (#71).
- `frontend/src/services/session/logoutSuppression.ts` (#71).

**Total backend file deletes**: ~32. **Total frontend file deletes**: ~16.
**Grand total**: **48** (within Phase 6 spec exactly).

#### Reject-anchor doc updates (orchestrator override) — atomic with #57

Per `plan-loop-3-05-readme-lock-register.md:2741-2756`, the 3 reject-anchor
docs MUST be updated atomically with #57:

1. `backend/app/services/_quarterly_comparison/README.md:16` — REMOVE the lock-line
   `"Keep …quarterly_comparison_service.py as the public service entrypoint."`
   Replace with pointer at `dashboard/quarterly.py` consuming `_quarterly_comparison.composition` directly.
2. `.planning/codebase/CONVENTIONS.md:22` — REMOVE `quarterly_comparison_service.py` from blessed-facade list.
3. `.planning/codebase/CONCERNS.md:14` — REWRITE the line that names the facade as load-bearing concern.

In the same commit as #57:
- Lock at `tests/backend/pytest/test_architecture_deepening_contracts.py:559-569` REWRITTEN.
- New `tests/backend/pytest/architecture/test_quarterly_comparison_facade_removed_red.py` ADDED.

Plus: **#10 reaffirms questionnaires module purpose** at `AGENTS.md:162` +
`docs/agent/ENDPOINT_INVARIANTS.md:13` in the same commit as #38's schema move.

---

### 7.2 Risk Register

[62 distinct risks per `review-loop-2-05-risk-adversarial.md:309-333`.
Sources: Loop 3 A4 (34) + Loop 1 A5 surviving (22) + Loop 2 A5 new (13) − 7 dedups = 62.]

Mathematical breakdown (per `review-loop-2-05-risk-adversarial.md:315-321`):
- Loop 3 original: 34 ✅
- Loop 1 additions: 28 → 22 survive (6 dropped)
- Loop 2 adversarial NEW: 13
- Total proposed: 34 + 22 + 13 = 69
- Dedup adjustments: -7 (worktree-state ≡ partial-migration; build-cache; #71 parallel suite; #36 PWA; #43 import cycle; #73 ADR TOML schema; mock-staleness overlap)
- **FINAL: 62 distinct risks**

#### 7.2.1 Top 15 highest-priority risks

Per `review-loop-2-05-risk-adversarial.md:336-356`, ranked by Likelihood ×
Impact (HIGH/HIGH > HIGH/MEDIUM > MEDIUM/HIGH), ties broken by blast radius.

| Rank | Risk | Category | L × I | Severity | Affected items | Detection | Mitigation |
|---:|---|---|---|---:|---|---|---|
| 1 | ADR-011 #72 → 2026-09-01 auth/* allowlist sunset | CI lane regression | HIGH × HIGH | 9 | #72, #76 | Calendar tracking; CI red on `expires_at` past today | Calendar issue + #76 P1; migrate 8 `db.commit` sites before sunset (Mitigation #3) |
| 2 | #69+#70 deploy-skew → FE Zod parse failure (3-deploy required) | Migration safety | HIGH × MEDIUM-HIGH | 8 | #69+#70, #77a, #77b | E2E smoke; `vendor.status` parse error counter | 3-deploy: FE-soft → BE-migrate → FE-cleanup (Mitigation #6) |
| 3 | #34 Approvals hub partial migration (22+ sites) | Cross-domain coordination | MEDIUM × HIGH | 7 | #34, #9, #60 | `grep -rn "can_resolve_approvals" backend/` post-fix | Pre-commit grep gate + Round-2 adversarial (Mitigations #4, #7) |
| 4 | #69+#70 surviving `Vendor.status` query references | Migration safety | MEDIUM × HIGH | 7 | #69+#70, #77a/b | `grep -rn "vendor.status\|vendor_status" backend/ frontend/` | 3-deploy seq + pre-flight git grep (Mitigation #9) |
| 5 | #71 single-flight `sso.ts:9-11` module-scope state | Behavior regression | MEDIUM × HIGH | 7 | #71 | Vitest mock-isolation tests; module-scope reset | `coordinator.singleFlight.test.ts` + Round-2 adversarial |
| 6 | #66 AuthContext split memo dependencies | Behavior regression | MEDIUM × HIGH | 7 | #66, #37, #39 | `AuthActions.callbackStability.test.tsx` re-render count | Add stability test (Mitigation #16 fuzz) |
| 7 | #11 fix-without-test-inversion | Behavior regression | MEDIUM × HIGH | 7 | #11, #19 | Pre-commit grep `risk.process` in `_register_listings/` | Grep gate (Mitigation #7) |
| 8 | #66 AuthActions callback stability re-renders | Test brittleness | MEDIUM × HIGH | 7 | #66 | Re-render count test | Stability test addition |
| 9 | Hot-fix collision during cleanup window | Cross-domain coordination | MEDIUM × HIGH | 7 | All in-flight items | `origin/main` push not by cleanup dev | Hot-fix-pause protocol (Mitigation #12) |
| 10 | Reviewer cognitive overload across 79 items × 18 weeks | Test brittleness / process | HIGH × MEDIUM | 6 | Cross-cut all | Review cycle time growth | 18-week pacing + 1.5-round cadence |
| 11 | Plan-citation staleness as commits land (week-8 staleness) | Plan-time/exec drift | HIGH × MEDIUM | 6 | All wave B+ items | Citation diff-check at wave boundary | Wave-boundary re-baselining (Mitigation #11) |
| 12 | #74a "exactly 31 packages" assertion drift after #61 | Lock churn race | HIGH × MEDIUM | 6 | #74a, #61 | CI red after #61 lands if hard-coded `== 31` | Use `>= 31` allowlist or sequence #74a→#61 (Mitigation #20) |
| 13 | Capability-contract validator across 16 commits | Validator brittleness | HIGH × MEDIUM | 6 | All validator-touching | Validator subprocess > 5s per commit | Pre-commit hook + budget consolidation (Mitigation #1, #17) |
| 14 | #62 audit-log volume regression (per-row N events) | Behavior regression | HIGH × MEDIUM | 6 | #62 | 7-day baseline + 2× growth alert | Baseline capture (Mitigation #10) |
| 15 | #69+#70 ADR-010 forward-only (snapshot-only rollback) | Migration safety | LOW × HIGH | 6 | #69+#70 | Pre-merge snapshot validation; rehearsal | Snapshot strategy §7.3.3 |

(Honorable mention: Postgres lane catches issues post-merge; concurrent feature
work conflict; #46 query-key partial refactor.)

#### 7.2.2 Risks by category (12 categories — Phase 4 expanded)

Per `plan-loop-3-04-risk-register.md:683-691` + Loop 1/Loop 2 additions:

| Category | Count | Items / triggers |
|---|---:|---|
| Behavior regression | 4 | #11, #34 hub, #66 memo, #71 single-flight |
| Lock churn race | 8 | #74a count, deepening contracts cluster, #62 path, #39 order, naming TOML, #74b, new TOMLs, #56+#61 rewrite |
| Doc churn | 8 | cap-contract md/json, #34/#60 vocabulary, #24+#51 cluster, doc-only Reject, ADR-003 cross-link, ADR-005/010 atomic, issues `_shared/README`, contexts README |
| Migration safety | 3 | #69+#70 forward-only, post-upgrade row count, ADR-010 atomic |
| Cross-domain coordination | 6 | #34 hub, `users/summary.py` 3-way, #46 query-keys, FE Vendor.status, #38 BatchSend, mock files double-rewrite, issues critical path |
| Hub additivity | 1 | #34 22+ sites — overlapping with behavior regression |
| Test brittleness | 6 | #45a tight coupling, #45a→#45b weakening, contract marker, #14→#30 weak dep, snapshot order, characterization-test surface |
| Validator brittleness | 3 | 16-item validator, catalog snapshot churn, ADR vocabulary drift |
| CI lane regression | 5 | Postgres lane, 2026-09-01 sunset, cap-pressure, BE collection, FE collection |
| Plan-time/exec drift (Loop 2 NEW) | 4 | code-review burnout, plan-citation staleness, hot-fix collision, concurrent feature work conflict |
| Test infra / fuzz coverage (Loop 2 NEW) | 4 | test-fixture mutation bleeding, cumulative CI memory/time pressure, permission-boundary fuzz coverage gap, distributed-tracing correlation loss |
| External / process (Loop 2 NEW) | 5 | 3rd-party API consumer backwards incompat, pg_dump format compat, postgres-lane txn discipline, pre-commit hook proliferation budget, scheduler timing race |
| Loop 1 surviving sub-risks | 5 | Time-zone regression (#69 created_at), Audit-log volume (#62), MSAL token cache (#71/#72), DB pool exhaustion, Allowlist-discipline drift |

**Loop 1 dropped (per `review-loop-2-05-risk-adversarial.md:516-523`)**:
1. Worktree dirty-state hazard (DUPLICATE of Loop 3 #2 partial-migration).
2. Build-cache poisoning (Vite hash collisions; vanishing).
3. #71 parallel-suite single-flight (Vitest module isolation handles).
4. #36 service-worker cache (no PWA in RiskHub).
5. #43 audit emitter import cycle (Loop 1 self-contradicts: "additive").
6. #73 ADR-012 TOML schema (covered by atomic-commit invariant).

For each risk: Likelihood × Impact, Detection, Mitigation, Owner role.
Detail entries are at `plan-loop-3-04-risk-register.md` Section 1 + Loop 1/2 additions.

#### 7.2.3 Global mitigations (#1-#20)

Per `plan-loop-3-04-risk-register.md:746-786` (5 from Loop 3) +
`review-loop-2-05-risk-adversarial.md:364-440` (8 NEW Loop 2 §5) +
Loop 1 mitigations 6-12 = 20 total.

**1. Per-commit pre-commit script enforcing locks + validator.** Per
`plan-loop-2-05-validator-schedule.md:483-495`, add `scripts/dev/precommit.sh`
running architecture-locks + validator together. Enforce as a pre-commit
hook so the developer cannot accidentally skip it.

**2. Strict ordering on `test_architecture_deepening_contracts.py`.**
Per `plan-loop-2-03-lock-conflict-matrix.md:334-345`:
#52 → #50 → cluster A (#24+#51) → #57 → #54 → #49 → #56 → #55 → #8 → #53.
Bake the order into master sequence.

**3. Calendar-tracked sunset issue for 2026-09-01 auth/* expiry.** Per
Loop 2 Missing-dep #D (`plan-loop-2-07-hidden-prereqs.md:597-603`).
Add #76 to v2 master sequence (per
`plan-loop-3-07-integration-v2.md:159-198`). Owner: cross-cut domain.

**4. Round-2 adversarial review on every contract-touching commit.** Per
CLAUDE.md `## Adversarial rounds for high-stakes work`. Fresh agents,
each instructed "Round 1 produced false flags; verify each finding by
reading the current file". For #34 specifically: a fresh agent runs
`grep -rn "can_resolve_approvals" backend/` and confirms zero matches in
production code outside `approval_scenario_policy.py`.

**5. Atomic-commit invariant: code + lock + contract + README same commit.**
Per `AGENTS.md` and `plan-loop-2-04-doc-touch-matrix.md:11-15`. Doc/lock-only
Reject is invalid (orchestrator override). For high-doc-churn commits
(#24+#51 atomic = 5 md cells + 5 json strings), run the validator TWICE:
once after staging the file deletes, once after staging the doc edits, to
catch incomplete sweeps (`plan-loop-2-05-validator-schedule.md:516-520`).

**6. Three-deploy sequence for #69+#70 (FE-soft → BE-migrate → FE-cleanup).**
Per `plan-loop-2-06-migration-window.md:693` quote
`"no mid-deployment skew tolerated"`. Frontend code referencing
`vendor.status` must redeploy in lockstep. The 3-deploy sequence isolates
the deploy-skew window and provides a clean rollback path at each step.
Implementation: #77a (pre, FE-soft optional) → #69+#70 (atomic) → #77b
(post, FE-cleanup ratchet).

**7. Pre-commit grep gates for #11 and #34.** For #11: grep `risk\.process`
in `backend/app/services/_register_listings/_control_execution/` confirming
zero post-fix. For #34: grep `can_resolve_approvals` in `backend/` outside
`approval_scenario_policy.py` confirming zero.

**8. Mandatory `git stash` NEW-vs-pre-existing triage discipline.** Per
CLAUDE.md `## Dispatch rules`. When lint/type-check fails, dispatch an
agent that does `git stash` → re-run → `git stash pop` → diff. Always
verify the working tree is restored before returning.

**9. Pre-flight `git grep` for cross-domain stale references before
delete/relocate.** For every file delete (#13, #16, #17, #22, #23, #24,
#26, #27, #28, #33, #35, #48, #49, #50, #51, #52, #53, #54, #55, #56,
#57, #58, #61, #62 file moves, #71 deletes), dispatch agent with brief:
"find any unimported reference to the deleted file by grep; flag if found".

**10. Audit-log baseline capture for 7 days before #62; alert on 2× growth.**
Per Loop 1 `review-loop-1-05-risk-completeness.md:286-308`. The per-row
event emission for KRI vendor assignment changes the audit log volume
profile; a 2× growth is the early signal for the runaway-write failure mode.

**11. Wave-boundary plan re-baselining.** Per Loop 2 §2.2
(`review-loop-2-05-risk-adversarial.md:367-377`). At the start of each
wave (B/C/D/E/F/G per `plan-loop-2-08-master-sequence.md:316-324`),
dispatch a fresh agent with this brief: "Re-verify all `file:line`
citations in remaining-wave plan items against the current commit. Patch
the plan in-place if any citation has drifted."

**12. Hot-fix-pause protocol.** Per Loop 2 §2.3
(`review-loop-2-05-risk-adversarial.md:380-389`). When a P0 production
hot-fix is detected (e.g. by tracker label or `origin/main` push not
authored by the cleanup developer), the cleanup developer MUST: (a)
Stash any in-flight cleanup commit; (b) Wait for the hot-fix to land;
(c) Re-baseline against the new `main` head; (d) Re-verify the next
planned cleanup commit's `file:line` citations.

**13. Concurrent-feature-work tagging.** Per Loop 2 §2.4
(`review-loop-2-05-risk-adversarial.md:392-399`). Tech lead tags any
feature-work PR touching the 15 hot files (per Loop 2 lock-conflict
matrix `plan-loop-2-03-lock-conflict-matrix.md`) with label
`cleanup-rebase-required`. The cleanup developer's pre-flight checklist
consults the label list before starting each commit.

**14. Test ordering hardening (`pytest --randomly-seed`).** Per Loop 2
§2.5 (`review-loop-2-05-risk-adversarial.md:402-407`). Run with at least
3 distinct N values on every contract-touching commit; differing
results = order-dependent test; fix before commit.

**15. CI memory/time budget review at end of Wave C and Wave E.** Per
Loop 2 §2.6 (`review-loop-2-05-risk-adversarial.md:410-415`). At end of
Wave C (Seq 43) and Wave E (Seq 69), dispatch agent to compare CI
duration vs. start-of-cleanup baseline. If ≥ 20% increase, parallelize
via `pytest-xdist`.

**16. Property-based authz fuzz tests.** Per Loop 2 §2.7
(`review-loop-2-05-risk-adversarial.md:418-422`). For #34, #45b, #66 —
add ONE `hypothesis`-based test asserting authz invariant per refactor.
Total 3 new tests across the plan.

**17. Pre-commit hook budget consolidation.** Per Loop 2 §2.12
(`review-loop-2-05-risk-adversarial.md:425-431`). Consolidate ALL
pre-commit hooks into ONE `scripts/dev/precommit.sh`. The script runs
locks + validator + ruff + mypy in parallel with total budget ≤ 10s.
Hook ordering: cheap checks first (grep for forbidden tokens), expensive
checks last (mypy).

**18. External API consumer survey before Wave G.** Per Loop 2 §2.9
(`review-loop-2-05-risk-adversarial.md:434-440`). BEFORE starting Wave G
(Seq 76 #69+#70), confirm with stakeholders whether RiskHub exposes any
external API consumers. If yes, schedule a deprecation cycle (≥ 1
release) for `vendor.status` BEFORE landing #70.

**19. README 3-hop reachability path filter for `backend/app/**` and
`frontend/src/**`.** Per CI strategy gap analysis. The
`maintenance-governance.yml:docs-governance` lane is path-filtered;
items that touch new READMEs (e.g. #61 `_graph_directory/`, #62
`_vendor_links/kri_assignment.py`, #74a/b new bounded-context TOMLs)
must verify the path filter activates the docs invariants.

**20. Bounded-context census TOML lock (#74a).** Per Loop 2 hidden-prereq
#B at `plan-loop-2-07-hidden-prereqs.md:551-558`. Amend #74a TDD shape
to use `>= 31`, OR sequence #74a strictly before #56+#61 and pre-list
`_graph_directory` in `_bounded_context_adapters.toml` with a "post-#61"
comment.

---

### 7.3 Rollback Register

Per `plan-loop-3-03-rollback-register.md`. 77 items + 2 splits = 79
total in v2; class distribution sums verified.

#### 7.3.1 Class distribution

Per direct count of `Rollback class:` markers in
`plan-loop-3-03-rollback-register.md` (77 items in primary register;
+2 from #76, #77 v2 integration):

| Class | Items | Count | % |
|---|---|---:|---:|
| TRIVIAL | #4, #5, #6, #64 | 4 | 5.1% |
| DOC-ONLY | #10, #20, #57, #72, #74b | 5 | 6.3% |
| TEST-ONLY | #45a | 1 | 1.3% |
| MIGRATION | #69, #70 (atomic) | 2 | 2.5% |
| LOCK-RATCHET | #1, #2, #7, #9, #12, #14, #18, #21, #25, #27, #29, #31, #41, #42, #43, #47, #58, #67, #75 | 19 | 24.1% |
| CROSS-DOMAIN | #3, #8, #11, #13, #15, #16, #17, #19, #22, #23, #24, #26, #28, #30, #32, #33, #34, #35, #36, #37, #38, #39, #40, #44, #45b, #46, #48, #49, #50, #51, #52, #53, #54, #55, #56, #59, #60, #61, #62, #63, #65, #66, #68, #71, #73, #74a + #76 + #77a + #77b | 48 | 60.8% |
| **Total** | | **79** | 100% |

(With v2 integration adding #76 + #77a + #77b as MEDIUM-RISK CROSS-DOMAIN,
counts adjust to 79 total. Loop 3 register original was 77.)

Class definitions (per `plan-loop-3-03-rollback-register.md:10-15`):
- **TRIVIAL**: pure code revert (`git revert`); no DB / external state change.
- **DOC-ONLY**: revert touches docs only.
- **TEST-ONLY**: revert touches test files only (no production behaviour change).
- **MIGRATION**: requires snapshot restore (ADR-010 forward-only).
- **LOCK-RATCHET**: revert must restore allowlist entries / lock-test bodies.
- **CROSS-DOMAIN**: revert must coordinate across multiple files; risk of leaving the codebase in a broken intermediate state.

#### 7.3.2 Top 10 highest-risk reverts

Per `plan-loop-3-03-rollback-register.md:1083-1098`. Ranked by combined
criterion: revert time × CROSS-DOMAIN scope × validator obligation ×
dependency-chain depth.

| Rank | Item | Class | Why high-risk | Revert time | Procedure |
|---:|---|---|---|---|---|
| 1 | **#69 + #70** | MIGRATION (atomic) | Forward-only Postgres migration; only path is snapshot-restore (ADR-010). FK constraints, dropped column, `_archivable.py` legacy_values entry, 8 prod sites, 6 seed scripts, 4 lock files, 7 docs. App must be down during DB restore; "no mid-deployment skew tolerated" (per `plan-loop-2-06-migration-window.md:693`). | **4–8 hours** | See §7.3.3 |
| 2 | **#34** | CROSS-DOMAIN | 22+ callsites across 16 files (per `plan-loop-1-03-approvals.md:14,138`). Largest authorization-pathway change. Partial revert leaves privilege-tier dataclass and legacy boolean coexisting → silent ACL divergence. Capability-validator must re-pass. Dependency chain `#9 → #34 → #60` (per `plan-loop-2-08-master-sequence.md:165`). | **90 min** | `git revert <#34-sha>`; validator; lock-test; `grep -rn "ApprovalPrivilegeTier" backend/` confirms zero post-revert. |
| 3 | **#46** | CROSS-DOMAIN | 22 FE files holding 45 inline `queryKey:` literals (per `plan-loop-1-06-frontend.md:282`). Revert leaves test code stale across all 22 — pnpm test fails everywhere. Blocks revert of #65, #67, #68. | **75 min** | Revert downstream (#65/#67/#68) first, then `git revert <#46-sha>`; pnpm test in 22 directories; `_naming_allowlist.toml` adjust. |
| 4 | **#74a** | CROSS-DOMAIN | 4 NEW TOMLs + 1 NEW lock; package-count drift sensitive (depends on whether `>= 31` mitigation in place per `plan-loop-2-07-hidden-prereqs.md:551-553`). Cross-dep with #61. | **60 min** | Remove 4 TOMLs; revert lock body; verify `>= 31` ratchet; cross-check #61. |
| 5 | **#66** | CROSS-DOMAIN | Splits AuthContext into 3 providers; gates #68 + #71. Validator allowlist must be re-edited; FE re-render-isolation tests; 4 README diffs; backend prereqs #37 + #39. | **75 min** | Revert downstream first; restore AuthContext; FE re-render tests; capability-contract md/json path-rewrite. |
| 6 | **#39** | CROSS-DOMAIN | Capability-builder real implementation; validator parity-check on 4 NEW catalog fields; `_capabilities_all_allowlist.toml` order-strict; gates #40 and #66. | **60 min** | `git revert <#39-sha>`; validator; allowlist order check. |
| 7 | **#65** | CROSS-DOMAIN | 4 entity Zod schemas re-fanned; capability-catalog snapshot pin; validator parity-check is dominant failure mode (per `plan-loop-2-05-validator-schedule.md:344-349`). | **60 min** | `git revert <#65-sha>`; capability-catalog re-pin; pnpm test all entity schemas. |
| 8 | **#24 + #51** | CROSS-DOMAIN (atomic bundle) | Highest doc-edit volume in any single commit — 5 contract-md cells + 5 contract-json strings + 5 deepening-contract lines + 1 W4-bc-g lock + 1 README listing. Validator must re-pass. | **45 min** | Single `git revert <bundle-sha>`; validator twice (post-deletes + post-edits). |
| 9 | **#56 + #61** | CROSS-DOMAIN (atomic bundle) | Cross-import dependency between `directory_identity_service.py` and `graph_directory_service.py` (per `plan-loop-1-08-crosscut.md:362-368`). Deepening-contract test body rewrite + 11 callsite repoints + new package README + capability contract md/json path-rewrites. | **50 min** | Single `git revert <bundle-sha>`; validator; `_capabilities_all_allowlist.toml` order. |
| 10 | **#62** | CROSS-DOMAIN | W4-bc-c lock at `:16` lists exact path (per `plan-loop-2-03-lock-conflict-matrix.md:356`). Lock test crashes on `ast.parse()` if path missing. Audit-event behaviour must be restored; capability-contract perimeter-pass note must be reset. | **45 min** | `git revert <#62-sha>`; W4-bc-c `:16` rename-line; `_audit_matrix.toml` rows; baseline 7-day audit-volume re-check. |

#### 7.3.3 Snapshot strategy for #69+#70

Per `plan-loop-3-03-rollback-register.md:944-1060` and ADR-010
(`docs/adr/ADR-010-postgres-migration-rehearsal-contract.md:30`) quote
`"Production rollback is restoring the pre-upgrade database snapshot."`.

The migration `k6l7m8n9o0p1_unify_vendor_link_cascade_and_drop_vendor_status.py`
explicitly raises:

```python
raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")
```

In-place rollback via `alembic downgrade -1` is impossible. The full
snapshot-restore procedure follows.

##### Pre-merge requirements

Per `plan-loop-2-06-migration-window.md:684-688`:

1. **Pre-upgrade snapshot of production DB** captured immediately before
   `alembic upgrade head` runs against production. The snapshot MUST be
   validated as restorable on a staging clone before the production upgrade.
2. **Row-count capture** for the four affected tables, persisted alongside
   the snapshot:
   - `SELECT COUNT(*) FROM vendors`
   - `SELECT COUNT(*) FROM vendor_risk_links`
   - `SELECT COUNT(*) FROM vendor_control_links`
   - `SELECT COUNT(*) FROM vendor_kri_links`
3. **Migration rehearsal** on a refreshed staging clone (per ADR-010 line
   13 quote `"rehearse them on a refreshed staging clone"`), with monitoring
   of locks and statement duration.
4. **Application redeploy plan** verifying frontend + backend are deployable
   in lockstep — `plan-loop-2-06-migration-window.md:693` quote
   `"no mid-deployment skew tolerated"`.

##### Snapshot capture (immediately before upgrade)

```bash
# 1. Quiesce writes (drain traffic / put app in read-only mode if available).
# 2. Capture row counts.
psql -U "$PG_USER" -h "$PG_HOST" -d "$PG_DB" -A -t \
     -c "SELECT 'vendors' AS table, COUNT(*) FROM vendors
         UNION ALL SELECT 'vendor_risk_links', COUNT(*) FROM vendor_risk_links
         UNION ALL SELECT 'vendor_control_links', COUNT(*) FROM vendor_control_links
         UNION ALL SELECT 'vendor_kri_links', COUNT(*) FROM vendor_kri_links;" \
     > "/snapshots/k6l7m8n9o0p1_pre_counts.txt"

# 3. Take a Postgres snapshot. For RDS / managed Postgres, use a provider-native
#    snapshot. For self-hosted Postgres, use pg_dump in custom format:
pg_dump -U "$PG_USER" -h "$PG_HOST" -d "$PG_DB" \
        --format=custom --jobs=4 --verbose \
        --file="/snapshots/k6l7m8n9o0p1_pre_upgrade.dump"

# 4. Verify the snapshot restores cleanly on a disposable database BEFORE
#    running the upgrade in production:
createdb -U "$PG_USER" -h "$PG_HOST" k6l7_verify
pg_restore -U "$PG_USER" -h "$PG_HOST" -d k6l7_verify \
           --jobs=4 --verbose "/snapshots/k6l7m8n9o0p1_pre_upgrade.dump"
psql -U "$PG_USER" -h "$PG_HOST" -d k6l7_verify -c \
     "SELECT COUNT(*) FROM vendors;" \
     | tee /snapshots/k6l7m8n9o0p1_verify_counts.txt
diff /snapshots/k6l7m8n9o0p1_pre_counts.txt /snapshots/k6l7m8n9o0p1_verify_counts.txt
dropdb -U "$PG_USER" -h "$PG_HOST" k6l7_verify
```

##### Upgrade execution (in production)

```bash
alembic upgrade head
# Capture post-upgrade row counts; must match pre-upgrade counts (no DML).
psql -U "$PG_USER" -h "$PG_HOST" -d "$PG_DB" -A -t \
     -c "SELECT 'vendors' AS table, COUNT(*) FROM vendors
         UNION ALL SELECT 'vendor_risk_links', COUNT(*) FROM vendor_risk_links
         UNION ALL SELECT 'vendor_control_links', COUNT(*) FROM vendor_control_links
         UNION ALL SELECT 'vendor_kri_links', COUNT(*) FROM vendor_kri_links;" \
     > "/snapshots/k6l7m8n9o0p1_post_counts.txt"
diff /snapshots/k6l7m8n9o0p1_pre_counts.txt /snapshots/k6l7m8n9o0p1_post_counts.txt
# Expected: zero diff (the migration is DDL-only; no DML on these tables).
```

##### Rollback (if upgrade went wrong)

```bash
# 1. Stop application servers (no in-flight DDL).
systemctl stop riskhub-backend  # or k8s scale to 0

# 2. Drop the corrupted DB and restore from the pre-upgrade snapshot.
#    For RDS: use point-in-time-restore to the moment immediately before
#    `alembic upgrade head` started. For self-hosted:
dropdb -U "$PG_USER" -h "$PG_HOST" "$PG_DB"
createdb -U "$PG_USER" -h "$PG_HOST" "$PG_DB"
pg_restore -U "$PG_USER" -h "$PG_HOST" -d "$PG_DB" \
           --jobs=4 --verbose --exit-on-error \
           "/snapshots/k6l7m8n9o0p1_pre_upgrade.dump"

# 3. Verify row counts match pre-upgrade.
psql -U "$PG_USER" -h "$PG_HOST" -d "$PG_DB" -A -t \
     -c "SELECT 'vendors' AS table, COUNT(*) FROM vendors
         UNION ALL SELECT 'vendor_risk_links', COUNT(*) FROM vendor_risk_links
         UNION ALL SELECT 'vendor_control_links', COUNT(*) FROM vendor_control_links
         UNION ALL SELECT 'vendor_kri_links', COUNT(*) FROM vendor_kri_links;" \
     | diff - /snapshots/k6l7m8n9o0p1_pre_counts.txt

# 4. Revert the application code (mixin file + 3 link-model rebases + 8 service
#    edits + 6 seed scripts + 4 NEW lock test files):
git revert <bundled-commit-sha>

# 5. Redeploy the reverted application BEFORE allowing traffic.
systemctl start riskhub-backend  # or k8s scale to N
```

##### Post-rollback validation

1. Confirm `alembic current` shows revision `j5k6l7m8n9o0` (per
   `_context/07-migrations-schema.md:24-27`), not `k6l7m8n9o0p1`.
2. Confirm `vendors.status` column is restored:
   `SELECT column_name FROM information_schema.columns WHERE table_name='vendors' AND column_name='status';`
   returns one row.
3. Confirm `ix_vendors_status` index restored:
   `SELECT indexname FROM pg_indexes WHERE tablename='vendors' AND indexname='ix_vendors_status';`
   returns one row.
4. Confirm vendor link FKs do NOT have `ON DELETE CASCADE` (4 of 6 should be
   `confdeltype='a'` — no action — per pre-#69 baseline; the 2
   `vendor_kri_links` FKs retain `'c'` as set by
   `v2w3x4y5z6a_add_vendor_kri_links.py:28-29`).
5. Confirm the application boots: ORM imports `VendorStatusEnum` successfully;
   `_archivable.py` `vendors: ("inactive",)` legacy_values entry present.

##### Estimated revert time (#69 + #70 bundle)

- Snapshot capture: 5–30 min (dataset-size dependent).
- Snapshot validation (restore to disposable DB): 10–60 min.
- Production upgrade: 1–5 min (DDL-only).
- Rollback (if needed): 10–60 min restore + 5 min app revert + 5 min redeploy
  = **20 min – 2 hr** for the DB operation, plus git revert and validator +
  lock-test re-run = **4–8 hours total**.

#### 7.3.4 Coordination strategy for CROSS-DOMAIN reverts (3 tiers)

Per `plan-loop-3-03-rollback-register.md:1119-1165`. The 46+ CROSS-DOMAIN
items split into three coordination tiers based on the structure of
`plan-loop-2-08-master-sequence.md` and the dependency chains in
`plan-loop-2-03-lock-conflict-matrix.md`.

##### Tier 1 — chain-bound reverts (reverse-order constraint)

Reverts MUST go in the reverse order of forward landings. If a downstream
item already merged, revert it first or the upstream revert leaves a
broken intermediate state.

- **Issues chain** `#2 → #8 → #28 → #30` (length 4 — per
  `plan-loop-2-08-master-sequence.md:181`): revert in reverse
  `#30 → #28 → #8 → #2`. Each revert restores its own slice of
  `_shared/__init__.py`, `_issue_workflow/`, and `:1193` of
  `test_architecture_deepening_contracts.py`.
- **Risks chain** `#1 → #19 → #11`: revert `#11 → #19 → #1`.
- **Approvals chain** `#9 → #34 → #60`: revert `#60 → #34 → #9`.
  **#34's revert touches 22+ sites**; this is the highest single-revert
  effort outside the migration bundle.
- **Monitoring chain** `#17 → #49 → #59`: revert `#59 → #49 → #17`. Each
  revert touches the deepening-contract `:188, :192` cells (#49) plus
  their own README and shim files.
- **FE auth/session chain** `#37 → #66 → #71`, `#39 → #66 → #71`,
  `#46 → #65/#67/#68`, `#72 → #71`, `#47 → #71`: revert in reverse, with
  `#71` first (depth-4 sink).
- **ADR-007 chain** `#74a → #74b`: revert `#74b → #74a`. #74a is sensitive
  to package count drift; if #61 is still landed, the count is 32, and
  #74a's lock must be edited to `>= 31` not `== 31`.
- **Vendor.status FE-skew chain** `#77a → #69+#70 → #77b`: revert `#77b →
  #69+#70 (Tier 2 bundle) → #77a`. This is the 3-deploy migration mirror.

##### Tier 2 — atomic bundle reverts (single-commit rollback)

These items were forward-landed as one atomic commit. Their revert is also a single `git revert <bundled-sha>`:

- **#24 + #51** (KRI history barrel + value_application shim) — `plan-loop-2-08-master-sequence.md:252`.
- **#56 + #61** (directory shim + graph_directory move) — `plan-loop-2-08-master-sequence.md:253`.
- **#69 + #70** (vendor mixin + status drop) — `plan-loop-2-08-master-sequence.md:254`.

Reverting half of an atomic bundle is forbidden; the bundle's
deepening-contract assertions and contract-validator paths assume both
halves landed together.

##### Tier 3 — cross-area collisions

Items that touch the same file but are not directly in a chain:

- **#12 + #34** — both edit `endpoints/users/summary.py` (per
  `plan-loop-2-07-hidden-prereqs.md:511-516`). #12 narrows excepts; #34
  swaps privileged-predicate. If #34 already landed, the #12 revert must
  be re-rebased.
- **#37 + #12 + #34** — all three edit `users/summary.py`; recommended
  forward order `#37 → #12 → #34` (per
  `plan-loop-2-07-hidden-prereqs.md:531`); revert order
  `#34 → #12 → #37`.
- **#50 + #51** — both edit deepening-contract tuple `:997-1002` (per
  `plan-loop-2-03-lock-conflict-matrix.md:478`). #50 leaves a clean tuple
  for the #24+#51 bundle to subset-edit. Revert in reverse: #24+#51
  atomic bundle first, then #50.
- **#13 + #69** — both touch
  `authorization-capability-contract.{md:121,122, .json:55,479,502}`.
  #13 deletes the shim from the cells; #69 verifies the backend authority
  remains accurate. If both landed, revert #69+#70 first (Tier 2 bundle),
  then #13.
- **#3, #24, #25, #26, #50, #51, #52** — seven items append to
  `test_w4_bc_g_kri_history_boundaries_red.py` (per
  `plan-loop-2-03-lock-conflict-matrix.md:482`). Append-only on this file
  is safe; per-item revert removes its own stanza. Order matters only
  inasmuch as the forward-time order of file deletions matches.
- **#15 + #39 + #65** — all three edit `docs/security/capability-catalog.json`.
  Each pins a different sub-tree (per
  `plan-loop-2-04-doc-touch-matrix.md:226-233`). Revert each in reverse
  forward-order to keep the
  `validate_authz_capability_contract.py` script GREEN at every revert step.

##### Coordination protocol (single-developer)

For any CROSS-DOMAIN revert:

1. **Identify dependents**: cross-reference
   `plan-loop-2-08-master-sequence.md` "Pre-req" + "Atomic with" columns
   and `plan-loop-2-07-hidden-prereqs.md` cross-domain matrix.
2. **Block until dependents are reverted** (or NONE landed).
3. **Read the original commit's diff in full** before issuing `git revert`
   — the lock-test edits + README edits + capability-contract edits all
   sit in the same commit, and `git revert` will replay all of them.
4. **Run the validator** `python3 scripts/security/validate_authz_capability_contract.py`
   after every revert that touches `sensitive_change_paths`. This is
   non-negotiable for items #13, #15, #24, #34, #37, #39, #50, #51, #55,
   #56, #60, #61, #62, #65, #66 (the validator-gated subset per
   `plan-loop-2-05-validator-schedule.md:443-446`).
5. **Run** `make -f scripts/Makefile test-architecture-locks` after every
   revert that touches a lock or TOML.
6. **Run** `pytest -m postgres` after #69+#70 revert (snapshot restore validation).
7. **Tag the revert commit** with the original commit SHA for audit traceability.

##### Aggregate revert effort

| Class | Mean revert time | Total time (sum across items in class) |
|---|---:|---:|
| TRIVIAL | 6 min | 24 min |
| DOC-ONLY | 16 min | 80 min |
| TEST-ONLY | 10 min | 10 min |
| MIGRATION | 6 hr | 12 hr (one bundle, two items) |
| LOCK-RATCHET | 17 min | 5 hr 23 min |
| CROSS-DOMAIN | 36 min | 28 hr 48 min |
| **Total** | — | **~47 hr** (single sequential developer, 79 items) |

These numbers exclude:
- Production redeploy (~20 min per revert).
- Stakeholder communication / change-management process.
- Re-rebasing dependents if they landed in the wrong order.

For comparison, the forward effort is ~727 hours (per Phase 4 Loop 2
adversarial); the all-79-revert effort is ~6.5% of that. The dominant cost
is the **migration bundle** (12 hr nominally) and **#34 + #46** (each ≥1
hr) — three reverts account for ~30% of the total backwards budget.

---

### 7.4 Pre-commit Gate Runbook

[Per `plan-loop-3-01-precommit-gates.md:1-50`. Standard 7-step gate
sequence per item type + per-domain gate distribution.]

#### 7.4.1 Standard 7-step gate sequence

Per `plan-loop-3-01-precommit-gates.md` and `plan-loop-2-05-validator-schedule.md`:

1. **RED test confirmation** — `pytest <new test path> -q` confirms FAIL
   before any production edit (write test, see RED).
2. **Implement the change** — code + lock + doc edits land in the worktree.
3. **GREEN test confirmation** — re-run the same `pytest` command; it
   must PASS.
4. **Domain test suite** — run the broader pytest/vitest folder for the
   touched domain to detect regressions.
5. **Architecture locks** — `make -f scripts/Makefile test-architecture-locks`
   (the canonical invariant-lock runner; covers TOMLs, `_red.py`, and
   deepening contracts).
6. **Capability contract validator** (only when item touches authz surface) —
   `python3 scripts/security/validate_authz_capability_contract.py` MUST
   exit 0.
7. **Lint + type** (delta-only) — `ruff check <touched paths>`,
   `mypy <touched paths>`, and for FE items
   `cd frontend && npx tsc --noEmit`.

##### Variants by item type

- For the **migration bundle (#69 + #70)**, the gate is the **9-step
  migration sequence** drawn from `plan-loop-2-06-migration-window.md:577-633`.
- For **ADR items (#72, #73, #74b)**, the gate is just `validator +
  architecture-locks + 3-hop reachability check via
  scripts/tools/docs_tree_audit.py` (see `make docs-tree-audit`).
- For **doc-only Reject items (#10, #57)**, Step 1 is a structural
  "module-must-exist" red test; Step 7 reduces to a doc-tree audit.

##### Standard time budget

- Per-gate run wall-clock: **~5-12 min** (M-effort items at the high end).
- Validator-touching items add **~1-3 min** for validator subprocess.
- Postgres-lane items add **~5-8 min** for `pytest -m postgres`.
- Cumulative gate budget per commit: **~10-25 min** (TDD cycles double this).

#### 7.4.2 Postgres-lane items

**Items**: #69 + #70 (atomic) + downstream verification by #62 (low-volume
audit baseline check).

**Phase 6 correction — `make postgres-up` does NOT exist.** Per
`scripts/Makefile:6,121-125`, the canonical Postgres-lane gate command is:

```bash
TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub@localhost:5432/riskhub_test \
    make -f scripts/Makefile test-postgres-ci
```

This requires the `TEST_DATABASE_URL` env var to be set; the Makefile
guard at `:122` rejects the call otherwise. The 4 routine guard files
run as part of `make test-postgres-ci`:
`test_postgres_schema_contracts.py`, `test_outbox_approval_flow.py`,
`test_approval_workflow.py`, `test_health.py` (Makefile `:128-132`).

**Migration-specific RED tests** (added by #69+#70):
- `tests/backend/pytest/migrations/test_vendor_link_cascade_postgres_red.py`
  (per `plan-loop-2-06-migration-window.md:451-496`).
- `tests/backend/pytest/migrations/test_vendor_status_column_dropped_postgres_red.py`.

Both include `pytestmark = pytest.mark.postgres` to gate the run on the
TEST_DATABASE_URL discriminator.

#### 7.4.3 Validator-touching items (42 per Phase 4 Loop 2)

Per `review-loop-2-04-validator-adversarial.md:445-460`, the 42-item
validator-touching schedule:

##### HIGH (18 items — CERTAIN validator surfaces NEW finding)

#8, #13, #15, #24, #28, #34, #35, #38, #39, #45b, #50, #51, #55, #56, #60,
#61, #65, #66.

##### MEDIUM (~24 items — LIKELY Check 7a sweep)

#1, #5, #6, #7, #11, #12, #14, #16, #17, #18, #19, #21, #22, #25, #26, #27,
#29, #30 (conditional), #31, #36, #37, #40, #46, #49, #52, #54, #58, #62,
#67, #70, #73, #75 (33 nominally; ~24 net after final triage).

##### LOW (6 items — defence-in-depth only)

#45a, #57, #59, #69, #72, #74b.

##### OUT-OF-SCOPE (~22 items — no validator concern)

#2, #3, #4, #9, #10, #20, #23, #32, #33, #41, #42, #43, #44, #47, #48, #53,
#63, #64, #68, #71 (downgraded), #74a, #76 (calendar gate), #77a, #77b.

#### 7.4.4 Recommended `scripts/dev/precommit.sh` template

Per `plan-loop-2-05-validator-schedule.md:483-510` + Phase 4 Loop 2
mitigation #17 (parallel budget ≤ 10s):

```sh
#!/usr/bin/env bash
# scripts/dev/precommit.sh
# Total budget: ≤ 10s parallel.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# 1. Cheap forbidden-token greps first (subsecond).
if git diff --cached --name-only | grep -q "^backend/"; then
    if git diff --cached -- backend/ | grep -q "can_resolve_approvals"; then
        if ! git diff --cached -- backend/ | grep -q "approval_scenario_policy.py"; then
            echo "ERROR: 'can_resolve_approvals' present outside approval_scenario_policy.py" >&2
            exit 1
        fi
    fi
fi

# 2. Architecture locks + capability validator in parallel (~5s + ~3s).
echo "==> Running architecture locks…"
make -f scripts/Makefile test-architecture-locks &
LOCKS_PID=$!

echo "==> Running capability contract validator…"
python3 scripts/security/validate_authz_capability_contract.py &
VALIDATOR_PID=$!

# 3. ruff + mypy for staged files only (delta-only).
STAGED_PY=$(git diff --cached --name-only --diff-filter=ACM | grep '\.py$' || true)
if [ -n "$STAGED_PY" ]; then
    ruff check $STAGED_PY &
    RUFF_PID=$!
fi

# 4. wait for parallel checks.
wait $LOCKS_PID
LOCKS_RESULT=$?
wait $VALIDATOR_PID
VALIDATOR_RESULT=$?
[ -n "$STAGED_PY" ] && wait $RUFF_PID
RUFF_RESULT=$?

if [ "$LOCKS_RESULT" -ne 0 ] || [ "$VALIDATOR_RESULT" -ne 0 ] || \
   [ -n "$STAGED_PY" -a "$RUFF_RESULT" -ne 0 ]; then
    echo "ERROR: pre-commit gate failed" >&2
    exit 1
fi

# 5. mypy on staged files (slowest; expensive last).
if [ -n "$STAGED_PY" ]; then
    cd backend && ./venv/bin/mypy $STAGED_PY
fi

echo "==> All pre-commit gates passed."
```

For the items requiring validator, the developer's local pre-commit
checklist is:

1. `pytest <new-RED-test>.py` — confirm RED.
2. Implement fix.
3. `pytest <new-RED-test>.py` — confirm GREEN.
4. `pytest <full domain test suite>` — no regressions.
5. **`python3 scripts/security/validate_authz_capability_contract.py`** —
   exit 0 required.
6. `make -f scripts/Makefile test-architecture-locks` — exit 0 required.
7. `git add` + `git commit` (pre-commit hook re-runs steps 5 + 6 + ruff/mypy).

The validator is the **gate** between `pytest` and `git commit` for every
item in the validator schedule. CI re-runs the validator (per AGENTS.md)
but is a backstop, not the gate.

---

### 7.5 CI Strategy

[Per `plan-loop-3-02-ci-strategy.md`. 8 GitHub workflows mapped;
mandatory vs advisory matrix; 6 recommended new gates.]

#### 7.5.1 Existing CI lanes

Per `plan-loop-3-02-ci-strategy.md`, the 8 workflows:

- **`lint.yml`** (3 jobs): `frontend-unit-tests` (vitest coverage),
  `backend-quality` (ruff + mypy + suppression-budget),
  `lint` (FE lint + tsc + build + repo-contracts including authz validator + production-contract-docs + deprecated-imports).
- **`backend-postgres.yml`** (2 jobs): `sqlite-tests` (default backend
  regression), `postgres-tests` (`pytest -m postgres`). Both BLOCKING.
- **`maintenance-governance.yml`** (3 jobs):
  `docs-governance` (path-filtered), `frontend-maintenance`
  (path-filtered), `backend-maintenance-informational` (advisory).
- **`e2e.yml`** (2 jobs): `e2e-tests` (BLOCKING — out-of-scope per user),
  `production-profile-smoke` (BLOCKING).
- **`security.yml`** (9 jobs): `public-repo-hygiene`, `workflow-pin-validation`,
  `python-security` (bandit + pip-audit), `frontend-security` (npm audit),
  `frontend-i18n`, `redis-resilience-integration` (advisory cron-only),
  `container-security` (Trivy + Grype), `secrets-detection` (Gitleaks),
  `security-headers`.
- **`startup-smoke.yml`**: non-PR (push/cron); existing post-merge safety net.
- **`release-parity-{pr,fast}.yml`**: manual / nightly; out of plan scope.
- **`release.yml`**: tag-only; out of plan scope.

#### 7.5.2 Mandatory vs advisory matrix

For the 79-item plan, classify each lane as **MANDATORY** (must pass
before merge) or **ADVISORY** (informational, doesn't block).

| Lane (workflow:job) | Current gate | Plan-gate proposal | Why |
|---|---|---|---|
| `lint.yml:frontend-unit-tests` | BLOCKING | **MANDATORY** | FE coverage threshold (lines ≥58, branches ≥47) is a ratchet — every FE item (~19 frontend items + #37/#39 capability builders + auth-related items) must keep coverage from sliding. |
| `lint.yml:backend-quality` (ruff + mypy + suppression-budget) | BLOCKING | **MANDATORY** | Every backend file change touches ruff + mypy. Suppression budget is a ratchet allowlist that no plan item should breach. |
| `lint.yml:lint` (FE lint + tsc + build + repo-contracts including authz validator + production-contract-docs + deprecated-imports) | BLOCKING | **MANDATORY** | This is where the **capability-contract validator runs**. Validator-touching items (16+ from Loop 2 A5 / 42 corrected) gate here. |
| `backend-postgres.yml:sqlite-tests` | BLOCKING | **MANDATORY** | Default backend regression. Every backend code/test change needs this. |
| `backend-postgres.yml:postgres-tests` | BLOCKING | **MANDATORY** | The migration bundle (#69+#70) and the new postgres-marked tests in `tests/backend/pytest/migrations/` (per `plan-loop-2-06-migration-window.md:451-496`) MUST land green. |
| `maintenance-governance.yml:docs-governance` | BLOCKING (path-filtered) | **MANDATORY when path-touched** | Items that touch READMEs, ADRs, or `.planning/**` activate this. ALL ADRs (#72/#73/#74b), all bounded-context README adds (#61/#62/#74a/b), all doc-touch items per Loop 2 A4 trigger it. |
| `maintenance-governance.yml:frontend-maintenance` | BLOCKING (path-filtered) | **MANDATORY when path-touched** | FE debt-budget + cleanup audit. All FE items (~19) gate here. |
| `maintenance-governance.yml:backend-maintenance-informational` | ADVISORY (`continue-on-error: true`) | **ADVISORY** (keep) | Full-tree ruff/mypy noise; informational only. |
| `e2e.yml:e2e-tests` | BLOCKING | **OUT OF SCOPE per user** — leave as-is | User decision. Plan introduces no e2e specs. |
| `e2e.yml:production-profile-smoke` | BLOCKING | **MANDATORY** | Production auth/CORS/CSP smoke; #66 AuthContext split could regress this. Keep mandatory. |
| `security.yml:public-repo-hygiene` | BLOCKING | **MANDATORY** | All items. |
| `security.yml:workflow-pin-validation` | BLOCKING | **MANDATORY** | All items. |
| `security.yml:python-security` (bandit + pip-audit) | BLOCKING | **MANDATORY** | All backend items. |
| `security.yml:frontend-security` (npm audit) | BLOCKING | **MANDATORY** | All FE items. |
| `security.yml:frontend-i18n` | BLOCKING | **MANDATORY** | FE items that touch i18n strings (likely #66, #68, possibly #36, #48). |
| `security.yml:redis-resilience-integration` | ADVISORY (cron-only) | **ADVISORY** (keep) | Nightly only; not relevant to plan items. |
| `security.yml:container-security` (Trivy + Grype) | BLOCKING | **MANDATORY** | All items (catches dep drift, esp. requirements changes from validator/test work). |
| `security.yml:secrets-detection` (Gitleaks) | BLOCKING | **MANDATORY** | All items. |
| `security.yml:security-headers` | BLOCKING | **MANDATORY** | Items that touch FastAPI middleware (#37 governance, #66 AuthContext indirectly via prod-profile, #44 path-prefix registry). |
| `startup-smoke.yml` | non-PR (push/cron) | **N/A for PRs** | Existing post-merge safety net. |
| `release-parity-{pr,fast}.yml` | manual / nightly | **N/A for PRs** | Out of plan scope. |
| `release.yml` | tag-only | **N/A for PRs** | Out of plan scope. |

#### 7.5.3 Recommended new gates (6)

##### 1. README 3-hop reachability path filter for `backend/app/**` and `frontend/src/**`

Per CI strategy gap analysis. The
`maintenance-governance.yml:docs-governance` lane is currently
path-filtered; for new READMEs from #61, #62, #74a/b, ensure the path
filter activates the docs invariants. Expand the path filter to
explicitly include `backend/app/**` and `frontend/src/**` if the
existing pattern misses any of the new locations.

##### 2. Bounded-context census TOML lock (#74a)

Per Loop 2 hidden-prereq #B at `plan-loop-2-07-hidden-prereqs.md:551-558`.
Add CI step that verifies `_bounded_context_*.toml` count `>= 31` (or
`== 32` after #61) and that every `backend/app/services/*` package is
classified into exactly ONE of the 4-5 TOMLs.

##### 3. ADR index parity

Per Phase 4 Loop 2. Add CI step that verifies `docs/adr/README.md` has
exactly N rows where N = count of `docs/adr/ADR-*.md` files. After #72,
#73, #74b: N = 12.

##### 4. Postgres-lane convention check

Per Phase 4 Loop 2 — verify all `tests/backend/pytest/migrations/` files
have `pytestmark = pytest.mark.postgres` at module top. Add CI step
parsing every `.py` in the directory.

##### 5. Capability-catalog ordered equality

Per `plan-loop-2-05-validator-schedule.md:344-349`. Add CI step that
verifies `docs/security/capability-catalog.json` is a stable canonical
order (alphabetical sort by surface, then by capability key) — pin via
`jq -S` round-trip equality.

##### 6. Path-prefix registry lock (#44)

Per `plan-loop-1-08-crosscut.md:600-630`. After #44 lands: add CI step
that verifies `backend/app/api/v1/_router_registry.toml` enumerates ALL
router prefixes loaded by `app.include_router(...)` calls in the
codebase. Drift = CI red.

---

### 7.6 Capability Contract Validator Schedule

[Per Phase 4 Loop 2 adversarial — `review-loop-2-04-validator-adversarial.md:445-487`. 42 items.]

#### 7.6.1 Items requiring validator (HIGH/MEDIUM/LOW tiers)

##### HIGH (18 items — CERTAIN validator surfaces NEW finding)

#8, #13, #15, #24, #28, #34, #35, #38, #39, #45b, #50, #51, #55, #56, #60,
#61, #65, #66.

Validator concerns by check:

- **Check 4 (Pydantic ↔ Zod parity)**: #15 (NEW 8th surface), #39
  (NEW admin surface), #65 (4-entity refactor — DOMINANT failure mode).
- **Check 2 (sensitive_change_paths)**: #13, #15, #24, #38, #50, #51,
  #55, #56, #61, #62, #66.
- **Check 5 (markdown matrix 9 sections)**: #15, #24, #28, #34
  (Vocabulary "privilege tier" — Phase 6 cite `:43-54` + `:119`), #50,
  #51, #56, #60 (Vocabulary "privilege context" — Phase 6 cite `:43-54`
  + `:131`), #66.
- **Check 7a (atomic doc-touch)**: ALL 18 (sensitive prefix changes).
- **Check 7b (FE local-gate allowlist)**: #35 (deletes
  `usePermissions.ts` from FRONTEND_LOCAL_GATE_CLASSIFICATIONS), #66
  (NEW context files may trigger).

##### MEDIUM (~24 items — LIKELY Check 7a sweep)

#1, #5, #6, #7, #11, #12, #14, #16, #17, #18, #19, #21, #22, #25, #26, #27,
#29, #30 (conditional), #31, #36, #37, #40, #46, #49, #52, #54, #58, #62,
#67, #70, #73, #75.

(33 listed; some flip to LOW after final review — net ~24.)

These items run validator as **defence-in-depth**: backend file change in
a sensitive prefix triggers Check 7a sweep, but no md/json edit is
expected. The validator passes if no authz token is co-edited with the
file change.

##### LOW (6 items — defence-in-depth only)

#45a, #57, #59, #69, #72, #74b.

These items do NOT trigger any validator check naturally; the validator
runs as a safety check.

##### OUT-OF-SCOPE (~22 items — no validator concern)

#2, #3, #4, #9, #10, #20, #23, #32, #33, #41, #42, #43, #44, #47, #48, #53,
#63, #64, #68, #71 (downgraded), #74a, #76, #77a, #77b.

Per Phase 4 adversarial verifications, these paths are NOT in
`sensitive_change_paths` (136 entries verified).

#### 7.6.2 Pydantic ↔ Zod parity items (3 highest risk)

Per `plan-loop-2-05-validator-schedule.md:448-454`:

##### #15 — `access_user` NEW 8th catalog surface (7 fields)

Backend: `class AccessUserCapabilities` at `backend/app/schemas/access.py:66-72`.
Frontend: `accessUserCapabilitiesSchema` at `frontend/src/types/access.ts:51`.
Parser brittleness: must use `passthroughObject({...})` not `z.object({...})`.

##### #39 — `AdminConsoleCapabilities` builder NEW catalog fields (4 fields)

Plan: promotes static stub at `endpoints/admin/capabilities.py:14-22`
to a real builder via `_authorization_capabilities/admin.py`.

##### #65 — `crudCapabilitySchema` 4 entity refactor (DOMINANT failure)

Refactors `frontend/src/services/api/schemas/entities/{risks,controls,kris,vendors}.ts`.

**CRITICAL parser limitation**: `_extract_typescript_schema_body`
(`capability_catalog.py:112-126`) walks brace-matched body but does NOT
chase `.merge(...)` continuation. If refactor uses
`crudCapabilitySchema.merge(...)`, parser sees only inner
`passthroughObject({...})` body. Plan literal:
`passthroughObject({ can_read, can_update }).merge(...)` — parser would
emit `capability_catalog_frontend_field_missing` for ALL merged fields.

**Mitigation**: inline composed object; do not use `.merge(...)`; OR
extend the parser; OR reformulate `crudCapabilitySchema` so each entity's
`passthroughObject` call literally contains all fields textually.

#### 7.6.3 Validator run cadence

##### Per-item, no exceptions

The validator subprocess runs in **<1s** for the corrected schedule
(per `plan-loop-2-05-validator-schedule.md:495`). There is no commit-cost
argument for skipping it. **EVERY validator-touching commit MUST run the
validator before `git commit`.**

##### Double-run for atomic clusters (#24+#51)

Per Mitigation #5. For atomic bundles with high doc-edit volume:

1. First run: AFTER staging the file deletes / code edits, BEFORE staging
   the doc/contract edits. The validator should report the missing
   doc-side updates as DETECTED but NOT-YET-FIXED.
2. Second run: AFTER staging the doc/contract edits. The validator
   should now exit 0.

This catches the "incomplete sweep" failure mode where the developer
forgets a doc edit. Applies to: **#24+#51** (5 md cells + 5 json strings),
**#56+#61** (path-rewrite atomic), **#69+#70** (low validator concern but
applied for diligence).

##### Special validator considerations

###### #34 / #60 — duplicate listing reminder

Both edit `## Vocabulary` markdown section. Sequence #34 (C10) before
#60 (C11) to keep markdown deltas additive; running the validator after
each ensures the 9-section invariant
(`markdown_validation.py:11-21`) is intact.

###### #69+#70 bundle — low validator concern

Per `plan-loop-2-05-validator-schedule.md:399-405`:
- `VendorCapabilities` field-shape parity is unaffected by the Vendor
  model column drop.
- Bundle's primary risk is Postgres migration safety (ADR-010), not
  capability contract.
- Validator runs as defence-in-depth (Check 2 + 7a verify-only).

---

### 7.7 Effort & Pacing

[Per Phase 4 Loop 2 adversarial — `review-loop-2-06-effort-adversarial.md`. 727h with cushion.]

#### 7.7.1 Per-domain effort breakdown

Per `review-loop-2-06-effort-adversarial.md:265-272` + Loop 1 master
sequence domain split:

| Domain | Item count | Effort range | Notes |
|---|---:|---|---|
| Issues | 9 | ~50-70h | Chain `#2 → #8 → #28 → #30`; doc-heavy |
| Risks | 4 | ~25-35h | #1, #11, #19, #20 |
| Approvals | 8 | ~70-100h | Includes #34 XL (28-32h escalation) |
| KRI | 9 | ~75-95h | Includes #24+#51 atomic, #45a/b factor |
| Vendor | 7 | ~85-110h | Includes #69+#70 XL bundle (35-42h) |
| Frontend | 19 | ~135-180h | Includes #46 escalation (24-28h), #66 (M-large) |
| Endpoints | 11 | ~70-95h | Admin reorg (#40), #44 router registry, #38 schemas |
| Crosscut | 10 | ~95-120h | Includes #74a XL (26-30h), 3 NEW ADRs |
| **Total** | **77** (or **79** with #76+#77) | **727h ± 5%** | Range 675-753h per Phase 4 Loop 2 |

#### 7.7.2 Per-wave effort breakdown

Mapping per-wave totals from `review-loop-2-06-effort-adversarial.md:388-395`
combined with the 18-week cadence:

| Wave | Weeks | Items | Effort (h) | Description |
|---|---|---|---:|---|
| Wave A | 1-2 | #72, #73, #74a, #10 | 14h | ADRs + P1 quick wins |
| Wave B | 2-3 | #57, #12, #1, #19, #11, #14, #15, #2, #3, #4 | 44h | P1/P2 first wave (FE-soft + risks) |
| Wave C | 4-7 | 30 P2 quick-win items (#5-#7, #18, #20, #21, #25, #26, #29, #33, #35, #36, #41, #47, #48, #50, #52, #64) | 56h | P2 cluster |
| Wave D | 8-11 | #22, #23, #16, #38, #24+#51, #56+#61, #17, #49, #59, #9, #34 (start) | 60h | P3 medium tier + atomic clusters |
| Wave E | 11-13 | #34 (finish), #46, #76 (NEW), #30, #27, #28, #8, #37, #39, #65, #66 (start) | 88h | Hub waves + auth flow |
| Wave F | 14-15 | #45a, #45b, #60, #66 (finish), #40, #42, #43, #44, #58, #63 | 60.5h | Permissions + admin + middleware |
| Wave G (mig) | 16 | #69+#70 + #77 (NEW) | 40h | Migration window (full week) |
| Wave H | 17 | #67, #68, #71 | 56h | Frontend finish |
| Wave I | 18 | #74b, #75, #62, #31, #32, #53, #54, #55 | 28h | Closeout / contingency |

**Wave totals**: 14 + 44 + 56 + 60 + 88 + 60.5 + 40 + 56 + 28 = **446.5h**
core + ~280h overhead (gate runs, code review, validator iteration,
context switching) = **727h total**.

#### 7.7.3 Pacing recommendation

##### STANDARD — 18 dev-weeks @ 40h/week (RECOMMENDED)

Per `review-loop-2-06-effort-adversarial.md:378-395`:

**Match the adversarial total (727h ÷ 40 = 18.2 weeks).** This pace:
- Allows full 2-round reviewer cadence per PR.
- Permits the Postgres rehearsal cycle without operational stress.
- Builds in the 10% tech-debt cushion organically (allocate 1 day/week to
  "discovered work" as it surfaces).
- Aligns with single-sequential-developer constraint without compression.
- 18 weeks ≈ **4.5 calendar months**.

**Suggested cadence**:
- Weeks 1-2: Group A (ADRs #72/#73/#74a) + Group B (P1 quick wins).
- Weeks 3-7: Group C (P2 quick wins, 30 items).
- Weeks 8-11: Group D (P3 medium tier) + #46 phased rollout.
- Weeks 12-13: Group E (#76/#77 auth-flow + FE TS sync).
- Weeks 14-15: Group F start (#45a/b, #60, #66).
- Week 16: #69+#70 single migration window (full week dedicated).
- Weeks 17-18: #68, #71, #74b, contingency / tech-debt overflow.

##### Conservative — 22 dev-weeks @ 33h/week

Per `review-loop-2-06-effort-adversarial.md:397-401`:

For risk-averse execution accounting for vacation, on-call rotations, or
shared reviewer bandwidth. **Buffer: 4 dev-weeks (160h)** absorbs
unforeseen scope creep without sliding the milestone.

##### REJECTED variants

###### Intensive — 8 dev-weeks (~91h/week)

Per `review-loop-2-06-effort-adversarial.md:361-368`:

**REJECTED as unrealistic.** A 91h/week pace double-books a single
developer. Even with parallel reviewer turnaround, the gate stack,
context switching, and Postgres rehearsal are bottlenecks that cannot be
shortened by working harder. **Risk: dev burnout, quality drop,
audit-finding regressions** of the kind flagged in
`memory/feedback_audits_validate_current_code.md`.

###### Aggressive — 12 dev-weeks (~60h/week)

Per `review-loop-2-06-effort-adversarial.md:370-376`:

**REJECTED for sustained execution.** 60h/week is sustainable for ~3
weeks, not 12. After ~weeks 4-5, code review cycles slow as reviewer
attention wanes, validator false-positives compound, and tech-debt
discoveries accumulate. **Risk: audit-debt fatigue; high probability of
needing a second corrective sprint.**

#### 7.7.4 Multipliers applied (727h breakdown)

Per `review-loop-2-06-effort-adversarial.md:277-293`:

| Source | Hours |
|---|---:|
| Loop 1 strict revised baseline | 520 |
| Per-item escalation (#34 M→XL, +20) | +20 |
| Per-item escalation (#74a L→XL, +12) | +12 |
| Per-item escalation (#69+#70 L+→XL, +12) | +12 |
| Per-item escalation (#46 L→L+/XL, +6) | +6 |
| Per-item small (#35 +1) | +1 |
| Gate-run wall time (3.1) | +20 |
| Code review cycles (3.2) | +30 |
| Validator iteration (3.3) | +20 |
| Lock-test interactions (3.4) | +15 |
| Doc-tree audit (3.6) | +1 |
| ADR review (3.7) | +6 |
| Hidden tech debt 10% (3.8) | +52 |
| Context switching (3.9) | +12 |
| **Adversarial total** | **727** |

The dominant single multiplier is **hidden tech debt (+52h)**, which is
the lesson from `memory/feedback_audits_validate_current_code.md`.

---

### 7.8 Open Questions Register

[Per Phase 3 Loop 3 A6/A7 + Phase 4 Loop 1 A8 + Phase 4 Loop 2 B8.]

#### 7.8.1 Resolved (Phase 4 Loop 2)

##### ADR status: Accepted

ADR-007 amendment (#74b), ADR-011 (#72), ADR-012 (#73) are all marked
**Accepted** at landing. Per Loop 1 A8 + Loop 2 B8 confirmation.

##### 5th category: Cross-cutting

The proposed 5th bounded-context category is **Cross-cutting** (covers
items that span multiple bounded contexts but are not adapters). Per
Loop 1 A8 + `plan-loop-1-08-crosscut.md:668-674`.

##### `_orphaned_items`: Workflow-paired with `_identity_access_lifecycle`

The `_orphaned_items` package is workflow-paired with
`_identity_access_lifecycle` for the bounded-context taxonomy. Both
participate in the workflow_pairs TOML row. Per Loop 1 A8 +
`plan-loop-1-08-crosscut.md:655-663`.

##### `_notification_inbox`: Workflow-paired with `_identity_access_lifecycle`

The `_notification_inbox` package is workflow-paired with
`_identity_access_lifecycle`. Per Loop 1 A8 +
`plan-loop-1-08-crosscut.md:655-663`.

##### `_register_listings`: dual-class allowed

The `_register_listings` package is dual-classed (read_shape AND adapters)
under the bounded-context taxonomy. Per Loop 1 A8 +
`plan-loop-1-08-crosscut.md:650-654`.

##### REPORTING_GRACE_DAYS: `_kri_history/constants.py:2` is SSOT

The single source of truth for `REPORTING_GRACE_DAYS` is
`backend/app/services/_kri_history/constants.py:2`. Per Loop 1 A8 +
ADR-012 (`docs/adr/ADR-012-kri-time-series-period-algebra.md`).

##### Mock-auth phrasing: AND of `mock_auth_enabled && debug`

The mock-auth check in `auth/refresh.py` and related modules uses **AND**
logic: `mock_auth_enabled && debug`. Both flags must be true for mock
auth to be active. Per Loop 1 A8.

##### #76 effort: L (12-16h)

Per Loop 2 B8 + `plan-loop-3-07-integration-v2.md:197`. The auth-flow
db.commit migration (#76) is rated **L (12-16h)** for 8 distinct
`db.commit` site migrations.

##### #76 priority: P1 (calendar deadline)

Per Loop 2 B8 + `plan-loop-3-07-integration-v2.md:413`. Auth-flow
migration is **P1** (high priority due to 2026-09-01 expiry).

##### #74a allowlist: "exists OR planned-with-citation"

Per Loop 1 A8 + `plan-loop-2-07-hidden-prereqs.md:551-558`. The #74a
allowlist criterion is "exists OR planned-with-citation" rather than
"exists today". This accommodates the post-#61 count of 32 packages
without requiring #74a to land after #61.

##### Validator partial-removal tolerance: yes, Loop-4 dry-run

Per Loop 2 B8. The validator tolerates partial removal during Loop-4
dry-run (developer commits work-in-progress with partial doc edits).
The pre-commit hook re-runs validator before final commit; partial states
are acceptable mid-development.

##### Soft-edge schema: yes, add to DAG yaml

Per Loop 2 B8. The DAG yaml at
`.planning/audits/_context/plan-loop-2-01-master-dag.yaml` accepts
soft-edge fields:

```yaml
in_domain_deps: ['37', '39']  # hard
in_domain_soft_deps: ['35']   # soft (avoid 18-mock-file rewrite)
```

Per Loop 2 Missing-dep #E recommendation
(`plan-loop-2-07-hidden-prereqs.md:606-622`).

##### 2026-09-01 deadline: feasible at standard 18-week pacing if start ≤ 2026-05-15

Per Loop 1 A8 + Loop 2 B8 cross-check. At standard 18-week pacing
(40h/week), the plan completes at ~2026-09-19 if started 2026-05-15.
Tight but feasible. Earlier start (2026-05-09 = today's date) provides
~2 weeks of buffer. Per Loop 2 §2.3 hot-fix-pause protocol, buffer is
critical.

##### #77 split: yes, #77a (pre) + #77b (post)

Per Loop 2 B8 + `plan-loop-3-07-integration-v2.md:265-291`. Item #77
splits into:

- **#77a (pre)** — FE TS schema reads `vendor.status?: string` (optional)
  before #70 lands; kept backwards-compatible with the pre-migration shape.
- **#77b (post)** — FE TS schema removes `vendor.status` field after
  #70 lands; ratchet to clean shape.

Sequence: #77a → #70 (atomic with #69) → #77b. Hard edge `#70 → #77b`
per `plan-loop-3-07-integration-v2.md:291-292`.

#### 7.8.2 Unresolved (Phase 5+)

Three open questions remain for Phase 5+ resolution:

##### 1. Validator partial-removal dry-run (verify before doc-contract wave)

Phase 5 task: dispatch a fresh agent to perform a Loop-4 dry-run of the
validator against a hypothetical mid-state (e.g. half of #24+#51 atomic
deletes applied, half of doc-contract edits applied). Confirm the
validator reports DETECTED but does not block the commit. If it blocks,
adjust the validator's tolerance for partial states or change the
sequencing.

##### 2. #76 calendar tracking (actual start date determines feasibility)

Phase 5 task: confirm with project lead the actual start date for the
cleanup window. If start ≤ 2026-05-15, 18-week pacing is feasible. If
start > 2026-06-15, tighten pacing OR drop optional items (e.g.
optional 5th bounded-context TOML in #74a, optional cross-references).

##### 3. #77a/#77b ID formalization (decision: split per consistency)

Per Phase 4 Loop 2 — accept the split as ID-stable: #77a and #77b are
distinct items in the v2 master sequence. Phase 5 task: ensure all
references in plan documents use `#77a` and `#77b` as ID strings, NOT
ambiguous `#77`.

---

### 7.9 Appendix — Source Materials Index

[Reference list of all `.planning/audits/_context/*.md` files used to
produce this plan, organized by phase.]

#### 7.9.1 Phase 1 — Codebase exploration (8 files)

Verified-current code state at anchor `1ee872a4`:

- `01-backend-services.md` — backend service inventory (32 packages).
- `02-backend-endpoints.md` — endpoint route table + audit.
- `03-frontend-architecture.md` — FE component tree + diagram.
- `04-architecture-locks.md` — TOML registries + invariant tests.
- `05-adrs-capability-contract.md` — ADR-001..010 + capability catalog.
- `06-test-surface.md` — pytest + vitest test inventory.
- `07-migrations-schema.md` — Alembic chain + schema.
- `08-documentation-surface.md` — README + ADR + planning docs.

#### 7.9.2 Phase 2 — Item recipes (8 files)

Per-domain item proposals:

- `recipe-01-issues.md` — 9 items.
- `recipe-02-risks-and-endpoints.md` — risks + endpoints overlap.
- `recipe-03-approvals.md` — 8 items.
- `recipe-04-kris.md` — 9 items.
- `recipe-05-vendor-migration.md` — vendor migration + #69+#70.
- `recipe-06-frontend-deadcode.md` — FE deletes.
- `recipe-07-frontend-authz.md` — FE authz refactors.
- `recipe-08-crosscut-adrs.md` — cross-cut + ADRs.

#### 7.9.3 Phase 2 verification (24 files)

- `verify-loop-a-01-issues.md` through `verify-loop-a-08-crosscut.md`
  (Loop A — initial verification).
- `verify-loop-b-01-issues.md` through `verify-loop-b-08-crosscut.md`
  (Loop B — adversarial verification).
- `verify-recipe-01-issues.md` through `verify-recipe-08-crosscut-adrs.md`
  (recipe-level verification).

#### 7.9.4 Phase 3 Loop 1 — Domain-level item plans (8 files)

- `plan-loop-1-01-issues.md` — 9 issues items detailed.
- `plan-loop-1-02-risks.md` — 4 risks items.
- `plan-loop-1-03-approvals.md` — 8 approvals items (incl #34 hub).
- `plan-loop-1-04-kris.md` — 9 KRI items (incl #24+#51 atomic).
- `plan-loop-1-05-vendor-quarterly.md` — vendor + quarterly + #69+#70.
- `plan-loop-1-06-frontend.md` — 19 frontend items (incl #46, #66).
- `plan-loop-1-07-endpoints.md` — 11 endpoints items.
- `plan-loop-1-08-crosscut.md` — 10 crosscut items (incl #72, #74).

#### 7.9.5 Phase 3 Loop 2 — Cross-domain analysis (8 files)

- `plan-loop-2-01-master-dag.md` (+ `.yaml`) — DAG of all 77 items.
- `plan-loop-2-02-execution-order.md` — sequenced execution order.
- `plan-loop-2-03-lock-conflict-matrix.md` — lock×item matrix.
- `plan-loop-2-04-doc-touch-matrix.md` — doc×item matrix.
- `plan-loop-2-05-validator-schedule.md` — 16-item validator schedule
  (corrected to 42 in Phase 4).
- `plan-loop-2-06-migration-window.md` — #69+#70 migration window plan.
- `plan-loop-2-07-hidden-prereqs.md` — 7 missing-dep findings.
- `plan-loop-2-08-master-sequence.md` — final sequenced 77 items.

#### 7.9.6 Phase 3 Loop 3 — Synthesis (8 files)

- `plan-loop-3-01-precommit-gates.md` — 7-step gate per item.
- `plan-loop-3-02-ci-strategy.md` — mandatory/advisory CI matrix.
- `plan-loop-3-03-rollback-register.md` — 77-item rollback procedures.
- `plan-loop-3-04-risk-register.md` — 34-risk register (Phase 3).
- `plan-loop-3-05-readme-lock-register.md` — 77-item doc/lock register.
- `plan-loop-3-06-adr-drafts.md` — ADR-007/011/012 drafts.
- `plan-loop-3-07-integration-v2.md` — v2 with #76+#77.
- `plan-loop-3-08-cohesion.md` — final cohesion check.

#### 7.9.7 Phase 4 Loop 1 — Constructive completeness review (8 files)

- `review-loop-1-01-test-gaps.md` — TDD gap audit.
- `review-loop-1-02-sequence.md` — sequencing audit.
- `review-loop-1-03-register-completeness.md` — register completeness.
- `review-loop-1-04-validator-completeness.md` — validator schedule
  expanded 16→44.
- `review-loop-1-05-risk-completeness.md` — risk register expanded 34→62.
- `review-loop-1-06-effort-audit.md` — effort revised 484→520-538h.
- `review-loop-1-07-adr-coherence.md` — ADR cross-references.
- `review-loop-1-08-cohesion-resolution.md` — cohesion resolution.

#### 7.9.8 Phase 4 Loop 2 — Adversarial review (8 files)

- `review-loop-2-01-test-gaps-adversarial.md` — TDD adversarial.
- `review-loop-2-02-sequence-adversarial.md` — sequence adversarial.
- `review-loop-2-03-register-adversarial.md` — register adversarial.
- `review-loop-2-04-validator-adversarial.md` — validator corrected 44→42
  (HIGH 18 + MEDIUM 24).
- `review-loop-2-05-risk-adversarial.md` — risk corrected to 62 final.
- `review-loop-2-06-effort-adversarial.md` — effort revised 538→727h.
- `review-loop-2-07-adr-adversarial.md` — ADR adversarial.
- `review-loop-2-08-cohesion-adversarial.md` — cohesion adversarial.

#### 7.9.9 Phase 5 — Final synthesis (this section + Sections 1-6)

- `final-section-1-header.md` — header + executive summary (Section 1).
- `final-section-2-sequence.md` — Sequence + DAG (Section 2).
- `final-section-3-recipes-1-26.md` — Item recipes 1-26 (Section 3 part 1).
- (Section 3 parts 2-3, Sections 4-5 — domain plans + integration —
  owned by other Phase 5 agents.)
- `final-section-6-adrs.md` — ADRs (Section 6).
- `final-section-7-registers.md` — Section 7 (this file).

#### 7.9.10 Memory and project context (3 files)

- `/Users/stefanlesnak/.claude/projects/-Users-stefanlesnak-Antigravity-RiskHubOSS/memory/MEMORY.md`
  — auto-memory index.
- `/Users/stefanlesnak/.claude/projects/-Users-stefanlesnak-Antigravity-RiskHubOSS/memory/feedback_audits_validate_current_code.md`
  — feedback file: re-verify every audit finding against current repo
  state; staleness from recent "Deepen architecture..." commits is the
  dominant failure mode.
- `/Users/stefanlesnak/Antigravity/RiskHubOSS/CLAUDE.md` +
  `/Users/stefanlesnak/Antigravity/RiskHubOSS/AGENTS.md` — project
  guidance and conventions.

---

End of Section 7 — Registers and Supporting References.

[Cross-link to Section 1: `final-section-1-header.md`.]
[Cross-link to Section 2: `final-section-2-sequence.md`.]
[Cross-link to Section 3: `final-section-3-recipes-1-26.md` + parts 2-3.]
[Cross-link to Section 6: `final-section-6-adrs.md`.]
[Sections 4-5 owned by Phase 5 Section Owners 4-5.]

Phase 6 corrections applied:
- Vocabulary cite `:43-54` (NOT `:119` for #34, NOT `:131` for #60) — Section 7.1 + 7.6.1.
- 3 fabricated README paths (`backend/app/api/README.md`, `tests/backend/pytest/api/v1/README.md`, `frontend/src/contexts/README.md`) flagged NOT-existing — Section 7.1 prefix + 7.1.2.
- #59 single-file create for `_monitoring_response/README.md` — Section 7.1 + 7.1.4.
- `make test-postgres-ci` (NOT `make postgres-up`) — Section 7.4.2.
- Top-level totals: 58 docs, 24 locks, 98+ new files, 48 deletions — Section 7.1.
