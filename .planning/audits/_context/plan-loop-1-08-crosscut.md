# Phase 3 Loop 1 — Cross-cutting Resolution Plan (Cluster 08)

Domain: cross-cutting context moves, admin reorg, directory consolidation,
outbox payload base, ADR drafts (#11, #12, ADR-007 amendment).

Working tree: `/Users/stefanlesnak/Antigravity/RiskHubOSS` (branch `main`,
commit `1ee872a4`). Items: #40, #42, #45a, #45b, #55, #56, #61, #72, #74.
Cross-domain: #65 (FE owner), #73 (KRI owner) — see dep graph at end.

Constraints: TDD-first (failing test or failing structural assertion before
production code); single-developer sequential; no parallelism inside this
plan; doc/lock-only Reject is INVALID; defers overruled per orchestrator.

Effort scale: S (≤2h), M (half-day–1 day), L (1–3 days), XL (>3 days).

---

## Item #40 — S8.11 — Re-cluster admin sub-routers

- **Final disposition**: ACCEPT (P3, after #39 capability builder lands).
  Loop B-corrected: console.py is **7 routes** (not 8), 4-cluster split is
  sound. Drops `capabilities.py` 22-line stub once #39 supersedes it.
- **Dependencies (in-domain)**: #39 (capability builder real implementation)
  must land first — not in this Loop 1 plan but referenced by other domain
  Loop 1 (capabilities/auth cluster).
- **Cross-domain prerequisites**: NONE inside #40 itself. The 4-cluster
  homing has no cross-domain coupling; the upstream #39 is its own thread.
- **TDD shape**: structural-assertion-first.
  1. Add a failing structural test that pins the *target* admin folder
     shape (4 sub-routers + `docs.py` + `__init__.py`).
  2. Land import-rewrite + file moves to make it pass.
  3. Snapshot test against current route table to prove zero
     route-set delta (URLs and methods unchanged).
- **Failing test(s) to write FIRST**:
  - `tests/backend/pytest/architecture/test_w12_admin_subrouter_clustering_red.py`
    — asserts `backend/app/api/v1/endpoints/admin/` contains exactly the
    files `{__init__.py, README.md, _deps.py, telemetry.py, sessions.py,
    directory.py, data_quality.py, docs.py}` and **does not** contain
    `{capabilities.py, console.py, directory_sync.py, structured_logs.py,
    log_config.py, orphans.py, snapshots.py}`.
  - Snapshot test
    `tests/backend/pytest/test_admin_route_table_snapshot_red.py` —
    enumerate routes mounted by the admin router; assert the set of
    `(method, path)` tuples after re-cluster equals current set (21
    routes total per Loop B).
- **Code/file changes** (planning-only enumeration):
  - NEW `admin/telemetry.py` ← merge of `console.py` health/jobs/outbox/
    stats/logs (5 routes) + `structured_logs.py` (2 routes); shares
    `_admin_telemetry.lifecycle` (`console.py:18`).
  - NEW `admin/sessions.py` ← `console.py:124-165` (2 routes:
    list-sessions, revoke-sessions); preserves
    `commit_service_transaction` at the existing line shape.
  - RENAME `directory_sync.py` → `admin/directory.py` (3 routes; no body
    change, only filename + `__init__.py` import token).
  - NEW `admin/data_quality.py` ← `orphans.py` (2 routes) + `snapshots.py`
    (3 routes) + `log_config.py` (2 routes). All three are
    admin-mutation+commit shape.
  - DELETE `capabilities.py` (one-route stub returning empty
    `AdminConsoleCapabilities()`).
  - REWRITE `admin/__init__.py:7-18` import + `include_router` block.
  - UPDATE `admin/README.md:9-19` Contents listing.
- **Lock/TOML/contract updates**:
  - `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml`
    — admin commit sites already excluded; verify no entry change needed.
    Loop B confirms 4 commit sites at `console.py:163, directory_sync.py:98,
    log_config.py:126, snapshots.py:53` are auth-only-allowlist-exempt
    (admin endpoints commit per ADR-002 service-owned tx pattern).
- **README / doc updates**:
  - `backend/app/api/v1/endpoints/admin/README.md:9-19` regenerate.
  - `.planning/audits/_context/02-backend-endpoints.md:535-566` route
    table refresh after rename.
- **Verification commands** (planning-listed, executed by another phase):
  - `make -f scripts/Makefile test-architecture-locks`
  - `pytest tests/backend/pytest/architecture/test_w12_admin_subrouter_clustering_red.py`
  - `pytest tests/backend/pytest/test_admin_route_table_snapshot_red.py`
- **Commit boundary**: ONE PR after #39 lands. Single mechanical move +
  rename; no behavioral change. Recommend split-commit within the PR:
  (a) add red structural test; (b) move files + rewrite imports; (c)
  delete `capabilities.py` after #39 fold-in.
- **Rollback note**: Pure import-graph reshuffle. Revert is `git revert`
  of the PR + reverting the snapshot test; no data migration; no
  behavior diff.
- **Effort**: M.

---

## Item #42 — BE-N2 — `ActorPayloadModel` shared base

- **Final disposition**: ACCEPT (P3) — Loop A and Loop B agree, every
  quote and count exact. Six payloads gain inheritance from new base;
  three approval payloads retain `OutboxPayloadModel` direct inheritance
  (no `actor_user_id`).
- **Dependencies (in-domain)**: NONE. Independent leaf.
- **Cross-domain prerequisites**: NONE. Outbox lock at
  `test_w12_outbox_enqueue_idempotency_key_present_red.py:34-49` scans
  CALL SITES, not payload classes — base-class introduction is invisible
  to it.
- **TDD shape**: failing-test-first.
  1. Add a structural test asserting `ActorPayloadModel` exists,
     inherits from `OutboxPayloadModel`, declares `actor_user_id: int`,
     and that 6 specific payload classes inherit from it.
  2. Land base + inheritance edits to make it pass.
- **Failing test(s) to write FIRST**:
  - `tests/backend/pytest/test_outbox_actor_payload_base_red.py`
    — assert `ActorPayloadModel.__bases__ == (OutboxPayloadModel,)`,
    `ActorPayloadModel.model_fields["actor_user_id"].annotation is int`,
    and that `IssueAssignedPayload`, `IssueExceptionRequestedPayload`,
    `IssueExceptionApprovedPayload`, `QuestionnaireSentPayload`,
    `QuestionnaireSubmittedPayload`,
    `QuestionnaireClarificationRequestedPayload` each have
    `ActorPayloadModel` in `__mro__`.
  - Negative assertion: `ApprovalRequestCreatedPayload`,
    `ApprovalRequestResolvedPayload`, `ApprovalRequestCancelledPayload`
    do **not** inherit from `ActorPayloadModel` (cancelled has
    `cancelled_by_user_id`, not `actor_user_id`).
- **Code/file changes**:
  - `backend/app/services/outbox/payloads.py` — insert
    `ActorPayloadModel(OutboxPayloadModel)` with `actor_user_id: int`;
    rewrite the 6 actor-bearing classes' `class X(OutboxPayloadModel)`
    declaration to `class X(ActorPayloadModel)`; remove the duplicate
    `actor_user_id: int` field declaration from each (leave `issue_id`,
    `questionnaire_id`, etc.).
  - `backend/app/services/outbox/payloads.py:105-121` — add
    `"ActorPayloadModel"` to `__all__`.
- **Lock/TOML/contract updates**: NONE. The
  `test_w12_outbox_enqueue_idempotency_key_present_red.py:34-49` lock
  scans `OutboxService.enqueue(...)` keyword args and is unaffected.
- **README / doc updates**: NONE (internal Pydantic refactor; not a
  contract-surface change).
- **Verification commands**:
  - `pytest tests/backend/pytest/test_outbox_actor_payload_base_red.py`
  - `pytest tests/backend/pytest/architecture/test_w12_outbox_enqueue_idempotency_key_present_red.py`
- **Commit boundary**: ONE PR. Single-file mechanical refactor.
- **Rollback note**: Pydantic field declarations are class-level;
  reverting collapses six inheritance lines and restores the duplicated
  `actor_user_id: int` declarations. Zero data implication.
- **Effort**: S.

---

## Item #45a — BE-N8a — Ownership prerequisite characterization tests

- **Final disposition**: ACCEPT (P4 prerequisite gate). Three new
  characterization tests must exist BEFORE #45b factory lands. They
  serve as the row-level authz lock the developer requested in
  `developer answer.md:541`.
- **Dependencies (in-domain)**: NONE inside #45a (this IS the
  prerequisite gate).
- **Cross-domain prerequisites**: NONE. Tests target
  `backend/app/core/_permissions/ownership.py` (verified to exist; 8
  async functions across 141 lines per Loop B re-count).
- **TDD shape**: characterization-tests-first; production code untouched
  in #45a.
  1. Write three failing tests (red) that pin the EXISTING ownership
     behavior — KRI archived asymmetry, Control join semantics,
     visible-ids resolution under each role.
  2. Run them; they must turn green against current `ownership.py`
     (because they characterize current behavior).
  3. Tests then serve as the lock for #45b.
- **Failing test(s) to write FIRST**:
  - `tests/backend/pytest/test_ownership_resolver_kri_archived_asymmetry.py`
    — assert `is_kri_reporting_owner(db, user, archived_kri.id)` returns
    `True` while
    `get_risk_ids_where_kri_reporting_owner(db, user)` excludes
    archived KRI's risk_id. Pins the asymmetry at `ownership.py:33`
    (`is_archived.is_(False)` only inside `is_risk_kri_reporting_owner`)
    and `ownership.py:68` (same predicate inside
    `get_risk_ids_where_kri_reporting_owner`). Pins the *absence* of
    the predicate inside `is_kri_reporting_owner:1-13` and
    `get_kri_ids_where_reporting_owner:40-51`.
  - `tests/backend/pytest/test_ownership_resolver_control_join.py` —
    assert `is_risk_control_owner(db, user, risk_id)` requires BOTH
    (a) a `ControlRiskLink` row joining `risk_id` to the control,
    AND (b) `Control.control_owner_id == user_id`. Cover negative
    cases: link present but different owner, owner present but no
    link. Pins the join at `ownership.py:104-106`.
  - `tests/backend/pytest/test_visible_ids_via_ownership.py` — pin
    return shape of `visible_*_ids` (`backend/app/core/_permissions/
    visible_ids.py`) under each of the 9 BUSINESS_LOGIC §1.1 roles
    (Admin, CRO, Risk Manager, Department Risk Owner, KRI Reporting
    Owner, Control Owner, Auditor, Reviewer, Viewer). Use a fixture
    matrix; assert the visible-id set is the union of (department-scope
    ids ∪ ownership-scope ids).
- **Code/file changes**: NONE in production. All changes inside
  `tests/backend/pytest/`.
- **Lock/TOML/contract updates**: NONE.
- **README / doc updates**: NONE.
- **Verification commands**:
  - `pytest tests/backend/pytest/test_ownership_resolver_kri_archived_asymmetry.py`
  - `pytest tests/backend/pytest/test_ownership_resolver_control_join.py`
  - `pytest tests/backend/pytest/test_visible_ids_via_ownership.py`
- **Commit boundary**: ONE PR (tests-only). #45b cannot land until this
  PR's tests are green.
- **Rollback note**: Test-only addition; no production behavior
  affected. Revert removes characterization coverage but does not
  introduce regressions.
- **Effort**: M (~half-day for fixture matrix; visible-ids test is the
  long pole).

---

## Item #45b — BE-N8b — Ownership resolver factory

- **Final disposition**: ACCEPT (P4) **conditional on #45a tests being
  green**. Replaces 8 free functions with factory keyed by
  `(model, owner_column, archived_column?, bridge?)`. Per Loop B, the
  factory MUST accept per-method archived filter (KRI side has
  asymmetric `is_archived.is_(False)` only on risk-scope expansion
  paths at `ownership.py:33,68`).
- **Dependencies (in-domain)**: #45a green.
- **Cross-domain prerequisites**: NONE in this domain. Cross-link to
  ADR-001 invariant — factory output is internal; no
  `MeCapabilities.resource_permissions` shape change permitted (locked
  at `test_w12_resource_permissions_keys_match_capability_contract_red.py:46-72`).
- **TDD shape**: factory-equivalence tests.
  1. After #45a is green, add a factory-equivalence test asserting the
     factory-produced resolvers return the same outputs as the 8 free
     functions over the same fixture matrix.
  2. Land factory; rewrite `entity_access.py:21,23,48` callers to use
     factory wrappers; delete free functions.
  3. #45a's three characterization tests stay green (proves zero
     behavioral regression).
