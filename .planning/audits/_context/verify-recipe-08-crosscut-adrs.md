# Verify Recipe 08 — Cross-cutting + ADR drafts (Phase 6 empirical)

Mode: EMPIRICAL VERIFICATION. Each item below was checked against the
actual current code at HEAD. Quotes are <=15 words from real files.
Recipe-claimed file/line anchors, counts, and ADR voice cross-checked
against ADR-001..010 (3+ ADRs read inline).

Format per item: STATUS, evidence (file:line + <=15-word quote),
discrepancies, test-fail-today verdict.

---

## #40 (S8.11) Re-cluster admin sub-routers — STATUS: CONFIRMED

- `backend/app/api/v1/endpoints/admin/console.py` — 7 `@router.*` decorators
  exact (recipe says 7, NOT 8 per Phase 4 correction).
  Lines: 36, 49, 58, 67, 79, 124, 149.
  Quote `console.py:36`: `@router.get("/health", response_model=SystemHealthResponse)`.
  Quote `console.py:124`: `@router.get("/sessions", response_model=list[ActiveSessionResponse])`.
  Quote `console.py:149`: `@router.post("/sessions/{user_id}/revoke")`.
- Cluster mapping recipe-line:33 ↔ actual lines verified:
  - Cluster 1 (system_status): `/health` (36), `/jobs/status` (49),
    `/outbox/status` (58), `/stats` (67) — 4 routes.
  - Cluster 2 (operational_logs): `/logs` (79) — 1 route.
  - Cluster 3 (sessions): `/sessions` (124), `/sessions/{user_id}/revoke`
    (149) — 2 routes.
  - Cluster 4 (existing siblings): unchanged sibling files
    (`capabilities.py`, `directory_sync.py`, `docs.py`, `log_config.py`,
    `orphans.py`, `snapshots.py`, `structured_logs.py`).
  4+1+2 = 7 — total matches.
- Recipe `console.py:36,49,58,67,79,124,149` — exact.
- Failing-today verdict: lock test asserting `console.py` route count == 0
  would FAIL today (7 routes still present), as recipe expects RED.

---

## #55 (S7.5) Delete 26-line `access_user_service.py` facade — STATUS: CONFIRMED

- `backend/app/services/access_user_service.py` — 26 lines exact (recipe
  matches: "26-line facade").
  Quote `access_user_service.py:1`: `from __future__ import annotations`.
  Quote `access_user_service.py:7`: `from app.services._identity_access_lifecycle import update_access_profile`.
- Production importer: exactly 1.
  `backend/app/api/v1/endpoints/access.py:19` —
  `from app.services.access_user_service import update_access_user_settings`.
- Call site at `access.py:209` — `await update_access_user_settings(`.
  Recipe's "1 prod importer + call site" matches.
