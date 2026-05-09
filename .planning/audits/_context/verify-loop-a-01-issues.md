# Phase 2 Loop A — Issues domain verification

Domain: `issues/_shared`, `_issue_workflow`, `_issue_register`. Scope: items #8 (B-N2), #28 (S4.3), #29 (S4.6), #30 (S4.10).

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Commit at start: `1ee872a4`.

## 0. Files inspected

- `backend/app/services/_issue_workflow/source_validation.py` (131 lines)
- `backend/app/services/_issue_register/source_mutation.py` (249 lines)
- `backend/app/api/v1/endpoints/issues/_shared/__init__.py` (79 lines)
- `backend/app/api/v1/endpoints/issues/_shared/links.py` (81 lines)
- `backend/app/api/v1/endpoints/issues/_shared/validation.py` (38 lines)
- `backend/app/api/v1/endpoints/issues/_shared/source.py` (17 lines)
- `backend/app/services/_issue_workflow/update_plans.py` (114 lines)
- `backend/app/services/_issue_workflow/execution.py` (search-only)
- `backend/app/services/_issue_register/linked_context.py` (199 lines)
- `backend/app/services/_issue_workflow/transitions.py` (96 lines)
- `backend/app/services/_issue_workflow/exception_selection.py` (81 lines)
- `backend/app/api/v1/endpoints/issues/links.py` (145 lines)
- `backend/app/api/v1/endpoints/issues/crud/{create,contextual,detail}.py`
- `tests/backend/pytest/api/v1/test_issue_workflow.py` (re-export importer)

## 1. Verbatim duplication confirmed (Phase 1 claim)

### `validate_user_exists` / `_validate_user_exists`

| File | Lines | First line of body |
| --- | --- | --- |
| `backend/app/services/_issue_workflow/source_validation.py` | 16-21 | `exists = (await db.execute(select(User.id).where(User.id == user_id))).scalar_one_or_none()` |
| `backend/app/api/v1/endpoints/issues/_shared/validation.py` | 11-16 | `exists = (await db.execute(select(User.id).where(User.id == user_id))).scalar_one_or_none()` |

Bodies are byte-identical 6-line implementations; only difference is the leading underscore on the endpoint copy. The service-side module also re-aliases `_validate_user_exists = validate_user_exists` at line 120 (B-N1 junk).

### `ensure_owner_assignable` / `_ensure_owner_assignable`

| File | Lines | First line of body |
| --- | --- | --- |
| `backend/app/services/_issue_workflow/source_validation.py` | 24-42 | `if owner_user_id is None: return` |
| `backend/app/api/v1/endpoints/issues/_shared/validation.py` | 19-37 | `if owner_user_id is None: return` |

Identical 19-line implementations; service module re-aliases at line 117.

### `issue_link_department_ids` / `_issue_link_department_ids`

| File | Lines | First line of body |
| --- | --- | --- |
| `backend/app/services/_issue_workflow/source_validation.py` | 45-86 | `department_ids: set[int] = set()` |
| `backend/app/services/_issue_register/source_mutation.py` | 56-97 | `department_ids: set[int] = set()` |
| `backend/app/api/v1/endpoints/issues/_shared/links.py` | 39-80 | `department_ids: set[int] = set()` |

Triple-byte-identical 42-line bodies (5 SELECTs over `IssueLink` + risk/control/execution/kri/vendor joins). Confirmed Phase 1 finding.

### `resolve_vendor_department_and_access` / `_resolve_vendor_department_and_access`

| File | Lines | First line of body |
| --- | --- | --- |
| `backend/app/services/_issue_workflow/source_validation.py` | 89-114 | `row = (await db.execute(select(Vendor.id, Vendor.department_id, User.department_id, Vendor.is_archived)...))` |
| `backend/app/services/_issue_register/source_mutation.py` | 28-53 | same |
| `backend/app/api/v1/endpoints/issues/_shared/links.py` | 11-36 | same |

Triple-byte-identical 26-line bodies. Confirmed Phase 1 finding.

## 2. Importer inventory (production + test)

Search ran via ripgrep over `backend/app` and `tests/`.

