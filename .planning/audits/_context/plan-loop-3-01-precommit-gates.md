# Phase 3 Loop 3 — Pre-commit Gate Runbook (77 items)

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Anchor commit: `1ee872a4`.

This runbook produces a per-item, exact pre-commit verification sequence for
each of the 77 work units in `plan-loop-2-08-master-sequence.md`. Each gate
runs locally between RED test authoring and `git commit`. CI is a backstop;
the **gate** is the developer's local pass.

## Standard 7-step gate sequence (per validator-schedule)

1. **RED test confirmation** — `pytest <new test path> -q` confirms FAIL
   before any production edit (write test, see RED).
2. **Implement the change** — code + lock + doc edits land in the worktree.
3. **GREEN test confirmation** — re-run the same `pytest` command; it must
   PASS.
4. **Domain test suite** — run the broader pytest/vitest folder for the
   touched domain to detect regressions.
5. **Architecture locks** — `make -f scripts/Makefile test-architecture-locks`
   (the canonical invariant-lock runner; covers TOMLs, `_red.py`, and
   deepening contracts).
6. **Capability contract validator** (only when item touches authz surface)
   — `python3 scripts/security/validate_authz_capability_contract.py` MUST
   exit 0.
7. **Lint + type** (delta-only) — `ruff check <touched paths>`,
   `mypy <touched paths>`, and for FE items `cd frontend && npx tsc --noEmit`.

