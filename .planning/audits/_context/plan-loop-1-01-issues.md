# Phase 3 Loop 1 — Issues domain plan (planning skeletons)

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Commit reference at start: `1ee872a4`.

Domain: Issues — workflow + register + endpoints/issues/_shared.

Items planned (final Phase 2 verdicts shown):

| # | ID | Title | Verdict |
| --- | --- | --- | --- |
| 2 | B-N1 | Underscore alias delete in `_issue_workflow/source_validation.py` | Accept (S) |
| 8 | B-N2 | Owner-validation split / canonical link helpers consolidation | Accept-with-modification (M) |
| 14 | S4.4 | Issues outbox-only notification cleanup | Accept (M) |
| 27 | S4.2 | Issue-loading duplicate deletion (service is canonical) | Accept (M) |
| 28 | S4.3 | Issue source-mutation triplicate collapse | Accept-with-modification (M) |
| 29 | S4.6 | Source-type vocabulary canonicalization | Accept-with-modification (S) |
| 30 | S4.10 | `_shared/__init__.py` underscore re-export pruning | Accept-with-modification (M) |
| 41 | B-N3 | `_issue_workflow/serialization.py` bidirectional alias removal | Accept (S) |
| 53 | S4.1 | Issue workflow service collapse | Accept (S) |

Each skeleton below uses the agreed-upon format. Failing-test-first ("RED first") is mandatory — for delete/move items the failing test takes the form of a structural assertion that the symbol/alias/file is gone, or the import-path graph has the new shape.

Reference quotes (each ≤15 words):
- `_issue_workflow/source_validation.py:117` — `_ensure_owner_assignable = ensure_owner_assignable`.
- `_issue_workflow/source_validation.py:118` — `_issue_link_department_ids = issue_link_department_ids`.
- `_issue_workflow/source_validation.py:119` — `_resolve_vendor_department_and_access = resolve_vendor_department_and_access`.
- `_issue_workflow/source_validation.py:120` — `_validate_user_exists = validate_user_exists`.
- `_issue_workflow/serialization.py:18` — `active_exception = _active_exception`.
- `_issue_workflow/serialization.py:41` — `_serialize_exception_with_user_names = serialize_exception_with_user_names`.
- `_issue_register/source_mutation.py:24` — `def _source_type_value(source_type: IssueSourceType | Enum | str) -> str:`.
- `_issue_workflow/update_plans.py:19` — `def source_type_value(source_type) -> str:`.
- `_issue_register/linked_context.py:103` — `def source_type_value(source_type: IssueSourceType | str) -> str:`.
- `_shared/__init__.py:42-79` — current `__all__` lists 36 names (13 public + 23 underscored).
- `_shared/links.py:11` — `async def _resolve_vendor_department_and_access(...)`.
- `_shared/links.py:39` — `async def _issue_link_department_ids(...)`.
- `_shared/loading.py:22` — `async def _get_issue_with_relations(db, issue_id):` (byte-identical to service copy).
- `_shared/notifications.py:24,43,80` — three direct-send `_notify_*` helpers.
- `tests/backend/pytest/api/v1/test_issue_workflow.py:10` — submodule-direct import bypasses the barrel.
- `tests/backend/pytest/test_architecture_deepening_contracts.py:1237` — `assert "IssueWorkflowService." not in lifecycle_source`.
- `tests/backend/pytest/test_architecture_deepening_contracts.py:1193` — `from app.services._issue_workflow import execution, lifecycle, loading, outbox, serialization, source_validation`.
- `docs/security/authorization-capability-contract.md:128` — `service_policy` row cites `_shared/source.py`, `_shared/links.py`, `_shared/serialization.py`, `_issue_register/`.
- `docs/security/authorization-capability-contract.json:629` — same `service_policy` string mirrored in JSON.

---

## Item #2 — B-N1 — Delete 4 underscore aliases in `_issue_workflow/source_validation.py`

- Final disposition (one phrase): DELETE-DEAD-ALIASES.
- Dependencies (in-domain): none. Sequence sibling to #41 (same anti-pattern, different file). Bundled inside #8 if desired (single-commit removal of source_validation.py duplicates), but standalone-safe.
- Cross-domain prerequisites: none.
- TDD shape: DELETE-W-LOCK (structural assertion).
- Failing test(s) to write FIRST:
  - Add `tests/backend/pytest/architecture/test_issue_workflow_no_underscored_self_aliases_red.py` asserting `"_ensure_owner_assignable = ensure_owner_assignable"` not in source of `backend/app/services/_issue_workflow/source_validation.py` (and the three siblings). Today the file contains those lines at `:117-120` so the test is RED.
  - Quote of failing assertion: `assert "_ensure_owner_assignable = ensure_owner_assignable" not in source`.