- **Failing test(s) to write FIRST**:
  - `tests/backend/pytest/test_ownership_resolver_factory_equivalence_red.py`
    — for each of the 8 functions, assert
    `factory_resolver(args) == legacy_function(args)` across a fixture
    matrix covering archived/non-archived rows, present/absent links,
    matching/non-matching owners.
- **Code/file changes**:
  - NEW `backend/app/core/_permissions/_ownership_factory.py` —
    `make_ownership_resolvers(*, model, owner_column,
    archived_column=None, bridge=None) -> OwnershipResolvers`. Two
    instances:
    1. KRI: `model=KeyRiskIndicator, owner_column="reporting_owner_id",
       archived_column="is_archived" (per-method-applied for
       risk-scope only), bridge=None`.
    2. Control: `model=Control, owner_column="control_owner_id",
       bridge=(ControlRiskLink, "control_id", "risk_id")`.
  - REWRITE `backend/app/core/_permissions/ownership.py` — replace 8
    free functions with module-level factory calls returning four
    callables per entity (`is_owner`, `is_target_owner`,
    `ids_where_owner`, `target_ids_where_owner`). Public surface
    preserved (same 8 names exported).
  - REWRITE `backend/app/core/_permissions/entity_access.py:21,23,48`
    if internal call sites need adjustment (likely unchanged — public
    function names preserved).
