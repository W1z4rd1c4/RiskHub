# Phase 2 Loop B — Issues domain ADVERSARIAL re-verification

Domain: `issues/_shared`, `_issue_workflow`, `_issue_register`. Items: #8 (B-N2), #28 (S4.3), #29 (S4.6), #30 (S4.10).

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Commit at start: `1ee872a4`.

Source under challenge: `.planning/audits/_context/verify-loop-a-01-issues.md`.

---

## 0. Methodology

For every Loop A claim I:
1. Read the cited code at the cited line numbers.
2. Compared verbatim quotes against the file (≤15 words).
3. Re-ran ripgrep over `backend/app` and `tests/` for every importer/caller count.
4. Cross-checked Loop A's verdict against the audit text (`2026-05-09-deepening-audit.md`) and the developer answer.
5. Looked for blockers Loop A did not surface (cross-domain consumers, locks, contract citations).

## 1. Quote-and-line audit of Loop A's §1 (verbatim duplication)

### 1.1 `validate_user_exists` / `_validate_user_exists`

| Loop A claim | Verbatim line in file | Verdict |
| --- | --- | --- |
| `services/_issue_workflow/source_validation.py:16-21` first body line: `exists = (await db.execute(select(User.id).where(User.id == user_id))).scalar_one_or_none()` | line 19: `exists = (await db.execute(select(User.id).where(User.id == user_id))).scalar_one_or_none()` | PASS — quote verbatim, but Loop A's row says "16-21". The function spans 16–21 (def at 16, last body line at 21), correct. The "first line of body" Loop A picked is actually the THIRD body line (lines 17–18 are `if user_id is None: / return`). Phrasing imprecise; not a hallucination. |
| `endpoints/issues/_shared/validation.py:11-16` body identical | line 14 same content; function spans 11-16; verbatim | PASS |

The bodies ARE byte-identical (modulo leading underscore on the def). Loop A's `re-aliases at line 120` claim verified — `source_validation.py:120` is `_validate_user_exists = validate_user_exists`. PASS.

### 1.2 `ensure_owner_assignable` / `_ensure_owner_assignable`

| Loop A claim | Verbatim line | Verdict |
| --- | --- | --- |
| `_issue_workflow/source_validation.py:24-42` first body line `if owner_user_id is None: return` | lines 31-32: `if owner_user_id is None: / return` (split across two lines, not one) | CORRECT-WITH-CORRECTION — Loop A flattened a 2-line statement to a one-liner for the table. Same semantics; not a hallucination but informally compressed. Body span 24-42 verified. |
| `endpoints/issues/_shared/validation.py:19-37` identical | lines 26-27 `if owner_user_id is None: / return`; full body 19-37 | PASS |

Re-alias at `source_validation.py:117` → `_ensure_owner_assignable = ensure_owner_assignable`. **PASS**.

### 1.3 `issue_link_department_ids` / `_issue_link_department_ids`

| Loop A claim | File:line | Body line 1 | Verdict |
| --- | --- | --- | --- |
| `_issue_workflow/source_validation.py:45-86` body | line 46: `department_ids: set[int] = set()` | PASS |
| `_issue_register/source_mutation.py:56-97` body | line 57: `department_ids: set[int] = set()` | PASS |
| `_shared/links.py:39-80` body | line 40: `department_ids: set[int] = set()` | PASS |

Loop A's "Triple-byte-identical 42-line bodies (5 SELECTs over IssueLink + risk/control/execution/kri/vendor joins)" — count check: 86-45+1=42 lines, 97-56+1=42 lines, 80-39+1=42 lines. Five SELECT joins counted. **PASS**.

### 1.4 `resolve_vendor_department_and_access`

