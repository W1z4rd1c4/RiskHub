# Phase 2 Loop B — Endpoint surface ADVERSARIAL re-verification

Date: 2026-05-09
Domain: Endpoint surface (questionnaires #10, users-summary #12, access user
catalog #15, monitoring shim #17, inline-schema move #38, audit adapter
helper #43, router prefix registry #44, monitoring wrapper #49, orphaned
items facade #58, monitoring package consolidation #59, outbox dispatch
#63).
Mode: adversarial re-verification of Loop A verdicts in
`.planning/audits/_context/verify-loop-a-07-endpoints.md` against the
current code. Quote rule: ≤15 words; every claim cites `file:line`.

---

## Item #10 — Loop A said: REJECT-CONFIRMED, route is live, frontend uses it

- Quote check: PASS — `riskhub_questionnaires.py:14`
  `router = APIRouter(prefix="/riskhub/questionnaires", tags=["riskhub"])`;
  `router.py:24` aggregator import; `router.py:58`
  `api_router.include_router(riskhub_questionnaires.router)`. Quote `riskhub_questionnaires.py:37`
  `@router.post("/batch-send", response_model=BatchSendResponse)`.
- Count check: PASS — exactly 1 mounted route (`grep -c "@router\." backend/app/api/v1/endpoints/riskhub_questionnaires.py` = 1).
- Live-route consumer chain: **CONFIRMED.** Frontend caller chain traced to a
  UI button click:
  1. `riskHubApi.ts:308-310` `batchSendQuestionnaires` POSTs
     `/riskhub/questionnaires/batch-send`.
  2. `riskQuestionnairePanelState.ts:170`
     `await riskHubApi.batchSendQuestionnaires(payload)`.
  3. `RiskQuestionnairesPanel.tsx:46` `useRiskQuestionnaireBatchSend({...})`
     yields `handleBatchSend`.
  4. `RiskQuestionnairesPanel.tsx:257` `onClick={handleBatchSend}` —
     **rendered Send button**.
  5. Capability gate `RiskQuestionnairesPanel.tsx:24`
     `riskHubCapabilityEnabled(..., 'can_batch_send')`.
- Stub vs real verification: REAL. Service layer
  `riskhub_questionnaires.py:11`
  `from app.services.risk_questionnaire_service import send_questionnaire_for_risk`
  is called per-risk at `riskhub_questionnaires.py:77`
  `await send_questionnaire_for_risk(db=db, risk_id=risk_id, current_user=cro_user)`.
  Has 226-line backend test
  (`tests/backend/pytest/api/v1/test_riskhub_questionnaires.py`).
- Blocker missed: **none on the REJECT verdict itself**, but Loop A's
  proposal to fold #10 into #38 (move 3 inline models to
  `backend/app/schemas/riskhub.py`) is unverified at the
  `risk_questionnaire.py` schema-name collision level — the questionnaire
  schema home `backend/app/schemas/risk_questionnaire.py` (62 lines)
  already uses `RiskQuestionnaire*` prefix; `BatchSend*` and `RiskFilters`
  do not collide, but `RiskFilters` is a generic name worth verifying
  doesn't conflict if multiple modules adopt it.
- Final Phase 2-B verdict: **CORRECT** (REJECT stands; the route is alive
  and the frontend `Send` button drives it).

## Item #12 — Loop A said: CONFIRM, narrow to `AuthorizationError` for `_can_view_governance` and `DomainError` for `_build_shell_summary`

- Quote check: PASS — `summary.py:46-49` and `summary.py:60-63` quoted
  faithfully. Two blanket-except blocks confirmed at exact line ranges.
  Quote `summary.py:48` `except Exception:`. Quote `summary.py:62`
  `except Exception:`.
- Count check: PASS — file is 92 lines (`wc -l` returns 93 with trailing
  newline; effective last code line 92).
- Live-route consumer chain: N/A.
- Stub vs real verification: REAL — both excepts exist in production code
  path for `GET /me/shell-summary` (`summary.py:81`).