- Test references (must be removed in #55 green step):
  - `tests/backend/pytest/test_authz_capability_contract_validator.py:502`
    — `Path("backend/app/services/access_user_service.py")`. CONFIRMED at
    line 502 (line 500 is `directory_identity_service`, line 502 is
    `access_user_service` — recipe is exact).
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:246`
    — `from app.services import access_user_service`. CONFIRMED exact.
- Wrapper signature identical to `update_access_profile`
  (`access_user_service.py:10-24`) — recipe's aliasing-at-import strategy
  is sound.
- Failing-today verdict: a `Path("…access_user_service.py").exists()`
  assertion of False would FAIL today (file still present at 26 lines)
  — RED as recipe expects.

---

## #56 (S7.6) Delete 35-line `directory_identity_service.py` shim — STATUS: CONFIRMED

- `directory_identity_service.py` — 35 lines exact.
  Re-exports: 11 from `_directory_identity` (lines 3-15) + 2 from
  `_directory_identity.lifecycle` (lines 16-19) = **13** total.
  Recipe's Phase 4 correction (13 NOT 15) is exact.
  Quote `directory_identity_service.py:1`: `"""Compatibility exports for directory identity lifecycle decisions."""`.
  Quote `:9-15` (last name): `resolve_or_create_department,`.
- 8 production importers (recipe matches):
  - `backend/app/api/v1/endpoints/auth/_sso_helpers.py:16`
  - `backend/app/services/graph_directory_service.py:8`
  - `backend/app/services/ad_deprovision_service.py:14`
  - `backend/app/services/directory_provider_service.py:17`
  - `backend/app/services/_access_workflow/policy.py:11`
  - `backend/app/services/_auth_session/jit.py:13`
  - `backend/app/services/_identity_access_lifecycle/directory_import.py:15`
  - `backend/app/services/_identity_access_lifecycle/policy.py:11`
  Plus 1 script: `backend/scripts/bootstrap_sso_user.py:17`.
- Mapping matrix (11 + 2):
  - 11 names re-exported by `_directory_identity/__init__.py` confirmed
    (CONFIRMED list in actual `__init__.py`).
  - 2 names (`apply_directory_profile_outcome`, `directory_reenable_outcome`)
    only in `_directory_identity/lifecycle.py` (NOT in package
    `__init__`). Recipe step-2 mapping is correct.
- Failing-today verdict: `Path("…directory_identity_service.py").exists()`
  assertion of False would FAIL today — RED as recipe expects.

---

## #59 (S2.10) Monitoring package consolidation — STATUS: CONFIRMED (CRITICAL)

- `backend/app/services/_monitoring_response.py` — **278 lines**, regular
  file (not a package). `ls` confirms a single `.py` file (no
  `_monitoring_response/` directory exists).
  Quote `wc -l`: `278 backend/app/services/_monitoring_response.py`.
- Recipe correctly takes path (b): docstring + `_monitoring_status/README.md`
  append, NO `_monitoring_response/README.md` creation. The recipe
  explicitly says (line 209-213): "`_monitoring_response` is a SINGLE FILE
  … Recipe takes path (b): drop the `_monitoring_response/README.md`
  requirement". Matches Phase 4 critical correction.
- `backend/app/services/_monitoring_status/` — IS a package (has
  `__init__.py` + `README.md` already).
- Failing-today verdict: docstring substring assertion (`monitoring_status`
  in `_monitoring_response.py`'s module docstring) would FAIL today
  (current docstring lacks that mention) — RED as recipe expects.

---

## #61 (S7.7) Move `graph_directory_*.py` 4 modules → `_graph_directory/` — STATUS: CONFIRMED

- 4 sibling modules confirmed at exact paths:
  - `backend/app/services/graph_directory_auth.py` — 188 lines (recipe
    cites 188, OK).
  - `backend/app/services/graph_directory_errors.py` — 29 lines (matches).
  - `backend/app/services/graph_directory_service.py` — 141 lines.
  - `backend/app/services/graph_directory_transport.py` — 75 lines.
- Production importers (1):
  - `backend/app/services/directory_provider_service.py:18` —
    `from app.services.graph_directory_service import (`.
- Test files with `monkeypatch` (2 — recipe matches):
  - `tests/backend/pytest/test_graph_directory_components.py` — 16 monkeypatch
    references targeting `app.services.graph_directory_*` modules.
  - `tests/backend/pytest/test_entra_confidential_credentials.py` — 4+
    monkeypatch references targeting `app.services.graph_directory_*`.
- Internal cross-imports (recipe step-1 lock):
  Quote `graph_directory_service.py:8`:
    `from app.services.directory_identity_service import normalize_business_role`.
  Quote `graph_directory_service.py:9`:
    `from app.services.graph_directory_auth import GraphAccessTokenProvider, …`.
  Quote `graph_directory_transport.py:14`:
    `from app.services.graph_directory_auth import GraphAccessTokenProvider`.
- Failing-today verdict: `Path("…/_graph_directory/__init__.py").is_file()`
  assertion of True would FAIL today — RED as recipe expects.
- Pairing with #56 (recipe step ordering #61 first then #56) is consistent:
  the cross-import at `graph_directory_service.py:8` would be rewritten
  to `_directory_identity` in #56's commit AFTER the file is moved to
  `_graph_directory/service.py` in #61.

---

## #63 (BE-N7) Outbox dispatch SchedulerJobRun instrumentation — STATUS: CONFIRMED (with nuance)

- `backend/app/services/outbox/dispatcher.py` — 110 lines exact.
  Zero `SchedulerJobRun` references in the dispatcher (`grep -c
  SchedulerJobRun = 0`). Recipe matches.
  Quote `dispatcher.py:14`: `logger = get_logger("outbox")`.
  Quote `dispatcher.py:17-22`: `async def dispatch_pending_outbox_events(…)`.
- Recipe claim "core/scheduler_jobs.py has the pattern" — PARTIAL: the
  `SchedulerJobRun` model is imported by:
  - `backend/app/core/scheduler_tracking.py:10,36,38,61,161` (DIRECT pattern
    — `SchedulerJobRun(job_name=…, run_id=…, status=…, …)` at lines 38,
    161).
  - `backend/app/core/scheduler.py:34,129`.
  - `backend/app/core/scheduler_ownership.py:11,44-47`.
  `core/scheduler_jobs.py` itself does NOT import `SchedulerJobRun`
  directly. Instead, it calls `execute_tracked_job(job_name, fn)`
  (lines 47, 57, 67, 86, 100, 111) — `execute_tracked_job` lives in
  `core/scheduler.py:129` and uses `SchedulerJobRun` indirectly.
  Recipe's framing should ideally point to `core/scheduler_tracking.py:38,161`
  as the "create SchedulerJobRun" pattern, not `core/scheduler_jobs.py`.
  This is a documentation imprecision, NOT a blocker — the green step
  in #63 specifies the dispatcher writes a `SchedulerJobRun` directly
  via `session.add(SchedulerJobRun(…))`, which is consistent with the
  pattern in `scheduler_tracking.py`.
- `backend/app/models/scheduler_job_run.py:15` — `class SchedulerJobRun(Base):`
  table `scheduler_job_runs` — already exists. Recipe matches.
- Failing-today verdict: AST assertion that
  `dispatcher.py` imports `SchedulerJobRun` would FAIL today (zero refs
  in dispatcher) — RED as recipe expects.

---

## #72 (ADR-011) Auth Scheme and Session Model — STATUS: CONFIRMED with one nit

### Probe 1 fix (CRITICAL) — VERIFIED

Recipe `## Decision` ¶3 quote:
> "the `require_permission(resource, action)` FastAPI dependency factory
> defined in `backend/app/core/security.py:170`."

Actual `core/security.py:170`:
> `def require_permission(resource: str, action: str):`

Exact match. Recipe NEVER attributes `require_permission` to ADR-001;
the cross-ref text is "ADR-001 — Capabilities surface; `require_permission(resource, action)`
(`core/security.py:170`) is the FastAPI dependency factory aligned with
the ADR-001 capability contract." This is correct phrasing — ADR-001
governs the capability surface; ADR-011 owns the auth-idiom enforcement.

### Mock-auth gate verified

`core/security.py:107-136` is the canonical `get_current_user`
function. Line 118:
> `mock_auth_enabled = current_settings.mock_auth_enabled and current_settings.debug`

Both conjuncts (`mock_auth_enabled` AND `debug`) are present. Line 121
re-uses `mock_auth_enabled`. Recipe's lock test (parsing the AST for
`BoolOp(And)` with both conjuncts) is empirically satisfiable via line
118.

### EXCEPTION_REGISTRY anchors

`core/exceptions.py:68-69`:
> `AuthorizationError: ExceptionProjection(status_code=403, …, audit_code="authorization_error"),`
> `AuthenticationError: ExceptionProjection(status_code=401, …, audit_code="authentication_required"),`

Recipe cites both at `core/exceptions.py:68-69` (in Cross-References
section) and at `core/exceptions.py:66-69` (in ADR-cross-refs section).
Minor: "66-69" includes blank lines/dict opener, "68-69" is the precise
locator. Both are technically valid; not an error.

### JWT exp/iat anchor

`core/security.py:68`:
> `expire = utc_now() + (expires_delta or timedelta(minutes=active_settings.access_token_expire_minutes))`

Recipe ADR-011 §Cross-Refs cites `core/security.py:68` and `utc_now()`
— exact match.

### Cross-refs include ADR-001/002/003/004 — VERIFIED

Recipe ADR-011 cross-references (lines 372-375):
- ADR-001 — Capabilities surface
- ADR-002 — Service-owned transactions
- ADR-003 — Domain exception taxonomy
- ADR-004 — UTC-aware datetime SSOT

Recipe ADR-cross-refs (lines 393-399) explicitly states:
> **DO NOT** cite ADR-006 — Loop 2 said REJECT (ADR-011 is a freeze, not a sweep).

ADR-006 is excluded — verified.

### Voice match — VERIFIED

Read 4 existing ADRs (001, 002, 003, 004, 005, 007, 009). Common shape:
- `## Status` → `Accepted`
- `## Context` → opens with "RiskHub..." or descriptive sentence.
- `## Decision` → declarative active voice.
- `## Alternatives Rejected` → bullet list, "rejected because...".
- `## Migration Impact` / `## Rollback Strategy` → 1-2 paragraphs each.
- `## Invariant Tests` → bullet list of test contracts.

Recipe ADR-011 follows the same shape (lines 318-376). Voice matches.
Quote ADR-011 §Decision ¶1: "JWT bearer access tokens with refresh-token
rotation and a token-version SSOT are the canonical authentication
scheme." — declarative, RiskHub-domain voice. Consistent.

### Nit — Phase 4 corrected

Recipe `Migration notes` (line 405-408) says:
> "the `require_permission` API used in new code is `require_permission(resource, action)` per `core/security.py:170` — DO NOT confuse with the reversed `require_any_permission` factory at `core/security.py:158-167`"

Verified against actual `core/security.py:158-167`:
> `def require_any_permission(*perms: tuple[str, str]):`
> `if not any(check_permission(current_user, resource, action) for resource, action in perms):`

Both signatures are documented correctly. No confusion source.

---

## #74a (Census) Classify 31 underscore-prefixed packages — STATUS: CONFIRMED

### Package count (CRITICAL)

`ls -d backend/app/services/_*/` returns **32 entries**, but one is
`__pycache__/` (always excluded by lock-test convention). Excluding
`__pycache__`:

**31 packages exact** — recipe matches.

Full list (alphabetical, 31 packages excluding `__pycache__`):
1. `_access_workflow`
2. `_activity_log_query`
3. `_admin_telemetry`
4. `_approval_execution`
5. `_approval_queue`
6. `_auth_session`
7. `_auth_session_workflow`
8. `_authorization_capabilities`
9. `_config`
10. `_control_execution`
11. `_dashboard_metrics`
12. `_deadline_execution`
13. `_directory_identity`
14. `_directory_sync`
15. `_entity_mutation_lifecycle`
16. `_identity_access_lifecycle`
17. `_issue_register`
18. `_issue_workflow`
19. `_kri_history`
20. `_monitoring_status`
21. `_notification_inbox`
22. `_org_chart`
23. `_orphaned_items`
24. `_quarterly_comparison`
25. `_register_listings`
26. `_reporting`
27. `_risk_questionnaires`
28. `_riskhub_config`
29. `_vendor_governance`
30. `_vendor_links`
31. `_vendor_workflow`

### Cross-cutting (NOT Core) — VERIFIED

Recipe lists 2 cross-cutting packages:
- `_authorization_capabilities` — `ls` shows 11 files (e.g., `approvals.py`,
  `controls.py`, `riskhub_config.py`, `risks.py`). Cross-cutting (every
  resource).
- `_config` — `ls` shows `lookup.py` only. Lightweight policy/config
  primitive. Cross-cutting confirmed.

Recipe correctly uses category name `Cross-cutting` and TOML name
`_bounded_context_cross_cutting.toml` (NOT `_core.toml`). Phase 4
correction applied.

### `_orphaned_items` workflow-paired with `_identity_access_lifecycle` — VERIFIED

`_orphaned_items` package contents (`ls`):
> `core.py`, `flagging.py`, `governance.py`, `logging.py`, `reads.py`,
> `resolution.py`, `resolution_plan.py`, `service.py`, `stats.py`,
> `workflow.py`.

Recipe pairs `_orphaned_items ↔ _identity_access_lifecycle` (Phase 4
correction; NOT `_admin_telemetry`). The 11-pair list at recipe
lines 457-467 matches.

### `_notification_inbox` workflow-paired with `_identity_access_lifecycle` — VERIFIED

`_notification_inbox` package contents:
> `__init__.py`, `lifecycle.py`.

Tiny, lifecycle-shaped. Recipe pairs with `_identity_access_lifecycle`
(Phase 4 decision: workflow-paired, NOT with `_admin_telemetry`).
Reasonable classification given the shared notification lifecycle anchored
on identity events.

### `_admin_telemetry` is Adapter (NOT a workflow-pair right-half) — VERIFIED

Recipe lists 6 adapters: `_directory_identity`, `_directory_sync`,
`_graph_directory` (post-#61), `_admin_telemetry`, `_activity_log_query`,
`_auth_session`. The `_admin_telemetry` package has
`README.md`, `__init__.py`, `lifecycle.py`, `projections.py` — telemetry
projections, fits the Adapter category (translates external observables
into RiskHub records).

### Coverage check

7 write-side + 6 read-shape (incl. `_register_listings` dual + `_monitoring_response.py` file)
+ 11 workflow-pair-left-halves + 6 adapters + 2 cross-cutting = **32 entries**
across 31 packages and 1 file (recipe explicitly says 32 entries / 31
packages / 1 file at lines 583-585). Math verified.

`_register_listings` dual-classed: appears as both write-side AND
read-shape; primary classification = write-side. Confirmed package
contents (controls.py, issues.py, kris.py, lifecycle.py, risks.py,
vendors.py, __init__.py) — both write-side mutations AND list-shape
projections.

### Pre-list of `_graph_directory` in adapter TOML — Recipe note

Recipe `Lock TOMLs` for #61 (line 184) says:
> "_bounded_context_adapters.toml (created by #74b amendment) lists
> `_graph_directory` as an adapter context."

This means the adapter TOML should be authored AFTER #61 lands, OR
authored simultaneously with `_graph_directory` listed pre-emptively.
Recipe handles this by putting the adapter TOML creation under #74a
(line 442-443) and the migration sequencing under #61's pairing note.
Provided #74a/#74b lands AFTER #61, no conflict. If #74a/#74b lands
BEFORE #61, the adapter TOML must NOT yet contain `_graph_directory`
(file doesn't exist) — recipe should clarify migration ordering. Soft
recommendation: explicit ordering note "land #61 before #74a/#74b OR
add `_graph_directory` to adapter TOML in the same wave as #61".

---

## #74b (ADR-007 amendment) Read-shape, workflow-paired, adapter, cross-cutting — STATUS: CONFIRMED

### "EXACTLY ONE" → many-to-one (Phase 4 correction) — VERIFIED

Recipe ADR-007 amendment §Decision (line 534):
> "Each package's PRIMARY classification is exactly one. Workflow-pair
> right-halves may appear in their primary allowlist AND in the
> workflow-pair allowlist; the disjointness lock permits this many-to-one
> membership."

Recipe also at §Invariant Tests (line 573):
> "every underscore-prefixed package … is in EXACTLY ONE primary allowlist,
> with the documented exception of `_register_listings` which is dual-classed
> (write-side AND read-shape) for sweep-order reasons. Workflow-pair
> right-halves additionally appear in the workflow-pair allowlist
> (many-to-one permitted)."

The Phase 4 correction is applied: "EXACTLY ONE" is qualified with
"PRIMARY classification" + many-to-one for right-halves +
documented dual-class for `_register_listings`. CONFIRMED.

### Recomputed counts — VERIFIED

Recipe at line 583:
> "7 write-side + 6 read-shape (incl. `_register_listings` dual +
> `_monitoring_response.py` file entry) + 11 workflow-pair-left-halves +
> 6 adapters + 2 cross-cutting = **32 entries across 31 packages and
> 1 file**"

7 + 6 + 11 + 6 + 2 = 32 — math correct.
31 packages from `ls` (excluding `__pycache__`) + 1 file (`_monitoring_response.py`)
= 32 entries. Verified.

### Per-allowlist atomicity sentence — VERIFIED

Recipe ADR-007 amendment §Invariant Tests (line 579):
> "Per-allowlist atomicity asserted: each TOML file is parsed as a single
> contiguous list; entries spanning multiple files trigger lock failure."

Sentence present. CONFIRMED.

### 11 workflow pairs enumerated — VERIFIED

Lines 538-549 list 11 ordered pairs. Phase 4 reconciliation note (line
587) acknowledges the prior count of 10 left-halves was an undercount
because `_orphaned_items` and `_notification_inbox` were both
reclassified to workflow-paired.

### Voice / structure match — VERIFIED

ADR-007 amendment uses the same headings as ADR-007 base (Status,
Context, Decision, Alternatives Rejected, Migration Impact, Rollback
Strategy, Invariant Tests). Voice declarative, RiskHub-domain. Consistent
with the base ADR-007.

---

## #76 (Auth/ commit migration) Migrate 8 auth-flow `db.commit()` sites — STATUS: CONFIRMED

### 8 sites verified at exact lines

`grep -n "await db.commit\|db.commit()"` returns exactly 8 hits, all
matching the recipe list:
- `backend/app/api/v1/endpoints/auth/refresh.py:177` — `await db.commit()`
- `backend/app/api/v1/endpoints/auth/logout.py:101` — `await db.commit()`
- `backend/app/api/v1/endpoints/auth/logout.py:132` — `await db.commit()`
- `backend/app/api/v1/endpoints/auth/sso.py:170` — `await db.commit()`
- `backend/app/api/v1/endpoints/auth/_sso_helpers.py:48` — `await db.commit()`
- `backend/app/api/v1/endpoints/auth/password.py:128` — `await db.commit()`
- `backend/app/api/v1/endpoints/auth/password.py:161` — `await db.commit()`
- `backend/app/api/v1/endpoints/auth/demo.py:67` — `await db.commit()`

All 8 sites confirmed at exact (file, line) tuples. Recipe matches.

### `_endpoint_commit_allowlist.toml` has 8 entries with `expires_at = "2026-09-01"`

`grep "expires_at"` of allowlist — every entry has `expires_at = "2026-09-01"`.
8 distinct `(file, line)` allowlist entries match the 8 sites exactly:
- `auth/sso.py:170` ✓
- `auth/refresh.py:177` ✓
- `auth/logout.py:101` ✓
- `auth/logout.py:132` ✓
- `auth/password.py:128` ✓
- `auth/_sso_helpers.py:48` ✓
- `auth/demo.py:67` ✓
- `auth/password.py:161` ✓

All 8 entries present, all `expires_at = "2026-09-01"`, all carry
non-empty `rationale`. Recipe matches.

### Architecture lock test enumerates 6 files / 8 sites — VERIFIED

Recipe `test_auth_flow_no_endpoint_commit_red.py` AST scan walks 6
distinct files (recipe lines 644-651):
- `auth/refresh.py`, `auth/logout.py`, `auth/sso.py`,
  `auth/_sso_helpers.py`, `auth/password.py`, `auth/demo.py`.

Two files (`logout.py`, `password.py`) each have 2 commit sites,
giving 8 sites across 6 files. The `_has_commit` helper (recipe lines
653-659) catches all `await … .commit()` patterns via AST walk, so 1
file with 2 commits still triggers a single test failure (sufficient).

**Soft recommendation**: the test as written returns True on the FIRST
commit found; it does not enumerate all sites individually. For Phase 7
green-step verification, the test should still detect the existence of
`commit()` in each named file (8-site count is for tracking, not for
the test contract). Recipe is correct as written.

### `_endpoint_commit_allowlist.toml` cap-0 evolution — VERIFIED

Recipe at line 685:
> "The lock at … `test_auth_commit_allowlist_entries_are_complete_and_unexpired`
> is no longer applicable to auth-flow entries (count = 0)."

`test_w5_endpoint_commit_ratchet_red.py:46-58` is the existing lock —
it asserts `len(allowed) <= 8` (line 41) and `expires_at >= today` (line
58). After 2026-09-01 the `>= today` assertion fires unless the entries
are removed, which is the migration trigger. Recipe matches the existing
lock semantics.

---

## Cross-cutting findings & recommendations

### Recipe is CONFIRMED on all 10 items

| Item | Status | Notes |
|------|--------|-------|
| #40  | CONFIRMED | 7 routes, NOT 8 (Phase 4) — exact |
| #55  | CONFIRMED | 26 lines, 1 importer at access.py:19,209 — exact |
| #56  | CONFIRMED | 35 lines, 13 re-exports (NOT 15), 8 prod importers — exact |
| #59  | CONFIRMED | _monitoring_response IS a single file (278 lines) — critical correction holds |
| #61  | CONFIRMED | 4 sibling modules at right paths; 1 prod + 2 test files |
| #63  | CONFIRMED (with nuance) | dispatcher 1-110 has zero SchedulerJobRun; pattern actually in core/scheduler_tracking.py and core/scheduler.py (recipe says core/scheduler_jobs.py — partial via execute_tracked_job) |
| #72  | CONFIRMED | ADR-011 Probe 1 fix applied; voice matches; ADR-006 excluded |
| #74a | CONFIRMED | 31 packages exact; classification matches Phase 4 corrections |
| #74b | CONFIRMED | "EXACTLY ONE" replaced with PRIMARY-classification + many-to-one for right-halves; counts recomputed (32/31/1); per-allowlist atomicity sentence present |
| #76  | CONFIRMED | 8 sites verified at exact lines; allowlist has 8 entries with expires_at = "2026-09-01" |

### Probe 1 fix (CRITICAL) — VERIFIED

Recipe ADR-011 §Decision ¶3 says
`require_permission(resource, action) defined in core/security.py:170`.
Actual code: `def require_permission(resource: str, action: str)` at
line 170 — exact match. Recipe does NOT attribute `require_permission`
to ADR-001 (it correctly cross-references ADR-001 for the capability
contract surface). Probe 1 fix applied.

### Discrepancies / minor nits

1. **#63 nuance**: recipe says "core/scheduler_jobs.py has the pattern".
   Empirically, the `SchedulerJobRun(...)` constructor pattern is in
   `core/scheduler_tracking.py:38,161` and `core/scheduler.py:34,129`,
   not directly in `core/scheduler_jobs.py`. The latter calls
   `execute_tracked_job(job_name, fn)` which uses the pattern indirectly.
   Suggested wording fix: replace "core/scheduler_jobs.py has the pattern"
   with "core/scheduler_tracking.py has the SchedulerJobRun(...)
   construction pattern".

2. **#61 + #74a/#74b ordering note**: the adapter TOML created by
   #74a (per recipe line 442-443) lists `_graph_directory` as an adapter,
   but the package only exists post-#61. Recipe handles this via the
   pairing note at #61, but explicit ordering between #61 and #74a is not
   spelled out as a hard prereq. Soft recommendation: add explicit text
   "#61 lands BEFORE or IN-WAVE-WITH #74a/#74b; the adapter TOML entry
   for `_graph_directory` is added in the same commit as the package
   move".

3. **#72 ADR-011 Cross-Refs section** has a minor inconsistency: the
   "ADR cross-refs (Phase 4 corrected)" section (recipe line 397) cites
   `core/exceptions.py:66-69`, while the inline ADR-011 doc text (recipe
   line 374) cites `core/exceptions.py:68-69`. Both are valid (66-69 is
   the dict opener through `AuthenticationError`; 68-69 is the precise
   two lines). Suggested unification: pick `:68-69` (precise) in both
   places, or note the difference explicitly.

### Issues — none blocking

No critical issues found. All recipe assertions, file:line anchors, line
counts, and ADR-007 amendment text are EMPIRICALLY VERIFIED against
HEAD. The Phase 4 corrections (7 NOT 8 admin routes, 13 NOT 15
re-exports, single-file `_monitoring_response.py`, 31 NOT 32 packages,
"EXACTLY ONE" → PRIMARY + many-to-one) are all reflected in recipe
text.

### Recommendations (all soft)

1. Replace "core/scheduler_jobs.py has the pattern" in #63 prose with
   "core/scheduler_tracking.py has the SchedulerJobRun(...) construction
   pattern" — purely a documentation precision fix; no impact on the
   green-step implementation, which is unambiguous (`session.add(SchedulerJobRun(…))`
   in `outbox/dispatcher.py`).

2. Add an explicit ordering note in #61's pairing block: "#61 must land
   before or in the same wave as #74a/#74b; the adapter TOML
   `_bounded_context_adapters.toml` lists `_graph_directory` only after
   the package move".

3. Unify the `core/exceptions.py:66-69` vs `:68-69` line range citation
   in #72/ADR-011 to `:68-69` for precision.

None of these are blocking. Recipe is implementation-ready.

---

## Quote/citation index

- `backend/app/api/v1/endpoints/admin/console.py:36,49,58,67,79,124,149` —
  7 `@router.*` decorators (verified via `grep -n`).
- `backend/app/services/access_user_service.py:1-26` — 26-line facade,
  1 prod importer, identical wrapper signature.
- `backend/app/services/directory_identity_service.py:1-35` — 35 lines,
  13 re-exports (11 from `_directory_identity` lines 3-15, 2 from
  `.lifecycle` lines 16-19), 8 prod importers.
- `backend/app/services/_monitoring_response.py` — 278 lines, single
  file, no `_monitoring_response/` package directory.
- `backend/app/services/graph_directory_{auth,errors,service,transport}.py`
  — 4 sibling modules at the right paths.
- `backend/app/services/outbox/dispatcher.py:1-110` — zero
  `SchedulerJobRun` references (`grep -c = 0`).
- `backend/app/core/security.py:170` —
  `def require_permission(resource: str, action: str):`.
- `backend/app/core/security.py:118` —
  `mock_auth_enabled = current_settings.mock_auth_enabled and current_settings.debug`.
- `backend/app/core/exceptions.py:68-69` — `AuthorizationError` (403) and
  `AuthenticationError` (401) in `EXCEPTION_REGISTRY`.
- `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` —
  8 entries, all `expires_at = "2026-09-01"`, all sites match the 8
  auth-flow `await db.commit()` lines.

End of Phase 6 verification report for recipe-08.
