# Phase 6 Verification — Recipe 01 Issues + #43

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Build commit ref: `1ee872a4`.
Verification mode: empirical (read actual code at every cited file:line; verify that proposed RED tests would fail today).

Scope: 10 items — `#2, #8, #14, #27, #28, #29, #30, #41, #43, #53`.

---

## Item #2 — B-N1 — Drop 4 underscore aliases in `_issue_workflow/source_validation.py`
- File:line citations: PASS — `backend/app/services/_issue_workflow/source_validation.py:117-120` exist; `:122-130` is `__all__`.
- Quote verbatim check: PASS — all 4 alias literals match exactly:
  - `_ensure_owner_assignable = ensure_owner_assignable` at `:117`
  - `_issue_link_department_ids = issue_link_department_ids` at `:118`
  - `_resolve_vendor_department_and_access = resolve_vendor_department_and_access` at `:119`
  - `_validate_user_exists = validate_user_exists` at `:120`
- "RED-now" check: would the proposed test fail today?
  - Test 1: `assert "_ensure_owner_assignable = ensure_owner_assignable" not in text` → currently the literal is at `:117` → fails today: **YES**
  - Test 2-4: same pattern, all four literals present → fails today: **YES**
- Implementation files exist: PASS — file present.
- Lock/doc updates target real lines: PASS — no allowlist edits required (verified no entry in the four TOMLs mentions `source_validation.py`); `__all__` at `:122-130` does not list the underscored aliases.
- Phase 4 corrections applied: PASS — RED test has `pytestmark = pytest.mark.contract` at module scope.
- Effort plausibility: PASS — 1.5h is realistic; 4 literal deletions + new lock test.
- Issues found: none.
- Recommendation: **ACCEPT**.

---

## Item #8 — B-N2 — Source-validation split + canonical link helpers consolidation
- File:line citations: MOSTLY PASS — but several minor inaccuracies:
  - `backend/app/services/_issue_workflow/assignment.py` exists; does NOT yet expose `validate_user_exists` or `ensure_owner_assignable` — confirmed.
  - `backend/app/services/_issue_workflow/source_validation.py:16-21` is `validate_user_exists` body — confirmed.
  - `:24-42` is `ensure_owner_assignable` body — confirmed.
  - `:45-114` (the recipe says delete `issue_link_department_ids` and `resolve_vendor_department_and_access` bodies here) — actual extents: `issue_link_department_ids` at `:45-86`, `resolve_vendor_department_and_access` at `:89-114`. Recipe range covers both correctly.
  - `update_plans.py:9-14` import block — confirmed lines `9-14` are the `source_validation` import.
  - `execution.py:41-47` import block — confirmed: `from app.services._issue_workflow.source_validation import (clear_issue_source_links, ensure_issue_source_link, ensure_owner_assignable, resolve_issue_source_metadata, validate_user_exists,)`.
  - `_shared/validation.py:11-37` — confirmed: `_validate_user_exists` at `:11-16`, `_ensure_owner_assignable` at `:19-37`.
- Quote verbatim check: PASS — body extents match.
- "RED-now" check:
  - Test: `assert hasattr(assignment, "validate_user_exists")` → currently NOT exposed on `assignment.py` → fails today: **YES**.
- Implementation files exist: PASS.
- Lock/doc updates target real lines: PARTIAL — recipe references `tests/backend/pytest/test_architecture_deepening_contracts.py:1193` for the `source_validation` import tuple; CONFIRMED at `:1193`. **However, recipe DOES NOT mention `:1199 hasattr(source_validation, "resolve_issue_source_metadata")` and `:1203 module_name in ("loading", "outbox", "serialization", "source_validation")` — both also reference `source_validation` and would break if commit (b) deletes the file.**
- Phase 4 corrections applied: PASS — recipe uses `client_factory` per CLAUDE.md, declares `pytestmark = pytest.mark.contract` (existing file at `:9`), 2-commit boundary preserved.
- Effort plausibility: PASS — 6h for 2 commits, ~5 files moved, capability contract atomic edit.
- Issues found:
  1. SHOULD FIX (yellow): If commit (b) deletes `source_validation.py`, `:1199` and `:1203` of `test_architecture_deepening_contracts.py` must ALSO be updated — recipe only mentions `:1193`. Add explicit edit list including all three lines.
  2. README `_issue_workflow/README.md:11` already lists `assignment.py` (line 11). Recipe says "add `assignment.py - owner-assignment validation ...`" but the line exists; recipe should phrase as "update `:11` to include description" rather than "add to Contents". Trivial.
