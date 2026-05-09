# Phase 3 Loop 3 — README & Lock Change Register (canonical)

Working dir: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Branch `main`,
head `1ee872a4`.

This register lists every README/doc and every lock/TOML/architecture-test
artifact that must change in the same commit as the code change for each
of the 77 Phase-2 items. Constraints honored:

- single sequential developer; TDD red→green;
- doc/lock-only Reject is invalid (developer's "doc-only" arguments
  overruled by orchestrator);
- Defers planned (not skipped);
- READMEs and locks are **outputs**, not constraints — every code change
  ratchets its README + lock into the same commit;
- ≤15-word quotes per doc citation; `file:line` cited;
- no fabricated paths — every entry traceable to
  `plan-loop-1-*.md`, `plan-loop-2-03-lock-conflict-matrix.md`,
  or `plan-loop-2-04-doc-touch-matrix.md`.

Item ordering follows the master sequential execution table at
`plan-loop-2-08-master-sequence.md:39-117`. Item IDs and audit-tags are
copied verbatim from that table.

Citations of the form `(doc-touch §N)` reference sections of
`plan-loop-2-04-doc-touch-matrix.md`; `(lock-conflict §X)` references
sections of `plan-loop-2-03-lock-conflict-matrix.md`.

---

## Item #1 — A-N1 — Drop `validate_risk_type` re-export from risks/crud package

### READMEs / docs to update (same commit)
- `.planning/audits/_context/02-backend-endpoints.md` — add a one-line
  note: package no longer re-exports `validate_risk_type` (per
  `plan-loop-1-02-risks.md:62-66`).

### Lock tests / TOMLs to update (same commit)
- none (no existing TOML references the symbol; per
  `plan-loop-1-02-risks.md:57-60`).

### Files to create
- `tests/backend/pytest/architecture/test_risks_crud_public_surface_red.py`
  — new `_red` invariant test (per `plan-loop-1-02-risks.md:45-47`).

### Files to delete
- none.

### Capability contract artifacts to refresh
- none.

---

## Item #2 — B-N1 — Drop 4 underscore aliases in `_issue_workflow/source_validation.py`

