# Phase 3 Loop 1 — Endpoint surface plan

Date: 2026-05-09
Domain: Endpoint surface (questionnaires, monitoring, reports projection,
users-summary, control monitoring, orphaned items, outbox dispatcher,
control-risk loader).
Mode: TDD step skeletons. No production edits, no gate runs.
Quote rule: ≤15 words; every claim cites `file:line`.

Constraints in force: TDD red-first, single developer sequential, doc/lock-only
rejects invalid, effort scale S/M/L/XL.

---

## Item #10 — S8.5 — Keep `riskhub_questionnaires.py` (live route + FE caller)

- **Final disposition:** KEEP module + 1 route. Schema move handled under #38.
- **Dependencies (in-domain):** #38 (move 3 inline schemas
  `riskhub_questionnaires.py:17-34` to `backend/app/schemas/riskhub.py`).
- **Cross-domain prerequisites:** none. Doc anchors at `AGENTS.md:162`,
  `docs/agent/ENDPOINT_INVARIANTS.md:13`, `.planning/codebase/CONCERNS.md:9`,
  `.planning/codebase/TESTING.md:70`, `tests/backend/pytest/api/v1/README.md:25`
  must remain referencing the file.
- **TDD shape:** module-presence assertion + behavioral regression that the
  Send button still drives the route end-to-end. (Pattern from
  `architecture/test_w11b_test_infra_polish_red.py:63-66` for "module
  must remain"; behavioral pattern from
  `tests/backend/pytest/api/v1/test_riskhub_questionnaires.py`).