For the migration bundle (#69 + #70), the gate is the **9-step migration
sequence** drawn from `plan-loop-2-06-migration-window.md:577-633`.

For ADR items (#72, #73, #74b), the gate is just
`validator + architecture-locks + 3-hop reachability check via
scripts/tools/docs_tree_audit.py` (see `make docs-tree-audit`).

For doc-only Reject items (#10, #57), Step 1 is a structural
"module-must-exist" red test; Step 7 reduces to a doc-tree audit.

---

## Per-item gate table — grouped by domain

Legend (column compaction):
- `RED test`/`GREEN test` = the pytest path + `-k` filter to run.
- `Files` = production files touched in Step 2 (newest source-of-truth).
- `Domain` = the broader pytest/vitest folder for Step 4.
- `Locks` = the architecture-lock runner (always
  `make -f scripts/Makefile test-architecture-locks`); we surface only
  *additional* locks beyond that runner.
- `Validator?` = "yes" if Step 6 must run; otherwise "no" (smoke optional).
- `PG-lane?` = "yes" if `pytest -m postgres` must also run.
- `Mypy/ruff scope` = the file-list constraint to keep blast radius small.
- `Time` = expected total per gate run (minutes), excluding lint baselines.

---

## Domain: Crosscut (#40, #42, #45a, #45b, #55, #56, #61, #72, #74a, #74b)

### Item #1 (Master Seq 1) — #72 — Author ADR-011 (Auth Scheme and Session Model)

- Step 1 RED command: `pytest tests/backend/pytest/architecture/test_adr_011_auth_session_present_red.py -q`
  (new file; asserts `(REPO_ROOT / "docs/adr/ADR-011-auth-scheme-and-session-model.md").exists()`)
- Step 2 implementation files:
  - `docs/adr/ADR-011-auth-scheme-and-session-model.md` (NEW)
  - `docs/adr/README.md` (index addition)
  - `docs/DOCUMENTATION_TREE.md` (entry)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest/architecture/ -q -k "adr"`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks` — expect GREEN.
- Step 6 contract validator: yes (defence-in-depth; expected zero findings).
  Command: `python3 scripts/security/validate_authz_capability_contract.py`.
- Step 7 lint/type: `make docs-tree-audit` (3-hop reachability for new ADR);
  no ruff/mypy scope.
- Postgres lane gate: no.
- Mypy/ruff scope: none (doc-only).
- Total est. time per gate run: **6 min**.

### Item #61 (Master Seq 4) — #74a — ADR-007 amendment census

- Step 1 RED command: `pytest tests/backend/pytest/architecture/test_adr_007_census_locks_red.py -q`
  (new file; asserts presence of 4 new TOML registries)
- Step 2 implementation files:
  - `tests/backend/pytest/architecture/_adr_007_packages_allowlist.toml` (NEW)
  - 3 sibling TOMLs per Loop 1 (census artefacts)
  - `tests/backend/pytest/architecture/test_adr_007_classification_red.py` (NEW)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest/architecture/ -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks` — expect GREEN.
- Step 6 contract validator: yes (smoke; expected zero findings).
- Step 7 lint/type: none (TOML + tests only); `make docs-tree-audit`.
- Postgres lane gate: no.
- Mypy/ruff scope: `tests/backend/pytest/architecture/` (test deltas only).
- Total est. time per gate run: **8 min**.

### Item #74b (Master Seq 74) — #74b — ADR-007 amendment text

- Step 1 RED command: `pytest tests/backend/pytest/architecture/test_adr_007_amendment_text_present_red.py -q`
- Step 2 implementation files:
  - `docs/adr/ADR-007-bounded-architecture-style.md` (amendment section)
  - `docs/DOCUMENTATION_TREE.md` (refresh)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest/architecture/ -q -k "adr"`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: yes (smoke).
- Step 7 lint/type: `make docs-tree-audit` (3-hop reachability).
- Postgres lane gate: no.
- Mypy/ruff scope: none.
- Total est. time per gate run: **5 min**.

### Item #41 (Master Seq 41) — #55 — Delete `access_user_service.py` facade

- Step 1 RED command: `pytest tests/backend/pytest/architecture/test_access_user_service_facade_removed_red.py -q`
- Step 2 implementation files:
  - DELETE `backend/app/services/access_user_service.py`
  - `backend/app/api/v1/endpoints/access.py` (repoint to canonical)
  - `docs/security/authorization-capability-contract.md` (drop `:109` line)
  - `docs/security/authorization-capability-contract.json` (drop `:106`, `:229` cites)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest/api/v1/test_access.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: **yes** (path delete; check 2 + check 7).
  `python3 scripts/security/validate_authz_capability_contract.py`.
- Step 7 lint/type:
  `ruff check backend/app/api/v1/endpoints/access.py`
  `mypy backend/app/api/v1/endpoints/access.py`
- Postgres lane gate: no.
- Mypy/ruff scope: `backend/app/api/v1/endpoints/access.py` only.
- Total est. time per gate run: **7 min**.

### Item #44 (Master Seq 44) — #56 — Delete `directory_identity_service.py` shim (atomic with #61)

- Step 1 RED command: `pytest tests/backend/pytest/architecture/test_directory_identity_service_shim_removed_red.py -q`
- Step 2 implementation files (joint with #61):
  - DELETE `backend/app/services/directory_identity_service.py`
  - `backend/app/services/_graph_directory/service.py` (repoint `normalize_business_role`)
  - `docs/security/authorization-capability-contract.md` (drop `:109`)
  - `docs/security/authorization-capability-contract.json` (drop `:106`, `:229`)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest -q -k "directory or graph_directory"`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: **yes** (check 2 + check 7).
- Step 7 lint/type:
  `ruff check backend/app/services/_graph_directory/`
  `mypy backend/app/services/_graph_directory/`
- Postgres lane gate: no.
- Mypy/ruff scope: `backend/app/services/_graph_directory/` only.
- Total est. time per gate run: **9 min** (atomic with #61).

### Item #45 (Master Seq 45) — #61 — Move `graph_directory_*` modules into `_graph_directory/` package (atomic with #56)

- Step 1 RED command: `pytest tests/backend/pytest/architecture/test_graph_directory_package_layout_red.py -q`
- Step 2 implementation files:
  - MOVE 4 modules: `backend/app/services/graph_directory_*.py` → `backend/app/services/_graph_directory/{service,*}.py`
  - Repoint all importers (per Loop 1 §61 enumeration)
  - `docs/security/authorization-capability-contract.md` (rewrite path at `:109`)
  - `docs/security/authorization-capability-contract.json` (rewrite at `:113`, `:229`)
  - `tests/backend/pytest/architecture/_naming_allowlist.toml` (verify _-prefix tolerance)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest -q -k "directory or graph_directory"`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: **yes** (check 2 + check 3 + check 7).
- Step 7 lint/type:
  `ruff check backend/app/services/_graph_directory/ backend/app/api/v1/endpoints/`
  `mypy backend/app/services/_graph_directory/`
- Postgres lane gate: no.
- Mypy/ruff scope: `backend/app/services/_graph_directory/` + importer files.
- Total est. time per gate run: **12 min** (atomic with #56; M-effort).

### Item #57 (Master Seq 57) — #42 — `ActorPayloadModel` shared base

- Step 1 RED command: `pytest tests/backend/pytest/test_outbox_actor_payload_base_red.py -q`
- Step 2 implementation files:
  - `backend/app/services/outbox/payloads.py` (insert `ActorPayloadModel`, refactor 6 classes, append `__all__`)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest/architecture/test_w12_outbox_enqueue_idempotency_key_present_red.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/services/outbox/payloads.py`
  `mypy backend/app/services/outbox/payloads.py`
- Postgres lane gate: no.
- Mypy/ruff scope: `backend/app/services/outbox/payloads.py` only.
- Total est. time per gate run: **5 min**.

### Item #70 (Master Seq 70) — #45a — Ownership prerequisite characterization tests

- Step 1 RED command:
  `pytest tests/backend/pytest/test_ownership_resolver_kri_archived_asymmetry.py tests/backend/pytest/test_ownership_resolver_control_join.py tests/backend/pytest/test_visible_ids_via_ownership.py -q`
- Step 2 implementation files (test-only):
  - `tests/backend/pytest/test_ownership_resolver_kri_archived_asymmetry.py` (NEW)
  - `tests/backend/pytest/test_ownership_resolver_control_join.py` (NEW)
  - `tests/backend/pytest/test_visible_ids_via_ownership.py` (NEW)
- Step 3 GREEN command: same as Step 1 (passes against current `ownership.py`).
- Step 4 domain suite: `pytest tests/backend/pytest -q -k "ownership"`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check tests/backend/pytest/test_ownership_*`
  `mypy tests/backend/pytest/test_ownership_*` (if mypy includes tests).
- Postgres lane gate: no.
- Mypy/ruff scope: 3 new test files only.
- Total est. time per gate run: **6 min**.

### Item #71 (Master Seq 71) — #45b — Ownership resolver factory

- Step 1 RED command: `pytest tests/backend/pytest/test_ownership_resolver_factory_red.py -q`
- Step 2 implementation files:
  - `backend/app/core/_permissions/ownership_factory.py` (NEW)
  - `backend/app/core/_permissions/ownership.py` (refactored to use factory)
  - `backend/app/core/_permissions/visible_ids.py` (refactored)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest -q -k "ownership"`
  (must include #45a regression suite)
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no (ownership is not in catalog surface).
- Step 7 lint/type:
  `ruff check backend/app/core/_permissions/`
  `mypy backend/app/core/_permissions/`
- Postgres lane gate: no.
- Mypy/ruff scope: `backend/app/core/_permissions/` only.
- Total est. time per gate run: **9 min**.

### Item #73 (Master Seq 73) — #40 — Re-cluster admin sub-routers

- Step 1 RED command:
  `pytest tests/backend/pytest/architecture/test_w12_admin_subrouter_clustering_red.py tests/backend/pytest/test_admin_route_table_snapshot_red.py -q`
- Step 2 implementation files:
  - NEW `backend/app/api/v1/endpoints/admin/telemetry.py`
  - NEW `backend/app/api/v1/endpoints/admin/sessions.py`
  - RENAME `directory_sync.py` → `admin/directory.py`
  - NEW `backend/app/api/v1/endpoints/admin/data_quality.py`
  - DELETE `backend/app/api/v1/endpoints/admin/capabilities.py`
  - REWRITE `backend/app/api/v1/endpoints/admin/__init__.py`
  - UPDATE `backend/app/api/v1/endpoints/admin/README.md`
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest/api/v1/test_admin*.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/api/v1/endpoints/admin/`
  `mypy backend/app/api/v1/endpoints/admin/`
- Postgres lane gate: no.
- Mypy/ruff scope: `backend/app/api/v1/endpoints/admin/` only.
- Total est. time per gate run: **10 min** (M).

---

## Domain: Endpoints (#10, #12, #15, #21, #38, #43, #44, #49, #58, #59, #63)

### Item #5 (Master Seq 5) — #10 — Keep `riskhub_questionnaires.py` (Reject; doc-only)

- Step 1 RED command: `pytest tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py -q`
- Step 2 implementation files:
  - `backend/app/api/v1/endpoints/riskhub_questionnaires.py:1` (extend module-purpose docstring)
  - `backend/app/api/v1/endpoints/README.md` (clarify sibling-of-package single-file note)
  - `.planning/audits/_context/02-backend-endpoints.md` (audit note)
  - `AGENTS.md`, `docs/agent/ENDPOINT_INVARIANTS.md` (cross-references retained)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest/api/v1/test_riskhub_questionnaires.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/api/v1/endpoints/riskhub_questionnaires.py`
  `mypy backend/app/api/v1/endpoints/riskhub_questionnaires.py`
  `make docs-tree-audit` (verify ENDPOINT_INVARIANTS xrefs).
- Postgres lane gate: no.
- Mypy/ruff scope: 1 file only.
- Total est. time per gate run: **5 min**.

### Item #7 (Master Seq 7) — #12 — Narrow blanket-except in `users/summary.py`

- Step 1 RED command: `pytest tests/backend/pytest/api/v1/test_users_summary_blanket_except_red.py -q`
- Step 2 implementation files:
  - `backend/app/api/v1/endpoints/users/summary.py:48` (`except HTTPException:`)
  - `backend/app/api/v1/endpoints/users/summary.py:62` (`except (HTTPException, SQLAlchemyError):`)
  - `tests/backend/pytest/architecture/test_users_summary_narrow_excepts_red.py` (optional AST lock)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `pytest tests/backend/pytest/api/v1/test_users_summary*.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/api/v1/endpoints/users/summary.py`
  `mypy backend/app/api/v1/endpoints/users/summary.py`
- Postgres lane gate: no.
- Mypy/ruff scope: 1 file.
- Total est. time per gate run: **5 min**.

### Item #13 (Master Seq 13) — #15 — Add `access_user` to capability catalog

- Step 1 RED command:
  `pytest tests/backend/pytest/architecture/test_capability_catalog_access_user_surface_red.py -q`
- Step 2 implementation files:
  - `docs/security/capability-catalog.json` (NEW 8th surface — 7 fields)
  - `docs/security/authorization-capability-contract.md` (matrix row)
  - `docs/security/authorization-capability-contract.json` (sensitive_change_paths)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `pytest tests/backend/pytest/architecture/ -q -k "capability_catalog"`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: **yes** (NEW catalog surface; check 4 parity).
  `python3 scripts/security/validate_authz_capability_contract.py`.
- Step 7 lint/type: none (doc-only).
- Postgres lane gate: no.
- Mypy/ruff scope: none.
- Total est. time per gate run: **6 min**.

### Item #29 (Master Seq 29) — #21 — Collapse Control-Risk link loaders

- Step 1 RED command:
  `pytest tests/backend/pytest/architecture/test_control_risk_link_loader_collapsed_red.py -q`
- Step 2 implementation files:
  - `backend/app/services/_control_execution/link_policy.py:22-45` (replace 2 helpers with `load_link(*, control_id, risk_id)`)
  - `backend/app/services/_control_execution/link_governance.py:102, :181` (caller swap)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest/test_risks.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/services/_control_execution/`
  `mypy backend/app/services/_control_execution/`
- Postgres lane gate: no.
- Mypy/ruff scope: `backend/app/services/_control_execution/` only.
- Total est. time per gate run: **6 min**.

### Item #46 (Master Seq 46) — #17 — Inline `_monitoring_response` endpoint shim

- Step 1 RED command:
  `pytest tests/backend/pytest/architecture/test_monitoring_response_endpoint_shim_removed_red.py -q`
- Step 2 implementation files:
  - DELETE `backend/app/api/v1/endpoints/_monitoring_response.py`
  - 14 endpoint importer file edits (per Loop 1 §17 enumeration)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest/api/v1/ -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no (shim not in sensitive_change_paths).
- Step 7 lint/type:
  `ruff check backend/app/api/v1/endpoints/`
  `mypy backend/app/api/v1/endpoints/`
- Postgres lane gate: no.
- Mypy/ruff scope: `backend/app/api/v1/endpoints/` only.
- Total est. time per gate run: **9 min**.

### Item #47 (Master Seq 47) — #49 — Inline `_control_execution/monitoring.py` wrapper

- Step 1 RED command:
  `pytest tests/backend/pytest/architecture/test_control_execution_monitoring_inlined_red.py -q`
- Step 2 implementation files:
  - DELETE `backend/app/services/_control_execution/monitoring.py`
  - `backend/app/services/_control_execution/link_governance.py:25, :62, :91, :141, :170` (inline)
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:188, :192` (delete two assertions)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `pytest tests/backend/pytest -q -k "control_execution or monitoring"`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/services/_control_execution/`
  `mypy backend/app/services/_control_execution/`
- Postgres lane gate: no.
- Mypy/ruff scope: `backend/app/services/_control_execution/` only.
- Total est. time per gate run: **7 min**.

### Item #48 (Master Seq 48) — #59 — Consolidate `_monitoring_*` packages (docs+lock)

- Step 1 RED command:
  `pytest tests/backend/pytest/architecture/test_monitoring_packages_consolidated_red.py -q`
- Step 2 implementation files:
  - `backend/app/services/_monitoring_response/README.md` (invariants)
  - Architecture lock test (NEW or extended)
  - Optionally rename packages per Loop 1 §59
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `pytest tests/backend/pytest -q -k "monitoring_response or _control_execution"`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/services/_monitoring_response/`
  `mypy backend/app/services/_monitoring_response/`
- Postgres lane gate: no.
- Mypy/ruff scope: `backend/app/services/_monitoring_response/` only.
- Total est. time per gate run: **8 min**.

### Item #56 (Master Seq 56) — #38 — Move 8 inline endpoint Pydantic models to schemas

- Step 1 RED command:
  `pytest tests/backend/pytest/architecture/test_endpoint_inline_pydantic_evicted_red.py -q`
- Step 2 implementation files:
  - NEW `backend/app/schemas/health.py`
  - NEW `backend/app/schemas/preferences.py`
  - EXTEND `backend/app/schemas/riskhub.py` (`BatchSendRiskFilters`, `BatchSendRequest`, `BatchSendResponse`)
  - EDIT `backend/app/api/v1/endpoints/health.py`, `preferences.py`, `riskhub_questionnaires.py`
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `pytest tests/backend/pytest/api/v1/test_riskhub_questionnaires.py tests/backend/pytest/test_health.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/schemas/ backend/app/api/v1/endpoints/`
  `mypy backend/app/schemas/ backend/app/api/v1/endpoints/`
- Postgres lane gate: no.
- Mypy/ruff scope: `backend/app/schemas/` + 3 endpoint files.
- Total est. time per gate run: **8 min**.

### Item #54 (Master Seq 54) — #58 — Delete `OrphanedItemService` facade + static-method class

- Step 1 RED command:
  `pytest tests/backend/pytest/architecture/test_orphaned_item_service_facade_removed_red.py -q`
- Step 2 implementation files:
  - DELETE the facade module + static-method class (per Loop 1 §58)
  - 7 call-site rewrites
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest -q -k "orphan"`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/services/`
  `mypy backend/app/services/`
- Postgres lane gate: no.
- Mypy/ruff scope: limited to touched service modules + 7 callers.
- Total est. time per gate run: **8 min**.

### Item #55 (Master Seq 55) — #43 — Audit adapter-emitter helper

- Step 1 RED command:
  `pytest tests/backend/pytest/architecture/test_audit_adapter_emitter_helper_red.py -q`
- Step 2 implementation files:
  - NEW `backend/app/core/audit/_emit.py`
  - 6 audit modules (`risk.py`, `control.py`, `kri.py`, `issue.py`, `approval.py`, `vendor.py`)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest/test_w7_audit_*.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/core/audit/`
  `mypy backend/app/core/audit/`
- Postgres lane gate: no.
- Mypy/ruff scope: `backend/app/core/audit/` only.
- Total est. time per gate run: **9 min**.

### Item #60 (Master Seq 60) — #44 — Centralize guarded path-prefix registry

- Step 1 RED command:
  `pytest tests/backend/pytest/architecture/test_router_prefix_registry_red.py -q`
- Step 2 implementation files:
  - NEW `backend/app/api/v1/_router_registry.toml`
  - Optional: refactor `backend/app/api/v1/router.py:32-60`
  - `backend/app/api/v1/endpoints/README.md` (registry note)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `pytest tests/backend/pytest/architecture/test_w3_gate_snapshot.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/api/v1/`
  `mypy backend/app/api/v1/`
- Postgres lane gate: no.
- Mypy/ruff scope: `backend/app/api/v1/` only.
- Total est. time per gate run: **9 min**.

### Item #63 (Master Seq 63) — #63 — Outbox dispatch `SchedulerJobRun` instrumentation

- Step 1 RED command: `pytest tests/backend/pytest/test_outbox_dispatch_scheduler_run_red.py -q`
- Step 2 implementation files:
  - `backend/app/services/outbox/dispatcher.py` (instrumentation + `SchedulerJobRun` row)
  - `backend/app/api/v1/endpoints/admin/console.py` or replacement (admin runtime state preserved)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest -q -k "outbox or scheduler"`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/services/outbox/`
  `mypy backend/app/services/outbox/`
- Postgres lane gate: no.
- Mypy/ruff scope: `backend/app/services/outbox/` only.
- Total est. time per gate run: **9 min**.

---

## Domain: Risks (#1, #11, #19, #20)

### Item #9 (Master Seq 9) — #1 — Drop `validate_risk_type` re-export

- Step 1 RED command:
  `pytest tests/backend/pytest/architecture/test_risks_crud_public_surface_red.py -q`
- Step 2 implementation files:
  - `backend/app/api/v1/endpoints/risks/crud/__init__.py:2, :23`
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest/test_risks.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/api/v1/endpoints/risks/`
  `mypy backend/app/api/v1/endpoints/risks/`
- Postgres lane gate: no.
- Mypy/ruff scope: `backend/app/api/v1/endpoints/risks/` only.
- Total est. time per gate run: **4 min**.

### Item #10 (Master Seq 10) — #19 — Consolidate risk-type validation

- Step 1 RED command:
  `pytest tests/backend/pytest/architecture/test_validate_risk_type_single_owner_red.py tests/backend/pytest/api/v1/test_risks_validation_parity.py -q`
- Step 2 implementation files:
  - DELETE `backend/app/api/v1/endpoints/risks/crud/_shared.py`
  - `backend/app/api/v1/endpoints/risks/crud/create.py:20` (rewire import to service-policy)
  - `.planning/audits/_context/01-backend-services.md`, `02-backend-endpoints.md` (notes)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest/test_risks.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: yes (smoke; create endpoint in scope).
- Step 7 lint/type:
  `ruff check backend/app/api/v1/endpoints/risks/`
  `mypy backend/app/api/v1/endpoints/risks/`
- Postgres lane gate: no.
- Mypy/ruff scope: `backend/app/api/v1/endpoints/risks/` only.
- Total est. time per gate run: **6 min**.

### Item #11 (Master Seq 11) — #11 — `risk.process` → `risk.name` truth-in-naming fix

- Step 1 RED command: `pytest tests/backend/pytest/test_control_execution_risk_name_red.py -q`
- Step 2 implementation files:
  - `backend/app/services/_control_execution/workflow.py:155`
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest -q -k "control_execution"`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/services/_control_execution/workflow.py`
  `mypy backend/app/services/_control_execution/workflow.py`
- Postgres lane gate: no.
- Mypy/ruff scope: 1 file.
- Total est. time per gate run: **4 min**.

### Item #28 (Master Seq 28) — #20 — Risk ID generation co-location (DOC-ONLY)

- Step 1 RED command:
  `pytest tests/backend/pytest/architecture/test_risk_id_generation_doc_red.py -q`
- Step 2 implementation files:
  - `AGENTS.md`, `docs/agent/ENDPOINT_INVARIANTS.md` (cite re-export)
  - `.planning/audits/_context/02-backend-endpoints.md`
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest/architecture/ -q -k "risk_id"`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type: `make docs-tree-audit`.
- Postgres lane gate: no.
- Mypy/ruff scope: none (doc-only).
- Total est. time per gate run: **5 min**.

---

## Domain: Issues (#2, #8, #14, #27, #28, #29, #30, #41, #53)

### Item #15 (Master Seq 15) — #2 — Drop 4 underscore aliases in `source_validation.py`

- Step 1 RED command:
  `pytest tests/backend/pytest/architecture/test_issue_workflow_no_underscored_self_aliases_red.py -q`
- Step 2 implementation files:
  - `backend/app/services/_issue_workflow/source_validation.py:117-120` (delete aliases)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest/api/v1/test_issue_workflow.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/services/_issue_workflow/`
  `mypy backend/app/services/_issue_workflow/`
  `python -m pyflakes backend/app/services/_issue_workflow/source_validation.py`
- Postgres lane gate: no.
- Mypy/ruff scope: `backend/app/services/_issue_workflow/` only.
- Total est. time per gate run: **4 min**.

### Item #21 (Master Seq 21) — #41 — Bidirectional underscore alias removal

- Step 1 RED command:
  `pytest tests/backend/pytest/architecture/test_issue_workflow_no_underscored_self_aliases_red.py -q -k "serialization"`
- Step 2 implementation files:
  - `backend/app/services/_issue_workflow/serialization.py:18, :41` (drop bidirectional aliases)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest/api/v1/test_issue_workflow.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/services/_issue_workflow/serialization.py`
  `mypy backend/app/services/_issue_workflow/serialization.py`
- Postgres lane gate: no.
- Mypy/ruff scope: 1 file.
- Total est. time per gate run: **4 min**.

### Item #12 (Master Seq 12) — #14 — Issues outbox-only notification cleanup

- Step 1 RED command: `pytest tests/backend/pytest/api/v1/test_issue_workflow.py tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "issue_notif"`
- Step 2 implementation files:
  - `backend/app/api/v1/endpoints/issues/_shared/notifications.py:24-103` (delete 3 helpers)
  - `backend/app/api/v1/endpoints/issues/_shared/__init__.py:14-16, :62-64` (drop imports/`__all__`)
  - `backend/app/api/v1/endpoints/issues/_shared/README.md` (refresh)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest -q -k "outbox and issue"`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/api/v1/endpoints/issues/_shared/`
  `mypy backend/app/api/v1/endpoints/issues/_shared/`
- Postgres lane gate: no.
- Mypy/ruff scope: `backend/app/api/v1/endpoints/issues/_shared/` only.
- Total est. time per gate run: **7 min** (M).

### Item #51 (Master Seq 51) — #27 — Issue-loading duplicate deletion

- Step 1 RED command:
  `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "issues_loading_thin_or_deleted"`
- Step 2 implementation files:
  - DELETE `backend/app/api/v1/endpoints/issues/_shared/loading.py`
  - 4 endpoint repoints (`crud/contextual.py:20`, `crud/create.py:21`, `crud/detail.py:10`, `links.py:14`)
  - `_shared/__init__.py:11, :54-56`
  - `_shared/README.md:13`
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `pytest tests/backend/pytest/api/v1/test_issues_crud_api.py tests/backend/pytest/api/v1/test_issues_rbac_api.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/api/v1/endpoints/issues/ backend/app/services/_issue_workflow/`
  `mypy backend/app/api/v1/endpoints/issues/ backend/app/services/_issue_workflow/`
- Postgres lane gate: no.
- Mypy/ruff scope: issues endpoint + workflow service.
- Total est. time per gate run: **7 min**.

### Item #52 (Master Seq 52) — #8 — Source-validation split / canonical link helpers

- Step 1 RED command:
  `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "issue_workflow"`
- Step 2 implementation files:
  - EXTEND `backend/app/services/_issue_workflow/assignment.py`
  - REPOINT `_issue_workflow/update_plans.py:9-14`, `execution.py:41-47`
  - SHRINK `source_validation.py` (or delete)
  - REPOINT endpoint `_shared/validation.py:11-37`, `_shared/links.py:11-80`
  - `docs/security/authorization-capability-contract.md:128`, `.json:629` (cite assignment.py)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `pytest tests/backend/pytest/api/v1/test_issue_workflow.py tests/backend/pytest/api/v1/test_issues_crud_api.py tests/backend/pytest/api/v1/test_issues_rbac_api.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: **yes** (sensitive_change_paths includes service_policy citing module).
  `python3 scripts/security/validate_authz_capability_contract.py`.
- Step 7 lint/type:
  `ruff check backend/app/services/_issue_workflow backend/app/api/v1/endpoints/issues`
  `mypy backend/app/services/_issue_workflow backend/app/api/v1/endpoints/issues`
- Postgres lane gate: no.
- Mypy/ruff scope: issue workflow + issues endpoints.
- Total est. time per gate run: **10 min** (M).

### Item #53 (Master Seq 53) — #28 — Issue source-mutation triplicate collapse

- Step 1 RED command:
  `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "issue_link_helpers_one_canonical"`
- Step 2 implementation files:
  - `_issue_register/source_mutation.py` promoted bodies live
  - `_shared/links.py` (final removal)
  - `_issue_workflow/source_validation.py` shrink
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest/api/v1/test_issue_workflow.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/services/_issue_workflow backend/app/services/_issue_register`
  `mypy backend/app/services/_issue_workflow backend/app/services/_issue_register`
- Postgres lane gate: no.
- Mypy/ruff scope: issue workflow + register services.
- Total est. time per gate run: **8 min**.

### Item #54 (Master Seq 54 — see crosscut #58 above; this is the *issues* #54)

(*Note*: master sequence places #58 at Seq 54 in crosscut/endpoints; the issue
domain `#53` (workflow service collapse) sits at Seq 43 below.)

### Item #43 (Master Seq 43) — #53 — Issue workflow service collapse

- Step 1 RED command:
  `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "IssueWorkflowService_facade_dropped"`
- Step 2 implementation files:
  - DELETE `backend/app/services/issue_workflow_service.py` (facade)
  - 4-5 caller repoints
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `pytest tests/backend/pytest -q -k "issue_workflow"`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/services/`
  `mypy backend/app/services/`
- Postgres lane gate: no.
- Mypy/ruff scope: services + issues endpoints.
- Total est. time per gate run: **5 min** (S).

### Item #39 (Master Seq 39) — #29 — Source-type vocabulary canonicalization

- Step 1 RED command:
  `pytest tests/backend/pytest/architecture/test_issue_source_type_canonical_red.py -q`
- Step 2 implementation files:
  - Single canonical helper (per Loop 1 — `_issue_register/source_mutation.py:24` body kept; remove duplicates)
  - Repoint `_issue_workflow/update_plans.py:19`, `_issue_register/linked_context.py:103`
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest -q -k "issue_workflow or issue_register"`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/services/_issue_workflow backend/app/services/_issue_register`
  `mypy backend/app/services/_issue_workflow backend/app/services/_issue_register`
- Postgres lane gate: no.
- Mypy/ruff scope: issue workflow + register.
- Total est. time per gate run: **5 min**.

### Item #42 (Master Seq 42) — #30 — `_shared/__init__.py` underscore re-export pruning

- Step 1 RED command:
  `pytest tests/backend/pytest/architecture/test_issues_shared_barrel_pruned_red.py -q`
- Step 2 implementation files:
  - `backend/app/api/v1/endpoints/issues/_shared/__init__.py:42-79` (prune `__all__`)
  - `backend/app/api/v1/endpoints/issues/_shared/README.md`
  - `tests/backend/pytest/architecture/_naming_allowlist.toml` (if any allowlist edits)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest/api/v1/test_issue*.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/api/v1/endpoints/issues/_shared/`
  `mypy backend/app/api/v1/endpoints/issues/_shared/`
- Postgres lane gate: no.
- Mypy/ruff scope: `backend/app/api/v1/endpoints/issues/_shared/` only.
- Total est. time per gate run: **6 min**.

---

## Domain: Approvals (#7, #9, #18, #33, #34, #54, #60, #75)

### Item #20 (Master Seq 20) — #7 — Delete `_get_approval_department_id` shim

- Step 1 RED command:
  `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "_get_approval_department_id"`
- Step 2 implementation files:
  - `backend/app/api/v1/endpoints/approvals/_shared.py:17-31` (delete)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `pytest tests/backend/pytest/test_approval_workflow.py tests/backend/pytest/test_approvals.py tests/backend/pytest/test_approval_resolution.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/api/v1/endpoints/approvals/`
  `mypy backend/app/api/v1/endpoints/approvals/`
- Postgres lane gate: no.
- Mypy/ruff scope: 1 file (`_shared.py`).
- Total est. time per gate run: **4 min**.

### Item #25 (Master Seq 25) — #54 — Inline `_approval_queue/lifecycle.py` aggregator

- Step 1 RED command:
  `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "approval_queue"`
  (REWRITE 3 deepening tests `:1005, :1025, :1041` in same commit)
- Step 2 implementation files:
  - DELETE `backend/app/services/_approval_queue/lifecycle.py`
  - `backend/app/services/_approval_queue/__init__.py` (move 4 leaf imports + `__all__`)
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:1005, :1025, :1041`
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `pytest tests/backend/pytest/test_approval_workflow.py tests/backend/pytest/test_approval_resolution.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/services/_approval_queue/`
  `mypy backend/app/services/_approval_queue/`
- Postgres lane gate: no.
- Mypy/ruff scope: `backend/app/services/_approval_queue/` only.
- Total est. time per gate run: **5 min**.

### Item #26 (Master Seq 26) — #75 — Delete-and-consolidate `_auto_reject_kri_approval`

- Step 1 RED command:
  `pytest tests/backend/pytest/architecture/test_auto_reject_kri_approval_consolidated_red.py -q`
- Step 2 implementation files:
  - `backend/app/services/_approval_execution/kri_history_correction.py:23` (delete)
  - `backend/app/services/_approval_execution/kri_value_submission.py:23` (delete)
  - 1 canonical owner consolidates body
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest -q -k "approval_execution"`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/services/_approval_execution/`
  `mypy backend/app/services/_approval_execution/`
- Postgres lane gate: no.
- Mypy/ruff scope: `backend/app/services/_approval_execution/` only.
- Total est. time per gate run: **4 min**.

### Item #27 (Master Seq 27) — #18 — Repoint-and-delete `_build_approval_read`

- Step 1 RED command:
  `pytest tests/backend/pytest/test_architecture_deepening_contracts.py tests/backend/pytest/test_approval_resolution.py -q -k "build_approval_read"`
- Step 2 implementation files:
  - `backend/app/api/v1/endpoints/approvals/resolve.py:18, :61, :85, :102` (rewire to projection)
  - `backend/app/api/v1/endpoints/approvals/detail.py:15, :56`
  - `backend/app/api/v1/endpoints/approvals/_shared.py:34-61` (delete)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `pytest tests/backend/pytest/test_approval_workflow.py tests/backend/pytest/test_approval_resolution.py tests/backend/pytest/test_approvals.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/api/v1/endpoints/approvals/`
  `mypy backend/app/api/v1/endpoints/approvals/`
- Postgres lane gate: no.
- Mypy/ruff scope: `backend/app/api/v1/endpoints/approvals/` only.
- Total est. time per gate run: **5 min**.

### Item #33 (Master Seq 33) — #33 — Unify frontend approval-queued banners

- Step 1 RED command:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/components/kri-form/KRIFormContainer.approval-banner.test.tsx tests/frontend/unit/src/components/kri-form/no-kri-banner-duplicate.test.ts`
- Step 2 implementation files:
  - `frontend/src/components/kri-form/KRIFormContainer.tsx:7, :158-163` (replace with prop-driven banner)
  - DELETE `frontend/src/components/kri-form/KriApprovalQueuedBanner.tsx`
  - `frontend/src/components/kri-form/README.md`
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/components/kri-form/ tests/frontend/unit/src/components/forms/`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type: `cd frontend && npx tsc --noEmit`
- Postgres lane gate: no.
- Mypy/ruff scope: none (FE-only).
- Total est. time per gate run: **6 min**.

### Item #49 (Master Seq 49) — #9 — Delete-and-redirect duplicate `can_user_view_approval_resource`

- Step 1 RED command:
  `pytest tests/backend/pytest/test_architecture_deepening_contracts.py tests/backend/pytest/test_approval_workflow.py -q -k "notification_approval"`
- Step 2 implementation files:
  - `backend/app/services/_notification_approval_helpers.py:9, :72-79, :98` (delete duplicate; redirect)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest/test_approval_workflow.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/services/_notification_approval_helpers.py`
  `mypy backend/app/services/_notification_approval_helpers.py`
- Postgres lane gate: no.
- Mypy/ruff scope: 1 file.
- Total est. time per gate run: **5 min**.

### Item #50 (Master Seq 50) — #34 — Extract `resolve_approval_privilege_tier` helper

- Step 1 RED command:
  `pytest tests/backend/pytest/test_approval_privilege_tier.py tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "approval_privilege"`
- Step 2 implementation files:
  - `backend/app/services/approval_scenario_policy.py` (append `ApprovalPrivilegeTier` + `resolve_approval_privilege_tier`)
  - 16 file migration (per Loop 1 §34)
  - `docs/security/authorization-capability-contract.md` (Vocabulary "privilege tier")
  - `docs/security/authorization-capability-contract.json` (refresh)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `pytest tests/backend/pytest/test_approval_workflow.py tests/backend/pytest/test_approvals.py tests/backend/pytest/test_approval_resolution.py tests/backend/pytest/test_w1_privileged_escalation_red.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: **yes** (check 5 vocabulary).
- Step 7 lint/type:
  `ruff check backend/app/services/ backend/app/api/v1/endpoints/`
  `mypy backend/app/services/ backend/app/api/v1/endpoints/`
- Postgres lane gate: no.
- Mypy/ruff scope: 16 listed files only.
- Total est. time per gate run: **15 min** (M; 22+ sites).

### Item #74 (Master Seq 74) — #60 — `PrivilegeContext` + `Depends(get_privilege_context)`

- Step 1 RED command:
  `pytest tests/backend/pytest/test_privilege_context.py tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "privilege_context"`
- Step 2 implementation files:
  - `backend/app/api/deps.py` (add `PrivilegeContext` dataclass + `get_privilege_context`)
  - 8+ migration sites (`_authorization_capabilities/{approvals,risks,controls,kris}.py`, `_approval_queue/{queries,counts}.py`)
  - Endpoints `detail.py:47`, `notifications.py:127`, `users/summary.py:26`
  - `docs/security/authorization-capability-contract.md` (Vocabulary "privilege context")
  - `docs/security/authorization-capability-contract.json`
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `pytest tests/backend/pytest/test_approval_workflow.py tests/backend/pytest/test_approval_resolution.py tests/backend/pytest/test_approval_privilege_tier.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: **yes** (check 5 vocabulary).
- Step 7 lint/type:
  `ruff check backend/app/api/deps.py backend/app/services/`
  `mypy backend/app/api/deps.py backend/app/services/`
- Postgres lane gate: no.
- Mypy/ruff scope: deps + 8 service files.
- Total est. time per gate run: **15 min** (M).

---

## Domain: KRIs (#3, #24, #25, #26, #50, #51, #52, #62, #73)

### Item #2 (Master Seq 2) — #73 — Author ADR-012 (KRI period algebra)

- Step 1 RED command:
  `pytest tests/backend/pytest/architecture/test_adr_012_kri_period_algebra_present_red.py -q`
- Step 2 implementation files:
  - `docs/adr/ADR-012-kri-time-series-period-algebra.md` (NEW)
  - `tests/backend/pytest/architecture/_kri_period_lock.toml` or similar
  - `backend/app/services/_kri_history/constants.py:2` SSOT pin
  - `backend/app/services/_config/lookup.py:26` collapse to alias
  - `docs/adr/README.md`
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `pytest tests/backend/pytest -q -k "kri_history or _config"`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: yes (smoke; expected zero findings).
- Step 7 lint/type:
  `ruff check backend/app/services/_kri_history/ backend/app/services/_config/`
  `mypy backend/app/services/_kri_history/ backend/app/services/_config/`
  `make docs-tree-audit`
- Postgres lane gate: no.
- Mypy/ruff scope: `_kri_history/` + `_config/`.
- Total est. time per gate run: **9 min**.

### Item #16 (Master Seq 16) — #3 — Delete `kriFormWorkflow.ts`

- Step 1 RED command:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/components/__tests__/EntityFormWorkflow.test.ts`
  (and backend mirror)
  `pytest tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py -q -k "kriFormWorkflow"`
- Step 2 implementation files:
  - DELETE `frontend/src/components/kri-form/kriFormWorkflow.ts`
  - DELETE or shrink `tests/frontend/unit/src/components/__tests__/EntityFormWorkflow.test.ts:8, :28-29`
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/components/`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type: `cd frontend && npx tsc --noEmit`
- Postgres lane gate: no.
- Mypy/ruff scope: none.
- Total est. time per gate run: **5 min**.

### Item #22 (Master Seq 22) — #50 — Delete `_kri_history/submission.py` wrapper

- Step 1 RED command:
  `pytest tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py -q -k "submission"`
- Step 2 implementation files:
  - DELETE `backend/app/services/_kri_history/submission.py`
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:998` (drop string)
  - `backend/app/services/_kri_history/README.md:21`
  - `docs/security/authorization-capability-contract.md:117, :118, :161` (strip submission.py)
  - `docs/security/authorization-capability-contract.json:389, :411`
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest/test_w1_privileged_escalation_red.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: **yes** (check 2 + check 7).
- Step 7 lint/type:
  `ruff check backend/app/services/_kri_history/`
  `mypy backend/app/services/_kri_history/`
- Postgres lane gate: no.
- Mypy/ruff scope: `backend/app/services/_kri_history/` only.
- Total est. time per gate run: **6 min**.

### Item #23 (Master Seq 23) — #52 — Delete `_kri_history/correction_plans.py`

- Step 1 RED command:
  `pytest tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py -q -k "correction_plans"`
- Step 2 implementation files:
  - DELETE `backend/app/services/_kri_history/correction_plans.py`
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:956, :962` (drop import + assertion)
  - `backend/app/services/_kri_history/README.md`
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `pytest tests/backend/pytest/test_kris_history_corrections_api.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/services/_kri_history/`
  `mypy backend/app/services/_kri_history/`
- Postgres lane gate: no.
- Mypy/ruff scope: `_kri_history/` only.
- Total est. time per gate run: **5 min**.

### Item #30 (Master Seq 30) — #25 — Extract KRI department-scope helper

- Step 1 RED command:
  `pytest tests/backend/pytest/test_kris_department_scope_helper_red.py tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py -q -k "department_scope"`
- Step 2 implementation files:
  - NEW helper in `backend/app/api/v1/endpoints/kris/access.py` (`apply_kri_department_scope`)
  - REPLACE blocks at `due_soon.py:30-51`, `overdue.py:29-50`, `breaches.py:41-47`
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `pytest tests/backend/pytest/test_kris_rbac.py tests/backend/pytest/test_kris_history_listing_api.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/api/v1/endpoints/kris/`
  `mypy backend/app/api/v1/endpoints/kris/`
- Postgres lane gate: no.
- Mypy/ruff scope: `backend/app/api/v1/endpoints/kris/` only.
- Total est. time per gate run: **6 min**.

### Item #31 (Master Seq 31) — #26 — Delete `KRIForm.tsx` shim + ESLint pin

- Step 1 RED command:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/components/__tests__/KRIForm.edit.test.tsx tests/frontend/unit/src/components/__tests__/KRIForm.vendor-context.test.tsx`
  Plus backend lock: `pytest tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py -q -k "KRIForm.tsx"`
- Step 2 implementation files:
  - DELETE `frontend/src/components/KRIForm.tsx`
  - REWRITE `frontend/src/pages/KRINewPage.tsx:5`
  - 4 test files (per Loop 1 §26)
  - `frontend/eslint.config.js:145-158`
  - `frontend/src/components/kri-form/README.md:5`
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/components/__tests__/ tests/frontend/unit/src/pages/__tests__/`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `cd frontend && pnpm lint && npx tsc --noEmit`
- Postgres lane gate: no.
- Mypy/ruff scope: none (FE only).
- Total est. time per gate run: **8 min**.

### Items #42 + #43 (Master Seq 42 + 43) — #24 + #51 (atomic, single commit)

(Master sequence places #24 at Seq 42 and #51 at Seq 43 as ATOMIC pair.)

- Step 1 RED command:
  `pytest tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py -q -k "linked_vendors or value_application"`
- Step 2 implementation files (single commit):
  - DELETE `backend/app/api/v1/endpoints/kris/linked_vendors.py`
  - DELETE `backend/app/services/_kri_history/value_application.py`
  - REPOINT `breaches.py:18`, `detail.py:15`, `create.py:22`, `restore.py:17`
  - REPOINT `_register_listings/kris.py:31`, `_entity_mutation_lifecycle/direct_apply.py:21`
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:976-980, :999-1000`
  - `docs/security/authorization-capability-contract.md:116, :117, :118, :161`
  - `docs/security/authorization-capability-contract.json:368, :388, :389, :410, :411`
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `pytest tests/backend/pytest/test_kri_history_intake_workflow.py tests/backend/pytest/test_kris_value_submission_api.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: **yes** (check 2 + check 7; 5 md cells + 5 json strings).
  Risk register: this is the highest doc-edit volume single commit; run validator twice — once after stage of file deletes, once after doc edits.
- Step 7 lint/type:
  `ruff check backend/app/services/_kri_history backend/app/api/v1/endpoints/kris`
  `mypy backend/app/services/_kri_history backend/app/api/v1/endpoints/kris`
- Postgres lane gate: no.
- Mypy/ruff scope: `_kri_history/` + `endpoints/kris/`.
- Total est. time per gate run: **14 min** (atomic; M-effort).

### Item #69 (Master Seq 69) — #62 — Relocate `kri_vendor_assignment.py` (per-row audit)

- Step 1 RED command:
  `pytest tests/backend/pytest/test_kri_vendor_assignment_per_row_audit_red.py tests/backend/pytest/architecture/test_w4_bc_c_vendor_governance_boundaries_red.py -q`
- Step 2 implementation files:
  - MOVE `backend/app/services/kri_vendor_assignment.py` → `backend/app/services/_vendor_links/kri_assignment.py`
  - REWRITE `assign_vendors_to_kri` to call `link_vendor_target`/`unlink_vendor_target`
  - 4 importer pivots
  - `docs/security/authorization-capability-contract.md:172` (path update)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest -q -k "vendor_link or kri_vendor"`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: **yes** (check 2 + check 7).
- Step 7 lint/type:
  `ruff check backend/app/services/_vendor_links/`
  `mypy backend/app/services/_vendor_links/`
- Postgres lane gate: no.
- Mypy/ruff scope: `_vendor_links/` + 4 callers.
- Total est. time per gate run: **11 min** (M).

---

## Domain: Vendor (#13, #16, #17, #31, #57, #69, #70)

### Item #6 (Master Seq 6) — #57 — Keep `quarterly_comparison_service.py` (Reject; doc-only)

(*Note*: Master sequence treats #57 as Reject + doc-only at Seq 6, then schedules
the **delete** path at Seq 27 if orchestrator override applies; below shows
the orchestrator-override gate.)

- Step 1 RED command:
  `pytest tests/backend/pytest/architecture/test_quarterly_comparison_facade_removed_red.py tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "quarterly_comparison"`
- Step 2 implementation files:
  - DELETE `backend/app/services/quarterly_comparison_service.py`
  - `backend/app/api/v1/endpoints/dashboard/quarterly.py:12` (repoint to `_quarterly_comparison.composition`)
  - `backend/app/services/_quarterly_comparison/README.md:16`
  - `.planning/codebase/CONVENTIONS.md:22, CONCERNS.md:14`
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:559-569` (rewrite)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest/test_dashboard.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: yes (check 2 + check 7 — defensive; facade not in sensitive paths but sibling package is).
- Step 7 lint/type:
  `ruff check backend/app/api/v1/endpoints/dashboard/quarterly.py`
  `mypy backend/app/api/v1/endpoints/dashboard/quarterly.py`
- Postgres lane gate: no.
- Mypy/ruff scope: 1 endpoint file.
- Total est. time per gate run: **6 min**.

### Item #8 (Master Seq 8) — #13 — Delete `vendor_link_helpers.py` shim + capability contract sync

- Step 1 RED command:
  `pytest tests/backend/pytest/architecture/test_vendor_link_helpers_shim_removed_red.py tests/backend/pytest/test_vendor_link_workflow_module.py -q`
- Step 2 implementation files:
  - DELETE `backend/app/api/v1/endpoints/vendor_link_helpers.py`
  - `docs/security/authorization-capability-contract.json:55, :479, :502`
  - `docs/security/authorization-capability-contract.md:121, :122`
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest/test_vendor_link_workflow_module.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: **yes** (check 2 + check 7).
- Step 7 lint/type: none (only file deleted).
- Postgres lane gate: no.
- Mypy/ruff scope: none.
- Total est. time per gate run: **7 min**.

### Item #19 (Master Seq 19) — #17 — `_monitoring_response` shim (already covered above under endpoints).

### Item #44 (Master Seq 44) — #16 — Remove reports legacy-excel tombstones

- Step 1 RED command:
  `pytest tests/backend/pytest/architecture/test_reports_legacy_excel_tombstones_removed_red.py tests/backend/pytest/test_openapi_contract_parity.py tests/backend/pytest/test_protocol_contract_probe.py -q`
- Step 2 implementation files:
  - DELETE `backend/app/api/v1/endpoints/reports/legacy_excel.py`
  - EDIT `audit_trail_excel.py:133-139`, `summary_excel.py:97-103`
  - reports router include drop
  - `tests/backend/pytest/test_openapi_contract_parity.py:26-29`
  - `tests/backend/pytest/test_protocol_contract_probe.py:26, :108`
  - `scripts/security/protocol_contract_probe.py:61, :71, :81, :91`
  - `docs/security/reports/contract-drift-remediation-2026-02-21.md:25`
  - `docs/security/reports/deep-scan-remediation-2026-02-20.md:81`
  - `tests/backend/pytest/api/v1/test_reports_audit.py:270` (delete test)
  - `tests/backend/pytest/test_reports_rbac.py:193, :369, :379, :391, :410, :424` (delete 6 assertions)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest/test_vendor_reports.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/api/v1/endpoints/reports/`
  `mypy backend/app/api/v1/endpoints/reports/`
  `python scripts/security/protocol_contract_probe.py --self-check`
- Postgres lane gate: no.
- Mypy/ruff scope: `backend/app/api/v1/endpoints/reports/` only.
- Total est. time per gate run: **10 min** (M).

### Item #52 (Master Seq 52) — #31 — Extract vendor reporting row formatters

- Step 1 RED command:
  `pytest tests/backend/pytest/services/test_vendor_governance_reports_red.py tests/backend/pytest/architecture/test_vendor_reports_endpoint_no_row_builders_red.py -q`
- Step 2 implementation files:
  - `backend/app/services/_vendor_governance/reports.py` (add `annual_report_rows`, `dora_register_rows`)
  - `backend/app/api/v1/endpoints/vendor_reports.py:36-119, :146, :170, :26`
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: `pytest tests/backend/pytest/test_vendor_reports.py -q`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type:
  `ruff check backend/app/services/_vendor_governance/ backend/app/api/v1/endpoints/vendor_reports.py`
  `mypy backend/app/services/_vendor_governance/ backend/app/api/v1/endpoints/vendor_reports.py`
- Postgres lane gate: no.
- Mypy/ruff scope: `_vendor_governance/` + 1 endpoint.
- Total est. time per gate run: **8 min** (M).

### Items #76 + #77 (Master Seq 76 + 77) — #69 + #70 — **Migration bundle (single commit)**

This bundle uses the **9-step migration sequence** from
`plan-loop-2-06-migration-window.md:577-633`, NOT the standard 7-step gate.

#### 9-step migration sequence

**Step 1 — RED tests (write FIRST)**:

```sh
# Author the 4 RED test files:
#   tests/backend/pytest/architecture/test_vendor_link_mixin_red.py
#   tests/backend/pytest/architecture/test_vendor_status_drop_red.py
#   tests/backend/pytest/migrations/test_vendor_link_cascade_postgres_red.py
#   tests/backend/pytest/migrations/test_vendor_link_migration_forward_only_red.py

pytest \
  tests/backend/pytest/architecture/test_vendor_link_mixin_red.py \
  tests/backend/pytest/architecture/test_vendor_status_drop_red.py \
  tests/backend/pytest/migrations/test_vendor_link_migration_forward_only_red.py
# Expect: 4 of 4 fail; PG-lane test skipped without postgres lane.
```

**Step 2 — Mixin (model-only, no DB change)**:

- Create `backend/app/models/_vendor_link_mixin.py` per migration plan §1.

**Step 3 — Rebase concrete link models (model-only, no DB change)**:

- Edit `backend/app/models/vendor_risk_link.py`, `vendor_control_link.py`, `vendor_kri_link.py` per §3.
- Verify mixin RED tests now pass on sqlite.

**Step 4 — Generate Alembic revision (DB change here)**:

- Create `backend/alembic/versions/k6l7m8n9o0p1_vendor_link_cascade_and_status_drop.py` per §2.
- Bring up Postgres lane (`make db` or equivalent).
- `alembic upgrade head`.
- `pytest tests/backend/pytest/migrations/test_vendor_link_cascade_postgres_red.py tests/backend/pytest/migrations/test_vendor_link_migration_forward_only_red.py -m postgres`.
- Capture row counts pre/post per ADR-010 rehearsal.

**Step 5 — Drop schema/service VendorStatus surface**:

- Edit `backend/app/models/vendor.py` (delete enum + column declaration).
- Edit `backend/app/models/__init__.py` (drop re-export).
- Edit `backend/app/schemas/vendor.py` (delete enum + 2 field uses).
- Edit `backend/app/schemas/__init__.py` (drop re-export).
- Edit 8 production sites (per §5).
- Edit 1 seed-write + 6 seed-dict entries.
- `pytest tests/backend/pytest/architecture/test_vendor_status_drop_red.py` until GREEN.

**Step 6 — Update `_archivable.py` legacy_values + lock contracts**:

- Edit `backend/app/models/_archivable.py:60-64`.
- `make -f scripts/Makefile test-architecture-locks` — must GREEN.
- Verify `test_e2e_seed_archive_state_red.py` and `test_w8b_archivable_encapsulation_red.py` still GREEN.

**Step 7 — Doc updates (in same commit)**:

- `backend/app/models/README.md`
- `backend/app/services/_vendor_links/README.md`
- `docs/adr/ADR-005-archivable-mixin-schema-contract.md:13-16`
- `docs/adr/ADR-010-postgres-migration-rehearsal-contract.md:23-30`
- `docs/README.md:111-112`
- `docs/DOCUMENTATION_TREE.md:84`
- `docs/BUSINESS_LOGIC.md:619`

**Step 8 — Final validation gates**:

```sh
make -f scripts/Makefile test-architecture-locks
pytest -m postgres                    # Postgres lane
pytest tests/backend/pytest/test_vendors.py \
       tests/backend/pytest/test_vendor_links.py \
       tests/backend/pytest/test_kris_rbac.py \
       tests/backend/pytest/test_vendor_link_workflow_module.py \
       tests/backend/pytest/api/v1/test_collection_grouping_api.py \
       tests/backend/pytest/test_dashboard.py \
       tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py \
       tests/backend/pytest/test_e2e_seed_archive_state_red.py
mypy backend/app/
python3 scripts/security/validate_authz_capability_contract.py
```

Plus delete the 4 test scrubs:
- `tests/backend/pytest/test_vendors.py:436` `assert vendor.status == "active"`.
- `tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py:7, :37`.
- `tests/backend/pytest/test_dashboard.py:960, :970, :980`.

**Step 9 — Commit**:

- Single bundled commit titled `refactor(vendor): introduce AbstractVendorLink mixin and drop Vendor.status`.

**Postgres lane gate**: **YES** — `pytest -m postgres` is mandatory.
**Validator?** yes (check 2 + check 7; smoke).
**Mypy/ruff scope**: `backend/app/` (full backend; bundle touches models + schemas + services + endpoints).
**Total est. time per gate run**: **45–60 min** (largest single gate; full Postgres rehearsal).

---

## Domain: Frontend (#4, #5, #6, #22, #23, #32, #35, #36, #37, #39, #46, #47, #48, #64, #65, #66, #67, #68, #71)

### Item #14 (Master Seq 14) — #37 — Replace `_can_view_governance` mirror

- Step 1 RED command:
  `pytest tests/backend/pytest/test_users_summary_governance_canonical_red.py -q`
- Step 2 implementation files:
  - `backend/app/api/v1/endpoints/users/summary.py` (use `build_me_capabilities`)
  - `backend/app/services/_authorization_capabilities/perimeter.py` or canonical builder
  - `docs/security/authorization-capability-contract.md` (note single source of truth)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `pytest tests/backend/pytest -q -k "users_summary or me_capabilities"`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: **yes** (check 4 regression).
- Step 7 lint/type:
  `ruff check backend/app/api/v1/endpoints/users/ backend/app/services/_authorization_capabilities/`
  `mypy backend/app/api/v1/endpoints/users/ backend/app/services/_authorization_capabilities/`
- Postgres lane gate: no.
- Mypy/ruff scope: `users/` + `_authorization_capabilities/`.
- Total est. time per gate run: **6 min**.

### Item #17 (Master Seq 17) — #4 — Delete `controlFormWorkflow.ts`

- Step 1 RED command:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/components/control-form/__tests__/controlFormWorkflow.deleted.test.ts`
- Step 2 implementation files:
  - DELETE `frontend/src/components/control-form/controlFormWorkflow.ts`
  - `frontend/src/components/control-form/README.md`
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/components/control-form/`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type: `cd frontend && npx tsc --noEmit`
- Postgres lane gate: no.
- Mypy/ruff scope: none.
- Total est. time per gate run: **4 min**.

### Item #18 (Master Seq 18) — #5 — Delete `orphanResolutionPresentation.ts`

- Step 1 RED command:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/components/governance/__tests__/orphanResolutionPresentation.deleted.test.ts`
- Step 2 implementation files:
  - DELETE `frontend/src/components/governance/orphanResolutionPresentation.ts`
  - `frontend/src/components/governance/README.md`
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite: same as RED + neighboring suite.
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type: `cd frontend && npx tsc --noEmit`
- Postgres lane gate: no.
- Mypy/ruff scope: none.
- Total est. time per gate run: **4 min**.

### Item #19 (Master Seq 19) — #6 — Delete `notifications/resourcePath.ts`

- Step 1 RED command:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/components/notifications/__tests__/resourcePath.deleted.test.ts`
- Step 2 implementation files:
  - DELETE `frontend/src/components/notifications/resourcePath.ts`
  - `frontend/src/components/notifications/README.md`
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/components/notifications/`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type: `cd frontend && npx tsc --noEmit`
- Postgres lane gate: no.
- Mypy/ruff scope: none.
- Total est. time per gate run: **4 min**.

### Item #34 (Master Seq 34) — #35 — Delete `usePermissions` hook

- Step 1 RED command:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/hooks/__tests__/usePermissions.deleted.test.ts tests/frontend/unit/src/components/layout/__tests__/Sidebar.usePermissions.replaced.test.tsx`
- Step 2 implementation files:
  - DELETE `frontend/src/hooks/usePermissions.ts`
  - `frontend/src/components/layout/Sidebar.tsx:12, :25` (use `useAuth().hasPermission`)
  - 18 `vi.mock` test files (per Loop 1 §35)
  - `frontend/src/hooks/README.md`
  - `_naming_allowlist.toml` (drop entry if listed)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type: `cd frontend && npx tsc --noEmit`
- Postgres lane gate: no.
- Mypy/ruff scope: none.
- Total est. time per gate run: **9 min** (S; mechanical 18-file edit volume).

### Item #35 (Master Seq 35) — #36 — Refactor `BusinessRouteGuards.tsx`

- Step 1 RED command:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/routing/__tests__/BusinessRouteGuards.factory.test.tsx`
- Step 2 implementation files:
  - REWRITE `frontend/src/routing/BusinessRouteGuards.tsx` (typed factory)
  - 4 guards collapse into single factory call
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/routing/`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type: `cd frontend && npx tsc --noEmit`
- Postgres lane gate: no.
- Mypy/ruff scope: none.
- Total est. time per gate run: **5 min**.

### Item #36 (Master Seq 36) — #48 — Merge `getErrorMessageKey.ts` + `errorCodeMap.ts`

- Step 1 RED command:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/utils/__tests__/errorMessage.merged.test.ts`
- Step 2 implementation files:
  - MERGE 2 files into 1
  - 3 call sites repointed
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/utils/`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type: `cd frontend && npx tsc --noEmit`
- Postgres lane gate: no.
- Mypy/ruff scope: none.
- Total est. time per gate run: **4 min**.

### Item #37 (Master Seq 37) — #64 — Extract QueryClient defaults from `App.tsx`

- Step 1 RED command:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/services/api/__tests__/queryClient.test.ts`
- Step 2 implementation files:
  - NEW `frontend/src/services/api/queryClient.ts`
  - `frontend/src/App.tsx` (consume new module)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type: `cd frontend && npx tsc --noEmit`
- Postgres lane gate: no.
- Mypy/ruff scope: none.
- Total est. time per gate run: **4 min**.

### Item #38 (Master Seq 38) — #47 — Extract session-refresh retry policy

- Step 1 RED command:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/services/session/__tests__/RetryPolicy.test.ts`
- Step 2 implementation files:
  - NEW `frontend/src/services/session/RetryPolicy.ts`
  - `frontend/src/services/session/ApiClientCore.ts` (use new module)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/services/session/`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type: `cd frontend && npx tsc --noEmit`
- Postgres lane gate: no.
- Mypy/ruff scope: none.
- Total est. time per gate run: **4 min**.

### Item #39 (Master Seq 39) — #22 — Delete `ControlForm.tsx` shim

- Step 1 RED command:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/components/__tests__/ControlForm.shim.deleted.test.ts`
- Step 2 implementation files:
  - DELETE `frontend/src/components/ControlForm.tsx`
  - 3 prod importers + 3 test sites repointed
  - `frontend/src/components/control-form/README.md`
  - `.planning/audits/_context/03-frontend-architecture.md`
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/components/control-form/`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type: `cd frontend && npx tsc --noEmit`
- Postgres lane gate: no.
- Mypy/ruff scope: none.
- Total est. time per gate run: **5 min**.

### Item #40 (Master Seq 40) — #23 — Inline `controlFormUtils` helpers

- Step 1 RED command:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/components/control-form/__tests__/controlFormUtils.inline.test.ts`
- Step 2 implementation files:
  - DELETE `frontend/src/components/control-form/controlFormUtils.ts`
  - 3 consumers absorb helpers
  - `frontend/src/components/control-form/README.md`
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/components/control-form/`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type: `cd frontend && npx tsc --noEmit`
- Postgres lane gate: no.
- Mypy/ruff scope: none.
- Total est. time per gate run: **4 min**.

### Item #58 (Master Seq 58) — #32 — Extract generic vendor linked-entity tab

- Step 1 RED command:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/components/vendors/__tests__/useVendorLinkedEntityTab.contract.test.tsx tests/frontend/unit/src/components/vendors/__tests__/VendorLinkedEntityTab.duplication.test.ts`
- Step 2 implementation files:
  - NEW `frontend/src/components/vendors/useVendorLinkedEntityTab.ts`
  - NEW `frontend/src/components/vendors/VendorLinkedEntityTab.tsx`
  - REFACTOR 3 tabs (`VendorLinkedRisksTab.tsx`, `VendorLinkedControlsTab.tsx`, `VendorLinkedKRIsTab.tsx`)
  - `frontend/src/components/vendors/README.md`
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/components/vendors/`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type: `cd frontend && npx tsc --noEmit`
- Postgres lane gate: no.
- Mypy/ruff scope: none.
- Total est. time per gate run: **8 min** (M).

### Item #64 (Master Seq 64) — #46 — Promote resource query-key factories

- Step 1 RED command:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/services/api/__tests__/queryKeys.factory.test.ts`
- Step 2 implementation files:
  - NEW `frontend/src/services/api/queryKeys.ts` (typed factory module)
  - REPLACE 45 inline-literal sites in 22 files
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type: `cd frontend && npx tsc --noEmit`
- Postgres lane gate: no.
- Mypy/ruff scope: none.
- Total est. time per gate run: **20 min** (L; 22 files).

### Item #65 (Master Seq 65) — #65 — Extract `crudCapabilitySchema` shared Zod base

- Step 1 RED command:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/types/__tests__/crudCapabilitySchema.test.ts`
- Step 2 implementation files:
  - NEW `frontend/src/types/crudCapabilitySchema.ts`
  - REFACTOR 4 entity schemas (`risk`, `control`, `kri`, `vendor`)
  - `docs/security/capability-catalog.json` (verify pin)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/types/ tests/frontend/unit/src/authz/useAuthz.invariant.test.ts`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: **yes** (check 4 Pydantic↔Zod parity — DOMINANT failure mode).
- Step 7 lint/type: `cd frontend && npx tsc --noEmit`
- Postgres lane gate: no.
- Mypy/ruff scope: none.
- Total est. time per gate run: **10 min** (M).

### Item #66 (Master Seq 66) — #67 — Extract generic `useResourcePanelQuery`

- Step 1 RED command:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/hooks/__tests__/useResourcePanelQuery.test.ts`
- Step 2 implementation files:
  - NEW `frontend/src/hooks/useResourcePanelQuery.ts`
  - REFACTOR `useRiskHubConfigResource`
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/hooks/`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type: `cd frontend && npx tsc --noEmit`
- Postgres lane gate: no.
- Mypy/ruff scope: none.
- Total est. time per gate run: **6 min** (M).

### Item #67 (Master Seq 67) — #39 — Replace `admin/capabilities.py` static stub

- Step 1 RED command:
  `pytest tests/backend/pytest/test_admin_capabilities_real_builder_red.py -q`
- Step 2 implementation files:
  - NEW `backend/app/services/_authorization_capabilities/admin.py`
  - REWRITE `backend/app/api/v1/endpoints/admin/capabilities.py` (real builder; or remove after #40)
  - `docs/security/capability-catalog.json` (4 admin capabilities pinned)
  - `docs/security/authorization-capability-contract.md` (builder seam)
  - `docs/security/authorization-capability-contract.json` (sensitive_change_paths add)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `pytest tests/backend/pytest -q -k "admin_capabilities or AdminConsole"`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: **yes** (check 4 NEW fields — Pydantic↔Zod parity DOMINANT failure mode).
- Step 7 lint/type:
  `ruff check backend/app/services/_authorization_capabilities/ backend/app/api/v1/endpoints/admin/`
  `mypy backend/app/services/_authorization_capabilities/ backend/app/api/v1/endpoints/admin/`
- Postgres lane gate: no.
- Mypy/ruff scope: `_authorization_capabilities/` + `admin/`.
- Total est. time per gate run: **12 min** (M).

### Item #72 (Master Seq 72) — #66 — Split `AuthContext.tsx` into independent providers

- Step 1 RED command:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/contexts/__tests__/AuthContextSplit.test.tsx`
- Step 2 implementation files:
  - NEW `frontend/src/contexts/SessionContext.tsx`
  - NEW `frontend/src/contexts/PreferencesContext.tsx`
  - NEW `frontend/src/contexts/AuthActionsContext.tsx`
  - REFACTOR `frontend/src/contexts/AuthContext.tsx`
  - `scripts/security/authz_contract_manifest.py:13-63` (extend `FRONTEND_LOCAL_GATE_CLASSIFICATIONS`)
  - `docs/security/authorization-capability-contract.md:131`
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/contexts/ tests/frontend/unit/src/components/`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: **yes** (check 7 frontend local-gate per-file allowlist).
- Step 7 lint/type: `cd frontend && npx tsc --noEmit`
- Postgres lane gate: no.
- Mypy/ruff scope: none (FE-only).
- Total est. time per gate run: **12 min** (M).

### Item #73 (Master Seq 73 — see #40 above; this is the *frontend* slot)

(Already covered under "Crosscut" above as #40.)

### Item #73 (Master Seq 73) — #68 — Introduce `WidgetShell` + scoped query selector

- Step 1 RED command:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/components/widgets/__tests__/WidgetShell.test.tsx`
- Step 2 implementation files:
  - NEW `frontend/src/components/widgets/WidgetShell.tsx`
  - Dashboard widget refactors
  - `docs/security/authorization-capability-contract.md` (no contract change expected)
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/components/widgets/ tests/frontend/unit/src/pages/__tests__/DashboardPage*.test.tsx`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type: `cd frontend && npx tsc --noEmit`
- Postgres lane gate: no.
- Mypy/ruff scope: none.
- Total est. time per gate run: **8 min** (M).

### Item #75 (Master Seq 75) — #71 — Merge `services/session/` 8 files → 4

- Step 1 RED command:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/services/session/__tests__/sessionLifecycle.test.ts`
- Step 2 implementation files:
  - MERGE 8 files into 4 (per Loop 1 §71)
  - Single-flight pin updated
- Step 3 GREEN command: same as Step 1.
- Step 4 domain suite:
  `cd frontend && npm run test:run -- --runInBand tests/frontend/unit/src/services/session/`
- Step 5 architecture-locks: `make -f scripts/Makefile test-architecture-locks`.
- Step 6 contract validator: no.
- Step 7 lint/type: `cd frontend && npx tsc --noEmit`
- Postgres lane gate: no.
- Mypy/ruff scope: none.
- Total est. time per gate run: **8 min** (M).

---

## Summary tables

### Postgres-lane gate items (1 item, but covers 2 work units atomic)

- **#69 + #70 atomic bundle (Master Seq 76 + 77)** — single migration window;
  `pytest -m postgres` mandatory. See 9-step migration sequence above.

### Validator-required items (16 items)

| Master Seq | Item | Domain | Validator concern |
|---:|---|---|---|
| 13 | #15  | endpoints | check 4 (NEW catalog surface, 7 fields) |
| 8  | #13  | vendor    | check 2 + 7 |
| 41 | #55  | crosscut  | check 2 + 7 |
| 44 | #56  | crosscut  | check 2 + 7 |
| 45 | #61  | crosscut  | check 2 + 7 |
| 42 | #24+#51 | kris | check 2 + 7 (atomic; 5 md cells + 5 json strings) |
| 22 | #50  | kris      | check 2 + 7 |
| 69 | #62  | kris      | check 2 + 7 |
| 50 | #34  | approvals | check 5 (Vocabulary) |
| 74 | #60  | approvals | check 5 (Vocabulary) |
| 14 | #37  | frontend(BE) | check 4 (regression) |
| 67 | #39  | frontend(BE) | check 4 (NEW admin fields) |
| 65 | #65  | frontend  | check 4 (Pydantic↔Zod parity) |
| 72 | #66  | frontend  | check 7 (FE local-gate allowlist) |
| 76+77 | #69+#70 | vendor | check 2 + 7 (smoke) |
| 6  | #57  | vendor    | check 2 + 7 (defensive) |

### Items with NO new test (DOC-ONLY items)

The following items are doc-only or doc-dominant; their "Step 1 RED" is a
**module-must-exist** structural assertion (verify a file/lock exists) or a
docstring/lock-text edit, not a behavioural test:

- **#10 (Reject)** — `riskhub_questionnaires.py` module presence (Master Seq 5).
- **#57 (Reject; doc-only branch)** — `quarterly_comparison_service.py` facade keep (Master Seq 6).
- **#20** — Risk ID generation co-location (DOC-ONLY) (Master Seq 28).
- **#72** — ADR-011 (Master Seq 1) — RED is an ADR-file-presence test.
- **#73** — ADR-012 (Master Seq 2) — RED is an ADR-file-presence test.
- **#74a** — ADR-007 census (Master Seq 3) — RED is a TOML-presence test.
- **#74b** — ADR-007 amendment text (Master Seq 74) — RED is amendment-section presence.
- **#33** — frontend banner unify (Master Seq 33) is **NOT** doc-only; behavioural FE test required.

(Net: **7 items** are effectively doc-only; remaining 70 require new
behavioural or structural pytest/vitest tests.)

### Atomic clusters → single-commit gate runs

| Cluster | Items (Master Seq) | Single Step 5 + 6 + 7 run per cluster |
|---|---|---|
| **#24+#51 (KRI atomic)** | Master Seq 42, 43 | yes (atomic single commit) |
| **#56+#61 (graph_directory atomic)** | Master Seq 44, 45 | yes (atomic single commit) |
| **#69+#70 (Vendor migration atomic)** | Master Seq 76, 77 | yes (9-step migration sequence) |

### Hub waves → sequential commits, separate gate runs

| Hub | Items | Cadence |
|---|---|---|
| **Approvals privilege tier** | #9 → #34 → #60 (Master Seq 49 → 50 → 74) | 3 separate commits, 3 separate gate runs |
| **Frontend query-keys** | #46 → {#65, #67, #68} (Master Seq 64 → 65, 66, 73) | #46 first (1 gate run), then siblings |
| **Endpoints monitoring** | #17 → #49 → #59 (Master Seq 46 → 47 → 48) | 3 separate commits, 3 separate gate runs |

---

## Recommended `scripts/dev/precommit-{ID}.sh` template

Below is the canonical precommit template the developer can fill per item.
Drop into `scripts/dev/precommit-template.sh` and copy per item with
substitutions. The template captures all 7 gate steps in order; the
optional Postgres-lane and validator blocks are commented out by default.

```sh
#!/usr/bin/env bash
# scripts/dev/precommit-template.sh
# Pre-commit gate for item #<ID>.
# Replace the variables below; uncomment optional blocks as needed.
set -euo pipefail

ITEM_ID="<ID>"                 # e.g. "13", "24+51", "69+70"
RED_TEST_PATH="<pytest path>"  # e.g. tests/backend/pytest/architecture/test_<x>_red.py
DOMAIN_SUITE="<pytest path>"   # e.g. tests/backend/pytest/test_vendors.py
TOUCHED_BACKEND_PATHS="<paths>"   # e.g. backend/app/services/_kri_history
TOUCHED_FRONTEND_PATHS="<paths>"  # e.g. frontend/src/components/control-form
NEEDS_VALIDATOR="<yes|no>"     # capability-contract surface touched?
NEEDS_POSTGRES_LANE="<yes|no>" # vendor migration bundle only

cd "$(git rev-parse --show-toplevel)"

echo "==> Step 1: RED test confirmation (pre-implementation)"
pytest "$RED_TEST_PATH" -q && {
  echo "ERROR: RED test passed before implementation; not a true RED. Stop."; exit 1;
}

echo "==> [pause for Step 2 implementation; re-invoke this script after edits]"
read -r -p "Press ENTER once code/lock/doc edits are staged..."

echo "==> Step 3: GREEN test confirmation"
pytest "$RED_TEST_PATH" -q

echo "==> Step 4: Domain test suite"
pytest "$DOMAIN_SUITE" -q

echo "==> Step 5: Architecture locks"
make -f scripts/Makefile test-architecture-locks

if [ "$NEEDS_VALIDATOR" = "yes" ]; then
  echo "==> Step 6: Capability contract validator"
  python3 scripts/security/validate_authz_capability_contract.py
fi

echo "==> Step 7: Lint + type (delta-only)"
if [ -n "$TOUCHED_BACKEND_PATHS" ]; then
  ruff check $TOUCHED_BACKEND_PATHS
  mypy $TOUCHED_BACKEND_PATHS
fi
if [ -n "$TOUCHED_FRONTEND_PATHS" ]; then
  ( cd frontend && npx tsc --noEmit )
fi

if [ "$NEEDS_POSTGRES_LANE" = "yes" ]; then
  echo "==> Postgres lane gate"
  pytest -m postgres -q
fi

echo "==> Pre-commit gate for #${ITEM_ID} PASSED. Safe to commit."
```

For ADR items (#72, #73, #74a, #74b), substitute Step 4–7 with:

```sh
make -f scripts/Makefile test-architecture-locks
python3 scripts/security/validate_authz_capability_contract.py   # smoke
make docs-tree-audit
```

---

## Risk register (gate-failure modes)

- **#24+#51 atomic** — highest doc-edit volume single commit. Run validator
  twice per Loop 2 A5 risk register: once after staging file deletes, once
  after staging doc edits.
- **#39 (admin builder)** — first NEW catalog surface (`admin_console`).
  Pydantic↔Zod parity (check 4) requires atomic Pydantic + Zod edit.
- **#65 (crudCapabilitySchema)** — `passthroughObject({...}).merge(...)`
  composition must produce the same brace-matched body that
  `_extract_typescript_schema_body` walks. Verify field-set equality before
  landing.
- **#69+#70 (vendor migration)** — Postgres lane mandatory; pre-merge run on
  refreshed staging clone with row-count capture. ADR-010 forward-only:
  `downgrade()` raises NotImplementedError; restore from snapshot on failure.
- **#34 (privilege tier hub)** — 16 files / 22+ sites; the only single-commit
  gate that touches the entire approvals hub at once. Validator + locks
  + 16-file lint must all be GREEN before commit.

---

## Total estimated gate-run time across all 77 items

Sum of estimated minutes per gate run (one gate per commit):

| Bucket | Item count | Min/gate (avg) | Total min |
|---|---:|---:|---:|
| ADRs (doc-only) | 4 | 6 | 24 |
| Quick-win deletes (S/P2) | 36 | 5 | 180 |
| M-effort items (P2/P3) | 27 | 9 | 243 |
| L-effort items (#46) | 1 | 20 | 20 |
| FE auth chain (#37, #39, #66, #71) | 4 | 12 | 48 |
| Approvals hub wave (#9, #34, #60) | 3 | 12 | 36 |
| Vendor migration bundle (#69+#70 atomic) | 1 (gate) | 50 | 50 |
| Issues structural chain (#2 → #8 → #28 → #30 + #14, #27, #29, #41, #53) | 9 | 7 | 63 |

**Aggregate gate-run cost across 77 commits**: **~664 minutes** (~11 hours)
of pure local gate-running over the whole campaign.

This excludes the implementation time itself (Loop 2 estimate: ~484 dev-hours)
and CI runs. A single sequential developer should plan for **~11 hours of
local gate execution** spread across **~77 commits** = ~8.6 minutes per
commit on average.

End of pre-commit gate runbook.