- **Lock/TOML/contract updates**: NONE direct. Cross-check
  `test_w12_resource_permissions_keys_match_capability_contract_red.py:46-72`
  stays green after PR.
- **README / doc updates**:
  - `backend/app/core/_permissions/README.md` (if exists) — note
    factory + asymmetry-by-design comment.
- **Verification commands**:
  - `pytest tests/backend/pytest/test_ownership_resolver_factory_equivalence_red.py`
  - `pytest tests/backend/pytest/test_ownership_resolver_kri_archived_asymmetry.py`
  - `pytest tests/backend/pytest/test_ownership_resolver_control_join.py`
  - `pytest tests/backend/pytest/test_visible_ids_via_ownership.py`
  - `pytest tests/backend/pytest/architecture/test_w12_resource_permissions_keys_match_capability_contract_red.py`
- **Commit boundary**: ONE PR after #45a is in main. Refactor is
  invisible to API consumers.
- **Rollback note**: Internal-only; revert restores 8 free functions.
  No data migration; no schema change.
- **Effort**: M.

---

## Item #55 — S7.5 — Delete `access_user_service.py` facade

- **Final disposition**: ACCEPT-WITH-MOD (P2). 26-line single-fn facade
  with 1 prod importer (`access.py:19,209`) per Loop B re-count.
  Removes one delegation hop; canonical
  `update_access_profile` already exported from
  `_identity_access_lifecycle`.
- **Dependencies (in-domain)**: NONE. Independent leaf. Can land in P2
  wave alongside #56.
- **Cross-domain prerequisites**: NONE. The deepening contract test
  `test_architecture_deepening_contracts.py:246-257` (per Loop B
  function-range re-check, the function starts at line 243 with import
  at 246; quote-line is precise) introspects this facade's source —
  the test must be deleted or rewritten in the same PR.
- **TDD shape**: failing-existence-test-first.
  1. Add a failing structural test asserting
     `backend/app/services/access_user_service.py` does NOT exist.
  2. Land deletion + 1 import rewrite + contract/lock updates.
- **Failing test(s) to write FIRST**:
  - `tests/backend/pytest/architecture/test_access_user_service_removed_red.py`
    — assert `Path("backend/app/services/access_user_service.py")`
    does not exist; assert
    `from app.services._identity_access_lifecycle import update_access_profile`
    is the canonical import path.
- **Code/file changes**:
  - DELETE `backend/app/services/access_user_service.py` (26 lines).
  - REWRITE `backend/app/api/v1/endpoints/access.py:19` — change
    `from app.services.access_user_service import update_access_user_settings`
    → `from app.services._identity_access_lifecycle import update_access_profile`.
  - REWRITE `backend/app/api/v1/endpoints/access.py:209` — change call
    site `update_access_user_settings(...)` →
    `update_access_profile(...)` with verified arg shape (positional
    rename: `user_data` → `update_data` per developer note —
    implementation phase verifies).