- Recommendation: **REWORK** — narrow fix: extend the deepening-contract edit to cover `:1193, :1199, :1203` (all three reference `source_validation`); rephrase README edit to "update line 11" rather than "add".

---

## Item #14 — S4.4 — Issues outbox-only notification cleanup
- File:line citations: PASS:
  - `_shared/notifications.py:24` — `_notify_issue_assigned` (verified literal `async def _notify_issue_assigned`).
  - `:43` — `_notify_exception_requested`.
  - `:80` — `_notify_exception_approved`.
  - `:14-21` — `_get_active_user_with_permissions` def.
  - `:24-103` — recipe says delete bodies in this range; actual extents: `_notify_issue_assigned` at `:24-40`, `_notify_exception_requested` at `:43-77`, `_notify_exception_approved` at `:80-103`. Range is correct.
  - `_shared/__init__.py:12-17` — confirmed (notification imports).
  - `:62-64` — confirmed (`__all__` entries for `_notify_*`).
  - `:13, 53` — confirmed (`_get_active_user_with_permissions` import and `__all__` entry).
- Quote verbatim check: PASS.
- "RED-now" check:
  - Test 1: `assert not hasattr(notifications, "_notify_issue_assigned")` → currently `hasattr` → fails today: **YES**.
  - Test 2: barrel guard list — `_notify_*` all in `__all__` → fails today: **YES**.
- Implementation files exist: PASS.
- Lock/doc updates target real lines: PASS — `_shared/README.md:14` is `notifications.py` (verified).
- Phase 4 corrections applied: PASS — RED test has `pytestmark = pytest.mark.contract`. Recipe correctly notes the test imports go through SUBMODULE (`from app.api.v1.endpoints.issues._shared.notifications import ...` at `tests/backend/pytest/api/v1/test_issue_workflow.py:10`), NOT through the barrel — verified by `grep -n "_notify\|_get_active_user_with_permissions" tests/.../test_issue_workflow.py`. Submodule-direct.
- Effort plausibility: PASS — 5h for test rewrite + body deletion + lock + README.
- Issues found:
  1. NICE-TO-HAVE: Recipe sketches the test rewrite at `:10,679-708` but the test currently calls `_notify_issue_assigned` at `:679` and `_notify_exception_approved` at `:685`, expecting `Notification` rows. The rewrite must drive the workflow endpoint via `client_factory` AND assert `OutboxEvent` row exists (not `Notification` row, since outbox handler creates the notifications downstream). Recipe sketch is correct but conceptually requires the integration (workflow → outbox → handler → notification) chain be left intact OR the test asserts ONLY `OutboxEvent` enqueue. Recipe's sketch shows the latter (asserts `OutboxEvent` only) — acceptable.
- Recommendation: **ACCEPT**.

---

