# Phase 3 Loop 3 — Rollback Register (all 77 items)

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Anchor commit: `1ee872a4`.
Scope: per-item revert procedure, hidden-state restoration, partial-revert risk, and revert-time estimate.
Sources: `plan-loop-2-08-master-sequence.md` (sequence + atomicity), `plan-loop-2-03-lock-conflict-matrix.md` (lock touches), `plan-loop-2-04-doc-touch-matrix.md` (doc touches), `plan-loop-2-05-validator-schedule.md` (capability validator surface), `plan-loop-2-06-migration-window.md` (#69+#70 migration body), `plan-loop-2-07-hidden-prereqs.md` (cross-domain prereqs), `_context/07-migrations-schema.md` (alembic schema), `docs/adr/ADR-010-postgres-migration-rehearsal-contract.md` (forward-only).

CRITICAL CONSTRAINTS recap: single sequential developer; TDD; doc/lock-only Reject is invalid (orchestrator override applied where required); ADR-010 forward-only — `downgrade()` raises `NotImplementedError`, so DB rollback is restore-from-snapshot.

Rollback classes used below:
- **TRIVIAL**: pure code revert (`git revert`); no DB / external state change.
- **DOC-ONLY**: revert touches docs only.
- **TEST-ONLY**: revert touches test files only (no production behaviour change).
- **MIGRATION**: requires snapshot restore (ADR-010 forward-only).
- **LOCK-RATCHET**: revert must restore allowlist entries / lock-test bodies.
- **CROSS-DOMAIN**: revert must coordinate across multiple files; risk of leaving the codebase in a broken intermediate state.

When two classes apply (e.g., lock-ratchet bundled with cross-domain), the dominant class is reported and the secondary is named in **Hidden state to restore**.

Estimated revert time = single-developer wall-clock from first command to `git push -f` (where allowed) or merged revert commit, including local validator + lock test re-run. Times exclude staging/prod redeploy, which is constant across all reverts (~20 min).

---

## Item #1 — A-N1 — Drop `validate_risk_type` re-export from risks/crud `__all__`

- Rollback class: **LOCK-RATCHET**
- Procedure:
  1. `git revert <commit>` for the per-domain code commit.
  2. Verify the revert restores `validate_risk_type` token in `backend/app/services/risks/crud/__init__.py` `__all__`.
  3. Re-add the rolled-back NEW lock-test file `tests/backend/pytest/architecture/test_risks_crud_public_surface_red.py` to a tombstone delete in the same revert (the test asserted absence of the symbol; a partial revert leaves it RED).
  4. Run `pytest tests/backend/pytest/test_risks.py tests/backend/pytest/test_risks_negative_paths_red.py`.
  5. Run `make -f scripts/Makefile test-architecture-locks`.
- Hidden state to restore: NEW architecture lock test file from `plan-loop-2-03-lock-conflict-matrix.md:404` quote `test_risks_crud_public_surface_red.py`.
- Risk if reverted partially: lock-test still asserts symbol absence after `__all__` token returns; CI red on architecture lane.
- Estimated revert time: 10 min.

## Item #2 — B-N1 — Drop 4 underscore aliases in `_issue_workflow/source_validation.py`

- Rollback class: **LOCK-RATCHET**
- Procedure:
  1. `git revert <commit>`.
  2. Verify 4 underscore aliases re-appear in `backend/app/services/_issue_workflow/source_validation.py`.
  3. Drop the new architecture-deepening assertion `test_issue_workflow_no_underscored_self_aliases_red` (added per `plan-loop-1-01-issues.md:53`).
  4. Run `pytest tests/backend/pytest/test_issue_workflow_*.py` and `make -f scripts/Makefile test-architecture-locks`.
- Hidden state to restore: deepening-contract assertion (per `plan-loop-2-03-lock-conflict-matrix.md:317` quote `test_issue_workflow_no_underscored_self_aliases_red`).
- Risk if reverted partially: lock RED until tightening assertion is also reverted.
- Estimated revert time: 10 min.

## Item #3 — S3.11 — Delete `kriFormWorkflow.ts` + tautological test

- Rollback class: **CROSS-DOMAIN** (FE + backend mirror lock)
- Procedure:
  1. `git revert <commit>` to restore `frontend/src/components/kri-form/kriFormWorkflow.ts`.
  2. Verify the tautological FE test file is restored.
  3. Drop the appended `assert not (REPO_ROOT / "frontend/src/components/kri-form/kriFormWorkflow.ts").exists()` from `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:367`).
  4. Run `pnpm --dir frontend test`, then backend lock suite.
- Hidden state to restore: 1 backend lock-test stanza in `test_w4_bc_g_kri_history_boundaries_red.py`.
- Risk if reverted partially: FE file restored but backend lock still asserts non-existence → architecture lock RED.
- Estimated revert time: 15 min.

## Item #4 — FE-deadcode-1 — Delete `controlFormWorkflow.ts`

- Rollback class: **TRIVIAL**
- Procedure: `git revert <commit>`; restore `frontend/src/components/control-form/controlFormWorkflow.ts`. Delete the new FE deletion-pin test `controlFormWorkflow.deleted.test.ts`.
- Hidden state to restore: 1 NEW FE test file (per `plan-loop-2-03-lock-conflict-matrix.md:418`).
- Risk if reverted partially: deletion-pin test asserts absence and goes RED.
- Estimated revert time: 5 min.

## Item #5 — FE-deadcode-2 — Delete `orphanResolutionPresentation.ts`

- Rollback class: **TRIVIAL**
- Procedure: `git revert <commit>`; restore the file; delete `orphanResolutionPresentation.deleted.test.ts`. Restore one prose line in `frontend/src/components/governance/README.md` (per `plan-loop-2-04-doc-touch-matrix.md:649-654`).
- Hidden state to restore: 1 NEW FE test + 1 README line.
- Risk if reverted partially: same as #4.
- Estimated revert time: 5 min.

## Item #6 — FE-deadcode-3 — Delete `notifications/resourcePath.ts`

- Rollback class: **TRIVIAL**
- Procedure: `git revert <commit>`; restore the 5-line re-export. Delete `resourcePath.deleted.test.ts`. Restore one prose line in `frontend/src/components/notifications/README.md`.
- Hidden state to restore: 1 NEW FE test + 1 README line.
- Risk if reverted partially: deletion-pin test RED.
- Estimated revert time: 5 min.

## Item #7 — C-N1 — Delete endpoint shim `_get_approval_department_id`

- Rollback class: **LOCK-RATCHET**
- Procedure:
  1. `git revert <commit>` to restore the shim.
  2. Drop the structural assertion `not hasattr(_shared, "_get_approval_department_id")` added to `test_architecture_deepening_contracts.py` (per `plan-loop-2-03-lock-conflict-matrix.md:325`).
  3. Re-run `make -f scripts/Makefile test-architecture-locks`.
- Hidden state to restore: deepening-contract assertion.
- Risk if reverted partially: shim restored but lock asserts absence → RED.
- Estimated revert time: 10 min.

## Item #8 — B-N2 — Source-validation split + canonical link helpers consolidation

- Rollback class: **CROSS-DOMAIN**
- Procedure:
  1. `git revert <commit>` to restore `_issue_workflow/source_validation.py` body and the 3-file repoint.
  2. Restore `:1193` import line in `test_architecture_deepening_contracts.py` (per `plan-loop-2-03-lock-conflict-matrix.md:291,344` — `:1193` cross-touched by #8 + #53).
  3. Drop the `test_issue_workflow_owner_validation_lives_in_dedicated_module` assertion (per `plan-loop-1-01-issues.md:83`).
  4. If #28 / #30 already landed downstream of #8, **defer the revert until those are also reverted** (per `plan-loop-2-03-lock-conflict-matrix.md:480` `#8 BEFORE #53`); see `plan-loop-2-08-master-sequence.md:181` chain `#2 → #8 → #28 → #30`.
- Hidden state to restore: deepening-contract import tuple `:1193`; new lock assertion; possible README diff in `_issue_workflow/README.md`.
- Risk if reverted partially: critical chain `#2→#8→#28→#30` interim states leave duplicate helpers + stale lock test (orchestrator-grade incident).
- Estimated revert time: 30 min (60 if #28/#30 already merged).

## Item #9 — S6.5 — Delete-and-redirect duplicate `can_user_view_approval_resource`

- Rollback class: **LOCK-RATCHET**
- Procedure:
  1. `git revert <commit>` to restore the duplicate predicate in `backend/app/services/_notification_approval_helpers/`.
  2. Drop the structural assertion `not hasattr(_notification_approval_helpers, "can_user_view_approval_resource")` from `test_architecture_deepening_contracts.py` (per `plan-loop-2-03-lock-conflict-matrix.md:327`).
- Hidden state to restore: deepening-contract assertion.
- Risk if reverted partially: lock RED.
- Estimated revert time: 10 min.

## Item #10 — S8.5 — Keep `riskhub_questionnaires.py` (Reject; document-only)

- Rollback class: **DOC-ONLY**
- Procedure: `git revert <commit>` to restore audit-followup citations in `AGENTS.md:162`, `docs/agent/ENDPOINT_INVARIANTS.md:13`, `docs/TESTING.md:19`, `.planning/codebase/TESTING.md:70`, `tests/backend/pytest/api/v1/README.md:25`. Delete `tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py` (NEW lock per `plan-loop-2-03-lock-conflict-matrix.md:437`).
- Hidden state to restore: 1 NEW backend architecture-lock file.
- Risk if reverted partially: lock asserts presence and remains GREEN by file presence; minimal collateral.
- Estimated revert time: 5 min.

## Item #11 — S2.7 — Control execution `risk.process` → `risk.name` truth-in-naming

- Rollback class: **CROSS-DOMAIN** (#19 prereq)
- Procedure:
  1. `git revert <commit>` to restore the `risk.process` projection in `backend/app/services/_register_listings/_control_execution/...`.
  2. Confirm `#19` (validate_risk_type consolidation) is still landed; #11 sits downstream of #19 per `plan-loop-2-08-master-sequence.md:144`.
  3. Restore the test assertion `linked_risk_names_for_visible_ids` returns `risk.process` (test data may need re-fixturing).
  4. Update `.planning/audits/_context/01-backend-services.md` (per `plan-loop-2-04-doc-touch-matrix.md:803-805`) and `06-test-surface.md` (cross-ref between `test_executions.py:325` and `test_reports_audit.py:185-186`).
- Hidden state to restore: 1 plan-doc cross-ref + behaviour pin.
- Risk if reverted partially: bug returns silently; HTTP 200s but truth-in-naming regression.
- Estimated revert time: 20 min.

## Item #12 — D-N3 — Narrow blanket-except in `users/summary.py`

- Rollback class: **LOCK-RATCHET**
- Procedure:
  1. `git revert <commit>` to restore the original `except Exception:` blanket.
  2. Delete the NEW lock files `test_users_summary_blanket_except_red.py` + optional `test_users_summary_narrow_excepts_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:438`).
  3. Run `pytest tests/backend/pytest/api/v1/test_users.py`.
- Hidden state to restore: 2 NEW lock files.
- Risk if reverted partially: blanket-except restored but new lock asserts narrow tree — RED.
- **Coordination**: per `plan-loop-2-07-hidden-prereqs.md:511-516`, #12 and #34 both edit `users/summary.py`. If #34 already landed, the revert of #12 must be re-rebased above #34.
- Estimated revert time: 15 min.

## Item #13 — S5.1/C-N2 — Delete `vendor_link_helpers.py` shim + sync capability contract

- Rollback class: **CROSS-DOMAIN** (validator-gated)
- Procedure:
  1. `git revert <commit>` to restore `backend/app/api/v1/endpoints/vendors/vendor_link_helpers.py`.
  2. Restore the contract citations:
     - `docs/security/authorization-capability-contract.md:121,122` (per `plan-loop-2-04-doc-touch-matrix.md:122`).
     - `docs/security/authorization-capability-contract.json:55,479,502` (per `plan-loop-2-05-validator-schedule.md:188-194`).
  3. Delete the NEW lock `tests/backend/pytest/architecture/test_vendor_link_helpers_shim_removed_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:411`).
  4. **Run** `python3 scripts/security/validate_authz_capability_contract.py` — must exit 0 (per `plan-loop-2-05-validator-schedule.md:186`).
- Hidden state to restore: 5 contract-doc citations + 1 NEW lock file + validator-pass.
- Risk if reverted partially: validator emits `contract_path_missing` for the restored path if the JSON entries do not also revert.
- Estimated revert time: 25 min.

## Item #14 — S4.4 — Issues outbox-only notification cleanup

- Rollback class: **LOCK-RATCHET**
- Procedure:
  1. `git revert <commit>` to restore `_issue_workflow/notifications.py` direct-send helpers.
  2. Drop the new assertion `test_issue_notifications_have_no_direct_send_helpers` (per `plan-loop-2-03-lock-conflict-matrix.md:319`).
  3. Re-run `pytest tests/backend/pytest/test_issue_workflow_*` and check `test_issue_workflow_routes_use_lifecycle_module:1189` quote `assert "OutboxService.enqueue" not in route_source` still passes.
- Hidden state to restore: 1 deepening-contract assertion.
- Risk if reverted partially: outbox enqueue duplicates re-introduced; behaviour drift.
- **Coordination**: chains into `#30` (per `plan-loop-2-08-master-sequence.md:94`). If #30 landed, sequence accordingly.
- Estimated revert time: 20 min.

## Item #15 — D-N2 — Add `access_user` capability surface to catalog

- Rollback class: **CROSS-DOMAIN** (validator-gated)
- Procedure:
  1. `git revert <commit>` to remove the new 8th surface from `docs/security/capability-catalog.json:7-215` (per `plan-loop-2-05-validator-schedule.md:114-115`).
  2. Restore prior matrix shape in `authorization-capability-contract.md` (no `access_user` row) and `.json` `sensitive_change_paths` (drop `backend/app/schemas/access.py` entry).
  3. Delete `tests/backend/pytest/architecture/test_capability_catalog_access_user_surface_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:439`).
  4. Run `python3 scripts/security/validate_authz_capability_contract.py` — must exit 0 (Pydantic ↔ Zod parity check 4 returns to 7-surface).