- Blocker missed: **YES.** Loop A's narrowing recommendation is **wrong on
  the actual exception type for `_can_view_governance`.** `ensure_business_view_access` (defined at
  `backend/app/core/_permissions/evaluation.py:50`) raises `HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)`
  at line 53 — **NOT** `AuthorizationError`. There is no `AuthorizationError`
  call site in `permissions.py` (re-export module) or in
  `_permissions/evaluation.py:53` raise. The narrow catch must therefore
  either be `HTTPException` (current path) **or** a refactor that switches
  `ensure_business_view_access` to raise `AuthorizationError` (per
  ADR-003 `DomainError` taxonomy). The ADR-003 path is the right
  architectural answer, but Loop A's "narrow to `AuthorizationError`"
  alone, without the upstream raise change, would silently drop the catch
  and leak HTTPException — a regression.
- For `_build_shell_summary` blanket-except: `_count_questionnaire_inbox`
  (line 37) calls `count_questionnaire_inbox`
  (`backend/app/services/_risk_questionnaires/repository.py:91`). That
  function only does `db.execute` (SQLAlchemy queries) — it does **not**
  `raise` directly. Loop A's recommendation
  `(NotFoundError, AuthorizationError, SQLAlchemyError)` over-specifies:
  in current code, `SQLAlchemyError` alone covers the path; the other
  two raise from the upstream `questionnaire_inbox_query` (not inspected
  here). Need to verify `questionnaire_inbox_query` raises before
  prescribing the union.
- Final Phase 2-B verdict: **CORRECT-WITH-CORRECTION.** The CONFIRM stands
  (two blanket-excepts are real and over-broad), but the narrow-target
  recommendation must be re-anchored to actual call-graph exceptions
  (`HTTPException` and `SQLAlchemyError`) **or** paired with an upstream
  conversion to `DomainError` subclasses. Either way is fine, but Loop A's
  recommendation as-stated would mask `HTTPException`.

## Item #15 — Loop A said: CONFIRM, schema has 7 fields, catalog has no `access_user` surface

- Quote check: PASS — `access.py:63` `class AccessUserCapabilities(BaseModel):`.
  Quote of the 7 fields verified in source:
  - `access.py:66` `can_edit_identity: bool`
  - `access.py:67` `can_edit_business_access: bool`
  - `access.py:68` `can_edit_role: bool`
  - `access.py:69` `can_deactivate: bool`
  - `access.py:70` `can_change_active_status: bool`
  - `access.py:71` `can_break_glass_enable: bool`
  - `access.py:72` `can_revoke_sessions: bool`
- Count check: PASS — 7 capability fields, lines 66-72 (exact match).
- Live-route consumer chain: REAL — `endpoints/access.py:81`
  `capabilities=access_user_capabilities(current_user, user) if current_user is not None else None`;
  builder is `services/_access_workflow/policy.py:26`
  `def access_user_capabilities(current_user: User, target_user: User) -> AccessUserCapabilities:`.
- Stub vs real verification: REAL. The catalog gap is real:
  `docs/security/capability-catalog.json` lines 27-28 only declare
  `can_view_access_users` / `can_view_department_access_users` (both
  `me_capabilities` fields). No `id == "access_user"` surface, no
  `backend/app/schemas/access.py` reference, no
  `frontend/src/types/access.ts` reference (verified by `grep
  "access_user"` returning only those two `can_view_*` lines).
- Blocker missed: none.
- Final Phase 2-B verdict: **CORRECT.**

## Item #17 — Loop A said: CONFIRM (cross-link only), shim is 25 lines, 14 importers

- Quote check: PASS — `_monitoring_response.py:1` `"""Compatibility Adapter
  for monitoring response projection helpers."""`
- Count check: PASS — `wc -l` confirms 25 lines.
- Importer count: PASS — `grep -rln "from app.api.v1.endpoints._monitoring_response import" backend/app/api/v1/endpoints/`
  returns 14 files (matches Loop A list of `controls/crud/{create,detail,restore}.py`,
  `controls/linking.py`, `departments/{controls,kris}.py`,
  `kris/crud/{breaches,create,detail,restore}.py`,
  `risks/control_links.py`, `risks/crud/{create,detail,restore}.py`).
- Stub vs real verification: STUB confirmed — file is a pure re-export shim
  (lines 3-13 are import-and-rebind statements; no logic).
- Blocker missed: none.
- Final Phase 2-B verdict: **CORRECT.**

## Item #38 — Loop A said: CONFIRM, 8 inline models across health/preferences/riskhub_questionnaires; `riskhub.py` exists