## Item #27 — S4.2 — Issue-loading duplicate deletion
- File:line citations: PASS:
  - `backend/app/api/v1/endpoints/issues/_shared/loading.py` exists; verified contains `_get_issue_with_relations` at `:22`, `_get_readable_issue_or_404` at `:50`, `_get_writable_issue_or_404` at `:59`.
  - `backend/app/services/_issue_workflow/loading.py` exists; contains `get_issue_with_relations`, `get_readable_issue_or_404`, `get_writable_issue_or_404` (public names).
  - Loop B claim "byte-identical" — verified: endpoint loader bodies (`:22-65` minus the underscore prefix in function names) match service loader bodies.
  - Consumer file:line refs:
    - `crud/contextual.py:20, 95` — confirmed (`_get_issue_with_relations` import + call).
    - `crud/create.py:21, 107` — confirmed.
    - `crud/detail.py:10, 21` — confirmed.
    - `links.py:14, 80, 128` — confirmed.
- Quote verbatim check: PASS — `selectinload(Issue.links).selectinload(IssueLink.risk)` is literally at endpoint `_shared/loading.py:29`.
- "RED-now" check:
  - Test: `assert "selectinload(Issue.links).selectinload(IssueLink.risk)" not in text` → currently the fragment IS at `:29` → fails today: **YES**.
- Implementation files exist: PASS.
- Lock/doc updates target real lines: PASS — existing lock at `test_architecture_deepening_contracts.py:1192-1206` already asserts service-side presence; `_shared/README.md:13` is `loading.py`.
- Phase 4 corrections applied: PASS — RED test has `pytestmark = pytest.mark.contract`.
- Effort plausibility: PASS — 5h for 4 endpoint repoints + delete + barrel cleanup + README.
- Issues found:
  1. NICE-TO-HAVE: Recipe says drop `_get_*` re-exports from `_shared/__init__.py:11, 54-56` — verified at `:11` (import line) and `:54-56` (`__all__` entries `_get_issue_with_relations`, `_get_readable_issue_or_404`, `_get_writable_issue_or_404`). Both line refs accurate.
- Recommendation: **ACCEPT**.

---

## Item #28 — S4.3 — Issue source-mutation triplicate collapse
- File:line citations: PASS:
  - `_issue_register/source_mutation.py:28-53` — `resolve_vendor_department_and_access` body. Verified.
  - `:56-97` — `issue_link_department_ids` body. Verified.
  - `_shared/links.py:11-37` — `_resolve_vendor_department_and_access` (endpoint version). Verified.
  - `_shared/links.py:39-80` — `_issue_link_department_ids`. Verified.
  - `_issue_workflow/source_validation.py:45-114` — `issue_link_department_ids` and `resolve_vendor_department_and_access` (workflow version). Verified.
  - `update_plans.py:9-14` import — verified.
  - `endpoints/issues/links.py:13-19` import block (`_resolve_vendor_department_and_access`). Verified.
  - `:68` `_resolve_vendor_department_and_access(...)` call. Verified.
- Quote verbatim check: PASS — three byte-identical bodies confirmed by reading all three.
- "RED-now" check:
  - Test 1: `assert "async def _resolve_vendor_department_and_access" not in text` (endpoint links.py) → currently AT `:11` → fails today: **YES**.
  - Test 2: same for `_issue_link_department_ids` (endpoint) → currently AT `:39` → fails today: **YES**.
  - Test 3: `assert "async def issue_link_department_ids" not in text` (workflow source_validation.py) → currently AT `:45` → fails today: **YES**.
  - Test 4 (canonical preservation): `"async def issue_link_department_ids" in text` (register source_mutation.py) → AT `:56` → passes today.
- Implementation files exist: PASS.
- Lock/doc updates target real lines: PASS — capability contract `.md:128` and `.json:629` confirmed contain `_shared/links.py` token.
- Phase 4 corrections applied: PASS — `pytestmark = pytest.mark.contract` in RED test.
- Effort plausibility: PASS — 6h, chain item with capability contract atomic edit.
- Issues found:
  1. NICE-TO-HAVE: Recipe says `_shared/__init__.py:10, 57, 66` — verified at `:10` (`from .links import _issue_link_department_ids, _resolve_vendor_department_and_access`), `:57` (`"_issue_link_department_ids"` in `__all__`), `:66` (`"_resolve_vendor_department_and_access"` in `__all__`). All accurate.