- Hidden state to restore: catalog 8th-surface JSON object (7 fields) + matrix row + sensitive-path entry + 1 NEW lock file.
- Risk if reverted partially: validator check 4 emits `capability_catalog_*_field_missing` if Pydantic/Zod stay 8-shape but catalog reverts to 7.
- Estimated revert time: 30 min.

## Item #16 — S8.10 — Remove reports legacy-excel tombstones (410s)

- Rollback class: **CROSS-DOMAIN** (OpenAPI + tests)
- Procedure:
  1. `git revert <commit>` to restore the 410 tombstones in `backend/app/api/v1/endpoints/reports/`.
  2. Restore OpenAPI snapshot in `tests/backend/pytest/test_openapi_snapshot.py` (or equivalent) that pinned the 410 path.
  3. Delete the NEW architecture lock `test_reports_legacy_excel_tombstones_removed_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:412`).
  4. Run full report-route test sweep.
- Hidden state to restore: OpenAPI snapshot delta; 1 NEW lock file.
- Risk if reverted partially: route returns 200 but lock asserts removal — RED.
- Estimated revert time: 30 min.

## Item #17 — S2.1 — Inline `_monitoring_response` endpoint shim

- Rollback class: **CROSS-DOMAIN** (chain prereq for #49+#59)
- Procedure:
  1. `git revert <commit>` to restore `_monitoring_response.py` shim.
  2. Restore lock-test relaxations.
  3. Delete `tests/backend/pytest/architecture/test_monitoring_response_endpoint_shim_removed_red.py` / `test_monitoring_response_shim_removed_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:413`).
  4. **DO NOT REVERT IN ISOLATION**: chain `#17 → #49 → #59` per `plan-loop-2-08-master-sequence.md:147`. If #49/#59 landed, revert in reverse order.
- Hidden state to restore: 1 NEW lock + downstream chain alignment.
- Risk if reverted partially: monitoring chain in inconsistent state; #59 has dangling README references.
- Estimated revert time: 30 min (60 min if chain partially landed).

## Item #18 — S6.2 — Repoint-and-delete endpoint `_build_approval_read`

- Rollback class: **LOCK-RATCHET**
- Procedure:
  1. `git revert <commit>` to restore the endpoint helper.
  2. Drop the new assertion + 19-key response-shape regression assertion in `test_architecture_deepening_contracts.py` (per `plan-loop-2-03-lock-conflict-matrix.md:328`).
  3. The existing `:1029` quote `assert hasattr(projection, "build_approval_read")` was reinforced; verify still GREEN (per `plan-loop-2-03-lock-conflict-matrix.md:243-244`).
- Hidden state to restore: 2 deepening-contract assertions.
- Risk if reverted partially: API tests pass but architecture lock RED on the missing 19-key assertion.
- Estimated revert time: 15 min.

## Item #19 — S1.4 — Consolidate risk-type validation onto service policy

- Rollback class: **CROSS-DOMAIN** (#1 prereq, #11 dependent)
- Procedure:
  1. **Block until #11 reverted** (chain `#1 → #19 → #11`, per `plan-loop-2-08-master-sequence.md:144`).
  2. `git revert <commit>` to restore `validate_risk_type` in `crud/_shared.py`.
  3. Restore HTTP 400 parity test data.
  4. Delete `tests/backend/pytest/architecture/test_validate_risk_type_single_owner_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:405`).
  5. Restore plan-context citations in `.planning/audits/_context/01-backend-services.md` and `02-backend-endpoints.md` (per `plan-loop-2-04-doc-touch-matrix.md:799-816`).
- Hidden state to restore: 1 NEW lock + 4 plan-doc citations + behaviour pin.
- Risk if reverted partially: dual-owner state — both `crud` and `service_policy` validate; subtle divergence on errors.
- Estimated revert time: 30 min (90 min with chain coordination).

## Item #20 — S1.6 — Risk ID generation co-location (DOC-ONLY w/ stable re-export)

- Rollback class: **DOC-ONLY**
- Procedure:
  1. `git revert <commit>` to revert `AGENTS.md` + `ENDPOINT_INVARIANTS.md:21-22` date bump.
  2. Restore plan-context cross-refs in `06-test-surface.md` and `02-backend-endpoints.md` (per `plan-loop-2-04-doc-touch-matrix.md:840-844, 814-818`).
  3. Delete `tests/backend/pytest/architecture/test_risks_required_reexports_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:406`).
- Hidden state to restore: 1 NEW lock + 3 plan-doc citations.
- Risk if reverted partially: lock RED on absent `__all__` token.
- Estimated revert time: 10 min.

## Item #21 — S2.6 — Collapse Control-Risk link loader duplicates (keyword-only `load_link`)

- Rollback class: **LOCK-RATCHET**
- Procedure:
  1. `git revert <commit>` to restore duplicate loader.
  2. Delete `tests/backend/pytest/architecture/test_control_risk_link_loader_collapsed_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:440`).
  3. Run `make -f scripts/Makefile test-architecture-locks`.
- Hidden state to restore: 1 NEW lock.
- Risk if reverted partially: keyword-only signature divergence — runtime errors on positional callers.
- Estimated revert time: 15 min.

## Item #22 — S2.8 — Delete `ControlForm.tsx` 1-line shim

- Rollback class: **CROSS-DOMAIN** (#23 dependent)
- Procedure:
  1. **Revert #23 first** (the inline of `controlFormUtils` depends on the shim being absent; chain `#22 → #23` per `plan-loop-2-08-master-sequence.md:80`).
  2. `git revert <commit>` to restore `ControlForm.tsx` shim.
  3. Delete `ControlForm.shim.deleted.test.ts` (per `plan-loop-2-03-lock-conflict-matrix.md:421`).
  4. Restore `frontend/src/components/control-form/README.md` line declaring canonical entrypoint (per `plan-loop-2-04-doc-touch-matrix.md:664-668`).
- Hidden state to restore: 1 FE test + 1 README line.
- Risk if reverted partially: import paths inconsistent; FE build error if #23 still inlined.
- Estimated revert time: 20 min.

## Item #23 — S2.9 — Inline `controlFormUtils` helpers into narrow consumers

- Rollback class: **CROSS-DOMAIN**
- Procedure: `git revert <commit>` (no DB / external state). Re-create `controlFormUtils.ts` and re-import from consumers; delete `controlFormUtils.inline.test.ts` (per `plan-loop-2-03-lock-conflict-matrix.md:422`); restore note in README (per `plan-loop-2-04-doc-touch-matrix.md:670`).
- Hidden state to restore: 1 FE test + 1 README line.
- Risk if reverted partially: helpers exist twice; FE compile error.
- Estimated revert time: 20 min.

## Item #24 — S3.4 — Delete-and-repoint `kris/linked_vendors.py` barrel

- Rollback class: **CROSS-DOMAIN** (atomic with #51, contract-validator)
- Procedure:
  1. **MUST be reverted atomically with #51** (per `plan-loop-2-08-master-sequence.md:252`).
  2. `git revert <commit>` to restore both files in one operation.
  3. Restore citations in `authorization-capability-contract.md:116,117,118` and `.json:368,388,389,410,411` (per `plan-loop-2-04-doc-touch-matrix.md:122-125`, `plan-loop-2-05-validator-schedule.md:206-214`).
  4. Restore `test_architecture_deepening_contracts.py:976,979,980,998-1000` strings (per `plan-loop-2-03-lock-conflict-matrix.md:477-478`).
  5. Drop the `assert not (REPO_ROOT / "backend/app/api/v1/endpoints/kris/linked_vendors.py").exists()` from `test_w4_bc_g_kri_history_boundaries_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:368`).
  6. Restore `_kri_history/README.md` listing if present.
  7. **Run validator** `python3 scripts/security/validate_authz_capability_contract.py` — must exit 0.
- Hidden state to restore: 5 contract-md cells + 5 contract-json strings + 5 deepening-contract lines + 1 W4-bc-g lock stanza + 1 README listing.
- Risk if reverted partially: highest contract-doc-edit volume of any commit (per `plan-loop-2-05-validator-schedule.md:516-520`); validator emits `authz_contract_not_updated` and `contract_path_missing`.
- Estimated revert time: 45 min.

## Item #25 — S3.7 — Extract KRI department-scope helper

- Rollback class: **LOCK-RATCHET**
- Procedure:
  1. `git revert <commit>` to restore inline `get_user_department_ids` calls in `due_soon.py`, `overdue.py`, `breaches.py`.
  2. Drop the structural-lock assertion `at most once across due_soon.py, overdue.py, breaches.py` from `test_w4_bc_g_kri_history_boundaries_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:369`).
  3. Delete `tests/backend/pytest/test_kris_department_scope_helper_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:408`).