- **Lock/TOML/contract updates**:
  - REWRITE `tests/backend/pytest/test_authz_capability_contract_validator.py:502`
    — drop `Path("backend/app/services/access_user_service.py")`
    fixture entry.
  - DELETE or REWRITE
    `tests/backend/pytest/test_architecture_deepening_contracts.py:246-257`
    (`test_identity_access_routes_use_lifecycle_module`) — the
    `inspect.getsource` source-introspection assertion at `:257`
    references the deleted facade. Either delete the test or rewrite
    it to introspect the import statement in `access.py` directly.
  - DROP `docs/security/authorization-capability-contract.json:106`
    `sensitive_change_paths` entry referencing
    `access_user_service.py`.
  - EDIT `docs/security/authorization-capability-contract.json:229`
    `service_policy` blob — remove `access_user_service.py` token.
  - EDIT `docs/security/authorization-capability-contract.md:109`
    `service_policy` row — remove same token.
- **README / doc updates**:
  - `backend/app/services/README.md` — drop facade row if listed.
- **Verification commands**:
  - `pytest tests/backend/pytest/architecture/test_access_user_service_removed_red.py`
  - `pytest tests/backend/pytest/test_authz_capability_contract_validator.py`
  - `pytest tests/backend/pytest/test_architecture_deepening_contracts.py`
  - `python scripts/security/validate_authz_capability_contract.py`
- **Commit boundary**: ONE PR. Mechanical 1-importer rewrite + lock
  alignment.
- **Rollback note**: Revert restores facade. Zero data migration; both
  paths route to identical `update_access_profile` so prod traffic is
  unaffected by either direction.
- **Effort**: S.

---

## Item #56 — S7.6 — Delete `directory_identity_service.py` shim