| Loop A claim | File:line | Body line 1 | Verdict |
| --- | --- | --- | --- |
| `_issue_workflow/source_validation.py:89-114` | line 94 starts `row = (await db.execute(...)`. The exact quote Loop A wrote: `row = (await db.execute(select(Vendor.id, Vendor.department_id, User.department_id, Vendor.is_archived)...))` is paraphrased — actual file line 94 is just `row = (` and line 96 is `select(Vendor.id, ...)`. | CORRECT-WITH-CORRECTION — Loop A used a synthesized one-liner instead of quoting verbatim. Not a hallucination; the SQL fragment exists at lines 94-100. But the table claims "first line of body" which is mis-cited. |
| `_issue_register/source_mutation.py:28-53` | same | CORRECT-WITH-CORRECTION (same compression issue) |
| `_shared/links.py:11-36` | same | CORRECT-WITH-CORRECTION (same) |

Body span verification: 114-89+1=26, 53-28+1=26, 36-11+1=26. **All three 26-line, byte-identical bodies confirmed**.

## 2. Importer/caller count audit (§2 of Loop A)

Each grep below ran over `backend/app` and `tests/`.

### 2.1 `validate_user_exists` (no-underscore)

```
update_plans.py:13 (import), :34 (call)
execution.py:46 (import), :113 (call)
source_validation.py:16 (def), :120 (alias), :129 (__all__)
```

Loop A says: "update_plans.py:13,34 — calls validate_user_exists(...)" / "execution.py:46,113". **PASS**. Two live service callers exactly as Loop A claimed.

### 2.2 `_validate_user_exists` (underscore, endpoint)

```
crud/contextual.py:21 (import), :40 (call)
crud/create.py:22 (import), :50 (call)
_shared/validation.py:11 (def)
_shared/__init__.py:40 (re-import), :73 (__all__)
```

Loop A claim: `crud/create.py:22,50` and `crud/contextual.py:21,40`. **PASS**. No test importer (verified via grep).

### 2.3 `ensure_owner_assignable` (no-underscore)

```
update_plans.py:10 (import), :55 (call), :61 (call)
execution.py:44 (import), :114 (call)
source_validation.py:24 (def), :117 (alias), :125 (__all__)
```

Loop A: "update_plans.py:10,55,61 — two call sites. execution.py:44,114". **PASS**. Two call sites in update_plans.py, one in execution.py.

### 2.4 `_ensure_owner_assignable` (underscore)

```
crud/create.py:20 (import), :51 (call)
crud/contextual.py:19 (import), :41 (call)
_shared/validation.py:19 (def)
_shared/__init__.py:40, :52
```

Loop A: "crud/create.py:20,51. crud/contextual.py:19,41". **PASS**.

### 2.5 `issue_link_department_ids` (no-underscore)

```
update_plans.py:11 (import), :44 (call)
source_validation.py:45 (def), :118 (alias), :126 (__all__)
source_mutation.py:56 (def)  ← canonical home Loop A picks
```

Loop A: "update_plans.py:11,44 — only live caller." **PASS**.

Crucial observation Loop A noted correctly: NO live caller of `_issue_register/source_mutation.py:56` `issue_link_department_ids` exists in the current tree. The canonical home Loop A proposes (`_issue_register/source_mutation.py`) currently has zero internal callers — `update_plans.py` imports from `_issue_workflow.source_validation`. Loop A's plan thus requires `update_plans.py` to start importing across packages from `_issue_register`. This pattern already exists at `source_validation.py:9` so it's consistent (Loop A noted this implicitly).

### 2.6 `_issue_link_department_ids` (underscore)

```
_shared/links.py:39 (def)
_shared/__init__.py:10 (re-import), :57 (__all__)
```

Loop A: "Endpoint-side production: only the `_shared/__init__.py` barrel re-export at line 10 — no live caller." **PASS** — zero external consumers.

### 2.7 `resolve_vendor_department_and_access` (no-underscore)

```
source_mutation.py:28 (def), :149 (internal call from resolve_contextual_issue_source)
source_validation.py:89 (def), :119 (alias), :128 (__all__)
```

Loop A: "_issue_register/source_mutation.py:149 — internal call from resolve_contextual_issue_source." **PASS**. Loop A correctly flags the workflow-side body at `source_validation.py:89-114` as DEAD: no caller imports the workflow's no-underscore version.