- Hidden state to restore: 2 lock surfaces.
- Risk if reverted partially: lock RED on structural at-most-once assertion.
- Estimated revert time: 15 min.

## Item #26 — S3.9 — Delete `KRIForm.tsx` shim + ESLint pin

- Rollback class: **CROSS-DOMAIN** (FE + backend mirror)
- Procedure:
  1. `git revert <commit>` to restore `frontend/src/components/KRIForm.tsx`.
  2. Restore the ESLint config pin if it was added.
  3. Drop the `assert not (REPO_ROOT / "frontend/src/components/KRIForm.tsx").exists()` from `test_w4_bc_g_kri_history_boundaries_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:370`).
  4. Restore line in `frontend/src/components/kri-form/README.md` (per `plan-loop-2-04-doc-touch-matrix.md:677-679`).
- Hidden state to restore: 1 backend lock stanza + 1 README line + ESLint config.
- Risk if reverted partially: FE file restored; backend lock RED.
- Estimated revert time: 15 min.

## Item #27 — S4.2 — Issue-loading duplicate deletion

- Rollback class: **LOCK-RATCHET**
- Procedure:
  1. `git revert <commit>` to restore duplicate loader.
  2. Drop the assertion `test_endpoint_issues_loading_is_thin_or_deleted` (per `plan-loop-2-03-lock-conflict-matrix.md:320`).
  3. Restore lines in `backend/app/api/v1/endpoints/issues/_shared/README.md:13` (per `plan-loop-2-04-doc-touch-matrix.md:548-550`).
  4. **Coordination**: chain into `#30`; if #30 landed, sequence reverts in reverse `#30 → #28 → #27`.
- Hidden state to restore: 1 deepening-contract assertion + 1 README line.
- Risk if reverted partially: chain inconsistency.
- Estimated revert time: 25 min.

## Item #28 — S4.3 — Issue source-mutation triplicate collapse

- Rollback class: **CROSS-DOMAIN** (#8 prereq, #30 dependent)
- Procedure:
  1. **Revert #30 first** if it landed.
  2. `git revert <commit>` to restore the triplicate.
  3. Drop assertion `test_issue_link_helpers_have_one_canonical_home` (per `plan-loop-2-03-lock-conflict-matrix.md:321`).
  4. Restore README lines in `_issue_register/README.md` (per `plan-loop-2-04-doc-touch-matrix.md:485-487`).
- Hidden state to restore: 1 lock-tier assertion + 1 README line.
- Risk if reverted partially: 3 helpers exist again, but #30's barrel prune still lists only 1 → import error.
- Estimated revert time: 30 min.

## Item #29 — S4.6 — Source-type vocabulary canonicalization

- Rollback class: **LOCK-RATCHET**
- Procedure:
  1. `git revert <commit>` to restore prior multiple-helper definitions.
  2. Drop assertion `test_source_type_value_has_one_canonical_definition` (per `plan-loop-2-03-lock-conflict-matrix.md:322`).
  3. Restore README append in `_issue_register/README.md` (per `plan-loop-2-04-doc-touch-matrix.md:488`).
- Hidden state to restore: 1 lock + 1 README line.
- Risk if reverted partially: vocabulary defined twice; subtle drift.
- Estimated revert time: 15 min.

## Item #30 — S4.10 — `issues/_shared/__init__.py` underscore re-export pruning

- Rollback class: **CROSS-DOMAIN** (multi-prereq #14, #27, #28)
- Procedure:
  1. `git revert <commit>` to restore the pruned underscore re-exports in `backend/app/api/v1/endpoints/issues/_shared/__init__.py`.
  2. Drop assertion `test_issue_shared_barrel_has_no_underscored_reexports` (per `plan-loop-2-03-lock-conflict-matrix.md:323`).
  3. Restore Contents block in `_shared/README.md` (per `plan-loop-2-04-doc-touch-matrix.md:553-554`).
  4. Allowlist update if applicable (per master-seq Doc/lock burden = `med (allowlist update)` at `plan-loop-2-08-master-sequence.md:94`).
- Hidden state to restore: 1 lock + 1 README block + possible allowlist row.
- Risk if reverted partially: imports break across issue endpoints.
- Estimated revert time: 30 min.

## Item #31 — S5.5 — Extract vendor reporting row formatters

- Rollback class: **LOCK-RATCHET**
- Procedure:
  1. `git revert <commit>` to restore inline row builders in vendor reporting.
  2. Delete NEW lock files `tests/backend/pytest/services/test_vendor_governance_reports_red.py` + `tests/backend/pytest/architecture/test_vendor_reports_endpoint_no_row_builders_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:414`).
  3. Restore `_vendor_governance/README.md` line (per `plan-loop-2-04-doc-touch-matrix.md:494-498`).
- Hidden state to restore: 2 NEW locks + 1 README line.
- Risk if reverted partially: lock RED on row-builder presence.
- Estimated revert time: 20 min.

## Item #32 — S5.8 — Extract generic vendor linked-entity tab

- Rollback class: **CROSS-DOMAIN** (FE)
- Procedure:
  1. `git revert <commit>` to restore the duplicated tab implementations.
  2. Delete NEW FE tests `useVendorLinkedEntityTab.contract.test.tsx` + `VendorLinkedEntityTab.duplication.test.ts` (per `plan-loop-2-03-lock-conflict-matrix.md:423`).
  3. Restore `frontend/src/components/vendors/README.md` description (per `plan-loop-2-04-doc-touch-matrix.md:695-697`).
- Hidden state to restore: 2 NEW FE tests + 1 README line.
- Risk if reverted partially: tab rendered twice (or zero times) depending on which file restored.
- Estimated revert time: 25 min.

## Item #33 — S6.4 — Unify frontend approval-queued banners (drop KRI variant)

- Rollback class: **CROSS-DOMAIN** (FE)
- Procedure:
  1. `git revert <commit>` to restore the KRI-specific banner variant.
  2. Restore lines in `frontend/src/components/kri-form/README.md` and `frontend/src/components/forms/README.md` (per `plan-loop-2-04-doc-touch-matrix.md:680-692`).
  3. No backend lock change.
- Hidden state to restore: 2 README lines.
- Risk if reverted partially: banners visually inconsistent across approval flows.
- Estimated revert time: 15 min.

## Item #34 — S6.6 — Extract `resolve_approval_privilege_tier` helper

- Rollback class: **CROSS-DOMAIN** (16 files / 22+ sites — see `plan-loop-1-03-approvals.md:14,138`)
- Procedure:
  1. **Block until #60 reverted** (chain `#9 → #34 → #60` per `plan-loop-2-08-master-sequence.md:165`).
  2. `git revert <commit>` to restore `can_resolve_approvals(current_user)` predicate calls across **all 22+ sites in 16 files** (enumerated at `plan-loop-1-03-approvals.md:148-164` quote `Migrate call sites (Loop B's verified 22+, grouped by file)`):
     - `backend/app/services/_kri_history/governance.py:238`, `intake.py:42`, `approval_execution_service.py:116,222,235,237`, `notification_visibility.py:78,207`, plus 14 others.
  3. Drop the `hasattr(approval_scenario_policy, "resolve_approval_privilege_tier")` assertion from `test_architecture_deepening_contracts.py` (per `plan-loop-2-03-lock-conflict-matrix.md:329`).
  4. Restore `## Vocabulary` "privilege tier" entry in `authorization-capability-contract.md` and `.json:629` (per `plan-loop-2-05-validator-schedule.md:259-264`).
  5. **Run validator** — `python3 scripts/security/validate_authz_capability_contract.py` — exit 0 required.
- Hidden state to restore: 22+ call-site rewrites; 1 deepening assertion; 1 markdown vocabulary entry; 1 JSON path; doc touch in `01-backend-services.md` if updated.
- Risk if reverted partially: HIGHEST CROSS-DOMAIN RISK — partial revert leaves call sites inconsistent (some new-tier dataclass, some legacy boolean), causing privilege-check divergence between approval routes. **Coordination explicitly called out** at `plan-loop-1-03-approvals.md:244` quote `Revert restores per-call can_resolve_approvals(current_user) invocations`.
- Estimated revert time: 90 min (single dev) — this is the largest authorization-pathway revert.

## Item #35 — S7.3 — Delete `usePermissions` hook

- Rollback class: **CROSS-DOMAIN** (FE)
- Procedure:
  1. `git revert <commit>` to restore `frontend/src/hooks/usePermissions.ts`.
  2. Delete NEW FE tests `usePermissions.deleted.test.ts` + `Sidebar.usePermissions.replaced.test.tsx` (per `plan-loop-2-03-lock-conflict-matrix.md:424`).
  3. Restore READMEs (per `plan-loop-2-04-doc-touch-matrix.md:733-735`).
  4. Restore `_naming_allowlist.toml` entry if listed (per `plan-loop-2-03-lock-conflict-matrix.md:83`).
- Hidden state to restore: hook file + 2 NEW FE tests + 1 README line + possible TOML entry.
- Risk if reverted partially: FE compile error if Sidebar swap landed.
- Estimated revert time: 20 min.

## Item #36 — S7.4 — Refactor `BusinessRouteGuards.tsx` to typed factory

- Rollback class: **CROSS-DOMAIN** (FE)
- Procedure:
  1. `git revert <commit>` to restore the prior procedural BusinessRouteGuards.
  2. Delete `BusinessRouteGuards.factory.test.tsx` (per `plan-loop-2-03-lock-conflict-matrix.md:425`).
  3. Confirm closed-enum tests stay GREEN.
  4. Restore `frontend/src/authz/README.md` description (per `plan-loop-2-04-doc-touch-matrix.md:744-746`).
- Hidden state to restore: 1 NEW FE test + 1 README line.
- Risk if reverted partially: route guard regressions; routes may load without authz.
- Estimated revert time: 25 min.

## Item #37 — S7.10 — Replace `_can_view_governance` mirror with `build_me_capabilities`

- Rollback class: **CROSS-DOMAIN** (validator-gated, gates #66)
- Procedure:
  1. **Block until #66 reverted** if landed (per `plan-loop-2-08-master-sequence.md:112` `#66 needs #37+#39`).
  2. `git revert <commit>` to restore the `_can_view_governance` mirror in users-summary.
  3. Restore contract-md note that `can_view_governance` had a mirror.
  4. Delete `tests/backend/pytest/api/v1/users/test_summary_can_view_governance.py` (per `plan-loop-2-03-lock-conflict-matrix.md:426`).
  5. Run `python3 scripts/security/validate_authz_capability_contract.py` — exit 0 required (regression-only check 4).
- Hidden state to restore: 1 NEW backend test + capability-contract md note.
- Risk if reverted partially: governance flag inconsistent between `MeCapabilities` and `_can_view_governance` mirror; UX divergence.
- Estimated revert time: 25 min (40 if chain coordination).

## Item #38 — S8.6 — Move 8 inline endpoint Pydantic models to schemas

- Rollback class: **CROSS-DOMAIN** (8 endpoint files + schemas + arch lock)
- Procedure:
  1. `git revert <commit>` to restore the 8 inline classes in their original endpoint files.
  2. Restore the architecture allowlist (per master-seq Doc/lock burden `med (architecture allowlist)` at `plan-loop-2-08-master-sequence.md:96`).
  3. Delete `test_endpoint_inline_pydantic_evicted_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:441`).
  4. **#10 prereq** — if #10 already landed, no coordination needed (#10 keeps the questionnaire module).
- Hidden state to restore: 1 NEW lock + 1 allowlist entry + 8 endpoint-file diffs.
- Risk if reverted partially: schemas module re-exports a now-defunct class; stale imports.
- Estimated revert time: 35 min.

## Item #39 — S8.7 — Replace `admin/capabilities.py` static stub with real builder

- Rollback class: **CROSS-DOMAIN** (validator-gated, parity-bearing, gates #40+#66)
- Procedure:
  1. **Block until #40 and #66 reverted** if landed (per `plan-loop-2-08-master-sequence.md:108,112`).
  2. `git revert <commit>` to restore the static stub.
  3. Restore `_capabilities_all_allowlist.toml` ordering if entries were inserted (per `plan-loop-2-03-lock-conflict-matrix.md:46-50`).
  4. Restore `_authorization_capabilities/__init__.py.__all__` ordering.
  5. Restore catalog truth tables in `docs/security/capability-catalog.json` (per `plan-loop-2-04-doc-touch-matrix.md:226-227`).
  6. Restore `authorization-capability-contract.md:132` and `.json:719` (per `plan-loop-2-04-doc-touch-matrix.md:127`).
  7. Delete `tests/backend/pytest/api/v1/admin/test_capabilities_builder.py` (per `plan-loop-2-03-lock-conflict-matrix.md:427`).
  8. **Run validator** — must exit 0; check 4 returns to pre-builder shape.
- Hidden state to restore: TOML order in `_capabilities_all_allowlist.toml` + Python `__all__` order + 4 admin truth-table entries + 1 NEW lock test + capability contract md/json edits + sensitive-path entries.
- Risk if reverted partially: validator emits `capability_catalog_*_field_missing` or order violation; admin UI loses 4 capability flags; #40 (admin re-cluster) cannot stand without builder.
- Estimated revert time: 60 min.

## Item #40 — S8.11 — Re-cluster admin sub-routers (telemetry/sessions/directory/data_quality)

- Rollback class: **CROSS-DOMAIN** (#39 prereq, router lock)
- Procedure:
  1. `git revert <commit>` to restore the original admin sub-router clustering.
  2. Restore the router lock TOML if rebalanced.
  3. Delete `tests/backend/pytest/architecture/test_w12_admin_subrouter_clustering_red.py` and `test_admin_route_table_snapshot_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:448`).
  4. Restore `backend/app/api/v1/endpoints/admin/README.md:9-19` Contents block (per `plan-loop-2-04-doc-touch-matrix.md:540`).
  5. Restore `02-backend-endpoints.md` route table (per `plan-loop-2-04-doc-touch-matrix.md:819-821`).
- Hidden state to restore: router clustering + 2 NEW lock files + admin README + 1 plan-doc table.
- Risk if reverted partially: 404s on relocated admin routes; stale OpenAPI snapshot.
- Estimated revert time: 45 min.

## Item #41 — B-N3 — Delete bidirectional underscore aliases in issue-workflow serialization

- Rollback class: **LOCK-RATCHET**
- Procedure: `git revert <commit>`; drop `test_issue_workflow_serialization_has_no_self_aliases` assertion (per `plan-loop-2-03-lock-conflict-matrix.md:324`).
- Hidden state to restore: 1 deepening-contract assertion.
- Risk if reverted partially: aliases re-appear; lock RED.
- Estimated revert time: 10 min.

## Item #42 — BE-N2 — `ActorPayloadModel` shared base

- Rollback class: **LOCK-RATCHET**
- Procedure:
  1. `git revert <commit>` to restore inline actor payload models.
  2. Delete `tests/backend/pytest/test_outbox_actor_payload_base_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:449`).
  3. Confirm idempotency tests still GREEN.
- Hidden state to restore: 1 NEW lock.
- Risk if reverted partially: idempotency might still pass, but architecture lock asserts shared-base presence — RED.
- Estimated revert time: 15 min.

## Item #43 — BE-N4 — Audit adapter-emitter helper (additive)

- Rollback class: **LOCK-RATCHET**
- Procedure:
  1. `git revert <commit>` to inline the helper invocations back into the 6 audit modules (`risk.py`, `control.py`, `kri.py`, `issue.py`, `approval.py`, `vendor.py` — per `plan-loop-2-03-lock-conflict-matrix.md:148`).
  2. Delete `tests/backend/pytest/architecture/test_audit_adapter_emitter_helper_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:442`).
  3. Verify W7 audit-adapter completeness lock still GREEN (matrix rows untouched).