- **Final disposition**: ACCEPT-WITH-MOD (P3, paired with #61). 35-line
  shim re-exporting **13 names** (Loop B-corrected from Loop A's "15";
  11 from `_directory_identity` + 2 from `_directory_identity.lifecycle`).
  8 prod importers + 1 script. Pair with #61 to land both moves in one
  wave.
- **Dependencies (in-domain)**: PAIRED with #61. Both PRs land in
  same wave because `graph_directory_service.py:8` imports
  `normalize_business_role` from this shim and #61 moves the file
  (path changes simultaneously).
- **Cross-domain prerequisites**: NONE outside cluster 08.
- **TDD shape**: failing-existence-test-first.
  1. Add structural test asserting shim does not exist + asserting all
     13 names import from `_directory_identity` (or
     `_directory_identity.lifecycle`).
  2. Land deletion + rewrite of 8 prod importers + 1 script.
  3. Update locks + contracts.
- **Failing test(s) to write FIRST**:
  - `tests/backend/pytest/architecture/test_directory_identity_service_removed_red.py`
    — assert
    `Path("backend/app/services/directory_identity_service.py")` does
    not exist; assert each of the 13 names is importable from
    `_directory_identity` or `_directory_identity.lifecycle` (loop
    over names with `importlib.import_module` + `hasattr`).
- **Code/file changes**:
  - DELETE `backend/app/services/directory_identity_service.py` (35
    lines).
  - REWRITE 8 prod importers (per Loop B re-grep, all 8 verified):
    1. `backend/app/api/v1/endpoints/auth/_sso_helpers.py:16` —
       `normalize_business_role` ← `_directory_identity`.
    2. `backend/app/services/graph_directory_service.py:8` —
       `normalize_business_role` ← `_directory_identity`. *(NOTE:
       this file moves under #61 to `_graph_directory/service.py`;
       coordinate the rewrite with the move.)*
    3. `backend/app/services/ad_deprovision_service.py:14` —
       `DirectoryIdentityConflictError, apply_directory_profile` ←
       `_directory_identity`.
    4. `backend/app/services/_access_workflow/policy.py:11` —
       `has_auto_deprovision_reason` ← `_directory_identity`.
    5. `backend/app/services/directory_provider_service.py:17` —
       `normalize_business_role` ← `_directory_identity`.
    6. `backend/app/services/_auth_session/jit.py:13` —
       `normalize_business_role` ← `_directory_identity`.
    7. `backend/app/services/_identity_access_lifecycle/policy.py:11`
       — `requires_break_glass_for_reenable` ← `_directory_identity`.
    8. `backend/app/services/_identity_access_lifecycle/directory_import.py:15`
       — multi-name import (3 names) ← `_directory_identity`.
  - REWRITE 1 script: `backend/scripts/bootstrap_sso_user.py:17` —
    multi-name import ← `_directory_identity`.
  - For the 2 lifecycle-module names
    (`apply_directory_profile_outcome`,
    `directory_reenable_outcome`), use
    `from app.services._directory_identity.lifecycle import ...`.
- **Lock/TOML/contract updates**:
  - REWRITE `tests/backend/pytest/test_authz_capability_contract_validator.py:500`
    — drop `Path("backend/app/services/directory_identity_service.py")`.
  - DELETE or REWRITE
    `tests/backend/pytest/test_architecture_deepening_contracts.py:227-238`
    (`test_directory_identity_facade_uses_lifecycle_module`) — the
    full identity-of-symbols assertion on the deleted shim must be
    removed; replace with an assertion that the 13 names export from
    `_directory_identity`.
  - DROP `docs/security/authorization-capability-contract.json:111`
    `sensitive_change_paths` entry.
  - EDIT `docs/security/authorization-capability-contract.json:229`
    `service_policy` blob — remove
    `directory_identity_service.py` token.
  - EDIT `docs/security/authorization-capability-contract.md:109`
    `service_policy` row — remove same token.
- **README / doc updates**:
  - `backend/app/services/README.md` — drop top-level
    `directory_identity_service.py` line.
- **Verification commands**:
  - `pytest tests/backend/pytest/architecture/test_directory_identity_service_removed_red.py`
  - `pytest tests/backend/pytest/test_authz_capability_contract_validator.py`
  - `pytest tests/backend/pytest/test_architecture_deepening_contracts.py`
  - `python scripts/security/validate_authz_capability_contract.py`
  - `pytest tests/backend/pytest/` (full suite — broad fan-out PR).
- **Commit boundary**: ONE PR (paired with #61). Single coordinated
  edit.
- **Rollback note**: Revert restores shim. All 13 re-exports are pure
  delegation; no behavior change either direction.
- **Effort**: S.

---

## Item #61 — S7.7 — Move `graph_directory_*` into `_graph_directory/`

- **Final disposition**: ACCEPT-WITH-MOD (P3, paired with #56). 4
  sibling modules consolidate into `services/_graph_directory/`. Public
  surface re-exported from `__init__.py`. External importers: 1 prod
  (`directory_provider_service.py:18`) + 2 test files with multiple
  monkeypatch path strings (per Loop B, line numbers slightly
  off-by-one but targets and substance correct).
- **Dependencies (in-domain)**: PAIRED with #56 — `service.py` imports
  `normalize_business_role` from the directory_identity shim that #56
  removes; both rewrites must happen in the same diff.
- **Cross-domain prerequisites**: Cross-link to #74 — `_graph_directory`
  appears in the ADR-007 amendment Adapter category. ADR-007 amendment
  text must reference the post-move name `_graph_directory` (not
  `graph_directory_*`).
- **TDD shape**: failing-existence-test-first.
  1. Add structural test asserting
     `backend/app/services/_graph_directory/` exists with files
     `{__init__.py, service.py, auth.py, transport.py, errors.py,
     README.md}` and the 4 top-level files do NOT exist.
  2. Land file moves + internal cross-import path rewrites + external
     importer rewrites + monkeypatch path rewrites.
  3. Confirm all existing tests stay green.
- **Failing test(s) to write FIRST**:
  - `tests/backend/pytest/architecture/test_graph_directory_package_move_red.py`
    — assert `Path("backend/app/services/_graph_directory/__init__.py")`
    exists; assert each of `service.py, auth.py, transport.py,
    errors.py, README.md` exists inside the package; assert
    `Path("backend/app/services/graph_directory_service.py")`,
    `graph_directory_auth.py`, `graph_directory_transport.py`,
    `graph_directory_errors.py` do NOT exist.
  - Public-surface test: assert that
    `from app.services._graph_directory import GraphDirectoryService,
    GraphDirectoryProviderError, GraphProviderUnavailableError,
    GraphDependencyError, GraphCredentialError,
    GraphTokenAcquisitionError, GraphTransientError,
    GraphUserNotFoundError, GraphAccessTokenProvider,
    GraphApiTransport, reset_graph_token_cache_for_tests` succeeds
    (per Loop B, errors module has 7 classes total).
- **Code/file changes**:
  - NEW dir `backend/app/services/_graph_directory/` with:
    - `__init__.py` re-exporting public surface.
    - `service.py` ← `graph_directory_service.py` (141 lines).
    - `auth.py` ← `graph_directory_auth.py` (188 lines).
    - `transport.py` ← `graph_directory_transport.py` (75 lines).
    - `errors.py` ← `graph_directory_errors.py` (29 lines, 7 exception
      classes).
    - `README.md` (new — adapter package overview, per #74 amendment
      Adapter category).
  - DELETE the 4 top-level files.
  - REWRITE INTERNAL cross-imports inside the moved files:
    - `service.py:8` `directory_identity_service.normalize_business_role`
      → `from app.services._directory_identity import normalize_business_role`
      (coordinate with #56 — same rewrite).
    - `service.py:9` → `.auth`.
    - `service.py:10-14` → `.errors`.
    - `service.py:15` → `.transport`.
    - `auth.py:13-19` → `.errors` (5 names per Loop B import count).
    - `transport.py:14` → `.auth`.
    - `transport.py:15-19` → `.errors`.
  - REWRITE EXTERNAL prod importer:
    `backend/app/services/directory_provider_service.py:18` —
    `from app.services._graph_directory import (...)` (or via
    `__init__.py` re-export).
  - REWRITE TEST files:
    1. `tests/backend/pytest/test_graph_directory_components.py:10,
       11, 17` — module imports.
    2. `tests/backend/pytest/test_graph_directory_components.py` —
       monkeypatch path strings at lines 55, 57, ~125, 151, 153, 175,
       177, 180, 204, 206, 209 (Loop B confirms multiple sites with
       slight off-by-one; rewrite paths to
       `app.services._graph_directory.<submodule>`).
    3. `tests/backend/pytest/test_entra_confidential_credentials.py:12`
       — module import.
    4. `tests/backend/pytest/test_entra_confidential_credentials.py`
       — monkeypatch.setattr at lines 51, 76, 109, 127, 148; rewrite
       paths.
- **Lock/TOML/contract updates**:
  - REWRITE `tests/backend/pytest/test_authz_capability_contract_validator.py:504`
    — `Path("backend/app/services/graph_directory_service.py")` →
    `Path("backend/app/services/_graph_directory/service.py")`.
  - EDIT `docs/security/authorization-capability-contract.md:109`
    `service_policy` blob — token rewrite.
  - EDIT `docs/security/authorization-capability-contract.json:113`
    `sensitive_change_paths` — path rewrite.
  - EDIT `docs/security/authorization-capability-contract.json:229`
    `service_policy` blob — token rewrite.
- **README / doc updates**:
  - `backend/app/services/README.md:23` — drop top-level
    `graph_directory_service.py` line; add `_graph_directory/`.
  - NEW `backend/app/services/_graph_directory/README.md` — adapter
    overview; cite ADR-007 amendment Adapter category; cite ADR-003
    domain-exception-translation as adapter responsibility.
- **Verification commands**:
  - `pytest tests/backend/pytest/architecture/test_graph_directory_package_move_red.py`
  - `pytest tests/backend/pytest/test_graph_directory_components.py`
  - `pytest tests/backend/pytest/test_entra_confidential_credentials.py`
  - `pytest tests/backend/pytest/test_authz_capability_contract_validator.py`
  - `python scripts/security/validate_authz_capability_contract.py`
  - `pytest tests/backend/pytest/` (full suite — verify monkeypatch
    rewrites cover all sites).
- **Commit boundary**: ONE PR (paired with #56). Move + rename + import
  graph rewrite all in one diff.
- **Rollback note**: File moves are reversible via `git revert`. No
  data migration. The temporary `__init__.py` re-export structure
  decouples public surface from physical file paths, so future moves
  are also low-risk.
- **Effort**: M.

---

## Item #72 — S7.9 — Author ADR-011 (Auth Scheme and Session Model)

- **Final disposition**: ACCEPT (P1) — full draft text in
  `verify-loop-a-08-crosscut.md:640-731`. Loop B verdict: decisions
  coherent with ADR-001..010; structural deviations acceptable
  ("Proposed" status, "Forbidden" section, "Enforcement" section name).
  Loop B flagged one factual loose framing (mock-auth scope at
  `core/security.py:107-136` — that range is `get_current_user` itself,
  with mock-auth as a fallback path within it). Plan accommodates that
  rephrasing.
- **Dependencies (in-domain)**: NONE inside cluster 08. ADR-011 must
  land BEFORE #66 (FE-N5 AuthContext) and #71 (S7.8 session merge) per
  developer answer (`developer answer.md:811`); both are in other
  domains' Loop 1 plans.
- **Cross-domain prerequisites**: NONE for the ADR text itself. Cross-
  link: `_endpoint_commit_allowlist.toml` already pins 8 auth-flow
  entries with `expires_at = 2026-09-01` (Loop B verified).
- **TDD shape**: ADR is documentation; failing-test surrogate is a
  doc-existence + cross-link integrity assertion.
  1. Add a failing test asserting `docs/adr/ADR-011-auth-scheme-and-
     session-model.md` exists, contains the required sections (Status,
     Context, Decision, Consequences, Alternatives Considered,
     Forbidden, Enforcement, Migration Impact, Rollback Strategy), and
     references `_endpoint_commit_allowlist.toml` 2026-09-01 sunset.
  2. Land the ADR file. Add the new lock proposed in the ADR
     (forbid-`get_current_user`-imports-outside-`core/security.py`)
     in a follow-up — *not* part of #72 itself.
- **Failing test(s) to write FIRST**:
  - `tests/backend/pytest/architecture/test_adr_011_present_red.py` —
    assert `Path("docs/adr/ADR-011-auth-scheme-and-session-model.md")`
    exists; load file; assert sections present (regex match for `##
    Status`, `## Context`, `## Decision`, `## Consequences`, `##
    Alternatives Considered`, `## Forbidden`, `## Enforcement`, `##
    Migration Impact`, `## Rollback Strategy`); assert `expires_at
    2026-09-01` mentioned.
- **Code/file changes**:
  - NEW `docs/adr/ADR-011-auth-scheme-and-session-model.md` — full
    draft text from `verify-loop-a-08-crosscut.md:640-731`, with
    one fact correction per Loop B feedback: rephrase Decision 2 to
    avoid implying lines 107-136 are "the mock-auth path"; correct
    framing is "the canonical `get_current_user` dependency at
    `core/security.py:107-136`, which contains a mock-auth fallback
    branch gated by `mock_auth_enabled && debug`".
  - EDIT `docs/adr/README.md` — add ADR-011 row.
- **Lock/TOML/contract updates**: NONE in #72 itself. The
  Enforcement section names new locks (`get_current_user`-import
  scan, body-call `_require_*` non-increasing count,
  `_endpoint_commit_allowlist.toml` auth-flow sunset
  enforcement) — those locks are *separate follow-up items* in other
  domains' plans (cross-link below).
- **README / doc updates**:
  - `docs/adr/README.md` — index addition.
  - `AGENTS.md` reference list (if it enumerates ADRs) — add ADR-011
    row.
  - `CLAUDE.md` references ADR-001/002/005/010 explicitly; consider
    adding ADR-011 to the cross-check note (out of scope here).
- **Verification commands**:
  - `pytest tests/backend/pytest/architecture/test_adr_011_present_red.py`
  - `pytest tests/backend/pytest/architecture/test_w1_docs_cross_link_red.py`
- **Commit boundary**: ONE PR (doc-only).
- **Rollback note**: Documentation-only ADR. Rollback consists of
  removing the file + the index row.
- **Effort**: M.

---

## Item #74 — ADR-007 amendment — Read-shape/Workflow-paired/Adapter
  categories — **REPLANNING REQUIRED**

- **Final disposition**: WRONG-NEEDS-REPLANNING per Loop B. Loop A's
  3-category split covers only **18 of 31** underscore-prefixed
  packages (Loop B re-counted via `ls -d backend/app/services/_*/`
  yielding 31 packages, not 13). 13 unclassified orphans would trip
  the amendment's own day-1 enforcement clause.
- **Replan structure**: split #74 into **two sub-items**:
  - **#74a (CENSUS — must precede ADR text)**: a complete
    classification census of all 31 underscore-prefixed packages.
    Adds a 5th category if needed (e.g., "core" or "policy"). Output
    is a single classification table, not an ADR.
  - **#74b (ADR-007 amendment text)**: only writable AFTER #74a
    classifies all 31 packages. Reuses Loop A's amendment skeleton but
    with corrected category list and corrected package coverage.
- **Dependencies (in-domain)**:
  - #74b depends on #74a green.
  - #74b cross-links to #61 (`_graph_directory` is a new Adapter
    package created by #61).
- **Cross-domain prerequisites**: NONE — but the census MUST cover the
  31 packages exhaustively across all domains.
- **TDD shape**: census-first; ADR text after.
  1. **#74a**: write a structural test that lists the 31
     underscore-prefixed packages and asserts EACH one appears in
     exactly one of the 4 (or 5) classification TOMLs proposed by the
     amendment. Tests fails until all 31 are classified.
  2. **#74b**: write a failing test asserting the ADR-007 amendment
     file exists and lists the same 4 (or 5) categories, citing the
     31 packages.
- **Failing test(s) to write FIRST**:
  - **#74a**:
    `tests/backend/pytest/architecture/test_bounded_context_classification_complete_red.py`
    — enumerate `glob("backend/app/services/_*/")` (excluding
    `__pycache__`); assert exactly 31 packages today; for each
    package, assert membership in EXACTLY one of the four allowlist
    TOMLs (`_bounded_context_write_side.toml`, `_bounded_context_
    read_shape.toml`, `_bounded_context_workflow_pairs.toml`,
    `_bounded_context_adapters.toml`). If a 5th category is added,
    extend the assertion.
  - **#74b**:
    `tests/backend/pytest/architecture/test_adr_007_amendment_present_red.py`
    — assert `docs/adr/ADR-007-bounded-context-taxonomy.md` contains
    the new amendment section; assert each of the 4 (or 5) category
    names appears in the document; assert the 31-package classification
    census is referenced or inlined.
- **Code/file changes**:
  - **#74a (CENSUS PHASE)**:
    - NEW `tests/backend/pytest/architecture/_bounded_context_write_side.toml`
      — 7 canonical contexts: `_riskhub_config,
      _identity_access_lifecycle, _vendor_governance, _register_listings,
      _approval_execution, _entity_mutation_lifecycle, _kri_history`.
    - NEW `_bounded_context_read_shape.toml` — proposed: `_register_listings`
      (dual-class, also in write-side), `_monitoring_status`,
      `_dashboard_metrics`, `_quarterly_comparison`, `_reporting`,
      `_org_chart`, `_orphaned_items`, `_notification_inbox`. (8 packages
      — needs developer review during census.)
    - NEW `_bounded_context_workflow_pairs.toml` — pairs:
      `(_approval_queue, _approval_execution)`,
      `(_issue_register, _issue_workflow)`,
      `(_vendor_links, _vendor_governance)`,
      `(_access_workflow, _identity_access_lifecycle)`,
      `(_control_execution, _entity_mutation_lifecycle)`,
      `(_vendor_workflow, _vendor_governance)`,
      `(_deadline_execution, _kri_history)`. (7 pairs — needs
      developer review during census.)
    - NEW `_bounded_context_adapters.toml` — `_directory_identity,
      _directory_sync, _graph_directory` (post-#61),
      `_admin_telemetry, _activity_log_query, _auth_session,
      _auth_session_workflow`. (7 adapters.)
    - **NEW 5th category PROPOSED** — `_bounded_context_policy.toml`
      (or similar): `_authorization_capabilities, _config,
      _risk_questionnaires`. Three orphans don't fit
      read/workflow/adapter; they're cross-cutting policy modules.
      Census must validate this proposal or merge them into
      adapter/read-shape.
    - The exact category-by-category assignment for the 13 originally-
      unclassified packages
      (`_access_workflow, _auth_session, _auth_session_workflow,
      _authorization_capabilities, _config, _control_execution,
      _dashboard_metrics, _deadline_execution, _notification_inbox,
      _org_chart, _orphaned_items, _quarterly_comparison, _reporting,
      _risk_questionnaires, _vendor_workflow`) is the deliverable of
      #74a. Above is a STRAW PROPOSAL; the developer must sign off.
  - **#74b (ADR PHASE — after census)**:
    - EDIT `docs/adr/ADR-007-bounded-context-taxonomy.md` — append
      the amendment section. Body adapted from
      `verify-loop-a-08-crosscut.md:946-1046` with corrected category
      count (4 or 5), corrected package list (31), corrected
      `_graph_directory` naming (post-#61), and a table at the end
      enumerating all 31 packages with their classification.
- **Lock/TOML/contract updates**:
  - 4 (or 5) new TOMLs as above (#74a phase).
  - EXTEND `tests/backend/pytest/architecture/test_w7_audit_adapter_completeness_red.py`
    or NEW `test_w7_bounded_context_disjointness.py` to enforce
    "every underscore-prefixed package classified in EXACTLY one
    TOML".
- **README / doc updates**:
  - `docs/adr/README.md` — note the amendment.
  - `AGENTS.md:157` — keep package list aligned with the 4-TOML
    classification.
  - `CONTEXT.md` — cross-reference if it enumerates contexts.
- **Verification commands**:
  - `pytest tests/backend/pytest/architecture/test_bounded_context_classification_complete_red.py`
  - `pytest tests/backend/pytest/architecture/test_adr_007_amendment_present_red.py`
  - `make -f scripts/Makefile test-architecture-locks`
- **Commit boundary**: TWO PRs.
  - **#74a PR**: census + 4 (or 5) TOMLs + classification test. No
    ADR text yet.
  - **#74b PR**: ADR-007 amendment text after #74a is in main.
- **Rollback note**: Documentation + TOML config. Rollback removes the
  TOMLs + amendment + classification test. The seven-context core
  remains operational.
- **Effort**: L (#74a half-day for full census; #74b half-day for
  amendment text drafting + final pass; total ~1.5 days but mostly
  serial).

---

## Domain dependency graph (cluster 08)

```
                                  CLUSTER 08 PLAN
                                  ───────────────
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
        ▼                              ▼                              ▼
   #42 ActorPayload          #45a ownership tests            #72 ADR-011
   (independent leaf)        (must be GREEN before)          (P1 doc-only)
                                  │                              │
                                  ▼                              │
                             #45b factory                        │
                             (after #45a)                        │
                                                                 │
        ┌──────────────────────────────┐                         │
        │                              │                         │
        ▼                              ▼                         │
   #55 access_user_service        #56 directory_identity         │
   (leaf, P2)                     │  (PAIRED with #61)           │
                                  │                              │
                                  ▼                              │
                              #61 graph_directory                │
                              (PAIRED with #56)                  │
                                                                 │
        ┌──────────────────────────────────────────────┐         │
        │                                              │         │
        ▼                                              ▼         │
   #74a 31-package census             #40 admin re-cluster       │
   (CENSUS phase)                     (after #39)                │
        │                                                        │
        ▼                                                        │
   #74b ADR-007 amendment ──────────── cross-link ─────► #72 ─── ┘
   (after #74a green)                  (ADR-011 cites
                                       Adapter category
                                       for auth_session)
```

**Hard ordering inside cluster 08**:
1. #45a tests → #45b factory (TDD prerequisite).
2. #56 + #61 must commit together (paired wave) — single PR or two PRs
   in same merge train.
3. #74a census → #74b ADR text.
4. #72 ADR-011 has no in-cluster blockers; can land first or in
   parallel with #42, #55, #45a.
5. #40 depends on #39 (out of cluster).

**Recommended execution order** (single developer, sequential):
1. **#72** (ADR-011 doc-only, P1, unblocks other domains).
2. **#42** (S, independent, mechanical refactor).
3. **#55** (S, independent leaf).
4. **#45a** (M, characterization tests, no production change).
5. **#74a** (M-L, census + TOMLs, doc-only).
6. **#56 + #61** (paired wave, M total).
7. **#45b** (M, factory rewrite, depends on #45a).
8. **#74b** (M, ADR amendment text, depends on #74a).
9. **#40** (M, depends on out-of-cluster #39 landing first).

---

## Cross-domain notes

- **#65 (FE-N3 — CRUD capability schema)** — Loop B-corrected: shared
  schema is for **4 entities** (`risks/controls/kris/vendors`), not 5.
  `issueCapabilitiesSchema` does NOT extend the new `crudCapabilitySchema`
  base; issues uses an entirely different action vocabulary
  (`can_close, can_link_*, can_request_exception`). Owned by Frontend
  domain plan; cluster 08 does not plan it. Cross-link: depends on
  #46 (FE-N1 query keys factory). Validator constraint at
  `scripts/security/authz_contract_validator/capability_catalog.py:299-306`
  enforces field-set equality — base+extends must reproduce identical
  Zod shape.
- **#73 (ADR-012 — KRI period algebra)** — Owned by KRI domain plan.
  Cross-link: same structural deviations as ADR-011 (`Proposed`
  status, `Forbidden`/`Enforcement` section names). Loop B flagged one
  missing cross-reference: ADR-012's
  `_kri_history.constants.REPORTING_GRACE_DAYS` alias deprecation
  window should cite ADR-009 Reserved Surfaces Convention for the
  alias entry in `_reserved_modules.toml`. KRI domain plan must
  incorporate that note.
- **#39 (Capability builder real implementation)** — out-of-cluster
  prerequisite for #40. Cluster 08 cannot land #40 until #39 ships.
- **#46 (FE-N1 query keys factory)** — out-of-cluster prerequisite for
  #65.
- **#66 (FE-N5 AuthContext)** and **#71 (S7.8 session merge)** — both
  cite ADR-011 (#72) as decision-level dependency. Cluster 08 ships
  #72 first to unblock those.
- **#63 (BE-N7 outbox dispatch tracking)** — out-of-cluster follow-up
  to #42 (uses `ActorPayloadModel` once it exists).

---

## Final notes

- All file paths are absolute references checked against current repo
  state at commit `1ee872a4`.
- Quotes ≤15 words; no hallucinated text. Loop B's count corrections
  (console.py 7 routes, directory_identity 13 names, ownership.py 141
  lines, 31 underscore-prefixed packages) are reflected throughout.
- No production edits performed in this planning loop. All code/file
  changes are *enumerated* targets; the `tdd` skill or implementation
  phase will execute them.
- TDD-first discipline: every item begins with a failing test or a
  failing structural assertion. No code change precedes a red test.
- Single-developer sequential execution; no parallel work inside this
  plan.