- Recommendation: **ACCEPT**.

---

## Item #29 — S4.6 — Source-type vocabulary canonicalization
- File:line citations: PASS:
  - `_issue_register/source_mutation.py:24-25` — `def _source_type_value(source_type: IssueSourceType | Enum | str) -> str: return source_type.value if isinstance(source_type, Enum) else str(source_type)`. Verified.
  - `:162` `source_type_value = _source_type_value(source_type)` — verified literal at line 162.
  - `:164, 175, 192` references — verified all use the local `source_type_value` variable.
  - `_issue_workflow/update_plans.py:19-20` — `def source_type_value(source_type) -> str: return source_type.value if hasattr(source_type, "value") else str(source_type)`. Verified.
  - `_issue_register/linked_context.py:103-104` — `def source_type_value(source_type: IssueSourceType | str) -> str: return source_type.value if isinstance(source_type, IssueSourceType) else str(source_type)`. Verified.
  - `:110` call site — verified `source_type = source_type_value(issue.source_type)`.
- Quote verbatim check: PASS — three definitions at three locations.
- "RED-now" check:
  - Architecture test: `assert hasattr(constants, "source_type_value")` → constants.py has only the 7 UNKNOWN_*_LABEL strings (verified) → fails today: **YES**.
  - Architecture test 2: `defs == 0` → 3 defs exist in TRIO → fails today (defs == 3): **YES**.
  - Behavior test: imports `from app.services._issue_register.constants import source_type_value` → ImportError → fails today: **YES**.
- Implementation files exist: PASS.
- Lock/doc updates target real lines: PASS — `_issue_register/README.md` exists; recipe appends a Contents bullet (additive).
- Phase 4 corrections applied: PASS — architecture test under `architecture/` declares `pytestmark = pytest.mark.contract`; behavior test at flat root (no contract mark needed).
- Effort plausibility: PASS — 3h for helper + 3 import repoints + variable shadow rename + 2 tests.
- Issues found:
  1. NICE-TO-HAVE: Recipe at `:702` correctly notes the `source_mutation.py:162` shadowing problem (local variable `source_type_value = _source_type_value(...)` shadows the import). The rename to `value = source_type_value(source_type)` cascades to 4 reference lines `:162, :164, :175, :192` — verified all 4 use the local name. Recommendation accurate.
  2. NOTE: The three local definitions are subtly DIFFERENT:
     - `source_mutation.py:24-25`: uses `Enum` test
     - `update_plans.py:19-20`: uses `hasattr(source_type, "value")` test
     - `linked_context.py:103-104`: uses `IssueSourceType` test (narrower)
     Recipe's canonical implementation uses `Enum` test which preserves all three behaviors EXCEPT the `linked_context` narrow version (which would now also accept other enums). Verified safe by Loop B note that all callers pass `IssueSourceType`. Recipe's behavior test parameterizes `IssueSourceType, str, _OtherEnum, None` — covers all three semantics.
- Recommendation: **ACCEPT**.

---

## Item #30 — S4.10 — `issues/_shared/__init__.py` underscore re-export pruning
- File:line citations: PASS — comprehensively verified by AST parse:
  - Total `__all__` entries: **36** (matches Phase 4 correction).
  - Public names: **13**.
  - Underscored names: **23**.
  - Decomposition: 14 prunable + 9 to re-point = 23. Confirmed by recipe disposition table.
- Quote verbatim check: PASS — every name in the recipe's per-name disposition is present in `__all__`.
- "RED-now" check:
  - Test 1: `assert underscored == []` for `barrel.__all__` → 23 underscored names → fails today: **YES**.
  - Test 2: explicit guard list of 23 names → all 23 present → fails today: **YES**.