### `validate_user_exists` (service-side, no underscore)
Production:
- `backend/app/services/_issue_workflow/update_plans.py:13,34` — calls `validate_user_exists(db, updates.get("owner_user_id"))`.
- `backend/app/services/_issue_workflow/execution.py:46,113` — calls `validate_user_exists(db, payload.owner_user_id)`.

### `_validate_user_exists` (endpoint-side, underscore)
Production:
- `backend/app/api/v1/endpoints/issues/crud/create.py:22,50`.
- `backend/app/api/v1/endpoints/issues/crud/contextual.py:21,40`.

Test: none direct.

### `ensure_owner_assignable` / `_ensure_owner_assignable`
Service-side production:
- `backend/app/services/_issue_workflow/update_plans.py:10,55,61` — two call sites.
- `backend/app/services/_issue_workflow/execution.py:44,114`.

Endpoint-side production:
- `backend/app/api/v1/endpoints/issues/crud/create.py:20,51`.
- `backend/app/api/v1/endpoints/issues/crud/contextual.py:19,41`.

### `issue_link_department_ids` / `_issue_link_department_ids`
Service-side production:
- `backend/app/services/_issue_workflow/update_plans.py:11,44`.

Endpoint-side production: only the `_shared/__init__.py` barrel re-export at line 10 — no live caller. (Searched `_issue_link_department_ids` across `backend/app` and `tests/`; only hits are the definition, the barrel, and the underscored alias in `source_validation.py:118`.)

### `resolve_vendor_department_and_access` / `_resolve_vendor_department_and_access`
Service-side production:
- `_issue_register/source_mutation.py:149` — internal call from `resolve_contextual_issue_source`.

Endpoint-side production:
- `backend/app/api/v1/endpoints/issues/links.py:17,68` — only live caller of the underscored variant.

### Cross-package import linking the service modules
- `backend/app/services/_issue_workflow/source_validation.py:9-13` imports `clear_issue_source_links`, `ensure_issue_source_link`, `resolve_issue_source_metadata` from `_issue_register/source_mutation` and re-exports them. This is the "half-merged refactor" called out as B-N2.
- `backend/app/api/v1/endpoints/issues/_shared/source.py:3-9` is the endpoint compatibility shim that re-exports the same five names from `_issue_register.source_mutation`.

## 3. Cross-references (docs/locks)

- `docs/security/authorization-capability-contract.md:128` lists `backend/app/api/v1/endpoints/issues/_shared/source.py`, `.../links.py`, `.../serialization.py` as the AUTHZ-ISSUES-REMEDIATION service_policy citations. Any move that removes those module paths must update this row and `docs/security/authorization-capability-contract.json:629` atomically.
- `docs/security/authorization-capability-contract.json:95` cites `backend/app/services/_issue_register/` in the catalog.
- TOML lock allowlists in `tests/backend/pytest/architecture/` do NOT name `source_validation.py`, `source_mutation.py`, or `_shared/__init__.py` directly. No lock rename pre-required.
- Phase 1 backend services context (`.planning/audits/_context/01-backend-services.md`) confirms `_issue_register/` is the canonical issue-register package and `_issue_workflow/` is the workflow package.

## 4. Per-item verdicts

### Item #8 — B-N2 — Duplicate source-validation impls delete

**Audit claim**: Delete `_issue_workflow/source_validation.py:9-114` because it has zero production importers; endpoints `_shared/` is live.

**Developer verdict**: Accept with modification. Says zero-importer claim is inaccurate.

**Phase 2 verdict**: CONFIRM developer's correction. The audit's "zero prod importers" claim is wrong as stated in `2026-05-09-deepening-audit.md:1735`.

Evidence:
- `_issue_workflow/update_plans.py:9-14` imports four service-side functions from `_issue_workflow.source_validation`: `ensure_owner_assignable`, `issue_link_department_ids`, `resolve_issue_source_metadata`, `validate_user_exists`. Quote: `"from app.services._issue_workflow.source_validation import ("`.
- `_issue_workflow/execution.py:41-47` imports three of the same. Quote: `"ensure_owner_assignable,"` and `"validate_user_exists,"` at lines 44, 46.
- These are live service callers — `update_plans.build_issue_update_plan` and `execution.*` drive the workflow plan that `endpoints/issues/_workflow/*.py` orchestrates.