- Hidden state to restore: 6 audit-module diffs + 1 NEW lock.
- Risk if reverted partially: audit matrix may emit duplicates or skips.
- Estimated revert time: 30 min.

## Item #44 — BE-N6 — Centralize guarded path-prefix registry

- Rollback class: **CROSS-DOMAIN** (NEW TOML registry)
- Procedure:
  1. `git revert <commit>` to restore inline path-prefix guards.
  2. Delete the NEW TOML `backend/app/api/v1/_router_registry.toml` (per `plan-loop-2-03-lock-conflict-matrix.md:443`).
  3. Delete `tests/backend/pytest/architecture/test_router_prefix_registry_red.py`.
  4. Restore "Endpoint registry" subsection in `backend/app/api/v1/endpoints/README.md` (per `plan-loop-2-04-doc-touch-matrix.md:592-594`).
- Hidden state to restore: 1 NEW TOML + 1 NEW lock + 1 README subsection.
- Risk if reverted partially: middleware loses guard registrations; auth bypass risk.
- Estimated revert time: 30 min.

## Item #45a — BE-N8a — Ownership prerequisite characterization tests

- Rollback class: **TEST-ONLY**
- Procedure:
  1. `git revert <commit>` to delete the new characterization tests.
  2. Files: `test_ownership_resolver_kri_archived_asymmetry.py`, `test_ownership_resolver_control_join.py`, `test_visible_ids_via_ownership.py` (per `plan-loop-2-03-lock-conflict-matrix.md:450`).
- Hidden state to restore: 3 NEW characterization-pin test files.
- Risk if reverted partially: #45b loses behaviour pin; subsequent factory revert cannot verify equivalence.
- Estimated revert time: 10 min.

## Item #45b — BE-N8b — Ownership resolver factory

- Rollback class: **CROSS-DOMAIN** (#45a prereq)
- Procedure:
  1. **Block until other consumers of factory reverted.**
  2. `git revert <commit>` to restore in-line ownership resolution paths.
  3. Delete `test_ownership_resolver_factory_equivalence_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:451`).
  4. Confirm `_permissions/README.md:9-16` — likely no edit (per `plan-loop-2-04-doc-touch-matrix.md:577-583`).
- Hidden state to restore: 1 NEW lock test + ownership-resolution call-site shape.
- Risk if reverted partially: ownership decisions divergent across resolver and inline callers — silent ACL drift.
- Estimated revert time: 40 min.

## Item #46 — FE-N1 — Promote resource query-key factories (22 files)

- Rollback class: **CROSS-DOMAIN** (22 FE files — see `plan-loop-1-06-frontend.md:282`)
- Procedure:
  1. **Block until #65, #67, #68 reverted** (chain `#46 → {#65, #67, #68}` per `plan-loop-2-08-master-sequence.md:165`).
  2. `git revert <commit>` to restore **45 inline `queryKey:` literals across 22 FE files** (per `plan-loop-1-06-frontend.md:282` quote `LIFT 45 inline queryKey: literals across 22 files into per-domain factory modules`).
  3. Delete the new factory modules `frontend/src/lib/queryKeys/<domain>.ts`.
  4. Delete `tests/frontend/unit/src/lib/queryKeys/__tests__/queryKeys.invariant.test.ts` (per `plan-loop-2-03-lock-conflict-matrix.md:428`).
  5. Restore `frontend/src/lib/README.md` index entry (per `plan-loop-2-04-doc-touch-matrix.md:702-704`).
  6. Re-evaluate `_naming_allowlist.toml` entries (Loop 2 flagged the FE adds as misidentified — per `plan-loop-2-03-lock-conflict-matrix.md:78-82`); if any TOML row was added, drop it.
  7. **TEST CODE STALENESS**: 22 FE test files reference the factories. The revert must touch **all 22** consumer test files coherently or `pnpm test` will fail with "Cannot read property of undefined".
- Hidden state to restore: 22 FE test files referencing factories; 1 NEW invariant test; 1 README index entry; possible TOML entry.
- Risk if reverted partially: HIGH — leaves test code stale; FE typecheck/lint will RED across the entire query-key surface.
- Estimated revert time: 75 min.

## Item #47 — FE-N4 — Extract session-refresh retry policy

- Rollback class: **LOCK-RATCHET** (FE)
- Procedure:
  1. **Block until #71 reverted** (per `plan-loop-2-08-master-sequence.md:112`).
  2. `git revert <commit>` to restore the inline retry policy.
  3. Delete `tests/frontend/unit/src/services/api/__tests__/sessionRefreshPolicy.test.ts` (per `plan-loop-2-03-lock-conflict-matrix.md:429`).
  4. Restore `frontend/src/services/api/README.md` policy note (per `plan-loop-2-04-doc-touch-matrix.md:709-712`).
- Hidden state to restore: 1 NEW FE test + 1 README note.
- Risk if reverted partially: retry behaviour silently differs.
- Estimated revert time: 20 min.

## Item #48 — FE-N6 — Merge `getErrorMessageKey.ts` + `errorCodeMap.ts`

- Rollback class: **CROSS-DOMAIN** (FE)
- Procedure:
  1. `git revert <commit>` to restore both files split.
  2. Delete `tests/frontend/unit/src/i18n/__tests__/errorKeys.merged.test.ts` (per `plan-loop-2-03-lock-conflict-matrix.md:430`).
  3. Restore `frontend/src/i18n/README.md` merge note (per `plan-loop-2-04-doc-touch-matrix.md:727-729`).
  4. Re-check if `_naming_allowlist.toml` needed an entry (Loop 2 misidentification flag — `plan-loop-2-03-lock-conflict-matrix.md:82`).
- Hidden state to restore: 1 NEW FE test + 1 README note.
- Risk if reverted partially: i18n keys served from two modules; consumer imports inconsistent.
- Estimated revert time: 20 min.

## Item #49 — S2.2 — Inline `_control_execution/monitoring.py` wrapper

- Rollback class: **CROSS-DOMAIN** (#17 prereq, #59 dependent, deepening contract)
- Procedure:
  1. **Block until #59 reverted** (chain `#17 → #49 → #59` per `plan-loop-2-08-master-sequence.md:147`).
  2. `git revert <commit>` to restore `monitoring.py` wrapper at `backend/app/services/_control_execution/monitoring.py` and the 4 callsite repoints.
  3. Restore `test_architecture_deepening_contracts.py:188,192` quote `hasattr(monitoring, "load_control_execution_monitoring_context")` and `from app.services._control_execution.monitoring` (per `plan-loop-2-03-lock-conflict-matrix.md:475`).
  4. Delete `test_control_execution_monitoring_inlined_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:444`).
- Hidden state to restore: deleted `monitoring.py` + 2 lock-test assertions + 4 endpoint imports.
- Risk if reverted partially: chain inconsistency; either the file exists but lock asserts inline OR the file is gone but lock asserts presence.
- Estimated revert time: 30 min.