- Implementation files exist: PASS.
- Lock/doc updates target real lines: PASS.
- Phase 4 corrections applied: PASS — `pytestmark = pytest.mark.contract` at module scope of new RED test; counts (36/13/23/14/9) match Phase 4.
- Effort plausibility: PASS — 6h for full barrel rewrite + 5 endpoint repoints + lock + README + capability-contract.
- Issues found:
  1. NICE-TO-HAVE: Recipe disposition row 14 says "drop `_get_active_user_with_permissions` (line `:13, 53`) — drop unless `notifications.py` retains it" — this depends on whether #14 deletes `notifications.py` entirely. After #14, if `notifications.py` is deleted, `_get_active_user_with_permissions` is gone too; if `notifications.py` remains (helper retained), the line stays. Recipe correctly defers; OK.
  2. NICE-TO-HAVE: Recipe disposition row 22 says re-point `_link_matches_issue_source` to `_issue_register.linked_context.link_matches_issue_source` and rename call site at `links.py:135`. Verified — `link_matches_issue_source` is defined at `_issue_register/linked_context.py:107` (public name).
  3. NICE-TO-HAVE: Recipe disposition row 21 says re-point `_issue_source_link` consumer at `links.py:134` to `_issue_register.linked_context.issue_source_link`. Verified — public `issue_source_link` is at `_issue_register/linked_context.py:118`.
  4. NICE-TO-HAVE: Recipe disposition row 23 says re-point `_serialize_issue_link` to `_issue_register/serialization.py`. The function is currently underscored (`_serialize_issue_link`) at `_issue_register/serialization.py`. Recipe suggests "promote to public `serialize_issue_link` in `_issue_register/serialization.py` and import the public name" — this is an additional rename in `_issue_register/serialization.py` not yet covered by a separate item. Acceptable as part of #30 or coordinated with #41.
- Recommendation: **ACCEPT**.

---

## Item #41 — B-N3 — Issue workflow serialization alias removal
- File:line citations: PASS:
  - `_issue_workflow/serialization.py:18` — `active_exception = _active_exception`. Verified literal.
  - `:41` — `_serialize_exception_with_user_names = serialize_exception_with_user_names`. Verified literal.
  - `:9-11` import block: `from app.services._issue_register.serialization import (_active_exception,)`. Verified.
  - `_issue_register/serialization.py` — `def _active_exception(issue: Issue)` at `:47`. Verified.
  - `_serialize_exception_with_user_names` defined at `_issue_register/serialization.py:246`.
- Quote verbatim check: PASS.
- "RED-now" check:
  - Test 1: `"active_exception = _active_exception" not in text` → currently AT `:18` → fails today: **YES**.
  - Test 2: `"_serialize_exception_with_user_names = serialize_exception_with_user_names" not in text` → currently AT `:41` → fails today: **YES**.
- Implementation files exist: PASS.
- Lock/doc updates target real lines: PASS — no other lock/doc touches required (no allowlist or capability mention).
- Phase 4 corrections applied: PASS — `pytestmark = pytest.mark.contract`.
- Effort plausibility: PASS — 2h for rename + 2 line deletions + test.
- Issues found:
  1. **CRITICAL**: Recipe says "Loop B note: only `_issue_workflow/serialization.py` imports this name." This is **factually wrong**. Verified: `_active_exception` is also imported by `backend/app/api/v1/endpoints/issues/_shared/serialization.py:18` (re-exported as endpoint shim) and re-exported in `_shared/__init__.py:19, 51`. After #41 renames `_active_exception` → `active_exception` in `_issue_register/serialization.py`, the endpoint `_shared/serialization.py:18` import would BREAK. Recipe must either:
     - (a) Update `_shared/serialization.py:18` to import `active_exception` (renaming) and re-expose, or
     - (b) Add `_active_exception = active_exception` back-compat alias in `_issue_register/serialization.py` (defeats the point of the rename), or
     - (c) Coordinate with #30 (which rewrites `_shared/serialization.py` anyway) — but #41 lands at v2 Seq 20, BEFORE #30 at Seq 54, so this CANNOT be deferred to #30.