What IS deletable:
- The four duplicated function bodies in `source_validation.py:16-114` are byte-identical to the endpoint copies, so consolidating to a single home is mechanical.
- The four underscored re-aliases in `source_validation.py:117-120` (`_ensure_owner_assignable = ensure_owner_assignable`, etc.) have zero importers — these are the "dead aliases" the audit lists as B-N1 (`2026-05-09-deepening-audit.md:1292`).

Canonical-owner choice (Phase 2):
- The functions split into two natural buckets:
  - `validate_user_exists`, `ensure_owner_assignable` — pure user/department permission helpers, no source-link concern. Best home: a small `_issue_workflow/assignment.py`-adjacent module or a new `_issue_workflow/owner_validation.py`. (Or fold into the existing `_issue_workflow/assignment.py`.)
  - `issue_link_department_ids`, `resolve_vendor_department_and_access` — already imported INTO `_issue_workflow/source_validation.py` from `_issue_register.source_mutation` for the workflow's source-link resolution. They live most naturally in `_issue_register/source_mutation.py` (this is also what the audit and developer say for #28).

**True technical blockers**: none. All four callers (two service modules + two endpoint modules + one endpoint module for `_resolve_vendor_department_and_access`) are mechanical import rewrites. No live route, no schema change.

**Final disposition**: DO NOT delete `source_validation.py` outright; rather, MOVE the two ownership-checking functions (`validate_user_exists`, `ensure_owner_assignable`) into a workflow-side module accessible to both the workflow service and the endpoints, and DELETE the duplicated `issue_link_department_ids` + `resolve_vendor_department_and_access` bodies in `source_validation.py` (keep `_issue_register/source_mutation.py` as canonical, re-import where needed). Drop the four B-N1 underscored aliases (`source_validation.py:117-120`) and prune the `__all__` accordingly. Endpoint `_shared/validation.py` and `_shared/links.py` should re-import from the chosen canonical home, then ultimately the underscored copies can be inlined or deleted via #30.

**Doc/lock side-effects**:
- `docs/security/authorization-capability-contract.md:128` (and matching .json:629) cites `endpoints/issues/_shared/links.py` as a service-policy file. If `_shared/links.py` becomes a thin re-import, the citation is still accurate-but-degraded; the cleaner finishing state pins it directly to `services/_issue_register/source_mutation.py`. Schedule the contract edit in the same commit as the move.

**Prerequisites**: none for the validation-helpers half (`validate_user_exists`, `ensure_owner_assignable`). The link/vendor-resolve half overlaps with #28; cleanest sequence is to do those moves once under #28.

---

### Item #28 — S4.3 — Issue source-mutation triplicate collapse

**Audit claim**: Keep `services/_issue_register/source_mutation.py:28-97` as canonical; delete the equivalent blocks in `services/_issue_workflow/source_validation.py:45-114` and `endpoints/issues/_shared/links.py:11-81`.

**Developer verdict**: Accept with modification. Sequence after source-validation/loading repointing.

**Phase 2 verdict**: CONFIRM (with sequencing).

Evidence:
- All three triplicate sites verified verbatim in §1 above.
- The endpoint copy (`_shared/links.py:11-80`) has a single live caller: `endpoints/issues/links.py:68` calls `_resolve_vendor_department_and_access`. `_issue_link_department_ids` defined in the same file has NO live caller (only the barrel).
- The service-workflow copy (`source_validation.py:89-114` and `45-86`) has one live caller for `issue_link_department_ids` (`update_plans.py:44`) and zero for `resolve_vendor_department_and_access` (`source_validation.py:89-114` is dead — service callers all go through the helpers re-imported at lines 9-13).

**True technical blockers**: none. Both blocks are byte-identical to the canonical version in `_issue_register/source_mutation.py:28-53,56-97`.