## Item #50 — S3.2 — Delete `_kri_history/submission.py` wrapper

- Rollback class: **CROSS-DOMAIN** (deepening contract + contract validator)
- Procedure:
  1. **Sequence**: revert order matches forward order — `#50 → #51` per `plan-loop-2-03-lock-conflict-matrix.md:478` (#50 leaves a clean tuple).
  2. `git revert <commit>` to restore `submission.py`.
  3. Restore `test_architecture_deepening_contracts.py:997-1002` submission.py negative-assertion strings (per `plan-loop-2-03-lock-conflict-matrix.md:241`).
  4. Restore `authorization-capability-contract.md:117,118,161` and `.json:389,411` (per `plan-loop-2-05-validator-schedule.md:227-230`).
  5. Drop the `assert not (...submission.py).exists()` in `test_w4_bc_g_kri_history_boundaries_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:371`).
  6. Restore `_kri_history/README.md:21` listing (per `plan-loop-2-04-doc-touch-matrix.md:428`).
  7. **Run validator** — exit 0 required.
- Hidden state to restore: 5 contract-cell entries + tuple at `:997-1002` + W4-bc-g lock + 1 README listing.
- Risk if reverted partially: validator emits `contract_path_missing` for `submission.py`; deepening contract tuple shape inconsistent.
- Estimated revert time: 35 min.

## Item #51 — S3.3 — Delete `_kri_history/value_application.py` shim

- Rollback class: **CROSS-DOMAIN** (atomic with #24)
- Procedure: see Item #24 above — **must be reverted atomically with #24**.
- Hidden state to restore: shared with #24; deepening contract `:976,979,980,998-1000` strings.
- Risk if reverted partially: same as #24.
- Estimated revert time: 45 min (single combined operation with #24).

## Item #52 — S3.5 — Delete `_kri_history/correction_plans.py`

- Rollback class: **CROSS-DOMAIN** (deepening contract)
- Procedure:
  1. `git revert <commit>` to restore `correction_plans.py`.
  2. Restore `test_architecture_deepening_contracts.py:956,962` import-tuple entry + `assert hasattr(correction_plans, "build_kri_correction_plan")` (per `plan-loop-2-03-lock-conflict-matrix.md:217`).
  3. Drop `assert not (...correction_plans.py).exists()` from `test_w4_bc_g_kri_history_boundaries_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:373`).
  4. Restore `_kri_history/README.md` row if present (per `plan-loop-2-04-doc-touch-matrix.md:430`).
- Hidden state to restore: 2 deepening-contract lines + 1 W4-bc-g lock + possible README row.
- Risk if reverted partially: ImportError at `:956` on the import tuple.
- Estimated revert time: 25 min.

## Item #53 — S4.1 — Issue workflow service collapse (drop `IssueWorkflowService`)

- Rollback class: **CROSS-DOMAIN** (deepening contract)
- Procedure:
  1. **Block until issues chain (`#28`, `#30`) is reverted if landed.**
  2. `git revert <commit>` to restore `IssueWorkflowService` facade.
  3. Restore `test_architecture_deepening_contracts.py:1193` import line (per `plan-loop-2-03-lock-conflict-matrix.md:292`).
  4. Drop the structural assertion `test_issue_workflow_execution_imports_lifecycle_directly` (per `plan-loop-2-03-lock-conflict-matrix.md:325`).
  5. Restore `_issue_workflow/README.md` `service.py` listing (per `plan-loop-2-04-doc-touch-matrix.md:478`).
- Hidden state to restore: deepening-contract import line + 1 lock + 1 README row.
- Risk if reverted partially: `_issue_workflow/execution.py` imports a non-existent service; module load fails.
- Estimated revert time: 35 min.

## Item #54 — S6.3 — Inline `_approval_queue/lifecycle.py` aggregator

- Rollback class: **CROSS-DOMAIN** (deepening contract — 3 tests)
- Procedure:
  1. `git revert <commit>` to restore `_approval_queue/lifecycle.py`.
  2. Restore `test_architecture_deepening_contracts.py:1005, 1025, 1041` rewrites — three test functions each previously imported `lifecycle` directly (per `plan-loop-2-03-lock-conflict-matrix.md:253, 263, 273`).
- Hidden state to restore: 3 deepening-contract test rewrites.
- Risk if reverted partially: HIGH — three deepening tests are interdependent; if one is restored without the other two, ImportError on `from app.services._approval_queue import lifecycle`.
- Estimated revert time: 35 min.

## Item #55 — S7.5 — Delete `access_user_service.py` facade

- Rollback class: **CROSS-DOMAIN** (deepening contract + validator)
- Procedure:
  1. `git revert <commit>` to restore `backend/app/services/access_user_service.py`.
  2. Restore `test_architecture_deepening_contracts.py:243-272` — `test_identity_access_routes_use_lifecycle_module` body which previously called `inspect.getsource(access_user_service)` at `:257` (per `plan-loop-2-03-lock-conflict-matrix.md:194`).
  3. Restore `authorization-capability-contract.md:109` and `.json:106,229` (per `plan-loop-2-05-validator-schedule.md:174-176`).
  4. Restore the row in `backend/app/services/README.md` (per `plan-loop-2-04-doc-touch-matrix.md:526`).
  5. Delete `tests/backend/pytest/architecture/test_access_user_service_removed_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:452`).
  6. **Run validator** — exit 0 required.
- Hidden state to restore: deepening-contract test body + contract md/json + service README + 1 NEW lock.
- Risk if reverted partially: validator emits `contract_path_missing`; deepening test ImportError.
- Estimated revert time: 35 min.

## Item #56 — S7.6 — Delete `directory_identity_service.py` shim

- Rollback class: **CROSS-DOMAIN** (atomic with #61, deepening contract + validator)
- Procedure:
  1. **MUST be reverted atomically with #61** (per `plan-loop-2-08-master-sequence.md:253`).
  2. `git revert <commit>` to restore `backend/app/services/directory_identity_service.py`.
  3. Restore `test_architecture_deepening_contracts.py:226-240` — `test_directory_identity_facade_uses_lifecycle_module` body (per `plan-loop-2-03-lock-conflict-matrix.md:184`).
  4. Restore `authorization-capability-contract.md:109` and `.json:106,229` (per `plan-loop-2-05-validator-schedule.md:138-141`).
  5. Restore service README row + delete the new lock `test_directory_identity_service_removed_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:453`).
  6. **Run validator** — exit 0 required.
- Hidden state to restore: deepening-contract test body + contract md/json + service README + 1 NEW lock.
- Risk if reverted partially: same as #61 (paired).
- Estimated revert time: 50 min (combined with #61).

## Item #57 — S8.1 — Keep `quarterly_comparison_service.py` facade (Reject; document-only)

- Rollback class: **DOC-ONLY** (with deepening-contract rewrite)
- Procedure:
  1. `git revert <commit>` to restore `quarterly_comparison_service.py` if deleted under orchestrator override.
  2. Restore `test_architecture_deepening_contracts.py:559-569` `test_quarterly_comparison_service_is_composition_facade` body (per `plan-loop-2-03-lock-conflict-matrix.md:204`).
  3. Restore `_quarterly_comparison/README.md:16` "Keep ... as the public service entrypoint" (per `plan-loop-2-04-doc-touch-matrix.md:31`).
  4. Restore `.planning/codebase/CONVENTIONS.md:22` and `CONCERNS.md:14`.
  5. Delete `tests/backend/pytest/architecture/test_quarterly_comparison_facade_removed_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:415`).
- Hidden state to restore: deepening contract test body + 3 doc citations + 1 NEW lock.
- Risk if reverted partially: deepening contract `:559-569` would assert facade-removed but file restored — RED.
- Estimated revert time: 30 min.

## Item #58 — S8.3 — Delete `OrphanedItemService` facade + static-method class

- Rollback class: **LOCK-RATCHET**
- Procedure:
  1. `git revert <commit>` to restore the facade.
  2. Delete `tests/backend/pytest/architecture/test_orphaned_item_facade_removed_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:445`).
  3. Restore architecture-lock entry if applicable.
- Hidden state to restore: 1 NEW lock + possible TOML entry.
- Risk if reverted partially: lock RED on facade presence.
- Estimated revert time: 25 min.

## Item #59 — S2.10 — Consolidate `_monitoring_*` packages (docs+lock)

- Rollback class: **CROSS-DOMAIN** (#17, #49 prereq)
- Procedure:
  1. `git revert <commit>` to restore prior `_monitoring_*` package boundaries.
  2. Delete the NEW READMEs `backend/app/services/_monitoring_response/README.md` (per `plan-loop-2-04-doc-touch-matrix.md:508-515`).
  3. Restore `_monitoring_status/README.md:5-7` framing (per `plan-loop-2-04-doc-touch-matrix.md:518-520`).
  4. Delete `tests/backend/pytest/architecture/test_monitoring_packages_separated_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:446`).
- Hidden state to restore: 1 NEW lock + 1 NEW README + 1 README sharpening.
- Risk if reverted partially: new packages live but old README references dangling paths.
- Estimated revert time: 35 min.

## Item #60 — S6.6 — Introduce `PrivilegeContext` + `Depends(get_privilege_context)`