- Recommendation: **REWORK** — Add explicit edit to `_shared/serialization.py:18, 30` in #41 commit (rename `_active_exception` → `active_exception` import; update `__all__` accordingly). Without this, #41 will break the endpoint barrel between Seq 20 and Seq 54.

---

## Item #43 — BE-N4 — Audit adapter-emitter helper (additive)
- File:line citations: PASS:
  - `backend/app/core/audit/_audit_matrix.toml` — verified 37 adapter rows via `tomllib.load`.
  - 6 audit modules exist: `risk.py, control.py, kri.py, issue.py, approval.py, vendor.py`. Verified.
  - `_emit.py` does NOT exist yet (verified). Test asserts existence; will fail RED.
  - `audit/control.py:23 control_created` boilerplate verified — recipe's BEFORE/AFTER snippet matches.
  - Existing W7 locks at `architecture/test_w7_audit_adapter_completeness_red.py` and `test_w7_audit_safe_entity_label_red.py` exist.
  - Recipe says `:13 requires a def per row at module level` — line 13 is the `MATRIX_PATH` constant; the actual lock function is at lines 33-39. Minor citation imprecision but the intent (per-row def lock) is correct.
- Quote verbatim check: PASS — `control_created` boilerplate matches actual file.
- "RED-now" check:
  - Test 1: `assert EMIT_PATH.exists()` → does not exist → fails today: **YES**.
  - Test 2: `assert "emit_adapter(" not in source` for all 37 rows → all 37 currently use `log_activity_func(`, not `emit_adapter(` → fails today: **YES**.
- Implementation files exist: PASS — `_audit_matrix.toml`, all 6 modules.
- Lock/doc updates target real lines: PASS — but see below.
- Phase 4 corrections applied: PASS — 37-row count verified (matches Phase 4 correction); `pytestmark = pytest.mark.contract`.
- Effort plausibility: PASS — 6h for helper + 37 rewrites + 2 tests.
- Issues found:
  1. **CRITICAL**: After the refactor, the existing W7 lock at `test_w7_audit_safe_entity_label_red.py:32` only watches calls to `log_activity` and `log_activity_func`. After the refactor, every audit row calls `emit_adapter(...)`, NOT `log_activity_func(...)`. The W7 lock would technically stay GREEN because it finds zero `log_activity*` calls, but it WOULD NO LONGER ENFORCE the `safe_entity_label` invariant on adapter rows. The new RED test in #43 only asserts `emit_adapter(` appears in source — it does NOT assert each call passes `safe_entity_label=`. This is a **W7 lock erosion** that the recipe acknowledges as risk but does not fix.
     - Mitigation: Add an extra assertion in the new `test_audit_adapter_emitter_helper_red.py`: for each module/function row, parse the `def` body via AST, find the `emit_adapter(...)` call, verify `safe_entity_label` keyword is present.
  2. **NOTE**: `_emit.py` starts with `_`, so the existing W7 safe_entity_label test SKIPS it (line 25 of W7 test). This means the helper itself can use `**kwargs` without triggering the lock. Recipe's helper passes `**kwargs` to `log_activity_func` — would NOT be flagged by the existing W7 test (since `_emit.py` is skipped). Consistent with recipe.
  3. **OBSERVATION**: Recipe says `safe_description` and `safe_description_siem` are optional kwargs. Verified that 4 of 6 modules (`risk.py:117-118`, `control.py:111-112`, `kri.py:113-114`, `vendor.py:113-114`) actually pass these. Helper signature accepts both; correct.
- Recommendation: **REWORK** — narrow fix: extend the new RED test to assert `safe_entity_label=` keyword is present in every `emit_adapter(...)` call for each adapter row. Without this, W7 invariant erodes silently.

---