### 2.8 `_resolve_vendor_department_and_access` (underscore)

```
_shared/links.py:11 (def)
_shared/__init__.py:10, :66
endpoints/issues/links.py:17 (import), :68 (call)
```

Loop A: "endpoints/issues/links.py:17,68 — only live caller of the underscored variant." **PASS**.

### 2.9 Cross-package import already exists

`source_validation.py:9` has `from app.services._issue_register.source_mutation import (clear_issue_source_links, ensure_issue_source_link, resolve_issue_source_metadata,)`. Loop A correctly identifies this as the "half-merged refactor" — verified verbatim.

## 3. `_shared/__init__.py` census audit (Loop A's §4 #30)

### 3.1 `__all__` line count

Loop A says: "Total entries: 33 / Public names: 11 / Underscore-prefixed: 22".

Recount manually from `_shared/__init__.py:42-78`:
- Lines 43-49 → 7 UNKNOWN_*_LABEL public names
- Line 50 → `ResolvedIssueSource` public
- Lines 51-73 → 23 underscore entries (counted line-by-line: `_active_exception`, `_ensure_owner_assignable`, `_get_active_user_with_permissions`, `_get_issue_with_relations`, `_get_readable_issue_or_404`, `_get_writable_issue_or_404`, `_issue_link_department_ids`, `_issue_source_link`, `_label_or_fallback`, `_link_display`, `_link_matches_issue_source`, `_notify_exception_approved`, `_notify_exception_requested`, `_notify_issue_assigned`, `_resolve_user_name`, `_resolve_vendor_department_and_access`, `_serialize_exception`, `_serialize_exception_with_user_names`, `_serialize_issue_link`, `_serialize_issue_read`, `_serialize_issue_summary`, `_serialize_remediation`, `_validate_user_exists`)
- Lines 74-78 → 5 public names (`build_issue_linked_visibility`, `clear_issue_source_links`, `ensure_issue_source_link`, `resolve_contextual_issue_source`, `resolve_issue_source_metadata`)