- Quote check: PASS for all eight inline models:
  - `health.py:16` `class LivenessResponse(BaseModel):`
  - `health.py:22` `class ReadinessResponse(BaseModel):`
  - `health.py:32` `class HealthResponse(ReadinessResponse):`
  - `preferences.py:15` `class PreferencesUpdate(BaseModel):`
  - `preferences.py:36` `class PreferencesResponse(BaseModel):`
  - `riskhub_questionnaires.py:17` `class RiskFilters(BaseModel):`
  - `riskhub_questionnaires.py:24` `class BatchSendRequest(BaseModel):`
  - `riskhub_questionnaires.py:30` `class BatchSendResponse(BaseModel):`
- Count check: PASS — 3+2+3 = 8 models.
- Schemas/riskhub.py existence: PASS — `backend/app/schemas/riskhub.py`
  (6907 bytes) exists. Top of file `schemas/riskhub.py:1`
  `"""Risk Hub schemas for CRO business configuration endpoints."""` and
  `schemas/riskhub.py:14` `class RiskTypeRead(BaseModel):` — currently
  hosts CRO config schemas, would gain new `BatchSend*`/`RiskFilters`
  classes additively.
- Stub vs real verification: REAL — moves are mechanical, target module
  exists.
- Blocker missed: minor — `RiskFilters` (4 fields) is a generic name; if
  also moved to `riskhub.py`, may need disambiguation
  (e.g., `BatchSendRiskFilters`) to avoid future collision with risk
  query schemas.
- Final Phase 2-B verdict: **CORRECT.**

## Item #43 — Loop A said: CONFIRM, audit matrix has 37 `[[adapter]]` rows (Phase 1's "38" was off-by-one)

- Quote check: PASS — `_audit_matrix.toml:1` `# W7 audit adapter matrix.`
- Count check: PASS — fresh `grep -c "^\[\[adapter\]\]" backend/app/core/audit/_audit_matrix.toml`
  returns **37**. Loop A's correction of Phase 1 stands.
- Lock binding: PASS —
  `tests/backend/pytest/architecture/test_w7_audit_adapter_completeness_red.py:13`
  `MATRIX_PATH = AUDIT_ROOT / "_audit_matrix.toml"`. Phase 1's claim "38"
  is the off-by-one; Loop A's "37" matches the file.
- Boilerplate pattern: PASS for canonical example
  `risk.py:27` `await log_activity_func(`. Repeats verified at
  `risk.py:60`, `risk.py:86`, `risk.py:111` (4 functions per adapter
  module — `*_created`, `*_updated`, `*_archived`, `*_restored`).
- Stub vs real verification: REAL pattern, real repetition.
- Blocker missed: none. Loop A's "any helper must be additive (preserve
  module-level `def`)" because the W7 lock asserts presence by name is
  the right architectural constraint.
- Final Phase 2-B verdict: **CORRECT.**

## Item #44 — Loop A said: CONFIRM, 27 `include_router` calls (Phase 1's "28" was off-by-one)

- Quote check: PASS — `router.py:32` `api_router = APIRouter()`.
- Count check: PASS — fresh
  `grep -c "api_router.include_router" backend/app/api/v1/router.py`
  returns **27**. Loop A's correction of Phase 1 stands.
- Three-pattern observation: PASS — verified by reading lines 34-60:
  - 17 aggregator-prefixed (router-owns-prefix) calls.
  - 10 module-owned-prefix calls (health, issues, vendor_links,
    vendor_reports, risk_questionnaires.risk_router, kris, directory,
    riskhub_questionnaires, preferences, risk_questionnaires.router).
- Stub vs real verification: REAL — every line is a live registration.
- Blocker missed: minor — Loop A omits that `risk_questionnaires` is
  registered **twice** (once as `.risk_router` at line 44 with
  `prefix="/risks"` declared in `risk_questionnaires/__init__.py`, once
  as `.router` at line 60 with `prefix="/questionnaires"`). This is
  intentional (split surfaces), but a "registry" lock that asserts
  one-prefix-per-module would need to allow this.