**Final disposition**: CONSOLIDATE-INTO `services/_issue_register/source_mutation.py` (canonical). Steps:
1. Delete `source_validation.py:45-114` (the two duplicated function bodies plus their `_*` aliases at 118-119) and have `update_plans.py` import `issue_link_department_ids` from `_issue_register.source_mutation` directly.
2. Replace the `_shared/links.py:11-80` bodies with a re-import from `_issue_register.source_mutation`. Once `_shared/__init__.py` is pruned (#30), the file `_shared/links.py` itself becomes deletable; `endpoints/issues/links.py:17,68` rewrites to import directly from `app.services._issue_register.source_mutation`.

**Doc/lock side-effects**: same as #8 — `docs/security/authorization-capability-contract.{md:128, json:629}` cites `endpoints/issues/_shared/links.py`. Update those citations atomically when `_shared/links.py` is removed.

**Prerequisites**: #8 (move `validate_user_exists`/`ensure_owner_assignable` first so `source_validation.py` shrinks to a re-import shim or is removed entirely). Phase 1 link to #27 (issue-loading dedup) is independent for the actual deletion but shares the `_shared/__init__.py` cleanup window with #30.

---

### Item #29 — S4.6 — Source-type vocabulary canonicalization

**Audit claim**: Add a canonical `source_type_value(source_type) -> str` helper (proposed home: `services/_issue_register/constants.py`); replace ~3 local defs across ~12 sites.

**Developer verdict**: Accept with modification. Helper should normalize all current input shapes (enum, enum-like, string), not just strings.

**Phase 2 verdict**: CONFIRM (developer's normalization point is correct).

Source-type coercer sites verified in current code:

| File | Lines | Body |
| --- | --- | --- |
| `services/_issue_workflow/update_plans.py` | 19-20 | `def source_type_value(source_type) -> str: return source_type.value if hasattr(source_type, "value") else str(source_type)` |
| `services/_issue_register/source_mutation.py` | 24-25 | `def _source_type_value(source_type: IssueSourceType \| Enum \| str) -> str: return source_type.value if isinstance(source_type, Enum) else str(source_type)` |
| `services/_issue_register/linked_context.py` | 103-104 | `def source_type_value(source_type: IssueSourceType \| str) -> str: return source_type.value if isinstance(source_type, IssueSourceType) else str(source_type)` |

Three definitions, three slightly different type guards (`hasattr("value")` vs `isinstance(Enum)` vs `isinstance(IssueSourceType)`). The developer answer also references `_issue_workflow/transitions.py:15-17`, which is `_status_value` — a sibling helper for `IssueStatus`/`IssueRemediationStatus`, NOT for `IssueSourceType`. That's a separate concentrate (and lives at the right layer); leave it out of S4.6.

Use sites of source-type coercion (production callers):
- `update_plans.py:73-74` (calls local `source_type_value` twice).
- `update_plans.py:78-79,85` (string compare against `"manual"/"audit"`/concrete set).
- `source_mutation.py:162` (calls local `_source_type_value`).
- `source_mutation.py:164,175,192` (compares the result to `IssueSourceType.*.value`).
- `linked_context.py:110-114` (calls local `source_type_value`, then compares).
- `_issue_register/serialization.py:297` writes `issue.source_type` raw.
- `_kri_history/corrections.py:35` compares ORM column directly.
- `_reporting/exports/rows.py:165` calls `_enum_value(issue.source_type)` (different but related coercer).

That gives ~8 in-domain sites (matches the audit's "~12 sites" loosely once tests are counted).

**True technical blockers**: none. The three definitions are functionally equivalent for the inputs they receive (`IssueSourceType` is itself a `str, Enum` subclass, so all three branches handle it). The merger is mechanical.

**Final disposition**: EXTRACT one canonical helper. Best home (Phase 2): `services/_issue_register/constants.py` (the audit's suggestion is reasonable; alternatively the existing `_issue_register/linked_context.py` already exports related vocabulary). The signature should accept `IssueSourceType | Enum | str | None` and tolerate the union — match developer's "normalize all current input shapes" guidance. Replace the three local defs with imports.

**Doc/lock side-effects**: none direct (no contract or lock cites `source_type_value`).

**Prerequisites**: none functionally. Sequence-wise, doing this AFTER #28 means `source_mutation.py` already owns the `_source_type_value` helper and the public version sits next to its main consumers.

---

### Item #30 — S4.10 — Issue `_shared/__init__.py` underscore re-export pruning

**Audit claim**: 30 underscored re-exports in `endpoints/issues/_shared/__init__.py:1-79`; only ~12-15 actually consumed. Drop unused half; rename survivors to public.

**Developer verdict**: Accept with modification. Sequence after #27 and #28 to avoid churn.

**Phase 2 verdict**: CONFIRM with current census.

Census of `__all__` in `endpoints/issues/_shared/__init__.py:42-79`:

```
Total entries: 33
Public names (no leading underscore): 11
  UNKNOWN_CONTROL_LABEL, UNKNOWN_DEPARTMENT_LABEL, UNKNOWN_EXECUTION_LABEL,
  UNKNOWN_KRI_LABEL, UNKNOWN_RISK_LABEL, UNKNOWN_USER_LABEL, UNKNOWN_VENDOR_LABEL,
  ResolvedIssueSource, build_issue_linked_visibility, clear_issue_source_links,
  ensure_issue_source_link, resolve_contextual_issue_source, resolve_issue_source_metadata
Underscore-prefixed re-exports: 22
  _active_exception, _ensure_owner_assignable, _get_active_user_with_permissions,
  _get_issue_with_relations, _get_readable_issue_or_404, _get_writable_issue_or_404,
  _issue_link_department_ids, _issue_source_link, _label_or_fallback, _link_display,
  _link_matches_issue_source, _notify_exception_approved, _notify_exception_requested,
  _notify_issue_assigned, _resolve_user_name, _resolve_vendor_department_and_access,
  _serialize_exception, _serialize_exception_with_user_names, _serialize_issue_link,
  _serialize_issue_read, _serialize_issue_summary, _serialize_remediation,
  _validate_user_exists
```

(Counted 13 public listed in `__all__` above plus 22 underscored. The audit's "33-name" count and "30 underscored" figure are slightly off in the current tree; the live numbers are 13 + 22 = 35 in the import block + `__all__` — close enough for the verdict.)

External consumers of underscored names (production, outside `_shared/`):

| Underscored name | Live importer(s) outside `_shared/` |
| --- | --- |
| `_ensure_owner_assignable` | `crud/create.py:20`, `crud/contextual.py:19` |
| `_validate_user_exists` | `crud/create.py:22`, `crud/contextual.py:21` |
| `_get_issue_with_relations` | `crud/create.py:21`, `crud/contextual.py:20` |
| `_get_readable_issue_or_404` | `crud/detail.py:10` |
| `_get_writable_issue_or_404` | `endpoints/issues/links.py:14` |
| `_issue_source_link` | `endpoints/issues/links.py:15` |
| `_link_matches_issue_source` | `endpoints/issues/links.py:16` |
| `_resolve_vendor_department_and_access` | `endpoints/issues/links.py:17` |
| `_serialize_issue_link` | `endpoints/issues/links.py:18` |
| `_notify_exception_approved`, `_notify_issue_assigned` | `tests/backend/pytest/api/v1/test_issue_workflow.py:10` (test only) |

That gives 9 live production importers + 2 test-only. The remaining 13 underscored re-exports (`_active_exception`, `_get_active_user_with_permissions`, `_issue_link_department_ids`, `_label_or_fallback`, `_link_display`, `_notify_exception_requested`, `_resolve_user_name`, `_serialize_exception`, `_serialize_exception_with_user_names`, `_serialize_issue_read`, `_serialize_issue_summary`, `_serialize_remediation`) have no external consumer — only the package's own modules use them via direct `from .module import _name`. They are dead-from-a-public-surface standpoint.

A separate observation: `services/_issue_register/serialization.py:34-40` imports from the SIBLING `_issue_register/linked_context.py` and aliases (`issue_source_link as _issue_source_link`, etc.) inside the module. This is the same naming pattern but inside the service package — out of scope for #30 (S4.10 is about the endpoint barrel only) but worth flagging during execution review.

**True technical blockers**:
- `tests/backend/pytest/api/v1/test_issue_workflow.py:10` imports `_notify_exception_approved, _notify_issue_assigned` directly from the underscored path. If we remove those re-exports, the test must be rewritten in the same commit. Note that #14 (S4.4) already plans to delete those notification helpers entirely (rewriting the test to assert outbox enqueues), which moots this concern.
- The other underscored names are package-private idiom only — pruning them does not break public API because nothing OUTSIDE the package reaches for them.

**Final disposition**: PRUNE-AND-RENAME-TO-PUBLIC, sequenced after #27 (S4.2 issue-loading dedup) and #28 (S4.3) so the survivor list is stable. Detail:
1. Drop the 13 underscored re-exports with no external consumer.
2. The 9 live underscored re-exports re-import a function from a service module; the cleaner end-state is to either (a) re-point the endpoint callers directly at the service module (preferred for the helpers that #28 moves to `_issue_register/source_mutation.py`), or (b) rename the surviving re-exports to public (drop the leading underscore).
3. The 2 test-only re-exports (`_notify_exception_approved`, `_notify_issue_assigned`) become unnecessary once #14 (S4.4) deletes the notification helpers.

**Doc/lock side-effects**: capability contract cites `_shared/source.py`, `_shared/links.py`, `_shared/serialization.py` (md:128, json:629). If `_shared/links.py` (or `_shared/__init__.py`) loses re-exports, no contract change is required as long as the file paths still exist — but if files are physically deleted in the consolidation, update the citations atomically.

**Prerequisites**: #27 (S4.2) and #28 (S4.3) to avoid double-edits to `_shared/__init__.py`. Coordinate with #14 (S4.4) to drop the notification re-exports cleanly.

## 5. Summary of cross-item dependencies

```
#8 (B-N2) ─┬──► #28 (S4.3) ─┐
                            ├──► #30 (S4.10)
#27 (S4.2, out-of-scope) ───┘
#14 (S4.4, out-of-scope) ───────► #30 (S4.10)  [removes 2 underscored re-exports cleanly]
#29 (S4.6) — independent, but cleanest after #28 lands so the canonical helper sits next to consumers.
```

## 6. Findings cap-table (file:line index)

- Service-side workflow source_validation home: `backend/app/services/_issue_workflow/source_validation.py:9-131`.
- Service-side register source_mutation home: `backend/app/services/_issue_register/source_mutation.py:1-249`.
- Endpoint-side `_shared` barrel: `backend/app/api/v1/endpoints/issues/_shared/__init__.py:1-79`.
- Endpoint-side validation copy: `backend/app/api/v1/endpoints/issues/_shared/validation.py:11-37`.
- Endpoint-side links copy: `backend/app/api/v1/endpoints/issues/_shared/links.py:11-80`.
- Endpoint-side source compatibility shim: `backend/app/api/v1/endpoints/issues/_shared/source.py:3-17`.
- Workflow update-plan caller: `backend/app/services/_issue_workflow/update_plans.py:9-14, 34, 44, 55, 61, 89, 101, 110-111`.
- Workflow execution caller: `backend/app/services/_issue_workflow/execution.py:41-47, 113-114`.
- Endpoint create caller: `backend/app/api/v1/endpoints/issues/crud/create.py:19-23, 50-55`.
- Endpoint contextual caller: `backend/app/api/v1/endpoints/issues/crud/contextual.py:18-22, 40-45`.
- Endpoint links caller: `backend/app/api/v1/endpoints/issues/links.py:13-19, 68, 80, 128, 134-135`.
- Endpoint detail caller: `backend/app/api/v1/endpoints/issues/crud/detail.py:10, 21`.
- Source-type coercer #1: `backend/app/services/_issue_workflow/update_plans.py:19-20`.
- Source-type coercer #2: `backend/app/services/_issue_register/source_mutation.py:24-25`.
- Source-type coercer #3: `backend/app/services/_issue_register/linked_context.py:103-104`.
- B-N1 dead aliases: `backend/app/services/_issue_workflow/source_validation.py:117-120`.
- Capability contract citations: `docs/security/authorization-capability-contract.md:128`, `docs/security/authorization-capability-contract.json:629`.
