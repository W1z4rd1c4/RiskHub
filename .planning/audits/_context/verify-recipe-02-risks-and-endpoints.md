# Phase 6 Empirical Verification — recipe-02 (Risks + Small Endpoints)

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`
Date: 2026-05-09
Phase: 6 (recipe empirical verification)
Constraints: TDD; doc/lock-only Reject invalid; quote ≤15 words.

Mode: spot-check actual code paths cited by recipe-02; would the RED tests
actually fail today (and the PASS-today ratchets actually pass)?

---

## Item #1 — A-N1 — Drop `validate_risk_type` re-export from risks/crud package

**Verdict: VERIFIED RED-WORTHY.**

- `backend/app/api/v1/endpoints/risks/crud/__init__.py:2` literal
  `from ._shared import validate_risk_type` — confirmed.
- `backend/app/api/v1/endpoints/risks/crud/__init__.py:23` literal
  `"validate_risk_type",` inside `__all__` — confirmed.
- Both proposed RED assertions FAIL today as expected:
  `"validate_risk_type" not in __all__` is FALSE (it IS in `__all__`);
  `not hasattr(crud, "validate_risk_type")` is FALSE (line 2 binds it).
- `crud/create.py:20` quote `from ._shared import validate_risk_type` — UNCHANGED
  by #1 (reserved for #19). Confirmed.

Issues: none. Recipe accurate.

---

## Item #19 — S1.4 — Consolidate validate_risk_type onto service policy

**Verdict: VERIFIED RED-WORTHY; parity chain CONFIRMED.**

- `crud/_shared.py:8` quote `async def validate_risk_type(db: AsyncSession, risk_type_code: str)`
  exists; file contains `HTTPException(status_code=status.HTTP_400_BAD_REQUEST,` at line 17-18.
- `crud/_shared.py:19` literal detail
  `f"Unknown risk type '{risk_type_code}'. Available types can be viewed in Risk Hub configuration."`
  matches the parity-test expected JSON body exactly.
- Service-side single-owner: `_entity_mutation_lifecycle/policy.py:29` quote
  `async def validate_risk_type(db: AsyncSession, risk_type_code: str) -> None:`;
  `policy.py:64` quote `await validate_risk_type(db, update_data["risk_type"])`.
  Confirmed.
- Exception chain through `core/exceptions.py:67` quote
  `ValidationError: ExceptionProjection(status_code=400, …)` and
  `core/exceptions.py:89-95` quote `to_http_exception` and `core/exceptions.py:112-118`
  quote `domain_error_handler` exist as recipe asserts.
- `main.py:237` quote `app.add_exception_handler(DomainError, _domain_error_handler_adapter)`
  confirmed at line 237 (handler defined at lines 233-235).
- All three proposed architecture-lock assertions FAIL today (file exists;
  `from ._shared import` lives in create.py:20).

Issues: minor — recipe says line 237 hosts the registration; the adapter
is defined at lines 233-235 and registered at 237. Citation is accurate.

---

## Item #11 — S2.7 — `risk.process` → `risk.name` truth-in-naming fix

**Verdict: VERIFIED RED-WORTHY; assertion-inversion mandatory.**

- `_control_execution/workflow.py:155` quote `names.append(risk.process)`
  — confirmed (the bug).
- `workflow.py:145` quote
  `def linked_risk_names_for_visible_ids(control: Control | None, readable_risk_ids: set[int]) -> list[str]:`
  — confirmed.
- `tests/backend/pytest/test_executions.py:325` quote
  `assert item["linked_risks"] == [risk.process]` — confirmed (locks the bug).
- Fixture distinctness verified at `test_executions.py:287` quote
  `name="Execution List Linked Risk"` and `:288` quote
  `process="Visible Execution Process"` — different strings, so the swap
  is observable.
- Parity test at `test_reports_audit.py:185-186` quote
  `assert "Audit Test Risk" in linked_risks_value` and
  `assert "Audit Test Process" not in linked_risks_value` — confirmed
  (mirror sym-pattern recipe references).

Issues: none. Phase 4 directive (assertion inversion in SAME commit) is
correct; splitting WOULD break CI on the existing assertion.

---

## Item #20 — S1.6 — Risk-id generation co-location (DOC-ONLY)

**Verdict: VERIFIED PASS-TODAY (ratchet).**

- `risks/id_generation.py:7` quote
  `async def generate_risk_id_code(db: AsyncSession, process: str) -> str:`
  — confirmed.
- `risks/__init__.py:3` quote `from .id_generation import generate_risk_id_code`
  — confirmed; `__all__` at line 8 includes it.
- Two test consumers via package facade confirmed:
  `tests/backend/pytest/test_risks.py:556` quote
  `from app.api.v1.endpoints.risks import generate_risk_id_code`;
  `tests/backend/pytest/test_risk_id_generation.py:13` quote
  `from app.api.v1.endpoints.risks import generate_risk_id_code`.
- All four proposed assertions PASS today (correctly — the recipe is a
  structural ratchet, not a RED test).

Issues: none. DOC-ONLY framing is correct.

---

## Item #10 — S8.5 — Keep `riskhub_questionnaires.py`

**Verdict: VERIFIED PASS-TODAY (presence ratchet).**

- `riskhub_questionnaires.py:14` quote
  `router = APIRouter(prefix="/riskhub/questionnaires", tags=["riskhub"])`
  — confirmed.
- `riskhub_questionnaires.py:37` quote
  `@router.post("/batch-send", response_model=BatchSendResponse)` — confirmed.
- FE caller path: actual file is `frontend/src/services/riskHubApi.ts:308-310`
  quote `batchSendQuestionnaires: (data: BatchSendQuestionnairesPayload) =>` /
  `apiClient.post('/riskhub/questionnaires/batch-send', data, …)`. Confirmed.
- All three proposed assertions (file exists, router exported, ≥1 route)
  pass today as expected.

Issues: **MINOR PATH DRIFT** — recipe text (line 645, 646) refers to
`frontend/src/services/api/riskHubApi.ts` (with `/api/`). Actual location
is `frontend/src/services/riskHubApi.ts` (no `/api/` segment). Phase 4 cite
to `riskHubApi.ts:308-310` matches the actual file content; only the
narrative `services/api/` prefix is wrong. Recipe Step 2 docstring contains
the same `services/api/riskHubApi.ts` typo and should be corrected when
the docstring is written. Non-blocking but noted.

---

## Item #12 — D-N3 — Narrow blanket-except in `users/summary.py`

**Verdict: VERIFIED RED-WORTHY; Phase 4 correction (HTTPException, NOT
AuthorizationError) is empirically correct.**

- `users/summary.py:48` quote `except Exception:` — confirmed inside
  `_can_view_governance` whose try block (line 47) calls
  `ensure_business_view_access(current_user, detail="Platform admins cannot access Governance business data")`.
- `users/summary.py:62` quote `except Exception:` — confirmed inside
  `_build_shell_summary` whose try block (line 61) is
  `questionnaire_inbox_count = await _count_questionnaire_inbox(db, current_user)`.
- Phase 4 correction empirically correct: `ensure_business_view_access`
  raises `HTTPException` (per recipe cite to `_permissions/evaluation.py:53`),
  NOT `AuthorizationError`. The narrow target MUST be `HTTPException`.
- The architecture-lock test `assert "except Exception:" not in source` would
  FAIL today (two literal occurrences).

Issues: none. The Phase 4 critical correction is confirmed by the actual
upstream raise type.

---

## Item #15 — D-N2 — Add `access_user` capability surface (8th)

**Verdict: VERIFIED RED-WORTHY.**

- `backend/app/schemas/access.py:63` quote `class AccessUserCapabilities(BaseModel):`
  — confirmed.
- 7 fields at lines 66-72 — verified verbatim:
  - `:66` `can_edit_identity: bool`
  - `:67` `can_edit_business_access: bool`
  - `:68` `can_edit_role: bool`
  - `:69` `can_deactivate: bool`
  - `:70` `can_change_active_status: bool`
  - `:71` `can_break_glass_enable: bool`
  - `:72` `can_revoke_sessions: bool`
- FE mirror: `frontend/src/types/access.ts:51` quote
  `export interface AccessUserCapabilities {` — confirmed; lines 52-58
  contain the same 7 fields (with three marked optional via `?`, including
  `can_change_active_status` and `can_break_glass_enable`).
- `docs/security/capability-catalog.json` has exactly 7 surface entries
  (`grep -c '"id":' = 7`). NO `access_user` surface ID. Confirmed (recipe's
  "NOT 8 yet" empirically correct).
- `passthroughObject` helper exists at
  `frontend/src/services/api/schemas/common.ts:5` quote
  `export function passthroughObject<T extends z.ZodRawShape>(shape: T)`
  — confirms Phase 4 Pydantic↔Zod parity directive is feasible.
- `frontend/src/services/api/schemas/entities/` directory exists and
  contains `preferences.ts`, `identity.ts`, etc. — but NO `access.ts`.
  New file creation per recipe is needed.

Issues: minor — FE interface marks `can_change_active_status` and
`can_break_glass_enable` optional with `?`. Backend Pydantic schema requires
them (no `Optional`). The recipe's Zod schema uses `z.boolean()` (required)
which matches BACKEND truth. Verifies the recipe's parity intent is correct;
the existing TS-only interface drift is a real (small) defect Item #15
incidentally tightens.

---

## Item #21 — S2.6 — Collapse Control-Risk link loader duplicates

**Verdict: VERIFIED RED-WORTHY.**

- `link_policy.py:22` quote
  `async def load_link_for_control(db: AsyncSession, *, control_id: int, risk_id: int) -> ControlRiskLink:`
  — confirmed; raises `HTTPException(status_code=404, detail="Link not found")`
  at line 31.
- `link_policy.py:35` quote
  `async def load_link_for_risk(db: AsyncSession, *, risk_id: int, control_id: int) -> ControlRiskLink:`
  — confirmed; raises identical `HTTPException(status_code=404, detail="Link not found")`
  at line 44. Bodies are duplicates differing only in WHERE-clause ordering
  (no semantic diff).
- Caller #1: `link_governance.py:102` quote
  `link = await load_link_for_control(db, control_id=control_id, risk_id=risk_id)`
  — confirmed.
- Caller #2: `link_governance.py:181` quote
  `link = await load_link_for_risk(db, risk_id=risk_id, control_id=control_id)`
  — confirmed.
- All three proposed assertions FAIL today.

Issues: none.

---

## Item #38 — S8.6 — Move 8 inline endpoint Pydantic models to schemas

**Verdict: VERIFIED RED-WORTHY.**

- `health.py:16` quote `class LivenessResponse(BaseModel):` confirmed.
- `health.py:22` quote `class ReadinessResponse(BaseModel):` confirmed.
- `health.py:32` quote `class HealthResponse(ReadinessResponse):` confirmed.
- `preferences.py:15` quote `class PreferencesUpdate(BaseModel):` confirmed.
- `preferences.py:36` quote `class PreferencesResponse(BaseModel):` confirmed.
- `riskhub_questionnaires.py:17` quote `class RiskFilters(BaseModel):` confirmed.
- `riskhub_questionnaires.py:24` quote `class BatchSendRequest(BaseModel):` confirmed.
- `riskhub_questionnaires.py:30` quote `class BatchSendResponse(BaseModel):` confirmed.
- `backend/app/schemas/riskhub.py` EXISTS (positive prereq for the rename).
- `backend/app/schemas/health.py` does NOT exist (must be created).
- `backend/app/schemas/preferences.py` does NOT exist (must be created).
- All four proposed assertions FAIL today as expected.

Issues: none. Phase 4 rename directive (`RiskFilters` → `BatchSendRiskFilters`)
sound — `RiskFilters` is a generic name and could collide downstream.

---

## Item #58 — S8.3 — Delete `OrphanedItemService` static-method class + facade

**Verdict: VERIFIED RED-WORTHY; small recipe nit on staticmethod count.**

- `backend/app/services/orphaned_item_service.py` is **7 lines** (recipe
  said "7-8 lines"; bound matches). File body re-exports `OrphanedItemService`
  from `_orphaned_items.service`.
- `_orphaned_items/service.py:20` quote `class OrphanedItemService:` confirmed.
- File contains **8 staticmethods** (`grep -c "@staticmethod" = 8`). Recipe
  says "8 staticmethods" — confirmed.
- Endpoint dotted call sites: VERIFIED EXACT 7 at lines
  **45, 70, 119, 120, 147, 164, 187** of
  `backend/app/api/v1/endpoints/orphaned_items.py`. Phase 4 correction
  ("NOT 8 — line 25 was the import, not a call") is empirically correct;
  line 25 quote `from app.services.orphaned_item_service import OrphanedItemService`
  is the import, not a call site.
- Underlying module-level functions exist at
  `_orphaned_items/{flagging,reads,resolution,stats}.py` (per recipe).
  Confirmed via the static methods' delegate aliases (`_flag_orphaned_items`,
  `_scan_uncategorised_items`, `_get_pending_orphans`,
  `_get_pending_orphans_with_details`, `_get_orphan_stats`,
  `_get_orphan_detail`, `_resolve_orphan`, `_get_fallback_owner_id`).
- All four proposed RED assertions FAIL today.

Issues: minor — recipe's `__init__.py` GREEN proposal includes
`flag_orphaned_items` in `__all__`, but no recipe-cited endpoint call
site uses it (only `scan_uncategorised_items`, `get_pending_orphans_with_details`,
`get_orphan_stats`, `get_orphan_detail`, `resolve_orphan` — 5 functions).
The fourth RED assertion `test_module_level_orphan_functions_directly_callable`
asserts only those 5 names. So `flag_orphaned_items` in `__all__` is
forward-defensive (used by scheduler / job runner; left intentional).
Non-blocking.

---

## Cross-cutting summary

| # | Item | Verdict | RED-worthy today | Notes |
|---|------|---------|------------------|-------|
| 1  | drop validate_risk_type re-export | VERIFIED | YES | Clean |
| 19 | consolidate validate_risk_type | VERIFIED | YES | Parity chain confirmed |
| 11 | risk.process → risk.name | VERIFIED | YES | Inversion mandatory |
| 20 | risks package facade lock | VERIFIED | PASS-today (ratchet) | DOC-ONLY |
| 10 | keep riskhub_questionnaires | VERIFIED | PASS-today (ratchet) | FE path drift in recipe |
| 12 | narrow blanket-except | VERIFIED | YES | Phase 4 correction is empirically right |
| 15 | access_user 8th surface | VERIFIED | YES | FE optional `?` minor drift |
| 21 | collapse load_link | VERIFIED | YES | Clean |
| 38 | evict 8 inline schemas | VERIFIED | YES | health.py/preferences.py schemas don't exist (must create) |
| 58 | delete OrphanedItemService | VERIFIED | YES | 7 dotted call sites at exact lines |

---

## Issues found (consolidated)

1. **Item #10** — recipe text twice references
   `frontend/src/services/api/riskHubApi.ts`. Actual path is
   `frontend/src/services/riskHubApi.ts` (no `/api/` segment). The Phase 4
   citation `riskHubApi.ts:308-310` is internally consistent with the actual
   content; only the narrative prefix is wrong. Recipe Step 2 docstring
   should drop `/api/` when authored.
2. **Item #15** — `frontend/src/types/access.ts:51-58` marks three of the
   seven fields optional via `?` (`can_change_active_status`,
   `can_break_glass_enable`); backend Pydantic schema requires all seven.
   The recipe's proposed Zod schema mirrors BACKEND (required), so the
   GREEN edit will tighten existing TS-only optionality drift. Worth a
   one-line note in Step 3 REFACTOR.
3. **Item #58** — proposed `__init__.py` re-export includes
   `flag_orphaned_items`, but no endpoint call cites it. Forward-defensive,
   non-blocking. The 4th RED assertion asserts only 5 names so this
   doesn't fail the lock.

No critical issues. No false flags.

---

## Recommendations

1. Land item order verbatim per recipe sequencing
   (#1 → #19 → #11 → #20 → #10 → #38 → #21 → #12 → #15 → #58). The
   sequencing rationale (e.g., #10 before #38) is empirically correct.
2. When authoring the #10 docstring (Step 2), drop the spurious `/api/`
   segment.
3. When authoring the #15 Step 3 REFACTOR, add a one-line note that the
   FE-only `?` optional drift on three fields is intentionally
   tightened by the new Zod schema.
4. All other recipe steps are empirically actionable as written.