- Final Phase 2-B verdict: **CORRECT-WITH-CORRECTION** (the dual
  registration of `risk_questionnaires` is a non-trivial pattern any
  registry design must accommodate; Loop A flagged it via line 44/60 but
  didn't call out the two-routers-per-module shape explicitly).

## Item #49 — Loop A said: CONFIRM, wrapper is 12 lines, 4 callers in `link_governance.py`

- Quote check: PASS — `monitoring.py:9` `async def
  load_control_execution_monitoring_context(db: AsyncSession) ->
  MonitoringResponseContext:`. Quote `monitoring.py:10` `now = utc_now()`.
  Quote `monitoring.py:11` `return await
  load_monitoring_response_context(db, now=now, today=now.date())`.
- Count check: **CORRECT-WITH-CORRECTION** — fresh
  `wc -l backend/app/services/_control_execution/monitoring.py` returns
  **11**, not 12. Loop A's "12 lines" is off by one (likely counted a
  trailing newline as a line). Substance unchanged: still a 2-line
  function body.
- Caller count: PASS — fresh grep returns exactly 4 call sites in
  `link_governance.py`:
  - `link_governance.py:25` import line.
  - `link_governance.py:62`
    `context = await load_control_execution_monitoring_context(db)`.
  - `link_governance.py:91`
    `monitoring_context=await load_control_execution_monitoring_context(db),`.
  - `link_governance.py:141`
    `context = await load_control_execution_monitoring_context(db)`.
  - `link_governance.py:170`
    `monitoring_context=await load_control_execution_monitoring_context(db),`.
  4 actual call sites + 1 import = matches Loop A's "4 callers".
- Stub vs real verification: STUB — wrapper has no logic beyond defaulting
  `now`/`today`.
- Lock binding: per Loop A,
  `tests/backend/pytest/test_architecture_deepening_contracts.py:188`
  `assert hasattr(monitoring, "load_control_execution_monitoring_context")`
  pins it. Inlining requires updating that lock.
- Blocker missed: none of substance.
- Final Phase 2-B verdict: **CORRECT-WITH-CORRECTION** (line count is 11,
  not 12).

## Item #58 — Loop A said: CONFIRM, 8 `@staticmethod` methods, 8 dotted call sites

- Quote check: PASS — `service.py:20` `class OrphanedItemService:`. Quote
  `service.py:23` `async def flag_orphaned_items(...)` confirmed at exact
  line. All 8 staticmethods confirmed at lines: 23-25, 27-29, 31-33,
  35-40, 42-44, 46-62, 64-76, 78-80.
- Count check (staticmethods): PASS — fresh
  `grep -c "@staticmethod" backend/app/services/_orphaned_items/service.py`
  returns **8**.
- Count check (dotted call sites): **CORRECT-WITH-CORRECTION** — Loop A
  initially said 8 (in summary), then said 7 in evidence (line 195 listed
  alongside lines 45, 70, 119, 120, 147, 164, 187). Fresh grep
  `grep -n "OrphanedItemService\." backend/app/api/v1/endpoints/orphaned_items.py`
  returns **7 lines** (45, 70, 119, 120, 147, 164, 187). Loop A's "7
  dotted call sites" verdict matches; the "8 dotted call sites" wording
  in the summary text is the off-by-one (likely counted the import).
  Verify: `endpoints/orphaned_items.py:25`
  `from app.services.orphaned_item_service import OrphanedItemService` is
  the import (1 line) + 7 call sites = 8 references. Substance is
  preserved either way.
- Facade verification: PASS — `backend/app/services/orphaned_item_service.py`
  is 7 lines (Loop A said 8; off by one again — the actual file is 7
  including blank lines). Pure re-export confirmed: line 3
  `from app.services._orphaned_items.service import OrphanedItemService`,
  line 5-7 `__all__ = ["OrphanedItemService"]`.
- Stub vs real verification: STUB — facade has zero logic; the
  static-method class wraps 8 module-level functions in
  `flagging.py`/`reads.py`/`resolution.py`/`stats.py`.
- Blocker missed: none.
- Final Phase 2-B verdict: **CORRECT-WITH-CORRECTION** (line counts are
  7+7 vs Loop A's 8+8; substance is unchanged — facade is pure re-export
  and class is pure namespace).

## Item #59 — Loop A said: CONFIRM-with-mod, sequence after #17 + #49

- Quote check: N/A (sequencing finding).
- Count check: PASS — three monitoring packages exist:
  `backend/app/services/_monitoring_response/`,
  `backend/app/services/_monitoring_status/`,
  `backend/app/services/_control_execution/monitoring.py`.
- Stub vs real verification: REAL package separation.
- Blocker missed: none — sequencing is the developer's flagged constraint.
- Final Phase 2-B verdict: **CORRECT.**