- Rollback class: **CROSS-DOMAIN** (#34 prereq, multi-callsite)
- Procedure:
  1. `git revert <commit>` to restore per-call `can_resolve_approvals(current_user)` invocations across the approval routes (per `plan-loop-1-03-approvals.md:244` quote `Revert restores per-call can_resolve_approvals(current_user) invocations; capability surface and HTTP responses unchanged`).
  2. Drop the structural assertion `hasattr(app.api.deps, "get_privilege_context")` (per `plan-loop-2-03-lock-conflict-matrix.md:330`).
  3. Restore `## Vocabulary` "privilege context" entry in `authorization-capability-contract.md` and `.json:692` (per `plan-loop-2-05-validator-schedule.md:276-279`).
  4. **Run validator** — exit 0 required.
- Hidden state to restore: per-route Depends() call shape + 1 deepening assertion + 1 markdown vocabulary entry + 1 JSON path.
- Risk if reverted partially: HTTP responses unchanged but Depends() signatures inconsistent — request-scoping divergence.
- Estimated revert time: 50 min.

## Item #61 — S7.7 — Move `graph_directory_*` modules into `_graph_directory/` package

- Rollback class: **CROSS-DOMAIN** (atomic with #56, validator-gated, capability contract path-rewrite)
- Procedure:
  1. **MUST be reverted atomically with #56** (per `plan-loop-2-08-master-sequence.md:253`).
  2. `git revert <commit>` to restore the flat `graph_directory_*.py` files.
  3. Rewrite `authorization-capability-contract.md:109` from `_graph_directory/service.py` back to `graph_directory_service.py`.
  4. Rewrite `.json:113,229` (per `plan-loop-2-05-validator-schedule.md:158-161`).
  5. Delete `backend/app/services/_graph_directory/README.md` (NEW per `plan-loop-2-04-doc-touch-matrix.md:457-465`).
  6. Restore `backend/app/services/README.md` `graph_directory_service.py` row.
  7. Delete `tests/backend/pytest/architecture/test_graph_directory_package_move_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:454`).
  8. Restore the 8 prod importers + 1 script + 2 test files that were repointed.
  9. **Run validator** — exit 0 required.
- Hidden state to restore: contract md path + 2 contract json paths + service README + NEW package README + 1 NEW lock + 11 callsite repoints.
- Risk if reverted partially: cross-import dependency between `directory_identity_service.py` and `graph_directory_service.py` (per `plan-loop-1-08-crosscut.md:362-368`) means one without the other = ImportError.
- Estimated revert time: 50 min (paired with #56).

## Item #62 — S5.9 — Relocate `kri_vendor_assignment.py` + per-row audit events

- Rollback class: **CROSS-DOMAIN** (W4-bc-c lock path, validator)
- Procedure:
  1. `git revert <commit>` to restore `backend/app/services/kri_vendor_assignment.py` at the original path.
  2. Restore `test_w4_bc_c_vendor_governance_boundaries_red.py:16` `VENDOR_SERVICE_FILES` entry (per `plan-loop-2-03-lock-conflict-matrix.md:356`).
  3. Restore `authorization-capability-contract.md:172` perimeter-pass note (per `plan-loop-2-05-validator-schedule.md:243-244`).
  4. Verify W7 audit-matrix still GREEN (per `plan-loop-2-03-lock-conflict-matrix.md:144`).
  5. Restore `_vendor_links/README.md` extension (per `plan-loop-2-04-doc-touch-matrix.md:399-403`).
  6. Restore `STRUCTURE.md` reference if updated (per `plan-loop-2-04-doc-touch-matrix.md:773-775`).
  7. Delete `tests/backend/pytest/test_kri_vendor_assignment_audit_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:409`).
  8. **Run validator** — exit 0 required.
- Hidden state to restore: W4-bc-c lock path + contract perimeter-pass note + README + plan-doc + audit-event behaviour.
- Risk if reverted partially: lock test crashes on `ast.parse(path.read_text(...))` because the file no longer exists at the listed path (per `plan-loop-2-03-lock-conflict-matrix.md:358`).
- Estimated revert time: 45 min.

## Item #63 — BE-N7 — Instrument outbox dispatch with `SchedulerJobRun`

- Rollback class: **CROSS-DOMAIN** (admin runtime state)
- Procedure:
  1. `git revert <commit>` to restore the prior `dispatch_outbox` body without `SchedulerJobRun` recording.
  2. Delete `tests/backend/pytest/test_outbox_dispatch_scheduler_job_run_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:447`).
  3. Restore `outbox/README.md` note (per `plan-loop-2-04-doc-touch-matrix.md:501-505`).
  4. Refresh `ADR-002:44` line numbers if they shifted (per `plan-loop-2-04-doc-touch-matrix.md:355-358`).
- Hidden state to restore: 1 NEW lock + 1 README note + ADR-002 verification + admin runtime state preserved (existing rows in `scheduler_job_runs` table for outbox-dispatch entries become orphaned — left in DB; no cleanup).
- Risk if reverted partially: orphan `SchedulerJobRun` rows visible in admin until manually purged. Admin telemetry stays GREEN; no functional bug.
- Estimated revert time: 25 min.

## Item #64 — FE-N2 — Extract QueryClient defaults from `App.tsx`

- Rollback class: **TRIVIAL**
- Procedure:
  1. `git revert <commit>` to restore inline QueryClient construction.
  2. Delete `tests/frontend/unit/src/services/api/__tests__/queryClient.defaults.test.ts` (per `plan-loop-2-03-lock-conflict-matrix.md:431`).
  3. Restore `frontend/src/services/api/README.md` singleton note (per `plan-loop-2-04-doc-touch-matrix.md:713-714`).
- Hidden state to restore: 1 NEW FE test + 1 README note.
- Risk if reverted partially: minor — singleton vs constructor difference may cause subtle React-Query refetch behaviour drift.
- Estimated revert time: 10 min.

## Item #65 — FE-N3 — Extract `crudCapabilitySchema` shared Zod base