- **Failing test(s) to write FIRST:**
  1. `tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py`
     — assert
     `(REPO_ROOT / "backend/app/api/v1/endpoints/riskhub_questionnaires.py").exists()`
     **and** import `app.api.v1.endpoints.riskhub_questionnaires` and
     `assert hasattr(module, "router")`. Marked
     `pytestmark = pytest.mark.contract` per
     `architecture/test_w11b_test_infra_polish_red.py:32-43`.
  2. (Optional, doc-anchored) Extend
     `tests/backend/pytest/api/v1/test_riskhub_questionnaires.py` with a single
     new case naming the file's purpose ("CRO-only `POST
     /api/v1/riskhub/questionnaires/batch-send`") to lock the route's
     observable behavior — RED until purpose docstring is in place.
  Both must FAIL before any code edit.
- **Code/file changes:** add module-purpose docstring to
  `backend/app/api/v1/endpoints/riskhub_questionnaires.py:1` (replace `"""Risk
  Hub questionnaire endpoints (CRO-only batch send)."""` with extended one
  that names the route, FE caller path, and prevents future "0 routes" mis-flag).
  No code logic changes.
- **Lock/TOML/contract updates:** none for KEEP. The new architecture lock
  registers the file's required presence (mirrors the dead-facade lock
  pattern at `architecture/test_w11b_test_infra_polish_red.py:18-25,63-66`,
  inverted to "must exist").
- **README / doc updates:** none required (file is staying). Optionally clarify
  in `backend/app/api/v1/endpoints/README.md` that `riskhub_questionnaires.py`
  is a sibling-of-package single file with one CRO route.
- **Verification commands:** `make -f scripts/Makefile test-architecture-locks`
  (the new presence-lock runs here); `cd backend && ./venv/bin/pytest -q
  ../tests/backend/pytest/api/v1/test_riskhub_questionnaires.py`.
- **Commit boundary:** ONE commit. "Lock riskhub_questionnaires module presence
  and document purpose."
- **Rollback note:** revert single commit. No data, no migrations.
- **Effort:** S.

---

## Item #12 — D-N3 — Narrow blanket-except in `users/summary.py`

- **Final disposition:** NARROW two `except Exception:` blocks at
  `summary.py:48` and `summary.py:62`. Loop-B critical correction: real raise
  is `HTTPException(403)` from `_permissions/evaluation.py:53`, NOT
  `AuthorizationError`.
- **Dependencies (in-domain):** none.
- **Cross-domain prerequisites:** verify `count_questionnaire_inbox`
  (`backend/app/services/_risk_questionnaires/repository.py:91`) call-graph
  raises only `SQLAlchemyError`/`HTTPException`/domain errors before union
  is finalized. ADR-003 `EXCEPTION_REGISTRY`
  (`architecture/test_w4_exception_registry_completeness_red.py`) is
  authoritative for the union spelling.
- **TDD shape:** behavioral red — synthesize a downstream raise of an
  unrelated exception type (e.g. `ZeroDivisionError`) inside
  `_count_questionnaire_inbox` via test double, assert the endpoint
  propagates (currently swallowed). Plus a positive case: an
  `HTTPException(403)` from `ensure_business_view_access` still degrades
  silently to `can_view_governance == False`.
- **Failing test(s) to write FIRST:**
  1. `tests/backend/pytest/api/v1/test_users_summary_blanket_except_red.py`
     — case A: monkeypatch `_count_questionnaire_inbox` to raise
     `ZeroDivisionError`; expect HTTP 500 (current code swallows → 200).
     Case B: keep `HTTPException(403)` path; expect 200 with
     `can_view_governance=False`.
  2. (Optional architecture lock) AST scan
     `tests/backend/pytest/architecture/test_users_summary_narrow_excepts_red.py`
     — forbid `except Exception:` substring inside
     `backend/app/api/v1/endpoints/users/summary.py` (pattern:
     `architecture/test_w9_schema_datetime_ban.py:11-24`).
- **Code/file changes:**
  - `summary.py:48` narrow `except Exception:` → `except HTTPException:`
    (matches `_permissions/evaluation.py:53` raise type). Keep return-False
    semantics.
  - `summary.py:62` narrow `except Exception:` → `except (HTTPException,
    SQLAlchemyError):` (questionnaire-inbox path: HTTPException from upstream
    permission filter, SQLAlchemyError from `db.execute`). Verify against
    `app.core.exceptions` registry; if `NotFoundError`/`AuthorizationError`
    are reachable, extend tuple.
  - Optional: route `_can_view_governance` through `Capabilities.can(...)` per
    `backend/app/services/_authorization_capabilities/perimeter.py` — but only
    if it removes the try/except entirely (Capabilities returns bool, never
    raises). Loop-B correction means we should NOT presume a refactor that
    converts the upstream raise to `AuthorizationError`; that is a separate
    decision under `EXCEPTION_REGISTRY`.
- **Lock/TOML/contract updates:** if we add the optional architecture lock,
  it must declare `pytestmark = pytest.mark.contract`.
- **README / doc updates:** none.
- **Verification commands:** `cd backend && ./venv/bin/pytest -q
  ../tests/backend/pytest/api/v1/test_users_summary_blanket_except_red.py`;
  `make -f scripts/Makefile test-architecture-locks`.
- **Commit boundary:** ONE commit. "Narrow blanket-except in users summary
  endpoint."
- **Rollback note:** single commit revert; no migrations.
- **Effort:** S.

---

## Item #15 — D-N2 — Add `access_user` capability surface to catalog

- **Final disposition:** ADD `access_user` as 8th surface in
  `docs/security/capability-catalog.json`. 7 fields exist at
  `backend/app/schemas/access.py:66-72`. Catalog currently declares only
  `capabilities`, `me_capabilities`, `risk`, `control`, `kri`, `issue`,
  `vendor` (per Loop-B `verify-loop-b-07-endpoints.md:110-116`). FE mirror
  is `frontend/src/types/access.ts:51`.
- **Dependencies (in-domain):** none.
- **Cross-domain prerequisites:** Domain 8 (docs surface) lock at
  `docs/security/authorization-capability-contract.md` matrix update.
  Validator at `scripts/security/validate_authz_capability_contract.py`
  is the gate. Architecture lock
  `architecture/test_authz_contract_doc_drift_red.py` reads the contract
  doc — verify added section does not break its substring assertions.
- **TDD shape:** structural red — assert catalog declares an `access_user`
  surface citing `backend/app/schemas/access.py` and
  `frontend/src/types/access.ts` and listing all 7 capability flags. Plus a
  separate empirical run of the validator (per Loop-A `verify-loop-a-07-
  endpoints.md` and CLAUDE.md "Authorization-sensitive changes must pass…").
- **Failing test(s) to write FIRST:**
  1. `tests/backend/pytest/architecture/test_capability_catalog_access_user_surface_red.py`
     — load `docs/security/capability-catalog.json`; assert there exists an
     entry with `id == "access_user"`, that its `backend.path` references
     `backend/app/schemas/access.py`, that its `frontend.path` references
     `frontend/src/types/access.ts`, and that the catalog lists all 7 known
     fields (`can_edit_identity`, `can_edit_business_access`,
     `can_edit_role`, `can_deactivate`, `can_change_active_status`,
     `can_break_glass_enable`, `can_revoke_sessions`). Marked
     `pytestmark = pytest.mark.contract`. RED until catalog updated.
  2. (Empirical) wrap
     `python3 scripts/security/validate_authz_capability_contract.py` in a
     subprocess test that expects exit 0 (already required by AGENTS.md:205).
- **Code/file changes:**
  - `docs/security/capability-catalog.json` — add `access_user` surface
    object with the 7 fields, backend/frontend paths, and any catalog-shape
    metadata (mirror existing `risk`/`control` entries per Loop-A
    `verify-loop-a-07-endpoints.md:132-138`).
  - `docs/security/authorization-capability-contract.md` — add row in
    capability matrix referencing `access_user` (catalog-doc cross-link
    enforced by `architecture/test_authz_contract_doc_drift_red.py`).
- **Lock/TOML/contract updates:** none in `architecture/_*.toml`. The new
  architecture test uses a hardcoded set of 7 expected field names (Pattern
  I — `architecture/test_w12_issue_status_automation_lock_red.py:36-52`).
- **README / doc updates:** matrix update in
  `docs/security/authorization-capability-contract.md`. Verify
  `architecture/test_w11_docs_index_completeness_red.py` substring
  assertions still pass — add `access_user` to the contract doc but do NOT
  remove existing referenced needles.
- **Verification commands:** `make -f scripts/Makefile
  test-architecture-locks`; `python3
  scripts/security/validate_authz_capability_contract.py`.
- **Commit boundary:** ONE commit. "Add access_user surface to capability
  catalog."
- **Rollback note:** revert doc/test changes; no schema migrations.
- **Effort:** M.

---

## Item #17 — S2.1 — Delete-and-repoint `_monitoring_response` 25-line shim

- **Final disposition:** DELETE
  `backend/app/api/v1/endpoints/_monitoring_response.py` after retargeting
  14 importers to `app.services._monitoring_response`. (Note: per Loop-B
  `verify-loop-b-07-endpoints.md:124-128`, fresh grep shows 14 importers;
  `_monitoring_response` package directory does not yet exist as a
  filesystem dir — see "spot check" below; the `from
  app.services._monitoring_response import ...` import target must be
  verified to be importable before deletion.)
- **Dependencies (in-domain):** Domain 5 cross-link (#59 sequencing depends
  on this). #49 should follow.
- **Cross-domain prerequisites:** verify
  `backend/app/services/_monitoring_response/__init__.py` (or a `.py`
  module) actually exports the 9 names re-exported at
  `endpoints/_monitoring_response.py:3-13`
  (`MonitoringResponseContext`, `build_control_monitoring_fields`,
  `build_kri_monitoring_fields`, `load_monitoring_response_context`,
  `serialize_control_brief_for_link`, `serialize_control_read`,
  `serialize_control_risk_link`, `serialize_kri_response`,
  `serialize_risk_read`). The plan is contingent on this — if not, this
  item becomes XL.
- **TDD shape:** module-absent lock plus "no importer references shim"
  forbidden-import scan.
- **Failing test(s) to write FIRST:**
  1. `tests/backend/pytest/architecture/test_monitoring_response_shim_removed_red.py`
     — assert
     `not (REPO_ROOT / "backend/app/api/v1/endpoints/_monitoring_response.py").exists()`
     **and** zero files under `backend/app/api/v1/endpoints/` contain the
     string `from app.api.v1.endpoints._monitoring_response import` (forbid
     the import pattern; mirrors `architecture/test_w6_bc_d_register_listing_centralization.py:39-45`).
  2. Marked `pytestmark = pytest.mark.contract` (per `test_w11b:32-43`).
  3. RED before any code edit.
- **Code/file changes:**
  - Edit each of the 14 importers (per Loop-B fresh grep:
    `controls/crud/{create,detail,restore}.py`, `controls/linking.py`,
    `departments/{controls,kris}.py`, `kris/crud/{breaches,create,detail,
    restore}.py`, `risks/control_links.py:4`,
    `risks/crud/{create,detail,restore}.py`) — replace
    `from app.api.v1.endpoints._monitoring_response import ...` →
    `from app.services._monitoring_response import ...`.
  - Delete `backend/app/api/v1/endpoints/_monitoring_response.py`.
- **Lock/TOML/contract updates:** none in TOML registries (no current TOML
  references this shim).
- **README / doc updates:** none — shim is internal infrastructure; not
  cited in any README per Domain 8 map.
- **Verification commands:** `make -f scripts/Makefile
  test-architecture-locks`; `cd backend && ./venv/bin/pytest -q
  ../tests/backend/pytest/api/v1/`.
- **Commit boundary:** ONE commit. "Delete endpoints/_monitoring_response
  shim and repoint 14 importers."
- **Rollback note:** revert single commit; the shim is a pure re-export, so
  rollback fully restores previous import path.
- **Effort:** S.

---

## Item #21 — S2.6 — Collapse Control-Risk link loader duplicates

- **Final disposition:** COLLAPSE `load_link_for_control` and
  `load_link_for_risk` in
  `backend/app/services/_control_execution/link_policy.py:22,35` into a
  single keyword-only helper `load_link(*, control_id, risk_id)`. Both
  current bodies execute identical queries with kwargs in different orders
  and raise identical `HTTPException(404, "Link not found")` (lines
  29-32 and 42-45).
- **Dependencies (in-domain):** none.
- **Cross-domain prerequisites:** none. Two callers in
  `backend/app/services/_control_execution/link_governance.py:102` and
  `:181` use `load_link_for_control` / `load_link_for_risk` — both must
  swap to `load_link(...)`. Architecture deepening contract at
  `tests/backend/pytest/test_architecture_deepening_contracts.py` does not
  pin these names (lock binds `load_control_for_link`,
  `load_risk_for_link`, `assert_*_for_link` — verified via
  `:188-192`-context grep). Confirm no external test/import binds
  the per-direction names.
- **TDD shape:** structural — assert `load_link` exists and the two
  per-direction names are removed; behavioral — assert both former call
  sites still return the link or raise 404.
- **Failing test(s) to write FIRST:**
  1. `tests/backend/pytest/architecture/test_control_risk_link_loader_collapsed_red.py`
     — `from app.services._control_execution import link_policy`; assert
     `hasattr(link_policy, "load_link")` and not
     `hasattr(link_policy, "load_link_for_control")` and not
     `hasattr(link_policy, "load_link_for_risk")`. Marked contract.
  2. Add a regression test in `tests/backend/pytest/test_risks.py`-style
     for `delete_risk_control_link` / `delete_control_risk_link` covering
     the 404 branch for both directions (these exercise the consolidated
     loader).
- **Code/file changes:**
  - Replace `link_policy.py:22-32` and `:35-45` with single
    `async def load_link(db: AsyncSession, *, control_id: int, risk_id: int)`.
  - Update 2 callers in `link_governance.py:102, 181`.
- **Lock/TOML/contract updates:** none.
- **README / doc updates:** none.
- **Verification commands:** `make -f scripts/Makefile
  test-architecture-locks`; `cd backend && ./venv/bin/pytest -q
  ../tests/backend/pytest/test_risks.py`.
- **Commit boundary:** ONE commit. "Collapse control-risk link loaders into
  load_link."
- **Rollback note:** revert single commit.
- **Effort:** S.

---

## Item #38 — S8.6 — Move 8 inline endpoint Pydantic models to schemas

- **Final disposition:** MOVE 8 models from 3 endpoint modules to
  `backend/app/schemas/`. Creation requirements:
  - `backend/app/schemas/health.py` (NEW, 3 models from
    `endpoints/health.py:16-35`).
  - `backend/app/schemas/preferences.py` (NEW, 2 models from
    `endpoints/preferences.py:15-40`) — alternate: fold into existing
    `backend/app/schemas/user.py`. PLAN ELECTS NEW FILE for separation of
    concerns (preferences != identity).
  - `backend/app/schemas/riskhub.py` (EXISTS) — extend with 3 models from
    `endpoints/riskhub_questionnaires.py:17-34`. Loop-B note: rename
    generic `RiskFilters` → `BatchSendRiskFilters` to avoid collision with
    risk-query schemas (per `verify-loop-b-07-endpoints.md:42-49,156-157`).
- **Dependencies (in-domain):** #10 (must keep `riskhub_questionnaires.py`
  alive). Sequence: do #10 lock first; then #38; do not delete the file.
- **Cross-domain prerequisites:** none. Lock at
  `architecture/test_w9_schema_datetime_ban.py` is the only schema-side
  invariant; Loop-B confirms none of the 8 models use bare `datetime`
  imports — move is safe.
- **TDD shape:** import-from-schemas red — assert the new schema modules
  contain the 8 model classes; assert endpoint modules no longer define
  them inline.
- **Failing test(s) to write FIRST:**
  1. `tests/backend/pytest/architecture/test_endpoint_inline_pydantic_evicted_red.py`
     — AST scan endpoint files; for the 3 listed endpoints, assert no
     `class <Name>(BaseModel):` definitions at module level for the 8
     names; assert `from app.schemas.<target> import <Name>` import is
     present. Plus assert `app.schemas.health`, `app.schemas.preferences`,
     `app.schemas.riskhub` each export the expected names. Pattern:
     `architecture/test_dashboard_threshold_contract_red.py:18-29` (AST
     name-blocklist). Marked contract.
- **Code/file changes:**
  - Create `backend/app/schemas/health.py` containing
    `LivenessResponse`, `ReadinessResponse`, `HealthResponse`. Apply
    `UtcAwareDatetime` if any datetime fields are added (none currently).
  - Create `backend/app/schemas/preferences.py` containing
    `PreferencesUpdate`, `PreferencesResponse`.
  - Extend `backend/app/schemas/riskhub.py` with `BatchSendRiskFilters` (was
    `RiskFilters`), `BatchSendRequest`, `BatchSendResponse`.
  - Edit `endpoints/health.py:16-35` — delete inline classes, add `from
    app.schemas.health import ...`. Same for `endpoints/preferences.py:15-40`
    and `endpoints/riskhub_questionnaires.py:17-34`. Update internal
    references (e.g., `BatchSendRequest` field type in
    `riskhub_questionnaires.py:37,38,40,42`).
- **Lock/TOML/contract updates:** if `RiskFilters` rename lands, update any
  FE schema-mirror that hardcodes the name (verify
  `frontend/src/services/api/schemas/`).
- **README / doc updates:** none required.
- **Verification commands:** `make -f scripts/Makefile
  test-architecture-locks`; `cd backend && ./venv/bin/pytest -q
  ../tests/backend/pytest/api/v1/test_riskhub_questionnaires.py
  ../tests/backend/pytest/test_health.py`.
- **Commit boundary:** ONE commit. Optional split: 1 commit per endpoint
  module if test pressure favors smaller diffs (still M).
- **Rollback note:** revert commit; schemas can stay unused if rollback
  partially landed.
- **Effort:** M.

---

## Item #43 — BE-N4 — Extract audit adapter-emitter helper (additive)

- **Final disposition:** ADD a single helper (e.g.
  `backend/app/core/audit/_emit.py::emit_adapter(...)`) that captures the
  9-arg `await log_activity_func(...)` boilerplate. Apply to 37
  `[[adapter]]` rows (Loop-B: `_audit_matrix.toml` count is 37, not 38).
  CRITICAL preservation: each named function in
  `backend/app/core/audit/<module>.py` MUST remain as a module-level `def`
  to satisfy `architecture/test_w7_audit_adapter_completeness_red.py:13`
  (every `(module, function)` row in `_audit_matrix.toml` must have a
  matching `def`). Helper is invoked **inside** each existing `def`, not
  used to delete the `def`.
- **Dependencies (in-domain):** none.
- **Cross-domain prerequisites:** none. The lock at
  `architecture/test_w7_audit_safe_entity_label_red.py` requires
  `safe_entity_label=` keyword on every `log_activity*` call — helper
  must propagate this kwarg, not hide it.
- **TDD shape:** structural — helper exists, has expected signature; per-
  module `def`s still exist; behavioral — adapter activity rows
  still get logged with all 9 fields (entity_type, entity_id,
  entity_name, safe_entity_label, action, actor, department_id,
  changes?, description?).
- **Failing test(s) to write FIRST:**
  1. `tests/backend/pytest/architecture/test_audit_adapter_emitter_helper_red.py`
     — assert helper module exists, has expected signature; for each of
     the 37 `(module, function)` rows in `_audit_matrix.toml`, assert
     `inspect.getsource(<module>.<function>)` contains the helper
     invocation token (e.g., `emit_adapter(`). Marked contract. RED until
     all 37 functions are switched.
  2. Behavioral test in `tests/backend/pytest/test_w7_audit_*` family
     covering one canonical adapter (e.g. `control_created`) — assert
     activity row fields match prior expectations.
- **Code/file changes:**
  - Create `backend/app/core/audit/_emit.py` with `async def emit_adapter(db, *, entity_type, entity_id, entity_name, safe_entity_label, action, actor, department_id, changes=None, description=None, log_activity_func=log_activity, safe_description=None, safe_description_siem=None) -> None`.
  - In each adapter (`risk.py`, `control.py`, `kri.py`, `issue.py`,
    `approval.py`, `vendor.py`), replace the 9-arg call with
    `await emit_adapter(db, entity_type=..., entity_id=..., ...)`. The
    `def` names (e.g. `control_created` at `audit/control.py:23`) MUST
    remain at module level.
- **Lock/TOML/contract updates:** none. `_audit_matrix.toml` rows do not
  change.
- **README / doc updates:** optional — note helper in
  `backend/app/core/audit/` README if one exists (not currently per
  Domain 8 map; skip).
- **Verification commands:** `make -f scripts/Makefile
  test-architecture-locks`; `cd backend && ./venv/bin/pytest -q
  ../tests/backend/pytest/test_w7_audit_*`.
- **Commit boundary:** ONE commit ("Extract audit adapter emit helper")
  OR 2-3 commits split by adapter module if individual diffs exceed
  ~150 LOC. Prefer ONE if test suite stays green per-module.
- **Rollback note:** revert single commit; helper is additive.
- **Effort:** M.

---

## Item #44 — BE-N6 — Centralize guarded path-prefix registry

- **Final disposition:** ADD a registry data structure (TOML or Python)
  that maps `module_name → {prefix, tags, dual_router?}` and lock it via
  architecture test. Loop-B: 27 `include_router` calls (Phase 1 said 28,
  off-by-one). 3 prefix patterns coexist; `risk_questionnaires` is
  registered TWICE at `router.py:44` (`.risk_router` /risks) and `:60`
  (`.router` /questionnaires) — registry must support dual-router
  modules.
- **Dependencies (in-domain):** none.
- **Cross-domain prerequisites:** must not weaken
  `architecture/test_w3_gate_snapshot.py` (4 `(method, path) →
  capability` mappings).
- **TDD shape:** registry-existence + parity — assert registry file
  exists, parses, and that walking `api_router.routes` produces a prefix
  set that matches the registry exactly.
- **Failing test(s) to write FIRST:**
  1. `tests/backend/pytest/architecture/test_router_prefix_registry_red.py`
     — load registry (e.g.
     `backend/app/api/v1/_router_registry.toml`); collect actual
     prefix-tags from `app.api.v1.router.api_router` via
     `route.path_format` introspection (pattern from
     `architecture/test_w3_gate_snapshot.py:11-32`); assert set equality
     between registry-declared and actual. Schema must support
     `dual_router = true` for `risk_questionnaires`. Marked contract.
- **Code/file changes:**
  - Create `backend/app/api/v1/_router_registry.toml` with one section
    per module (24 single-router + 1 dual = 25 logical entries covering
    27 `include_router` calls). Each entry carries `module`, `prefix`
    (or `prefix_owner = "module"|"aggregator"`), `tags`,
    `dual_router?`.
  - Optional: refactor `backend/app/api/v1/router.py:32-60` to read the
    registry and emit `include_router` calls in a loop. Plan defers
    refactor to a follow-up — registry + lock first.
- **Lock/TOML/contract updates:** new TOML registry under
  `backend/app/api/v1/_router_registry.toml`. Architecture test must
  declare `pytestmark = pytest.mark.contract`.
- **README / doc updates:** add an "Endpoint registry" subsection in
  `backend/app/api/v1/endpoints/README.md` referencing the new TOML.
- **Verification commands:** `make -f scripts/Makefile
  test-architecture-locks`; `cd backend && ./venv/bin/pytest -q
  ../tests/backend/pytest/architecture/test_w3_gate_snapshot.py`.
- **Commit boundary:** ONE commit ("Add router prefix registry").
- **Rollback note:** revert commit; registry is additive metadata.
- **Effort:** M.

---

## Item #49 — S2.2 — Inline `_control_execution/monitoring.py` wrapper

- **Final disposition:** INLINE the 11-line (Loop-B count, not 12)
  wrapper at `backend/app/services/_control_execution/monitoring.py:9-11`
  into 4 callers in `link_governance.py:62, 91, 141, 170`. Both the
  module file and the import path must be removed in the SAME commit; the
  lock at `tests/backend/pytest/test_architecture_deepening_contracts.py:188`
  asserts `hasattr(monitoring, "load_control_execution_monitoring_context")`
  and `:192` asserts the import string `"from
  app.services._control_execution.monitoring"` exists in
  `link_governance` source. Both assertions must change in step.
- **Dependencies (in-domain):** sequence after #17 (shim deletion). #59
  depends on this.
- **Cross-domain prerequisites:** verify `app.services._monitoring_response`
  exposes `load_monitoring_response_context` directly (used inline:
  `now = utc_now(); await load_monitoring_response_context(db, now=now,
  today=now.date())`).
- **TDD shape:** module-absent + lock-relaxation pair. Behavioral: 4
  call sites still produce a `MonitoringResponseContext`.
- **Failing test(s) to write FIRST:**
  1. `tests/backend/pytest/architecture/test_control_execution_monitoring_inlined_red.py`
     — assert
     `not (REPO_ROOT / "backend/app/services/_control_execution/monitoring.py").exists()`
     and that `link_governance.py` source contains
     `await load_monitoring_response_context(` (the inlined call).
     Marked contract.
  2. Update `tests/backend/pytest/test_architecture_deepening_contracts.py`:
     remove or invert assertions at line 188 (`hasattr(monitoring,
     "load_control_execution_monitoring_context")`) and line 192 (`"from
     app.services._control_execution.monitoring" in governance_source`).
     The deepening-contract file is itself marked
     `pytestmark = pytest.mark.contract` per `:9`. Edit must be in the
     same commit as the source change to avoid a broken-locks intermediate.
- **Code/file changes:**
  - Delete `backend/app/services/_control_execution/monitoring.py`.
  - In `link_governance.py:25` drop the
    `from app.services._control_execution.monitoring import
    load_control_execution_monitoring_context` import and add
    `from app.services._monitoring_response import
    load_monitoring_response_context` and import `utc_now` from
    `app.core.datetime_utils`.
  - At each of `:62, 91, 141, 170`, replace
    `await load_control_execution_monitoring_context(db)` with
    `await load_monitoring_response_context(db, now=now, today=now.date())`
    plus `now = utc_now()` once per function (4 functions). Or extract
    a 1-line module-private helper inside `link_governance.py` to keep
    callsites clean.
  - Update `test_architecture_deepening_contracts.py:188,192` (delete the
    two lock assertions in the same commit).
- **Lock/TOML/contract updates:** mod
  `test_architecture_deepening_contracts.py:188,192`. No TOML updates.
- **README / doc updates:** none.
- **Verification commands:** `make -f scripts/Makefile
  test-architecture-locks`; `cd backend && ./venv/bin/pytest -q
  ../tests/backend/pytest/test_architecture_deepening_contracts.py`.
- **Commit boundary:** ONE commit ("Inline _control_execution monitoring
  wrapper") covering deletion, callsite updates, and lock relaxation.
- **Rollback note:** revert single commit; both lock and code restore in
  step.
- **Effort:** S.

---

## Item #58 — S8.3 — Delete orphaned-item facade and static-method class

- **Final disposition:** REWRITE the 7 dotted call sites in
  `endpoints/orphaned_items.py:45, 70, 119, 120, 147, 164, 187`
  (Loop-B count: 7, not 8 — the 8th match was the import line) to use
  direct module-level functions, then DELETE
  `backend/app/services/orphaned_item_service.py` (7-line facade) AND
  `OrphanedItemService` static-method class at
  `backend/app/services/_orphaned_items/service.py:20`.
- **Dependencies (in-domain):** none.
- **Cross-domain prerequisites:** verify the 8 module-level functions
  the static methods wrap (`flag_orphaned_items`,
  `_get_fallback_owner_id`, `scan_uncategorised_items`,
  `get_pending_orphans`, `get_orphan_stats`, `resolve_orphan`,
  `get_pending_orphans_with_details`, `get_orphan_detail` —
  per `_orphaned_items/service.py:10-17` import lines) are exposed at
  the package level (`backend/app/services/_orphaned_items/__init__.py`)
  or import them from concrete modules (`flagging`, `reads`,
  `resolution`, `stats`).
- **TDD shape:** module-absent + class-absent + import-pattern updated.
- **Failing test(s) to write FIRST:**
  1. `tests/backend/pytest/architecture/test_orphaned_item_facade_removed_red.py`
     — assert
     `not (REPO_ROOT / "backend/app/services/orphaned_item_service.py").exists()`;
     `from app.services._orphaned_items import service`;
     `assert not hasattr(service, "OrphanedItemService")`. AST scan
     `endpoints/orphaned_items.py` to forbid string
     `OrphanedItemService.`. Marked contract.
  2. Behavioral: existing
     `tests/backend/pytest/test_admin_orphans.py` (or the corresponding
     orphan API test file) must continue to pass green after refactor.
- **Code/file changes:**
  - Edit `backend/app/api/v1/endpoints/orphaned_items.py:25` — replace
    `from app.services.orphaned_item_service import OrphanedItemService`
    with direct imports of the 7 functions in use:
    `scan_uncategorised_items`, `get_pending_orphans_with_details`,
    `get_orphan_stats`, `get_orphan_detail`, `resolve_orphan`. Pattern
    per `_register_listings` direct-import precedent
    (`architecture/test_w6_bc_d_register_listing_centralization.py:39-45`).
  - Update 7 call sites:
    - `:45` `OrphanedItemService.scan_uncategorised_items(db)` →
      `scan_uncategorised_items(db)`.
    - `:70` `OrphanedItemService.get_pending_orphans_with_details(...)` →
      `get_pending_orphans_with_details(...)`.
    - `:119, 147` `OrphanedItemService.get_orphan_stats(...)` →
      `get_orphan_stats(...)`.
    - `:120` `OrphanedItemService.get_pending_orphans_with_details(...)` →
      `get_pending_orphans_with_details(...)`.
    - `:164` `OrphanedItemService.get_orphan_detail(...)` →
      `get_orphan_detail(...)`.
    - `:187` `OrphanedItemService.resolve_orphan(...)` →
      `resolve_orphan(...)`.
  - Delete the static-method class (`_orphaned_items/service.py` lines
    20-80, leaving the imports to support backward-compatible references
    only if needed). Plan elects to delete the entire `service.py` file
    since the facade is the only consumer; verify no test imports
    `OrphanedItemService` directly.
  - Delete `backend/app/services/orphaned_item_service.py`.
- **Lock/TOML/contract updates:** none in TOML. New architecture lock
  ratchets the deletion.
- **README / doc updates:** none — Domain 8 map shows no README cites
  `orphaned_item_service.py` directly.
- **Verification commands:** `make -f scripts/Makefile
  test-architecture-locks`; `cd backend && ./venv/bin/pytest -q
  ../tests/backend/pytest/test_admin_orphans.py
  ../tests/backend/pytest/api/v1/`.
- **Commit boundary:** ONE commit ("Delete OrphanedItemService facade,
  inline orphaned-item endpoint imports") covering all 7 call sites,
  facade deletion, and static-method-class deletion.
- **Rollback note:** revert single commit; behavior preserved through
  module functions.
- **Effort:** M.

---

## Item #59 — S2.10 — Consolidate `_monitoring_*` packages

- **Final disposition:** RESOLVE naming overlap between
  `backend/app/services/_monitoring_response/` (projection) and
  `backend/app/services/_monitoring_status/` (state queries — per
  Loop-A `verify-loop-a-07-endpoints.md:444-468`). Naming clarification
  preferred: keep both packages distinct,
  document `_monitoring_response` as projection layer and
  `_monitoring_status` as state-query layer in their respective READMEs.
  Sequence AFTER #17 (shim removal) and #49 (wrapper inline).
- **Dependencies (in-domain):** #17 must land first (otherwise the
  shim's reachability shadows the package contract). #49 should land
  before this (otherwise the `_control_execution/monitoring.py` wrapper
  occludes the `_monitoring_response` direct surface).
- **Cross-domain prerequisites:** none.
- **TDD shape:** README-content invariants + import-direction guard.
- **Failing test(s) to write FIRST:**
  1. `tests/backend/pytest/architecture/test_monitoring_packages_separated_red.py`
     — assert both package READMEs exist and contain explicit
     "projection" vs "state queries" responsibility statements; assert
     no module under `_monitoring_response/` imports from
     `_monitoring_status/` and vice versa. Marked contract. Pattern:
     forbidden-import + required-substring (combine
     `architecture/test_w9_schema_datetime_ban.py` pattern with
     `architecture/test_w11_docs_index_completeness_red.py:13-37`).
- **Code/file changes:**
  - Create or extend
    `backend/app/services/_monitoring_response/README.md` — declare
    "projection" layer responsibility; cite `MonitoringResponseContext`,
    `serialize_*` family.
  - Update
    `backend/app/services/_monitoring_status/README.md:5-7` —
    sharpen "state queries" framing (currently
    "Shared backend derivation package for canonical control and KRI
    monitoring status...").
  - No code moves under this item; pure documentation lock + invariant.
- **Lock/TOML/contract updates:** none.
- **README / doc updates:** as above. May cascade into
  `docs/DOCUMENTATION_TREE.md` if monitoring layer is added to the
  3-hop reachability tree.
- **Verification commands:** `make -f scripts/Makefile
  test-architecture-locks`.
- **Commit boundary:** ONE commit ("Document monitoring projection vs
  status separation").
- **Rollback note:** revert single commit; READMEs only.
- **Effort:** M (could shrink to S if no code moves are required;
  effort estimate keeps M as buffer for boundary tweaks).

---

## Item #63 — BE-N7 — Instrument outbox dispatch with SchedulerJobRun

- **Final disposition:** INSTRUMENT
  `backend/app/services/outbox/dispatcher.py` (110 lines, zero current
  `SchedulerJobRun` references — Loop-B confirmed). Must be ADDITIVE:
  preserve the in-process admin runtime state (`_outbox_dispatch_state`
  dict at `backend/app/core/scheduler_jobs.py:120-138` and
  `get_outbox_dispatch_runtime_state` at `backend/app/core/scheduler.py:26`)
  consumed by `GET /admin/outbox/status`
  (`endpoints/admin/console.py:58`). Address ledger-flood concern via
  `OUTBOX_DISPATCH_INTERVAL_SECONDS` (record `SchedulerJobRun` only when
  `processed > 0`, OR window-roll-up) per `scheduler_jobs.py:115`
  docstring `"""Dispatch queued outbox events without flooding the
  scheduler run ledger."""`.
- **Dependencies (in-domain):** none.
- **Cross-domain prerequisites:** ADR-002 transaction ownership at
  `docs/adr/ADR-002-service-owned-transactions.md:15,44` cites the
  dispatcher path; AGENTS.md:230 pins
  `outbox/dispatcher.py` as the consolidated owner. Architecture test
  at `tests/backend/pytest/architecture/test_w4b_outbox_no_commit_in_store_red.py`
  governs the *store* but not the dispatcher.
  `architecture/test_w12_outbox_enqueue_idempotency_key_present_red.py`
  governs `OutboxService.enqueue` calls (cap >= 5) — adding
  `SchedulerJobRun.enqueue`-equivalent must not collide with that
  contract. New `SchedulerJobRun` rows are inserts, not outbox enqueues
  — disjoint.
- **TDD shape:** behavioral red — when the dispatcher processes a
  non-empty batch, a `SchedulerJobRun` row is persisted; when batch is
  empty, no row is created (or a windowed roll-up is applied per the
  rate-decision below); admin `/admin/outbox/status` still returns the
  in-memory snapshot.
- **Failing test(s) to write FIRST:**
  1. `tests/backend/pytest/test_outbox_dispatch_scheduler_job_run_red.py`
     — fixture seeds outbox events, calls
     `dispatch_pending_outbox_events`, asserts (a) batch processed > 0;
     (b) `SchedulerJobRun` row exists with
     `job_name="outbox_dispatch"` and a sane `started_at`/`status`; (c)
     in-memory `_outbox_dispatch_state["last_status"]` still updates.
     Empty-batch case: assert no new row (default policy).
  2. Optional architecture lock asserting dispatcher imports
     `SchedulerJobRun` (forbidden today; must be present after).
     Pattern: `architecture/test_w12_outbox_enqueue_idempotency_key_present_red.py:offender-list-empty`
     inverted to "import-must-be-present".
- **Code/file changes:**
  - Edit `backend/app/services/outbox/dispatcher.py` — add
    `SchedulerJobRun` import, wrap the per-batch dispatch with a
    "tracked-job" emitter that creates/updates a `SchedulerJobRun` row
    when `processed > 0` (or per windowing strategy). Reuse
    `execute_tracked_job` helper if its contract allows opt-out of the
    "always insert" behavior; otherwise add a sibling helper
    (e.g. `execute_tracked_job_when_processed`).
  - Decide ledger-flood policy: PLAN ELECTS "record only when
    `processed > 0`". Document this choice in dispatcher docstring and
    in `backend/app/services/outbox/README.md`.
  - Preserve `_outbox_dispatch_state` mutation at
    `scheduler_jobs.py:120-138`.
- **Lock/TOML/contract updates:** none in `architecture/_*.toml`. New
  test must declare `pytestmark = pytest.mark.contract` if it lives
  under `tests/backend/pytest/architecture/`.
- **README / doc updates:**
  - `backend/app/services/outbox/README.md` — append note that
    dispatch records `SchedulerJobRun` rows when batch is non-empty,
    preserving the existing in-memory admin state surface.
  - Update
    `docs/adr/ADR-002-service-owned-transactions.md:44` reference if
    line numbers shift.
- **Verification commands:** `cd backend && ./venv/bin/pytest -q
  ../tests/backend/pytest/test_outbox_*`; `make -f scripts/Makefile
  test-architecture-locks`.
- **Commit boundary:** ONE commit ("Instrument outbox dispatch with
  SchedulerJobRun ledger").
- **Rollback note:** revert commit; the `SchedulerJobRun` rows already
  written remain in DB (read-only ledger; safe to keep).
- **Effort:** M.

---

## Domain dependency graph

Sequence (top = first):

```
#10 (lock module presence)
  └── #38 (move 8 inline schemas; uses riskhub.py target)
#15 (catalog access_user surface) — independent
#12 (narrow blanket-except) — independent
#21 (collapse load_link) — independent
#43 (audit emitter helper) — independent (preserve all module-level defs)
#44 (router prefix registry) — independent
#17 (delete _monitoring_response shim, repoint 14 importers)
  └── #49 (inline _control_execution/monitoring wrapper, update lock)
        └── #59 (consolidate _monitoring_* package documentation)
#58 (delete OrphanedItemService facade + static-method class) — independent
#63 (instrument outbox SchedulerJobRun) — independent
```

Parallelism (single-developer sequential, but order-flexible groups):

- **Group A (independent, any order):** #10/#38 pair, #15, #12, #21, #43,
  #44, #58, #63.
- **Group B (strictly sequential):** #17 → #49 → #59.

Recommended chronological order:
1. #10 (S, lock module presence first to prevent collateral on #38).
2. #38 (M, move schemas — depends on #10 to ensure file isn't deleted).
3. #21 (S, fast and isolated).
4. #12 (S, fast and isolated).
5. #17 (S, gates Group B).
6. #49 (S, follows #17).
7. #59 (M, follows #49).
8. #58 (M, isolated).
9. #43 (M, isolated; large diff but low risk).
10. #44 (M, registry-only).
11. #15 (M, doc/contract — reserved late as it touches doc surface).
12. #63 (M, dispatcher — isolated, end-of-loop).

---

## Cross-domain notes

- **Domain 5 (services) cross-link with #17:** the
  `_monitoring_response` package directory must already export the 9
  symbols re-exported by the shim. If Domain 5's plan calls for moves
  inside `_monitoring_response/`, sequence those AFTER #17 to avoid
  intermediate unbound imports.
- **Domain 5 cross-link with #59:** consolidation of
  `_monitoring_status` vs `_monitoring_response` is a documentation-only
  move under this domain, but Domain 5 owns the package internals.
  Coordinate so that any Domain-5 refactor of `_monitoring_status` does
  not invalidate the README invariants this plan installs.
- **Domain 4 (locks) cross-link with #49:** the deepening contract at
  `tests/backend/pytest/test_architecture_deepening_contracts.py:188-192`
  is a non-architecture-`/architecture/` lock that still carries
  `pytestmark = pytest.mark.contract` (per `:9`). Updating it counts as a
  lock change and must land in the same commit as the source change.
- **Domain 4 cross-link with #43:** `_audit_matrix.toml` row count is 37
  (Loop-B confirmed); helper extraction is additive — no TOML row count
  change. The W7 lock at
  `architecture/test_w7_audit_adapter_completeness_red.py:13` only checks
  presence of `def`s, not their bodies.
- **Domain 4 cross-link with #58:** orphaned-item-facade deletion has no
  TOML interaction; the new architecture lock follows
  `architecture/test_w11b_test_infra_polish_red.py:18-25,63-66` style.
- **Domain 8 (docs) cross-link with #15:** catalog change requires
  matrix update in
  `docs/security/authorization-capability-contract.md`. Docs change
  alone is not in scope for this domain (Domain 8 owns the doc surface
  per CLAUDE.md), but the catalog-JSON edit and a parity-asserting
  architecture test are in-domain.
- **Domain 8 cross-link with #63:** ADR-002 line references at
  `docs/adr/ADR-002-service-owned-transactions.md:44` mention dispatcher
  line numbers — refresh if dispatcher line count shifts. AGENTS.md:230
  text remains valid.
- **Frontend implications:** none of the 12 items mutate the FE call
  surface beyond schema-name parity (#15 access_user, #38
  `BatchSendRiskFilters` rename if FE bindings exist). FE schema mirrors
  to verify after #38: `frontend/src/services/api/schemas/riskHub.ts:147`
  (`batchSendQuestionnairesResponseSchema`) and any import of
  `batchSendQuestionnaires` payload type.
- **Effort summary:** 6 × S + 6 × M = **6 short + 6 medium** items.
  No L or XL. Total estimated band: 4–7 working days for one developer
  if all RED tests pass on first GREEN attempt and no surprise
  cross-cuts surface.

---

End of Phase 3 Loop 1 endpoint surface plan.