**Actual totals: 13 public + 23 underscored = 36** (not 11 + 22 = 33 as Loop A's narrative claims).

Loop A acknowledged the discrepancy in a parenthetical: "(Counted 13 public listed in `__all__` above plus 22 underscored. The audit's '33-name' count and '30 underscored' figure are slightly off in the current tree; the live numbers are 13 + 22 = 35 in the import block + `__all__` — close enough for the verdict.)"

But Loop A's own enumerated underscored list HAS 23 names (I counted them line-by-line in the indented block); Loop A then summed them as 22. Internal arithmetic error.

**Audit said 30 underscored / 33 total. Truth: 23 underscored / 36 total. Audit miscounted by 7-3=4 underscored entries.** Loop A miscounted by 1.

The verdict (prune-and-rename) is unaffected — even if Loop A's count is off by one, the disposition holds. **CORRECT-WITH-CORRECTION**.

### 3.2 Underscored consumer table audit

Loop A's table claims 9 production importers + 2 test-only consumers; remaining 13 (sic, actually 12) underscored re-exports have no external consumer.

Recount:

| Underscored name | External consumer | Count check |
| --- | --- | --- |
| `_ensure_owner_assignable` | crud/create.py:20, crud/contextual.py:19 | PASS (2) |
| `_validate_user_exists` | crud/create.py:22, crud/contextual.py:21 | PASS (2) |
| `_get_issue_with_relations` | crud/create.py:21, crud/contextual.py:20 | PASS (2) |
| `_get_readable_issue_or_404` | crud/detail.py:10 | PASS (1) |
| `_get_writable_issue_or_404` | endpoints/issues/links.py:14 | PASS (1) |
| `_issue_source_link` | endpoints/issues/links.py:15 | PASS (1) |
| `_link_matches_issue_source` | endpoints/issues/links.py:16 | PASS (1) |
| `_resolve_vendor_department_and_access` | endpoints/issues/links.py:17 | PASS (1) |
| `_serialize_issue_link` | endpoints/issues/links.py:18 | PASS (1) |

That's 9 underscored names with 12 actual import sites.

Loop A's "2 test-only" claim (`_notify_exception_approved`, `_notify_issue_assigned` at `tests/backend/pytest/api/v1/test_issue_workflow.py:10`) is MISLEADING. The test file imports from `_shared.notifications` SUBMODULE directly (`from app.api.v1.endpoints.issues._shared.notifications import _notify_exception_approved, _notify_issue_assigned`), NOT from the `_shared/__init__.py` barrel. Removing those names from the barrel `__all__` does NOT break the test. Loop A misclassified them as barrel consumers.

Implication: pruning `_notify_exception_approved`/`_notify_issue_assigned` from the barrel is technically blocker-free; only deleting the underlying functions (#14 / S4.4) breaks the test.

### 3.3 Unused-from-outside list

Loop A names 13 underscored re-exports as having "no external consumer":
`_active_exception`, `_get_active_user_with_permissions`, `_issue_link_department_ids`, `_label_or_fallback`, `_link_display`, `_notify_exception_requested`, `_resolve_user_name`, `_serialize_exception`, `_serialize_exception_with_user_names`, `_serialize_issue_read`, `_serialize_issue_summary`, `_serialize_remediation`.

That's actually 12 names, not 13. Loop A miscounted again.

Adding the 2 test-only names whose barrel re-export is irrelevant (`_notify_exception_approved`, `_notify_issue_assigned`), the actual unused-from-the-barrel set is 14 names. Loop A's 13 is wrong by ±1-2 depending on classification.

**CORRECT-WITH-CORRECTION**. The verdict (prune underscored re-exports lacking external consumers) stands; the precise count needs revision.

## 4. Source-type coercer audit (§4 #29)

### 4.1 Definitions

Verified by `grep -rn "def source_type_value\|def _source_type_value" backend/app`:

```
backend/app/services/_issue_workflow/update_plans.py:19:def source_type_value(source_type) -> str:
backend/app/services/_issue_register/source_mutation.py:24:def _source_type_value(source_type: IssueSourceType | Enum | str) -> str:
backend/app/services/_issue_register/linked_context.py:103:def source_type_value(source_type: IssueSourceType | str) -> str:
```

Three definitions, three slightly different implementations:
- `update_plans.py:20`: `return source_type.value if hasattr(source_type, "value") else str(source_type)` — DUCK type guard
- `source_mutation.py:25`: `return source_type.value if isinstance(source_type, Enum) else str(source_type)` — generic Enum guard
- `linked_context.py:104`: `return source_type.value if isinstance(source_type, IssueSourceType) else str(source_type)` — narrow IssueSourceType guard

All three quotes verbatim. Loop A's verdict that the differences are "functionally equivalent for the inputs they receive" is essentially correct — `IssueSourceType` is a `str, Enum` subclass — but the developer's correction (helper must normalize all current input shapes) becomes load-bearing if any caller passes a *non-IssueSourceType `Enum`* (would fail under `linked_context.py:104`'s guard) or a *non-Enum object with `.value`* (would fail under `source_mutation.py:25`'s guard).

### 4.2 Call sites

Verified via grep — all 8 call sites Loop A enumerated exist:
- `update_plans.py:73, 74, 78, 79, 85`
- `source_mutation.py:162, 164, 175, 192`
- `linked_context.py:110`

Plus the related-but-distinct `_enum_value` adapter at `_reporting/exports/rows.py:165` (different signature, broader scope), `_kri_history/corrections.py:35` (direct ORM compare), and `_issue_register/serialization.py:297` (writes raw).

**Loop A's call-site enumeration: PASS** (verbatim line numbers correct; 8 in-domain + 3 adjacent).

### 4.3 Developer mention of `transitions.py:15-17`

Developer answer line 379 lists `_issue_workflow/transitions.py:15-17` as evidence for S4.6. That code at lines 15-17 defines `_status_value(value: object) -> str` — for `IssueStatus`/`IssueRemediationStatus`, NOT `IssueSourceType`. Loop A correctly excluded it from S4.6 scope. **Confirmed by direct file read**.

**Loop A verdict on #29: CORRECT**. Developer's normalization point captured.

## 5. Capability contract / lock cross-reference

### 5.1 Capability contract citations

Verified from direct read:
- `docs/security/authorization-capability-contract.md:128` — service_policy column lists `backend/app/api/v1/endpoints/issues/_shared/source.py`, `backend/app/api/v1/endpoints/issues/_shared/links.py`, `backend/app/api/v1/endpoints/issues/_shared/serialization.py` (also `_permissions/issues.py`, `_permissions/visible_ids.py`, etc., plus `_issue_register/`).
- `docs/security/authorization-capability-contract.json:629` — same `service_policy` string.
- `docs/security/authorization-capability-contract.json:95` — references `backend/app/services/_issue_register/`.

**Loop A: PASS** on the citation locations.

Loop A's flag: "If `_shared/links.py` becomes a thin re-import, the citation is still accurate-but-degraded; the cleaner finishing state pins it directly to `services/_issue_register/source_mutation.py`. Schedule the contract edit in the same commit as the move."

Reasonable. Note: the contract already cites `_issue_register/` at line 128's `service_policy` ("backend/app/services/_issue_register/ owns list grouping/context query helpers"), so promoting source_mutation's role is a small additive edit, not a swap.

### 5.2 Architecture lock surface

Loop A: "TOML lock allowlists in `tests/backend/pytest/architecture/` do NOT name `source_validation.py`, `source_mutation.py`, or `_shared/__init__.py` directly."

Verified:
- `_archive_allowlist.toml`, `_naming_allowlist.toml`, `_capabilities_all_allowlist.toml`, `_endpoint_commit_allowlist.toml` — `grep -ln "source_validation|source_mutation|_issue_workflow|_issue_register|issues/_shared"` returns no hits in any TOML.
- Only structural reference: `test_w12_issue_status_automation_lock_red.py:40` skips files under `/_issue_workflow/` for the issue-status automation lock.

**Loop A: PASS**. No lock rename required.

## 6. Cross-domain blocker check (was anything missed?)

Ran `grep -rn "issue_link_department_ids|resolve_vendor_department_and_access|validate_user_exists|ensure_owner_assignable|source_type_value|_source_type_value" backend/app | grep -v "_issue_register|_issue_workflow|issues/_shared|issues/crud|issues/links"` — **NO HITS**.

Cross-domain consumers checked:
- `_register_listings/`: zero hits.
- `_authorization_capabilities/`, `authorization_capabilities.py`: zero hits.
- `issue_deadline_service.py`: zero hits.
- `_kri_history/corrections.py:35`: ORM compare only, not a coercer call.
- `_reporting/exports/rows.py:165`: uses its own `_enum_value`, not these helpers.

**No cross-domain dependency Loop A missed.** All four helpers are issue-domain internal.

## 7. Per-item adversarial verdicts

### Item #8 — B-N2 — Duplicate source-validation impls delete

**Loop A's verdict**: CONFIRM developer's correction; do NOT delete `source_validation.py` outright. Move `validate_user_exists`/`ensure_owner_assignable` into a workflow-side module; delete duplicate `issue_link_department_ids` + `resolve_vendor_department_and_access` bodies; drop the four B-N1 underscored aliases.

**Phase 2-B verdict**: **CORRECT**.

- Quote check: PASS (every cited line verified verbatim).
- Count check: PASS (4 live service callers exactly: 2 in update_plans, 2 in execution).
- Disposition: ACCEPT-LOOP-A. The split into "owner-validation helpers" vs "link/vendor resolvers" is sound.
- Blocker missed: **none**.
- Cross-domain dependency missed: **none**.

Minor critique: Loop A's proposed split says "_issue_workflow/owner_validation.py-adjacent module or fold into the existing _issue_workflow/assignment.py". Pragmatically `_issue_workflow/assignment.py` already exists (verified `ls _issue_workflow/`); folding into it is the lower-friction path and avoids creating yet another module. Loop A is open to this; not a correction.

### Item #28 — S4.3 — Issue source-mutation triplicate collapse

**Loop A's verdict**: CONFIRM with sequencing after #8. Canonical = `_issue_register/source_mutation.py`. Replace `_shared/links.py:11-80` bodies with re-imports; rewrite `endpoints/issues/links.py:17,68` to import directly from the service.

**Phase 2-B verdict**: **CORRECT-WITH-CORRECTION**.

- Quote check: PASS for all cited line spans.
- Count check: PASS — three byte-identical bodies (each 26 + 42 lines = 68 duplicated lines per copy across the two functions).
- Disposition: ACCEPT-LOOP-A on canonical home choice; minor correction below.
- Blocker missed: **none**.
- Cross-domain dependency missed: **none**.

**Correction**: Loop A's plan has `update_plans.py` re-pointing to `_issue_register.source_mutation` for `issue_link_department_ids`. Today, NO live caller of the canonical body at `source_mutation.py:56` exists — the workflow's re-imports at `source_validation.py:9` only pull `clear_issue_source_links, ensure_issue_source_link, resolve_issue_source_metadata` (verified verbatim at lines 9-13). So Loop A's plan correctly extends the same cross-package import pattern; once `update_plans.py:11` is rewritten to import from `_issue_register.source_mutation`, the canonical body finally has a caller. This is fine but worth flagging in the plan: "the canonical body at source_mutation.py:56 is currently dead; #28 promotes it to live".

### Item #29 — S4.6 — Source-type vocabulary canonicalization

**Loop A's verdict**: EXTRACT one canonical helper into `_issue_register/constants.py`; signature accepts `IssueSourceType | Enum | str | None`; replace 3 local defs.

**Phase 2-B verdict**: **CORRECT**.

- Quote check: PASS — all three definitions verbatim.
- Count check: PASS — 8 in-domain call sites + 3 adjacent (broader scope) = ~11, matches audit's "~12 sites" loosely.
- Disposition: ACCEPT-LOOP-A. `_issue_register/constants.py` already exists (verified — 7 UNKNOWN_*_LABEL constants); adding a function there is feasible.
- Blocker missed: **none**.
- Cross-domain dependency missed: **none**.

Minor observation: `_issue_register/constants.py` is currently strings-only. Putting a callable there mixes constants with logic. Alternative homes: `_issue_register/linked_context.py` (already houses one of the three defs) or a new `_issue_register/source_type.py`. Loop A's choice is reasonable but not the only option; this is plan-level granularity and not a correction.

### Item #30 — S4.10 — Issue `_shared/__init__.py` underscore re-export pruning

**Loop A's verdict**: PRUNE-AND-RENAME-TO-PUBLIC sequenced after #27 and #28. Drop 13 underscored re-exports with no external consumer; re-point or rename the 9 live ones; the 2 test-only re-exports become unnecessary after #14.

**Phase 2-B verdict**: **CORRECT-WITH-CORRECTION**.

- Quote check: PASS on every consumer-table line:file citation.
- Count check: **FAIL — Loop A's totals are wrong**:
  - Loop A says 33 entries / 11 public / 22 underscored. Actual: **36 entries / 13 public / 23 underscored**.
  - Loop A says 13 unused underscored re-exports. Actual list (counted): **12** (`_active_exception`, `_get_active_user_with_permissions`, `_issue_link_department_ids`, `_label_or_fallback`, `_link_display`, `_notify_exception_requested`, `_resolve_user_name`, `_serialize_exception`, `_serialize_exception_with_user_names`, `_serialize_issue_read`, `_serialize_issue_summary`, `_serialize_remediation`).
  - The 2 "test-only" underscored re-exports (`_notify_exception_approved`, `_notify_issue_assigned`) are NOT actually consumed via the barrel — the test imports from `_shared.notifications` submodule directly (`tests/.../test_issue_workflow.py:10`). Removing them from `__all__` does NOT break the test. Loop A's classification of them as "test-only barrel consumers" is wrong.
  - Net unused-from-the-barrel underscored re-exports: **12 confirmed-unused + 2 falsely-claimed-as-test-blocked = 14 prunable** (without any test-rewrite blocker).
- Disposition: ACCEPT-LOOP-A's overall direction (prune + rename); modify count to 14 prunable + 9 live + the 7 UNKNOWN labels + 5 already-public service re-exports + ResolvedIssueSource (= the 13 publics).
- Blocker missed: **none**, but Loop A's "test imports the underscored name" framing is technically incorrect. The actual blocker for `_notify_*` removal is #14 deleting the underlying functions, not the barrel re-export.
- Cross-domain dependency missed: **none**.

## 8. Summary table for orchestrator

| Item | Loop A claim | Quote | Count | Disposition | Blocker | Cross-domain | Phase 2-B |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #8 | Move owner helpers; delete duplicate link/vendor bodies; drop B-N1 aliases | PASS | PASS | ACCEPT | none | none | CORRECT |
| #28 | Canonical = `_issue_register/source_mutation.py`; rewrite endpoint+workflow callers | PASS | PASS | ACCEPT | none | none | CORRECT-WITH-CORRECTION (note canonical body dead until #28 lands) |
| #29 | Extract `source_type_value` to `_issue_register/constants.py`; normalize all input shapes | PASS | PASS | ACCEPT | none | none | CORRECT |
| #30 | Prune unused underscored re-exports; rename survivors | PASS (citations) | **FAIL** (33 vs 36; 22 vs 23; 13 vs 12; misclassified test-only) | MODIFY (use real counts; reclassify `_notify_*` as not-test-blocked-via-barrel) | none | none | CORRECT-WITH-CORRECTION |

## 9. Items Loop A did NOT cover (sanity check)

The Issues domain has more findings the audit lists (e.g., #14 S4.4 outbox cleanup) but those are out-of-scope for Phase 2 Loop A's assigned set. Loop A correctly limited itself to #8, #28, #29, #30.

No additional items in the audit's Issues section are functionally pre-required for these four; the only intra-set sequencing Loop A names is `#8 → #28 → #30` and `#29 independent`. Verified consistent with developer answer's "after #8/#27" sequencing for #28 and "after loading/source-mutation" sequencing for #30.

`#27` (S4.2 issue-loading dedup) is **out-of-scope for this Phase 2 file** but Loop A correctly notes it as a co-prerequisite for #30 (loading symbols are the OTHER half of the underscored barrel surface). Verified — the loading helpers `_get_issue_with_relations`, `_get_readable_issue_or_404`, `_get_writable_issue_or_404` are imported through the barrel by the four endpoint modules.

## 10. Bottom-line adversarial findings

1. **#30 count error** is the only material defect: Loop A's totals (33/11/22/13) are wrong; truth is 36/13/23/12 (or 14 prunable when reclassifying the misframed `_notify_*` test reference). Disposition unchanged.
2. **`_notify_*` test framing** (#30): Loop A misclassifies test imports as barrel consumers; they are submodule-direct imports. This is a small interpretation bug, not a verdict-changing one.
3. **All quotes verified verbatim** at cited line numbers. No hallucinated `file:line` citations found.
4. **No cross-domain blocker missed.** The four helpers are issue-domain internal.
5. **Capability contract rows** (md:128, json:629, json:95) and the **architecture lock files** Loop A names are real and currently cite the modules being moved. Atomic edits are needed.

Loop A's **canonical-home choices** (split `_issue_workflow/source_validation.py`; promote `_issue_register/source_mutation.py`; place `source_type_value` in `_issue_register/constants.py`) are the correct end-state.

---

End of Phase 2 Loop B adversarial review.