## Item #53 — S4.1 — Issue workflow service collapse (drop `IssueWorkflowService`)
- File:line citations: PASS:
  - `_issue_workflow/execution.py:49` — `from app.services.issue_workflow_service import IssueWorkflowService`. Verified.
  - `:119` `IssueWorkflowService.assign_issue` — verified.
  - `:143` `IssueWorkflowService.start_remediation` — verified.
  - `:162` `IssueWorkflowService.update_progress` — verified.
  - `:183` `IssueWorkflowService.close_issue` — verified.
  - `:202` `IssueWorkflowService.request_exception` — verified.
  - `:237` `IssueWorkflowService.approve_exception` — verified.
  - `:266` `IssueWorkflowService.revoke_exception` — verified.
  - `_issue_workflow/service.py:33-41` static-method passthroughs — verified.
  - `_issue_workflow/__init__.py:3` — comment mentions `app.services.issue_workflow_service` — verified.
  - `services/issue_workflow_service.py` is the 5-line facade (verified `:1-5` per Read).
- Quote verbatim check: PASS.
- "RED-now" check:
  - Test 1: `assert "IssueWorkflowService" not in text` (execution.py) → currently AT `:49` → fails today: **YES**.
  - Test 2: `assert not SERVICE_FACADE.exists()` → file exists → fails today: **YES**.
  - Test 3: `assert "from app.services._issue_workflow.assignment import" in text` (execution.py) → currently NOT in text → fails today: **YES** (multiple sub-assertions, all fail).
- Implementation files exist: PASS.
- Lock/doc updates target real lines: PASS — `:1193` mentioned correctly. Recipe **does** note "After #8 may delete `source_validation`; coordinate with #8's commit (b)" — so recipe is aware of the chain coupling.
- Phase 4 corrections applied: PASS.
- Effort plausibility: PASS — 3h for mechanical replacement.
- Issues found:
  1. NICE-TO-HAVE: Existing lock at `test_architecture_deepening_contracts.py:1237` asserts `"IssueWorkflowService." not in lifecycle_source` — verified. Recipe says this lock "still passes (asserts `lifecycle.py`, not `execution.py`)". Verified that `lifecycle.py` does not contain `IssueWorkflowService` references. Correct.
  2. NICE-TO-HAVE: Recipe says drop `service.py` from `_issue_workflow/README.md:11-16`. Verified at `:15` (line 15 IS `service.py`); recipe also wants to ADD other module entries — verified that `assignment.py` at `:11`, `closure.py` at `:12`, `exceptions.py` at `:13`, `remediation.py` at `:14`, `transitions.py` at `:16` already exist. Recipe should clarify that `loading.py, outbox.py, serialization.py, lifecycle.py, execution.py, update_plans.py, exception_selection.py, contracts.py, source_validation.py` need to be ADDED, while `assignment.py, closure.py, exceptions.py, remediation.py, transitions.py` are already there and `service.py` is REMOVED.
- Recommendation: **ACCEPT** (with minor README phrasing improvement noted).

---

## Cross-cutting verification

### Phase 4 corrections check (per recipe `:33-37`):
- All NEW architecture-tier RED tests declare `pytestmark = pytest.mark.contract` at module scope: PASS (verified across all 9 RED test sketches).
- `#30` count: 36 / 13 / 23 / 14 prunable + 9 to re-point: PASS — `_shared/__init__.py.__all__` AST count returns exactly these.
- `#43` adapter rows: 37: PASS — `tomllib.load(...)["adapter"]` returns 37 rows.
- `_notify_*` test imports submodule-direct: PASS — `tests/.../test_issue_workflow.py:10` is `from app.api.v1.endpoints.issues._shared.notifications import _notify_exception_approved, _notify_issue_assigned`.