- Code/file changes (after test is failing):
  - Edit `backend/app/services/_issue_workflow/source_validation.py:117-120`: delete the four alias assignment lines (`_ensure_owner_assignable`, `_issue_link_department_ids`, `_resolve_vendor_department_and_access`, `_validate_user_exists`).
  - Verify `__all__` at `:122-130` does not list any of the four underscored names (it doesn't today — confirm intact after edit).
- Lock/TOML/contract updates (in same commit):
  - The new architecture-lock test (created above) is the lock — keep it.
  - No TOML allowlist edits required (verified: no entry mentions `source_validation.py` in `_archive_allowlist.toml`, `_naming_allowlist.toml`, `_capabilities_all_allowlist.toml`, `_endpoint_commit_allowlist.toml`).
  - Capability contract not affected (no citation of the alias names).
- README / doc updates (in same commit):
  - `backend/app/services/_issue_workflow/README.md` — refresh "Contents" if it referenced the aliases (today it lists modules only — no edit needed).
- Verification commands to run:
  - `pytest tests/backend/pytest/architecture/test_issue_workflow_no_underscored_self_aliases_red.py -q`
  - `pytest tests/backend/pytest/api/v1/test_issue_workflow.py -q`
  - `python -m pyflakes backend/app/services/_issue_workflow/source_validation.py` (catches now-dead exports)
  - `ruff check backend/app/services/_issue_workflow/source_validation.py`
  - `mypy backend/app/services/_issue_workflow/source_validation.py`
- Commit boundary: single commit — title `B-N1: drop dead underscore aliases in _issue_workflow/source_validation`.
- Rollback note: safe to revert; no callers depend on these aliases (verified via Loop B grep).
- Effort: S.

---

## Item #8 — B-N2 — Source-validation split / canonical link helpers consolidation

- Final disposition (one phrase): SPLIT-AND-CONSOLIDATE (workflow keeps owner-validation; `_issue_register/source_mutation.py` keeps link/vendor resolvers).
- Dependencies (in-domain): #2 lands first if both are touched in close-together commits (cleaner diff). #28 is the **second half** of this work (link/vendor body deletion); kept conceptually separate per Loop B sequencing but commit-adjacent.
- Cross-domain prerequisites: none.
- TDD shape: CONSOLIDATE-W-SNAPSHOT plus DELETE-W-LOCK.
- Failing test(s) to write FIRST:
  - Add a new test in `tests/backend/pytest/test_architecture_deepening_contracts.py` (or a new architecture file) named `test_issue_workflow_owner_validation_lives_in_dedicated_module`. Assert:
    1. `"def validate_user_exists" not in _source("backend/app/services/_issue_workflow/source_validation.py")` (today has it at `:16` — RED).
    2. `"def ensure_owner_assignable" not in _source("backend/app/services/_issue_workflow/source_validation.py")` (today has it at `:24` — RED).
    3. `hasattr(app.services._issue_workflow.assignment, "validate_user_exists")` (or whichever new module is chosen — today `assignment.py` does not export it; the test should fail until the move is done).
  - Add a behavior-pin regression test in `tests/backend/pytest/api/v1/test_issue_workflow.py` covering: (a) assigning unknown owner returns 400 with `User {id} not found`, (b) assigning owner outside department returns 403, (c) source link/vendor 409 on archived vendor. These already largely exist — confirm coverage and add any gap. Quote of one expected line: `detail=f"User {user_id} not found"` from `validation.py:16` (must remain reachable).
- Code/file changes (after tests are failing):
  - Decision: extend `backend/app/services/_issue_workflow/assignment.py` with two new public coroutines `validate_user_exists` and `ensure_owner_assignable` whose bodies are the same as `source_validation.py:16-21,24-42` (Loop B confirmed `assignment.py` already exists; folding in is the lower-friction path).
  - Edit `_issue_workflow/update_plans.py:9-14` and `_issue_workflow/execution.py:41-47` — change imports to point at `_issue_workflow.assignment` for `validate_user_exists` / `ensure_owner_assignable` (keep `clear_issue_source_links`, `ensure_issue_source_link`, `resolve_issue_source_metadata` unchanged for now; #28 repoints those).
  - Edit `_issue_workflow/source_validation.py`:
    - Delete `validate_user_exists` (`:16-21`) and `ensure_owner_assignable` (`:24-42`).
    - Delete `issue_link_department_ids` (`:45-86`) and `resolve_vendor_department_and_access` (`:89-114`) — they live canonically in `_issue_register/source_mutation.py`.
    - Update `__all__` (`:122-130`) — remove all four names; what survives is the three re-exports already imported from `_issue_register.source_mutation` at `:9-13`.
  - Edit endpoint `_shared/validation.py:11-37` — replace local `_validate_user_exists` / `_ensure_owner_assignable` bodies with thin re-imports from `_issue_workflow.assignment`. (Final removal happens in #30.)
  - Edit endpoint `_shared/links.py:11-80` — replace local `_resolve_vendor_department_and_access` / `_issue_link_department_ids` bodies with re-imports from `_issue_register.source_mutation`. (Final removal happens in #28.)
- Lock/TOML/contract updates (in same commit):
  - Add new architecture-lock assertion to `test_architecture_deepening_contracts.py`:
    `assert "validate_user_exists" in inspect.getsource(_issue_workflow.assignment)` and `"def validate_user_exists" not in _source(".../source_validation.py")`.
  - `docs/security/authorization-capability-contract.md:128` and `.json:629` — append `backend/app/services/_issue_workflow/assignment.py` to the `service_policy` enumeration (between `_shared/source.py` and `_issue_register/`). Atomic edit — same commit.
  - No TOML allowlist edits.
- README / doc updates (in same commit):
  - `backend/app/services/_issue_workflow/README.md` — add `assignment.py` description: "owner-assignment validation (user existence, owner-to-department eligibility)".
  - `backend/app/services/_issue_workflow/source_validation.py` becomes a thin re-export shim of three names from `_issue_register.source_mutation`. Strongly consider deleting the file in this commit if no callers reach for `source_validation` directly. Caller scan (verified): only `update_plans.py:9` and `execution.py:41` import from it; if both are repointed to `_issue_register.source_mutation` (for the link/vendor names) and `_issue_workflow.assignment` (for the owner-validation names), `source_validation.py` can be deleted. **Recommended end-state: delete the file.** If kept, document why in the README.
- Verification commands to run:
  - `pytest tests/backend/pytest/api/v1/test_issue_workflow.py tests/backend/pytest/api/v1/test_issues_crud_api.py tests/backend/pytest/api/v1/test_issues_rbac_api.py -q`
  - `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "issue_workflow"`
  - `python3 scripts/security/validate_authz_capability_contract.py`
  - `ruff check backend/app/services/_issue_workflow backend/app/api/v1/endpoints/issues`
  - `mypy backend/app/services/_issue_workflow backend/app/api/v1/endpoints/issues`
- Commit boundary: 2 atomic commits.
  1. `B-N2(a): move owner-validation helpers to _issue_workflow/assignment` — extends `assignment.py`, repoints `update_plans` + `execution`, repoints `_shared/validation.py`, deletes the two helper bodies in `source_validation.py`. Updates lock + contract.
  2. `B-N2(b): remove dead source_validation residual / shrink to shim` — deletes the link/vendor bodies (paired with #28). Optional `git rm source_validation.py` once `update_plans` and `execution` no longer import it.
- Rollback note: revert each commit independently. Loop B confirmed there is no live caller of the workflow-side `issue_link_department_ids` body at `_issue_register/source_mutation.py:56` until `update_plans` is repointed — verify diff before pushing.
- Effort: M (half-day; touches 6 files plus docs/lock).

---

## Item #14 — S4.4 — Issues outbox-only notification cleanup

- Final disposition (one phrase): DELETE-DEAD-DIRECT-SEND-PATH (outbox is the single live transport).
- Dependencies (in-domain): #14 is independent of #27/#28/#29 in a strict ordering sense, but it MUST land before #30 because #30's accurate prunable-name count assumes `_notify_*` helpers no longer exist (Loop B note: the test at `tests/.../test_issue_workflow.py:10` imports through the `notifications` submodule, NOT the barrel — so #30 alone does not break the test, but #14 cleanly removes the underlying helper).
- Cross-domain prerequisites: none. Outbox handlers (`backend/app/services/outbox/handlers/issues.py`) are the production path; production no longer calls the direct-send helpers (verified by grep).
- TDD shape: OUTBOX-ENQUEUE-ASSERT (rewrite test) + DELETE-W-LOCK (structural assertion that the helpers are gone).
- Failing test(s) to write FIRST:
  - Edit `tests/backend/pytest/api/v1/test_issue_workflow.py:10,679,685`: rewrite `test_*_notification_*` paths so the production code path calls `enqueue_issue_outbox` and the test asserts an `OutboxEvent` row was inserted with the expected `event_type` (`issue.assigned` / `issue.exception_approved`) and a non-empty `idempotency_key`. Before the fix, this rewritten test will FAIL because the existing test calls `_notify_issue_assigned` / `_notify_exception_approved` directly and the helpers still exist.
  - Add a new architecture test in `test_architecture_deepening_contracts.py` named `test_issue_notifications_have_no_direct_send_helpers`. Assert:
    1. `not hasattr(app.api.v1.endpoints.issues._shared.notifications, "_notify_issue_assigned")`.
    2. `not hasattr(app.api.v1.endpoints.issues._shared.notifications, "_notify_exception_requested")`.
    3. `not hasattr(app.api.v1.endpoints.issues._shared.notifications, "_notify_exception_approved")`.
    4. `"_notify_issue_assigned" not in _source("backend/app/api/v1/endpoints/issues/_shared/__init__.py")` (matches lines `:14, :62`).
- Code/file changes (after tests are failing):
  - Delete `_notify_issue_assigned` (`_shared/notifications.py:24-40`), `_notify_exception_requested` (`:43-77`), `_notify_exception_approved` (`:80-103`).
  - Decide on `_get_active_user_with_permissions` (`:14-21`): **keep** — used by all three deleted helpers, but also needed indirectly by outbox handlers (`backend/app/services/outbox/handlers/issues.py` — confirm via grep before delete). If unused after the trim, delete; otherwise leave a single helper. Loop B noted no production importer of the helper outside this file.
  - Edit `_shared/__init__.py`: drop the three `_notify_*` imports (`:14-16`) and their `__all__` entries (`:62-64`). If `_get_active_user_with_permissions` is also dropped, remove `:13` and `:53`.
  - Coordinate with #30: the `_shared/__init__.py` edits made here can be merged into #30's prune commit, but must not be deferred past #14.
- Lock/TOML/contract updates (in same commit):
  - The new architecture test added above pins the post-state.
  - No capability-contract change (the helpers are not cited in `service_policy`).
  - No TOML allowlist edits.
- README / doc updates (in same commit):
  - `backend/app/api/v1/endpoints/issues/_shared/README.md` — keep `notifications.py` in the contents list only if `_get_active_user_with_permissions` survives; otherwise strike the file from the list (and consider `git rm` of the now-empty `notifications.py`).
- Verification commands to run:
  - `pytest tests/backend/pytest/api/v1/test_issue_workflow.py -q`
  - `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "issue_notif"`
  - `pytest tests/backend/pytest -q -k "outbox and issue"`
  - `ruff check backend/app/api/v1/endpoints/issues/_shared`
  - `mypy backend/app/api/v1/endpoints/issues/_shared`
- Commit boundary: single commit — title `S4.4: drop direct-send issue notifications; outbox is the only transport`.
- Rollback note: safe to revert; the helpers had no production importer (Loop B verified). Tests are rewritten in the same commit.
- Effort: M (rewriting 2 test sites is the bulk of the work).

---

## Item #27 — S4.2 — Issue loading duplicate deletion

- Final disposition (one phrase): CONSOLIDATE-INTO-SERVICE (`_issue_workflow/loading.py` is canonical; delete endpoint copy).
- Dependencies (in-domain): #27 is independent of #8/#28/#29. Sequence note: should land BEFORE #30 (Loop B notes loading symbols are half of the underscored barrel surface).
- Cross-domain prerequisites: none. Service `_issue_workflow/loading.py` already has the public versions; endpoint `_shared/loading.py` is a byte-identical underscored copy.
- TDD shape: CONSOLIDATE-W-SNAPSHOT + DELETE-W-LOCK.
- Failing test(s) to write FIRST:
  - Add architecture test `test_endpoint_issues_loading_is_thin_or_deleted` in `test_architecture_deepening_contracts.py` asserting EITHER:
    1. `not Path("backend/app/api/v1/endpoints/issues/_shared/loading.py").exists()`, OR
    2. `_source("backend/app/api/v1/endpoints/issues/_shared/loading.py")` does NOT contain the SQL fragment `"selectinload(Issue.links).selectinload(IssueLink.risk)"` (confirms it is no longer a duplicated body — quote ≤15 words).
    Today the file contains that fragment at `:29` — RED.
  - Add behavioral pin: `tests/backend/pytest/api/v1/test_issues_crud_api.py` already covers list/detail; add a new test asserting that `crud/detail.py` resolves issues correctly after re-pointing (existing 200/404 cases); existing coverage likely sufficient — verify in code review.
- Code/file changes (after test is failing):
  - Repoint endpoint callers:
    - `endpoints/issues/crud/contextual.py:20` — replace `_get_issue_with_relations` import with `from app.services._issue_workflow.loading import get_issue_with_relations` and update the call at `:95`.
    - `endpoints/issues/crud/create.py:21` — same; update the call at `:107`.
    - `endpoints/issues/crud/detail.py:10` — replace `_get_readable_issue_or_404` import with `from app.services._issue_workflow.loading import get_readable_issue_or_404`; update the call at `:21`.
    - `endpoints/issues/links.py:14` — replace `_get_writable_issue_or_404` import with `from app.services._issue_workflow.loading import get_writable_issue_or_404`; update calls at `:80, :128`.
  - Delete `backend/app/api/v1/endpoints/issues/_shared/loading.py` (entire file, `:1-65`).
  - Edit `_shared/__init__.py`: drop the three `_get_*` imports (`:11`) and their `__all__` entries (`:54-56`). Coordinate with #30 (this is a strict subset of #30's prune set).
- Lock/TOML/contract updates (in same commit):
  - Existing lock at `test_architecture_deepening_contracts.py:1192-1206` already asserts `loading.get_issue_with_relations`, `loading.get_writable_issue_or_404` — confirm still GREEN after move.
  - Add the new structural lock from above.
  - No TOML allowlist edits (no entry references `_shared/loading.py`).
  - No capability-contract change (`_shared/loading.py` not cited).
- README / doc updates (in same commit):
  - `backend/app/api/v1/endpoints/issues/_shared/README.md` — strike `loading.py` from the contents list at `:13`.
- Verification commands to run:
  - `pytest tests/backend/pytest/api/v1/test_issues_crud_api.py tests/backend/pytest/api/v1/test_issues_rbac_api.py tests/backend/pytest/api/v1/test_issue_workflow.py -q`
  - `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "issue_workflow"`
  - `ruff check backend/app/api/v1/endpoints/issues backend/app/services/_issue_workflow`
  - `mypy backend/app/api/v1/endpoints/issues backend/app/services/_issue_workflow`
- Commit boundary: single commit — title `S4.2: delete endpoint issues/_shared/loading.py; service loader is canonical`.
- Rollback note: safe to revert; the underscored copy can be restored from git history. No data shape or HTTP contract change.
- Effort: M (4 endpoint files repointed + 1 file deleted + 1 barrel edit + 1 README + 1 lock).

---

## Item #28 — S4.3 — Issue source-mutation triplicate collapse

- Final disposition (one phrase): CONSOLIDATE-INTO-SERVICE (`_issue_register/source_mutation.py` is canonical).
- Dependencies (in-domain): #8 (must land first so `update_plans.py` already imports `issue_link_department_ids` from somewhere other than `source_validation.py`). Loop B noted: until #28 lands, the canonical body at `source_mutation.py:56` has zero callers — #28 promotes it to live.
- Cross-domain prerequisites: none.
- TDD shape: CONSOLIDATE-W-SNAPSHOT + DELETE-W-LOCK.
- Failing test(s) to write FIRST:
  - Add architecture test `test_issue_link_helpers_have_one_canonical_home`:
    1. `_source("backend/app/api/v1/endpoints/issues/_shared/links.py")` does NOT contain `"async def _resolve_vendor_department_and_access"` (today at `:11` — RED).
    2. `_source("backend/app/api/v1/endpoints/issues/_shared/links.py")` does NOT contain `"async def _issue_link_department_ids"` (today at `:39` — RED).
    3. `_source("backend/app/services/_issue_workflow/source_validation.py")` does NOT contain `"async def issue_link_department_ids"` (today at `:45` — RED if not already deleted by #8).
    4. `_source("backend/app/services/_issue_workflow/source_validation.py")` does NOT contain `"async def resolve_vendor_department_and_access"` (today at `:89` — same).
    5. Confirm the canonical body remains: `"async def issue_link_department_ids" in _source("backend/app/services/_issue_register/source_mutation.py")` and likewise for `resolve_vendor_department_and_access`.
  - Behavioral pin: `tests/backend/pytest/api/v1/test_issue_workflow.py` and `test_issues_crud_api.py` already exercise vendor-link 404/409 and department-mismatch 400 paths — verify the test for "Linked vendor not found" still hits with the canonical helper.
- Code/file changes (after test is failing):
  - Repoint workflow caller: `_issue_workflow/update_plans.py:9-14` — change imports so `issue_link_department_ids` comes from `from app.services._issue_register.source_mutation import (...)`. The other three (`clear_issue_source_links`, `ensure_issue_source_link`, `resolve_issue_source_metadata`) already import from there; this just adds the new name and removes the now-dead `_issue_workflow.source_validation` import for `issue_link_department_ids`.
  - Repoint endpoint caller: `endpoints/issues/links.py:13-19` — replace `_resolve_vendor_department_and_access` with `from app.services._issue_register.source_mutation import resolve_vendor_department_and_access`; update call at `:68`. (`_get_writable_issue_or_404`, `_issue_source_link`, `_link_matches_issue_source`, `_serialize_issue_link` are out-of-scope and stay until #30.)
  - Delete duplicate bodies:
    - `endpoints/issues/_shared/links.py:11-80` — entire file becomes empty/deleted. If still referenced by `_shared/__init__.py:10` (it is), the import path must move there directly. Recommended: `git rm endpoints/issues/_shared/links.py` and update `_shared/__init__.py:10` to import from `_issue_register.source_mutation` (do this as part of #30's prune; here, only delete the content).
    - `services/_issue_workflow/source_validation.py:45-114` — already deleted in #8 if that item ran; otherwise delete here. The two functions plus their underscore aliases at `:118-119` (already covered by #2/#8).
- Lock/TOML/contract updates (in same commit):
  - Add the structural lock from above.
  - Capability contract: when `_shared/links.py` is removed, `docs/security/authorization-capability-contract.md:128` and `.json:629` must drop the `_shared/links.py` token from the `service_policy` enumeration AND ensure `backend/app/services/_issue_register/source_mutation.py` is mentioned (it is, via the `_issue_register/` package mention; sharpen to the file path for clarity if the contract validator requires it). Same-commit edit.
  - No TOML allowlist edits.
- README / doc updates (in same commit):
  - `backend/app/api/v1/endpoints/issues/_shared/README.md` — strike `links.py` from contents list at `:12` if file is deleted.
  - `backend/app/services/_issue_register/README.md` — already mentions list grouping; **add** a line: "`source_mutation.py` — canonical owner of vendor/department resolution and IssueLink department aggregation".
- Verification commands to run:
  - `pytest tests/backend/pytest/api/v1/test_issue_workflow.py tests/backend/pytest/api/v1/test_issues_crud_api.py tests/backend/pytest/api/v1/test_issues_rbac_api.py -q`
  - `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "issue"`
  - `python3 scripts/security/validate_authz_capability_contract.py`
  - `ruff check backend/app/api/v1/endpoints/issues backend/app/services`
  - `mypy backend/app/api/v1/endpoints/issues backend/app/services/_issue_register backend/app/services/_issue_workflow`
- Commit boundary: single commit — title `S4.3: collapse triplicate source-mutation helpers into _issue_register/source_mutation`.
- Rollback note: safe to revert; the canonical body in `_issue_register/source_mutation.py` is byte-identical to the deleted copies.
- Effort: M (1 service repoint + 1 endpoint repoint + delete `_shared/links.py` + barrel/contract edits).

---

## Item #29 — S4.6 — Source-type vocabulary canonicalization

- Final disposition (one phrase): EXTRACT-NEW (one canonical `source_type_value` helper).
- Dependencies (in-domain): independent. Cleanest after #28 (canonical helper sits next to its main consumer in `_issue_register/source_mutation.py`).
- Cross-domain prerequisites: none. Out-of-scope: `_issue_workflow/transitions.py:15-17 _status_value` (different vocabulary — `IssueStatus`/`IssueRemediationStatus`), and `_kri_history/corrections.py:22 _status_value` (KRI vocabulary — different domain).
- TDD shape: EXTRACT-NEW + RENAME-FIX.
- Failing test(s) to write FIRST:
  - Add architecture test `test_source_type_value_has_one_canonical_definition`:
    1. `import app.services._issue_register.constants as c; assert hasattr(c, "source_type_value")` — RED today (not defined there).
    2. Count check: across the trio of files, only ONE def of `source_type_value` survives. Implementation: `len([p for p in trio if "def source_type_value" in _source(p) or "def _source_type_value" in _source(p)]) == 1`. RED today (3).
  - Add unit-test `tests/backend/pytest/services/test_issue_source_type_value.py` (NEW) asserting:
    - `source_type_value(IssueSourceType.manual) == "manual"`.
    - `source_type_value("manual") == "manual"`.
    - `source_type_value(SomeOtherEnum.x) == SomeOtherEnum.x.value` (proves the union covers any `Enum`).
    - `source_type_value(None) == ""` or `raises ValueError` (define behavior; developer note: "normalize all current input shapes" — propose `None -> ""` to mimic the `str(None) == "None"` default; document the choice in the test name and the helper docstring).
    Today the helper does not exist — RED.
- Code/file changes (after test is failing):
  - Decision on home: Loop B noted `_issue_register/constants.py` is currently strings-only; mixing constants with logic is mildly off-cohesion. **Plan: place the helper in `_issue_register/constants.py`** (matches audit & developer suggestion; co-locates the vocabulary constants and the coercer for the same domain).
  - Edit `backend/app/services/_issue_register/constants.py` — append:
    ```
    from enum import Enum
    from app.models.issue import IssueSourceType

    def source_type_value(source_type: IssueSourceType | Enum | str | None) -> str:
        if source_type is None:
            return ""
        if isinstance(source_type, Enum):
            return source_type.value
        return str(source_type)
    ```
  - Replace local definitions with imports:
    - `_issue_workflow/update_plans.py:19-20` — delete; `from app.services._issue_register.constants import source_type_value`. Calls at `:73, :74` keep working unchanged.
    - `_issue_register/source_mutation.py:24-25` — delete; import from `.constants`. Calls at `:162, :164, :175, :192` keep working (note local `source_type_value` variable at `:162` shadows the import — rename the local to `value` to avoid confusion).
    - `_issue_register/linked_context.py:103-104` — delete; import from `.constants`. Call at `:110` keeps working.
- Lock/TOML/contract updates (in same commit):
  - Add the structural lock above.
  - No capability-contract change.
  - No TOML allowlist edits.
- README / doc updates (in same commit):
  - `backend/app/services/_issue_register/README.md` — append "`constants.py` — UNKNOWN_*_LABEL strings and `source_type_value` coercer (canonical)".
- Verification commands to run:
  - `pytest tests/backend/pytest/services/test_issue_source_type_value.py -q`
  - `pytest tests/backend/pytest/api/v1/test_issue_workflow.py tests/backend/pytest/api/v1/test_issues_crud_api.py -q`
  - `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "source_type"`
  - `ruff check backend/app/services/_issue_register backend/app/services/_issue_workflow`
  - `mypy backend/app/services/_issue_register backend/app/services/_issue_workflow`
- Commit boundary: single commit — title `S4.6: extract canonical source_type_value into _issue_register/constants`.
- Rollback note: safe to revert; bodies are functionally equivalent (Loop B verified `IssueSourceType` is a `str, Enum`, all three branches handled it). The new None-handling is the only behavior addition.
- Effort: S.

---

## Item #30 — S4.10 — Issue `_shared/__init__.py` underscore re-export pruning

- Final disposition (one phrase): PRUNE-AND-RENAME-TO-PUBLIC.
- Dependencies (in-domain): **Strict prerequisites**: #14 (notifications cleanup), #27 (loading dedup), #28 (source-mutation collapse) MUST land first. Loop B's count: 36 entries / 13 public / 23 underscored; **12 confirmed prunable** (no external consumer) **+ 9 to re-point or rename** (live external consumers). The 2 `_notify_*` test imports go through the `notifications` submodule directly (not the barrel) — so they are NOT a barrel-prune blocker; #14 still must delete the underlying functions.
- Cross-domain prerequisites: none.
- TDD shape: DELETE-W-LOCK + RENAME-FIX.
- Failing test(s) to write FIRST:
  - Add architecture test `test_issue_shared_barrel_has_no_underscored_reexports`:
    1. `from app.api.v1.endpoints.issues import _shared as barrel; underscored = [n for n in barrel.__all__ if n.startswith("_")]; assert underscored == []` — RED today (23 names).
    2. `assert "_validate_user_exists" not in barrel.__all__` (and similar for the prunable subset — explicit guards against re-introduction).
  - Add behavioral pin: existing `tests/backend/pytest/api/v1/test_issues_crud_api.py` and `test_issue_workflow.py` already cover all the surface; ensure they still GREEN after the rename to public names. Confirm by checking that callers in `endpoints/issues/crud/{create,contextual,detail}.py`, `endpoints/issues/links.py` use the new public names.
- Code/file changes (after test is failing):
  - Determine the **per-name disposition** (Loop B's corrected ledger):

    **Drop (12 underscored, no external consumer)** — remove from `__all__` and from the import block:
    1. `_active_exception` (`__init__.py:19, 51`)
    2. `_get_active_user_with_permissions` (`:13, 53`) — re-evaluate after #14; if `_get_active_user_with_permissions` is also deleted as part of #14, drop here.
    3. `_issue_link_department_ids` (`:10, 57`) — body was deleted by #28; remove the re-export.
    4. `_label_or_fallback` (`:21, 59`)
    5. `_link_display` (`:22, 60`)
    6. `_notify_exception_requested` (`:15, 63`) — body deleted by #14.
    7. `_resolve_user_name` (`:24, 65`)
    8. `_serialize_exception` (`:25, 67`)
    9. `_serialize_exception_with_user_names` (`:26, 68`)
    10. `_serialize_issue_read` (`:28, 70`)
    11. `_serialize_issue_summary` (`:29, 71`)
    12. `_serialize_remediation` (`:30, 72`)

    **Drop (2 more, body deleted by #14)** — `_notify_exception_approved` (`:14, 62`), `_notify_issue_assigned` (`:16, 64`). Total prunable = 14 once #14/#27/#28 have landed.

    **Re-point or rename (9 with live external consumers)** — for each, the cleaner end-state is to repoint the consumer to the canonical home, then drop from the barrel:
    13. `_ensure_owner_assignable` — consumers `crud/create.py:20, contextual.py:19`. Repoint to `from app.services._issue_workflow.assignment import ensure_owner_assignable`; rename call sites accordingly. Remove from barrel.
    14. `_validate_user_exists` — same pattern: consumers `crud/create.py:22, contextual.py:21`; repoint to `_issue_workflow.assignment`. Remove from barrel.
    15. `_get_issue_with_relations` — already deleted by #27; consumers `crud/create.py:21, contextual.py:20` already repointed. Remove from barrel.
    16. `_get_readable_issue_or_404` — already deleted by #27; `crud/detail.py:10` already repointed. Remove from barrel.
    17. `_get_writable_issue_or_404` — already deleted by #27; `endpoints/issues/links.py:14` already repointed. Remove from barrel.
    18. `_issue_source_link` — consumer `endpoints/issues/links.py:15`. Repoint to `from app.api.v1.endpoints.issues._shared.serialization import issue_source_link as _issue_source_link` OR rename consumer to use the public name. Recommended: rename the consumer; drop from barrel.
    19. `_link_matches_issue_source` — consumer `endpoints/issues/links.py:16`. Same pattern.
    20. `_resolve_vendor_department_and_access` — already covered by #28; consumer `endpoints/issues/links.py:17` already repointed.
    21. `_serialize_issue_link` — consumer `endpoints/issues/links.py:18`. Rename consumer to public name; drop from barrel.

    **Keep public (13 names already non-underscored)** — leave intact: `UNKNOWN_*_LABEL` (7), `ResolvedIssueSource`, `build_issue_linked_visibility`, `clear_issue_source_links`, `ensure_issue_source_link`, `resolve_contextual_issue_source`, `resolve_issue_source_metadata`.

    Final `__all__` after #30 holds the 13 public names only (or 13 + however many genuinely public endpoint-local helpers survive after the renames).
  - Edit `_shared/__init__.py:1-79` to reflect this. Edit `_shared/notifications.py`, `_shared/links.py`, `_shared/loading.py` (already deleted), `_shared/serialization.py`, `_shared/validation.py` (now thin re-imports per #8).
- Lock/TOML/contract updates (in same commit):
  - Add the structural lock above.
  - Capability contract `docs/security/authorization-capability-contract.md:128` and `.json:629` already cite `_shared/source.py`, `_shared/serialization.py`. Confirm both files still exist post-#28; if not, drop the citations atomically.
  - No TOML allowlist edits.
- README / doc updates (in same commit):
  - `backend/app/api/v1/endpoints/issues/_shared/README.md` — refresh contents list to reflect surviving files post-#27/#28/#30.
- Verification commands to run:
  - `pytest tests/backend/pytest/api/v1/test_issue_workflow.py tests/backend/pytest/api/v1/test_issues_crud_api.py tests/backend/pytest/api/v1/test_issues_rbac_api.py -q`
  - `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "issue"`
  - `python3 scripts/security/validate_authz_capability_contract.py`
  - `ruff check backend/app/api/v1/endpoints/issues`
  - `mypy backend/app/api/v1/endpoints/issues`
- Commit boundary: single commit — title `S4.10: prune issues/_shared barrel underscored re-exports; rename survivors to public`. Single commit is feasible because each rename is mechanical and the tests cover the post-state.
- Rollback note: safe to revert; the prune is purely a public-surface change. Behavior pin tests catch any caller missed.
- Effort: M (~half-day; touches 5 endpoint files plus barrel plus lock).

---

## Item #41 — B-N3 — Issue workflow serialization alias removal

- Final disposition (one phrase): DELETE-DEAD-ALIASES (and rename one same-name re-export at `:18`).
- Dependencies (in-domain): independent. Pair commit-adjacent with #2 (B-N1) for tidiness — they are the same anti-pattern in different files.
- Cross-domain prerequisites: none.
- TDD shape: DELETE-W-LOCK.
- Failing test(s) to write FIRST:
  - Add architecture test `test_issue_workflow_serialization_has_no_self_aliases`:
    1. `"active_exception = _active_exception" not in _source("backend/app/services/_issue_workflow/serialization.py")` — RED today (`:18`).
    2. `"_serialize_exception_with_user_names = serialize_exception_with_user_names" not in _source(...)` — RED today (`:41`).
  - Behavioral pin: existing `tests/.../test_issue_workflow.py` covers `serialize_refreshed_issue` happy path; verify the `active_exception` and `serialize_exception_with_user_names` callers (`execution.py:37-38, :214, :226, :250, :274`) keep returning identical objects.
- Code/file changes (after test is failing):
  - Edit `backend/app/services/_issue_workflow/serialization.py`:
    - Delete `:18 active_exception = _active_exception`. Reachability: `execution.py:37,226` calls `active_exception(issue)`. Replace with one of:
      - **Option A (preferred)**: change the import at `:10` from `_active_exception` to public re-import: `from app.services._issue_register.serialization import active_exception` (verify `_issue_register/serialization.py:47-60` exposes the function). If the source has `_active_exception` rather than `active_exception` in `_issue_register/serialization.py`, rename it there (publish a public name) and drop the underscore alias.
      - **Option B**: keep the import as `_active_exception` and inline its usage in `execution.py` (`active = _active_exception(issue)` — minor).
      Recommended: **Option A** — promote the underscore in `_issue_register/serialization.py:47` to public `active_exception` and import it directly here.
    - Delete `:41 _serialize_exception_with_user_names = serialize_exception_with_user_names`. Loop B noted no other importer of `_serialize_exception_with_user_names` from `_issue_workflow.serialization` (the local module's `serialize_exception_with_user_names` at `:21` is the live exported name and `execution.py:38` already imports the public one).
- Lock/TOML/contract updates (in same commit):
  - Add the structural lock above.
  - No capability-contract change.
  - No TOML allowlist edits.
- README / doc updates (in same commit):
  - `backend/app/services/_issue_workflow/README.md` — already lists `serialization.py` only by name; no edit required.
- Verification commands to run:
  - `pytest tests/backend/pytest/api/v1/test_issue_workflow.py -q`
  - `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "issue_workflow"`
  - `ruff check backend/app/services/_issue_workflow`
  - `mypy backend/app/services/_issue_workflow`
- Commit boundary: single commit — title `B-N3: remove bidirectional underscore aliases in _issue_workflow/serialization`.
- Rollback note: safe to revert; quoting Loop B "no callers reach the underscored variants outside this file".
- Effort: S.

---

## Item #53 — S4.1 — Issue workflow service collapse

- Final disposition (one phrase): DELETE-FACADE (rewrite execution.py to import lifecycle helpers directly; drop `IssueWorkflowService`).
- Dependencies (in-domain): independent of the others, but the structural lock at `test_architecture_deepening_contracts.py:1237` (`assert "IssueWorkflowService." not in lifecycle_source`) still applies — and it's already GREEN today (the assertion is about `lifecycle.py`, not `execution.py`). The cleanup target is `execution.py:49,119,143,162,183,202,237,266` plus the wrapper class itself.
- Cross-domain prerequisites: none. Confirmed: only one external module imports `IssueWorkflowService` (`_issue_workflow/execution.py:49`); the public re-export at `app.services.issue_workflow_service:1` has no other consumers (verified by grep).
- TDD shape: DELETE-FACADE + DELETE-W-LOCK.
- Failing test(s) to write FIRST:
  - Add architecture test `test_issue_workflow_execution_imports_lifecycle_directly`:
    1. `"IssueWorkflowService" not in _source("backend/app/services/_issue_workflow/execution.py")` — RED today (used at `:49,119,143,162,183,202,237,266`).
    2. `"from app.services._issue_workflow.assignment import" in _source("backend/app/services/_issue_workflow/execution.py")` (or whichever lifecycle module hosts each function — see below).
    3. `not Path("backend/app/services/issue_workflow_service.py").exists()` (final state — file deleted).
    4. `not hasattr(app.services._issue_workflow.service, "IssueWorkflowService")` — RED today.
  - Behavioral pin: existing `tests/.../test_issue_workflow.py` covers all 7 verbs (assign, start, progress, close, request, approve, revoke, exception) — re-run after the swap.
- Code/file changes (after test is failing):
  - Edit `backend/app/services/_issue_workflow/execution.py:49` — delete `from app.services.issue_workflow_service import IssueWorkflowService`.
  - Replace each `IssueWorkflowService.<method>(...)` call with the underlying function. The mapping (from `_issue_workflow/service.py:33-41`):
    - `IssueWorkflowService.assign_issue` → `from .assignment import assign_issue` (`:119`).
    - `IssueWorkflowService.start_remediation` → `from .remediation import start_remediation` (`:143`).
    - `IssueWorkflowService.update_progress` → `from .remediation import update_progress` (`:162`).
    - `IssueWorkflowService.close_issue` → `from .closure import close_issue` (`:183`).
    - `IssueWorkflowService.request_exception` → `from .exceptions import request_exception` (`:202`).
    - `IssueWorkflowService.approve_exception` → `from .exceptions import approve_exception` (`:237`).
    - `IssueWorkflowService.revoke_exception` → `from .exceptions import revoke_exception` (`:266`).
  - Delete `backend/app/services/issue_workflow_service.py` (5 lines, all re-export).
  - Delete `IssueWorkflowService` class in `backend/app/services/_issue_workflow/service.py:25-44` (and the `__all__` mention at `:48-55`). The file becomes either empty or a thin stub — recommended: `git rm` the file entirely after confirming no test imports it (verified by grep — only `_issue_workflow/__init__.py:3` mentions `app.services.issue_workflow_service` as a comment).
  - Update `_issue_workflow/__init__.py` if its docstring at `:3` still references `app.services.issue_workflow_service` — drop or rephrase the line.
- Lock/TOML/contract updates (in same commit):
  - Add the structural lock above.
  - Existing lock `test_architecture_deepening_contracts.py:1237` (`assert "IssueWorkflowService." not in lifecycle_source`) still passes (it asserts about `lifecycle.py`, not `execution.py`).
  - **Update lock `test_architecture_deepening_contracts.py:1192-1206`** — line `:1193` imports `from app.services._issue_workflow import execution, lifecycle, loading, outbox, serialization, source_validation`. After #8/#28 `source_validation.py` may be deleted; delete it from this import too. After #53, the lock should also assert that `execution.py` imports the lifecycle modules directly (already partly there at `:1203-1204`).
  - No TOML allowlist edits.
- README / doc updates (in same commit):
  - `backend/app/services/_issue_workflow/README.md` — drop `service.py` from the contents list at `:15`, add `assignment.py`, `closure.py`, `remediation.py`, `exceptions.py`, `loading.py`, `outbox.py`, `serialization.py`, `source_validation.py`, `update_plans.py`, `exception_selection.py`, `transitions.py`, `lifecycle.py`, `execution.py` (refresh to reality).
- Verification commands to run:
  - `pytest tests/backend/pytest/api/v1/test_issue_workflow.py -q`
  - `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k "issue_workflow"`
  - `pytest tests/backend/pytest -q -k "issue"`
  - `ruff check backend/app/services/_issue_workflow backend/app/services`
  - `mypy backend/app/services/_issue_workflow backend/app/services`
- Commit boundary: single commit — title `S4.1: collapse IssueWorkflowService facade; execution.py imports lifecycle directly`.
- Rollback note: safe to revert; the static-method binds are pure pass-throughs, so the swap is mechanical.
- Effort: S.

---

## Domain-level dependency graph (in-domain ordering)

```
Independent leaves (run anytime, in any single-developer order):

   #2  (B-N1)        — drop 4 underscore aliases in source_validation.py
   #41 (B-N3)        — drop 2 underscore aliases in serialization.py
   #53 (S4.1)        — collapse IssueWorkflowService facade
   #29 (S4.6)        — extract canonical source_type_value
   #14 (S4.4)        — drop direct-send notification helpers (assert outbox)
   #27 (S4.2)        — delete endpoint loading copy

Sequenced subgraph (must run in this order):

   #2 (B-N1) ─┐
              ├──► #8 (B-N2) ──► #28 (S4.3) ──► #30 (S4.10)
              │                                   ▲
   #41 (B-N3) ┘                                   │
                                                  │
   #14 (S4.4) ──────────────────────────────────►─┤
                                                  │
   #27 (S4.2) ──────────────────────────────────►─┘
```

Rationale:
- `#2` and `#41` are alias-only deletes; landing them before `#8` keeps `source_validation.py` and `serialization.py` clean before the structural moves.
- `#8` (B-N2) splits owner-validation off and prepares the link/vendor body deletion. `#28` (S4.3) finishes the link/vendor consolidation by repointing endpoint and workflow callers to `_issue_register/source_mutation.py`. `#28` strictly requires `#8`'s import-graph rewrite.
- `#14`, `#27`, `#28` each remove one consumer cluster of underscored barrel names; `#30` then prunes the now-dead/now-renamable barrel surface in one mechanical pass. `#30` therefore strictly trails all three.
- `#29` is independent vocabulary work; placing it after `#28` lets the canonical helper live next to its main consumer, but it can land anytime.
- `#53` is a service-facade collapse and is decoupled from every other item; it can land anywhere in the sequence.

Recommended single-developer execution order (sequential):

```
1. #2  (B-N1)         — alias-clean source_validation.py
2. #41 (B-N3)         — alias-clean serialization.py
3. #53 (S4.1)         — collapse IssueWorkflowService facade
4. #29 (S4.6)         — extract source_type_value canonical
5. #14 (S4.4)         — outbox-only notifications
6. #27 (S4.2)         — delete endpoint loading copy
7. #8  (B-N2 part a)  — move owner-validation; shrink source_validation
8. #28 (S4.3)         — collapse link/vendor; remove _shared/links body
9. #30 (S4.10)        — prune barrel underscored re-exports
```

This ordering minimizes churn on `_shared/__init__.py` (touched in 5+8+9 only as overlapping subsets) and keeps each commit self-contained.

---

## Cross-domain prerequisites note

**Items in this domain that depend on other-domain work**: none. All nine items are issue-domain internal (Loop B explicitly verified: zero hits when grepping for these helpers outside `_issue_register`, `_issue_workflow`, `issues/_shared`, `issues/crud`, `issues/links`, `issues/outbox handlers`, `issue_deadline_service.py`).

**Items in this domain that block other-domain work**: none observed — no Cross-cutting Audit, Approvals, KRI, Vendor, or Frontend item from Phase 2 declared a dependency on these issue-domain helpers. The capability contract row `AUTHZ-ISSUES-REMEDIATION` (`docs/security/authorization-capability-contract.md:128`, `.json:629`) is the only cross-domain artifact touched, and it stays inside the same commits as the file moves (atomic-edit invariant per AGENTS.md / architecture-lock contract).

**Atomic-commit reminders**:
- Every code-touch commit that removes a file path cited by `service_policy` must update `docs/security/authorization-capability-contract.{md,json}` in the same commit and re-run `scripts/security/validate_authz_capability_contract.py`. This applies to `#28` (drops `_shared/links.py` from the citation) and possibly `#30` (if `_shared/serialization.py` is reduced to a re-export shim).
- The architecture-lock at `tests/backend/pytest/test_architecture_deepening_contracts.py:1192-1206` enumerates `_issue_workflow` modules; both `#8` and `#53` must update that import list when `source_validation.py` is deleted.
- No TOML allowlist (`_archive_allowlist.toml`, `_naming_allowlist.toml`, `_capabilities_all_allowlist.toml`, `_endpoint_commit_allowlist.toml`) names any module being moved — verified.

End of Phase 3 Loop 1 plan.