## Item #63 — Loop A said: CONFIRM-with-mod, dispatcher does NOT import `SchedulerJobRun`; outbox is the lone `execute_tracked_job` exception

- Quote check: PASS — `dispatcher.py:1` `"""Dispatch claimed outbox events
  using isolated transactions."""`. Quote `scheduler_jobs.py:114`
  `async def run_outbox_dispatch() -> None:`. Quote `scheduler_jobs.py:115`
  `"""Dispatch queued outbox events without flooding the scheduler run
  ledger."""`.
- Count check (dispatcher line count): PASS — fresh
  `wc -l backend/app/services/outbox/dispatcher.py` returns **110** (Loop A
  said 110).
- Count check (`SchedulerJobRun` import): PASS — fresh
  `grep -n "SchedulerJobRun" backend/app/services/outbox/dispatcher.py`
  returns no hits. The dispatcher itself is intentionally
  ledger-instrumentation-free.
- Count check (`execute_tracked_job` siblings): PASS — fresh
  `grep -n "execute_tracked_job\b" backend/app/core/scheduler_jobs.py`
  returns 6 call sites: lines 47, 57, 67, 86, 100, 111 (kri, questionnaire,
  issue, ad_deprovision, sso_jwks_refresh, orphan_scan). `run_outbox_dispatch`
  at line 114 is the **only** scheduler job entry that does not call
  `execute_tracked_job`. Loop A's "lone exception" claim verified.
- Runtime state mutation: PASS — verified at `scheduler_jobs.py:120`
  `_outbox_dispatch_state["last_started_at"] = started_at.isoformat()`,
  `:121` `last_status = "running"`, `:130` `last_status = "succeeded"`,
  `:131` `last_processed = processed`, `:137` `last_status = "failed"`,
  `:138` `last_error = str(exc)`. The in-memory dict is the admin
  surface.
- Stub vs real verification: REAL — outbox dispatch deliberately bypasses
  ledger to avoid flooding (interval-driven via
  `OUTBOX_DISPATCH_INTERVAL_SECONDS`).
- Blocker missed: none — Loop A correctly flagged that any new
  instrumentation must be additive (write `SchedulerJobRun` rows AND
  preserve in-memory state) and must address the rate concern (e.g., only
  record runs that processed events, or roll-up windowing).
- Final Phase 2-B verdict: **CORRECT.**

---

## Cross-cuts and overall judgment

- **Loop A overall stands.** All 11 items resolve to CORRECT or
  CORRECT-WITH-CORRECTION; **zero items resolve to WRONG.**
- **Material correction needed (#12):** Loop A's narrowing target for
  `_can_view_governance` cites `AuthorizationError`, but
  `ensure_business_view_access` (`_permissions/evaluation.py:53`)
  actually raises `HTTPException(403)`. Either narrow to `HTTPException`
  **or** change the upstream raise to `AuthorizationError` in tandem;
  doing only the catch change would let `HTTPException` bubble and
  break the silent-degrade behavior the endpoint relies on.
- **Cosmetic line-count corrections (#49, #58):**
  - `_control_execution/monitoring.py` is 11 lines, not 12.
  - `services/orphaned_item_service.py` is 7 lines (not 8).
  - `services/_orphaned_items/service.py` ends at line 80 (Loop A
    correct on inner counts).
  - Endpoint dotted call sites for `OrphanedItemService.` = 7, not 8 (the
    "8" appears to count the import line).
  None of these change the substance of the deepening proposal.
- **#10 dead-code-with-a-test concern is REFUTED.** The frontend
  `RiskQuestionnairesPanel` Send button (`onClick={handleBatchSend}` at
  line 257) renders for users with the `can_batch_send` capability; the
  route is alive in production usage.
- **#43 / #44 count corrections (37 adapters; 27 routers) are confirmed
  by fresh grep.** Phase 1's numbers (38, 28) are off-by-one in both
  cases and should not be cited downstream.
- **#15 catalog gap is real and not just a documentation issue.** The
  schema and capability builder live in code; the catalog JSON is the
  authoritative declaration surface (governed by
  `docs/security/authorization-capability-contract.md`). The 7
  `AccessUserCapabilities` fields do not appear in the JSON catalog as
  a per-row surface — this is a structural gap, not a doc miss.

---

End of Phase 2 Loop B endpoint domain adversarial verification.