### READMEs / docs to update (same commit)
- `backend/app/services/_issue_workflow/README.md` — verify no edit
  needed (today lists modules only; per `plan-loop-1-01-issues.md:62-63`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/architecture/test_issue_workflow_no_underscored_self_aliases_red.py`
  — new test asserting underscore aliases gone (per
  `plan-loop-1-01-issues.md:53`).

### Files to create
- `tests/backend/pytest/architecture/test_issue_workflow_no_underscored_self_aliases_red.py`.

### Files to delete
- none (file `source_validation.py` may shrink; full deletion is in #8).

### Capability contract artifacts to refresh
- none.

---

## Item #3 — S3.11 — Delete `kriFormWorkflow.ts` shim

### READMEs / docs to update (same commit)
- none (symbol not referenced in docs, per `plan-loop-1-04-kris.md:43`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`
  — append `assert not (REPO_ROOT / "frontend/src/components/kri-form/kriFormWorkflow.ts").exists()`
  (per `plan-loop-1-04-kris.md:36`).

### Files to create
- `tests/frontend/unit/src/components/__tests__/EntityFormWorkflow.test.ts`
  — frontend structural-absence assertion (or extend existing test;
  per `plan-loop-1-04-kris.md:35`).

### Files to delete
- `frontend/src/components/kri-form/kriFormWorkflow.ts` (per
  `plan-loop-1-04-kris.md:38`).

### Capability contract artifacts to refresh
- none.

---

## Item #4 — FE-deadcode-1 — DELETE `controlFormWorkflow.ts` (3 lines, 0 prod, 0 test)

### READMEs / docs to update (same commit)
- `frontend/src/components/control-form/README.md` — strike line if
  present (per `plan-loop-1-06-frontend.md:24`,
  `plan-loop-2-04-doc-touch-matrix.md:664-666`).

### Lock tests / TOMLs to update (same commit)
- none (verify `_naming_allowlist.toml`/`_archive_allowlist.toml` —
  scrub if listed; per `plan-loop-1-06-frontend.md:22`).

### Files to create
- `tests/frontend/unit/src/components/control-form/__tests__/controlFormWorkflow.deleted.test.ts`
  (per `plan-loop-1-06-frontend.md:18`).

### Files to delete
- `frontend/src/components/control-form/controlFormWorkflow.ts`.

### Capability contract artifacts to refresh
- none.

---

## Item #5 — FE-deadcode-2 — DELETE `orphanResolutionPresentation.ts` (1-line re-export)

### READMEs / docs to update (same commit)
- `frontend/src/components/governance/README.md` — strike
  `orphanResolutionPresentation` mention (per
  `plan-loop-1-06-frontend.md:48`,
  `plan-loop-2-04-doc-touch-matrix.md:649-654`).

### Lock tests / TOMLs to update (same commit)
- none.

### Files to create
- `tests/frontend/unit/src/components/governance/__tests__/orphanResolutionPresentation.deleted.test.ts`.

### Files to delete
- `frontend/src/components/governance/orphanResolutionPresentation.ts`.

### Capability contract artifacts to refresh
- none.

---

## Item #6 — FE-deadcode-3 — DELETE `notifications/resourcePath.ts` (5-line re-export)

### READMEs / docs to update (same commit)
- `frontend/src/components/notifications/README.md` — drop
  `resourcePath` mention (per `plan-loop-1-06-frontend.md:70`,
  `plan-loop-2-04-doc-touch-matrix.md:656-661`).

### Lock tests / TOMLs to update (same commit)
- none.

### Files to create
- `tests/frontend/unit/src/components/notifications/__tests__/resourcePath.deleted.test.ts`.

### Files to delete
- `frontend/src/components/notifications/resourcePath.ts`.

### Capability contract artifacts to refresh
- none.

---

## Item #7 — C-N1 — DELETE endpoint shim `_get_approval_department_id`

### READMEs / docs to update (same commit)
- none required; optional `backend/app/api/v1/endpoints/approvals/README.md`
  cross-reference (per `plan-loop-1-03-approvals.md:43-46`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/test_architecture_deepening_contracts.py`
  — append `not hasattr(_shared, "_get_approval_department_id")`
  (per `plan-loop-1-03-approvals.md:35`,
  `plan-loop-2-03-lock-conflict-matrix.md:326`).

### Files to create
- none (assertion appended to existing deepening contract test).

### Files to delete
- none (function body deleted from `_shared.py:17-31`).

### Capability contract artifacts to refresh
- none.

---

## Item #8 — B-N2 — Source-validation split / canonical link helpers consolidation

### READMEs / docs to update (same commit)
- `backend/app/services/_issue_workflow/README.md` — add `assignment.py`
  description (per `plan-loop-1-01-issues.md:103`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/test_architecture_deepening_contracts.py:1192-1206`
  — line `:1193` import list shrink to drop `source_validation`
  (per `plan-loop-1-01-issues.md:484`).
- `tests/backend/pytest/test_architecture_deepening_contracts.py`
  — append `test_issue_workflow_owner_validation_lives_in_dedicated_module`
  (per `plan-loop-1-01-issues.md:83`).

### Files to create
- none (new test appended to existing file).

### Files to delete
- `backend/app/services/_issue_workflow/source_validation.py`
  (recommended end-state, per `plan-loop-1-01-issues.md:104`).

### Capability contract artifacts to refresh
- `docs/security/authorization-capability-contract.md:128` — append
  `_issue_workflow/assignment.py` to service_policy enumeration
  (per `plan-loop-1-01-issues.md:100`).
- `docs/security/authorization-capability-contract.json:629` — same
  string mirrored in JSON (per `plan-loop-1-01-issues.md:100`).
- `docs/security/capability-catalog.json` — verify (no edit expected).

---

## Item #9 — S6.5 — DELETE-AND-REDIRECT `can_user_view_approval_resource`

### READMEs / docs to update (same commit)
- none (capability contract already cites `approval_scenario_policy.py`,
  per `plan-loop-1-03-approvals.md:71`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/test_architecture_deepening_contracts.py`
  — append structural assertion `not hasattr(_notification_approval_helpers,
  "can_user_view_approval_resource")`
  (per `plan-loop-1-03-approvals.md:63`).

### Files to create
- none.

### Files to delete
- none (lines `:72-79` of `_notification_approval_helpers.py` deleted).

### Capability contract artifacts to refresh
- none (validator rerun expected to pass; no token change).

---

## Item #10 — S8.5 — Keep `riskhub_questionnaires.py` (live route + FE caller)

### READMEs / docs to update (same commit)
- `backend/app/api/v1/endpoints/README.md` — optional one-line
  clarification that `riskhub_questionnaires.py` is sibling-of-package
  (per `plan-loop-1-07-endpoints.md:53-54`,
  `plan-loop-2-04-doc-touch-matrix.md:588-591`).
- `AGENTS.md:162` — verify keeps reference (no edit needed; per
  `plan-loop-2-04-doc-touch-matrix.md:74-79`).
- `docs/agent/ENDPOINT_INVARIANTS.md:13` — verify keeps reference (no
  edit needed; per `plan-loop-2-04-doc-touch-matrix.md:104-110`).
- `.planning/codebase/CONCERNS.md:9` — KEEPS line (no edit; per
  `plan-loop-2-04-doc-touch-matrix.md:64-65`).
- `.planning/codebase/TESTING.md:70` — KEEPS line (per
  `plan-loop-2-04-doc-touch-matrix.md:792-794`).
- `tests/backend/pytest/api/v1/README.md:25` — KEEPS line (per
  `plan-loop-2-04-doc-touch-matrix.md:751-754`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py`
  — new file-presence assertion + router check (per
  `plan-loop-1-07-endpoints.md:30-36`).

### Files to create
- `tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py`.

### Files to delete
- none.

### Capability contract artifacts to refresh
- none.

---

## Item #11 — S2.7 — Control execution `risk.process` → `risk.name` truth-in-naming fix

### READMEs / docs to update (same commit)
- `.planning/audits/_context/01-backend-services.md` — add a line under
  `_control_execution` recording `linked_risk_names_for_visible_ids`
  returns `risk.name` (per `plan-loop-1-02-risks.md:267-270`).
- `.planning/audits/_context/06-test-surface.md` — add cross-reference
  between `test_executions.py:325` and `test_reports_audit.py:185-186`
  (per `plan-loop-1-02-risks.md:271-275`).

### Lock tests / TOMLs to update (same commit)
- existing lock at `test_architecture_deepening_contracts.py:178`
  unchanged (per `plan-loop-1-02-risks.md:260-264`).

### Files to create
- none.

### Files to delete
- none.

### Capability contract artifacts to refresh
- none.

---

## Item #12 — D-N3 — Narrow blanket-except in `users/summary.py`

### READMEs / docs to update (same commit)
- none.

### Lock tests / TOMLs to update (same commit)
- new optional architecture test
  `tests/backend/pytest/architecture/test_users_summary_narrow_excepts_red.py`
  — must declare `pytestmark = pytest.mark.contract`
  (per `plan-loop-1-07-endpoints.md:90-94, 110-111`).

### Files to create
- `tests/backend/pytest/api/v1/test_users_summary_blanket_except_red.py`
  (per `plan-loop-1-07-endpoints.md:85-89`).
- `tests/backend/pytest/architecture/test_users_summary_narrow_excepts_red.py`
  (optional, per `plan-loop-1-07-endpoints.md:90-94`).

### Files to delete
- none.

### Capability contract artifacts to refresh
- none.

---

## Item #13 — S5.1 / C-N2 — Delete `vendor_link_helpers.py` shim

### READMEs / docs to update (same commit)
- none beyond the two contract files (per
  `plan-loop-1-05-vendor-quarterly.md:33`).
- `backend/app/services/_vendor_links/README.md` — verify; no edit
  needed (per `plan-loop-2-04-doc-touch-matrix.md:396-398`).

### Lock tests / TOMLs to update (same commit)
- new lock `tests/backend/pytest/architecture/test_vendor_link_helpers_shim_removed_red.py`
  (per `plan-loop-1-05-vendor-quarterly.md:23`).

### Files to create
- `tests/backend/pytest/architecture/test_vendor_link_helpers_shim_removed_red.py`.

### Files to delete
- `backend/app/api/v1/endpoints/vendor_link_helpers.py` (107 lines,
  per `plan-loop-1-05-vendor-quarterly.md:14-15`).

### Capability contract artifacts to refresh
- `docs/security/authorization-capability-contract.md:121,122` — remove
  the two MD lines that cite the shim path (per
  `plan-loop-1-05-vendor-quarterly.md:31`).
- `docs/security/authorization-capability-contract.json:55` — remove
  shim path from `sensitive_change_paths`
  (per `plan-loop-1-05-vendor-quarterly.md:28`).
- `docs/security/authorization-capability-contract.json:479` — remove
  same path from AUTHZ-VENDORS-READ.service_policy
  (per `plan-loop-1-05-vendor-quarterly.md:29`).
- `docs/security/authorization-capability-contract.json:502` — remove
  same path from AUTHZ-VENDORS-WRITE.service_policy
  (per `plan-loop-1-05-vendor-quarterly.md:30`).
- re-run `scripts/security/validate_authz_capability_contract.py` (per
  `plan-loop-1-05-vendor-quarterly.md:32`).

---

## Item #14 — S4.4 — Issues outbox-only notification cleanup

### READMEs / docs to update (same commit)
- `backend/app/api/v1/endpoints/issues/_shared/README.md` — keep
  `notifications.py` only if `_get_active_user_with_permissions`
  survives; otherwise strike (per
  `plan-loop-1-01-issues.md:142, 547-549`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/test_architecture_deepening_contracts.py`
  — append `test_issue_notifications_have_no_direct_send_helpers`
  (per `plan-loop-1-01-issues.md:127-131`).

### Files to create
- none (new test appended to existing file).

### Files to delete
- consider `git rm` of `backend/app/api/v1/endpoints/issues/_shared/notifications.py`
  if it becomes empty (per `plan-loop-1-01-issues.md:142`).

### Capability contract artifacts to refresh
- none (helpers not cited).

---

## Item #15 — D-N2 — Add `access_user` capability surface to catalog

### READMEs / docs to update (same commit)
- none.

### Lock tests / TOMLs to update (same commit)
- new
  `tests/backend/pytest/architecture/test_capability_catalog_access_user_surface_red.py`
  (per `plan-loop-1-07-endpoints.md:144-152`).

### Files to create
- `tests/backend/pytest/architecture/test_capability_catalog_access_user_surface_red.py`.

### Files to delete
- none.

### Capability contract artifacts to refresh
- `docs/security/capability-catalog.json` — add `access_user` surface
  with 7 fields citing `backend/app/schemas/access.py:66-72` and
  `frontend/src/types/access.ts:51` (per
  `plan-loop-1-07-endpoints.md:131-152, 157-160`).
- `docs/security/authorization-capability-contract.md:132` — add row in
  capability matrix (per `plan-loop-1-07-endpoints.md:161-163`,
  `plan-loop-2-04-doc-touch-matrix.md:122`).
- run `scripts/security/validate_authz_capability_contract.py` (per
  `plan-loop-1-07-endpoints.md:172-174`).

---

## Item #16 — S8.10 — Remove reports legacy-excel tombstones

### READMEs / docs to update (same commit)
- `docs/security/reports/contract-drift-remediation-2026-02-21.md:25`
  — remove or update `legacy_excel.py` citation (per
  `plan-loop-1-05-vendor-quarterly.md:66`).
- `docs/security/reports/deep-scan-remediation-2026-02-20.md:81` —
  remove or update (per `plan-loop-1-05-vendor-quarterly.md:67`).

### Lock tests / TOMLs to update (same commit)
- new lock `tests/backend/pytest/architecture/test_reports_legacy_excel_tombstones_removed_red.py`
  (per `plan-loop-1-05-vendor-quarterly.md:54`).
- edit `tests/backend/pytest/test_openapi_contract_parity.py:26-29` —
  drop four `/excel` paths (per `plan-loop-1-05-vendor-quarterly.md:62`).
- edit `tests/backend/pytest/test_protocol_contract_probe.py:26,108` —
  remove probe + response excerpt (per
  `plan-loop-1-05-vendor-quarterly.md:63`).
- edit `scripts/security/protocol_contract_probe.py:61,71,81,91` —
  remove four `/excel` probe entries (per
  `plan-loop-1-05-vendor-quarterly.md:64`).

### Files to create
- `tests/backend/pytest/architecture/test_reports_legacy_excel_tombstones_removed_red.py`.

### Files to delete
- `backend/app/api/v1/endpoints/reports/legacy_excel.py` (whole file;
  per `plan-loop-1-05-vendor-quarterly.md:57`).

### Capability contract artifacts to refresh
- none.

---

## Item #17 — S2.1 — Inline `_monitoring_response` endpoint shim

### READMEs / docs to update (same commit)
- none — service module already in capability contract; endpoint shim
  is not in any lock (per `plan-loop-1-05-vendor-quarterly.md:84,109`).

### Lock tests / TOMLs to update (same commit)
- new lock
  `tests/backend/pytest/architecture/test_monitoring_response_endpoint_shim_removed_red.py`
  (per `plan-loop-1-05-vendor-quarterly.md:90`).

### Files to create
- `tests/backend/pytest/architecture/test_monitoring_response_endpoint_shim_removed_red.py`
  (or `test_monitoring_response_shim_removed_red.py` per
  `plan-loop-1-07-endpoints.md:207-213`).

### Files to delete
- `backend/app/api/v1/endpoints/_monitoring_response.py` (25 lines;
  per `plan-loop-1-05-vendor-quarterly.md:92`).

### Capability contract artifacts to refresh
- none.

---

## Item #18 — S6.2 — REPOINT-AND-DELETE `_build_approval_read`

### READMEs / docs to update (same commit)
- none. AUTHZ-APPROVALS row already names the canonical projection
  (per `plan-loop-1-03-approvals.md:99-100`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/test_architecture_deepening_contracts.py`
  — append assertion `not hasattr(_shared, "_build_approval_read")`
  (per `plan-loop-1-03-approvals.md:88`).
- `_endpoint_commit_allowlist.toml` — no changes (per
  `plan-loop-1-03-approvals.md:97`).
- existing positive anchor at `:1029` reinforced (no change; per
  `plan-loop-1-03-approvals.md:90`).

### Files to create
- none.

### Files to delete
- none (lines `:34-61` of `_shared.py` removed but file survives).

### Capability contract artifacts to refresh
- none.

---

## Item #19 — S1.4 — Consolidate risk-type validation onto service policy

### READMEs / docs to update (same commit)
- `.planning/audits/_context/01-backend-services.md` — record under
  `_entity_mutation_lifecycle` that `validate_risk_type` is single owner
  (per `plan-loop-1-02-risks.md:163-165`).
- `.planning/audits/_context/02-backend-endpoints.md` — drop the line
  about `crud/_shared.validate_risk_type`; replace with pointer to
  service-policy owner (per `plan-loop-1-02-risks.md:166-169`).

### Lock tests / TOMLs to update (same commit)
- new lock
  `tests/backend/pytest/architecture/test_validate_risk_type_single_owner_red.py`
  (per `plan-loop-1-02-risks.md:122-135`).

### Files to create
- `tests/backend/pytest/api/v1/test_risks_validation_parity.py`
  (per `plan-loop-1-02-risks.md:113-121`).
- `tests/backend/pytest/architecture/test_validate_risk_type_single_owner_red.py`.

### Files to delete
- `backend/app/api/v1/endpoints/risks/crud/_shared.py` (if empty after
  validator removal; per `plan-loop-1-02-risks.md:137-140`).

### Capability contract artifacts to refresh
- none (validator rerun for sanity per
  `plan-loop-1-02-risks.md:182-183`).

---

## Item #20 — S1.6 — Risk ID generation co-location (DOCUMENT-ONLY w/ stable re-export)

### READMEs / docs to update (same commit)
- `docs/agent/ENDPOINT_INVARIANTS.md:21-22` — bump "Verification date:
  2026-02-16" to landing date (per
  `plan-loop-1-02-risks.md:380-382`,
  `plan-loop-2-04-doc-touch-matrix.md:108-110`).
- `.planning/audits/_context/02-backend-endpoints.md` — record decision
  (per `plan-loop-1-02-risks.md:382-389`).
- `.planning/audits/_context/06-test-surface.md` — add cross-reference
  noting two test files depend on facade (per
  `plan-loop-1-02-risks.md:390-393`).

### Lock tests / TOMLs to update (same commit)
- new lock
  `tests/backend/pytest/architecture/test_risks_required_reexports_red.py`
  (per `plan-loop-1-02-risks.md:317-336`).

### Files to create
- `tests/backend/pytest/architecture/test_risks_required_reexports_red.py`.

### Files to delete
- none.

### Capability contract artifacts to refresh
- none.

---

## Item #21 — S2.6 — Collapse Control-Risk link loader duplicates

### READMEs / docs to update (same commit)
- none.

### Lock tests / TOMLs to update (same commit)
- new lock
  `tests/backend/pytest/architecture/test_control_risk_link_loader_collapsed_red.py`
  (per `plan-loop-1-07-endpoints.md:262-266`).

### Files to create
- `tests/backend/pytest/architecture/test_control_risk_link_loader_collapsed_red.py`.

### Files to delete
- none.

### Capability contract artifacts to refresh
- none.

---

## Item #22 — S2.8 — DELETE `frontend/src/components/ControlForm.tsx` 1-line shim

### READMEs / docs to update (same commit)
- `frontend/src/components/control-form/README.md` — declare
  `ControlFormContainer` as canonical entrypoint (per
  `plan-loop-1-06-frontend.md:100`,
  `plan-loop-2-04-doc-touch-matrix.md:664-666`).
- `.planning/audits/_context/03-frontend-architecture.md` — drop
  `ControlForm.tsx` from shim list (per
  `plan-loop-1-06-frontend.md:101`).

### Lock tests / TOMLs to update (same commit)
- `_naming_allowlist.toml` — leave entry only if sibling shims remain;
  otherwise scrub (per `plan-loop-1-06-frontend.md:97`).
- `_archive_allowlist.toml` — verify; remove if listed (per
  `plan-loop-1-06-frontend.md:98`).

### Files to create
- `tests/frontend/unit/src/components/__tests__/ControlForm.shim.deleted.test.ts`
  (per `plan-loop-1-06-frontend.md:85`).

### Files to delete
- `frontend/src/components/ControlForm.tsx` (1-line shim).

### Capability contract artifacts to refresh
- none.

---

## Item #23 — S2.9 — INLINE `controlFormUtils` helpers into narrow consumers

### READMEs / docs to update (same commit)
- `frontend/src/components/control-form/README.md` — note utils
  inlined (per `plan-loop-1-06-frontend.md:124`,
  `plan-loop-2-04-doc-touch-matrix.md:664-666`).

### Lock tests / TOMLs to update (same commit)
- none.

### Files to create
- `tests/frontend/unit/src/components/control-form/__tests__/controlFormUtils.inline.test.ts`
  (per `plan-loop-1-06-frontend.md:116`).

### Files to delete
- `frontend/src/components/control-form/controlFormUtils.ts` (per
  `plan-loop-1-06-frontend.md:121`).

### Capability contract artifacts to refresh
- none.

---

## Item #24 — S3.4 — Delete-and-repoint `kris/linked_vendors.py` barrel (atomic with #51)

### READMEs / docs to update (same commit)
- none directly; `_kri_history/README.md` is touched by paired #51
  (per `plan-loop-1-04-kris.md:70-72`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`
  — append assertions on barrel non-existence + endpoint importer scrub
  (per `plan-loop-1-04-kris.md:61-63`).
- `tests/backend/pytest/test_architecture_deepening_contracts.py:998-1000`
  — drop dead value_application strings from negative-assertion tuple
  (per `plan-loop-2-03-lock-conflict-matrix.md:228-247`).

### Files to create
- none.

### Files to delete
- `backend/app/api/v1/endpoints/kris/linked_vendors.py` (5 lines, per
  `plan-loop-1-04-kris.md:65`).

### Capability contract artifacts to refresh
- `docs/security/authorization-capability-contract.md:116,117,118` —
  strip `kris/linked_vendors.py` from backend_authority cells (3
  places; per `plan-loop-1-04-kris.md:71`).
- `docs/security/authorization-capability-contract.json:368,388,410`
  — strip the same string from JSON `backend_authority` keys (per
  `plan-loop-1-04-kris.md:72`).
- run `scripts/security/validate_authz_capability_contract.py` (per
  `plan-loop-1-04-kris.md:75`).

---

## Item #25 — S3.7 — Extract KRI department-scope helper

### READMEs / docs to update (same commit)
- none required (per `plan-loop-1-04-kris.md:96`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`
  — assert `get_user_department_ids` appears at most once across
  `due_soon.py, overdue.py, breaches.py` (per
  `plan-loop-1-04-kris.md:91`).

### Files to create
- `tests/backend/pytest/test_kris_department_scope_helper_red.py`
  (per `plan-loop-1-04-kris.md:90`).

### Files to delete
- none.

### Capability contract artifacts to refresh
- none.

---

## Item #26 — S3.9 — Delete `KRIForm.tsx` shim + ESLint pin

### READMEs / docs to update (same commit)
- `frontend/src/components/kri-form/README.md` — remove "public facade"
  prose referencing `KRIForm.tsx` (per `plan-loop-1-04-kris.md:130`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`
  — append `assert not (REPO_ROOT / "frontend/src/components/KRIForm.tsx").exists()`
  (per `plan-loop-1-04-kris.md:114`).
- `frontend/eslint.config.js:145-158` — remove file-targeted
  `files: ["src/components/KRIForm.tsx"]` block (per
  `plan-loop-1-04-kris.md:126`).

### Files to create
- frontend mirror test (or extend backend lock) per
  `plan-loop-1-04-kris.md:114-115`.

### Files to delete
- `frontend/src/components/KRIForm.tsx` (2 lines, per
  `plan-loop-1-04-kris.md:118`).

### Capability contract artifacts to refresh
- none (capability contract `md:117` is not pinned to the shim file).

---

## Item #27 — S4.2 — Issue-loading duplicate deletion

### READMEs / docs to update (same commit)
- `backend/app/api/v1/endpoints/issues/_shared/README.md` — strike
  `loading.py` from contents at `:13` (per
  `plan-loop-1-01-issues.md:181`,
  `plan-loop-2-04-doc-touch-matrix.md:550`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/test_architecture_deepening_contracts.py`
  — append `test_endpoint_issues_loading_is_thin_or_deleted`
  (per `plan-loop-1-01-issues.md:162-165`).

### Files to create
- none (new test appended).

### Files to delete
- `backend/app/api/v1/endpoints/issues/_shared/loading.py` (entire file
  `:1-65`; per `plan-loop-1-01-issues.md:173`).

### Capability contract artifacts to refresh
- none (`_shared/loading.py` not cited).

---

## Item #28 — S4.3 — Issue source-mutation triplicate collapse

### READMEs / docs to update (same commit)
- `backend/app/api/v1/endpoints/issues/_shared/README.md` — strike
  `links.py` from contents at `:12` if file deleted
  (per `plan-loop-1-01-issues.md:218`).
- `backend/app/services/_issue_register/README.md` — add
  `source_mutation.py` description (per
  `plan-loop-1-01-issues.md:218-219`,
  `plan-loop-2-04-doc-touch-matrix.md:486-488`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/test_architecture_deepening_contracts.py`
  — append `test_issue_link_helpers_have_one_canonical_home`
  (per `plan-loop-1-01-issues.md:200-205`).

### Files to create
- none (new test appended).

### Files to delete
- `backend/app/api/v1/endpoints/issues/_shared/links.py` (entire file;
  per `plan-loop-1-01-issues.md:211`).

### Capability contract artifacts to refresh
- `docs/security/authorization-capability-contract.md:128` — drop
  `_shared/links.py` token; ensure `_issue_register/source_mutation.py`
  cited (per `plan-loop-1-01-issues.md:215`).
- `docs/security/authorization-capability-contract.json:629` — same
  edit mirrored (per `plan-loop-1-01-issues.md:215`).
- run validator.

---

## Item #29 — S4.6 — Source-type vocabulary canonicalization (single helper)

### READMEs / docs to update (same commit)
- `backend/app/services/_issue_register/README.md` — append
  `constants.py` description with `source_type_value` coercer (per
  `plan-loop-1-01-issues.md:271`,
  `plan-loop-2-04-doc-touch-matrix.md:486-488`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/test_architecture_deepening_contracts.py`
  — append `test_source_type_value_has_one_canonical_definition`
  (per `plan-loop-1-01-issues.md:239-241`).

### Files to create
- `tests/backend/pytest/services/test_issue_source_type_value.py`
  (per `plan-loop-1-01-issues.md:242`).

### Files to delete
- none (the three local definitions deleted in-place; per
  `plan-loop-1-01-issues.md:262-265`).

### Capability contract artifacts to refresh
- none.

---

## Item #30 — S4.10 — `issues/_shared/__init__.py` underscore re-export pruning

### READMEs / docs to update (same commit)
- `backend/app/api/v1/endpoints/issues/_shared/README.md` — refresh
  contents list (per `plan-loop-1-01-issues.md:333-334`,
  `plan-loop-2-04-doc-touch-matrix.md:553-554`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/test_architecture_deepening_contracts.py`
  — append `test_issue_shared_barrel_has_no_underscored_reexports`
  (per `plan-loop-1-01-issues.md:291-294`).

### Files to create
- none (new test appended).

### Files to delete
- none (file edits only).

### Capability contract artifacts to refresh
- `docs/security/authorization-capability-contract.md:128` — verify
  citations of surviving files post-#27/#28 (per
  `plan-loop-1-01-issues.md:331-332`).
- `docs/security/authorization-capability-contract.json:629` — same.

---

## Item #31 — S5.5 — Extract vendor reporting row formatters

### READMEs / docs to update (same commit)
- `backend/app/services/_vendor_governance/README.md` — add `reports.py`
  to module surface (per `plan-loop-1-05-vendor-quarterly.md:140`,
  `plan-loop-2-04-doc-touch-matrix.md:495-499`).

### Lock tests / TOMLs to update (same commit)
- optional: extend `test_architecture_deepening_contracts.py:1082` lock
  to include `annual_report_rows`/`dora_register_rows` (per
  `plan-loop-1-05-vendor-quarterly.md:140`).

### Files to create
- `tests/backend/pytest/services/test_vendor_governance_reports_red.py`
  (per `plan-loop-1-05-vendor-quarterly.md:130`).
- `tests/backend/pytest/architecture/test_vendor_reports_endpoint_no_row_builders_red.py`
  (per `plan-loop-1-05-vendor-quarterly.md:131`).

### Files to delete
- none (helpers moved, not deleted).

### Capability contract artifacts to refresh
- none (per `plan-loop-1-05-vendor-quarterly.md:137`).

---

## Item #32 — S5.8 — Extract generic vendor linked-entity tab

### READMEs / docs to update (same commit)
- `frontend/src/components/vendors/README.md` — describe new shell +
  config contract (per `plan-loop-1-06-frontend.md:147`,
  `plan-loop-2-04-doc-touch-matrix.md:694-697`).

### Lock tests / TOMLs to update (same commit)
- none.

### Files to create
- `tests/frontend/unit/src/components/vendors/__tests__/useVendorLinkedEntityTab.contract.test.tsx`
  (per `plan-loop-1-06-frontend.md:139`).
- `tests/frontend/unit/src/components/vendors/__tests__/VendorLinkedEntityTab.duplication.test.ts`
  (per `plan-loop-1-06-frontend.md:140`).
- `frontend/src/components/vendors/useVendorLinkedEntityTab.ts` (new
  generic hook).
- `frontend/src/components/vendors/VendorLinkedEntityTab.tsx` (new
  shell component).

### Files to delete
- none (refactor, not deletion).

### Capability contract artifacts to refresh
- none.

---

## Item #33 — S6.4 — Unify frontend approval-queued banners (drop KRI variant)

### READMEs / docs to update (same commit)
- `frontend/src/components/forms/README.md` — note KRI form uses
  canonical component if banner siblings enumerated (per
  `plan-loop-1-03-approvals.md:125-126`,
  `plan-loop-2-04-doc-touch-matrix.md:687-690`).
- `frontend/src/components/kri-form/README.md` — remove
  `KriApprovalQueuedBanner` reference if listed (per
  `plan-loop-1-03-approvals.md:127`,
  `plan-loop-2-04-doc-touch-matrix.md:679-682`).

### Lock tests / TOMLs to update (same commit)
- none backend-side; frontend invariant test home unaffected
  (per `plan-loop-1-03-approvals.md:122-123`).

### Files to create
- `tests/frontend/unit/src/components/kri-form/KRIFormContainer.approval-banner.test.tsx`
  (per `plan-loop-1-03-approvals.md:117`).
- `tests/frontend/unit/src/components/kri-form/no-kri-banner-duplicate.test.ts`
  (per `plan-loop-1-03-approvals.md:118`).

### Files to delete
- `frontend/src/components/kri-form/KriApprovalQueuedBanner.tsx`
  (per `plan-loop-1-03-approvals.md:121`).

### Capability contract artifacts to refresh
- none.

---

## Item #34 — S6.6 — Extract `resolve_approval_privilege_tier` helper

### READMEs / docs to update (same commit)
- `docs/security/authorization-capability-contract.md` AUTHZ-APPROVALS
  row — reference new helper (per `plan-loop-1-03-approvals.md:172`).
- `backend/app/services/_approval_execution/README.md` — cross-reference
  the helper (per `plan-loop-1-03-approvals.md:173`).
- `backend/app/services/_authorization_capabilities/README.md` — verify
  (per `plan-loop-2-04-doc-touch-matrix.md:413-419`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/test_architecture_deepening_contracts.py`
  — append structural `hasattr(approval_scenario_policy,
  "resolve_approval_privilege_tier")` + 16-file string-search lock
  (per `plan-loop-1-03-approvals.md:144`).

### Files to create
- `tests/backend/pytest/test_approval_privilege_tier.py` (per
  `plan-loop-1-03-approvals.md:143`).

### Files to delete
- none.

### Capability contract artifacts to refresh
- `docs/security/authorization-capability-contract.md:119` — append
  §Vocabulary entry "privilege tier" (per
  `plan-loop-1-03-approvals.md:169`,
  `plan-loop-2-04-doc-touch-matrix.md:124, 187-196`).
- `docs/security/authorization-capability-contract.json:629` — refresh
  parallel JSON entry (per `plan-loop-1-03-approvals.md:169-170`).
- run `scripts/security/validate_authz_capability_contract.py`.

---

## Item #35 — S7.3 — Delete `usePermissions` hook

### READMEs / docs to update (same commit)
- `frontend/src/hooks/README.md` — remove `usePermissions` entry (per
  `plan-loop-1-06-frontend.md:191`,
  `plan-loop-2-04-doc-touch-matrix.md:733-741`).
- `.planning/audits/_context/03-frontend-architecture.md` — note hook
  is gone (per `plan-loop-1-06-frontend.md:192`).

### Lock tests / TOMLs to update (same commit)
- `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts` — verify
  no `usePermissions` reference (per
  `plan-loop-1-06-frontend.md:188`).
- `_naming_allowlist.toml` — drop `usePermissions` if listed (per
  `plan-loop-1-06-frontend.md:189`).

### Files to create
- `tests/frontend/unit/src/hooks/__tests__/usePermissions.deleted.test.ts`
  (per `plan-loop-1-06-frontend.md:162`).
- `tests/frontend/unit/src/components/layout/__tests__/Sidebar.usePermissions.replaced.test.tsx`
  (per `plan-loop-1-06-frontend.md:163`).

### Files to delete
- `frontend/src/hooks/usePermissions.ts` (per
  `plan-loop-1-06-frontend.md:165`).

### Capability contract artifacts to refresh
- none.

---

## Item #36 — S7.4 — Refactor `BusinessRouteGuards.tsx` to typed factory

### READMEs / docs to update (same commit)
- `frontend/src/authz/README.md` — describe the factory (per
  `plan-loop-1-06-frontend.md:219`,
  `plan-loop-2-04-doc-touch-matrix.md:743-747`).

### Lock tests / TOMLs to update (same commit)
- none — `useAuthz.invariant.test.ts:46-48` enumerates capability
  tuples, unrelated to top-level boolean accessors (per
  `plan-loop-1-06-frontend.md:217`).

### Files to create
- `tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.factory.test.tsx`
  (per `plan-loop-1-06-frontend.md:207`).

### Files to delete
- none.

### Capability contract artifacts to refresh
- none.

---

## Item #37 — S7.10 — Replace `_can_view_governance` mirror with `build_me_capabilities`

### READMEs / docs to update (same commit)
- `docs/security/authorization-capability-contract.md` — note
  `can_view_governance` has only one source of truth (per
  `plan-loop-1-06-frontend.md:245`).

### Lock tests / TOMLs to update (same commit)
- `_capabilities_all_allowlist.toml` — confirm `can_view_governance` is
  listed; no edits expected (per `plan-loop-1-06-frontend.md:242`).
- `_endpoint_commit_allowlist.toml` — payload unchanged; pin via
  contract test (per `plan-loop-1-06-frontend.md:243`).

### Files to create
- `tests/backend/pytest/api/v1/users/test_summary_can_view_governance.py`
  (per `plan-loop-1-06-frontend.md:234`).

### Files to delete
- none (lines `:45-50` of `summary.py` removed, file survives).

### Capability contract artifacts to refresh
- run `scripts/security/validate_authz_capability_contract.py` (per
  `plan-loop-1-06-frontend.md:246`).

---

## Item #38 — S8.6 — Move 8 inline endpoint Pydantic models to schemas

### READMEs / docs to update (same commit)
- none required (per `plan-loop-1-07-endpoints.md:335`).

### Lock tests / TOMLs to update (same commit)
- new lock
  `tests/backend/pytest/architecture/test_endpoint_inline_pydantic_evicted_red.py`
  (per `plan-loop-1-07-endpoints.md:311-318`).
- existing `test_w9_schema_datetime_ban.py` — verify no datetime
  imports introduced (per `plan-loop-1-07-endpoints.md:303-306`).

### Files to create
- `backend/app/schemas/health.py` (NEW; 3 models from
  `endpoints/health.py:16-35`; per `plan-loop-1-07-endpoints.md:292`).
- `backend/app/schemas/preferences.py` (NEW; 2 models from
  `endpoints/preferences.py:15-40`; per
  `plan-loop-1-07-endpoints.md:293-296`).
- `tests/backend/pytest/architecture/test_endpoint_inline_pydantic_evicted_red.py`.

### Files to delete
- none (inline models removed but endpoint files survive).

### Capability contract artifacts to refresh
- none direct; FE schema mirror may need rename `RiskFilters` →
  `BatchSendRiskFilters` (per `plan-loop-1-07-endpoints.md:332-334`).

---

## Item #39 — S8.7 — Replace `admin/capabilities.py` static stub with real builder

### READMEs / docs to update (same commit)
- `docs/security/authorization-capability-contract.md` — document new
  builder seam (per `plan-loop-1-06-frontend.md:272`).

### Lock tests / TOMLs to update (same commit)
- `_capabilities_all_allowlist.toml` — confirm 4 admin capability keys
  registered; add if missing (per `plan-loop-1-06-frontend.md:268`,
  `plan-loop-2-03-lock-conflict-matrix.md:46-52`).
- `_endpoint_commit_allowlist.toml` — endpoint shape unchanged (per
  `plan-loop-1-06-frontend.md:269`).

### Files to create
- `backend/app/services/_authorization_capabilities/admin.py` (NEW;
  per `plan-loop-1-06-frontend.md:263-264`).
- `tests/backend/pytest/api/v1/admin/test_capabilities_builder.py` (per
  `plan-loop-1-06-frontend.md:260`).

### Files to delete
- none (file `capabilities.py` deleted in #40 after #39).

### Capability contract artifacts to refresh
- `docs/security/authorization-capability-contract.json:719` — pin
  truth table for the four admin capabilities (per
  `plan-loop-1-06-frontend.md:270-271`,
  `plan-loop-2-04-doc-touch-matrix.md:127, 207-212`).
- `docs/security/capability-catalog.json` — pin authoritative truth
  table (per `plan-loop-2-04-doc-touch-matrix.md:226-227`).
- run `scripts/security/validate_authz_capability_contract.py`.

---

## Item #40 — S8.11 — Re-cluster admin sub-routers (telemetry/sessions/directory/data_quality)

### READMEs / docs to update (same commit)
- `backend/app/api/v1/endpoints/admin/README.md:9-19` — regenerate
  Contents listing (per `plan-loop-1-08-crosscut.md:69-70`,
  `plan-loop-2-04-doc-touch-matrix.md:537-541`).
- `.planning/audits/_context/02-backend-endpoints.md:535-566` — refresh
  route table after rename (per `plan-loop-1-08-crosscut.md:71`).
- `AGENTS.md:157` — verify endpoint package list still consistent (per
  `plan-loop-2-04-doc-touch-matrix.md:80-83`).

### Lock tests / TOMLs to update (same commit)
- `_endpoint_commit_allowlist.toml` — verify no entry change needed
  (per `plan-loop-1-08-crosscut.md:64`).
- new lock
  `tests/backend/pytest/architecture/test_w12_admin_subrouter_clustering_red.py`
  + `tests/backend/pytest/test_admin_route_table_snapshot_red.py`
  (per `plan-loop-1-08-crosscut.md:35-45`).

### Files to create
- `backend/app/api/v1/endpoints/admin/telemetry.py` (NEW; per
  `plan-loop-1-08-crosscut.md:48-50`).
- `backend/app/api/v1/endpoints/admin/sessions.py` (NEW; per
  `plan-loop-1-08-crosscut.md:51-53`).
- `backend/app/api/v1/endpoints/admin/data_quality.py` (NEW; per
  `plan-loop-1-08-crosscut.md:55-57`).
- `tests/backend/pytest/architecture/test_w12_admin_subrouter_clustering_red.py`.
- `tests/backend/pytest/test_admin_route_table_snapshot_red.py`.

### Files to delete
- `backend/app/api/v1/endpoints/admin/capabilities.py` (per
  `plan-loop-1-08-crosscut.md:58-59`).
- `backend/app/api/v1/endpoints/admin/console.py` (merged into
  telemetry.py + sessions.py).
- `backend/app/api/v1/endpoints/admin/directory_sync.py` (renamed
  to `directory.py`).
- `backend/app/api/v1/endpoints/admin/structured_logs.py` (merged
  into telemetry.py).
- `backend/app/api/v1/endpoints/admin/orphans.py` +
  `snapshots.py` + `log_config.py` (merged into data_quality.py).

### Capability contract artifacts to refresh
- none direct (admin capabilities pinned by #39).

---

## Item #41 — B-N3 — Delete bidirectional underscore aliases in issue-workflow serialization

### READMEs / docs to update (same commit)
- `backend/app/services/_issue_workflow/README.md` — already lists
  `serialization.py` only by name; no edit (per
  `plan-loop-1-01-issues.md:370`,
  `plan-loop-2-04-doc-touch-matrix.md:476`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/test_architecture_deepening_contracts.py`
  — append `test_issue_workflow_serialization_has_no_self_aliases`
  (per `plan-loop-1-01-issues.md:354`).

### Files to create
- none (test appended to existing file).

### Files to delete
- none (lines `:18` and `:41` of `serialization.py` deleted).

### Capability contract artifacts to refresh
- none.

---

## Item #42 — BE-N2 — `ActorPayloadModel` shared base

### READMEs / docs to update (same commit)
- none (internal Pydantic refactor; per
  `plan-loop-1-08-crosscut.md:128-129`).

### Lock tests / TOMLs to update (same commit)
- none — outbox idempotency lock unaffected (per
  `plan-loop-1-08-crosscut.md:125-127`).

### Files to create
- `tests/backend/pytest/test_outbox_actor_payload_base_red.py` (per
  `plan-loop-1-08-crosscut.md:104-115`).

### Files to delete
- none.

### Capability contract artifacts to refresh
- none.

---

## Item #43 — BE-N4 — Audit adapter-emitter helper (additive)

### READMEs / docs to update (same commit)
- none required (optional `backend/app/core/audit/` README; per
  `plan-loop-1-07-endpoints.md:389-391`).

### Lock tests / TOMLs to update (same commit)
- `_audit_matrix.toml` — no row change (37 rows preserved; per
  `plan-loop-1-07-endpoints.md:387-388`).
- existing `test_w7_audit_adapter_completeness_red.py` — preserved
  (per `plan-loop-2-03-lock-conflict-matrix.md:142-149`).
- new lock
  `tests/backend/pytest/architecture/test_audit_adapter_emitter_helper_red.py`
  (per `plan-loop-1-07-endpoints.md:371-376`).

### Files to create
- `backend/app/core/audit/_emit.py` (NEW; per
  `plan-loop-1-07-endpoints.md:381`).
- `tests/backend/pytest/architecture/test_audit_adapter_emitter_helper_red.py`.

### Files to delete
- none (additive; module-level `def`s preserved).

### Capability contract artifacts to refresh
- none.

---

## Item #44 — BE-N6 — Centralize guarded path-prefix registry

### READMEs / docs to update (same commit)
- `backend/app/api/v1/endpoints/README.md` — add "Endpoint registry"
  subsection referencing the new TOML (per
  `plan-loop-1-07-endpoints.md:441-442`,
  `plan-loop-2-04-doc-touch-matrix.md:592-595`).

### Lock tests / TOMLs to update (same commit)
- new TOML `backend/app/api/v1/_router_registry.toml` (NEW; per
  `plan-loop-1-07-endpoints.md:429-433, 438-439`).
- new lock
  `tests/backend/pytest/architecture/test_router_prefix_registry_red.py`
  (per `plan-loop-1-07-endpoints.md:420-427`).

### Files to create
- `backend/app/api/v1/_router_registry.toml`.
- `tests/backend/pytest/architecture/test_router_prefix_registry_red.py`.

### Files to delete
- none.

### Capability contract artifacts to refresh
- none.

---

## Item #45a — BE-N8a — Ownership prerequisite characterization tests

### READMEs / docs to update (same commit)
- none (per `plan-loop-1-08-crosscut.md:186-187`).

### Lock tests / TOMLs to update (same commit)
- none (per `plan-loop-1-08-crosscut.md:185-186`).

### Files to create
- `tests/backend/pytest/test_ownership_resolver_kri_archived_asymmetry.py`
  (per `plan-loop-1-08-crosscut.md:161-170`).
- `tests/backend/pytest/test_ownership_resolver_control_join.py` (per
  `plan-loop-1-08-crosscut.md:171-176`).
- `tests/backend/pytest/test_visible_ids_via_ownership.py` (per
  `plan-loop-1-08-crosscut.md:177-184`).

### Files to delete
- none (production code untouched).

### Capability contract artifacts to refresh
- none.

---

## Item #45b — BE-N8b — Ownership resolver factory

### READMEs / docs to update (same commit)
- `backend/app/core/_permissions/README.md` — note factory + asymmetry
  comment (per `plan-loop-1-08-crosscut.md:251-252`,
  `plan-loop-2-04-doc-touch-matrix.md:577-583`).

### Lock tests / TOMLs to update (same commit)
- cross-check
  `test_w12_resource_permissions_keys_match_capability_contract_red.py:46-72`
  stays green (per `plan-loop-1-08-crosscut.md:247-249`).

### Files to create
- `tests/backend/pytest/test_ownership_resolver_factory_equivalence_red.py`
  (per `plan-loop-1-08-crosscut.md:224-228`).
- `backend/app/core/_permissions/_ownership_factory.py` (NEW; per
  `plan-loop-1-08-crosscut.md:230-238`).

### Files to delete
- none (8 free functions in `ownership.py` rewritten in-place).

### Capability contract artifacts to refresh
- none direct (`MeCapabilities.resource_permissions` shape preserved).

---

## Item #46 — FE-N1 — Promote resource query-key factories

### READMEs / docs to update (same commit)
- `frontend/src/lib/README.md` — add `queryKeys/` index and stewardship
  rule (per `plan-loop-1-06-frontend.md:295`,
  `plan-loop-2-04-doc-touch-matrix.md:701-706`).

### Lock tests / TOMLs to update (same commit)
- `_naming_allowlist.toml` — register new `queryKeys/` modules (per
  `plan-loop-1-06-frontend.md:293`,
  `plan-loop-2-03-lock-conflict-matrix.md:79-86`).

### Files to create
- `tests/frontend/unit/src/lib/queryKeys/__tests__/queryKeys.invariant.test.ts`
  (per `plan-loop-1-06-frontend.md:287`).
- per-domain `frontend/src/lib/queryKeys/<domain>.ts` modules (per
  `plan-loop-1-06-frontend.md:290`).

### Files to delete
- none (inline literals replaced; original files survive).

### Capability contract artifacts to refresh
- none.

---

## Item #47 — FE-N4 — Extract session-refresh retry policy

### READMEs / docs to update (same commit)
- `frontend/src/services/api/README.md` — note new policy seam,
  explicitly stating session-refresh-specific (per
  `plan-loop-1-06-frontend.md:319`,
  `plan-loop-2-04-doc-touch-matrix.md:708-715`).

### Lock tests / TOMLs to update (same commit)
- none.

### Files to create
- `tests/frontend/unit/src/services/api/__tests__/sessionRefreshPolicy.test.ts`
  (per `plan-loop-1-06-frontend.md:310`).
- `frontend/src/services/api/sessionRefreshPolicy.ts` (NEW; per
  `plan-loop-1-06-frontend.md:313`).

### Files to delete
- none (private method body removed but `ApiClientCore.ts` survives).

### Capability contract artifacts to refresh
- none.

---

## Item #48 — FE-N6 — Merge `getErrorMessageKey.ts` + `errorCodeMap.ts`

### READMEs / docs to update (same commit)
- `frontend/src/i18n/README.md` — note merged module (per
  `plan-loop-1-06-frontend.md:346`,
  `plan-loop-2-04-doc-touch-matrix.md:726-730`).

### Lock tests / TOMLs to update (same commit)
- `_naming_allowlist.toml` — drop two old paths if listed (per
  `plan-loop-1-06-frontend.md:344`).

### Files to create
- `tests/frontend/unit/src/i18n/__tests__/errorKeys.merged.test.ts`
  (per `plan-loop-1-06-frontend.md:334`).
- `frontend/src/i18n/errorKeys.ts` (NEW; per
  `plan-loop-1-06-frontend.md:337`).

### Files to delete
- `frontend/src/i18n/getErrorMessageKey.ts` (per
  `plan-loop-1-06-frontend.md:338`).
- `frontend/src/i18n/errorCodeMap.ts` (per
  `plan-loop-1-06-frontend.md:338`).

### Capability contract artifacts to refresh
- none.

---

## Item #49 — S2.2 — Inline `_control_execution/monitoring.py` wrapper

### READMEs / docs to update (same commit)
- none (per `plan-loop-1-07-endpoints.md:502`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/test_architecture_deepening_contracts.py:188,192`
  — DROP both assertions (per
  `plan-loop-1-07-endpoints.md:478-481`,
  `plan-loop-2-03-lock-conflict-matrix.md:171-179`).
- new lock
  `tests/backend/pytest/architecture/test_control_execution_monitoring_inlined_red.py`
  (per `plan-loop-1-07-endpoints.md:471-476`).

### Files to create
- `tests/backend/pytest/architecture/test_control_execution_monitoring_inlined_red.py`.

### Files to delete
- `backend/app/services/_control_execution/monitoring.py` (per
  `plan-loop-1-07-endpoints.md:485`).

### Capability contract artifacts to refresh
- none.

---

## Item #50 — S3.2 — Delete `_kri_history/submission.py` wrapper

### READMEs / docs to update (same commit)
- `backend/app/services/_kri_history/README.md:21` — remove
  `submission.py` row (per `plan-loop-1-04-kris.md:154`,
  `plan-loop-2-04-doc-touch-matrix.md:425-428`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`
  — append file-non-existence + grep assertions (per
  `plan-loop-1-04-kris.md:147-148`).
- `tests/backend/pytest/test_architecture_deepening_contracts.py:998`
  — drop dead string from negative-assertion tuple (per
  `plan-loop-1-04-kris.md:152-153`).

### Files to create
- none.

### Files to delete
- `backend/app/services/_kri_history/submission.py` (22 lines; per
  `plan-loop-1-04-kris.md:150`).

### Capability contract artifacts to refresh
- `docs/security/authorization-capability-contract.md:117,118,161`
  — strip `submission.py` from service-policy/inventory cells (3
  strings; per `plan-loop-1-04-kris.md:155`).
- `docs/security/authorization-capability-contract.json:389,411` —
  strip `submission.py` from JSON service_policy strings (2 places;
  per `plan-loop-1-04-kris.md:156`).
- run `scripts/security/validate_authz_capability_contract.py`.

---

## Item #51 — S3.3 — Delete `_kri_history/value_application.py` shim (atomic with #24)

### READMEs / docs to update (same commit)
- `backend/app/services/_kri_history/README.md:22` — remove
  `value_application.py` row (per `plan-loop-1-04-kris.md:155`,
  `plan-loop-2-04-doc-touch-matrix.md:430-431`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`
  — append file-non-existence + grep (per
  `plan-loop-1-04-kris.md:175-179`).
- `tests/backend/pytest/test_architecture_deepening_contracts.py:976,979,980`
  — DELETE three lines that read deleted file (per
  `plan-loop-1-04-kris.md:187`).
- `tests/backend/pytest/test_architecture_deepening_contracts.py:999-1000`
  — drop dead value_application strings from negative-assertion tuple
  (per `plan-loop-1-04-kris.md:188`).

### Files to create
- none.

### Files to delete
- `backend/app/services/_kri_history/value_application.py` (8 lines;
  per `plan-loop-1-04-kris.md:181`).

### Capability contract artifacts to refresh
- `docs/security/authorization-capability-contract.md:117,118,161` —
  strip `value_application.py` (3 strings; per
  `plan-loop-1-04-kris.md:190`).
- `docs/security/authorization-capability-contract.json:389,411` —
  strip `value_application.py` from JSON (2 places; per
  `plan-loop-1-04-kris.md:191`).
- run `scripts/security/validate_authz_capability_contract.py`.

---

## Item #52 — S3.5 — Delete `_kri_history/correction_plans.py`

### READMEs / docs to update (same commit)
- `backend/app/services/_kri_history/README.md` — remove
  `correction_plans.py` row from inventory if listed (per
  `plan-loop-1-04-kris.md:218`,
  `plan-loop-2-04-doc-touch-matrix.md:432-433`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`
  — append file-non-existence + grep (per
  `plan-loop-1-04-kris.md:210-211`).
- `tests/backend/pytest/test_architecture_deepening_contracts.py:956`
  — drop `correction_plans` from import tuple (per
  `plan-loop-1-04-kris.md:215`).
- `tests/backend/pytest/test_architecture_deepening_contracts.py:962`
  — drop `assert hasattr(correction_plans, "build_kri_correction_plan")`
  (per `plan-loop-1-04-kris.md:216`).

### Files to create
- none.

### Files to delete
- `backend/app/services/_kri_history/correction_plans.py` (14 lines;
  per `plan-loop-1-04-kris.md:213`).

### Capability contract artifacts to refresh
- none (helper not in capability contract).

---

## Item #53 — S4.1 — Issue workflow service collapse (drop `IssueWorkflowService` facade)

### READMEs / docs to update (same commit)
- `backend/app/services/_issue_workflow/README.md` — drop `service.py`
  from contents; refresh module list (per
  `plan-loop-1-01-issues.md:413-415`,
  `plan-loop-2-04-doc-touch-matrix.md:478`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/test_architecture_deepening_contracts.py`
  — append `test_issue_workflow_execution_imports_lifecycle_directly`
  (per `plan-loop-1-01-issues.md:389-393`).
- `tests/backend/pytest/test_architecture_deepening_contracts.py:1192-1206`
  — `:1193` import line shrink to drop `source_validation` if needed
  (per `plan-loop-1-01-issues.md:411`).
- existing lock at `:1237` continues to pass (per
  `plan-loop-1-01-issues.md:410`).

### Files to create
- none (test appended).

### Files to delete
- `backend/app/services/issue_workflow_service.py` (5-line re-export;
  per `plan-loop-1-01-issues.md:405`).
- `backend/app/services/_issue_workflow/service.py` (`IssueWorkflowService`
  class file; per `plan-loop-1-01-issues.md:406`).

### Capability contract artifacts to refresh
- none.

---

## Item #54 — S6.3 — Inline `_approval_queue/lifecycle.py` aggregator

### READMEs / docs to update (same commit)
- `backend/app/services/_approval_queue/README.md` — drop reference to
  `lifecycle.py` if exists (per `plan-loop-1-03-approvals.md:204-205`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/test_architecture_deepening_contracts.py:1005`
  — rewrite `test_approval_queue_routes_use_queue_lifecycle_module`
  (per `plan-loop-1-03-approvals.md:195`,
  `plan-loop-2-03-lock-conflict-matrix.md:251-257`).
- `tests/backend/pytest/test_architecture_deepening_contracts.py:1025`
  — rewrite `test_approval_queue_lifecycle_uses_service_owned_helpers`
  (per `plan-loop-1-03-approvals.md:196`).
- `tests/backend/pytest/test_architecture_deepening_contracts.py:1041`
  — rewrite `test_approval_queue_lifecycle_delegates_intake_query_projection`
  (per `plan-loop-1-03-approvals.md:197`).

### Files to create
- none (rewrites happen in-place).

### Files to delete
- `backend/app/services/_approval_queue/lifecycle.py` (17 lines, pure
  re-exports; per `plan-loop-1-03-approvals.md:201`).

### Capability contract artifacts to refresh
- none.

---

## Item #55 — S7.5 — Delete `access_user_service.py` facade

### READMEs / docs to update (same commit)
- `backend/app/services/README.md` — drop facade row if listed (per
  `plan-loop-1-08-crosscut.md:319-320`,
  `plan-loop-2-04-doc-touch-matrix.md:524-535`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/test_authz_capability_contract_validator.py:502`
  — drop `access_user_service.py` fixture entry (per
  `plan-loop-1-08-crosscut.md:302-304`).
- `tests/backend/pytest/test_architecture_deepening_contracts.py:243-272`
  — DELETE or REWRITE
  `test_identity_access_routes_use_lifecycle_module`
  (per `plan-loop-1-08-crosscut.md:305-310`,
  `plan-loop-2-03-lock-conflict-matrix.md:191-199`).
- new lock
  `tests/backend/pytest/architecture/test_access_user_service_removed_red.py`
  (per `plan-loop-1-08-crosscut.md:286-290`).

### Files to create
- `tests/backend/pytest/architecture/test_access_user_service_removed_red.py`.

### Files to delete
- `backend/app/services/access_user_service.py` (26 lines; per
  `plan-loop-1-08-crosscut.md:292`).

### Capability contract artifacts to refresh
- `docs/security/authorization-capability-contract.json:106` — drop
  `sensitive_change_paths` entry (per
  `plan-loop-1-08-crosscut.md:311-313`).
- `docs/security/authorization-capability-contract.json:229` — remove
  `access_user_service.py` token (per
  `plan-loop-1-08-crosscut.md:314-315`).
- `docs/security/authorization-capability-contract.md:109` — remove
  same token (per `plan-loop-1-08-crosscut.md:316-317`).
- run `scripts/security/validate_authz_capability_contract.py`.

---

## Item #56 — S7.6 — Delete `directory_identity_service.py` shim (paired with #61)

### READMEs / docs to update (same commit)
- `backend/app/services/README.md` — drop top-level
  `directory_identity_service.py` line (per
  `plan-loop-1-08-crosscut.md:405-407`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/test_authz_capability_contract_validator.py:500`
  — drop `directory_identity_service.py` fixture (per
  `plan-loop-1-08-crosscut.md:389-390`).
- `tests/backend/pytest/test_architecture_deepening_contracts.py:227-238`
  — DELETE or REWRITE
  `test_directory_identity_facade_uses_lifecycle_module`
  (per `plan-loop-1-08-crosscut.md:391-396`,
  `plan-loop-2-03-lock-conflict-matrix.md:181-189`).
- new lock
  `tests/backend/pytest/architecture/test_directory_identity_service_removed_red.py`
  (per `plan-loop-1-08-crosscut.md:353-358`).

### Files to create
- `tests/backend/pytest/architecture/test_directory_identity_service_removed_red.py`.

### Files to delete
- `backend/app/services/directory_identity_service.py` (35 lines; per
  `plan-loop-1-08-crosscut.md:360-361`).

### Capability contract artifacts to refresh
- `docs/security/authorization-capability-contract.json:111` — drop
  `sensitive_change_paths` entry (per
  `plan-loop-1-08-crosscut.md:397-398`).
- `docs/security/authorization-capability-contract.json:229` — remove
  `directory_identity_service.py` token (per
  `plan-loop-1-08-crosscut.md:399-401`).
- `docs/security/authorization-capability-contract.md:109` — remove
  same token (per `plan-loop-1-08-crosscut.md:402-403`).
- run `scripts/security/validate_authz_capability_contract.py`.

---

## Item #57 — S8.1 — Delete `quarterly_comparison_service.py` facade (orchestrator override)

### READMEs / docs to update (same commit)
- `backend/app/services/_quarterly_comparison/README.md:16` — replace
  `"Keep …quarterly_comparison_service.py as the public service entrypoint."`
  with pointer at `dashboard/quarterly.py` consuming
  `_quarterly_comparison.composition` directly (per
  `plan-loop-1-05-vendor-quarterly.md:166-167`,
  `plan-loop-2-04-doc-touch-matrix.md:29-40`).
- `.planning/codebase/CONVENTIONS.md:22` — drop
  `quarterly_comparison_service.py` from blessed-facade list (per
  `plan-loop-1-05-vendor-quarterly.md:168`,
  `plan-loop-2-04-doc-touch-matrix.md:42-46`).
- `.planning/codebase/CONCERNS.md:14` — rewrite line that names facade
  as load-bearing concern (per
  `plan-loop-1-05-vendor-quarterly.md:169`,
  `plan-loop-2-04-doc-touch-matrix.md:58-62`).
- `.planning/codebase/STRUCTURE.md:25` — verify `_quarterly_comparison`
  helper-package entry; no edit if already aligned (per
  `plan-loop-1-05-vendor-quarterly.md:170-171`,
  `plan-loop-2-04-doc-touch-matrix.md:766-770`).
- `.planning/codebase/ARCHITECTURE.md:42` — confirm no edit (per
  `plan-loop-1-05-vendor-quarterly.md:171`,
  `plan-loop-2-04-doc-touch-matrix.md:782-787`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/test_architecture_deepening_contracts.py:559-569`
  — REWRITE
  `test_quarterly_comparison_service_is_composition_facade` →
  `test_quarterly_comparison_dashboard_imports_composition_directly`
  (per `plan-loop-1-05-vendor-quarterly.md:158-161`,
  `plan-loop-2-03-lock-conflict-matrix.md:201-209`).
- new lock
  `tests/backend/pytest/architecture/test_quarterly_comparison_facade_removed_red.py`
  (per `plan-loop-1-05-vendor-quarterly.md:160`).

### Files to create
- `tests/backend/pytest/architecture/test_quarterly_comparison_facade_removed_red.py`.

### Files to delete
- `backend/app/services/quarterly_comparison_service.py` (20 lines;
  per `plan-loop-1-05-vendor-quarterly.md:163`).

### Capability contract artifacts to refresh
- none (no capability-contract token; per
  `plan-loop-2-04-doc-touch-matrix.md:131`).

---

## Item #58 — S8.3 — Delete `OrphanedItemService` facade + static-method class

### READMEs / docs to update (same commit)
- none — Domain 8 map shows no README cites
  `orphaned_item_service.py` (per
  `plan-loop-1-07-endpoints.md:573-574`).

### Lock tests / TOMLs to update (same commit)
- new lock
  `tests/backend/pytest/architecture/test_orphaned_item_facade_removed_red.py`
  (per `plan-loop-1-07-endpoints.md:535-541`).

### Files to create
- `tests/backend/pytest/architecture/test_orphaned_item_facade_removed_red.py`.

### Files to delete
- `backend/app/services/orphaned_item_service.py` (7-line facade; per
  `plan-loop-1-07-endpoints.md:570-571`).
- `backend/app/services/_orphaned_items/service.py` (static-method
  class; per `plan-loop-1-07-endpoints.md:566-569`).

### Capability contract artifacts to refresh
- none.

---

## Item #59 — S2.10 — Consolidate `_monitoring_*` packages (docs+lock)

### READMEs / docs to update (same commit)
- `backend/app/services/_monitoring_response/README.md` — declare
  projection-layer responsibility (NEW; per
  `plan-loop-1-07-endpoints.md:615-617`,
  `plan-loop-2-04-doc-touch-matrix.md:508-515`).
- `backend/app/services/_monitoring_status/README.md:5-7` — sharpen
  "state queries" framing (per
  `plan-loop-1-07-endpoints.md:619-621`,
  `plan-loop-2-04-doc-touch-matrix.md:517-522`).
- may cascade into `docs/DOCUMENTATION_TREE.md` if monitoring layer
  added to 3-hop reachability tree (per
  `plan-loop-1-07-endpoints.md:626-628`).

### Lock tests / TOMLs to update (same commit)
- new lock
  `tests/backend/pytest/architecture/test_monitoring_packages_separated_red.py`
  (per `plan-loop-1-07-endpoints.md:606-613`).

### Files to create
- `backend/app/services/_monitoring_response/README.md` (NEW; per
  `plan-loop-1-07-endpoints.md:615-616`).
- `tests/backend/pytest/architecture/test_monitoring_packages_separated_red.py`.

### Files to delete
- none (pure documentation lock + invariant; per
  `plan-loop-1-07-endpoints.md:624`).

### Capability contract artifacts to refresh
- none.

---

## Item #60 — PrivilegeContext — Introduce `Depends(get_privilege_context)`

### READMEs / docs to update (same commit)
- `docs/security/authorization-capability-contract.md` — AUTHZ-APPROVALS
  row cites `get_privilege_context` (per
  `plan-loop-1-03-approvals.md:237`).
- `backend/app/api/README.md` — note new `Depends` (per
  `plan-loop-1-03-approvals.md:238`).
- `backend/app/services/_authorization_capabilities/README.md` —
  verify still accurate (per `plan-loop-2-04-doc-touch-matrix.md:413-418`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/test_architecture_deepening_contracts.py`
  — append `hasattr(app.api.deps, "get_privilege_context")` and
  `PrivilegeContext` (per `plan-loop-1-03-approvals.md:223`).
- `_endpoint_commit_allowlist.toml` — no ratchet (per
  `plan-loop-1-03-approvals.md:234`).
- `_capabilities_all_allowlist.toml` — no change (per
  `plan-loop-1-03-approvals.md:235`).

### Files to create
- `tests/backend/pytest/test_privilege_context.py` (per
  `plan-loop-1-03-approvals.md:222`).

### Files to delete
- none (additive `PrivilegeContext` dataclass and `Depends`).

### Capability contract artifacts to refresh
- `docs/security/authorization-capability-contract.md:131` — append
  §Privilege context section (per
  `plan-loop-1-03-approvals.md:233`,
  `plan-loop-2-04-doc-touch-matrix.md:133`).
- `docs/security/authorization-capability-contract.json:629,692` —
  refresh parallel JSON (per
  `plan-loop-2-04-doc-touch-matrix.md:147`).
- run `scripts/security/validate_authz_capability_contract.py`.

---

## Item #61 — S7.7 — Move `graph_directory_*` modules into `_graph_directory/` (paired with #56)

### READMEs / docs to update (same commit)
- `backend/app/services/README.md:23` — drop top-level
  `graph_directory_service.py` line; add `_graph_directory/` (per
  `plan-loop-1-08-crosscut.md:509-511`,
  `plan-loop-2-04-doc-touch-matrix.md:529-531`).
- `backend/app/services/_graph_directory/README.md` (NEW) — adapter
  overview citing ADR-007 amendment + ADR-003 (per
  `plan-loop-1-08-crosscut.md:510-513`,
  `plan-loop-2-04-doc-touch-matrix.md:457-465`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/test_authz_capability_contract_validator.py:504`
  — path rewrite `graph_directory_service.py` →
  `_graph_directory/service.py` (per
  `plan-loop-1-08-crosscut.md:499-501`).
- new lock
  `tests/backend/pytest/architecture/test_graph_directory_package_move_red.py`
  (per `plan-loop-1-08-crosscut.md:445-454`).

### Files to create
- `backend/app/services/_graph_directory/__init__.py` (NEW barrel; per
  `plan-loop-1-08-crosscut.md:462`).
- `backend/app/services/_graph_directory/service.py` (NEW; per
  `plan-loop-1-08-crosscut.md:463`).
- `backend/app/services/_graph_directory/auth.py` (NEW; per
  `plan-loop-1-08-crosscut.md:464`).
- `backend/app/services/_graph_directory/transport.py` (NEW; per
  `plan-loop-1-08-crosscut.md:465`).
- `backend/app/services/_graph_directory/errors.py` (NEW; per
  `plan-loop-1-08-crosscut.md:466-467`).
- `backend/app/services/_graph_directory/README.md` (NEW; per
  `plan-loop-1-08-crosscut.md:468-469`).
- `tests/backend/pytest/architecture/test_graph_directory_package_move_red.py`.

### Files to delete
- `backend/app/services/graph_directory_service.py` (per
  `plan-loop-1-08-crosscut.md:470`).
- `backend/app/services/graph_directory_auth.py` (per
  `plan-loop-1-08-crosscut.md:470`).
- `backend/app/services/graph_directory_transport.py` (per
  `plan-loop-1-08-crosscut.md:470`).
- `backend/app/services/graph_directory_errors.py` (per
  `plan-loop-1-08-crosscut.md:470`).

### Capability contract artifacts to refresh
- `docs/security/authorization-capability-contract.md:109` — token
  rewrite `graph_directory_service.py` →
  `_graph_directory/service.py` (per
  `plan-loop-1-08-crosscut.md:502-503`).
- `docs/security/authorization-capability-contract.json:113` —
  `sensitive_change_paths` path rewrite (per
  `plan-loop-1-08-crosscut.md:504-505`).
- `docs/security/authorization-capability-contract.json:229` —
  service_policy blob path rewrite (per
  `plan-loop-1-08-crosscut.md:506-507`).
- run `scripts/security/validate_authz_capability_contract.py`.

---

## Item #62 — S5.9 — Relocate `kri_vendor_assignment.py` + per-row audit events

### READMEs / docs to update (same commit)
- `backend/app/services/_vendor_links/README.md` — extend coverage to
  include KRI assignment; add `kri_assignment.py` to contents (per
  `plan-loop-1-04-kris.md:261, 274`,
  `plan-loop-2-04-doc-touch-matrix.md:402-410`).
- `.planning/codebase/STRUCTURE.md` — update enumerated module path
  if listed (per `plan-loop-2-04-doc-touch-matrix.md:773-775`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py:16`
  — change `VENDOR_SERVICE_FILES` entry to new path
  `_vendor_links/kri_assignment.py` (per
  `plan-loop-1-04-kris.md:274`,
  `plan-loop-2-03-lock-conflict-matrix.md:355-359`).
- `_audit_matrix.toml` — verify rows already exist for
  `vendor_link_created`/`vendor_link_deleted` (per
  `plan-loop-2-03-lock-conflict-matrix.md:144-145`).

### Files to create
- `tests/backend/pytest/test_kri_vendor_assignment_audit_red.py` (NEW
  behavioural test, per `plan-loop-1-04-kris.md:251-257`).
- `backend/app/services/_vendor_links/kri_assignment.py` (RELOCATED
  from `kri_vendor_assignment.py`; per
  `plan-loop-1-04-kris.md:261`).

### Files to delete
- `backend/app/services/kri_vendor_assignment.py` (relocated; per
  `plan-loop-1-04-kris.md:261`).

### Capability contract artifacts to refresh
- `docs/security/authorization-capability-contract.md:172` — update
  perimeter-pass note path to new location (per
  `plan-loop-1-04-kris.md:277`,
  `plan-loop-2-04-doc-touch-matrix.md:135`).
- `docs/security/authorization-capability-contract.json` — verify any
  string mentions the old path (per
  `plan-loop-1-04-kris.md:278`).
- run `scripts/security/validate_authz_capability_contract.py`.

---

## Item #63 — BE-N7 — Instrument outbox dispatch with `SchedulerJobRun`

### READMEs / docs to update (same commit)
- `backend/app/services/outbox/README.md` — append note that dispatch
  records `SchedulerJobRun` rows when batch non-empty (per
  `plan-loop-1-07-endpoints.md:699-701`,
  `plan-loop-2-04-doc-touch-matrix.md:501-506`).
- `docs/adr/ADR-002-service-owned-transactions.md:44` — refresh
  reference if line numbers shift (per
  `plan-loop-1-07-endpoints.md:701-703`,
  `plan-loop-2-04-doc-touch-matrix.md:353-361`).

### Lock tests / TOMLs to update (same commit)
- new test must declare `pytestmark = pytest.mark.contract` (per
  `plan-loop-1-07-endpoints.md:695-697`).

### Files to create
- `tests/backend/pytest/test_outbox_dispatch_scheduler_job_run_red.py`
  (per `plan-loop-1-07-endpoints.md:671-677`).

### Files to delete
- none (additive instrumentation).

### Capability contract artifacts to refresh
- none.

---

## Item #64 — FE-N2 — Extract QueryClient defaults from `App.tsx`

### READMEs / docs to update (same commit)
- `frontend/src/services/api/README.md` — note singleton (per
  `plan-loop-1-06-frontend.md:368`,
  `plan-loop-2-04-doc-touch-matrix.md:708-715`).

### Lock tests / TOMLs to update (same commit)
- none.

### Files to create
- `tests/frontend/unit/src/services/api/__tests__/queryClient.defaults.test.ts`
  (per `plan-loop-1-06-frontend.md:361`).
- `frontend/src/services/api/queryClient.ts` (NEW; per
  `plan-loop-1-06-frontend.md:363-364`).

### Files to delete
- none (App.tsx edited in place).

### Capability contract artifacts to refresh
- none.

---

## Item #65 — FE-N3 — Extract `crudCapabilitySchema` shared Zod base

### READMEs / docs to update (same commit)
- `frontend/src/services/api/schemas/README.md` — describe shared base
  + issues exception (per `plan-loop-1-06-frontend.md:396`,
  `plan-loop-2-04-doc-touch-matrix.md:719-723`).

### Lock tests / TOMLs to update (same commit)
- `_capabilities_all_allowlist.toml` — confirm catalog/test alignment
  (per `plan-loop-1-06-frontend.md:394`).

### Files to create
- `tests/frontend/unit/src/services/api/schemas/__tests__/crudCapabilitySchema.snapshot.test.ts`
  (per `plan-loop-1-06-frontend.md:383-384`).
- `frontend/src/services/api/schemas/crudCapabilitySchema.ts` (NEW;
  per `plan-loop-1-06-frontend.md:386`).

### Files to delete
- none.

### Capability contract artifacts to refresh
- `docs/security/capability-catalog.json` — pin per-entity capability
  counts (per `plan-loop-1-06-frontend.md:393`,
  `plan-loop-2-04-doc-touch-matrix.md:228-229`).

---

## Item #66 — FE-N5 — Split `AuthContext.tsx` into independent providers

### READMEs / docs to update (same commit)
- `frontend/src/contexts/README.md:9-12` — describe 3-provider split
  + memoisation invariant (per `plan-loop-1-06-frontend.md:423-424`,
  `plan-loop-2-04-doc-touch-matrix.md:611-616`).
- `frontend/src/contexts/auth/README.md:5,20` — rewrite "composition
  glue" framing (per `plan-loop-2-04-doc-touch-matrix.md:619-624`).
- `.planning/codebase/CONVENTIONS.md:43` — update if AuthContext
  composes new SessionProvider/AuthActionsProvider (per
  `plan-loop-2-04-doc-touch-matrix.md:48-50`).
- `.planning/audits/_context/03-frontend-architecture.md` — refresh
  diagram (per `plan-loop-1-06-frontend.md:425`).

### Lock tests / TOMLs to update (same commit)
- `_naming_allowlist.toml` — register new contexts (per
  `plan-loop-1-06-frontend.md:421`).
- `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts` — verify
  on landing (per `plan-loop-1-06-frontend.md:422`).

### Files to create
- `tests/frontend/unit/src/contexts/__tests__/SessionProvider.split.test.tsx`
  (per `plan-loop-1-06-frontend.md:411`).
- `tests/frontend/unit/src/contexts/__tests__/AuthActions.split.test.tsx`
  (per `plan-loop-1-06-frontend.md:412`).
- `frontend/src/contexts/SessionContext.tsx` (NEW; per
  `plan-loop-1-06-frontend.md:415`).
- `frontend/src/contexts/PreferencesContext.tsx` (NEW; per
  `plan-loop-1-06-frontend.md:416`).
- `frontend/src/contexts/AuthActionsContext.tsx` (NEW; per
  `plan-loop-1-06-frontend.md:417`).

### Files to delete
- none (`AuthContext.tsx` rewritten as facade).

### Capability contract artifacts to refresh
- `docs/security/authorization-capability-contract.md:131` — path
  rewrite if AuthContext namespace shifts (per
  `plan-loop-2-04-doc-touch-matrix.md:137`).

---

## Item #67 — FE-N7 — Extract generic `useResourcePanelQuery`

### READMEs / docs to update (same commit)
- `frontend/src/hooks/README.md` — describe generic hook (per
  `plan-loop-1-06-frontend.md:447`,
  `plan-loop-2-04-doc-touch-matrix.md:733-741`).

### Lock tests / TOMLs to update (same commit)
- none (no public surface change).

### Files to create
- `tests/frontend/unit/src/hooks/__tests__/useResourcePanelQuery.contract.test.tsx`
  (per `plan-loop-1-06-frontend.md:440`).
- `frontend/src/hooks/useResourcePanelQuery.ts` (NEW; per
  `plan-loop-1-06-frontend.md:443`).

### Files to delete
- none.

### Capability contract artifacts to refresh
- none.

---

## Item #68 — FE-N8 — Introduce `WidgetShell` + scoped query selector

### READMEs / docs to update (same commit)
- `frontend/src/components/dashboard/README.md:9-30` — rewrite
  contents listing; document `WidgetShell` (per
  `plan-loop-1-06-frontend.md:471`,
  `plan-loop-2-04-doc-touch-matrix.md:640-646`).

### Lock tests / TOMLs to update (same commit)
- none.

### Files to create
- `tests/frontend/unit/src/components/dashboard/__tests__/WidgetShell.contract.test.tsx`
  (per `plan-loop-1-06-frontend.md:462`).
- `tests/frontend/unit/src/contexts/__tests__/DashboardFilterContext.scopedSelector.test.tsx`
  (per `plan-loop-1-06-frontend.md:463`).
- `frontend/src/components/dashboard/WidgetShell.tsx` (NEW; per
  `plan-loop-1-06-frontend.md:465`).

### Files to delete
- none.

### Capability contract artifacts to refresh
- none.

---

## Item #69 — S5.2 — Introduce `AbstractVendorLink` mixin (Phase 1; bundled with #70)

### READMEs / docs to update (same commit)
- `backend/app/models/README.md` — add `AbstractVendorLink` to mixin
  inventory; cross-link to `_archivable.py` (per
  `plan-loop-1-05-vendor-quarterly.md:204-205`,
  `plan-loop-2-04-doc-touch-matrix.md:445-449`).
- `backend/app/services/_vendor_links/README.md` — note the three
  concrete tables share `AbstractVendorLink`; rewrite (per
  `plan-loop-1-05-vendor-quarterly.md:206-207`,
  `plan-loop-2-04-doc-touch-matrix.md:404-407`).
- `docs/adr/ADR-010-postgres-migration-rehearsal-contract.md` — append
  new migration revision to forward-only ledger (per
  `plan-loop-1-05-vendor-quarterly.md:207`,
  `plan-loop-2-04-doc-touch-matrix.md:344-350`).
- `docs/adr/ADR-005-archivable-mixin-schema-contract.md` — note vendor-
  link tables not archivable; mixin independent of archive (per
  `plan-loop-1-05-vendor-quarterly.md:208`,
  `plan-loop-2-04-doc-touch-matrix.md:333-340`).

### Lock tests / TOMLs to update (same commit)
- `_archive_allowlist.toml` — no entry needed (per
  `plan-loop-1-05-vendor-quarterly.md:202`).
- `_naming_allowlist.toml` — only if mixin name flagged (per
  `plan-loop-1-05-vendor-quarterly.md:203`).

### Files to create
- `backend/app/models/_vendor_link_mixin.py` (NEW; per
  `plan-loop-1-05-vendor-quarterly.md:196`).
- `backend/alembic/versions/<rev>_unify_vendor_link_cascade_and_drop_vendor_status.py`
  (NEW; per `plan-loop-1-05-vendor-quarterly.md:200-201`).
- `tests/backend/pytest/architecture/test_vendor_link_mixin_red.py`
  (per `plan-loop-1-05-vendor-quarterly.md:193`).
- `tests/backend/pytest/migrations/test_vendor_link_cascade_postgres_red.py`
  (per `plan-loop-1-05-vendor-quarterly.md:194`).

### Files to delete
- none.

### Capability contract artifacts to refresh
- `docs/security/authorization-capability-contract.md:121,122` —
  verify `_vendor_links/` references survive (per
  `plan-loop-2-04-doc-touch-matrix.md:138`).
- `docs/security/authorization-capability-contract.json:479,502` —
  same backend authority paths verified (per
  `plan-loop-2-04-doc-touch-matrix.md:151-160`).

---

## Item #70 — S5.7 — Drop `Vendor.status` enum (bundled with #69)

### READMEs / docs to update (same commit)
- `docs/README.md:111-112` — remove `Vendor.status` mention (per
  `plan-loop-1-05-vendor-quarterly.md:259`,
  `plan-loop-2-04-doc-touch-matrix.md:240-244`).
- `docs/DOCUMENTATION_TREE.md:84` — same (per
  `plan-loop-1-05-vendor-quarterly.md:260`,
  `plan-loop-2-04-doc-touch-matrix.md:255-258`).
- `docs/adr/ADR-005-archivable-mixin-schema-contract.md:13-19` —
  rewrite: archive state is `is_archived` only (per
  `plan-loop-1-05-vendor-quarterly.md:261`,
  `plan-loop-2-04-doc-touch-matrix.md:336-340`).
- `docs/adr/ADR-010-postgres-migration-rehearsal-contract.md:23-30`
  — append revision (per
  `plan-loop-1-05-vendor-quarterly.md:262`).
- `docs/BUSINESS_LOGIC.md:619` — remove `Vendor.status` reference (per
  `plan-loop-1-05-vendor-quarterly.md:263`,
  `plan-loop-2-04-doc-touch-matrix.md:268-275`).
- `backend/app/models/README.md` — verify no enum-by-enum entry (per
  `plan-loop-2-04-doc-touch-matrix.md:447-453`).

### Lock tests / TOMLs to update (same commit)
- `_archive_allowlist.toml` — review any entry citing
  `Vendor.status` legacy archive coercion (per
  `plan-loop-1-05-vendor-quarterly.md:252`).
- `tests/backend/pytest/test_e2e_seed_archive_state_red.py:13,21,44,53`
  — already negative-asserts (no edit; per
  `plan-loop-1-05-vendor-quarterly.md:253`).
- `tests/backend/pytest/architecture/test_w8b_archivable_encapsulation_red.py:39,57`
  — already negative-asserts (no edit; per
  `plan-loop-1-05-vendor-quarterly.md:254`).
- `tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py:7,37`
  — rewrite/delete `VendorStatusEnum` import + fixture (per
  `plan-loop-1-05-vendor-quarterly.md:255`).
- `tests/backend/pytest/test_dashboard.py:960,970,980` — drop
  `VendorStatus.active.value` from fixtures (per
  `plan-loop-1-05-vendor-quarterly.md:256`).
- `tests/backend/pytest/test_vendors.py:436` — DELETE assertion
  `assert vendor.status == "active"` (per
  `plan-loop-1-05-vendor-quarterly.md:257`).

### Files to create
- `tests/backend/pytest/architecture/test_vendor_status_drop_red.py`
  (per `plan-loop-1-05-vendor-quarterly.md:233`).
- `tests/backend/pytest/migrations/test_vendor_status_column_dropped_postgres_red.py`
  (per `plan-loop-1-05-vendor-quarterly.md:234`).

### Files to delete
- none directly (column drop via Alembic; enum classes removed in
  models/schemas).

### Capability contract artifacts to refresh
- `docs/security/authorization-capability-contract.md:121,122` —
  verify (no token change; per
  `plan-loop-2-04-doc-touch-matrix.md:139`).

---

## Item #71 — S7.8 — Merge `services/session/` 8 files → 4

### READMEs / docs to update (same commit)
- `frontend/src/services/session/README.md:1-13` — re-describe 4-file
  shape; call out module-scope cooldown invariant (per
  `plan-loop-1-06-frontend.md:498-499`,
  `plan-loop-2-04-doc-touch-matrix.md:631-638`).
- `frontend/src/contexts/auth/README.md:21-23` — update path
  references (per `plan-loop-2-04-doc-touch-matrix.md:621-625`).
- `.planning/codebase/CONCERNS.md:40` — verify line "keep
  bootstrapSessionCache.ts as compatibility layer" still accurate (per
  `plan-loop-2-04-doc-touch-matrix.md:66-68`).

### Lock tests / TOMLs to update (same commit)
- `_naming_allowlist.toml` — drop 5 deleted modules; register
  `sessionStorage` + `coordinator` (per
  `plan-loop-1-06-frontend.md:497`).

### Files to create
- `tests/frontend/unit/src/services/session/__tests__/sessionStorage.merged.test.ts`
  (per `plan-loop-1-06-frontend.md:486`).
- `tests/frontend/unit/src/services/session/__tests__/coordinator.merged.test.ts`
  (per `plan-loop-1-06-frontend.md:487`).
- `tests/frontend/unit/src/services/session/__tests__/coordinator.singleFlight.test.ts`
  (per `plan-loop-1-06-frontend.md:488`).
- `frontend/src/services/session/sessionStorage.ts` (NEW; per
  `plan-loop-1-06-frontend.md:491`).
- `frontend/src/services/session/coordinator.ts` (NEW; per
  `plan-loop-1-06-frontend.md:492`).

### Files to delete
- `frontend/src/services/session/bootstrap.ts` (per
  `plan-loop-1-06-frontend.md:493`).
- `frontend/src/services/session/manager.ts`.
- `frontend/src/services/session/sso.ts`.
- `frontend/src/services/session/refreshHint.ts`.
- `frontend/src/services/session/logoutSuppression.ts`.

### Capability contract artifacts to refresh
- `docs/security/authorization-capability-contract.md:131` — path
  rewrite if session module path shifts (per
  `plan-loop-2-04-doc-touch-matrix.md:140`).

---

## Item #72 — S7.9 — Author ADR-011 (Auth Scheme and Session Model)

### READMEs / docs to update (same commit)
- `docs/adr/README.md` — add ADR-011 row (per
  `plan-loop-1-08-crosscut.md:583`,
  `plan-loop-2-04-doc-touch-matrix.md:309-322`).
- `AGENTS.md:218-231` — add ADR-011 row (per
  `plan-loop-1-08-crosscut.md:584-585`,
  `plan-loop-2-04-doc-touch-matrix.md:91-93`).
- `CLAUDE.md` — consider adding ADR-011 to cross-check note (per
  `plan-loop-1-08-crosscut.md:586-587`).
- `docs/README.md:104-112` — Migration Rehearsal section may add
  ADR-011 reference (per `plan-loop-2-04-doc-touch-matrix.md:246-247`).
- `docs/DOCUMENTATION_TREE.md:86-89` — add ADR-011 anchor (per
  `plan-loop-2-04-doc-touch-matrix.md:258-260`).

### Lock tests / TOMLs to update (same commit)
- `_endpoint_commit_allowlist.toml` — verified pinned at 8 auth-flow
  entries with `expires_at = 2026-09-01` (no edit; per
  `plan-loop-1-08-crosscut.md:546-548`,
  `plan-loop-2-03-lock-conflict-matrix.md:27-31`).
- new lock
  `tests/backend/pytest/architecture/test_adr_011_present_red.py`
  (per `plan-loop-1-08-crosscut.md:560-566`).

### Files to create
- `docs/adr/ADR-011-auth-scheme-and-session-model.md` (NEW; per
  `plan-loop-1-08-crosscut.md:568-574`,
  `plan-loop-2-04-doc-touch-matrix.md:371-377`).
- `tests/backend/pytest/architecture/test_adr_011_present_red.py`.

### Files to delete
- none.

### Capability contract artifacts to refresh
- none direct (ADR is policy text; per
  `plan-loop-1-08-crosscut.md:576-580`).

---

## Item #73 — ADR-012 — KRI time-series period algebra

### READMEs / docs to update (same commit)
- `docs/adr/README.md` — add ADR-012 row (per
  `plan-loop-1-04-kris.md:337`,
  `plan-loop-2-04-doc-touch-matrix.md:309-322`).
- `docs/security/authorization-capability-contract.md` — no edit
  required (per `plan-loop-1-04-kris.md:338`).
- `backend/app/services/_kri_history/README.md` — add "see ADR-012"
  link (per `plan-loop-1-04-kris.md:339`,
  `plan-loop-2-04-doc-touch-matrix.md:434-435`).
- `docs/DOCUMENTATION_TREE.md:86-89` — add ADR-012 anchor (per
  `plan-loop-2-04-doc-touch-matrix.md:260-261`).

### Lock tests / TOMLs to update (same commit)
- new TOML
  `tests/backend/pytest/architecture/_kri_state_vocabulary_allowlist.toml`
  (NEW; per `plan-loop-1-04-kris.md:322`).
- new lock
  `tests/backend/pytest/architecture/test_kri_period_algebra_ssot_red.py`
  (per `plan-loop-1-04-kris.md:306-311`).
- `_reserved_modules.toml` — reference-only; no edit (per
  `plan-loop-2-03-lock-conflict-matrix.md:160-161`).

### Files to create
- `docs/adr/ADR-012-kri-time-series-period-algebra.md` (NEW; per
  `plan-loop-1-04-kris.md:315`,
  `plan-loop-2-04-doc-touch-matrix.md:380-385`).
- `tests/backend/pytest/architecture/_kri_state_vocabulary_allowlist.toml`
  (NEW TOML).
- `tests/backend/pytest/architecture/test_kri_period_algebra_ssot_red.py`.
- `tests/backend/pytest/test_kri_deadline_classify_red.py` (per
  `plan-loop-1-04-kris.md:312`).

### Files to delete
- none directly (`ConfigDefaults.REPORTING_GRACE_DAYS` line removed
  from `_config/lookup.py:26` in-place).

### Capability contract artifacts to refresh
- none.

---

## Item #74a — ADR-007 (a) — 31-package census (CENSUS phase)

### READMEs / docs to update (same commit)
- none — census output goes into TOMLs (per
  `plan-loop-1-08-crosscut.md:765`).

### Lock tests / TOMLs to update (same commit)
- new TOML
  `tests/backend/pytest/architecture/_bounded_context_write_side.toml`
  (NEW; per `plan-loop-1-08-crosscut.md:646-649`).
- new TOML
  `tests/backend/pytest/architecture/_bounded_context_read_shape.toml`
  (NEW; per `plan-loop-1-08-crosscut.md:650-654`).
- new TOML
  `tests/backend/pytest/architecture/_bounded_context_workflow_pairs.toml`
  (NEW; per `plan-loop-1-08-crosscut.md:655-663`).
- new TOML
  `tests/backend/pytest/architecture/_bounded_context_adapters.toml`
  (NEW; per `plan-loop-1-08-crosscut.md:664-667`).
- new TOML (proposed 5th)
  `tests/backend/pytest/architecture/_bounded_context_policy.toml`
  (NEW; per `plan-loop-1-08-crosscut.md:668-674`).
- new lock
  `tests/backend/pytest/architecture/test_bounded_context_classification_complete_red.py`
  (per `plan-loop-1-08-crosscut.md:629-637`).
- extend
  `tests/backend/pytest/architecture/test_w7_audit_adapter_completeness_red.py`
  or NEW `test_w7_bounded_context_disjointness.py` to enforce
  exactly-one-TOML membership (per
  `plan-loop-1-08-crosscut.md:691-694`).

### Files to create
- 4-5 new TOMLs listed above.
- `tests/backend/pytest/architecture/test_bounded_context_classification_complete_red.py`.
- optional `test_w7_bounded_context_disjointness.py`.

### Files to delete
- none.

### Capability contract artifacts to refresh
- none.

---

## Item #74b — ADR-007 (b) — Amendment text (after census)

### READMEs / docs to update (same commit)
- `docs/adr/ADR-007-bounded-context-taxonomy.md` — append amendment
  section (per `plan-loop-1-08-crosscut.md:683-688`,
  `plan-loop-2-04-doc-touch-matrix.md:325-329`).
- `docs/adr/README.md` — note amendment cross-reference (per
  `plan-loop-1-08-crosscut.md:695-696`).
- `AGENTS.md:218-231` — keep ADR list aligned with 4-TOML
  classification (per `plan-loop-1-08-crosscut.md:697`,
  `plan-loop-2-04-doc-touch-matrix.md:94-96`).
- `docs/DOCUMENTATION_TREE.md:86-89` — verify after ADR-007 amendment
  lands (per `plan-loop-2-04-doc-touch-matrix.md:262-263`).
- `CONTEXT.md` — cross-reference if it enumerates contexts (per
  `plan-loop-1-08-crosscut.md:699`).

### Lock tests / TOMLs to update (same commit)
- new lock
  `tests/backend/pytest/architecture/test_adr_007_amendment_present_red.py`
  (per `plan-loop-1-08-crosscut.md:638-643`).

### Files to create
- `tests/backend/pytest/architecture/test_adr_007_amendment_present_red.py`.

### Files to delete
- none.

### Capability contract artifacts to refresh
- none.

---

## Item #75 — Bonus — Delete-and-consolidate `_auto_reject_kri_approval`

### READMEs / docs to update (same commit)
- none (internal helper); optional
  `backend/app/services/_approval_execution/README.md` if module
  symbols enumerated (per `plan-loop-1-03-approvals.md:264-265`).

### Lock tests / TOMLs to update (same commit)
- `tests/backend/pytest/test_architecture_deepening_contracts.py`
  — append structural assertion `hasattr(_approval_execution.results,
  "auto_reject_kri_approval")` (per
  `plan-loop-1-03-approvals.md:256`).

### Files to create
- none (test appended to existing file).

### Files to delete
- none (lines `:23-24` of `kri_history_correction.py` and
  `kri_value_submission.py` deleted; per
  `plan-loop-1-03-approvals.md:259-261`).

### Capability contract artifacts to refresh
- none.

---

# Project-level cross-reference

This section synthesizes the per-item entries into doc×items and
lock×items inverse indices. Citations come from
`plan-loop-2-04-doc-touch-matrix.md` (doc-touch §N) and
`plan-loop-2-03-lock-conflict-matrix.md` (lock-conflict §X).

## Doc × items

### Top-level docs

- **`AGENTS.md`** — touched by #10 (verify §1, line 75-79), #38 (verify),
  #40 (verify §1, line 80-83), #44 (verify), #45b (verify §1, line
  84-87), #57 (implicit), #66 (verify §1, line 88-90), #72 (add-line
  §1, line 92), #74b (add-line §1, line 94-95). **9 items reference;
  2 add lines.**
- **`CLAUDE.md`** — touched by #72 (consider cross-link addition).
- **`CONTEXT.md`** — touched by #74b (cross-reference).
- **`docs/README.md`** — touched by #70 (remove-line §2, line 240-244),
  #72 (add-line §2, line 246-247).
- **`docs/DOCUMENTATION_TREE.md`** — touched by #70 (verify §2, line
  255-256), #72 (add-anchor §2, line 258-260), #73 (add-anchor §2,
  line 260-261), #74b (verify §2, line 262-263).
- **`docs/BUSINESS_LOGIC.md`** — touched by #70 (remove-line §2, line
  268-275).
- **`docs/TESTING.md`** — touched by #10 (KEEP, no edit; §2, line
  277-282).
- **`docs/AUTHZ_LIST_POLICY.md`** — touched by #34 (verify), #60
  (verify) (§2, line 285-292).
- **`docs/GLOSSARY.md`** — touched by #34 (potential vocabulary), #60
  (potential vocabulary) (§2, line 295-301).

### ADR docs

- **`docs/adr/README.md`** — touched by #72 (add-row), #73 (add-row),
  #74b (add-line) (§3, line 308-322).
- **`docs/adr/ADR-001-*`** — touched by #45b (cross-check; per
  `plan-loop-1-08-crosscut.md:213-215`).
- **`docs/adr/ADR-002-service-owned-transactions.md`** — touched by
  #63 (verify §3, line 353-361).
- **`docs/adr/ADR-003-domain-exception-taxonomy.md`** — touched by #19
  (cross-link in commit body §3, line 363-369).
- **`docs/adr/ADR-005-archivable-mixin-schema-contract.md`** — touched
  by #69 (append-line §3, line 333-340), #70 (rewrite-section §3, line
  336-340).
- **`docs/adr/ADR-007-bounded-context-taxonomy.md`** — touched by #74a
  (verify), #74b (append-amendment §3, line 324-330).
- **`docs/adr/ADR-010-postgres-migration-rehearsal-contract.md`** —
  touched by #69 (append-revision), #70 (append-revision §3, line
  344-350).
- **`docs/adr/ADR-011-auth-scheme-and-session-model.md`** — created by
  #72 (NEW; §3, line 371-377).
- **`docs/adr/ADR-012-kri-time-series-period-algebra.md`** — created
  by #73 (NEW; §3, line 379-385).

### Capability contract & catalog

- **`docs/security/authorization-capability-contract.md`** — touched by
  #8 (line 128 add-token), #13 (lines 121, 122 remove-token), #15
  (line 132 add-row), #24 (lines 116, 117, 118 remove-token), #28
  (line 128 retoken), #34 (line 119 rewrite-section), #37 (note source
  of truth), #39 (line 132 rewrite-row), #50 (lines 117, 118, 161
  remove-token), #51 (lines 117, 118, 161 remove-token), #55 (line
  109 remove-token), #56 (line 109 remove-token), #60 (line 131
  rewrite-section), #61 (line 109 path-rewrite), #62 (line 172
  perimeter-pass note), #66 (line 131 path-rewrite), #71 (line 131
  path-rewrite). **17 items touch; 11 actively edit; 6 verify.** (§1,
  line 116-148; §1, line 142-148.)
- **`docs/security/authorization-capability-contract.json`** — touched
  by same 17 items at lines 55, 106, 111, 113, 229, 368, 388, 389,
  410, 411, 479, 502, 629, 692, 719 (parallel to .md). (§1, line
  142-148.)
- **`docs/security/capability-catalog.json`** — touched by #15
  (add-surface), #39 (pin-truth-table), #65 (pin-counts) (§1, line
  222-233).

### Backend service READMEs

- **`backend/app/services/README.md`** — touched by #55 (remove-row),
  #56 (remove-row), #61 (rewrite-row) (§4, line 524-535).
- **`backend/app/services/_quarterly_comparison/README.md`** — touched
  by #57 (rewrite-section §1, line 29-40).
- **`backend/app/services/_vendor_links/README.md`** — touched by #13
  (verify), #62 (extend), #69 (rewrite) (§4, line 394-410).
- **`backend/app/services/_authorization_capabilities/README.md`** —
  touched by #34 (verify), #60 (verify) (§4, line 412-420).
- **`backend/app/services/_kri_history/README.md`** — touched by #50
  (remove-line), #51 (remove-line), #52 (verify-line), #73
  (append-line) (§4, line 422-443).
- **`backend/app/models/README.md`** — touched by #69 (add-line), #70
  (verify) (§4, line 445-455).
- **`backend/app/services/_graph_directory/README.md`** — created by
  #61 (NEW; §4, line 457-465).
- **`backend/app/services/_issue_workflow/README.md`** — touched by #2
  (verify), #8 (add-line), #14 (verify), #41 (verify), #53
  (refresh-list) (§4, line 467-481).
- **`backend/app/services/_issue_register/README.md`** — touched by
  #28 (add-line), #29 (append-line) (§4, line 483-492).
- **`backend/app/services/_vendor_governance/README.md`** — touched by
  #31 (add-line) (§4, line 494-499).
- **`backend/app/services/outbox/README.md`** — touched by #63
  (append-note) (§4, line 501-506).
- **`backend/app/services/_monitoring_response/README.md`** — created
  by #59 (NEW; §4, line 508-515).
- **`backend/app/services/_monitoring_status/README.md`** — touched by
  #59 (sharpen-line) (§4, line 517-522).
- **`backend/app/services/_approval_execution/README.md`** — touched by
  #34, #75 (optional cross-reference per
  `plan-loop-1-03-approvals.md:172-173, 264-265`).
- **`backend/app/services/_approval_queue/README.md`** — touched by #54
  (drop reference to lifecycle.py per
  `plan-loop-1-03-approvals.md:204-205`).
- **`backend/app/api/v1/endpoints/admin/README.md`** — touched by #40
  (rewrite-contents §4, line 537-543).
- **`backend/app/api/v1/endpoints/issues/_shared/README.md`** — touched
  by #14 (verify), #27 (remove-line), #28 (remove-line), #30
  (refresh-list) (§4, line 545-559).
- **`backend/app/api/v1/endpoints/risk_questionnaires/README.md`** —
  touched by #10 (verify only; §4, line 561-567).
- **`backend/app/api/v1/endpoints/riskhub/README.md`** — touched by #10
  (verify only; §4, line 569-574).
- **`backend/app/core/_permissions/README.md`** — touched by #45b
  (verify-line §4, line 576-583).
- **`backend/app/api/v1/endpoints/README.md`** — touched by #10
  (optional-clarify), #44 (add-subsection) (§4, line 587-597).
- **`backend/app/api/README.md`** — touched by #60 (per
  `plan-loop-1-03-approvals.md:238`).

### Frontend READMEs

- **`frontend/src/contexts/README.md`** — touched by #66
  (update-listing §5, line 611-616).
- **`frontend/src/contexts/auth/README.md`** — touched by #66
  (rewrite-line), #71 (update-paths) (§5, line 619-629).
- **`frontend/src/services/session/README.md`** — touched by #71
  (rewrite-section §5, line 631-638).
- **`frontend/src/components/dashboard/README.md`** — touched by #68
  (rewrite-contents §5, line 640-646).
- **`frontend/src/components/governance/README.md`** — touched by #5
  (strike-line §5, line 648-654).
- **`frontend/src/components/notifications/README.md`** — touched by
  #6 (strike-line §5, line 656-661).
- **`frontend/src/components/control-form/README.md`** — touched by #4
  (strike-line), #22 (declare-canonical), #23 (note-inlined) (§5, line
  663-673).
- **`frontend/src/components/kri-form/README.md`** — touched by #26
  (remove-prose), #33 (verify) (§5, line 675-684).
- **`frontend/src/components/forms/README.md`** — touched by #33
  (note-canonical §5, line 686-692).
- **`frontend/src/components/vendors/README.md`** — touched by #32
  (describe-shell §5, line 694-699).
- **`frontend/src/lib/README.md`** — touched by #46 (add-index §5,
  line 701-706).
- **`frontend/src/services/api/README.md`** — touched by #47
  (note-policy), #64 (note-singleton) (§5, line 708-717).
- **`frontend/src/services/api/schemas/README.md`** — touched by #65
  (describe-base §5, line 719-723).
- **`frontend/src/i18n/README.md`** — touched by #48 (note-merge §5,
  line 726-730).
- **`frontend/src/hooks/README.md`** — touched by #35 (remove-entry),
  #67 (describe-hook) (§5, line 733-741).
- **`frontend/src/authz/README.md`** — touched by #36 (describe-factory
  §5, line 743-748).

### Test READMEs

- **`tests/backend/pytest/api/v1/README.md`** — touched by #10 (KEEP
  only; §5, line 750-756).

### Planning-tree code-binding docs

- **`.planning/codebase/CONVENTIONS.md`** — touched by #57 (line 22
  remove-line §1, line 42-56), #66 (line 43 update-line §1, line
  48-50).
- **`.planning/codebase/CONCERNS.md`** — touched by #57 (line 14
  rewrite-line §1, line 58-71), #66 (verify line 9), #71 (verify line
  40).
- **`.planning/codebase/STRUCTURE.md`** — touched by #57 (line 25
  verify), #62 (verify path), #74a (verify) (§6, line 765-779).
- **`.planning/codebase/ARCHITECTURE.md`** — touched by #57 (verify;
  §6, line 781-788).
- **`.planning/codebase/TESTING.md`** — touched by #10 (KEEP only; §6,
  line 790-796).

### Planning audits context docs

- **`.planning/audits/_context/01-backend-services.md`** — touched by
  #11 (add-line), #19 (add-line) (§6, line 798-808).
- **`.planning/audits/_context/02-backend-endpoints.md`** — touched by
  #1 (add-note), #19 (replace-line), #20 (record-decision), #40
  (refresh-table) (§6, line 810-824).
- **`.planning/audits/_context/03-frontend-architecture.md`** — touched
  by #22 (remove-shim), #35 (note-removal), #66 (refresh-diagram) (§6,
  line 826-835).
- **`.planning/audits/_context/06-test-surface.md`** — touched by #11
  (add-cross-ref), #20 (add-cross-ref) (§6, line 837-847).

### Reports/security docs

- **`docs/security/reports/contract-drift-remediation-2026-02-21.md`**
  — touched by #16 (per
  `plan-loop-1-05-vendor-quarterly.md:66`).
- **`docs/security/reports/deep-scan-remediation-2026-02-20.md`** —
  touched by #16 (per `plan-loop-1-05-vendor-quarterly.md:67`).
- **`docs/agent/ENDPOINT_INVARIANTS.md`** — touched by #10 (KEEP), #20
  (date-bump line 21-22), #38 (KEEP) (§1, line 104-114).

## Lock × items

### TOML registries

- **`tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml`**
  — touched by #18 (verify-no-change), #40 (verify-no-change), #72
  (reference-only) (lock-conflict §1).
- **`tests/backend/pytest/architecture/_capabilities_all_allowlist.toml`**
  — touched by #37 (verify-only), #39 (add-entry potential), #65
  (verify-only) (lock-conflict §2).
- **`tests/backend/pytest/architecture/_archive_allowlist.toml`** —
  touched by #69 (verify-only), #70 (review/no-op), #4–#6 (scrub if
  listed) (lock-conflict §3).
- **`tests/backend/pytest/architecture/_naming_allowlist.toml`** —
  touched by #46 (add-candidate, FE), #66 (add-candidate, FE), #71
  (add-candidate, FE), #48 (remove-candidate, FE), #22, #35, #4-#6
  (scrub if listed). **MISIDENTIFIED for FE per Loop 2** (lock-conflict
  §4).
- **`tests/backend/pytest/architecture/_riskhub_config_service_commit_allowlist.toml`**
  — no Loop 1 item touches (lock-conflict §5).
- **`tests/backend/pytest/architecture/_vendor_governance_service_commit_allowlist.toml`**
  — touched by #62, #69, #70 (verify-no-add) (lock-conflict §6).
- **`tests/backend/pytest/_get_db_override_whitelist.toml`** — verified
  not implicated by any item (lock-conflict §7).
- **`backend/app/core/audit/_audit_matrix.toml`** — touched by #43
  (additive helper, no row change), #62 (verify rows exist) (lock-
  conflict §8).
- **`backend/app/api/v1/endpoints/_reserved_modules.toml`** — touched
  by #73 (reference-only) (lock-conflict §9).

### Architecture-test files

- **`tests/backend/pytest/test_architecture_deepening_contracts.py`** —
  touched by **15+ items** at distinct line ranges:
  - `:178` — #11 (existing lock unchanged).
  - `:188, 192` — #49 (DROP both).
  - `:227-238` — #56 (DELETE/REWRITE).
  - `:243-272` (`:246-257`) — #55 (DELETE/REWRITE).
  - `:559-569` — #57 (REWRITE).
  - `:956, 962` — #52 (drop tuple entry + hasattr).
  - `:976, 979, 980` — #51 (DELETE three lines).
  - `:997-1002` — #50 + #51 (drop dead strings).
  - `:1005, 1025, 1041` — #54 (REWRITE three tests).
  - `:1029` — #18 (positive anchor unchanged).
  - `:1192-1206` (`:1193`) — #8 (import shrink), #53 (further shrink).
  - `:1237` — #53 (lock unchanged).
  - `:1331-1340` — #3 (no edit; symbol not listed).
  - **NEW assertions appended** by: #2, #7, #8, #9, #14, #18, #27,
    #28, #29, #30, #34, #41, #53, #60, #75 (lock-conflict §10).
- **`tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py:16`**
  — touched by #62 (rename-line) (lock-conflict §11).
- **`tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`**
  — touched by **7 items** appending file-non-existence assertions:
  #3, #24, #25, #26, #50, #51, #52 (lock-conflict §12).
- **`tests/backend/pytest/architecture/test_w11b_test_infra_polish_red.py`**
  — no row change (set unchanged); referenced by #50, #52 (lock-
  conflict §13).
- **`tests/backend/pytest/test_authz_capability_contract_validator.py`**
  — touched by #55 (line 502 fixture remove), #56 (line 500 fixture
  remove), #61 (line 504 path rewrite).

### New TOMLs to create

- `tests/backend/pytest/architecture/_kri_state_vocabulary_allowlist.toml`
  (#73).
- `backend/app/api/v1/_router_registry.toml` (#44).
- `tests/backend/pytest/architecture/_bounded_context_write_side.toml`
  (#74a).
- `tests/backend/pytest/architecture/_bounded_context_read_shape.toml`
  (#74a).
- `tests/backend/pytest/architecture/_bounded_context_workflow_pairs.toml`
  (#74a).
- `tests/backend/pytest/architecture/_bounded_context_adapters.toml`
  (#74a).
- `tests/backend/pytest/architecture/_bounded_context_policy.toml`
  (#74a, optional 5th).

**Total NEW TOMLs**: 7.

### New deepening test files (architecture/)

(per `plan-loop-2-03-lock-conflict-matrix.md:402-457`)

- #1: `test_risks_crud_public_surface_red.py`.
- #19: `test_validate_risk_type_single_owner_red.py`.
- #20: `test_risks_required_reexports_red.py`.
- #2: `test_issue_workflow_no_underscored_self_aliases_red.py`
  (or appended).
- #25: `test_kris_department_scope_helper_red.py`.
- #62: `test_kri_vendor_assignment_audit_red.py`.
- #73: `test_kri_period_algebra_ssot_red.py`,
  `test_kri_deadline_classify_red.py`.
- #13: `test_vendor_link_helpers_shim_removed_red.py`.
- #16: `test_reports_legacy_excel_tombstones_removed_red.py`.
- #17: `test_monitoring_response_endpoint_shim_removed_red.py`.
- #31: `test_vendor_governance_reports_red.py`,
  `test_vendor_reports_endpoint_no_row_builders_red.py`.
- #57: `test_quarterly_comparison_facade_removed_red.py`.
- #69: `test_vendor_link_mixin_red.py`,
  `test_vendor_link_cascade_postgres_red.py`.
- #70: `test_vendor_status_drop_red.py`,
  `test_vendor_status_column_dropped_postgres_red.py`.
- FE deletion guards: #4, #5, #6, #22, #23, #32, #35, #36, #46, #47,
  #48, #64, #65, #66, #67, #68, #71 (~22 frontend test files).
- #37, #39 (backend prereqs for #66): two test files.
- #10: `test_riskhub_questionnaires_module_present_red.py`.
- #12: `test_users_summary_blanket_except_red.py` + optional
  `test_users_summary_narrow_excepts_red.py`.
- #15: `test_capability_catalog_access_user_surface_red.py`.
- #21: `test_control_risk_link_loader_collapsed_red.py`.
- #38: `test_endpoint_inline_pydantic_evicted_red.py`.
- #43: `test_audit_adapter_emitter_helper_red.py`.
- #44: `test_router_prefix_registry_red.py`.
- #49: `test_control_execution_monitoring_inlined_red.py`.
- #58: `test_orphaned_item_facade_removed_red.py`.
- #59: `test_monitoring_packages_separated_red.py`.
- #63: `test_outbox_dispatch_scheduler_job_run_red.py`.
- #40: `test_w12_admin_subrouter_clustering_red.py`,
  `test_admin_route_table_snapshot_red.py`.
- #42: `test_outbox_actor_payload_base_red.py`.
- #45a: `test_ownership_resolver_kri_archived_asymmetry.py`,
  `test_ownership_resolver_control_join.py`,
  `test_visible_ids_via_ownership.py`.
- #45b: `test_ownership_resolver_factory_equivalence_red.py`.
- #55: `test_access_user_service_removed_red.py`.
- #56: `test_directory_identity_service_removed_red.py`.
- #61: `test_graph_directory_package_move_red.py`.
- #72: `test_adr_011_present_red.py`.
- #74a: `test_bounded_context_classification_complete_red.py` +
  optional `test_w7_bounded_context_disjointness.py`.
- #74b: `test_adr_007_amendment_present_red.py`.

**Total NEW backend lock-tier files**: ~63 test files plus the new
TOMLs.

---

## Reject-anchor focus (orchestrator override)

Per the orchestrator override, the three Reject-anchor docs MUST land
in the same commit as their associated code change:

1. **`backend/app/services/_quarterly_comparison/README.md:16`** —
   atomic with #57 (per `plan-loop-1-05-vendor-quarterly.md:166-167`).
2. **`.planning/codebase/CONVENTIONS.md:22`** — atomic with #57 (per
   `plan-loop-1-05-vendor-quarterly.md:168`).
3. **`.planning/codebase/CONCERNS.md:14`** — atomic with #57 (per
   `plan-loop-1-05-vendor-quarterly.md:169`).

In the same commit as #57, the lock at
`tests/backend/pytest/test_architecture_deepening_contracts.py:559-569`
must be rewritten and the new
`tests/backend/pytest/architecture/test_quarterly_comparison_facade_removed_red.py`
must be added.

---

## Files-to-create master list

(Beyond doc updates and lock-tier files; only NEW production source
files or NEW TOML registries.)

### Backend production source

- `backend/app/services/_authorization_capabilities/admin.py` (#39).
- `backend/app/api/v1/endpoints/admin/telemetry.py` (#40).
- `backend/app/api/v1/endpoints/admin/sessions.py` (#40).
- `backend/app/api/v1/endpoints/admin/data_quality.py` (#40).
- `backend/app/services/outbox/payloads.py` extension
  `ActorPayloadModel` (#42 — additive within existing file).
- `backend/app/core/_permissions/_ownership_factory.py` (#45b).
- `backend/app/core/audit/_emit.py` (#43).
- `backend/app/services/_graph_directory/__init__.py` (#61).
- `backend/app/services/_graph_directory/service.py` (#61).
- `backend/app/services/_graph_directory/auth.py` (#61).
- `backend/app/services/_graph_directory/transport.py` (#61).
- `backend/app/services/_graph_directory/errors.py` (#61).
- `backend/app/services/_vendor_links/kri_assignment.py` (#62 —
  relocated).
- `backend/app/models/_vendor_link_mixin.py` (#69).
- `backend/app/schemas/health.py` (#38).
- `backend/app/schemas/preferences.py` (#38).

### Frontend production source

- `frontend/src/lib/queryKeys/<domain>.ts` modules (#46).
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

### Migrations

- `backend/alembic/versions/<rev>_unify_vendor_link_cascade_and_drop_vendor_status.py`
  (#69+#70 bundled).

### Documentation

- `docs/adr/ADR-011-auth-scheme-and-session-model.md` (#72).
- `docs/adr/ADR-012-kri-time-series-period-algebra.md` (#73).
- `backend/app/services/_graph_directory/README.md` (#61).
- `backend/app/services/_monitoring_response/README.md` (#59).

### TOMLs

- 7 new TOMLs listed above (`_kri_state_vocabulary_allowlist.toml`,
  `_router_registry.toml`, 4-5 bounded-context TOMLs).

---

## Files-to-delete master list

(Only files removed in entirety.)

### Backend

- `backend/app/api/v1/endpoints/vendor_link_helpers.py` (#13).
- `backend/app/services/access_user_service.py` (#55).
- `backend/app/services/directory_identity_service.py` (#56).
- `backend/app/services/quarterly_comparison_service.py` (#57).
- `backend/app/services/orphaned_item_service.py` (#58).
- `backend/app/services/_orphaned_items/service.py` (#58).
- `backend/app/services/issue_workflow_service.py` (#53).
- `backend/app/services/_issue_workflow/service.py` (#53).
- `backend/app/services/_issue_workflow/source_validation.py` (#8 —
  recommended end-state).
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
- `backend/app/api/v1/endpoints/admin/directory_sync.py` (#40 —
  renamed).
- `backend/app/api/v1/endpoints/admin/structured_logs.py` (#40 —
  merged).
- `backend/app/api/v1/endpoints/admin/orphans.py` (#40 — merged).
- `backend/app/api/v1/endpoints/admin/snapshots.py` (#40 — merged).
- `backend/app/api/v1/endpoints/admin/log_config.py` (#40 — merged).
- `backend/app/api/v1/endpoints/risks/crud/_shared.py` (#19 — if
  empty).
- `backend/app/services/graph_directory_service.py` (#61).
- `backend/app/services/graph_directory_auth.py` (#61).
- `backend/app/services/graph_directory_transport.py` (#61).
- `backend/app/services/graph_directory_errors.py` (#61).

### Frontend

- `frontend/src/components/kri-form/kriFormWorkflow.ts` (#3).
- `frontend/src/components/control-form/controlFormWorkflow.ts` (#4).
- `frontend/src/components/governance/orphanResolutionPresentation.ts`
  (#5).
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

**Total backend file deletes**: ~32.
**Total frontend file deletes**: ~16.
**Total file deletes**: ~48.

---

End of register.