- Rollback class: **CROSS-DOMAIN** (#46 prereq, validator parity-bearing)
- Procedure:
  1. **Block until #66 reverted** if landed (per `plan-loop-2-08-master-sequence.md:108` chain through #66).
  2. `git revert <commit>` to restore per-entity Zod schemas (risk 19 fields, control 20 fields, kri 23 fields, vendor 14 fields — per `plan-loop-2-05-validator-schedule.md:339-341`).
  3. Restore `docs/security/capability-catalog.json` snapshot (per `plan-loop-2-04-doc-touch-matrix.md:228-229`).
  4. Delete `tests/frontend/unit/src/services/api/schemas/__tests__/crudCapabilitySchema.snapshot.test.ts` (per `plan-loop-2-03-lock-conflict-matrix.md:432`).
  5. Restore `frontend/src/services/api/schemas/README.md` line (per `plan-loop-2-04-doc-touch-matrix.md:721-723`).
  6. **Run validator** — exit 0 required (check 4 Pydantic↔Zod parity is the dominant failure mode).
- Hidden state to restore: 4 entity-specific Zod schemas + capability-catalog snapshot + 1 NEW FE test + 1 README + validator parity.
- Risk if reverted partially: validator emits `capability_catalog_frontend_field_missing` if any entity's `merge()` chain is partially reverted (per `plan-loop-2-05-validator-schedule.md:344-349`).
- Estimated revert time: 60 min.

## Item #66 — FE-N5 — Split `AuthContext.tsx` into independent providers

- Rollback class: **CROSS-DOMAIN** (#37, #39 prereq, frontend local-gate registry, gates #68, #71)
- Procedure:
  1. **Block until #68 and #71 reverted.**
  2. `git revert <commit>` to restore monolithic `AuthContext.tsx`.
  3. Delete the split contexts `SessionProvider.tsx`, `AuthActionsProvider.tsx`, `PreferencesContext.tsx`, etc.
  4. Delete NEW FE tests `SessionProvider.split.test.tsx`, `AuthActions.split.test.tsx` (per `plan-loop-2-03-lock-conflict-matrix.md:433`).
  5. Restore `frontend/src/contexts/README.md:9-12`, `auth/README.md:5,20`, `.planning/codebase/CONVENTIONS.md:43`, `.planning/audits/_context/03-frontend-architecture.md` (per `plan-loop-2-04-doc-touch-matrix.md:611-625, 832`).
  6. Restore `authorization-capability-contract.md:131` (per `plan-loop-2-05-validator-schedule.md:362-366`).
  7. Re-add to `FRONTEND_LOCAL_GATE_CLASSIFICATIONS` in `scripts/security/authz_contract_manifest.py:13-63` if entries were dropped.
  8. **Run validator** — exit 0 required (check 7 frontend local-gate per-file allowlist).
- Hidden state to restore: 3-context split rolled into 1 file + 2 NEW FE tests + 4 README diffs + validator allowlist + 1 contract md path.
- Risk if reverted partially: validator emits `frontend_local_gate_pattern_disallowed` (per `plan-loop-2-05-validator-schedule.md:368-372`); FE re-render isolation tests fail.
- Estimated revert time: 75 min.

## Item #67 — FE-N7 — Extract generic `useResourcePanelQuery`

- Rollback class: **LOCK-RATCHET** (#46 prereq)
- Procedure:
  1. `git revert <commit>` to restore per-resource query hooks.
  2. Delete `tests/frontend/unit/src/hooks/__tests__/useResourcePanelQuery.contract.test.tsx` (per `plan-loop-2-03-lock-conflict-matrix.md:434`).
  3. Restore `frontend/src/hooks/README.md` description (per `plan-loop-2-04-doc-touch-matrix.md:737-739`).
- Hidden state to restore: 1 NEW FE test + 1 README description.
- Risk if reverted partially: hook duplicated; consumers may import either.
- Estimated revert time: 25 min.

## Item #68 — FE-N8 — Introduce `WidgetShell` + scoped query selector

- Rollback class: **CROSS-DOMAIN** (#46, #66 prereq)
- Procedure:
  1. **Block until #71 reverted.**
  2. `git revert <commit>` to restore monolithic dashboard widget rendering.
  3. Delete NEW FE tests `WidgetShell.contract.test.tsx`, `DashboardFilterContext.scopedSelector.test.tsx` (per `plan-loop-2-03-lock-conflict-matrix.md:435`).
  4. Restore `frontend/src/components/dashboard/README.md:9-30` Contents (per `plan-loop-2-04-doc-touch-matrix.md:642-645`).
  5. Restore the scoped-selector usage in `pages/dashboard/useDashboardOverviewState.ts:21` (per `plan-loop-1-06-frontend.md:458`).
- Hidden state to restore: 2 NEW FE tests + 1 README block + scoped-selector behaviour.
- Risk if reverted partially: dashboard renders with intermittent stale state; subtle UX regression.
- Estimated revert time: 45 min.

## Item #69 — S5.2 — Introduce `AbstractVendorLink` mixin (Phase 1)

- Rollback class: **MIGRATION** (atomic with #70 — see "Snapshot strategy" section below)
- Procedure: see **Migration Bundle Snapshot Procedure** below.
- Hidden state to restore: Postgres FK constraints (4 rebuilt FKs); ORM mixin file; 3 link-model rebases; tests.
- Risk if reverted partially: schema/code drift; ORM expects mixin shape but DB has flat FKs.
- Estimated revert time: 4–8 hours (snapshot restore + redeploy window).

## Item #70 — S5.7 — Drop `Vendor.status` enum

- Rollback class: **MIGRATION** (atomic with #69)
- Procedure: see **Migration Bundle Snapshot Procedure** below.
- Hidden state to restore: `vendors.status` column (`String(20) NOT NULL DEFAULT 'active' indexed`); `ix_vendors_status` index; `VendorStatus` Python enum + `VendorStatusEnum` Pydantic enum + 8 prod-site references + 6 seed-script entries; `_archivable.py:60-64` `vendors: ("inactive",)` legacy_values entry.
- Risk if reverted partially: ORM imports `VendorStatusEnum` from non-existent module; FE e2e helpers `ensureVendorStatus(... 'inactive')` (~10 sites — `plan-loop-2-06-migration-window.md:653-656`) target a missing column.
- Estimated revert time: 4–8 hours (paired with #69).

## Item #71 — S7.8 — Merge `services/session/` 8 files → 4

- Rollback class: **CROSS-DOMAIN** (multi-prereq #47, #66, #72)
- Procedure:
  1. `git revert <commit>` to restore the 8-file split.
  2. Delete NEW FE tests `sessionStorage.merged.test.ts`, `coordinator.merged.test.ts`, `coordinator.singleFlight.test.ts` (per `plan-loop-2-03-lock-conflict-matrix.md:436`).
  3. Restore `frontend/src/services/session/README.md:1-13` Contents (per `plan-loop-2-04-doc-touch-matrix.md:632-636`).
  4. Restore `frontend/src/contexts/auth/README.md:21-23` path (per `plan-loop-2-04-doc-touch-matrix.md:621-625`).
  5. Restore `_naming_allowlist.toml` entries if applicable (per `plan-loop-2-03-lock-conflict-matrix.md:80-82`).
  6. Re-check session lifecycle tests (per `plan-loop-2-08-master-sequence.md:115`).
- Hidden state to restore: 5 deleted modules + 3 NEW FE tests + 2 READMEs + possible TOML entries + session-lifecycle behaviour.
- Risk if reverted partially: session refresh retry policy may fire from two coordinators; double-refresh storms.
- Estimated revert time: 60 min.

## Item #72 — S7.9 (ADR-011) — Author ADR-011 (Auth Scheme and Session Model)

- Rollback class: **DOC-ONLY**
- Procedure:
  1. `git revert <commit>` to delete `docs/adr/ADR-011-auth-scheme-and-session-model.md` (per `plan-loop-2-04-doc-touch-matrix.md:855`).
  2. Restore `AGENTS.md:218-231` (drop ADR-011 row — per `plan-loop-2-04-doc-touch-matrix.md:91-93`).
  3. Restore `docs/README.md:104-112` block (per `plan-loop-2-04-doc-touch-matrix.md:240`).
  4. Restore `docs/DOCUMENTATION_TREE.md:86-89` (per `plan-loop-2-04-doc-touch-matrix.md:258`).
  5. Restore `docs/adr/README.md` index row.
  6. Delete `tests/backend/pytest/architecture/test_adr_011_present_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:455`).
  7. **Coordination**: #71 + #66 depend on #72. If those landed, must revert in reverse order first.
- Hidden state to restore: 5 doc citations + 1 NEW lock.
- Risk if reverted partially: lock RED on absent ADR-011.
- Estimated revert time: 15 min (60 if dependents landed).

## Item #73 — S3.12 (ADR-012) — Author ADR-012 (KRI time-series period algebra)

- Rollback class: **CROSS-DOMAIN** (KRI state allowlist precedent)
- Procedure:
  1. `git revert <commit>` to delete `docs/adr/ADR-012-kri-time-series-period-algebra.md`.
  2. Delete `tests/backend/pytest/architecture/test_kri_period_algebra_ssot_red.py`.
  3. Delete the NEW TOML `_kri_state_vocabulary_allowlist.toml` (per `plan-loop-2-03-lock-conflict-matrix.md:410`).
  4. Delete `tests/backend/pytest/test_kri_deadline_classify_red.py`.
  5. Restore `_kri_history/README.md` "see ADR-012" link (per `plan-loop-2-04-doc-touch-matrix.md:434`).
  6. Restore `docs/adr/README.md` index row + `docs/DOCUMENTATION_TREE.md:86-89` (per `plan-loop-2-04-doc-touch-matrix.md:260-261`).
- Hidden state to restore: 2 NEW lock files + 1 NEW TOML + 5 doc citations.
- Risk if reverted partially: TOML and lock test reference ADR-012 sections that no longer exist.
- Estimated revert time: 30 min.

## Item #74a — ADR-007 (a) — 31-package census (CENSUS phase + 4 NEW TOMLs)

- Rollback class: **CROSS-DOMAIN** (4 NEW TOMLs + lock test, package-count drift sensitive)
- Procedure:
  1. **Block until #74b reverted** (per `plan-loop-2-08-master-sequence.md:111`).
  2. `git revert <commit>` to:
     - Delete the 4 NEW TOMLs: `_bounded_context_write_side.toml`, `_bounded_context_read_shape.toml`, `_bounded_context_workflow_pairs.toml`, `_bounded_context_adapters.toml` (optional 5th `_bounded_context_policy.toml`) (per `plan-loop-2-03-lock-conflict-matrix.md:456`).
     - Delete `tests/backend/pytest/architecture/test_bounded_context_classification_complete_red.py`.
  3. **Package count drift**: `plan-loop-2-07-hidden-prereqs.md:108-115` notes that `_graph_directory/` from #61 is **already pre-listed** in the adapter allowlist with a "post-#61" comment. After #74a is reverted, **#61's package directory remains** (#61 is independent revert), so no count drift.
  4. **However** — if #74a's lock used `== 31` (strict equality), a partial revert could leave assertion drift. The mitigation in `plan-loop-2-07-hidden-prereqs.md:551-553` recommends `>= 31`; if that mitigation was implemented, the revert is safe. If `== 31` was used, restore the assertion to match the post-#61 count (32 if #61 still landed, 31 if reverted).
- Hidden state to restore: 4 NEW TOMLs + 1 NEW lock + package-count assertion alignment.
- Risk if reverted partially: lock test asserts presence of `[[adapters]]` row that the dropped TOML defined → ImportError or AttributeError.
- Estimated revert time: 60 min.

## Item #74b — ADR-007 (b) — ADR-007 amendment text (after census)

- Rollback class: **DOC-ONLY** (#74a + #61 prereqs)
- Procedure:
  1. `git revert <commit>` to remove the amendment section from `docs/adr/ADR-007-bounded-context-taxonomy.md` (per `plan-loop-2-04-doc-touch-matrix.md:325-330`).
  2. Restore `AGENTS.md:218-231` ADR list reference (per `plan-loop-2-04-doc-touch-matrix.md:95`).
  3. Restore `docs/adr/README.md` cross-reference (per `plan-loop-2-04-doc-touch-matrix.md:316-317`).
  4. Delete `tests/backend/pytest/architecture/test_adr_007_amendment_present_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:457`).
- Hidden state to restore: 1 ADR amendment section + 2 doc-list rows + 1 NEW lock.
- Risk if reverted partially: lock RED.
- Estimated revert time: 20 min.

## Item #75 — Bonus — Delete-and-consolidate `_auto_reject_kri_approval`

- Rollback class: **LOCK-RATCHET**
- Procedure:
  1. `git revert <commit>` to restore the consolidated helper.
  2. Drop the structural assertion `hasattr(_approval_execution.results, "auto_reject_kri_approval")` from `test_architecture_deepening_contracts.py` (per `plan-loop-2-03-lock-conflict-matrix.md:331`).
  3. Run `pytest tests/backend/pytest/test_approvals_*`.
- Hidden state to restore: 1 deepening-contract assertion.
- Risk if reverted partially: lock RED.
- Estimated revert time: 15 min.

---

## Migration Bundle Snapshot Procedure (#69 + #70)

Per ADR-010 (`docs/adr/ADR-010-postgres-migration-rehearsal-contract.md:30`) quote `Production rollback is restoring the pre-upgrade database snapshot. Alembic downgrade() for these revisions raises NotImplementedError and points here.`

The migration `k6l7m8n9o0p1_vendor_link_cascade_and_status_drop.py` (per `plan-loop-2-06-migration-window.md:228-231`) explicitly raises:

```python
raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")
```

Therefore in-place rollback via `alembic downgrade -1` is impossible. The full snapshot-restore procedure follows.

### Pre-merge requirements (per `plan-loop-2-06-migration-window.md:684-688`)

1. **Pre-upgrade snapshot of production DB** captured immediately before `alembic upgrade head` runs against production. The snapshot MUST be validated as restorable on a staging clone before the production upgrade.
2. **Row-count capture** for the four affected tables, persisted alongside the snapshot:
   - `SELECT COUNT(*) FROM vendors`
   - `SELECT COUNT(*) FROM vendor_risk_links`
   - `SELECT COUNT(*) FROM vendor_control_links`
   - `SELECT COUNT(*) FROM vendor_kri_links`
3. **Migration rehearsal** on a refreshed staging clone (per ADR-010 line 13 quote `rehearse them on a refreshed staging clone`), with monitoring of locks and statement duration.
4. **Application redeploy plan** verifying frontend + backend are deployable in lockstep — `plan-loop-2-06-migration-window.md:693` quote `no mid-deployment skew tolerated`.

### Snapshot capture (immediately before upgrade)

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

### Upgrade execution (in production)

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

### Rollback (if upgrade went wrong)

If a critical defect is discovered post-deploy and rollback is necessary:

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

# 5. Redeploy the reverted application BEFORE allowing traffic. If the deploy
#    skew tolerance is violated (per plan-loop-2-06-migration-window.md:693
#    quote "no mid-deployment skew tolerated"), traffic must remain blocked.
systemctl start riskhub-backend  # or k8s scale to N
```

### Post-rollback validation

1. Confirm `alembic current` shows revision `j5k6l7m8n9o0` (per `_context/07-migrations-schema.md:24-27`), not `k6l7m8n9o0p1`.
2. Confirm `vendors.status` column is restored: `SELECT column_name FROM information_schema.columns WHERE table_name='vendors' AND column_name='status';` returns one row.
3. Confirm `ix_vendors_status` index restored: `SELECT indexname FROM pg_indexes WHERE tablename='vendors' AND indexname='ix_vendors_status';` returns one row.
4. Confirm vendor link FKs do NOT have `ON DELETE CASCADE` (4 of 6 should be `confdeltype='a'` — no action — per pre-#69 baseline; the 2 `vendor_kri_links` FKs retain `'c'` as set by `v2w3x4y5z6a_add_vendor_kri_links.py:28-29`).
5. Confirm the application boots: ORM imports `VendorStatusEnum` successfully; `_archivable.py` `vendors: ("inactive",)` legacy_values entry present.

### Estimated revert time (#69 + #70 bundle)

- Snapshot capture: 5–30 min (dataset-size dependent).
- Snapshot validation (restore to disposable DB): 10–60 min.
- Production upgrade: 1–5 min (DDL-only).
- Rollback (if needed): 10–60 min restore + 5 min app revert + 5 min redeploy = **20 min – 2 hr** for the DB operation, plus git revert and validator + lock-test re-run = **4–8 hours total**.

---

## Rollback Risk Register Summary

### Class distribution

| Class | Items | Count | Percentage |
|---|---|---:|---:|
| TRIVIAL | #4, #5, #6, #64 | **4** | 5.2% |
| DOC-ONLY | #10, #20, #57, #72, #74b | **5** | 6.5% |
| TEST-ONLY | #45a | **1** | 1.3% |
| MIGRATION | #69, #70 | **2** | 2.6% |
| LOCK-RATCHET | #1, #2, #7, #9, #12, #14, #18, #21, #25, #27, #29, #31, #41, #42, #43, #47, #58, #67, #75 | **19** | 24.7% |
| CROSS-DOMAIN | #3, #8, #11, #13, #15, #16, #17, #19, #22, #23, #24, #26, #28, #30, #32, #33, #34, #35, #36, #37, #38, #39, #40, #44, #45b, #46, #48, #49, #50, #51, #52, #53, #54, #55, #56, #59, #60, #61, #62, #63, #65, #66, #68, #71, #73, #74a | **46** | 59.7% |
| **Total** | | **77** | 100% |

Notes on classification:
- `LOCK-RATCHET` items have a NEW lock-test or deepening-contract assertion that pins the structural change. Pure code revert + lock-edit revert.
- `CROSS-DOMAIN` items touch ≥2 domains, ≥2 callsites in different files, or have a known prereq/dependency chain. Many also have validator and contract-doc obligations.
- Two items (#57, #74a) carry secondary `LOCK-RATCHET` semantics within the dominant class shown.

### Top 10 highest-risk reverts

Ranked by combined criterion: revert time × CROSS-DOMAIN scope × validator obligation × dependency-chain depth.

| Rank | Item | Class | Why it's high-risk | Revert time |
|---|---|---|---|---|
| 1 | **#69 + #70** | MIGRATION | Forward-only Postgres migration; only path is snapshot-restore (ADR-010). FK constraints, dropped column, `_archivable.py` legacy_values entry, 8 prod sites, 6 seed scripts, 4 lock files, 7 docs. App must be down during DB restore; "no mid-deployment skew tolerated" (per `plan-loop-2-06-migration-window.md:693`). | **4–8 hours** |
| 2 | **#34** | CROSS-DOMAIN | 22+ callsites across 16 files (per `plan-loop-1-03-approvals.md:14,138`). Largest authorization-pathway change. Partial revert leaves privilege-tier dataclass and legacy boolean coexisting → silent ACL divergence. Capability-validator must re-pass. Dependency chain `#9 → #34 → #60` (per `plan-loop-2-08-master-sequence.md:165`). | **90 min** |
| 3 | **#46** | CROSS-DOMAIN | 22 FE files holding 45 inline `queryKey:` literals (per `plan-loop-1-06-frontend.md:282`). Revert leaves test code stale across all 22 — pnpm test fails everywhere. Blocks revert of #65, #67, #68. | **75 min** |
| 4 | **#74a** | CROSS-DOMAIN | 4 NEW TOMLs + 1 NEW lock; package-count drift sensitive (depends on whether `>= 31` mitigation in place per `plan-loop-2-07-hidden-prereqs.md:551-553`). Cross-dep with #61. | **60 min** |
| 5 | **#66** | CROSS-DOMAIN | Splits AuthContext into 3 providers; gates #68 + #71. Validator allowlist must be re-edited; FE re-render-isolation tests; 4 README diffs; backend prereqs #37 + #39. | **75 min** |
| 6 | **#39** | CROSS-DOMAIN | Capability-builder real implementation; validator parity-check on 4 NEW catalog fields; `_capabilities_all_allowlist.toml` order-strict; gates #40 and #66. | **60 min** |
| 7 | **#65** | CROSS-DOMAIN | 4 entity Zod schemas re-fanned; capability-catalog snapshot pin; validator parity-check is dominant failure mode (per `plan-loop-2-05-validator-schedule.md:344-349`). | **60 min** |
| 8 | **#24 + #51** | CROSS-DOMAIN (atomic bundle) | Highest doc-edit volume in any single commit — 5 contract-md cells + 5 contract-json strings + 5 deepening-contract lines + 1 W4-bc-g lock + 1 README listing (per `plan-loop-2-05-validator-schedule.md:516-520`). Validator must re-pass. | **45 min** |
| 9 | **#56 + #61** | CROSS-DOMAIN (atomic bundle) | Cross-import dependency between `directory_identity_service.py` and `graph_directory_service.py` (per `plan-loop-1-08-crosscut.md:362-368`). Deepening-contract test body rewrite + 11 callsite repoints + new package README + capability contract md/json path-rewrites. | **50 min** |
| 10 | **#62** | CROSS-DOMAIN | W4-bc-c lock at `:16` lists exact path (per `plan-loop-2-03-lock-conflict-matrix.md:356`). Lock test crashes on `ast.parse()` if path missing. Audit-event behaviour must be restored; capability-contract perimeter-pass note must be reset. | **45 min** |

### Snapshot strategy for migration items (#69 + #70)

**Single migration window** (per `plan-loop-2-06-migration-window.md:633-640`). Both items land in one bundled commit and one Alembic revision `k6l7m8n9o0p1_vendor_link_cascade_and_status_drop.py`. Therefore there is **one** snapshot, **one** rehearsal, and **one** rollback procedure for the bundle.

Key invariants:
1. **Pre-upgrade snapshot** is captured **immediately** before `alembic upgrade head` (within the same change-window).
2. **Snapshot is validated** by restoring to a disposable DB before the production upgrade runs (per `plan-loop-2-06-migration-window.md:687`).
3. **Row counts** for `vendors`, `vendor_risk_links`, `vendor_control_links`, `vendor_kri_links` are persisted alongside the snapshot.
4. **App down-time** is mandated during DB restore: per `plan-loop-2-06-migration-window.md:693` quote `no mid-deployment skew tolerated`. Frontend code referencing `vendor.status` must redeploy in lockstep.
5. **Alembic chain integrity**: post-rollback, `alembic current` reports `j5k6l7m8n9o0` (the prior head per `_context/07-migrations-schema.md:24-27`).
6. **Testing infrastructure**: SQLite in-memory test fixtures recreate from current ORM metadata (per `plan-loop-2-06-migration-window.md:159-165`); they do not need snapshot rollback.

**No partial rollback**: because #69 and #70 share one Alembic revision, there is no in-place way to undo only one of the two without snapshot restore. The bundle is atomic both forward and backward.

**Hidden state preservation** post-rollback:
- The `vendors.status` column with values (`active`); the `ix_vendors_status` index; the 4 affected vendor-link FKs without `ON DELETE CASCADE`. The 2 `vendor_kri_links` FKs **retain** `ON DELETE CASCADE` (set in `v2w3x4y5z6a_add_vendor_kri_links.py:28-29` — the migration only touched 4 FKs out of 6, never modifying the kri-link cascade behaviour).
- App code: `VendorStatus` Python enum + `VendorStatusEnum` Pydantic enum + 8 prod-site references + 6 seed-script entries + `_archivable.py:60-64` `vendors: ("inactive",)` legacy_values entry.
- Docs: 7 doc rollbacks (`backend/app/models/README.md`, `backend/app/services/_vendor_links/README.md`, `docs/adr/ADR-005`, `docs/adr/ADR-010`, `docs/README.md:111-112`, `docs/DOCUMENTATION_TREE.md:84`, `docs/BUSINESS_LOGIC.md:619`).

### Coordination notes for CROSS-DOMAIN reverts

The 46 CROSS-DOMAIN items split into three coordination tiers based on the structure of `plan-loop-2-08-master-sequence.md` and the dependency chains in `plan-loop-2-03-lock-conflict-matrix.md`:

#### Tier 1 — chain-bound reverts (reverse-order constraint)

Reverts MUST go in the reverse order of forward landings. If a downstream item already merged, revert it first or the upstream revert leaves a broken intermediate state.

- **Issues chain** `#2 → #8 → #28 → #30` (length 4 — per `plan-loop-2-08-master-sequence.md:181`): revert in reverse `#30 → #28 → #8 → #2`. Each revert restores its own slice of `_shared/__init__.py`, `_issue_workflow/`, and `:1193` of `test_architecture_deepening_contracts.py`.
- **Risks chain** `#1 → #19 → #11`: revert `#11 → #19 → #1`.
- **Approvals chain** `#9 → #34 → #60`: revert `#60 → #34 → #9`. **#34's revert touches 22+ sites**; this is the highest single-revert effort outside the migration bundle.
- **Monitoring chain** `#17 → #49 → #59`: revert `#59 → #49 → #17`. Each revert touches the deepening-contract `:188, :192` cells (#49) plus their own README and shim files.
- **FE auth/session chain** `#37 → #66 → #71`, `#39 → #66 → #71`, `#46 → #65/#67/#68`, `#72 → #71`, `#47 → #71`: revert in reverse, with `#71` first (depth-4 sink).
- **ADR-007 chain** `#74a → #74b`: revert `#74b → #74a`. #74a is sensitive to package count drift (per `plan-loop-2-07-hidden-prereqs.md:108-115`); if #61 is still landed, the count is 32, and #74a's lock must be edited to `>= 31` not `== 31`.

#### Tier 2 — atomic bundle reverts (single-commit rollback)

These items were forward-landed as one atomic commit. Their revert is also a single `git revert <bundled-sha>`:

- **#24 + #51** (KRI history barrel + value_application shim) — `plan-loop-2-08-master-sequence.md:252`.
- **#56 + #61** (directory shim + graph_directory move) — `plan-loop-2-08-master-sequence.md:253`.
- **#69 + #70** (vendor mixin + status drop) — `plan-loop-2-08-master-sequence.md:254`.

Reverting half of an atomic bundle is forbidden; the bundle's deepening-contract assertions and contract-validator paths assume both halves landed together.

#### Tier 3 — cross-area collisions

Items that touch the same file but are not directly in a chain:

- **#12 + #34** — both edit `endpoints/users/summary.py` (per `plan-loop-2-07-hidden-prereqs.md:511-516`). #12 narrows excepts; #34 swaps privileged-predicate. If #34 already landed, the #12 revert must be re-rebased.
- **#37 + #12 + #34** — all three edit `users/summary.py`; recommended forward order `#37 → #12 → #34` (per `plan-loop-2-07-hidden-prereqs.md:531`); revert order `#34 → #12 → #37`.
- **#50 + #51** — both edit deepening-contract tuple `:997-1002` (per `plan-loop-2-03-lock-conflict-matrix.md:478`). #50 leaves a clean tuple for the #24+#51 bundle to subset-edit. Revert in reverse: #24+#51 atomic bundle first, then #50.
- **#13 + #69** — both touch `authorization-capability-contract.{md:121,122, .json:55,479,502}`. #13 deletes the shim from the cells; #69 verifies the backend authority remains accurate. If both landed, revert #69+#70 first (Tier 2 bundle), then #13.
- **#3, #24, #25, #26, #50, #51, #52** — seven items append to `test_w4_bc_g_kri_history_boundaries_red.py` (per `plan-loop-2-03-lock-conflict-matrix.md:482`). Append-only on this file is safe; per-item revert removes its own stanza. Order matters only inasmuch as the forward-time order of file deletions matches.
- **#15 + #39 + #65** — all three edit `docs/security/capability-catalog.json`. Each pins a different sub-tree (per `plan-loop-2-04-doc-touch-matrix.md:226-233`). Revert each in reverse forward-order to keep the `validate_authz_capability_contract.py` script GREEN at every revert step.

#### Coordination protocol (single-developer)

For any CROSS-DOMAIN revert:

1. **Identify dependents**: cross-reference `plan-loop-2-08-master-sequence.md` "Pre-req" + "Atomic with" columns and `plan-loop-2-07-hidden-prereqs.md` cross-domain matrix.
2. **Block until dependents are reverted** (or NONE landed).
3. **Read the original commit's diff in full** before issuing `git revert` — the lock-test edits + README edits + capability-contract edits all sit in the same commit, and `git revert` will replay all of them.
4. **Run the validator** `python3 scripts/security/validate_authz_capability_contract.py` after every revert that touches `sensitive_change_paths`. This is non-negotiable for items #13, #15, #24, #34, #37, #39, #50, #51, #55, #56, #60, #61, #62, #65, #66 (the validator-gated subset per `plan-loop-2-05-validator-schedule.md:443-446`).
5. **Run** `make -f scripts/Makefile test-architecture-locks` after every revert that touches a lock or TOML.
6. **Run** `pytest -m postgres` after #69+#70 revert (snapshot restore validation).
7. **Tag the revert commit** with the original commit SHA for audit traceability.

### Aggregate revert effort

| Class | Mean revert time | Total time (sum across items in class) |
|---|---:|---:|
| TRIVIAL | 6 min | 26 min |
| DOC-ONLY | 16 min | 80 min |
| TEST-ONLY | 10 min | 10 min |
| MIGRATION | 6 hr | 12 hr (one bundle, two items) |
| LOCK-RATCHET | 17 min | 5 hr 23 min |
| CROSS-DOMAIN | 36 min | 27 hr 30 min |
| **Total** | — | **~46 hr** (single sequential developer) |

These numbers exclude:
- Production redeploy (~20 min per revert).
- Stakeholder communication / change-management process.
- Re-rebasing dependents if they landed in the wrong order.

For comparison, the forward effort is ~484 hours (per `plan-loop-2-08-master-sequence.md:238`); the all-77-revert effort is ~10% of that. The dominant cost is the **migration bundle** (12 hr nominally) and **#34 + #46** (each ≥1 hr) — three reverts account for ~30% of the total backwards budget.

End of rollback register.