### Sequence dependencies honored:
- `#2 → #8 → #28 → #30` chain: PASS — items reference prerequisites correctly.
- `#14 → #30` (notification deletion before barrel prune): PASS — Phase 4 note that `_notify_*` test imports are submodule-direct means #30 alone does not break the test, but #14 must run first to delete the underlying functions before the barrel guard test passes.
- `#27 → #30` (loading deletion before barrel prune): PASS.
- `#41 → #30` (active_exception rename forward-compat): PASS, but see #41 critical issue above (consumer outside scope).
- `#53` independent of chain: PASS — does not touch `_shared/`.
- `#29` independent: PASS.
- `#43` independent (cross-domain): PASS.

### Quote-verbatim policy:
- All RED test quoted literals match repo state today (verified line-by-line for `:117-120`, `:24-103`, `:11-37`, `:18`, `:41`, `:24-25`, `:19-20`, `:103-104`, `:49`).

### Lock/TOML/doc realism:
- TOML files cited (`_archive_allowlist.toml`, `_naming_allowlist.toml`, `_capabilities_all_allowlist.toml`, `_endpoint_commit_allowlist.toml`) — recipe correctly says no edits needed.
- Capability contract `.md:128` and `.json:629` — verified contain `_shared/source.py, _shared/links.py, _shared/serialization.py` tokens. #8 and #28 atomic edits target real prose locations.

---

## Summary table

| Item | RED-now? | Phase 4 OK? | Recommendation | Notes |
| --- | --- | --- | --- | --- |
| #2 | YES | PASS | ACCEPT | Clean. |
| #8 | YES | PASS | REWORK | Extend deepening-contract edit to `:1199, :1203` (not just `:1193`). |
| #14 | YES | PASS | ACCEPT | Outbox-only test rewrite is realistic. |
| #27 | YES | PASS | ACCEPT | Clean. |
| #28 | YES | PASS | ACCEPT | Clean. |
| #29 | YES | PASS | ACCEPT | Behavior parity preserved across 3 callers. |
| #30 | YES | PASS | ACCEPT | Counts match Phase 4 (36/13/23/14+9). |
| #41 | YES | PASS | REWORK | Endpoint `_shared/serialization.py:18, 30` ALSO imports `_active_exception` — must be repointed in same commit (Seq 20 lands before #30 at Seq 54). |
| #43 | YES | PASS | REWORK | Add `safe_entity_label=` keyword assertion in new RED test to preserve W7 invariant after `log_activity_func` → `emit_adapter` swap. |
| #53 | YES | PASS | ACCEPT | README phrasing minor; coordinate `service_validation` import with #8(b). |

## Critical issues blocking Phase 7 final assembly

1. **#41 has a hidden consumer** at `_shared/serialization.py:18, 30` that the recipe missed. As-written, #41 will leave the endpoint barrel pointing at a non-existent name (`_active_exception`) at Seq 20, BEFORE #30 cleans up at Seq 54. Phase 7 must add the missing edit to #41's "Files to edit" list.

2. **#43 W7 lock erosion** is a silent invariant downgrade. As-written, the swap from `log_activity_func` to `emit_adapter` makes the existing W7 `safe_entity_label` lock vacuously pass. Phase 7 must extend the new RED test to assert `safe_entity_label=` keyword at every `emit_adapter` call.

3. **#8 commit (b) deepening-contract edit** is incomplete. Recipe mentions `:1193` only; deletion of `source_validation.py` requires updates at `:1199` and `:1203` as well. Without these, `pytest tests/backend/pytest/test_architecture_deepening_contracts.py` will fail with `AttributeError: module 'source_validation'` (already deleted) or `ModuleNotFoundError`. Phase 7 must extend the deepening-contract edit list.

## Recommended Phase 7 actions

For Phase 7 final assembly:
- Apply the three REWORK fixes above (extend #8(b), #41, #43 edit lists).
- All other items (#2, #14, #27, #28, #29, #30, #53) are empirically correct and ready for assembly.
- The chain `#2 → #8(a) → #8(b) → #28 → #30` is well-defined; rollback registers and effort estimates are plausible.
- The `#43` cross-domain item is independent; it can ship in any wave (P3 medium) without affecting issues domain.
